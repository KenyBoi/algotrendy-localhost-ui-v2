#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# AlgoTrendy Metrics API - JWT Authentication Setup
# ═══════════════════════════════════════════════════════════════════════════
#
# This script sets up JWT-based authentication for the VPS metrics API:
# 1. Generates HMAC secret for internal JWT signing (shared with Supabase Edge)
# 2. Creates a JWT validation service (Python FastAPI)
# 3. Configures nginx to use auth_request for JWT validation
# 4. Sets up systemd service for the JWT validator
#
# Prerequisites:
# - nginx installed
# - Python 3.9+ with pip
# - metrics_api_readonly.py already running
#
# Usage:
#   sudo ./setup_jwt_auth.sh [domain]
#
# Example:
#   sudo ./setup_jwt_auth.sh metrics.algotrendy.com
# ═══════════════════════════════════════════════════════════════════════════

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

DOMAIN="${1:-metrics.algotrendy.com}"
ALGOTRENDY_DIR="/opt/algotrendy"
JWT_SECRET_FILE="$ALGOTRENDY_DIR/.internal_jwt_secret"
JWT_VALIDATOR_PORT=9001
METRICS_API_PORT=9000

echo "═══════════════════════════════════════════════════════════════"
echo " AlgoTrendy Metrics API - JWT Authentication Setup"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo " Domain:              $DOMAIN"
echo " JWT Validator Port:  $JWT_VALIDATOR_PORT"
echo " Metrics API Port:    $METRICS_API_PORT"
echo ""
echo "═══════════════════════════════════════════════════════════════"

# ═══════════════════════════════════════════════════════════════════════════
# PREFLIGHT CHECKS
# ═══════════════════════════════════════════════════════════════════════════

log "Running preflight checks..."

if [ "$EUID" -ne 0 ]; then
    error "Please run as root (sudo ./setup_jwt_auth.sh ...)"
fi

if ! command -v python3 &> /dev/null; then
    error "Python 3 is required but not installed"
fi

if ! command -v nginx &> /dev/null; then
    error "nginx is required but not installed"
fi

# ═══════════════════════════════════════════════════════════════════════════
# STEP 1: Generate HMAC Secret
# ═══════════════════════════════════════════════════════════════════════════

log "Generating HMAC secret for internal JWT..."

mkdir -p "$ALGOTRENDY_DIR"

if [ -f "$JWT_SECRET_FILE" ]; then
    warn "JWT secret already exists at $JWT_SECRET_FILE"
    warn "Using existing secret (delete file and re-run to regenerate)"
    INTERNAL_JWT_SECRET=$(cat "$JWT_SECRET_FILE")
else
    INTERNAL_JWT_SECRET=$(openssl rand -hex 32)
    echo "$INTERNAL_JWT_SECRET" > "$JWT_SECRET_FILE"
    chmod 600 "$JWT_SECRET_FILE"
    log "JWT secret generated and saved"
fi

# ═══════════════════════════════════════════════════════════════════════════
# STEP 2: Install Python Dependencies
# ═══════════════════════════════════════════════════════════════════════════

log "Installing Python dependencies for JWT validator..."

pip3 install -q pyjwt fastapi uvicorn

# ═══════════════════════════════════════════════════════════════════════════
# STEP 3: Create JWT Validation Service
# ═══════════════════════════════════════════════════════════════════════════

log "Creating JWT validation service..."

cat > "$ALGOTRENDY_DIR/jwt_validator.py" << 'PYTHON_SCRIPT'
#!/usr/bin/env python3
"""
AlgoTrendy JWT Validator Service
Validates internal JWTs from the Supabase Edge Function.
Used by nginx auth_request module.
"""

import os
import jwt
from datetime import datetime
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI(title="AlgoTrendy JWT Validator")

# Load secret from file
SECRET_FILE = "/opt/algotrendy/.internal_jwt_secret"
EXPECTED_ISSUER = "supabase-metrics-proxy"
EXPECTED_AUDIENCE = "vps-metrics-api"

def get_secret():
    try:
        with open(SECRET_FILE, "r") as f:
            return f.read().strip()
    except FileNotFoundError:
        raise RuntimeError(f"JWT secret file not found: {SECRET_FILE}")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "jwt-validator"}


@app.get("/validate")
async def validate_jwt(authorization: str = Header(None)):
    """
    Validate JWT for nginx auth_request.
    Returns 200 if valid, 401 if invalid.
    nginx uses this to gate access to the metrics API.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid Authorization format")

    token = authorization.replace("Bearer ", "")
    secret = get_secret()

    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            issuer=EXPECTED_ISSUER,
            audience=EXPECTED_AUDIENCE,
        )

        # Token is valid - return 200 with user info headers
        # nginx will forward these headers to the upstream
        return JSONResponse(
            content={"valid": True, "sub": payload.get("sub"), "email": payload.get("email")},
            headers={
                "X-Auth-User-Id": payload.get("sub", ""),
                "X-Auth-User-Email": payload.get("email", ""),
            }
        )

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidIssuerError:
        raise HTTPException(status_code=401, detail="Invalid issuer")
    except jwt.InvalidAudienceError:
        raise HTTPException(status_code=401, detail="Invalid audience")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


if __name__ == "__main__":
    port = int(os.environ.get("JWT_VALIDATOR_PORT", 9001))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
PYTHON_SCRIPT

chmod +x "$ALGOTRENDY_DIR/jwt_validator.py"
log "JWT validator script created"

# ═══════════════════════════════════════════════════════════════════════════
# STEP 4: Create Systemd Service
# ═══════════════════════════════════════════════════════════════════════════

log "Creating systemd service for JWT validator..."

cat > /etc/systemd/system/algotrendy-jwt-validator.service << SERVICE_FILE
[Unit]
Description=AlgoTrendy JWT Validator Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$ALGOTRENDY_DIR
Environment="JWT_VALIDATOR_PORT=$JWT_VALIDATOR_PORT"
ExecStart=/usr/bin/python3 $ALGOTRENDY_DIR/jwt_validator.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE_FILE

systemctl daemon-reload
systemctl enable algotrendy-jwt-validator
systemctl restart algotrendy-jwt-validator

log "JWT validator service started"

# ═══════════════════════════════════════════════════════════════════════════
# STEP 5: Update nginx Configuration
# ═══════════════════════════════════════════════════════════════════════════

log "Updating nginx configuration with JWT auth..."

# Backup existing config
if [ -f /etc/nginx/sites-available/metrics-api ]; then
    cp /etc/nginx/sites-available/metrics-api /etc/nginx/sites-available/metrics-api.bak
fi

cat > /etc/nginx/sites-available/metrics-api << NGINX_CONFIG
# AlgoTrendy Metrics API - JWT Authenticated Reverse Proxy
# Generated by setup_jwt_auth.sh on $(date)

limit_req_zone \$binary_remote_addr zone=metrics_limit:10m rate=10r/s;

# HTTP -> HTTPS redirect
server {
    listen 80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

# Main HTTPS server
server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    # SSL (managed by certbot)
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Rate limiting
    limit_req zone=metrics_limit burst=20 nodelay;

    # ═══════════════════════════════════════════════════════════════════════
    # INTERNAL AUTH REQUEST ENDPOINT
    # ═══════════════════════════════════════════════════════════════════════

    location = /_validate_jwt {
        internal;
        proxy_pass http://127.0.0.1:$JWT_VALIDATOR_PORT/validate;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header X-Original-URI \$request_uri;
        proxy_set_header Authorization \$http_authorization;
    }

    # ═══════════════════════════════════════════════════════════════════════
    # PUBLIC ENDPOINTS (no auth)
    # ═══════════════════════════════════════════════════════════════════════

    location = /health {
        proxy_pass http://127.0.0.1:$METRICS_API_PORT/health;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        add_header Access-Control-Allow-Origin * always;
    }

    # ═══════════════════════════════════════════════════════════════════════
    # JWT-PROTECTED ENDPOINTS
    # ═══════════════════════════════════════════════════════════════════════

    location / {
        # Validate JWT via auth_request
        auth_request /_validate_jwt;

        # Pass auth info to upstream (from validator response headers)
        auth_request_set \$auth_user_id \$upstream_http_x_auth_user_id;
        auth_request_set \$auth_user_email \$upstream_http_x_auth_user_email;

        # CORS headers
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS' always;
        add_header Access-Control-Allow-Headers 'Authorization, Content-Type' always;

        # Handle preflight
        if (\$request_method = 'OPTIONS') {
            add_header Access-Control-Allow-Origin *;
            add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS';
            add_header Access-Control-Allow-Headers 'Authorization, Content-Type';
            add_header Access-Control-Max-Age 86400;
            return 204;
        }

        # Proxy to metrics API with user context
        proxy_pass http://127.0.0.1:$METRICS_API_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Auth-User-Id \$auth_user_id;
        proxy_set_header X-Auth-User-Email \$auth_user_email;
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
    }

    # Custom 401 error response
    error_page 401 = @error401;
    location @error401 {
        add_header Content-Type application/json always;
        return 401 '{"error": "Unauthorized", "message": "Invalid or missing JWT"}';
    }

    access_log /var/log/nginx/metrics-api-access.log;
    error_log /var/log/nginx/metrics-api-error.log;
}
NGINX_CONFIG

# Test and reload nginx
nginx -t
systemctl reload nginx

log "nginx configured with JWT authentication"

# ═══════════════════════════════════════════════════════════════════════════
# VERIFICATION
# ═══════════════════════════════════════════════════════════════════════════

log "Verifying setup..."

echo ""
echo "Testing endpoints:"
echo ""

# Test JWT validator
VALIDATOR_HEALTH=$(curl -s "http://127.0.0.1:$JWT_VALIDATOR_PORT/health" 2>&1 || echo "FAILED")
echo "  JWT Validator: $VALIDATOR_HEALTH"

# Test health (no auth)
API_HEALTH=$(curl -s "https://$DOMAIN/health" 2>&1 || echo "FAILED")
echo "  /health (no auth): $API_HEALTH"

# Test protected endpoint without auth (should fail)
NOAUTH=$(curl -s "https://$DOMAIN/brokers/status" 2>&1 || echo "FAILED")
echo "  /brokers/status (no auth): $NOAUTH"

# ═══════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo " JWT Authentication Setup Complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo " INTERNAL_JWT_SECRET (for Supabase Edge Function):"
echo " $INTERNAL_JWT_SECRET"
echo ""
echo " Secret saved to: $JWT_SECRET_FILE"
echo ""
echo " Next steps:"
echo " 1. Add to Supabase secrets:"
echo "    supabase secrets set INTERNAL_JWT_SECRET=$INTERNAL_JWT_SECRET --project-ref <ref>"
echo ""
echo " 2. Deploy the metrics-proxy-jwt Edge Function"
echo ""
echo " 3. Update React app to use JWT authentication"
echo ""
echo " Services:"
echo "   - JWT Validator: http://127.0.0.1:$JWT_VALIDATOR_PORT"
echo "   - Metrics API:   https://$DOMAIN"
echo ""
echo "═══════════════════════════════════════════════════════════════"

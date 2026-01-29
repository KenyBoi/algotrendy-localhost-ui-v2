# AlgoTrendy Metrics Proxy - Setup Guide

**Purpose:** Connect v2 cloud dashboard to VPS metrics API securely via HTTPS

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser                                                            │
│    └── v2 React Dashboard                                           │
│          └── fetch(/functions/v1/metrics-proxy/dashboard)           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Supabase Edge Functions                                            │
│    └── metrics-proxy                                                │
│          └── fetch(VPS_METRICS_ENDPOINT + path)                     │
│              Header: Authorization: Bearer PROXY_API_KEY            │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  VPS (central - 136.114.194.83)                                     │
│    └── nginx (HTTPS reverse proxy)                                  │
│          └── validates API key                                      │
│          └── proxy_pass http://127.0.0.1:9000                       │
│                └── metrics_api_readonly.py                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Step 1: DNS Setup

Point your domain to the VPS IP:

```
metrics.algotrendy.com  →  136.114.194.83  (A record)
```

**Verify:**
```bash
nslookup metrics.algotrendy.com
# Should return 136.114.194.83
```

---

## Step 2: VPS Setup (Run on VPS)

SSH into your VPS:
```bash
ssh central
```

Copy and run the setup script:
```bash
# Option A: Run directly from this repo
curl -sL https://raw.githubusercontent.com/KenyBoi/algotrendy-localhost-ui-v2/main/vps_scripts/setup_metrics_https.sh | sudo bash -s metrics.algotrendy.com

# Option B: Manual with custom API key
sudo ./setup_metrics_https.sh metrics.algotrendy.com my-custom-api-key-here
```

The script will:
1. Install nginx and certbot
2. Configure HTTPS reverse proxy
3. Obtain SSL certificate from Let's Encrypt
4. Set up API key authentication
5. Save API key to `/opt/algotrendy/.metrics_api_key`

**Output:**
```
Metrics API URL:  https://metrics.algotrendy.com
API Key:          <generated-key>
```

---

## Step 3: Supabase Configuration

Set environment variables in Supabase:

### Via CLI:
```bash
# Set the VPS endpoint
supabase secrets set VPS_METRICS_ENDPOINT=https://metrics.algotrendy.com --project-ref opzxfqzliiywtgrigvhn

# Set the API key (from VPS setup output)
supabase secrets set PROXY_API_KEY=<your-api-key> --project-ref opzxfqzliiywtgrigvhn
```

### Via Dashboard:
1. Go to: https://supabase.com/dashboard/project/opzxfqzliiywtgrigvhn/settings/vault
2. Add secrets:
   - `VPS_METRICS_ENDPOINT` = `https://metrics.algotrendy.com`
   - `PROXY_API_KEY` = `<your-api-key>`

---

## Step 4: Redeploy Edge Function

After setting secrets, redeploy to pick up new env vars:

```bash
supabase functions deploy metrics-proxy --project-ref opzxfqzliiywtgrigvhn --no-verify-jwt
```

---

## Step 5: Verify

### Test VPS directly:
```bash
# Health (no auth)
curl https://metrics.algotrendy.com/health

# Protected endpoint (with auth)
curl -H "Authorization: Bearer <your-api-key>" https://metrics.algotrendy.com/broker/status
```

### Test via Supabase proxy:
```bash
curl https://opzxfqzliiywtgrigvhn.supabase.co/functions/v1/metrics-proxy/dashboard
```

### Check v2 Dashboard:
- Open the React dashboard
- Look for **VPS** indicator (green) instead of **MOCK** (amber)

---

## Troubleshooting

### "VPS endpoint not configured"
```bash
# Check if secret is set
supabase secrets list --project-ref opzxfqzliiywtgrigvhn | grep VPS_METRICS_ENDPOINT

# Redeploy function after setting
supabase functions deploy metrics-proxy --project-ref opzxfqzliiywtgrigvhn --no-verify-jwt
```

### "403 Forbidden" from VPS
- API key mismatch
- Check: `cat /opt/algotrendy/.metrics_api_key`
- Ensure PROXY_API_KEY in Supabase matches

### "Connection refused" or timeout
- Metrics API not running: `ps aux | grep metrics_api`
- Firewall blocking: `sudo ufw status`
- nginx not running: `sudo systemctl status nginx`

### SSL certificate issues
```bash
# Check certificate
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal

# Reload nginx
sudo systemctl reload nginx
```

---

## Security Notes

1. **API Key Rotation**
   - Generate new key: `openssl rand -hex 32`
   - Update nginx config
   - Update Supabase secret
   - Redeploy edge function

2. **Rate Limiting**
   - nginx limits: 10 req/sec with burst of 20
   - Adjust in `/etc/nginx/sites-available/metrics-api`

3. **Logs**
   - nginx access: `/var/log/nginx/metrics-api-access.log`
   - nginx errors: `/var/log/nginx/metrics-api-error.log`

---

## Files Reference

| Location | Purpose |
|----------|---------|
| `/etc/nginx/sites-available/metrics-api` | nginx config |
| `/opt/algotrendy/.metrics_api_key` | API key (root only) |
| `/etc/letsencrypt/live/metrics.algotrendy.com/` | SSL certificates |
| `/var/log/nginx/metrics-api-*.log` | Logs |

---

## Quick Commands

```bash
# Restart nginx
sudo systemctl restart nginx

# View nginx config
cat /etc/nginx/sites-available/metrics-api

# Test nginx config
sudo nginx -t

# View API key
sudo cat /opt/algotrendy/.metrics_api_key

# Tail logs
sudo tail -f /var/log/nginx/metrics-api-access.log
```

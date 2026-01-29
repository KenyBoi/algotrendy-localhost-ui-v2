# VPS Service Scripts (Reference Implementation)

These are **reference implementations** of the services that should run on your VPS.

## Deployment Instructions

### 1. Copy Scripts to VPS

```bash
scp metrics_api_readonly.py algotrendy:/opt/algotrendy/
scp dashboard_server.py algotrendy:/opt/algotrendy/
```

### 2. Install Dependencies on VPS

```bash
ssh algotrendy

# Install Python packages
pip3 install flask requests psutil

# Create log directory
mkdir -p /var/log/algotrendy
```

### 3. Test Services Manually

```bash
# Test Metrics API
python3 /opt/algotrendy/metrics_api_readonly.py

# In another terminal, test it:
curl http://127.0.0.1:9000/health
curl http://127.0.0.1:9000/metrics
```

```bash
# Test Dashboard
python3 /opt/algotrendy/dashboard_server.py

# In another terminal, test it:
curl http://127.0.0.1:3000/health
```

### 4. Run as Background Services

Option A - Using nohup (simple):
```bash
nohup python3 /opt/algotrendy/metrics_api_readonly.py > /var/log/algotrendy/metrics.log 2>&1 &
nohup python3 /opt/algotrendy/dashboard_server.py > /var/log/algotrendy/dashboard.log 2>&1 &
```

Option B - Using systemd (production):

Create `/etc/systemd/system/algotrendy-metrics.service`:
```ini
[Unit]
Description=AlgoTrendy Metrics API (Read-Only)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/algotrendy
ExecStart=/usr/bin/python3 /opt/algotrendy/metrics_api_readonly.py
Restart=always
RestartSec=10
StandardOutput=append:/var/log/algotrendy/metrics.log
StandardError=append:/var/log/algotrendy/metrics.log

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/algotrendy-dashboard.service`:
```ini
[Unit]
Description=AlgoTrendy Dashboard Server
After=network.target algotrendy-metrics.service
Requires=algotrendy-metrics.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/algotrendy
ExecStart=/usr/bin/python3 /opt/algotrendy/dashboard_server.py
Restart=always
RestartSec=10
StandardOutput=append:/var/log/algotrendy/dashboard.log
StandardError=append:/var/log/algotrendy/dashboard.log

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable algotrendy-metrics algotrendy-dashboard
sudo systemctl start algotrendy-metrics algotrendy-dashboard
sudo systemctl status algotrendy-metrics algotrendy-dashboard
```

## Service Details

### metrics_api_readonly.py (Port 9000)

**Endpoints:**
- `GET /health` - Health check
- `GET /system/activity` - System activity status (seeding, CPU, memory)
- `GET /metrics` - Comprehensive system metrics
- `GET /metrics/trading` - Read-only trading metrics

**Security:**
- Binds only to `127.0.0.1` (localhost)
- No write operations
- No trading mutations
- Only GET requests

### dashboard_server.py (Port 3000)

**Endpoints:**
- `GET /` - Web dashboard UI
- `GET /health` - Health check
- `GET /api/activity` - Proxy to metrics API
- `GET /api/metrics` - Proxy to metrics API

**Security:**
- Binds only to `127.0.0.1` (localhost)
- Read-only operations
- Auto-refreshes every 5 seconds

## Logs

View logs:
```bash
# Metrics API
tail -f /var/log/algotrendy/metrics.log

# Dashboard
tail -f /var/log/algotrendy/dashboard.log
```

## Troubleshooting

Check if services are running:
```bash
ps aux | grep metrics_api_readonly
ps aux | grep dashboard_server

# Or with systemd:
sudo systemctl status algotrendy-metrics
sudo systemctl status algotrendy-dashboard
```

Check if ports are listening:
```bash
netstat -tlnp | grep 9000
netstat -tlnp | grep 3000
```

## Customization

### Add Custom Metrics

Edit `metrics_api_readonly.py` and add new endpoints:

```python
@app.route('/metrics/custom', methods=['GET'])
def custom_metrics():
    return jsonify({
        'your_metric': 123,
        'timestamp': datetime.utcnow().isoformat()
    }), 200
```

### Customize Dashboard

Edit `dashboard_server.py` and modify the `DASHBOARD_HTML` template.

---

**Note:** These are reference implementations. Adapt them to your specific AlgoTrendy system requirements.

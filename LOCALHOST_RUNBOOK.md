# AlgoTrendy Localhost Stack - Runbook

**Version:** 1.0.0
**Last Updated:** 2026-01-28
**Purpose:** Local visibility into AlgoTrendy trading system via SSH tunneling

---

## Overview

This CLI tool provides **read-only localhost access** to your AlgoTrendy VPS services:

- ✅ **Metrics API** (port 9000) - System metrics and performance data
- ✅ **Dashboard** (port 8080) - Web-based monitoring interface
- ✅ **No Trading Logic** - View-only, no mutations
- ✅ **One Command** - `algotrendy up` handles everything

---

## Prerequisites

### Required Software

1. **Python 3.7+**
   - Windows: https://www.python.org/downloads/
   - Linux/Mac: Usually pre-installed

2. **OpenSSH Client**
   - Windows: https://docs.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse
   - Linux/Mac: Usually pre-installed

3. **SSH Key Setup**
   - Must have SSH key configured for VPS access
   - Test with: `ssh algotrendy echo OK`

### Required Python Packages

```bash
pip install requests
```

---

## Installation

### 1. Add to PATH (Windows)

Option A - User PATH:
```powershell
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$newPath = "C:\Users\kenne\opt\algotrendy\local"
[Environment]::SetEnvironmentVariable("Path", "$userPath;$newPath", "User")
```

Option B - System-wide (Admin required):
```powershell
$systemPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
$newPath = "C:\Users\kenne\opt\algotrendy\local"
[Environment]::SetEnvironmentVariable("Path", "$systemPath;$newPath", "Machine")
```

### 2. Verify Installation

```bash
algotrendy
```

Should display usage instructions.

---

## Usage

### Start Everything

```bash
algo up
```

**Output Example:**
```
AlgoTrendy Localhost Startup
───────────────────────────
VPS Reachable ............. OK
SSH Tunnel ............... OK
Metrics API (9000) ........ OK
Dashboard Server (3000) ... OK
System Activity .......... ACTIVE
Seeding Scheduler ........ ACTIVE

Dashboard:
→ http://localhost:3000

Status: ✅ READY
```

### Verbose Mode

```bash
algo up --verbose
```

Shows detailed debugging information.

### Backwards Compatibility

```bash
algotrendy up  # Still works as an alias to 'algo up'
```

---

## What Happens When You Run It

### 1. **Prerequisites Check**
- ✓ Verifies SSH client is installed
- ✓ Tests Python availability

### 2. **VPS Connectivity Test**
- ✓ SSH to VPS using config from `~/.ssh/config`
- ✓ Verifies VPS hostname: `algotrendy`

### 3. **SSH Tunnel Establishment**
- ✓ Creates background SSH tunnel: `localhost:9000 → VPS:127.0.0.1:9000`
- ✓ Creates background SSH tunnel: `localhost:3000 → VPS:127.0.0.1:3000`
- ✓ Idempotent - won't create duplicates if already running

### 4. **VPS Service Orchestration**
- ✓ Checks if `metrics_api_readonly.py` is running on VPS
- ✓ Checks if `dashboard_server.py` is running on VPS
- ✓ Starts services if not already running (read-only mode)
- ✓ Verifies health endpoints

### 5. **System Verification**
- ✓ Calls `/health` on both services
- ✓ Retrieves `/system/activity` status
- ✓ Confirms seeding scheduler is active

### 6. **Browser Launch**
- ✓ Opens `http://localhost:3000` in default browser

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Local Machine (Windows)                         │
│                                                   │
│  ┌────────────────────────────┐                  │
│  │  algotrendy up (CLI)       │                  │
│  └─────────┬──────────────────┘                  │
│            │                                      │
│            ├──► SSH Tunnel Manager               │
│            │    (localhost:9000 → VPS:9000)       │
│            │    (localhost:3000 → VPS:3000)       │
│            │                                      │
│            └──► VPS Orchestrator                 │
│                 (Start/verify VPS services)      │
│                                                   │
│  Browser: http://localhost:3000 ◄────────┐       │
└────────────────────────────────┼─────────┼───────┘
                                 │         │
                          SSH    │         │ HTTP
                        Tunnel   │         │ Forward
                                 │         │
┌────────────────────────────────▼─────────▼───────┐
│  VPS (algotrendy)                                 │
│                                                   │
│  ┌──────────────────────────────────────┐        │
│  │  metrics_api_readonly.py :9000       │        │
│  │  - GET /health                       │        │
│  │  - GET /metrics                      │        │
│  │  - GET /system/activity              │        │
│  │  (READ ONLY)                         │        │
│  └──────────────────────────────────────┘        │
│                                                   │
│  ┌──────────────────────────────────────┐        │
│  │  dashboard_server.py :3000           │        │
│  │  - GET /health                       │        │
│  │  - Serves web dashboard              │        │
│  │  (READ ONLY)                         │        │
│  └──────────────────────────────────────┘        │
│                                                   │
└───────────────────────────────────────────────────┘
```

---

## Files

### Local Machine
```
C:\Users\kenne\opt\algotrendy\local\
├── algo.bat                    # Windows executable (main)
├── algo                        # Unix/Linux/Mac executable (main)
├── algotrendy.bat              # Windows executable (legacy alias)
├── algotrendy                  # Unix/Linux/Mac executable (legacy alias)
├── algotrendy_up.py            # Main CLI logic
├── ssh_tunnel.py               # SSH tunnel manager
├── vps_orchestrator.py         # VPS service controller
├── LOCALHOST_RUNBOOK.md        # This file
└── vps_scripts/                # Reference VPS scripts
    ├── metrics_api_readonly.py
    └── dashboard_server.py
```

### VPS (must exist)
```
/opt/algotrendy/
├── metrics_api_readonly.py     # Metrics API server
└── dashboard_server.py         # Dashboard web server
```

---

## Troubleshooting

### "SSH client not found"

**Windows:**
```powershell
# Install OpenSSH Client
Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
```

**Linux:**
```bash
sudo apt-get install openssh-client
```

### "VPS Reachable ........... FAIL"

1. Test SSH manually:
   ```bash
   ssh algotrendy echo OK
   ```

2. Check `~/.ssh/config`:
   ```
   Host algotrendy
       HostName <your-vps-ip>
       User root
       IdentityFile ~/.ssh/id_ed25519
   ```

3. Verify VPS is running:
   ```bash
   ping <your-vps-ip>
   ```

### "Tunnel ................. FAIL"

1. Check if port is already in use:
   ```bash
   # Windows
   netstat -ano | findstr ":9000"
   netstat -ano | findstr ":3000"

   # Linux/Mac
   lsof -i :9000
   lsof -i :3000
   ```

2. Kill existing tunnels if needed:
   ```bash
   # Windows
   taskkill /PID <pid> /F

   # Linux/Mac
   kill <pid>
   ```

### "Metrics API (9000) ....... FAIL"

VPS service not running. SSH to VPS and check:

```bash
ssh algotrendy

# Check if process is running
ps aux | grep metrics_api_readonly.py

# Check logs
tail -f /var/log/algotrendy/Metrics\ API.log

# Start manually if needed
nohup python3 /opt/algotrendy/metrics_api_readonly.py > /var/log/algotrendy/metrics.log 2>&1 &
```

### "Dashboard Server (3000) ... FAIL"

Similar to Metrics API - check VPS process and logs.

---

## Important Notes

### ✅ Safe Operations (Read-Only)
- ✅ View metrics
- ✅ View dashboard
- ✅ Monitor system status
- ✅ Check seeding activity

### ❌ Prohibited Operations
- ❌ NO trading
- ❌ NO config changes
- ❌ NO POST/PUT/DELETE requests
- ❌ NO database writes
- ❌ NO systemd changes

### CLI Behavior
- **Idempotent** - Can run multiple times safely
- **Background SSH** - Tunnels persist after CLI exits
- **Auto-start** - Starts VPS services if not running
- **Browser** - Opens automatically on success

---

## Advanced Usage

### Custom VPS Host

Edit `algotrendy_up.py`:

```python
VPS_HOST = "your-custom-host"  # From ~/.ssh/config
```

### Custom Ports

Edit `algotrendy_up.py`:

```python
METRICS_API_PORT = 9001  # Change from 9000
DASHBOARD_PORT = 3001    # Change from 3000
```

### Skip Browser Launch

Edit `algotrendy_up.py`, comment out:

```python
# self.open_browser()
```

---

## Next Steps

This CLI is **v0 - MVP**. Future enhancements:

- [ ] `algotrendy down` - Stop tunnels and services
- [ ] `algotrendy status` - Check current state
- [ ] `algotrendy logs` - Tail VPS logs
- [ ] Config file support (`.algotrendyrc`)
- [ ] Multiple VPS profiles

---

## Support

**Documentation:** This file
**Issues:** Check verbose output with `--verbose`
**VPS Scripts:** See `vps_scripts/` directory for reference implementations

---

**End of Runbook**

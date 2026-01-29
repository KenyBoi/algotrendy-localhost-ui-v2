# AlgoTrendy Dashboard

**Version:** 4.0.0-temporal
**Status:** Production

Terminal-style monitoring dashboard for AlgoTrendy trading system with read-only localhost access via SSH tunneling.

## Features

- **Multi-Market Awareness** - FUTURES (live) and CRYPTO (instrumented when ready)
- **Decision Automation (Human-First)** - Operator recommendations without automation
- **Time as First-Class Axis** - Every fact has state, market, and timestamp
- **Predictive Instruments** - System drift, intent quality, intervention preview
- **Session Forensics** - Chronological narrative for session replay

## Architecture

```
Local Machine (Windows)
  algotrendy up --> SSH Tunnels --> Browser (localhost:5000)
                         |
                    SSH Tunnel
                         |
VPS (Remote)
  dashboard_server.py :5000 (Flask)
  metrics_api_readonly.py :9000
```

## Quick Start

```bash
# Start the full stack (tunnels + services + browser)
algotrendy up

# With verbose output
algotrendy up --verbose
```

## Files

| File | Purpose |
|------|---------|
| `algotrendy_up.py` | Main CLI orchestrator |
| `ssh_tunnel.py` | SSH tunnel manager |
| `vps_orchestrator.py` | VPS service controller |
| `vps_scripts/dashboard_server.py` | Dashboard server (Flask + embedded HTML/JS) |
| `LOCALHOST_RUNBOOK.md` | Operational documentation |

## Dashboard Panels

### Decision Automation (Phase 6)
- **System Verdict** - SAFE TO TRADE / DEGRADED / UNSAFE
- **Operator Recommendation** - CONTINUE / REDUCE RISK / PAUSE / HALT
- **System Confidence** - 0-100 weighted heuristic
- **Intervention Preview** - What would trigger next action

### Predictive Instruments (Phase 3-5)
- **System Drift** - Data lag, gate pressure, latency trends
- **Intent Quality** - Generated vs executed ratio
- **Control Loop** - Heartbeat integrity and jitter

### Time-Aware (Phase 7)
Every panel includes timestamps (As Of, Computed At, Evaluated At)

## System Invariants

```
IF market.instrumented == false THEN execution_capability == false
```

## Version History

| Version | Codename | Features |
|---------|----------|----------|
| 4.0.0 | temporal | Time as first-class axis |
| 3.1.0 | multimarket | Crypto first-class support |
| 3.0.0 | advisor | Decision automation (human-first) |

## License

Private - AlgoTrendy Trading System

#!/usr/bin/env python3
"""
AlgoTrendy Metrics API (Read-Only)
Provides read-only access to system metrics and performance data

Deploy to VPS: /opt/algotrendy/metrics_api_readonly.py
Port: 9000
"""
from flask import Flask, jsonify
import psutil
import json
from datetime import datetime

app = Flask(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# HEALTH & STATUS ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'metrics_api_readonly',
        'timestamp': datetime.utcnow().isoformat(),
        'version': '1.0.0'
    }), 200


@app.route('/system/activity', methods=['GET'])
def system_activity():
    """Get current system activity status"""
    # Check if seeding scheduler is running (example logic)
    seeding_active = check_seeding_scheduler_active()

    return jsonify({
        'seeding_active': seeding_active,
        'system_uptime': get_system_uptime(),
        'cpu_usage': psutil.cpu_percent(interval=1),
        'memory_usage': psutil.virtual_memory().percent,
        'timestamp': datetime.utcnow().isoformat()
    }), 200


# ═══════════════════════════════════════════════════════════════════════════
# METRICS ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@app.route('/metrics', methods=['GET'])
def get_metrics():
    """Get comprehensive system metrics"""
    return jsonify({
        'cpu': {
            'percent': psutil.cpu_percent(interval=1),
            'count': psutil.cpu_count(),
            'per_cpu': psutil.cpu_percent(interval=1, percpu=True)
        },
        'memory': {
            'total': psutil.virtual_memory().total,
            'available': psutil.virtual_memory().available,
            'percent': psutil.virtual_memory().percent,
            'used': psutil.virtual_memory().used
        },
        'disk': {
            'total': psutil.disk_usage('/').total,
            'used': psutil.disk_usage('/').used,
            'free': psutil.disk_usage('/').free,
            'percent': psutil.disk_usage('/').percent
        },
        'network': get_network_stats(),
        'timestamp': datetime.utcnow().isoformat()
    }), 200


@app.route('/metrics/trading', methods=['GET'])
def get_trading_metrics():
    """Get read-only trading metrics (no mutations)"""
    # Example: Read from database or cache
    # This is READ ONLY - no trading operations
    return jsonify({
        'active_positions': 0,  # Example data
        'daily_pnl': 0.0,
        'win_rate': 0.0,
        'total_trades_today': 0,
        'note': 'Read-only metrics - no trading operations',
        'timestamp': datetime.utcnow().isoformat()
    }), 200


# ═══════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════

def check_seeding_scheduler_active() -> bool:
    """Check if seeding scheduler process is running"""
    try:
        # Check for specific process name
        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                cmdline = ' '.join(proc.info['cmdline'] or [])
                if 'seeding_scheduler' in cmdline.lower():
                    return True
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        return False
    except Exception:
        return False


def get_system_uptime() -> float:
    """Get system uptime in seconds"""
    try:
        return time.time() - psutil.boot_time()
    except Exception:
        return 0.0


def get_network_stats() -> dict:
    """Get network statistics"""
    try:
        net_io = psutil.net_io_counters()
        return {
            'bytes_sent': net_io.bytes_sent,
            'bytes_recv': net_io.bytes_recv,
            'packets_sent': net_io.packets_sent,
            'packets_recv': net_io.packets_recv
        }
    except Exception:
        return {}


# ═══════════════════════════════════════════════════════════════════════════
# SERVER CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    import time
    import logging

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    logger = logging.getLogger(__name__)
    logger.info("Starting AlgoTrendy Metrics API (Read-Only) on port 9000")

    # Run Flask server
    # IMPORTANT: Only bind to localhost for security
    # SSH tunneling will make it accessible locally
    app.run(
        host='127.0.0.1',  # Only localhost - not exposed to internet
        port=9000,
        debug=False,
        threaded=True
    )

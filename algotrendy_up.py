#!/usr/bin/env python3
"""
AlgoTrendy Localhost Startup CLI
Single command to orchestrate full localhost stack with VPS tunneling

Usage:
    algotrendy up              # Interactive VPS selection
    algotrendy up --verbose    # Detailed output
"""
import sys
import subprocess
import webbrowser
import time
from pathlib import Path

# Local imports
from ssh_tunnel import TunnelManager
from vps_orchestrator import VPSOrchestrator

# Try to import inquirer for interactive menu
try:
    import inquirer
    INQUIRER_AVAILABLE = True
except ImportError:
    INQUIRER_AVAILABLE = False


# ═══════════════════════════════════════════════════════════════════════════
# VPS PROFILES
# ═══════════════════════════════════════════════════════════════════════════

VPS_PROFILES = {
    "central": {
        "name": "US Central (GCP)",
        "ssh_host": "central",
        "ssh_user": "kennethsarmstrong_gmail_com",
        "description": "GCP VM - algotrendy-fut-prod (us-central1-a)",
        "location": "[US] US Central"
    },
    "singapore": {
        "name": "Singapore (GCP Asia)",
        "ssh_host": "singapore",
        "ssh_user": "kennethsarmstrong_gmail_com",
        "description": "GCP VM - bybit-demo-sg (asia-southeast1-b)",
        "location": "[SG] Singapore"
    }
}

# Default ports
METRICS_API_PORT = 9000
DASHBOARD_PORT = 5000  # Changed from 3000 (Grafana) and 8080 (crypto-market-observer)

METRICS_API_SCRIPT = "/opt/algotrendy/metrics_api_readonly.py"
DASHBOARD_SCRIPT = "/opt/algotrendy/dashboard_server.py"

DASHBOARD_URL = f"http://localhost:{DASHBOARD_PORT}"


# ═══════════════════════════════════════════════════════════════════════════
# CLI CORE
# ═══════════════════════════════════════════════════════════════════════════

class StartupCLI:
    """AlgoTrendy Localhost Startup Orchestrator"""

    def __init__(self, verbose: bool = False, vps_profile: str = None):
        self.verbose = verbose
        self.vps_profile = vps_profile
        self.vps_config = None
        self.results = {}
        self.failed = False

    def log(self, message: str):
        """Log message if verbose mode"""
        if self.verbose:
            print(f"  [DEBUG] {message}")

    def check_prerequisites(self) -> bool:
        """Verify system prerequisites"""
        print("AlgoTrendy Localhost Startup")
        print("-" * 27)

        # Check SSH client
        try:
            result = subprocess.run(
                ['ssh', '-V'],
                capture_output=True,
                text=True,
                timeout=3
            )
            if result.returncode == 0 or 'OpenSSH' in result.stderr:
                self.log("SSH client found")
                return True
            else:
                print("❌ SSH client not found")
                print("   Install OpenSSH: https://docs.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse")
                return False

        except FileNotFoundError:
            print("❌ SSH client not found")
            print("   Install OpenSSH")
            return False
        except Exception as e:
            print(f"❌ Error checking SSH: {e}")
            return False

    def select_vps(self) -> bool:
        """Interactive VPS selection"""
        if self.vps_profile:
            # VPS already specified
            if self.vps_profile not in VPS_PROFILES:
                print(f"Error: Unknown VPS profile '{self.vps_profile}'")
                print(f"Available profiles: {', '.join(VPS_PROFILES.keys())}")
                return False
            self.vps_config = VPS_PROFILES[self.vps_profile]
            return True

        # Interactive selection
        if not INQUIRER_AVAILABLE:
            # Fallback to simple numbered selection
            print("\nAvailable VPS Deployments:")
            print("─" * 50)
            for i, (key, profile) in enumerate(VPS_PROFILES.items(), 1):
                print(f"{i}. {profile['location']} - {profile['name']}")
                print(f"   {profile['description']}")
                print()

            while True:
                try:
                    choice = input("Select VPS (1-2): ").strip()
                    idx = int(choice) - 1
                    if 0 <= idx < len(VPS_PROFILES):
                        profile_key = list(VPS_PROFILES.keys())[idx]
                        self.vps_profile = profile_key
                        self.vps_config = VPS_PROFILES[profile_key]
                        return True
                    else:
                        print("Invalid choice. Try again.")
                except (ValueError, KeyboardInterrupt):
                    print("\nCancelled")
                    return False
        else:
            # Use inquirer for arrow key navigation
            choices = [
                f"{profile['location']} {profile['name']} - {profile['description']}"
                for profile in VPS_PROFILES.values()
            ]

            questions = [
                inquirer.List('vps',
                            message="Select VPS deployment",
                            choices=choices,
                            carousel=True)
            ]

            try:
                answers = inquirer.prompt(questions)
                if not answers:
                    return False

                # Map selection back to profile key
                selected_idx = choices.index(answers['vps'])
                profile_key = list(VPS_PROFILES.keys())[selected_idx]
                self.vps_profile = profile_key
                self.vps_config = VPS_PROFILES[profile_key]
                return True

            except KeyboardInterrupt:
                print("\nCancelled")
                return False

    def test_vps_reachable(self) -> bool:
        """Test VPS connectivity"""
        vps_host = self.vps_config['ssh_host']

        self.log(f"Testing VPS connectivity to {vps_host}...")

        try:
            result = subprocess.run(
                ['ssh', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=5', vps_host, 'echo OK'],
                capture_output=True,
                text=True,
                timeout=15
            )

            if result.returncode == 0 and 'OK' in result.stdout:
                self.results['vps_reachable'] = True
                return True
            else:
                self.results['vps_reachable'] = False
                print(f"VPS Reachable ............. FAIL")
                if self.verbose:
                    print(f"   Error: {result.stderr}")
                return False

        except subprocess.TimeoutExpired:
            self.results['vps_reachable'] = False
            print(f"VPS Reachable ............. TIMEOUT")
            return False
        except Exception as e:
            self.results['vps_reachable'] = False
            print(f"VPS Reachable ............. ERROR: {e}")
            return False

    def setup_tunnels(self) -> bool:
        """Establish SSH tunnels"""
        self.log("Setting up SSH tunnels...")

        vps_host = self.vps_config['ssh_host']

        # Just use the SSH host - ~/.ssh/config has the user configured
        tunnel_mgr = TunnelManager(vps_host)

        # Add tunnel configurations
        tunnel_mgr.add_tunnel(
            local_port=METRICS_API_PORT,
            remote_port=METRICS_API_PORT,
            name="metrics_api"
        )

        tunnel_mgr.add_tunnel(
            local_port=DASHBOARD_PORT,
            remote_port=DASHBOARD_PORT,
            name="dashboard"
        )

        # Establish all tunnels
        tunnel_results = tunnel_mgr.establish_all()

        # Store results
        self.results['tunnels'] = tunnel_results

        # Check if all succeeded
        all_success = all(r['success'] for r in tunnel_results.values())

        if not all_success:
            self.failed = True
            for name, result in tunnel_results.items():
                if not result['success']:
                    if self.verbose:
                        print(f"   Tunnel {name} failed: {result['message']}")

        return all_success

    def start_vps_services(self) -> bool:
        """Ensure VPS services are running"""
        self.log("Starting VPS services...")

        vps_host = self.vps_config['ssh_host']

        # Just use the SSH host - ~/.ssh/config has the user configured
        orchestrator = VPSOrchestrator(vps_host)

        # Configure services
        orchestrator.add_service(
            name="Metrics API",
            script_path=METRICS_API_SCRIPT,
            port=METRICS_API_PORT,
            health_check="/health"
        )

        orchestrator.add_service(
            name="Dashboard",
            script_path=DASHBOARD_SCRIPT,
            port=DASHBOARD_PORT,
            health_check="/health"
        )

        # Ensure all running
        service_results = orchestrator.ensure_all_running()

        # Store results
        self.results['services'] = service_results

        # Check if all healthy
        all_healthy = all(
            r['running'] and r['healthy']
            for r in service_results.values()
        )

        if not all_healthy:
            self.failed = True
            if self.verbose:
                for name, result in service_results.items():
                    if not (result['running'] and result['healthy']):
                        print(f"   Service {name} issue: {result['message']}")

        return all_healthy

    def verify_system(self) -> bool:
        """Verify end-to-end system health"""
        self.log("Verifying system health...")

        vps_host = self.vps_config['ssh_host']

        # Just use the SSH host - ~/.ssh/config has the user configured
        orchestrator = VPSOrchestrator(vps_host)

        # Get system status
        success, status = orchestrator.get_system_status()

        self.results['system_status'] = status

        return success and 'error' not in status

    def print_status(self):
        """Print formatted status table"""
        print()

        # VPS Info
        if self.vps_config:
            print(f"VPS: {self.vps_config['location']} {self.vps_config['name']}")
            print()

        # VPS Reachable
        vps_ok = self.results.get('vps_reachable', False)
        print(f"VPS Reachable ............. {'OK' if vps_ok else 'FAIL'}")

        # SSH Tunnel
        tunnels = self.results.get('tunnels', {})
        tunnel_ok = all(t['success'] for t in tunnels.values())
        print(f"SSH Tunnel ................ {'OK' if tunnel_ok else 'FAIL'}")

        # Metrics API
        services = self.results.get('services', {})
        metrics_ok = services.get('Metrics API', {}).get('healthy', False)
        print(f"Metrics API ({METRICS_API_PORT}) ........ {'OK' if metrics_ok else 'FAIL'}")

        # Dashboard
        dashboard_ok = services.get('Dashboard', {}).get('healthy', False)
        print(f"Dashboard Server ({DASHBOARD_PORT}) ... {'OK' if dashboard_ok else 'FAIL'}")

        # System Activity
        system_status = self.results.get('system_status', {})
        activity_ok = system_status.get('seeding_active', False) if isinstance(system_status, dict) else False
        print(f"System Activity ........... {'ACTIVE' if activity_ok else 'UNKNOWN'}")

        # Seeding Scheduler
        seeding_ok = system_status.get('seeding_active', False) if isinstance(system_status, dict) else False
        print(f"Seeding Scheduler ......... {'ACTIVE' if seeding_ok else 'UNKNOWN'}")

        print()
        print("Dashboard:")
        print(f"-> {DASHBOARD_URL}")
        print()

        # Final status
        if self.failed or not (vps_ok and tunnel_ok and metrics_ok and dashboard_ok):
            print("Status: [FAILED]")
            if not self.verbose:
                print("   Run with --verbose for details")
        else:
            print("Status: [READY]")

    def open_browser(self):
        """Open dashboard in browser"""
        if not self.failed:
            self.log(f"Opening browser to {DASHBOARD_URL}...")
            try:
                webbrowser.open(DASHBOARD_URL)
                time.sleep(1)  # Give browser time to start
            except Exception as e:
                if self.verbose:
                    print(f"   Could not open browser: {e}")

    def run(self):
        """Main orchestration flow"""
        # Prerequisites
        if not self.check_prerequisites():
            return 1

        # VPS selection
        if not self.select_vps():
            return 1

        print()  # Blank line after selection

        # VPS connectivity
        if not self.test_vps_reachable():
            self.print_status()
            return 1

        # SSH tunnels
        tunnel_success = self.setup_tunnels()

        # VPS services
        services_success = self.start_vps_services()

        # System verification
        system_ok = self.verify_system()

        # Print results
        self.print_status()

        # Open browser if everything is OK
        if not self.failed:
            self.open_browser()

        return 0 if not self.failed else 1


def main():
    """Entry point"""
    verbose = '--verbose' in sys.argv or '-v' in sys.argv

    # Check for VPS profile argument
    vps_profile = None
    for arg in sys.argv[1:]:
        if arg not in ['--verbose', '-v', 'up']:
            # Assume it's a VPS profile name
            vps_profile = arg

    cli = StartupCLI(verbose=verbose, vps_profile=vps_profile)
    exit_code = cli.run()

    sys.exit(exit_code)


if __name__ == '__main__':
    main()

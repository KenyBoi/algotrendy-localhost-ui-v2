"""
VPS Service Orchestrator for AlgoTrendy
Manages remote services via SSH (read-only, no mutations)
"""
import subprocess
import json
from typing import Dict, Optional, Tuple


class VPSService:
    """Represents a single VPS service"""

    def __init__(self, name: str, script_path: str, port: int, health_check: str):
        self.name = name
        self.script_path = script_path
        self.port = port
        self.health_check = health_check

    def __repr__(self):
        return f"VPSService({self.name}@{self.port})"


class VPSOrchestrator:
    """Manages VPS services via SSH"""

    def __init__(self, vps_connection: str):
        """
        Initialize with SSH connection string
        Args:
            vps_connection: Either 'user@host' or just 'host' (uses ~/.ssh/config)
        """
        self.vps_connection = vps_connection
        self.services = []

    def add_service(self, name: str, script_path: str, port: int, health_check: str = "/health"):
        """Add service configuration"""
        service = VPSService(
            name=name,
            script_path=script_path,
            port=port,
            health_check=health_check
        )
        self.services.append(service)
        return service

    def ssh_exec(self, command: str, timeout: int = 10) -> Tuple[bool, str]:
        """
        Execute command on VPS via SSH
        Returns: (success, output)
        """
        ssh_cmd = [
            'ssh',
            self.vps_connection,
            command
        ]

        try:
            result = subprocess.run(
                ssh_cmd,
                capture_output=True,
                text=True,
                timeout=timeout
            )

            success = result.returncode == 0
            output = result.stdout if success else result.stderr

            return success, output.strip()

        except subprocess.TimeoutExpired:
            return False, "Command timeout"
        except Exception as e:
            return False, f"SSH error: {str(e)}"

    def check_service_running(self, service: VPSService) -> Tuple[bool, Optional[int]]:
        """
        Check if service is running on VPS
        Returns: (is_running, pid or None)
        """
        # Use pgrep to find process by script name
        script_name = service.script_path.split('/')[-1]
        cmd = f"pgrep -f '{script_name}' -a | grep -v grep | head -1"

        success, output = self.ssh_exec(cmd)

        if success and output:
            try:
                # Extract PID from pgrep output
                pid = int(output.split()[0])
                return True, pid
            except (ValueError, IndexError):
                pass

        return False, None

    def start_service(self, service: VPSService) -> Tuple[bool, str]:
        """
        Start service on VPS (idempotent)
        Returns: (success, message)
        """
        # First check if already running
        is_running, pid = self.check_service_running(service)

        if is_running:
            return True, f"Already running (PID: {pid})"

        # Start service in background
        # Using nohup to keep it running after SSH disconnects
        cmd = f"nohup python3 {service.script_path} > /var/log/algotrendy/{service.name}.log 2>&1 & echo $!"

        success, output = self.ssh_exec(cmd, timeout=5)

        if success and output:
            try:
                new_pid = int(output.strip())
                return True, f"Started (PID: {new_pid})"
            except ValueError:
                return False, f"Started but could not determine PID: {output}"

        return False, f"Failed to start: {output}"

    def verify_health(self, service: VPSService) -> Tuple[bool, str]:
        """
        Verify service health via curl on VPS
        Returns: (healthy, message)
        """
        cmd = f"curl -s -f http://127.0.0.1:{service.port}{service.health_check}"

        success, output = self.ssh_exec(cmd, timeout=5)

        if success:
            return True, "Healthy"
        else:
            return False, f"Health check failed: {output}"

    def ensure_all_running(self) -> Dict[str, dict]:
        """
        Ensure all services are running (idempotent)
        Returns: dict of service statuses
        """
        results = {}

        for service in self.services:
            # Check if running
            is_running, pid = self.check_service_running(service)

            if is_running:
                # Verify health
                healthy, health_msg = self.verify_health(service)
                results[service.name] = {
                    'running': True,
                    'pid': pid,
                    'healthy': healthy,
                    'message': health_msg
                }
            else:
                # Try to start
                start_success, start_msg = self.start_service(service)

                if start_success:
                    # Re-check health
                    healthy, health_msg = self.verify_health(service)
                    results[service.name] = {
                        'running': True,
                        'pid': None,
                        'healthy': healthy,
                        'message': f"Started: {start_msg}, Health: {health_msg}"
                    }
                else:
                    results[service.name] = {
                        'running': False,
                        'pid': None,
                        'healthy': False,
                        'message': start_msg
                    }

        return results

    def get_system_status(self) -> Tuple[bool, dict]:
        """
        Get overall system status from VPS
        Returns: (success, status_dict)
        """
        # Try to get activity status from metrics API
        cmd = "curl -s http://127.0.0.1:9000/system/activity 2>/dev/null || echo '{\"error\": \"not available\"}'"

        success, output = self.ssh_exec(cmd, timeout=5)

        try:
            status = json.loads(output)
            return True, status
        except json.JSONDecodeError:
            return False, {'error': 'Could not parse system status'}

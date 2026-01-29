"""
SSH Tunnel Manager for AlgoTrendy Localhost Stack
Manages persistent SSH tunnels to VPS services
"""
import subprocess
import time
import requests
import platform
from typing import Optional, Tuple


class SSHTunnel:
    """Manages SSH port forwarding tunnels"""

    def __init__(self,
                 vps_host: str,
                 local_port: int,
                 remote_port: int,
                 tunnel_name: str):
        self.vps_host = vps_host
        self.local_port = local_port
        self.remote_port = remote_port
        self.tunnel_name = tunnel_name
        self.is_windows = platform.system() == "Windows"

    def is_port_in_use(self, port: int) -> bool:
        """Check if a local port is already in use"""
        try:
            import socket
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                return s.connect_ex(('127.0.0.1', port)) == 0
        except Exception:
            return False

    def find_tunnel_pid(self) -> Optional[int]:
        """Find PID of existing SSH tunnel for this port"""
        try:
            if self.is_windows:
                # Windows: find SSH process with our port mapping
                cmd = f'netstat -ano | findstr ":{self.local_port}"'
                result = subprocess.run(cmd, shell=True, capture_output=True, text=True)

                if result.returncode == 0 and result.stdout:
                    # Extract PID from netstat output
                    for line in result.stdout.strip().split('\n'):
                        if 'LISTENING' in line:
                            parts = line.split()
                            if parts:
                                return int(parts[-1])
            else:
                # Linux/Mac: find SSH process
                cmd = f"pgrep -f 'ssh.*{self.local_port}:{self.vps_host}:{self.remote_port}'"
                result = subprocess.run(cmd, shell=True, capture_output=True, text=True)

                if result.returncode == 0 and result.stdout:
                    return int(result.stdout.strip().split()[0])

        except Exception as e:
            print(f"Warning: Could not find existing tunnel: {e}")

        return None

    def establish(self) -> Tuple[bool, str]:
        """
        Establish SSH tunnel
        Returns: (success: bool, message: str)
        """
        # Check if tunnel already exists
        existing_pid = self.find_tunnel_pid()
        if existing_pid:
            # Verify it's actually working
            if self.is_port_in_use(self.local_port):
                return True, f"Tunnel already active (PID: {existing_pid})"

        # Construct SSH command
        ssh_cmd = [
            'ssh',
            '-f',  # Background process
            '-N',  # No remote command
            '-L', f'{self.local_port}:127.0.0.1:{self.remote_port}',
            self.vps_host,
            '-o', 'ExitOnForwardFailure=yes',
            '-o', 'ServerAliveInterval=60',
            '-o', 'ServerAliveCountMax=3'
        ]

        try:
            # Start tunnel
            result = subprocess.run(
                ssh_cmd,
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode != 0:
                return False, f"SSH tunnel failed: {result.stderr}"

            # Wait briefly for tunnel to establish
            time.sleep(1)

            # Verify tunnel is working
            if not self.is_port_in_use(self.local_port):
                return False, "Tunnel started but port not listening"

            return True, f"Tunnel established on localhost:{self.local_port}"

        except subprocess.TimeoutExpired:
            return False, "SSH connection timeout"
        except FileNotFoundError:
            return False, "SSH client not found. Please install OpenSSH."
        except Exception as e:
            return False, f"Tunnel error: {str(e)}"

    def verify_connectivity(self, health_path: str = "/health") -> bool:
        """
        Verify service is accessible through tunnel
        """
        try:
            url = f"http://localhost:{self.local_port}{health_path}"
            response = requests.get(url, timeout=3)
            return response.status_code == 200
        except Exception:
            return False


class TunnelManager:
    """Manages multiple SSH tunnels"""

    def __init__(self, vps_host: str):
        self.vps_host = vps_host
        self.tunnels = []

    def add_tunnel(self, local_port: int, remote_port: int, name: str):
        """Add tunnel configuration"""
        tunnel = SSHTunnel(
            vps_host=self.vps_host,
            local_port=local_port,
            remote_port=remote_port,
            tunnel_name=name
        )
        self.tunnels.append(tunnel)
        return tunnel

    def establish_all(self) -> dict:
        """
        Establish all configured tunnels
        Returns: dict of tunnel results
        """
        results = {}
        for tunnel in self.tunnels:
            success, message = tunnel.establish()
            results[tunnel.tunnel_name] = {
                'success': success,
                'message': message,
                'port': tunnel.local_port
            }
        return results

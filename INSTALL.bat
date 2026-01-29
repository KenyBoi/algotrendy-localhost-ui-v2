@echo off
REM AlgoTrendy Localhost CLI - Quick Install Script
REM Run as Administrator for system-wide PATH, or as user for user-only PATH

echo.
echo ============================================
echo AlgoTrendy Localhost CLI - Installation
echo ============================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python 3 is not installed
    echo Please install Python from: https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation
    pause
    exit /b 1
)

echo [1/4] Python detected:
python --version
echo.

REM Check if SSH is installed
ssh -V >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] OpenSSH client not found
    echo.
    echo To install OpenSSH Client on Windows:
    echo   1. Open PowerShell as Administrator
    echo   2. Run: Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
    echo.
    echo Continue anyway? (You'll need SSH later^)
    pause
)

echo [2/4] Installing Python dependencies...
pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)
echo.

echo [3/4] Adding to PATH...
echo.
echo Choose installation type:
echo   [1] User PATH (recommended, no admin required^)
echo   [2] System PATH (all users, requires admin^)
echo   [3] Skip PATH (I'll add it manually^)
echo.
set /p CHOICE="Enter choice (1-3): "

if "%CHOICE%"=="1" (
    echo Adding to User PATH...
    powershell -Command "$userPath = [Environment]::GetEnvironmentVariable('Path', 'User'); $newPath = '%~dp0'; if ($userPath -notlike '*'+$newPath+'*') { [Environment]::SetEnvironmentVariable('Path', \"$userPath;$newPath\", 'User'); Write-Host 'Added to User PATH' } else { Write-Host 'Already in PATH' }"
) else if "%CHOICE%"=="2" (
    echo Adding to System PATH (requires admin^)...
    powershell -Command "Start-Process powershell -ArgumentList '-Command', `\"$systemPath = [Environment]::GetEnvironmentVariable('Path', 'Machine'); $newPath = '%~dp0'; if ($systemPath -notlike '*'+$newPath+'*') { [Environment]::SetEnvironmentVariable('Path', \"\"$systemPath;$newPath\"\", 'Machine'); Write-Host 'Added to System PATH' } else { Write-Host 'Already in PATH' }`\" -Verb RunAs -Wait"
) else (
    echo Skipped PATH configuration
    echo You'll need to run: %~dp0algotrendy.bat up
)
echo.

echo [4/4] Verifying installation...
echo.

REM Test SSH access to VPS
echo Testing VPS connectivity...
ssh -o ConnectTimeout=5 algotrendy echo OK >nul 2>&1
if %ERRORLEVEL% EQ 0 (
    echo [PASS] VPS SSH access working
) else (
    echo [WARN] Could not reach VPS via SSH
    echo.
    echo Make sure ~/.ssh/config contains:
    echo   Host algotrendy
    echo       HostName ^<your-vps-ip^>
    echo       User root
    echo       IdentityFile ~/.ssh/id_ed25519
    echo.
)
echo.

echo ============================================
echo Installation Complete!
echo ============================================
echo.
echo Next steps:
echo   1. IMPORTANT: Close and reopen your terminal for PATH changes
echo   2. Run: algotrendy up
echo   3. Dashboard will open at http://localhost:3000
echo.
echo Documentation:
echo   - README.md              - Quick reference
echo   - LOCALHOST_RUNBOOK.md   - Detailed guide
echo   - vps_scripts/README.md  - VPS deployment
echo.
pause

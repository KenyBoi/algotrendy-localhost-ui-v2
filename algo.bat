@echo off
REM AlgoTrendy Localhost CLI Wrapper
REM Usage: algo up [--verbose]

setlocal

REM Get the directory where this script is located
set SCRIPT_DIR=%~dp0

REM Check if Python 3 is available
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Error: Python 3 is not installed or not in PATH
    echo Please install Python 3: https://www.python.org/downloads/
    exit /b 1
)

REM Check command
if "%1"=="" (
    echo Usage: algo up [--verbose]
    echo.
    echo Commands:
    echo   up         Start AlgoTrendy localhost stack
    echo   up -v      Start with verbose output
    exit /b 0
)

if "%1"=="up" (
    REM Run the Python CLI
    python "%SCRIPT_DIR%algotrendy_up.py" %*
    exit /b %ERRORLEVEL%
)

echo Unknown command: %1
echo Run 'algo' for usage
exit /b 1

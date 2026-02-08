@echo off
echo ======================================
echo Pomodoroom Desktop - Start Script
echo ======================================
echo.

cd /d "%~dp0"

echo Current directory: %CD%
echo.

echo Checking for existing processes...
tasklist | findstr pomodoroom-desktop.exe >nul
if %errorlevel% equ 0 (
    echo Found existing pomodoroom-desktop.exe process, killing...
    taskkill /F /IM pomodoroom-desktop.exe >nul 2>&1
    timeout /t 2 /nobreak >nul
)

echo.
echo Starting Vite dev server (port 1420)...
start cmd /k "npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo Starting Tauri desktop app...
npm run tauri:dev

echo.
echo If window doesn't appear, run: check_window_pos.ps1
pause

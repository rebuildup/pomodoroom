@echo off
cd /d C:\Users\rebui\Desktop\pomodoroom-desktop
echo Starting Tauri dev...
cargo tauri dev
echo Tauri dev exited with code %errorlevel%
pause

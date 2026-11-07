@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Digital Twin Monitor
echo ==============================================
echo   数字孪生 · 本地监控中枢  Starting...
echo ==============================================
start "DigitalTwin-Monitor" cmd /min /c "node server.js"
timeout /t 2 /nobreak >nul
start "" http://localhost:3210
echo Monitor started at http://localhost:3210
echo (Close the minimized window to stop the service)

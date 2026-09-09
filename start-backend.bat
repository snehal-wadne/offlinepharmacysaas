@echo off
title Pharmacy SaaS - Backend Server
color 0A
echo ================================================================
echo   PHARMACY SAAS OFFLINE BACKEND SERVER
echo ================================================================
echo.
cd /d "%~dp0backend"

echo Checking Node.js installation...
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js is not found in PATH!
    echo Please install Node.js from https://nodejs.org or restart CMD.
    echo.
    pause
    exit /b 1
)

echo Starting backend on http://localhost:5000 ...
echo (Press Ctrl + C anytime to stop the server)
echo.
node src/server.js
if %errorlevel% neq 0 (
    echo.
    color 0C
    echo [ERROR] Backend stopped unexpectedly.
)
echo.
pause

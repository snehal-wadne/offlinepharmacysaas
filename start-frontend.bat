@echo off
title Pharmacy SaaS - Frontend (Expo Web)
color 0B
echo ================================================================
echo   PHARMACY SAAS FRONTEND (EXPO WEB)
echo ================================================================
echo.
cd /d "%~dp0frontend"

echo Checking Node.js installation...
where npx >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js / npx is not found in PATH!
    echo Please install Node.js from https://nodejs.org or restart CMD.
    echo.
    pause
    exit /b 1
)

echo Starting Expo Web on http://localhost:8081 ...
echo (Keep this window open while testing in browser)
echo.
npx expo start --web --port 8081
if %errorlevel% neq 0 (
    echo.
    color 0C
    echo [ERROR] Frontend stopped unexpectedly.
)
echo.
pause

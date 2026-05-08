@echo off
title Office Management — Stop Servers
color 0C

echo.
echo  ============================================
echo    Stopping Office Management Servers...
echo  ============================================
echo.

echo  Killing processes on port 5000 (API)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
    echo    Stopped PID %%a
)

echo  Killing processes on port 3000 (React)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
    echo    Stopped PID %%a
)

echo.
echo  All servers stopped.
echo  Press any key to close.
pause >nul

@echo off
title Office Management — Server Launcher
color 0A

echo.
echo  ============================================
echo    Office Management System — Starting...
echo  ============================================
echo.

:: ── Backend Server ──────────────────────────────────────────────────────────
echo  [1/2] Starting Backend API  (port 5000)...
start "API Server — port 5000" cmd /k "cd /d "D:\softwares\New software\server" && color 0B && title API Server (port 5000) && echo. && echo  Backend server starting... && echo. && npx ts-node src/index.ts"

:: Short pause so the first window opens cleanly
timeout /t 2 /nobreak >nul

:: ── Frontend Client ──────────────────────────────────────────────────────────
echo  [2/2] Starting Frontend App  (port 3000)...
start "React App — port 3000" cmd /k "cd /d "D:\softwares\New software\client" && color 0E && title React App (port 3000) && echo. && echo  React dev server starting... && echo. && npm start"

echo.
echo  ============================================
echo   Both servers launched in separate windows.
echo   Opening browser in 12 seconds...
echo  ============================================
echo.

timeout /t 12 /nobreak >nul
start http://localhost:3000

echo  Done!  Press any key to close this window.
pause >nul

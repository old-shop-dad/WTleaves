@echo off
title StudyDesk Launcher
cd /d "%~dp0"

echo ============================================
echo   StudyDesk is starting...
echo   Auto open http://localhost:31251/
echo   Close this window to stop the server
echo ============================================
echo.

if not exist node_modules (
  echo First run: installing dependencies...
  call npm install
)

start "" "http://localhost:31251/"
call npm run dev -- --port 31251

echo.
echo Server stopped. Closing in 2 seconds...
timeout /t 2 >nul
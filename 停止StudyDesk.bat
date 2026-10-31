@echo off
title StudyDesk Stopper
echo Stopping StudyDesk server...
powershell -NoProfile -Command " = Get-NetTCPConnection -LocalPort 31251 -ErrorAction SilentlyContinue; if () { Stop-Process -Id .OwningProcess -Force; Write-Host 'Server stopped' } else { Write-Host 'Server is not running' }"
timeout /t 2 >nul
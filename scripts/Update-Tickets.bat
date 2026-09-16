@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1"
echo.
echo [INFO] Test execution finished. 
echo Press any key to close this terminal...
pause > nul

@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1" %*
set "MOTI_EXIT=%ERRORLEVEL%"
if not "%MOTI_EXIT%"=="0" echo Moti setup failed. See the error above.
pause
exit /b %MOTI_EXIT%

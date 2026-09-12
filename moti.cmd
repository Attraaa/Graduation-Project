@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\moti.ps1" %*
set "MOTI_EXIT=%ERRORLEVEL%"
if not "%MOTI_EXIT%"=="0" echo Moti failed. See the error above.
if "%~1"=="" pause
exit /b %MOTI_EXIT%

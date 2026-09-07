@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\moti.ps1" %*
exit /b %ERRORLEVEL%

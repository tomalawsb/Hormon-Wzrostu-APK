@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0WYSYLAJ_NA_GITHUB.ps1"
set "UPLOAD_EXIT=%ERRORLEVEL%"
if /I not "%~1"=="--no-pause" pause
exit /b %UPLOAD_EXIT%

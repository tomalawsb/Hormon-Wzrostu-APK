@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
set /p "VERSION_NAME=Nowa wersja X.Y.Z: "
set /p "VERSION_CODE=Nowy rosnacy versionCode: "
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0BUDUJ.ps1" -SetVersion "%VERSION_NAME%" -VersionCode "%VERSION_CODE%"
exit /b %ERRORLEVEL%

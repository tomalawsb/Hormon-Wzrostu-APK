@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem Podglad aplikacji webowej w przegladarce (lokalny serwer Node, tylko ten komputer).
rem Opcja: URUCHOM.cmd -Port 9000
chcp 65001 >nul
cd /d "%~dp0"
echo Przygotowanie podgladu aplikacji...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\dzienniczek.ps1" -Action Serve %*
set "DH_EXIT=%ERRORLEVEL%"
if not "%DH_EXIT%"=="0" (
  echo.
  echo BLAD: nie udalo sie uruchomic podgladu. Sprawdz komunikat powyzej.
  if not defined DH_NO_PAUSE pause
)
exit /b %DH_EXIT%

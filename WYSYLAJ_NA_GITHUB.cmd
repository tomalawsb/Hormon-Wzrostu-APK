@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem Wysyla zrodla do https://github.com/tomalawsb/Hormon-Wzrostu-APK (galaz main).
rem GitHub Actions buduje wtedy APK/AAB i publikuje je w Releases.
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\dzienniczek.ps1" -Action Publish %*
set "DH_EXIT=%ERRORLEVEL%"
if not "%DH_EXIT%"=="0" echo BLAD: wysylanie nie powiodlo sie.
if not defined DH_NO_PAUSE pause
exit /b %DH_EXIT%

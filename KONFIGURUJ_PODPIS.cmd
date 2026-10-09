@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem Tworzy lub importuje klucz podpisu wydania (zapis poza projektem, w %LOCALAPPDATA%).
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\dzienniczek.ps1" -Action Sign %*
set "DH_EXIT=%ERRORLEVEL%"
if not "%DH_EXIT%"=="0" echo BLAD: konfiguracja podpisu nie powiodla sie.
if not defined DH_NO_PAUSE pause
exit /b %DH_EXIT%

@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0KONFIGURUJ_PODPIS.ps1"
if errorlevel 1 (
  echo.
  echo BLAD: Konfiguracja podpisu nie powiodla sie.
  pause
  exit /b 1
)
pause

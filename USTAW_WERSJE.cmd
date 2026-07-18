@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul || (
  echo BLAD: Nie znaleziono Node.js.
  pause
  exit /b 1
)

set /p "VERSION_NAME=Podaj nowa wersje w formacie X.Y.Z, np. 1.0.5: "
set /p "VERSION_CODE=Podaj rosnacy versionCode, np. 3906: "
node tools\run_python.js tools\set_version.py "%VERSION_NAME%" "%VERSION_CODE%"
if errorlevel 1 (
  pause
  exit /b 1
)

call npm run prepare:web
if errorlevel 1 (
  echo BLAD: Nie udalo sie zsynchronizowac plikow wersji.
  pause
  exit /b 1
)

call npm test
if errorlevel 1 (
  echo BLAD: Test po zmianie wersji nie powiodl sie.
  pause
  exit /b 1
)

echo.
echo Wersja zostala ustawiona i sprawdzona.
echo Po wyslaniu na galaz main GitHub sam utworzy wydanie v%VERSION_NAME%.
pause

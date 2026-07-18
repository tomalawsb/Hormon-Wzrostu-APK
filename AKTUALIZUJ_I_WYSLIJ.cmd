@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

echo ==================================================
echo  DZIENNICZEK HORMONU - AKTUALIZACJA I GITHUB
echo ==================================================
echo.

for %%C in (node npm git) do (
  where %%C >nul 2>nul || (
    echo BLAD: Nie znaleziono programu %%C.
    echo Zainstaluj Node.js i Git for Windows.
    pause
    exit /b 1
  )
)

set "CURRENT_VERSION="
set "CURRENT_CODE="
for /f "tokens=1,2 delims==" %%A in (android\version.properties) do (
  if /I "%%A"=="VERSION_NAME" set "CURRENT_VERSION=%%B"
  if /I "%%A"=="VERSION_CODE" set "CURRENT_CODE=%%B"
)
if not defined CURRENT_VERSION (
  echo BLAD: Nie odczytano VERSION_NAME.
  pause
  exit /b 1
)
if not defined CURRENT_CODE (
  echo BLAD: Nie odczytano VERSION_CODE.
  pause
  exit /b 1
)

set "REPO=https://github.com/tomalawsb/Hormon-Wzrostu-APK.git"
set "TAGS_FILE=%TEMP%\hormon-wzrostu-tags.txt"
git ls-remote --tags "%REPO%" > "%TAGS_FILE%"
if errorlevel 1 (
  echo BLAD: Nie udalo sie sprawdzic wersji na GitHubie.
  del /q "%TAGS_FILE%" 2>nul
  pause
  exit /b 1
)

findstr /R /C:"refs/tags/v%CURRENT_VERSION%$" "%TAGS_FILE%" >nul
if not errorlevel 1 (
  for /f "tokens=1-3 delims=." %%A in ("%CURRENT_VERSION%") do (
    set /a NEXT_PATCH=%%C+1
    set "NEXT_VERSION=%%A.%%B.!NEXT_PATCH!"
  )
  set /a NEXT_CODE=%CURRENT_CODE%+1
  echo Wersja %CURRENT_VERSION% jest juz wydana.
  echo Ustawiam automatycznie !NEXT_VERSION! / versionCode !NEXT_CODE!.
  node tools\run_python.js tools\set_version.py "!NEXT_VERSION!" "!NEXT_CODE!"
  if errorlevel 1 goto ERROR
) else (
  echo Wersja %CURRENT_VERSION% nie jest jeszcze wydana - pozostaje bez zmian.
)
del /q "%TAGS_FILE%" 2>nul

echo.
echo Instalowanie zaleznosci...
call npm ci --no-audit --no-fund
if errorlevel 1 goto ERROR

echo.
echo Budowanie kompletnej aplikacji i wersji internetowej...
call npm run prepare:web
if errorlevel 1 goto ERROR

echo.
echo Uruchamianie testow...
call npm test
if errorlevel 1 goto ERROR

echo.
echo Wysylanie na GitHub...
call WYSYLAJ_NA_GITHUB.cmd --no-pause
if errorlevel 1 goto ERROR

echo.
echo GOTOWE.
echo GitHub buduje teraz podpisane APK i publikuje nowa wersje.
echo Sprawdz: https://github.com/tomalawsb/Hormon-Wzrostu-APK/actions
pause
exit /b 0

:ERROR
echo.
echo BLAD: Aktualizacja nie zostala wyslana.
pause
exit /b 1

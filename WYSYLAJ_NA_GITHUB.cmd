@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
set "NO_PAUSE="
if /I "%~1"=="--no-pause" set "NO_PAUSE=1"

where git >nul 2>nul || (
  echo BLAD: Nie znaleziono programu Git. Zainstaluj Git for Windows.
  if not defined NO_PAUSE pause
  exit /b 1
)

set "REPO=https://github.com/tomalawsb/Hormon-Wzrostu-APK.git"
set "TEMP_REPO=%TEMP%\Hormon-Wzrostu-APK-upload"
for %%I in ("%~dp0.") do set "SOURCE=%%~fI"

if exist "%TEMP_REPO%" rmdir /s /q "%TEMP_REPO%"
git clone "%REPO%" "%TEMP_REPO%"
if errorlevel 1 (
  echo BLAD: Nie udalo sie pobrac repozytorium.
  if not defined NO_PAUSE pause
  exit /b 1
)

echo.
echo Czyszczenie kopii repozytorium...
for /f "delims=" %%I in ('dir /a /b "%TEMP_REPO%"') do (
  if /I not "%%I"==".git" (
    if exist "%TEMP_REPO%\%%I\" (
      rmdir /s /q "%TEMP_REPO%\%%I"
    ) else (
      del /f /q "%TEMP_REPO%\%%I" 2>nul
    )
  )
)

echo Kopiowanie projektu z:
echo %SOURCE%
echo.
robocopy "%SOURCE%" "%TEMP_REPO%" /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /XJ /XD .git node_modules www dist GOTOWE_APK .gradle build /XF *.apk *.aab *.zip *.sha256 *.sha256.txt GITHUB_SECRETS_DO_WKLEJENIA.txt desktop.ini Thumbs.db
set "ROBOCOPY_CODE=%ERRORLEVEL%"
if %ROBOCOPY_CODE% GEQ 8 (
  echo.
  echo BLAD: Nie udalo sie skopiowac projektu. Kod Robocopy: %ROBOCOPY_CODE%
  if not defined NO_PAUSE pause
  exit /b 1
)

pushd "%TEMP_REPO%"
git add -A
git diff --cached --quiet
if not errorlevel 1 (
  echo.
  echo Brak zmian do wyslania.
  popd
  if not defined NO_PAUSE pause
  exit /b 0
)

git commit -m "Dzienniczek Hormonu - aktualizacja"
if errorlevel 1 goto PUSH_ERROR
git push origin main
if errorlevel 1 goto PUSH_ERROR
popd

echo.
echo Gotowe. Projekt zostal wyslany do:
echo https://github.com/tomalawsb/Hormon-Wzrostu-APK
if not defined NO_PAUSE pause
exit /b 0

:PUSH_ERROR
popd
echo.
echo BLAD: Wysylanie nie powiodlo sie. Sprawdz logowanie GitHub i polaczenie z internetem.
if not defined NO_PAUSE pause
exit /b 1

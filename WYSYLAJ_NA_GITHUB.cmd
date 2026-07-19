@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
set "NO_PAUSE="
if /I "%~1"=="--no-pause" set "NO_PAUSE=1"

where git >nul 2>nul || (
  echo BLAD: Nie znaleziono programu Git. Zainstaluj Git for Windows.
  if not defined NO_PAUSE pause
  exit /b 1
)

set "REPO=https://github.com/tomalawsb/Hormon-Wzrostu-APK.git"
set "TEMP_REPO=%TEMP%\Hormon-Wzrostu-APK-upload-%RANDOM%-%RANDOM%"
for %%I in ("%~dp0.") do set "SOURCE=%%~fI"

if exist "%TEMP_REPO%" rmdir /s /q "%TEMP_REPO%" >nul 2>nul
git clone --branch main --single-branch "%REPO%" "%TEMP_REPO%"
if errorlevel 1 (
  echo BLAD: Nie udalo sie pobrac repozytorium.
  if not defined NO_PAUSE pause
  exit /b 1
)

echo.
echo Przygotowanie aktualnej zawartosci repozytorium...
for /f "delims=" %%I in ('dir /a /b "%TEMP_REPO%"') do (
  if /I not "%%I"==".git" (
    if exist "%TEMP_REPO%\%%I\" (
      rmdir /s /q "%TEMP_REPO%\%%I"
    ) else (
      del /f /q "%TEMP_REPO%\%%I" 2>nul
    )
  )
)

robocopy "%SOURCE%" "%TEMP_REPO%" /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /XJ /XD .git node_modules www dist GOTOWE_APK .gradle build /XF *.apk *.aab *.zip *.sha256 *.sha256.txt GITHUB_SECRETS_DO_WKLEJENIA.txt desktop.ini Thumbs.db >nul
set "ROBOCOPY_CODE=%ERRORLEVEL%"
if %ROBOCOPY_CODE% GEQ 8 goto COPY_ERROR

pushd "%TEMP_REPO%"
git add -A
git diff --cached --quiet
if not errorlevel 1 (
  echo.
  echo Brak zmian do wyslania.
  popd
  call :CLEAN_TEMP
  if not defined NO_PAUSE pause
  exit /b 2
)

set "COMMIT_MESSAGE=Dzienniczek Hormonu - aktualizacja"
if defined NEW_VERSION set "COMMIT_MESSAGE=Dzienniczek Hormonu - wersja %NEW_VERSION%"
git commit -m "%COMMIT_MESSAGE%"
if errorlevel 1 goto PUSH_ERROR
git push origin main
if errorlevel 1 goto PUSH_ERROR
popd
call :CLEAN_TEMP

echo.
echo Gotowe. Projekt zostal wyslany do:
echo https://github.com/tomalawsb/Hormon-Wzrostu-APK
if not defined NO_PAUSE pause
exit /b 0

:COPY_ERROR
call :CLEAN_TEMP
echo.
echo BLAD: Nie udalo sie przygotowac plikow do wyslania. Kod Robocopy: %ROBOCOPY_CODE%
if not defined NO_PAUSE pause
exit /b 1

:PUSH_ERROR
popd
call :CLEAN_TEMP
echo.
echo BLAD: Wysylanie nie powiodlo sie. Sprawdz logowanie GitHub i polaczenie z internetem.
if not defined NO_PAUSE pause
exit /b 1

:CLEAN_TEMP
if exist "%TEMP_REPO%" rmdir /s /q "%TEMP_REPO%" >nul 2>nul
exit /b 0

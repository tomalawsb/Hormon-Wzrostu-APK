@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
title Dzienniczek Hormonu - aktualizacja GitHub

set "SOURCE=%CD%"
set "WORK_DIR=%TEMP%\DzienniczekHormonu-build-%RANDOM%-%RANDOM%"
set "COPY_EXCLUDES=/XD .git node_modules www dist GOTOWE_APK .gradle build /XF *.apk *.aab *.zip *.sha256 *.sha256.txt GITHUB_SECRETS_DO_WKLEJENIA.txt desktop.ini Thumbs.db"

echo ==================================================
echo  DZIENNICZEK HORMONU - AKTUALIZACJA I GITHUB
echo ==================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto MISSING_NODE
where npm >nul 2>nul
if errorlevel 1 goto MISSING_NPM
where git >nul 2>nul
if errorlevel 1 goto MISSING_GIT
where powershell.exe >nul 2>nul
if errorlevel 1 goto MISSING_POWERSHELL
where robocopy.exe >nul 2>nul
if errorlevel 1 goto MISSING_ROBOCOPY

if not exist "%SOURCE%\package.json" goto MISSING_PROJECT
if not exist "%SOURCE%\package-lock.json" goto MISSING_LOCK
if not exist "%SOURCE%\tools\set_version.py" goto MISSING_PROJECT
if not exist "%SOURCE%\WYSYLAJ_NA_GITHUB.cmd" goto MISSING_SEND_SCRIPT

set "STAMP="
for /f "delims=" %%I in ('powershell.exe -NoLogo -NoProfile -NonInteractive -Command "Get-Date -Format ddMMyyHHmm"') do set "STAMP=%%I"
if not defined STAMP goto DATE_ERROR
set "NEW_VERSION=2.0-%STAMP%"

echo Tworzenie czystej kopii roboczej w katalogu tymczasowym...
mkdir "%WORK_DIR%" >nul 2>nul
robocopy "%SOURCE%" "%WORK_DIR%" /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /XJ %COPY_EXCLUDES% >nul
set "ROBOCOPY_CODE=%ERRORLEVEL%"
if %ROBOCOPY_CODE% GEQ 8 goto COPY_TO_WORK_ERROR

pushd "%WORK_DIR%"

echo.
echo Instalowanie zaleznosci...
call npm ci --no-audit --no-fund
if errorlevel 1 goto NPM_ERROR_IN_WORK

if not exist "node_modules\.bin\esbuild.cmd" goto DEPENDENCY_MISSING_IN_WORK
if not exist "node_modules\.bin\eslint.cmd" goto DEPENDENCY_MISSING_IN_WORK
if not exist "node_modules\.bin\prettier.cmd" goto DEPENDENCY_MISSING_IN_WORK

set "CURRENT_CODE=0"
for /f "tokens=2 delims==" %%I in ('findstr /B /C:"VERSION_CODE=" "android\version.properties" 2^>nul') do set "CURRENT_CODE=%%I"
set /a NEW_CODE=%CURRENT_CODE%+1 >nul 2>nul
if errorlevel 1 goto VERSION_CODE_ERROR_IN_WORK
if %NEW_CODE% LEQ %CURRENT_CODE% goto VERSION_CODE_ERROR_IN_WORK

echo.
echo Ustawianie wersji %NEW_VERSION% ^(versionCode %NEW_CODE%^)...
node tools\run_python.js tools\set_version.py "%NEW_VERSION%" "%NEW_CODE%"
if errorlevel 1 goto UPDATE_ERROR_IN_WORK

echo.
echo Formatowanie, budowanie i uruchamianie wszystkich testow...
call npm run release:prepare
if errorlevel 1 goto TEST_ERROR_IN_WORK

popd

echo.
echo Kopiowanie sprawdzonych zmian do glownego katalogu...
robocopy "%WORK_DIR%" "%SOURCE%" /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /XJ %COPY_EXCLUDES% >nul
set "ROBOCOPY_CODE=%ERRORLEVEL%"
if %ROBOCOPY_CODE% GEQ 8 goto COPY_BACK_ERROR

echo.
echo Wysylanie wersji %NEW_VERSION% na GitHub...
call "%SOURCE%\WYSYLAJ_NA_GITHUB.cmd" --no-pause
set "SEND_CODE=%ERRORLEVEL%"
if "%SEND_CODE%"=="2" goto NO_CHANGES
if not "%SEND_CODE%"=="0" goto SEND_ERROR

call :CLEAN_WORK

echo.
echo ==================================================
echo  GOTOWE
echo ==================================================
echo Wersja %NEW_VERSION% zostala wyslana na GitHub.
echo GitHub Actions buduje teraz PWA, APK, AAB i nowe Release.
echo.
echo Sprawdz postep:
echo https://github.com/tomalawsb/Hormon-Wzrostu-APK/actions
echo.
pause
exit /b 0

:NPM_ERROR_IN_WORK
popd
call :CLEAN_WORK
echo.
echo BLAD: npm ci nie zainstalowal zaleznosci.
echo Sprawdz polaczenie z internetem oraz dzialanie Node.js i npm.
goto FAIL

:DEPENDENCY_MISSING_IN_WORK
popd
call :CLEAN_WORK
echo.
echo BLAD: Instalacja npm jest niekompletna.
goto FAIL

:VERSION_CODE_ERROR_IN_WORK
popd
call :CLEAN_WORK
goto VERSION_CODE_ERROR

:UPDATE_ERROR_IN_WORK
popd
call :CLEAN_WORK
goto UPDATE_ERROR

:TEST_ERROR_IN_WORK
popd
call :CLEAN_WORK
echo.
echo BLAD: Formatowanie, budowanie lub testy nie przeszly.
echo Nic nie zostalo skopiowane do projektu ani wyslane na GitHub.
goto FAIL

:COPY_TO_WORK_ERROR
echo BLAD: Nie udalo sie utworzyc czystej kopii roboczej.
call :CLEAN_WORK
goto FAIL

:COPY_BACK_ERROR
echo BLAD: Nie udalo sie skopiowac sprawdzonych zmian do projektu.
call :CLEAN_WORK
goto FAIL

:NO_CHANGES
call :CLEAN_WORK
echo.
echo NIE WYSLANO: Git nie wykryl nowych zmian.
echo Release nie zostal utworzony.
echo.
pause
exit /b 2

:MISSING_NODE
echo BLAD: Nie znaleziono Node.js. Zainstaluj Node.js LTS.
goto FAIL

:MISSING_NPM
echo BLAD: Nie znaleziono npm. Napraw lub ponownie zainstaluj Node.js LTS.
goto FAIL

:MISSING_GIT
echo BLAD: Nie znaleziono Git. Zainstaluj Git for Windows.
goto FAIL

:MISSING_POWERSHELL
echo BLAD: Nie znaleziono Windows PowerShell.
goto FAIL

:MISSING_ROBOCOPY
echo BLAD: Nie znaleziono programu Robocopy.
goto FAIL

:MISSING_PROJECT
echo BLAD: Brakuje plikow projektu. Uruchom BAT z glownego katalogu programu.
goto FAIL

:MISSING_LOCK
echo BLAD: Brakuje package-lock.json.
goto FAIL

:MISSING_SEND_SCRIPT
echo BLAD: Brakuje pliku WYSYLAJ_NA_GITHUB.cmd.
goto FAIL

:DATE_ERROR
echo BLAD: Nie udalo sie odczytac daty i godziny systemowej.
goto FAIL

:VERSION_CODE_ERROR
echo BLAD: Nie udalo sie wyliczyc nowego Android versionCode.
goto FAIL

:UPDATE_ERROR
echo BLAD: Nie udalo sie ustawic numeru wersji.
goto FAIL

:SEND_ERROR
call :CLEAN_WORK
echo BLAD: Wysylanie na GitHub nie powiodlo sie.
goto FAIL

:FAIL
echo.
echo Aktualizacja zostala przerwana.
echo Przeczytaj komunikat bledu powyzej.
echo.
pause
exit /b 1

:CLEAN_WORK
if defined WORK_DIR if exist "%WORK_DIR%" rmdir /s /q "%WORK_DIR%" >nul 2>nul
exit /b 0

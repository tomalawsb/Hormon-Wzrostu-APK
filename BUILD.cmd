@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem Buduje aplikacje Android (APK + AAB) z folderu, w ktorym lezy ten plik.
rem Narzedzia, cache, logi i pliki robocze: D:\Users\Admin\Srodowiska (poza projektem).
rem Wynik: DzienniczekHormonu-WERSJA.apk i .aab obok tego pliku.
rem Opcje, np.: BUILD.cmd -SetVersion 2.3.4 -VersionCode 2009002305
rem             BUILD.cmd -Action Check   (tylko testy i APK debug)
chcp 65001 >nul
cd /d "%~dp0"
echo Budowanie Dzienniczka Hormonu...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\dzienniczek.ps1" %*
set "DH_EXIT=%ERRORLEVEL%"
echo.
if "%DH_EXIT%"=="0" (
  echo GOTOWE. Pliki APK/AAB sa obok BUILD.cmd.
  echo Jesli jest tylko plik -debug.apk: brak podpisu wydania - uruchom KONFIGURUJ_PODPIS.cmd.
) else (
  echo BLAD: budowanie nie powiodlo sie. Sprawdz komunikat i dziennik powyzej.
)
if not defined DH_NO_PAUSE pause
exit /b %DH_EXIT%

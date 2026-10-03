@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
echo Budowanie i kontrola wersji zapisanej w projekcie...
call "%~dp0BUDUJ.cmd"
if errorlevel 1 exit /b 1
echo Wysylanie sprawdzonych zrodel do skonfigurowanego repozytorium...
call "%~dp0WYSYLAJ_NA_GITHUB.cmd" --no-pause
exit /b %ERRORLEVEL%

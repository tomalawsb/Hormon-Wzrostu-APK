@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Dzienniczek Hormonu Wzrostu 2.7 - tworzenie APK

cd /d "%~dp0"

echo.
echo ================================================
echo   DZIENNICZEK HORMONU WZROSTU 2.7
echo   AUTOMATYCZNE TWORZENIE APK
echo ================================================
echo.

rem ==================================================
rem 1. JAVA - automatyczne wykrywanie
rem ==================================================
where java >nul 2>&1
if not errorlevel 1 goto JAVA_OK

if exist "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" (
    set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
    goto SET_JAVA_PATH
)
if exist "D:\Users\Admin\Inne\Android Studio\jbr\bin\java.exe" (
    set "JAVA_HOME=D:\Users\Admin\Inne\Android Studio\jbr"
    goto SET_JAVA_PATH
)
if exist "D:\Program Files\Android\Android Studio\jbr\bin\java.exe" (
    set "JAVA_HOME=D:\Program Files\Android\Android Studio\jbr"
    goto SET_JAVA_PATH
)
if exist "E:\Programy\Programowanie_programy\Android Studio\jbr\bin\java.exe" (
    set "JAVA_HOME=E:\Programy\Programowanie_programy\Android Studio\jbr"
    goto SET_JAVA_PATH
)

echo BLAD: Nie znaleziono Java ani srodowiska Android Studio.
pause
exit /b 1

:SET_JAVA_PATH
set "PATH=%JAVA_HOME%\bin;%PATH%"

:JAVA_OK
java -version
if errorlevel 1 (
    echo.
    echo BLAD: Java nie uruchomila sie poprawnie.
    pause
    exit /b 1
)

rem ==================================================
rem 2. ANDROID SDK - automatyczne wykrywanie
rem ==================================================
set "SDK_DIR="

if exist "android\local.properties" (
    for /f "usebackq tokens=1,* delims==" %%A in ("android\local.properties") do (
        if /i "%%A"=="sdk.dir" set "SDK_DIR=%%B"
    )
)

if defined SDK_DIR (
    set "SDK_DIR=!SDK_DIR:\:=:!"
    set "SDK_DIR=!SDK_DIR:\\=\!"
    set "SDK_DIR=!SDK_DIR:/=\!"
)

if not defined SDK_DIR if defined ANDROID_SDK_ROOT set "SDK_DIR=%ANDROID_SDK_ROOT%"
if not defined SDK_DIR if defined ANDROID_HOME set "SDK_DIR=%ANDROID_HOME%"
if not defined SDK_DIR if exist "%LOCALAPPDATA%\Android\Sdk" set "SDK_DIR=%LOCALAPPDATA%\Android\Sdk"
if not defined SDK_DIR if exist "E:\Programy\Programowanie_programy\Android_SDK" set "SDK_DIR=E:\Programy\Programowanie_programy\Android_SDK"

if not defined SDK_DIR (
    echo.
    echo BLAD: Nie znaleziono Android SDK.
    pause
    exit /b 1
)

if not exist "!SDK_DIR!" (
    echo.
    echo BLAD: Katalog Android SDK nie istnieje:
    echo !SDK_DIR!
    pause
    exit /b 1
)

set "SDK_PROP=!SDK_DIR:\=/!"
> "android\local.properties" echo sdk.dir=!SDK_PROP!

echo.
echo Android SDK: !SDK_DIR!

rem ==================================================
rem 3. BUDOWANIE APK - bez npm i bez Android Studio
rem ==================================================
if not exist "android\gradlew.bat" (
    echo.
    echo BLAD: Brak android\gradlew.bat.
    pause
    exit /b 1
)

pushd "android"

echo.
echo Czyszczenie poprzedniego buildu...
call gradlew.bat clean --no-daemon
if errorlevel 1 goto BUILD_ERROR

echo.
echo Tworzenie pliku APK...
call gradlew.bat assembleDebug --no-daemon
if errorlevel 1 goto BUILD_ERROR

popd

set "APK_SOURCE=%~dp0android\app\build\outputs\apk\debug\app-debug.apk"
set "APK_TARGET=%~dp0Dzienniczek_hormonu_wzrostu_2.7_DEBUG.apk"

if not exist "%APK_SOURCE%" (
    echo.
    echo BLAD: Nie znaleziono utworzonego pliku APK.
    pause
    exit /b 1
)

copy /y "%APK_SOURCE%" "%APK_TARGET%" >nul

echo.
echo ================================================
echo   GOTOWE
echo ================================================
echo APK utworzono tutaj:
echo %APK_TARGET%
echo.
explorer /select,"%APK_TARGET%"
pause
exit /b 0

:BUILD_ERROR
popd
echo.
echo BLAD: Budowanie APK nie powiodlo sie.
pause
exit /b 1

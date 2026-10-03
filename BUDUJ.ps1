[CmdletBinding()]
param(
    [string]$EnvironmentRoot = 'D:\Users\Admin\Środowiska',
    [switch]$WebOnly,
    [switch]$PrepareOnly,
    [string]$SetVersion = "",
    [string]$VersionCode = "",
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$EnvironmentRoot = [IO.Path]::GetFullPath($EnvironmentRoot)
if ($EnvironmentRoot.Equals($projectRoot, [StringComparison]::OrdinalIgnoreCase) -or $EnvironmentRoot.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Katalog środowisk musi znajdować się poza projektem.'
}
New-Item -ItemType Directory -Force -Path $EnvironmentRoot | Out-Null
$downloadRoot = Join-Path $EnvironmentRoot 'Pobrane_instalatory'
New-Item -ItemType Directory -Force -Path $downloadRoot | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Find-Tool([string]$Folder, [string]$File) {
    $root = Join-Path $EnvironmentRoot $Folder
    if (Test-Path -LiteralPath $root) {
        $candidates = @(Get-ChildItem -LiteralPath $root -Recurse -File -Filter $File | Sort-Object FullName -Descending)
        if ($candidates.Count) { return $candidates[0].FullName }
    }
    return $null
}
function Fetch-Zip([string]$Url, [string]$Name, [string]$Destination, [string]$Sha256 = '') {
    $archive = Join-Path $downloadRoot $Name
    if (!(Test-Path -LiteralPath $archive)) { Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $archive }
    if ($Sha256 -and (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $Sha256) {
        throw "Błędna suma kontrolna instalatora: $archive. Usuń ten plik i ponów pobieranie."
    }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Expand-Archive -LiteralPath $archive -DestinationPath $Destination -Force
}

$node = Find-Tool 'NodeJS' 'node.exe'
if ($node) {
    $nodeMajor = [int]((& $node --version).TrimStart('v').Split('.')[0])
    if ($nodeMajor -lt 22) { $node = $null }
}
if (!$node) {
    Write-Host 'Instalowanie wspólnego Node.js 24 LTS...'
    $release = Invoke-RestMethod 'https://nodejs.org/dist/index.json' | Where-Object { $_.version -like 'v24.*' -and $_.lts } | Select-Object -First 1
    if (!$release) { throw 'Nie znaleziono wydania Node.js 24 LTS.' }
    $file = "node-$($release.version)-win-x64.zip"
    $sums = (Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$($release.version)/SHASUMS256.txt").Content
    $checksum = (($sums -split "`n" | Where-Object { $_.Trim().EndsWith($file) }) -split '\s+')[0]
    if (!$checksum) { throw 'Nie znaleziono sumy kontrolnej Node.js.' }
    Fetch-Zip "https://nodejs.org/dist/$($release.version)/$file" $file (Join-Path $EnvironmentRoot 'NodeJS') $checksum
    $node = Find-Tool 'NodeJS' 'node.exe'
}
$python = Find-Tool 'Python' 'python.exe'
if (!$python) {
    Write-Host 'Instalowanie wspólnego Python 3.12 (pakiet osadzalny)...'
    Fetch-Zip 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip' 'python-3.12.10-embed-amd64.zip' (Join-Path $EnvironmentRoot 'Python/python-3.12.10-embed')
    $python = Find-Tool 'Python' 'python.exe'
}
$java = Find-Tool 'JDK_17' 'java.exe'
if (!$java) {
    Write-Host 'Instalowanie wspólnej Javy 17 LTS...'
    $releases = Invoke-RestMethod 'https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'
    $package = $releases[0].binary.package
    Fetch-Zip $package.link $package.name (Join-Path $EnvironmentRoot 'JDK_17') $package.checksum
    $java = Find-Tool 'JDK_17' 'java.exe'
}
if (!$node -or !$python -or !$java) { throw 'Nie udało się przygotować wymaganych narzędzi.' }

$env:JAVA_HOME = Split-Path (Split-Path $java -Parent) -Parent
$env:PATH = (Split-Path $node -Parent) + ';' + (Split-Path $python -Parent) + ';' + (Split-Path $java -Parent) + ';' + $env:PATH
$env:PYTHONUTF8 = '1'
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:GRADLE_USER_HOME = Join-Path $EnvironmentRoot 'Gradle'
$env:ANDROID_HOME = Join-Path $EnvironmentRoot 'Android_SDK'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:ANDROID_USER_HOME = Join-Path $EnvironmentRoot 'Android_User'
$env:npm_config_cache = Join-Path $EnvironmentRoot 'npm-cache'
$env:TEMP = Join-Path $EnvironmentRoot 'DzienniczekHormonu/tmp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null

if (!$WebOnly -and !$PrepareOnly) {
    $sdkmanager = Find-Tool 'Android_SDK/cmdline-tools' 'sdkmanager.bat'
    if (!$sdkmanager) {
        Write-Host 'Instalowanie wspólnych narzędzi Android SDK...'
        $sdkTools = Join-Path $env:ANDROID_HOME 'cmdline-tools/bootstrap'
        Fetch-Zip 'https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip' 'commandlinetools-win-13114758_latest.zip' $sdkTools
        $sdkmanager = Find-Tool 'Android_SDK/cmdline-tools' 'sdkmanager.bat'
    }
    $sdkComponents = @('platform-tools','platforms;android-36','build-tools;36.0.0')
    if (!(Test-Path (Join-Path $env:ANDROID_HOME 'platforms/android-36/android.jar')) -or !(Test-Path (Join-Path $env:ANDROID_HOME 'build-tools/36.0.0/apksigner.bat'))) {
        Write-Host 'Android SDK może poprosić o akceptację licencji wymaganych komponentów.'
        & $sdkmanager "--sdk_root=$($env:ANDROID_HOME)" @sdkComponents
        if ($LASTEXITCODE -ne 0) { throw 'Nie udało się przygotować Android SDK.' }
    }
}
if ($SetVersion) {
    & $python (Join-Path $projectRoot 'tools/set_version.py') $SetVersion $VersionCode
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
$buildArguments = @((Join-Path $projectRoot 'tools/build_project.py'), '--project', $projectRoot, '--environments', $EnvironmentRoot)
if ($WebOnly) { $buildArguments += '--web-only' }
if ($PrepareOnly) { $buildArguments += '--prepare-only' }
if ($CheckOnly) { $buildArguments += '--check-only' }
& $python @buildArguments
exit $LASTEXITCODE

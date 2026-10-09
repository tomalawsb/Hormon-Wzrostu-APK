# Jedyny skrypt pomocniczy projektu. Uruchamiany przez BUILD.cmd, URUCHOM.cmd,
# KONFIGURUJ_PODPIS.cmd i WYSYLAJ_NA_GITHUB.cmd. Zapisany jako UTF-8 z BOM i CRLF.
[CmdletBinding()]
param(
    [ValidateSet('Build', 'Serve', 'Prepare', 'Web', 'Check', 'Sign', 'Publish')]
    [string]$Action = 'Build',
    [string]$EnvironmentRoot = '',
    [int]$Port = 8080,
    [string]$SetVersion = '',
    [string]$VersionCode = '',
    [string]$KeystorePath = '',
    [string]$KeyAlias = 'dzienniczek'
)
$ErrorActionPreference = 'Stop'
try {
    [Console]::OutputEncoding = [Text.Encoding]::UTF8
    [Console]::InputEncoding = [Text.Encoding]::UTF8
} catch { }
$OutputEncoding = [Text.Encoding]::UTF8
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONDONTWRITEBYTECODE = '1'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Katalog projektu = folder nadrzędny względem tools\ (bez sztywnych ścieżek).
$projectRoot = [IO.Path]::GetDirectoryName($PSScriptRoot)
Set-Location -LiteralPath $projectRoot

# Domyślne Środowiska; litera Ś zapisana kodem, aby ścieżka nie zależała od kodowania pliku.
$defaultRoot = 'D:\Users\Admin\' + [char]0x015A + 'rodowiska'
if (!$EnvironmentRoot) {
    if ($env:DH_ENVIRONMENT_ROOT) { $EnvironmentRoot = $env:DH_ENVIRONMENT_ROOT } else { $EnvironmentRoot = $defaultRoot }
}
$EnvironmentRoot = [IO.Path]::GetFullPath($EnvironmentRoot).TrimEnd('\')
$projectPrefix = $projectRoot.TrimEnd('\') + '\'
if ($EnvironmentRoot.Equals($projectRoot.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase) -or
    ($EnvironmentRoot + '\').StartsWith($projectPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Katalog środowisk musi znajdować się poza projektem.'
}
[void][IO.Directory]::CreateDirectory($EnvironmentRoot)

function Test-Ascii([string]$Text) { return -not ($Text -match '[^\x20-\x7E]') }

# Zwraca: $null = brak, '' = zwykły katalog, inaczej pełny cel dowiązania.
function Get-LinkTarget([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if ($null -eq $item) { return $null }
    if ($item.LinkType -ne 'Junction' -and $item.LinkType -ne 'SymbolicLink') { return '' }
    $target = [string](@($item.Target)[0])
    if ($target.StartsWith('\??\')) { $target = $target.Substring(4) }
    return [IO.Path]::GetFullPath($target).TrimEnd('\')
}

function New-Junction([string]$Alias, [string]$Target) {
    try {
        New-Item -ItemType Junction -Path $Alias -Target $Target -ErrorAction Stop | Out-Null
    } catch {
        & cmd.exe /d /c mklink /J "$Alias" "$Target" | Out-Null
    }
}

# Usuwa wyłącznie samo dowiązanie (rmdir), nigdy zawartości celu.
function Remove-Junction([string]$Alias) {
    if ((Get-LinkTarget $Alias)) { & cmd.exe /d /c rmdir "$Alias" | Out-Null }
}

# Gradle, JDK, aapt2 i launcher Pythona na Windows potrafią zepsuć ścieżki z polskimi
# znakami. Pracujemy przez alias ASCII (junction, bez uprawnień administratora);
# dane fizycznie zostają w prawdziwym katalogu Środowisk.
function Get-AsciiRoot([string]$Target) {
    if (Test-Ascii $Target) { return $Target }
    $candidates = @()
    if ($env:DH_ASCII_ALIAS) { $candidates += $env:DH_ASCII_ALIAS }
    $candidates += (Join-Path ([IO.Path]::GetPathRoot($Target)) 'DH_Srodowiska')
    if ($env:SystemDrive) { $candidates += (Join-Path ($env:SystemDrive + '\') 'DH_Srodowiska') }
    foreach ($alias in ($candidates | Select-Object -Unique)) {
        if (!(Test-Ascii $alias)) { continue }
        $existing = Get-LinkTarget $alias
        if ($null -eq $existing) {
            New-Junction $alias $Target
            $existing = Get-LinkTarget $alias
        } elseif ($existing -and !(Test-Path -LiteralPath $existing)) {
            Remove-Junction $alias
            New-Junction $alias $Target
            $existing = Get-LinkTarget $alias
        }
        if ($existing -and $existing.Equals($Target, [StringComparison]::OrdinalIgnoreCase)) {
            Write-Host "Alias ASCII: $alias -> $Target"
            return $alias
        }
    }
    Write-Warning "Nie udało się utworzyć aliasu ASCII dla $Target. Ustaw DH_ASCII_ALIAS na wolną ścieżkę ASCII."
    return $Target
}

$toolsRoot = Get-AsciiRoot $EnvironmentRoot
$env:DH_ENVIRONMENT_ASCII = $toolsRoot
$downloadRoot = Join-Path $toolsRoot 'Pobrane_instalatory'
[void][IO.Directory]::CreateDirectory($downloadRoot)

function Find-Tool([string]$Folder, [string]$File) {
    $root = Join-Path $toolsRoot $Folder
    if (Test-Path -LiteralPath $root) {
        $candidates = @(Get-ChildItem -LiteralPath $root -Recurse -File -Filter $File -ErrorAction SilentlyContinue | Sort-Object FullName -Descending)
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
    [void][IO.Directory]::CreateDirectory($Destination)
    Expand-Archive -LiteralPath $archive -DestinationPath $Destination -Force
}

function Get-PythonInfo([string]$Exe, [string[]]$Prefix = @()) {
    try {
        $lines = @(& $Exe @Prefix -c 'import sys; print(sys.version_info[0]); print(sys.version_info[1]); print(sys.executable)' 2>$null)
        if ($LASTEXITCODE -eq 0 -and $lines.Count -ge 3 -and [int]$lines[0] -eq 3 -and [int]$lines[1] -ge 9) {
            return [string]$lines[2]
        }
    } catch { }
    return $null
}

function Find-Python {
    $shared = Find-Tool 'Python' 'python.exe'
    if ($shared) { $found = Get-PythonInfo $shared; if ($found) { return $found } }
    foreach ($command in @(Get-Command python.exe -All -ErrorAction SilentlyContinue)) {
        if ($command.Source -like '*\WindowsApps\*') { continue }
        $found = Get-PythonInfo $command.Source
        if ($found) { return $found }
    }
    $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($launcher) { $found = Get-PythonInfo $launcher.Source @('-3'); if ($found) { return $found } }
    return $null
}

function Find-Node {
    $candidates = @()
    $shared = Find-Tool 'NodeJS' 'node.exe'
    if ($shared) { $candidates += $shared }
    foreach ($command in @(Get-Command node.exe -All -ErrorAction SilentlyContinue)) { $candidates += $command.Source }
    foreach ($candidate in $candidates) {
        try {
            $major = [int]((& $candidate --version).TrimStart('v').Split('.')[0])
            $npm = Join-Path ([IO.Path]::GetDirectoryName($candidate)) 'npm.cmd'
            if ($major -ge 22 -and (Test-Path -LiteralPath $npm)) { return $candidate }
        } catch { }
    }
    return $null
}

function Initialize-Tools([bool]$NeedJava, [bool]$NeedAndroid) {
    $node = Find-Node
    if (!$node) {
        Write-Host 'Instalowanie wspólnego Node.js 24 LTS...'
        $release = Invoke-RestMethod 'https://nodejs.org/dist/index.json' | Where-Object { $_.version -like 'v24.*' -and $_.lts } | Select-Object -First 1
        if (!$release) { throw 'Nie znaleziono wydania Node.js 24 LTS.' }
        $file = "node-$($release.version)-win-x64.zip"
        $sums = (Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$($release.version)/SHASUMS256.txt").Content
        $checksum = (($sums -split "`n" | Where-Object { $_.Trim().EndsWith($file) }) -split '\s+')[0]
        if (!$checksum) { throw 'Nie znaleziono sumy kontrolnej Node.js.' }
        Fetch-Zip "https://nodejs.org/dist/$($release.version)/$file" $file (Join-Path $toolsRoot 'NodeJS') $checksum
        $node = Find-Node
    }
    $python = Find-Python
    if (!$python) {
        Write-Host 'Instalowanie wspólnego Python 3.12 (pakiet osadzalny)...'
        Fetch-Zip 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip' 'python-3.12.10-embed-amd64.zip' (Join-Path $toolsRoot 'Python\python-3.12.10-embed')
        $python = Find-Python
    }
    $java = Find-Tool 'JDK_17' 'java.exe'
    if (!$java -and $NeedJava) {
        Write-Host 'Instalowanie wspólnej Javy 17 LTS...'
        $releases = Invoke-RestMethod 'https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'
        $package = $releases[0].binary.package
        Fetch-Zip $package.link $package.name (Join-Path $toolsRoot 'JDK_17') $package.checksum
        $java = Find-Tool 'JDK_17' 'java.exe'
    }
    if (!$node -or !$python -or ($NeedJava -and !$java)) { throw 'Nie udało się przygotować wymaganych narzędzi.' }

    $env:PATH = [IO.Path]::GetDirectoryName($node) + ';' + [IO.Path]::GetDirectoryName($python) + ';' + $env:PATH
    if ($java) {
        $env:JAVA_HOME = [IO.Path]::GetDirectoryName([IO.Path]::GetDirectoryName($java))
        $env:PATH = [IO.Path]::GetDirectoryName($java) + ';' + $env:PATH
    }
    $env:DH_PYTHON = $python
    $env:GRADLE_USER_HOME = Join-Path $toolsRoot 'Gradle'
    $env:ANDROID_HOME = Join-Path $toolsRoot 'Android_SDK'
    $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
    $env:ANDROID_USER_HOME = Join-Path $toolsRoot 'Android_User'
    $env:npm_config_cache = Join-Path $toolsRoot 'npm-cache'
    $env:TEMP = Join-Path $toolsRoot 'DzienniczekHormonu\tmp'
    $env:TMP = $env:TEMP
    [void][IO.Directory]::CreateDirectory($env:TEMP)

    if ($NeedAndroid) {
        $sdkmanager = Find-Tool 'Android_SDK\cmdline-tools' 'sdkmanager.bat'
        if (!$sdkmanager) {
            Write-Host 'Instalowanie wspólnych narzędzi Android SDK...'
            Fetch-Zip 'https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip' 'commandlinetools-win-13114758_latest.zip' (Join-Path $env:ANDROID_HOME 'cmdline-tools\bootstrap')
            $sdkmanager = Find-Tool 'Android_SDK\cmdline-tools' 'sdkmanager.bat'
        }
        $platformJar = Join-Path $env:ANDROID_HOME 'platforms\android-36\android.jar'
        $apksigner = Join-Path $env:ANDROID_HOME 'build-tools\36.0.0\apksigner.bat'
        if (!(Test-Path -LiteralPath $platformJar) -or !(Test-Path -LiteralPath $apksigner)) {
            Write-Host 'Android SDK może poprosić o akceptację licencji wymaganych komponentów.'
            # Start-Process: okno licencji SDK musi być widoczne i interaktywne.
            $sdkArguments = '"--sdk_root=' + $env:ANDROID_HOME + '" platform-tools "platforms;android-36" "build-tools;36.0.0"'
            $process = Start-Process -FilePath $sdkmanager -ArgumentList $sdkArguments -NoNewWindow -Wait -PassThru
            if ($process.ExitCode -ne 0) { throw 'Nie udało się przygotować Android SDK.' }
        }
    }
    return $python
}

# Skrypty Pythona dostają ścieżki względne (cwd = projekt) i alias ASCII Środowisk.
function Invoke-Builder([string]$Python, [string[]]$Extra) {
    $arguments = @('tools/build_project.py', '--project', '.', '--environments', $toolsRoot) + $Extra
    & $Python @arguments | Out-Host
    return $LASTEXITCODE
}

function Write-Utf8NoBom([string]$Path, [string]$Value) {
    [System.IO.File]::WriteAllText($Path, $Value, (New-Object System.Text.UTF8Encoding($false)))
}

function Invoke-Sign {
    $null = Initialize-Tools $true $false
    $targetDir = Join-Path $env:LOCALAPPDATA 'DzienniczekHormonu\signing'
    $targetKey = Join-Path $targetDir 'dzienniczek-release.p12'
    $propertiesPath = Join-Path $targetDir 'signing.properties'
    $secretsPath = Join-Path $targetDir 'GITHUB_SECRETS_DO_WKLEJENIA.txt'
    [void][IO.Directory]::CreateDirectory($targetDir)

    $keystore = $KeystorePath
    if (!$keystore) { $keystore = Read-Host 'Masz istniejący klucz .p12? Podaj ścieżkę albo naciśnij Enter, aby utworzyć nowy' }
    $keystore = [Environment]::ExpandEnvironmentVariables(([string]$keystore).Trim('"'))
    $secure = Read-Host 'Ustaw lub podaj hasło klucza (minimum 8 znaków)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($password.Length -lt 8) { throw 'Hasło musi mieć co najmniej 8 znaków.' }

    if ($keystore) {
        if (!(Test-Path -LiteralPath $keystore -PathType Leaf)) { throw "Nie znaleziono klucza: $keystore" }
        Copy-Item -LiteralPath $keystore -Destination $targetKey -Force
    } else {
        $keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
        if (!(Test-Path -LiteralPath $keytool)) { throw 'Nie znaleziono keytool.exe w JDK 17.' }
        if (Test-Path -LiteralPath $targetKey) {
            $backup = "$targetKey.backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
            Copy-Item -LiteralPath $targetKey -Destination $backup
            Write-Host "Zachowano kopię poprzedniego klucza: $backup"
        }
        & $keytool -genkeypair -v -storetype PKCS12 -keystore $targetKey -alias $KeyAlias -keyalg RSA -keysize 3072 -validity 10000 -storepass $password -keypass $password -dname 'CN=Dzienniczek Hormonu, OU=Android, O=Tomasz Wolak, L=Czermin, ST=Podkarpackie, C=PL' | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'Nie udało się utworzyć klucza podpisującego.' }
    }
    $gradleKeyPath = $targetKey.Replace('\', '/')
    Write-Utf8NoBom $propertiesPath "storeFile=$gradleKeyPath`nstorePassword=$password`nkeyAlias=$KeyAlias`nkeyPassword=$password`n"
    $base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($targetKey))
    Write-Utf8NoBom $secretsPath "ANDROID_KEYSTORE_BASE64=$base64`nANDROID_KEYSTORE_PASSWORD=$password`nANDROID_KEY_ALIAS=$KeyAlias`nANDROID_KEY_PASSWORD=$password`n"
    try {
        $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
        & icacls.exe $targetDir /inheritance:r /grant:r "*$sid`:(OI)(CI)F" | Out-Null
    } catch { Write-Warning "Nie udało się ograniczyć uprawnień katalogu. Zabezpiecz ręcznie: $targetDir" }
    $password = $null
    Write-Host ''
    Write-Host "Gotowe. Klucz zachowaj na stałe: $targetKey"
    Write-Host "Wartości sekretów GitHub: $secretsPath (po wklejeniu usuń ten plik)."
    return 0
}

function Invoke-Publish {
    $python = Initialize-Tools $false $false
    $code = Invoke-Builder $python @('--prepare-only')
    if ($code -ne 0) { return $code }
    if (!(Get-Command git -ErrorAction SilentlyContinue)) { throw 'Brak Git for Windows.' }
    $uploadRoot = Join-Path $toolsRoot 'DzienniczekHormonu\github-upload'
    [void][IO.Directory]::CreateDirectory($uploadRoot)
    $checkout = Join-Path $uploadRoot ([guid]::NewGuid().ToString('N'))
    try {
        & git clone --branch main --single-branch 'https://github.com/tomalawsb/Hormon-Wzrostu-APK.git' $checkout | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'Nie udało się pobrać repozytorium (git clone).' }
        foreach ($item in Get-ChildItem -LiteralPath $checkout -Force) {
            if ($item.Name -eq '.git') { continue }
            Remove-Item -LiteralPath $item.FullName -Recurse -Force
        }
        & $python 'tools/build_project.py' '--project' '.' '--environments' $toolsRoot '--export-sources' $checkout | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'Kopiowanie źródeł nie powiodło się.' }
        & git -C $checkout add -A | Out-Host
        & git -C $checkout update-index --chmod=+x android/gradlew | Out-Host
        & git -C $checkout diff --cached --quiet
        if ($LASTEXITCODE -eq 0) { Write-Host 'Brak zmian do wysłania.'; return 0 }
        $version = (Get-Content -LiteralPath (Join-Path $projectRoot 'app-version.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
        & git -C $checkout commit -m "Dzienniczek Hormonu - wersja $version" | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'git commit nie powiódł się.' }
        & git -C $checkout push origin main | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'git push nie powiódł się.' }
        Write-Host 'Wysłano źródła do GitHub. GitHub Actions zbuduje APK/AAB i opublikuje je w Releases.'
        return 0
    } finally {
        Set-Location -LiteralPath $projectRoot
        if (Test-Path -LiteralPath $checkout) { Remove-Item -LiteralPath $checkout -Recurse -Force }
    }
}

switch ($Action) {
    'Sign' { exit (Invoke-Sign) }
    'Publish' { exit (Invoke-Publish) }
}

$needJava = $Action -in @('Build', 'Web', 'Check')
$needAndroid = $Action -in @('Build', 'Check')
$python = Initialize-Tools $needJava $needAndroid
if ($SetVersion) {
    & $python 'tools/set_version.py' $SetVersion $VersionCode | Out-Host
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
$extra = @()
switch ($Action) {
    'Prepare' { $extra = @('--prepare-only') }
    'Serve' { $extra = @('--serve', '--port', [string]$Port) }
    'Web' { $extra = @('--web-only') }
    'Check' { $extra = @('--check-only') }
}
exit (Invoke-Builder $python $extra)

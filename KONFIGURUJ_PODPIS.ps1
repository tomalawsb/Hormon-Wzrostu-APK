param(
    [string]$KeystorePath,
    [string]$KeyAlias = "dzienniczek"
)

$ErrorActionPreference = "Stop"

function Convert-SecureStringToPlainText([Security.SecureString]$SecureValue) {
    $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)
    }
}

function Write-Utf8NoBom([string]$Path, [string]$Value) {
    $Encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Value, $Encoding)
}

$TargetDir = Join-Path $env:LOCALAPPDATA "DzienniczekHormonu\signing"
$TargetKey = Join-Path $TargetDir "dzienniczek-release.p12"
$PropertiesPath = Join-Path $TargetDir "signing.properties"
$SecretsPath = Join-Path $TargetDir "GITHUB_SECRETS_DO_WKLEJENIA.txt"
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

if (-not $KeystorePath) {
    $KeystorePath = Read-Host "Masz istniejacy klucz .p12? Podaj sciezke albo nacisnij Enter, aby utworzyc nowy"
}
$KeystorePath = [Environment]::ExpandEnvironmentVariables(([string]$KeystorePath).Trim('"'))

$StorePasswordSecure = Read-Host "Ustaw lub podaj haslo klucza (minimum 8 znakow)" -AsSecureString
$StorePassword = Convert-SecureStringToPlainText $StorePasswordSecure
if ($StorePassword.Length -lt 8) {
    throw "Haslo musi miec co najmniej 8 znakow."
}
$KeyPassword = $StorePassword

if ($KeystorePath) {
    if (-not (Test-Path -LiteralPath $KeystorePath -PathType Leaf)) {
        throw "Nie znaleziono klucza: $KeystorePath"
    }
    Copy-Item -LiteralPath $KeystorePath -Destination $TargetKey -Force
}
else {
    $KeytoolCommand = Get-Command keytool.exe -ErrorAction SilentlyContinue
    $Keytool = $null
    if ($KeytoolCommand) {
        $Keytool = $KeytoolCommand.Source
    }

    if (-not $Keytool -and $env:JAVA_HOME) {
        $Candidate = Join-Path $env:JAVA_HOME "bin\keytool.exe"
        if (Test-Path -LiteralPath $Candidate) {
            $Keytool = $Candidate
        }
    }

    if (-not $Keytool) {
        throw "Nie znaleziono keytool.exe. Zainstaluj JDK 21 i uruchom skrypt ponownie."
    }

    if (Test-Path -LiteralPath $TargetKey) {
        $Backup = "$TargetKey.backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
        Copy-Item -LiteralPath $TargetKey -Destination $Backup
        Write-Host "Zachowano kopie poprzedniego klucza: $Backup"
    }

    & $Keytool -genkeypair -v -storetype PKCS12 -keystore $TargetKey -alias $KeyAlias -keyalg RSA -keysize 3072 -validity 10000 -storepass $StorePassword -keypass $KeyPassword -dname "CN=Dzienniczek Hormonu, OU=Android, O=Tomasz Wolak, L=Czermin, ST=Podkarpackie, C=PL"
    if ($LASTEXITCODE -ne 0) {
        throw "Nie udalo sie utworzyc klucza podpisujacego."
    }
}

$GradleKeyPath = $TargetKey.Replace('\', '/')
$SigningProperties = "storeFile=$GradleKeyPath`nstorePassword=$StorePassword`nkeyAlias=$KeyAlias`nkeyPassword=$KeyPassword`n"
Write-Utf8NoBom $PropertiesPath $SigningProperties

$Base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($TargetKey))
$Secrets = @"
ANDROID_KEYSTORE_BASE64=$Base64
ANDROID_KEYSTORE_PASSWORD=$StorePassword
ANDROID_KEY_ALIAS=$KeyAlias
ANDROID_KEY_PASSWORD=$KeyPassword
"@
Write-Utf8NoBom $SecretsPath $Secrets

try {
    $Sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $TargetDir /inheritance:r /grant:r "*$Sid`:(OI)(CI)F" | Out-Null
}
catch {
    Write-Warning "Nie udalo sie ograniczyc uprawnien katalogu. Zabezpiecz recznie: $TargetDir"
}

$StorePassword = $null
$KeyPassword = $null
Write-Host ""
Write-Host "Gotowe. Klucz zachowaj na stale: $TargetKey"
Write-Host "Wartosci sekretow GitHub sa tutaj: $SecretsPath"
Write-Host "Po dodaniu sekretow usun plik GITHUB_SECRETS_DO_WKLEJENIA.txt albo przechowuj go w bezpiecznym miejscu."

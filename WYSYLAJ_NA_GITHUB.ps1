$ErrorActionPreference = 'Stop'
$sourceRoot = $PSScriptRoot
Set-Location -LiteralPath $sourceRoot
& (Join-Path $sourceRoot 'BUDUJ.ps1') -PrepareOnly
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (!(Get-Command git -ErrorAction SilentlyContinue)) { throw 'Brak Git for Windows.' }
$uploadRoot = 'D:\Users\Admin\' + [char]0x015A + 'rodowiska\DzienniczekHormonu\github-upload'
New-Item -ItemType Directory -Force -Path $uploadRoot | Out-Null
$checkout = [IO.Path]::GetFullPath((Join-Path $uploadRoot ([guid]::NewGuid().ToString('N'))))
if (!$checkout.StartsWith([IO.Path]::GetFullPath($uploadRoot) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid checkout path.' }
try {
    & git clone --branch main --single-branch 'https://github.com/tomalawsb/Hormon-Wzrostu-APK.git' $checkout
    if ($LASTEXITCODE -ne 0) { throw 'Git clone failed.' }
    foreach ($item in Get-ChildItem -LiteralPath $checkout -Force) {
        if ($item.Name -eq '.git') { continue }
        $target = [IO.Path]::GetFullPath($item.FullName)
        if (!$target.StartsWith($checkout + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid checkout file.' }
        Remove-Item -LiteralPath $target -Recurse -Force
    }
    & python (Join-Path $sourceRoot 'tools/copy_sources.py') $sourceRoot $checkout
    if ($LASTEXITCODE -ne 0) { throw 'Source copy failed.' }
    & git -C $checkout add -A
    if ($LASTEXITCODE -ne 0) { throw 'Git add failed.' }
    & git -C $checkout update-index --chmod=+x android/gradlew
    if ($LASTEXITCODE -ne 0) { throw 'Wrapper preparation failed.' }
    & git -C $checkout diff --cached --quiet
    if ($LASTEXITCODE -eq 0) { Write-Host 'Brak zmian do wyslania.'; exit 0 }
    $version = (Get-Content -LiteralPath (Join-Path $sourceRoot 'app-version.json') -Raw | ConvertFrom-Json).version
    & git -C $checkout commit -m "Dzienniczek Hormonu - wersja $version"
    if ($LASTEXITCODE -ne 0) { throw 'Git commit failed.' }
    & git -C $checkout push origin main
    if ($LASTEXITCODE -ne 0) { throw 'Git push failed.' }
    Write-Host 'Wyslano zrodla do GitHub. Publikacja Google Play jest osobnym krokiem.'
} finally {
    Set-Location -LiteralPath $sourceRoot
    if ((Test-Path -LiteralPath $checkout) -and $checkout.StartsWith([IO.Path]::GetFullPath($uploadRoot) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $checkout -Recurse -Force
    }
}

@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

echo Przygotowanie aplikacji WWW do GitHub Pages...

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$projectRoot=(Resolve-Path -LiteralPath '%~dp0').Path.TrimEnd('\');" ^
  "$script=Join-Path $projectRoot 'tools\dzienniczek.ps1';" ^
  "$docs=Join-Path $projectRoot 'docs';" ^
  "$exitCode=1;" ^
  "try {" ^
  "  & $script -Action Prepare;" ^
  "  if($LASTEXITCODE -ne 0){throw 'Przygotowanie aplikacji WWW nie powiodlo sie.'};" ^
  "  if($env:DH_ENVIRONMENT_ROOT){$envRoot=[IO.Path]::GetFullPath($env:DH_ENVIRONMENT_ROOT).TrimEnd('\')}else{$envRoot='D:\Users\Admin\'+[char]0x015A+'rodowiska'};" ^
  "  $sha=[Security.Cryptography.SHA256]::Create();" ^
  "  $bytes=[Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant());" ^
  "  $id=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant().Substring(0,12);" ^
  "  $www=Join-Path $envRoot ('DzienniczekHormonu\'+$id+'\work\www');" ^
  "  $index=Join-Path $www 'index.html';" ^
  "  if(!(Test-Path -LiteralPath $index -PathType Leaf)){throw ('Nie znaleziono index.html: '+$index)};" ^
  "  if(Test-Path -LiteralPath $docs){Remove-Item -LiteralPath $docs -Recurse -Force};" ^
  "  New-Item -ItemType Directory -Force -Path $docs | Out-Null;" ^
  "  Copy-Item -Path (Join-Path $www '*') -Destination $docs -Recurse -Force;" ^
  "  New-Item -ItemType File -Force -Path (Join-Path $docs '.nojekyll') | Out-Null;" ^
  "  Write-Host ('GitHub Pages: '+$index+' -> '+$docs);" ^
  "  & $script -Action Publish;" ^
  "  $exitCode=$LASTEXITCODE;" ^
  "  if($exitCode -ne 0){throw 'Wysylanie do GitHub nie powiodlo sie.'};" ^
  "} finally {" ^
  "  if(Test-Path -LiteralPath $docs){Remove-Item -LiteralPath $docs -Recurse -Force};" ^
  "}" ^
  "exit $exitCode"

set "DH_EXIT=%ERRORLEVEL%"
echo.
if "%DH_EXIT%"=="0" (
  echo GOTOWE.
  echo.
  echo W GitHub ustaw tylko raz:
  echo Settings ^> Pages
  echo Branch: main
  echo Folder: /docs
  echo.
  echo Potem aplikacja bedzie pod:
  echo https://tomalawsb.github.io/Hormon-Wzrostu-APK/
) else (
  echo BLAD: wysylanie nie powiodlo sie.
)

if not defined DH_NO_PAUSE pause
exit /b %DH_EXIT%

#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit("BŁĄD: " + message)


def properties(path: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in read(path).splitlines():
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip()
    return result


package = json.loads(read("package.json"))
lock = json.loads(read("package-lock.json"))
manifest = json.loads(read("manifest.json"))
version = json.loads(read("app-version.json"))
android_version = properties("android/version.properties")
version_name = android_version.get("VERSION_NAME", "")
version_code = android_version.get("VERSION_CODE", "")

require(re.fullmatch(r"\d+\.\d+\.\d+", version_name) is not None, "VERSION_NAME musi mieć format X.Y.Z")
require(version_code.isdigit() and int(version_code) > 0, "VERSION_CODE musi być dodatnią liczbą")
require(package.get("name") == "dzienniczek-hormonu", "nieprawidłowa nazwa pakietu npm")
require(package.get("version") == version_name, "package.json nie zgadza się z VERSION_NAME")
require(lock.get("version") == version_name, "package-lock.json nie zgadza się z VERSION_NAME")
require(lock.get("packages", {}).get("", {}).get("version") == version_name, "główny pakiet w package-lock ma inną wersję")
require(version.get("version") == version_name, "app-version.json ma inną wersję")
require(manifest.get("name") == f"Dzienniczek Hormonu v{version_name}", "manifest PWA ma inną wersję")
require(manifest.get("short_name") == "Dzienniczek Hormonu", "nieprawidłowa krótka nazwa PWA")
require(f"<title>Dzienniczek Hormonu v{version_name}</title>" in read("index.html"), "tytuł HTML ma inną wersję")
require(f"**Wersja: v{version_name}**" in read("README.md"), "README ma inną bieżącą wersję")

strings = read("android/app/src/main/res/values/strings.xml")
require(strings.count("Dzienniczek Hormonu") >= 2, "nieprawidłowa nazwa Android")
android_manifest = read("android/app/src/main/AndroidManifest.xml")
for permission in ("INTERNET", "RECORD_AUDIO", "POST_NOTIFICATIONS", "RECEIVE_BOOT_COMPLETED", "SCHEDULE_EXACT_ALARM"):
    require(permission in android_manifest, f"brak uprawnienia {permission}")
require('android:allowBackup="false"' in android_manifest, "prywatne dane nie powinny trafiać do automatycznej kopii systemowej")

build_gradle = read("android/app/build.gradle")
require("applicationId 'pl.tomaszwolak.dzienniczekhormonuwzrostu'" in build_gradle, "zmieniono identyfikator aplikacji, co usunęłoby ciągłość aktualizacji")
require("namespace 'pl.tomaszwolak.dzienniczekhormonuwzrostu'" in build_gradle, "zmieniono namespace Androida")
require("ANDROID_KEYSTORE_FILE" in build_gradle, "Gradle nie obsługuje bezpiecznego podpisu z sekretów")
require("DzienniczekHormonu/signing/signing.properties" in build_gradle, "Gradle nie obsługuje prywatnego katalogu Windows")

debug_block = re.search(r"debug\s*\{(?P<body>.*?)\n\s*\}", build_gradle, re.DOTALL)
require(debug_block is not None, "brak konfiguracji debug")
require("signingConfig" not in debug_block.group("body"), "debug nie może używać klucza produkcyjnego")

native_bridge = read("src/native/native-bridge.js")
require(re.search(r"const SCHEDULE_DAYS\s*=\s*(?:9\d|[1-9]\d{2,})\s*;", native_bridge) is not None, "harmonogram przypomnień jest krótszy niż 90 dni")
require("PERMISSIONS_ONBOARDING_REVISION = 'permissions-v2'" in read("src/app/00_bootstrap.js"), "brak wersjonowania ekranu zgód")
require("isPermissionsOnboardingCompleted()" in read("src/app/90_permissions_reminders.js"), "brak wymuszenia ekranu zgód po aktualizacji")
require("migrateLegacyStoredData" in read("src/app/10_data_storage.js"), "brak migracji starszych danych")
require("BACKUP_STORAGE_KEY" in read("src/app/10_data_storage.js"), "brak kopii danych przed zapisem")
require("file:///android_asset/web/index.html" in read("android/app/src/main/java/pl/tomaszwolak/dzienniczekhormonuwzrostu/MainActivity.java"), "nieprawidłowa ścieżka startowa WebView")

native_main = read("android/app/src/main/java/pl/tomaszwolak/dzienniczekhormonuwzrostu/MainActivity.java")
require(native_main.startswith("package pl.tomaszwolak.dzienniczekhormonuwzrostu;"), "MainActivity ma obcy pakiet")
require("extends Activity" in native_main, "APK nie używa natywnej klasy projektu")
require("extends BridgeActivity" not in native_main, "pozostała stara klasa Capacitor")
require("capacitor" not in read("android/settings.gradle").lower(), "projekt nadal dołącza obcy runtime Capacitor")

assets = ("index.html", "app.js", "native-bridge.js", "style.css", "manifest.json", "app-version.json", "service-worker.js", "icon-192.png", "icon-512.png")
for name in assets:
    require((ROOT / name).read_bytes() == (ROOT / "www" / name).read_bytes(), f"www/{name} nie jest zsynchronizowany")
    require((ROOT / name).read_bytes() == (ROOT / "android/app/src/main/assets/web" / name).read_bytes(), f"asset Android web/{name} nie jest zsynchronizowany")

require("internal.api.openai.org" not in read("package-lock.json"), "package-lock zawiera prywatny rejestr")
require("artifactory/api/npm" not in read("package-lock.json"), "package-lock zawiera prywatny rejestr")

for js_path in sorted((ROOT / "src/native").rglob("*.js")) + [ROOT / "app.js", ROOT / "native-bridge.js", ROOT / "service-worker.js", ROOT / "tools/run_python.js"]:
    result = subprocess.run(["node", "--check", str(js_path)], capture_output=True, text=True)
    require(result.returncode == 0, f"błąd składni {js_path.relative_to(ROOT)}: {result.stderr.strip()}")

workflow_path = ROOT / ".github/workflows/android-ci.yml"
require(workflow_path.is_file(), "brak workflow GitHub Actions")
workflow = workflow_path.read_text(encoding="utf-8")
for required in (
    "pull_request:",
    "push:",
    "actions/upload-artifact@v4",
    "assembleDebug",
    "assembleRelease",
    "bundleRelease",
    "ANDROID_KEYSTORE_BASE64",
    "gh release create",
):
    require(required in workflow, f"workflow nie zawiera: {required}")

ignore = read(".gitignore")
require("android/signing/*" in ignore, "katalog podpisu nie jest ignorowany")
require("/app.js" not in ignore and "/native-bridge.js" not in ignore, "pliki PWA są ignorowane i GitHub Pages nie zadziała")

secret_suffixes = {".p12", ".jks", ".keystore", ".pem"}
secret_files = [
    path.relative_to(ROOT)
    for path in ROOT.rglob("*")
    if path.is_file()
    and path.suffix.lower() in secret_suffixes
    and "node_modules" not in path.parts
    and "build" not in path.parts
]
require(not secret_files, "projekt zawiera prywatny klucz: " + ", ".join(map(str, secret_files)))
require(not (ROOT / "android/signing/signing.properties").exists(), "projekt zawiera jawne hasła podpisu")


signing_script = read("KONFIGURUJ_PODPIS.ps1")
require("UTF8Encoding($false)" in signing_script, "skrypt podpisu nie zapisuje UTF-8 bez BOM")
require("[System.IO.File]::WriteAllText" in signing_script, "skrypt podpisu nie używa bezpiecznego zapisu pliku")
require("ANDROID_KEYSTORE_BASE64" in signing_script, "skrypt nie przygotowuje sekretów GitHub")
require("keytool" in signing_script, "skrypt nie potrafi utworzyć nowego klucza")
require(signing_script.isascii(), "KONFIGURUJ_PODPIS.ps1 zawiera znaki spoza ASCII i może nie działać w Windows PowerShell 5.1")

updater = read("src/app/115_updates.js")
require("tomalawsb/Hormon-Wzrostu-APK/releases/latest" in updater, "aktualizator wskazuje złe repozytorium")
require("browser_download_url" in updater, "aktualizator nie pobiera adresu APK")
require("openExternalUrl" in native_main, "Android nie potrafi otworzyć pobierania aktualizacji")
require("appVersion()" in native_main, "APK nie udostępnia rzeczywistego numeru wersji")
require("latestReleaseJson()" in native_main, "APK nie sprawdza GitHub Release przez natywny most")
require((ROOT / "src/app/116_native_version_ui_fixes.js").is_file(), "brak poprawki wersji i propozycji dla APK")
require("check-update-button" in read("index.html"), "brak przycisku sprawdzania aktualizacji")

require("settings-version-label" in read("index.html"), "brak numeru wersji w ustawieniach")
require("Sprawdź aktualizacje" in read("index.html"), "brak przycisku Sprawdź aktualizacje")
require("autoDownload: true" in read("src/app/00_bootstrap.js"), "przycisk aktualizacji nie rozpoczyna pobierania")
require("today-profile-switcher'].hidden = !multiple" in read("src/app/19_today_dashboard.js"), "pojedynczy profil jest nadal dublowany")
require("currentRemaining" in read("src/app/40_ampoules.js"), "brak rzeczywistego stanu ampułki")
require("AKTUALIZUJ_I_WYSLIJ.cmd" in [path.name for path in ROOT.iterdir()], "brak skryptu jednej operacji")
require("dzienniczek-hormonu-v" + version_name in read("service-worker.js"), "cache PWA ma starą wersję")

result = subprocess.run(
    [sys.executable, str(ROOT / "tools/build_app.py"), "--check", "--root", str(ROOT)],
    capture_output=True,
    text=True,
)
require(result.returncode == 0, result.stdout.strip() or result.stderr.strip() or "app.js nie jest zgodny z modułami")

print(f"Test projektu: OK — Dzienniczek Hormonu v{version_name}, versionCode {version_code}")
print("GitHub Actions, wersjonowanie, migracja danych i bezpieczny podpis: OK")

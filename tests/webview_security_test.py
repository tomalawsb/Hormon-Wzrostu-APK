#!/usr/bin/env python3
from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MAIN_ACTIVITY = ROOT / "android/app/src/main/java/pl/tomaszwolak/dzienniczekhormonuwzrostu/MainActivity.java"


def read(path: Path | str) -> str:
    target = path if isinstance(path, Path) else ROOT / path
    return target.read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit("BŁĄD WEBVIEW: " + message)


class SecurityHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.csp = ""
        self.referrer = ""
        self.inline_scripts = 0
        self.event_attributes: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {name.lower(): value or "" for name, value in attrs}
        if tag.lower() == "meta" and attributes.get("http-equiv", "").lower() == "content-security-policy":
            self.csp = attributes.get("content", "")
        if tag.lower() == "meta" and attributes.get("name", "").lower() == "referrer":
            self.referrer = attributes.get("content", "")
        if tag.lower() == "script" and not attributes.get("src"):
            self.inline_scripts += 1
        self.event_attributes.extend(name for name in attributes if name.startswith("on"))


def csp_directives(policy: str) -> dict[str, set[str]]:
    result: dict[str, set[str]] = {}
    for item in policy.split(";"):
        values = item.strip().split()
        if values:
            result[values[0]] = set(values[1:])
    return result


main = read(MAIN_ACTIVITY)
gradle = read("android/app/build.gradle")
manifest = read("android/app/src/main/AndroidManifest.xml")
index = read("index.html")

require("androidx.webkit:webkit:1.16.0" in gradle, "brak stabilnej biblioteki AndroidX Webkit")
require(
    re.search(r"buildFeatures\s*\{[^}]*buildConfig\s+true", gradle, re.DOTALL) is not None,
    "BuildConfig.DEBUG jest używany, ale generowanie BuildConfig nie jest włączone",
)
require("WebViewAssetLoader" in main, "brak WebViewAssetLoader")
require("new WebViewAssetLoader.AssetsPathHandler(this)" in main, "zasoby APK nie mają lokalnego handlera")
require("https://\" + APP_ASSET_HOST + APP_ASSET_PREFIX + \"index.html" in main, "brak startu przez zaufane HTTPS")
require("file:///android_asset" not in main, "pozostało bezpośrednie ładowanie file://")

for setting in (
    "settings.setAllowFileAccess(false)",
    "settings.setAllowContentAccess(true)",
    "settings.setAllowFileAccessFromFileURLs(false)",
    "settings.setAllowUniversalAccessFromFileURLs(false)",
    "settings.setBlockNetworkLoads(true)",
    "settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW)",
    "settings.setJavaScriptCanOpenWindowsAutomatically(false)",
    "settings.setSupportMultipleWindows(false)",
    "settings.setGeolocationEnabled(false)",
):
    require(setting in main, f"brak ustawienia: {setting}")

require("setAllowFileAccess(true)" not in main, "dostęp do plików został ponownie włączony")
require("Intent.ACTION_OPEN_DOCUMENT" in main, "import plików nie używa systemowego selektora dokumentów")
require("Intent.FLAG_GRANT_READ_URI_PERMISSION" in main, "wybrany plik nie dostaje ograniczonego prawa odczytu")
require("WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)" in main, "debugowanie WebView nie zależy od wariantu builda")
require("setHttpAllowed(false)" in main, "WebViewAssetLoader dopuszcza HTTP")
require("shouldInterceptRequest" in main and "blockedWebResponse()" in main, "obce żądania zasobów nie są blokowane")
require("shouldOverrideUrlLoading" in main and "isForMainFrame" in main, "nawigacja nie jest kontrolowana")
require("isTrustedInternalFrame" in main and '"srcdoc".equalsIgnoreCase(value)' in main, "lokalny podgląd raportu nie ma bezpiecznego wyjątku")
require("handler.cancel()" in main, "błędy TLS nie są bezwarunkowo odrzucane")
require("WebResourceError" not in main, "przy webkit 1.16.0 nie wolno nadpisywać finalnego callbacku WebResourceError")
require(
    main.count("public void onReceivedError(") == 1,
    "MainActivity musi zawierać tylko zgodny callback onReceivedError",
)
require(
    "public void onReceivedError(WebView view, int errorCode, String description, String failingUrl)" in main,
    "brak callbacku onReceivedError zgodnego z webkit 1.16.0",
)
require(
    "failingUrl != null && failingUrl.equals(view.getUrl())" in main,
    "błąd pojedynczego zasobu może wyłączyć cały most Androida",
)
require('"https".equalsIgnoreCase(parsed.getScheme())' in main, "linki zewnętrzne nie są ograniczone do HTTPS")
require("UPDATE_DOWNLOAD_HOST" in main and '"github.com"' in main,
        "natywne pobieranie nie jest ograniczone do hosta GitHub")
require("UPDATE_DOWNLOAD_PATH_PREFIX" in main and 'releases/download/' in main,
        "natywne pobieranie nie jest ograniczone do zasobu wydania")
require('endsWith(".apk")' in main, "Android może otworzyć plik inny niż APK")
require("startActivity(new Intent(Intent.ACTION_VIEW, uri))" in main,
        "plik APK nie jest otwierany bezpośrednim intentem ACTION_VIEW")
require("resolveActivity(" not in main,
        "aktualizator nadal blokuje pobieranie przez zawodny test resolveActivity")
require("Looper.getMainLooper()" in main and "runOnUiThread" in main,
        "otwieranie pliku APK nie jest wykonywane bezpiecznie na głównym wątku")
require("CountDownLatch" in main and "TimeUnit.SECONDS" in main,
        "most Androida nie czeka na rzeczywisty wynik uruchomienia pobierania")
require('android:usesCleartextTraffic="false"' in manifest, "manifest dopuszcza nieszyfrowany ruch")

expected_assets = {
    "index.html",
    "app.js",
    "native-bridge.js",
    "style.css",
    "manifest.json",
    "app-version.json",
    "service-worker.js",
    "icon-192.png",
    "icon-512.png",
}
allowlisted_assets = set(re.findall(r'APP_ASSET_PREFIX \+ "([^"]+)"', main))
require(expected_assets <= allowlisted_assets, "lista dozwolonych zasobów Androida jest niepełna")

bridge_section = main.split("public final class AndroidNativeApi", 1)[1]
bridge_chunks = re.findall(
    r"@JavascriptInterface\s+(.*?)(?=@JavascriptInterface|\n\s*}\n\s*}\s*$)",
    bridge_section,
    re.DOTALL,
)
expected_methods = {
    "isNative",
    "appVersion",
    "latestReleaseJson",
    "initialize",
    "microphonePermission",
    "requestMicrophonePermission",
    "notificationPermission",
    "requestNotificationPermission",
    "exactAlarmPermission",
    "requestExactAlarmPermission",
    "syncDailyReminders",
    "showNotification",
    "notificationDiagnostics",
    "openNotificationSettings",
    "notificationEventsReady",
    "openExternalUrl",
    "saveJsonFile",
    "secureStorageRead",
    "secureStorageWrite",
    "secureStorageRemove",
    "secureStorageType",
    "randomBase64",
    "pinHash",
    "encryptBackup",
    "decryptBackup",
    "biometricStatus",
    "requestBiometricUnlock",
    "openAppSettings",
    "exitApp",
}
found_methods: set[str] = set()
for chunk in bridge_chunks:
    match = re.search(r"public\s+\w+(?:<[^>]+>)?\s+(\w+)\s*\(", chunk)
    require(match is not None, "nie można odczytać metody @JavascriptInterface")
    method = match.group(1)
    found_methods.add(method)
    require("bridgeAllowed()" in chunk, f"metoda mostu {method} nie sprawdza zaufanej strony")
require(found_methods == expected_methods, "lista metod AndroidNativeApi zmieniła się bez przeglądu testu")
require("isTrustedAppOrigin(request.getOrigin())" in main, "żądanie mikrofonu nie sprawdza pochodzenia")
require("MAX_NOTIFICATION_JSON_CHARS" in main, "brak limitu danych powiadomienia")
require("MAX_REMINDER_JSON_CHARS" in main, "brak limitu danych przypomnień")
require("MAX_EXPORT_JSON_CHARS" in main, "brak limitu natywnego eksportu JSON")
require("Intent.ACTION_CREATE_DOCUMENT" in main, "eksport JSON nie używa systemowego okna zapisu")
require("nativeFileSaveResult" in main, "Android nie zwraca wyniku natywnego zapisu JSON")
require("saveJsonFile" in read("src/native/native-bridge.js"), "most web nie obsługuje natywnego zapisu JSON")
updates_source = read("src/services/updates/index.js")
bridge_source = read("src/native/native-bridge.js")
require("release.html_url" not in updates_source, "aktualizator nadal może otworzyć stronę wydania")
require("Otwórz wydanie na GitHubie" not in updates_source,
        "aktualizator nadal pokazuje odsyłacz do GitHuba")
require(updates_source.count("isAllowedUpdateApkUrl") >= 3,
        "adres APK nie jest sprawdzany przed pokazaniem i pobraniem")
require("isAllowedUpdateApkUrl(value)" in bridge_source,
        "most natywny nie blokuje adresów innych niż bezpośredni APK")
require("await downloadFile(filename" in read("src/services/export/backup.js"),
        "eksport kopii pokazuje sukces przed zakończeniem zapisu")
require("MAX_RELEASE_JSON_CHARS" in main and "setInstanceFollowRedirects(false)" in main, "odpowiedź aktualizatora nie jest ograniczona")
require("removeJavascriptInterface(\"AndroidNative\")" in main, "most nie jest usuwany przy zamykaniu")

parser = SecurityHtmlParser()
parser.feed(index)
require(bool(parser.csp), "index.html nie zawiera CSP")
directives = csp_directives(parser.csp)
require(directives.get("default-src") == {"'self'"}, "default-src CSP musi wskazywać wyłącznie self")
require(directives.get("script-src") == {"'self'"}, "script-src dopuszcza kod inline lub obcy")
require(directives.get("script-src-attr") == {"'none'"}, "atrybuty skryptowe inline nie są zablokowane")
require(directives.get("object-src") == {"'none'"}, "object-src nie jest wyłączone")
require(directives.get("base-uri") == {"'none'"}, "base-uri nie jest wyłączone")
require(directives.get("form-action") == {"'self'"}, "formularze mogą wysyłać dane poza aplikację")
require(directives.get("connect-src") == {"'self'", "https://api.github.com"}, "connect-src jest zbyt szerokie")
require("*" not in parser.csp and "'unsafe-eval'" not in parser.csp, "CSP zawiera niebezpieczne źródło")
require(parser.inline_scripts == 0, "index.html zawiera skrypt inline blokowany przez CSP")
require(not parser.event_attributes, "index.html zawiera obsługę zdarzeń inline")
require(parser.referrer == "no-referrer", "brak ścisłej polityki referrer")
require("frame-ancestors 'none'" in main, "nagłówek CSP APK nie blokuje osadzania strony")
require("X-Content-Type-Options" in main and "nosniff" in main, "brak ochrony MIME dla zasobów APK")
require("Permissions-Policy" in main and "camera=()" in main, "brak ograniczenia funkcji przeglądarki")

print("Test bezpieczeństwa WebView: OK")
print(f"Zaufane zasoby: {len(expected_assets)}, sprawdzone metody AndroidNativeApi: {len(found_methods)}")

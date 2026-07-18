#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "1.0.8"
VERSION_CODE = "3909"


def require_replace(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Nie znaleziono miejsca poprawki: {label}")
    return text.replace(old, new, 1)


def main() -> int:
    version_file = ROOT / "android" / "version.properties"
    current = version_file.read_text(encoding="utf-8")
    if f"VERSION_NAME={VERSION}" not in current:
        subprocess.run(
            [sys.executable, str(ROOT / "tools" / "set_version.py"), VERSION, VERSION_CODE],
            check=True,
            cwd=ROOT,
        )

    main_activity = ROOT / "android" / "app" / "src" / "main" / "java" / "pl" / "tomaszwolak" / "dzienniczekhormonuwzrostu" / "MainActivity.java"
    java = main_activity.read_text(encoding="utf-8")

    if "latestReleaseJsonNative()" not in java:
        java = require_replace(
            java,
            "import org.json.JSONObject;\n",
            "import org.json.JSONObject;\n\nimport java.io.BufferedReader;\nimport java.io.InputStreamReader;\nimport java.net.HttpURLConnection;\nimport java.net.URL;\n",
            "importy sieciowe Androida",
        )
        methods = r'''
    private String appVersionNative() {
        try {
            String value = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            return value == null || value.trim().isEmpty() ? "1.0.8" : value.trim();
        } catch (Exception error) {
            return "1.0.8";
        }
    }

    private String latestReleaseJsonNative() {
        HttpURLConnection connection = null;
        try {
            URL url = new URL("https://api.github.com/repos/tomalawsb/Hormon-Wzrostu-APK/releases/latest");
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(12000);
            connection.setRequestProperty("Accept", "application/vnd.github+json");
            connection.setRequestProperty("User-Agent", "Dzienniczek-Hormonu-Android");
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) return "";
            BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), "UTF-8"));
            StringBuilder result = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) result.append(line);
            reader.close();
            return result.toString();
        } catch (Exception error) {
            return "";
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

'''
        java = require_replace(
            java,
            "    @Override\n    protected void onResume() {",
            methods + "    @Override\n    protected void onResume() {",
            "metody wersji i GitHub API",
        )
        java = require_replace(
            java,
            "        @JavascriptInterface public boolean isNative() { return true; }\n",
            "        @JavascriptInterface public boolean isNative() { return true; }\n"
            "        @JavascriptInterface public String appVersion() { return appVersionNative(); }\n"
            "        @JavascriptInterface public String latestReleaseJson() { return latestReleaseJsonNative(); }\n",
            "interfejs JavaScript Androida",
        )
        main_activity.write_text(java, encoding="utf-8")

    module_path = ROOT / "src" / "app" / "116_native_version_ui_fixes.js"
    module_path.write_text(r'''  // Android WebView uruchamia aplikację z file://, dlatego zwykły fetch lokalnej
  // wersji i GitHub API może zostać zablokowany. Dla APK odpowiedzi dostarcza
  // natywny most Java, a PWA nadal używa normalnego fetch().
  const browserFetchBeforeNativeFix = window.fetch.bind(window);
  window.fetch = async function nativeAwareFetch(input, options) {
    const rawUrl = typeof Request !== 'undefined' && input instanceof Request ? input.url : String(input || '');
    let absoluteUrl = rawUrl;
    try { absoluteUrl = new URL(rawUrl, window.location.href).href; } catch {}

    if (isNativeAndroidApp() && /\/app-version\.json(?:[?#]|$)/i.test(absoluteUrl)
        && typeof window.AndroidNative?.appVersion === 'function') {
      const version = String(window.AndroidNative.appVersion() || '').trim();
      if (version) {
        return new Response(JSON.stringify({ version }), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    if (isNativeAndroidApp() && absoluteUrl === GITHUB_RELEASE_API
        && typeof window.AndroidNative?.latestReleaseJson === 'function') {
      const payload = String(window.AndroidNative.latestReleaseJson() || '').trim();
      if (!payload) return new Response('', { status: 503 });
      try {
        JSON.parse(payload);
        return new Response(payload, {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch {
        return new Response('', { status: 502 });
      }
    }

    return browserFetchBeforeNativeFix(input, options);
  };

  // Czytelniejsza propozycja: etykieta i samo miejsce w osobnych wierszach.
  const renderMainRecommendationBeforeEmphasis = renderMainRecommendation;
  renderMainRecommendation = function renderMainRecommendationWithEmphasis(options) {
    renderMainRecommendationBeforeEmphasis(options);
    const todayEntry = options?.todayEntry;
    const suggestion = options?.suggestion;
    if (!todayEntry && suggestion?.side && suggestion?.site) {
      const place = capitalize(formatPlace(suggestion.side, suggestion.site));
      el['main-action-eyebrow'].textContent = 'Dzisiaj do podania';
      el['main-action-heading'].innerHTML =
        `<span class="recommendation-heading-label">Proponowane miejsce</span>` +
        `<span class="recommendation-heading-place">${escapeHtml(place)}</span>`;
    }
  };

  const recommendationStyle = document.createElement('style');
  recommendationStyle.textContent = `
    #main-action-heading .recommendation-heading-label {
      display: block;
      margin-bottom: 7px;
      color: #0b8e80;
      font-size: .46em;
      font-weight: 900;
      line-height: 1.1;
      letter-spacing: .055em;
      text-transform: uppercase;
    }
    #main-action-heading .recommendation-heading-place {
      display: block;
      color: #082f55;
      font-size: 1.18em;
      font-weight: 900;
      line-height: 1.04;
      letter-spacing: -.035em;
    }
    @media (max-width: 820px) {
      #main-action-heading .recommendation-heading-label { font-size: .48em; }
      #main-action-heading .recommendation-heading-place { font-size: 1.15em; }
    }
  `;
  document.head.appendChild(recommendationStyle);
''', encoding="utf-8")

    order_path = ROOT / "src" / "app" / "module-order.json"
    order = json.loads(order_path.read_text(encoding="utf-8"))
    names = [item["file"] for item in order["modules"]]
    if module_path.name not in names:
        index = names.index("115_updates.js") + 1
        order["modules"].insert(index, {
            "file": module_path.name,
            "description": "Natywne pobieranie wersji i GitHub Release w APK oraz mocniejsze wyróżnienie proponowanego miejsca."
        })
        order["schemaVersion"] = max(int(order.get("schemaVersion", 0)), 8)
        order_path.write_text(json.dumps(order, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Dodatkowe testy regresji dla błędów widocznych w APK.
    test_path = ROOT / "tests" / "smoke_test.py"
    test = test_path.read_text(encoding="utf-8")
    marker = 'require("openExternalUrl" in native_main, "Android nie potrafi otworzyć pobierania aktualizacji")\n'
    extra = (
        marker
        + 'require("appVersion()" in native_main, "APK nie udostępnia rzeczywistego numeru wersji")\n'
        + 'require("latestReleaseJson()" in native_main, "APK nie sprawdza GitHub Release przez natywny most")\n'
        + 'require((ROOT / "src/app/116_native_version_ui_fixes.js").is_file(), "brak poprawki wersji i propozycji dla APK")\n'
    )
    if "APK nie udostępnia rzeczywistego numeru wersji" not in test:
        test = require_replace(test, marker, extra, "testy natywnej wersji")
        test_path.write_text(test, encoding="utf-8")

    # Pliki jednorazowej automatyzacji usuwają się z finalnego projektu.
    for temporary in (
        ROOT / "tools" / "apply_fix_108.py",
        ROOT / ".github" / "workflows" / "apply-fix-108.yml",
    ):
        if temporary.exists():
            temporary.unlink()

    print("Zastosowano poprawkę 1.0.8 / 3909.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

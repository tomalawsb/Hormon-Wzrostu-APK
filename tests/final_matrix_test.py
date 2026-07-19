#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ANDROID_NS = "{http://schemas.android.com/apk/res/android}"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit("BŁĄD ETAPU 12: " + message)


class HtmlAudit(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.dialogs: list[tuple[str, str]] = []
        self.skip_targets: list[str] = []
        self.viewport = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: value or "" for key, value in attrs}
        element_id = values.get("id", "")
        if element_id:
            self.ids.append(element_id)
        if tag == "dialog":
            self.dialogs.append((element_id, values.get("aria-labelledby", "")))
        if tag == "a" and "skip-link" in values.get("class", "").split():
            self.skip_targets.append(values.get("href", ""))
        if tag == "meta" and values.get("name") == "viewport":
            self.viewport = values.get("content", "")


html = read("index.html")
parser = HtmlAudit()
parser.feed(html)
ids = set(parser.ids)
duplicates = sorted({element_id for element_id in parser.ids if parser.ids.count(element_id) > 1})
require(not duplicates, "powtórzone identyfikatory HTML: " + ", ".join(duplicates))
require("width=device-width" in parser.viewport, "brak responsywnego viewportu")
require(parser.skip_targets == ["#main-content"], "link pomijania nie prowadzi do głównej treści")
require('id="main-content" tabindex="-1"' in html, "główna treść nie przyjmuje fokusu")
require(parser.dialogs, "brak dialogów do sprawdzenia")
for dialog_id, labelled_by in parser.dialogs:
    require(bool(dialog_id), "dialog nie ma identyfikatora")
    require(bool(labelled_by), f"dialog {dialog_id} nie ma aria-labelledby")
    for label_id in labelled_by.split():
        require(label_id in ids, f"dialog {dialog_id} wskazuje nieistniejącą etykietę {label_id}")

styles = "\n".join(
    read(path)
    for path in (
        "src/styles/layout.css",
        "src/styles/components.css",
        "src/styles/screens.css",
        "src/styles/dark-mode.css",
    )
)
for width in (1080, 820, 560, 460):
    require(
        re.search(rf"@media\s*\(max-width:\s*{width}px\)", styles) is not None,
        f"brak układu responsywnego dla szerokości {width}px",
    )
require(":focus-visible" in styles, "brak widocznego fokusu klawiatury")
require("prefers-reduced-motion: reduce" in styles, "brak ograniczenia animacji systemowych")
require("prefers-color-scheme: dark" in styles, "brak automatycznego trybu ciemnego")
require("@media print" in styles, "brak arkusza wydruku raportu")
require('data-theme-mode="system"' in html, "start aplikacji nie respektuje motywu systemowego")

manifest = json.loads(read("manifest.json"))
require(manifest.get("display") == "standalone", "PWA nie działa jako samodzielna aplikacja")
require(manifest.get("orientation") == "any", "PWA blokuje zmianę orientacji")

android_root = ET.fromstring(read("android/app/src/main/AndroidManifest.xml"))
activity = android_root.find("./application/activity")
require(activity is not None, "brak aktywności Android")
require(
    activity.attrib.get(ANDROID_NS + "screenOrientation") == "unspecified",
    "Android blokuje zmianę orientacji",
)

gradle = read("android/app/build.gradle")
for name, expected in (("compileSdk", 36), ("targetSdk", 36)):
    match = re.search(rf"\b{name}\s+(\d+)", gradle)
    require(match is not None and int(match.group(1)) >= expected, f"{name} nie obejmuje Androida 16")
min_sdk = re.search(r"\bminSdk\s+(\d+)", gradle)
require(min_sdk is not None and int(min_sdk.group(1)) <= 29, "minSdk nie obejmuje Androida 10")
require("abortOnError true" in gradle, "Android Lint nie zatrzymuje błędnego builda")

android_manifest = read("android/app/src/main/AndroidManifest.xml")
for event in ("BOOT_COMPLETED", "MY_PACKAGE_REPLACED"):
    require(event in android_manifest, f"przypomnienia nie są odtwarzane po {event}")

worker = read("service-worker.js")
for token in (
    "navigationNetworkFirst",
    "jsonNetworkFirst",
    "offlineJsonResponse",
    "REFRESH_APP_RESOURCES",
    "SKIP_WAITING",
):
    require(token in worker, f"brak końcowej obsługi PWA: {token}")

workflow = read(".github/workflows/android-ci.yml")
for token in ("ANDROID_CHECK_REQUIRED", "assembleRelease", "bundleRelease", "run: npm test"):
    require(token in workflow, f"automatyczna kontrola po wysłaniu projektu pomija: {token}")

package = json.loads(read("package.json"))
scripts = package.get("scripts", {})
for script in ("test:migrations", "test:e2e", "test:accessibility", "test:final"):
    require(script in scripts, f"brak skryptu {script}")
require("npm run test:final" in scripts.get("test:web", ""), "npm test pomija testy etapu 12")
for dependency in ("axe-core", "jsdom"):
    require(dependency in package.get("devDependencies", {}), f"brak zależności testowej {dependency}")

for path in (
    "tests/accessibility_axe_test.js",
    "tests/app_dom_e2e_test.js",
    "tests/final_states_runtime_test.js",
    "tests/migration_compatibility_test.js",
):
    require((ROOT / path).is_file(), f"brak testu końcowego {path}")

print(
    "Test macierzy końcowej: OK — responsywność, motywy, orientacja, dostępność, "
    "offline, Android 10–16 i kontrola release są skonfigurowane."
)

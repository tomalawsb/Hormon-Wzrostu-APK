#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit("BŁĄD SYSTEMU WIZUALNEGO: " + message)


def relative_luminance(color: str) -> float:
    channels = [int(color[index : index + 2], 16) / 255 for index in (1, 3, 5)]
    linear = [value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast(first: str, second: str) -> float:
    high, low = sorted((relative_luminance(first), relative_luminance(second)), reverse=True)
    return (high + 0.05) / (low + 0.05)


variables = read("src/styles/variables.css")
components = read("src/styles/components.css")
screens = read("src/styles/screens.css")
dark_mode = read("src/styles/dark-mode.css")
theme = read("src/services/theme/index.js")
schema = read("src/services/storage/schema.js")
sanitizers = read("src/components/injection-site/model.js")
settings_html = read("src/screens/settings/index.html")
index = read("index.html")
android_main = read("android/app/src/main/java/pl/tomaszwolak/dzienniczekhormonuwzrostu/MainActivity.java")

required_tokens = (
    "--primary:",
    "--success:",
    "--danger:",
    "--warning:",
    "--status-given:",
    "--status-skipped:",
    "--space-1:",
    "--space-8:",
    "--font-family:",
    "--focus:",
)
for token in required_tokens:
    require(token in variables, f"brak tokenu {token}")

primary = re.search(r"--primary:\s*(#[0-9a-fA-F]{6})", variables)
given = re.search(r"--status-given:\s*(#[0-9a-fA-F]{6})", variables)
require(primary is not None and contrast(primary.group(1), "#ffffff") >= 4.5,
        "główny przycisk nie ma kontrastu WCAG AA")
require(given is not None and contrast(given.group(1), "#ffffff") >= 4.5,
        "zielony status podania nie ma kontrastu WCAG AA")

for mode in ("system", "light", "dark"):
    require(f'value="{mode}"' in settings_html, f"brak wyboru motywu {mode}")
require('data-settings-target="appearance"' in settings_html, "brak kategorii Wygląd")
require('data-settings-panel="appearance"' in settings_html, "brak panelu Wygląd")
require('id="theme-mode-control"' in settings_html, "brak dostępnej grupy wyboru motywu")
require("prefers-color-scheme: dark" in dark_mode, "tryb automatyczny nie reaguje na telefon")
require(':root[data-theme="dark"]' in dark_mode, "brak jawnego motywu ciemnego")
require("matchMedia('(prefers-color-scheme: dark)')" in theme, "brak nasłuchiwania zmiany motywu telefonu")
require("Configuration.UI_MODE_NIGHT_YES" in android_main, "tło startowe WebView nie respektuje motywu telefonu")
require("persistData()" in theme, "wybór motywu nie jest zapisywany")
require("sanitizeAppearanceSettings" in sanitizers, "ustawienie wyglądu nie jest walidowane")
require("appearance: defaultAppearanceSettings()" in schema, "nowe dane nie mają ustawienia wyglądu")

require(".status-badge--given" in components and "var(--status-given-soft)" in components,
        "wykonane podanie nie używa zielonego statusu")
require(".status-badge--skipped" in components and "var(--status-skipped-soft)" in components,
        "pominięcie nie używa czerwonego statusu")
require(".legend-dot--skipped" in screens and "var(--status-skipped)" in screens,
        "kalendarz nie używa czerwonego statusu pominięcia")

sprite = read("src/components/icon/sprite.html")
defined_icons = set(re.findall(r'<symbol\s+id="icon-([a-z0-9-]+)"', sprite))
require(len(defined_icons) >= 20, "zestaw ikon SVG jest zbyt mały")
static_references = set(re.findall(r'href="#icon-([a-z0-9-]+)"', index))
dynamic_references: set[str] = set()
for source in (ROOT / "src").rglob("*.js"):
    dynamic_references.update(re.findall(r"iconSvg\('([a-z0-9-]+)'", source.read_text(encoding="utf-8")))
missing_icons = (static_references | dynamic_references) - defined_icons
require(not missing_icons, "brak definicji ikon: " + ", ".join(sorted(missing_icons)))
require(".app-icon" in components, "brak wspólnej klasy ikon")
require(screens.count("z-index: 13000") >= 1, "komunikaty są zasłaniane przez warstwy bezpieczeństwa")
toasts = read("src/components/notification/toast.js")
require("dialog[open]" in toasts and "toast-region--dialog" in toasts,
        "błędy nie są przenoszone ponad otwarte okno dialogowe")
require("role', 'alert'" in toasts, "komunikat błędu nie ma pilnego semantycznego alertu")

backup_dialog = read("src/components/dialog/backup.html")
require(re.search(r'id="export-json-button"[\s\S]*?#icon-upload', backup_dialog) is not None,
        "eksport pełnej kopii nie ma strzałki w górę")
require(re.search(r'id="export-profile-json-button"[\s\S]*?#icon-upload', backup_dialog) is not None,
        "eksport profilu nie ma strzałki w górę")
require(re.search(r'id="import-button"[\s\S]*?#icon-download', backup_dialog) is not None,
        "import nie ma strzałki w dół")
require(re.search(r'id="export-report-button"[\s\S]*?#icon-upload', settings_html) is not None,
        "eksport raportu nie ma strzałki w górę")

banned_ui_glyphs = set("⌂▦↺•⇩⌄▣‹›×◎⌁◷✓↻▥ⓘ⌕⟳●⇧↶↑↓")
violations: list[str] = []
for source in list((ROOT / "src").rglob("*.html")) + list((ROOT / "src").rglob("*.js")):
    text = source.read_text(encoding="utf-8")
    found = sorted(banned_ui_glyphs.intersection(text))
    if found:
        violations.append(f"{source.relative_to(ROOT)} ({''.join(found)})")
require(not violations, "pozostały przypadkowe znaki ikon: " + ", ".join(violations))

manifest = json.loads(read("src/html-order.json"))
fragments = [item["file"] for item in manifest["fragments"]]
require("components/icon/sprite.html" in fragments, "sprite ikon nie jest częścią interfejsu")
require(index.count('id="icon-home"') == 1, "sprite ikon jest powielony lub nie został zbudowany")

print(
    "Test systemu wizualnego: OK — "
    f"3 motywy, {len(defined_icons)} ikon SVG, semantyczne statusy i wspólne tokeny"
)

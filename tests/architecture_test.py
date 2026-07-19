#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "src"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit("BŁĄD ARCHITEKTURY: " + message)


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def verify_manifest(path: str, collection_key: str) -> tuple[dict, list[Path]]:
    manifest = json.loads(read(path))
    items = manifest.get(collection_key, [])
    require(items, f"manifest {path} jest pusty")
    filenames = [item.get("file", "") for item in items]
    require(all(filenames), f"manifest {path} zawiera pustą ścieżkę")
    require(len(filenames) == len(set(filenames)), f"manifest {path} zawiera duplikat")
    parts = [(SOURCE_ROOT / filename).resolve() for filename in filenames]
    for filename, part in zip(filenames, parts, strict=True):
        require(SOURCE_ROOT.resolve() in part.parents, f"ścieżka wychodzi poza src: {filename}")
        require(part.is_file(), f"brak pliku zadeklarowanego w {path}: {filename}")
    generated = b"".join(part.read_bytes() for part in parts)
    output = ROOT / manifest.get("output", "")
    require(output.is_file(), f"brak pliku wynikowego manifestu {path}")
    require(generated == output.read_bytes(), f"{output.name} nie odpowiada źródłom")
    return manifest, parts


for directory in (
    "src/core",
    "src/screens/today",
    "src/screens/calendar",
    "src/screens/history",
    "src/screens/profiles",
    "src/screens/settings",
    "src/screens/reports",
    "src/components/dose-card",
    "src/components/ampoule-card",
    "src/components/injection-site",
    "src/components/bottom-navigation",
    "src/components/dialog",
    "src/components/notification",
    "src/components/icon",
    "src/services/storage",
    "src/services/encryption",
    "src/services/notifications",
    "src/services/export",
    "src/services/import",
    "src/services/theme",
    "src/styles",
):
    require((ROOT / directory).is_dir(), f"brak katalogu {directory}")

app_manifest, app_parts = verify_manifest("src/module-order.json", "modules")
html_manifest, html_parts = verify_manifest("src/html-order.json", "fragments")
style_manifest, style_parts = verify_manifest("src/styles/style-order.json", "files")

require(len(app_parts) >= 40, "kod aplikacji nadal jest podzielony zbyt ogólnie")
require(len(html_parts) >= 10, "HTML nadal jest monolitem")
require(len(style_parts) == 5, "CSS nie ma pięciu ustalonych warstw")
require(not (ROOT / "src/app").exists(), "pozostał stary katalog modułów src/app")
require(not list((ROOT / "src/services").rglob("*.html")), "warstwa usług zawiera HTML widoku")

layers = {item.get("layer") for item in app_manifest["modules"]}
require({"core", "screen", "component", "service", "platform"} <= layers, "brak warstwy kodu")

app = read("app.js")
require(app.startswith("(() => {\n  'use strict';"), "app.js nie ma prywatnego zakresu IIFE")
require(app.rstrip().endswith("})();"), "app.js nie zamyka prywatnego zakresu IIFE")

index = read("index.html")
for view_id, owner in (
    ("view-today", "src/screens/today/index.html"),
    ("view-calendar", "src/screens/calendar/index.html"),
    ("view-history", "src/screens/history/index.html"),
    ("view-more", "src/screens/settings/index.html"),
):
    require(index.count(f'id="{view_id}"') == 1, f"widok {view_id} nie jest jednoznaczny")
    require(f'id="{view_id}"' in read(owner), f"widok {view_id} jest poza swoim ekranem")

for function_name, owner in (
    ("renderCalendar", "src/screens/calendar/render.js"),
    ("renderHistory", "src/screens/history/render.js"),
    ("renderSettings", "src/screens/settings/render.js"),
    ("renderToday", "src/screens/today/render.js"),
):
    pattern = rf"function\s+{function_name}\s*\("
    require(re.search(pattern, read(owner)) is not None, f"{function_name} jest poza swoim ekranem")
    definitions = sum(len(re.findall(pattern, path.read_text(encoding="utf-8"))) for path in app_parts)
    require(definitions == 1, f"{function_name} ma {definitions} definicji")

for pure_module in (
    "src/services/storage/schema.js",
    "src/services/import/validation.js",
    "src/components/injection-site/model.js",
    "src/components/ampoule-card/model.js",
):
    source = read(pure_module)
    for forbidden in ("document.", "innerHTML", "textContent", "classList", "el[", "showToast("):
        require(forbidden not in source, f"warstwa danych {pure_module} używa widoku: {forbidden}")

require(":root" in read("src/styles/variables.css"), "zmienne CSS nie są w variables.css")
require(".app-shell" in read("src/styles/layout.css"), "układ nie jest w layout.css")
require(".card" in read("src/styles/components.css"), "komponenty nie są w components.css")
require(".calendar-layout" in read("src/styles/screens.css"), "ekrany nie są w screens.css")
require((ROOT / "src/styles/dark-mode.css").is_file(), "brak warstwy dark-mode.css")

print(
    "Test architektury: OK — "
    f"{len(app_parts)} modułów JS, {len(html_parts)} fragmentów HTML, {len(style_parts)} warstw CSS"
)

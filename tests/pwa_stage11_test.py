#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit("BŁĄD ETAPU 11: " + message)


worker = read("service-worker.js")
runtime = read("src/platform/pwa-runtime.js")
updates = read("src/platform/pwa-updates.js")
html = read("src/screens/settings/index.html")
manifest = json.loads(read("manifest.json"))
package = json.loads(read("package.json"))

for cache_name in (
    "DOCUMENT_CACHE",
    "SCRIPT_CACHE",
    "STYLE_CACHE",
    "DATA_CACHE",
    "STATIC_CACHE",
    "API_CACHE",
):
    require(cache_name in worker, f"brak osobnej strategii/cache: {cache_name}")

require("event.request.mode === 'navigate'" in worker, "brak osobnej obsługi nawigacji HTML")
require("navigationNetworkFirst" in worker, "HTML nie korzysta z network-first")
require("staleWhileRevalidate" in worker, "JS i CSS nie używają stale-while-revalidate")
require("jsonNetworkFirst" in worker, "brak osobnej obsługi lokalnych plików JSON")
require("apiNetworkFirst" in worker, "brak osobnej obsługi API")
require("offlineJsonResponse" in worker, "brak poprawnej odpowiedzi JSON w trybie offline")
require(
    "'Content-Type': 'application/json; charset=utf-8'" in worker,
    "fallback JSON ma nieprawidłowy Content-Type",
)
require(
    worker.count("OFFLINE_DOCUMENT_URL") == 2,
    "fallback index.html jest używany poza obsługą nawigacji",
)
require("REFRESH_APP_RESOURCES" in worker, "brak ręcznego odświeżania cache")
require("GET_PWA_STATUS" in worker, "brak diagnostyki gotowości offline")
require("SKIP_WAITING" in worker, "brak kontrolowanego włączania nowej wersji")

install_handler = re.search(
    r"self\.addEventListener\('install'.*?\n\}\);", worker, re.DOTALL
)
require(install_handler is not None, "brak zdarzenia install")
require("skipWaiting" not in install_handler.group(0), "nowa wersja aktywuje się bez informacji dla użytkownika")

for token in (
    "updateViaCache: 'none'",
    "setupPwaUpdateTracking",
    "serviceWorkerRegistration.update()",
    "updatefound",
    "controllerchange",
    "applyPwaUpdate",
    "refreshPwaResources",
):
    require(token in runtime + updates, f"brak mechanizmu aktualizacji PWA: {token}")

for element_id in (
    "pwa-maintenance-controls",
    "pwa-worker-status",
    "pwa-cache-status",
    "pwa-online-status",
    "pwa-install-status",
    "refresh-pwa-resources-button",
    "apply-pwa-update-button",
):
    require(f'id="{element_id}"' in html, f"brak kontrolki PWA: {element_id}")

require(manifest.get("id") == "./", "manifest ma nieprawidłowe id")
require(manifest.get("start_url") == "./", "manifest ma nieprawidłowy start_url")
require(manifest.get("scope") == "./", "manifest ma nieprawidłowy scope")
require(manifest.get("display") == "standalone", "PWA nie używa trybu standalone")
require(manifest.get("name") and manifest.get("short_name"), "manifest nie ma nazwy aplikacji")

icon_sizes: set[int] = set()
for icon in manifest.get("icons", []):
    path = ROOT / str(icon.get("src", "")).removeprefix("./")
    require(path.is_file(), f"brak ikony {path.name}")
    data = path.read_bytes()
    require(data[:8] == b"\x89PNG\r\n\x1a\n" and len(data) >= 24, f"{path.name} nie jest PNG")
    width, height = struct.unpack(">II", data[16:24])
    require(width == height, f"ikona {path.name} nie jest kwadratowa")
    declared = str(icon.get("sizes", "")).split("x", 1)[0]
    require(declared.isdigit() and int(declared) == width, f"zły rozmiar manifestu dla {path.name}")
    icon_sizes.add(width)
require({192, 512}.issubset(icon_sizes), "brak ikon 192x192 i 512x512")

scripts = package.get("scripts", {})
require("test:pwa-stage11" in scripts, "brak testu etapu 11 w package.json")
require("test:pwa-stage11" in scripts.get("test:web", ""), "pełne testy pomijają etap 11")

print(
    "Test etapu 11: OK — osobne cache, bezpieczny fallback offline, aktualizacje i instalowalność PWA"
)

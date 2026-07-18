#!/usr/bin/env python3
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = ROOT / "www"
ANDROID_WEB_DIR = ROOT / "android" / "app" / "src" / "main" / "assets" / "web"
ASSETS = (
    "index.html",
    "app.js",
    "native-bridge.js",
    "style.css",
    "manifest.json",
    "app-version.json",
    "service-worker.js",
    "icon-192.png",
    "icon-512.png",
)


def copy_assets(destination: Path) -> None:
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    for name in ASSETS:
        shutil.copy2(ROOT / name, destination / name)


def main() -> int:
    missing = [name for name in ASSETS if not (ROOT / name).is_file()]
    if missing:
        raise SystemExit("Brak plików web: " + ", ".join(missing))
    copy_assets(WEB_DIR)
    copy_assets(ANDROID_WEB_DIR)
    print(f"Przygotowano {len(ASSETS)} plików w: {WEB_DIR}")
    print(f"Zsynchronizowano zasoby Androida w: {ANDROID_WEB_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

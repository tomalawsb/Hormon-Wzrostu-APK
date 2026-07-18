#!/usr/bin/env python3
from __future__ import annotations

import json
import threading
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit("BŁĄD PWA: " + message)


def fetch(base_url: str, path: str) -> tuple[bytes, str]:
    with urllib.request.urlopen(base_url + path, timeout=5) as response:
        require(response.status == 200, f"HTTP {response.status} dla {path}")
        return response.read(), response.headers.get_content_type()


def main() -> int:
    handler = lambda *args, **kwargs: QuietHandler(*args, directory=str(ROOT), **kwargs)
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_port}"

    try:
        index_bytes, index_type = fetch(base_url, "/index.html")
        manifest_bytes, manifest_type = fetch(base_url, "/manifest.json")
        service_worker_bytes, _ = fetch(base_url, "/service-worker.js")
        version_bytes, version_type = fetch(base_url, "/app-version.json")
        fetch(base_url, "/app.js")
        fetch(base_url, "/native-bridge.js")
        fetch(base_url, "/style.css")

        index = index_bytes.decode("utf-8")
        service_worker = service_worker_bytes.decode("utf-8")
        manifest = json.loads(manifest_bytes)
        version = json.loads(version_bytes)

        require(index_type == "text/html", "index.html ma nieprawidłowy Content-Type")
        require(manifest_type in {"application/manifest+json", "application/json"}, "manifest ma nieprawidłowy Content-Type")
        require(version_type == "application/json", "app-version.json ma nieprawidłowy Content-Type")
        require('rel="manifest" href="./manifest.json"' in index, "brak podpiętego manifestu")
        require("navigator.serviceWorker.register('./service-worker.js')" in (ROOT / "app.js").read_text(encoding="utf-8"), "brak rejestracji service workera")
        require("./index.html" in service_worker, "service worker nie buforuje strony startowej")
        require(manifest.get("display") == "standalone", "manifest nie uruchamia PWA w trybie standalone")
        require(manifest.get("start_url") == "./", "nieprawidłowy start_url")
        require(manifest.get("scope") == "./", "nieprawidłowy scope")
        require(version.get("version"), "brak numeru wersji")

        icons = manifest.get("icons", [])
        require(len(icons) >= 2, "manifest powinien zawierać co najmniej dwie ikony")
        for icon in icons:
            src = str(icon.get("src", "")).removeprefix(".")
            require(src.startswith("/"), f"nieprawidłowa ścieżka ikony: {src}")
            body, content_type = fetch(base_url, src)
            require(body, f"pusta ikona: {src}")
            require(content_type == "image/png", f"ikona {src} nie jest PNG")

        print(f"Test HTTP PWA: OK — {manifest['name']}")
        return 0
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    raise SystemExit(main())

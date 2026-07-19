#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION_RE = re.compile(r"(?:\d+\.\d+\.\d+|\d+\.\d+-\d{10})")


def fail(message: str) -> None:
    raise SystemExit(f"BŁĄD WERSJI: {message}")


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def replace_required(text: str, pattern: str, replacement: str, description: str) -> str:
    updated, count = re.subn(pattern, replacement, text, flags=re.MULTILINE)
    if count < 1:
        fail(f"nie znaleziono miejsca do aktualizacji: {description}")
    return updated


def main() -> int:
    sync_existing = len(sys.argv) == 4 and sys.argv[3] == "--sync"
    if len(sys.argv) not in (3, 4) or (len(sys.argv) == 4 and not sync_existing):
        fail(
            "użycie: set_version.py WERSJA VERSION_CODE [--sync], "
            "np. 2.0-1907262007 1907262007"
        )

    version_name = sys.argv[1].strip()
    version_code_raw = sys.argv[2].strip()
    if not VERSION_RE.fullmatch(version_name):
        fail("wersja musi mieć format X.Y.Z albo X.Y-DDMMRRHHMM, np. 2.0-1907262007")
    if not version_code_raw.isdigit() or int(version_code_raw) < 1:
        fail("versionCode musi być dodatnią liczbą całkowitą")
    version_code = int(version_code_raw)

    version_file = ROOT / "android" / "version.properties"
    current_code = 0
    if version_file.is_file():
        match = re.search(
            r"^VERSION_CODE=(\d+)$",
            version_file.read_text(encoding="utf-8"),
            re.MULTILINE,
        )
        if match:
            current_code = int(match.group(1))
    if sync_existing:
        if version_code < current_code:
            fail(
                f"synchronizowana wersja ({version_code}) nie może być starsza "
                f"od obecnej ({current_code})"
            )
    elif version_code <= current_code:
        fail(f"nowy versionCode ({version_code}) musi być większy od obecnego ({current_code})")

    package_path = ROOT / "package.json"
    package = load_json(package_path)
    package_version = (
        version_name
        if re.fullmatch(r"\d+\.\d+\.\d+", version_name)
        else version_name.replace("-", ".0-", 1)
    )
    package["version"] = package_version
    save_json(package_path, package)

    lock_path = ROOT / "package-lock.json"
    lock = load_json(lock_path)
    lock["version"] = package_version
    lock.setdefault("packages", {}).setdefault("", {})["version"] = package_version
    save_json(lock_path, lock)

    version_file.write_text(
        f"VERSION_NAME={version_name}\nVERSION_CODE={version_code}\n",
        encoding="utf-8",
    )

    shell_path = ROOT / "src" / "shell" / "start.html"
    shell = shell_path.read_text(encoding="utf-8")
    shell = replace_required(
        shell,
        r"<title>Dzienniczek Hormonu v[^<]+</title>",
        f"<title>Dzienniczek Hormonu v{version_name}</title>",
        "tytuł strony w źródle HTML",
    )
    shell = replace_required(
        shell,
        r'(<span class="brand-version">)v[^<]+(</span>)',
        rf"\1v{version_name}\2",
        "etykieta wersji w źródle HTML",
    )
    shell_path.write_text(shell, encoding="utf-8")

    settings_html_path = ROOT / "src" / "screens" / "settings" / "index.html"
    settings_html = settings_html_path.read_text(encoding="utf-8")
    settings_html = replace_required(
        settings_html,
        r'(<strong id="settings-version-label">)v[^<]+(</strong>)',
        rf"\1v{version_name}\2",
        "wersja w źródle ustawień",
    )
    settings_html_path.write_text(settings_html, encoding="utf-8")

    index_path = ROOT / "index.html"
    index = index_path.read_text(encoding="utf-8")
    index = replace_required(
        index,
        r"<title>Dzienniczek Hormonu v[^<]+</title>",
        f"<title>Dzienniczek Hormonu v{version_name}</title>",
        "tytuł wygenerowanej strony",
    )
    index = replace_required(
        index,
        r'(<span class="brand-version">)v[^<]+(</span>)',
        rf"\1v{version_name}\2",
        "etykieta wersji wygenerowanej strony",
    )
    index = replace_required(
        index,
        r'(<strong id="settings-version-label">)v[^<]+(</strong>)',
        rf"\1v{version_name}\2",
        "wersja w wygenerowanych ustawieniach",
    )
    index_path.write_text(index, encoding="utf-8")

    manifest_path = ROOT / "manifest.json"
    manifest = load_json(manifest_path)
    manifest["name"] = f"Dzienniczek Hormonu v{version_name}"
    save_json(manifest_path, manifest)

    save_json(ROOT / "app-version.json", {"version": version_name})

    service_worker_path = ROOT / "service-worker.js"
    service_worker = service_worker_path.read_text(encoding="utf-8")
    service_worker = replace_required(
        service_worker,
        r"^const CACHE_VERSION = 'v[^']+';$",
        f"const CACHE_VERSION = 'v{version_name}';",
        "wersja cache service workera",
    )
    service_worker = replace_required(
        service_worker,
        r"^const CACHE_NAMESPACE = 'dzienniczek-hormonu-v[^']+';$",
        f"const CACHE_NAMESPACE = 'dzienniczek-hormonu-v{version_name}';",
        "przestrzeń nazw cache service workera",
    )
    service_worker_path.write_text(service_worker, encoding="utf-8")

    readme_path = ROOT / "README.md"
    readme = readme_path.read_text(encoding="utf-8")
    readme = replace_required(
        readme,
        r"^\*\*Wersja: v[^*]+\*\*$",
        f"**Wersja: v{version_name}**",
        "bieżąca wersja w README",
    )
    readme_path.write_text(readme, encoding="utf-8")

    action = "Zsynchronizowano" if sync_existing else "Ustawiono"
    print(f"{action} wersję {version_name}, versionCode {version_code}.")
    print("Uruchom npm run prepare:web oraz npm test przed budowaniem.")
    print(f"Po wysłaniu na main GitHub automatycznie utworzy wydanie v{version_name}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

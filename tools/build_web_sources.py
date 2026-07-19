#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


TARGETS = {
    "app": ("src/module-order.json", "modules"),
    "html": ("src/html-order.json", "fragments"),
    "styles": ("src/styles/style-order.json", "files"),
}


def load_manifest(root: Path, target: str) -> tuple[dict, str]:
    relative_path, collection_key = TARGETS[target]
    manifest_path = root / relative_path
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    return manifest, collection_key


def source_path(root: Path, relative_path: str) -> Path:
    source_root = (root / "src").resolve()
    path = (source_root / relative_path).resolve()
    if source_root != path and source_root not in path.parents:
        raise SystemExit(f"Błąd: ścieżka wychodzi poza src: {relative_path}")
    return path


def build_target(root: Path, target: str, check_only: bool = False) -> bool:
    manifest, collection_key = load_manifest(root, target)
    output_path = root / manifest["output"]
    parts: list[bytes] = []
    seen: set[str] = set()

    for item in manifest[collection_key]:
        filename = item["file"]
        if filename in seen:
            raise SystemExit(f"Błąd: plik występuje więcej niż raz: {filename}")
        seen.add(filename)
        path = source_path(root, filename)
        if not path.is_file():
            raise SystemExit(f"Błąd: brak źródła: {path.relative_to(root)}")
        parts.append(path.read_bytes())

    generated = b"".join(parts)
    current = output_path.read_bytes() if output_path.is_file() else b""
    digest = hashlib.sha256(generated).hexdigest()

    if check_only:
        if generated != current:
            print(f"NIEZGODNOŚĆ: {output_path.name} nie odpowiada manifestowi {target}.")
            print(f" SHA-256 źródeł: {digest}")
            print(
                " SHA-256 pliku:   "
                + (hashlib.sha256(current).hexdigest() if current else "brak")
            )
            return False
        print(f"Spójność {output_path.name}: OK ({len(parts)} części, {len(generated)} bajtów)")
        return True

    output_path.write_bytes(generated)
    print(f"Zbudowano {output_path.name} z {len(parts)} części ({len(generated)} bajtów).")
    print(f"SHA-256: {digest}")
    return True


def build(root: Path, check_only: bool = False, target: str = "all") -> int:
    selected = TARGETS if target == "all" else (target,)
    valid = True
    for current_target in selected:
        valid = build_target(root, current_target, check_only) and valid
    return 0 if valid else 1


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Buduje app.js, index.html i style.css z logicznych części źródłowych."
    )
    parser.add_argument("--check", action="store_true", help="Sprawdza spójność bez zapisu.")
    parser.add_argument("--root", default=None, help="Katalog główny projektu.")
    parser.add_argument(
        "--target",
        choices=("all", *TARGETS.keys()),
        default="all",
        help="Wybrane źródło do zbudowania.",
    )
    args = parser.parse_args()
    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parents[1]
    raise SystemExit(build(root, args.check, args.target))


if __name__ == "__main__":
    main()

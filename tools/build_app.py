#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import hashlib
from pathlib import Path


def build(root: Path, check_only: bool = False) -> int:
    manifest_path = root / 'src' / 'app' / 'module-order.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    module_dir = manifest_path.parent
    output_path = root / manifest['output']

    parts: list[bytes] = []
    seen: set[str] = set()
    for item in manifest['modules']:
        filename = item['file']
        if filename in seen:
            raise SystemExit(f'Błąd: moduł występuje więcej niż raz: {filename}')
        seen.add(filename)
        path = module_dir / filename
        if not path.is_file():
            raise SystemExit(f'Błąd: brak modułu: {path.relative_to(root)}')
        parts.append(path.read_bytes())

    generated = b''.join(parts)
    current = output_path.read_bytes() if output_path.is_file() else b''

    if check_only:
        if generated != current:
            print('NIEZGODNOŚĆ: app.js nie odpowiada modułom źródłowym.')
            print(f' SHA-256 modułów: {hashlib.sha256(generated).hexdigest()}')
            print(f' SHA-256 app.js:  {hashlib.sha256(current).hexdigest() if current else "brak"}')
            return 1
        print(f'Spójność modułów: OK ({len(parts)} modułów, {len(generated)} bajtów)')
        return 0

    output_path.write_bytes(generated)
    print(f'Zbudowano {output_path.name} z {len(parts)} modułów ({len(generated)} bajtów).')
    print(f'SHA-256: {hashlib.sha256(generated).hexdigest()}')
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description='Buduje app.js z modułów źródłowych.')
    parser.add_argument('--check', action='store_true', help='Tylko sprawdza spójność bez zapisywania app.js.')
    parser.add_argument('--root', default=None, help='Katalog główny projektu.')
    args = parser.parse_args()
    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parents[1]
    raise SystemExit(build(root, args.check))


if __name__ == '__main__':
    main()

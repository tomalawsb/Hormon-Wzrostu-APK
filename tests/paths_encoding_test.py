#!/usr/bin/env python3
"""Polskie znaki i spacje w ścieżkach: skrypty Windows i uruchamianie Pythona."""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LITERAL_CMDLETS = ("Test-Path", "Get-Item ", "Get-ChildItem", "Remove-Item", "Copy-Item",
                   "Set-Location", "Get-Content", "Expand-Archive", "Get-FileHash")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit("BŁĄD ŚCIEŻEK: " + message)


# 1. Pliki .cmd: tylko ASCII, CRLF, UTF-8 w konsoli, ścieżki z %~dp0 w cudzysłowach.
cmd_files = sorted(ROOT.glob("*.cmd"))
require({p.name for p in cmd_files} == {"BUILD.cmd", "URUCHOM.cmd", "KONFIGURUJ_PODPIS.cmd", "WYSYLAJ_NA_GITHUB.cmd"},
        "nieoczekiwany zestaw plików .cmd: " + ", ".join(p.name for p in cmd_files))
for path in cmd_files:
    raw = path.read_bytes()
    require(raw.isascii(), f"{path.name} zawiera znaki spoza ASCII")
    require(b"\n" not in raw.replace(b"\r\n", b""), f"{path.name} nie ma końców linii CRLF")
    text = raw.decode("ascii")
    require("chcp 65001" in text, f"{path.name} nie ustawia UTF-8 (chcp 65001)")
    require('cd /d "%~dp0"' in text, f"{path.name} nie przechodzi do własnego folderu")
    require('-File "%~dp0tools\\dzienniczek.ps1"' in text, f"{path.name} nie wywołuje skryptu w cudzysłowie")
    for line in text.splitlines():
        if not line.lower().startswith("cd /d "):
            require('"%~dp0"' not in line, f'{path.name} przekazuje "%~dp0" jako argument (końcowy \\ psuje cudzysłów)')
    for line in text.splitlines():
        require(re.search(r"(?<![\"\w])%~dp0", line) is None or line.lstrip().lower().startswith(("rem", "echo", "cd /d")),
                f"{path.name}: ścieżka %~dp0 bez cudzysłowu: {line}")

# 2. Pliki .ps1: UTF-8 z BOM, CRLF, UTF-8 w konsoli, -LiteralPath, alias ASCII (junction).
ps_files = sorted(p for p in ROOT.rglob("*.ps1") if "node_modules" not in p.parts)
require([p.relative_to(ROOT).as_posix() for p in ps_files] == ["tools/dzienniczek.ps1"], "oczekiwano jednego skryptu .ps1")
for path in ps_files:
    raw = path.read_bytes()
    require(raw.startswith(b"\xef\xbb\xbf"), f"{path.name} nie ma BOM UTF-8")
    require(b"\n" not in raw.replace(b"\r\n", b""), f"{path.name} nie ma końców linii CRLF")
    text = raw[3:].decode("utf-8")
    for token in ("[Console]::OutputEncoding", "$env:PYTHONUTF8 = '1'", "$env:PYTHONIOENCODING",
                  "Junction", "mklink /J", "rmdir", "[char]0x015A", "$env:DH_PYTHON"):
        require(token in text, f"{path.name} nie zawiera: {token}")
    for number, line in enumerate(text.splitlines(), 1):
        code = line.split("#", 1)[0]
        if any(cmdlet in code for cmdlet in LITERAL_CMDLETS):
            require("-LiteralPath" in code, f"{path.name}:{number} bez -LiteralPath: {line.strip()}")
        require("Remove-Item" not in code or "$alias" not in code.lower(), f"{path.name}:{number} usuwa alias rekursywnie")
    require("'tools/build_project.py', '--project', '.'" in text, "builder nie dostaje ścieżki względnej projektu")

# 3. Skrypty npm: bez ścieżek bezwzględnych; Python przez tools/run_python.js ze ścieżką względną.
scripts = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["scripts"]
for name, command in scripts.items():
    require(re.search(r"(?:^|\s)(?:[A-Za-z]:[\\/]|/)", command) is None, f"skrypt npm {name} ma ścieżkę bezwzględną")
    for match in re.finditer(r"(\S+\.py)\b", command):
        require("run_python.js " + match.group(1) in command, f"skrypt npm {name} uruchamia Pythona bezpośrednio")

# 4. run_python.js z katalogu z polskimi znakami i spacjami.
with tempfile.TemporaryDirectory(prefix="dh-ścieżki ") as temporary:
    project = Path(temporary) / "Środowiska ąęś" / "projekt Ś z spacją"
    (project / "tools").mkdir(parents=True)
    shutil.copy2(ROOT / "tools/run_python.js", project / "tools/run_python.js")
    (project / "tools/echo_args.py").write_text(
        "import json, os, sys\n"
        "json.dump({'argv': sys.argv, 'cwd': os.getcwd(), 'utf8': os.environ.get('PYTHONUTF8'),"
        " 'io': os.environ.get('PYTHONIOENCODING'), 'flag': sys.flags.utf8_mode},"
        " open('wynik.json', 'w', encoding='utf-8'), ensure_ascii=False)\n",
        encoding="utf-8",
    )
    env = dict(os.environ, DH_PYTHON=sys.executable)
    for script_argument in ("tools/echo_args.py", str(project / "tools/echo_args.py")):
        result = subprocess.run(["node", str(project / "tools/run_python.js"), script_argument, "ą ę"],
                                cwd=temporary, env=env, capture_output=True, text=True, encoding="utf-8")
        require(result.returncode == 0, "run_python.js nie uruchomił skryptu: " + result.stderr)
        output = json.loads((project / "wynik.json").read_text(encoding="utf-8"))
        require(output["argv"][0] == "tools/echo_args.py", f"skrypt nie dostał ścieżki względnej: {output['argv'][0]}")
        require(output["argv"][0].isascii(), "ścieżka skryptu zawiera znaki spoza ASCII")
        require(output["argv"][1:] == ["ą ę"], "argumenty skryptu zostały zmienione")
        require(Path(output["cwd"]).resolve() == project.resolve(), "cwd nie jest katalogiem projektu")
        require(output["utf8"] == "1" and output["flag"] == 1, "Python nie działa w trybie UTF-8")
        require(output["io"] == "utf-8", "brak PYTHONIOENCODING=utf-8")
    source = (ROOT / "tools/run_python.js").read_text(encoding="utf-8")
    require("shell: false" in source, "run_python.js nie może używać powłoki")

print("Ścieżki z polskimi znakami: OK — .cmd ASCII/CRLF, .ps1 BOM/CRLF/-LiteralPath/alias ASCII, Python ze ścieżką względną i UTF-8.")

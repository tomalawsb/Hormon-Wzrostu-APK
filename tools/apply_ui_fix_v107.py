#!/usr/bin/env python3
from __future__ import annotations

import re
import subprocess
import sys
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET_VERSION = "1.0.7"
TARGET_CODE = 3908
STYLE_MARKER = "/* Wersja 1.0.7: poprawa szerokiego ekranu i widoczne aktualizacje */"


def fail(message: str) -> None:
    raise SystemExit(f"BŁĄD POPRAWKI UI: {message}")


def current_version() -> tuple[str, int]:
    path = ROOT / "android" / "version.properties"
    text = path.read_text(encoding="utf-8")
    name_match = re.search(r"^VERSION_NAME=(.+)$", text, re.MULTILINE)
    code_match = re.search(r"^VERSION_CODE=(\d+)$", text, re.MULTILINE)
    if not name_match or not code_match:
        fail("nie można odczytać android/version.properties")
    return name_match.group(1).strip(), int(code_match.group(1))


def update_version() -> None:
    version_name, version_code = current_version()
    if version_name == TARGET_VERSION and version_code == TARGET_CODE:
        return
    if version_code >= TARGET_CODE:
        fail(
            f"projekt ma już wersję {version_name} / {version_code}; "
            f"poprawka oczekuje wersji niższej niż {TARGET_VERSION} / {TARGET_CODE}"
        )
    subprocess.run(
        [sys.executable, str(ROOT / "tools" / "set_version.py"), TARGET_VERSION, str(TARGET_CODE)],
        cwd=ROOT,
        check=True,
    )


def patch_style() -> None:
    path = ROOT / "style.css"
    text = path.read_text(encoding="utf-8")
    if STYLE_MARKER in text:
        return

    text += """

/* Wersja 1.0.7: poprawa szerokiego ekranu i widoczne aktualizacje */
@media (min-width: 821px) {
  .action-card {
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
  }
  .action-card__content {
    width: 100%;
    min-width: 0;
  }
  .action-card__actions {
    width: 100%;
    justify-content: flex-start;
    align-items: stretch;
  }
  .action-card__actions .button {
    flex: 0 1 auto;
    max-width: 100%;
  }
}

.settings-update-box--global {
  margin: 0 0 18px;
  padding: 18px;
  border-color: rgba(22, 184, 165, .32);
  background: linear-gradient(135deg, rgba(230, 248, 244, .96), rgba(255, 255, 255, .98));
  box-shadow: var(--shadow-soft);
}
.settings-update-box--global > strong {
  font-size: 1.08rem;
}

@media (max-width: 820px) {
  .settings-update-box--global {
    margin-bottom: 16px;
    padding: 16px;
  }
  .settings-update-box--global .dialog-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
  .settings-update-box--global .button {
    width: 100%;
  }
}
"""
    path.write_text(text, encoding="utf-8")


def patch_index() -> None:
    path = ROOT / "index.html"
    text = path.read_text(encoding="utf-8")

    text = text.replace(
        "<span><strong>Zgody i informacje</strong><small>Uprawnienia, instalacja i zasady</small></span>",
        "<span><strong>Aktualizacje i informacje</strong><small>Wersja aplikacji, aktualizacje i zgody</small></span>",
    )
    text = text.replace(
        "Przycisk sprawdzi GitHub i automatycznie rozpocznie pobieranie nowszego APK.",
        "Sprawdza najnowsze wydanie na GitHubie. Gdy jest dostępne, rozpocznie pobieranie pliku APK.",
    )

    if "settings-update-box--global" not in text:
        pattern = re.compile(
            r"\n\s*<div class=\"settings-update-box\">.*?</div>\s*(?=<button id=\"settings-install-button\")",
            re.DOTALL,
        )
        match = pattern.search(text)
        if not match:
            fail("nie znaleziono panelu aktualizacji w index.html")

        block = textwrap.dedent(match.group(0)).strip()
        block = block.replace(
            'class="settings-update-box"',
            'class="settings-update-box settings-update-box--global card"',
            1,
        )
        text = text[: match.start()] + "\n" + text[match.end() :]

        anchor = '          <div id="settings-layout" class="settings-layout">'
        if anchor not in text:
            fail("nie znaleziono początku układu ustawień")
        block = textwrap.indent(block, "          ")
        text = text.replace(anchor, f"{block}\n\n{anchor}", 1)

    path.write_text(text, encoding="utf-8")


def main() -> int:
    update_version()
    patch_style()
    patch_index()
    print("Zastosowano poprawkę interfejsu 1.0.7 / 3908.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

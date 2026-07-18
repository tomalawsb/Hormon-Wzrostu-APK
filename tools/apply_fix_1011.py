#!/usr/bin/env python3
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, pattern: str, replacement: str, label: str, flags=re.S) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"Nie udało się poprawić: {label} (znaleziono {count})")
    return updated


# 1. Wersja
subprocess.run([sys.executable, str(ROOT / "tools/set_version.py"), "1.0.11", "3912"], check=True)

# 2. Ustawienia: aktualizacje wyłącznie w kategorii Aktualizacje i informacje.
index_path = ROOT / "index.html"
index = index_path.read_text(encoding="utf-8")

update_box_pattern = r'''\n\s*<div class="settings-update-box settings-update-box--global card">.*?</div>\s*\n\s*<div id="settings-layout"'''
index = replace_once(index, update_box_pattern, '\n\n          <div id="settings-layout"', "usunięcie globalnego panelu aktualizacji")

update_panel = '''
                    <div class="settings-update-box settings-update-box--global">
                      <strong>Aktualizacje aplikacji</strong>
                      <div class="settings-version-row">
                        <span>Zainstalowana wersja</span>
                        <strong id="settings-version-label">v1.0.11</strong>
                      </div>
                      <p id="update-status" class="muted">Sprawdź, czy na GitHubie jest nowsza wersja aplikacji.</p>
                      <div class="dialog-actions dialog-actions--start">
                        <button id="check-update-button" class="button button--primary button--small" type="button">Sprawdź aktualizacje</button>
                        <button id="download-update-button" class="button button--secondary button--small is-hidden" type="button">Pobierz ponownie</button>
                      </div>
                    </div>
'''

# Usuń ewentualny stary panel z sekcji informacji, aby nie dublować identyfikatorów.
index = re.sub(r'\s*<div class="settings-update-box(?: settings-update-box--global)?">.*?</div>\s*', '\n', index, flags=re.S)

permissions_marker = r'(<section class="settings-panel" data-settings-panel="permissions-info" role="tabpanel" hidden>\s*<article class="card settings-card[^>]*>)'
index = replace_once(index, permissions_marker, r'\1' + update_panel, "dodanie aktualizacji do właściwej kategorii")

# 3. Ampułki: ważna akcja na górze, krótki opis, reszta ustawień poniżej.
ampoule_start = index.index('<section class="settings-panel" data-settings-panel="ampoules"')
ampoule_end = index.index('<section class="settings-panel" data-settings-panel="reminders"', ampoule_start)
ampoule = index[ampoule_start:ampoule_end]

ampoule = ampoule.replace(
    '<p class="muted">Ustaw datę rozpoczęcia obecnej ampułki i jej numer. Na tej podstawie aplikacja pokaże, ile leku zostanie po kolejnych podaniach.</p>',
    '<p class="muted">Zarządzaj aktualną i odłożonymi ampułkami. Stan leku jest liczony wyłącznie na podstawie zapisanych podań.</p>\n'
    '                    <div class="ampoule-primary-action">\n'
    '                      <div>\n'
    '                        <strong>Chcesz odłożyć obecną ampułkę?</strong>\n'
    '                        <span>Odłożona ampułka zachowa pozostałą ilość leku i będzie można do niej później wrócić.</span>\n'
    '                      </div>\n'
    '                      <button id="ampoule-new-button" class="button button--primary" type="button">Odłóż aktywną i rozpocznij nową</button>\n'
    '                    </div>\n'
    '                    <div class="ampoule-settings-heading">\n'
    '                      <strong>Ustawienia bieżącej ampułki</strong>\n'
    '                      <span>Data otwarcia, numer, pojemność i zużycie na jedno podanie.</span>\n'
    '                    </div>'
)
ampoule = ampoule.replace(
    '                      <button id="ampoule-new-button" class="button button--secondary button--small" type="button">Odłóż aktywną i rozpocznij nową</button>\n',
    ''
)
index = index[:ampoule_start] + ampoule + index[ampoule_end:]
index_path.write_text(index, encoding="utf-8")

# 4. CSS: Historia bez poziomego rozpychania i nawigacja zawsze nad treścią.
style_path = ROOT / "style.css"
style = style_path.read_text(encoding="utf-8")
style += r'''

/* Wersja 1.0.11: stabilna Historia i czytelne zarządzanie ampułką */
@media (max-width: 820px) {
  html, body, .app-shell, .app-content, main, .view,
  #view-history, .history-card, .history-table-wrap {
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  html, body { overflow-x: hidden; }

  #view-history {
    overflow-x: clip;
    padding-bottom: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom) + 18px);
  }

  .history-card {
    overflow: hidden;
  }

  .history-table-wrap {
    overflow: visible !important;
  }

  .history-table {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    table-layout: fixed;
  }

  .history-table tbody,
  .history-table tr,
  .history-table td {
    min-width: 0;
    max-width: 100%;
  }

  .history-table td > * {
    min-width: 0;
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  .mobile-nav {
    position: fixed !important;
    z-index: 9999 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    display: grid !important;
    transform: none !important;
  }

  .ampoule-primary-action {
    display: grid;
    gap: 14px;
    padding: 17px;
    border: 2px solid rgba(22, 184, 165, .42);
    border-radius: 18px;
    background: linear-gradient(135deg, #e9faf6, #ffffff);
    box-shadow: var(--shadow-soft);
  }

  .ampoule-primary-action > div {
    display: grid;
    gap: 5px;
  }

  .ampoule-primary-action strong { font-size: 1.12rem; }
  .ampoule-primary-action span { color: var(--muted); line-height: 1.45; }
  .ampoule-primary-action .button { width: 100%; min-height: 52px; }

  .ampoule-settings-heading {
    display: grid;
    gap: 4px;
    margin-top: 8px;
    padding-top: 18px;
    border-top: 1px solid var(--line);
  }

  .ampoule-settings-heading strong { font-size: 1.05rem; }
  .ampoule-settings-heading span { color: var(--muted); line-height: 1.4; }
}
'''
style_path.write_text(style, encoding="utf-8")

print("Zastosowano poprawki 1.0.11.")

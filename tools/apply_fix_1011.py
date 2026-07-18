#!/usr/bin/env python3
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

subprocess.run([sys.executable, str(ROOT / "tools/set_version.py"), "1.0.11", "3912"], check=True)

index_path = ROOT / "index.html"
index = index_path.read_text(encoding="utf-8")

old_description = (
    '<p class="muted">Ustaw datę rozpoczęcia obecnej ampułki i jej numer. '
    'Na tej podstawie aplikacja pokaże, ile leku zostanie po kolejnych podaniach.</p>'
)
new_description = (
    '<p class="muted">Zarządzaj aktualną i odłożonymi ampułkami. '
    'Stan leku jest liczony na podstawie zapisanych podań.</p>'
)
if old_description in index:
    index = index.replace(old_description, new_description, 1)

runtime_fix = r'''
<script id="runtime-fix-1011">
document.addEventListener('DOMContentLoaded', () => {
  const updateBox = document.querySelector('.settings-update-box--global');
  const infoCard = document.querySelector('[data-settings-panel="permissions-info"] .settings-card');
  if (updateBox && infoCard) infoCard.prepend(updateBox);

  const ampouleCard = document.querySelector('[data-settings-panel="ampoules"] .settings-card');
  const ampouleButton = document.getElementById('ampoule-new-button');
  const formGrid = ampouleCard?.querySelector('.form-grid');
  if (ampouleCard && ampouleButton && formGrid && !document.querySelector('.ampoule-primary-action')) {
    const box = document.createElement('div');
    box.className = 'ampoule-primary-action';
    box.innerHTML = '<div><strong>Odłóż obecną ampułkę</strong><span>Zachowasz pozostałą ilość leku i później będzie można wrócić do tej ampułki.</span></div>';
    ampouleButton.className = 'button button--primary';
    box.appendChild(ampouleButton);
    ampouleCard.insertBefore(box, formGrid);

    const heading = document.createElement('div');
    heading.className = 'ampoule-settings-heading';
    heading.innerHTML = '<strong>Ustawienia bieżącej ampułki</strong><span>Data otwarcia, numer, pojemność i zużycie na jedno podanie.</span>';
    ampouleCard.insertBefore(heading, formGrid);
  }
});
</script>
'''
if 'id="runtime-fix-1011"' not in index:
    index = index.replace('</body>', runtime_fix + '\n</body>', 1)

index_path.write_text(index, encoding="utf-8")

style_path = ROOT / "style.css"
style = style_path.read_text(encoding="utf-8")
css_marker = '/* Wersja 1.0.11: stabilna Historia i ampułki */'
if css_marker not in style:
    style += r'''

/* Wersja 1.0.11: stabilna Historia i ampułki */
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
    padding-bottom: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom) + 22px);
  }

  .history-card { overflow: hidden; }
  .history-table-wrap { overflow: visible !important; }

  .history-table {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    table-layout: fixed;
  }

  .history-table tbody,
  .history-table tr,
  .history-table td,
  .history-table td > * {
    min-width: 0;
    max-width: 100%;
  }

  .history-table td > * { overflow-wrap: anywhere; }

  .mobile-nav {
    position: fixed !important;
    z-index: 9999 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    display: grid !important;
    transform: none !important;
  }

  .settings-update-box--global { margin: 0 0 18px; }

  .ampoule-primary-action {
    display: grid;
    gap: 14px;
    margin: 4px 0 18px;
    padding: 17px;
    border: 2px solid rgba(22, 184, 165, .42);
    border-radius: 18px;
    background: linear-gradient(135deg, #e9faf6, #ffffff);
    box-shadow: var(--shadow-soft);
  }

  .ampoule-primary-action > div { display: grid; gap: 5px; }
  .ampoule-primary-action strong { font-size: 1.12rem; }
  .ampoule-primary-action span { color: var(--muted); line-height: 1.45; }
  .ampoule-primary-action .button { width: 100%; min-height: 52px; }

  .ampoule-settings-heading {
    display: grid;
    gap: 4px;
    margin: 2px 0 10px;
    padding-top: 16px;
    border-top: 1px solid var(--line);
  }

  .ampoule-settings-heading strong { font-size: 1.05rem; }
  .ampoule-settings-heading span { color: var(--muted); line-height: 1.4; }
}
'''
style_path.write_text(style, encoding="utf-8")

print("Zastosowano poprawki 1.0.11.")

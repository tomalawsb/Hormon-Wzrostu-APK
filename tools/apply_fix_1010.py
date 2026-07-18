#!/usr/bin/env python3
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def replace_required(text: str, pattern: str, replacement: str, name: str) -> str:
    updated, count = re.subn(pattern, replacement, text, flags=re.MULTILINE | re.DOTALL)
    if count < 1:
        raise SystemExit(f"Nie znaleziono: {name}")
    return updated


# Usuń zbędne przyciski powrotu z Kalendarza i Historii. Dolna nawigacja jest stale dostępna.
index_path = ROOT / "index.html"
index = index_path.read_text(encoding="utf-8")
index = re.sub(
    r'\s*<button class="back-button" type="button" data-go-home aria-label="Wróć do ekranu Dzisiaj">\s*<span class="back-button__icon" aria-hidden="true">‹</span>\s*<span>Wróć do dzisiaj</span>\s*</button>',
    "",
    index,
    flags=re.MULTILINE,
)
index_path.write_text(index, encoding="utf-8")

# Przywróć bardziej zwarte rozmiary z wcześniejszej wersji, ale zachowaj dobrą czytelność.
style_path = ROOT / "style.css"
style = style_path.read_text(encoding="utf-8")
marker = "/* Wersja 1.0.10: rozmiary jak w 1.0, kolor propozycji i stała nawigacja */"
if marker not in style:
    style += r'''

/* Wersja 1.0.10: rozmiary jak w 1.0, kolor propozycji i stała nawigacja */
@media (max-width: 820px) {
  body { font-size: 16px; }

  .brand strong { font-size: 1rem; }
  .brand span { font-size: .88rem; }
  .active-profile-button strong { font-size: 1rem; }
  .active-profile-button small { font-size: .78rem; }

  .action-card { padding: 20px 16px 22px; }
  .today-profile-heading { align-items: center; }
  .action-card #main-action-heading { font-size: 2rem; line-height: 1.08; }
  .today-profile-name { font-size: 1.05rem; }

  #main-action-heading .recommendation-heading-label {
    color: #0b8e80 !important;
    font-size: .58em !important;
    line-height: 1.12 !important;
    text-align: center;
  }
  #main-action-heading .recommendation-heading-place {
    color: #c53d3d !important;
    font-size: 1.05em !important;
    line-height: 1.06 !important;
    text-align: center;
  }

  .today-key-metric { padding: 14px 13px; }
  .today-key-metric > span { font-size: .9rem; }
  .today-key-metric > strong { font-size: 1.12rem; }
  .today-key-metric > small { font-size: .95rem; line-height: 1.35; }

  #main-action-text { font-size: 1rem; line-height: 1.55; }
  .ampoule-alert strong { font-size: 1rem; }
  .ampoule-alert span { font-size: .95rem; line-height: 1.45; }

  .settings-category-button strong { font-size: 1.05rem; }
  .settings-category-button small { font-size: .9rem; line-height: 1.3; }

  .mobile-nav {
    display: grid !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  .mobile-nav .nav-button { font-size: .9rem; }

  .back-button { display: none !important; }
}
'''
style_path.write_text(style, encoding="utf-8")

# Skróć tekst ekranu głównego do informacji użytkowych.
module_path = ROOT / "src" / "app" / "20_rendering_navigation.js"
module = module_path.read_text(encoding="utf-8")
module = module.replace(
    "el['main-action-text'].textContent = `${suggestionExplanation(suggestion)} Dawka: ${doseText}. Godzina: ${data.settings.defaultTime}. Jedno kliknięcie zapisze podanie; dane możesz wcześniej zmienić.`;",
    "el['main-action-text'].textContent = `Dawka: ${doseText} · godz. ${data.settings.defaultTime}.`;")
module_path.write_text(module, encoding="utf-8")

# Ustaw nową wersję.
subprocess.run([sys.executable, str(ROOT / "tools" / "set_version.py"), "1.0.10", "3911"], check=True)
print("Zastosowano poprawki 1.0.10.")

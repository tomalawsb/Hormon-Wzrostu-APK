#!/usr/bin/env python3
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


settings_html = read("src/screens/settings/index.html")
navigation = read("src/screens/settings/navigation.js")
maintenance = read("src/screens/settings/data-maintenance.js")
health_service = read("src/services/profiles/health.js")
health_screen = read("src/screens/profiles/health.js")
reports = read("src/screens/reports/index.js")
styles = read("src/styles/screens.css")
generated_html = read("index.html")
generated_js = read("app.js")
generated_css = read("style.css")

expected = [
    "profiles",
    "treatment",
    "reminders",
    "ampoules",
    "appearance",
    "data",
    "security",
    "about",
]
targets = re.findall(r'data-settings-target="([^"]+)"', settings_html)
panels = re.findall(r'data-settings-panel="([^"]+)"', settings_html)
require(targets == expected, "ustawienia nie mają ośmiu kategorii etapu 9 we właściwej kolejności")
require(len(panels) == 8 and set(panels) == set(expected), "kategorie nie mają osobnych paneli")
require(len(targets) == len(set(targets)), "kategorie ustawień są zduplikowane")
require(len(panels) == len(set(panels)), "panele ustawień są zduplikowane")

panel_matches = list(
    re.finditer(r'<section[^>]+data-settings-panel="([^"]+)"[^>]*>', settings_html)
)
panel_sections = {}
for index, match in enumerate(panel_matches):
    end = panel_matches[index + 1].start() if index + 1 < len(panel_matches) else len(settings_html)
    panel_sections[match.group(1)] = settings_html[match.start():end]

require("settings-advanced-injection" in panel_sections["treatment"],
        "rotacja wkłuć nie została przeniesiona do zaawansowanego dawkowania")
require("settings-advanced-voice" in panel_sections["reminders"],
        "obsługa głosowa nie została przeniesiona do opcji zaawansowanych")
require("settings-advanced-permissions" in panel_sections["about"],
        "zgody urządzenia nie są opcją zaawansowaną informacji")
require("settings-version-label" in panel_sections["about"],
        "aktualizacje nie znajdują się w informacjach o aplikacji")

data_panel = panel_sections["data"]
backup_start = data_panel.index('id="data-backup-section"')
backup_end = data_panel.index("</article>", backup_start)
clear_button = data_panel.index('id="clear-data-button"')
require(clear_button > backup_end, "usuwanie historii nie zostało oddzielone od kopii zapasowej")
require("Operacja nieodwracalna" in data_panel and "Operacji nie można cofnąć" in data_panel,
        "strefa usuwania nie opisuje skutków operacji")
require("window.confirm" in maintenance and "Tej operacji nie można cofnąć" in maintenance,
        "usuwanie wpisów nie wymaga potwierdzenia")

for legacy in ("injection-order", "voice", "permissions-info"):
    require(f'data-settings-panel="{legacy}"' not in settings_html,
            f"pozostał osobny stary panel {legacy}")
    require(f'data-settings-target="{legacy}"' not in settings_html,
            f"pozostała stara kategoria {legacy}")

require("SETTINGS_SECTION_ALIASES" in navigation, "brakuje zgodności starych skrótów ustawień")
for alias in ("injection-order", "voice", "permissions-info"):
    require(f"['{alias}'" in navigation, f"brakuje przekierowania starej sekcji {alias}")
require("aria-controls" in navigation and "aria-labelledby" in navigation,
        "osobne ekrany ustawień nie są powiązane dostępnościowo")
require("PROFILE_SETTINGS_SECTIONS" in navigation and "settings-profile-context" in navigation,
        "kontekst profilu nie jest ukrywany dla ustawień ogólnych")

require("function getLatestProfileMeasurements(profile)" in health_service,
        "brakuje niezależnego wyszukiwania ostatniego wzrostu i masy")
require("getLatestProfileMeasurements(profile)" in health_screen,
        "profil nadal używa tylko jednego ostatniego pomiaru")
require(reports.count("getLatestProfileMeasurements(profile)") >= 2,
        "raport nie korzysta z poprawionych ostatnich pomiarów")

for selector in (
    ".settings-advanced",
    ".settings-advanced__content",
    ".settings-danger-card",
    ".settings-danger-card__warning",
):
    require(selector in styles, f"brakuje stylu etapu 9: {selector}")

for marker, generated, name in (
    ('data-settings-target="about"', generated_html, "index.html"),
    ("const SETTINGS_SECTION_ALIASES", generated_js, "app.js"),
    ("Etap 9: krótsze ustawienia", generated_css, "style.css"),
):
    require(marker in generated, f"wygenerowany {name} nie zawiera zmian etapu 9")

print("Test etapu 9: OK — 8 kategorii, opcje zaawansowane, osobna strefa usuwania i poprawione pomiary")

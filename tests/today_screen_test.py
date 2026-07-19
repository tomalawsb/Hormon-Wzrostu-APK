from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


html = read("src/screens/today/index.html")
render = read("src/screens/today/render.js")
dashboard = read("src/screens/today/dashboard.js")
entries = read("src/components/dose-card/entries.js")
quick_draft = read("src/components/dose-card/quick-draft.js")
ampoule = read("src/components/ampoule-card/model.js")
events = read("src/core/events.js")
state = read("src/core/state.js")
styles = read("src/styles/screens.css")
updates = read("src/services/updates/index.js")
generated_html = read("index.html")
generated_js = read("app.js")
generated_css = read("style.css")

ids = re.findall(r'\bid="([^"]+)"', html)
require(len(ids) == len(set(ids)), "ekran Dzisiaj zawiera powtórzone identyfikatory HTML")

required_ids = {
    "today-profile-avatar",
    "main-profile-name",
    "today-dose-decrease",
    "today-dose-increase",
    "dose-chip",
    "place-field",
    "recommended-save-button",
    "recommended-skip-button",
    "today-undo-button",
    "ampoule-alert",
    "today-reminder-title",
    "today-reminder-button",
    "today-details",
}
missing = sorted(required_ids.difference(ids))
require(not missing, f"brakuje elementów etapu 6: {', '.join(missing)}")

ordered_markers = [
    'class="today-profile-heading"',
    'class="today-dose-control"',
    'class="today-place-control"',
    'id="recommended-save-button"',
    'class="card today-support-card today-ampoule-card"',
    'class="card today-support-card today-reminder-card"',
    'id="today-details"',
]
positions = [html.find(marker) for marker in ordered_markers]
require(all(position >= 0 for position in positions), "nie znaleziono pełnej hierarchii ekranu Dzisiaj")
require(positions == sorted(positions), "kolejność informacji na ekranie Dzisiaj jest nieprawidłowa")

details_tag = re.search(r'<details\s+id="today-details"([^>]*)>', html)
require(details_tag is not None, "brakuje zwijanych szczegółów")
require(" open" not in details_tag.group(1), "szczegóły powinny być domyślnie zwinięte")
require('role="status" aria-live="polite"' in html, "brakuje dostępnego potwierdzenia zapisu")
require('aria-label="Zmniejsz dzisiejszą dawkę o 0,1"' in html, "brakuje opisu zmniejszenia dawki")
require('aria-label="Zwiększ dzisiejszą dawkę o 0,1"' in html, "brakuje opisu zwiększenia dawki")

require("adjustTodayDose(-1)" in events and "adjustTodayDose(1)" in events, "przyciski szybkiej dawki nie są podłączone")
require("function adjustTodayDose(direction)" in render, "brakuje działania szybkiej zmiany dawki")
require("direction * 0.1" in render, "szybka zmiana dawki nie używa kroku 0,1")
require("preparedDraft" in entries and "quickDraft.date === today" in entries, "szybki zapis ignoruje przygotowaną dawkę lub miejsce")

require("let lastEntryUndoOperation = null" in state, "brakuje stanu ostatniej operacji")
require("function undoLastEntryOperation()" in entries, "brakuje widocznego cofania ostatniej operacji")
require("showEntryUndo(message, undoOperation)" in quick_draft, "zapis ze szczegółów nie oferuje cofnięcia")
require("showEntryUndo('Wpis został usunięty.'" in read("src/screens/history/actions.js"), "usunięcia wpisu nie można cofnąć")

require("function renderTodayReminder(todayEntry)" in render, "brakuje następnego przypomnienia")
require("getNextReminderTarget(profile)" in render, "termin przypomnienia nie korzysta z harmonogramu")
require("plannedToday" in ampoule and "getAmpouleInfo(todayEntry ? null : quickDraft)" in render, "ampułka nie uwzględnia szybko zmienionej dawki")
require("mobilePolishStyle" not in updates, "stary styl ekranu Dzisiaj jest nadal wstrzykiwany przez JavaScript")

for selector in (
    ".today-plan-grid",
    ".today-save-button",
    ".today-support-grid",
    ".today-details-card",
    ".today-confirmation--given",
):
    require(selector in styles, f"brakuje stylu {selector}")
require("min-height: 64px" in styles, "główny przycisk zapisu nie ma odpowiedniej wysokości")
require("@media (max-width: 560px)" in styles, "brakuje układu dla małych telefonów")

for marker, generated, name in (
    ("today-dashboard-v2", generated_html, "index.html"),
    ("function adjustTodayDose(direction)", generated_js, "app.js"),
    ("Etap 6: skoncentrowany ekran Dzisiaj", generated_css, "style.css"),
):
    require(marker in generated, f"wygenerowany {name} nie zawiera zmian etapu 6")

print("Test ekranu Dzisiaj: OK — szybki zapis, dawka ±0,1, pominięcie, cofanie, ampułka, przypomnienie i szczegóły")

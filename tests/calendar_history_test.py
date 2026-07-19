#!/usr/bin/env python3
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


calendar_html = read("src/screens/calendar/index.html")
calendar_render = read("src/screens/calendar/render.js")
calendar_actions = read("src/screens/calendar/actions.js")
history_html = read("src/screens/history/index.html")
history_render = read("src/screens/history/render.js")
history_events = read("src/screens/history/scope-events.js")
core_events = read("src/core/events.js")
entries = read("src/services/storage/entries.js")
entry_actions = read("src/components/dose-card/entries.js")
quick_draft = read("src/components/dose-card/quick-draft.js")
config = read("src/core/config.js")
styles = read("src/styles/screens.css")
generated_html = read("index.html")
generated_js = read("app.js")
generated_css = read("style.css")

for fragment, name in ((calendar_html, "kalendarz"), (history_html, "historia")):
    ids = re.findall(r'\bid="([^"]+)"', fragment)
    require(len(ids) == len(set(ids)), f"{name} zawiera powtórzone identyfikatory HTML")

for element_id in (
    "calendar-today-button",
    "calendar-month-summary",
    "calendar-profile-filter",
    "calendar-grid",
    "selected-day-entries",
):
    require(f'id="{element_id}"' in calendar_html, f"brakuje elementu kalendarza: {element_id}")

require("Przegląd miesięczny" in calendar_html, "miesiąc nie jest głównym widokiem kalendarza")
require("Podano" in calendar_html and "Pominięto" in calendar_html and "Dzisiaj" in calendar_html,
        "legenda kalendarza jest niepełna")
require("function goToCalendarToday()" in calendar_actions, "brakuje szybkiego przejścia do dzisiaj")
require("calendar-today-button" in core_events and "goToCalendarToday" in core_events,
        "przycisk Dzisiaj nie jest podłączony")
require("has-given" in calendar_render and "has-skipped" in calendar_render,
        "dni nie mają czytelnych klas statusu")
require("selectCalendarDate(button.dataset.date)" in calendar_render,
        "kliknięcie dnia nie otwiera jego szczegółów")

for element_id in (
    "history-search",
    "history-profile-filter",
    "status-filter",
    "site-filter",
    "history-correction-filter",
    "history-clear-filters",
    "history-list",
):
    require(f'id="{element_id}"' in history_html, f"brakuje elementu historii: {element_id}")

require("history-table" not in history_html, "stara tabela historii nie została usunięta")
require("function groupHistoryRecordsByDate(records)" in history_render,
        "historia nie grupuje wpisów według dat")
require("descending: true" in history_render, "historia nie jest chronologiczna od najnowszych")
require("function filterHistoryRecords(records, filters)" in history_render,
        "brakuje wspólnej logiki filtrów historii")
require("function clearHistoryFilters()" in history_events, "nie można wyczyścić filtrów historii")
require("data-edit-id" in history_render and "data-delete-id" in history_render,
        "wpisu historii nie można edytować lub usunąć")
require('history-entry-card--${entry.status}' in history_render,
        "podania i pominięcia nie mają osobnych klas statusu")

require("correctedAt:" in entries, "schemat wpisu nie przechowuje oznaczenia poprawki")
require("correctedAt: existingById ?" in entry_actions,
        "edycja formularzem nie oznacza wpisu jako poprawionego")
require("correctedAt: existingById ?" in quick_draft,
        "szybka edycja nie oznacza wpisu jako poprawionego")
schema_version = re.search(r"const DATA_SCHEMA_VERSION = (\d+)", config)
require(schema_version is not None and int(schema_version.group(1)) >= 12,
        "wersja schematu danych nie zawiera zmian etapu 7")
require("correction-badge" in history_render and "Poprawiono" in history_render,
        "historia nie pokazuje poprawionego wpisu")

for selector in (
    ".calendar-day.has-given",
    ".calendar-day.has-skipped",
    ".history-date-group",
    ".history-entry-card--given",
    ".history-entry-card--skipped",
    ".correction-badge",
):
    require(selector in styles, f"brakuje stylu etapu 7: {selector}")

for marker, generated, name in (
    ('id="calendar-today-button"', generated_html, "index.html"),
    ("function groupHistoryRecordsByDate(records)", generated_js, "app.js"),
    ("Etap 7: czytelny kalendarz", generated_css, "style.css"),
):
    require(marker in generated, f"wygenerowany {name} nie zawiera zmian etapu 7")

print("Test etapu 7: OK — kalendarz miesięczny, szczegóły dnia, chronologiczna historia, filtry i poprawione wpisy")

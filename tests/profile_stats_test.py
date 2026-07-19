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
health_service = read("src/services/profiles/health.js")
health_screen = read("src/screens/profiles/health.js")
schema = read("src/services/storage/schema.js")
config = read("src/core/config.js")
forms = read("src/screens/settings/forms.js")
reports = read("src/screens/reports/index.js")
imports = read("src/services/import/validation.js")
events = read("src/core/events.js")
styles = read("src/styles/screens.css")
generated_html = read("index.html")
generated_js = read("app.js")
generated_css = read("style.css")

ids = re.findall(r'\bid="([^"]+)"', settings_html)
require(len(ids) == len(set(ids)), "ustawienia zawierają powtórzone identyfikatory HTML")

required_ids = {
    "profile-current-dose",
    "profile-birth-date",
    "profile-doctor-name",
    "profile-clinic-name",
    "profile-medication-name",
    "profile-diagnosis",
    "profile-medical-notes",
    "profile-regularity-chart",
    "profile-measurement-form",
    "profile-height-cm",
    "profile-weight-kg",
    "profile-dose-history-form",
    "profile-dose-history-list",
    "profile-ampoules-used",
    "profile-doctor-report-button",
    "profile-doctor-export-button",
    "settings-dose-effective-date",
}
missing = sorted(required_ids.difference(ids))
require(not missing, "brakuje elementów etapu 8: " + ", ".join(missing))

for function_name in (
    "sanitizeProfileMedical",
    "sanitizeProfileMeasurement",
    "sanitizeProfileDoseChange",
    "buildProfileRegularityStats",
    "buildProfileAmpouleUsageStats",
):
    require(f"function {function_name}" in health_service, f"brakuje funkcji {function_name}")

require("medical: sanitizeProfileMedical" in schema, "profil nie przechowuje danych medycznych")
require("measurements: sanitizeProfileMeasurements" in schema, "profil nie przechowuje pomiarów")
require("doseHistory: sanitizeProfileDoseHistory" in schema, "profil nie przechowuje historii dawki")
require("const DATA_SCHEMA_VERSION = 13" in config, "schemat danych nie został podniesiony do wersji 13")
require("upsertProfileDoseChange(profile" in forms, "zmiana aktualnej dawki nie trafia do historii")
require("settings-dose-effective-date" in forms, "zmiana dawki nie ma daty obowiązywania")

require("function renderProfileRegularity(stats)" in health_screen, "brakuje wykresu regularności")
require("regularity-day--${day.status}" in health_screen, "wykres nie rozróżnia statusów dni")
require("function saveProfileMeasurement(event)" in health_screen, "nie można zapisać pomiaru")
require("function prepareProfileDoctorReport" in health_screen, "brakuje raportu profilu")
require("profile-medical-form" in events and "profile-measurement-form" in events,
        "formularze profilu nie są podłączone")

require("function buildDoctorReportProfileHtml(config)" in reports,
        "drukowany raport nie zawiera danych profilu")
require("Historia zmian dawki" in reports and "Ostatnie pomiary" in reports,
        "raport nie zawiera pomiarów lub historii dawki")
require("buildDocxDoctorProfileSection(config)" in reports,
        "eksport Word nie zawiera danych dla lekarza")
require("getDoctorReportLines(doctorProfile)" in reports,
        "eksport PDF nie zawiera podsumowania medycznego")
require("profile.measurements !== undefined" in imports and "profile.doseHistory !== undefined" in imports,
        "import nie sprawdza nowych danych profilu")

for selector in (
    ".profile-health-key-metrics",
    ".regularity-chart",
    ".regularity-day--given",
    ".regularity-day--skipped",
    ".profile-record-item",
    ".profile-ampoule-stats",
):
    require(selector in styles, f"brakuje stylu etapu 8: {selector}")

for marker, generated, name in (
    ('id="profile-doctor-report-button"', generated_html, "index.html"),
    ("function buildProfileRegularityStats", generated_js, "app.js"),
    ("Etap 8: profil dziecka", generated_css, "style.css"),
):
    require(marker in generated, f"wygenerowany {name} nie zawiera zmian etapu 8")

print("Test etapu 8: OK — profil medyczny, dawka, pomiary, regularność, ampułki i raport dla lekarza")

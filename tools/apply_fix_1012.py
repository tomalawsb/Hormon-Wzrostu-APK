#!/usr/bin/env python3
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

subprocess.run([sys.executable, str(ROOT / "tools/set_version.py"), "1.0.12", "3913"], check=True)

index_path = ROOT / "index.html"
index = index_path.read_text(encoding="utf-8")

index = index.replace(
    '<div>\n                  <p id="main-action-eyebrow" class="eyebrow">',
    '<div class="today-profile-main">\n                  <p id="main-action-eyebrow" class="eyebrow">',
    1,
)

old_buttons = '''                    <div class="button-row-wrap">
                      <button id="ampoule-start-today-button" class="button button--secondary button--small" type="button">Rozpocznij ampułkę dzisiaj</button>
                      <button id="ampoule-new-button" class="button button--secondary button--small" type="button">Odłóż aktywną i rozpocznij nową</button>
                    </div>
                    <div class="ampoule-management" aria-live="polite">'''
new_buttons = '''                    <div class="button-row-wrap">
                      <button id="ampoule-start-today-button" class="button button--secondary button--small" type="button">Rozpocznij ampułkę dzisiaj</button>
                      <button id="ampoule-new-button" class="button button--secondary button--small" type="button">Odłóż aktywną i rozpocznij nową</button>
                    </div>
                    <p id="ampoule-new-help" class="muted ampoule-new-help">Jeżeli odłożysz obecną ampułkę, później wznowisz ją z listy odłożonych poniżej.</p>
                    <div class="ampoule-management" aria-live="polite">'''
if old_buttons in index:
    index = index.replace(old_buttons, new_buttons, 1)
index_path.write_text(index, encoding="utf-8")

style_path = ROOT / "style.css"
style = style_path.read_text(encoding="utf-8")
marker = "/* Wersja 1.0.12: centrowanie nagłówka i czytelne ampułki */"
if marker not in style:
    style += r'''

/* Wersja 1.0.12: centrowanie nagłówka i czytelne ampułki */
.today-profile-main {
  display: grid;
  gap: 4px;
  min-width: 0;
  margin-left: -8px;
  text-align: center;
}
.today-profile-main #main-action-eyebrow,
.today-profile-main #main-action-heading,
.today-profile-main #main-profile-name { text-align: center; }
.ampoule-new-help {
  margin: 4px 0 0;
  line-height: 1.45;
}
@media (max-width: 820px) {
  .today-profile-main {
    justify-items: center;
    transform: translateX(-12px);
  }
  .today-profile-heading #main-status-badge {
    grid-column: 1 / -1;
    width: fit-content;
    justify-self: center;
  }
}
'''
style_path.write_text(style, encoding="utf-8")

js_path = ROOT / "src" / "app" / "30_entries.js"
js = js_path.read_text(encoding="utf-8")

js = js.replace(
    "? `Rozpoczęto ampułkę ${ampoule.number}. Poprzednia została odłożona.`",
    "? `Rozpoczęto ampułkę ${ampoule.number}. Poprzednia ampułka została odłożona i możesz ją później wznowić z listy odłożonych.`",
    1,
)

js = js.replace(
    "showToast(`Wznowiono ampułkę ${target.number}.`, 'success');",
    "showToast(active && active.id !== target.id\n      ? `Wznowiono ampułkę ${target.number}. Poprzednio aktywna ampułka została odłożona.`\n      : `Wznowiono ampułkę ${target.number}.`, 'success', 8000);",
    1,
)

render_marker = "  function renderAmpouleManagement() {\n"
if "function formatPausedAmpouleShortList" not in js:
    js = js.replace(
        render_marker,
        "  function formatPausedAmpouleShortList(ampoules) {\n"
        "    if (!ampoules.length) return 'brak';\n"
        "    return ampoules.map((ampoule) => `nr ${ampoule.number} (${formatMl(getAmpouleRemainingMl(ampoule.id))} ml)`).join(', ');\n"
        "  }\n\n" + render_marker,
        1,
    )

start_token = "    if (active) {\n      const openWarning"
end_token = "\n\n    const visible = [...data.ampoules]"
if start_token in js and end_token in js:
    start = js.index(start_token)
    end = js.index(end_token, start)
    replacement = '''    const pausedListShort = formatPausedAmpouleShortList(paused);

    if (active) {
      const openWarning = isAmpouleOpenTooLong(active) ? ' Przekroczono ustawiony limit czasu od otwarcia.' : '';
      const baseSummary = `Aktywna: ampułka ${active.number}, pozostało około ${formatMl(getAmpouleRemainingMl(active.id))} ml.${openWarning}`;
      el['ampoule-management-summary'].textContent = paused.length
        ? `${baseSummary} Odłożone: ${pausedListShort}.`
        : `${baseSummary} Brak odłożonych ampułek.`;
      el['ampoule-new-button'].textContent = 'Odłóż aktywną i rozpocznij nową';
      if (el['ampoule-new-help']) {
        el['ampoule-new-help'].textContent = paused.length
          ? `Po kliknięciu ampułka ${active.number} zostanie odłożona. Poniżej masz już odłożone: ${pausedListShort}. Do każdej możesz wrócić przyciskiem „Wznów”.`
          : `Po kliknięciu ampułka ${active.number} zostanie odłożona. Zaraz rozpocznie się nowa ampułka, a tę obecną potem wznowisz z listy odłożonych poniżej.`;
      }
    } else if (paused.length) {
      el['ampoule-management-summary'].textContent = `Brak aktywnej ampułki. Odłożone: ${pausedListShort}. Wybierz „Wznów” przy odpowiedniej ampułce albo rozpocznij nową.`;
      el['ampoule-new-button'].textContent = 'Rozpocznij nową ampułkę';
      if (el['ampoule-new-help']) el['ampoule-new-help'].textContent = 'Masz odłożone ampułki. Możesz je wznowić z listy poniżej albo rozpocząć nową.';
    } else {
      el['ampoule-management-summary'].textContent = 'Nie ma aktywnej ani odłożonej ampułki.';
      el['ampoule-new-button'].textContent = 'Rozpocznij nową ampułkę';
      if (el['ampoule-new-help']) el['ampoule-new-help'].textContent = 'Gdy odłożysz aktywną ampułkę, pojawi się tu na liście i będzie można ją później wznowić.';
    }'''
    js = js[:start] + replacement + js[end:]

js_path.write_text(js, encoding="utf-8")
print("Zastosowano poprawki 1.0.12.")

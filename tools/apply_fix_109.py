#!/usr/bin/env python3
from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_required(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Nie znaleziono tekstu do zmiany w {path.relative_to(ROOT)}")
    path.write_text(text.replace(old, new), encoding="utf-8")


def main() -> int:
    subprocess.run(
        ["python3", str(ROOT / "tools" / "set_version.py"), "1.0.9", "3910"],
        cwd=ROOT,
        check=True,
    )

    native = ROOT / "android" / "app" / "src" / "main" / "java" / "pl" / "tomaszwolak" / "dzienniczekhormonuwzrostu" / "MainActivity.java"
    replace_required(native, 'return value == null || value.trim().isEmpty() ? "1.0.8" : value.trim();', 'return value == null || value.trim().isEmpty() ? "1.0.9" : value.trim();')
    replace_required(native, 'return "1.0.8";', 'return "1.0.9";')

    module = ROOT / "src" / "app" / "115_updates.js"
    text = module.read_text(encoding="utf-8")
    marker = "// Wersja 1.0.9: czytelny ekran główny na telefonie"
    if marker not in text:
        text += r'''

  // Wersja 1.0.9: czytelny ekran główny na telefonie
  const renderMainRecommendationBeforeMobilePolish = renderMainRecommendation;
  renderMainRecommendation = function renderMainRecommendationMobilePolish(options) {
    renderMainRecommendationBeforeMobilePolish(options);
    const todayEntry = options?.todayEntry;
    const suggestion = options?.suggestion;
    const ampouleInfo = options?.ampouleInfo;

    if (!todayEntry && suggestion?.side && suggestion?.site) {
      const place = capitalize(formatPlace(suggestion.side, suggestion.site));
      el['main-action-eyebrow'].textContent = 'Dzisiaj do podania';
      el['main-action-heading'].innerHTML =
        `<span class="recommendation-heading-label">Proponowane miejsce</span>` +
        `<span class="recommendation-heading-place">${escapeHtml(place)}</span>`;
      el['main-action-text'].textContent = `Dawka ${formatDose(data.settings.defaultDose)} ${data.settings.unit} o ${data.settings.defaultTime}.`;
    }

    if (ampouleInfo?.configured && !todayEntry) {
      const left = ampouleInfo.approximateDosesLeftAfterToday;
      el['ampoule-alert-text'].textContent = `Po dawce zostanie około ${formatMl(ampouleInfo.remainingAfterToday)} ml, czyli ${left} ${plural(left, 'pełna dawka', 'pełne dawki', 'pełnych dawek')}.`;
    }
  };

  const mobilePolishStyle = document.createElement('style');
  mobilePolishStyle.textContent = `
    @media (max-width: 820px) {
      .action-card {
        padding: 22px 20px 26px;
      }
      .today-profile-heading {
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        text-align: center;
      }
      .today-profile-heading > div {
        min-width: 0;
        text-align: center;
      }
      .today-profile-heading #main-status-badge {
        grid-column: 1 / -1;
        justify-self: center;
        margin-top: 6px;
      }
      #main-action-eyebrow {
        font-size: .94rem;
        line-height: 1.25;
        text-align: center;
      }
      #main-action-heading {
        width: 100%;
        text-align: center;
      }
      #main-action-heading .recommendation-heading-label {
        margin-bottom: 9px;
        font-size: .58em;
        line-height: 1.15;
        text-align: center;
      }
      #main-action-heading .recommendation-heading-place {
        font-size: 1.28em;
        line-height: 1.02;
        text-align: center;
      }
      .today-profile-name {
        font-size: 1.08rem;
        text-align: center;
      }
      .today-key-metrics {
        gap: 12px;
      }
      .today-key-metric {
        padding: 16px 14px;
      }
      .today-key-metric > span {
        font-size: .94rem;
        line-height: 1.25;
      }
      .today-key-metric > strong {
        font-size: 1.18rem;
        line-height: 1.2;
      }
      .today-key-metric > small {
        font-size: 1rem;
        line-height: 1.35;
      }
      #main-action-text {
        margin: 2px 0 0;
        color: var(--text);
        font-size: 1.08rem;
        line-height: 1.45;
        text-align: center;
      }
      .ampoule-alert {
        padding: 15px 16px;
        gap: 5px;
      }
      .ampoule-alert strong {
        font-size: 1.08rem;
      }
      .ampoule-alert span {
        font-size: 1rem;
        line-height: 1.4;
      }
      .action-card__actions .button {
        min-height: 52px;
        font-size: 1rem;
      }
      .mobile-nav-button {
        font-size: .92rem;
      }
    }
  `;
  document.head.appendChild(mobilePolishStyle);
'''
        module.write_text(text, encoding="utf-8")

    workflow = ROOT / ".github" / "workflows" / "apply-fix-109.yml"
    if workflow.exists():
        workflow.unlink()
    Path(__file__).unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

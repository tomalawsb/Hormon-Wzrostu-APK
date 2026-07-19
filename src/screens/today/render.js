
function renderToday() {
  renderTodayDashboard();
  const today = localDateISO();
  const todayEntry = getEntryForDate(today);
  const editingExisting = Boolean(
    quickDraft.id && data.entries.some((entry) => entry.id === quickDraft.id)
  );

  el['today-entry-date'].textContent =
    quickDraft.date === today ? 'Dzisiaj' : formatDateShort(quickDraft.date);
  el['today-dose'].textContent =
    quickDraft.status === 'skipped' ? '—' : `${formatDose(quickDraft.dose)} ${quickDraft.unit}`;
  el['today-time'].textContent = quickDraft.time;
  el['selected-place'].textContent =
    quickDraft.status === 'skipped'
      ? 'Dawka pominięta'
      : quickDraft.side && quickDraft.site
        ? formatPlace(quickDraft.side, quickDraft.site)
        : 'Nie wybrano';

  const ready =
    quickDraft.status === 'skipped' ||
    Boolean(quickDraft.side && quickDraft.site && normalizeDose(quickDraft.dose));
  el['save-button'].disabled = !ready;
  el['save-button'].innerHTML = editingExisting
    ? `${iconSvg('check')} Zapisz zmiany`
    : `${iconSvg('check')} Zapisz podanie`;
  el['save-help'].textContent = quickDraftSaveHelpMessage(ready);
  el['today-dose-decrease'].disabled = Boolean(todayEntry) || quickDraft.status === 'skipped';
  el['today-dose-increase'].disabled = Boolean(todayEntry) || quickDraft.status === 'skipped';

  if (todayEntry) {
    el['today-status-badge'].className = `status-badge status-badge--${todayEntry.status}`;
    el['today-status-badge'].textContent = todayEntry.status === 'given' ? 'Podano' : 'Pominięto';
    el['today-status-heading'].textContent =
      todayEntry.status === 'given'
        ? `Zapisano o ${todayEntry.time}`
        : 'Dawka oznaczona jako pominięta';
  } else {
    el['today-status-badge'].className = 'status-badge status-badge--neutral';
    el['today-status-badge'].textContent = 'Brak wpisu';
    el['today-status-heading'].textContent =
      ready && quickDraftTouched
        ? 'Propozycja gotowa — jeszcze nie zapisana'
        : ready
          ? 'Sprawdź i zapisz'
          : 'Uzupełnij wpis';
  }

  if (lastRecognizedText) {
    el['voice-result'].classList.remove('is-hidden');
    el['voice-result-text'].textContent = lastRecognizedText;
  } else {
    el['voice-result'].classList.add('is-hidden');
    el['voice-result-text'].textContent = '';
  }

  const latestGiven = getLatestGivenBefore(new Date());
  el['last-place'].textContent = latestGiven
    ? `${formatPlace(latestGiven.side, latestGiven.site)} · ${formatDateShort(latestGiven.date)}`
    : 'Brak wcześniejszych wpisów';

  const suggestion = getSuggestedPlace(new Date());
  el['suggested-place'].textContent =
    suggestion.side && suggestion.site
      ? capitalize(formatPlace(suggestion.side, suggestion.site))
      : 'Brak aktywnego miejsca';

  const ampouleInfo = getAmpouleInfo(todayEntry ? null : quickDraft);
  renderMainRecommendation({ todayEntry, ready, suggestion, ampouleInfo, editingExisting });
  renderTodayReminder(todayEntry);
  renderTodayUndoAction();
}

let renderMainRecommendation = function renderMainRecommendation({
  todayEntry,
  suggestion,
  ampouleInfo,
}) {
  renderMainTodayMetrics({ todayEntry, suggestion, ampouleInfo });
  const hasSuggestion = Boolean(suggestion?.side && suggestion?.site);

  el['recommended-save-button'].classList.remove('is-hidden');
  el['recommended-save-button'].disabled = false;
  el['recommended-edit-button'].classList.toggle('is-hidden', Boolean(todayEntry));
  el['recommended-skip-button'].classList.toggle('is-hidden', Boolean(todayEntry));
  el['recommended-manual-button'].classList.add('is-hidden');
  el['recommended-manual-button'].textContent = 'Ustaw ampułkę';
  el['ampoule-start-main-button'].classList.add('is-hidden');

  if (todayEntry?.status === 'given') {
    el['main-action-heading'].textContent = 'Dzisiejsze podanie zapisane';
    el['main-action-text'].textContent =
      `Zapisano o ${todayEntry.time}: ${formatDose(todayEntry.dose)} ${todayEntry.unit}, ${formatPlace(todayEntry.side, todayEntry.site)}.`;
    el['recommended-save-button'].innerHTML = `${iconSvg('edit')} Edytuj dzisiejszy wpis`;
    el['today-confirmation'].className = 'today-confirmation today-confirmation--given';
  } else if (todayEntry?.status === 'skipped') {
    el['main-action-heading'].textContent = 'Dzisiejsza dawka pominięta';
    el['main-action-text'].textContent =
      `Pominięcie zapisano o ${todayEntry.time}. Możesz poprawić wpis albo cofnąć ostatnią operację.`;
    el['recommended-save-button'].innerHTML = `${iconSvg('edit')} Edytuj dzisiejszy wpis`;
    el['today-confirmation'].className = 'today-confirmation today-confirmation--skipped';
  } else if (!hasSuggestion) {
    el['main-action-heading'].textContent = 'Brak aktywnych miejsc wkłucia';
    el['main-action-text'].textContent = suggestionExplanation(suggestion);
    el['recommended-save-button'].innerHTML = `${iconSvg('location')} Ustaw miejsca wkłucia`;
    el['today-confirmation'].className = 'today-confirmation today-confirmation--warning';
  } else {
    el['main-action-heading'].textContent = 'Dzisiejsze podanie';
    el['main-action-text'].textContent =
      'Dawka i miejsce są gotowe. Dotknij „Zapisz podanie”, aby zakończyć.';
    el['recommended-save-button'].innerHTML = `${iconSvg('check')} Zapisz podanie`;
    el['today-confirmation'].className = 'today-confirmation today-confirmation--pending';
  }

  if (!ampouleInfo.configured && ampouleInfo.reason === 'start') {
    el['ampoule-start-main-button'].classList.remove('is-hidden');
    el['recommended-manual-button'].classList.remove('is-hidden');
    el['recommended-manual-button'].textContent = 'Ustaw inną datę';
  } else if (!ampouleInfo.configured && ampouleInfo.reason === 'dose') {
    el['recommended-manual-button'].classList.remove('is-hidden');
    el['recommended-manual-button'].textContent = 'Ustaw dawkę ampułki';
  } else if (!ampouleInfo.configured && ampouleInfo.reason === 'paused') {
    el['recommended-manual-button'].classList.remove('is-hidden');
    el['recommended-manual-button'].textContent = 'Wybierz odłożoną ampułkę';
  } else if (!ampouleInfo.configured && ampouleInfo.reason === 'finished') {
    el['recommended-manual-button'].classList.remove('is-hidden');
    el['recommended-manual-button'].textContent = 'Rozpocznij nową ampułkę';
  } else if (ampouleInfo.todayIsLast) {
    el['recommended-manual-button'].classList.remove('is-hidden');
    el['recommended-manual-button'].textContent = 'Ustawienia ampułki';
  }

  const ampouleMessage = ampouleSummary(ampouleInfo);
  el['ampoule-status'].textContent = ampouleMessage.short;
  el['ampoule-alert-title'].textContent = ampouleMessage.title;
  el['ampoule-alert-text'].textContent = ampouleMessage.text;
  el['ampoule-alert'].className = `ampoule-alert ampoule-alert--${ampouleMessage.level}`;
};

function adjustTodayDose(direction) {
  const todayEntry = getEntryForDate(localDateISO());
  if (todayEntry) {
    openEntryDialog(todayEntry.id, null, 'entry-dose');
    return;
  }
  const current = decimalToNumber(quickDraft.dose || data.settings.defaultDose);
  const next = Math.min(1000, Math.max(0.1, Math.round((current + direction * 0.1) * 100) / 100));
  quickDraft.dose = normalizeDose(String(next)) || data.settings.defaultDose;
  quickDraft.unit = quickDraft.unit || data.settings.unit;
  quickDraft.status = 'given';
  quickDraftTouched = true;
  renderToday();
  announce(`Dzisiejsza dawka: ${formatDose(quickDraft.dose)} ${quickDraft.unit}.`);
}

function renderTodayReminder(todayEntry) {
  const profile = getActiveProfile();
  if (!profile.settings.reminderEnabled) {
    el['today-reminder-title'].textContent = 'Wyłączone';
    el['today-reminder-text'].textContent =
      'Włącz przypomnienia, jeśli aplikacja ma informować o niezapisanej dawce.';
    return;
  }
  const target = getNextReminderTarget(profile);
  el['today-reminder-title'].textContent = formatTodayReminderTarget(target);
  el['today-reminder-text'].textContent = todayEntry
    ? 'Dzisiejszy wpis jest już zakończony. Pokazujemy termin następnego przypomnienia.'
    : 'Przypomnienie pojawi się, jeżeli do tego czasu dzisiejsza dawka nie zostanie zapisana.';
}

function formatTodayReminderTarget(target, now = new Date()) {
  const targetDate = localDateISO(target);
  const today = localDateISO(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const dayLabel =
    targetDate === today
      ? 'Dzisiaj'
      : targetDate === localDateISO(tomorrowDate)
        ? 'Jutro'
        : formatDateShort(targetDate);
  return `${dayLabel}, ${localTime(target)}`;
}

function quickDraftSaveHelpMessage(ready) {
  if (quickDraft.status === 'skipped')
    return 'Gotowe: zapisze pominięcie dawki bez dawki, strony i miejsca.';
  if (!normalizeDose(quickDraft.dose)) return 'Sprawdź dawkę, aby zapisać podanie.';
  if (!quickDraft.side || !quickDraft.site) return 'Wybierz miejsce wkłucia, aby zapisać podanie.';
  if (ready)
    return 'Gotowe do zapisu. Dawka i miejsce są widoczne także na górze ekranu.';
  return 'Uzupełnij dane, aby zapisać podanie.';
}

function renderMiniCalendar() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const offset = mondayIndex(first.getDay());
  const days = new Date(year, month + 1, 0).getDate();
  const entriesByDate = groupEntriesByDate();

  let html =
    '<div class="mini-calendar-head"><span>Pn</span><span>Wt</span><span>Śr</span><span>Cz</span><span>Pt</span><span>So</span><span>Nd</span></div><div class="mini-calendar-grid">';
  for (let i = 0; i < offset; i += 1) html += '<span class="mini-day is-outside"></span>';
  for (let day = 1; day <= days; day += 1) {
    const iso = datePartsToISO(year, month + 1, day);
    const entries = entriesByDate.get(iso) || [];
    const hasGiven = entries.some((entry) => entry.status === 'given');
    const hasSkipped = entries.some((entry) => entry.status === 'skipped');
    const classes = ['mini-day'];
    if (iso === localDateISO()) classes.push('is-today');
    if (hasGiven) classes.push('has-given');
    else if (hasSkipped) classes.push('has-skipped');
    html += `<span class="${classes.join(' ')}" title="${escapeHtml(formatDateLong(iso))}">${day}</span>`;
  }
  html += '</div>';
  el['mini-calendar'].innerHTML = html;
}

function renderRecent() {
  const entries = getEntriesSorted().slice(0, 5);
  if (!entries.length) {
    el['recent-list'].innerHTML =
      '<div class="empty-state"><strong>Brak wpisów</strong><span>Dodaj pierwsze podanie.</span></div>';
    return;
  }
  el['recent-list'].innerHTML = entries
    .map(
      (entry) => `
      <div class="recent-item">
        <span>${escapeHtml(formatDateShort(entry.date))}</span>
        <span>${entry.status === 'given' ? `${escapeHtml(formatDose(entry.dose))} ${escapeHtml(entry.unit)}` : '—'}</span>
        <strong>${entry.status === 'given' ? escapeHtml(formatPlace(entry.side, entry.site)) : 'Pominięto'}</strong>
      </div>
    `
    )
    .join('');
}

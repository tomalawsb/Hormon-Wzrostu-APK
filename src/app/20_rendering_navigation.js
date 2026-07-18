  function renderAll() {
    renderProfileControls();
    renderToday();
    renderMiniCalendar();
    renderRecent();
    renderCalendar();
    renderSelectedDay();
    renderHistory();
    renderSettings();
    updateNavigation();
  }

  function updateCurrentDateHeader() {
    el['current-date-label'].textContent = capitalize(new Intl.DateTimeFormat('pl-PL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(new Date()));
  }

  function renderToday() {
    renderTodayDashboard();
    const today = localDateISO();
    const todayEntry = getEntryForDate(today);
    const editingExisting = Boolean(quickDraft.id && data.entries.some((entry) => entry.id === quickDraft.id));

    el['today-entry-date'].textContent = quickDraft.date === today ? 'Dzisiaj' : formatDateShort(quickDraft.date);
    el['today-dose'].textContent = quickDraft.status === 'skipped'
      ? '—'
      : `${formatDose(quickDraft.dose)} ${quickDraft.unit}`;
    el['today-time'].textContent = quickDraft.time;
    el['selected-place'].textContent = quickDraft.status === 'skipped'
      ? 'Dawka pominięta'
      : (quickDraft.side && quickDraft.site ? formatPlace(quickDraft.side, quickDraft.site) : 'Nie wybrano');

    const ready = quickDraft.status === 'skipped' || Boolean(quickDraft.side && quickDraft.site && normalizeDose(quickDraft.dose));
    el['save-button'].disabled = !ready;
    el['save-button'].innerHTML = editingExisting
      ? '<span aria-hidden="true">✓</span> Zapisz zmiany'
      : '<span aria-hidden="true">✓</span> Zapisz podanie';
    el['save-help'].textContent = quickDraftSaveHelpMessage(ready);

    if (todayEntry) {
      el['today-status-badge'].className = `status-badge status-badge--${todayEntry.status}`;
      el['today-status-badge'].textContent = todayEntry.status === 'given' ? 'Podano' : 'Pominięto';
      el['today-status-heading'].textContent = todayEntry.status === 'given'
        ? `Zapisano o ${todayEntry.time}`
        : 'Dawka oznaczona jako pominięta';
    } else {
      el['today-status-badge'].className = 'status-badge status-badge--neutral';
      el['today-status-badge'].textContent = 'Brak wpisu';
      el['today-status-heading'].textContent = ready && quickDraftTouched ? 'Propozycja gotowa — jeszcze nie zapisana' : (ready ? 'Sprawdź i zapisz' : 'Uzupełnij wpis');
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
    el['suggested-place'].textContent = suggestion.side && suggestion.site
      ? capitalize(formatPlace(suggestion.side, suggestion.site))
      : 'Brak aktywnego miejsca';

    const ampouleInfo = getAmpouleInfo();
    renderMainRecommendation({ todayEntry, ready, suggestion, ampouleInfo, editingExisting });
  }

  function renderMainRecommendation({ todayEntry, ready, suggestion, ampouleInfo, editingExisting }) {
    renderMainTodayMetrics({ todayEntry, suggestion, ampouleInfo });
    const hasSuggestion = Boolean(suggestion?.side && suggestion?.site);
    const suggestedPlace = hasSuggestion ? capitalize(formatPlace(suggestion.side, suggestion.site)) : 'brak aktywnego miejsca';
    const doseText = `${formatDose(data.settings.defaultDose)} ${data.settings.unit}`;

    el['recommended-save-button'].classList.remove('is-hidden');
    el['recommended-save-button'].disabled = false;
    el['recommended-edit-button'].classList.toggle('is-hidden', Boolean(todayEntry));
    el['recommended-skip-button'].classList.toggle('is-hidden', Boolean(todayEntry));
    el['recommended-manual-button'].classList.add('is-hidden');
    el['recommended-manual-button'].textContent = 'Ustaw ampułkę';
    el['ampoule-start-main-button'].classList.add('is-hidden');

    if (todayEntry?.status === 'given') {
      el['main-action-heading'].textContent = `Dzisiaj zapisano: ${capitalize(formatPlace(todayEntry.side, todayEntry.site))}`;
      el['main-action-text'].textContent = `${formatDateShort(todayEntry.date)}, ${todayEntry.time}. Dawka: ${formatDose(todayEntry.dose)} ${todayEntry.unit}.`;
      el['recommended-save-button'].textContent = 'Edytuj dzisiejszy wpis';
    } else if (todayEntry?.status === 'skipped') {
      el['main-action-heading'].textContent = 'Dzisiaj dawka jest oznaczona jako pominięta';
      el['main-action-text'].textContent = 'Jeżeli to pomyłka, otwórz edycję i popraw dzisiejszy wpis.';
      el['recommended-save-button'].textContent = 'Edytuj dzisiejszy wpis';
    } else if (!hasSuggestion) {
      el['main-action-heading'].textContent = 'Brak aktywnych miejsc wkłucia';
      el['main-action-text'].textContent = suggestionExplanation(suggestion);
      el['recommended-save-button'].textContent = 'Otwórz miejsca wkłucia';
    } else {
      el['main-action-heading'].textContent = `Proponowane miejsce: ${suggestedPlace}`;
      el['main-action-text'].textContent = `Dawka: ${doseText} · godz. ${data.settings.defaultTime}.`;
      el['recommended-save-button'].textContent = 'Potwierdź podanie';
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
  }

  function quickDraftSaveHelpMessage(ready) {
    if (quickDraft.status === 'skipped') return 'Gotowe: zapisze pominięcie dawki bez dawki, strony i miejsca.';
    if (!normalizeDose(quickDraft.dose)) return 'Sprawdź dawkę, aby zapisać podanie.';
    if (!quickDraft.side || !quickDraft.site) return 'Wybierz miejsce wkłucia, aby zapisać podanie.';
    if (ready) return 'Gotowe do zapisu. Przed zapisaniem możesz jeszcze zmienić dawkę, godzinę albo miejsce.';
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

    let html = '<div class="mini-calendar-head"><span>Pn</span><span>Wt</span><span>Śr</span><span>Cz</span><span>Pt</span><span>So</span><span>Nd</span></div><div class="mini-calendar-grid">';
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
      el['recent-list'].innerHTML = '<div class="empty-state"><strong>Brak wpisów</strong><span>Dodaj pierwsze podanie.</span></div>';
      return;
    }
    el['recent-list'].innerHTML = entries.map((entry) => `
      <div class="recent-item">
        <span>${escapeHtml(formatDateShort(entry.date))}</span>
        <span>${entry.status === 'given' ? `${escapeHtml(formatDose(entry.dose))} ${escapeHtml(entry.unit)}` : '—'}</span>
        <strong>${entry.status === 'given' ? escapeHtml(formatPlace(entry.side, entry.site)) : 'Pominięto'}</strong>
      </div>
    `).join('');
  }

  function renderCalendar() {
    calendarProfileScope = populateProfileScopeSelect(el['calendar-profile-filter'], calendarProfileScope, 'Wszystkie dzieci');
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    const scopedProfiles = getProfilesForScope(calendarProfileScope);
    const scopedRecords = getScopedEntryRecords(calendarProfileScope);
    el['calendar-month-label'].textContent = capitalize(new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(calendarCursor));
    el['calendar-scope-label'].textContent = profileScopeDescription(calendarProfileScope, scopedRecords.length);
    renderCalendarProfileLegend(scopedProfiles);

    const firstVisible = new Date(year, month, 1 - mondayIndex(new Date(year, month, 1).getDay()));
    const entriesByDate = groupScopedEntriesByDate(scopedRecords);
    let html = '';

    for (let index = 0; index < 42; index += 1) {
      const date = new Date(firstVisible);
      date.setDate(firstVisible.getDate() + index);
      const iso = localDateISO(date);
      const records = entriesByDate.get(iso) || [];
      const classes = ['calendar-day'];
      if (date.getMonth() !== month) classes.push('is-outside');
      if (iso === selectedCalendarDate) classes.push('is-selected');
      if (iso === localDateISO()) classes.push('is-today');
      const markers = records.slice(0, 5).map(({ profile, entry }) => `<i class="day-marker day-marker--${entry.status} profile-color-dot" data-profile-color="${escapeHtml(profile.color)}" title="${escapeHtml(profile.name)}: ${entry.status === 'given' ? 'podano' : 'pominięto'}" aria-hidden="true"></i>`).join('');
      const more = records.length > 5 ? `<span class="day-marker-more" aria-hidden="true">+${records.length - 5}</span>` : '';
      const statusText = records.length
        ? `, ${records.length} ${plural(records.length, 'wpis', 'wpisy', 'wpisów')}`
        : ', brak wpisu';
      html += `
        <button class="${classes.join(' ')}" type="button" role="gridcell" data-date="${iso}" aria-label="${escapeHtml(formatDateLong(iso) + statusText)}" aria-selected="${iso === selectedCalendarDate}">
          <span class="day-number">${date.getDate()}</span>
          <span class="day-markers">${markers}${more}</span>
        </button>
      `;
    }

    el['calendar-grid'].innerHTML = html;
    el['calendar-grid'].querySelectorAll('[data-date]').forEach((button) => {
      button.addEventListener('click', () => selectCalendarDate(button.dataset.date));
    });
  }

  function renderCalendarProfileLegend(profiles) {
    el['calendar-profile-legend'].innerHTML = profiles.length > 1
      ? profiles.map((profile) => `<span><i class="day-marker day-marker--given profile-color-dot" data-profile-color="${escapeHtml(profile.color)}"></i>${escapeHtml(profile.icon)} ${escapeHtml(profile.name)}</span>`).join('')
      : '';
    el['calendar-profile-legend'].classList.toggle('is-hidden', profiles.length <= 1);
  }

  function renderSelectedDay() {
    el['selected-day-label'].textContent = capitalize(formatDateLong(selectedCalendarDate));
    const records = getScopedEntryRecords(calendarProfileScope).filter(({ entry }) => entry.date === selectedCalendarDate);
    const targetProfile = getCalendarEntryTargetProfile();
    const targetEntry = targetProfile?.entries.find((entry) => entry.date === selectedCalendarDate) || null;
    el['add-for-selected-day'].textContent = targetEntry ? `Edytuj: ${targetProfile.name}` : `Dodaj: ${targetProfile?.name || getActiveProfile().name}`;
    if (!records.length) {
      el['selected-day-entries'].innerHTML = '<div class="empty-state"><strong>Brak wpisu</strong><span>W tym dniu nie zapisano podania dla wybranego zakresu.</span></div>';
      return;
    }
    el['selected-day-entries'].innerHTML = records.map(({ profile, entry }) => `
      <article class="day-entry-card" data-profile-color="${escapeHtml(profile.color)}">
        <div class="day-entry-profile">
          <span class="profile-avatar profile-avatar--tab" data-profile-color="${escapeHtml(profile.color)}" aria-hidden="true">${escapeHtml(profile.icon)}</span>
          <strong>${escapeHtml(profile.name)}</strong>
        </div>
        <strong>${entry.status === 'given' ? escapeHtml(formatPlace(entry.side, entry.site)) : 'Dawka pominięta'}</strong>
        <div class="day-entry-card-meta">
          <span>${escapeHtml(entry.time)}</span>
          <span>${entry.status === 'given' ? `${escapeHtml(formatDose(entry.dose))} ${escapeHtml(entry.unit)}` : 'bez dawki'}</span>
          <span>${entry.status === 'given' ? 'Podano' : 'Pominięto'}</span>
        </div>
        ${entry.note ? `<span class="muted">${escapeHtml(entry.note)}</span>` : ''}
        <button class="text-button" type="button" data-edit-id="${entry.id}" data-entry-profile-id="${profile.id}">Edytuj wpis</button>
      </article>
    `).join('');
  }

  function renderHistory() {
    historyProfileScope = populateProfileScopeSelect(el['history-profile-filter'], historyProfileScope, 'Wszystkie dzieci');
    const query = normalizeText(el['history-search']?.value || '');
    const status = el['status-filter']?.value || 'all';
    const site = el['site-filter']?.value || 'all';

    const entries = getScopedEntryRecords(historyProfileScope, { descending: true }).filter(({ profile, entry }) => {
      if (status !== 'all' && entry.status !== status) return false;
      if (site !== 'all' && entry.site !== site) return false;
      if (!query) return true;
      const haystack = normalizeText([
        profile.name, entry.date, formatDateShort(entry.date), entry.time, entry.dose, entry.unit,
        entry.side, entry.site, formatPlace(entry.side, entry.site), entry.note,
        entry.status === 'given' ? 'podano' : 'pominięto'
      ].filter(Boolean).join(' '));
      return haystack.includes(query);
    });

    el['history-scope-label'].textContent = profileScopeDescription(historyProfileScope, entries.length);
    el['history-table-body'].innerHTML = entries.map(({ profile, entry }) => `
      <tr>
        <td><span class="history-profile-cell"><span class="profile-avatar profile-avatar--tab" data-profile-color="${escapeHtml(profile.color)}" aria-hidden="true">${escapeHtml(profile.icon)}</span><strong>${escapeHtml(profile.name)}</strong></span></td>
        <td><strong>${escapeHtml(formatDateShort(entry.date))}</strong><br><span class="muted">${escapeHtml(entry.time)}</span></td>
        <td>${entry.status === 'given' ? `${escapeHtml(formatDose(entry.dose))} ${escapeHtml(entry.unit)}` : '—'}</td>
        <td>${entry.status === 'given' ? escapeHtml(formatPlace(entry.side, entry.site)) : '—'}</td>
        <td><span class="status-pill status-pill--${entry.status}">${entry.status === 'given' ? 'Podano' : 'Pominięto'}</span></td>
        <td>${entry.note ? escapeHtml(entry.note) : '<span class="muted">—</span>'}</td>
        <td>
          <div class="table-actions">
            <button class="table-action" type="button" data-edit-id="${entry.id}" data-entry-profile-id="${profile.id}">Edytuj</button>
            <button class="table-action table-action--danger" type="button" data-delete-id="${entry.id}" data-entry-profile-id="${profile.id}">Usuń</button>
          </div>
        </td>
      </tr>
    `).join('');

    el['history-empty'].classList.toggle('is-hidden', entries.length > 0);
  }

  function renderSettings() {
    const activeProfile = getActiveProfile();
    const activeAmpoule = getActiveAmpoule();
    el['settings-profile-avatar'].textContent = activeProfile.icon;
    el['settings-profile-avatar'].dataset.profileColor = activeProfile.color;
    el['settings-profile-name'].textContent = activeProfile.name;
    el['settings-profile-note'].textContent = `Te ustawienia, ampułki, przypomnienia, historia i raporty dotyczą wyłącznie profilu ${activeProfile.name}.`;
    el['settings-dose'].value = data.settings.defaultDose;
    el['settings-unit'].value = data.settings.unit;
    el['settings-time'].value = data.settings.defaultTime;
    el['ampoule-start-date'].value = activeAmpoule?.startDate || data.settings.ampouleStartDate || '';
    el['ampoule-start-number'].value = activeAmpoule?.number || data.settings.ampouleStartNumber || 1;
    el['ampoule-volume'].value = activeAmpoule?.volumeMl || data.settings.ampouleVolumeMl || DEFAULT_AMPOULE_VOLUME_ML;
    el['ampoule-dose-ml'].value = data.settings.ampouleDoseMl || '';
    el['ampoule-max-open-days'].value = data.settings.ampouleMaxOpenDays || '';
    renderAmpouleManagement();
    renderInjectionOrderSettings();
    el['voice-feedback-toggle'].checked = Boolean(data.settings.voiceFeedback);
    el['voice-confirm-toggle'].checked = Boolean(data.settings.voiceConfirm);
    el['reminder-enabled-toggle'].checked = Boolean(data.settings.reminderEnabled);
    el['reminder-time'].value = data.settings.reminderTime || '21:00';
    el['clear-data-button'].textContent = `Usuń wszystkie wpisy profilu ${activeProfile.name}`;
    renderReportConfiguration();
    updatePermissionStatuses();
    renderSettingsNavigation();
  }

  function switchView(view, { updateHash = true, focus = true, smooth = true } = {}) {
    if (!['today', 'calendar', 'history', 'more'].includes(view)) return;
    const previousView = activeView;
    activeView = view;
    document.querySelectorAll('.view').forEach((section) => {
      const active = section.id === `view-${view}`;
      section.hidden = !active;
      section.classList.toggle('is-active', active);
    });
    updateNavigation();
    if (view === 'calendar') {
      renderCalendar();
      renderSelectedDay();
    }
    if (view === 'history') renderHistory();
    if (view === 'more') {
      if (previousView !== 'more') settingsDetailOpen = false;
      renderSettings();
    }
    if (updateHash && window.location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
    if (focus) document.getElementById(`view-${view}`)?.querySelector('h1, [tabindex]')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
  }

  function viewFromHash() {
    const value = window.location.hash.replace('#', '').trim();
    return ['today', 'calendar', 'history', 'more'].includes(value) ? value : 'today';
  }

  function updateNavigation() {
    document.querySelectorAll('[data-view]').forEach((button) => {
      const active = button.dataset.view === activeView;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function openPlacePicker() {
    if (quickDraft.status === 'skipped') {
      quickDraft.status = 'given';
      quickDraft.dose = data.settings.defaultDose;
      quickDraft.unit = data.settings.unit;
    }
    renderPlacePickerOptions();
    if (!el['place-picker-dialog'].open) el['place-picker-dialog'].showModal();
  }

  function closePlacePicker() {
    if (el['place-picker-dialog'].open) el['place-picker-dialog'].close();
  }

  function renderPlacePickerOptions() {
    el['place-picker-options'].innerHTML = ROTATION.map(([side, site]) => {
      const active = quickDraft.side === side && quickDraft.site === site;
      return `
        <button class="place-option${active ? ' is-active' : ''}" type="button" data-side="${side}" data-site="${site}" aria-pressed="${active ? 'true' : 'false'}">
          <span>${escapeHtml(capitalize(side))}</span>
          <strong>${escapeHtml(capitalize(SITE_LABELS[site] || site))}</strong>
        </button>
      `;
    }).join('');
  }

  function handlePlacePickerSelection(event) {
    const button = event.target.closest('[data-side][data-site]');
    if (!button) return;
    const side = button.dataset.side;
    const site = button.dataset.site;
    if (!ALLOWED_SIDES.has(side) || !ALLOWED_SITES.has(site)) return;
    quickDraft.side = side;
    quickDraft.site = site;
    quickDraft.status = 'given';
    if (!quickDraft.unit) quickDraft.unit = data.settings.unit;
    if (!quickDraft.dose) quickDraft.dose = data.settings.defaultDose;
    quickDraftTouched = true;
    lastRecognizedText = `Wybrano: ${formatPlace(side, site)}`;
    closePlacePicker();
    renderToday();
    el['save-button'].focus({ preventScroll: true });
  }

  function openPlaceDetailsFromPicker() {
    closePlacePicker();
    openEntryDialog(quickDraft.id || null, quickDraft, 'entry-site');
  }

  function openEntryForDate(date, focusId = null) {
    const existing = getEntryForDate(date);
    if (existing) {
      showToast('Dla tego dnia istnieje już wpis. Otwieram go do edycji.');
      openEntryDialog(existing.id, null, focusId);
      return;
    }
    openEntryDialog(null, { date }, focusId);
  }

  function openOrEditSelectedDay() {
    const profile = getCalendarEntryTargetProfile();
    if (profile && profile.id !== data.activeProfileId && !activateProfileForEntryAction(profile.id)) return;
    openEntryForDate(selectedCalendarDate);
  }

  function openEntryDialog(entryId = null, draftOverride = null, focusId = null) {
    const entry = entryId ? data.entries.find((item) => item.id === entryId) : null;
    const source = entry
      ? { ...entry, ...(draftOverride || {}) }
      : { ...createDefaultDraft({ time: data.settings.defaultTime }), ...(draftOverride || {}) };
    el['entry-dialog-title'].textContent = entry ? 'Edytuj wpis' : 'Dodaj wpis';
    el['entry-id'].value = source.id || '';
    el['entry-date'].value = source.date || localDateISO();
    el['entry-time'].value = source.time || localTime();
    el['entry-dose'].value = source.dose || data.settings.defaultDose;
    el['entry-unit'].value = source.unit || data.settings.unit;
    el['entry-side'].value = source.side || '';
    el['entry-site'].value = source.site || '';
    el['entry-status'].value = source.status || 'given';
    el['entry-note'].value = source.note || '';
    el['delete-entry-button'].classList.toggle('is-hidden', !entry);
    updateEntryRequirements();
    el['entry-dialog'].showModal();
    window.setTimeout(() => document.getElementById(focusId || 'entry-date')?.focus(), 50);
  }

  function closeEntryDialog() {
    if (el['entry-dialog'].open) el['entry-dialog'].close();
  }

  function updateEntryRequirements() {
    const given = el['entry-status'].value === 'given';
    el['entry-side'].required = given;
    el['entry-site'].required = given;
    el['entry-dose'].required = given;
    [el['entry-dose'], el['entry-unit'], el['entry-side'], el['entry-site']].forEach((field) => {
      field.disabled = !given;
      field.closest('.form-field--given-only')?.classList.toggle('is-hidden', !given);
    });
  }


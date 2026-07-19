function renderCalendar() {
  calendarProfileScope = populateProfileScopeSelect(
    el['calendar-profile-filter'],
    calendarProfileScope,
    'Wszystkie dzieci'
  );
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const monthPrefix = `${year}-${pad(month + 1)}`;
  const scopedProfiles = getProfilesForScope(calendarProfileScope);
  const scopedRecords = getScopedEntryRecords(calendarProfileScope);
  const monthRecords = scopedRecords.filter(({ entry }) => entry.date.startsWith(monthPrefix));
  const monthGiven = monthRecords.filter(({ entry }) => entry.status === 'given').length;
  const monthSkipped = monthRecords.length - monthGiven;

  el['calendar-month-label'].textContent = capitalize(
    new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(calendarCursor)
  );
  el['calendar-month-summary'].textContent = monthRecords.length
    ? `${monthGiven} podano · ${monthSkipped} pominięto`
    : 'Brak wpisów w tym miesiącu';
  el['calendar-scope-label'].textContent = `${profileScopeDescription(
    calendarProfileScope,
    monthRecords.length
  )} w tym miesiącu`;
  renderCalendarProfileLegend(scopedProfiles);

  const firstVisible = new Date(year, month, 1 - mondayIndex(new Date(year, month, 1).getDay()));
  const entriesByDate = groupScopedEntriesByDate(scopedRecords);
  let html = '';

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(firstVisible);
    date.setDate(firstVisible.getDate() + index);
    const iso = localDateISO(date);
    const records = entriesByDate.get(iso) || [];
    const givenCount = records.filter(({ entry }) => entry.status === 'given').length;
    const skippedCount = records.length - givenCount;
    const classes = ['calendar-day'];
    if (date.getMonth() !== month) classes.push('is-outside');
    if (iso === selectedCalendarDate) classes.push('is-selected');
    if (iso === localDateISO()) classes.push('is-today');
    if (givenCount) classes.push('has-given');
    if (skippedCount) classes.push('has-skipped');
    if (givenCount && skippedCount) classes.push('has-mixed');

    const statusVisual =
      scopedProfiles.length === 1
        ? renderSingleProfileDayStatus(records[0]?.entry)
        : renderCalendarDayMarkers(records);
    const statusText = records.length
      ? `, podano: ${givenCount}, pominięto: ${skippedCount}`
      : ', brak wpisu';
    html += `
        <button class="${classes.join(' ')}" type="button" role="gridcell" data-date="${iso}" aria-label="${escapeHtml(formatDateLong(iso) + statusText)}" aria-selected="${iso === selectedCalendarDate}">
          <span class="day-number">${date.getDate()}</span>
          ${statusVisual}
        </button>
      `;
  }

  el['calendar-grid'].innerHTML = html;
  el['calendar-grid'].querySelectorAll('[data-date]').forEach((button) => {
    button.addEventListener('click', () => selectCalendarDate(button.dataset.date));
  });
}

function renderSingleProfileDayStatus(entry) {
  if (!entry) return '<span class="calendar-day-status calendar-day-status--empty" aria-hidden="true"></span>';
  const given = entry.status === 'given';
  return `<span class="calendar-day-status calendar-day-status--${entry.status}" aria-hidden="true">${iconSvg(
    given ? 'check' : 'minus'
  )}<span>${given ? 'Podano' : 'Pominięto'}</span></span>`;
}

function renderCalendarDayMarkers(records) {
  const markers = records
    .slice(0, 5)
    .map(
      ({ profile, entry }) =>
        `<i class="day-marker day-marker--${entry.status} profile-color-dot" data-profile-color="${escapeHtml(profile.color)}" title="${escapeHtml(profile.name)}: ${entry.status === 'given' ? 'podano' : 'pominięto'}" aria-hidden="true"></i>`
    )
    .join('');
  const more =
    records.length > 5
      ? `<span class="day-marker-more" aria-hidden="true">+${records.length - 5}</span>`
      : '';
  return `<span class="day-markers">${markers}${more}</span>`;
}

function renderCalendarProfileLegend(profiles) {
  el['calendar-profile-legend'].innerHTML =
    profiles.length > 1
      ? profiles
          .map(
            (profile) =>
              `<span><i class="day-marker day-marker--given profile-color-dot" data-profile-color="${escapeHtml(profile.color)}"></i>${escapeHtml(profile.icon)} ${escapeHtml(profile.name)}</span>`
          )
          .join('')
      : '';
  el['calendar-profile-legend'].classList.toggle('is-hidden', profiles.length <= 1);
}

function renderSelectedDay() {
  el['selected-day-label'].textContent = capitalize(formatDateLong(selectedCalendarDate));
  const records = getScopedEntryRecords(calendarProfileScope).filter(
    ({ entry }) => entry.date === selectedCalendarDate
  );
  const targetProfile = getCalendarEntryTargetProfile();
  const targetEntry =
    targetProfile?.entries.find((entry) => entry.date === selectedCalendarDate) || null;
  el['add-for-selected-day'].textContent = targetEntry
    ? `Edytuj: ${targetProfile.name}`
    : `Dodaj: ${targetProfile?.name || getActiveProfile().name}`;
  if (!records.length) {
    el['selected-day-entries'].innerHTML =
      '<div class="empty-state"><strong>Brak wpisu</strong><span>W tym dniu nie zapisano podania dla wybranego zakresu.</span></div>';
    return;
  }
  el['selected-day-entries'].innerHTML = records
    .map(
      ({ profile, entry }) => `
      <article class="day-entry-card day-entry-card--${entry.status}" data-profile-color="${escapeHtml(profile.color)}">
        <div class="day-entry-profile">
          <span class="profile-avatar profile-avatar--tab" data-profile-color="${escapeHtml(profile.color)}" aria-hidden="true">${escapeHtml(profile.icon)}</span>
          <strong>${escapeHtml(profile.name)}</strong>
          <span class="status-pill status-pill--${entry.status}">${entry.status === 'given' ? 'Podano' : 'Pominięto'}</span>
        </div>
        <strong>${entry.status === 'given' ? escapeHtml(capitalize(formatPlace(entry.side, entry.site))) : 'Dawka pominięta'}</strong>
        <div class="day-entry-card-meta">
          <span>${iconSvg('clock')}${escapeHtml(entry.time)}</span>
          <span>${entry.status === 'given' ? `${escapeHtml(formatDose(entry.dose))} ${escapeHtml(entry.unit)}` : 'bez dawki'}</span>
        </div>
        ${entry.note ? `<span class="day-entry-note">${escapeHtml(entry.note)}</span>` : ''}
        ${entry.correctedAt ? `<span class="correction-badge">${iconSvg('edit')} Poprawiono ${escapeHtml(formatDateTimeShort(entry.correctedAt))}</span>` : ''}
        <button class="text-button" type="button" data-edit-id="${entry.id}" data-entry-profile-id="${profile.id}">${iconSvg('edit')} Edytuj wpis</button>
      </article>
    `
    )
    .join('');
}

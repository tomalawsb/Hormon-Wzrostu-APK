function renderHistory() {
  historyProfileScope = populateProfileScopeSelect(
    el['history-profile-filter'],
    historyProfileScope,
    'Wszystkie dzieci'
  );
  const filters = getHistoryFilters();
  const records = filterHistoryRecords(
    getScopedEntryRecords(historyProfileScope, { descending: true }),
    filters
  );
  const groups = groupHistoryRecordsByDate(records);

  el['history-scope-label'].textContent = profileScopeDescription(
    historyProfileScope,
    records.length
  );
  el['history-list'].innerHTML = groups
    .map(([date, dateRecords]) => renderHistoryDateGroup(date, dateRecords))
    .join('');
  el['history-empty'].classList.toggle('is-hidden', records.length > 0);
  el['history-list'].classList.toggle('is-hidden', records.length === 0);
  el['history-clear-filters'].classList.toggle('is-hidden', !historyFiltersAreActive(filters));
}

function getHistoryFilters() {
  return {
    profile: historyProfileScope,
    query: normalizeText(el['history-search']?.value || ''),
    status: el['status-filter']?.value || 'all',
    site: el['site-filter']?.value || 'all',
    correction: el['history-correction-filter']?.value || 'all',
  };
}

function historyFiltersAreActive(filters) {
  return Boolean(
    filters.profile !== 'all' ||
      filters.query ||
      filters.status !== 'all' ||
      filters.site !== 'all' ||
      filters.correction !== 'all'
  );
}

function filterHistoryRecords(records, filters) {
  return records.filter(({ profile, entry }) => {
    if (filters.status !== 'all' && entry.status !== filters.status) return false;
    if (filters.site !== 'all' && entry.site !== filters.site) return false;
    if (filters.correction === 'corrected' && !entry.correctedAt) return false;
    if (filters.correction === 'original' && entry.correctedAt) return false;
    if (!filters.query) return true;
    const haystack = normalizeText(
      [
        profile.name,
        entry.date,
        formatDateShort(entry.date),
        formatDateLong(entry.date),
        entry.time,
        entry.dose,
        entry.unit,
        entry.side,
        entry.site,
        formatPlace(entry.side, entry.site),
        entry.note,
        entry.status === 'given' ? 'podano zastrzyk podanie' : 'pominięto pominięcie',
        entry.correctedAt ? `poprawiono ${formatDateTimeShort(entry.correctedAt)}` : '',
      ]
        .filter(Boolean)
        .join(' ')
    );
    return haystack.includes(filters.query);
  });
}

function groupHistoryRecordsByDate(records) {
  const groups = new Map();
  records.forEach((record) => {
    if (!groups.has(record.entry.date)) groups.set(record.entry.date, []);
    groups.get(record.entry.date).push(record);
  });
  return [...groups.entries()];
}

function historyDateHeading(date) {
  if (date === localDateISO()) return `Dzisiaj · ${capitalize(formatDateLong(date))}`;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (date === localDateISO(yesterday)) return `Wczoraj · ${capitalize(formatDateLong(date))}`;
  return capitalize(formatDateLong(date));
}

function renderHistoryDateGroup(date, records) {
  return `
    <section class="history-date-group" aria-labelledby="history-date-${date}">
      <div class="history-date-heading">
        <h2 id="history-date-${date}">${escapeHtml(historyDateHeading(date))}</h2>
        <span>${records.length} ${plural(records.length, 'wpis', 'wpisy', 'wpisów')}</span>
      </div>
      <div class="history-date-entries">
        ${records.map(renderHistoryEntryCard).join('')}
      </div>
    </section>
  `;
}

function renderHistoryEntryCard({ profile, entry }) {
  const given = entry.status === 'given';
  return `
    <article class="history-entry-card history-entry-card--${entry.status}">
      <div class="history-entry-header">
        <span class="history-profile-cell">
          <span class="profile-avatar profile-avatar--tab" data-profile-color="${escapeHtml(profile.color)}" aria-hidden="true">${escapeHtml(profile.icon)}</span>
          <strong>${escapeHtml(profile.name)}</strong>
        </span>
        <span class="history-entry-time">${iconSvg('clock')}${escapeHtml(entry.time)}</span>
        <span class="status-pill status-pill--${entry.status}">${given ? 'Podano' : 'Pominięto'}</span>
      </div>
      <div class="history-entry-content">
        <div class="history-entry-primary">
          <strong>${given ? `${escapeHtml(formatDose(entry.dose))} ${escapeHtml(entry.unit)}` : 'Dawka pominięta'}</strong>
          <span>${given ? `${iconSvg('location')}${escapeHtml(capitalize(formatPlace(entry.side, entry.site)))}` : 'Bez miejsca wkłucia'}</span>
        </div>
        ${entry.note ? `<p class="history-entry-note">${escapeHtml(entry.note)}</p>` : ''}
        ${entry.correctedAt ? `<span class="correction-badge" title="Wpis został zmieniony po pierwszym zapisaniu">${iconSvg('edit')} Poprawiono ${escapeHtml(formatDateTimeShort(entry.correctedAt))}</span>` : ''}
      </div>
      <div class="history-entry-actions">
        <button class="table-action" type="button" data-edit-id="${entry.id}" data-entry-profile-id="${profile.id}">${iconSvg('edit')} Edytuj</button>
        <button class="table-action table-action--danger" type="button" data-delete-id="${entry.id}" data-entry-profile-id="${profile.id}">${iconSvg('trash')} Usuń</button>
      </div>
    </article>
  `;
}

function normalizeProfileScope(scope) {
  if (scope === 'all') return 'all';
  const available = getAvailableProfiles();
  return available.some((profile) => profile.id === scope) ? scope : data.activeProfileId;
}

function populateProfileScopeSelect(select, scope, allLabel = 'Wszystkie dzieci') {
  const normalized = normalizeProfileScope(scope);
  if (!select) return normalized;
  const profiles = getAvailableProfiles();
  select.innerHTML = [
    `<option value="all">${escapeHtml(allLabel)}</option>`,
    ...profiles.map(
      (profile) =>
        `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.icon)} ${escapeHtml(profile.name)}</option>`
    ),
  ].join('');
  select.value = normalized;
  return select.value || data.activeProfileId;
}

function getProfilesForScope(scope) {
  const normalized = normalizeProfileScope(scope);
  return normalized === 'all'
    ? getAvailableProfiles()
    : getAvailableProfiles().filter((profile) => profile.id === normalized);
}

function getScopedEntryRecords(scope, { descending = false, from = '', to = '' } = {}) {
  const records = [];
  getProfilesForScope(scope).forEach((profile) => {
    profile.entries.forEach((entry) => {
      if (from && entry.date < from) return;
      if (to && entry.date > to) return;
      records.push({ profile, entry });
    });
  });
  records.sort((left, right) => {
    const leftKey = `${left.entry.date}T${left.entry.time || '00:00'}`;
    const rightKey = `${right.entry.date}T${right.entry.time || '00:00'}`;
    const order = leftKey.localeCompare(rightKey);
    if (order !== 0) return descending ? -order : order;
    return left.profile.name.localeCompare(right.profile.name, 'pl');
  });
  return records;
}

function groupScopedEntriesByDate(records) {
  const map = new Map();
  records.forEach((record) => {
    if (!map.has(record.entry.date)) map.set(record.entry.date, []);
    map.get(record.entry.date).push(record);
  });
  return map;
}

function profileScopeDescription(scope, count) {
  const profiles = getProfilesForScope(scope);
  const label = scope === 'all' ? 'Wszystkie dzieci' : profiles[0]?.name || getActiveProfile().name;
  return `${label} · ${count} ${plural(count, 'wpis', 'wpisy', 'wpisów')}`;
}

function getCalendarEntryTargetProfile() {
  if (calendarProfileScope !== 'all')
    return getProfilesForScope(calendarProfileScope)[0] || getActiveProfile();
  return getActiveProfile();
}

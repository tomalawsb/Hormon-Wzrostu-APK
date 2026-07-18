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
      ...profiles.map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.icon)} ${escapeHtml(profile.name)}</option>`)
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
    const label = scope === 'all' ? 'Wszystkie dzieci' : (profiles[0]?.name || getActiveProfile().name);
    return `${label} · ${count} ${plural(count, 'wpis', 'wpisy', 'wpisów')}`;
  }

  function getCalendarEntryTargetProfile() {
    if (calendarProfileScope !== 'all') return getProfilesForScope(calendarProfileScope)[0] || getActiveProfile();
    return getActiveProfile();
  }

  function handleCalendarProfileScopeChange() {
    calendarProfileScope = normalizeProfileScope(el['calendar-profile-filter'].value);
    renderCalendar();
    renderSelectedDay();
  }

  function handleHistoryProfileScopeChange() {
    historyProfileScope = normalizeProfileScope(el['history-profile-filter'].value);
    renderHistory();
  }

  function activateProfileForEntryAction(profileId) {
    const normalized = normalizeProfileScope(profileId);
    if (normalized === 'all') return false;
    if (normalized === data.activeProfileId) return true;
    if (!setActiveProfileId(normalized, { refresh: false })) {
      showToast('Nie można otworzyć wpisu tego profilu.', 'error');
      return false;
    }
    resetQuickDraftForToday();
    renderProfileControls();
    return true;
  }

  function selectCalendarDate(iso) {
    selectedCalendarDate = iso;
    const selected = parseISODate(iso);
    if (selected.getMonth() !== calendarCursor.getMonth() || selected.getFullYear() !== calendarCursor.getFullYear()) {
      calendarCursor = startOfMonth(selected);
    }
    renderCalendar();
    renderSelectedDay();
  }

  function changeCalendarMonth(delta) {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + delta, 1);
    selectedCalendarDate = localDateISO(calendarCursor);
    renderCalendar();
    renderSelectedDay();
  }

  function handleCalendarKeydown(event) {
    if (!event.target.matches('[data-date]')) return;
    const deltas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(event.key in deltas)) return;
    event.preventDefault();
    const date = parseISODate(event.target.dataset.date);
    date.setDate(date.getDate() + deltas[event.key]);
    const iso = localDateISO(date);
    selectCalendarDate(iso);
    window.setTimeout(() => el['calendar-grid'].querySelector(`[data-date="${iso}"]`)?.focus(), 0);
  }

  function handleHistoryAction(event) {
    const editButton = event.target.closest('[data-edit-id]');
    const deleteButton = event.target.closest('[data-delete-id]');
    const button = editButton || deleteButton;
    if (!button) return;
    if (!activateProfileForEntryAction(button.dataset.entryProfileId || data.activeProfileId)) return;
    if (editButton) openEntryDialog(editButton.dataset.editId);
    if (deleteButton) deleteEntry(deleteButton.dataset.deleteId);
  }

  function handleDayDetailsAction(event) {
    const editButton = event.target.closest('[data-edit-id]');
    if (!editButton) return;
    if (!activateProfileForEntryAction(editButton.dataset.entryProfileId || data.activeProfileId)) return;
    openEntryDialog(editButton.dataset.editId);
  }

  function deleteEntryFromDialog() {
    const id = el['entry-id'].value;
    if (id) deleteEntry(id, true);
  }

  function deleteEntry(id, closeDialogAfter = false) {
    const entry = data.entries.find((item) => item.id === id);
    if (!entry) return;
    if (!window.confirm(`Usunąć wpis z ${formatDateShort(entry.date)} dla profilu ${getActiveProfile().name}?`)) return;
    data.entries = data.entries.filter((item) => item.id !== id);
    reconcileAmpouleStatuses();
    if (!persistData()) return;
    if (closeDialogAfter) closeEntryDialog();
    resetQuickDraftForToday();
    renderAll();
    showToast('Wpis został usunięty.', 'success');
  }


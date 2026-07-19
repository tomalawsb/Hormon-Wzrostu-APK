
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
  if (
    selected.getMonth() !== calendarCursor.getMonth() ||
    selected.getFullYear() !== calendarCursor.getFullYear()
  ) {
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

function goToCalendarToday() {
  const today = localDateISO();
  calendarCursor = startOfMonth(new Date());
  selectedCalendarDate = today;
  renderCalendar();
  renderSelectedDay();
  window.setTimeout(
    () => el['calendar-grid'].querySelector(`[data-date="${today}"]`)?.focus(),
    0
  );
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

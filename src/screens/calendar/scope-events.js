
function handleCalendarProfileScopeChange() {
  calendarProfileScope = normalizeProfileScope(el['calendar-profile-filter'].value);
  renderCalendar();
  renderSelectedDay();
}

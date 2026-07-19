function renderAll() {
  applyThemePreference();
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

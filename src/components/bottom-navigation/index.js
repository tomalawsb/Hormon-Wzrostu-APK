
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
  if (focus)
    document
      .getElementById(`view-${view}`)
      ?.querySelector('h1, [tabindex]')
      ?.focus({ preventScroll: true });
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

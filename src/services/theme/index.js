const THEME_COLOR_LIGHT = '#0c857b';
const THEME_COLOR_DARK = '#0b2529';
let themeMediaQuery = null;
let themeMediaListenerBound = false;

function defaultAppearanceSettings() {
  return { theme: DEFAULT_THEME_MODE };
}

function sanitizeAppearanceSettings(settings = {}) {
  const requested = typeof settings?.theme === 'string' ? settings.theme : '';
  return { theme: ALLOWED_THEME_MODES.has(requested) ? requested : DEFAULT_THEME_MODE };
}

function getAppearanceSettings(container = data) {
  if (!container.appSettings || typeof container.appSettings !== 'object') {
    container.appSettings = {};
  }
  container.appSettings.appearance = sanitizeAppearanceSettings(container.appSettings.appearance);
  return container.appSettings.appearance;
}

function systemPrefersDark() {
  return Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

function resolveTheme(mode = DEFAULT_THEME_MODE) {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return systemPrefersDark() ? 'dark' : 'light';
}

function applyThemePreference(mode = getAppearanceSettings().theme) {
  const safeMode = ALLOWED_THEME_MODES.has(mode) ? mode : DEFAULT_THEME_MODE;
  const resolved = resolveTheme(safeMode);
  document.documentElement.dataset.themeMode = safeMode;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute('content', resolved === 'dark' ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
  }
  return resolved;
}

function bindThemePreferences() {
  el['theme-mode-control']?.addEventListener('change', handleThemeModeChange);
  if (themeMediaListenerBound || !window.matchMedia) return;
  themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = () => {
    if (getAppearanceSettings().theme !== 'system') return;
    applyThemePreference('system');
    renderAppearanceSettings();
  };
  if (typeof themeMediaQuery.addEventListener === 'function') {
    themeMediaQuery.addEventListener('change', listener);
  } else {
    themeMediaQuery.addListener?.(listener);
  }
  themeMediaListenerBound = true;
}

function handleThemeModeChange(event) {
  const input = event.target.closest('input[name="theme-mode"]');
  if (!input || !ALLOWED_THEME_MODES.has(input.value)) return;
  getAppearanceSettings().theme = input.value;
  applyThemePreference(input.value);
  if (!persistData()) return;
  renderAppearanceSettings();
  showToast('Wygląd aplikacji został zmieniony.', 'success');
}

function renderAppearanceSettings() {
  if (!el['theme-mode-control']) return;
  const mode = getAppearanceSettings().theme;
  const control = el[`theme-${mode}`];
  if (control) control.checked = true;
  const resolved = resolveTheme(mode);
  if (el['theme-status']) {
    el['theme-status'].textContent =
      mode === 'system'
        ? `Automatyczny · teraz ${resolved === 'dark' ? 'ciemny' : 'jasny'}`
        : mode === 'dark'
          ? 'Ciemny'
          : 'Jasny';
  }
}

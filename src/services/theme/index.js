const THEME_PRESENTATION = Object.freeze({
  light: Object.freeze({ label: 'Jasny', colorScheme: 'light', themeColor: '#0c857b' }),
  dark: Object.freeze({ label: 'Ciemny', colorScheme: 'dark', themeColor: '#0b2529' }),
  elegant: Object.freeze({
    label: 'Elegancki',
    colorScheme: 'dark',
    themeColor: '#1b1e21',
  }),
  amber: Object.freeze({
    label: 'Bursztynowy',
    colorScheme: 'light',
    themeColor: '#a95600',
  }),
  silver: Object.freeze({
    label: 'Srebrny',
    colorScheme: 'light',
    themeColor: '#526874',
  }),
  lavender: Object.freeze({
    label: 'Lawendowy',
    colorScheme: 'light',
    themeColor: '#6a55a3',
  }),
});
const FONT_SIZE_LABELS = Object.freeze({
  small: 'Mała',
  standard: 'Standardowa',
  large: 'Duża',
  xlarge: 'Bardzo duża',
});
const FONT_STYLE_LABELS = Object.freeze({
  system: 'Systemowa',
  readable: 'Czytelna',
  classic: 'Klasyczna',
});
let themeMediaQuery = null;
let themeMediaListenerBound = false;

function defaultAppearanceSettings() {
  return {
    theme: DEFAULT_THEME_MODE,
    fontSize: DEFAULT_FONT_SIZE,
    fontStyle: DEFAULT_FONT_STYLE,
  };
}

function sanitizeAppearanceSettings(settings = {}) {
  const requestedTheme = typeof settings?.theme === 'string' ? settings.theme : '';
  const requestedFontSize = typeof settings?.fontSize === 'string' ? settings.fontSize : '';
  const requestedFontStyle = typeof settings?.fontStyle === 'string' ? settings.fontStyle : '';
  return {
    theme: ALLOWED_THEME_MODES.has(requestedTheme) ? requestedTheme : DEFAULT_THEME_MODE,
    fontSize: ALLOWED_FONT_SIZES.has(requestedFontSize) ? requestedFontSize : DEFAULT_FONT_SIZE,
    fontStyle: ALLOWED_FONT_STYLES.has(requestedFontStyle)
      ? requestedFontStyle
      : DEFAULT_FONT_STYLE,
  };
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
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return ALLOWED_THEME_MODES.has(mode) ? mode : 'light';
}

function themeColorScheme(theme) {
  return THEME_PRESENTATION[theme]?.colorScheme || 'light';
}

function applyTypographyPreference(settings = getAppearanceSettings()) {
  const safe = sanitizeAppearanceSettings(settings);
  document.documentElement.dataset.fontSize = safe.fontSize;
  document.documentElement.dataset.fontStyle = safe.fontStyle;
}

function applyThemePreference(mode = getAppearanceSettings().theme) {
  const safeMode = ALLOWED_THEME_MODES.has(mode) ? mode : DEFAULT_THEME_MODE;
  const resolved = resolveTheme(safeMode);
  document.documentElement.dataset.themeMode = safeMode;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = themeColorScheme(resolved);
  applyTypographyPreference();
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute(
      'content',
      THEME_PRESENTATION[resolved]?.themeColor || THEME_PRESENTATION.light.themeColor
    );
  }
  return resolved;
}

function ensureTypographyControls() {
  if (typeof document.getElementById !== 'function') return;
  if (document.getElementById('font-size-control')) return;
  const card = document.querySelector(
    '[data-settings-panel="appearance"] .appearance-settings-card'
  );
  if (!card) return;

  const section = document.createElement('section');
  section.className = 'typography-settings';
  section.setAttribute('aria-labelledby', 'typography-settings-title');
  section.innerHTML = `
    <div class="typography-settings__heading">
      <div>
        <p class="eyebrow">Tekst w programie</p>
        <h3 id="typography-settings-title">Czcionka</h3>
      </div>
      <span id="font-status" class="profile-count-badge">Standardowa · Systemowa</span>
    </div>
    <fieldset id="font-size-control" class="font-option-group">
      <legend>Wielkość czcionki</legend>
      <div class="font-option-grid">
        <label class="font-option"><input id="font-size-small" type="radio" name="font-size" value="small"><strong>Mała</strong><small>90%</small></label>
        <label class="font-option"><input id="font-size-standard" type="radio" name="font-size" value="standard"><strong>Standardowa</strong><small>100%</small></label>
        <label class="font-option"><input id="font-size-large" type="radio" name="font-size" value="large"><strong>Duża</strong><small>112%</small></label>
        <label class="font-option"><input id="font-size-xlarge" type="radio" name="font-size" value="xlarge"><strong>Bardzo duża</strong><small>125%</small></label>
      </div>
    </fieldset>
    <fieldset id="font-style-control" class="font-option-group">
      <legend>Styl czcionki</legend>
      <div class="font-option-grid font-option-grid--styles">
        <label class="font-option"><input id="font-style-system" type="radio" name="font-style" value="system"><strong>Systemowa</strong><small>Zgodna z telefonem</small></label>
        <label class="font-option"><input id="font-style-readable" type="radio" name="font-style" value="readable"><strong>Czytelna</strong><small>Proste kształty liter</small></label>
        <label class="font-option"><input id="font-style-classic" type="radio" name="font-style" value="classic"><strong>Klasyczna</strong><small>Litery szeryfowe</small></label>
      </div>
    </fieldset>
    <div id="font-preview" class="font-preview" aria-live="polite">
      <strong>Przykładowy tekst programu</strong>
      <span>Historia podań, ustawienia i przypomnienia.</span>
    </div>`;

  const guide = card.querySelector('.visual-status-guide');
  if (guide) card.insertBefore(section, guide);
  else card.appendChild(section);
}

function bindThemePreferences() {
  ensureTypographyControls();
  el['theme-mode-control']?.addEventListener('change', handleThemeModeChange);
  document.getElementById?.('font-size-control')?.addEventListener(
    'change',
    handleTypographyChange
  );
  document.getElementById?.('font-style-control')?.addEventListener(
    'change',
    handleTypographyChange
  );
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

function handleTypographyChange(event) {
  const input = event.target.closest('input[name="font-size"], input[name="font-style"]');
  if (!input) return;
  const settings = getAppearanceSettings();
  const previous = { ...settings };

  if (input.name === 'font-size' && ALLOWED_FONT_SIZES.has(input.value)) {
    settings.fontSize = input.value;
  } else if (input.name === 'font-style' && ALLOWED_FONT_STYLES.has(input.value)) {
    settings.fontStyle = input.value;
  } else {
    return;
  }

  applyTypographyPreference(settings);
  if (!persistData()) {
    Object.assign(settings, previous);
    applyTypographyPreference(settings);
    renderAppearanceSettings();
    return;
  }
  renderAppearanceSettings();
  showToast('Ustawienia czcionki zostały zmienione.', 'success');
}

function renderAppearanceSettings() {
  ensureTypographyControls();
  if (!el['theme-mode-control']) return;
  const settings = getAppearanceSettings();
  const mode = settings.theme;
  const control = el[`theme-${mode}`];
  if (control) control.checked = true;
  const resolved = resolveTheme(mode);
  if (el['theme-status']) {
    el['theme-status'].textContent =
      mode === 'system'
        ? `Automatyczny · teraz ${resolved === 'dark' ? 'ciemny' : 'jasny'}`
        : THEME_PRESENTATION[mode]?.label || THEME_PRESENTATION.light.label;
  }

  const sizeControl = document.getElementById?.(`font-size-${settings.fontSize}`);
  const styleControl = document.getElementById?.(`font-style-${settings.fontStyle}`);
  if (sizeControl) sizeControl.checked = true;
  if (styleControl) styleControl.checked = true;
  const fontStatus = document.getElementById?.('font-status');
  if (fontStatus) {
    fontStatus.textContent = `${FONT_SIZE_LABELS[settings.fontSize]} · ${FONT_STYLE_LABELS[settings.fontStyle]}`;
  }
}

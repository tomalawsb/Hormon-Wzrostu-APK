const SETTINGS_SECTIONS = new Set([
  'profiles',
  'treatment',
  'reminders',
  'ampoules',
  'appearance',
  'data',
  'security',
  'about',
]);
const SETTINGS_SECTION_ALIASES = new Map([
  ['injection-order', { section: 'treatment', advancedId: 'settings-advanced-injection' }],
  ['voice', { section: 'reminders', advancedId: 'settings-advanced-voice' }],
  ['permissions-info', { section: 'about', advancedId: 'settings-advanced-permissions' }],
]);
const PROFILE_SETTINGS_SECTIONS = new Set(['profiles', 'treatment', 'reminders', 'ampoules']);
let activeSettingsSection = 'profiles';
let settingsDetailOpen = false;

function isMobileSettingsLayout() {
  return Boolean(window.matchMedia?.('(max-width: 820px)').matches);
}

function handleSettingsCategoryClick(event) {
  const button = event.target.closest('[data-settings-target]');
  if (!button) return;
  openSettingsSection(button.dataset.settingsTarget);
}

function openSettingsSection(section, { focus = true } = {}) {
  const alias = SETTINGS_SECTION_ALIASES.get(section) || null;
  if (alias) section = alias.section;
  if (!SETTINGS_SECTIONS.has(section)) section = 'profiles';
  if (activeView !== 'more') switchView('more');
  activeSettingsSection = section;
  settingsDetailOpen = true;
  renderSettingsNavigation();
  const advanced = alias?.advancedId ? document.getElementById(alias.advancedId) : null;
  if (advanced) advanced.open = true;
  if (focus) {
    window.setTimeout(() => {
      const panel = document.querySelector(`[data-settings-panel="${section}"]`);
      if (isMobileSettingsLayout()) {
        el['settings-section-back-button']?.focus({ preventScroll: true });
        el['settings-section-back-button']?.scrollIntoView({ block: 'start', behavior: 'auto' });
      } else {
        const focusTarget =
          advanced?.querySelector('summary') ||
          panel?.querySelector('input, select, button, [tabindex]');
        focusTarget?.focus({ preventScroll: false });
        panel?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    }, 40);
  }
}

function showSettingsOverview({ focus = true } = {}) {
  settingsDetailOpen = false;
  renderSettingsNavigation();
  if (focus) {
    window.setTimeout(() => {
      el['settings-category-list']
        ?.querySelector(`[data-settings-target="${activeSettingsSection}"]`)
        ?.focus({ preventScroll: true });
      el['settings-layout']?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 30);
  }
}

function renderSettingsNavigation() {
  if (!el['settings-layout'] || !el['settings-category-list'] || !el['settings-panels']) return;
  const mobile = isMobileSettingsLayout();
  const showDetail = !mobile || settingsDetailOpen;
  el['settings-layout'].classList.toggle('is-mobile-detail', mobile && settingsDetailOpen);
  el['settings-layout'].classList.toggle('is-mobile-overview', mobile && !settingsDetailOpen);
  el['settings-section-back-button'].classList.toggle('is-hidden', !(mobile && settingsDetailOpen));
  if (el['settings-profile-context']) {
    el['settings-profile-context'].hidden = !PROFILE_SETTINGS_SECTIONS.has(activeSettingsSection);
  }

  el['settings-category-list'].querySelectorAll('[data-settings-target]').forEach((button) => {
    const target = button.dataset.settingsTarget;
    const active = target === activeSettingsSection;
    button.id = `settings-tab-${target}`;
    button.setAttribute('aria-controls', `settings-panel-${target}`);
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = 0;
  });

  el['settings-panels'].querySelectorAll('[data-settings-panel]').forEach((panel) => {
    const target = panel.dataset.settingsPanel;
    const active = target === activeSettingsSection;
    panel.id = `settings-panel-${target}`;
    panel.setAttribute('aria-labelledby', `settings-tab-${target}`);
    panel.hidden = !(showDetail && active);
    panel.setAttribute('aria-hidden', showDetail && active ? 'false' : 'true');
  });
}

function handleSettingsLayoutChange() {
  renderSettingsNavigation();
}

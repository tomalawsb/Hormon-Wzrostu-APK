  const SETTINGS_SECTIONS = new Set([
    'profiles', 'treatment', 'injection-order', 'ampoules',
    'reminders', 'voice', 'data', 'permissions-info'
  ]);
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
    if (!SETTINGS_SECTIONS.has(section)) section = 'profiles';
    if (activeView !== 'more') switchView('more');
    activeSettingsSection = section;
    settingsDetailOpen = true;
    renderSettingsNavigation();
    if (focus) {
      window.setTimeout(() => {
        const panel = document.querySelector(`[data-settings-panel="${section}"]`);
        if (isMobileSettingsLayout()) {
          el['settings-section-back-button']?.focus({ preventScroll: true });
          el['settings-section-back-button']?.scrollIntoView({ block: 'start', behavior: 'auto' });
        } else {
          panel?.querySelector('input, select, button, [tabindex]')?.focus({ preventScroll: false });
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
        el['settings-category-list']?.querySelector(`[data-settings-target="${activeSettingsSection}"]`)?.focus({ preventScroll: true });
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

    el['settings-category-list'].querySelectorAll('[data-settings-target]').forEach((button) => {
      const active = button.dataset.settingsTarget === activeSettingsSection;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = 0;
    });

    el['settings-panels'].querySelectorAll('[data-settings-panel]').forEach((panel) => {
      const active = panel.dataset.settingsPanel === activeSettingsSection;
      panel.hidden = !(showDetail && active);
      panel.setAttribute('aria-hidden', showDetail && active ? 'false' : 'true');
    });
  }

  function handleSettingsLayoutChange() {
    renderSettingsNavigation();
  }

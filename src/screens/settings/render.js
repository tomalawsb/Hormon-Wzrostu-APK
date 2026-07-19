
function renderSettings() {
  const activeProfile = getActiveProfile();
  const activeAmpoule = getActiveAmpoule();
  el['settings-profile-avatar'].textContent = activeProfile.icon;
  el['settings-profile-avatar'].dataset.profileColor = activeProfile.color;
  el['settings-profile-name'].textContent = activeProfile.name;
  el['settings-profile-note'].textContent =
    `Dawkowanie, ampułki i przypomnienia dotyczą profilu ${activeProfile.name}.`;
  renderProfileHealthDashboard();
  el['settings-dose'].value = data.settings.defaultDose;
  el['settings-unit'].value = data.settings.unit;
  el['settings-time'].value = data.settings.defaultTime;
  el['ampoule-start-date'].value = activeAmpoule?.startDate || data.settings.ampouleStartDate || '';
  el['ampoule-start-number'].value = activeAmpoule?.number || data.settings.ampouleStartNumber || 1;
  el['ampoule-volume'].value =
    activeAmpoule?.volumeMl || data.settings.ampouleVolumeMl || DEFAULT_AMPOULE_VOLUME_ML;
  el['ampoule-dose-ml'].value = data.settings.ampouleDoseMl || '';
  el['ampoule-max-open-days'].value = data.settings.ampouleMaxOpenDays || '';
  renderAmpouleManagement();
  renderInjectionOrderSettings();
  el['voice-feedback-toggle'].checked = Boolean(data.settings.voiceFeedback);
  el['voice-confirm-toggle'].checked = Boolean(data.settings.voiceConfirm);
  el['reminder-enabled-toggle'].checked = Boolean(data.settings.reminderEnabled);
  el['reminder-time'].value = data.settings.reminderTime || '21:00';
  el['clear-data-button'].textContent = `Usuń wszystkie wpisy profilu ${activeProfile.name}`;
  renderReportConfiguration();
  renderAppearanceSettings();
  updatePermissionStatuses();
  renderSettingsNavigation();
}

let setupWizardStep = 0;
let setupImportInspection = null;

function isSetupCompleted() {
  return Boolean(data.meta.setupCompleted);
}

function maybeShowFirstRunSetup() {
  if (isSetupCompleted()) return false;
  window.setTimeout(openSetupWizard, 120);
  return true;
}

function openSetupWizard() {
  setupWizardStep = 0;
  renderSetupWizardStep();
  if (!el['setup-dialog'].open) el['setup-dialog'].showModal();
}

function bindSetupWizardEvents() {
  el['setup-new-button'].addEventListener('click', () => setSetupWizardStep(1));
  el['setup-import-button'].addEventListener('click', () => el['setup-import-file'].click());
  el['setup-import-file'].addEventListener('change', inspectSetupImportFile);
  el['setup-import-confirm'].addEventListener('click', confirmSetupImport);
  el['setup-back-button'].addEventListener('click', () => setSetupWizardStep(setupWizardStep - 1));
  el['setup-next-button'].addEventListener('click', advanceSetupWizard);
  el['setup-form'].addEventListener('submit', finishSetupWizard);
  el['setup-dialog'].addEventListener('cancel', (event) => event.preventDefault());
}

function setSetupWizardStep(step) {
  setupWizardStep = Math.max(0, Math.min(3, Number(step) || 0));
  renderSetupWizardStep();
}

function renderSetupWizardStep() {
  document.querySelectorAll('[data-setup-step]').forEach((panel) => {
    const active = Number(panel.dataset.setupStep) === setupWizardStep;
    panel.hidden = !active;
    panel.classList.toggle('is-active', active);
  });
  const inConfiguration = setupWizardStep > 0;
  el['setup-actions'].hidden = !inConfiguration;
  el['setup-step-label'].textContent = `Krok ${setupWizardStep + 1} z 4`;
  el['setup-progress-fill'].style.width = `${((setupWizardStep + 1) / 4) * 100}%`;
  el['setup-back-button'].hidden = setupWizardStep <= 1;
  el['setup-next-button'].hidden = setupWizardStep === 3;
  el['setup-finish-button'].hidden = setupWizardStep !== 3;
  window.setTimeout(() => {
    document
      .querySelector(`[data-setup-step="${setupWizardStep}"] input:not(.sr-only), [data-setup-step="${setupWizardStep}"] button`)
      ?.focus({ preventScroll: true });
  }, 30);
}

function validateCurrentSetupStep() {
  if (setupWizardStep === 1) {
    const name = sanitizeProfileName(el['setup-profile-name'].value);
    if (!name) {
      showToast('Podaj nazwę profilu.', 'error');
      el['setup-profile-name'].focus();
      return false;
    }
  }
  if (setupWizardStep === 2) {
    if (!normalizeDose(el['setup-dose'].value)) {
      showToast('Podaj prawidłową dawkę.', 'error');
      el['setup-dose'].focus();
      return false;
    }
    if (!isValidTime(el['setup-time'].value)) {
      showToast('Podaj prawidłową godzinę podania.', 'error');
      return false;
    }
  }
  return true;
}

function advanceSetupWizard() {
  if (!validateCurrentSetupStep()) return;
  setSetupWizardStep(setupWizardStep + 1);
}

async function inspectSetupImportFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > MAX_BACKUP_FILE_SIZE * 2) throw new Error('Plik przekracza limit 20 MB.');
    let parsed = JSON.parse(await file.text());
    assertSafeJsonValue(parsed);
    const encrypted = isEncryptedBackupEnvelope(parsed);
    if (encrypted) {
      const password = window.prompt('Podaj hasło do zabezpieczonej kopii:');
      if (!password) throw new Error('Nie podano hasła do kopii.');
      parsed = await decryptBackupEnvelope(parsed, password);
    }
    setupImportInspection = {
      ...inspectBackupPayload(parsed),
      filename: file.name || 'kopia.json',
      encrypted,
    };
    const summary = setupImportInspection.summary;
    el['setup-import-name'].textContent = setupImportInspection.filename;
    el['setup-import-summary'].textContent = `${summary.profileCount} ${plural(summary.profileCount, 'profil', 'profile', 'profili')} · ${summary.entryCount} ${plural(summary.entryCount, 'wpis', 'wpisy', 'wpisów')}`;
    el['setup-import-preview'].hidden = false;
  } catch (error) {
    setupImportInspection = null;
    el['setup-import-preview'].hidden = true;
    showToast(`Nie udało się odczytać kopii. ${error.message || ''}`.trim(), 'error', 7000);
  }
}

function confirmSetupImport() {
  if (!setupImportInspection) return;
  setupImportInspection.mode = 'replace-all';
  if (!applyInspectedImport(setupImportInspection)) return;
  data.meta.setupCompleted = true;
  data.meta.onboardingCompleted = true;
  if (!persistData()) return;
  setupImportInspection = null;
  el['setup-dialog'].close();
  renderAll();
  showToast('Dane i historia zostały przeniesione. Wszystko jest gotowe.', 'success', 6500);
  maybeShowFirstRunPermissions();
}

function finishSetupWizard(event) {
  event.preventDefault();
  const name = sanitizeProfileName(el['setup-profile-name'].value);
  const dose = normalizeDose(el['setup-dose'].value);
  const unit = ALLOWED_UNITS.has(el['setup-unit'].value) ? el['setup-unit'].value : 'mg';
  const time = isValidTime(el['setup-time'].value) ? el['setup-time'].value : '20:00';
  const count = normalizeAmpouleDoseCount(el['setup-dose-count'].value, 0);
  const reminderTime = isValidTime(el['setup-reminder-time'].value)
    ? el['setup-reminder-time'].value
    : '21:00';
  if (!name || !dose || !count) {
    showToast('Uzupełnij wymagane ustawienia.', 'error');
    return;
  }

  const profile = getActiveProfile();
  profile.name = name;
  profile.icon = el['setup-type-child'].checked ? '🧒' : '🙂';
  profile.settings.defaultDose = dose;
  profile.settings.unit = unit;
  profile.settings.defaultTime = time;
  profile.settings.ampouleStartDate = localDateISO();
  profile.settings.ampouleDoseCount = count;
  profile.settings.reminderEnabled = el['setup-reminder-enabled'].checked;
  profile.settings.reminderTime = reminderTime;
  const volumeMl = decimalToNumber(profile.settings.ampouleVolumeMl) || 10;
  const doseMl = decimalToNumber(profile.settings.ampouleDoseMl) || volumeMl / count;
  const ampoule = createAmpouleRecord({
    number: profile.settings.ampouleStartNumber,
    startDate: localDateISO(),
    volumeMl,
    doseMl,
    targetDoseCount: count,
    status: 'active',
  });
  profile.ampoules = [ampoule];
  profile.activeAmpouleId = ampoule.id;
  data.appSettings.appearance.theme = 'elegant';
  data.meta.setupCompleted = true;
  if (!persistData()) return;
  applyThemePreference('elegant');
  resetQuickDraftForToday();
  el['setup-dialog'].close();
  renderAll();
  scheduleDailyReminder();
  showToast('Dzienniczek jest gotowy. Możesz zapisać pierwsze podanie.', 'success', 6500);
  maybeShowFirstRunPermissions();
}

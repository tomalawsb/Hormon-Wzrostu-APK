function saveSettings() {
  const dose = normalizeDose(el['settings-dose'].value);
  if (!dose) {
    showToast('Podaj prawidłową dawkę domyślną.', 'error');
    return;
  }
  const profile = getActiveProfile();
  const previousSettings = structuredCloneSafe(profile.settings);
  const previousDoseHistory = structuredCloneSafe(profile.doseHistory);
  const previousAmpoules = structuredCloneSafe(profile.ampoules);
  const unit = ALLOWED_UNITS.has(el['settings-unit'].value) ? el['settings-unit'].value : 'mg';
  const doseChanged =
    Math.abs(decimalToNumber(dose) - decimalToNumber(previousSettings.defaultDose)) > 0.000001 ||
    unit !== previousSettings.unit;
  const effectiveDate = el['settings-dose-effective-date'].value || localDateISO();
  if (doseChanged && (!isValidIsoDate(effectiveDate) || effectiveDate > localDateISO())) {
    showToast('Podaj prawidłową datę zmiany dawki, nie późniejszą niż dzisiaj.', 'error');
    return;
  }

  data.settings.defaultDose = dose;
  data.settings.unit = unit;
  data.settings.defaultTime = isValidTime(el['settings-time'].value)
    ? el['settings-time'].value
    : '20:00';
  if (
    doseChanged &&
    !upsertProfileDoseChange(profile, {
      date: effectiveDate,
      dose,
      unit,
      note: el['settings-dose-change-note'].value,
    })
  ) {
    profile.settings = previousSettings;
    profile.doseHistory = previousDoseHistory;
    showToast('Nie udało się zapisać historii zmiany dawki.', 'error');
    return;
  }
  const activeAmpoule = getActiveAmpoule();
  if (activeAmpoule && data.settings.unit === 'ml') {
    activeAmpoule.doseMl = normalizePositiveDecimal(dose);
    activeAmpoule.updatedAt = new Date().toISOString();
    reconcileAmpouleStatuses();
  }
  if (!persistData()) {
    profile.settings = previousSettings;
    profile.doseHistory = previousDoseHistory;
    profile.ampoules = previousAmpoules;
    return;
  }
  if (!quickDraftTouched && !quickDraft.id) resetQuickDraftForToday();
  renderAll();
  showToast(
    quickDraftTouched
      ? `Dawka i godzina zostały zapisane${doseChanged ? ' wraz z historią zmiany' : ''}. Przygotowany wpis pozostał bez zmian.`
      : `Dawka i godzina zostały zapisane${doseChanged ? ' wraz z historią zmiany' : ''}.`,
    'success'
  );
}

function saveAmpouleSettings() {
  const ampouleStartNumber = normalizeAmpouleNumber(el['ampoule-start-number'].value);
  const ampouleVolume =
    normalizePositiveDecimal(el['ampoule-volume'].value) || DEFAULT_AMPOULE_VOLUME_ML;
  const ampouleDoseMl = normalizeOptionalPositiveDecimal(el['ampoule-dose-ml'].value);
  const ampouleStartDate = el['ampoule-start-date'].value;
  const ampouleMaxOpenDays = normalizeOptionalDayLimit(el['ampoule-max-open-days'].value);
  if (ampouleStartDate && !isValidIsoDate(ampouleStartDate)) {
    showToast('Podaj prawidłową datę rozpoczęcia ampułki.', 'error');
    return;
  }
  if (el['ampoule-dose-ml'].value.trim() && !ampouleDoseMl) {
    showToast('Podaj prawidłową wartość ml na jedno podanie.', 'error');
    return;
  }
  if (el['ampoule-max-open-days'].value.trim() && !ampouleMaxOpenDays) {
    showToast('Podaj prawidłowy limit dni od 1 do 365.', 'error');
    return;
  }

  data.settings.ampouleStartDate = ampouleStartDate || '';
  data.settings.ampouleStartNumber = ampouleStartNumber;
  data.settings.ampouleVolumeMl = ampouleVolume;
  data.settings.ampouleDoseMl = ampouleDoseMl;
  data.settings.ampouleMaxOpenDays = ampouleMaxOpenDays;

  const configuredDoseMl = getConfiguredAmpouleDoseMl();
  const active = getActiveAmpoule();
  if (active && configuredDoseMl) {
    active.number = ampouleStartNumber;
    active.startDate = ampouleStartDate || active.startDate;
    active.volumeMl = ampouleVolume;
    active.doseMl = normalizePositiveDecimal(configuredDoseMl);
    active.updatedAt = new Date().toISOString();
  } else if (!data.ampoules.length && ampouleStartDate && configuredDoseMl) {
    const ampoule = createAmpouleRecord({
      number: ampouleStartNumber,
      startDate: ampouleStartDate,
      volumeMl: ampouleVolume,
      doseMl: configuredDoseMl,
      status: 'active',
    });
    data.ampoules.push(ampoule);
    data.activeAmpouleId = ampoule.id;
  }
  reconcileAmpouleStatuses();
  if (!persistData()) return;
  renderAll();
  showToast('Ustawienia ampułki zostały zapisane.', 'success');
}

function saveVoiceSettings() {
  data.settings.voiceFeedback = el['voice-feedback-toggle'].checked;
  data.settings.voiceConfirm = el['voice-confirm-toggle'].checked;
  if (!persistData()) return;
  renderSettings();
  showToast('Ustawienia obsługi głosowej zostały zapisane.', 'success');
}

async function saveReminderSettings() {
  const time = el['reminder-time'].value || '21:00';
  const enabled = el['reminder-enabled-toggle'].checked;
  const currentPermission = isNativeAndroidApp()
    ? await window.NativeBridge.notificationPermission()
    : 'Notification' in window
      ? Notification.permission
      : 'unsupported';
  if (enabled && currentPermission !== 'granted') {
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      el['reminder-enabled-toggle'].checked = false;
      showToast('Nie można włączyć przypomnienia bez zgody na powiadomienia.', 'error');
      return;
    }
  }
  data.settings.reminderEnabled = enabled;
  data.settings.reminderTime = isValidTime(time) ? time : '21:00';
  if (!persistData()) return;
  const syncResult = await syncReminderStateWithServiceWorker();
  if (!isNativeAndroidApp()) scheduleDailyReminder();
  await registerPeriodicReminder();
  checkReminderDue();
  renderSettings();
  const diagnostics = await refreshReminderDiagnostics();
  if (enabled && (!syncResult?.scheduled || !diagnostics?.scheduledProfiles)) {
    showToast(
      'Ustawienia zapisano, ale system nie potwierdził zaplanowania alarmu. Sprawdź diagnostykę.',
      'error'
    );
    return;
  }
  showToast(
    enabled && diagnostics?.scheduleMode === 'inexact'
      ? `Przypomnienie ustawiono na ${time}, ale Android może je nieznacznie opóźnić.`
      : enabled
        ? `Przypomnienie ustawiono na ${time}.`
        : 'Przypomnienie zostało wyłączone.',
    'success'
  );
}

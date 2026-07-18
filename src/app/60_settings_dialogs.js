  function saveSettings() {
    const dose = normalizeDose(el['settings-dose'].value);
    if (!dose) {
      showToast('Podaj prawidłową dawkę domyślną.', 'error');
      return;
    }
    data.settings.defaultDose = dose;
    data.settings.unit = ALLOWED_UNITS.has(el['settings-unit'].value) ? el['settings-unit'].value : 'mg';
    data.settings.defaultTime = isValidTime(el['settings-time'].value) ? el['settings-time'].value : '20:00';
    const activeAmpoule = getActiveAmpoule();
    if (activeAmpoule && data.settings.unit === 'ml') {
      activeAmpoule.doseMl = normalizePositiveDecimal(dose);
      activeAmpoule.updatedAt = new Date().toISOString();
      reconcileAmpouleStatuses();
    }
    if (!persistData()) return;
    if (!quickDraftTouched && !quickDraft.id) resetQuickDraftForToday();
    renderAll();
    showToast(quickDraftTouched
      ? 'Dawka i godzina zostały zapisane. Przygotowany wpis pozostał bez zmian.'
      : 'Dawka i godzina zostały zapisane.', 'success');
  }

  function saveAmpouleSettings() {
    const ampouleStartNumber = normalizeAmpouleNumber(el['ampoule-start-number'].value);
    const ampouleVolume = normalizePositiveDecimal(el['ampoule-volume'].value) || DEFAULT_AMPOULE_VOLUME_ML;
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
        status: 'active'
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
    if (enabled && (!('Notification' in window) || Notification.permission !== 'granted')) {
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
    scheduleDailyReminder();
    await syncReminderStateWithServiceWorker();
    await registerPeriodicReminder();
    checkReminderDue();
    renderSettings();
    showToast(enabled ? `Przypomnienie ustawiono na ${time}.` : 'Przypomnienie zostało wyłączone.', 'success');
  }

  function openDataDialog(dialog, trigger) {
    if (!dialog) return;
    dataDialogReturnTarget = trigger || document.activeElement;
    if (!dialog.open) dialog.showModal();
  }

  function closeDataDialog(dialog) {
    if (dialog?.open) dialog.close();
  }

  function returnToDataSection() {
    const section = el['data-backup-section'];
    window.setTimeout(() => {
      section?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (dataDialogReturnTarget instanceof HTMLElement) dataDialogReturnTarget.focus({ preventScroll: true });
      dataDialogReturnTarget = null;
    }, 40);
  }

  function openReportPreview() {
    const config = getReportConfiguration();
    if (!config) return;
    const frame = el['report-preview-frame'];
    frame.srcdoc = reportDocumentHtml(config);
    frame.onload = () => {
      try {
        const height = Math.max(720, frame.contentDocument?.documentElement?.scrollHeight || 720);
        frame.style.height = `${height}px`;
      } catch {}
    };
    openDataDialog(el['report-preview-dialog'], el['report-preview-button']);
  }

  function printReportPreview() {
    const frameWindow = el['report-preview-frame']?.contentWindow;
    if (!frameWindow) {
      showToast('Nie udało się otworzyć podglądu raportu.', 'error');
      return;
    }
    frameWindow.focus();
    frameWindow.print();
  }

  function openExportReportPanel() {
    openDataDialog(el['export-report-dialog'], el['export-report-button']);
    window.setTimeout(() => el['export-pdf-button']?.focus(), 30);
  }

  function openBackupPanel() {
    clearPendingImportPreview();
    renderAutomaticBackupState();
    openDataDialog(el['backup-dialog'], el['backup-panel-button']);
    window.setTimeout(() => el['export-json-button']?.focus(), 30);
  }


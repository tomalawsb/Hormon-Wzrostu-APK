
  function bindEvents() {
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => switchView(button.dataset.view));
    });

    document.querySelectorAll('[data-go-home]').forEach((button) => {
      button.addEventListener('click', () => switchView('today'));
    });

    document.querySelectorAll('[data-open-entry]').forEach((button) => {
      button.addEventListener('click', () => openEntryForDate(localDateISO()));
    });

    el['date-chip'].addEventListener('click', () => openEntryDialog(quickDraft.id || null, quickDraft, 'entry-date'));
    el['place-field'].addEventListener('click', openPlacePicker);
    el['dose-chip'].addEventListener('click', () => openEntryDialog(quickDraft.id || null, quickDraft, 'entry-dose'));
    el['time-chip'].addEventListener('click', () => openEntryDialog(quickDraft.id || null, quickDraft, 'entry-time'));
    el['place-picker-options'].addEventListener('click', handlePlacePickerSelection);
    el['place-picker-edit-button'].addEventListener('click', openPlaceDetailsFromPicker);
    el['place-picker-close-button'].addEventListener('click', closePlacePicker);
    el['place-picker-dialog'].addEventListener('click', (event) => {
      if (event.target === el['place-picker-dialog']) closePlacePicker();
    });
    el['recommended-save-button'].addEventListener('click', confirmRecommendedInjection);
    el['recommended-edit-button'].addEventListener('click', openRecommendedEntryEditor);
    el['recommended-skip-button'].addEventListener('click', confirmSkippedToday);
    el['recommended-manual-button'].addEventListener('click', openAmpouleSettings);
    el['ampoule-start-main-button'].addEventListener('click', setAmpouleStartToday);
    el['today-dose-decrease'].addEventListener('click', () => adjustTodayDose(-1));
    el['today-dose-increase'].addEventListener('click', () => adjustTodayDose(1));
    el['today-undo-button'].addEventListener('click', undoLastEntryOperation);
    el['today-reminder-button'].addEventListener('click', () => openSettingsSection('reminders'));
    el['voice-button'].addEventListener('click', toggleVoiceRecognition);
    el['save-button'].addEventListener('click', saveQuickDraft);
    el['skip-button'].addEventListener('click', confirmSkippedToday);
    el['use-suggestion-button'].addEventListener('click', useSuggestedPlace);

    el['entry-form'].addEventListener('submit', handleEntrySubmit);
    el['dialog-close-button'].addEventListener('click', closeEntryDialog);
    el['dialog-cancel-button'].addEventListener('click', closeEntryDialog);
    el['delete-entry-button'].addEventListener('click', deleteEntryFromDialog);
    el['entry-status'].addEventListener('change', updateEntryRequirements);
    el['entry-dialog'].addEventListener('click', (event) => {
      if (event.target === el['entry-dialog']) closeEntryDialog();
    });

    el['calendar-prev'].addEventListener('click', () => changeCalendarMonth(-1));
    el['calendar-next'].addEventListener('click', () => changeCalendarMonth(1));
    el['calendar-today-button'].addEventListener('click', goToCalendarToday);
    el['add-for-selected-day'].addEventListener('click', openOrEditSelectedDay);
    el['calendar-grid'].addEventListener('keydown', handleCalendarKeydown);
    el['calendar-profile-filter'].addEventListener('change', handleCalendarProfileScopeChange);

    el['history-profile-filter'].addEventListener('change', handleHistoryProfileScopeChange);
    [el['history-search'], el['status-filter'], el['site-filter'], el['history-correction-filter']].forEach((control) => {
      control.addEventListener('input', renderHistory);
      control.addEventListener('change', renderHistory);
    });
    el['history-clear-filters'].addEventListener('click', clearHistoryFilters);
    el['history-list'].addEventListener('click', handleHistoryAction);
    el['selected-day-entries'].addEventListener('click', handleDayDetailsAction);

    el['today-profile-switcher'].addEventListener('click', handleTodayProfileSwitcherClick);
    el['all-profiles-list'].addEventListener('click', handleAllProfilesDashboardClick);

    el['active-profile-button'].addEventListener('click', openProfilesDialog);
    el['manage-profiles-button'].addEventListener('click', openProfilesDialog);
    el['profile-open-treatment-button'].addEventListener('click', () => openSettingsSection('treatment'));
    el['profile-medical-form'].addEventListener('submit', saveProfileMedical);
    el['profile-measurement-form'].addEventListener('submit', saveProfileMeasurement);
    el['profile-measurement-list'].addEventListener('click', handleProfileMeasurementAction);
    el['profile-dose-history-form'].addEventListener('submit', saveProfileDoseHistoryEntry);
    el['profile-dose-history-list'].addEventListener('click', handleProfileDoseHistoryAction);
    el['profile-doctor-report-button'].addEventListener('click', () => prepareProfileDoctorReport('preview'));
    el['profile-doctor-export-button'].addEventListener('click', () => prepareProfileDoctorReport('export'));
    el['profiles-dialog-close-button'].addEventListener('click', closeProfilesDialog);
    el['profiles-dialog'].addEventListener('click', (event) => {
      if (event.target === el['profiles-dialog']) closeProfilesDialog();
    });
    el['profiles-dialog'].addEventListener('cancel', (event) => {
      event.preventDefault();
      closeProfilesDialog();
    });
    el['profiles-list'].addEventListener('click', handleProfilesListAction);
    el['add-profile-button'].addEventListener('click', () => openProfileEditor());
    el['profile-editor-form'].addEventListener('submit', saveProfileEditor);
    el['profile-editor-cancel-button'].addEventListener('click', closeProfileEditor);
    el['profile-editor-close-button'].addEventListener('click', closeProfileEditor);
    el['profile-editor-dialog'].addEventListener('click', (event) => {
      if (event.target === el['profile-editor-dialog']) closeProfileEditor();
    });
    el['profile-editor-dialog'].addEventListener('cancel', (event) => {
      event.preventDefault();
      closeProfileEditor();
    });
    el['profile-icon-options'].addEventListener('click', handleProfileIconSelection);
    el['profile-color-options'].addEventListener('click', handleProfileColorSelection);
    el['profile-delete-close-button'].addEventListener('click', closeProfileDeleteDialog);
    el['profile-delete-cancel-button'].addEventListener('click', closeProfileDeleteDialog);
    el['profile-delete-confirm-button'].addEventListener('click', confirmProfileDeletion);
    el['profile-delete-input'].addEventListener('input', updateProfileDeleteButton);

    el['injection-order-list'].addEventListener('click', handleInjectionOrderAction);
    el['injection-order-list'].addEventListener('change', handleInjectionOrderToggle);
    el['injection-order-list'].addEventListener('dragstart', handleInjectionOrderDragStart);
    el['injection-order-list'].addEventListener('dragover', handleInjectionOrderDragOver);
    el['injection-order-list'].addEventListener('drop', handleInjectionOrderDrop);
    el['injection-order-list'].addEventListener('dragend', handleInjectionOrderDragEnd);
    el['injection-order-list'].addEventListener('pointerdown', handleInjectionOrderPointerDown);
    el['injection-order-list'].addEventListener('pointermove', handleInjectionOrderPointerMove);
    el['injection-order-list'].addEventListener('pointerup', handleInjectionOrderPointerUp);
    el['injection-order-list'].addEventListener('pointercancel', handleInjectionOrderPointerCancel);
    el['injection-order-list'].addEventListener('lostpointercapture', handleInjectionOrderPointerCancel);
    el['injection-order-add-button'].addEventListener('click', addInjectionOrderFromSettings);
    el['injection-order-reset-button'].addEventListener('click', resetInjectionOrderFromSettings);
    el['settings-category-list'].addEventListener('click', handleSettingsCategoryClick);
    el['settings-section-back-button'].addEventListener('click', () => showSettingsOverview());
    window.addEventListener?.('resize', handleSettingsLayoutChange);
    el['profile-delete-dialog'].addEventListener('click', (event) => {
      if (event.target === el['profile-delete-dialog']) closeProfileDeleteDialog();
    });
    el['profile-delete-dialog'].addEventListener('cancel', (event) => {
      event.preventDefault();
      closeProfileDeleteDialog();
    });

    el['save-settings-button'].addEventListener('click', saveSettings);
    el['save-ampoule-settings-button'].addEventListener('click', saveAmpouleSettings);
    el['save-voice-settings-button'].addEventListener('click', saveVoiceSettings);
    el['ampoule-start-today-button'].addEventListener('click', setAmpouleStartToday);
    el['ampoule-new-button'].addEventListener('click', startNewAmpoule);
    el['ampoule-list'].addEventListener('click', handleAmpouleListAction);
    el['save-reminder-button'].addEventListener('click', saveReminderSettings);
    el['request-notification-button'].addEventListener('click', requestNotificationPermission);
    el['test-notification-button'].addEventListener('click', testReminderNotification);
    el['refresh-reminder-diagnostics-button'].addEventListener('click', () =>
      refreshReminderDiagnostics({ announce: true })
    );
    el['open-notification-settings-button'].addEventListener(
      'click',
      openReminderNotificationSettings
    );
    el['request-exact-alarm-button'].addEventListener(
      'click',
      requestReminderExactAlarmPermission
    );
    [el['report-profile-filter'], el['report-date-from'], el['report-date-to'], el['report-include-ampoules']].forEach((control) => {
      control.addEventListener('input', handleReportConfigurationChange);
      control.addEventListener('change', handleReportConfigurationChange);
    });
    el['report-preview-button'].addEventListener('click', openReportPreview);
    el['export-report-button'].addEventListener('click', openExportReportPanel);
    el['backup-panel-button'].addEventListener('click', openBackupPanel);
    el['report-preview-close-button'].addEventListener('click', () => closeDataDialog(el['report-preview-dialog']));
    el['export-report-close-button'].addEventListener('click', () => closeDataDialog(el['export-report-dialog']));
    el['backup-close-button'].addEventListener('click', closeBackupPanel);
    el['report-print-button'].addEventListener('click', printReportPreview);
    el['export-pdf-button'].addEventListener('click', async () => {
      if (await exportPdf()) closeDataDialog(el['export-report-dialog']);
    });
    el['export-word-button'].addEventListener('click', () => {
      if (exportWord()) closeDataDialog(el['export-report-dialog']);
    });
    el['export-json-button'].addEventListener('click', exportJson);
    el['export-profile-json-button'].addEventListener('click', exportActiveProfileJson);
    el['export-csv-button'].addEventListener('click', () => {
      if (exportCsv()) closeDataDialog(el['export-report-dialog']);
    });
    el['import-button'].addEventListener('click', () => el['import-file'].click());
    el['restore-auto-backup-button'].addEventListener('click', restoreAutomaticImportBackup);
    el['import-confirm-button'].addEventListener('click', confirmPendingImport);
    el['import-cancel-button'].addEventListener('click', clearPendingImportPreview);
    el['import-file'].addEventListener('change', importJson);
    el['clear-data-button'].addEventListener('click', clearAllEntries);

    [el['report-preview-dialog'], el['export-report-dialog'], el['backup-dialog']].forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        if (dialog === el['backup-dialog']) closeBackupPanel();
        else closeDataDialog(dialog);
      });
      dialog.addEventListener('close', () => {
        if (dialog === el['backup-dialog']) {
          pendingImportPreview = null;
          renderImportPreview();
        }
        returnToDataSection();
      });
    });

    el['permission-microphone-button'].addEventListener('click', requestMicrophonePermission);
    el['permission-notification-button'].addEventListener('click', requestNotificationPermission);
    el['permission-storage-button'].addEventListener('click', requestPersistentStorage);
    el['permissions-finish-button'].addEventListener('click', finishPermissionsOnboarding);
    el['permissions-skip-button'].addEventListener('click', skipPermissionsOnboarding);
    el['open-permissions-button'].addEventListener('click', openPermissionsDialog);
    el['permissions-dialog'].addEventListener('cancel', (event) => {
      if (!isPermissionsOnboardingCompleted()) {
        event.preventDefault();
        showToast('Wybierz zgody albo użyj przycisku „Pomiń na razie”.', 'error');
      }
    });

    el['check-update-button'].addEventListener('click', () => checkForUpdates({ autoDownload: true }));
    el['download-update-button'].addEventListener('click', downloadAvailableUpdate);
    el['refresh-pwa-resources-button'].addEventListener('click', refreshPwaResources);
    el['apply-pwa-update-button'].addEventListener('click', applyPwaUpdate);

    [el['header-install-button'], el['desktop-install-button'], el['settings-install-button']].forEach((button) => {
      button.addEventListener('click', installPwa);
    });

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      updateOnlineInstallState();
    });
    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      updateOnlineInstallState();
      showToast('Aplikacja została zainstalowana.', 'success');
    });

    document.addEventListener('keydown', handleGlobalKeyboard);
    window.addEventListener('focus', handleAppResume);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') handleAppResume();
    });
    window.addEventListener('hashchange', () => switchView(viewFromHash(), { updateHash: false, focus: false, smooth: false }));
  }

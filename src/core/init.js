
  async function init() {
    cacheElements();
    try {
      await initializeSecureStorage();
      data = attachActiveProfileAliases(loadData());
      resetRuntimeStateAfterSecureLoad();
      applyThemePreference();
    } catch (error) {
      console.error('Nie udało się uruchomić bezpiecznego magazynu:', error);
      if (el['security-startup-message']) {
        el['security-startup-message'].textContent =
          'Nie można bezpiecznie odczytać danych. Aplikacja nie uruchomi się bez szyfrowanego magazynu.';
      }
      document.documentElement.classList.remove('security-pending');
      document.documentElement.classList.add('security-startup-failed');
      return;
    }
    const launchedProfileChanged = applyProfileFromLaunchUrl();
    if (launchedProfileChanged) resetQuickDraftForToday();
    bindEvents();
    bindThemePreferences();
    bindSecurityEvents();
    bindNativeEvents();
    configureSpeechRecognition();
    updateCurrentDateHeader();
    loadVersion();
    renderAll();
    renderSecuritySettings();
    if (el['security-startup-cover']) el['security-startup-cover'].hidden = true;
    enforceInitialSecurityLock();
    switchView(viewFromHash(), { updateHash: false, focus: false, smooth: false });
    await registerServiceWorker();
    updateOnlineInstallState();
    await updatePermissionStatuses();
    scheduleDailyReminder();
    scheduleMidnightRefresh();
    checkReminderDue();
    maybeShowFirstRunPermissions();
    flushStartupWarnings();
    maybeScheduleBackupReminder();
  }

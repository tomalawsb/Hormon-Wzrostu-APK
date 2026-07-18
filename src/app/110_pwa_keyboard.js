  function isNativeAndroidApp() {
    return Boolean(window.NativeBridge?.isNative);
  }

  function bindNativeEvents() {
    window.addEventListener('nativeBackButton', handleNativeBackButton);
    window.addEventListener('nativeAppResume', () => {
      updateCurrentDateHeader();
      renderAll();
      scheduleDailyReminder();
      updatePermissionStatuses();
    });
    window.addEventListener('nativeNotificationAction', (event) => {
      const profileId = sanitizeProfileId(event.detail?.profileId);
      const notificationDate = String(event.detail?.date || '');
      const profile = profileId ? getProfileById(profileId) : null;
      if (profile && isValidIsoDate(notificationDate) && notificationDate > (profile.meta.lastReminderDate || '')) {
        profile.meta.lastReminderDate = notificationDate;
        persistData({ notifyError: false });
      }
      if (profileId) setActiveProfileId(profileId, { refresh: true });
      todayDashboardMode = 'profile';
      switchView('today', { updateHash: true, focus: false, smooth: false });
    });
  }

  function handleNativeBackButton() {
    const dialogs = [
      el['profile-delete-dialog'], el['profile-editor-dialog'], el['profiles-dialog'],
      el['permissions-dialog'], el['place-picker-dialog'], el['entry-dialog'],
      el['backup-dialog'], el['export-report-dialog'], el['report-preview-dialog']
    ];
    const openDialog = dialogs.find((dialog) => dialog?.open);
    if (openDialog) {
      if (openDialog === el['entry-dialog']) closeEntryDialog();
      else if (openDialog === el['place-picker-dialog']) closePlacePicker();
      else if (openDialog === el['backup-dialog']) closeBackupPanel();
      else if (openDialog === el['export-report-dialog'] || openDialog === el['report-preview-dialog']) closeDataDialog(openDialog);
      else openDialog.close();
      return;
    }
    if (activeView !== 'today') {
      switchView('today');
      return;
    }
    window.NativeBridge?.exitApp?.();
  }

  function handleGlobalKeyboard(event) {
    const key = event.key.toLowerCase();
    const targetIsField = event.target.matches('input, textarea, select, [contenteditable="true"]');

    if (event.key === 'Escape') {
      if (el['report-preview-dialog'].open) closeDataDialog(el['report-preview-dialog']);
      else if (el['export-report-dialog'].open) closeDataDialog(el['export-report-dialog']);
      else if (el['backup-dialog'].open) closeBackupPanel();
      else if (el['entry-dialog'].open) closeEntryDialog();
      else if (el['place-picker-dialog'].open) closePlacePicker();
      else if (el['permissions-dialog'].open) el['permissions-dialog'].close();
      else stopVoiceRecognition();
      return;
    }

    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      const viewMap = { '1': 'today', '2': 'calendar', '3': 'history', '4': 'more' };
      if (viewMap[event.key]) {
        event.preventDefault();
        switchView(viewMap[event.key]);
        return;
      }
      if (key === 'm') {
        event.preventDefault();
        switchView('today');
        toggleVoiceRecognition();
        return;
      }
      if (key === 'n') {
        event.preventDefault();
        openEntryForDate(localDateISO());
        return;
      }
      if (key === 'p') {
        event.preventDefault();
        switchView('more');
        openReportPreview();
        return;
      }
      if (key === 'w') {
        event.preventDefault();
        exportWord();
        return;
      }
    }

    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault();
      if (el['entry-dialog'].open) el['entry-form'].requestSubmit();
      else if (!el['save-button'].disabled) saveQuickDraft();
      return;
    }

    if (!targetIsField && key === '/' && activeView === 'history') {
      event.preventDefault();
      el['history-search'].focus();
    }
  }

  function installPwa() {
    if (!deferredInstallPrompt) {
      showToast('Opcja instalacji pojawi się w obsługiwanej przeglądarce po otwarciu aplikacji przez HTTPS.');
      return;
    }
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(() => {
      deferredInstallPrompt = null;
      updateOnlineInstallState();
    });
  }

  function updateOnlineInstallState() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const visible = Boolean(deferredInstallPrompt) && !standalone;
    [el['header-install-button'], el['desktop-install-button'], el['settings-install-button']].forEach((button) => {
      button.classList.toggle('is-hidden', !visible);
    });
  }

  async function loadVersion() {
    try {
      const response = await fetch('./app-version.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Brak pliku wersji');
      const version = await response.json();
      const shortVersion = String(version.version || '').split(' - ')[0] || '1.0';
      currentAppVersion = shortVersion;
      el['version-label'].textContent = `Wersja ${version.version}`;
      document.querySelectorAll('.brand-version').forEach((label) => { label.textContent = `v${shortVersion}`; });
      document.title = `Dzienniczek Hormonu v${shortVersion}`;
    } catch (error) {
      currentAppVersion = '1.0.0';
      el['version-label'].textContent = 'Wersja 1.0';
      document.querySelectorAll('.brand-version').forEach((label) => { label.textContent = 'v1.0'; });
    }
  }

  async function readReminderStateFromServiceWorker() {
    if (!serviceWorkerRegistration?.active || !('MessageChannel' in window)) return null;
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      const timeout = window.setTimeout(() => resolve(null), 1200);
      channel.port1.onmessage = (event) => {
        window.clearTimeout(timeout);
        resolve(event.data || null);
      };
      serviceWorkerRegistration.active.postMessage({ type: 'GET_REMINDER_STATE' }, [channel.port2]);
    });
  }

  async function registerServiceWorker() {
    if (isNativeAndroidApp()) return null;
    if (!('serviceWorker' in navigator)) return null;
    try {
      serviceWorkerRegistration = await navigator.serviceWorker.register('./service-worker.js');
      serviceWorkerRegistration = await navigator.serviceWorker.ready;
      const workerState = await readReminderStateFromServiceWorker();
      mergeReminderStateFromServiceWorker(workerState);
      await syncReminderStateWithServiceWorker();
      await registerPeriodicReminder();
      return serviceWorkerRegistration;
    } catch (error) {
      console.warn('Nie udało się zarejestrować service workera:', error);
      return null;
    }
  }


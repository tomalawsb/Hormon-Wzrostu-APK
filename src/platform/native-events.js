let nativeBackAt = 0;
function resetNativeBackExit() { nativeBackAt = 0; }

function isNativeAndroidApp() {
  return Boolean(window.NativeBridge?.isNative);
}

function bindNativeEvents() {
  window.addEventListener('nativeBackButton', handleNativeBackButton);
  window.__diaryBackReady = true;
  window.addEventListener('nativeAppBackgrounded', resetNativeBackExit);
  document.addEventListener('pointerdown', resetNativeBackExit, true);
  document.addEventListener('visibilitychange', resetNativeBackExit);
  new MutationObserver(records => {
    if (records.some(record => record.target.open)) resetNativeBackExit();
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  window.addEventListener('nativeAppResume', () => {
    updateCurrentDateHeader();
    renderAll();
    scheduleDailyReminder();
    updatePermissionStatuses();
    refreshReminderDiagnostics();
  });
  window.addEventListener('nativeNotificationAction', (event) => {
    const profileId = sanitizeProfileId(event.detail?.profileId);
    const notificationDate = String(event.detail?.date || '');
    const profile = profileId ? getProfileById(profileId) : null;
    if (
      profile && event.detail?.kind !== 'ampoule' &&
      isValidIsoDate(notificationDate) &&
      notificationDate > (profile.meta.lastReminderDate || '')
    ) {
      profile.meta.lastReminderDate = notificationDate;
      persistData({ notifyError: false });
    }
    if (profileId) setActiveProfileId(profileId, { refresh: true });
    todayDashboardMode = 'profile';
    switchView('today', { updateHash: true, focus: false, smooth: false });
  });
  window.NativeBridge?.notificationEventsReady?.();
}

function handleNativeBackButton() {
  // A locked app must never reveal the diary through navigation.
  if (!appLocked) {
    const dialogs = [...document.querySelectorAll('dialog[open]')];
    const focused = document.activeElement?.closest?.('dialog[open]');
    const openDialog = focused || dialogs[dialogs.length - 1];
    if (openDialog) {
      resetNativeBackExit();
      const cancel = new Event('cancel', { cancelable: true });
      if (!openDialog.dispatchEvent(cancel)) return;
      if (openDialog === el['entry-dialog']) closeEntryDialog();
      else if (openDialog === el['place-picker-dialog']) closePlacePicker();
      else if (openDialog === el['backup-dialog']) closeBackupPanel();
      else if (openDialog === el['export-report-dialog'] || openDialog === el['report-preview-dialog']) closeDataDialog(openDialog);
      else openDialog.close();
      return;
    }
    if (activeView !== 'today') {
      resetNativeBackExit();
      switchView('today');
      return;
    }
  }
  const now = performance.now();
  if (nativeBackAt && now - nativeBackAt < 2000) {
    resetNativeBackExit();
    window.NativeBridge?.exitApp?.();
  } else {
    nativeBackAt = now;
    showToast('Naciśnij Wstecz ponownie, aby wyjść');
  }
}

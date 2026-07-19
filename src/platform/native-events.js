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
    refreshReminderDiagnostics();
  });
  window.addEventListener('nativeNotificationAction', (event) => {
    const profileId = sanitizeProfileId(event.detail?.profileId);
    const notificationDate = String(event.detail?.date || '');
    const profile = profileId ? getProfileById(profileId) : null;
    if (
      profile &&
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
  const dialogs = [
    el['profile-delete-dialog'],
    el['profile-editor-dialog'],
    el['profiles-dialog'],
    el['permissions-dialog'],
    el['place-picker-dialog'],
    el['entry-dialog'],
    el['backup-dialog'],
    el['export-report-dialog'],
    el['report-preview-dialog'],
  ];
  const openDialog = dialogs.find((dialog) => dialog?.open);
  if (openDialog) {
    if (openDialog === el['entry-dialog']) closeEntryDialog();
    else if (openDialog === el['place-picker-dialog']) closePlacePicker();
    else if (openDialog === el['backup-dialog']) closeBackupPanel();
    else if (
      openDialog === el['export-report-dialog'] ||
      openDialog === el['report-preview-dialog']
    )
      closeDataDialog(openDialog);
    else openDialog.close();
    return;
  }
  if (activeView !== 'today') {
    switchView('today');
    return;
  }
  window.NativeBridge?.exitApp?.();
}

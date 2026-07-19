function isPermissionsOnboardingCompleted() {
  try {
    return (
      localStorage.getItem(PERMISSIONS_ONBOARDING_STORAGE_KEY) === PERMISSIONS_ONBOARDING_REVISION
    );
  } catch {
    return Boolean(data.meta.onboardingCompleted);
  }
}

function markPermissionsOnboardingCompleted() {
  try {
    localStorage.setItem(PERMISSIONS_ONBOARDING_STORAGE_KEY, PERMISSIONS_ONBOARDING_REVISION);
  } catch {}
}

function maybeShowFirstRunPermissions() {
  if (isPermissionsOnboardingCompleted()) return;
  window.setTimeout(() => {
    openPermissionsDialog().catch((error) => {
      console.warn('Nie udało się otworzyć konfiguracji zgód:', error);
    });
  }, 180);
}

async function openPermissionsDialog() {
  await updatePermissionStatuses();
  if (!el['permissions-dialog'].open) el['permissions-dialog'].showModal();
}

function finishPermissionsOnboarding() {
  data.meta.onboardingCompleted = true;
  if (!persistData()) return;
  markPermissionsOnboardingCompleted();
  if (el['permissions-dialog'].open) el['permissions-dialog'].close();
  scheduleDailyReminder();
  showToast('Ustawienia zgód zostały zapisane.', 'success');
}

function skipPermissionsOnboarding(options = {}) {
  data.meta.onboardingCompleted = true;
  if (!persistData()) return;
  markPermissionsOnboardingCompleted();
  if (el['permissions-dialog'].open) el['permissions-dialog'].close();
  if (!options.silent)
    showToast('Pominięto konfigurację zgód. Możesz wrócić do niej w ustawieniach.', 'success');
}

async function requestMicrophonePermission() {
  let state;
  try {
    if (
      isNativeAndroidApp() &&
      typeof window.NativeBridge?.requestMicrophonePermission === 'function'
    ) {
      state = await window.NativeBridge.requestMicrophonePermission();
    } else {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      state = 'granted';
    }
    if (state !== 'granted')
      throw Object.assign(new Error('permission_denied'), { name: 'NotAllowedError' });
    showToast('Dostęp do mikrofonu został przyznany.', 'success');
  } catch (error) {
    console.warn('Błąd dostępu do mikrofonu:', error);
    const denied = ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(
      String(error?.name || '')
    );
    state = denied ? 'denied' : 'unsupported';
    showToast(
      denied
        ? 'Dostęp do mikrofonu został zablokowany. Spróbuj ponownie albo włącz go w ustawieniach systemu.'
        : 'Mikrofon nie jest dostępny w tej przeglądarce lub urządzeniu.',
      'error'
    );
  }
  await updatePermissionStatuses({ microphone: state });
  return state;
}

async function requestNotificationPermission() {
  let state;
  try {
    if (isNativeAndroidApp()) {
      state = await window.NativeBridge.requestNotificationPermission();
    } else {
      if (!('Notification' in window)) throw new Error('unsupported');
      state =
        Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    }
    if (state === 'granted') {
      showToast('Powiadomienia zostały włączone.', 'success');
      await registerPeriodicReminder();
      scheduleDailyReminder();
      checkReminderDue();
    } else {
      showToast('Powiadomienia nie zostały włączone.', 'error');
    }
  } catch (error) {
    console.warn(error);
    state = 'unsupported';
    showToast(
      isNativeAndroidApp()
        ? 'Android nie udostępnił powiadomień.'
        : 'Ta przeglądarka nie obsługuje powiadomień.',
      'error'
    );
  }
  await updatePermissionStatuses({ notification: state });
  await refreshReminderDiagnostics({ resync: state === 'granted' });
  return state;
}

async function requestPersistentStorage() {
  let state;
  try {
    if (isNativeAndroidApp()) {
      state = 'granted';
      showToast('Dane są przechowywane w pamięci aplikacji Android.', 'success');
      await updatePermissionStatuses({ storage: state });
      return state;
    }
    if (!navigator.storage?.persist) throw new Error('unsupported');
    state = (await navigator.storage.persist()) ? 'granted' : 'denied';
    showToast(
      state === 'granted'
        ? 'Włączono trwałe przechowywanie danych.'
        : 'Przeglądarka nie przyznała trwałego przechowywania.',
      state === 'granted' ? 'success' : 'error'
    );
  } catch {
    state = 'unsupported';
    showToast('Trwałe przechowywanie nie jest obsługiwane.', 'error');
  }
  await updatePermissionStatuses({ storage: state });
  return state;
}

async function readMicrophonePermission() {
  try {
    if (isNativeAndroidApp() && typeof window.NativeBridge?.microphonePermission === 'function') {
      return await window.NativeBridge.microphonePermission();
    }
    if (!navigator.permissions?.query)
      return navigator.mediaDevices?.getUserMedia ? 'prompt' : 'unsupported';
    const result = await navigator.permissions.query({ name: 'microphone' });
    return result.state;
  } catch {
    return navigator.mediaDevices?.getUserMedia ? 'prompt' : 'unsupported';
  }
}

async function readStoragePermission() {
  try {
    if (isNativeAndroidApp()) return 'granted';
    if (!navigator.storage?.persisted) return 'unsupported';
    return (await navigator.storage.persisted()) ? 'granted' : 'prompt';
  } catch {
    return 'unsupported';
  }
}

function permissionText(state) {
  return (
    {
      granted: 'Zezwolono',
      denied: 'Zablokowano',
      prompt: 'Wymaga zgody',
      default: 'Wymaga zgody',
      unsupported: 'Brak obsługi',
    }[state] || 'Nie sprawdzono'
  );
}

function setPermissionLabel(node, state) {
  if (!node) return;
  node.textContent = permissionText(state);
  node.dataset.state = state;
}

async function updatePermissionStatuses(overrides = {}) {
  const microphone = overrides.microphone || (await readMicrophonePermission());
  const notification =
    overrides.notification ||
    (isNativeAndroidApp()
      ? await window.NativeBridge.notificationPermission()
      : 'Notification' in window
        ? Notification.permission
        : 'unsupported');
  const storage = overrides.storage || (await readStoragePermission());
  [el['permission-microphone-status'], el['microphone-permission-settings']].forEach((node) =>
    setPermissionLabel(node, microphone)
  );
  [
    el['permission-notification-status'],
    el['notification-permission-settings'],
    el['notification-permission-status'],
  ].forEach((node) => setPermissionLabel(node, notification));
  [el['permission-storage-status'], el['storage-permission-settings']].forEach((node) =>
    setPermissionLabel(node, storage)
  );
  if (el['request-notification-button'])
    el['request-notification-button'].disabled =
      notification === 'granted' || notification === 'unsupported';
  if (el['test-notification-button'])
    el['test-notification-button'].disabled = notification !== 'granted';
  if (el['permission-microphone-button'])
    el['permission-microphone-button'].disabled =
      microphone === 'granted' || microphone === 'unsupported';
  if (el['permission-notification-button'])
    el['permission-notification-button'].disabled =
      notification === 'granted' || notification === 'unsupported';
  if (el['permission-storage-button'])
    el['permission-storage-button'].disabled = storage === 'granted' || storage === 'unsupported';
  refreshReminderDiagnostics();
}


async function loadVersion() {
  try {
    const response = await fetch('./app-version.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Brak pliku wersji');
    const version = await response.json();
    const shortVersion = String(version.version || '').split(' - ')[0] || '1.0';
    currentAppVersion = shortVersion;
    el['version-label'].textContent = `Wersja ${version.version}`;
    if (el['settings-version-label']) el['settings-version-label'].textContent = `v${shortVersion}`;
    document.querySelectorAll('.brand-version').forEach((label) => {
      label.textContent = `v${shortVersion}`;
    });
    document.title = `Dzienniczek Hormonu v${shortVersion}`;
  } catch {
    currentAppVersion = '1.0.0';
    el['version-label'].textContent = 'Wersja 1.0';
    if (el['settings-version-label']) el['settings-version-label'].textContent = 'v1.0';
    document.querySelectorAll('.brand-version').forEach((label) => {
      label.textContent = 'v1.0';
    });
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
    serviceWorkerRegistration = await navigator.serviceWorker.register('./service-worker.js', {
      updateViaCache: 'none',
    });
    setupPwaUpdateTracking(serviceWorkerRegistration);
    serviceWorkerRegistration = await navigator.serviceWorker.ready;
    setupPwaUpdateTracking(serviceWorkerRegistration);
    const workerState = await readReminderStateFromServiceWorker();
    mergeReminderStateFromServiceWorker(workerState);
    await syncReminderStateWithServiceWorker();
    await registerPeriodicReminder();
    await refreshPwaRuntimeStatus();
    window.setTimeout(() => checkPwaUpdate({ announce: false }), 1500);
    return serviceWorkerRegistration;
  } catch (error) {
    console.warn('Nie udało się zarejestrować service workera:', error);
    await refreshPwaRuntimeStatus();
    return null;
  }
}

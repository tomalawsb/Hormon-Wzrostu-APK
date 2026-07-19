let trackedPwaRegistration = null;
let pendingPwaWorker = null;
let reloadAfterPwaActivation = false;
let pwaUpdateToastShown = false;

function isStandalonePwa() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function setPwaDiagnostic(id, text, state = 'neutral') {
  const node = el[id];
  if (!node) return;
  node.textContent = text;
  node.dataset.state = state;
}

function setPwaControlsBusy(busy) {
  ['check-update-button', 'refresh-pwa-resources-button', 'apply-pwa-update-button'].forEach(
    (id) => {
      if (el[id]) el[id].disabled = Boolean(busy);
    }
  );
}

function showPwaUpdateReady(worker) {
  if (!worker || isNativeAndroidApp()) return;
  pendingPwaWorker = worker;
  el['apply-pwa-update-button']?.classList.remove('is-hidden');
  setUpdateStatus('Dostępna jest nowa wersja PWA. Zastosuj ją, aby odświeżyć aplikację.', 'success');
  setPwaDiagnostic('pwa-worker-status', 'Aktualizacja gotowa', 'warning');
  if (!pwaUpdateToastShown) {
    pwaUpdateToastShown = true;
    showToast('Dostępna jest nowa wersja aplikacji PWA.', 'success');
  }
}

function observePwaWorker(worker) {
  if (!worker) return;
  const updateState = () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      showPwaUpdateReady(worker);
    }
  };
  worker.addEventListener('statechange', updateState);
  updateState();
}

function setupPwaUpdateTracking(registration) {
  if (!registration || isNativeAndroidApp()) return;
  if (trackedPwaRegistration === registration) {
    if (registration.waiting) showPwaUpdateReady(registration.waiting);
    return;
  }
  trackedPwaRegistration = registration;
  if (registration.waiting) showPwaUpdateReady(registration.waiting);
  if (registration.installing) observePwaWorker(registration.installing);
  registration.addEventListener('updatefound', () => observePwaWorker(registration.installing));

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    pendingPwaWorker = null;
    pwaUpdateToastShown = false;
    if (reloadAfterPwaActivation) {
      reloadAfterPwaActivation = false;
      window.location.reload();
      return;
    }
    refreshPwaRuntimeStatus();
  });
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'PWA_ACTIVATED') refreshPwaRuntimeStatus();
  });
  window.addEventListener('online', refreshPwaRuntimeStatus);
  window.addEventListener('offline', refreshPwaRuntimeStatus);
}

function sendPwaWorkerMessage(worker, type, payload = {}, timeoutMs = 15000) {
  if (!worker || !('MessageChannel' in window)) {
    return Promise.resolve({ ok: false, error: 'worker_unavailable' });
  }
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(
      () => resolve({ ok: false, error: 'worker_timeout' }),
      timeoutMs
    );
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      resolve(event.data || { ok: false, error: 'empty_response' });
    };
    worker.postMessage({ type, ...payload }, [channel.port2]);
  });
}

async function readPwaCacheStatus() {
  const worker = navigator.serviceWorker?.controller || serviceWorkerRegistration?.active;
  return sendPwaWorkerMessage(worker, 'GET_PWA_STATUS', {}, 3000);
}

async function refreshPwaRuntimeStatus() {
  if (!el['pwa-maintenance-controls']) return null;
  const native = isNativeAndroidApp();
  el['pwa-maintenance-controls'].hidden = native;
  if (native) return null;

  const supported = 'serviceWorker' in navigator;
  const workerReady = Boolean(navigator.serviceWorker?.controller || serviceWorkerRegistration?.active);
  setPwaDiagnostic(
    'pwa-worker-status',
    supported ? (workerReady ? 'Aktywny' : 'Uruchamianie…') : 'Brak obsługi',
    workerReady ? 'ready' : supported ? 'warning' : 'error'
  );
  const installText = isStandalonePwa()
    ? 'Zainstalowana'
    : deferredInstallPrompt
      ? 'Gotowa do instalacji'
      : 'Instalacja z menu przeglądarki';
  setPwaDiagnostic(
    'pwa-install-status',
    installText,
    isStandalonePwa() || deferredInstallPrompt ? 'ready' : 'neutral'
  );
  setPwaDiagnostic(
    'pwa-online-status',
    navigator.onLine ? 'Połączono' : 'Tryb offline',
    navigator.onLine ? 'ready' : 'warning'
  );

  const cacheStatus = workerReady ? await readPwaCacheStatus() : null;
  setPwaDiagnostic(
    'pwa-cache-status',
    cacheStatus?.ok ? 'Gotowy do pracy offline' : 'Przygotowywanie zasobów…',
    cacheStatus?.ok ? 'ready' : 'warning'
  );
  if (pendingPwaWorker || serviceWorkerRegistration?.waiting) {
    showPwaUpdateReady(pendingPwaWorker || serviceWorkerRegistration.waiting);
  }
  return cacheStatus;
}

function waitForPwaWorker(worker, timeoutMs = 12000) {
  if (!worker || ['installed', 'activated', 'redundant'].includes(worker.state)) {
    return Promise.resolve(worker?.state || 'missing');
  }
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => resolve(worker.state), timeoutMs);
    const listener = () => {
      if (!['installed', 'activated', 'redundant'].includes(worker.state)) return;
      window.clearTimeout(timeout);
      worker.removeEventListener('statechange', listener);
      resolve(worker.state);
    };
    worker.addEventListener('statechange', listener);
  });
}

async function checkPwaUpdate({ announce = true } = {}) {
  if (isNativeAndroidApp()) return false;
  if (!serviceWorkerRegistration) {
    setUpdateStatus('Service worker nie jest jeszcze gotowy.', 'error');
    return false;
  }
  setPwaControlsBusy(true);
  setUpdateStatus('Sprawdzanie nowej wersji PWA…');
  try {
    await serviceWorkerRegistration.update();
    if (serviceWorkerRegistration.installing) {
      observePwaWorker(serviceWorkerRegistration.installing);
      await waitForPwaWorker(serviceWorkerRegistration.installing);
    }
    const waiting = serviceWorkerRegistration.waiting || pendingPwaWorker;
    if (waiting) {
      showPwaUpdateReady(waiting);
      return true;
    }
    setUpdateStatus(`Masz aktualną wersję ${currentAppVersion}.`, 'success');
    if (announce) showToast('PWA korzysta z aktualnej wersji.', 'success');
    await refreshPwaRuntimeStatus();
    return false;
  } catch (error) {
    console.warn('Nie udało się sprawdzić aktualizacji PWA:', error);
    setUpdateStatus(
      navigator.onLine
        ? 'Nie udało się sprawdzić aktualizacji PWA.'
        : 'Brak internetu — aplikacja nadal działa z zapisanych zasobów.',
      'error'
    );
    return false;
  } finally {
    setPwaControlsBusy(false);
  }
}

async function applyPwaUpdate() {
  const worker = serviceWorkerRegistration?.waiting || pendingPwaWorker;
  if (!worker) {
    showToast('Nie ma oczekującej aktualizacji PWA.', 'error');
    return false;
  }
  setPwaControlsBusy(true);
  setUpdateStatus('Włączanie nowej wersji PWA…');
  reloadAfterPwaActivation = true;
  worker.postMessage({ type: 'SKIP_WAITING' });
  window.setTimeout(() => {
    if (!reloadAfterPwaActivation) return;
    reloadAfterPwaActivation = false;
    setPwaControlsBusy(false);
    setUpdateStatus('Aktualizacja czeka na zamknięcie pozostałych kart aplikacji.', 'error');
  }, 12000);
  return true;
}

async function refreshPwaResources() {
  if (isNativeAndroidApp()) return false;
  if (!navigator.onLine) {
    showToast('Ręczne odświeżenie zasobów wymaga internetu.', 'error');
    return false;
  }
  setPwaControlsBusy(true);
  setUpdateStatus('Pobieranie świeżych zasobów PWA…');
  try {
    await serviceWorkerRegistration?.update();
    if (serviceWorkerRegistration?.installing) {
      observePwaWorker(serviceWorkerRegistration.installing);
      await waitForPwaWorker(serviceWorkerRegistration.installing);
    }
    const waiting = serviceWorkerRegistration?.waiting || pendingPwaWorker;
    if (waiting) {
      pendingPwaWorker = waiting;
      return applyPwaUpdate();
    }
    const worker = navigator.serviceWorker?.controller || serviceWorkerRegistration?.active;
    const result = await sendPwaWorkerMessage(worker, 'REFRESH_APP_RESOURCES');
    if (!result?.ok) throw new Error(result?.error || 'refresh_failed');
    setUpdateStatus('Zasoby odświeżone. Ponowne uruchamianie aplikacji…', 'success');
    window.setTimeout(() => window.location.reload(), 250);
    return true;
  } catch (error) {
    console.warn('Nie udało się odświeżyć zasobów PWA:', error);
    setUpdateStatus('Nie udało się odświeżyć zasobów. Dotychczasowy cache pozostaje aktywny.', 'error');
    showToast('Odświeżenie zasobów PWA nie powiodło się.', 'error');
    return false;
  } finally {
    setPwaControlsBusy(false);
  }
}

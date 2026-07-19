
/* eslint-disable no-func-assign */

const ANDROID_STORAGE_FALLBACK_MARKER = 'dzienniczek-android-storage-fallback-v1';
let androidStorageFallbackPromise = null;
let lastSecureStorageErrorToastAt = 0;

function androidStorageFallbackRequested() {
  try {
    return localStorage.getItem(ANDROID_STORAGE_FALLBACK_MARKER) === '1';
  } catch {
    return false;
  }
}

function setAndroidStorageFallbackRequested(enabled) {
  try {
    if (enabled) localStorage.setItem(ANDROID_STORAGE_FALLBACK_MARKER, '1');
    else localStorage.removeItem(ANDROID_STORAGE_FALLBACK_MARKER);
  } catch {
    // WebView może chwilowo odrzucić localStorage. Sam IndexedDB nadal może działać.
  }
}

const originalHasNativeSecureStorage = hasNativeSecureStorage;
hasNativeSecureStorage = function hasRecoverableNativeSecureStorage() {
  if (androidStorageFallbackRequested()) return false;
  return originalHasNativeSecureStorage();
};

function activateAndroidStorageFallback() {
  setAndroidStorageFallbackRequested(true);
  if (!androidStorageFallbackPromise) {
    androidStorageFallbackPromise = createBrowserSecureStorageAdapter()
      .then((adapter) => {
        secureStorageAdapter = adapter;
        secureStorageTypeLabel = `${adapter.label} · tryb zapasowy APK`;
        secureStorageFailed = false;
        return adapter;
      })
      .catch((error) => {
        androidStorageFallbackPromise = null;
        setAndroidStorageFallbackRequested(false);
        throw error;
      });
  }
  return androidStorageFallbackPromise;
}

function queueAndroidFallbackWrite(slot, normalizedValue) {
  secureStorageCache.set(slot, normalizedValue);
  secureWriteQueue = secureWriteQueue
    .then(() => activateAndroidStorageFallback())
    .then((adapter) => adapter.write(slot, normalizedValue))
    .then(() => {
      secureStorageFailed = false;
      secureBroadcastChannel?.postMessage({ type: 'changed', slot });
    })
    .catch(handleSecureStorageFailure);
  return true;
}

function queueAndroidFallbackRemove(slot) {
  secureStorageCache.delete(slot);
  secureWriteQueue = secureWriteQueue
    .then(() => activateAndroidStorageFallback())
    .then((adapter) => adapter.remove(slot))
    .then(() => {
      secureStorageFailed = false;
      secureBroadcastChannel?.postMessage({ type: 'changed', slot });
    })
    .catch(handleSecureStorageFailure);
  return true;
}

secureStorageSet = function recoverableSecureStorageSet(slot, value) {
  if (!secureStorageReady || !SECURE_STORAGE_SLOTS.includes(slot)) return false;
  const normalizedValue = String(value ?? '');

  if (secureStorageAdapter.synchronous) {
    let saved = false;
    try {
      saved = secureStorageAdapter.writeSync(slot, normalizedValue);
    } catch (error) {
      console.warn('Natywny magazyn Android odrzucił zapis. Włączam tryb zapasowy.', error);
    }
    if (saved) {
      secureStorageCache.set(slot, normalizedValue);
      secureStorageFailed = false;
      return true;
    }
    return queueAndroidFallbackWrite(slot, normalizedValue);
  }

  secureStorageCache.set(slot, normalizedValue);
  secureWriteQueue = secureWriteQueue
    .then(() => secureStorageAdapter.write(slot, normalizedValue))
    .then(() => {
      secureStorageFailed = false;
      secureBroadcastChannel?.postMessage({ type: 'changed', slot });
    })
    .catch(handleSecureStorageFailure);
  return true;
};

secureStorageRemove = function recoverableSecureStorageRemove(slot) {
  if (!secureStorageReady || !SECURE_STORAGE_SLOTS.includes(slot)) return false;

  if (secureStorageAdapter.synchronous) {
    let removed = false;
    try {
      removed = secureStorageAdapter.removeSync(slot);
    } catch (error) {
      console.warn('Natywny magazyn Android odrzucił usunięcie. Włączam tryb zapasowy.', error);
    }
    if (removed) {
      secureStorageCache.delete(slot);
      secureStorageFailed = false;
      return true;
    }
    return queueAndroidFallbackRemove(slot);
  }

  secureStorageCache.delete(slot);
  secureWriteQueue = secureWriteQueue
    .then(() => secureStorageAdapter.remove(slot))
    .then(() => {
      secureStorageFailed = false;
      secureBroadcastChannel?.postMessage({ type: 'changed', slot });
    })
    .catch(handleSecureStorageFailure);
  return true;
};

flushSecureStorageWrites = async function flushRecoverableSecureStorageWrites() {
  await secureWriteQueue;
  if (secureStorageFailed) throw new Error('Bezpieczny magazyn danych zgłosił błąd zapisu.');
};

handleSecureStorageFailure = function handleRecoverableSecureStorageFailure(error) {
  secureStorageFailed = true;
  console.error('Błąd bezpiecznego magazynu:', error);
  const now = Date.now();
  if (now - lastSecureStorageErrorToastAt < 5000) return;
  lastSecureStorageErrorToastAt = now;
  if (el['toast-region']) {
    showToast(
      'Nie udało się zapisać danych także w zapasowym magazynie. Nie zamykaj aplikacji i wyeksportuj kopię.',
      'error',
      12000
    );
  } else {
    startupWarnings.push('Bezpieczny zapis danych nie działa.');
  }
};

saveAutomaticImportBackup = function saveNonBlockingAutomaticImportBackup(
  reason = 'przed importem'
) {
  try {
    const payload = createBackupPayload('all', data.activeProfileId, {
      automatic: true,
      reason,
      savedAt: new Date().toISOString(),
    });
    if (!secureStorageSet(AUTO_IMPORT_BACKUP_KEY, JSON.stringify(payload))) {
      throw new Error('Bezpieczny magazyn odrzucił automatyczną kopię.');
    }
    renderAutomaticBackupState();
    return true;
  } catch (error) {
    console.warn('Nie udało się utworzyć dodatkowej kopii przed importem:', error);
    showToast(
      'Nie utworzono dodatkowej kopii przed importem. Import będzie kontynuowany.',
      '',
      6500
    );
    return true;
  }
};

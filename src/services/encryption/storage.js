const SECURE_DB_NAME = 'dzienniczek-secure-storage-v1';
const SECURE_DB_VERSION = 1;
const SECURE_RECORD_STORE = 'records';
const SECURE_KEY_STORE = 'keys';
const SECURE_KEY_ID = 'medical-data-key-v1';
const SECURE_RECORD_AAD_PREFIX = 'DzienniczekHormonu|';
const SECURE_RECORD_AAD_SUFFIX = '|v1';
const ENCRYPTED_BACKUP_AAD = 'Dzienniczek Hormonu|encrypted-backup|v1';
const ENCRYPTED_BACKUP_FORMAT_VERSION = 1;
const PBKDF2_ITERATIONS = 210000;
const BACKUP_PASSWORD_MIN_LENGTH = 8;
const SECURE_STORAGE_SLOTS = Object.freeze([
  STORAGE_KEY,
  BACKUP_STORAGE_KEY,
  AUTO_IMPORT_BACKUP_KEY,
]);

let secureStorageAdapter = null;
let secureStorageReady = false;
let secureStorageFailed = false;
let secureStorageTypeLabel = 'nieuruchomiony';
let secureWriteQueue = Promise.resolve();
let secureBroadcastChannel = null;
const secureStorageCache = new Map();
let securityEventsBound = false;
let appLocked = false;
let appBackgroundedAt = 0;
let failedUnlockAttempts = 0;
let unlockBlockedUntil = 0;

function defaultSecuritySettings() {
  return {
    pinEnabled: false,
    pinSalt: '',
    pinHash: '',
    biometricEnabled: false,
    autoLockMinutes: 5,
  };
}

function sanitizeSecuritySettings(settings = {}) {
  const pinSalt = isValidBase64(settings.pinSalt, 16) ? settings.pinSalt : '';
  const pinHash = isValidBase64(settings.pinHash, 32) ? settings.pinHash : '';
  const pinEnabled = Boolean(settings.pinEnabled && pinSalt && pinHash);
  const allowedTimeouts = new Set([0, 1, 5, 15, 30]);
  const requestedTimeout = Number(settings.autoLockMinutes);
  return {
    pinEnabled,
    pinSalt: pinEnabled ? pinSalt : '',
    pinHash: pinEnabled ? pinHash : '',
    biometricEnabled: Boolean(pinEnabled && settings.biometricEnabled),
    autoLockMinutes: allowedTimeouts.has(requestedTimeout) ? requestedTimeout : 5,
  };
}

function getSecuritySettings(container = data) {
  if (!container.appSettings || typeof container.appSettings !== 'object') {
    container.appSettings = {};
  }
  container.appSettings.security = sanitizeSecuritySettings(container.appSettings.security);
  return container.appSettings.security;
}

async function initializeSecureStorage() {
  if (secureStorageReady) return;
  if (!globalThis.crypto?.subtle && !hasNativeSecureStorage()) {
    throw new Error('Ta przeglądarka nie udostępnia bezpiecznej kryptografii Web Crypto.');
  }

  secureStorageAdapter = hasNativeSecureStorage()
    ? createNativeSecureStorageAdapter()
    : await createBrowserSecureStorageAdapter();
  secureStorageTypeLabel = secureStorageAdapter.label;

  const readFailures = [];
  for (const slot of SECURE_STORAGE_SLOTS) {
    let encryptedValue;
    try {
      encryptedValue = await secureStorageAdapter.read(slot);
    } catch (error) {
      readFailures.push({ slot, error });
      continue;
    }
    const legacyValue = readLegacyMedicalStorage(slot);
    if (encryptedValue === null && legacyValue !== null) {
      await secureStorageAdapter.write(slot, legacyValue);
      encryptedValue = legacyValue;
    }
    if (encryptedValue !== null) secureStorageCache.set(slot, encryptedValue);
    else secureStorageCache.delete(slot);

    if (legacyValue !== null && encryptedValue !== null) removeLegacyMedicalStorage(slot);
  }

  if (readFailures.length) {
    const primaryAvailable = secureStorageCache.has(STORAGE_KEY);
    const backupAvailable = secureStorageCache.has(BACKUP_STORAGE_KEY);
    const unrecoverable = readFailures.some(({ slot }) => {
      if (slot === STORAGE_KEY) return !backupAvailable;
      if (slot === BACKUP_STORAGE_KEY) return !primaryAvailable;
      return false;
    });
    if (unrecoverable) throw readFailures[0].error;
    startupWarnings.push(
      'Jeden z zaszyfrowanych zapisów był uszkodzony. Aplikacja użyła prawidłowej kopii.'
    );
  }

  secureStorageReady = true;
  configureSecureStorageBroadcast();
}

function hasNativeSecureStorage() {
  try {
    return (
      window.NativeBridge?.secureStorageType?.() === 'android-keystore-aes-gcm' &&
      typeof window.NativeBridge?.secureStorageRead === 'function'
    );
  } catch {
    return false;
  }
}

function createNativeSecureStorageAdapter() {
  return {
    label: 'Android Keystore · AES-256-GCM',
    synchronous: true,
    async read(slot) {
      const result = window.NativeBridge.secureStorageRead(slot);
      if (!result?.ok) throw new Error('Android Keystore nie może odczytać danych.');
      return result.exists ? String(result.value ?? '') : null;
    },
    async write(slot, value) {
      if (!window.NativeBridge.secureStorageWrite(slot, value)) {
        throw new Error('Android Keystore nie może zapisać danych.');
      }
    },
    async remove(slot) {
      if (!window.NativeBridge.secureStorageRemove(slot)) {
        throw new Error('Android Keystore nie może usunąć danych.');
      }
    },
    writeSync(slot, value) {
      return window.NativeBridge.secureStorageWrite(slot, value);
    },
    removeSync(slot) {
      return window.NativeBridge.secureStorageRemove(slot);
    },
  };
}

async function createBrowserSecureStorageAdapter() {
  if (!('indexedDB' in window)) throw new Error('Brak bezpiecznego magazynu IndexedDB.');
  const database = await openSecureDatabase();
  const key = await getOrCreateBrowserStorageKey(database);
  return {
    label: 'IndexedDB · AES-256-GCM',
    synchronous: false,
    async read(slot) {
      const record = await idbGet(database, SECURE_RECORD_STORE, slot);
      if (!record) return null;
      if (
        record.version !== 1 ||
        record.algorithm !== 'AES-GCM' ||
        typeof record.iv !== 'string' ||
        typeof record.ciphertext !== 'string'
      ) {
        throw new Error('Nieprawidłowy format zaszyfrowanego magazynu.');
      }
      const iv = base64ToBytes(record.iv);
      const ciphertext = base64ToBytes(record.ciphertext);
      if (iv.length !== 12 || ciphertext.length < 16) {
        throw new Error('Uszkodzony zaszyfrowany zapis.');
      }
      const plaintext = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv,
          additionalData: utf8Bytes(secureRecordAad(slot)),
          tagLength: 128,
        },
        key,
        ciphertext
      );
      return new TextDecoder().decode(plaintext);
    },
    async write(slot, value) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv,
          additionalData: utf8Bytes(secureRecordAad(slot)),
          tagLength: 128,
        },
        key,
        utf8Bytes(value)
      );
      await idbPut(database, SECURE_RECORD_STORE, {
        slot,
        version: 1,
        algorithm: 'AES-GCM',
        iv: bytesToBase64(iv),
        ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
        updatedAt: new Date().toISOString(),
      });
    },
    async remove(slot) {
      await idbDelete(database, SECURE_RECORD_STORE, slot);
    },
  };
}

function openSecureDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SECURE_DB_NAME, SECURE_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SECURE_RECORD_STORE)) {
        database.createObjectStore(SECURE_RECORD_STORE, { keyPath: 'slot' });
      }
      if (!database.objectStoreNames.contains(SECURE_KEY_STORE)) {
        database.createObjectStore(SECURE_KEY_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Nie można otworzyć IndexedDB.'));
    request.onblocked = () =>
      reject(new Error('Aktualizacja bezpiecznego magazynu jest zablokowana.'));
  });
}

async function getOrCreateBrowserStorageKey(database) {
  const stored = await idbGet(database, SECURE_KEY_STORE, SECURE_KEY_ID);
  if (stored?.key) return stored.key;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  try {
    await idbAdd(database, SECURE_KEY_STORE, { id: SECURE_KEY_ID, key });
    return key;
  } catch (error) {
    if (error?.name !== 'ConstraintError') throw error;
    const concurrent = await idbGet(database, SECURE_KEY_STORE, SECURE_KEY_ID);
    if (concurrent?.key) return concurrent.key;
    throw new Error('Nie udało się ustalić klucza szyfrowania.', { cause: error });
  }
}

function idbGet(database, storeName, key) {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error || new Error('Błąd odczytu IndexedDB.'));
  });
}

function idbPut(database, storeName, value) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Błąd zapisu IndexedDB.'));
    transaction.onabort = () =>
      reject(transaction.error || new Error('Zapis IndexedDB przerwany.'));
  });
}

function idbAdd(database, storeName, value) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const request = transaction.objectStore(storeName).add(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(request.error || transaction.error || new Error('Błąd tworzenia klucza IndexedDB.'));
    transaction.onabort = () =>
      reject(request.error || transaction.error || new Error('Tworzenie klucza przerwane.'));
  });
}

function idbDelete(database, storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error('Błąd usuwania z IndexedDB.'));
    transaction.onabort = () =>
      reject(transaction.error || new Error('Usuwanie z IndexedDB przerwane.'));
  });
}

function secureRecordAad(slot) {
  return `${SECURE_RECORD_AAD_PREFIX}${slot}${SECURE_RECORD_AAD_SUFFIX}`;
}

function readLegacyMedicalStorage(slot) {
  try {
    return localStorage.getItem(slot);
  } catch {
    return null;
  }
}

function removeLegacyMedicalStorage(slot) {
  try {
    localStorage.removeItem(slot);
  } catch (error) {
    console.warn('Nie udało się usunąć starego jawnego zapisu:', error);
  }
}

function secureStorageGet(slot) {
  if (!SECURE_STORAGE_SLOTS.includes(slot)) return null;
  return secureStorageCache.has(slot) ? secureStorageCache.get(slot) : null;
}

function secureStorageSet(slot, value) {
  if (!secureStorageReady || secureStorageFailed || !SECURE_STORAGE_SLOTS.includes(slot)) {
    return false;
  }
  const normalizedValue = String(value ?? '');
  if (secureStorageAdapter.synchronous) {
    const saved = secureStorageAdapter.writeSync(slot, normalizedValue);
    if (saved) secureStorageCache.set(slot, normalizedValue);
    else handleSecureStorageFailure(new Error('Android Keystore odrzucił zapis.'));
    return saved;
  }

  secureStorageCache.set(slot, normalizedValue);
  secureWriteQueue = secureWriteQueue
    .then(() => secureStorageAdapter.write(slot, normalizedValue))
    .then(() => secureBroadcastChannel?.postMessage({ type: 'changed', slot }))
    .catch(handleSecureStorageFailure);
  return true;
}

function secureStorageRemove(slot) {
  if (!secureStorageReady || secureStorageFailed || !SECURE_STORAGE_SLOTS.includes(slot)) {
    return false;
  }
  if (secureStorageAdapter.synchronous) {
    const removed = secureStorageAdapter.removeSync(slot);
    if (removed) secureStorageCache.delete(slot);
    else handleSecureStorageFailure(new Error('Android Keystore odrzucił usunięcie.'));
    return removed;
  }

  secureStorageCache.delete(slot);
  secureWriteQueue = secureWriteQueue
    .then(() => secureStorageAdapter.remove(slot))
    .then(() => secureBroadcastChannel?.postMessage({ type: 'changed', slot }))
    .catch(handleSecureStorageFailure);
  return true;
}

async function flushSecureStorageWrites() {
  await secureWriteQueue;
  if (secureStorageFailed) throw new Error('Bezpieczny magazyn danych zgłosił błąd zapisu.');
}

function configureSecureStorageBroadcast() {
  if (secureStorageAdapter.synchronous || typeof BroadcastChannel !== 'function') return;
  secureBroadcastChannel = new BroadcastChannel('dzienniczek-secure-data-v1');
  secureBroadcastChannel.addEventListener('message', async (event) => {
    if (event.data?.type !== 'changed' || !SECURE_STORAGE_SLOTS.includes(event.data.slot)) return;
    try {
      const value = await secureStorageAdapter.read(event.data.slot);
      if (value === null) secureStorageCache.delete(event.data.slot);
      else secureStorageCache.set(event.data.slot, value);
      if (event.data.slot === STORAGE_KEY && !appLocked) {
        data = attachActiveProfileAliases(loadData());
        resetRuntimeStateAfterSecureLoad();
        renderAll();
        renderSecuritySettings();
        showToast('Dane odświeżono z innej karty.', 'success');
      }
    } catch (error) {
      handleSecureStorageFailure(error);
    }
  });
}

function handleSecureStorageFailure(error) {
  secureStorageFailed = true;
  console.error('Błąd bezpiecznego magazynu:', error);
  if (el['toast-region']) {
    showToast(
      'Bezpieczny zapis danych nie działa. Nie zamykaj aplikacji i wyeksportuj zaszyfrowaną kopię.',
      'error',
      12000
    );
  } else {
    startupWarnings.push('Bezpieczny zapis danych nie działa.');
  }
}

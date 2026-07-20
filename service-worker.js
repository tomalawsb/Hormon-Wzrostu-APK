const CACHE_VERSION = 'v2.0-2007260736';
const CACHE_NAMESPACE = 'dzienniczek-hormonu-v2.0-2007260736';
const APP_CACHE_PREFIX = 'dzienniczek-hormonu-v';
const DOCUMENT_CACHE = `${CACHE_NAMESPACE}-documents`;
const SCRIPT_CACHE = `${CACHE_NAMESPACE}-scripts`;
const STYLE_CACHE = `${CACHE_NAMESPACE}-styles`;
const DATA_CACHE = `${CACHE_NAMESPACE}-data`;
const STATIC_CACHE = `${CACHE_NAMESPACE}-static`;
const API_CACHE = `${CACHE_NAMESPACE}-api`;
const RUNTIME_CACHE = `${CACHE_NAMESPACE}-runtime`;
const STATE_CACHE = 'gh-dzienniczek-reminder-state-v2';
const STATE_URL = new URL('./__reminder_state_v2__', self.registration.scope).href;
const OFFLINE_DOCUMENT_URL = new URL('./index.html', self.registration.scope).href;
const NETWORK_TIMEOUT_MS = 5000;
const API_TIMEOUT_MS = 8000;
const SECURE_DB_NAME = 'dzienniczek-secure-storage-v1';
const SECURE_DB_VERSION = 1;
const SECURE_RECORD_STORE = 'records';
const SECURE_KEY_STORE = 'keys';
const SECURE_KEY_ID = 'medical-data-key-v1';
const REMINDER_STATE_AAD = 'DzienniczekHormonu|reminder-state|v1';
const REMINDER_IN_FLIGHT = new Set();

const PRECACHE_GROUPS = [
  { cacheName: DOCUMENT_CACHE, assets: ['./', './index.html'] },
  { cacheName: SCRIPT_CACHE, assets: ['./app.js', './native-bridge.js'] },
  { cacheName: STYLE_CACHE, assets: ['./style.css'] },
  { cacheName: DATA_CACHE, assets: ['./manifest.json', './app-version.json'] },
  { cacheName: STATIC_CACHE, assets: ['./icon-192.png', './icon-512.png'] },
];
const CURRENT_APP_CACHES = new Set(PRECACHE_GROUPS.map(({ cacheName }) => cacheName));
CURRENT_APP_CACHES.add(API_CACHE);
CURRENT_APP_CACHES.add(RUNTIME_CACHE);

self.addEventListener('install', (event) => {
  event.waitUntil(refreshAppResources());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(APP_CACHE_PREFIX) && !CURRENT_APP_CACHES.has(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => migrateLegacyReminderState())
      .then(() => self.clients.claim())
      .then(() => broadcastToClients({ type: 'PWA_ACTIVATED', version: CACHE_VERSION }))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.url === STATE_URL) return;
  const url = new URL(event.request.url);
  if (!/^https?:$/.test(url.protocol) || event.request.headers.has('range')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(navigationNetworkFirst(event.request));
    return;
  }
  if (isReleaseApiRequest(url)) {
    event.respondWith(apiNetworkFirst(event.request));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (event.request.destination === 'script') {
    event.respondWith(
      staleWhileRevalidate(event, event.request, SCRIPT_CACHE, 'text/javascript; charset=utf-8')
    );
    return;
  }
  if (event.request.destination === 'style') {
    event.respondWith(
      staleWhileRevalidate(event, event.request, STYLE_CACHE, 'text/css; charset=utf-8')
    );
    return;
  }
  if (isJsonRequest(event.request, url)) {
    event.respondWith(jsonNetworkFirst(event.request));
    return;
  }
  if (event.request.destination === 'image' || event.request.destination === 'font') {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }
  event.respondWith(networkFirst(event.request, RUNTIME_CACHE));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (event.data?.type === 'REFRESH_APP_RESOURCES') {
    event.waitUntil(
      refreshAppResources()
        .then(() => ({ ok: true, version: CACHE_VERSION }))
        .catch((error) => ({ ok: false, error: String(error?.message || 'refresh_failed') }))
        .then((result) => event.ports?.[0]?.postMessage(result))
    );
    return;
  }
  if (event.data?.type === 'GET_PWA_STATUS') {
    event.waitUntil(getPwaCacheStatus().then((status) => event.ports?.[0]?.postMessage(status)));
    return;
  }
  if (event.data?.type === 'REMINDER_STATE') {
    event.waitUntil(saveReminderState(event.data.payload || {}));
    return;
  }
  if (event.data?.type === 'GET_REMINDER_STATE') {
    event.waitUntil(
      readReminderState().then((state) => event.ports?.[0]?.postMessage(state || null))
    );
  }
});

async function refreshAppResources() {
  const downloaded = await Promise.all(
    PRECACHE_GROUPS.flatMap(({ cacheName, assets }) =>
      assets.map(async (asset) => {
        const url = new URL(asset, self.registration.scope).href;
        const request = new Request(url, { cache: 'reload', credentials: 'same-origin' });
        const response = await fetch(request);
        if (!isCacheable(response)) throw new Error(`Nie udało się pobrać zasobu: ${asset}`);
        return { cacheName, url, response };
      })
    )
  );
  await Promise.all(
    downloaded.map(async ({ cacheName, url, response }) => {
      const cache = await caches.open(cacheName);
      await cache.put(url, response);
    })
  );
}

async function navigationNetworkFirst(request) {
  try {
    return await networkFirst(request, DOCUMENT_CACHE, {
      timeoutMs: NETWORK_TIMEOUT_MS,
      throwOnMiss: true,
    });
  } catch {
    const cache = await caches.open(DOCUMENT_CACHE);
    return (
      (await cache.match(OFFLINE_DOCUMENT_URL)) ||
      new Response('<!doctype html><title>Brak połączenia</title><h1>Aplikacja jest offline</h1>', {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    );
  }
}

async function jsonNetworkFirst(request) {
  try {
    return await networkFirst(request, DATA_CACHE, {
      timeoutMs: NETWORK_TIMEOUT_MS,
      throwOnMiss: true,
    });
  } catch {
    return offlineJsonResponse();
  }
}

async function apiNetworkFirst(request) {
  try {
    return await networkFirst(request, API_CACHE, {
      timeoutMs: API_TIMEOUT_MS,
      throwOnMiss: true,
    });
  } catch {
    return offlineJsonResponse();
  }
}

async function networkFirst(
  request,
  cacheName,
  { timeoutMs = NETWORK_TIMEOUT_MS, throwOnMiss = false } = {}
) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetchWithTimeout(request, timeoutMs);
    if (isCacheable(response)) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: false });
    if (cached) return cached;
    if (throwOnMiss) throw error;
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(event, request, cacheName, fallbackContentType) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: false });
  const update = fetch(request).then(async (response) => {
    if (isCacheable(response)) await cache.put(request, response.clone());
    return response;
  });
  if (cached) {
    event.waitUntil(update.catch(() => undefined));
    return cached;
  }
  try {
    return await update;
  } catch {
    return new Response('', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': fallbackContentType },
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: false });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (isCacheable(response)) await cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function isCacheable(response) {
  return Boolean(response && response.status === 200 && response.type !== 'opaque');
}

function isJsonRequest(request, url) {
  const accept = request.headers.get('accept') || '';
  return (
    request.destination === 'manifest' ||
    url.pathname.endsWith('.json') ||
    accept.includes('application/json')
  );
}

function isReleaseApiRequest(url) {
  return (
    url.origin === 'https://api.github.com' &&
    url.pathname === '/repos/tomalawsb/Hormon-Wzrostu-APK/releases/latest'
  );
}

function offlineJsonResponse() {
  return new Response(JSON.stringify({ ok: false, offline: true, error: 'offline' }), {
    status: 503,
    statusText: 'Offline',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function getPwaCacheStatus() {
  const keys = await caches.keys();
  const requiredCaches = PRECACHE_GROUPS.map(({ cacheName }) => cacheName);
  const readyCaches = requiredCaches.filter((name) => keys.includes(name));
  return {
    ok: readyCaches.length === requiredCaches.length,
    version: CACHE_VERSION,
    readyCaches: readyCaches.length,
    expectedCaches: requiredCaches.length,
  };
}

async function broadcastToClients(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((client) => client.postMessage(message));
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'daily-injection-reminder') event.waitUntil(checkReminderDue());
});

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let payload = {};
      try {
        payload = event.data?.json?.() || {};
      } catch {
        payload = { body: event.data?.text?.() || '' };
      }
      const state = await readReminderState();
      const profile = Array.isArray(state?.profiles)
        ? state.profiles.find((item) => item.profileId === payload.profileId) || null
        : null;
      const title =
        payload.title ||
        (profile?.profileName ? `Czas na zastrzyk — ${profile.profileName}` : 'Czas na zastrzyk');
      const body = payload.body || profile?.body || 'Otwórz aplikację i zapisz dzisiejsze podanie.';
      const profileId = payload.profileId || profile?.profileId || '';
      await showReminder(
        title,
        body,
        payload.tag || `gh-reminder-push-${profileId || 'profil'}-${localDateISO()}`,
        payload.url || profile?.url || './#today',
        profileId
      );
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || './#today', self.registration.scope);
  const profileId = event.notification.data?.profileId || '';
  if (profileId) targetUrl.searchParams.set('profile', profileId);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          await client.navigate(targetUrl.href).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl.href);
    })()
  );
});

function sanitizeReminderProfile(value = {}) {
  if (!value || typeof value !== 'object' || !value.profileId) return null;
  return {
    profileId: String(value.profileId),
    profileName: String(value.profileName || ''),
    enabled: Boolean(value.enabled),
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value.time || '')) ? String(value.time) : '21:00',
    lastReminderDate: /^\d{4}-\d{2}-\d{2}$/.test(String(value.lastReminderDate || ''))
      ? String(value.lastReminderDate)
      : '',
    today: /^\d{4}-\d{2}-\d{2}$/.test(String(value.today || '')) ? String(value.today) : '',
    todayHasEntry: Boolean(value.todayHasEntry),
    body: String(value.body || ''),
    url: String(value.url || './#today'),
    suggestion: String(value.suggestion || ''),
  };
}

async function saveReminderState(payload) {
  const previous = (await readReminderState()) || { version: 2, profiles: [] };
  const previousProfiles = Array.isArray(previous.profiles) ? previous.profiles : [];
  const previousById = new Map(previousProfiles.map((profile) => [profile.profileId, profile]));
  const incoming = Array.isArray(payload.profiles)
    ? payload.profiles.map(sanitizeReminderProfile).filter(Boolean)
    : [sanitizeReminderProfile(payload)].filter(Boolean);

  const profiles = incoming.map((profile) => {
    const old = previousById.get(profile.profileId);
    if (old && (old.lastReminderDate || '') > (profile.lastReminderDate || '')) {
      return { ...profile, lastReminderDate: old.lastReminderDate };
    }
    return profile;
  });
  const state = { version: 2, profiles, savedAt: new Date().toISOString() };
  await writeEncryptedReminderState(state);
}

async function writeEncryptedReminderState(state) {
  const key = await getReminderEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: new TextEncoder().encode(REMINDER_STATE_AAD),
      tagLength: 128,
    },
    key,
    new TextEncoder().encode(JSON.stringify(state))
  );
  const envelope = {
    encryptedStateVersion: 1,
    algorithm: 'AES-GCM',
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
  const cache = await caches.open(STATE_CACHE);
  await cache.put(
    STATE_URL,
    new Response(JSON.stringify(envelope), { headers: { 'Content-Type': 'application/json' } })
  );
}

async function readReminderState() {
  const cache = await caches.open(STATE_CACHE);
  const response = await cache.match(STATE_URL);
  if (!response) return null;
  try {
    const stored = await response.json();
    if (stored?.encryptedStateVersion !== 1) {
      if (stored?.version === 2 && Array.isArray(stored.profiles)) {
        await writeEncryptedReminderState(stored);
        return stored;
      }
      throw new Error('Nieprawidłowy stan przypomnień.');
    }
    if (
      stored.algorithm !== 'AES-GCM' ||
      typeof stored.iv !== 'string' ||
      typeof stored.ciphertext !== 'string'
    ) {
      throw new Error('Nieprawidłowa zaszyfrowana koperta przypomnień.');
    }
    const iv = base64ToBytes(stored.iv);
    const ciphertext = base64ToBytes(stored.ciphertext);
    if (iv.length !== 12 || ciphertext.length < 16) throw new Error('Uszkodzony stan przypomnień.');
    const key = await getReminderEncryptionKey();
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: new TextEncoder().encode(REMINDER_STATE_AAD),
        tagLength: 128,
      },
      key,
      ciphertext
    );
    const state = JSON.parse(new TextDecoder().decode(plaintext));
    return state?.version === 2 && Array.isArray(state.profiles) ? state : null;
  } catch (error) {
    console.warn('Nie udało się odszyfrować stanu przypomnień:', error);
    await cache.delete(STATE_URL);
    return null;
  }
}

async function migrateLegacyReminderState() {
  await readReminderState();
}

async function getReminderEncryptionKey() {
  const database = await openSecureDatabase();
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
    throw new Error('Nie udało się ustalić klucza szyfrowania przypomnień.', { cause: error });
  }
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
  });
}

function idbGet(database, storeName, key) {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error || new Error('Błąd odczytu IndexedDB.'));
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

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function checkReminderDue() {
  const state = await readReminderState();
  if (!Array.isArray(state?.profiles) || !state.profiles.length) return;

  const today = localDateISO();
  const currentTime = `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
  let changed = false;
  for (const profile of state.profiles) {
    if (!profile.enabled) continue;
    const alreadyHasEntryToday = profile.today === today && Boolean(profile.todayHasEntry);
    if (
      alreadyHasEntryToday ||
      profile.lastReminderDate === today ||
      currentTime < (profile.time || '21:00')
    )
      continue;
    const lockKey = String(profile.profileId || 'profil');
    if (REMINDER_IN_FLIGHT.has(lockKey)) continue;
    REMINDER_IN_FLIGHT.add(lockKey);
    try {
      await showReminder(
        `Czas na zastrzyk${profile.profileName ? ` — ${profile.profileName}` : ''}`,
        profile.body || 'Otwórz aplikację i zapisz dzisiejsze podanie.',
        `gh-reminder-${profile.profileId || 'profil'}-${today}`,
        profile.url || './#today',
        profile.profileId || ''
      );
      profile.lastReminderDate = today;
      profile.today = today;
      profile.todayHasEntry = false;
      changed = true;
    } finally {
      REMINDER_IN_FLIGHT.delete(lockKey);
    }
  }
  if (changed) await saveReminderState({ version: 2, profiles: state.profiles });
}

async function showReminder(title, body, tag, url, profileId = '') {
  await self.registration.showNotification(title, {
    body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag,
    renotify: false,
    data: { url, profileId },
  });
}

function localDateISO(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

const CACHE_NAME = 'gh-dzienniczek-v2.7-1607262336';
const STATE_CACHE = 'gh-dzienniczek-reminder-state-v1';
const STATE_URL = new URL('./__reminder_state__', self.registration.scope).href;

const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

const OPTIONAL_ASSETS = [
  './app-version.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Pliki wymagane do uruchomienia aplikacji muszą zostać zapisane w komplecie.
    // Błąd któregokolwiek z nich przerywa instalację nowego service workera,
    // dzięki czemu nadal działa poprzednia, kompletna wersja offline.
    await cache.addAll(CORE_ASSETS);

    // Brak pliku opcjonalnego nie blokuje aktualizacji aplikacji.
    await Promise.all(OPTIONAL_ASSETS.map(async (asset) => {
      try {
        await cache.add(asset);
      } catch (error) {
        console.warn('Nie udało się zapisać opcjonalnego pliku offline:', asset, error);
      }
    }));

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME && key !== STATE_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.url === STATE_URL) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response?.status === 200 && response.type !== 'opaque') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') return caches.match('./index.html');
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'REMINDER_STATE') {
    event.waitUntil(saveReminderState(event.data.payload || {}));
    return;
  }
  if (event.data?.type === 'GET_REMINDER_STATE') {
    event.waitUntil(readReminderState().then((state) => event.ports?.[0]?.postMessage(state || null)));
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'daily-injection-reminder') event.waitUntil(checkReminderDue());
});

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data?.json?.() || {}; } catch { payload = { body: event.data?.text?.() || '' }; }
    const state = await readReminderState();
    const title = payload.title || 'Czas na zastrzyk';
    const body = payload.body || state?.body || 'Otwórz aplikację i zapisz dzisiejsze podanie.';
    await showReminder(title, body, payload.tag || `gh-reminder-push-${localDateISO()}`, payload.url || state?.url || './#today');
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || './#today', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.navigate(targetUrl).catch(() => undefined);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});

async function saveReminderState(payload) {
  const previous = await readReminderState() || {};
  const state = { ...previous, ...payload, savedAt: new Date().toISOString() };
  if ((previous.lastReminderDate || '') > (payload.lastReminderDate || '')) {
    state.lastReminderDate = previous.lastReminderDate;
  }
  const cache = await caches.open(STATE_CACHE);
  await cache.put(STATE_URL, new Response(JSON.stringify(state), { headers: { 'Content-Type': 'application/json' } }));
}

async function readReminderState() {
  const cache = await caches.open(STATE_CACHE);
  const response = await cache.match(STATE_URL);
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}

async function checkReminderDue() {
  const state = await readReminderState();
  if (!state?.enabled) return;

  const today = localDateISO();
  const currentTime = `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
  const alreadyHasEntryToday = state.today === today && Boolean(state.todayHasEntry);
  if (alreadyHasEntryToday || state.lastReminderDate === today || currentTime < (state.time || '21:00')) return;

  await showReminder('Czas na zastrzyk', state.body || 'Otwórz aplikację i zapisz dzisiejsze podanie.', `gh-reminder-${today}`, state.url || './#today');
  await saveReminderState({ ...state, today, todayHasEntry: false, lastReminderDate: today });
}

async function showReminder(title, body, tag, url) {
  await self.registration.showNotification(title, {
    body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag,
    renotify: false,
    data: { url }
  });
}

function localDateISO(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

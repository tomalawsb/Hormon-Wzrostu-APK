const CACHE_NAME = 'dzienniczek-hormonu-v1.0.12';
const STATE_CACHE = 'gh-dzienniczek-reminder-state-v2';
const STATE_URL = new URL('./__reminder_state_v2__', self.registration.scope).href;
const REMINDER_IN_FLIGHT = new Set();

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './native-bridge.js',
  './manifest.json',
  './app-version.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
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

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
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
    const profile = Array.isArray(state?.profiles)
      ? state.profiles.find((item) => item.profileId === payload.profileId) || null
      : null;
    const title = payload.title || (profile?.profileName ? `Czas na zastrzyk — ${profile.profileName}` : 'Czas na zastrzyk');
    const body = payload.body || profile?.body || 'Otwórz aplikację i zapisz dzisiejsze podanie.';
    const profileId = payload.profileId || profile?.profileId || '';
    await showReminder(title, body, payload.tag || `gh-reminder-push-${profileId || 'profil'}-${localDateISO()}`, payload.url || profile?.url || './#today', profileId);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || './#today', self.registration.scope);
  const profileId = event.notification.data?.profileId || '';
  if (profileId) targetUrl.searchParams.set('profile', profileId);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.navigate(targetUrl.href).catch(() => undefined);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl.href);
  })());
});

function sanitizeReminderProfile(value = {}) {
  if (!value || typeof value !== 'object' || !value.profileId) return null;
  return {
    profileId: String(value.profileId),
    profileName: String(value.profileName || ''),
    enabled: Boolean(value.enabled),
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value.time || '')) ? String(value.time) : '21:00',
    lastReminderDate: /^\d{4}-\d{2}-\d{2}$/.test(String(value.lastReminderDate || '')) ? String(value.lastReminderDate) : '',
    today: /^\d{4}-\d{2}-\d{2}$/.test(String(value.today || '')) ? String(value.today) : '',
    todayHasEntry: Boolean(value.todayHasEntry),
    body: String(value.body || ''),
    url: String(value.url || './#today'),
    suggestion: String(value.suggestion || '')
  };
}

async function saveReminderState(payload) {
  const previous = await readReminderState() || { version: 2, profiles: [] };
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
  if (!Array.isArray(state?.profiles) || !state.profiles.length) return;

  const today = localDateISO();
  const currentTime = `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
  let changed = false;
  for (const profile of state.profiles) {
    if (!profile.enabled) continue;
    const alreadyHasEntryToday = profile.today === today && Boolean(profile.todayHasEntry);
    if (alreadyHasEntryToday || profile.lastReminderDate === today || currentTime < (profile.time || '21:00')) continue;
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
    data: { url, profileId }
  });
}

function localDateISO(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

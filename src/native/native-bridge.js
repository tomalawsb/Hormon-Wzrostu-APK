import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';

const CHANNEL_ID = 'growth-diary-reminders';
const SOURCE = 'growth-diary';
const SCHEDULE_DAYS = 90;
let initialized = false;
let initializing = null;

function hasAndroidWebViewBridge() {
  return typeof window.AndroidNative === 'object' && window.AndroidNative !== null;
}

function isNative() {
  return hasAndroidWebViewBridge() || (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android');
}

function emit(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function localDateISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseTime(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  return match ? [Number(match[1]), Number(match[2])] : [21, 0];
}

function stableId(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 100000 + (Math.abs(hash >>> 0) % 1900000000);
}

async function initialize() {
  if (!isNative()) return false;
  if (initialized) return true;
  if (initializing) return initializing;
  initializing = (async () => {
    if (hasAndroidWebViewBridge()) {
      window.AndroidNative.initialize?.();
      initialized = true;
      return true;
    }
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Przypomnienia o zastrzykach',
      description: 'Codzienne przypomnienia dla profili dzieci',
      importance: 5,
      visibility: 1,
      vibration: true
    }).catch(() => undefined);

    await App.addListener('backButton', ({ canGoBack }) => {
      emit('nativeBackButton', { canGoBack: Boolean(canGoBack) });
    });
    await App.addListener('resume', () => emit('nativeAppResume'));
    await LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
      emit('nativeNotificationAction', {
        profileId: String(notification?.extra?.profileId || ''),
        date: String(notification?.extra?.date || '')
      });
    });
    initialized = true;
    return true;
  })().finally(() => { initializing = null; });
  return initializing;
}

async function notificationPermission() {
  if (!isNative()) return 'unsupported';
  if (hasAndroidWebViewBridge()) return String(window.AndroidNative.notificationPermission?.() || 'prompt');
  await initialize();
  const result = await LocalNotifications.checkPermissions();
  return result.display || 'prompt';
}

async function exactAlarmPermission() {
  if (!isNative()) return 'unsupported';
  if (hasAndroidWebViewBridge()) return String(window.AndroidNative.exactAlarmPermission?.() || 'granted');
  try {
    await initialize();
    const result = await LocalNotifications.checkExactNotificationSetting();
    return result.exact_alarm || 'denied';
  } catch {
    return 'denied';
  }
}

async function requestExactAlarmPermission() {
  if (!isNative()) return 'unsupported';
  if (hasAndroidWebViewBridge()) return String(window.AndroidNative.requestExactAlarmPermission?.() || 'granted');
  try {
    await initialize();
    const current = await exactAlarmPermission();
    if (current === 'granted') return current;
    const result = await LocalNotifications.changeExactNotificationSetting();
    return result.exact_alarm || 'denied';
  } catch {
    return 'denied';
  }
}

async function requestNotificationPermission() {
  if (!isNative()) return 'unsupported';
  if (hasAndroidWebViewBridge()) return requestWebViewPermission('notification');
  await initialize();
  const result = await LocalNotifications.requestPermissions();
  const display = result.display || 'prompt';
  if (display === 'granted') {
    await requestExactAlarmPermission().catch(() => 'denied');
  }
  return display;
}

function parseNativeJson(raw, fallback = {}) {
  try {
    const parsed = JSON.parse(String(raw || ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function notificationDiagnostics() {
  if (!isNative()) {
    return {
      platform: 'web',
      notificationPermission: 'unsupported',
      exactAlarmPermission: 'unsupported',
      configuredProfiles: 0,
      scheduledProfiles: 0,
      nextTriggerAt: 0,
      scheduleMode: 'none'
    };
  }
  if (hasAndroidWebViewBridge()) {
    return parseNativeJson(window.AndroidNative.notificationDiagnostics?.(), {
      platform: 'android',
      notificationPermission: 'denied',
      exactAlarmPermission: 'denied',
      configuredProfiles: 0,
      scheduledProfiles: 0,
      nextTriggerAt: 0,
      scheduleMode: 'none'
    });
  }
  await initialize();
  const [permission, exact, pendingResult, channelsResult] = await Promise.all([
    notificationPermission().catch(() => 'denied'),
    exactAlarmPermission().catch(() => 'denied'),
    LocalNotifications.getPending().catch(() => ({ notifications: [] })),
    LocalNotifications.listChannels().catch(() => ({ channels: [] }))
  ]);
  const notifications = (pendingResult.notifications || []).filter(
    (item) => item.extra?.source === SOURCE && !item.extra?.test
  );
  const profileIds = new Set(notifications.map((item) => String(item.extra?.profileId || '')));
  const nextTriggerAt = notifications.reduce((next, item) => {
    const at = new Date(item.schedule?.at || 0).getTime();
    return Number.isFinite(at) && at > 0 && (!next || at < next) ? at : next;
  }, 0);
  const channel = (channelsResult.channels || []).find((item) => item.id === CHANNEL_ID) || null;
  return {
    platform: 'android',
    notificationPermission: permission,
    notificationsEnabled: permission === 'granted',
    channelEnabled: !channel || Number(channel.importance) > 0,
    exactAlarmPermission: exact,
    configuredProfiles: profileIds.size,
    scheduledProfiles: profileIds.size,
    nextTriggerAt,
    scheduleMode: notifications.length ? (exact === 'granted' ? 'exact' : 'inexact') : 'none'
  };
}

async function openNotificationSettings() {
  if (!isNative()) return false;
  if (hasAndroidWebViewBridge()) {
    return Boolean(window.AndroidNative.openNotificationSettings?.());
  }
  return false;
}

function notificationEventsReady() {
  if (hasAndroidWebViewBridge()) window.AndroidNative.notificationEventsReady?.();
}

async function microphonePermission() {
  if (!isNative()) return 'unsupported';
  if (hasAndroidWebViewBridge()) return String(window.AndroidNative.microphonePermission?.() || 'prompt');
  try {
    if (!navigator.permissions?.query) return navigator.mediaDevices?.getUserMedia ? 'prompt' : 'unsupported';
    const result = await navigator.permissions.query({ name: 'microphone' });
    return result.state || 'prompt';
  } catch {
    return navigator.mediaDevices?.getUserMedia ? 'prompt' : 'unsupported';
  }
}

function requestWebViewPermission(kind) {
  return new Promise((resolve) => {
    const eventName = 'nativePermissionChanged';
    const timeout = window.setTimeout(() => {
      window.removeEventListener(eventName, listener);
      const fallback = kind === 'microphone'
        ? window.AndroidNative.microphonePermission?.()
        : window.AndroidNative.notificationPermission?.();
      resolve(String(fallback || 'denied'));
    }, 12000);
    const listener = (event) => {
      if (String(event.detail?.kind || '') !== kind) return;
      window.clearTimeout(timeout);
      window.removeEventListener(eventName, listener);
      resolve(String(event.detail?.state || 'denied'));
    };
    window.addEventListener(eventName, listener);
    if (kind === 'microphone') window.AndroidNative.requestMicrophonePermission?.();
    else window.AndroidNative.requestNotificationPermission?.();
  });
}

async function requestMicrophonePermission() {
  if (!isNative()) return 'unsupported';
  if (hasAndroidWebViewBridge()) return requestWebViewPermission('microphone');
  try {
    if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return 'granted';
  } catch {
    return 'denied';
  }
}

async function cancelDiaryNotifications() {
  const pending = await LocalNotifications.getPending();
  const notifications = (pending.notifications || []).filter((item) => item.extra?.source === SOURCE);
  if (notifications.length) {
    await LocalNotifications.cancel({ notifications: notifications.map(({ id }) => ({ id })) });
  }
}

function makeScheduledNotification(profile, at, dateISO) {
  return {
    id: stableId(`${profile.profileId}:${dateISO}`),
    title: `Czas na zastrzyk — ${profile.profileName}`,
    body: profile.body || `${profile.profileName}: otwórz aplikację i zapisz podanie.`,
    channelId: CHANNEL_ID,
    smallIcon: 'ic_stat_notify',
    schedule: { at, allowWhileIdle: true },
    extra: {
      source: SOURCE,
      profileId: profile.profileId,
      date: dateISO,
      url: './#today'
    }
  };
}

async function syncDailyReminders(profiles = []) {
  if (!isNative()) return { scheduled: 0 };
  if (hasAndroidWebViewBridge()) {
    const scheduled = Number(window.AndroidNative.syncDailyReminders?.(JSON.stringify(profiles)) || 0);
    return { scheduled };
  }
  await initialize();
  await cancelDiaryNotifications();
  if (await notificationPermission() !== 'granted') return { scheduled: 0 };

  const deliveredResult = await LocalNotifications.getDeliveredNotifications().catch(() => ({ notifications: [] }));
  const delivered = (deliveredResult.notifications || []).filter((item) => item.extra?.source === SOURCE && !item.extra?.test);
  const deliveredKeys = new Set(delivered.map((item) => `${item.extra?.profileId || ''}:${item.extra?.date || ''}`));
  const profileById = new Map(profiles.map((profile) => [profile.profileId, profile]));
  const toRemove = delivered.filter((item) => {
    const profile = profileById.get(item.extra?.profileId || '');
    return !profile || profile.todayHasEntry;
  });
  if (toRemove.length) {
    await LocalNotifications.removeDeliveredNotifications({ notifications: toRemove }).catch(() => undefined);
  }

  const now = new Date();
  const todayISO = localDateISO(now);
  const notifications = [];
  for (const profile of profiles) {
    if (!profile?.profileId || !profile.enabled) continue;
    const [hour, minute] = parseTime(profile.time);
    for (let offset = 0; offset < SCHEDULE_DAYS; offset += 1) {
      const at = new Date(now);
      at.setDate(now.getDate() + offset);
      at.setHours(hour, minute, 0, 0);
      const dateISO = localDateISO(at);
      if (offset === 0 && (profile.todayHasEntry || profile.lastReminderDate === todayISO || deliveredKeys.has(`${profile.profileId}:${todayISO}`))) continue;
      if (offset === 0 && at <= now) at.setTime(now.getTime() + 3000);
      notifications.push(makeScheduledNotification(profile, at, dateISO));
    }
  }

  if (notifications.length) await LocalNotifications.schedule({ notifications });
  return { scheduled: notifications.length };
}

async function showNotification({ title, body, profileId = '', test = false } = {}) {
  if (!isNative()) return false;
  if (hasAndroidWebViewBridge()) {
    return Boolean(window.AndroidNative.showNotification?.(JSON.stringify({ title, body, profileId, test })));
  }
  await initialize();
  if (await notificationPermission() !== 'granted') return false;
  const dateISO = localDateISO();
  await LocalNotifications.schedule({
    notifications: [{
      id: stableId(`${test ? 'test' : 'now'}:${profileId}:${Date.now()}`),
      title: title || 'Dzienniczek Hormonu',
      body: body || 'Otwórz aplikację.',
      channelId: CHANNEL_ID,
      smallIcon: 'ic_stat_notify',
      schedule: { at: new Date(Date.now() + 250) },
      extra: { source: SOURCE, profileId, date: dateISO, url: './#today', test: Boolean(test) }
    }]
  });
  return true;
}

function parseNativeSecurityResult(raw, fallbackError = 'security_error') {
  try {
    const parsed = JSON.parse(String(raw || ''));
    return parsed && typeof parsed === 'object'
      ? parsed
      : { ok: false, error: fallbackError };
  } catch {
    return { ok: false, error: fallbackError };
  }
}

function secureStorageType() {
  if (!hasAndroidWebViewBridge()) return 'unsupported';
  return String(window.AndroidNative.secureStorageType?.() || 'unsupported');
}

function secureStorageRead(slot) {
  if (!hasAndroidWebViewBridge()) return { ok: false, exists: false, error: 'unsupported' };
  return parseNativeSecurityResult(window.AndroidNative.secureStorageRead?.(String(slot || '')));
}

function secureStorageWrite(slot, value) {
  if (!hasAndroidWebViewBridge()) return false;
  return Boolean(
    window.AndroidNative.secureStorageWrite?.(String(slot || ''), String(value ?? ''))
  );
}

function secureStorageRemove(slot) {
  if (!hasAndroidWebViewBridge()) return false;
  return Boolean(window.AndroidNative.secureStorageRemove?.(String(slot || '')));
}

function randomBase64(byteCount = 16) {
  if (!hasAndroidWebViewBridge()) return '';
  return String(window.AndroidNative.randomBase64?.(Number(byteCount) || 16) || '');
}

function pinHash(pin, saltBase64) {
  if (!hasAndroidWebViewBridge()) return '';
  return String(window.AndroidNative.pinHash?.(String(pin || ''), String(saltBase64 || '')) || '');
}

function encryptBackup(plaintext, password) {
  if (!hasAndroidWebViewBridge()) return { ok: false, error: 'unsupported' };
  return parseNativeSecurityResult(
    window.AndroidNative.encryptBackup?.(String(plaintext || ''), String(password || '')),
    'encryption_failed'
  );
}

function decryptBackup(envelope, password) {
  if (!hasAndroidWebViewBridge()) return { ok: false, error: 'unsupported' };
  return parseNativeSecurityResult(
    window.AndroidNative.decryptBackup?.(String(envelope || ''), String(password || '')),
    'decryption_failed'
  );
}

function biometricStatus() {
  if (!hasAndroidWebViewBridge()) return 'unsupported';
  return String(window.AndroidNative.biometricStatus?.() || 'unavailable');
}

function requestBiometricUnlock() {
  if (!hasAndroidWebViewBridge() || biometricStatus() !== 'available') {
    return Promise.resolve({ success: false, state: 'unavailable' });
  }
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('nativeBiometricResult', listener);
      resolve({ success: false, state: 'timeout' });
    }, 60000);
    const listener = (event) => {
      window.clearTimeout(timeout);
      window.removeEventListener('nativeBiometricResult', listener);
      resolve({
        success: Boolean(event.detail?.success),
        state: String(event.detail?.state || 'cancelled')
      });
    };
    window.addEventListener('nativeBiometricResult', listener);
    window.AndroidNative.requestBiometricUnlock?.();
  });
}


function saveJsonFile(filename, content) {
  if (!hasAndroidWebViewBridge()) {
    return Promise.resolve({ success: false, state: 'unsupported' });
  }
  return new Promise((resolve) => {
    const eventName = 'nativeFileSaveResult';
    const timeout = window.setTimeout(() => {
      window.removeEventListener(eventName, listener);
      resolve({ success: false, state: 'timeout' });
    }, 120000);
    const listener = (event) => {
      window.clearTimeout(timeout);
      window.removeEventListener(eventName, listener);
      resolve({
        success: Boolean(event.detail?.success),
        state: String(event.detail?.state || 'unknown')
      });
    };
    window.addEventListener(eventName, listener);
    const started = Boolean(
      window.AndroidNative.saveJsonFile?.(String(filename || ''), String(content ?? ''))
    );
    if (!started) {
      window.clearTimeout(timeout);
      window.removeEventListener(eventName, listener);
      resolve({ success: false, state: 'not_started' });
    }
  });
}

function isAllowedUpdateApkUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port) return false;
    if (url.username || url.password || url.search || url.hash) return false;
    const prefix = '/tomalawsb/Hormon-Wzrostu-APK/releases/download/';
    if (!url.pathname.startsWith(prefix)) return false;
    const parts = url.pathname.slice(prefix.length).split('/');
    return parts.length === 2 && Boolean(parts[0]) && /^[^/]+\.apk$/i.test(parts[1]);
  } catch {
    return false;
  }
}

async function openExternal(url) {
  const value = String(url || '').trim();
  if (!isAllowedUpdateApkUrl(value)) return false;
  if (hasAndroidWebViewBridge()) {
    return Boolean(window.AndroidNative.openExternalUrl?.(value));
  }
  const opened = window.open(value, '_blank', 'noopener,noreferrer');
  return Boolean(opened);
}

async function exitApp() {
  if (hasAndroidWebViewBridge()) {
    window.AndroidNative.exitApp?.();
    return;
  }
  if (isNative()) await App.exitApp();
}

const bridge = {
  isNative: isNative(),
  platform: hasAndroidWebViewBridge() ? 'android' : Capacitor.getPlatform(),
  initialize,
  microphonePermission,
  requestMicrophonePermission,
  notificationPermission,
  requestNotificationPermission,
  exactAlarmPermission,
  requestExactAlarmPermission,
  notificationDiagnostics,
  openNotificationSettings,
  notificationEventsReady,
  syncDailyReminders,
  showNotification,
  secureStorageType,
  secureStorageRead,
  secureStorageWrite,
  secureStorageRemove,
  randomBase64,
  pinHash,
  encryptBackup,
  decryptBackup,
  biometricStatus,
  requestBiometricUnlock,
  saveJsonFile,
  openExternal,
  exitApp
};

window.NativeBridge = bridge;
initialize().catch((error) => console.warn('Nie udało się uruchomić mostu Android:', error));

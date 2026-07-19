
function getProfileTodayEntry(profile, date = localDateISO()) {
  return Array.isArray(profile?.entries)
    ? profile.entries.find((entry) => entry.date === date) || null
    : null;
}

function todayHasEntry(profile = getActiveProfile(), date = localDateISO()) {
  return Boolean(getProfileTodayEntry(profile, date));
}

function getProfileAmpouleReminderText(profile) {
  if (!profile || !Array.isArray(profile.ampoules)) return '';
  const ampoule = profile.ampoules.find(
    (item) => item.id === profile.activeAmpouleId && item.status !== 'finished'
  );
  if (!ampoule) return '';
  const fallbackDoseMl = decimalToNumber(ampoule.doseMl);
  const usedMl = (profile.entries || [])
    .filter((entry) => entry.status === 'given' && entry.ampouleId === ampoule.id)
    .reduce((sum, entry) => sum + getEntryAmpouleDoseMl(entry, fallbackDoseMl), 0);
  const remainingBefore = Math.max(0, decimalToNumber(ampoule.volumeMl) - usedMl);
  const plannedDoseMl =
    profile.settings.unit === 'ml'
      ? decimalToNumber(profile.settings.defaultDose)
      : decimalToNumber(profile.settings.ampouleDoseMl) || fallbackDoseMl;
  if (!plannedDoseMl) return '';
  const remainingAfter = Math.max(0, remainingBefore - plannedDoseMl);
  const maxOpenDays = Number(profile.settings.ampouleMaxOpenDays) || 0;
  const startDate = isValidIsoDate(ampoule.startDate) ? parseISODate(ampoule.startDate) : null;
  const today = parseISODate(localDateISO());
  const openDays = startDate
    ? Math.max(1, Math.floor((today.getTime() - startDate.getTime()) / 86400000) + 1)
    : 0;
  if (maxOpenDays && openDays > maxOpenDays) {
    return `Ampułka ${ampoule.number} jest otwarta ${openDays} dni i przekroczyła ustawiony limit ${maxOpenDays} dni.`;
  }
  if (remainingBefore + 0.000001 < plannedDoseMl) {
    return `W ampułce ${ampoule.number} zostało około ${formatMl(remainingBefore)} ml — za mało na pełną dawkę.`;
  }
  const dosesLeft = Math.floor((remainingAfter + 0.000001) / plannedDoseMl);
  return `Po dawce zostanie około ${formatMl(remainingAfter)} ml w ampułce ${ampoule.number}, czyli około ${dosesLeft} ${plural(dosesLeft, 'pełna dawka', 'pełne dawki', 'pełnych dawek')}.`;
}

function reminderBody(profile = getActiveProfile()) {
  const suggestion = getSuggestedPlaceForProfile(profile);
  const ampouleText = getProfileAmpouleReminderText(profile);
  const placeText =
    suggestion.side && suggestion.site
      ? `dzisiaj ${formatPlace(suggestion.side, suggestion.site)}`
      : 'brak aktywnego miejsca wkłucia — otwórz ustawienia kolejności';
  return `${profile.name}: ${placeText}. Dawka: ${formatDose(profile.settings.defaultDose)} ${profile.settings.unit}.${ampouleText ? ` ${ampouleText}` : ''}`;
}

function buildReminderState(profile, today = localDateISO()) {
  const suggestion = getSuggestedPlaceForProfile(profile);
  return {
    profileId: profile.id,
    profileName: profile.name,
    enabled: Boolean(profile.settings.reminderEnabled),
    time: profile.settings.reminderTime || '21:00',
    lastReminderDate: profile.meta.lastReminderDate || '',
    today,
    todayHasEntry: todayHasEntry(profile, today),
    body: reminderBody(profile),
    url: './#today',
    suggestion:
      suggestion.side && suggestion.site ? formatPlace(suggestion.side, suggestion.site) : '',
  };
}

function buildReminderStates() {
  const today = localDateISO();
  return getAvailableProfiles().map((profile) => buildReminderState(profile, today));
}

async function showReminderNotification({ test = false, profile = getActiveProfile() } = {}) {
  if (!profile) return false;
  if (isNativeAndroidApp()) {
    const permission = await window.NativeBridge.notificationPermission();
    if (permission !== 'granted') return false;
    return window.NativeBridge.showNotification({
      title: test ? `Test przypomnienia — ${profile.name}` : `Czas na zastrzyk — ${profile.name}`,
      body: reminderBody(profile),
      profileId: profile.id,
      test,
    });
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const lockKey = String(profile.id || '');
  if (!test && lockKey && reminderInFlightProfiles.has(lockKey)) return false;
  if (!test && lockKey) reminderInFlightProfiles.add(lockKey);
  try {
    let registration = serviceWorkerRegistration;
    if (!registration && 'serviceWorker' in navigator) {
      try {
        registration = await navigator.serviceWorker.ready;
      } catch {
        registration = null;
      }
    }
    const title = test
      ? `Test przypomnienia — ${profile.name}`
      : `Czas na zastrzyk — ${profile.name}`;
    const options = {
      body: reminderBody(profile),
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: test ? `gh-reminder-test-${profile.id}` : `gh-reminder-${profile.id}-${localDateISO()}`,
      renotify: false,
      requireInteraction: false,
      data: { url: './#today', profileId: profile.id },
    };
    if (registration?.showNotification) await registration.showNotification(title, options);
    else new Notification(title, options);
    if (!test) {
      profile.meta.lastReminderDate = localDateISO();
      persistData({ notifyError: false });
    }
    return true;
  } finally {
    if (!test && lockKey) reminderInFlightProfiles.delete(lockKey);
  }
}

async function testReminderNotification() {
  try {
    const currentPermission = isNativeAndroidApp()
      ? await window.NativeBridge.notificationPermission()
      : 'Notification' in window
        ? Notification.permission
        : 'unsupported';
    if (currentPermission !== 'granted') {
      const permission = await requestNotificationPermission();
      if (permission !== 'granted') return false;
    }
    const shown = await showReminderNotification({ test: true, profile: getActiveProfile() });
    if (!shown) {
      showToast(
        'System nie potwierdził wyświetlenia testu. Sprawdź diagnostykę przypomnień.',
        'error'
      );
      await refreshReminderDiagnostics();
      return false;
    }
    showToast(
      `Wysłano testowe powiadomienie dla profilu ${getActiveProfile().name}.`,
      'success'
    );
    await refreshReminderDiagnostics();
    return true;
  } catch (error) {
    console.warn('Nie udało się wysłać testowego powiadomienia:', error);
    showToast('Testowe powiadomienie nie zostało wysłane.', 'error');
    await refreshReminderDiagnostics();
    return false;
  }
}

function setReminderDiagnostic(node, text, state = 'neutral') {
  if (!node) return;
  node.textContent = text;
  node.dataset.state = state;
}

function formatReminderDiagnosticDate(value) {
  const timestamp = Number(value) || 0;
  if (!timestamp) return 'Brak zaplanowanego alarmu';
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return 'Nieznany termin';
  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

async function readReminderDiagnostics() {
  const profiles = getAvailableProfiles();
  const enabledProfiles = profiles.filter((profile) => profile.settings.reminderEnabled);
  if (isNativeAndroidApp() && typeof window.NativeBridge?.notificationDiagnostics === 'function') {
    const native = await window.NativeBridge.notificationDiagnostics();
    return {
      platform: 'android',
      notificationPermission: String(native?.notificationPermission || 'denied'),
      notificationsEnabled: Boolean(native?.notificationsEnabled),
      channelEnabled: native?.channelEnabled !== false,
      exactAlarmPermission: String(native?.exactAlarmPermission || 'denied'),
      configuredProfiles: Number(native?.configuredProfiles) || enabledProfiles.length,
      scheduledProfiles: Number(native?.scheduledProfiles) || 0,
      nextTriggerAt: Number(native?.nextTriggerAt) || 0,
      scheduleMode: String(native?.scheduleMode || 'none'),
      androidApi: Number(native?.androidApi) || 0,
    };
  }

  const permission = 'Notification' in window ? Notification.permission : 'unsupported';
  const nextTriggerAt = enabledProfiles.reduce((next, profile) => {
    const candidate = getNextReminderTarget(profile).getTime();
    return !next || candidate < next ? candidate : next;
  }, 0);
  return {
    platform: 'web',
    notificationPermission: permission,
    notificationsEnabled: permission === 'granted',
    channelEnabled: true,
    exactAlarmPermission: 'unsupported',
    configuredProfiles: enabledProfiles.length,
    scheduledProfiles: permission === 'granted' ? enabledProfiles.length : 0,
    nextTriggerAt: permission === 'granted' ? nextTriggerAt : 0,
    scheduleMode: enabledProfiles.length && permission === 'granted' ? 'browser' : 'none',
    androidApi: 0,
  };
}

let reminderDiagnosticsRevision = 0;

async function refreshReminderDiagnostics({ announce = false, resync = false } = {}) {
  if (!el['reminder-diagnostics-overall']) return null;
  const revision = ++reminderDiagnosticsRevision;
  setReminderDiagnostic(el['reminder-diagnostics-overall'], 'Sprawdzanie…', 'checking');
  try {
    if (resync) await syncReminderStateWithServiceWorker();
    const diagnostics = await readReminderDiagnostics();
    if (revision !== reminderDiagnosticsRevision) return diagnostics;
    const hasConfiguredReminder = diagnostics.configuredProfiles > 0;
    const permissionGranted = diagnostics.notificationPermission === 'granted';
    const channelReady = diagnostics.platform !== 'android' || diagnostics.channelEnabled;
    const hasScheduledReminder = diagnostics.scheduledProfiles > 0;
    const exactDenied =
      diagnostics.platform === 'android' && diagnostics.exactAlarmPermission === 'denied';
    const usesInexactAlarm =
      diagnostics.platform === 'android' && diagnostics.scheduleMode === 'inexact';

    setReminderDiagnostic(
      el['reminder-diagnostic-permission'],
      permissionGranted ? 'Zezwolono' : permissionText(diagnostics.notificationPermission),
      permissionGranted ? 'ready' : 'error'
    );
    setReminderDiagnostic(
      el['reminder-diagnostic-channel'],
      diagnostics.platform === 'android'
        ? channelReady
          ? 'Włączony'
          : 'Wyłączony w systemie'
        : 'Nie dotyczy PWA',
      channelReady ? 'ready' : 'error'
    );
    setReminderDiagnostic(
      el['reminder-diagnostic-exact-alarm'],
      diagnostics.platform !== 'android'
        ? 'Zależna od przeglądarki'
        : usesInexactAlarm || exactDenied
          ? hasScheduledReminder
            ? 'Przybliżona godzina'
            : 'Brak dostępu'
          : 'Dokładna godzina',
      usesInexactAlarm || exactDenied ? 'warning' : 'ready'
    );
    setReminderDiagnostic(
      el['reminder-diagnostic-next'],
      hasScheduledReminder
        ? formatReminderDiagnosticDate(diagnostics.nextTriggerAt)
        : hasConfiguredReminder
          ? 'Nie zaplanowano'
          : 'Przypomnienia wyłączone',
      hasScheduledReminder ? 'ready' : hasConfiguredReminder ? 'error' : 'neutral'
    );

    let overallState = 'ready';
    let overallText = 'Działa';
    let note = 'Powiadomienia są włączone, a następny alarm został zapisany.';
    if (!hasConfiguredReminder) {
      overallState = 'neutral';
      overallText = 'Wyłączone';
      note = 'Włącz przypomnienie dla profilu i zapisz godzinę.';
    } else if (!permissionGranted || !channelReady) {
      overallState = 'error';
      overallText = 'Nie działa';
      note = !permissionGranted
        ? 'System blokuje powiadomienia. Włącz je, aby przypomnienia mogły się pojawić.'
        : 'Kanał przypomnień jest wyłączony w ustawieniach Androida.';
    } else if (!hasScheduledReminder) {
      overallState = 'error';
      overallText = 'Nie zaplanowano';
      note = 'Ustawienia zapisano, ale system nie potwierdził żadnego przyszłego alarmu.';
    } else if (usesInexactAlarm) {
      overallState = 'warning';
      overallText = 'Możliwe opóźnienie';
      note =
        'Przypomnienie jest zaplanowane w trybie przybliżonym. Android może je opóźnić zależnie od oszczędzania baterii.';
    }
    setReminderDiagnostic(el['reminder-diagnostics-overall'], overallText, overallState);
    el['reminder-diagnostics-note'].textContent = note;
    el['reminder-diagnostics-checked'].textContent =
      `Ostatnie sprawdzenie: ${new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    el['open-notification-settings-button'].hidden = diagnostics.platform !== 'android';
    el['request-exact-alarm-button'].hidden =
      diagnostics.platform !== 'android' || diagnostics.exactAlarmPermission === 'granted';
    if (announce) showToast(note, overallState === 'error' ? 'error' : 'success');
    return diagnostics;
  } catch (error) {
    if (revision !== reminderDiagnosticsRevision) return null;
    console.warn('Nie udało się sprawdzić przypomnień:', error);
    setReminderDiagnostic(el['reminder-diagnostics-overall'], 'Błąd kontroli', 'error');
    el['reminder-diagnostics-note'].textContent =
      'Nie udało się odczytać stanu przypomnień. Spróbuj ponownie.';
    if (announce) showToast('Nie udało się sprawdzić przypomnień.', 'error');
    return null;
  }
}

async function openReminderNotificationSettings() {
  try {
    const opened = await window.NativeBridge?.openNotificationSettings?.();
    showToast(
      opened
        ? 'Po zmianie ustawień wróć do aplikacji — diagnostyka odświeży się automatycznie.'
        : 'Otwórz ustawienia powiadomień dla tej aplikacji w ustawieniach systemu.',
      opened ? 'success' : 'error'
    );
  } catch {
    showToast('Nie udało się otworzyć ustawień powiadomień.', 'error');
  }
}

async function requestReminderExactAlarmPermission() {
  if (!isNativeAndroidApp()) {
    showToast('Dokładne alarmy dotyczą aplikacji Android.', 'error');
    return;
  }
  try {
    const current = await window.NativeBridge.exactAlarmPermission();
    if (current === 'granted') {
      showToast('Dokładne alarmy są już włączone.', 'success');
      await refreshReminderDiagnostics({ resync: true });
      return;
    }
    await window.NativeBridge.requestExactAlarmPermission();
    showToast(
      'Włącz „Alarmy i przypomnienia”, a po powrocie aplikacja sprawdzi ustawienie ponownie.',
      'success'
    );
  } catch {
    showToast('Nie udało się otworzyć ustawień dokładnych alarmów.', 'error');
  }
}

async function checkReminderDue(profileId = '') {
  if (isNativeAndroidApp()) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const profiles = profileId
    ? getAvailableProfiles().filter((profile) => profile.id === profileId)
    : getAvailableProfiles();
  const today = localDateISO();
  const time = localTime();
  for (const profile of profiles) {
    if (!profile.settings.reminderEnabled) continue;
    if (todayHasEntry(profile, today) || profile.meta.lastReminderDate === today) continue;
    if (time >= (profile.settings.reminderTime || '21:00')) {
      await showReminderNotification({ profile });
    }
  }
}

function clearReminderTimers() {
  reminderTimers.forEach((timerId) => window.clearTimeout(timerId));
  reminderTimers.clear();
}

function getNextReminderTarget(profile, now = new Date()) {
  const [hour, minute] = (profile.settings.reminderTime || '21:00').split(':').map(Number);
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  const today = localDateISO(now);
  if (target <= now || todayHasEntry(profile, today) || profile.meta.lastReminderDate === today)
    target.setDate(target.getDate() + 1);
  return target;
}

function scheduleProfileReminder(profile, now = new Date()) {
  if (!profile?.id || !profile.settings.reminderEnabled) return;
  const previousTimer = reminderTimers.get(profile.id);
  if (previousTimer) window.clearTimeout(previousTimer);
  const target = getNextReminderTarget(profile, now);
  const delay = Math.max(1000, target.getTime() - now.getTime());
  const timerId = window.setTimeout(
    async () => {
      reminderTimers.delete(profile.id);
      await checkReminderDue(profile.id);
      const currentProfile = getAvailableProfiles().find((item) => item.id === profile.id);
      if (currentProfile?.settings.reminderEnabled) scheduleProfileReminder(currentProfile);
    },
    Math.min(delay, 2147483647)
  );
  reminderTimers.set(profile.id, timerId);
}

function scheduleDailyReminder() {
  clearReminderTimers();
  if (isNativeAndroidApp()) {
    window.NativeBridge.syncDailyReminders(buildReminderStates())
      .then(() => refreshReminderDiagnostics())
      .catch((error) => {
        console.warn('Nie udało się zaplanować natywnych przypomnień:', error);
        refreshReminderDiagnostics();
      });
    return;
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  getAvailableProfiles().forEach((profile) => scheduleProfileReminder(profile, now));
}

async function syncReminderStateWithServiceWorker() {
  if (isNativeAndroidApp()) {
    return window.NativeBridge.syncDailyReminders(buildReminderStates()).catch((error) => {
      console.warn('Nie udało się zsynchronizować przypomnień Android:', error);
      return { scheduled: 0, error: 'sync_failed' };
    });
  }
  if (!('serviceWorker' in navigator)) return { scheduled: 0 };
  try {
    const registration = serviceWorkerRegistration || (await navigator.serviceWorker.ready);
    registration.active?.postMessage({
      type: 'REMINDER_STATE',
      payload: { version: 2, profiles: buildReminderStates() },
    });
    return {
      scheduled: getAvailableProfiles().filter((profile) => profile.settings.reminderEnabled).length,
    };
  } catch (error) {
    console.warn('Nie udało się przekazać ustawień przypomnień:', error);
    return { scheduled: 0, error: 'sync_failed' };
  }
}

function mergeReminderStateFromServiceWorker(workerState) {
  const states = Array.isArray(workerState?.profiles)
    ? workerState.profiles
    : workerState?.profileId
      ? [workerState]
      : [];
  let changed = false;
  states.forEach((state) => {
    const profile = getProfileById(state.profileId);
    if (!profile || profile.archivedAt || !isValidIsoDate(state.lastReminderDate)) return;
    if (state.lastReminderDate > (profile.meta.lastReminderDate || '')) {
      profile.meta.lastReminderDate = state.lastReminderDate;
      changed = true;
    }
  });
  if (changed) persistData({ notifyError: false });
  return changed;
}

function applyProfileFromLaunchUrl() {
  try {
    const url = new URL(window.location.href);
    const profileId = sanitizeProfileId(url.searchParams.get('profile'));
    if (!profileId) return false;
    const profile = getProfileById(profileId);
    url.searchParams.delete('profile');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    if (!profile || profile.archivedAt || profile.id === data.activeProfileId) return false;
    const previousId = data.activeProfileId;
    data.activeProfileId = profile.id;
    if (!persistData({ notifyError: false })) {
      data.activeProfileId = previousId;
      return false;
    }
    todayDashboardMode = 'profile';
    return true;
  } catch {
    return false;
  }
}

async function registerPeriodicReminder() {
  if (isNativeAndroidApp()) return;
  if (
    !serviceWorkerRegistration?.periodicSync ||
    !('Notification' in window) ||
    Notification.permission !== 'granted'
  )
    return;
  const hasEnabledReminder = getAvailableProfiles().some(
    (profile) => profile.settings.reminderEnabled
  );
  try {
    if (hasEnabledReminder) {
      await serviceWorkerRegistration.periodicSync.register('daily-injection-reminder', {
        minInterval: 6 * 60 * 60 * 1000,
      });
    } else if (serviceWorkerRegistration.periodicSync.unregister) {
      await serviceWorkerRegistration.periodicSync.unregister('daily-injection-reminder');
    }
  } catch (error) {
    console.info('Okresowa praca w tle nie została przyznana:', error);
  }
}

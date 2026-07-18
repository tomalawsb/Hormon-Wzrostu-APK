  function isPermissionsOnboardingCompleted() {
    try {
      return localStorage.getItem(PERMISSIONS_ONBOARDING_STORAGE_KEY) === PERMISSIONS_ONBOARDING_REVISION;
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
    if (!options.silent) showToast('Pominięto konfigurację zgód. Możesz wrócić do niej w ustawieniach.', 'success');
  }

  async function requestMicrophonePermission() {
    let state = 'unsupported';
    try {
      if (isNativeAndroidApp() && typeof window.NativeBridge?.requestMicrophonePermission === 'function') {
        state = await window.NativeBridge.requestMicrophonePermission();
      } else {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        state = 'granted';
      }
      if (state !== 'granted') throw Object.assign(new Error('permission_denied'), { name: 'NotAllowedError' });
      showToast('Dostęp do mikrofonu został przyznany.', 'success');
    } catch (error) {
      console.warn('Błąd dostępu do mikrofonu:', error);
      const denied = ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(String(error?.name || ''));
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
    let state = 'unsupported';
    try {
      if (isNativeAndroidApp()) {
        state = await window.NativeBridge.requestNotificationPermission();
      } else {
        if (!('Notification' in window)) throw new Error('unsupported');
        state = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
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
      showToast(isNativeAndroidApp() ? 'Android nie udostępnił powiadomień.' : 'Ta przeglądarka nie obsługuje powiadomień.', 'error');
    }
    await updatePermissionStatuses({ notification: state });
    return state;
  }

  async function requestPersistentStorage() {
    let state = 'unsupported';
    try {
      if (isNativeAndroidApp()) {
        state = 'granted';
        showToast('Dane są przechowywane w pamięci aplikacji Android.', 'success');
        await updatePermissionStatuses({ storage: state });
        return state;
      }
      if (!navigator.storage?.persist) throw new Error('unsupported');
      state = await navigator.storage.persist() ? 'granted' : 'denied';
      showToast(state === 'granted' ? 'Włączono trwałe przechowywanie danych.' : 'Przeglądarka nie przyznała trwałego przechowywania.', state === 'granted' ? 'success' : 'error');
    } catch (error) {
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
      if (!navigator.permissions?.query) return navigator.mediaDevices?.getUserMedia ? 'prompt' : 'unsupported';
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
      return await navigator.storage.persisted() ? 'granted' : 'prompt';
    } catch {
      return 'unsupported';
    }
  }

  function permissionText(state) {
    return ({ granted: 'Zezwolono', denied: 'Zablokowano', prompt: 'Wymaga zgody', default: 'Wymaga zgody', unsupported: 'Brak obsługi' })[state] || 'Nie sprawdzono';
  }

  function setPermissionLabel(node, state) {
    if (!node) return;
    node.textContent = permissionText(state);
    node.dataset.state = state;
  }

  async function updatePermissionStatuses(overrides = {}) {
    const microphone = overrides.microphone || await readMicrophonePermission();
    const notification = overrides.notification || (isNativeAndroidApp()
      ? await window.NativeBridge.notificationPermission()
      : (('Notification' in window) ? Notification.permission : 'unsupported'));
    const storage = overrides.storage || await readStoragePermission();
    [el['permission-microphone-status'], el['microphone-permission-settings']].forEach((node) => setPermissionLabel(node, microphone));
    [el['permission-notification-status'], el['notification-permission-settings'], el['notification-permission-status']].forEach((node) => setPermissionLabel(node, notification));
    [el['permission-storage-status'], el['storage-permission-settings']].forEach((node) => setPermissionLabel(node, storage));
    if (el['request-notification-button']) el['request-notification-button'].disabled = notification === 'granted' || notification === 'unsupported';
    if (el['test-notification-button']) el['test-notification-button'].disabled = notification !== 'granted';
    if (el['permission-microphone-button']) el['permission-microphone-button'].disabled = microphone === 'granted' || microphone === 'unsupported';
    if (el['permission-notification-button']) el['permission-notification-button'].disabled = notification === 'granted' || notification === 'unsupported';
    if (el['permission-storage-button']) el['permission-storage-button'].disabled = storage === 'granted' || storage === 'unsupported';
  }

  function getProfileTodayEntry(profile, date = localDateISO()) {
    return Array.isArray(profile?.entries) ? profile.entries.find((entry) => entry.date === date) || null : null;
  }

  function todayHasEntry(profile = getActiveProfile(), date = localDateISO()) {
    return Boolean(getProfileTodayEntry(profile, date));
  }

  function getProfileAmpouleReminderText(profile) {
    if (!profile || !Array.isArray(profile.ampoules)) return '';
    const ampoule = profile.ampoules.find((item) => item.id === profile.activeAmpouleId && item.status !== 'finished');
    if (!ampoule) return '';
    const fallbackDoseMl = decimalToNumber(ampoule.doseMl);
    const usedMl = (profile.entries || [])
      .filter((entry) => entry.status === 'given' && entry.ampouleId === ampoule.id)
      .reduce((sum, entry) => sum + getEntryAmpouleDoseMl(entry, fallbackDoseMl), 0);
    const remainingBefore = Math.max(0, decimalToNumber(ampoule.volumeMl) - usedMl);
    const plannedDoseMl = profile.settings.unit === 'ml'
      ? decimalToNumber(profile.settings.defaultDose)
      : (decimalToNumber(profile.settings.ampouleDoseMl) || fallbackDoseMl);
    if (!plannedDoseMl) return '';
    const remainingAfter = Math.max(0, remainingBefore - plannedDoseMl);
    const maxOpenDays = Number(profile.settings.ampouleMaxOpenDays) || 0;
    const startDate = isValidIsoDate(ampoule.startDate) ? parseISODate(ampoule.startDate) : null;
    const today = parseISODate(localDateISO());
    const openDays = startDate ? Math.max(1, Math.floor((today.getTime() - startDate.getTime()) / 86400000) + 1) : 0;
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
    const placeText = suggestion.side && suggestion.site
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
      suggestion: suggestion.side && suggestion.site ? formatPlace(suggestion.side, suggestion.site) : ''
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
        test
      });
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    const lockKey = String(profile.id || '');
    if (!test && lockKey && reminderInFlightProfiles.has(lockKey)) return false;
    if (!test && lockKey) reminderInFlightProfiles.add(lockKey);
    try {
      let registration = serviceWorkerRegistration;
      if (!registration && 'serviceWorker' in navigator) {
        try { registration = await navigator.serviceWorker.ready; } catch { registration = null; }
      }
      const title = test ? `Test przypomnienia — ${profile.name}` : `Czas na zastrzyk — ${profile.name}`;
      const options = {
        body: reminderBody(profile),
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: test ? `gh-reminder-test-${profile.id}` : `gh-reminder-${profile.id}-${localDateISO()}`,
        renotify: false,
        requireInteraction: false,
        data: { url: './#today', profileId: profile.id }
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
    const currentPermission = isNativeAndroidApp()
      ? await window.NativeBridge.notificationPermission()
      : (('Notification' in window) ? Notification.permission : 'unsupported');
    if (currentPermission !== 'granted') {
      const permission = await requestNotificationPermission();
      if (permission !== 'granted') return;
    }
    await showReminderNotification({ test: true, profile: getActiveProfile() });
    showToast(`Wysłano testowe powiadomienie dla profilu ${getActiveProfile().name}.`, 'success');
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
    if (target <= now || todayHasEntry(profile, today) || profile.meta.lastReminderDate === today) target.setDate(target.getDate() + 1);
    return target;
  }

  function scheduleProfileReminder(profile, now = new Date()) {
    if (!profile?.id || !profile.settings.reminderEnabled) return;
    const previousTimer = reminderTimers.get(profile.id);
    if (previousTimer) window.clearTimeout(previousTimer);
    const target = getNextReminderTarget(profile, now);
    const delay = Math.max(1000, target.getTime() - now.getTime());
    const timerId = window.setTimeout(async () => {
      reminderTimers.delete(profile.id);
      await checkReminderDue(profile.id);
      const currentProfile = getAvailableProfiles().find((item) => item.id === profile.id);
      if (currentProfile?.settings.reminderEnabled) scheduleProfileReminder(currentProfile);
    }, Math.min(delay, 2147483647));
    reminderTimers.set(profile.id, timerId);
  }

  function scheduleDailyReminder() {
    clearReminderTimers();
    if (isNativeAndroidApp()) {
      window.NativeBridge.syncDailyReminders(buildReminderStates()).catch((error) => {
        console.warn('Nie udało się zaplanować natywnych przypomnień:', error);
      });
      return;
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const now = new Date();
    getAvailableProfiles().forEach((profile) => scheduleProfileReminder(profile, now));
  }

  async function syncReminderStateWithServiceWorker() {
    if (isNativeAndroidApp()) {
      await window.NativeBridge.syncDailyReminders(buildReminderStates()).catch((error) => {
        console.warn('Nie udało się zsynchronizować przypomnień Android:', error);
      });
      return;
    }
    if (!('serviceWorker' in navigator)) return;
    try {
      const registration = serviceWorkerRegistration || await navigator.serviceWorker.ready;
      registration.active?.postMessage({
        type: 'REMINDER_STATE',
        payload: { version: 2, profiles: buildReminderStates() }
      });
    } catch (error) {
      console.warn('Nie udało się przekazać ustawień przypomnień:', error);
    }
  }

  function mergeReminderStateFromServiceWorker(workerState) {
    const states = Array.isArray(workerState?.profiles)
      ? workerState.profiles
      : (workerState?.profileId ? [workerState] : []);
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
    if (!serviceWorkerRegistration?.periodicSync || !('Notification' in window) || Notification.permission !== 'granted') return;
    const hasEnabledReminder = getAvailableProfiles().some((profile) => profile.settings.reminderEnabled);
    try {
      if (hasEnabledReminder) {
        await serviceWorkerRegistration.periodicSync.register('daily-injection-reminder', { minInterval: 6 * 60 * 60 * 1000 });
      } else if (serviceWorkerRegistration.periodicSync.unregister) {
        await serviceWorkerRegistration.periodicSync.unregister('daily-injection-reminder');
      }
    } catch (error) {
      console.info('Okresowa praca w tle nie została przyznana:', error);
    }
  }

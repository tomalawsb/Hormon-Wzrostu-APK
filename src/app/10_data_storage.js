  function createDefaultData() {
    return {
      version: DATA_SCHEMA_VERSION,
      appSettings: {},
      appMeta: structuredCloneSafe(DEFAULT_APP_META),
      activeProfileId: DEFAULT_PROFILE_ID,
      profiles: [createDefaultProfile()]
    };
  }

  function createDefaultProfile(overrides = {}) {
    const createdAt = isValidDateTime(overrides.createdAt) ? overrides.createdAt : new Date().toISOString();
    return {
      id: sanitizeProfileId(overrides.id) || DEFAULT_PROFILE_ID,
      name: sanitizeProfileName(overrides.name) || DEFAULT_PROFILE_NAME,
      icon: sanitizeProfileIcon(overrides.icon),
      color: sanitizeProfileColor(overrides.color),
      archivedAt: isValidDateTime(overrides.archivedAt) ? overrides.archivedAt : '',
      createdAt,
      updatedAt: isValidDateTime(overrides.updatedAt) ? overrides.updatedAt : '',
      settings: sanitizeSettings(overrides.settings),
      meta: sanitizeProfileMeta(overrides.meta),
      injectionOrder: sanitizeInjectionOrder(overrides.injectionOrder),
      ampoules: Array.isArray(overrides.ampoules) ? overrides.ampoules : [],
      activeAmpouleId: typeof overrides.activeAmpouleId === 'string' ? overrides.activeAmpouleId : '',
      entries: Array.isArray(overrides.entries) ? overrides.entries : []
    };
  }

  function createDefaultInjectionOrder() {
    return ROTATION.map(([side, site], index) => ({
      id: `rotation-${index + 1}`,
      side,
      site,
      enabled: true
    }));
  }

  function loadData() {
    const primaryRaw = safeStorageGet(STORAGE_KEY);
    const backupRaw = safeStorageGet(BACKUP_STORAGE_KEY);

    for (const [raw, source] of [[primaryRaw, 'głównej pamięci'], [backupRaw, 'kopii zapasowej']]) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const result = normalizeStoredData(parsed);
        if (source === 'kopii zapasowej') {
          startupWarnings.push('Odzyskano dane z lokalnej kopii zapasowej, ponieważ główny zapis był niedostępny lub uszkodzony.');
        }
        if (result.removedDuplicates > 0) {
          safeStorageSet(BACKUP_STORAGE_KEY, raw);
          startupWarnings.push(`Wykryto ${result.removedDuplicates} zduplikowanych wpisów. Zachowano po jednym, najnowszym wpisie dla każdego dnia i profilu.`);
        }
        if (result.migratedFromLegacy || result.upgradedSchema) {
          safeStorageSet(BACKUP_STORAGE_KEY, raw);
          if (safeStorageSet(STORAGE_KEY, JSON.stringify(result.data))) {
            startupWarnings.push(result.migratedFromLegacy
              ? 'Dane zostały automatycznie dostosowane do obsługi profili. Dotychczasową historię przypisano do profilu „Dziecko 1”.'
              : 'Dane profili zostały automatycznie zaktualizowane do nowej wersji.');
          }
        }
        return result.data;
      } catch (error) {
        console.error(`Nie udało się odczytać danych z ${source}:`, error);
      }
    }

    if (primaryRaw || backupRaw) startupWarnings.push('Nie udało się odczytać zapisanej historii. Uruchomiono pusty dzienniczek.');
    return structuredCloneSafe(defaultData);
  }

  function normalizeStoredData(parsed) {
    const result = Array.isArray(parsed?.profiles)
      ? normalizeProfileBasedData(parsed)
      : migrateLegacyStoredData(parsed);
    result.data = attachActiveProfileAliases(result.data);
    return result;
  }

  function normalizeProfileBasedData(parsed) {
    const usedIds = new Set();
    let removedDuplicates = 0;
    const profiles = parsed.profiles.map((profile, index) => {
      const result = normalizeProfile(profile, index, usedIds);
      removedDuplicates += result.removedDuplicates;
      return result.profile;
    });

    if (!profiles.length) profiles.push(createDefaultProfile());
    let availableProfiles = profiles.filter((profile) => !profile.archivedAt);
    if (!availableProfiles.length) {
      profiles[0].archivedAt = '';
      availableProfiles = [profiles[0]];
    }
    const requestedActiveId = sanitizeProfileId(parsed.activeProfileId);
    const activeProfileId = availableProfiles.some((profile) => profile.id === requestedActiveId)
      ? requestedActiveId
      : availableProfiles[0].id;

    return {
      removedDuplicates,
      migratedFromLegacy: false,
      upgradedSchema: Number(parsed.version) !== DATA_SCHEMA_VERSION,
      data: {
        version: DATA_SCHEMA_VERSION,
        appSettings: sanitizeAppSettings(parsed.appSettings),
        appMeta: sanitizeAppMeta(parsed.appMeta || parsed.meta),
        activeProfileId,
        profiles
      }
    };
  }

  function migrateLegacyStoredData(parsed = {}) {
    const entriesInput = Array.isArray(parsed?.entries) ? parsed.entries : [];
    const sanitized = entriesInput.map(sanitizeEntry).filter(Boolean);
    const { entries, removedDuplicates } = keepOneEntryPerDate(sanitized);
    const settings = sanitizeSettings(parsed?.settings);
    const storedAmpoules = Array.isArray(parsed?.ampoules) ? parsed.ampoules.map(sanitizeAmpoule).filter(Boolean) : [];
    const migrated = storedAmpoules.length
      ? normalizeAmpouleCollection(storedAmpoules, entries, parsed?.activeAmpouleId)
      : migrateLegacyAmpoules(entries, settings);
    const legacyMeta = sanitizeMeta(parsed?.meta);
    const profile = createDefaultProfile({
      id: DEFAULT_PROFILE_ID,
      name: DEFAULT_PROFILE_NAME,
      settings,
      meta: { lastReminderDate: legacyMeta.lastReminderDate },
      ampoules: migrated.ampoules,
      activeAmpouleId: migrated.activeAmpouleId,
      entries: migrated.entries
    });

    return {
      removedDuplicates,
      migratedFromLegacy: true,
      upgradedSchema: true,
      data: {
        version: DATA_SCHEMA_VERSION,
        appSettings: {},
        appMeta: { onboardingCompleted: legacyMeta.onboardingCompleted },
        activeProfileId: profile.id,
        profiles: [profile]
      }
    };
  }

  function normalizeProfile(profileInput, index, usedIds) {
    const source = profileInput && typeof profileInput === 'object' ? profileInput : {};
    let id = sanitizeProfileId(source.id) || `profile-${index + 1}`;
    if (usedIds.has(id)) {
      const baseId = id;
      let suffix = 2;
      while (usedIds.has(`${baseId}-${suffix}`)) suffix += 1;
      id = `${baseId}-${suffix}`;
    }
    usedIds.add(id);

    const entriesInput = Array.isArray(source.entries) ? source.entries : [];
    const sanitizedEntries = entriesInput.map(sanitizeEntry).filter(Boolean);
    const { entries, removedDuplicates } = keepOneEntryPerDate(sanitizedEntries);
    const settings = sanitizeSettings(source.settings);
    const storedAmpoules = Array.isArray(source.ampoules) ? source.ampoules.map(sanitizeAmpoule).filter(Boolean) : [];
    const migrated = storedAmpoules.length
      ? normalizeAmpouleCollection(storedAmpoules, entries, source.activeAmpouleId)
      : migrateLegacyAmpoules(entries, settings);

    return {
      removedDuplicates,
      profile: {
        id,
        name: sanitizeProfileName(source.name) || `Dziecko ${index + 1}`,
        icon: sanitizeProfileIcon(source.icon),
        color: sanitizeProfileColor(source.color),
        archivedAt: isValidDateTime(source.archivedAt) ? source.archivedAt : '',
        createdAt: isValidDateTime(source.createdAt) ? source.createdAt : new Date().toISOString(),
        updatedAt: isValidDateTime(source.updatedAt) ? source.updatedAt : '',
        settings,
        meta: sanitizeProfileMeta(source.meta),
        injectionOrder: sanitizeInjectionOrder(source.injectionOrder),
        ampoules: migrated.ampoules,
        activeAmpouleId: migrated.activeAmpouleId,
        entries: migrated.entries
      }
    };
  }

  function attachActiveProfileAliases(container) {
    if (!container || typeof container !== 'object') container = structuredCloneSafe(defaultData);
    if (!Array.isArray(container.profiles) || !container.profiles.length) container.profiles = [createDefaultProfile()];
    let availableProfiles = container.profiles.filter((profile) => !profile.archivedAt);
    if (!availableProfiles.length) {
      container.profiles[0].archivedAt = '';
      availableProfiles = [container.profiles[0]];
    }
    if (!availableProfiles.some((profile) => profile.id === container.activeProfileId)) {
      container.activeProfileId = availableProfiles[0].id;
    }

    const metaFacade = {};
    Object.defineProperties(metaFacade, {
      onboardingCompleted: {
        enumerable: true,
        get: () => Boolean(container.appMeta?.onboardingCompleted),
        set: (value) => {
          if (!container.appMeta || typeof container.appMeta !== 'object') container.appMeta = {};
          container.appMeta.onboardingCompleted = Boolean(value);
        }
      },
      lastReminderDate: {
        enumerable: true,
        get: () => getActiveProfile(container).meta.lastReminderDate,
        set: (value) => { getActiveProfile(container).meta.lastReminderDate = isValidIsoDate(value) ? value : ''; }
      }
    });

    Object.defineProperties(container, {
      settings: {
        configurable: true,
        get: () => getActiveProfile(container).settings,
        set: (value) => { getActiveProfile(container).settings = sanitizeSettings(value); }
      },
      meta: {
        configurable: true,
        get: () => metaFacade,
        set: (value) => {
          const sanitized = sanitizeMeta(value);
          container.appMeta = { onboardingCompleted: sanitized.onboardingCompleted };
          getActiveProfile(container).meta = { lastReminderDate: sanitized.lastReminderDate };
        }
      },
      injectionOrder: {
        configurable: true,
        get: () => getActiveProfile(container).injectionOrder,
        set: (value) => { getActiveProfile(container).injectionOrder = sanitizeInjectionOrder(value); }
      },
      ampoules: {
        configurable: true,
        get: () => getActiveProfile(container).ampoules,
        set: (value) => { getActiveProfile(container).ampoules = Array.isArray(value) ? value : []; }
      },
      activeAmpouleId: {
        configurable: true,
        get: () => getActiveProfile(container).activeAmpouleId,
        set: (value) => { getActiveProfile(container).activeAmpouleId = typeof value === 'string' ? value : ''; }
      },
      entries: {
        configurable: true,
        get: () => getActiveProfile(container).entries,
        set: (value) => { getActiveProfile(container).entries = Array.isArray(value) ? value : []; }
      }
    });
    return container;
  }

  function getActiveProfile(container = data) {
    if (!Array.isArray(container.profiles) || !container.profiles.length) {
      container.profiles = [createDefaultProfile()];
      container.activeProfileId = container.profiles[0].id;
    }
    let profile = container.profiles.find((item) => item.id === container.activeProfileId && !item.archivedAt);
    if (!profile) {
      profile = container.profiles.find((item) => !item.archivedAt);
      if (!profile) {
        profile = container.profiles[0];
        profile.archivedAt = '';
      }
      container.activeProfileId = profile.id;
    }
    return profile;
  }

  function setActiveProfileId(profileId, { refresh = false } = {}) {
    const normalizedId = sanitizeProfileId(profileId);
    if (!normalizedId || !data.profiles.some((profile) => profile.id === normalizedId && !profile.archivedAt)) return false;

    const previousProfileId = data.activeProfileId;
    if (previousProfileId !== normalizedId) {
      data.activeProfileId = normalizedId;
      if (!persistData()) {
        data.activeProfileId = previousProfileId;
        return false;
      }
    }

    if (refresh) {
      resetQuickDraftForToday();
      renderAll();
      scheduleDailyReminder();
      syncReminderStateWithServiceWorker();
    }
    return true;
  }

  function sanitizeProfileId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : '';
  }

  function sanitizeProfileName(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
  }

  function sanitizeProfileIcon(value) {
    return ALLOWED_PROFILE_ICONS.has(value) ? value : DEFAULT_PROFILE_ICON;
  }

  function sanitizeProfileColor(value) {
    return ALLOWED_PROFILE_COLORS.has(value) ? value : DEFAULT_PROFILE_COLOR;
  }

  function getAvailableProfiles(container = data) {
    return Array.isArray(container.profiles) ? container.profiles.filter((profile) => !profile.archivedAt) : [];
  }

  function getArchivedProfiles(container = data) {
    return Array.isArray(container.profiles) ? container.profiles.filter((profile) => Boolean(profile.archivedAt)) : [];
  }

  function getProfileById(profileId, container = data) {
    const normalizedId = sanitizeProfileId(profileId);
    return normalizedId && Array.isArray(container.profiles)
      ? container.profiles.find((profile) => profile.id === normalizedId) || null
      : null;
  }

  function createUniqueProfileId(container = data) {
    const used = new Set((container.profiles || []).map((profile) => profile.id));
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const randomPart = globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const id = `profile-${randomPart}`;
      if (!used.has(id)) return id;
    }
    let suffix = 1;
    while (used.has(`profile-${suffix}`)) suffix += 1;
    return `profile-${suffix}`;
  }

  function isProfileNameTaken(name, ignoredProfileId = '') {
    const normalizedName = normalizeText(sanitizeProfileName(name));
    return data.profiles.some((profile) => profile.id !== ignoredProfileId && normalizeText(profile.name) === normalizedName);
  }

  function addProfileData({ name, icon, color } = {}) {
    const sanitizedName = sanitizeProfileName(name);
    if (!sanitizedName) return { ok: false, reason: 'name-required' };
    if (data.profiles.length >= MAX_PROFILES) return { ok: false, reason: 'limit' };
    if (isProfileNameTaken(sanitizedName)) return { ok: false, reason: 'duplicate-name' };

    const previousActiveId = data.activeProfileId;
    const profile = createDefaultProfile({
      id: createUniqueProfileId(),
      name: sanitizedName,
      icon: sanitizeProfileIcon(icon),
      color: sanitizeProfileColor(color)
    });
    data.profiles.push(profile);
    data.activeProfileId = profile.id;
    if (!persistData()) {
      data.profiles.pop();
      data.activeProfileId = previousActiveId;
      return { ok: false, reason: 'storage' };
    }
    return { ok: true, profile };
  }

  function updateProfileData(profileId, { name, icon, color } = {}) {
    const profile = getProfileById(profileId);
    const sanitizedName = sanitizeProfileName(name);
    if (!profile) return { ok: false, reason: 'not-found' };
    if (!sanitizedName) return { ok: false, reason: 'name-required' };
    if (isProfileNameTaken(sanitizedName, profile.id)) return { ok: false, reason: 'duplicate-name' };

    const previous = { name: profile.name, icon: profile.icon, color: profile.color, updatedAt: profile.updatedAt };
    profile.name = sanitizedName;
    profile.icon = sanitizeProfileIcon(icon);
    profile.color = sanitizeProfileColor(color);
    profile.updatedAt = new Date().toISOString();
    if (!persistData()) {
      Object.assign(profile, previous);
      return { ok: false, reason: 'storage' };
    }
    return { ok: true, profile };
  }

  function archiveProfileData(profileId) {
    const profile = getProfileById(profileId);
    if (!profile) return { ok: false, reason: 'not-found' };
    if (profile.archivedAt) return { ok: false, reason: 'already-archived' };
    const available = getAvailableProfiles();
    if (available.length <= 1) return { ok: false, reason: 'last-active' };

    const previousActiveId = data.activeProfileId;
    const previousArchivedAt = profile.archivedAt;
    const previousUpdatedAt = profile.updatedAt;
    profile.archivedAt = new Date().toISOString();
    profile.updatedAt = profile.archivedAt;
    if (data.activeProfileId === profile.id) {
      data.activeProfileId = available.find((item) => item.id !== profile.id).id;
    }
    if (!persistData()) {
      profile.archivedAt = previousArchivedAt;
      profile.updatedAt = previousUpdatedAt;
      data.activeProfileId = previousActiveId;
      return { ok: false, reason: 'storage' };
    }
    return { ok: true, profile };
  }

  function restoreProfileData(profileId) {
    const profile = getProfileById(profileId);
    if (!profile) return { ok: false, reason: 'not-found' };
    if (!profile.archivedAt) return { ok: false, reason: 'not-archived' };
    const previousArchivedAt = profile.archivedAt;
    const previousUpdatedAt = profile.updatedAt;
    profile.archivedAt = '';
    profile.updatedAt = new Date().toISOString();
    if (!persistData()) {
      profile.archivedAt = previousArchivedAt;
      profile.updatedAt = previousUpdatedAt;
      return { ok: false, reason: 'storage' };
    }
    return { ok: true, profile };
  }

  function deleteProfileData(profileId) {
    const profile = getProfileById(profileId);
    if (!profile) return { ok: false, reason: 'not-found' };
    if (data.profiles.length <= 1) return { ok: false, reason: 'last-profile' };
    const otherAvailable = getAvailableProfiles().filter((item) => item.id !== profile.id);
    if (data.activeProfileId === profile.id && !otherAvailable.length) {
      return { ok: false, reason: 'last-active' };
    }

    const previousProfiles = data.profiles;
    const previousActiveId = data.activeProfileId;
    data.profiles = data.profiles.filter((item) => item.id !== profile.id);
    if (data.activeProfileId === profile.id) data.activeProfileId = otherAvailable[0].id;
    if (!persistData()) {
      data.profiles = previousProfiles;
      data.activeProfileId = previousActiveId;
      return { ok: false, reason: 'storage' };
    }
    return { ok: true, profile };
  }

  function sanitizeInjectionOrder(order) {
    if (!Array.isArray(order)) return createDefaultInjectionOrder();
    const usedIds = new Set();
    const sanitized = [];
    order.slice(0, 100).forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      const side = ALLOWED_SIDES.has(item.side) ? item.side : '';
      const site = ALLOWED_SITES.has(item.site) ? item.site : '';
      if (!side || !site) return;
      let id = sanitizeProfileId(item.id) || `rotation-${index + 1}`;
      if (usedIds.has(id)) {
        const baseId = id;
        let suffix = 2;
        while (usedIds.has(`${baseId}-${suffix}`)) suffix += 1;
        id = `${baseId}-${suffix}`;
      }
      usedIds.add(id);
      sanitized.push({ id, side, site, enabled: item.enabled !== false });
    });
    if (!sanitized.length) return createDefaultInjectionOrder();
    return sanitized;
  }

  function sanitizeAppSettings(settings = {}) {
    return settings && typeof settings === 'object' && !Array.isArray(settings) ? {} : {};
  }

  function sanitizeAppMeta(meta = {}) {
    return { onboardingCompleted: Boolean(meta.onboardingCompleted) };
  }

  function sanitizeProfileMeta(meta = {}) {
    return { lastReminderDate: isValidIsoDate(meta.lastReminderDate) ? meta.lastReminderDate : '' };
  }

  function sanitizeSettings(settings = {}) {
    const dose = normalizeDose(settings.defaultDose) || DEFAULT_PROFILE_SETTINGS.defaultDose;
    return {
      defaultDose: dose,
      unit: ALLOWED_UNITS.has(settings.unit) ? settings.unit : DEFAULT_PROFILE_SETTINGS.unit,
      defaultTime: isValidTime(settings.defaultTime) ? settings.defaultTime : DEFAULT_PROFILE_SETTINGS.defaultTime,
      voiceFeedback: typeof settings.voiceFeedback === 'boolean' ? settings.voiceFeedback : DEFAULT_PROFILE_SETTINGS.voiceFeedback,
      voiceConfirm: typeof settings.voiceConfirm === 'boolean' ? settings.voiceConfirm : DEFAULT_PROFILE_SETTINGS.voiceConfirm,
      reminderEnabled: typeof settings.reminderEnabled === 'boolean' ? settings.reminderEnabled : DEFAULT_PROFILE_SETTINGS.reminderEnabled,
      reminderTime: isValidTime(settings.reminderTime) ? settings.reminderTime : DEFAULT_PROFILE_SETTINGS.reminderTime,
      ampouleStartDate: isValidIsoDate(settings.ampouleStartDate) ? settings.ampouleStartDate : DEFAULT_PROFILE_SETTINGS.ampouleStartDate,
      ampouleStartNumber: normalizeAmpouleNumber(settings.ampouleStartNumber),
      ampouleVolumeMl: normalizePositiveDecimal(settings.ampouleVolumeMl) || DEFAULT_PROFILE_SETTINGS.ampouleVolumeMl,
      ampouleDoseMl: normalizeOptionalPositiveDecimal(settings.ampouleDoseMl),
      ampouleMaxOpenDays: normalizeOptionalDayLimit(settings.ampouleMaxOpenDays)
    };
  }

  function sanitizeMeta(meta = {}) {
    return {
      onboardingCompleted: Boolean(meta.onboardingCompleted),
      lastReminderDate: isValidIsoDate(meta.lastReminderDate) ? meta.lastReminderDate : ''
    };
  }

  function sanitizeAmpoule(ampoule) {
    if (!ampoule || typeof ampoule !== 'object') return null;
    const id = typeof ampoule.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(ampoule.id) ? ampoule.id : '';
    const startDate = isValidIsoDate(ampoule.startDate) ? ampoule.startDate : '';
    const volumeMl = normalizePositiveDecimal(ampoule.volumeMl);
    const doseMl = normalizePositiveDecimal(ampoule.doseMl);
    if (!id || !startDate || !volumeMl || !doseMl) return null;
    return {
      id,
      number: normalizeAmpouleNumber(ampoule.number),
      startDate,
      volumeMl,
      doseMl,
      status: ALLOWED_AMPOULE_STATUSES.has(ampoule.status) ? ampoule.status : 'paused',
      createdAt: isValidDateTime(ampoule.createdAt) ? ampoule.createdAt : new Date(`${startDate}T00:00:00`).toISOString(),
      updatedAt: isValidDateTime(ampoule.updatedAt) ? ampoule.updatedAt : ''
    };
  }

  function normalizeAmpouleCollection(ampoules, entries, requestedActiveId = '') {
    const byId = new Map(ampoules.map((ampoule) => [ampoule.id, ampoule]));
    const normalizedEntries = entries.map((entry) => {
      const ampouleId = entry.ampouleId && byId.has(entry.ampouleId) ? entry.ampouleId : '';
      const ampoule = ampouleId ? byId.get(ampouleId) : null;
      const historicalDoseMl = entry.status === 'given' && ampoule
        ? normalizePositiveDecimal(entry.ampouleDoseMl)
          || (entry.unit === 'ml' ? normalizePositiveDecimal(entry.dose) : normalizePositiveDecimal(ampoule.doseMl))
        : '';
      return { ...entry, ampouleId, ampouleDoseMl: historicalDoseMl };
    });
    const remainingById = new Map(ampoules.map((ampoule) => {
      const fallbackDoseMl = decimalToNumber(ampoule.doseMl);
      const used = normalizedEntries
        .filter((entry) => entry.ampouleId === ampoule.id && entry.status === 'given')
        .reduce((sum, entry) => sum + getEntryAmpouleDoseMl(entry, fallbackDoseMl), 0);
      return [ampoule.id, Math.max(0, decimalToNumber(ampoule.volumeMl) - used)];
    }));
    let activeAmpouleId = typeof requestedActiveId === 'string'
      && byId.has(requestedActiveId)
      && (remainingById.get(requestedActiveId) || 0) > 0.000001
      ? requestedActiveId
      : '';
    if (!activeAmpouleId) {
      activeAmpouleId = ampoules.find((ampoule) => ampoule.status === 'active' && (remainingById.get(ampoule.id) || 0) > 0.000001)?.id || '';
    }
    const normalizedAmpoules = ampoules.map((ampoule) => {
      const remaining = remainingById.get(ampoule.id) || 0;
      return {
        ...ampoule,
        status: remaining <= 0.000001
          ? 'finished'
          : (ampoule.id === activeAmpouleId ? 'active' : 'paused')
      };
    });
    return { ampoules: normalizedAmpoules, activeAmpouleId, entries: normalizedEntries };
  }

  function migrateLegacyAmpoules(entries, settings) {
    const startDate = settings.ampouleStartDate || '';
    const volumeMl = decimalToNumber(settings.ampouleVolumeMl);
    const doseMl = settings.unit === 'ml' ? decimalToNumber(settings.defaultDose) : decimalToNumber(settings.ampouleDoseMl);
    if (!startDate || !volumeMl || !doseMl) return { ampoules: [], activeAmpouleId: '', entries };

    const ampoules = [];
    const migratedEntries = entries.map((entry) => ({ ...entry, ampouleId: entry.ampouleId || '' }));
    let number = normalizeAmpouleNumber(settings.ampouleStartNumber);
    let current = createAmpouleRecord({ number, startDate, volumeMl, doseMl, status: 'active' });
    ampoules.push(current);
    let remainingMl = volumeMl;

    migratedEntries
      .filter((entry) => entry.date >= startDate)
      .sort((a, b) => ampouleSortKey(a).localeCompare(ampouleSortKey(b)))
      .forEach((entry) => {
        if (entry.status === 'given' && remainingMl <= 0.000001) {
          current.status = 'finished';
          number += 1;
          current = createAmpouleRecord({ number, startDate: entry.date, volumeMl, doseMl, status: 'active' });
          ampoules.push(current);
          remainingMl = volumeMl;
        }
        entry.ampouleId = current.id;
        if (entry.status === 'given') {
          entry.ampouleDoseMl = normalizePositiveDecimal(entry.ampouleDoseMl)
            || (entry.unit === 'ml' ? normalizePositiveDecimal(entry.dose) : normalizePositiveDecimal(doseMl));
          remainingMl = Math.max(0, remainingMl - getEntryAmpouleDoseMl(entry, doseMl));
        }
      });

    if (remainingMl <= 0.000001) current.status = 'finished';
    const activeAmpouleId = current.status === 'active' ? current.id : '';
    return { ampoules, activeAmpouleId, entries: migratedEntries };
  }

  function sanitizeEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const id = typeof entry.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(entry.id) ? entry.id : '';
    const date = isValidIsoDate(entry.date) ? entry.date : '';
    const time = isValidTime(entry.time) ? entry.time : '';
    const status = ALLOWED_STATUSES.has(entry.status) ? entry.status : '';
    if (!id || !date || !time || !status) return null;

    const base = {
      id,
      date,
      time,
      status,
      note: typeof entry.note === 'string' ? entry.note.trim().slice(0, MAX_NOTE_LENGTH) : '',
      createdAt: isValidDateTime(entry.createdAt) ? entry.createdAt : new Date(`${date}T${time}:00`).toISOString(),
      updatedAt: isValidDateTime(entry.updatedAt) ? entry.updatedAt : '',
      ampouleId: typeof entry.ampouleId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(entry.ampouleId) ? entry.ampouleId : '',
      ampouleDoseMl: normalizeOptionalPositiveDecimal(entry.ampouleDoseMl)
    };

    if (status === 'skipped') {
      return { ...base, dose: '', unit: '', side: '', site: '', ampouleDoseMl: '' };
    }

    const dose = normalizeDose(entry.dose);
    const unit = ALLOWED_UNITS.has(entry.unit) ? entry.unit : '';
    const side = ALLOWED_SIDES.has(entry.side) ? entry.side : '';
    const site = ALLOWED_SITES.has(entry.site) ? entry.site : '';
    if (!dose || !unit || !side || !site) return null;
    return { ...base, dose, unit, side, site };
  }

  function keepOneEntryPerDate(entries) {
    const sorted = [...entries].sort((a, b) => entryFreshnessKey(b).localeCompare(entryFreshnessKey(a)));
    const seenDates = new Set();
    const unique = [];
    let removedDuplicates = 0;
    sorted.forEach((entry) => {
      if (seenDates.has(entry.date)) {
        removedDuplicates += 1;
        return;
      }
      seenDates.add(entry.date);
      unique.push(entry);
    });
    return { entries: unique, removedDuplicates };
  }

  function entryFreshnessKey(entry) {
    return entry.updatedAt || entry.createdAt || `${entry.date}T${entry.time}:00`;
  }

  function persistData({ notifyError = true } = {}) {
    try {
      const previous = localStorage.getItem(STORAGE_KEY);
      if (previous) localStorage.setItem(BACKUP_STORAGE_KEY, previous);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      window.queueMicrotask(() => {
        scheduleDailyReminder();
        syncReminderStateWithServiceWorker();
      });
      return true;
    } catch (error) {
      console.error('Nie udało się zapisać danych:', error);
      if (notifyError && el['toast-region']) showToast('Nie udało się zapisać danych w pamięci urządzenia. Wykonaj eksport kopii JSON.', 'error');
      else startupWarnings.push('Nie udało się zapisać danych w pamięci urządzenia.');
      return false;
    }
  }

  function safeStorageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function safeStorageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }

  function structuredCloneSafe(value) {
    return typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function isValidEntry(entry) {
    return Boolean(sanitizeEntry(entry));
  }

  function isValidIsoDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return Boolean(match && isValidDateParts(Number(match[1]), Number(match[2]), Number(match[3])));
  }

  function isValidTime(value) {
    const match = String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    return Boolean(match);
  }

  function isValidDateTime(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
  }

  function createDefaultDraft(overrides = {}) {
    const now = new Date();
    return {
      id: '',
      date: localDateISO(now),
      time: localTime(now),
      dose: data.settings.defaultDose,
      unit: data.settings.unit,
      side: '',
      site: '',
      status: 'given',
      note: '',
      ...overrides
    };
  }

  function createInitialQuickDraft() {
    const todayEntry = getEntryForDate(localDateISO());
    if (todayEntry) return { ...todayEntry };
    const suggestion = getSuggestedPlace(new Date());
    return createDefaultDraft({
      time: data.settings.defaultTime,
      side: suggestion.side || '',
      site: suggestion.site || ''
    });
  }

  function resetQuickDraftForToday() {
    quickDraft = createInitialQuickDraft();
    quickDraftTouched = false;
    lastRecognizedText = '';
  }

  function getEntryForDate(date, excludeId = '') {
    return data.entries.find((entry) => entry.date === date && entry.id !== excludeId) || null;
  }

  function flushStartupWarnings() {
    if (!startupWarnings.length) return;
    const message = startupWarnings.join(' ');
    startupWarnings.length = 0;
    showToast(message, 'error', 9000);
  }

  function handleAppResume() {
    if (applyProfileFromLaunchUrl()) {
      resetQuickDraftForToday();
      renderAll();
    }
    refreshDayState();
    checkReminderDue();
  }

  function refreshDayState() {
    updateCurrentDateHeader();
    const currentDate = localDateISO();
    if (currentDate === lastKnownLocalDate) return;

    const previousDate = lastKnownLocalDate;
    lastKnownLocalDate = currentDate;
    if (!quickDraftTouched && (!quickDraft.id || quickDraft.date === previousDate)) {
      resetQuickDraftForToday();
    } else if (quickDraft.date === previousDate) {
      showToast('Zmienił się dzień. Sprawdź datę przygotowanego wpisu przed zapisaniem.', 'error', 7000);
    }
    if (activeView === 'today') {
      selectedCalendarDate = currentDate;
      calendarCursor = startOfMonth(new Date());
    }
    renderAll();
    scheduleDailyReminder();
    syncReminderStateWithServiceWorker();
    scheduleMidnightRefresh();
  }

  function scheduleMidnightRefresh() {
    if (midnightTimer) window.clearTimeout(midnightTimer);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0);
    midnightTimer = window.setTimeout(() => refreshDayState(), Math.max(1000, next.getTime() - now.getTime()));
  }


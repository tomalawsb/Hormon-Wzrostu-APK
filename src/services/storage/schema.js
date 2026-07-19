function createDefaultData() {
  return {
    version: DATA_SCHEMA_VERSION,
    appSettings: {
      security: defaultSecuritySettings(),
      appearance: defaultAppearanceSettings(),
    },
    appMeta: structuredCloneSafe(DEFAULT_APP_META),
    activeProfileId: DEFAULT_PROFILE_ID,
    profiles: [createDefaultProfile()],
  };
}

function createDefaultProfile(overrides = {}) {
  const createdAt = isValidDateTime(overrides.createdAt)
    ? overrides.createdAt
    : new Date().toISOString();
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
    medical: sanitizeProfileMedical(overrides.medical),
    measurements: sanitizeProfileMeasurements(overrides.measurements),
    doseHistory: sanitizeProfileDoseHistory(overrides.doseHistory),
    injectionOrder: sanitizeInjectionOrder(overrides.injectionOrder),
    ampoules: Array.isArray(overrides.ampoules) ? overrides.ampoules : [],
    activeAmpouleId: typeof overrides.activeAmpouleId === 'string' ? overrides.activeAmpouleId : '',
    entries: Array.isArray(overrides.entries) ? overrides.entries : [],
  };
}

function createDefaultInjectionOrder() {
  return ROTATION.map(([side, site], index) => ({
    id: `rotation-${index + 1}`,
    side,
    site,
    enabled: true,
  }));
}

function loadData() {
  const primaryRaw = safeStorageGet(STORAGE_KEY);
  const backupRaw = safeStorageGet(BACKUP_STORAGE_KEY);

  for (const [raw, source] of [
    [primaryRaw, 'głównej pamięci'],
    [backupRaw, 'kopii zapasowej'],
  ]) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const result = normalizeStoredData(parsed);
      if (source === 'kopii zapasowej') {
        startupWarnings.push(
          'Odzyskano dane z lokalnej kopii zapasowej, ponieważ główny zapis był niedostępny lub uszkodzony.'
        );
      }
      if (result.removedDuplicates > 0) {
        safeStorageSet(BACKUP_STORAGE_KEY, raw);
        startupWarnings.push(
          `Wykryto ${result.removedDuplicates} zduplikowanych wpisów. Zachowano po jednym, najnowszym wpisie dla każdego dnia i profilu.`
        );
      }
      if (result.migratedFromLegacy || result.upgradedSchema) {
        safeStorageSet(BACKUP_STORAGE_KEY, raw);
        if (safeStorageSet(STORAGE_KEY, JSON.stringify(result.data))) {
          startupWarnings.push(
            result.migratedFromLegacy
              ? 'Dane zostały automatycznie dostosowane do obsługi profili. Dotychczasową historię przypisano do profilu „Dziecko 1”.'
              : 'Dane profili zostały automatycznie zaktualizowane do nowej wersji.'
          );
        }
      }
      return result.data;
    } catch (error) {
      console.error(`Nie udało się odczytać danych z ${source}:`, error);
    }
  }

  if (primaryRaw || backupRaw)
    startupWarnings.push(
      'Nie udało się odczytać zapisanej historii. Uruchomiono pusty dzienniczek.'
    );
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
      profiles,
    },
  };
}

function migrateLegacyStoredData(parsed = {}) {
  const entriesInput = Array.isArray(parsed?.entries) ? parsed.entries : [];
  const sanitized = entriesInput.map(sanitizeEntry).filter(Boolean);
  const { entries, removedDuplicates } = keepOneEntryPerDate(sanitized);
  const settings = sanitizeSettings(parsed?.settings);
  const storedAmpoules = Array.isArray(parsed?.ampoules)
    ? parsed.ampoules.map(sanitizeAmpoule).filter(Boolean)
    : [];
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
    entries: migrated.entries,
  });

  return {
    removedDuplicates,
    migratedFromLegacy: true,
    upgradedSchema: true,
    data: {
      version: DATA_SCHEMA_VERSION,
      appSettings: {
        security: defaultSecuritySettings(),
        appearance: defaultAppearanceSettings(),
      },
      appMeta: { onboardingCompleted: legacyMeta.onboardingCompleted },
      activeProfileId: profile.id,
      profiles: [profile],
    },
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
  const storedAmpoules = Array.isArray(source.ampoules)
    ? source.ampoules.map(sanitizeAmpoule).filter(Boolean)
    : [];
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
      medical: sanitizeProfileMedical(source.medical),
      measurements: sanitizeProfileMeasurements(source.measurements),
      doseHistory: sanitizeProfileDoseHistory(source.doseHistory),
      injectionOrder: sanitizeInjectionOrder(source.injectionOrder),
      ampoules: migrated.ampoules,
      activeAmpouleId: migrated.activeAmpouleId,
      entries: migrated.entries,
    },
  };
}

function attachActiveProfileAliases(container) {
  if (!container || typeof container !== 'object') container = structuredCloneSafe(defaultData);
  if (!Array.isArray(container.profiles) || !container.profiles.length)
    container.profiles = [createDefaultProfile()];
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
      },
    },
    lastReminderDate: {
      enumerable: true,
      get: () => getActiveProfile(container).meta.lastReminderDate,
      set: (value) => {
        getActiveProfile(container).meta.lastReminderDate = isValidIsoDate(value) ? value : '';
      },
    },
  });

  Object.defineProperties(container, {
    settings: {
      configurable: true,
      get: () => getActiveProfile(container).settings,
      set: (value) => {
        getActiveProfile(container).settings = sanitizeSettings(value);
      },
    },
    meta: {
      configurable: true,
      get: () => metaFacade,
      set: (value) => {
        const sanitized = sanitizeMeta(value);
        container.appMeta = { onboardingCompleted: sanitized.onboardingCompleted };
        getActiveProfile(container).meta = { lastReminderDate: sanitized.lastReminderDate };
      },
    },
    injectionOrder: {
      configurable: true,
      get: () => getActiveProfile(container).injectionOrder,
      set: (value) => {
        getActiveProfile(container).injectionOrder = sanitizeInjectionOrder(value);
      },
    },
    ampoules: {
      configurable: true,
      get: () => getActiveProfile(container).ampoules,
      set: (value) => {
        getActiveProfile(container).ampoules = Array.isArray(value) ? value : [];
      },
    },
    activeAmpouleId: {
      configurable: true,
      get: () => getActiveProfile(container).activeAmpouleId,
      set: (value) => {
        getActiveProfile(container).activeAmpouleId = typeof value === 'string' ? value : '';
      },
    },
    entries: {
      configurable: true,
      get: () => getActiveProfile(container).entries,
      set: (value) => {
        getActiveProfile(container).entries = Array.isArray(value) ? value : [];
      },
    },
  });
  return container;
}


function summarizeBackupData(value) {
  const profiles = Array.isArray(value?.profiles) ? value.profiles : [];
  const entries = profiles.flatMap((profile) =>
    Array.isArray(profile.entries) ? profile.entries : []
  );
  const ampoules = profiles.flatMap((profile) =>
    Array.isArray(profile.ampoules) ? profile.ampoules : []
  );
  const dates = entries
    .map((entry) => entry.date)
    .filter(isValidIsoDate)
    .sort();
  return {
    profileCount: profiles.length,
    entryCount: entries.length,
    ampouleCount: ampoules.length,
    firstEntryDate: dates[0] || '',
    lastEntryDate: dates.at(-1) || '',
  };
}

function inspectImportedData(imported) {
  if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
    throw new Error('Nieprawidłowa struktura pliku.');
  }
  const profiles = Array.isArray(imported.profiles)
    ? imported.profiles
    : Array.isArray(imported.entries)
      ? [{ name: DEFAULT_PROFILE_NAME, entries: imported.entries, ampoules: imported.ampoules }]
      : null;
  if (!profiles) throw new Error('Nieprawidłowa struktura pliku.');
  if (profiles.length === 0) throw new Error('Kopia nie zawiera żadnego profilu.');
  if (profiles.length > MAX_PROFILES)
    throw new Error(`Kopia zawiera więcej niż ${MAX_PROFILES} profili.`);

  const rawProfileIds = new Set();
  const profileNames = [];
  let entryCount = 0;
  let ampouleCount = 0;
  let archivedProfileCount = 0;
  const entryDates = [];

  profiles.forEach((profile, index) => {
    if (
      !profile ||
      typeof profile !== 'object' ||
      Array.isArray(profile) ||
      !Array.isArray(profile.entries)
    ) {
      throw new Error(`Profil ${index + 1} nie zawiera prawidłowej historii.`);
    }
    if (profile.entries.length > 50000)
      throw new Error(`Profil ${index + 1} zawiera zbyt wiele wpisów.`);
    const sanitizedEntries = profile.entries.map(sanitizeEntry).filter(Boolean);
    if (sanitizedEntries.length !== profile.entries.length) {
      throw new Error(`Profil ${index + 1} zawiera nieprawidłowe lub niekompletne wpisy.`);
    }
    const unique = keepOneEntryPerDate(sanitizedEntries);
    if (unique.removedDuplicates > 0) {
      throw new Error(
        `Profil ${index + 1} zawiera więcej niż jeden wpis dla tego samego dnia. Usuń duplikaty przed importem.`
      );
    }

    if (profile.id) {
      const profileId = sanitizeProfileId(profile.id);
      if (!profileId) throw new Error(`Profil ${index + 1} ma nieprawidłowy identyfikator.`);
      if (rawProfileIds.has(profileId))
        throw new Error('Kopia zawiera zduplikowane identyfikatory profili.');
      rawProfileIds.add(profileId);
    }

    const ampouleIds = new Set();
    if (profile.ampoules !== undefined) {
      if (!Array.isArray(profile.ampoules))
        throw new Error(`Profil ${index + 1} ma nieprawidłową listę ampułek.`);
      if (profile.ampoules.length > 10000)
        throw new Error(`Profil ${index + 1} zawiera zbyt wiele ampułek.`);
      profile.ampoules.forEach((ampoule) => {
        const sanitized = sanitizeAmpoule(ampoule);
        if (!sanitized) throw new Error(`Profil ${index + 1} zawiera nieprawidłową ampułkę.`);
        if (ampouleIds.has(sanitized.id))
          throw new Error(`Profil ${index + 1} zawiera zduplikowane identyfikatory ampułek.`);
        ampouleIds.add(sanitized.id);
      });
      ampouleCount += profile.ampoules.length;
    }

    profile.entries.forEach((entry, entryIndex) => {
      const referencedAmpouleId = entry?.ampouleId;
      if (
        referencedAmpouleId === undefined ||
        referencedAmpouleId === null ||
        referencedAmpouleId === ''
      )
        return;
      if (
        typeof referencedAmpouleId !== 'string' ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(referencedAmpouleId)
      ) {
        throw new Error(
          `Profil ${index + 1}, wpis ${entryIndex + 1} ma nieprawidłowe powiązanie z ampułką.`
        );
      }
      if (!ampouleIds.has(referencedAmpouleId)) {
        throw new Error(
          `Profil ${index + 1}, wpis ${entryIndex + 1} wskazuje nieistniejącą ampułkę „${referencedAmpouleId}”.`
        );
      }
    });

    const activeAmpouleId = profile.activeAmpouleId;
    if (activeAmpouleId !== undefined && activeAmpouleId !== null && activeAmpouleId !== '') {
      if (typeof activeAmpouleId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(activeAmpouleId)) {
        throw new Error(`Profil ${index + 1} ma nieprawidłowy identyfikator aktywnej ampułki.`);
      }
      if (!ampouleIds.has(activeAmpouleId)) {
        throw new Error(
          `Profil ${index + 1} wskazuje nieistniejącą aktywną ampułkę „${activeAmpouleId}”.`
        );
      }
    }

    if (profile.injectionOrder !== undefined) {
      if (!Array.isArray(profile.injectionOrder))
        throw new Error(`Profil ${index + 1} ma nieprawidłową kolejność miejsc wkłucia.`);
      if (profile.injectionOrder.length > 100)
        throw new Error(`Profil ${index + 1} ma zbyt długą kolejność miejsc wkłucia.`);
      const invalidOrderItem = profile.injectionOrder.some(
        (item) =>
          !item ||
          typeof item !== 'object' ||
          !ALLOWED_SIDES.has(item.side) ||
          !ALLOWED_SITES.has(item.site)
      );
      if (invalidOrderItem)
        throw new Error(`Profil ${index + 1} zawiera nieprawidłowe miejsce wkłucia.`);
    }

    if (
      profile.medical !== undefined &&
      (!profile.medical || typeof profile.medical !== 'object' || Array.isArray(profile.medical))
    ) {
      throw new Error(`Profil ${index + 1} ma nieprawidłowe informacje medyczne.`);
    }

    if (profile.measurements !== undefined) {
      if (!Array.isArray(profile.measurements))
        throw new Error(`Profil ${index + 1} ma nieprawidłową listę pomiarów.`);
      if (profile.measurements.length > MAX_PROFILE_MEASUREMENTS)
        throw new Error(`Profil ${index + 1} zawiera zbyt wiele pomiarów.`);
      const measurementIds = new Set();
      const measurementDates = new Set();
      profile.measurements.forEach((measurement) => {
        const sanitized = sanitizeProfileMeasurement(measurement);
        if (!sanitized) throw new Error(`Profil ${index + 1} zawiera nieprawidłowy pomiar.`);
        if (measurementIds.has(sanitized.id) || measurementDates.has(sanitized.date)) {
          throw new Error(`Profil ${index + 1} zawiera zduplikowane pomiary.`);
        }
        measurementIds.add(sanitized.id);
        measurementDates.add(sanitized.date);
      });
    }

    if (profile.doseHistory !== undefined) {
      if (!Array.isArray(profile.doseHistory))
        throw new Error(`Profil ${index + 1} ma nieprawidłową historię dawki.`);
      if (profile.doseHistory.length > MAX_PROFILE_DOSE_CHANGES)
        throw new Error(`Profil ${index + 1} zawiera zbyt wiele zmian dawki.`);
      const doseChangeIds = new Set();
      const doseChangeDates = new Set();
      profile.doseHistory.forEach((change) => {
        const sanitized = sanitizeProfileDoseChange(change);
        if (!sanitized)
          throw new Error(`Profil ${index + 1} zawiera nieprawidłową zmianę dawki.`);
        if (doseChangeIds.has(sanitized.id) || doseChangeDates.has(sanitized.date)) {
          throw new Error(`Profil ${index + 1} zawiera zduplikowane zmiany dawki.`);
        }
        doseChangeIds.add(sanitized.id);
        doseChangeDates.add(sanitized.date);
      });
    }

    entryCount += unique.entries.length;
    entryDates.push(...unique.entries.map((entry) => entry.date));
    if (profile.archivedAt) archivedProfileCount += 1;
    profileNames.push(sanitizeProfileName(profile.name) || `Dziecko ${index + 1}`);
  });

  entryDates.sort();
  return {
    profileCount: profiles.length,
    entryCount,
    ampouleCount,
    archivedProfileCount,
    profileNames,
    firstEntryDate: entryDates[0] || '',
    lastEntryDate: entryDates.at(-1) || '',
  };
}

function inspectBackupPayload(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Plik JSON nie zawiera obiektu danych.');
  const imported = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
  const declaredFormat = Number(parsed.backupFormatVersion || 0);
  const declaredSourceDataVersion = Number(parsed.sourceDataVersion || 0);
  const importedDataVersion = Number(imported.version || 0);
  const sourceDataVersion = declaredSourceDataVersion || importedDataVersion;
  if (Number.isFinite(declaredFormat) && declaredFormat > BACKUP_FORMAT_VERSION) {
    throw new Error(
      `Kopia używa nowszego formatu (${declaredFormat}). Zaktualizuj aplikację przed importem.`
    );
  }
  const newerDataVersion = [declaredSourceDataVersion, importedDataVersion].find(
    (version) => Number.isFinite(version) && version > DATA_SCHEMA_VERSION
  );
  if (newerDataVersion !== undefined) {
    throw new Error(
      `Kopia pochodzi z nowszego schematu danych (${newerDataVersion}). Zaktualizuj aplikację przed importem.`
    );
  }
  const summary = inspectImportedData(imported);
  const normalized = normalizeStoredData(imported);
  const declaredScope = parsed.scope === 'profile' ? 'profile' : 'all';
  const mode = declaredFormat >= 2 && declaredScope === 'profile' ? 'add-profile' : 'replace-all';
  if (mode === 'add-profile' && summary.profileCount !== 1) {
    throw new Error('Kopia pojedynczego profilu musi zawierać dokładnie jeden profil.');
  }
  return {
    parsed,
    imported,
    normalized,
    summary,
    mode,
    sourceDataVersion,
    backupFormatVersion: declaredFormat,
    exportedAt: isValidDateTime(parsed.exportedAt) ? parsed.exportedAt : '',
    legacy: !Array.isArray(imported.profiles) || declaredFormat < BACKUP_FORMAT_VERSION,
  };
}


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
  const source =
    settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  return {
    security: sanitizeSecuritySettings(source.security),
    appearance: sanitizeAppearanceSettings(source.appearance),
  };
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
    defaultTime: isValidTime(settings.defaultTime)
      ? settings.defaultTime
      : DEFAULT_PROFILE_SETTINGS.defaultTime,
    voiceFeedback:
      typeof settings.voiceFeedback === 'boolean'
        ? settings.voiceFeedback
        : DEFAULT_PROFILE_SETTINGS.voiceFeedback,
    voiceConfirm:
      typeof settings.voiceConfirm === 'boolean'
        ? settings.voiceConfirm
        : DEFAULT_PROFILE_SETTINGS.voiceConfirm,
    reminderEnabled:
      typeof settings.reminderEnabled === 'boolean'
        ? settings.reminderEnabled
        : DEFAULT_PROFILE_SETTINGS.reminderEnabled,
    reminderTime: isValidTime(settings.reminderTime)
      ? settings.reminderTime
      : DEFAULT_PROFILE_SETTINGS.reminderTime,
    ampouleStartDate: isValidIsoDate(settings.ampouleStartDate)
      ? settings.ampouleStartDate
      : DEFAULT_PROFILE_SETTINGS.ampouleStartDate,
    ampouleStartNumber: normalizeAmpouleNumber(settings.ampouleStartNumber),
    ampouleVolumeMl:
      normalizePositiveDecimal(settings.ampouleVolumeMl) ||
      DEFAULT_PROFILE_SETTINGS.ampouleVolumeMl,
    ampouleDoseMl: normalizeOptionalPositiveDecimal(settings.ampouleDoseMl),
    ampouleMaxOpenDays: normalizeOptionalDayLimit(settings.ampouleMaxOpenDays),
  };
}

function sanitizeMeta(meta = {}) {
  return {
    onboardingCompleted: Boolean(meta.onboardingCompleted),
    lastReminderDate: isValidIsoDate(meta.lastReminderDate) ? meta.lastReminderDate : '',
  };
}

function sanitizeAmpoule(ampoule) {
  if (!ampoule || typeof ampoule !== 'object') return null;
  const id =
    typeof ampoule.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(ampoule.id) ? ampoule.id : '';
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
    createdAt: isValidDateTime(ampoule.createdAt)
      ? ampoule.createdAt
      : new Date(`${startDate}T00:00:00`).toISOString(),
    updatedAt: isValidDateTime(ampoule.updatedAt) ? ampoule.updatedAt : '',
  };
}

function normalizeAmpouleCollection(ampoules, entries, requestedActiveId = '') {
  const byId = new Map(ampoules.map((ampoule) => [ampoule.id, ampoule]));
  const normalizedEntries = entries.map((entry) => {
    const ampouleId = entry.ampouleId && byId.has(entry.ampouleId) ? entry.ampouleId : '';
    const ampoule = ampouleId ? byId.get(ampouleId) : null;
    const historicalDoseMl =
      entry.status === 'given' && ampoule
        ? normalizePositiveDecimal(entry.ampouleDoseMl) ||
          (entry.unit === 'ml'
            ? normalizePositiveDecimal(entry.dose)
            : normalizePositiveDecimal(ampoule.doseMl))
        : '';
    return { ...entry, ampouleId, ampouleDoseMl: historicalDoseMl };
  });
  const remainingById = new Map(
    ampoules.map((ampoule) => {
      const fallbackDoseMl = decimalToNumber(ampoule.doseMl);
      const used = normalizedEntries
        .filter((entry) => entry.ampouleId === ampoule.id && entry.status === 'given')
        .reduce((sum, entry) => sum + getEntryAmpouleDoseMl(entry, fallbackDoseMl), 0);
      return [ampoule.id, Math.max(0, decimalToNumber(ampoule.volumeMl) - used)];
    })
  );
  let activeAmpouleId =
    typeof requestedActiveId === 'string' &&
    byId.has(requestedActiveId) &&
    (remainingById.get(requestedActiveId) || 0) > 0.000001
      ? requestedActiveId
      : '';
  if (!activeAmpouleId) {
    activeAmpouleId =
      ampoules.find(
        (ampoule) => ampoule.status === 'active' && (remainingById.get(ampoule.id) || 0) > 0.000001
      )?.id || '';
  }
  const normalizedAmpoules = ampoules.map((ampoule) => {
    const remaining = remainingById.get(ampoule.id) || 0;
    return {
      ...ampoule,
      status:
        remaining <= 0.000001 ? 'finished' : ampoule.id === activeAmpouleId ? 'active' : 'paused',
    };
  });
  return { ampoules: normalizedAmpoules, activeAmpouleId, entries: normalizedEntries };
}

function migrateLegacyAmpoules(entries, settings) {
  const startDate = settings.ampouleStartDate || '';
  const volumeMl = decimalToNumber(settings.ampouleVolumeMl);
  const doseMl =
    settings.unit === 'ml'
      ? decimalToNumber(settings.defaultDose)
      : decimalToNumber(settings.ampouleDoseMl);
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
        current = createAmpouleRecord({
          number,
          startDate: entry.date,
          volumeMl,
          doseMl,
          status: 'active',
        });
        ampoules.push(current);
        remainingMl = volumeMl;
      }
      entry.ampouleId = current.id;
      if (entry.status === 'given') {
        entry.ampouleDoseMl =
          normalizePositiveDecimal(entry.ampouleDoseMl) ||
          (entry.unit === 'ml'
            ? normalizePositiveDecimal(entry.dose)
            : normalizePositiveDecimal(doseMl));
        remainingMl = Math.max(0, remainingMl - getEntryAmpouleDoseMl(entry, doseMl));
      }
    });

  if (remainingMl <= 0.000001) current.status = 'finished';
  const activeAmpouleId = current.status === 'active' ? current.id : '';
  return { ampoules, activeAmpouleId, entries: migratedEntries };
}

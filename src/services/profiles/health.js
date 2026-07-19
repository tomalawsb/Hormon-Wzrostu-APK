function sanitizeProfileMedical(medical = {}) {
  const source =
    medical && typeof medical === 'object' && !Array.isArray(medical) ? medical : {};
  return {
    birthDate:
      isValidIsoDate(source.birthDate) && source.birthDate <= localDateISO()
        ? source.birthDate
        : '',
    doctorName: sanitizeProfileHealthText(source.doctorName, 120),
    clinicName: sanitizeProfileHealthText(source.clinicName, 160),
    medicationName: sanitizeProfileHealthText(source.medicationName, 160),
    diagnosis: sanitizeProfileHealthText(source.diagnosis, MAX_PROFILE_MEDICAL_TEXT_LENGTH),
    notes: sanitizeProfileHealthText(source.notes, MAX_PROFILE_MEDICAL_TEXT_LENGTH),
  };
}

function sanitizeProfileHealthText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeHealthDecimal(value, minimum, maximum) {
  const cleaned = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return '';
  const number = Number(cleaned);
  if (!Number.isFinite(number) || number < minimum || number > maximum) return '';
  return String(number).replace('.', ',');
}

function sanitizeProfileMeasurement(measurement) {
  if (!measurement || typeof measurement !== 'object' || Array.isArray(measurement)) return null;
  const id = sanitizeProfileHealthRecordId(measurement.id);
  const date =
    isValidIsoDate(measurement.date) && measurement.date <= localDateISO()
      ? measurement.date
      : '';
  const heightCm = normalizeHealthDecimal(measurement.heightCm, 30, 250);
  const weightKg = normalizeHealthDecimal(measurement.weightKg, 1, 300);
  if (!id || !date || (!heightCm && !weightKg)) return null;
  return {
    id,
    date,
    heightCm,
    weightKg,
    note: sanitizeProfileHealthText(measurement.note, MAX_NOTE_LENGTH),
    createdAt: isValidDateTime(measurement.createdAt)
      ? measurement.createdAt
      : new Date(`${date}T12:00:00`).toISOString(),
    updatedAt: isValidDateTime(measurement.updatedAt) ? measurement.updatedAt : '',
  };
}

function sanitizeProfileMeasurements(measurements) {
  if (!Array.isArray(measurements)) return [];
  const byDate = new Map();
  measurements.slice(0, MAX_PROFILE_MEASUREMENTS).forEach((measurement) => {
    const sanitized = sanitizeProfileMeasurement(measurement);
    if (!sanitized) return;
    const current = byDate.get(sanitized.date);
    if (!current || profileHealthFreshness(sanitized) > profileHealthFreshness(current)) {
      byDate.set(sanitized.date, sanitized);
    }
  });
  return [...byDate.values()].sort((left, right) => right.date.localeCompare(left.date));
}

function sanitizeProfileDoseChange(change) {
  if (!change || typeof change !== 'object' || Array.isArray(change)) return null;
  const id = sanitizeProfileHealthRecordId(change.id);
  const date =
    isValidIsoDate(change.date) && change.date <= localDateISO() ? change.date : '';
  const dose = normalizeDose(change.dose);
  const unit = ALLOWED_UNITS.has(change.unit) ? change.unit : '';
  if (!id || !date || !dose || !unit) return null;
  return {
    id,
    date,
    dose,
    unit,
    note: sanitizeProfileHealthText(change.note, MAX_NOTE_LENGTH),
    createdAt: isValidDateTime(change.createdAt)
      ? change.createdAt
      : new Date(`${date}T12:00:00`).toISOString(),
    updatedAt: isValidDateTime(change.updatedAt) ? change.updatedAt : '',
  };
}

function sanitizeProfileDoseHistory(history) {
  if (!Array.isArray(history)) return [];
  const byDate = new Map();
  history.slice(0, MAX_PROFILE_DOSE_CHANGES).forEach((change) => {
    const sanitized = sanitizeProfileDoseChange(change);
    if (!sanitized) return;
    const current = byDate.get(sanitized.date);
    if (!current || profileHealthFreshness(sanitized) > profileHealthFreshness(current)) {
      byDate.set(sanitized.date, sanitized);
    }
  });
  return [...byDate.values()].sort((left, right) => right.date.localeCompare(left.date));
}

function sanitizeProfileHealthRecordId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : '';
}

function profileHealthFreshness(record) {
  return record.updatedAt || record.createdAt || `${record.date}T00:00:00`;
}

function upsertProfileMeasurement(profile, measurement) {
  const existing = profile.measurements.find((item) => item.date === measurement.date) || null;
  const sanitized = sanitizeProfileMeasurement({
    ...measurement,
    id: existing?.id || measurement.id || createId(),
    createdAt: existing?.createdAt || measurement.createdAt || new Date().toISOString(),
    updatedAt: existing ? new Date().toISOString() : '',
  });
  if (!sanitized) return null;
  profile.measurements = sanitizeProfileMeasurements([
    sanitized,
    ...profile.measurements.filter((item) => item.date !== sanitized.date),
  ]);
  return sanitized;
}

function upsertProfileDoseChange(profile, change) {
  const existing = profile.doseHistory.find((item) => item.date === change.date) || null;
  const sanitized = sanitizeProfileDoseChange({
    ...change,
    id: existing?.id || change.id || createId(),
    createdAt: existing?.createdAt || change.createdAt || new Date().toISOString(),
    updatedAt: existing ? new Date().toISOString() : '',
  });
  if (!sanitized) return null;
  profile.doseHistory = sanitizeProfileDoseHistory([
    sanitized,
    ...profile.doseHistory.filter((item) => item.date !== sanitized.date),
  ]);
  return sanitized;
}

function getLatestProfileMeasurements(profile) {
  const measurements = sanitizeProfileMeasurements(profile?.measurements);
  return {
    height: measurements.find((measurement) => Boolean(measurement.heightCm)) || null,
    weight: measurements.find((measurement) => Boolean(measurement.weightKg)) || null,
  };
}

function buildProfileRegularityStats(profile, requestedDays = 30, endDate = localDateISO()) {
  const days = Math.min(90, Math.max(7, Number.parseInt(requestedDays, 10) || 30));
  const validEnd = isValidIsoDate(endDate) ? endDate : localDateISO();
  const end = parseISODate(validEnd);
  const rollingStart = new Date(end);
  rollingStart.setDate(rollingStart.getDate() - days + 1);
  let startIso = localDateISO(rollingStart);
  const entryDates = (profile?.entries || []).map((entry) => entry.date).filter(isValidIsoDate).sort();
  const profileStart = entryDates[0] || String(profile?.createdAt || '').slice(0, 10);
  if (isValidIsoDate(profileStart) && profileStart > startIso && profileStart <= validEnd) {
    startIso = profileStart;
  }

  const byDate = new Map((profile?.entries || []).map((entry) => [entry.date, entry]));
  const timeline = [];
  const cursor = parseISODate(startIso);
  while (localDateISO(cursor) <= validEnd && timeline.length < days) {
    const date = localDateISO(cursor);
    const entry = byDate.get(date);
    timeline.push({ date, status: entry?.status || 'missing' });
    cursor.setDate(cursor.getDate() + 1);
  }
  if (!timeline.length) timeline.push({ date: validEnd, status: 'missing' });
  const given = timeline.filter((day) => day.status === 'given').length;
  const skipped = timeline.filter((day) => day.status === 'skipped').length;
  const missing = timeline.length - given - skipped;
  return {
    days: timeline,
    totalDays: timeline.length,
    given,
    skipped,
    missing,
    regularityPercent: Math.round((given / timeline.length) * 100),
    documentedPercent: Math.round(((given + skipped) / timeline.length) * 100),
    from: timeline[0].date,
    to: timeline.at(-1).date,
  };
}

function buildProfileAmpouleUsageStats(profile) {
  const ampoules = Array.isArray(profile?.ampoules) ? profile.ampoules : [];
  const entries = Array.isArray(profile?.entries) ? profile.entries : [];
  const hasActiveAmpoule = ampoules.some(
    (ampoule) => ampoule.id === profile?.activeAmpouleId && ampoule.status !== 'finished'
  );
  const usedByAmpoule = new Map();
  let registeredUsedMl = 0;
  let measuredDoses = 0;
  entries.forEach((entry) => {
    if (entry.status !== 'given') return;
    const doseMl = decimalToNumber(entry.ampouleDoseMl);
    if (!doseMl) return;
    registeredUsedMl += doseMl;
    measuredDoses += 1;
    if (entry.ampouleId) {
      usedByAmpoule.set(entry.ampouleId, (usedByAmpoule.get(entry.ampouleId) || 0) + doseMl);
    }
  });
  let remainingMl = 0;
  let activeRemainingMl = 0;
  ampoules.forEach((ampoule) => {
    const remaining = Math.max(
      0,
      decimalToNumber(ampoule.volumeMl) - (usedByAmpoule.get(ampoule.id) || 0)
    );
    remainingMl += remaining;
    if (ampoule.id === profile.activeAmpouleId) activeRemainingMl = remaining;
  });
  return {
    opened: ampoules.length,
    finished: ampoules.filter((ampoule) => ampoule.status === 'finished').length,
    registeredUsedMl,
    remainingMl,
    activeRemainingMl,
    hasActiveAmpoule,
    measuredDoses,
  };
}

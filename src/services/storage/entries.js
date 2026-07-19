
function sanitizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const id =
    typeof entry.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(entry.id) ? entry.id : '';
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
    correctedAt: isValidDateTime(entry.correctedAt) ? entry.correctedAt : '',
    createdAt: isValidDateTime(entry.createdAt)
      ? entry.createdAt
      : new Date(`${date}T${time}:00`).toISOString(),
    updatedAt: isValidDateTime(entry.updatedAt) ? entry.updatedAt : '',
    ampouleId:
      typeof entry.ampouleId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(entry.ampouleId)
        ? entry.ampouleId
        : '',
    ampouleDoseMl: normalizeOptionalPositiveDecimal(entry.ampouleDoseMl),
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
  const sorted = [...entries].sort((a, b) =>
    entryFreshnessKey(b).localeCompare(entryFreshnessKey(a))
  );
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
    const previous = secureStorageGet(STORAGE_KEY);
    if (previous && !secureStorageSet(BACKUP_STORAGE_KEY, previous)) {
      throw new Error('Nie udało się zapisać szyfrowanej kopii poprzednich danych.');
    }
    if (!secureStorageSet(STORAGE_KEY, JSON.stringify(data))) {
      throw new Error('Nie udało się zapisać zaszyfrowanych danych.');
    }
    window.queueMicrotask(() => {
      scheduleDailyReminder();
      syncReminderStateWithServiceWorker();
    });
    return true;
  } catch (error) {
    console.error('Nie udało się zapisać danych:', error);
    if (notifyError && el['toast-region'])
      showToast(
        'Nie udało się zapisać danych w pamięci urządzenia. Wykonaj eksport kopii JSON.',
        'error'
      );
    else startupWarnings.push('Nie udało się zapisać danych w pamięci urządzenia.');
    return false;
  }
}

function safeStorageGet(key) {
  return secureStorageGet(key);
}

function safeStorageSet(key, value) {
  return secureStorageSet(key, value);
}

function structuredCloneSafe(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
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
    ...overrides,
  };
}

function createInitialQuickDraft() {
  const todayEntry = getEntryForDate(localDateISO());
  if (todayEntry) return { ...todayEntry };
  const suggestion = getSuggestedPlace(new Date());
  return createDefaultDraft({
    time: data.settings.defaultTime,
    side: suggestion.side || '',
    site: suggestion.site || '',
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
  if (appLocked) return;
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
    showToast(
      'Zmienił się dzień. Sprawdź datę przygotowanego wpisu przed zapisaniem.',
      'error',
      7000
    );
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
  midnightTimer = window.setTimeout(
    () => refreshDayState(),
    Math.max(1000, next.getTime() - now.getTime())
  );
}

function createAmpouleRecord({ number, startDate, volumeMl, doseMl, status = 'paused' }) {
  return {
    id: `ampoule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    number: normalizeAmpouleNumber(number),
    startDate: isValidIsoDate(startDate) ? startDate : localDateISO(),
    volumeMl: normalizePositiveDecimal(volumeMl) || DEFAULT_AMPOULE_VOLUME_ML,
    doseMl: normalizePositiveDecimal(doseMl) || '1',
    status: ALLOWED_AMPOULE_STATUSES.has(status) ? status : 'paused',
    createdAt: new Date().toISOString(),
    updatedAt: '',
  };
}

function getAmpouleById(id) {
  return data.ampoules.find((ampoule) => ampoule.id === id) || null;
}

function getActiveAmpoule() {
  const ampoule = getAmpouleById(data.activeAmpouleId);
  return ampoule && ampoule.status !== 'finished' ? ampoule : null;
}

function getEntriesForAmpoule(ampouleId) {
  return getEntriesAscending().filter((entry) => entry.ampouleId === ampouleId);
}

function getAmpouleRemainingMl(ampouleId) {
  const ampoule = getAmpouleById(ampouleId);
  if (!ampoule) return 0;
  const doseMl = decimalToNumber(ampoule.doseMl);
  const used = getEntriesForAmpoule(ampouleId)
    .filter((entry) => entry.status === 'given')
    .reduce((sum, entry) => sum + getEntryAmpouleDoseMl(entry, doseMl), 0);
  return Math.max(0, decimalToNumber(ampoule.volumeMl) - used);
}

function getAmpouleOpenDays(ampoule) {
  if (!ampoule?.startDate || !isValidIsoDate(ampoule.startDate)) return 0;
  const start = parseISODate(ampoule.startDate);
  const today = parseISODate(localDateISO());
  return Math.max(1, Math.floor((today.getTime() - start.getTime()) / 86400000) + 1);
}

function isAmpouleOpenTooLong(ampoule) {
  const limit = Number(data.settings.ampouleMaxOpenDays) || 0;
  return Boolean(limit && getAmpouleOpenDays(ampoule) > limit);
}

function getOpenPausedAmpoules() {
  return data.ampoules.filter(
    (ampoule) => ampoule.id !== data.activeAmpouleId && getAmpouleRemainingMl(ampoule.id) > 0.000001
  );
}

function nextAmpouleNumber(incrementExisting = true) {
  if (!data.ampoules.length) return normalizeAmpouleNumber(data.settings.ampouleStartNumber);
  const highest = Math.max(
    ...data.ampoules.map((ampoule) => normalizeAmpouleNumber(ampoule.number))
  );
  return incrementExisting ? highest + 1 : highest;
}

function reconcileAmpouleStatuses() {
  data.ampoules.forEach((ampoule) => {
    if (getAmpouleRemainingMl(ampoule.id) <= 0.000001) {
      ampoule.status = 'finished';
      if (data.activeAmpouleId === ampoule.id) data.activeAmpouleId = '';
    } else if (data.activeAmpouleId === ampoule.id) {
      ampoule.status = 'active';
    } else if (ampoule.status === 'active' || ampoule.status === 'finished') {
      ampoule.status = 'paused';
    }
  });
}

function ensureActiveAmpouleForDate(date) {
  const active = getActiveAmpoule();
  if (active) return active.id;
  if (getOpenPausedAmpoules().length) return null;
  const volumeMl = decimalToNumber(data.settings.ampouleVolumeMl);
  const doseMl = getConfiguredAmpouleDoseMl();
  if (!volumeMl || !doseMl) return '';
  const ampoule = createAmpouleRecord({
    number: data.ampoules.length ? nextAmpouleNumber(true) : data.settings.ampouleStartNumber,
    startDate: data.ampoules.length ? date : data.settings.ampouleStartDate || date,
    volumeMl,
    doseMl,
    status: 'active',
  });
  data.ampoules.push(ampoule);
  data.activeAmpouleId = ampoule.id;
  return ampoule.id;
}

function getAmpouleInfo(plannedToday = null) {
  const today = localDateISO();
  const todayEntry = getEntryForDate(today);
  const timeline = buildAmpouleTimeline({
    includePlannedToday: !todayEntry,
    plannedToday,
  });

  const todayAmpoule = todayEntry?.ampouleId ? getAmpouleById(todayEntry.ampouleId) : null;
  const displayAmpoule =
    todayEntry?.status === 'given' && todayAmpoule
      ? todayAmpoule
      : timeline.activeAmpoule || todayAmpoule;
  if (!displayAmpoule) {
    return {
      configured: false,
      reason: timeline.reason,
      volumeMl: timeline.volumeMl || decimalToNumber(data.settings.ampouleVolumeMl),
      doseMl: timeline.doseMl || getConfiguredAmpouleDoseMl(),
      startDate: timeline.startDate || data.settings.ampouleStartDate,
      pausedCount: getOpenPausedAmpoules().length,
    };
  }

  const active = displayAmpoule;
  const activeRows = timeline.rows.filter((row) => row.ampouleId === active.id);
  const todayRow = [...activeRows].reverse().find((row) => row.entry.date === today);
  const latestRow = activeRows[activeRows.length - 1] || null;
  const currentRemaining = getAmpouleRemainingMl(active.id);
  const remainingBeforeToday = todayRow ? todayRow.remainingBefore : currentRemaining;
  const remainingAfterToday = todayRow ? todayRow.remainingAfter : currentRemaining;
  const todayDoseMl = todayRow ? todayRow.doseMl : 0;
  const approximateDosesLeftAfterToday = Math.floor(
    (remainingAfterToday + 0.000001) / decimalToNumber(active.doseMl)
  );

  return {
    configured: true,
    reason: timeline.configured ? '' : timeline.reason,
    startDate: active.startDate,
    volumeMl: decimalToNumber(active.volumeMl),
    doseMl: decimalToNumber(active.doseMl),
    usedBeforeToday: Math.max(0, decimalToNumber(active.volumeMl) - remainingBeforeToday),
    currentRemaining,
    remainingBeforeToday,
    remainingAfterToday,
    ampouleNumber: active.number,
    ampouleStartDate: active.startDate,
    nextAmpouleStartDate: todayRow?.nextAmpouleStartDate || '',
    todayIsLast: Boolean(todayRow?.isLastDose),
    todayStartsNewAmpoule: Boolean(todayRow?.startsNewAmpoule),
    todayEntryStatus: todayEntry?.status || '',
    todayDoseMl,
    todayDoseNumber: todayRow?.doseNumber || 0,
    approximateDosesLeftAfterToday,
    pausedCount: getOpenPausedAmpoules().length,
    openDays: getAmpouleOpenDays(active),
    maxOpenDays: Number(data.settings.ampouleMaxOpenDays) || 0,
    latestRow,
  };
}

function ampouleSummary(info) {
  if (!info.configured && info.reason === 'paused') {
    return {
      level: 'warning',
      short: 'Wybierz odłożoną ampułkę',
      title: 'Brak aktywnej ampułki',
      text: `Masz ${info.pausedCount} ${plural(info.pausedCount, 'odłożoną ampułkę', 'odłożone ampułki', 'odłożonych ampułek')}. W ustawieniach wybierz „Wznów” albo rozpocznij nową.`,
    };
  }
  if (!info.configured && info.reason === 'finished') {
    return {
      level: 'warning',
      short: 'Rozpocznij nową ampułkę',
      title: 'Poprzednia ampułka została zużyta',
      text: 'Przy następnym zapisanym podaniu aplikacja może rozpocząć kolejną ampułkę albo możesz zrobić to ręcznie w ustawieniach.',
    };
  }
  if (!info.configured && info.reason === 'start') {
    return {
      level: 'warning',
      short: 'Brak daty rozpoczęcia',
      title: 'Ampułka: ustaw datę rozpoczęcia',
      text: 'Ustaw datę rozpoczęcia obecnej ampułki i jej numer. Potem aplikacja pokaże stan ampułki po zapisanych podaniach.',
    };
  }
  if (!info.configured && info.reason === 'dose') {
    return {
      level: 'warning',
      short: 'Brak dawki w ml',
      title: 'Ampułka: brak dawki w ml',
      text: 'Aby liczyć zużycie ampułki, ustaw zużycie na jedno podanie w ml albo wybierz jednostkę ml.',
    };
  }
  if (info.maxOpenDays && info.openDays > info.maxOpenDays) {
    return {
      level: 'danger',
      short: `Ampułka ${info.ampouleNumber}: przekroczony limit otwarcia`,
      title: `Ampułka ${info.ampouleNumber}: sprawdź czas od otwarcia`,
      text: `Ampułka jest otwarta ${info.openDays} ${plural(info.openDays, 'dzień', 'dni', 'dni')}, a ustawiony limit wynosi ${info.maxOpenDays} dni. Aplikacja nie ocenia przydatności leku — sprawdź zalecenia producenta lub lekarza.`,
    };
  }
  if (info.todayIsLast) {
    const prefix = info.todayEntryStatus === 'given' ? 'Dzisiejszy wpis był' : 'Dzisiaj jest';
    const pausedText = info.pausedCount ? ' Po jej zużyciu możesz wznowić odłożoną ampułkę.' : '';
    return {
      level: 'danger',
      short: `Ampułka ${info.ampouleNumber}: ostatni zastrzyk`,
      title: `Ampułka ${info.ampouleNumber}: ostatni zastrzyk`,
      text: `${prefix} ostatnim zastrzykiem z ampułki ${info.ampouleNumber}.${pausedText}`,
    };
  }
  if (info.todayStartsNewAmpoule) {
    return {
      level: 'ok',
      short: `Ampułka ${info.ampouleNumber}: rozpoczęta dzisiaj`,
      title: `Ampułka ${info.ampouleNumber}: nowa ampułka`,
      text: `Ta ampułka zaczyna się dzisiaj. Po dzisiejszej dawce zostanie około ${formatMl(info.remainingAfterToday)} ml.`,
    };
  }
  const pausedText = info.pausedCount ? ` Odłożonych ampułek: ${info.pausedCount}.` : '';
  return {
    level: 'ok',
    short: `Ampułka ${info.ampouleNumber}: zostanie ${formatMl(info.remainingAfterToday)} ml`,
    title: `Ampułka ${info.ampouleNumber}`,
    text: `Start tej ampułki: ${formatDateShort(info.ampouleStartDate)}. Po dzisiejszej dawce zostanie około ${formatMl(info.remainingAfterToday)} ml, czyli około ${info.approximateDosesLeftAfterToday} kolejnych pełnych podań.${pausedText}`,
  };
}

function getConfiguredAmpouleDoseMl() {
  if (data.settings.unit === 'ml') return decimalToNumber(data.settings.defaultDose);
  return decimalToNumber(data.settings.ampouleDoseMl);
}

function getEntryAmpouleDoseMl(entry, fallbackDoseMl) {
  const historicalDoseMl = decimalToNumber(entry?.ampouleDoseMl);
  if (historicalDoseMl > 0) return historicalDoseMl;
  if (entry?.unit === 'ml') return decimalToNumber(entry.dose) || fallbackDoseMl;
  return fallbackDoseMl;
}

function addDaysISO(iso, days) {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return localDateISO(date);
}

function ampouleSortKey(entry) {
  return `${entry.date}T${entry.time || '00:00'}`;
}

function buildAmpouleTimeline({ includePlannedToday = false, plannedToday = null } = {}) {
  const rows = [];
  const today = localDateISO();
  const activeAmpoule = getActiveAmpoule();

  data.ampoules
    .slice()
    .sort((a, b) => a.number - b.number || a.startDate.localeCompare(b.startDate))
    .forEach((ampoule) => {
      const volumeMl = decimalToNumber(ampoule.volumeMl);
      const doseMl = decimalToNumber(ampoule.doseMl);
      let remainingMl = volumeMl;
      let givenCount = 0;
      const ampouleEntries = getEntriesForAmpoule(ampoule.id);
      const hasTodayEntry = ampouleEntries.some((entry) => entry.date === today);
      if (includePlannedToday && activeAmpoule?.id === ampoule.id && !hasTodayEntry) {
        ampouleEntries.push(
          createDefaultDraft({
            ...(plannedToday || {}),
            id: 'planned-today',
            date: today,
            time: plannedToday?.time || data.settings.defaultTime,
            status: 'given',
            ampouleId: ampoule.id,
          })
        );
      }
      ampouleEntries
        .sort((a, b) => ampouleSortKey(a).localeCompare(ampouleSortKey(b)))
        .forEach((entry) => {
          const isGiven = entry.status === 'given';
          const entryDoseMl = isGiven ? getEntryAmpouleDoseMl(entry, doseMl) : 0;
          const remainingBefore = remainingMl;
          const remainingAfter = isGiven
            ? Math.max(0, remainingBefore - entryDoseMl)
            : remainingBefore;
          const startsNewAmpoule = isGiven && givenCount === 0;
          const doseNumber = isGiven ? givenCount + 1 : 0;
          const isLastDose =
            isGiven && entryDoseMl > 0 && entryDoseMl >= remainingBefore - 0.000001;
          if (isGiven) givenCount += 1;
          rows.push({
            entry,
            planned: entry.id === 'planned-today',
            ampouleId: ampoule.id,
            ampouleNumber: ampoule.number,
            ampouleStartDate: ampoule.startDate,
            doseMl: entryDoseMl,
            remainingBefore,
            remainingAfter,
            doseNumber,
            startsNewAmpoule,
            isLastDose,
            nextAmpouleStartDate: isLastDose ? addDaysISO(entry.date, 1) : '',
          });
          remainingMl = remainingAfter;
        });
    });

  if (!activeAmpoule) {
    const pausedCount = getOpenPausedAmpoules().length;
    const configuredDoseMl = getConfiguredAmpouleDoseMl();
    return {
      configured: false,
      reason: pausedCount
        ? 'paused'
        : data.ampoules.length
          ? 'finished'
          : !data.settings.ampouleStartDate
            ? 'start'
            : !configuredDoseMl
              ? 'dose'
              : 'finished',
      rows,
      activeAmpoule: null,
      remainingMl: 0,
      volumeMl: decimalToNumber(data.settings.ampouleVolumeMl),
      doseMl: configuredDoseMl,
      startDate: data.settings.ampouleStartDate,
    };
  }

  return {
    configured: true,
    reason: '',
    rows,
    activeAmpoule,
    remainingMl: getAmpouleRemainingMl(activeAmpoule.id),
    volumeMl: decimalToNumber(activeAmpoule.volumeMl),
    doseMl: decimalToNumber(activeAmpoule.doseMl),
    startDate: activeAmpoule.startDate,
  };
}

function formatMl(value) {
  const rounded = Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
  return String(rounded).replace('.', ',');
}

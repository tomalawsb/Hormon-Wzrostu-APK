function handleEntrySubmit(event) {
  event.preventDefault();
  const existingById = data.entries.find((item) => item.id === el['entry-id'].value) || null;
  const status = el['entry-status'].value;
  const entryId = existingById?.id || createId();
  const entry = sanitizeEntry({
    id: entryId,
    date: el['entry-date'].value,
    time: el['entry-time'].value,
    dose: status === 'given' ? el['entry-dose'].value : '',
    unit: status === 'given' ? el['entry-unit'].value : '',
    side: status === 'given' ? el['entry-side'].value : '',
    site: status === 'given' ? el['entry-site'].value : '',
    status,
    note: el['entry-note'].value,
    correctedAt: existingById ? new Date().toISOString() : '',
    createdAt: existingById?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  if (!entry) {
    showToast(
      status === 'given'
        ? 'Uzupełnij prawidłową datę, godzinę, dawkę, stronę i miejsce wkłucia.'
        : 'Uzupełnij prawidłową datę i godzinę.',
      'error'
    );
    return;
  }

  const conflictingEntry = getEntryForDate(entry.date, entry.id);
  if (conflictingEntry) {
    showToast(
      'Dla tej daty istnieje już wpis. Aplikacja pozwala tylko na jeden wpis dziennie.',
      'error'
    );
    return;
  }

  const undoOperation = captureEntryUndoOperation(entry.id, existingById);
  let ampouleId = existingById?.ampouleId || '';
  if (!ampouleId && status === 'given') {
    const resolvedAmpouleId = ensureActiveAmpouleForDate(entry.date);
    if (resolvedAmpouleId === null) {
      showToast('Najpierw wybierz odłożoną ampułkę albo rozpocznij nową.', 'error', 6500);
      closeEntryDialog();
      openAmpouleSettings();
      return;
    }
    ampouleId = resolvedAmpouleId;
  } else if (!ampouleId && status === 'skipped') {
    ampouleId = getActiveAmpoule()?.id || '';
  }
  entry.ampouleId = ampouleId;
  entry.ampouleDoseMl = getEntryAmpouleDoseSnapshot(entry, ampouleId, existingById);
  finalizeEntryUndoOperation(undoOperation, null);
  if (entry.status === 'given') {
    const capacity = getAmpouleCapacityForEntry(entry, ampouleId, existingById);
    if (!capacity.sufficient) {
      applyEntryUndoOperation(undoOperation, {
        persist: false,
        announce: false,
        requireCurrentMatch: false,
        forceRemoveCreatedAmpoules: true,
      });
      showInsufficientAmpouleError(capacity, existingById);
      closeEntryDialog();
      openAmpouleSettings();
      return;
    }
  }

  const existingIndex = data.entries.findIndex((item) => item.id === entry.id);
  if (existingIndex >= 0) data.entries[existingIndex] = entry;
  else data.entries.push(entry);
  reconcileAmpouleStatuses();
  finalizeEntryUndoOperation(undoOperation, entry);
  if (!persistData()) {
    applyEntryUndoOperation(undoOperation, {
      persist: false,
      announce: false,
      requireCurrentMatch: false,
      forceRemoveCreatedAmpoules: true,
    });
    return;
  }
  closeEntryDialog();
  selectedCalendarDate = entry.date;
  calendarCursor = startOfMonth(parseISODate(entry.date));
  resetQuickDraftForToday();
  renderAll();
  const message = existingIndex >= 0 ? 'Wpis został poprawiony.' : 'Wpis został zapisany.';
  showEntryUndo(message, undoOperation);
  speakIfEnabled(message);
}

function captureEntryUndoOperation(entryId, previousEntry = null) {
  const profile = getActiveProfile();
  return {
    profileId: profile.id,
    entryId,
    previousEntry: previousEntry ? structuredCloneSafe(previousEntry) : null,
    previousActiveAmpouleId: profile.activeAmpouleId || '',
    ampouleIdsBefore: profile.ampoules.map((ampoule) => ampoule.id),
    createdAmpoules: [],
    afterEntryUpdatedAt: '',
  };
}

function finalizeEntryUndoOperation(operation, entry) {
  const profile = data.profiles.find((item) => item.id === operation.profileId);
  if (!profile) return operation;
  const previousIds = new Set(operation.ampouleIdsBefore);
  operation.createdAmpoules = profile.ampoules
    .filter((ampoule) => !previousIds.has(ampoule.id))
    .map((ampoule) => structuredCloneSafe(ampoule));
  operation.afterEntryUpdatedAt = entry?.updatedAt || '';
  return operation;
}

function getUndoProfileAmpouleRemainingMl(profile, ampouleId) {
  const ampoule = profile.ampoules.find((item) => item.id === ampouleId);
  if (!ampoule) return 0;
  const fallbackDoseMl = decimalToNumber(ampoule.doseMl);
  const used = profile.entries
    .filter((entry) => entry.status === 'given' && entry.ampouleId === ampouleId)
    .reduce((sum, entry) => sum + getEntryAmpouleDoseMl(entry, fallbackDoseMl), 0);
  return Math.max(0, decimalToNumber(ampoule.volumeMl) - used);
}

function reconcileUndoProfileAmpouleStatuses(profile) {
  profile.ampoules.forEach((ampoule) => {
    if (getUndoProfileAmpouleRemainingMl(profile, ampoule.id) <= 0.000001) {
      ampoule.status = 'finished';
      if (profile.activeAmpouleId === ampoule.id) profile.activeAmpouleId = '';
    } else if (profile.activeAmpouleId === ampoule.id) {
      ampoule.status = 'active';
    } else if (ampoule.status === 'active' || ampoule.status === 'finished') {
      ampoule.status = 'paused';
    }
  });
}

function createdAmpouleWasNotChanged(current, snapshot) {
  return Boolean(
    current &&
    snapshot &&
    current.id === snapshot.id &&
    current.number === snapshot.number &&
    current.startDate === snapshot.startDate &&
    current.volumeMl === snapshot.volumeMl &&
    current.doseMl === snapshot.doseMl &&
    current.createdAt === snapshot.createdAt &&
    current.updatedAt === snapshot.updatedAt
  );
}

function applyEntryUndoOperation(
  operation,
  {
    persist = true,
    announce = true,
    requireCurrentMatch = true,
    forceRemoveCreatedAmpoules = false,
  } = {}
) {
  if (!operation?.profileId || !operation.entryId) return false;
  const profileIndex = data.profiles.findIndex((profile) => profile.id === operation.profileId);
  if (profileIndex < 0) return false;
  const profile = data.profiles[profileIndex];
  const profileBeforeUndo = structuredCloneSafe(profile);
  const currentIndex = profile.entries.findIndex((entry) => entry.id === operation.entryId);
  const currentEntry = currentIndex >= 0 ? profile.entries[currentIndex] : null;
  const currentMatchesOperation = operation.afterEntryUpdatedAt
    ? currentEntry?.updatedAt === operation.afterEntryUpdatedAt
    : !currentEntry;
  if (requireCurrentMatch && !currentMatchesOperation) {
    if (announce)
      showToast('Nie można cofnąć, ponieważ ten wpis został już później zmieniony.', 'error', 6500);
    return false;
  }

  if (operation.previousEntry) {
    if (currentIndex >= 0)
      profile.entries[currentIndex] = structuredCloneSafe(operation.previousEntry);
    else profile.entries.push(structuredCloneSafe(operation.previousEntry));
  } else if (currentIndex >= 0) {
    profile.entries.splice(currentIndex, 1);
  }

  const removedIds = new Set();
  for (const snapshot of operation.createdAmpoules || []) {
    const currentAmpoule = profile.ampoules.find((ampoule) => ampoule.id === snapshot.id);
    const stillUsed = profile.entries.some((entry) => entry.ampouleId === snapshot.id);
    if (
      !stillUsed &&
      currentAmpoule &&
      (forceRemoveCreatedAmpoules || createdAmpouleWasNotChanged(currentAmpoule, snapshot))
    ) {
      profile.ampoules = profile.ampoules.filter((ampoule) => ampoule.id !== snapshot.id);
      removedIds.add(snapshot.id);
    }
  }

  if (!profile.activeAmpouleId || removedIds.has(profile.activeAmpouleId)) {
    const previous = profile.ampoules.find(
      (ampoule) => ampoule.id === operation.previousActiveAmpouleId
    );
    if (previous && getUndoProfileAmpouleRemainingMl(profile, previous.id) > 0.000001) {
      profile.activeAmpouleId = previous.id;
    } else if (removedIds.has(profile.activeAmpouleId)) {
      profile.activeAmpouleId = '';
    }
  }
  reconcileUndoProfileAmpouleStatuses(profile);

  if (persist && !persistData()) {
    data.profiles[profileIndex] = profileBeforeUndo;
    return false;
  }
  if (lastEntryUndoOperation === operation) lastEntryUndoOperation = null;
  dismissEntryUndoToasts();
  if (data.activeProfileId === operation.profileId) resetQuickDraftForToday();
  if (persist) renderAll();
  if (announce) showToast('Cofnięto ostatnią zmianę wpisu.', 'success');
  return true;
}

function showEntryUndo(message, operation) {
  dismissEntryUndoToasts();
  lastEntryUndoOperation = operation;
  renderTodayUndoAction();
  showActionToast(message, 'Cofnij', () => applyEntryUndoOperation(operation), 'success', 9000);
}

function dismissEntryUndoToasts() {
  el['toast-region']
    ?.querySelectorAll('.toast--action')
    .forEach((toast) => toast.remove());
}

function renderTodayUndoAction() {
  if (!el['today-undo-button']) return;
  const operation = lastEntryUndoOperation;
  const profile = operation
    ? data.profiles.find((item) => item.id === operation.profileId)
    : null;
  const currentEntry = profile?.entries.find((entry) => entry.id === operation?.entryId) || null;
  const stillCurrent = operation?.afterEntryUpdatedAt
    ? currentEntry?.updatedAt === operation.afterEntryUpdatedAt
    : Boolean(operation && !currentEntry);
  const visible = Boolean(
    operation && operation.profileId === data.activeProfileId && stillCurrent
  );
  if (operation?.profileId === data.activeProfileId && !stillCurrent) lastEntryUndoOperation = null;
  el['today-undo-button'].classList.toggle('is-hidden', !visible);
  el['today-undo-button'].disabled = !visible;
}

function undoLastEntryOperation() {
  if (!lastEntryUndoOperation) {
    showToast('Nie ma operacji, którą można cofnąć.', 'error');
    renderTodayUndoAction();
    return;
  }
  const operation = lastEntryUndoOperation;
  if (!applyEntryUndoOperation(operation)) renderTodayUndoAction();
}

function getEntryAmpouleDoseSnapshot(entryLike, ampouleId, existingEntry = null) {
  if (entryLike?.status !== 'given') return '';
  if (entryLike.unit === 'ml') return normalizePositiveDecimal(entryLike.dose);
  const historical = normalizePositiveDecimal(existingEntry?.ampouleDoseMl);
  if (historical) return historical;
  const ampoule = ampouleId ? getAmpouleById(ampouleId) : null;
  return (
    normalizePositiveDecimal(ampoule?.doseMl) ||
    normalizePositiveDecimal(getConfiguredAmpouleDoseMl())
  );
}

function getAmpouleCapacityForEntry(entryLike, ampouleId, existingEntry = null) {
  const ampoule = ampouleId ? getAmpouleById(ampouleId) : null;
  const requiredMl = decimalToNumber(
    getEntryAmpouleDoseSnapshot(entryLike, ampouleId, existingEntry)
  );
  if (!ampoule || entryLike?.status !== 'given' || requiredMl <= 0) {
    return { ampoule, requiredMl, availableMl: 0, sufficient: false };
  }
  let availableMl = getAmpouleRemainingMl(ampoule.id);
  if (existingEntry?.status === 'given' && existingEntry.ampouleId === ampoule.id) {
    availableMl += getEntryAmpouleDoseMl(existingEntry, decimalToNumber(ampoule.doseMl));
  }
  return {
    ampoule,
    requiredMl,
    availableMl,
    sufficient: requiredMl <= availableMl + 0.000001,
  };
}

function showInsufficientAmpouleError(capacity, existingEntry = null) {
  const ampouleNumber = capacity.ampoule?.number || '?';
  const action = existingEntry
    ? 'Zmniejsz zużycie tej dawki albo popraw dane przypisanej ampułki.'
    : 'Odłóż obecną ampułkę i rozpocznij nową przed zapisaniem zastrzyku.';
  showToast(
    `Ampułka ${ampouleNumber} ma tylko ${formatMl(capacity.availableMl)} ml, a podanie wymaga ${formatMl(capacity.requiredMl)} ml. ${action}`,
    'error',
    9000
  );
}

function confirmRecommendedInjection() {
  const today = localDateISO();
  const existing = getEntryForDate(today);
  if (existing) {
    openEntryDialog(existing.id);
    return;
  }
  const preparedDraft =
    quickDraft.date === today && quickDraft.status === 'given'
      ? quickDraft
      : createInitialQuickDraft();
  const suggestion =
    preparedDraft.side && preparedDraft.site
      ? { side: preparedDraft.side, site: preparedDraft.site }
      : getSuggestedPlace(new Date());
  if (!suggestion.side || !suggestion.site) {
    showToast('Najpierw włącz co najmniej jedno miejsce wkłucia.', 'error', 6500);
    openSettingsSection('injection-order');
    return;
  }
  const dose = normalizeDose(preparedDraft.dose || data.settings.defaultDose);
  if (!dose) {
    showToast('Najpierw ustaw prawidłową dawkę domyślną.', 'error');
    openSettingsSection('treatment');
    return;
  }

  const entryId = createId();
  const undoOperation = captureEntryUndoOperation(entryId, null);
  const ampouleId = ensureActiveAmpouleForDate(today);
  if (ampouleId === null) {
    showToast('Wybierz odłożoną ampułkę albo rozpocznij nową.', 'error', 6500);
    openAmpouleSettings();
    return;
  }
  if (!ampouleId) {
    showToast('Ustaw pojemność i zużycie ampułki w ml, aby potwierdzić podanie.', 'error', 6500);
    openAmpouleSettings();
    return;
  }
  finalizeEntryUndoOperation(undoOperation, null);

  const entry = sanitizeEntry({
    id: entryId,
    date: today,
    time: isValidTime(preparedDraft.time) ? preparedDraft.time : data.settings.defaultTime,
    dose,
    unit: preparedDraft.unit || data.settings.unit,
    side: suggestion.side,
    site: suggestion.site,
    status: 'given',
    note: '',
    ampouleId,
    ampouleDoseMl: getEntryAmpouleDoseSnapshot(
      { status: 'given', unit: preparedDraft.unit || data.settings.unit, dose },
      ampouleId
    ),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  if (!entry) {
    applyEntryUndoOperation(undoOperation, {
      persist: false,
      announce: false,
      requireCurrentMatch: false,
      forceRemoveCreatedAmpoules: true,
    });
    showToast('Nie udało się przygotować dzisiejszego wpisu.', 'error');
    return;
  }
  const capacity = getAmpouleCapacityForEntry(entry, ampouleId);
  if (!capacity.sufficient) {
    applyEntryUndoOperation(undoOperation, {
      persist: false,
      announce: false,
      requireCurrentMatch: false,
      forceRemoveCreatedAmpoules: true,
    });
    showInsufficientAmpouleError(capacity);
    openAmpouleSettings();
    return;
  }

  data.entries.push(entry);
  reconcileAmpouleStatuses();
  finalizeEntryUndoOperation(undoOperation, entry);
  if (!persistData()) {
    applyEntryUndoOperation(undoOperation, {
      persist: false,
      announce: false,
      requireCurrentMatch: false,
      forceRemoveCreatedAmpoules: true,
    });
    return;
  }
  selectedCalendarDate = today;
  calendarCursor = startOfMonth(parseISODate(today));
  resetQuickDraftForToday();
  renderAll();
  const message = `Podano: ${formatPlace(entry.side, entry.site)}, ${formatDose(entry.dose)} ${entry.unit}.`;
  showEntryUndo(message, undoOperation);
  speakIfEnabled(message);
}

function openRecommendedEntryEditor() {
  const today = localDateISO();
  const existing = getEntryForDate(today);
  if (existing) {
    openEntryDialog(existing.id, null, 'entry-note');
    return;
  }
  const suggestion = getSuggestedPlace(new Date());
  if (!suggestion.side || !suggestion.site) {
    showToast('Brak aktywnego miejsca w kolejności.', 'error');
    openSettingsSection('injection-order');
    return;
  }
  openEntryDialog(
    null,
    createDefaultDraft({
      date: today,
      time: data.settings.defaultTime,
      dose: data.settings.defaultDose,
      unit: data.settings.unit,
      side: suggestion.side,
      site: suggestion.site,
      status: 'given',
    }),
    'entry-note'
  );
}

function confirmSkippedToday() {
  const today = localDateISO();
  const existing = getEntryForDate(today);
  const entryId = existing?.id || createId();
  const undoOperation = captureEntryUndoOperation(entryId, existing);
  const entry = sanitizeEntry({
    id: entryId,
    date: today,
    time: localTime(),
    status: 'skipped',
    note: existing?.note || '',
    ampouleId: existing?.ampouleId || getActiveAmpoule()?.id || '',
    ampouleDoseMl: '',
    correctedAt: existing ? new Date().toISOString() : '',
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  if (!entry) return;
  const index = existing ? data.entries.findIndex((item) => item.id === existing.id) : -1;
  if (index >= 0) data.entries[index] = entry;
  else data.entries.push(entry);
  reconcileAmpouleStatuses();
  finalizeEntryUndoOperation(undoOperation, entry);
  if (!persistData()) {
    applyEntryUndoOperation(undoOperation, {
      persist: false,
      announce: false,
      requireCurrentMatch: false,
      forceRemoveCreatedAmpoules: true,
    });
    return;
  }
  resetQuickDraftForToday();
  renderAll();
  showEntryUndo(
    existing
      ? 'Dzisiejszy wpis zmieniono na pominięcie.'
      : 'Dzisiejszą dawkę oznaczono jako pominiętą.',
    undoOperation
  );
}


function saveQuickDraft() {
  if (
    quickDraft.status === 'given' &&
    (!quickDraft.side || !quickDraft.site || !normalizeDose(quickDraft.dose))
  ) {
    showToast('Najpierw wybierz lub powiedz miejsce wkłucia oraz sprawdź dawkę.', 'error');
    return;
  }

  const existingById = quickDraft.id
    ? data.entries.find((item) => item.id === quickDraft.id)
    : null;
  const conflictingEntry = getEntryForDate(quickDraft.date, quickDraft.id || '');
  if (conflictingEntry) {
    showToast('Dla tej daty istnieje już wpis. Otwieram istniejący wpis do edycji.', 'error');
    openEntryDialog(conflictingEntry.id);
    return;
  }

  const entryId = existingById?.id || createId();
  const undoOperation = captureEntryUndoOperation(entryId, existingById);
  let ampouleId = existingById?.ampouleId || quickDraft.ampouleId || '';
  if (!ampouleId && quickDraft.status === 'given') {
    const resolvedAmpouleId = ensureActiveAmpouleForDate(quickDraft.date);
    if (resolvedAmpouleId === null) {
      showToast('Najpierw wybierz odłożoną ampułkę albo rozpocznij nową.', 'error', 6500);
      openAmpouleSettings();
      return;
    }
    ampouleId = resolvedAmpouleId;
  } else if (!ampouleId && quickDraft.status === 'skipped') {
    ampouleId = getActiveAmpoule()?.id || '';
  }
  finalizeEntryUndoOperation(undoOperation, null);

  const entry = sanitizeEntry({
    ...quickDraft,
    id: entryId,
    dose: quickDraft.status === 'given' ? quickDraft.dose : '',
    unit: quickDraft.status === 'given' ? quickDraft.unit : '',
    side: quickDraft.status === 'given' ? quickDraft.side : '',
    site: quickDraft.status === 'given' ? quickDraft.site : '',
    ampouleId,
    ampouleDoseMl: getEntryAmpouleDoseSnapshot(quickDraft, ampouleId, existingById),
    correctedAt: existingById ? new Date().toISOString() : '',
    createdAt: existingById?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  if (!entry) {
    applyEntryUndoOperation(undoOperation, {
      persist: false,
      announce: false,
      requireCurrentMatch: false,
      forceRemoveCreatedAmpoules: true,
    });
    showToast('Przygotowany wpis zawiera nieprawidłowe dane.', 'error');
    return;
  }
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
  selectedCalendarDate = entry.date;
  calendarCursor = startOfMonth(parseISODate(entry.date));
  resetQuickDraftForToday();
  renderAll();
  const message =
    entry.status === 'given'
      ? `${existingIndex >= 0 ? 'Zmieniono' : 'Zapisano'}: ${formatPlace(entry.side, entry.site)}.`
      : `${existingIndex >= 0 ? 'Zmieniono wpis na' : 'Zapisano'} pominięcie dawki.`;
  showEntryUndo(message, undoOperation);
  speakIfEnabled(message);
}

function useSuggestedPlace() {
  const reference = dateTimeFromEntry(quickDraft) || new Date();
  const suggestion = getSuggestedPlace(reference);
  if (!suggestion.side || !suggestion.site) {
    showToast(
      'Brak aktywnego miejsca w kolejności. Włącz co najmniej jedną pozycję.',
      'error',
      6500
    );
    openSettingsSection('injection-order');
    return;
  }
  quickDraft.side = suggestion.side;
  quickDraft.site = suggestion.site;
  quickDraft.status = 'given';
  if (!quickDraft.unit) quickDraft.unit = data.settings.unit;
  if (!quickDraft.dose) quickDraft.dose = data.settings.defaultDose;
  quickDraftTouched = true;
  lastRecognizedText = formatPlace(suggestion.side, suggestion.site);
  renderToday();
  el['save-button'].focus();
}

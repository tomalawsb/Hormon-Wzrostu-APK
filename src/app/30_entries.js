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
      createdAt: existingById?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    if (!entry) {
      showToast(status === 'given'
        ? 'Uzupełnij prawidłową datę, godzinę, dawkę, stronę i miejsce wkłucia.'
        : 'Uzupełnij prawidłową datę i godzinę.', 'error');
      return;
    }

    const conflictingEntry = getEntryForDate(entry.date, entry.id);
    if (conflictingEntry) {
      showToast('Dla tej daty istnieje już wpis. Aplikacja pozwala tylko na jeden wpis dziennie.', 'error');
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
        applyEntryUndoOperation(undoOperation, { persist: false, announce: false, requireCurrentMatch: false, forceRemoveCreatedAmpoules: true });
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
      applyEntryUndoOperation(undoOperation, { persist: false, announce: false, requireCurrentMatch: false, forceRemoveCreatedAmpoules: true });
      return;
    }
    closeEntryDialog();
    selectedCalendarDate = entry.date;
    calendarCursor = startOfMonth(parseISODate(entry.date));
    resetQuickDraftForToday();
    renderAll();
    const message = existingIndex >= 0 ? 'Wpis został poprawiony.' : 'Wpis został zapisany.';
    showToast(message, 'success');
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
      afterEntryUpdatedAt: ''
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
    return Boolean(current && snapshot
      && current.id === snapshot.id
      && current.number === snapshot.number
      && current.startDate === snapshot.startDate
      && current.volumeMl === snapshot.volumeMl
      && current.doseMl === snapshot.doseMl
      && current.createdAt === snapshot.createdAt
      && current.updatedAt === snapshot.updatedAt);
  }

  function applyEntryUndoOperation(operation, { persist = true, announce = true, requireCurrentMatch = true, forceRemoveCreatedAmpoules = false } = {}) {
    if (!operation?.profileId || !operation.entryId) return false;
    const profileIndex = data.profiles.findIndex((profile) => profile.id === operation.profileId);
    if (profileIndex < 0) return false;
    const profile = data.profiles[profileIndex];
    const profileBeforeUndo = structuredCloneSafe(profile);
    const currentIndex = profile.entries.findIndex((entry) => entry.id === operation.entryId);
    const currentEntry = currentIndex >= 0 ? profile.entries[currentIndex] : null;
    if (requireCurrentMatch && (!currentEntry || currentEntry.updatedAt !== operation.afterEntryUpdatedAt)) {
      if (announce) showToast('Nie można cofnąć, ponieważ ten wpis został już później zmieniony.', 'error', 6500);
      return false;
    }

    if (operation.previousEntry) {
      if (currentIndex >= 0) profile.entries[currentIndex] = structuredCloneSafe(operation.previousEntry);
      else profile.entries.push(structuredCloneSafe(operation.previousEntry));
    } else if (currentIndex >= 0) {
      profile.entries.splice(currentIndex, 1);
    }

    const removedIds = new Set();
    for (const snapshot of operation.createdAmpoules || []) {
      const currentAmpoule = profile.ampoules.find((ampoule) => ampoule.id === snapshot.id);
      const stillUsed = profile.entries.some((entry) => entry.ampouleId === snapshot.id);
      if (!stillUsed && currentAmpoule && (forceRemoveCreatedAmpoules || createdAmpouleWasNotChanged(currentAmpoule, snapshot))) {
        profile.ampoules = profile.ampoules.filter((ampoule) => ampoule.id !== snapshot.id);
        removedIds.add(snapshot.id);
      }
    }

    if (!profile.activeAmpouleId || removedIds.has(profile.activeAmpouleId)) {
      const previous = profile.ampoules.find((ampoule) => ampoule.id === operation.previousActiveAmpouleId);
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
    if (data.activeProfileId === operation.profileId) resetQuickDraftForToday();
    if (persist) renderAll();
    if (announce) showToast('Cofnięto tylko ostatni zapis podania.', 'success');
    return true;
  }

  function showEntryUndo(message, operation) {
    showActionToast(message, 'Cofnij', () => applyEntryUndoOperation(operation), 'success', 9000);
  }

  function getEntryAmpouleDoseSnapshot(entryLike, ampouleId, existingEntry = null) {
    if (entryLike?.status !== 'given') return '';
    if (entryLike.unit === 'ml') return normalizePositiveDecimal(entryLike.dose);
    const historical = normalizePositiveDecimal(existingEntry?.ampouleDoseMl);
    if (historical) return historical;
    const ampoule = ampouleId ? getAmpouleById(ampouleId) : null;
    return normalizePositiveDecimal(ampoule?.doseMl) || normalizePositiveDecimal(getConfiguredAmpouleDoseMl());
  }

  function getAmpouleCapacityForEntry(entryLike, ampouleId, existingEntry = null) {
    const ampoule = ampouleId ? getAmpouleById(ampouleId) : null;
    const requiredMl = decimalToNumber(getEntryAmpouleDoseSnapshot(entryLike, ampouleId, existingEntry));
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
      sufficient: requiredMl <= availableMl + 0.000001
    };
  }

  function showInsufficientAmpouleError(capacity, existingEntry = null) {
    const ampouleNumber = capacity.ampoule?.number || '?';
    const action = existingEntry
      ? 'Zmniejsz zużycie tej dawki albo popraw dane przypisanej ampułki.'
      : 'Odłóż obecną ampułkę i rozpocznij nową przed zapisaniem zastrzyku.';
    showToast(`Ampułka ${ampouleNumber} ma tylko ${formatMl(capacity.availableMl)} ml, a podanie wymaga ${formatMl(capacity.requiredMl)} ml. ${action}`, 'error', 9000);
  }

  function confirmRecommendedInjection() {
    const today = localDateISO();
    const existing = getEntryForDate(today);
    if (existing) {
      openEntryDialog(existing.id);
      return;
    }
    const suggestion = getSuggestedPlace(new Date());
    if (!suggestion.side || !suggestion.site) {
      showToast('Najpierw włącz co najmniej jedno miejsce wkłucia.', 'error', 6500);
      openSettingsSection('injection-order');
      return;
    }
    const dose = normalizeDose(data.settings.defaultDose);
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
      time: data.settings.defaultTime,
      dose,
      unit: data.settings.unit,
      side: suggestion.side,
      site: suggestion.site,
      status: 'given',
      note: '',
      ampouleId,
      ampouleDoseMl: getEntryAmpouleDoseSnapshot({ status: 'given', unit: data.settings.unit, dose }, ampouleId),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    if (!entry) {
      applyEntryUndoOperation(undoOperation, { persist: false, announce: false, requireCurrentMatch: false, forceRemoveCreatedAmpoules: true });
      showToast('Nie udało się przygotować dzisiejszego wpisu.', 'error');
      return;
    }
    const capacity = getAmpouleCapacityForEntry(entry, ampouleId);
    if (!capacity.sufficient) {
      applyEntryUndoOperation(undoOperation, { persist: false, announce: false, requireCurrentMatch: false, forceRemoveCreatedAmpoules: true });
      showInsufficientAmpouleError(capacity);
      openAmpouleSettings();
      return;
    }

    data.entries.push(entry);
    reconcileAmpouleStatuses();
    finalizeEntryUndoOperation(undoOperation, entry);
    if (!persistData()) {
      applyEntryUndoOperation(undoOperation, { persist: false, announce: false, requireCurrentMatch: false, forceRemoveCreatedAmpoules: true });
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
    openEntryDialog(null, createDefaultDraft({
      date: today,
      time: data.settings.defaultTime,
      dose: data.settings.defaultDose,
      unit: data.settings.unit,
      side: suggestion.side,
      site: suggestion.site,
      status: 'given'
    }), 'entry-note');
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
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    if (!entry) return;
    const index = existing ? data.entries.findIndex((item) => item.id === existing.id) : -1;
    if (index >= 0) data.entries[index] = entry;
    else data.entries.push(entry);
    reconcileAmpouleStatuses();
    finalizeEntryUndoOperation(undoOperation, entry);
    if (!persistData()) {
      applyEntryUndoOperation(undoOperation, { persist: false, announce: false, requireCurrentMatch: false, forceRemoveCreatedAmpoules: true });
      return;
    }
    resetQuickDraftForToday();
    renderAll();
    showEntryUndo(existing ? 'Dzisiejszy wpis zmieniono na pominięcie.' : 'Dzisiejszą dawkę oznaczono jako pominiętą.', undoOperation);
  }

  function openAmpouleSettings() {
    openSettingsSection('ampoules', { focus: false });
    window.setTimeout(() => {
      const field = el['ampoule-start-date'];
      if (!field) return;
      field.focus({ preventScroll: false });
      try { field.showPicker?.(); } catch {}
      field.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 60);
  }

  function setAmpouleStartToday() {
    const active = getActiveAmpoule();
    if (active) {
      showToast(`Ampułka ${active.number} jest już aktywna. Aby rozpocząć kolejną, użyj przycisku „Odłóż aktywną i rozpocznij nową”.`, 'error', 7000);
      return;
    }

    const today = localDateISO();
    data.settings.ampouleStartDate = today;
    if (el['ampoule-start-date']) el['ampoule-start-date'].value = today;

    if (!active) {
      const doseMl = getConfiguredAmpouleDoseMl();
      const volumeMl = decimalToNumber(data.settings.ampouleVolumeMl);
      if (doseMl && volumeMl) {
        const ampoule = createAmpouleRecord({
          number: data.ampoules.length ? nextAmpouleNumber(true) : data.settings.ampouleStartNumber,
          startDate: today,
          volumeMl,
          doseMl,
          status: 'active'
        });
        data.ampoules.push(ampoule);
        data.activeAmpouleId = ampoule.id;
      }
    } else if (!getEntriesForAmpoule(active.id).some((entry) => entry.status === 'given')) {
      active.startDate = today;
      active.updatedAt = new Date().toISOString();
    }

    if (!persistData()) return;
    renderAll();
    showToast('Ustawiono dzisiejszą datę rozpoczęcia ampułki.', 'success');
  }

  function readAmpouleFormValues() {
    const volumeMl = normalizePositiveDecimal(el['ampoule-volume'].value) || DEFAULT_AMPOULE_VOLUME_ML;
    const formUnit = ALLOWED_UNITS.has(el['settings-unit'].value) ? el['settings-unit'].value : data.settings.unit;
    const doseMl = formUnit === 'ml'
      ? normalizePositiveDecimal(el['settings-dose'].value)
      : normalizeOptionalPositiveDecimal(el['ampoule-dose-ml'].value);
    return {
      volumeMl,
      doseMl,
      startDate: el['ampoule-start-date'].value || localDateISO(),
      number: normalizeAmpouleNumber(el['ampoule-start-number'].value)
    };
  }

  function startNewAmpoule() {
    const values = readAmpouleFormValues();
    if (!values.doseMl) {
      showToast('Najpierw ustaw zużycie na jedno podanie w ml.', 'error');
      return;
    }

    const active = getActiveAmpoule();
    const hadActiveAmpoule = Boolean(active);
    if (active && getAmpouleRemainingMl(active.id) > 0.000001) active.status = 'paused';
    else if (active) active.status = 'finished';

    const ampoule = createAmpouleRecord({
      number: nextAmpouleNumber(true),
      startDate: localDateISO(),
      volumeMl: values.volumeMl,
      doseMl: values.doseMl,
      status: 'active'
    });
    data.ampoules.push(ampoule);
    data.activeAmpouleId = ampoule.id;
    data.settings.ampouleStartDate = ampoule.startDate;
    data.settings.ampouleStartNumber = ampoule.number;
    data.settings.ampouleVolumeMl = ampoule.volumeMl;
    data.settings.ampouleDoseMl = data.settings.unit === 'ml' ? '' : ampoule.doseMl;
    if (!persistData()) return;
    renderAll();
    showToast(hadActiveAmpoule
      ? `Rozpoczęto ampułkę ${ampoule.number}. Poprzednia została odłożona.`
      : `Rozpoczęto ampułkę ${ampoule.number}.`, 'success');
  }

  function handleAmpouleListAction(event) {
    const button = event.target.closest('[data-resume-ampoule-id]');
    if (!button) return;
    resumeAmpoule(button.dataset.resumeAmpouleId);
  }

  function resumeAmpoule(ampouleId) {
    const target = getAmpouleById(ampouleId);
    if (!target || getAmpouleRemainingMl(target.id) <= 0.000001) {
      showToast('Tej ampułki nie można wznowić, ponieważ jest już zużyta.', 'error');
      return;
    }
    const active = getActiveAmpoule();
    if (active && active.id !== target.id) active.status = getAmpouleRemainingMl(active.id) > 0.000001 ? 'paused' : 'finished';
    target.status = 'active';
    target.updatedAt = new Date().toISOString();
    data.activeAmpouleId = target.id;
    data.settings.ampouleStartDate = target.startDate;
    data.settings.ampouleStartNumber = target.number;
    data.settings.ampouleVolumeMl = target.volumeMl;
    data.settings.ampouleDoseMl = data.settings.unit === 'ml' ? '' : target.doseMl;
    if (!persistData()) return;
    renderAll();
    showToast(`Wznowiono ampułkę ${target.number}.`, 'success');
  }

  function renderAmpouleManagement() {
    const active = getActiveAmpoule();
    const paused = getOpenPausedAmpoules();
    const startTodayButtons = [el['ampoule-start-today-button'], el['ampoule-start-main-button']].filter(Boolean);
    startTodayButtons.forEach((button) => {
      button.disabled = Boolean(active);
      button.title = active
        ? `Ampułka ${active.number} jest już aktywna. Użyj przycisku „Odłóż aktywną i rozpocznij nową”.`
        : 'Rozpocznij pierwszą ampułkę z dzisiejszą datą';
    });

    if (active) {
      const openWarning = isAmpouleOpenTooLong(active) ? ' Przekroczono ustawiony limit czasu od otwarcia.' : '';
      el['ampoule-management-summary'].textContent = `Aktywna: ampułka ${active.number}, pozostało około ${formatMl(getAmpouleRemainingMl(active.id))} ml.${openWarning}`;
      el['ampoule-new-button'].textContent = 'Odłóż aktywną i rozpocznij nową';
    } else if (paused.length) {
      el['ampoule-management-summary'].textContent = 'Brak aktywnej ampułki. Wybierz jedną z odłożonych albo rozpocznij nową.';
      el['ampoule-new-button'].textContent = 'Rozpocznij nową ampułkę';
    } else {
      el['ampoule-management-summary'].textContent = 'Nie ma odłożonych ampułek.';
      el['ampoule-new-button'].textContent = 'Rozpocznij nową ampułkę';
    }

    const visible = [...data.ampoules]
      .filter((ampoule) => ampoule.status !== 'finished' || ampoule.id === data.activeAmpouleId)
      .sort((a, b) => (a.status === 'active' ? -1 : b.status === 'active' ? 1 : b.number - a.number));
    el['ampoule-list'].innerHTML = visible.length ? visible.map((ampoule) => {
      const remaining = getAmpouleRemainingMl(ampoule.id);
      const status = ampoule.id === data.activeAmpouleId ? 'Aktywna' : 'Odłożona';
      const openDays = getAmpouleOpenDays(ampoule);
      const tooLong = isAmpouleOpenTooLong(ampoule);
      const action = ampoule.id !== data.activeAmpouleId && remaining > 0.000001
        ? `<button class="mini-button" type="button" data-resume-ampoule-id="${ampoule.id}">Wznów</button>`
        : '';
      return `<div class="ampoule-list-item${tooLong ? ' ampoule-list-item--warning' : ''}"><div><strong>Ampułka ${ampoule.number}</strong><span>${status} · start ${formatDateShort(ampoule.startDate)} · otwarta ${openDays} ${plural(openDays, 'dzień', 'dni', 'dni')} · pozostało ${formatMl(remaining)} ml${tooLong ? ' · przekroczony limit' : ''}</span></div>${action}</div>`;
    }).join('') : '<p class="muted">Lista rozpoczętych ampułek jest pusta.</p>';
  }

  function saveQuickDraft() {
    if (quickDraft.status === 'given' && (!quickDraft.side || !quickDraft.site || !normalizeDose(quickDraft.dose))) {
      showToast('Najpierw wybierz lub powiedz miejsce wkłucia oraz sprawdź dawkę.', 'error');
      return;
    }

    const existingById = quickDraft.id ? data.entries.find((item) => item.id === quickDraft.id) : null;
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
      createdAt: existingById?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    if (!entry) {
      applyEntryUndoOperation(undoOperation, { persist: false, announce: false, requireCurrentMatch: false, forceRemoveCreatedAmpoules: true });
      showToast('Przygotowany wpis zawiera nieprawidłowe dane.', 'error');
      return;
    }
    if (entry.status === 'given') {
      const capacity = getAmpouleCapacityForEntry(entry, ampouleId, existingById);
      if (!capacity.sufficient) {
        applyEntryUndoOperation(undoOperation, { persist: false, announce: false, requireCurrentMatch: false, forceRemoveCreatedAmpoules: true });
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
      applyEntryUndoOperation(undoOperation, { persist: false, announce: false, requireCurrentMatch: false, forceRemoveCreatedAmpoules: true });
      return;
    }
    selectedCalendarDate = entry.date;
    calendarCursor = startOfMonth(parseISODate(entry.date));
    resetQuickDraftForToday();
    renderAll();
    const message = entry.status === 'given'
      ? `${existingIndex >= 0 ? 'Zmieniono' : 'Zapisano'}: ${formatPlace(entry.side, entry.site)}.`
      : `${existingIndex >= 0 ? 'Zmieniono wpis na' : 'Zapisano'} pominięcie dawki.`;
    showToast(message, 'success');
    speakIfEnabled(message);
  }

  function prepareSkippedDraft() {
    const today = localDateISO();
    const existing = getEntryForDate(today);
    quickDraft = existing
      ? { ...existing, status: 'skipped', dose: '', unit: '', side: '', site: '' }
      : createDefaultDraft({ status: 'skipped', dose: '', unit: '', side: '', site: '' });
    quickDraftTouched = true;
    lastRecognizedText = 'dawka pominięta dzisiaj';
    renderToday();
    showToast(existing
      ? 'Przygotowano zmianę dzisiejszego wpisu na „Pominięto”. Naciśnij „Zapisz zmiany”.'
      : 'Przygotowano wpis „Pominięto”. Naciśnij „Zapisz”, aby potwierdzić.');
  }

  function useSuggestedPlace() {
    const reference = dateTimeFromEntry(quickDraft) || new Date();
    const suggestion = getSuggestedPlace(reference);
    if (!suggestion.side || !suggestion.site) {
      showToast('Brak aktywnego miejsca w kolejności. Włącz co najmniej jedną pozycję.', 'error', 6500);
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


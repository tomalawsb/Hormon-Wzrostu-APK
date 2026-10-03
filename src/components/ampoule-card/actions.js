
function getAmpouleForCorrection() {
  return getActiveAmpoule() || getReplacementState().previous;
}

function openAmpouleSettings() {
  const active = getAmpouleForCorrection();
  const used = active ? getAmpouleUsedDoseCount(active.id) : 0;
  el['ampoule-quick-number'].value = active?.number || nextAmpouleNumber(Boolean(data.ampoules.length));
  el['ampoule-quick-date'].value = active?.startDate || localDateISO();
  el['ampoule-quick-dose-count'].value = active?.targetDoseCount || data.settings.ampouleDoseCount || 10;
  el['ampoule-quick-max-days'].value = data.settings.ampouleMaxOpenDays || '';
  el['ampoule-quick-summary'].textContent = active
    ? `Ampułka ${active.number} · wykorzystano ${used} z ${normalizeAmpouleDoseCount(active.targetDoseCount)}`
    : 'Potwierdź rozpoczęcie ampułki';
  el['ampoule-quick-warning'].textContent = active && used
    ? `Liczba docelowa nie może być mniejsza niż ${used}, ponieważ tyle podań jest już zapisanych.`
    : '';
  el['ampoule-quick-new-button'].hidden = !active;
  if (!el['ampoule-quick-dialog'].open) el['ampoule-quick-dialog'].showModal();
  window.setTimeout(() => el['ampoule-quick-dose-count'].focus({ preventScroll: true }), 30);
}

function closeQuickAmpouleDialog() {
  if (!el['ampoule-quick-dialog']?.open) return;
  el['ampoule-quick-dialog'].close();
}

function readQuickAmpouleValues() {
  const date = el['ampoule-quick-date'].value;
  const count = normalizeAmpouleDoseCount(el['ampoule-quick-dose-count'].value, 0);
  const maxDays = normalizeOptionalDayLimit(el['ampoule-quick-max-days'].value);
  if (!isValidIsoDate(date)) {
    showToast('Podaj prawidłową datę rozpoczęcia ampułki.', 'error');
    return null;
  }
  if (!count) {
    showToast('Podaj liczbę zastrzyków od 1 do 999.', 'error');
    return null;
  }
  if (el['ampoule-quick-max-days'].value.trim() && !maxDays) {
    showToast('Limit otwarcia musi wynosić od 1 do 365 dni.', 'error');
    return null;
  }
  return {
    number: normalizeAmpouleNumber(el['ampoule-quick-number'].value),
    date,
    count,
    maxDays,
  };
}

function applyQuickAmpouleValues(values, { forceNew = false } = {}) {
  if (!values) return false;
  const active = getAmpouleForCorrection();
  if (!active || forceNew) {
    return requestAmpouleChange({ values, returnDialog: el['ampoule-quick-dialog'] });
  }
  const previousProfile = structuredCloneSafe(getActiveProfile());
  if (active && !forceNew && values.count < getAmpouleUsedDoseCount(active.id)) {
    showToast('Licznik nie może być mniejszy niż liczba zapisanych podań.', 'error');
    return false;
  }
  data.settings.ampouleStartDate = values.date;
  data.settings.ampouleStartNumber = values.number;
  data.settings.ampouleMaxOpenDays = values.maxDays;
  if (values.date > localDateISO() || data.entries.some((entry) => entry.ampouleId === active.id && entry.date < values.date)) {
    Object.assign(getActiveProfile(), previousProfile);
    showToast('Data rozpoczęcia nie może być przyszła ani późniejsza od zapisanych podań.', 'error');
    return false;
  }
  active.number = values.number;
  active.startDate = values.date;
  active.targetDoseCount = values.count;
  active.updatedAt = new Date().toISOString();
  if (!getActiveAmpoule() && values.count > getAmpouleUsedDoseCount(active.id)) {
    data.activeAmpouleId = active.id;
    active.status = 'active';
  }
  reconcileAmpouleStatuses();
  if (!persistData()) { Object.assign(getActiveProfile(), previousProfile); return false; }
  closeQuickAmpouleDialog();
  renderAll();
  showToast(`Ampułka ${active.number}: ustawiono ${values.count} ${plural(values.count, 'podanie', 'podania', 'podań')}.`, 'success');
  return true;
}

function saveQuickAmpouleSettings(event) {
  event.preventDefault();
  return applyQuickAmpouleValues(readQuickAmpouleValues());
}

function startNewAmpouleFromQuickDialog() {
  const values = readQuickAmpouleValues();
  if (!values) return;
  values.number = nextAmpouleNumber(true);
  values.date = localDateISO();
  values.count = normalizeAmpouleDoseCount(data.settings.ampouleDoseCount);
  applyQuickAmpouleValues(values, { forceNew: true });
}

function setAmpouleStartToday() {
  if (getActiveAmpoule()) {
    showToast('Ampułka jest już aktywna. Użyj przycisku rozpoczęcia nowej, aby ją odłożyć.', 'error');
    return;
  }
  requestAmpouleChange();
}

function readAmpouleFormValues() {
  const volumeMl =
    normalizePositiveDecimal(el['ampoule-volume'].value) || DEFAULT_AMPOULE_VOLUME_ML;
  const targetDoseCount = normalizeAmpouleDoseCount(el['ampoule-dose-count'].value);
  const formUnit = ALLOWED_UNITS.has(el['settings-unit'].value)
    ? el['settings-unit'].value
    : data.settings.unit;
  const explicitDoseMl =
    formUnit === 'ml'
      ? normalizePositiveDecimal(el['settings-dose'].value)
      : normalizeOptionalPositiveDecimal(el['ampoule-dose-ml'].value);
  const doseMl = explicitDoseMl || decimalToNumber(volumeMl) / targetDoseCount;
  return {
    volumeMl,
    doseMl,
    startDate: el['ampoule-start-date'].value || localDateISO(),
    number: normalizeAmpouleNumber(el['ampoule-start-number'].value),
    targetDoseCount,
  };
}

function startNewAmpoule() {
  const values = readAmpouleFormValues();
  requestAmpouleChange({ values: {
    number: nextAmpouleNumber(Boolean(data.ampoules.length)), date: localDateISO(),
    count: values.targetDoseCount, volumeMl: values.volumeMl, doseMl: values.doseMl,
    maxDays: data.settings.ampouleMaxOpenDays,
  } });
}

function pauseAmpoule(ampouleId) {
  const active = getActiveAmpoule();
  if (!active || active.id !== ampouleId) return false;
  if (getAmpouleRemainingDoseCount(active.id) <= 0) return false;
  active.status = 'paused';
  active.updatedAt = new Date().toISOString();
  data.activeAmpouleId = '';
  if (!persistData()) return false;
  renderAll();
  showToast(`Odłożono ampułkę ${active.number}.`, 'success');
  return true;
}

function handleAmpouleListAction(event) {
  const button = event.target.closest('[data-resume-ampoule-id]');
  if (!button) return;
  resumeAmpoule(button.dataset.resumeAmpouleId);
}

function resumeAmpoule(ampouleId) {
  const target = getAmpouleById(ampouleId);
  if (!target || getAmpouleRemainingDoseCount(target.id) <= 0) {
    showToast('Ta ampułka jest już zużyta.', 'error');
    return;
  }
  requestAmpouleChange({ resumeId: ampouleId });
}

function formatPausedAmpouleShortList(ampoules) {
  if (!ampoules.length) return 'brak';
  return ampoules
    .map((ampoule) => `nr ${ampoule.number} (${getAmpouleRemainingDoseCount(ampoule.id)} podań)`)
    .join(', ');
}

function renderAmpouleManagement() {
  const active = getActiveAmpoule();
  const paused = getOpenPausedAmpoules();
  const startTodayButtons = [
    el['ampoule-start-today-button'],
    el['ampoule-start-main-button'],
  ].filter(Boolean);
  startTodayButtons.forEach((button) => {
    button.disabled = Boolean(active);
    button.title = active
      ? `Ampułka ${active.number} jest już aktywna. Użyj przycisku „Odłóż aktywną i rozpocznij nową”.`
      : 'Rozpocznij pierwszą ampułkę z dzisiejszą datą';
  });

  const pausedListShort = formatPausedAmpouleShortList(paused);

  if (active) {
    const openWarning = isAmpouleOpenTooLong(active)
      ? ' Przekroczono ustawiony limit czasu od otwarcia.'
      : '';
    const baseSummary = `Aktywna: ampułka ${active.number}, pozostało ${getAmpouleRemainingDoseCount(active.id)} z ${normalizeAmpouleDoseCount(active.targetDoseCount)} podań.${openWarning}`;
    el['ampoule-management-summary'].textContent = paused.length
      ? `${baseSummary} Odłożone: ${pausedListShort}.`
      : `${baseSummary} Brak odłożonych ampułek.`;
    el['ampoule-new-button'].textContent = 'Odłóż aktywną i rozpocznij nową';
    if (el['ampoule-new-help']) {
      el['ampoule-new-help'].textContent = paused.length
        ? `Po kliknięciu ampułka ${active.number} zostanie odłożona. Poniżej masz już odłożone: ${pausedListShort}. Do każdej możesz wrócić przyciskiem „Wznów”.`
        : `Po kliknięciu ampułka ${active.number} zostanie odłożona. Zaraz rozpocznie się nowa ampułka, a tę obecną potem wznowisz z listy odłożonych poniżej.`;
    }
  } else if (paused.length) {
    el['ampoule-management-summary'].textContent =
      `Brak aktywnej ampułki. Odłożone: ${pausedListShort}. Wybierz „Wznów” przy odpowiedniej ampułce albo rozpocznij nową.`;
    el['ampoule-new-button'].textContent = 'Rozpocznij nową ampułkę';
    if (el['ampoule-new-help'])
      el['ampoule-new-help'].textContent =
        'Masz odłożone ampułki. Możesz je wznowić z listy poniżej albo rozpocząć nową.';
  } else {
    el['ampoule-management-summary'].textContent = 'Nie ma aktywnej ani odłożonej ampułki.';
    el['ampoule-new-button'].textContent = 'Rozpocznij nową ampułkę';
    if (el['ampoule-new-help'])
      el['ampoule-new-help'].textContent =
        'Gdy odłożysz aktywną ampułkę, pojawi się tu na liście i będzie można ją później wznowić.';
  }

  const visible = [...data.ampoules]
    .filter((ampoule) => ampoule.status !== 'finished' || ampoule.id === data.activeAmpouleId)
    .sort((a, b) => (a.status === 'active' ? -1 : b.status === 'active' ? 1 : b.number - a.number));
  el['ampoule-list'].innerHTML = visible.length
    ? visible
        .map((ampoule) => {
          const remaining = getAmpouleRemainingMl(ampoule.id);
          const remainingDoses = getAmpouleRemainingDoseCount(ampoule.id);
          const status = ampoule.id === data.activeAmpouleId ? 'Aktywna' : 'Odłożona';
          const openDays = getAmpouleOpenDays(ampoule);
          const tooLong = isAmpouleOpenTooLong(ampoule);
          const action =
            ampoule.id !== data.activeAmpouleId && remainingDoses > 0
              ? `<button class="mini-button" type="button" data-resume-ampoule-id="${ampoule.id}">Wznów</button>`
              : '';
          return `<div class="ampoule-list-item${tooLong ? ' ampoule-list-item--warning' : ''}"><div><strong>Ampułka ${ampoule.number}</strong><span>${status} · start ${formatDateShort(ampoule.startDate)} · otwarta ${openDays} ${plural(openDays, 'dzień', 'dni', 'dni')} · pozostało ${remainingDoses} ${plural(remainingDoses, 'podanie', 'podania', 'podań')} (${formatMl(remaining)} ml)${tooLong ? ' · przekroczony limit' : ''}</span></div>${action}</div>`;
        })
        .join('')
    : '<p class="muted">Lista rozpoczętych ampułek jest pusta.</p>';
}

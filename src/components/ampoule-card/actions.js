
function openAmpouleSettings() {
  openSettingsSection('ampoules', { focus: false });
  window.setTimeout(() => {
    const field = el['ampoule-start-date'];
    if (!field) return;
    field.focus({ preventScroll: false });
    try {
      field.showPicker?.();
    } catch {}
    field.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 60);
}

function setAmpouleStartToday() {
  const active = getActiveAmpoule();
  if (active) {
    showToast(
      `Ampułka ${active.number} jest już aktywna. Aby rozpocząć kolejną, użyj przycisku „Odłóż aktywną i rozpocznij nową”.`,
      'error',
      7000
    );
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
        status: 'active',
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
  const volumeMl =
    normalizePositiveDecimal(el['ampoule-volume'].value) || DEFAULT_AMPOULE_VOLUME_ML;
  const formUnit = ALLOWED_UNITS.has(el['settings-unit'].value)
    ? el['settings-unit'].value
    : data.settings.unit;
  const doseMl =
    formUnit === 'ml'
      ? normalizePositiveDecimal(el['settings-dose'].value)
      : normalizeOptionalPositiveDecimal(el['ampoule-dose-ml'].value);
  return {
    volumeMl,
    doseMl,
    startDate: el['ampoule-start-date'].value || localDateISO(),
    number: normalizeAmpouleNumber(el['ampoule-start-number'].value),
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
    status: 'active',
  });
  data.ampoules.push(ampoule);
  data.activeAmpouleId = ampoule.id;
  data.settings.ampouleStartDate = ampoule.startDate;
  data.settings.ampouleStartNumber = ampoule.number;
  data.settings.ampouleVolumeMl = ampoule.volumeMl;
  data.settings.ampouleDoseMl = data.settings.unit === 'ml' ? '' : ampoule.doseMl;
  if (!persistData()) return;
  renderAll();
  showToast(
    hadActiveAmpoule
      ? `Rozpoczęto ampułkę ${ampoule.number}. Poprzednia ampułka została odłożona i możesz ją później wznowić z listy odłożonych.`
      : `Rozpoczęto ampułkę ${ampoule.number}.`,
    'success'
  );
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
  if (active && active.id !== target.id)
    active.status = getAmpouleRemainingMl(active.id) > 0.000001 ? 'paused' : 'finished';
  target.status = 'active';
  target.updatedAt = new Date().toISOString();
  data.activeAmpouleId = target.id;
  data.settings.ampouleStartDate = target.startDate;
  data.settings.ampouleStartNumber = target.number;
  data.settings.ampouleVolumeMl = target.volumeMl;
  data.settings.ampouleDoseMl = data.settings.unit === 'ml' ? '' : target.doseMl;
  if (!persistData()) return;
  renderAll();
  showToast(
    active && active.id !== target.id
      ? `Wznowiono ampułkę ${target.number}. Poprzednio aktywna ampułka została odłożona.`
      : `Wznowiono ampułkę ${target.number}.`,
    'success',
    8000
  );
}

function formatPausedAmpouleShortList(ampoules) {
  if (!ampoules.length) return 'brak';
  return ampoules
    .map((ampoule) => `nr ${ampoule.number} (${formatMl(getAmpouleRemainingMl(ampoule.id))} ml)`)
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
    const baseSummary = `Aktywna: ampułka ${active.number}, pozostało około ${formatMl(getAmpouleRemainingMl(active.id))} ml.${openWarning}`;
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
          const status = ampoule.id === data.activeAmpouleId ? 'Aktywna' : 'Odłożona';
          const openDays = getAmpouleOpenDays(ampoule);
          const tooLong = isAmpouleOpenTooLong(ampoule);
          const action =
            ampoule.id !== data.activeAmpouleId && remaining > 0.000001
              ? `<button class="mini-button" type="button" data-resume-ampoule-id="${ampoule.id}">Wznów</button>`
              : '';
          return `<div class="ampoule-list-item${tooLong ? ' ampoule-list-item--warning' : ''}"><div><strong>Ampułka ${ampoule.number}</strong><span>${status} · start ${formatDateShort(ampoule.startDate)} · otwarta ${openDays} ${plural(openDays, 'dzień', 'dni', 'dni')} · pozostało ${formatMl(remaining)} ml${tooLong ? ' · przekroczony limit' : ''}</span></div>${action}</div>`;
        })
        .join('')
    : '<p class="muted">Lista rozpoczętych ampułek jest pusta.</p>';
}

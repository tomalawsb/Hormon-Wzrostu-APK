// Physical replacement is independent of recording an injection.
let pendingAmpouleChange = null;
let ampoulePromptTimer = null;
const dismissedAmpoulePrompts = new Set();

function sanitizeInventory(value = {}) {
  const integer = (item, fallback) =>
    Number.isInteger(Number(item)) && Number(item) >= 0 && Number(item) <= 9999
      ? Number(item)
      : fallback;
  return {
    enabled: value?.enabled === true,
    unopenedCount: integer(value?.unopenedCount ?? value?.unopened, 0),
    lowThreshold: integer(value?.lowThreshold, 2),
  };
}

function getReplacementState(profile = getActiveProfile()) {
  const active = profile.ampoules.find(
    (item) => item.id === profile.activeAmpouleId && getProfileAmpouleRemainingDoseCount(profile, item) > 0
  );
  if (active) return { required: false, active, previous: null, lastDate: '' };
  const finished = profile.ampoules
    .filter((item) => getProfileAmpouleRemainingDoseCount(profile, item) === 0)
    .sort((a, b) => b.number - a.number || b.startDate.localeCompare(a.startDate));
  const previous = finished[0] || null;
  const lastDate = previous
    ? profile.entries.filter((entry) => entry.ampouleId === previous.id && entry.status === 'given')
        .map((entry) => entry.date).sort().at(-1) || previous.startDate
    : '';
  return { required: Boolean(previous), active: null, previous, lastDate };
}

function ampoulePromptKey(profile, state) {
  return `${profile.id}:${state.previous?.id || 'first'}:${localDateISO()}`;
}

function scheduleAmpouleReplacementPrompt() {
  if (ampoulePromptTimer) window.clearTimeout(ampoulePromptTimer);
  ampoulePromptTimer = window.setTimeout(() => {
    ampoulePromptTimer = null;
    if (appLocked || document.visibilityState === 'hidden' || todayDashboardMode === 'all') return;
    if (!data.appMeta.setupCompleted || document.querySelector('dialog[open]')) return;
    const profile = getActiveProfile();
    const state = getReplacementState(profile);
    if (!state.required || state.lastDate >= localDateISO()) return;
    if (dismissedAmpoulePrompts.has(ampoulePromptKey(profile, state))) return;
    requestAmpouleChange();
  }, 450);
}

function requestAmpouleChange({ values = null, resumeId = '', returnDialog = null } = {}) {
  if (appLocked) return false;
  const dialog = document.getElementById('ampoule-replacement-dialog');
  if (!dialog || dialog.open) return false;
  const profile = getActiveProfile();
  const state = getReplacementState(profile);
  const active = getActiveAmpoule();
  const paused = getOpenPausedAmpoules();
  const prepared = values || {
    number: nextAmpouleNumber(Boolean(profile.ampoules.length)),
    date: localDateISO(),
    count: profile.settings.ampouleDoseCount,
    maxDays: profile.settings.ampouleMaxOpenDays,
    volumeMl: profile.settings.ampouleVolumeMl,
    doseMl: getConfiguredAmpouleDoseMl(),
  };
  if (!isValidIsoDate(prepared.date) || prepared.date > localDateISO()) {
    showToast('Sprawdź datę rozpoczęcia ampułki. Nie może być przyszła.', 'error');
    return false;
  }
  const underlying = returnDialog || document.querySelector('dialog[open]');
  pendingAmpouleChange = {
    profileId: profile.id,
    activeId: profile.activeAmpouleId,
    ampouleIds: profile.ampoules.map((item) => item.id).join('|'),
    values: structuredCloneSafe(prepared),
    promptKey: ampoulePromptKey(profile, state),
    returnDialog: underlying,
  };
  if (underlying?.open) underlying.close();
  document.getElementById('replacement-profile').textContent = profile.name;
  document.getElementById('replacement-description').textContent = active
    ? `Ampułka ${active.number} zostanie odłożona. Potwierdź rzeczywistą zmianę wkładu we wstrzykiwaczu.`
    : state.previous
      ? `Ampułka ${state.previous.number} została zużyta (${state.previous.targetDoseCount} podań). Czy ampułka / wkład we wstrzykiwaczu została wymieniona?`
      : 'Potwierdź, że wskazana ampułka / wkład znajduje się we wstrzykiwaczu.';
  const select = document.getElementById('replacement-choice');
  select.innerHTML = `<option value="new">Nowa ampułka ${escapeHtml(String(prepared.number))} · 0/${escapeHtml(String(prepared.count))}</option>` +
    paused.map((item) => `<option value="${escapeHtml(item.id)}">Wznów ampułkę ${item.number} · pozostało ${getAmpouleRemainingDoseCount(item.id)} podań</option>`).join('');
  select.value = paused.some((item) => item.id === resumeId) ? resumeId : 'new';
  const stock = sanitizeInventory(profile.inventory);
  document.getElementById('replacement-stock-note').textContent = stock.enabled
    ? `Zapas nieotwartych: ${stock.unopenedCount}. Nowa ampułka zmniejszy zapas o jedną.${stock.unopenedCount === 0 ? ' Zapas wynosi zero — po wymianie sprawdź i skoryguj licznik.' : ''}`
    : 'Potwierdzenie rozpoczyna licznik. Podanie zapiszesz osobnym przyciskiem.';
  document.getElementById('replacement-confirm').disabled = false;
  dialog.showModal();
  document.getElementById('replacement-defer').focus();
  return true;
}

function closeAmpouleReplacement({ confirmed = false, restoreDialog = true } = {}) {
  const pending = pendingAmpouleChange;
  if (!pending) return;
  dismissedAmpoulePrompts.add(pending.promptKey);
  pendingAmpouleChange = null;
  document.getElementById('ampoule-replacement-dialog')?.close();
  if (restoreDialog && pending.profileId === data.activeProfileId && pending.returnDialog?.isConnected && !appLocked && (!confirmed || pending.returnDialog.id === 'entry-dialog')) {
    pending.returnDialog.showModal();
    if (confirmed && pending.returnDialog.id === 'entry-dialog') refreshEntryAmpouleOptions();
  }
}

function commitAmpouleChange() {
  const pending = pendingAmpouleChange;
  if (!pending || appLocked) return false;
  const button = document.getElementById('replacement-confirm');
  if (button.disabled) return false;
  button.disabled = true;
  const profile = getActiveProfile();
  if (profile.id !== pending.profileId || profile.activeAmpouleId !== pending.activeId ||
      profile.ampoules.map((item) => item.id).join('|') !== pending.ampouleIds) {
    closeAmpouleReplacement();
    showToast('Zmienił się profil lub stan ampułek. Sprawdź dane i ponów potwierdzenie.', 'error');
    return false;
  }
  const before = structuredCloneSafe(profile);
  const choice = document.getElementById('replacement-choice').value;
  let target;
  if (choice === 'new') {
    const values = pending.values;
    const volumeMl = normalizePositiveDecimal(values.volumeMl || profile.settings.ampouleVolumeMl);
    const doseMl = normalizePositiveDecimal(values.doseMl || getConfiguredAmpouleDoseMl());
    if (!volumeMl || !doseMl || !normalizeAmpouleDoseCount(values.count, 0)) {
      button.disabled = false;
      showToast('Sprawdź ustawienia pojemności i liczby podań ampułki.', 'error');
      return false;
    }
    target = createAmpouleRecord({
      number: profile.ampoules.length ? nextAmpouleNumber(true) : values.number,
      startDate: values.date, volumeMl, doseMl, targetDoseCount: values.count, status: 'active',
    });
    target.replacementConfirmedAt = new Date().toISOString();
    const stock = sanitizeInventory(profile.inventory);
    target.stockDeducted = stock.enabled && stock.unopenedCount > 0;
    if (target.stockDeducted) stock.unopenedCount -= 1;
    profile.inventory = stock;
    profile.ampoules.push(target);
  } else {
    target = profile.ampoules.find((item) => item.id === choice);
    if (!target || getProfileAmpouleRemainingDoseCount(profile, target) <= 0) {
      button.disabled = false;
      showToast('Wybrana ampułka nie jest już dostępna.', 'error');
      return false;
    }
    target.lastResumedAt = new Date().toISOString();
  }
  const active = profile.ampoules.find((item) => item.id === profile.activeAmpouleId);
  if (active && active.id !== target.id) active.status = getProfileAmpouleRemainingDoseCount(profile, active) > 0 ? 'paused' : 'finished';
  profile.activeAmpouleId = target.id;
  target.status = 'active';
  target.updatedAt = new Date().toISOString();
  if (!persistData()) {
    Object.assign(profile, before);
    button.disabled = false;
    return false;
  }
  closeAmpouleReplacement({ confirmed: true });
  renderAll();
  showToast(`${choice === 'new' ? 'Rozpoczęto' : 'Wznowiono'} ampułkę ${target.number}. Podanie zapisz osobno.`, 'success');
  return true;
}

function resolveEntryAmpoule(date, existingEntry = null, selectedId = '') {
  if (!isValidIsoDate(date) || date > localDateISO()) return { kind: 'invalid-date' };
  if (existingEntry?.status === 'given' && existingEntry.ampouleId) {
    const ampoule = getAmpouleById(existingEntry.ampouleId);
    return ampoule && date >= ampoule.startDate ? { kind: 'ready', id: ampoule.id } : { kind: 'invalid-date' };
  }
  if (date < localDateISO()) {
    const selected = selectedId ? getAmpouleById(selectedId) : null;
    return selected && selected.startDate <= date
      ? { kind: 'ready', id: selected.id }
      : { kind: 'history-selection' };
  }
  const active = getActiveAmpoule();
  if (active && active.startDate <= date && getAmpouleRemainingDoseCount(active.id) > 0) {
    return { kind: 'ready', id: active.id };
  }
  return { kind: 'confirmation' };
}

function requireAmpouleForEntry(draft, existingEntry = null, selectedId = '') {
  const result = resolveEntryAmpoule(draft.date, existingEntry, selectedId);
  if (result.kind === 'ready') return result.id;
  if (result.kind === 'confirmation') requestAmpouleChange();
  else if (result.kind === 'history-selection') {
    if (!el['entry-dialog'].open) openEntryDialog(existingEntry?.id || null, draft);
    showToast('Wskaż ampułkę używaną w dniu historycznego podania.', 'error');
    document.getElementById('entry-ampoule')?.focus();
  } else showToast('Sprawdź datę podania i datę rozpoczęcia przypisanej ampułki.', 'error');
  return null;
}

function refreshEntryAmpouleOptions(selectedId = '') {
  const select = document.getElementById('entry-ampoule');
  if (!select) return;
  const existing = data.entries.find((item) => item.id === el['entry-id'].value);
  const value = selectedId || existing?.ampouleId || select.value;
  select.innerHTML = '<option value="">Wybierz ampułkę dla wpisu historycznego</option>' + data.ampoules
    .filter((item) => item.startDate <= el['entry-date'].value)
    .map((item) => `<option value="${escapeHtml(item.id)}">Ampułka ${item.number} · od ${escapeHtml(formatDateShort(item.startDate))}</option>`).join('');
  select.value = value;
  const historical = el['entry-date'].value < localDateISO();
  select.closest('label').hidden = !historical;
  select.disabled = !historical || existing?.status === 'given' || el['entry-status'].value !== 'given';
  select.required = historical && !select.disabled;
}

function renderAmpouleLifecycle() {
  const profile = getActiveProfile();
  const state = getReplacementState(profile);
  const banner = document.getElementById('replacement-banner');
  if (banner) {
    banner.hidden = !state.required;
    document.getElementById('replacement-banner-text').textContent = state.required
      ? `Ampułka ${state.previous.number} została zużyta. Potwierdź wymianę przed kolejnym podaniem.` : '';
  }
  const stock = sanitizeInventory(profile.inventory);
  const summary = document.getElementById('inventory-today');
  if (summary) {
    summary.hidden = !stock.enabled;
    summary.classList.toggle('inventory-card--low', stock.unopenedCount <= stock.lowThreshold);
    document.getElementById('inventory-count-label').textContent = `${stock.unopenedCount} ${plural(stock.unopenedCount, 'ampułka', 'ampułki', 'ampułek')}`;
    document.getElementById('inventory-status').textContent = stock.unopenedCount <= stock.lowThreshold
      ? 'Mały zapas — sprawdź, czy potrzebujesz uzupełnienia.' : 'Zapas nieotwartych ampułek';
  }
  if (document.getElementById('inventory-enabled')) {
    document.getElementById('inventory-enabled').checked = stock.enabled;
    document.getElementById('inventory-count').value = stock.unopenedCount;
    document.getElementById('inventory-threshold').value = stock.lowThreshold;
  }
  scheduleAmpouleReplacementPrompt();
}

function saveInventory({ delivery = false } = {}) {
  const profile = getActiveProfile();
  const previous = sanitizeInventory(profile.inventory);
  const count = Number(document.getElementById(delivery ? 'inventory-delivery' : 'inventory-count').value);
  const threshold = Number(document.getElementById('inventory-threshold').value);
  const nextCount = delivery ? previous.unopenedCount + count : count;
  if (!Number.isInteger(count) || count < (delivery ? 1 : 0) || nextCount > 9999 ||
      !Number.isInteger(threshold) || threshold < 0 || threshold > 9999) {
    showToast('Podaj całkowite liczby od 0 do 9999. Dostawa musi być większa od zera.', 'error');
    return false;
  }
  profile.inventory = {
    enabled: delivery ? previous.enabled : document.getElementById('inventory-enabled').checked,
    unopenedCount: nextCount,
    lowThreshold: threshold,
  };
  if (!persistData()) { profile.inventory = previous; return false; }
  if (delivery) document.getElementById('inventory-delivery').value = '';
  renderAll();
  showToast(delivery ? 'Dodano dostawę do zapasu.' : 'Zapisano ustawienia zapasu.', 'success');
  return true;
}

function bindAmpouleLifecycle() {
  document.querySelector('[data-current-ampoule]').addEventListener('click', openAmpouleSettings);
  document.querySelector('[data-inventory-settings]').addEventListener('click', () => openSettingsSection('ampoules'));
  document.getElementById('replacement-confirm').addEventListener('click', commitAmpouleChange);
  document.getElementById('replacement-defer').addEventListener('click', () => closeAmpouleReplacement());
  const dialog = document.getElementById('ampoule-replacement-dialog');
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeAmpouleReplacement(); });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeAmpouleReplacement(); });
  document.getElementById('replacement-open').addEventListener('click', () => requestAmpouleChange());
  document.getElementById('inventory-save').addEventListener('click', () => saveInventory());
  document.getElementById('inventory-add').addEventListener('click', () => saveInventory({ delivery: true }));
  document.getElementById('entry-date').addEventListener('change', () => refreshEntryAmpouleOptions());
  document.getElementById('entry-status').addEventListener('change', () => refreshEntryAmpouleOptions());
  document.addEventListener('close', scheduleAmpouleReplacementPrompt, true);
}


// Potwierdzenie po „Zapisz podanie”: Zapisz / Edytuj / Pomiń.
let pendingDoseSave = null;

function getSaveConfirmDialog() {
  return document.getElementById('save-confirm-dialog');
}

function buildRecommendedDoseDraft() {
  const today = localDateISO();
  if (getEntryForDate(today)) return null;
  const prepared =
    quickDraft.date === today && quickDraft.status === 'given'
      ? quickDraft
      : createInitialQuickDraft();
  const place =
    prepared.side && prepared.site
      ? { side: prepared.side, site: prepared.site }
      : getSuggestedPlace(new Date());
  const dose = normalizeDose(prepared.dose || data.settings.defaultDose);
  if (!place.side || !place.site || !dose) return null;
  return createDefaultDraft({
    date: today,
    time: localTime(),
    dose,
    unit: prepared.unit || data.settings.unit,
    side: place.side,
    site: place.site,
    status: 'given',
  });
}

function buildQuickDoseDraft() {
  if (el['save-button']?.disabled) return null;
  const given = quickDraft.status === 'given';
  if (given && (!quickDraft.side || !quickDraft.site || !normalizeDose(quickDraft.dose))) return null;
  if (getEntryForDate(quickDraft.date, quickDraft.id || '')) return null;
  return { ...quickDraft };
}

function describeDoseDraft(draft) {
  const when = draft.date === localDateISO() ? 'Dzisiaj' : formatDateShort(draft.date);
  if (draft.status !== 'given') return `${when}: pominięcie dawki.`;
  return `${when}: ${formatPlace(draft.side, draft.site)}, ${formatDose(draft.dose)} ${draft.unit || data.settings.unit}.`;
}

function runDoseSave(kind) {
  if (kind === 'recommended') confirmRecommendedInjection();
  else saveQuickDraft();
}

// Otwiera okno potwierdzenia. Gdy danych nie da się zapisać, oddaje sterowanie
// dotychczasowej logice, która pokaże komunikat albo otworzy istniejący wpis.
function requestDoseSave(kind = 'quick') {
  if (appLocked) return;
  const dialog = getSaveConfirmDialog();
  if (dialog?.open) return;
  const draft = kind === 'recommended' ? buildRecommendedDoseDraft() : buildQuickDoseDraft();
  if (!dialog || typeof dialog.showModal !== 'function' || !draft) {
    if (kind === 'quick' && el['save-button']?.disabled) return;
    runDoseSave(kind);
    return;
  }
  pendingDoseSave = { kind, profileId: data.activeProfileId, draft };
  document.getElementById('save-confirm-title').textContent =
    draft.status === 'given' ? 'Zapisać podanie?' : 'Zapisać pominięcie?';
  document.getElementById('save-confirm-summary').textContent = describeDoseDraft(draft);
  dialog.showModal();
  window.setTimeout(() => {
    if (dialog.open) document.getElementById('save-confirm-save')?.focus();
  }, 30);
}

function takePendingDoseSave() {
  const pending = pendingDoseSave;
  pendingDoseSave = null;
  const dialog = getSaveConfirmDialog();
  if (dialog?.open) dialog.close();
  if (!pending || appLocked || pending.profileId !== data.activeProfileId) return null;
  return pending;
}

function confirmPendingDoseSave() {
  const pending = takePendingDoseSave();
  if (pending) runDoseSave(pending.kind);
}

function editPendingDoseSave() {
  const pending = takePendingDoseSave();
  if (!pending) return;
  if (pending.kind === 'recommended') openEntryDialog(null, pending.draft, 'entry-dose');
  else openEntryDialog(quickDraft.id || null, { ...quickDraft }, 'entry-dose');
}

function skipPendingDoseSave() {
  const hadPending = Boolean(pendingDoseSave);
  takePendingDoseSave();
  if (hadPending) showToast('Nie zapisano podania.');
}

function isSaveConfirmOpen() {
  return Boolean(getSaveConfirmDialog()?.open);
}

function bindSaveConfirmDialog() {
  const dialog = getSaveConfirmDialog();
  if (!dialog) return;
  document.getElementById('save-confirm-save').addEventListener('click', confirmPendingDoseSave);
  document.getElementById('save-confirm-edit').addEventListener('click', editPendingDoseSave);
  document.getElementById('save-confirm-skip').addEventListener('click', skipPendingDoseSave);
  // Escape, Wstecz Androida i kliknięcie w tło działają jak „Pomiń”.
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    skipPendingDoseSave();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) skipPendingDoseSave();
  });
  // Każde zamknięcie (także systemowe) czyści oczekujący zapis.
  dialog.addEventListener('close', () => {
    pendingDoseSave = null;
  });
}

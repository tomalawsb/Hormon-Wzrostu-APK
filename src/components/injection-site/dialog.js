
function openPlacePicker() {
  if (quickDraft.status === 'skipped') {
    quickDraft.status = 'given';
    quickDraft.dose = data.settings.defaultDose;
    quickDraft.unit = data.settings.unit;
  }
  renderPlacePickerOptions();
  if (!el['place-picker-dialog'].open) el['place-picker-dialog'].showModal();
}

function closePlacePicker() {
  if (el['place-picker-dialog'].open) el['place-picker-dialog'].close();
}

function renderPlacePickerOptions() {
  el['place-picker-options'].innerHTML = ROTATION.map(([side, site]) => {
    const active = quickDraft.side === side && quickDraft.site === site;
    return `
        <button class="place-option${active ? ' is-active' : ''}" type="button" data-side="${side}" data-site="${site}" aria-pressed="${active ? 'true' : 'false'}">
          <span>${escapeHtml(capitalize(side))}</span>
          <strong>${escapeHtml(capitalize(SITE_LABELS[site] || site))}</strong>
        </button>
      `;
  }).join('');
}

function handlePlacePickerSelection(event) {
  const button = event.target.closest('[data-side][data-site]');
  if (!button) return;
  const side = button.dataset.side;
  const site = button.dataset.site;
  if (!ALLOWED_SIDES.has(side) || !ALLOWED_SITES.has(site)) return;
  quickDraft.side = side;
  quickDraft.site = site;
  quickDraft.status = 'given';
  if (!quickDraft.unit) quickDraft.unit = data.settings.unit;
  if (!quickDraft.dose) quickDraft.dose = data.settings.defaultDose;
  quickDraftTouched = true;
  lastRecognizedText = `Wybrano: ${formatPlace(side, site)}`;
  closePlacePicker();
  renderToday();
  el['save-button'].focus({ preventScroll: true });
}

function openPlaceDetailsFromPicker() {
  closePlacePicker();
  openEntryDialog(quickDraft.id || null, quickDraft, 'entry-site');
}

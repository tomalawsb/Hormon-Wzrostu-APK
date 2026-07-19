
function openEntryForDate(date, focusId = null) {
  const existing = getEntryForDate(date);
  if (existing) {
    showToast('Dla tego dnia istnieje już wpis. Otwieram go do edycji.');
    openEntryDialog(existing.id, null, focusId);
    return;
  }
  openEntryDialog(null, { date }, focusId);
}

function openOrEditSelectedDay() {
  const profile = getCalendarEntryTargetProfile();
  if (profile && profile.id !== data.activeProfileId && !activateProfileForEntryAction(profile.id))
    return;
  openEntryForDate(selectedCalendarDate);
}

function openEntryDialog(entryId = null, draftOverride = null, focusId = null) {
  const entry = entryId ? data.entries.find((item) => item.id === entryId) : null;
  const source = entry
    ? { ...entry, ...(draftOverride || {}) }
    : { ...createDefaultDraft({ time: data.settings.defaultTime }), ...(draftOverride || {}) };
  el['entry-dialog-title'].textContent = entry ? 'Edytuj wpis' : 'Dodaj wpis';
  el['entry-id'].value = source.id || '';
  el['entry-date'].value = source.date || localDateISO();
  el['entry-time'].value = source.time || localTime();
  el['entry-dose'].value = source.dose || data.settings.defaultDose;
  el['entry-unit'].value = source.unit || data.settings.unit;
  el['entry-side'].value = source.side || '';
  el['entry-site'].value = source.site || '';
  el['entry-status'].value = source.status || 'given';
  el['entry-note'].value = source.note || '';
  el['delete-entry-button'].classList.toggle('is-hidden', !entry);
  updateEntryRequirements();
  el['entry-dialog'].showModal();
  window.setTimeout(() => document.getElementById(focusId || 'entry-date')?.focus(), 50);
}

function closeEntryDialog() {
  if (el['entry-dialog'].open) el['entry-dialog'].close();
}

function updateEntryRequirements() {
  const given = el['entry-status'].value === 'given';
  el['entry-side'].required = given;
  el['entry-site'].required = given;
  el['entry-dose'].required = given;
  [el['entry-dose'], el['entry-unit'], el['entry-side'], el['entry-site']].forEach((field) => {
    field.disabled = !given;
    field.closest('.form-field--given-only')?.classList.toggle('is-hidden', !given);
  });
}

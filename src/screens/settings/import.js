
async function importJson(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > MAX_BACKUP_FILE_SIZE * 2)
      throw new Error('Plik jest zbyt duży. Maksymalny rozmiar kopii to 20 MB.');
    const text = await file.text();
    const envelopeOrBackup = JSON.parse(text);
    assertSafeJsonValue(envelopeOrBackup);
    const encrypted = isEncryptedBackupEnvelope(envelopeOrBackup);
    if (!encrypted && file.size > MAX_BACKUP_FILE_SIZE) {
      throw new Error('Jawny plik JSON jest zbyt duży. Maksymalny rozmiar to 10 MB.');
    }
    let parsed = envelopeOrBackup;
    if (encrypted) {
      const password = window.prompt(
        'To starsza, zaszyfrowana kopia .ghbackup. Podaj hasło użyte przy jej tworzeniu:'
      );
      if (password === null) throw new Error('Anulowano odczyt zaszyfrowanej kopii.');
      if (!password) throw new Error('Nie podano hasła do starszej zaszyfrowanej kopii.');
      parsed = await decryptBackupEnvelope(envelopeOrBackup, password);
    }
    assertSafeJsonValue(parsed);
    pendingImportPreview = {
      ...inspectBackupPayload(parsed),
      filename: file.name || (encrypted ? 'kopia.ghbackup' : 'kopia.json'),
      encrypted,
      plainJson: !encrypted,
    };
    renderImportPreview();
  } catch (error) {
    console.error(error);
    pendingImportPreview = null;
    renderImportPreview();
    showToast(`Nie udało się odczytać kopii. ${error.message || ''}`.trim(), 'error', 7000);
  }
}

function renderImportPreview() {
  const container = el['import-preview'];
  if (!container) return;
  if (!pendingImportPreview) {
    container.hidden = true;
    el['import-preview-summary'].textContent = '';
    el['import-preview-profiles'].replaceChildren();
    return;
  }
  const preview = pendingImportPreview;
  const summary = preview.summary;
  const dates = summary.firstEntryDate
    ? `${formatDateShort(summary.firstEntryDate)} – ${formatDateShort(summary.lastEntryDate)}`
    : 'brak wpisów';
  const modeLabel =
    preview.mode === 'add-profile'
      ? 'Profil zostanie dodany do obecnego dzienniczka.'
      : 'Wszystkie obecne profile zostaną zastąpione zawartością kopii.';
  el['import-preview-summary'].innerHTML = `
      <strong>${escapeHtml(preview.filename)}</strong>
      <span>${summary.profileCount} ${plural(summary.profileCount, 'profil', 'profile', 'profili')} · ${summary.entryCount} ${plural(summary.entryCount, 'wpis', 'wpisy', 'wpisów')} · ${summary.ampouleCount} ${plural(summary.ampouleCount, 'ampułka', 'ampułki', 'ampułek')}</span>
      <span>Zakres historii: ${escapeHtml(dates)}</span>
      <span>${preview.legacy ? 'Starszy format — zostanie bezpiecznie zmigrowany.' : `Format kopii ${preview.backupFormatVersion}, schemat danych ${preview.sourceDataVersion || 'nieznany'}.`}</span>`;
  el['import-preview-profiles'].innerHTML = summary.profileNames
    .map((name) => `<li>${escapeHtml(name)}</li>`)
    .join('');
  el['import-preview-warning'].textContent = preview.encrypted
    ? `${modeLabel} To starsza kopia .ghbackup, odszyfrowana podanym hasłem.`
    : `${modeLabel} To kopia JSON bez hasła.`;
  el['import-confirm-button'].textContent =
    preview.mode === 'add-profile' ? 'Dodaj profil' : 'Zastąp wszystkie dane';
  container.hidden = false;
  window.setTimeout(() => el['import-confirm-button']?.focus(), 30);
}

function clearPendingImportPreview() {
  pendingImportPreview = null;
  renderImportPreview();
  el['import-button']?.focus();
}

function saveAutomaticImportBackup(reason = 'przed importem') {
  try {
    const payload = createBackupPayload('all', data.activeProfileId, {
      automatic: true,
      reason,
      savedAt: new Date().toISOString(),
    });
    if (!secureStorageSet(AUTO_IMPORT_BACKUP_KEY, JSON.stringify(payload))) {
      throw new Error('Bezpieczny magazyn odrzucił automatyczną kopię.');
    }
    renderAutomaticBackupState();
    return true;
  } catch (error) {
    console.error('Nie udało się utworzyć automatycznej kopii przed importem:', error);
    showToast(
      'Nie można utworzyć automatycznej kopii bezpieczeństwa. Import został przerwany.',
      'error',
      7000
    );
    return false;
  }
}

function readAutomaticImportBackup() {
  const raw = safeStorageGet(AUTO_IMPORT_BACKUP_KEY);
  if (!raw) return null;
  try {
    return { raw, inspection: inspectBackupPayload(JSON.parse(raw)) };
  } catch (error) {
    console.warn('Automatyczna kopia importu jest uszkodzona:', error);
    secureStorageRemove(AUTO_IMPORT_BACKUP_KEY);
    return null;
  }
}

function renderAutomaticBackupState() {
  if (!el['restore-auto-backup-button']) return;
  const stored = readAutomaticImportBackup();
  el['restore-auto-backup-button'].hidden = !stored;
  if (!stored) {
    el['auto-backup-summary'].textContent = 'Brak lokalnej kopii utworzonej przed importem.';
    return;
  }
  const payload = stored.inspection.parsed;
  const savedAt = payload.savedAt || payload.exportedAt;
  const dateLabel = isValidDateTime(savedAt)
    ? new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short' }).format(
        new Date(savedAt)
      )
    : 'nieznana data';
  el['auto-backup-summary'].textContent = `Ostatnia kopia bezpieczeństwa: ${dateLabel}.`;
}

function createUniqueImportedProfile(profile) {
  const clone = JSON.parse(JSON.stringify(profile));
  const usedIds = new Set(data.profiles.map((item) => item.id));
  const baseId = sanitizeProfileId(clone.id) || `profile-import-${Date.now()}`;
  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
  clone.id = id;
  clone.archivedAt = '';
  clone.updatedAt = new Date().toISOString();

  const usedNames = new Set(data.profiles.map((item) => normalizeText(item.name)));
  const baseName = sanitizeProfileName(clone.name) || 'Zaimportowane dziecko';
  let name = baseName;
  let nameSuffix = 2;
  while (usedNames.has(normalizeText(name))) name = `${baseName} (import ${nameSuffix++})`;
  clone.name = name;
  return normalizeStoredData({
    version: DATA_SCHEMA_VERSION,
    activeProfileId: id,
    profiles: [clone],
  }).data.profiles[0];
}

function applyInspectedImport(preview, { createSafetyBackup = true } = {}) {
  if (!preview) return false;
  if (
    createSafetyBackup &&
    !saveAutomaticImportBackup(
      preview.mode === 'add-profile' ? 'przed dodaniem profilu' : 'przed zastąpieniem danych'
    )
  )
    return false;
  const previousData = data;
  const currentDeviceSecurity = structuredCloneSafe(getSecuritySettings());
  try {
    if (preview.mode === 'add-profile') {
      if (data.profiles.length >= MAX_PROFILES)
        throw new Error(`Osiągnięto limit ${MAX_PROFILES} profili.`);
      const incoming = createUniqueImportedProfile(preview.normalized.data.profiles[0]);
      const next = JSON.parse(JSON.stringify(data));
      next.profiles.push(incoming);
      next.activeProfileId = incoming.id;
      data = attachActiveProfileAliases(normalizeStoredData(next).data);
    } else {
      data = attachActiveProfileAliases(preview.normalized.data);
      data.appSettings.security = currentDeviceSecurity;
      data.meta.onboardingCompleted = true;
    }
    if (!persistData()) {
      data = previousData;
      return false;
    }
    resetQuickDraftForToday();
    calendarProfileScope = data.activeProfileId;
    historyProfileScope = data.activeProfileId;
    reportProfileScope = data.activeProfileId;
    renderAll();
    scheduleDailyReminder();
    syncReminderStateWithServiceWorker();
    showToast(
      preview.mode === 'add-profile'
        ? `Dodano profil „${getActiveProfile().name}”.`
        : preview.normalized.migratedFromLegacy
          ? 'Stara kopia została zaimportowana i przypisana do profilu „Dziecko 1”.'
          : 'Pełna kopia wszystkich profili została przywrócona.',
      'success',
      6500
    );
    return true;
  } catch (error) {
    data = previousData;
    console.error(error);
    showToast(`Nie udało się przywrócić kopii. ${error.message || ''}`.trim(), 'error', 7000);
    return false;
  }
}

function confirmPendingImport() {
  if (!pendingImportPreview) return;
  const preview = pendingImportPreview;
  const actionText =
    preview.mode === 'add-profile'
      ? `Dodać profil „${preview.summary.profileNames[0]}” do dzienniczka?`
      : `Zastąpić wszystkie obecne dane kopią zawierającą ${preview.summary.profileCount} ${plural(preview.summary.profileCount, 'profil', 'profile', 'profili')}?`;
  if (!window.confirm(actionText)) return;
  if (applyInspectedImport(preview)) {
    pendingImportPreview = null;
    renderImportPreview();
    renderAutomaticBackupState();
  }
}

function restoreAutomaticImportBackup() {
  const stored = readAutomaticImportBackup();
  if (!stored) {
    renderAutomaticBackupState();
    showToast('Brak automatycznej kopii do przywrócenia.');
    return;
  }
  if (!window.confirm('Przywrócić stan aplikacji zapisany automatycznie przed ostatnim importem?'))
    return;
  const preview = {
    ...stored.inspection,
    mode: 'replace-all',
    filename: 'automatyczna kopia bezpieczeństwa',
  };
  if (applyInspectedImport(preview, { createSafetyBackup: false })) {
    secureStorageRemove(AUTO_IMPORT_BACKUP_KEY);
    renderAutomaticBackupState();
    clearPendingImportPreview();
  }
}

function closeBackupPanel() {
  clearPendingImportPreview();
  closeDataDialog(el['backup-dialog']);
}

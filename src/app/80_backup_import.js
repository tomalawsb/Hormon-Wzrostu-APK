  function exportJson() {
    exportBackupScope('all');
  }

  function exportActiveProfileJson() {
    exportBackupScope('profile');
  }

  function exportBackupScope(scope = 'all') {
    const activeProfile = getActiveProfile();
    const payload = createBackupPayload(scope, activeProfile.id);
    const filename = scope === 'profile'
      ? `dzienniczek-profil-${safeFilenamePart(activeProfile.name)}-${localDateISO()}.json`
      : `dzienniczek-kopia-${localDateISO()}.json`;
    downloadFile(filename, JSON.stringify(payload, null, 2), 'application/json');
    try { localStorage.setItem(BACKUP_REMINDER_KEY, String(Date.now())); } catch (error) { console.warn(error); }
    showToast(scope === 'profile'
      ? `Pobrano kopię profilu „${activeProfile.name}”.`
      : 'Pobrano pełną kopię wszystkich profili.', 'success');
  }

  function createBackupPayload(scope = 'all', profileId = data.activeProfileId, extra = {}) {
    const exportedAt = new Date().toISOString();
    let backupData;
    let profileDescriptor = null;
    if (scope === 'profile') {
      const profile = getProfileById(profileId);
      if (!profile) throw new Error('Nie znaleziono profilu do eksportu.');
      const profileClone = JSON.parse(JSON.stringify(profile));
      backupData = {
        version: DATA_SCHEMA_VERSION,
        appSettings: {},
        appMeta: { onboardingCompleted: true },
        activeProfileId: profileClone.id,
        profiles: [profileClone]
      };
      profileDescriptor = { id: profileClone.id, name: profileClone.name };
    } else {
      backupData = JSON.parse(JSON.stringify(data));
    }
    const summary = summarizeBackupData(backupData);
    return {
      application: 'Dzienniczek Hormonu',
      backupFormatVersion: BACKUP_FORMAT_VERSION,
      sourceDataVersion: DATA_SCHEMA_VERSION,
      exportedAt,
      scope: scope === 'profile' ? 'profile' : 'all',
      profile: profileDescriptor,
      summary,
      ...extra,
      data: backupData
    };
  }

  function summarizeBackupData(value) {
    const profiles = Array.isArray(value?.profiles) ? value.profiles : [];
    const entries = profiles.flatMap((profile) => Array.isArray(profile.entries) ? profile.entries : []);
    const ampoules = profiles.flatMap((profile) => Array.isArray(profile.ampoules) ? profile.ampoules : []);
    const dates = entries.map((entry) => entry.date).filter(isValidIsoDate).sort();
    return {
      profileCount: profiles.length,
      entryCount: entries.length,
      ampouleCount: ampoules.length,
      firstEntryDate: dates[0] || '',
      lastEntryDate: dates.at(-1) || ''
    };
  }

  function inspectImportedData(imported) {
    if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
      throw new Error('Nieprawidłowa struktura pliku.');
    }
    const profiles = Array.isArray(imported.profiles)
      ? imported.profiles
      : (Array.isArray(imported.entries) ? [{ name: DEFAULT_PROFILE_NAME, entries: imported.entries, ampoules: imported.ampoules }] : null);
    if (!profiles) throw new Error('Nieprawidłowa struktura pliku.');
    if (profiles.length === 0) throw new Error('Kopia nie zawiera żadnego profilu.');
    if (profiles.length > MAX_PROFILES) throw new Error(`Kopia zawiera więcej niż ${MAX_PROFILES} profili.`);

    const rawProfileIds = new Set();
    const profileNames = [];
    let entryCount = 0;
    let ampouleCount = 0;
    let archivedProfileCount = 0;
    const entryDates = [];

    profiles.forEach((profile, index) => {
      if (!profile || typeof profile !== 'object' || Array.isArray(profile) || !Array.isArray(profile.entries)) {
        throw new Error(`Profil ${index + 1} nie zawiera prawidłowej historii.`);
      }
      if (profile.entries.length > 50000) throw new Error(`Profil ${index + 1} zawiera zbyt wiele wpisów.`);
      const sanitizedEntries = profile.entries.map(sanitizeEntry).filter(Boolean);
      if (sanitizedEntries.length !== profile.entries.length) {
        throw new Error(`Profil ${index + 1} zawiera nieprawidłowe lub niekompletne wpisy.`);
      }
      const unique = keepOneEntryPerDate(sanitizedEntries);
      if (unique.removedDuplicates > 0) {
        throw new Error(`Profil ${index + 1} zawiera więcej niż jeden wpis dla tego samego dnia. Usuń duplikaty przed importem.`);
      }

      if (profile.id) {
        const profileId = sanitizeProfileId(profile.id);
        if (!profileId) throw new Error(`Profil ${index + 1} ma nieprawidłowy identyfikator.`);
        if (rawProfileIds.has(profileId)) throw new Error('Kopia zawiera zduplikowane identyfikatory profili.');
        rawProfileIds.add(profileId);
      }

      const ampouleIds = new Set();
      if (profile.ampoules !== undefined) {
        if (!Array.isArray(profile.ampoules)) throw new Error(`Profil ${index + 1} ma nieprawidłową listę ampułek.`);
        if (profile.ampoules.length > 10000) throw new Error(`Profil ${index + 1} zawiera zbyt wiele ampułek.`);
        profile.ampoules.forEach((ampoule) => {
          const sanitized = sanitizeAmpoule(ampoule);
          if (!sanitized) throw new Error(`Profil ${index + 1} zawiera nieprawidłową ampułkę.`);
          if (ampouleIds.has(sanitized.id)) throw new Error(`Profil ${index + 1} zawiera zduplikowane identyfikatory ampułek.`);
          ampouleIds.add(sanitized.id);
        });
        ampouleCount += profile.ampoules.length;
      }

      profile.entries.forEach((entry, entryIndex) => {
        const referencedAmpouleId = entry?.ampouleId;
        if (referencedAmpouleId === undefined || referencedAmpouleId === null || referencedAmpouleId === '') return;
        if (typeof referencedAmpouleId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(referencedAmpouleId)) {
          throw new Error(`Profil ${index + 1}, wpis ${entryIndex + 1} ma nieprawidłowe powiązanie z ampułką.`);
        }
        if (!ampouleIds.has(referencedAmpouleId)) {
          throw new Error(`Profil ${index + 1}, wpis ${entryIndex + 1} wskazuje nieistniejącą ampułkę „${referencedAmpouleId}”.`);
        }
      });

      const activeAmpouleId = profile.activeAmpouleId;
      if (activeAmpouleId !== undefined && activeAmpouleId !== null && activeAmpouleId !== '') {
        if (typeof activeAmpouleId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(activeAmpouleId)) {
          throw new Error(`Profil ${index + 1} ma nieprawidłowy identyfikator aktywnej ampułki.`);
        }
        if (!ampouleIds.has(activeAmpouleId)) {
          throw new Error(`Profil ${index + 1} wskazuje nieistniejącą aktywną ampułkę „${activeAmpouleId}”.`);
        }
      }

      if (profile.injectionOrder !== undefined) {
        if (!Array.isArray(profile.injectionOrder)) throw new Error(`Profil ${index + 1} ma nieprawidłową kolejność miejsc wkłucia.`);
        if (profile.injectionOrder.length > 100) throw new Error(`Profil ${index + 1} ma zbyt długą kolejność miejsc wkłucia.`);
        const invalidOrderItem = profile.injectionOrder.some((item) => !item || typeof item !== 'object' || !ALLOWED_SIDES.has(item.side) || !ALLOWED_SITES.has(item.site));
        if (invalidOrderItem) throw new Error(`Profil ${index + 1} zawiera nieprawidłowe miejsce wkłucia.`);
      }

      entryCount += unique.entries.length;
      entryDates.push(...unique.entries.map((entry) => entry.date));
      if (profile.archivedAt) archivedProfileCount += 1;
      profileNames.push(sanitizeProfileName(profile.name) || `Dziecko ${index + 1}`);
    });

    entryDates.sort();
    return {
      profileCount: profiles.length,
      entryCount,
      ampouleCount,
      archivedProfileCount,
      profileNames,
      firstEntryDate: entryDates[0] || '',
      lastEntryDate: entryDates.at(-1) || ''
    };
  }

  function inspectBackupPayload(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Plik JSON nie zawiera obiektu danych.');
    const imported = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
    const declaredFormat = Number(parsed.backupFormatVersion || 0);
    const declaredSourceDataVersion = Number(parsed.sourceDataVersion || 0);
    const importedDataVersion = Number(imported.version || 0);
    const sourceDataVersion = declaredSourceDataVersion || importedDataVersion;
    if (Number.isFinite(declaredFormat) && declaredFormat > BACKUP_FORMAT_VERSION) {
      throw new Error(`Kopia używa nowszego formatu (${declaredFormat}). Zaktualizuj aplikację przed importem.`);
    }
    const newerDataVersion = [declaredSourceDataVersion, importedDataVersion]
      .find((version) => Number.isFinite(version) && version > DATA_SCHEMA_VERSION);
    if (newerDataVersion !== undefined) {
      throw new Error(`Kopia pochodzi z nowszego schematu danych (${newerDataVersion}). Zaktualizuj aplikację przed importem.`);
    }
    const summary = inspectImportedData(imported);
    const normalized = normalizeStoredData(imported);
    const declaredScope = parsed.scope === 'profile' ? 'profile' : 'all';
    const mode = declaredFormat >= 2 && declaredScope === 'profile' ? 'add-profile' : 'replace-all';
    if (mode === 'add-profile' && summary.profileCount !== 1) {
      throw new Error('Kopia pojedynczego profilu musi zawierać dokładnie jeden profil.');
    }
    return {
      parsed,
      imported,
      normalized,
      summary,
      mode,
      sourceDataVersion,
      backupFormatVersion: declaredFormat,
      exportedAt: isValidDateTime(parsed.exportedAt) ? parsed.exportedAt : '',
      legacy: !Array.isArray(imported.profiles) || declaredFormat < BACKUP_FORMAT_VERSION
    };
  }

  async function importJson(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_FILE_SIZE) throw new Error('Plik jest zbyt duży. Maksymalny rozmiar to 10 MB.');
      const text = await file.text();
      const parsed = JSON.parse(text);
      pendingImportPreview = { ...inspectBackupPayload(parsed), filename: file.name || 'kopia.json' };
      renderImportPreview();
    } catch (error) {
      console.error(error);
      pendingImportPreview = null;
      renderImportPreview();
      showToast(`Nie udało się odczytać pliku JSON. ${error.message || ''}`.trim(), 'error', 7000);
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
    const modeLabel = preview.mode === 'add-profile'
      ? 'Profil zostanie dodany do obecnego dzienniczka.'
      : 'Wszystkie obecne profile zostaną zastąpione zawartością kopii.';
    el['import-preview-summary'].innerHTML = `
      <strong>${escapeHtml(preview.filename)}</strong>
      <span>${summary.profileCount} ${plural(summary.profileCount, 'profil', 'profile', 'profili')} · ${summary.entryCount} ${plural(summary.entryCount, 'wpis', 'wpisy', 'wpisów')} · ${summary.ampouleCount} ${plural(summary.ampouleCount, 'ampułka', 'ampułki', 'ampułek')}</span>
      <span>Zakres historii: ${escapeHtml(dates)}</span>
      <span>${preview.legacy ? 'Starszy format — zostanie bezpiecznie zmigrowany.' : `Format kopii ${preview.backupFormatVersion}, schemat danych ${preview.sourceDataVersion || 'nieznany'}.`}</span>`;
    el['import-preview-profiles'].innerHTML = summary.profileNames.map((name) => `<li>${escapeHtml(name)}</li>`).join('');
    el['import-preview-warning'].textContent = modeLabel;
    el['import-confirm-button'].textContent = preview.mode === 'add-profile' ? 'Dodaj profil' : 'Zastąp wszystkie dane';
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
        savedAt: new Date().toISOString()
      });
      localStorage.setItem(AUTO_IMPORT_BACKUP_KEY, JSON.stringify(payload));
      renderAutomaticBackupState();
      return true;
    } catch (error) {
      console.error('Nie udało się utworzyć automatycznej kopii przed importem:', error);
      showToast('Nie można utworzyć automatycznej kopii bezpieczeństwa. Import został przerwany.', 'error', 7000);
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
      try { localStorage.removeItem(AUTO_IMPORT_BACKUP_KEY); } catch {}
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
      ? new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(savedAt))
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
    return normalizeStoredData({ version: DATA_SCHEMA_VERSION, activeProfileId: id, profiles: [clone] }).data.profiles[0];
  }

  function applyInspectedImport(preview, { createSafetyBackup = true } = {}) {
    if (!preview) return false;
    if (createSafetyBackup && !saveAutomaticImportBackup(preview.mode === 'add-profile' ? 'przed dodaniem profilu' : 'przed zastąpieniem danych')) return false;
    const previousData = data;
    try {
      if (preview.mode === 'add-profile') {
        if (data.profiles.length >= MAX_PROFILES) throw new Error(`Osiągnięto limit ${MAX_PROFILES} profili.`);
        const incoming = createUniqueImportedProfile(preview.normalized.data.profiles[0]);
        const next = JSON.parse(JSON.stringify(data));
        next.profiles.push(incoming);
        next.activeProfileId = incoming.id;
        data = attachActiveProfileAliases(normalizeStoredData(next).data);
      } else {
        data = attachActiveProfileAliases(preview.normalized.data);
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
      showToast(preview.mode === 'add-profile'
        ? `Dodano profil „${getActiveProfile().name}”.`
        : (preview.normalized.migratedFromLegacy
          ? 'Stara kopia została zaimportowana i przypisana do profilu „Dziecko 1”.'
          : 'Pełna kopia wszystkich profili została przywrócona.'), 'success', 6500);
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
    const actionText = preview.mode === 'add-profile'
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
    if (!window.confirm('Przywrócić stan aplikacji zapisany automatycznie przed ostatnim importem?')) return;
    const preview = { ...stored.inspection, mode: 'replace-all', filename: 'automatyczna kopia bezpieczeństwa' };
    if (applyInspectedImport(preview, { createSafetyBackup: false })) {
      try { localStorage.removeItem(AUTO_IMPORT_BACKUP_KEY); } catch {}
      renderAutomaticBackupState();
      clearPendingImportPreview();
    }
  }

  function closeBackupPanel() {
    clearPendingImportPreview();
    closeDataDialog(el['backup-dialog']);
  }

  function exportCsv() {
    const config = getReportConfiguration();
    if (!config) return false;
    const columns = getReportColumns(config);
    const header = columns.map((column) => column.label);
    const rows = config.records.map((record) => columns.map((column) => getReportRecordValue(record, column.key)));
    const csv = '\uFEFF' + [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
    downloadFile(`dzienniczek-historia-${getReportFilenameScope(config)}-${localDateISO()}.csv`, csv, 'text/csv;charset=utf-8');
    showToast('Pobrano historię CSV.', 'success');
    return true;
  }

  function clearAllEntries() {
    if (!data.entries.length) {
      showToast('Historia jest już pusta.');
      return;
    }
    if (!window.confirm(`Usunąć wszystkie wpisy profilu „${getActiveProfile().name}”? Dane innych profili pozostaną bez zmian. Tej operacji nie można cofnąć.`)) return;
    const previousEntries = data.entries;
    data.entries = [];
    reconcileAmpouleStatuses();
    if (!persistData()) {
      data.entries = previousEntries;
      return;
    }
    resetQuickDraftForToday();
    renderAll();
    showToast(`Usunięto wszystkie wpisy profilu ${getActiveProfile().name}.`, 'success');
  }


  function maybeScheduleBackupReminder() {
    let lastReminder = 0;
    try {
      lastReminder = Number(localStorage.getItem(BACKUP_REMINDER_KEY) || 0);
    } catch (error) {
      console.warn(error);
      return;
    }

    const now = Date.now();
    if (!Number.isFinite(lastReminder) || lastReminder <= 0) {
      try { localStorage.setItem(BACKUP_REMINDER_KEY, String(now)); } catch (error) { console.warn(error); }
      return;
    }
    if (now - lastReminder < BACKUP_REMINDER_INTERVAL_MS) return;

    try { localStorage.setItem(BACKUP_REMINDER_KEY, String(now)); } catch (error) { console.warn(error); }
    window.setTimeout(() => {
      const accepted = window.confirm('Minęły 3 dni od ostatniego przypomnienia o kopii zapasowej. Czy pobrać teraz pełną kopię danych?');
      if (accepted) exportJson();
      else showToast('Przypomnę ponownie za 3 dni.', 'success');
    }, 1200);
  }

async function exportJson() {
  await exportBackupScope('all');
}

async function exportActiveProfileJson() {
  await exportBackupScope('profile');
}

async function exportBackupScope(scope = 'all') {
  try {
    const usePassword = Boolean(el['backup-encryption-toggle']?.checked);
    const activeProfile = getActiveProfile();
    const payload = createBackupPayload(scope, activeProfile.id);
    let exportedPayload = payload;
    let extension = 'json';
    if (usePassword) {
      const password = String(el['backup-password']?.value || '');
      const confirmation = String(el['backup-password-confirm']?.value || '');
      validateBackupPassword(password);
      if (password !== confirmation) throw new Error('Wpisane hasła nie są takie same.');
      exportedPayload = await encryptBackupPayload(payload, password);
      extension = 'ghbackup';
    }
    const filename =
      scope === 'profile'
        ? `dzienniczek-profil-${safeFilenamePart(activeProfile.name)}-${localDateISO()}.${extension}`
        : `dzienniczek-kopia-${localDateISO()}.${extension}`;
    await downloadFile(filename, JSON.stringify(exportedPayload, null, 2), 'application/json');
    await flushSecureStorageWrites();
    try {
      localStorage.setItem(BACKUP_REMINDER_KEY, String(Date.now()));
    } catch (error) {
      console.warn(error);
    }
    showToast(
      scope === 'profile'
        ? `Pobrano ${usePassword ? 'zaszyfrowaną ' : ''}kopię profilu „${activeProfile.name}”.`
        : `Pobrano ${usePassword ? 'zaszyfrowaną ' : ''}kopię wszystkich profili.`,
      'success'
    );
    resetBackupEncryptionChoice();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Nie udało się utworzyć kopii zapasowej.', 'error', 7000);
  }
}

function updateBackupEncryptionFields() {
  const enabled = Boolean(el['backup-encryption-toggle']?.checked);
  if (el['backup-password-fields']) el['backup-password-fields'].hidden = !enabled;
  el['backup-encryption-toggle']?.setAttribute('aria-expanded', enabled ? 'true' : 'false');
  if (!enabled) {
    if (el['backup-password']) el['backup-password'].value = '';
    if (el['backup-password-confirm']) el['backup-password-confirm'].value = '';
  }
}

function resetBackupEncryptionChoice() {
  if (el['backup-encryption-toggle']) el['backup-encryption-toggle'].checked = false;
  updateBackupEncryptionFields();
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
      appSettings: { security: defaultSecuritySettings() },
      appMeta: { onboardingCompleted: true },
      activeProfileId: profileClone.id,
      profiles: [profileClone],
    };
    profileDescriptor = { id: profileClone.id, name: profileClone.name };
  } else {
    backupData = JSON.parse(JSON.stringify(data));
  }
  backupData.appSettings = {
    ...(backupData.appSettings || {}),
    security: defaultSecuritySettings(),
  };
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
    data: backupData,
  };
}

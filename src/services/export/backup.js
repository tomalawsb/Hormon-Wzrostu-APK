async function exportJson() {
  await exportBackupScope('all');
}

async function exportActiveProfileJson() {
  await exportBackupScope('profile');
}

async function exportBackupScope(scope = 'all') {
  const password = String(el['backup-password']?.value || '');
  const confirmation = String(el['backup-password-confirm']?.value || '');
  try {
    validateBackupPassword(password);
    if (password !== confirmation) throw new Error('Hasło i jego powtórzenie nie są takie same.');
    const activeProfile = getActiveProfile();
    const payload = createBackupPayload(scope, activeProfile.id);
    const encrypted = await encryptBackupPayload(payload, password);
    const filename =
      scope === 'profile'
        ? `dzienniczek-profil-${safeFilenamePart(activeProfile.name)}-${localDateISO()}.ghbackup`
        : `dzienniczek-kopia-${localDateISO()}.ghbackup`;
    downloadFile(filename, JSON.stringify(encrypted, null, 2), 'application/json');
    await flushSecureStorageWrites();
    try {
      localStorage.setItem(BACKUP_REMINDER_KEY, String(Date.now()));
    } catch (error) {
      console.warn(error);
    }
    if (el['backup-password-confirm']) el['backup-password-confirm'].value = '';
    showToast(
      scope === 'profile'
        ? `Pobrano zaszyfrowaną kopię profilu „${activeProfile.name}”.`
        : 'Pobrano zaszyfrowaną kopię wszystkich profili.',
      'success'
    );
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Nie udało się zaszyfrować kopii.', 'error', 7000);
  }
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


function resetRuntimeStateAfterSecureLoad() {
  todayDashboardMode = getAvailableProfiles().length > 1 ? 'all' : 'profile';
  calendarProfileScope = data.activeProfileId;
  historyProfileScope = data.activeProfileId;
  reportProfileScope = data.activeProfileId;
  quickDraft = createInitialQuickDraft();
  quickDraftTouched = false;
}

function bindSecurityEvents() {
  if (securityEventsBound) return;
  securityEventsBound = true;
  el['security-pin-form']?.addEventListener('submit', saveSecurityPin);
  el['security-remove-pin-button']?.addEventListener('click', removeSecurityPin);
  el['security-biometric-button']?.addEventListener('click', toggleBiometricUnlock);
  el['security-auto-lock']?.addEventListener('change', saveAutoLockSetting);
  el['security-lock-now-button']?.addEventListener('click', () => lockApplication('manual'));
  el['security-unlock-form']?.addEventListener('submit', unlockWithPin);
  el['security-unlock-biometric']?.addEventListener('click', unlockWithBiometrics);

  const background = () => handleSecurityBackground();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') background();
    else handleSecurityForeground();
  });
  window.addEventListener('pagehide', background);
  window.addEventListener('nativeAppBackgrounded', background);
  window.addEventListener('nativeAppResume', handleSecurityForeground);
  window.addEventListener('focus', handleSecurityForeground);
}

function renderSecuritySettings() {
  const settings = getSecuritySettings();
  if (el['security-storage-status']) {
    el['security-storage-status'].textContent = secureStorageFailed
      ? 'Błąd bezpiecznego magazynu'
      : secureStorageTypeLabel;
  }
  if (el['security-pin-status']) {
    el['security-pin-status'].textContent = settings.pinEnabled
      ? 'PIN jest włączony'
      : 'PIN jest wyłączony';
  }
  if (el['security-current-pin-wrap']) {
    el['security-current-pin-wrap'].hidden = !settings.pinEnabled;
  }
  if (el['security-pin-submit-button']) {
    el['security-pin-submit-button'].textContent = settings.pinEnabled ? 'Zmień PIN' : 'Włącz PIN';
  }
  if (el['security-remove-pin-button']) {
    el['security-remove-pin-button'].hidden = !settings.pinEnabled;
  }
  if (el['security-auto-lock']) {
    el['security-auto-lock'].value = String(settings.autoLockMinutes);
    el['security-auto-lock'].disabled = !settings.pinEnabled;
  }
  if (el['security-lock-now-button'])
    el['security-lock-now-button'].disabled = !settings.pinEnabled;

  const biometricState = window.NativeBridge?.biometricStatus?.() || 'unsupported';
  if (el['security-biometric-status']) {
    el['security-biometric-status'].textContent =
      biometricState === 'available'
        ? settings.biometricEnabled
          ? 'Biometria jest włączona'
          : 'Biometria jest dostępna'
        : 'Biometria jest dostępna tylko w zgodnym APK na Androidzie';
  }
  if (el['security-biometric-button']) {
    el['security-biometric-button'].hidden = biometricState !== 'available';
    el['security-biometric-button'].disabled = !settings.pinEnabled;
    el['security-biometric-button'].textContent = settings.biometricEnabled
      ? 'Wyłącz biometrię'
      : 'Włącz biometrię';
  }
  if (el['security-unlock-biometric']) {
    el['security-unlock-biometric'].hidden = !(
      settings.biometricEnabled && biometricState === 'available'
    );
  }
}

async function saveSecurityPin(event) {
  event.preventDefault();
  const settings = getSecuritySettings();
  const currentPin = String(el['security-current-pin']?.value || '');
  const newPin = String(el['security-new-pin']?.value || '');
  const confirmation = String(el['security-confirm-pin']?.value || '');
  try {
    if (settings.pinEnabled && !(await verifyPin(currentPin))) {
      throw new Error('Obecny PIN jest nieprawidłowy.');
    }
    validatePin(newPin);
    if (newPin !== confirmation) throw new Error('Nowy PIN i powtórzenie nie są takie same.');
    const salt = await randomBase64(16);
    const hash = await derivePinHash(newPin, salt);
    if (!salt || !hash) throw new Error('Nie udało się utworzyć zabezpieczenia PIN.');
    data.appSettings.security = {
      ...settings,
      pinEnabled: true,
      pinSalt: salt,
      pinHash: hash,
    };
    if (!persistData()) throw new Error('Nie udało się zapisać PIN-u.');
    clearSecurityPinFields();
    renderSecuritySettings();
    showToast('PIN aplikacji został zapisany.', 'success');
  } catch (error) {
    showToast(error.message || 'Nie udało się zapisać PIN-u.', 'error', 7000);
  }
}

async function removeSecurityPin() {
  const currentPin = String(el['security-current-pin']?.value || '');
  if (!(await verifyPin(currentPin))) {
    showToast('Wpisz prawidłowy obecny PIN, aby wyłączyć blokadę.', 'error');
    return;
  }
  if (!window.confirm('Wyłączyć PIN, biometrię i automatyczną blokadę aplikacji?')) return;
  data.appSettings.security = defaultSecuritySettings();
  if (!persistData()) return;
  clearSecurityPinFields();
  renderSecuritySettings();
  setApplicationLocked(false);
  showToast('Blokada aplikacji została wyłączona.', 'success');
}

async function toggleBiometricUnlock() {
  const settings = getSecuritySettings();
  if (!settings.pinEnabled) {
    showToast('Najpierw ustaw PIN awaryjny.', 'error');
    return;
  }
  if (settings.biometricEnabled) {
    settings.biometricEnabled = false;
    persistData();
    renderSecuritySettings();
    showToast('Odblokowanie biometrią zostało wyłączone.', 'success');
    return;
  }
  const result = await window.NativeBridge?.requestBiometricUnlock?.();
  if (!result?.success) {
    showToast('Nie potwierdzono biometrii.', 'error');
    return;
  }
  settings.biometricEnabled = true;
  persistData();
  renderSecuritySettings();
  showToast('Odblokowanie biometrią zostało włączone.', 'success');
}

function saveAutoLockSetting() {
  const settings = getSecuritySettings();
  settings.autoLockMinutes = sanitizeSecuritySettings({
    ...settings,
    autoLockMinutes: Number(el['security-auto-lock']?.value),
  }).autoLockMinutes;
  if (persistData()) showToast('Czas automatycznej blokady został zapisany.', 'success');
  renderSecuritySettings();
}

function enforceInitialSecurityLock() {
  const settings = getSecuritySettings();
  setApplicationLocked(settings.pinEnabled);
  document.documentElement.classList.remove('security-pending');
  renderSecuritySettings();
}

function handleSecurityBackground() {
  appBackgroundedAt = Date.now();
  document.documentElement.classList.add('security-private');
  if (el['security-privacy-cover']) el['security-privacy-cover'].hidden = false;
}

function handleSecurityForeground() {
  const settings = getSecuritySettings();
  if (!appBackgroundedAt) {
    if (!appLocked) hidePrivacyCover();
    return;
  }
  const elapsed = Date.now() - appBackgroundedAt;
  appBackgroundedAt = 0;
  const threshold = settings.autoLockMinutes * 60 * 1000;
  if (settings.pinEnabled && (settings.autoLockMinutes === 0 || elapsed >= threshold)) {
    lockApplication('timeout');
  } else if (!appLocked) {
    hidePrivacyCover();
  }
}

function lockApplication(reason = 'manual') {
  if (!getSecuritySettings().pinEnabled) return;
  setApplicationLocked(true);
  if (el['security-unlock-message']) {
    el['security-unlock-message'].textContent =
      reason === 'timeout'
        ? 'Aplikacja została automatycznie zablokowana.'
        : 'Wpisz PIN, aby kontynuować.';
  }
}

function setApplicationLocked(locked) {
  appLocked = Boolean(locked);
  document.documentElement.classList.toggle('security-locked', appLocked);
  const appShell = document.querySelector('.app-shell');
  if (appShell) appShell.inert = appLocked;
  if (el['security-lock-screen']) el['security-lock-screen'].hidden = !appLocked;
  if (appLocked) {
    document.documentElement.classList.add('security-private');
    if (el['security-privacy-cover']) el['security-privacy-cover'].hidden = false;
    window.setTimeout(() => el['security-unlock-pin']?.focus(), 40);
  } else {
    failedUnlockAttempts = 0;
    unlockBlockedUntil = 0;
    if (el['security-unlock-pin']) el['security-unlock-pin'].value = '';
    if (el['security-unlock-error']) el['security-unlock-error'].textContent = '';
    hidePrivacyCover();
  }
}

function hidePrivacyCover() {
  document.documentElement.classList.remove('security-private');
  if (el['security-privacy-cover']) el['security-privacy-cover'].hidden = true;
}

async function unlockWithPin(event) {
  event.preventDefault();
  const remaining = unlockBlockedUntil - Date.now();
  if (remaining > 0) {
    setUnlockError(`Spróbuj ponownie za ${Math.ceil(remaining / 1000)} s.`);
    return;
  }
  const pin = String(el['security-unlock-pin']?.value || '');
  if (await verifyPin(pin)) {
    setApplicationLocked(false);
    handleAppResume();
    return;
  }
  failedUnlockAttempts += 1;
  if (failedUnlockAttempts >= 5) {
    unlockBlockedUntil = Date.now() + 30000;
    failedUnlockAttempts = 0;
    setUnlockError('Zbyt wiele prób. Odblokowanie PIN-em wstrzymano na 30 sekund.');
  } else {
    setUnlockError(`Nieprawidłowy PIN. Pozostało prób: ${5 - failedUnlockAttempts}.`);
  }
  if (el['security-unlock-pin']) {
    el['security-unlock-pin'].value = '';
    el['security-unlock-pin'].focus();
  }
}

async function unlockWithBiometrics() {
  const result = await window.NativeBridge?.requestBiometricUnlock?.();
  if (result?.success) {
    setApplicationLocked(false);
    handleAppResume();
  } else {
    setUnlockError('Nie udało się potwierdzić biometrii. Użyj PIN-u.');
  }
}

function setUnlockError(message) {
  if (el['security-unlock-error']) el['security-unlock-error'].textContent = message;
}

async function verifyPin(pin) {
  const settings = getSecuritySettings();
  if (!settings.pinEnabled || !/^\d{6,12}$/.test(String(pin || ''))) return false;
  const candidate = await derivePinHash(pin, settings.pinSalt);
  return constantTimeEqual(candidate, settings.pinHash);
}

function validatePin(pin) {
  if (!/^\d{6,12}$/.test(String(pin || ''))) {
    throw new Error('PIN musi zawierać od 6 do 12 cyfr.');
  }
}

function clearSecurityPinFields() {
  ['security-current-pin', 'security-new-pin', 'security-confirm-pin'].forEach((id) => {
    if (el[id]) el[id].value = '';
  });
}

async function randomBase64(byteCount) {
  const nativeValue = window.NativeBridge?.randomBase64?.(byteCount) || '';
  if (nativeValue) return nativeValue;
  const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
  return bytesToBase64(bytes);
}

async function derivePinHash(pin, saltBase64) {
  const nativeValue = window.NativeBridge?.pinHash?.(pin, saltBase64) || '';
  if (nativeValue) return nativeValue;
  const keyMaterial = await crypto.subtle.importKey('raw', utf8Bytes(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: base64ToBytes(saltBase64),
      iterations: PBKDF2_ITERATIONS,
    },
    keyMaterial,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
}

function constantTimeEqual(left, right) {
  const first = String(left || '');
  const second = String(right || '');
  let difference = first.length ^ second.length;
  const length = Math.max(first.length, second.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (first.charCodeAt(index) || 0) ^ (second.charCodeAt(index) || 0);
  }
  return difference === 0;
}

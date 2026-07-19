
// Zachowane wyłącznie do testów zgodności starszych kopii .ghbackup.
// eslint-disable-next-line no-unused-vars
async function encryptBackupPayload(payload, password) {
  validateBackupPassword(password);
  const plaintext = JSON.stringify(payload);
  if (utf8Bytes(plaintext).byteLength > MAX_BACKUP_FILE_SIZE) {
    throw new Error('Kopia jest zbyt duża. Maksymalny rozmiar danych to 10 MB.');
  }
  const nativeResult = window.NativeBridge?.encryptBackup?.(plaintext, password);
  if (nativeResult?.ok) return JSON.parse(nativeResult.value);
  if (nativeResult && nativeResult.error !== 'unsupported') {
    throw new Error('Nie udało się zaszyfrować kopii na urządzeniu.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(password, salt, PBKDF2_ITERATIONS, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: utf8Bytes(ENCRYPTED_BACKUP_AAD),
      tagLength: 128,
    },
    key,
    utf8Bytes(plaintext)
  );
  return {
    application: 'Dzienniczek Hormonu',
    encryptedBackupFormatVersion: ENCRYPTED_BACKUP_FORMAT_VERSION,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptBackupEnvelope(envelope, password) {
  validateBackupPassword(password);
  validateEncryptedBackupEnvelope(envelope);
  const serialized = JSON.stringify(envelope);
  const nativeResult = window.NativeBridge?.decryptBackup?.(serialized, password);
  let plaintext;
  if (nativeResult?.ok) {
    plaintext = nativeResult.value;
  } else if (nativeResult && nativeResult.error !== 'unsupported') {
    throw new Error('Nieprawidłowe hasło albo uszkodzona kopia.');
  } else {
    try {
      const salt = base64ToBytes(envelope.kdf.salt);
      const iv = base64ToBytes(envelope.cipher.iv);
      const ciphertext = base64ToBytes(envelope.ciphertext);
      const key = await deriveBackupKey(password, salt, envelope.kdf.iterations, ['decrypt']);
      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv,
          additionalData: utf8Bytes(ENCRYPTED_BACKUP_AAD),
          tagLength: 128,
        },
        key,
        ciphertext
      );
      plaintext = new TextDecoder().decode(decrypted);
    } catch {
      throw new Error('Nieprawidłowe hasło albo uszkodzona kopia.');
    }
  }
  const parsed = JSON.parse(plaintext);
  assertSafeJsonValue(parsed);
  return parsed;
}

function isEncryptedBackupEnvelope(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Number(value.encryptedBackupFormatVersion) === ENCRYPTED_BACKUP_FORMAT_VERSION
  );
}

function validateEncryptedBackupEnvelope(envelope) {
  if (
    !isEncryptedBackupEnvelope(envelope) ||
    envelope.application !== 'Dzienniczek Hormonu' ||
    envelope.kdf?.name !== 'PBKDF2' ||
    envelope.kdf?.hash !== 'SHA-256' ||
    !Number.isInteger(envelope.kdf?.iterations) ||
    envelope.kdf.iterations < 100000 ||
    envelope.kdf.iterations > 1000000 ||
    envelope.cipher?.name !== 'AES-GCM' ||
    !isValidBase64(envelope.kdf?.salt, 16) ||
    !isValidBase64(envelope.cipher?.iv, 12) ||
    !isValidBase64(envelope.ciphertext) ||
    base64ToBytes(envelope.ciphertext).length < 16
  ) {
    throw new Error('Nieprawidłowy format zaszyfrowanej kopii.');
  }
}

function validateBackupPassword(password) {
  const value = String(password || '');
  if (value.length < BACKUP_PASSWORD_MIN_LENGTH || value.length > 256) {
    throw new Error('Hasło kopii musi mieć od 8 do 256 znaków.');
  }
}

async function deriveBackupKey(password, salt, iterations, usages) {
  const material = await crypto.subtle.importKey('raw', utf8Bytes(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usages
  );
}

function assertSafeJsonValue(root) {
  const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
  const stack = [{ value: root, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const { value, depth } = stack.pop();
    nodes += 1;
    if (nodes > 250000) throw new Error('Plik zawiera zbyt wiele elementów.');
    if (depth > 30) throw new Error('Plik ma zbyt głęboką strukturę.');
    if (typeof value === 'string' && value.length > MAX_BACKUP_FILE_SIZE * 2) {
      throw new Error('Plik zawiera zbyt długą wartość tekstową.');
    }
    if (!value || typeof value !== 'object') continue;
    const keys = Object.keys(value);
    if (keys.length > 100000) throw new Error('Plik zawiera zbyt wiele pól.');
    for (const key of keys) {
      if (forbiddenKeys.has(key)) throw new Error('Plik zawiera niedozwolone pole.');
      if (key.length > 200) throw new Error('Plik zawiera nieprawidłową nazwę pola.');
      stack.push({ value: value[key], depth: depth + 1 });
    }
  }
  return true;
}

function utf8Bytes(value) {
  return new TextEncoder().encode(String(value));
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isValidBase64(value, expectedBytes = 0) {
  if (typeof value !== 'string' || !value || value.length > MAX_BACKUP_FILE_SIZE * 2) return false;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return false;
  }
  try {
    const bytes = base64ToBytes(value);
    return expectedBytes ? bytes.length === expectedBytes : bytes.length > 0;
  } catch {
    return false;
  }
}

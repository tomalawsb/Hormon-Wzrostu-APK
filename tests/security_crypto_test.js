#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { TextDecoder, TextEncoder } = require('node:util');
const { indexedDB } = require('fake-indexeddb');

async function main() {
  const root = path.resolve(__dirname, '..');
  const appPath = path.join(root, 'app.js');
  const marker = '\n})();\n';
  let source = fs.readFileSync(appPath, 'utf8');

  assert.ok(source.endsWith(marker), 'Nie rozpoznano końca app.js.');

  const injectedCheck = String.raw`
    globalThis.__stage2SecurityPromise = (async () => {
      const fail = (condition, message) => {
        if (!condition) throw new Error(message);
      };

      const payload = createBackupPayload('all');
      payload.data.profiles[0].name = 'Poufne dziecko';
      payload.data.profiles[0].medical.doctorName = 'Poufny lekarz';
      payload.data.profiles[0].medical.diagnosis = 'Poufne rozpoznanie';
      payload.data.profiles[0].entries = [{
        id: 'entry-secure-1',
        date: '2026-07-19',
        time: '20:00',
        status: 'skipped',
        note: 'tajna-notatka',
        createdAt: '2026-07-19T20:00:00.000Z',
        updatedAt: '',
        ampouleId: '',
        ampouleDoseMl: '',
        dose: '',
        unit: '',
        side: '',
        site: ''
      }];

      const password = 'Bardzo-mocne-haslo-2026';
      const envelope = await encryptBackupPayload(payload, password);
      const serialized = JSON.stringify(envelope);
      fail(isEncryptedBackupEnvelope(envelope), 'Eksport nie utworzył szyfrowanej koperty.');
      fail(!serialized.includes('Poufne dziecko'), 'Nazwa profilu wyciekła do szyfrogramu.');
      fail(!serialized.includes('tajna-notatka'), 'Notatka medyczna wyciekła do szyfrogramu.');
      fail(!serialized.includes('Poufny lekarz'), 'Dane lekarza wyciekły do szyfrogramu.');
      fail(!serialized.includes('Poufne rozpoznanie'), 'Rozpoznanie wyciekło do szyfrogramu.');

      const restored = await decryptBackupEnvelope(envelope, password);
      fail(restored.data.profiles[0].name === 'Poufne dziecko', 'Nie odtworzono profilu.');
      fail(restored.data.profiles[0].medical.doctorName === 'Poufny lekarz', 'Nie odtworzono lekarza.');
      fail(restored.data.profiles[0].entries[0].note === 'tajna-notatka', 'Nie odtworzono wpisu.');

      let wrongPasswordRejected = false;
      try {
        await decryptBackupEnvelope(envelope, 'Nieprawidlowe-haslo');
      } catch {
        wrongPasswordRejected = true;
      }
      fail(wrongPasswordRejected, 'Nie odrzucono błędnego hasła kopii.');

      let pollutionRejected = false;
      try {
        assertSafeJsonValue(JSON.parse('{"__proto__":{"polluted":true}}'));
      } catch {
        pollutionRejected = true;
      }
      fail(pollutionRejected, 'Nie odrzucono klucza __proto__.');

      const salt = await randomBase64(16);
      const firstHash = await derivePinHash('123456', salt);
      const secondHash = await derivePinHash('123456', salt);
      const otherHash = await derivePinHash('654321', salt);
      fail(firstHash === secondHash, 'Hash PIN-u nie jest deterministyczny.');
      fail(firstHash !== otherHash, 'Różne PIN-y mają taki sam hash.');
      fail(isValidBase64(firstHash, 32), 'Hash PIN-u ma nieprawidłowy format.');

      const protectedData = createDefaultData();
      protectedData.appSettings.security = {
        pinEnabled: true,
        pinSalt: salt,
        pinHash: firstHash,
        biometricEnabled: true,
        autoLockMinutes: 1
      };
      data = attachActiveProfileAliases(protectedData);
      const portableBackup = createBackupPayload('all');
      fail(!portableBackup.data.appSettings.security.pinEnabled, 'Kopia przenosi blokadę urządzenia.');
      fail(!portableBackup.data.appSettings.security.pinHash, 'Kopia ujawnia hash PIN-u urządzenia.');

      const concurrentDatabase = await openSecureDatabase();
      const [firstStorageKey, secondStorageKey] = await Promise.all([
        getOrCreateBrowserStorageKey(concurrentDatabase),
        getOrCreateBrowserStorageKey(concurrentDatabase)
      ]);
      const concurrencyIv = crypto.getRandomValues(new Uint8Array(12));
      const concurrencyCiphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: concurrencyIv },
        firstStorageKey,
        utf8Bytes('test-wspolnego-klucza')
      );
      const concurrencyPlaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: concurrencyIv },
        secondStorageKey,
        concurrencyCiphertext
      );
      fail(new TextDecoder().decode(concurrencyPlaintext) === 'test-wspolnego-klucza', 'Karty utworzyły różne klucze.');

      const legacyMedicalData = JSON.stringify({
        version: DATA_SCHEMA_VERSION,
        activeProfileId: 'profile-legacy',
        profiles: [{ id: 'profile-legacy', name: 'Jawny profil testowy', entries: [] }]
      });
      localStorage.setItem(STORAGE_KEY, legacyMedicalData);
      await initializeSecureStorage();
      fail(localStorage.getItem(STORAGE_KEY) === null, 'Migracja pozostawiła dane medyczne w localStorage.');
      fail(secureStorageGet(STORAGE_KEY) === legacyMedicalData, 'Migracja nie zachowała danych medycznych.');
      const secureDatabase = await openSecureDatabase();
      const encryptedRecord = await idbGet(secureDatabase, SECURE_RECORD_STORE, STORAGE_KEY);
      fail(Boolean(encryptedRecord?.ciphertext), 'IndexedDB nie zawiera szyfrogramu.');
      fail(!JSON.stringify(encryptedRecord).includes('Jawny profil testowy'), 'IndexedDB zawiera jawne dane profilu.');

      const updatedMedicalData = legacyMedicalData.replace('Jawny profil testowy', 'Zmieniony profil');
      fail(secureStorageSet(STORAGE_KEY, updatedMedicalData), 'Bezpieczny zapis został odrzucony.');
      await flushSecureStorageWrites();
      fail(await secureStorageAdapter.read(STORAGE_KEY) === updatedMedicalData, 'Nie odczytano zaszyfrowanej aktualizacji.');

      return {
        algorithm: envelope.cipher.name,
        iterations: envelope.kdf.iterations,
        wrongPasswordRejected,
        pollutionRejected,
        localStorageMigrated: localStorage.getItem(STORAGE_KEY) === null
      };
    })();
  `;

  source = source.slice(0, -marker.length) + injectedCheck + marker;

  const storage = new Map();
  const elementStub = () => ({
    addEventListener() {},
    append() {},
    appendChild() {},
    classList: { add() {}, remove() {}, toggle() {} },
    click() {},
    dataset: {},
    remove() {},
    style: {},
    textContent: '',
  });
  const sandbox = {
    Blob,
    Buffer,
    Request,
    Response,
    TextDecoder,
    TextEncoder,
    URL,
    atob,
    btoa,
    clearInterval,
    clearTimeout,
    console,
    crypto: crypto.webcrypto,
    document: {
      addEventListener() {},
      body: { appendChild() {} },
      createElement: elementStub,
      head: { appendChild() {} },
      querySelectorAll() {
        return [];
      },
    },
    fetch,
    indexedDB,
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      removeItem(key) {
        storage.delete(key);
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
    },
    navigator: {},
    setInterval,
    setTimeout,
    structuredClone,
    window: {
      addEventListener() {},
      fetch,
      indexedDB,
      location: { href: 'http://127.0.0.1/index.html', protocol: 'http:' },
      open() {
        return null;
      },
      queueMicrotask,
      setTimeout,
    },
  };
  sandbox.globalThis = sandbox;

  vm.runInNewContext(source, sandbox, { filename: appPath, timeout: 10_000 });
  const result = await sandbox.__stage2SecurityPromise;
  assert.ok(result, 'Test kryptografii nie zwrócił wyniku.');
  assert.equal(result.algorithm, 'AES-GCM');
  assert.equal(result.iterations, 210000);
  assert.equal(result.wrongPasswordRejected, true);
  assert.equal(result.pollutionRejected, true);
  assert.equal(result.localStorageMigrated, true);

  console.log('Test bezpieczeństwa: OK — AES-256-GCM, PBKDF2 210000 i bezpieczny import.');
  console.log('Migracja localStorage → szyfrowane IndexedDB: OK; jawne dane usunięte.');
  console.log('Błędne hasło, prototype pollution i przenoszenie PIN-u: odrzucone.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

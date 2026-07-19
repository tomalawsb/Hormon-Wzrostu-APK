#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'app.js');
const marker = '\n})();\n';
let source = fs.readFileSync(appPath, 'utf8');

assert.ok(source.endsWith(marker), 'Nie rozpoznano końca app.js.');

const injectedCheck = String.raw`
  (() => {
    const fail = (condition, message) => {
      if (!condition) throw new Error(message);
    };

    const sourceData = createDefaultData();
    const profile = sourceData.profiles[0];
    profile.name = 'Radek';
    profile.settings.defaultDose = '1,2';
    profile.settings.defaultTime = '20:00';
    profile.settings.ampouleVolumeMl = '12';
    profile.settings.ampouleDoseMl = '0,4';
    profile.medical = {
      birthDate: '2014-05-12',
      doctorName: 'dr Anna Nowak',
      clinicName: 'Poradnia Endokrynologiczna',
      medicationName: 'Preparat testowy',
      diagnosis: 'Kontrola wzrastania',
      notes: 'Wizyta co 3 miesiące'
    };
    profile.measurements = [{
      id: 'measurement-1',
      date: '2026-07-16',
      heightCm: '132,5',
      weightKg: '31,2',
      note: 'pomiar kontrolny',
      createdAt: '2026-07-16T12:00:00.000Z',
      updatedAt: ''
    }];
    profile.doseHistory = [{
      id: 'dose-change-1',
      date: '2026-07-01',
      dose: '1,2',
      unit: 'mg',
      note: 'zalecenie lekarza',
      createdAt: '2026-07-01T12:00:00.000Z',
      updatedAt: ''
    }];
    profile.ampoules = [{
      id: 'ampoule-1',
      number: 5,
      startDate: '2026-07-14',
      volumeMl: '12',
      doseMl: '0,4',
      status: 'active',
      createdAt: '2026-07-14T18:00:00.000Z',
      updatedAt: ''
    }];
    profile.activeAmpouleId = 'ampoule-1';
    profile.entries = [{
      id: 'entry-1',
      date: '2026-07-17',
      time: '20:01',
      status: 'given',
      note: 'bez reakcji',
      correctedAt: '2026-07-18T08:15:00.000Z',
      createdAt: '2026-07-17T20:01:00.000Z',
      updatedAt: '',
      ampouleId: 'ampoule-1',
      ampouleDoseMl: '0,4',
      dose: '1,2',
      unit: 'mg',
      side: 'prawa',
      site: 'udo'
    }, {
      id: 'entry-2',
      date: '2026-07-18',
      time: '20:00',
      status: 'skipped',
      note: 'brak dawki',
      correctedAt: '',
      createdAt: '2026-07-18T20:00:00.000Z',
      updatedAt: '',
      ampouleId: '',
      ampouleDoseMl: '',
      dose: '',
      unit: '',
      side: '',
      site: ''
    }];

    data = attachActiveProfileAliases(normalizeStoredData(sourceData).data);

    const fullPayload = createBackupPayload('all');
    const serialized = JSON.stringify(fullPayload);
    const fullPreview = inspectBackupPayload(JSON.parse(serialized));
    const restored = fullPreview.normalized.data;
    const restoredProfile = restored.profiles[0];

    fail(fullPreview.mode === 'replace-all', 'Pełna kopia ma nieprawidłowy tryb importu.');
    fail(fullPreview.summary.profileCount === 1, 'Nie zachowano liczby profili.');
    fail(fullPreview.summary.entryCount === 2, 'Nie zachowano liczby wpisów.');
    fail(fullPreview.summary.ampouleCount === 1, 'Nie zachowano liczby ampułek.');
    fail(restoredProfile.name === 'Radek', 'Nie zachowano nazwy profilu.');
    fail(restoredProfile.settings.defaultDose === '1,2', 'Nie zachowano dawki domyślnej.');
    fail(restoredProfile.medical.doctorName === 'dr Anna Nowak', 'Nie zachowano lekarza prowadzącego.');
    fail(restoredProfile.measurements[0]?.heightCm === '132,5', 'Nie zachowano pomiaru wzrostu.');
    fail(restoredProfile.doseHistory[0]?.dose === '1,2', 'Nie zachowano historii dawki.');
    fail(restoredProfile.activeAmpouleId === 'ampoule-1', 'Nie zachowano aktywnej ampułki.');
    fail(restoredProfile.entries.find((entry) => entry.id === 'entry-1')?.ampouleId === 'ampoule-1', 'Nie zachowano powiązania wpisu z ampułką.');
    fail(restoredProfile.entries.find((entry) => entry.id === 'entry-1')?.correctedAt === '2026-07-18T08:15:00.000Z', 'Nie zachowano oznaczenia poprawionego wpisu.');
    fail(restoredProfile.entries.some((entry) => entry.status === 'skipped'), 'Nie zachowano pominiętej dawki.');

    const profilePayload = createBackupPayload('profile', profile.id);
    const profilePreview = inspectBackupPayload(JSON.parse(JSON.stringify(profilePayload)));
    fail(profilePreview.mode === 'add-profile', 'Kopia profilu ma nieprawidłowy tryb importu.');
    fail(profilePreview.summary.profileCount === 1, 'Kopia profilu zawiera złą liczbę profili.');

    const invalidPayload = JSON.parse(serialized);
    invalidPayload.data.profiles[0].entries[0].ampouleId = 'missing-ampoule';
    let invalidLinkRejected = false;
    try {
      inspectBackupPayload(invalidPayload);
    } catch (error) {
      invalidLinkRejected = /nieistniejącą ampułkę/.test(String(error.message));
    }
    fail(invalidLinkRejected, 'Import nie odrzucił wpisu wskazującego nieistniejącą ampułkę.');

    globalThis.__stage0BackupResult = {
      serializedBytes: Buffer.byteLength(serialized, 'utf8'),
      profileCount: fullPreview.summary.profileCount,
      entryCount: fullPreview.summary.entryCount,
      ampouleCount: fullPreview.summary.ampouleCount,
      profileImportMode: profilePreview.mode,
      invalidLinkRejected
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
  URL,
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

const result = sandbox.__stage0BackupResult;
assert.ok(result, 'Test aplikacji nie zwrócił wyniku.');
assert.equal(result.profileCount, 1);
assert.equal(result.entryCount, 2);
assert.equal(result.ampouleCount, 1);
assert.equal(result.profileImportMode, 'add-profile');
assert.equal(result.invalidLinkRejected, true);

console.log(
  `Test eksport/import JSON: OK — ${result.profileCount} profil, ` +
    `${result.entryCount} wpisy, ${result.ampouleCount} ampułka, ${result.serializedBytes} B.`
);
console.log('Pełna kopia, kopia profilu i odrzucenie błędnego powiązania ampułki: OK');

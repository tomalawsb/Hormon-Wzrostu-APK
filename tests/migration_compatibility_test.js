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
    const legacyEntry = (id, date, updatedAt = '') => ({
      id,
      date,
      time: '20:00',
      status: 'given',
      dose: '1,0',
      unit: 'mg',
      side: id.endsWith('2') ? 'prawa' : 'lewa',
      site: 'udo',
      note: id,
      createdAt: date + 'T20:00:00.000Z',
      updatedAt
    });

    const legacy = {
      version: 4,
      settings: {
        defaultDose: '1,0',
        unit: 'mg',
        defaultTime: '20:00',
        reminderEnabled: true,
        reminderTime: '21:00',
        ampouleStartDate: '2025-01-01',
        ampouleStartNumber: 7,
        ampouleVolumeMl: '1',
        ampouleDoseMl: '0,5'
      },
      meta: { onboardingCompleted: true, lastReminderDate: '2025-01-02' },
      entries: [
        legacyEntry('legacy-old', '2025-01-01', '2025-01-01T20:01:00.000Z'),
        legacyEntry('legacy-new', '2025-01-01', '2025-01-01T21:00:00.000Z'),
        legacyEntry('legacy-2', '2025-01-02'),
        legacyEntry('legacy-3', '2025-01-03')
      ]
    };
    const migrated = normalizeStoredData(legacy);
    const migratedProfile = migrated.data.profiles[0];
    fail(migrated.migratedFromLegacy, 'Nie oznaczono migracji płaskiego formatu.');
    fail(migrated.data.version === DATA_SCHEMA_VERSION, 'Nie ustawiono aktualnego schematu.');
    fail(migrated.data.profiles.length === 1, 'Stare dane nie trafiły do jednego profilu.');
    fail(migrated.removedDuplicates === 1, 'Nie usunięto duplikatu daty.');
    fail(migratedProfile.entries.length === 3, 'Migracja zmieniła liczbę unikalnych wpisów.');
    fail(migratedProfile.entries.some((entry) => entry.id === 'legacy-new'), 'Nie zachowano nowszego duplikatu.');
    fail(!migratedProfile.entries.some((entry) => entry.id === 'legacy-old'), 'Zachowano starszy duplikat.');
    fail(migratedProfile.ampoules.length === 2, 'Nie odtworzono kolejnych ampułek.');
    fail(migratedProfile.entries.every((entry) => entry.ampouleId), 'Wpisy nie zostały połączone z ampułkami.');
    fail(migrated.data.appMeta.onboardingCompleted, 'Nie zachowano stanu wdrożenia użytkownika.');

    const olderProfiles = normalizeStoredData({
      version: 8,
      activeProfileId: 'missing-profile',
      appSettings: { appearance: { theme: 'dark' } },
      profiles: [
        {
          id: 'child-1',
          name: 'Kasia',
          settings: { defaultDose: '1,2', unit: 'mg' },
          entries: [legacyEntry('profile-entry-1', '2025-02-01')]
        },
        {
          id: 'child-1',
          name: 'Olek',
          settings: { defaultDose: '0,8', unit: 'mg' },
          entries: []
        }
      ]
    });
    fail(olderProfiles.upgradedSchema, 'Nie oznaczono aktualizacji starszego schematu profili.');
    fail(olderProfiles.data.profiles.length === 2, 'Utracono profil podczas aktualizacji schematu.');
    fail(new Set(olderProfiles.data.profiles.map((profile) => profile.id)).size === 2, 'Nie naprawiono powtórzonych ID profili.');
    fail(olderProfiles.data.activeProfileId === olderProfiles.data.profiles[0].id, 'Nie naprawiono aktywnego profilu.');
    fail(olderProfiles.data.appSettings.appearance.theme === 'dark', 'Nie zachowano motywu.');
    fail(Array.isArray(olderProfiles.data.profiles[0].measurements), 'Nie uzupełniono nowych pól profilu.');

    const legacyImport = {
      ...legacy,
      entries: [
        legacyEntry('legacy-import-1', '2025-03-01'),
        legacyEntry('legacy-import-2', '2025-03-02')
      ]
    };
    const legacyPreview = inspectBackupPayload(legacyImport);
    fail(legacyPreview.legacy, 'Stary eksport nie został rozpoznany jako starszy format.');
    fail(legacyPreview.mode === 'replace-all', 'Stary eksport ma nieprawidłowy tryb importu.');
    fail(legacyPreview.normalized.data.profiles[0].entries.length === 2, 'Import starszej kopii utracił wpisy.');

    let futureSchemaRejected = false;
    try {
      inspectBackupPayload({
        backupFormatVersion: BACKUP_FORMAT_VERSION,
        sourceDataVersion: DATA_SCHEMA_VERSION + 1,
        data: createDefaultData()
      });
    } catch (error) {
      futureSchemaRejected = /nowszego schematu/.test(String(error.message));
    }
    fail(futureSchemaRejected, 'Nie odrzucono danych z przyszłego schematu.');

    let futureFormatRejected = false;
    try {
      inspectBackupPayload({
        backupFormatVersion: BACKUP_FORMAT_VERSION + 1,
        sourceDataVersion: DATA_SCHEMA_VERSION,
        data: createDefaultData()
      });
    } catch (error) {
      futureFormatRejected = /nowszego formatu/.test(String(error.message));
    }
    fail(futureFormatRejected, 'Nie odrzucono przyszłego formatu kopii.');

    globalThis.__stage12MigrationResult = {
      legacyEntries: migratedProfile.entries.length,
      legacyAmpoules: migratedProfile.ampoules.length,
      profileCount: olderProfiles.data.profiles.length,
      futureSchemaRejected,
      futureFormatRejected
    };
  })();
`;

source = source.slice(0, -marker.length) + injectedCheck + marker;

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
  Intl,
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
    getItem() {
      return null;
    },
    removeItem() {},
    setItem() {},
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
const result = sandbox.__stage12MigrationResult;
assert.ok(result, 'Test migracji nie zwrócił wyniku.');
assert.equal(result.legacyEntries, 3);
assert.equal(result.legacyAmpoules, 2);
assert.equal(result.profileCount, 2);
assert.equal(result.futureSchemaRejected, true);
assert.equal(result.futureFormatRejected, true);

console.log(
  'Test migracji: OK — płaski format, starsze profile, duplikaty, ampułki i odrzucenie przyszłych wersji.'
);

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
    const profile = createDefaultProfile({
      id: 'ampoule-state-profile',
      name: 'Test ampułki',
      createdAt: '2026-07-01T12:00:00.000Z'
    });
    profile.settings.ampouleVolumeMl = '1';
    profile.settings.ampouleDoseMl = '0,5';
    const ampoule = createAmpouleRecord({
      number: 1,
      startDate: '2026-07-17',
      volumeMl: '1',
      doseMl: '0,5',
      status: 'active'
    });
    profile.ampoules = [ampoule];
    profile.activeAmpouleId = ampoule.id;
    data = attachActiveProfileAliases({
      version: DATA_SCHEMA_VERSION,
      appSettings: { security: defaultSecuritySettings(), appearance: defaultAppearanceSettings() },
      appMeta: { onboardingCompleted: true },
      activeProfileId: profile.id,
      profiles: [profile]
    });

    const fullRemaining = getAmpouleRemainingMl(ampoule.id);
    const first = sanitizeEntry({
      id: 'dose-1', date: '2026-07-17', time: '20:00', status: 'given',
      dose: '1,0', unit: 'mg', side: 'lewa', site: 'udo',
      ampouleId: ampoule.id, ampouleDoseMl: '0,5'
    });
    profile.entries.push(first);
    const halfRemaining = getAmpouleRemainingMl(ampoule.id);
    const tooLarge = sanitizeEntry({
      id: 'dose-too-large', date: '2026-07-18', time: '19:00', status: 'given',
      dose: '0,6', unit: 'ml', side: 'prawa', site: 'udo',
      ampouleId: ampoule.id, ampouleDoseMl: ''
    });
    const capacity = getAmpouleCapacityForEntry(tooLarge, ampoule.id);
    const second = sanitizeEntry({
      id: 'dose-2', date: '2026-07-18', time: '20:00', status: 'given',
      dose: '1,0', unit: 'mg', side: 'prawa', site: 'udo',
      ampouleId: ampoule.id, ampouleDoseMl: '0,5'
    });
    profile.entries.push(second);
    reconcileAmpouleStatuses();
    const emptyRemaining = getAmpouleRemainingMl(ampoule.id);

    globalThis.__stage12AmpouleResult = {
      fullRemaining,
      halfRemaining,
      insufficientRejected: !capacity.sufficient,
      emptyRemaining,
      finished: ampoule.status === 'finished',
      activeCleared: profile.activeAmpouleId === ''
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
  localStorage: { getItem: () => null, removeItem() {}, setItem() {} },
  navigator: {},
  setInterval,
  setTimeout,
  structuredClone,
  window: {
    addEventListener() {},
    fetch,
    location: { href: 'http://127.0.0.1/index.html', protocol: 'http:' },
    open: () => null,
    queueMicrotask,
    setTimeout,
  },
};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: appPath, timeout: 10_000 });

const result = sandbox.__stage12AmpouleResult;
assert.ok(result, 'Test stanów ampułki nie zwrócił wyniku.');
assert.equal(result.fullRemaining, 1);
assert.equal(result.halfRemaining, 0.5);
assert.equal(result.insufficientRejected, true);
assert.equal(result.emptyRemaining, 0);
assert.equal(result.finished, true);
assert.equal(result.activeCleared, true);

console.log(
  'Test stanów końcowych: OK — pełna, częściowo zużyta i pusta ampułka oraz blokada zbyt dużej dawki.'
);

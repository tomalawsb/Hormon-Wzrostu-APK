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
      id: 'profile-health-test',
      name: 'Kasia',
      createdAt: '2026-07-01T12:00:00.000Z'
    });
    profile.medical = sanitizeProfileMedical({
      birthDate: '2014-05-12',
      doctorName: 'dr Anna Nowak',
      clinicName: 'Poradnia Endokrynologiczna',
      medicationName: 'Preparat testowy',
      diagnosis: 'Kontrola wzrastania'
    });
    upsertProfileMeasurement(profile, {
      date: '2026-07-10', heightCm: '132,0', weightKg: '31,0', note: 'pierwszy'
    });
    upsertProfileMeasurement(profile, {
      date: '2026-07-19', heightCm: '133,2', weightKg: '31,8', note: 'kontrola'
    });
    upsertProfileMeasurement(profile, {
      date: '2026-07-19', heightCm: '133,4', weightKg: '31,8', note: 'korekta'
    });
    upsertProfileDoseChange(profile, {
      date: '2026-07-01', dose: '1,0', unit: 'mg', note: 'start'
    });
    upsertProfileDoseChange(profile, {
      date: '2026-07-15', dose: '1,2', unit: 'mg', note: 'zalecenie lekarza'
    });
    profile.settings.defaultDose = '1,2';
    profile.entries = [
      { id: 'e1', date: '2026-07-13', time: '20:00', status: 'given', ampouleId: 'a1', ampouleDoseMl: '0,5', dose: '1,2', unit: 'mg', side: 'lewa', site: 'udo' },
      { id: 'e2', date: '2026-07-14', time: '20:00', status: 'given', ampouleId: 'a1', ampouleDoseMl: '0,5', dose: '1,2', unit: 'mg', side: 'prawa', site: 'udo' },
      { id: 'e3', date: '2026-07-15', time: '20:00', status: 'skipped', ampouleId: '', ampouleDoseMl: '' },
      { id: 'e4', date: '2026-07-17', time: '20:00', status: 'given', ampouleId: 'a1', ampouleDoseMl: '0,5', dose: '1,2', unit: 'mg', side: 'lewa', site: 'brzuch' },
      { id: 'e5', date: '2026-07-18', time: '20:00', status: 'skipped', ampouleId: '', ampouleDoseMl: '' },
      { id: 'e6', date: '2026-07-19', time: '20:00', status: 'given', ampouleId: 'a1', ampouleDoseMl: '0,5', dose: '1,2', unit: 'mg', side: 'prawa', site: 'brzuch' }
    ];
    profile.ampoules = [{
      id: 'a1', number: 1, startDate: '2026-07-13', volumeMl: '10', doseMl: '0,5', status: 'active', createdAt: '2026-07-13T12:00:00.000Z', updatedAt: ''
    }];
    profile.activeAmpouleId = 'a1';

    const regularity = buildProfileRegularityStats(profile, 7, '2026-07-19');
    const ampoules = buildProfileAmpouleUsageStats(profile);
    const reportConfig = {
      profiles: [profile], records: [], includeAmpoules: true, scope: profile.id,
      scopeLabel: profile.name, periodText: 'test'
    };
    const reportHtml = buildDoctorReportProfileHtml(reportConfig);
    const docxSection = buildDocxDoctorProfileSection(reportConfig);
    const invalidMeasurement = sanitizeProfileMeasurement({
      id: 'invalid', date: '2026-07-19', heightCm: '999', weightKg: ''
    });
    const futureMeasurement = sanitizeProfileMeasurement({
      id: 'future', date: '2999-01-01', heightCm: '140', weightKg: ''
    });
    const splitMeasurementProfile = createDefaultProfile({
      id: 'profile-split-measurements', createdAt: '2026-07-01T12:00:00.000Z'
    });
    upsertProfileMeasurement(splitMeasurementProfile, {
      date: '2026-07-18', heightCm: '140,2', weightKg: ''
    });
    upsertProfileMeasurement(splitMeasurementProfile, {
      date: '2026-07-19', heightCm: '', weightKg: '38,4'
    });
    const splitLatest = getLatestProfileMeasurements(splitMeasurementProfile);
    const splitReport = buildDoctorReportProfileHtml({
      profiles: [splitMeasurementProfile], records: [], includeAmpoules: true,
      scope: splitMeasurementProfile.id, scopeLabel: splitMeasurementProfile.name, periodText: 'test'
    });

    globalThis.__stage8Result = {
      measurementCount: profile.measurements.length,
      latestHeight: getLatestProfileMeasurements(profile).height.heightCm,
      doseChangeCount: profile.doseHistory.length,
      regularity,
      ampoules,
      reportHasDoctor: reportHtml.includes('dr Anna Nowak'),
      reportHasMeasurements: reportHtml.includes('133,4 cm'),
      reportHasDoseHistory: reportHtml.includes('1,2 mg'),
      docxHasMedicalSection: docxSection.includes('Dane profilu i leczenia'),
      invalidMeasurementRejected: invalidMeasurement === null,
      futureMeasurementRejected: futureMeasurement === null,
      independentLatestHeight: splitLatest.height?.heightCm,
      independentLatestWeight: splitLatest.weight?.weightKg,
      independentMeasurementsInReport:
        splitReport.includes('140,2 cm') && splitReport.includes('38,4 kg')
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

const result = sandbox.__stage8Result;
assert.ok(result, 'Test etapu 8 nie zwrócił wyniku.');
assert.equal(result.measurementCount, 2, 'Korekta pomiaru utworzyła duplikat daty.');
assert.equal(result.latestHeight, '133,4');
assert.equal(result.doseChangeCount, 2);
assert.equal(result.regularity.totalDays, 7);
assert.equal(result.regularity.given, 4);
assert.equal(result.regularity.skipped, 2);
assert.equal(result.regularity.missing, 1);
assert.equal(result.ampoules.registeredUsedMl, 2);
assert.equal(result.ampoules.activeRemainingMl, 8);
assert.equal(result.ampoules.hasActiveAmpoule, true);
assert.equal(result.reportHasDoctor, true);
assert.equal(result.reportHasMeasurements, true);
assert.equal(result.reportHasDoseHistory, true);
assert.equal(result.docxHasMedicalSection, true);
assert.equal(result.invalidMeasurementRejected, true);
assert.equal(result.futureMeasurementRejected, true);
assert.equal(result.independentLatestHeight, '140,2');
assert.equal(result.independentLatestWeight, '38,4');
assert.equal(result.independentMeasurementsInReport, true);

console.log(
  'Test działania etapu 8: OK — pomiary, historia dawki, regularność, ampułki i raport medyczny.'
);

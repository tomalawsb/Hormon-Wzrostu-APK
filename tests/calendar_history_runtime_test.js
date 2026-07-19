const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function fail(condition, message) {
  if (!condition) throw new Error(message);
}

function runHistoryTest() {
  const context = vm.createContext({ Date, Intl, Map, console });
  vm.runInContext(
    `
      function normalizeText(value) {
        return String(value || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim();
      }
      function formatDateShort(value) { return value; }
      function formatDateLong(value) { return value; }
      function formatDateTimeShort(value) { return value; }
      function formatPlace(side, site) { return side + ' ' + site; }
      const records = [
        { profile: { name: 'Ala' }, entry: { id: '3', date: '2026-07-19', time: '20:00', status: 'given', side: 'lewa', site: 'udo', dose: '1,0', unit: 'mg', note: '', correctedAt: '' } },
        { profile: { name: 'Olek' }, entry: { id: '2', date: '2026-07-19', time: '19:00', status: 'skipped', side: '', site: '', dose: '', unit: '', note: 'Wyjazd', correctedAt: '2026-07-19T21:00:00.000Z' } },
        { profile: { name: 'Ala' }, entry: { id: '1', date: '2026-07-18', time: '20:00', status: 'given', side: 'prawa', site: 'brzuch', dose: '1,0', unit: 'mg', note: '', correctedAt: '' } },
      ];
    `,
    context
  );
  vm.runInContext(
    fs.readFileSync(path.join(root, 'src/screens/history/render.js'), 'utf8'),
    context
  );

  fail(
    vm.runInContext('groupHistoryRecordsByDate(records).length', context) === 2,
    'Wpisy nie zostały pogrupowane w dwie daty.'
  );
  fail(
    vm.runInContext('groupHistoryRecordsByDate(records)[0][0]', context) === '2026-07-19',
    'Grupowanie nie zachowało kolejności od najnowszej daty.'
  );
  fail(
    vm.runInContext(
      "filterHistoryRecords(records, { query: '', status: 'all', site: 'all', correction: 'corrected' }).length",
      context
    ) === 1,
    'Filtr poprawionych wpisów zwrócił zły wynik.'
  );
  fail(
    vm.runInContext(
      "filterHistoryRecords(records, { query: normalizeText('wyjazd'), status: 'all', site: 'all', correction: 'all' })[0].entry.id",
      context
    ) === '2',
    'Wyszukiwanie po uwadze nie znalazło wpisu.'
  );
  fail(
    vm.runInContext(
      "filterHistoryRecords(records, { query: '', status: 'given', site: 'udo', correction: 'all' }).length",
      context
    ) === 1,
    'Połączone filtry statusu i miejsca zwróciły zły wynik.'
  );
}

function runCorrectionSanitizerTest() {
  const context = vm.createContext({ Date, Set, console });
  vm.runInContext(
    `
      const ALLOWED_STATUSES = new Set(['given', 'skipped']);
      const ALLOWED_UNITS = new Set(['mg']);
      const ALLOWED_SIDES = new Set(['lewa', 'prawa']);
      const ALLOWED_SITES = new Set(['udo']);
      const MAX_NOTE_LENGTH = 1000;
      function isValidDateParts(year, month, day) {
        const date = new Date(year, month - 1, day);
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
      }
      function isValidIsoDate(value) { return /^\\d{4}-\\d{2}-\\d{2}$/.test(value); }
      function isValidTime(value) { return /^\\d{2}:\\d{2}$/.test(value); }
      function isValidDateTime(value) { return typeof value === 'string' && !Number.isNaN(Date.parse(value)); }
      function normalizeOptionalPositiveDecimal(value) { return value || ''; }
      function normalizeDose(value) { return value || ''; }
    `,
    context
  );
  vm.runInContext(
    fs.readFileSync(path.join(root, 'src/services/storage/entries.js'), 'utf8'),
    context
  );
  vm.runInContext(
    `
      validEntry = sanitizeEntry({
        id: 'entry-1', date: '2026-07-19', time: '20:00', status: 'given',
        dose: '1,0', unit: 'mg', side: 'lewa', site: 'udo',
        correctedAt: '2026-07-19T21:00:00.000Z'
      });
      invalidCorrection = sanitizeEntry({
        id: 'entry-2', date: '2026-07-18', time: '20:00', status: 'given',
        dose: '1,0', unit: 'mg', side: 'prawa', site: 'udo', correctedAt: 'nie-data'
      });
    `,
    context
  );
  fail(
    vm.runInContext('validEntry.correctedAt', context) === '2026-07-19T21:00:00.000Z',
    'Poprawny znacznik korekty nie został zachowany.'
  );
  fail(
    vm.runInContext('invalidCorrection.correctedAt', context) === '',
    'Nieprawidłowy znacznik korekty nie został odrzucony.'
  );
}

runHistoryTest();
runCorrectionSanitizerTest();
console.log('Test działania etapu 7: OK — grupowanie, wyszukiwanie, filtry i walidacja korekt.');

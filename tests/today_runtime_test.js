const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function fail(condition, message) {
  if (!condition) throw new Error(message);
}

function runTodayControlsTest() {
  const context = vm.createContext({ Date, console });
  vm.runInContext(
    `
      let quickDraft = { date: '2026-07-19', time: '20:00', dose: '1,0', unit: 'mg', side: 'lewa', site: 'udo', status: 'given' };
      let data = { settings: { defaultDose: '1,0', unit: 'mg', reminderEnabled: true } };
      let quickDraftTouched = false;
      let renderCount = 0;
      let announcement = '';
      let openedEntryId = '';
      let storedEntry = null;
      const el = {
        'today-reminder-title': { textContent: '' },
        'today-reminder-text': { textContent: '' },
      };
      function getEntryForDate() { return storedEntry; }
      function decimalToNumber(value) { return Number(String(value).replace(',', '.')) || 0; }
      function normalizeDose(value) {
        const number = Number(String(value).replace(',', '.'));
        return number > 0 && number <= 1000 ? String(number).replace('.', ',') : '';
      }
      function formatDose(value) { return String(value).replace('.', ','); }
      function announce(value) { announcement = value; }
      function openEntryDialog(id) { openedEntryId = id; }
      function localDateISO(value = new Date('2026-07-19T12:00:00')) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
      }
      function localTime(value) {
        return String(value.getHours()).padStart(2, '0') + ':' + String(value.getMinutes()).padStart(2, '0');
      }
      function formatDateShort(value) { return value; }
      function getActiveProfile() { return { settings: data.settings }; }
      function getNextReminderTarget() { return new Date(2026, 6, 19, 21, 0); }
    `,
    context
  );
  vm.runInContext(fs.readFileSync(path.join(root, 'src/screens/today/render.js'), 'utf8'), context);
  vm.runInContext('renderToday = () => { renderCount += 1; };', context);

  vm.runInContext('adjustTodayDose(1);', context);
  fail(vm.runInContext('quickDraft.dose', context) === '1,1', 'Zwiększenie dawki nie dodało 0,1.');
  fail(
    vm.runInContext('quickDraftTouched', context) === true,
    'Zmiana dawki nie oznaczyła szkicu jako zmienionego.'
  );

  vm.runInContext('adjustTodayDose(-1);', context);
  fail(vm.runInContext('quickDraft.dose', context) === '1', 'Zmniejszenie dawki nie odjęło 0,1.');
  fail(vm.runInContext('renderCount', context) === 2, 'Zmiana dawki nie odświeża ekranu.');
  fail(
    /1 mg/.test(vm.runInContext('announcement', context)),
    'Czytnik ekranu nie otrzymał nowej dawki.'
  );

  vm.runInContext("storedEntry = { id: 'entry-today' }; adjustTodayDose(1);", context);
  fail(
    vm.runInContext('quickDraft.dose', context) === '1',
    'Zapisana dawka została zmieniona bez edycji wpisu.'
  );
  fail(
    vm.runInContext('openedEntryId', context) === 'entry-today',
    'Zapisany wpis nie został otwarty do edycji.'
  );

  fail(
    vm.runInContext(
      'formatTodayReminderTarget(new Date(2026, 6, 19, 21, 0), new Date(2026, 6, 19, 12, 0))',
      context
    ) === 'Dzisiaj, 21:00',
    'Nieprawidłowy opis dzisiejszego przypomnienia.'
  );
  fail(
    vm.runInContext(
      'formatTodayReminderTarget(new Date(2026, 6, 20, 21, 0), new Date(2026, 6, 19, 12, 0))',
      context
    ) === 'Jutro, 21:00',
    'Nieprawidłowy opis jutrzejszego przypomnienia.'
  );
}

function runUndoTest() {
  const context = vm.createContext({ console });
  vm.runInContext(
    `
      const profile = { id: 'profile-1', activeAmpouleId: '', ampoules: [], entries: [] };
      let data = { activeProfileId: profile.id, profiles: [profile] };
      let lastEntryUndoOperation = null;
      let renderCount = 0;
      let resetCount = 0;
      let toastMessage = '';
      const el = {};
      function getActiveProfile() { return profile; }
      function structuredCloneSafe(value) { return JSON.parse(JSON.stringify(value)); }
      function getEntryAmpouleDoseMl() { return 0; }
      function decimalToNumber() { return 0; }
      function persistData() { return true; }
      function resetQuickDraftForToday() { resetCount += 1; }
      function renderAll() { renderCount += 1; }
      function showToast(message) { toastMessage = message; }
    `,
    context
  );
  vm.runInContext(
    fs.readFileSync(path.join(root, 'src/components/dose-card/entries.js'), 'utf8'),
    context
  );

  vm.runInContext(
    `
      const createUndo = captureEntryUndoOperation('entry-1', null);
      profile.entries.push({ id: 'entry-1', updatedAt: 'after-create', status: 'given' });
      finalizeEntryUndoOperation(createUndo, profile.entries[0]);
      lastEntryUndoOperation = createUndo;
      if (!applyEntryUndoOperation(createUndo)) throw new Error('Nie udało się cofnąć utworzenia wpisu.');
    `,
    context
  );
  fail(
    vm.runInContext('profile.entries.length', context) === 0,
    'Cofnięcie nie usunęło nowego wpisu.'
  );
  fail(
    vm.runInContext('lastEntryUndoOperation', context) === null,
    'Cofnięta operacja pozostała aktywna.'
  );

  vm.runInContext(
    `
      const deleted = { id: 'entry-2', updatedAt: 'before-delete', status: 'skipped' };
      profile.entries.push(deleted);
      const deleteUndo = captureEntryUndoOperation(deleted.id, deleted);
      profile.entries.length = 0;
      finalizeEntryUndoOperation(deleteUndo, null);
      if (!applyEntryUndoOperation(deleteUndo)) throw new Error('Nie udało się cofnąć usunięcia wpisu.');
    `,
    context
  );
  fail(
    vm.runInContext('profile.entries[0].id', context) === 'entry-2',
    'Cofnięcie nie odtworzyło usuniętego wpisu.'
  );
  fail(
    /Cofnięto/.test(vm.runInContext('toastMessage', context)),
    'Brakuje potwierdzenia cofnięcia.'
  );
}

runTodayControlsTest();
runUndoTest();
console.log('Test działania ekranu Dzisiaj: OK — dawka ±0,1, przypomnienie i odwracalne operacje.');

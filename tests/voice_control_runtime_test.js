const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({ console, Date });

vm.runInContext(
  `
    const MONTHS_NORMALIZED = {
      stycznia: 0, styczen: 0, lutego: 1, luty: 1, marca: 2, marzec: 2,
      kwietnia: 3, kwiecien: 3, maja: 4, maj: 4, czerwca: 5, czerwiec: 5,
      lipca: 6, lipiec: 6, sierpnia: 7, sierpien: 7, wrzesnia: 8, wrzesien: 8,
      pazdziernika: 9, pazdziernik: 9, listopada: 10, listopad: 10,
      grudnia: 11, grudzien: 11
    };
    function pad(value) { return String(value).padStart(2, '0'); }
    function datePartsToISO(year, month, day) { return year + '-' + pad(month) + '-' + pad(day); }
    function localDateISO(date = new Date()) {
      return datePartsToISO(date.getFullYear(), date.getMonth() + 1, date.getDate());
    }
    function isValidDateParts(year, month, day) {
      const date = new Date(year, month - 1, day);
      return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    }
    function normalizeText(value) {
      return String(value || '').toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').replace(/[!?;,]+/g, ' ')
        .replace(/\\s+/g, ' ').trim();
    }
    function normalizeDose(value) {
      const number = Number(String(value).replace(',', '.'));
      return number > 0 && number <= 1000 ? String(number).replace('.', ',') : '';
    }
  `,
  context
);
vm.runInContext(
  fs.readFileSync(path.join(root, 'src/components/voice-control/index.js'), 'utf8'),
  context
);

function evaluate(expression) {
  return JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context));
}

vm.runInContext(
  `
    let isListening = false;
    let recognition = null;
    let browserRecognizerCreated = 0;
    const voiceLabel = { textContent: '' };
    const voiceButton = {
      disabled: false,
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute() {},
      querySelector() { return voiceLabel; }
    };
    const el = {
      'voice-button': voiceButton,
      'voice-help': { textContent: '' }
    };
    function BrowserSpeechRecognition() {
      browserRecognizerCreated += 1;
      this.addEventListener = function addEventListener() {};
    }
    const window = {
      NativeBridge: {
        platform: 'android',
        async startVoiceRecognition() { return { success: false, state: 'cancelled' }; },
        stopVoiceRecognition() {}
      },
      webkitSpeechRecognition: BrowserSpeechRecognition
    };
    configureSpeechRecognition();
    globalThis.__nativeRecognizerPreferred = recognition?.isNative === true;
    globalThis.__browserRecognizerCreatedForAndroid = browserRecognizerCreated;

    window.NativeBridge = { platform: 'web' };
    configureSpeechRecognition();
    globalThis.__browserRecognizerUsedForPwa = browserRecognizerCreated === 1 && !recognition?.isNative;
  `,
  context
);

assert.equal(
  vm.runInContext('__nativeRecognizerPreferred', context),
  true,
  'APK Android musi zawsze wybrać natywne rozpoznawanie mowy.'
);
assert.equal(
  vm.runInContext('__browserRecognizerCreatedForAndroid', context),
  0,
  'WebView nie może uruchamiać przeglądarkowego mikrofonu w APK.'
);
assert.equal(
  vm.runInContext('__browserRecognizerUsedForPwa', context),
  true,
  'Prawdziwa wersja PWA powinna nadal używać API przeglądarki.'
);

const now = 'new Date(2026, 7, 10, 12, 0, 0)';
assert.equal(vm.runInContext(`parseDateFromSpeech('wczoraj', ${now})`, context), '2026-08-09');
assert.equal(vm.runInContext(`parseDateFromSpeech('jutro', ${now})`, context), '2026-08-11');
assert.equal(vm.runInContext(`parseDateFromSpeech('pojutrze', ${now})`, context), '2026-08-12');
assert.equal(vm.runInContext(`parseDateFromSpeech('za trzy dni', ${now})`, context), '2026-08-13');
assert.equal(
  vm.runInContext(`parseDateFromSpeech('trzy dni temu', ${now})`, context),
  '2026-08-07'
);
assert.equal(
  vm.runInContext(`parseDateFromSpeech('w przyszly piatek', ${now})`, context),
  '2026-08-14'
);
assert.equal(
  vm.runInContext(`parseDateFromSpeech('w zeszly piatek', ${now})`, context),
  '2026-08-07'
);

assert.equal(vm.runInContext("parseTimeFromSpeech('o 19:35')", context), '19:35');
assert.equal(vm.runInContext("parseTimeFromSpeech('o osmej trzydziesci')", context), '08:30');
assert.equal(
  vm.runInContext("parseTimeFromSpeech('o dwudziestej pierwszej pietnascie')", context),
  '21:15'
);

assert.deepEqual(
  evaluate(`parseVoiceEntry('wczoraj o 19:30 podalam zastrzyk w lewe udo', ${now})`),
  {
    date: '2026-08-09',
    time: '19:30',
    side: 'lewa',
    site: 'udo',
    status: 'given',
  }
);
assert.deepEqual(evaluate(`parseVoiceEntry('jutro bede nakluwac prawy brzuch', ${now})`), {
  date: '2026-08-11',
  side: 'prawa',
  site: 'brzuch',
  status: 'given',
});
assert.deepEqual(evaluate(`parseVoiceEntry('pojutrze pomijam zastrzyk', ${now})`), {
  date: '2026-08-12',
  status: 'skipped',
});
assert.deepEqual(evaluate(`parseVoiceEntry('nie podalem dawki wczoraj', ${now})`), {
  date: '2026-08-09',
  status: 'skipped',
});

assert.deepEqual(evaluate("parseVoiceAmpouleCommand('odkladam ampulke osiemnasta')"), {
  action: 'pause',
  number: 18,
});
assert.deepEqual(evaluate("parseVoiceAmpouleCommand('wracam do ampulki siedemnastej')"), {
  action: 'resume',
  number: 17,
});
assert.deepEqual(evaluate("parseVoiceAmpouleCommand('kontynuuj ampulke 17')"), {
  action: 'resume',
  number: 17,
});
assert.deepEqual(evaluate("parseVoiceAmpouleCommand('wznow ampulke dwudziesta pierwsza')"), {
  action: 'resume',
  number: 21,
});

vm.runInContext(
  `
    let data = {
      activeAmpouleId: 'a18',
      ampoules: [
        { id: 'a17', number: 17, status: 'paused' },
        { id: 'a18', number: 18, status: 'active' }
      ]
    };
    function getActiveAmpoule() {
      return data.ampoules.find((item) => item.id === data.activeAmpouleId) || null;
    }
    function getOpenPausedAmpoules() {
      return data.ampoules.filter((item) => item.status === 'paused');
    }
    function getAmpouleRemainingDoseCount() { return 5; }
    function pauseAmpoule(id) {
      const target = data.ampoules.find((item) => item.id === id);
      target.status = 'paused';
      data.activeAmpouleId = '';
      return true;
    }
    function resumeAmpoule(id) {
      data.ampoules.forEach((item) => { item.status = item.id === id ? 'active' : 'paused'; });
      data.activeAmpouleId = id;
    }
    function showToast() {}
    function speakIfEnabled() {}
  `,
  context
);
vm.runInContext(
  "executeVoiceAmpouleCommand(parseVoiceAmpouleCommand('odkladam ampulke osiemnasta'))",
  context
);
assert.equal(vm.runInContext('data.activeAmpouleId', context), '');
vm.runInContext(
  "executeVoiceAmpouleCommand(parseVoiceAmpouleCommand('kontynuuj ampulke siedemnasta'))",
  context
);
assert.equal(vm.runInContext('data.activeAmpouleId', context), 'a17');

console.log('Test głosu: OK — odmiany, czas przeszły/teraźniejszy/przyszły, godziny i ampułki.');

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'src/services/theme/index.js'), 'utf8');
let systemDark = false;
let mediaListener = null;
let changeListener = null;
let persisted = 0;
let toastMessage = '';
const themeMeta = {
  content: '',
  setAttribute(name, value) {
    if (name === 'content') this.content = value;
  },
};
const controls = {
  system: { checked: false },
  light: { checked: false },
  dark: { checked: false },
};

const context = vm.createContext({
  console,
  data: { appSettings: { appearance: { theme: 'nieprawidłowy' } } },
  document: {
    documentElement: { dataset: {}, style: {} },
    querySelector(selector) {
      return selector === 'meta[name="theme-color"]' ? themeMeta : null;
    },
  },
  window: {
    matchMedia() {
      return {
        get matches() {
          return systemDark;
        },
        addEventListener(type, listener) {
          if (type === 'change') mediaListener = listener;
        },
        addListener(listener) {
          mediaListener = listener;
        },
      };
    },
  },
  el: {
    'theme-mode-control': {
      addEventListener(type, listener) {
        if (type === 'change') changeListener = listener;
      },
    },
    'theme-system': controls.system,
    'theme-light': controls.light,
    'theme-dark': controls.dark,
    'theme-status': { textContent: '' },
  },
  persistData() {
    persisted += 1;
    return true;
  },
  showToast(message) {
    toastMessage = message;
  },
});

vm.runInContext(
  `const ALLOWED_THEME_MODES = new Set(['system', 'light', 'dark']);
   const DEFAULT_THEME_MODE = 'system';
   ${source}`,
  context
);

function requireResult(condition, message) {
  if (!condition) throw new Error(`BŁĄD MOTYWU: ${message}`);
}

vm.runInContext('getAppearanceSettings()', context);
requireResult(
  context.data.appSettings.appearance.theme === 'system',
  'błędna wartość nie wraca do trybu automatycznego'
);

vm.runInContext("applyThemePreference('dark')", context);
requireResult(
  context.document.documentElement.dataset.theme === 'dark',
  'nie można włączyć motywu ciemnego'
);
requireResult(themeMeta.content === '#0b2529', 'motyw ciemny nie aktualizuje koloru systemowego');

vm.runInContext('bindThemePreferences()', context);
requireResult(typeof changeListener === 'function', 'kontrolka Wygląd nie ma zdarzenia zmiany');
requireResult(typeof mediaListener === 'function', 'brak nasłuchiwania ustawienia telefonu');

changeListener({
  target: {
    closest() {
      return { value: 'light' };
    },
  },
});
requireResult(
  context.data.appSettings.appearance.theme === 'light',
  'motyw jasny nie został zapisany'
);
requireResult(
  context.document.documentElement.dataset.theme === 'light',
  'motyw jasny nie został zastosowany'
);
requireResult(
  persisted === 1 && toastMessage,
  'zmiana motywu nie została utrwalona lub potwierdzona'
);

context.data.appSettings.appearance.theme = 'system';
systemDark = true;
mediaListener({ matches: true });
requireResult(
  context.document.documentElement.dataset.theme === 'dark',
  'tryb automatyczny nie reaguje na zmianę telefonu'
);
requireResult(
  controls.system.checked,
  'panel ustawień nie pokazuje aktywnego trybu automatycznego'
);

console.log('Test działania motywu: OK — zapis, jasny, ciemny i reakcja na ustawienie telefonu.');

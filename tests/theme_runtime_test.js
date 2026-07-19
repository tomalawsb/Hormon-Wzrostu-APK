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
  data: {
    appSettings: {
      appearance: {
        theme: 'nieprawidłowy',
        fontSize: 'gigantyczna',
        fontStyle: 'fantazyjna',
      },
    },
  },
  document: {
    documentElement: { dataset: {}, style: {} },
    getElementById() {
      return null;
    },
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
   const ALLOWED_FONT_SIZES = new Set(['small', 'standard', 'large', 'xlarge']);
   const DEFAULT_FONT_SIZE = 'standard';
   const ALLOWED_FONT_STYLES = new Set(['system', 'readable', 'classic']);
   const DEFAULT_FONT_STYLE = 'system';
   ${source}`,
  context
);

function requireResult(condition, message) {
  if (!condition) throw new Error(`BŁĄD WYGLĄDU: ${message}`);
}

vm.runInContext('getAppearanceSettings()', context);
requireResult(
  context.data.appSettings.appearance.theme === 'system',
  'błędna wartość motywu nie wraca do trybu automatycznego'
);
requireResult(
  context.data.appSettings.appearance.fontSize === 'standard',
  'błędna wielkość czcionki nie wraca do standardowej'
);
requireResult(
  context.data.appSettings.appearance.fontStyle === 'system',
  'błędny styl czcionki nie wraca do systemowego'
);

vm.runInContext("applyThemePreference('dark')", context);
requireResult(
  context.document.documentElement.dataset.theme === 'dark',
  'nie można włączyć motywu ciemnego'
);
requireResult(themeMeta.content === '#0b2529', 'motyw ciemny nie aktualizuje koloru systemowego');
requireResult(
  context.document.documentElement.dataset.fontSize === 'standard' &&
    context.document.documentElement.dataset.fontStyle === 'system',
  'uruchomienie wyglądu nie stosuje domyślnej czcionki'
);

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

vm.runInContext(
  `handleTypographyChange({
    target: {
      closest() { return { name: 'font-size', value: 'xlarge' }; }
    }
  })`,
  context
);
requireResult(
  context.data.appSettings.appearance.fontSize === 'xlarge',
  'bardzo duża czcionka nie została zapisana'
);
requireResult(
  context.document.documentElement.dataset.fontSize === 'xlarge',
  'bardzo duża czcionka nie została zastosowana'
);

vm.runInContext(
  `handleTypographyChange({
    target: {
      closest() { return { name: 'font-style', value: 'classic' }; }
    }
  })`,
  context
);
requireResult(
  context.data.appSettings.appearance.fontStyle === 'classic',
  'klasyczny styl czcionki nie został zapisany'
);
requireResult(
  context.document.documentElement.dataset.fontStyle === 'classic',
  'klasyczny styl czcionki nie został zastosowany'
);
requireResult(persisted === 3, 'ustawienia czcionki nie zostały utrwalone');

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

console.log(
  'Test wyglądu: OK — motyw, wielkość i styl czcionki są sanitizowane, stosowane i zapisywane.'
);

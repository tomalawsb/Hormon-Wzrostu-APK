const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'www/**',
      'android/app/src/main/assets/web/**',
      'android/**/build/**',
      'dist/**',
      'GOTOWE_APK/**',
      'native-bridge.js',
    ],
  },
  {
    ...js.configs.recommended,
    files: ['app.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: globals.browser,
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    ...js.configs.recommended,
    files: ['src/native/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
  },
  {
    ...js.configs.recommended,
    files: ['service-worker.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: globals.serviceworker,
    },
  },
  {
    ...js.configs.recommended,
    files: ['tests/**/*.js', 'tools/**/*.js', '*.config.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        Blob: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        fetch: 'readonly',
        structuredClone: 'readonly',
      },
    },
  },
];

#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/screens/settings/permissions.js'), 'utf8');

function createContext() {
  const storage = new Map();
  const dialog = {
    open: true,
    closeCalls: 0,
    close() {
      this.open = false;
      this.closeCalls += 1;
    },
    removeAttribute(name) {
      if (name === 'open') this.open = false;
    },
  };
  const toasts = [];
  const context = vm.createContext({
    console,
    Boolean,
    data: { meta: { onboardingCompleted: false } },
    el: { 'permissions-dialog': dialog },
    PERMISSIONS_ONBOARDING_STORAGE_KEY: 'permissions-test',
    PERMISSIONS_ONBOARDING_REVISION: 'permissions-v2',
    localStorage: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
    },
    persistData() {
      return false;
    },
    scheduleDailyReminder() {},
    showToast(message, kind) {
      toasts.push({ message, kind });
    },
    finishFirstRunAndOfferPwaInstall() {},
    window: {
      setTimeout(callback) {
        callback();
      },
    },
  });
  vm.runInContext(source, context);
  return { context, dialog, storage, toasts };
}

{
  const { context, dialog, storage } = createContext();
  const saved = vm.runInContext('finishPermissionsOnboarding()', context);
  assert.equal(saved, false);
  assert.equal(dialog.open, false, 'Okno zgód musi się zamknąć mimo błędu zapisu.');
  assert.equal(dialog.closeCalls, 1);
  assert.equal(context.data.meta.onboardingCompleted, true);
  assert.equal(storage.get('permissions-test'), 'permissions-v2');
}

{
  const { context, dialog, toasts } = createContext();
  const saved = vm.runInContext('skipPermissionsOnboarding({ silent: false })', context);
  assert.equal(saved, false);
  assert.equal(dialog.open, false, 'Przycisk „Pomiń” nie może pozostawić modalu na ekranie.');
  assert.match(toasts.at(-1)?.message || '', /Pominięto konfigurację zgód/);
}

console.log('Test okna zgód: OK — modal zamyka się także przy błędzie magazynu Androida.');

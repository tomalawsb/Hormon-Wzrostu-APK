#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/services/notifications/index.js'), 'utf8');

function nodeStub() {
  return { dataset: {}, hidden: false, textContent: '' };
}

const diagnosticIds = [
  'reminder-diagnostics-overall',
  'reminder-diagnostic-permission',
  'reminder-diagnostic-channel',
  'reminder-diagnostic-exact-alarm',
  'reminder-diagnostic-next',
  'reminder-diagnostics-note',
  'reminder-diagnostics-checked',
  'open-notification-settings-button',
  'request-exact-alarm-button',
];
const elements = Object.fromEntries(diagnosticIds.map((id) => [id, nodeStub()]));
const profile = {
  id: 'profile-1',
  name: 'Kasia',
  settings: { reminderEnabled: true, reminderTime: '21:00' },
  meta: { lastReminderDate: '' },
  entries: [],
  ampoules: [],
};

const context = vm.createContext({
  console,
  Date,
  Intl,
  el: elements,
  currentDiagnostic: {
    platform: 'android',
    androidApi: 36,
    notificationPermission: 'denied',
    notificationsEnabled: false,
    channelEnabled: false,
    exactAlarmPermission: 'denied',
    configuredProfiles: 1,
    scheduledProfiles: 0,
    nextTriggerAt: 0,
    scheduleMode: 'none',
  },
  notificationShown: false,
  lastToast: { message: '', type: '' },
  window: {
    NativeBridge: {
      isNative: true,
      notificationDiagnostics: async () => context.currentDiagnostic,
      notificationPermission: async () => context.currentDiagnostic.notificationPermission,
      showNotification: async () => context.notificationShown,
      exactAlarmPermission: async () => context.currentDiagnostic.exactAlarmPermission,
      requestExactAlarmPermission: async () => context.currentDiagnostic.exactAlarmPermission,
      openNotificationSettings: async () => true,
    },
  },
  isNativeAndroidApp: () => true,
  getAvailableProfiles: () => [profile],
  getActiveProfile: () => profile,
  getNextReminderTarget: () => new Date('2026-07-19T21:00:00'),
  permissionText: (state) =>
    ({ granted: 'Zezwolono', denied: 'Zablokowano', prompt: 'Wymaga zgody' })[state] ||
    'Brak obsługi',
  showToast: (message, type) => {
    context.lastToast = { message, type };
  },
});

vm.runInContext(source, context);
vm.runInContext("reminderBody = () => 'Treść testowego przypomnienia';", context);

async function run() {
  await vm.runInContext('refreshReminderDiagnostics()', context);
  assert.equal(elements['reminder-diagnostics-overall'].textContent, 'Nie działa');
  assert.equal(elements['reminder-diagnostics-overall'].dataset.state, 'error');
  assert.match(elements['reminder-diagnostics-note'].textContent, /blokuje powiadomienia/i);
  assert.equal(elements['reminder-diagnostic-next'].textContent, 'Nie zaplanowano');

  context.currentDiagnostic = {
    platform: 'android',
    androidApi: 36,
    notificationPermission: 'granted',
    notificationsEnabled: true,
    channelEnabled: true,
    exactAlarmPermission: 'denied',
    configuredProfiles: 1,
    scheduledProfiles: 1,
    nextTriggerAt: new Date('2026-07-20T21:00:00').getTime(),
    scheduleMode: 'inexact',
  };
  await vm.runInContext('refreshReminderDiagnostics()', context);
  assert.equal(elements['reminder-diagnostics-overall'].textContent, 'Możliwe opóźnienie');
  assert.equal(elements['reminder-diagnostics-overall'].dataset.state, 'warning');
  assert.equal(elements['reminder-diagnostic-exact-alarm'].textContent, 'Przybliżona godzina');
  assert.doesNotMatch(elements['reminder-diagnostic-next'].textContent, /brak|nie zaplanowano/i);

  context.notificationShown = false;
  const failed = await vm.runInContext('testReminderNotification()', context);
  assert.equal(failed, false);
  assert.equal(context.lastToast.type, 'error');
  assert.match(context.lastToast.message, /nie potwierdził|nie zostało wysłane/i);

  context.notificationShown = true;
  const succeeded = await vm.runInContext('testReminderNotification()', context);
  assert.equal(succeeded, true);
  assert.equal(context.lastToast.type, 'success');
  assert.match(context.lastToast.message, /wysłano testowe/i);

  console.log(
    'Test działania etapu 10: OK — diagnostyka nie zgłasza fałszywego sukcesu i ostrzega o alarmie przybliżonym.'
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

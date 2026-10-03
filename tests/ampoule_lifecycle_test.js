'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
  url: 'https://test.invalid/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const { window } = dom;
window.structuredClone = structuredClone;
window.fetch = fetch;
window.matchMedia = () => ({ matches: false, addEventListener() {} });
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
  this.dispatchEvent(new window.Event('close'));
};
let source = fs
  .readFileSync(path.join(root, 'app.js'), 'utf8')
  .replace("document.addEventListener('DOMContentLoaded', init);", '');
source = source.replace(
  /\}\)\(\);\s*$/,
  `
  let testDate = '2026-09-23';
  localDateISO = () => testDate;
  persistData = () => !window.failWrite;
  renderAll = () => {};
  speakIfEnabled = () => {};
  cacheElements();
  bindAmpouleLifecycle();
  window.testApi = {
    defaultData: createDefaultData, create: createAmpouleRecord,
    set(value) { data = attachActiveProfileAliases(value); resetQuickDraftForToday(); },
    get() { return data; }, profile: getActiveProfile,
    date(value) { testDate = value; },
    normalize: normalizeStoredData, validate: inspectImportedData,
    state: getReplacementState, request: requestAmpouleChange, confirm: commitAmpouleChange,
    close: closeAmpouleReplacement, resolve: resolveEntryAmpoule,
    save: confirmRecommendedInjection, undo: () => applyEntryUndoOperation(lastEntryUndoOperation),
    skipped() { quickDraft = createDefaultDraft({status: 'skipped'}); saveQuickDraft(); },
    pending: () => pendingAmpouleChange,
    stock: saveInventory, settings: saveAmpouleSettings,
    schedule: scheduleAmpouleReplacementPrompt,
    clearDismissed: () => dismissedAmpoulePrompts.clear(),
    switchProfile: setActiveProfileId,
    skin: sanitizeAppearanceSettings, capacity: getAmpouleCapacityForEntry,
    correct: applyQuickAmpouleValues, openQuick: openAmpouleSettings,
    startQuick: startNewAmpouleFromQuickDialog, reminder: buildReminderState,
  };
})();`
);
window.eval(source);
const api = window.testApi;
const snapshot = () => JSON.parse(JSON.stringify(api.get()));
const dialog = window.document.getElementById('ampoule-replacement-dialog');
const control = (id) => window.document.getElementById(id);

function exhausted(n = 10) {
  if (api.pending()) api.close();
  window.failWrite = false;
  const data = api.defaultData();
  data.appMeta.setupCompleted = true;
  const profile = data.profiles[0];
  profile.settings.ampouleVolumeMl = '20';
  profile.settings.ampouleDoseMl = '0,5';
  profile.settings.ampouleDoseCount = n;
  profile.inventory = { enabled: true, unopenedCount: 3, lowThreshold: 2 };
  const ampoule = api.create({
    number: 1,
    startDate: '2026-09-01',
    volumeMl: 20,
    doseMl: 0.5,
    targetDoseCount: n,
    status: 'finished',
  });
  profile.ampoules = [ampoule];
  profile.activeAmpouleId = '';
  profile.entries = Array.from({ length: n }, (_, index) => ({
    id: `dose-${index}`,
    date: `2026-09-${String(23 - n + index).padStart(2, '0')}`,
    time: '20:00',
    status: 'given',
    dose: '1',
    unit: 'mg',
    side: 'lewa',
    site: 'udo',
    ampouleId: ampoule.id,
    ampouleDoseMl: '0,5',
    note: '',
    createdAt: '2026-09-22T18:00:00Z',
    updatedAt: '',
  }));
  api.set(data);
  return api.profile();
}

async function main() {
  // A count-exhausted cartridge must remain exhausted despite remaining nominal ml.
  for (const n of [1, 10, 12]) {
    exhausted(n);
    const migrated = api.normalize(snapshot()).data;
    assert.equal(migrated.profiles[0].ampoules[0].status, 'finished');
    assert.equal(migrated.profiles[0].activeAmpouleId, '');
    assert.equal(api.state().required, true);
    assert.equal(api.resolve('2026-09-23').kind, 'confirmation');
    const before = snapshot();
    api.request();
    assert.equal(dialog.open, true);
    api.close();
    assert.deepEqual(snapshot(), before, 'Declining must not mutate therapy or stock');
    api.request();
    assert.equal(api.confirm(), true);
    assert.equal(api.profile().ampoules.length, 2);
    assert.equal(api.profile().entries.length, n, 'Replacement must not save an injection');
    assert.equal(api.profile().inventory.unopenedCount, 2);
    assert.equal(api.confirm(), false, 'Duplicate confirmation must be idempotent');
    api.save();
    assert.equal(api.profile().entries.length, n + 1);
    assert.equal(api.profile().inventory.unopenedCount, 2);
    api.undo();
    assert.equal(api.profile().entries.length, n);
    assert.equal(
      api.profile().ampoules.length,
      2,
      'Undoing injection must retain physically opened cartridge'
    );
    assert.equal(api.profile().inventory.unopenedCount, 2);
    const restored = api.normalize(snapshot()).data;
    assert.equal(restored.profiles[0].inventory.unopenedCount, 2);
    assert.ok(restored.profiles[0].ampoules[1].replacementConfirmedAt);
  }

  exhausted();
  const beforeFailure = snapshot();
  api.request();
  window.failWrite = true;
  assert.equal(api.confirm(), false);
  assert.deepEqual(
    snapshot(),
    beforeFailure,
    'Failed write rolls back cartridge and stock together'
  );
  window.failWrite = false;
  assert.equal(api.confirm(), true, 'Retry must remain possible');
  assert.equal(api.profile().inventory.unopenedCount, 2);

  let profile = exhausted();
  const paused = api.create({
    number: 2,
    startDate: '2026-09-10',
    volumeMl: 10,
    doseMl: 1,
    targetDoseCount: 10,
  });
  profile.ampoules.push(paused);
  api.request({ resumeId: paused.id });
  api.confirm();
  assert.equal(api.profile().activeAmpouleId, paused.id);
  assert.equal(
    api.profile().inventory.unopenedCount,
    3,
    'Resuming does not consume unopened stock'
  );

  exhausted();
  api.skipped();
  assert.equal(api.profile().entries.at(-1).status, 'skipped');
  assert.equal(api.profile().ampoules.length, 1);
  assert.equal(api.pending(), null);
  assert.equal(
    control('entry-dialog').open,
    false,
    'A profile switch must not restore a stale entry form'
  );
  assert.equal(api.resolve('2026-09-20').kind, 'history-selection');
  const old = api.profile().entries[0];
  assert.equal(api.resolve(old.date, old).id, old.ampouleId);
  assert.equal(api.resolve('2026-09-24').kind, 'invalid-date');

  profile = exhausted();
  profile.inventory.unopenedCount = 0;
  api.request();
  assert.equal(api.confirm(), true);
  assert.equal(api.profile().inventory.unopenedCount, 0);
  assert.equal(api.profile().ampoules.at(-1).stockDeducted, false);

  const linked = api.profile().entries[0];
  assert.equal(api.resolve('2099-01-01', linked).kind, 'invalid-date');
  const counted = api.profile().ampoules.at(-1);
  counted.volumeMl = '0.1';
  assert.equal(
    api.capacity({ status: 'given', ampouleDoseMl: '1' }, counted.id).sufficient,
    true,
    'Configured dose count, not legacy ml estimate, controls availability'
  );

  // Default settings must not rewrite the currently open cartridge.
  control('ampoule-start-number').value = '3';
  control('ampoule-volume').value = '30';
  control('ampoule-dose-ml').value = '1';
  control('ampoule-dose-count').value = '15';
  control('ampoule-start-date').value = '2026-09-23';
  control('ampoule-max-open-days').value = '';
  const current = JSON.stringify(api.profile().ampoules.at(-1));
  api.settings();
  assert.equal(api.profile().settings.ampouleDoseCount, 15);
  assert.equal(JSON.stringify(api.profile().ampoules.at(-1)), current);

  exhausted();
  api.request();
  api.close();
  control('entry-dialog').showModal();
  api.request();
  const other = api.defaultData().profiles[0];
  other.id = 'another-profile';
  api.get().profiles.push(other);
  api.switchProfile(other.id);
  assert.equal(api.pending(), null);
  assert.equal(
    control('entry-dialog').open,
    false,
    'A profile switch must not restore a stale entry form'
  );
  assert.equal(api.confirm(), false);
  assert.equal(api.get().profiles[0].inventory.unopenedCount, 3);

  exhausted();
  api.clearDismissed();
  api.schedule();
  await new Promise((resolve) => setTimeout(resolve, 520));
  assert.equal(dialog.open, true, 'Next-day launch prompts without a save attempt');
  api.close();
  api.schedule();
  await new Promise((resolve) => setTimeout(resolve, 520));
  assert.equal(dialog.open, false, 'Dismissed automatic prompt does not loop');

  const roundtrip = snapshot();
  roundtrip.appSettings.appearance.skin = 'family';
  api.validate(roundtrip);
  assert.equal(api.normalize(roundtrip).data.appSettings.appearance.skin, 'family');
  roundtrip.profiles[0].inventory.unopenedCount = -1;
  assert.throws(() => api.validate(roundtrip), /zapas/);
  assert.equal(api.skin({ skin: 'unknown' }).skin, 'readable');

  profile = exhausted();
  const originalId = profile.ampoules[0].id;
  const stockBefore = profile.inventory.unopenedCount;
  api.correct({ number: 1, date: '2026-09-01', count: 12, maxDays: 0 });
  assert.equal(api.profile().activeAmpouleId, originalId);
  assert.equal(api.profile().ampoules[0].targetDoseCount, 12);
  assert.equal(api.profile().inventory.unopenedCount, stockBefore);
  api.profile().settings.ampouleDoseCount = 15;
  api.openQuick();
  api.startQuick();
  assert.equal(api.pending().values.count, 15);
  api.close();
  control('ampoule-quick-dialog').close();

  exhausted();
  window.failWrite = true;
  const beforeCorrection = snapshot();
  assert.equal(api.correct({ number: 1, date: '2026-09-01', count: 12, maxDays: 0 }), false);
  assert.deepEqual(snapshot(), beforeCorrection);
  window.failWrite = false;
  const reminder = api.reminder(api.profile());
  assert.equal(reminder.replacementNeeded, true);
  assert.equal(reminder.replacementFromDate, '2026-09-23');
  api.request();
  api.confirm();
  assert.equal(api.reminder(api.profile()).replacementNeeded, false);
  api.save();
  let actions = Array.from(window.document.querySelectorAll('.toast--action button'));
  assert.deepEqual(
    actions.map((button) => button.textContent),
    ['Cofnij', 'Edytuj']
  );
  actions[1].click();
  assert.equal(control('entry-dialog').open, true);
  control('entry-dialog').close();
  api.undo();
  api.save();
  actions = Array.from(window.document.querySelectorAll('.toast--action button'));
  actions[0].click();
  assert.equal(api.profile().entries.length, 10);
  api.save();
  await new Promise((resolve) => setTimeout(resolve, 3150));
  assert.equal(window.document.querySelector('.toast--action'), null);

  const v12 = snapshot();
  v12.version = 15;
  v12.profiles[0].inventory = { enabled: true, unopened: 5, lowThreshold: 2 };
  api.validate(v12);
  const migratedV12 = api.normalize(v12).data;
  assert.equal(migratedV12.version, 16);
  assert.equal(migratedV12.profiles[0].inventory.unopenedCount, 5);
  console.log(
    'Ampoule lifecycle: OK — 1/10/12 doses, confirmation, cancellation, rollback, undo, profiles, stock, historical entries, next-day prompt and migration.'
  );
}

main()
  .then(() => window.close())
  .catch((error) => {
    console.error(error);
    window.close();
    process.exitCode = 1;
  });

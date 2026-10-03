'use strict';

// Destructive synthetic-data test, deliberately restricted to an emulator and debug APK.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const serial = process.argv.find((arg) => arg.startsWith('--device='))?.split('=')[1];
if (!/^emulator-\d+$/.test(serial || '') || !process.argv.includes('--replace-test-data')) {
  throw new Error('Use --device=emulator-PORT --replace-test-data on a disposable emulator.');
}
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
assert.ok(sdk, 'ANDROID_HOME is required.');
const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const app = 'pl.tomaszwolak.dzienniczekhormonuwzrostu';
const port = 9326;
const slot = 'dzienniczek-hormonu-wzrostu-v1';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = (...args) =>
  execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true }).trim();

async function connect() {
  const pid = run('shell', 'pidof', app);
  run('forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`);
  let target;
  for (let retry = 0; retry < 50; retry++) {
    try {
      const targets = await (
        await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(2000) })
      ).json();
      target = targets.find((item) => item.type === 'page');
      if (target) break;
    } catch {}
    await delay(200);
  }
  assert.ok(target, 'Debug WebView is unavailable.');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };
  return {
    close: () => ws.close(),
    async evaluate(expression) {
      const response = await new Promise((resolve, reject) => {
        const next = ++id;
        const timeout = setTimeout(() => {
          pending.delete(next);
          reject(new Error('CDP timeout'));
        }, 10000);
        pending.set(next, (value) => {
          clearTimeout(timeout);
          resolve(value);
        });
        ws.send(
          JSON.stringify({
            id: next,
            method: 'Runtime.evaluate',
            params: { expression, awaitPromise: true, returnByValue: true },
          })
        );
      });
      assert.ok(!response.error && !response.result.exceptionDetails, JSON.stringify(response));
      return response.result.result.value;
    },
  };
}

async function main() {
  let client;
  try {
    run('install', '-r', path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk'));
    run('shell', 'am', 'start', '-W', '-n', `${app}/.MainActivity`);
    client = await connect();
    await delay(800);
    const fixture = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'fixtures/ampoule-exhausted.json'), 'utf8')
    );
    const today = await client.evaluate("new Date().toLocaleDateString('en-CA')");
    const date = (offset) => {
      const value = new Date(`${today}T12:00:00Z`);
      value.setUTCDate(value.getUTCDate() + offset);
      return value.toISOString().slice(0, 10);
    };
    const profile = fixture.profiles[0];
    profile.settings.ampouleStartDate = profile.ampoules[0].startDate = date(-12);
    profile.entries.forEach((entry, i) => {
      entry.date = date(-10 + i);
    });
    const write = (value) =>
      client.evaluate(
        `AndroidNative.secureStorageWrite(${JSON.stringify(slot)},${JSON.stringify(JSON.stringify(value))})`
      );
    const read = () =>
      client.evaluate(
        `JSON.parse(JSON.parse(AndroidNative.secureStorageRead(${JSON.stringify(slot)})).value)`
      );
    const reload = async () => {
      await client.evaluate('location.reload();true');
      await delay(1500);
    };
    const click = (id) =>
      client.evaluate(`document.getElementById(${JSON.stringify(id)}).click();true`);
    const open = () =>
      client.evaluate("document.getElementById('ampoule-replacement-dialog').open");
    await client.evaluate(
      "localStorage.setItem('dzienniczek-hormonu-zgody-onboarding','permissions-v3')"
    );

    // Exercise AndroidKeyStore itself, including fresh IVs and encrypted storage at rest.
    assert.equal(await write(fixture), true, 'Native encrypted write failed.');
    const encryptedBefore = run(
      'shell',
      'run-as',
      app,
      'cat',
      'shared_prefs/secure_medical_data_v1.xml'
    );
    assert.ok(!encryptedBefore.includes(profile.name));
    assert.equal(await write(fixture), true);
    const encryptedAfter = run(
      'shell',
      'run-as',
      app,
      'cat',
      'shared_prefs/secure_medical_data_v1.xml'
    );
    assert.notEqual(encryptedBefore, encryptedAfter, 'Repeated writes must use fresh IVs.');
    await reload();
    assert.equal(await open(), true, 'Next-day launch must request replacement.');
    await click('replacement-defer');
    assert.equal((await read()).profiles[0].ampoules.length, 1);
    await click('recommended-save-button');
    assert.equal(await open(), true);
    await click('replacement-confirm');
    await click('replacement-confirm');
    let saved = (await read()).profiles[0];
    assert.equal(saved.ampoules.length, 2);
    assert.equal(saved.entries.length, 10);
    assert.equal(saved.inventory.unopenedCount, 2);

    // Kill the native process so this also verifies persistence beyond WebView reload.
    client.close();
    run('shell', 'am', 'force-stop', app);
    run('shell', 'am', 'start', '-W', '-n', `${app}/.MainActivity`);
    client = await connect();
    await delay(1200);
    assert.equal(await open(), false);
    await click('recommended-save-button');
    saved = (await read()).profiles[0];
    assert.equal(saved.entries.length, 11);
    assert.equal(saved.inventory.unopenedCount, 2);

    // Legacy schema migration must preserve history and start with inventory disabled.
    fixture.version = 14;
    delete fixture.profiles[0].inventory;
    assert.equal(await write(fixture), true);
    await reload();
    saved = (await read()).profiles[0];
    assert.equal(saved.entries.length, 10);
    assert.equal(saved.inventory.enabled, false);
    await click('replacement-defer');

    // Use real controls and Chromium's computed CSS, not just settings values.
    for (const skin of ['readable', 'elegant', 'family']) {
      const palettes = new Set();
      for (const theme of ['light', 'dark', 'elegant', 'amber', 'silver', 'lavender']) {
        const rendered = await client.evaluate(`(() => {
          document.getElementById('skin-${skin}').click();
          document.getElementById('theme-${theme}').click();
          const root = document.documentElement, css = getComputedStyle(root);
          return {skin:root.dataset.skin,theme:root.dataset.theme,
            primary:css.getPropertyValue('--primary').trim(),background:css.getPropertyValue('--bg').trim(),
            radius:css.getPropertyValue('--skin-radius').trim(),
            overflow:document.documentElement.scrollWidth > innerWidth + 1};
        })()`);
        assert.equal(rendered.skin, skin);
        assert.equal(rendered.theme, theme);
        assert.equal(rendered.radius, { readable: '22px', elegant: '10px', family: '28px' }[skin]);
        assert.equal(rendered.overflow, false);
        palettes.add(rendered.primary + '/' + rendered.background);
      }
      assert.equal(palettes.size, 6, `A palette did not change for ${skin}`);
    }
    await reload();
    assert.equal(await client.evaluate('document.documentElement.dataset.theme'), 'lavender');
    assert.equal(await client.evaluate('document.documentElement.dataset.skin'), 'family');
    await click('replacement-defer');
    await click('theme-system');
    for (const mode of ['yes', 'no']) {
      run('shell', 'cmd', 'uimode', 'night', mode);
      await delay(500);
      assert.equal(
        await client.evaluate('document.documentElement.dataset.theme'),
        mode === 'yes' ? 'dark' : 'light'
      );
    }
    console.log(
      'Android themes: OK — 18 palettes/skins, automatic light/dark, persistence and no horizontal overflow.'
    );

    // File picker cancellation is a normal outcome for all supported report types.
    for (const [extension, mime] of [
      ['pdf', 'application/pdf'],
      ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['csv', 'text/csv'],
    ]) {
      await client.evaluate(
        `window.exportTestResult = null; NativeBridge.saveFile('test.${extension}', '${mime}', btoa('synthetic test')).then(result => window.exportTestResult = result); true`
      );
      await delay(800);
      run('shell', 'input', 'keyevent', 'KEYCODE_BACK');
      await delay(500);
      assert.equal(await client.evaluate('window.exportTestResult?.state'), 'cancelled');
    }
    assert.equal(
      await client.evaluate("AndroidNative.saveFile('bad.html','text/html',btoa('test'))"),
      false
    );
    console.log(
      'Android file export: OK — PDF/DOCX/CSV picker, cancellation and MIME restriction.'
    );

    const lastReminderBefore = (await read()).profiles[0].meta.lastReminderDate;
    run(
      'shell',
      'am',
      'start',
      '-W',
      '-n',
      `${app}/.MainActivity`,
      '-a',
      `${app}.OPEN_REMINDER`,
      '--es',
      'reminder_profile_id',
      fixture.profiles[0].id,
      '--es',
      'reminder_date',
      today,
      '--es',
      'reminder_kind',
      'ampoule'
    );
    await delay(500);
    assert.equal(
      (await read()).profiles[0].meta.lastReminderDate,
      lastReminderBefore,
      'Opening a replacement notification must not suppress the injection reminder'
    );
    run('shell', 'pm', 'grant', app, 'android.permission.POST_NOTIFICATIONS');
    run('shell', 'appops', 'set', app, 'SCHEDULE_EXACT_ALARM', 'allow');
    const scheduleSlot = 'dzienniczek-hormonu-reminder-schedule-v1';
    const readSchedule = () =>
      client.evaluate(
        `JSON.parse(JSON.parse(AndroidNative.secureStorageRead('${scheduleSlot}')).value).profiles`
      );
    const alarm = await client.evaluate(`(() => {
      const dose = new Date(Date.now() + 10 * 60 * 1000);
      return {profileId:'alarm-test',profileName:'Test',enabled:true,
        time: dose.toTimeString().slice(0,5),today:new Date().toLocaleDateString('en-CA'),todayHasEntry:false,
        body:'Test zastrzyku',replacementNeeded:true,replacementFromDate:new Date().toLocaleDateString('en-CA'),replacementBody:'Test wymiany'};
    })()`);
    await client.evaluate(`NativeBridge.syncDailyReminders(${JSON.stringify([alarm])})`);
    let schedules = await readSchedule();
    assert.equal(schedules.length, 2);
    assert.equal(schedules.find((item) => item.reminderKind === 'ampoule').scheduleMode, 'exact');
    // Leave the app in the background; an already-due replacement warning arrives after 5s.
    run('shell', 'input', 'keyevent', 'KEYCODE_HOME');
    await delay(6500);
    schedules = await readSchedule();
    const delivered = schedules.find((item) => item.reminderKind === 'ampoule');
    assert.ok(delivered.lastDeliveredDate);
    const notificationDump = run('shell', 'dumpsys', 'notification', '--noredact');
    assert.ok(notificationDump.includes('Test wymiany'));
    assert.equal(
      schedules.find((item) => item.reminderKind !== 'ampoule').lastDeliveredDate || '',
      ''
    );
    alarm.replacementNeeded = false;
    await client.evaluate(`NativeBridge.syncDailyReminders(${JSON.stringify([alarm])})`);
    assert.equal((await readSchedule()).length, 1);

    // A future warning remains exactly 30 minutes earlier, including after restoring schedules.
    const future = await client.evaluate(`(() => {
      const dose = new Date(Date.now() + 2 * 60 * 60 * 1000);
      return {time:dose.toTimeString().slice(0,5),date:dose.toLocaleDateString('en-CA')};
    })()`);
    alarm.time = future.time;
    alarm.replacementNeeded = true;
    alarm.replacementFromDate = future.date;
    alarm.profileId = 'future-test';
    await client.evaluate(`NativeBridge.syncDailyReminders(${JSON.stringify([alarm])})`);
    schedules = await readSchedule();
    const injection = schedules.find((item) => item.reminderKind !== 'ampoule');
    const warning = schedules.find((item) => item.reminderKind === 'ampoule');
    // When the injection crosses midnight its warning must retain that injection's date.
    assert.equal(warning.nextDate, future.date);
    if (injection.nextDate === warning.nextDate)
      assert.equal(injection.nextAt - warning.nextAt, 30 * 60 * 1000);
    run('shell', 'appops', 'set', app, 'SCHEDULE_EXACT_ALARM', 'deny');
    client.close();
    run('shell', 'am', 'start', '-W', '-n', `${app}/.MainActivity`);
    client = await connect();
    await delay(1000);
    await client.evaluate(`NativeBridge.syncDailyReminders(${JSON.stringify([alarm])})`);
    assert.ok((await readSchedule()).every((item) => item.scheduleMode === 'inexact'));
    await client.evaluate('NativeBridge.syncDailyReminders([])');
    run('shell', 'appops', 'set', app, 'SCHEDULE_EXACT_ALARM', 'allow');
    console.log(
      'Android reminders: OK — encrypted schedules, background delivery, exact/inexact alarms, independent cancellation and 30-minute offset.'
    );
    console.log(
      'Android emulator: OK — Keystore encryption, fresh IV, process restart, replacement, duplicate confirmation, separate injection, schema 14 migration.'
    );
  } finally {
    client?.close();
    try {
      run('forward', '--remove', `tcp:${port}`);
    } catch {}
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

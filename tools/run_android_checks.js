#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const androidRoot = path.join(root, 'android');
const required = process.env.ANDROID_CHECK_REQUIRED === '1';

function readLocalSdkPath() {
  const localProperties = path.join(androidRoot, 'local.properties');
  if (!fs.existsSync(localProperties)) return '';
  const match = /^sdk\.dir=(.+)$/m.exec(fs.readFileSync(localProperties, 'utf8'));
  return match ? match[1].trim().replace(/\\\\/g, '\\') : '';
}

function failOrSkip(reason) {
  const prefix = required ? 'BŁĄD KONTROLI ANDROIDA' : 'Android Lint/APK: POMINIĘTO';
  console[required ? 'error' : 'warn'](`${prefix} — ${reason}`);
  process.exit(required ? 1 : 0);
}

const sdkRoot = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || readLocalSdkPath();
if (!sdkRoot || !fs.existsSync(sdkRoot)) {
  failOrSkip('brak Android SDK; w CI kontrola jest obowiązkowa.');
}

const java = spawnSync('java', ['-version'], { stdio: 'ignore', shell: false });
if (java.error || java.status !== 0) {
  failOrSkip('brak działającej Javy.');
}

const wrapper = path.join(androidRoot, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
if (!fs.existsSync(wrapper)) {
  failOrSkip('brak Gradle Wrappera.');
}

if (process.platform !== 'win32') {
  try {
    fs.chmodSync(wrapper, 0o755);
  } catch (error) {
    failOrSkip(`nie udało się nadać prawa uruchomienia Gradle Wrapperowi: ${error.message}`);
  }
}

const result = spawnSync(wrapper, ['--no-daemon', 'lintDebug', 'assembleDebug', '--stacktrace'], {
  cwd: androidRoot,
  env: process.env,
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  console.error(`BŁĄD KONTROLI ANDROIDA — ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

const apk = path.join(androidRoot, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!fs.existsSync(apk) || fs.statSync(apk).size === 0) {
  console.error('BŁĄD KONTROLI ANDROIDA — Gradle nie utworzył app-debug.apk.');
  process.exit(1);
}

console.log(`Android Lint i APK debug: OK — ${fs.statSync(apk).size} bajtów.`);

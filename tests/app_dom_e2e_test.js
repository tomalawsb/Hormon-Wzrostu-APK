#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const appVersion = JSON.parse(fs.readFileSync(path.join(root, 'app-version.json'), 'utf8')).version;

function waitFor(condition, timeoutMs = 5000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (condition()) return resolve();
      if (Date.now() - startedAt >= timeoutMs) return reject(new Error('Przekroczono czas E2E.'));
      setTimeout(check, 20);
    };
    check();
  });
}

function click(window, selector) {
  const element = window.document.querySelector(selector);
  assert.ok(element, `Nie znaleziono elementu ${selector}`);
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  return element;
}

async function main() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const dom = new JSDOM(html, {
    pretendToBeVisual: true,
    runScripts: 'outside-only',
    url: 'https://example.test/dzienniczek/#today',
  });
  const { window } = dom;

  Object.defineProperty(window, 'crypto', { configurable: true, value: crypto.webcrypto });
  Object.defineProperty(window, 'indexedDB', { configurable: true, value: indexedDB });
  Object.defineProperty(window, 'IDBKeyRange', { configurable: true, value: IDBKeyRange });
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  Object.defineProperty(window.navigator, 'storage', {
    configurable: true,
    value: {
      persist: async () => true,
      persisted: async () => true,
    },
  });
  window.structuredClone = structuredClone;
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  window.queueMicrotask = queueMicrotask;
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  window.fetch = async (input) => {
    const url = String(input?.url || input);
    if (url.includes('app-version.json')) {
      return new Response(JSON.stringify({ version: appVersion }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: false }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  window.confirm = () => true;
  window.print = () => undefined;
  window.scrollTo = () => undefined;
  window.open = () => null;
  window.URL.createObjectURL = () => 'blob:e2e';
  window.URL.revokeObjectURL = () => undefined;
  window.HTMLElement.prototype.scrollIntoView = () => undefined;
  window.HTMLElement.prototype.setPointerCapture = () => undefined;
  window.HTMLElement.prototype.releasePointerCapture = () => undefined;
  window.HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function close() {
    this.open = false;
    this.dispatchEvent(new window.Event('close'));
  };

  window.eval(source);
  await waitFor(() => !window.document.documentElement.classList.contains('security-pending'));
  assert.ok(!window.document.documentElement.classList.contains('security-startup-failed'));
  assert.equal(window.document.querySelector('#view-today').classList.contains('is-active'), true);

  click(window, '#today-dose-increase');
  assert.match(window.document.querySelector('#main-dose-value').textContent, /1,1\s*mg/);

  click(window, '#recommended-skip-button');
  await waitFor(() =>
    /Pominięto/.test(window.document.querySelector('#main-status-badge').textContent)
  );
  assert.equal(window.document.querySelector('#today-undo-button').disabled, false);

  click(window, '[data-view="history"]');
  assert.equal(
    window.document.querySelector('#view-history').classList.contains('is-active'),
    true
  );
  assert.match(window.document.querySelector('#history-list').textContent, /Pominięto/);

  click(window, '[data-view="today"]');
  click(window, '#active-profile-button');
  click(window, '#add-profile-button');
  const nameInput = window.document.querySelector('#profile-name-input');
  nameInput.value = 'Olek';
  window.document
    .querySelector('#profile-editor-form')
    .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => window.document.querySelector('#active-profile-name').textContent === 'Olek');
  assert.equal(window.document.querySelectorAll('[data-today-profile-id]').length, 2);

  click(window, '[data-today-profile-id="profile-1"]');
  await waitFor(
    () => window.document.querySelector('#active-profile-name').textContent === 'Dziecko 1'
  );
  assert.match(window.document.querySelector('#main-status-badge').textContent, /Pominięto/);

  const darkInput = window.document.querySelector('#theme-dark');
  darkInput.checked = true;
  darkInput.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(window.document.documentElement.dataset.theme, 'dark');

  click(window, '[data-view="calendar"]');
  assert.equal(
    window.document.querySelector('#view-calendar').classList.contains('is-active'),
    true
  );
  assert.equal(window.document.querySelectorAll('#calendar-grid [data-date]').length, 42);

  dom.window.close();
  console.log(
    'Test E2E DOM: OK — start aplikacji, zmiana dawki, pominięcie, historia, profile, motyw i kalendarz.'
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

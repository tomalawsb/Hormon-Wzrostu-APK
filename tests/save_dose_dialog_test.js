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
  const doc = window.document;
  const dialog = doc.querySelector('#save-confirm-dialog');
  assert.ok(dialog, 'Brak okna potwierdzenia zapisu.');
  const labels = [...dialog.querySelectorAll('button')].map((button) => button.textContent.trim());
  assert.deepEqual(labels, ['Zapisz', 'Edytuj', 'Pomiń']);

  // Przyciski toastów i okna muszą przyjmować kliknięcia (regresja 2.3.2).
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  assert.match(css, /\.toast \{[^}]*pointer-events: auto;/, 'Toast nie przyjmuje kliknięć.');

  const status = () => doc.querySelector('#main-status-badge').textContent;
  const openConfirm = () => {
    click(window, '#recommended-save-button');
    assert.equal(dialog.open, true, 'Zapisz podanie nie otworzyło okna.');
  };

  // Pomiń: zamyka bez zapisu.
  openConfirm();
  assert.match(doc.querySelector('#save-confirm-summary').textContent, /Dzisiaj:/);
  click(window, '#save-confirm-skip');
  assert.equal(dialog.open, false, 'Pomiń nie zamknęło okna.');
  assert.doesNotMatch(status(), /Podano/);

  // Escape, systemowe anulowanie (Wstecz Androida) i kliknięcie w tło nie blokują stanu.
  openConfirm();
  doc.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(dialog.open, false, 'Escape nie zamknął okna.');
  openConfirm();
  dialog.dispatchEvent(new window.Event('cancel', { cancelable: true }));
  assert.equal(dialog.open, false, 'Anulowanie nie zamknęło okna.');
  openConfirm();
  dialog.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(dialog.open, false, 'Kliknięcie w tło nie zamknęło okna.');
  assert.doesNotMatch(status(), /Podano/);

  // Edytuj: okno zamknięte, formularz wpisu otwarty z danymi.
  openConfirm();
  click(window, '#save-confirm-edit');
  assert.equal(dialog.open, false, 'Edytuj nie zamknęło okna.');
  assert.equal(doc.querySelector('#entry-dialog').open, true, 'Edytuj nie otworzyło formularza.');
  assert.ok(doc.querySelector('#entry-dose').value, 'Formularz nie ma dawki.');
  assert.ok(doc.querySelector('#entry-side').value && doc.querySelector('#entry-site').value);
  click(window, '#dialog-cancel-button');
  assert.equal(doc.querySelector('#entry-dialog').open, false);

  // Zapisz: zapis podania (z ewentualnym potwierdzeniem pierwszej ampułki).
  openConfirm();
  click(window, '#save-confirm-save');
  assert.equal(dialog.open, false, 'Zapisz nie zamknęło okna.');
  const replacement = doc.querySelector('#ampoule-replacement-dialog');
  if (replacement.open) {
    click(window, '#replacement-confirm');
    await waitFor(() => !replacement.open);
    openConfirm();
    click(window, '#save-confirm-save');
    assert.equal(dialog.open, false);
  }
  await waitFor(() => /Podano/.test(status()));

  // Przycisk w potwierdzeniu po zapisie działa (Cofnij).
  const undo = [...doc.querySelectorAll('.toast__action')].find((b) => b.textContent === 'Cofnij');
  assert.ok(undo, 'Brak przycisku Cofnij po zapisie.');
  undo.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await waitFor(() => !/Podano/.test(status()));

  // Szybki formularz także przechodzi przez okno potwierdzenia.
  const quickSave = doc.querySelector('#save-button');
  if (!quickSave.disabled) {
    click(window, '#save-button');
    assert.equal(dialog.open, true, 'Zapisz podanie (formularz) nie otworzyło okna.');
    click(window, '#save-confirm-skip');
    assert.equal(dialog.open, false);
  }

  dom.window.close();
  console.log('Test okna zapisu podania: OK — Zapisz, Edytuj, Pomiń, Escape, Wstecz i tło.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

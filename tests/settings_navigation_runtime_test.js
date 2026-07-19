#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/screens/settings/navigation.js'), 'utf8');
const targets = [
  'profiles',
  'treatment',
  'reminders',
  'ampoules',
  'appearance',
  'data',
  'security',
  'about',
];

function classListStub() {
  const values = new Set();
  return {
    toggle(name, enabled) {
      if (enabled) values.add(name);
      else values.delete(name);
    },
    contains(name) {
      return values.has(name);
    },
  };
}

function elementStub(dataset = {}) {
  const attributes = new Map();
  return {
    classList: classListStub(),
    dataset,
    hidden: false,
    id: '',
    tabIndex: 0,
    focus() {},
    scrollIntoView() {},
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) || null;
    },
    querySelector() {
      return null;
    },
  };
}

const buttons = targets.map((target) => elementStub({ settingsTarget: target }));
const panels = targets.map((target) => elementStub({ settingsPanel: target }));
const summaries = {
  injection: elementStub(),
  voice: elementStub(),
  permissions: elementStub(),
};
const advanced = {
  'settings-advanced-injection': {
    open: false,
    querySelector: () => summaries.injection,
  },
  'settings-advanced-voice': { open: false, querySelector: () => summaries.voice },
  'settings-advanced-permissions': {
    open: false,
    querySelector: () => summaries.permissions,
  },
};

const context = vm.createContext({
  console,
  document: {
    getElementById(id) {
      return advanced[id] || null;
    },
    querySelector(selector) {
      const match = selector.match(/data-settings-panel="([^"]+)"/);
      return match
        ? panels.find((panel) => panel.dataset.settingsPanel === match[1]) || null
        : null;
    },
  },
  el: {
    'settings-layout': elementStub(),
    'settings-profile-context': elementStub(),
    'settings-category-list': {
      querySelectorAll: () => buttons,
      querySelector: () => buttons[0],
    },
    'settings-section-back-button': elementStub(),
    'settings-panels': { querySelectorAll: () => panels },
  },
  activeView: 'more',
  switchView() {},
  window: {
    matchMedia: () => ({ matches: false }),
    setTimeout(callback) {
      callback();
    },
  },
});

vm.runInContext(source, context);

vm.runInContext("openSettingsSection('injection-order', { focus: false })", context);
assert.equal(vm.runInContext('activeSettingsSection', context), 'treatment');
assert.equal(advanced['settings-advanced-injection'].open, true);
assert.equal(context.el['settings-profile-context'].hidden, false);

vm.runInContext("openSettingsSection('voice', { focus: false })", context);
assert.equal(vm.runInContext('activeSettingsSection', context), 'reminders');
assert.equal(advanced['settings-advanced-voice'].open, true);

vm.runInContext("openSettingsSection('permissions-info', { focus: false })", context);
assert.equal(vm.runInContext('activeSettingsSection', context), 'about');
assert.equal(advanced['settings-advanced-permissions'].open, true);
assert.equal(context.el['settings-profile-context'].hidden, true);

vm.runInContext("openSettingsSection('nieznana', { focus: false })", context);
assert.equal(vm.runInContext('activeSettingsSection', context), 'profiles');

vm.runInContext("openSettingsSection('treatment', { focus: false })", context);
assert.equal(context.el['settings-section-back-button'].hidden, false);
assert.equal(
  context.el['settings-section-back-button'].classList.contains('is-hidden'),
  false,
  'Przycisk powrotu powinien być widoczny na podstronie ustawień.'
);
vm.runInContext('showSettingsOverview({ focus: false })', context);
assert.equal(context.el['settings-section-back-button'].hidden, true);
assert.equal(
  context.el['settings-section-back-button'].classList.contains('is-hidden'),
  true,
  'Przycisk powrotu powinien być ukryty na liście wszystkich ustawień.'
);

buttons.forEach((button) => {
  const target = button.dataset.settingsTarget;
  assert.equal(button.id, `settings-tab-${target}`);
  assert.equal(button.getAttribute('aria-controls'), `settings-panel-${target}`);
});
panels.forEach((panel) => {
  const target = panel.dataset.settingsPanel;
  assert.equal(panel.id, `settings-panel-${target}`);
  assert.equal(panel.getAttribute('aria-labelledby'), `settings-tab-${target}`);
});

console.log(
  'Test działania ustawień etapu 9: OK — nawigacja, przekierowania i sekcje zaawansowane.'
);

#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const axe = require('axe-core');
const { JSDOM } = require('jsdom');

async function main() {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    pretendToBeVisual: true,
    runScripts: 'outside-only',
    url: 'https://example.test/dzienniczek/',
  });
  dom.window.eval(axe.source);
  const results = await dom.window.axe.run(dom.window.document, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    },
    rules: {
      'color-contrast': { enabled: false },
    },
  });

  const violations = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }));
  assert.equal(
    violations.length,
    0,
    `axe-core wykrył problemy dostępności:\n${JSON.stringify(violations, null, 2)}`
  );
  console.log(
    `Test axe-core: OK — ${results.passes.length} reguł zaliczonych; brak naruszeń WCAG A/AA (kontrast wymaga prawdziwej przeglądarki).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

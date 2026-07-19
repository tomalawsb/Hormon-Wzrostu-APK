#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const args = process.argv.slice(2);
if (!args.length) {
  console.error('Brak skryptu Pythona do uruchomienia.');
  process.exit(1);
}

const projectRoot = path.resolve(__dirname, '..');
const scriptPath = path.resolve(projectRoot, args[0]);
const scriptArgs = [scriptPath, ...args.slice(1)];

const candidates =
  process.platform === 'win32'
    ? [
        { command: 'py', args: ['-3', ...scriptArgs] },
        { command: 'python', args: scriptArgs },
      ]
    : [
        { command: 'python3', args: scriptArgs },
        { command: 'python', args: scriptArgs },
      ];

let lastError = null;
for (const candidate of candidates) {
  const result = spawnSync(candidate.command, candidate.args, {
    stdio: 'inherit',
    cwd: projectRoot,
    shell: false,
  });
  if (!result.error) process.exit(result.status ?? 0);
  if (result.error.code !== 'ENOENT') {
    lastError = result.error;
    break;
  }
  lastError = result.error;
}

console.error('Nie znaleziono Pythona 3.');
if (lastError) console.error(String(lastError.message || lastError));
process.exit(1);

#!/usr/bin/env node
'use strict';
// Uruchamia skrypt Pythona projektu niezależnie od polskich znaków i spacji w ścieżkach:
// - skrypt podawany jest ścieżką WZGLĘDNĄ do katalogu projektu (cwd),
// - bez powłoki (tablica argumentów), wymuszone UTF-8 w Pythonie,
// - kolejność: DH_PYTHON (ustawiany przez tools/dzienniczek.ps1), python/python3, py -3.

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

function toRelativeScript(scriptArgument) {
  const absolute = path.resolve(projectRoot, scriptArgument);
  const relative = path.relative(projectRoot, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Skrypt musi leżeć w projekcie: ${scriptArgument}`);
  }
  return relative.split(path.sep).join('/');
}

function candidates() {
  const list = [];
  if (process.env.DH_PYTHON) list.push({ command: process.env.DH_PYTHON, prefix: [] });
  if (process.platform === 'win32') {
    list.push({ command: 'python', prefix: [] }, { command: 'py', prefix: ['-3'] });
  } else {
    list.push({ command: 'python3', prefix: [] }, { command: 'python', prefix: [] });
  }
  return list;
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Brak skryptu Pythona do uruchomienia.');
    return 1;
  }
  const script = toRelativeScript(args[0]);
  const env = {
    ...process.env,
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONDONTWRITEBYTECODE: '1',
  };
  let lastError = null;
  for (const candidate of candidates()) {
    const result = spawnSync(candidate.command, [...candidate.prefix, script, ...args.slice(1)], {
      cwd: projectRoot,
      env,
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    });
    if (result.error) {
      lastError = result.error;
      if (result.error.code === 'ENOENT') continue;
      break;
    }
    // 9009: atrapa python.exe ze Sklepu Microsoft - spróbuj kolejnego interpretera.
    if (process.platform === 'win32' && result.status === 9009) continue;
    return result.status ?? 1;
  }
  console.error(
    `Nie znaleziono działającego Pythona 3. ${lastError ? lastError.message : ''}`.trim()
  );
  return 1;
}

process.exitCode = main();

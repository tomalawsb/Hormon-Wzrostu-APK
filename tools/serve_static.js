#!/usr/bin/env node
'use strict';
// Lokalny podgląd PWA: mały serwer statyczny bez zależności (tylko 127.0.0.1).

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const args = process.argv.slice(2);
const rootArg = args.find((value) => !value.startsWith('--'));
const portIndex = args.indexOf('--port');
const firstPort = portIndex >= 0 ? Number(args[portIndex + 1]) : 8080;
const openBrowser = args.includes('--open');

if (!rootArg || !fs.existsSync(path.join(rootArg, 'index.html'))) {
  console.error('Brak przygotowanej strony (index.html). Uruchom URUCHOM.cmd.');
  process.exit(1);
}
const root = path.resolve(rootArg);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function resolveRequest(url) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  } catch {
    return null;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const target = path.resolve(root, '.' + pathname);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

const server = http.createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }
  const target = resolveRequest(request.url);
  if (!target) {
    response.writeHead(400);
    response.end('Nieprawidłowa ścieżka');
    return;
  }
  fs.stat(target, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Nie znaleziono');
      return;
    }
    response.writeHead(200, {
      'Content-Type': types[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') return response.end();
    fs.createReadStream(target).pipe(response);
  });
});

function start(port, attemptsLeft) {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) return start(port + 1, attemptsLeft - 1);
    console.error('Nie udało się uruchomić serwera: ' + error.message);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    const address = `http://localhost:${port}/`;
    console.log(`Podgląd aplikacji: ${address}`);
    console.log('Zatrzymanie: Ctrl+C albo zamknięcie tego okna.');
    if (openBrowser) {
      const command =
        process.platform === 'win32'
          ? ['cmd.exe', ['/d', '/c', 'start', '""', address]]
          : process.platform === 'darwin'
            ? ['open', [address]]
            : ['xdg-open', [address]];
      try {
        spawn(command[0], command[1], { detached: true, stdio: 'ignore', windowsHide: true })
          .on('error', () => undefined)
          .unref();
      } catch {
        // Przeglądarkę można otworzyć ręcznie pod wypisanym adresem.
      }
    }
  });
}

start(Number.isInteger(firstPort) && firstPort > 0 ? firstPort : 8080, 20);

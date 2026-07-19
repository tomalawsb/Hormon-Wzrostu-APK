#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const scope = 'https://example.test/app/';
const listeners = new Map();
const buckets = new Map();
let fetchImplementation = async () => {
  throw new TypeError('offline');
};

function keyOf(request) {
  return typeof request === 'string' ? request : request.url;
}

function bucket(name) {
  if (!buckets.has(name)) {
    const records = new Map();
    buckets.set(name, {
      records,
      async match(request) {
        const response = records.get(keyOf(request));
        return response ? response.clone() : undefined;
      },
      async put(request, response) {
        records.set(keyOf(request), response.clone());
      },
    });
  }
  return buckets.get(name);
}

const caches = {
  open: async (name) => bucket(name),
  keys: async () => [...buckets.keys()],
  delete: async (name) => buckets.delete(name),
  match: async (request) => {
    for (const cache of buckets.values()) {
      const response = await cache.match(request);
      if (response) return response;
    }
    return undefined;
  },
};

const self = {
  registration: {
    scope,
    showNotification: async () => undefined,
  },
  location: new URL(scope),
  clients: {
    claim: async () => undefined,
    matchAll: async () => [],
    openWindow: async () => undefined,
  },
  addEventListener(type, listener) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(listener);
  },
  skipWaiting: async () => undefined,
};

const context = vm.createContext({
  self,
  caches,
  URL,
  Request,
  Response,
  Headers,
  AbortController,
  TextEncoder,
  TextDecoder,
  Uint8Array,
  crypto: globalThis.crypto,
  indexedDB: {},
  btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
  atob: (value) => Buffer.from(value, 'base64').toString('binary'),
  console,
  setTimeout,
  clearTimeout,
  fetch: (...args) => fetchImplementation(...args),
});
vm.runInContext(source, context, { filename: 'service-worker.js' });

async function dispatchFetch(request) {
  let responsePromise;
  const waits = [];
  const event = {
    request,
    respondWith(value) {
      responsePromise = Promise.resolve(value);
    },
    waitUntil(value) {
      waits.push(Promise.resolve(value));
    },
  };
  listeners.get('fetch')[0](event);
  assert.ok(responsePromise, `Brak respondWith dla ${request.url}`);
  const response = await responsePromise;
  await Promise.all(waits);
  return response;
}

async function dispatchMessage(type) {
  let result;
  const waits = [];
  const event = {
    data: { type },
    ports: [
      {
        postMessage(value) {
          result = value;
        },
      },
    ],
    waitUntil(value) {
      waits.push(Promise.resolve(value));
    },
  };
  listeners.get('message')[0](event);
  await Promise.all(waits);
  return result;
}

function request(url, { mode = 'same-origin', destination = '', accept = '*/*' } = {}) {
  return {
    url,
    method: 'GET',
    mode,
    destination,
    headers: new Headers({ Accept: accept }),
  };
}

async function run() {
  const documentCache = bucket('dzienniczek-hormonu-v1.0-1907261907-documents');
  await documentCache.put(
    new URL('./index.html', scope).href,
    new Response('<!doctype html><main>offline shell</main>', {
      headers: { 'Content-Type': 'text/html' },
    })
  );

  fetchImplementation = async () => {
    throw new TypeError('offline');
  };
  const navigation = await dispatchFetch(
    request(new URL('./history', scope).href, {
      mode: 'navigate',
      destination: 'document',
      accept: 'text/html',
    })
  );
  assert.match(await navigation.text(), /offline shell/);
  assert.match(navigation.headers.get('content-type'), /text\/html/);

  const json = await dispatchFetch(
    request(new URL('./missing.json', scope).href, {
      destination: '',
      accept: 'application/json',
    })
  );
  assert.equal(json.status, 503);
  assert.match(json.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await json.json(), { ok: false, offline: true, error: 'offline' });

  const scriptCache = bucket('dzienniczek-hormonu-v1.0-1907261907-scripts');
  const scriptUrl = new URL('./app.js', scope).href;
  await scriptCache.put(
    scriptUrl,
    new Response('window.offlineApp = true;', {
      headers: { 'Content-Type': 'text/javascript' },
    })
  );
  const script = await dispatchFetch(request(scriptUrl, { destination: 'script' }));
  assert.match(await script.text(), /offlineApp/);

  const apiUrl = 'https://api.github.com/repos/tomalawsb/Hormon-Wzrostu-APK/releases/latest';
  const api = await dispatchFetch(request(apiUrl, { accept: 'application/json' }));
  assert.equal(api.status, 503);
  assert.match(api.headers.get('content-type'), /application\/json/);

  fetchImplementation = async (incoming) => {
    const url = keyOf(incoming);
    const contentType = url.endsWith('.js')
      ? 'text/javascript'
      : url.endsWith('.css')
        ? 'text/css'
        : url.endsWith('.json')
          ? 'application/json'
          : url.endsWith('.png')
            ? 'image/png'
            : 'text/html';
    return new Response(
      contentType === 'application/json' ? '{"version":"1.0-1907261907"}' : 'fresh',
      {
        status: 200,
        headers: { 'Content-Type': contentType },
      }
    );
  };
  const refresh = await dispatchMessage('REFRESH_APP_RESOURCES');
  assert.equal(refresh.ok, true);
  const status = await dispatchMessage('GET_PWA_STATUS');
  assert.equal(status.ok, true);

  console.log(
    'Test działania service workera: OK — HTML tylko dla nawigacji, JSON bez fallbacku HTML i bezpieczne odświeżenie cache.'
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

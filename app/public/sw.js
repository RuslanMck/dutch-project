// Service worker: keeps the app shell and read-only API answers, so the app opens and shows the last data offline.
// The server replaces __APP_VERSION__ with a hash of public/ when it serves /sw.js. Writes never go through here.

const APP_VERSION = '__APP_VERSION__';
const SHELL_CACHE = `shell-${APP_VERSION}`;
const API_CACHE = 'api-v1';
const NAVIGATION_TIMEOUT_MS = 4000;
const API_TIMEOUT_MS = 6000;

const SHELL_URLS = [
  '/',
  '/index.html',
  '/app.js',
  '/api.js',
  '/logic.js',
  '/offline-store.js',
  '/app.css',
  '/icon.svg',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/fonts/manrope-cyrillic.woff2',
  '/fonts/manrope-latin-ext.woff2',
  '/fonts/manrope-latin.woff2',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // One missing file (for example an optional one) must not fail the whole install.
    await Promise.all(SHELL_URLS.map(url => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(key => key.startsWith('shell-') && key !== SHELL_CACHE).map(key => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'clear-data') {
    event.waitUntil(caches.delete(API_CACHE));
  }
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/api/events' || url.pathname === '/api/health') return;
  if (url.pathname.startsWith('/auth/') || url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApi(event, request));
    return;
  }
  event.respondWith(handleShell(request));
});

// Rejects if the promise does not settle within ms.
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

// Network first (4 s); offline or slow, the cached index.html. A redirect (to /login) passes through.
async function handleNavigation(request) {
  const network = fetch(request);
  try {
    return await withTimeout(network, NAVIGATION_TIMEOUT_MS);
  } catch (error) {
    const cached = await caches.match('/index.html', { cacheName: SHELL_CACHE });
    if (cached) return cached;
    return network;
  }
}

// Network first, falling back to the cache; a good answer refreshes the cached copy.
async function handleShell(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { cacheName: SHELL_CACHE });
    if (cached) return cached;
    throw error;
  }
}

// Network first (6 s). A 200 answer is stored with its time; offline, the stored copy with X-Offline-Cache.
async function handleApi(event, request) {
  try {
    const response = await withTimeout(fetch(request), API_TIMEOUT_MS);
    if (response.status === 200) {
      // Clone now, before the page reads the body.
      event.waitUntil(storeApiAnswer(request, response.clone()));
    }
    return response;
  } catch (error) {
    const cache = await caches.open(API_CACHE);
    const cached = await cache.match(request);
    if (cached) return offlineCopy(cached);
    return new Response(JSON.stringify({ error: "Немає зв'язку", offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function storeApiAnswer(request, response) {
  const headers = new Headers(response.headers);
  headers.set('X-Stored-At', String(Date.now()));
  const body = await response.blob();
  const stored = new Response(body, { status: response.status, statusText: response.statusText, headers });
  const cache = await caches.open(API_CACHE);
  await cache.put(request, stored);
}

async function offlineCopy(cached) {
  const headers = new Headers(cached.headers);
  const storedAt = cached.headers.get('X-Stored-At') || '';
  headers.set('X-Offline-Cache', storedAt);
  const body = await cached.blob();
  return new Response(body, { status: cached.status, statusText: cached.statusText, headers });
}

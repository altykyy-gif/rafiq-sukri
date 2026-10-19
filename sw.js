/* Offline application shell; patient data never enters the network cache. */
'use strict';
const CACHE_PREFIX = 'rafiq-offline:' + self.registration.scope + ':';
const CACHE_NAME = CACHE_PREFIX + '1.0.1';
const FILES = [
  './', './index.html', './styles.css', './core.js', './storage.js', './content.js', './app.js', './manifest.webmanifest',
  './assets/app-icon.svg', './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable-512.png',
  './favicon.ico', './apple-touch-icon.png', './assets/favicon-16.png', './assets/favicon-32.png',
  './assets/cairo-regular.woff2', './assets/cairo-bold.woff2', './assets/hero.svg', './assets/plate.svg', './assets/research-logo.png',
  './research/ورقة_العمل_المبدئية.pdf'
];
const URLS = FILES.map(file => new URL(file, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try { await cache.addAll(URLS.map(url => new Request(url, { cache: 'reload' }))); }
    catch (e) { await caches.delete(CACHE_NAME); throw e; }
    // Updated versions wait until the user chooses the update button.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const exact = await cache.match(request, { ignoreSearch: true });
    if (exact) return exact;
    if (request.mode === 'navigate') {
      const shell = await cache.match(new URL('./index.html', self.registration.scope).href);
      if (shell) return shell;
    }
    try { return await fetch(request); }
    catch { return new Response('هذا الملف غير متاح دون إنترنت.', { status: 503, headers: { 'Content-Type': 'text/plain;charset=utf-8' } }); }
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CACHE_STATUS') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_NAME);
      const checks = await Promise.all(URLS.map(url => cache.match(url)));
      event.ports[0]?.postMessage({ ready: checks.every(Boolean), version: '1.0.1' });
    })());
  }
});

/* Service worker: cache the app shell; everything else is network-first with a small fallback cache. */
const VERSION = 'rain-v1.0.0';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== VERSION + '-tiles').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isBasemapTile(url) {
  return /server\.arcgisonline\.com|tile\.openstreetmap\.org/.test(url);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  // App shell: network first (so updates land immediately), cache as offline fallback.
  if (SHELL.some((s) => url.endsWith(s.replace('./', '/')) || url === s) || url === self.registration.scope) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Basemap tiles: cache with a cap so the map still draws offline where you have been before.
  if (isBasemapTile(url)) {
    e.respondWith(
      caches.open(VERSION + '-tiles').then(async (c) => {
        const cached = await c.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            c.put(req, res.clone());
            trimCache(c, 600);
          }
          return res;
        } catch (err) {
          return cached || Response.error();
        }
      })
    );
    return;
  }
  // Everything else (radar, forecast APIs): network only.
});

async function trimCache(cache, max) {
  const keys = await cache.keys();
  if (keys.length > max) {
    for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
  }
}

/* Bolo Yojana service worker — offline-first app shell.
 * - Precaches the shell + sample notices on install.
 * - Same-origin GET requests: cache-first (hashed Vite assets never change), then network & cache.
 * - Navigations: network-first, falling back to the cached index.html (HashRouter → one page).
 * Scheme data is bundled in the JS, so core scheme info works fully offline once loaded.
 */
const VERSION = 'by-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/samples/notice-pmkisan-ekyc.png', '/samples/notice-ayushman-camp.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { caches.open(VERSION).then((c) => c.put('/index.html', res.clone())); return res; })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Same-origin assets + Tesseract language data / engine from CDNs (so OCR works offline after first use).
  const cacheable = url.origin === self.location.origin || /cdn\.jsdelivr\.net|tessdata\.projectnaptha\.com/.test(url.host);
  if (!cacheable) return;
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
          return res;
        })
    )
  );
});

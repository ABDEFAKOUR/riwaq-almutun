const CACHE = 'riwayq-v9';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'mutun.json', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); });
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(cached => {
    const fresh = fetch(e.request).then(r => {
      if (r.ok && new URL(e.request.url).origin === location.origin) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
      return r;
    }).catch(() => cached);
    return cached || fresh;
  }));
});

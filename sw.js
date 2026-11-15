const CACHE = "riwaq-v18";
const CORE_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./mutun.json",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Cache each file separately: one optional/missing asset must not cancel the whole install.
    await Promise.all(CORE_FILES.map(async path => {
      try {
        const url = new URL(path, self.registration.scope).href;
        const response = await fetch(url, { cache: "reload" });
        if (response.ok) await cache.put(url, response);
      } catch (error) {
        console.warn("Riwayq precache skipped:", path, error);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("riwaq-") && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(new URL("./index.html", self.registration.scope).href, response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match(request)) ||
          (await cache.match(new URL("./index.html", self.registration.scope).href)) ||
          new Response("التطبيق غير متاح دون اتصال بعد. افتحه مرة واحدة مع الإنترنت ثم أعد المحاولة.", {
            status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) {
      // Refresh the cached copy when online, while returning it immediately.
      fetch(request).then(response => {
        if (response && response.ok) cache.put(request, response.clone());
      }).catch(() => {});
      return cached;
    }
    try {
      const response = await fetch(request);
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      return new Response("", { status: 504, statusText: "Offline" });
    }
  })());
});

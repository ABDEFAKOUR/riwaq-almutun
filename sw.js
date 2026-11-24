const CACHE = "riwaq-v69";
const CORE_FILES = [
  "./",
  "./index.html",
  "./hifd.html",
  "./reading.html",
  "./media.html",
  "./audio.html",
  "./video.html",
  "./study.html",
  "./review.html",
  "./progress.html",
  "./settings.html",
  "./istidhar.html",
  "./istidhar.js",
  "./style.css",
  "./media.css",
  "./theme.js",
  "./app.js",
  "./menu.js",
  "./mutun.json",
  "./manifest.webmanifest",
  "./icon.svg",
  "./audio/0201AlUsulAtThalaath_AbdullahAzZwary.mp3",
  "./audio/0202AlQawaidAlArba_AbdullahAzZwary.mp3",
  "./audio/0203NawaaqidAlIslaam_AbdullahAzZwary.mp3",
  "./audio/0204AlArbaunAnNawawiyah_AbdullahAzZwary.mp3",
  "./audio/0301ThufatUlAtfaal_AbdullahAzZwary.mp3",
  "./audio/0402AlIlbiri_AbdullahRowzy.mp3",
  "./audio/0401AlBayqooni_AbdullahRowzy.mp3",
  "./audio/0302ShurutAsSalaah_AbdullahAzZwary.mp3",
  "./audio/0403AlAajurrumiyyah_AbdullahAzZwary.mp3",
  "./audio/0501AlWaraqat_AbdullahAzZwary.mp3",
  "./audio/0502UnwanAlHikm_AbdullahAzZwary.mp3"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // لا نفعّل نسخة جديدة إذا لم تُحمّل الملفات الأساسية كلها بنجاح.
    await Promise.all(CORE_FILES.map(async path => {
      const url = new URL(path, self.registration.scope).href;
      const response = await fetch(url, { cache: "reload" });
      if (!response.ok) throw new Error(`تعذر تخزين الملف الأساسي: ${path} (${response.status})`);
      await cache.put(url, response);
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

  // ملفات الصوت والفيديو: دعم Range حتى عندما يعيد الخادم الملف كاملاً بحالة 200.
  if (request.headers.has("range")) {
    event.respondWith((async () => {
      const rangeHeader = request.headers.get("range");
      const makePartial = async response => {
        const bytes = await response.arrayBuffer();
        const total = bytes.byteLength;
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
        if (!match) return new Response(bytes, { status: 200, headers: response.headers });
        let start = match[1] ? Number(match[1]) : 0;
        let end = match[2] ? Number(match[2]) : total - 1;
        if (!match[1] && match[2]) start = Math.max(0, total - Number(match[2]));
        end = Math.min(end, total - 1);
        if (start >= total || start > end) {
          return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
        }
        const headers = new Headers(response.headers);
        headers.set("Accept-Ranges", "bytes");
        headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
        headers.set("Content-Length", String(end - start + 1));
        return new Response(bytes.slice(start, end + 1), { status: 206, headers });
      };

      try {
        const networkResponse = await fetch(request);
        if (networkResponse.status === 206) return networkResponse;
        if (networkResponse.status === 200) {
          const cache = await caches.open(CACHE);
          await cache.put(url.href, networkResponse.clone());
          return await makePartial(networkResponse);
        }
        if (networkResponse.ok) return networkResponse;
      } catch {}

      const cache = await caches.open(CACHE);
      const fullResponse = await cache.match(url.href);
      if (fullResponse) return await makePartial(fullResponse);
      return fetch(request);
    })());
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(request.url, response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(CACHE);
        const cleanUrl = new URL(request.url);
        cleanUrl.search = "";
        return (await cache.match(request, { ignoreSearch: true })) ||
          (await cache.match(cleanUrl.href, { ignoreSearch: true })) ||
          (await cache.match(new URL("./index.html", self.registration.scope).href)) ||
          new Response("التطبيق غير متاح دون اتصال. افتحه مرة واحدة مع الإنترنت وانتظر اكتمال التجهيز.", {
            status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) {
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

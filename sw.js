const CACHE = "riwaq-v55";
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
  "./audio/0301ThufatUlAtfaal_AbdullahAzZwary.mp3"
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

  // ملفات الصوت والفيديو قد تُطلب بنطاق bytes (HTTP Range).
  // لا نُرجع نسخة 200 كاملة لطلب Range؛ فهذا قد يمنع مشغل المتصفح من تشغيلها.
  if (request.headers.has("range")) {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        // بعض خوادم الاستضافة تتجاهل Range وتعيد الملف كاملاً بحالة 200.
        // نمرر أي استجابة ناجحة كما هي حتى لا نعتمد على نسخة Cache قديمة أو ناقصة.
        if (networkResponse.ok) return networkResponse;
      } catch {}

      const cache = await caches.open(CACHE);
      const fullResponse = await cache.match(url.href);
      if (!fullResponse) return fetch(request);

      const bytes = await fullResponse.arrayBuffer();
      const range = request.headers.get("range").match(/bytes=(\d*)-(\d*)/);
      if (!range) return new Response(bytes, { status: 200, headers: fullResponse.headers });

      const total = bytes.byteLength;
      let start = range[1] ? Number(range[1]) : 0;
      let end = range[2] ? Number(range[2]) : total - 1;
      if (!range[1] && range[2]) start = Math.max(0, total - Number(range[2]));
      end = Math.min(end, total - 1);
      if (start >= total || start > end) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
      }
      const headers = new Headers(fullResponse.headers);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
      headers.set("Content-Length", String(end - start + 1));
      return new Response(bytes.slice(start, end + 1), { status: 206, headers });
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

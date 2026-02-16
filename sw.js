const CACHE_NAME = "fiscopilot-cache-v2026-02-16";
const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./sync.js",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE.map(u => u + "?v=2026-02-16").map(u => u.replace("?v=2026-02-16?v=", "?v=")));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)));
    self.clients.claim();
  })());
});

// Cache-first for same-origin, network fallback
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;

    try {
      const fresh = await fetch(req);
      // cache JSON/db too
      if (fresh.ok && (url.pathname.includes("/db/") || url.pathname.endsWith(".json") || url.pathname.endsWith(".js") || url.pathname.endsWith(".css"))) {
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (e) {
      // fallback offline
      if (url.pathname.endsWith("/") || url.pathname.endsWith("/index.html")) {
        const offline = await cache.match("./index.html", { ignoreSearch: true });
        if (offline) return offline;
      }
      throw e;
    }
  })());
});
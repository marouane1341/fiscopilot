/* Service Worker - FiscoPilot */
const CACHE_NAME = "fiscopilot-cache-v102";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=102",
  "./app.js?v=102",
  "./db_index.json",
  "./manifest.json",
  "./sync.js",
  "./db/tva.json",
  "./db/tva_1_fondations.json",
  "./db/tva_2_pratique.json",
  "./db/tva_3_expert.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith((async () => {
    const url = new URL(req.url);

    // Network-first for JSON
    if (url.pathname.endsWith(".json")) {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
      }
    }

    // Cache-first for the rest
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
      return res;
    } catch {
      return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
    }
  })());
});
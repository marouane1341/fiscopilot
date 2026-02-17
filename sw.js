/* sw.js — premium PWA cache strategy (network-first for db*.json + app assets) */
const CACHE_NAME = "fiscopilot-cache-v13"; // incrémente pour forcer refresh

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

function isDbOrIndexJson(url) {
  const p = url.pathname;
  return (p.includes("/db/") && p.endsWith(".json")) || p.endsWith("/db_index.json") || p.endsWith("db_index.json");
}

function isCoreAsset(url){
  const p = url.pathname;
  return p.endsWith("/app.js") || p.endsWith("app.js") ||
         p.endsWith("/style.css") || p.endsWith("style.css") ||
         p.endsWith("/styles.css") || p.endsWith("styles.css") ||
         p.endsWith("/index.html") || p.endsWith("index.html");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;

  // Network-first for JSON + core assets (avoid stale)
  if (isDbOrIndexJson(url) || isCoreAsset(url)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match(req);
        return cached || new Response("Offline and not cached", { status: 503 });
      }
    })());
    return;
  }

  // Cache-first for everything else
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    const cache = await caches.open(CACHE_NAME);
    cache.put(req, res.clone());
    return res;
  })());
});
/* sw.js — Build 33 (network-first for HTML/CSS/JS + db JSON) */
const CACHE_NAME = "fiscopilot-cache-v33";

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

function isDbJson(url) {
  return url.pathname.includes("/db/") && url.pathname.endsWith(".json");
}
function isAppAsset(url) {
  return url.pathname.endsWith("/") ||
         url.pathname.endsWith("/index.html") ||
         url.pathname.endsWith(".css") ||
         url.pathname.endsWith(".js") ||
         url.pathname.endsWith("db_index.json");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Network-first: db json + app assets (avoid stale UI)
  if (isDbJson(url) || isAppAsset(url)) {
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

  // Cache-first for other stuff (images, etc.)
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    const cache = await caches.open(CACHE_NAME);
    cache.put(req, res.clone());
    return res;
  })());
});
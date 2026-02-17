/* sw.js — stable caching (network-first for db/*.json + always cache css/js) */
const CACHE_NAME = "fiscopilot-cache-v10";

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

function isStaticAsset(url){
  return url.pathname.endsWith(".css") || url.pathname.endsWith(".js") || url.pathname.endsWith(".html");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;

  // Network-first for db JSON (always fresh)
  if (isDbJson(url)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || new Response("DB offline and not cached", { status: 503 });
      }
    })());
    return;
  }

  // For css/js/html: stale-while-revalidate (fast + keeps style)
  if (isStaticAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      const fetchPromise = fetch(req).then(res => {
        cache.put(req, res.clone());
        return res;
      }).catch(()=>cached);
      return cached || fetchPromise;
    })());
    return;
  }

  // Default cache-first for other stuff
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    const cache = await caches.open(CACHE_NAME);
    cache.put(req, res.clone());
    return res;
  })());
});
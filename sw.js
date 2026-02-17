/* sw.js — Premium PWA cache strategy
   - Network-first for db/*.json (always fresh)
   - Cache-first for static assets
   - Version bump forces refresh
*/

const CACHE_NAME = "fiscopilot-cache-v100"; // <-- change to v101, v102... to force refresh

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

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Ignore cross-origin (CDN, etc.)
  if (!isSameOrigin(url)) return;

  // Always try to get fresh DB JSON
  if (isDbJson(url)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match(req);
        return cached || new Response("DB offline and not cached", { status: 503 });
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
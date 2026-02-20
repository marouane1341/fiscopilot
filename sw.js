/* sw.js — FiscoPilot (ULTIMATE FIX)
   - Network-first for HTML/CSS/JS/JSON (avoid stale UI)
   - Cache fallback for offline
   - Aggressive old cache cleanup
*/
const CACHE_NAME = "fiscopilot-cache-v37"; // <-- incrémente si tu changes encore

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

function isCoreAsset(url) {
  const p = url.pathname;
  return (
    p.endsWith("/") ||
    p.endsWith("/index.html") ||
    p.endsWith(".css") ||
    p.endsWith(".js") ||
    p.endsWith(".json") ||
    p.endsWith(".png") ||
    p.endsWith(".jpg") ||
    p.endsWith(".jpeg") ||
    p.endsWith(".webp") ||
    p.endsWith(".svg") ||
    p.endsWith(".ico") ||
    p.endsWith(".woff") ||
    p.endsWith(".woff2")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;

  // Ne gère que ton site (évite soucis avec brave / extensions)
  if (url.origin !== self.location.origin) return;

  // ✅ Network-first sur tout le core (sinon stale PWA)
  if (isCoreAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);

      try {
        const fresh = await fetch(req, { cache: "no-store" });
        // garde une copie offline
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await cache.match(req);
        if (cached) return cached;

        // fallback minimal pour offline si rien en cache
        if (url.pathname.endsWith(".json")) {
          return new Response(JSON.stringify({ error: "offline", url: url.pathname }), {
            status: 503,
            headers: { "Content-Type": "application/json" }
          });
        }
        return new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  // Default: cache-first
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    cache.put(req, res.clone());
    return res;
  })());
});
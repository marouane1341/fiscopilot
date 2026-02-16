/* sw.js — anti-stale PWA for GitHub Pages
   - Network-first for:
     - navigation (index.html / routes)
     - app.js / css / manifest / db_index.json
     - db/*.json
   - Cache fallback when offline
*/

const CACHE_NAME = "fiscopilot-cache-v10"; // change v to force refresh

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

function isIndexJson(url) {
  return url.pathname.endsWith("/db_index.json") || url.pathname.endsWith("/db/index.json");
}

function isCriticalAsset(url) {
  // assets that MUST refresh quickly
  return (
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/style.css") ||
    url.pathname.endsWith("/styles.css") ||
    url.pathname.endsWith("/manifest.json") ||
    isIndexJson(url)
  );
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(req, { cache: "no-store" });
    cache.put(req, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(req);
    return cached || new Response("Offline and not cached", { status: 503 });
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;

  // 1) Always network-first for navigation (index.html / SPA routes)
  // This prevents "old UI" sticking forever.
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }

  // 2) Network-first for db JSON
  if (isDbJson(url)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 3) Network-first for critical app assets (app.js, css, manifest, db_index.json)
  if (isCriticalAsset(url)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 4) Everything else cache-first
  event.respondWith(cacheFirst(req));
});
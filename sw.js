// Incrémente si tu changes des fichiers statiques
const CACHE_NAME = "fiscopilot-stable-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./db_index.json",
  "./db/tva.json",
  "./db/tva_1_fondations.json",
  "./db/tva_2_pratique.json",
  "./db/tva_3_expert.json",
  "./manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  e.respondWith((async () => {
    try{
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone());
      return fresh;
    }catch(_){
      const cached = await caches.match(req);
      return cached || new Response("Offline", { status: 200 });
    }
  })());
});
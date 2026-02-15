const CACHE = "fiscopilot-elite-max-v1";
const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "sync.js",
  "manifest.json",
  "db_index.json",
  "icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

// Network-first pour db_index (si online), cache-first pour assets
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // db_index: essaie réseau, sinon cache
  if(url.pathname.endsWith("db_index.json")){
    e.respondWith(
      fetch(e.request, { cache:"no-store" })
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // assets: cache-first
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
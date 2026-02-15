// Service Worker pour cache hors ligne
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open("fiscopilot-cache").then(cache => {
      return cache.addAll([
        "index.html",
        "manifest.json",
        "icon.png"
      ]);
    })
  );
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
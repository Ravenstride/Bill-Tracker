const CACHE = "corvus-v10";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=10",
  "./auth.css?v=10",
  "./app.js?v=10",
  "./auth.js?v=10",
  "./raven-logo.svg?v=10",
  "./manifest.webmanifest?v=10"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type:"window", includeUncontrolled:true }).then((windows) => {
      const existing = windows.find((client) => "focus" in client);
      if (existing) return existing.focus();
      return clients.openWindow("./");
    })
  );
});

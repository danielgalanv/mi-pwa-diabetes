const CACHE_NAME = "mi-pwa-diabetes-v2";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json"
];

self.addEventListener("install", event => {
  console.log("SW: instalando");

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log("SW: cache abierta");
        return cache.addAll(FILES_TO_CACHE);
      })
      .then(() => {
        console.log("SW: archivos cacheados correctamente");
        return self.skipWaiting();
      })
      .catch(error => {
        console.error("SW: error cacheando archivos", error);
      })
  );
});

self.addEventListener("activate", event => {
  console.log("SW: activado");

  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
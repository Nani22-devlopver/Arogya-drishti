self.addEventListener("install", (event) => {
  event.waitUntil(caches.open("drishti-v1").then((cache) => cache.addAll(["/", "/manifest.json"])));
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then((r) => r || caches.match("/")))
  );
});

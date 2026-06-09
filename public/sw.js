// DRC Portal Service Worker
// Strateji:
//   - HTML (navigate): NETWORK-FIRST (her zaman taze, network fail ise cache)
//   - JS/CSS/manifest: NETWORK-FIRST (yeni deploy hemen yansır)
//   - Görseller/fontlar: STALE-WHILE-REVALIDATE (hızlı görüntü, arka planda yenile)
//
// Cache version her deploy'da artırılır. Eski version'lar 'activate'te
// otomatik temizlenir + "controllerchange" event'i ile sayfa otomatik yenilenir.

const CACHE_VERSION = "v20260610-coldroompro-bridge";
const STATIC_CACHE = `drc-portal-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `drc-portal-runtime-${CACHE_VERSION}`;

const APP_SHELL = [
  "/manifest.webmanifest",
  "/assets/drc-logo.svg",
  "/assets/pwa/icon-192.png",
  "/assets/pwa/icon-512.png",
  "/assets/pwa/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

// Mesaj kanalı: client'tan "SKIP_WAITING" gelirse hemen aktif ol
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // /api/ yolları → network-only (cache YOK, her zaman taze)
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // HTML navigate → network-first
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put("/", copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached || caches.match(request)))
    );
    return;
  }

  // app.js / styles.css → NETWORK-FIRST (yeni deploy hemen yansır)
  if (url.pathname === "/app.js" || url.pathname === "/styles.css" || url.pathname === "/sw.js" || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Görseller/fontlar/diğer asset'ler → STALE-WHILE-REVALIDATE
  const isAsset = ["style", "script", "image", "font", "manifest"].includes(request.destination)
    || url.pathname.startsWith("/assets/");

  if (!isAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      }).catch(() => cached);
      // Cache varsa hemen dön + arka planda taze indir
      return cached || fetchPromise;
    })
  );
});

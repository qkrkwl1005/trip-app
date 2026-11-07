// V28_NETWORK_FIRST_SW_1794046932
const CACHE_STATIC = "trip-static-v28";
const CACHE_RUNTIME = "trip-runtime-v28";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (k !== CACHE_STATIC && k !== CACHE_RUNTIME) return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("googleapis.com/v1beta") ||
    url.hostname.includes("rapidapi.com") ||
    url.hostname.includes("overpass-api.de") ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  // HTML 문서는 항상 최신 서버 버전을 먼저 가져오고 오프라인일 때만 캐시 반환
  if (req.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith("/index.html")) {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_STATIC).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/index.html")))
    );
    return;
  }

  // 지도 타일 및 정적 리소스 캐싱
  if (
    url.hostname.includes("tile.openstreetmap.org") ||
    url.hostname.includes("basemaps.cartocdn.com") ||
    url.hostname.includes("cdn.jsdelivr.net") ||
    url.hostname.includes("cdnjs.cloudflare.com") ||
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com") ||
    url.hostname.includes("images.unsplash.com") ||
    url.origin === self.location.origin
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const netFetch = fetch(req)
          .then((res) => {
            if (res && (res.status === 200 || res.type === "opaque")) {
              const copy = res.clone();
              caches.open(CACHE_RUNTIME).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || netFetch;
      })
    );
  }
});

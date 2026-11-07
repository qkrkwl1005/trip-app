// V22_OFFLINE_FIRST_SW_1794024081
const CACHE_STATIC = "trip-static-v22";
const CACHE_RUNTIME = "trip-runtime-v22";

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png?v=8",
  "/icon-512.png?v=8",
  "/apple-touch-icon.png?v=8",
  "/favicon.png?v=8"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
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

  // Firebase 실시간 통신 및 API 호출은 네트워크 직접 처리
  if (
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("googleapis.com/v1beta") ||
    url.hostname.includes("rapidapi.com") ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  // 1) 페이지 네비게이션(index.html): 네트워크 우선 시도 후 오프라인이면 캐시 즉시 반환
  if (req.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith("/index.html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_STATIC).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/index.html")))
    );
    return;
  }

  // 2) 지도 타일(OpenStreetMap / Carto), 폰트, 아이콘, 외부 라이브러리(CDN), 명소 배너 사진:
  //    캐시에 있으면 즉시 반환하면서 백그라운드 갱신(Stale-While-Revalidate) -> 와이파이 없어도 작동
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

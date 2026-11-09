// V54 True See-Through Liquid Glass Suite (App Shell + Map Tiles + Images + Fonts)
const CACHE_CORE = "trip-v54-core";
const CACHE_ASSETS = "trip-v54-assets";
const CACHE_TILES = "trip-v54-tiles";

const CORE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./favicon.png",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_CORE).then((cache) => {
      return Promise.allSettled(CORE_URLS.map((u) => cache.add(u)));
    })
  );
});

self.addEventListener("activate", (e) => {
  const keep = new Set([CACHE_CORE, CACHE_ASSETS, CACHE_TILES]);
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((k) => {
            if (!keep.has(k)) return caches.delete(k);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Firebase / Firestore 실시간 동기화 요청은 패스
  if (
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("identitytoolkit.googleapis.com") ||
    url.hostname.includes("securetoken.googleapis.com")
  ) {
    return;
  }

  // 1) HTML / App Shell: Network-First, 오프라인 시 캐시 즉시 반환
  if (req.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname === "/") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_CORE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || caches.match("./index.html") || caches.match("./"))
        )
    );
    return;
  }

  // 2) 지도 타일(Carto, OSM) & 외부 이미지: Stale-While-Revalidate (오프라인에서도 본 지도 그대로 표시)
  if (
    url.hostname.includes("basemaps.cartocdn.com") ||
    url.hostname.includes("tile.openstreetmap.org") ||
    url.hostname.includes("images.unsplash.com") ||
    req.destination === "image"
  ) {
    e.respondWith(
      caches.open(CACHE_TILES).then(async (cache) => {
        const cached = await cache.match(req);
        const netPromise = fetch(req)
          .then((res) => {
            if (res && (res.ok || res.type === "opaque")) {
              cache.put(req, res.clone());
            }
            return res;
          })
          .catch(() => cached);
        return cached || netPromise;
      })
    );
    return;
  }

  // 3) 폰트, 아이콘, Leaflet CSS/JS 등 정적 자산: Cache-First + 백그라운드 갱신
  if (
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com") ||
    url.hostname.includes("unpkg.com") ||
    url.hostname.includes("cdnjs.cloudflare.com") ||
    req.destination === "style" ||
    req.destination === "script" ||
    req.destination === "font"
  ) {
    e.respondWith(
      caches.open(CACHE_ASSETS).then(async (cache) => {
        const cached = await cache.match(req);
        const netPromise = fetch(req)
          .then((res) => {
            if (res && (res.ok || res.type === "opaque")) {
              cache.put(req, res.clone());
            }
            return res;
          })
          .catch(() => cached);
        return cached || netPromise;
      })
    );
  }
});

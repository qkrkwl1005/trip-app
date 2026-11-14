const SW_VERSION = 'v20261115_011000';
const APP_CACHE = 'trip-app-' + SW_VERSION;
const THUMB_CACHE = 'trip-thumbs-v3';
const THUMB_CACHE_MAX = 600;

const THUMB_HOSTS = [
  'wsrv.nl',
  'images.weserv.nl',
  'ytimg.com',
  'bing.com',
  'googleusercontent.com',
  'cdninstagram.com',
  'fbcdn.net'
];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== APP_CACHE && key !== THUMB_CACHE) {
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // HTML 문서: 항상 최신 버전 우선 (Network-First)
  if (
    request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html')
  ) {
    event.respondWith(
      (async () => {
        try {
          const freshResp = await fetch(request, { cache: 'no-store' });
          if (freshResp && freshResp.ok) {
            const cache = await caches.open(APP_CACHE);
            cache.put(request, freshResp.clone());
          }
          return freshResp;
        } catch (err) {
          const cachedResp = await caches.match(request);
          return cachedResp || new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // 외부 이미지: 정상 응답(200)만 캐싱하여 디스크 즉시 반환
  const isThumb =
    request.destination === 'image' ||
    THUMB_HOSTS.some((host) => url.hostname.includes(host));

  if (isThumb) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(THUMB_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;

        const netResp = await fetch(request);
        // <img>의 교차 출처 요청은 opaque 응답(status 0)이라 기존 200 조건으로는 한 장도 캐싱되지 않았음
        if (netResp && (netResp.status === 200 || netResp.type === 'opaque')) {
          event.waitUntil(
            cache.put(request, netResp.clone()).then(() => trimThumbCache(cache)).catch(() => {})
          );
        }
        return netResp;
      })()
    );
  }
});

let _trimming = false;
async function trimThumbCache(cache) {
  if (_trimming) return;
  _trimming = true;
  try {
    const keys = await cache.keys();
    const extra = keys.length - THUMB_CACHE_MAX;
    for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
  } finally {
    _trimming = false;
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

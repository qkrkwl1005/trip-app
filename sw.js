const SW_VERSION = 'v20261114_200422';
const APP_CACHE = 'trip-app-' + SW_VERSION;
const THUMB_CACHE = 'trip-thumbs-v2';

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

        try {
          const netResp = await fetch(request);
          if (netResp && netResp.status === 200) {
            cache.put(request, netResp.clone());
          }
          return netResp;
        } catch (err) {
          return fetch(request);
        }
      })()
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

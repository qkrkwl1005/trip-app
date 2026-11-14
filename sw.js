const SW_VERSION = 'v20261115_070000';
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
    // 네트워크가 2.5초 안에 응답하면 최신 버전, 느리면(로밍·지하철) 저장된 버전을 바로 열고
    // 받아온 최신 버전은 다음 실행을 위해 캐시에 저장
    event.respondWith(
      (async () => {
        const cache = await caches.open(APP_CACHE);
        const network = fetch(request, { cache: 'no-store' })
          .then((resp) => {
            if (resp && resp.ok) {
              const copy = resp.clone();
              event.waitUntil(cache.put('./index.html', copy).catch(() => {}));
            }
            return resp;
          });
        const cached = await cache.match('./index.html');
        if (!cached) {
          try {
            return await network;
          } catch (err) {
            return new Response('Offline', { status: 503 });
          }
        }
        const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 2500));
        try {
          const fast = await Promise.race([network, timeout]);
          if (fast && fast.ok) return fast;
        } catch (err) {}
        event.waitUntil(network.catch(() => {}));
        return cached;
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

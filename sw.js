const SW_VERSION = 'v20261114_140721';
const APP_CACHE = 'trip-app-' + SW_VERSION;
const THUMB_CACHE = 'trip-thumbs-v1';

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

  if (
    request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html')
  ) {
    event.respondWith(
      (async () => {
        try {
          const freshResp = await fetch(request, { cache: 'no-store' });
          const cache = await caches.open(APP_CACHE);
          cache.put(request, freshResp.clone());
          return freshResp;
        } catch (err) {
          const cachedResp = await caches.match(request);
          return cachedResp || new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  const isThumbRequest =
    request.destination === 'image' ||
    THUMB_HOSTS.some((host) => url.hostname.includes(host));

  if (isThumbRequest) {
    event.respondWith(
      (async () => {
        const thumbCache = await caches.open(THUMB_CACHE);
        const cached = await thumbCache.match(request);
        if (cached) return cached;

        try {
          const netResp = await fetch(request);
          if (netResp && (netResp.status === 200 || netResp.type === 'opaque')) {
            thumbCache.put(request, netResp.clone());
          }
          return netResp;
        } catch (err) {
          return new Response('', { status: 404 });
        }
      })()
    );
    return;
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

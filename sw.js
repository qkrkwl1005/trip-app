const SW_VERSION = 'v20261115_130000';
const APP_CACHE = 'trip-app-' + SW_VERSION;

// 사진은 서비스워커가 저장하지 않는다.
// 예전에 사진(교차 출처 opaque 응답)을 여기 저장했는데, 아이폰 Safari에서 주소가
// https://wsrv.nl/?url=... 처럼 '?' 앞이 같은 사진들이 서로 섞여 목록 전체가 같은 사진으로 보였음.
// 사진은 브라우저 기본 캐시(wsrv·ytimg가 1년 보관 헤더를 줌)가 대신 보관한다.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 현재 앱 캐시를 뺀 나머지(예전 사진 캐시 trip-thumbs-* 포함)는 모두 삭제
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => (key !== APP_CACHE ? caches.delete(key) : null)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // HTML 문서만 처리: 네트워크가 2.5초 안에 응답하면 최신 버전, 느리면(로밍·지하철) 저장된 버전을
  // 바로 열고, 받아온 최신 버전은 다음 실행을 위해 저장
  if (
    request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html')
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(APP_CACHE);
        const network = fetch(request, { cache: 'no-store' }).then((resp) => {
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
  }
  // 그 밖의 요청(사진 포함)은 가로채지 않음 → 브라우저 기본 동작
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

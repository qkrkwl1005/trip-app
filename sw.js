const SW_VERSION = 'v20261120_v63';
const APP_CACHE = 'trip-app-' + SW_VERSION;

// 서비스워커는 앱 화면(같은 사이트 페이지 이동)만 다룬다. 사진은 건드리지 않고
// 브라우저 기본 캐시(wsrv·ytimg가 1년 보관 헤더를 줌)가 보관한다.

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) =>
        Promise.allSettled([
          cache.add('./index.html'),
          cache.add('./manifest.json'),
          cache.add('https://cdn.jsdelivr.net/npm/lucide@0.469.0/dist/umd/lucide.min.js')
        ])
      )
      .then(() => self.skipWaiting())
  );
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

  // 우리 앱 화면(같은 사이트의 페이지 이동)만 처리.
  // ⚠️ 예전엔 '경로가 /로 끝나면'도 화면으로 봤는데, 사진 주소 https://wsrv.nl/?url=... 의 경로도 '/'라서
  //    사진을 index.html로 저장하고 2.5초 넘으면 그 사진을 대신 돌려줘 → 목록 카드들이 같은 사진으로 보였음.
  const isAppPage =
    url.origin === self.location.origin &&
    (request.mode === 'navigate' || request.destination === 'document');
  if (isAppPage) {
    // 네트워크가 2.5초 안에 응답하면 최신 버전, 느리면(로밍·지하철) 저장된 버전을 바로 열고
    // 받아온 최신 버전은 다음 실행을 위해 저장 (실제 HTML일 때만)
    event.respondWith(
      (async () => {
        const cache = await caches.open(APP_CACHE);
        const network = fetch(request, { cache: 'no-store' }).then((resp) => {
          const isHtml = /text\/html/i.test((resp && resp.headers.get('content-type')) || '');
          if (resp && resp.ok && isHtml) {
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

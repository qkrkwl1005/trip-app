const CACHE='tripsync-v51';
const CORE=['./index.html','./manifest.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).catch(()=>{}))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))))});
self.addEventListener('fetch',e=>{
  const req=e.request;
  // 공유 타겟 처리: 인스타/유튜브 등에서 앱으로 공유(POST)하면 쿼리 파라미터로 바꿔 앱 화면으로 이동
  if(req.method==='POST'){
    const u=new URL(req.url);
    if(u.pathname.endsWith('index.html')&&u.search.includes('share')){
      e.respondWith(
        req.formData().then(f=>{
          const parts=[f.get('title'),f.get('text'),f.get('url')].map(x=>x?String(x):'').filter(Boolean);
          const q=encodeURIComponent(parts.join('\n').slice(0,1800));
          return Response.redirect(new URL('./index.html?share='+q,u.origin+'/').href,303);
        }).catch(()=>Response.redirect(new URL('./index.html?share=',u.origin+'/').href,303))
      );
      return;
    }
    return;
  }
  if(req.method!=='GET')return;
  if(req.mode==='navigate'){
    e.respondWith(fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});return res}).catch(()=>caches.match(req).then(c=>c||caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(c=>c||fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});return res}).catch(()=>caches.match('./index.html'))));
});

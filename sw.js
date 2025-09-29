self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { self.clients.claim(); });
// light shell caching to help the home-screen app load fast
const CACHE = 'narrator-v1';
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(req).then(hit => {
        const fetcher = fetch(req).then(res => { cache.put(req, res.clone()); return res; })
          .catch(()=> hit || Response.error());
        return hit || fetcher;
      })
    )
  );
});

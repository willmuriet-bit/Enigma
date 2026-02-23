const CACHE_NAME = 'enigma-cache-v1';
const BASE_PATH = '/Enigma/';

const STATIC_ASSETS = [
  BASE_PATH,
  BASE_PATH + 'index.html',
  BASE_PATH + 'manifest.json',
  BASE_PATH + 'words.json',
  BASE_PATH + 'sw.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] Cache initial:', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => 
      Promise.all(cacheNames.filter((name) => name !== CACHE_NAME && name.startsWith('enigma-cache-')).map((name) => caches.delete(name)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  
  if (/\.(html|css|js|json|png|jpg|jpeg|svg|webp|ico)$/i.test(new URL(request.url).pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          fetch(request).then((fresh) => {
            if (fresh && fresh.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, fresh.clone()));
          }).catch(() => {});
          return cached;
        }
        return fetch(request).then((response) => {
          if (response && response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          return response;
        }).catch(() => request.destination === 'document' ? caches.match(BASE_PATH + 'index.html') : null);
      })
    );
    return;
  }
  
  event.respondWith(fetch(request).catch(() => new Response('', { status: 503 })));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

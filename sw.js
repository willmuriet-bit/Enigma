// sw.js - Service Worker pour ENIGMA
// Stratégie : Cache-first pour les assets statiques, Network-first pour les données

const CACHE_NAME = 'enigma-cache-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './words.json',
  // Images par défaut (si elles existent dans votre dossier)
  // './background.jpg',
  // './image.jpg',
  // Icône pour PWA (à créer si vous voulez l'ajouter)
  // './icon-192.png',
  // './icon-512.png'
];

// 🔧 Installation : mise en cache des assets essentiels
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cache ouvert :', CACHE_NAME);
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] Erreur cache initial:', err))
  );
});

// 🔄 Activation : nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name.startsWith('enigma-cache-'))
          .map((name) => {
            console.log('[SW] Suppression ancien cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// 🌐 Fetch : stratégie hybride selon le type de requête
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // 🔒 Ignorer les requêtes non-GET ou chrome-extension
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    // Autoriser Google Images (recherche externe) via réseau uniquement
    if (url.hostname.includes('google.com') && url.pathname.includes('/search')) {
      event.respondWith(fetch(request));
    }
    return;
  }

  // 📄 Fichiers statiques (HTML, CSS, JS, manifest) → Cache-first
  if (/\.(html|css|js|json|png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Mise à jour asynchrone du cache (stale-while-revalidate)
          fetch(request).then((fresh) => {
            if (fresh && fresh.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, fresh.clone()));
            }
          }).catch(() => {}); // Silencieux en cas d'échec réseau
          return cached;
        }
        return fetch(request).then((response) => {
          // Cache les nouvelles réponses valides
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => {
          // Fallback offline pour la page principale
          if (request.destination === 'document') {
            return caches.match('./index.html');
          }
          return new Response('Hors ligne 📴', { 
            status: 503, 
            headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
          });
        });
      })
    );
    return;
  }

  // 🌍 Autres requêtes → Réseau uniquement (évite de cacher du dynamique)
  event.respondWith(fetch(request).catch(() => {
    console.warn('[SW] Requête échouée (hors ligne):', request.url);
    return new Response('', { status: 503 });
  }));});

// 📲 Gestion des messages depuis l'app (optionnel : forcer update, vérifier cache)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_CACHE_STATUS') {
    caches.open(CACHE_NAME).then(async (cache) => {
      const keys = await cache.keys();
      event.ports[0]?.postMessage({
        cached: keys.map(k => new URL(k.url).pathname),
        count: keys.length
      });
    });
  }
});

// 🚨 Gestion des erreurs de chargement d'images (fallback visuel)
self.addEventListener('fetch', (event) => {
  if (event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          // Retourne une image placeholder SVG en cas d'échec
          const placeholder = `
            <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
              <rect fill="#222" width="100%" height="100%"/>
              <text x="50%" y="50%" fill="#666" font-size="14" 
                    text-anchor="middle" dominant-baseline="middle">
                ❌ Image indisponible
              </text>
            </svg>
          `;
          return new Response(placeholder, {
            headers: { 'Content-Type': 'image/svg+xml' }
          });
        });
      })
    );
  }
});

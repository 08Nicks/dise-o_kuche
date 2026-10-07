// ═══════════════════════════════════════════════════════════════════════
// KUCHE PWA — SERVICE WORKER (Alumbrado Público y Luminarias)
// ═══════════════════════════════════════════════════════════════════════

const CACHE_NAME = 'kuche-pwa-v7-live';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './app.html',
  './portal.html',
  './oficial.html',
  './dashboard.html',
  './static/styles.css',
  './static/app.js',
  './static/kuche-api.js',
  './static/manifest.json',
  './static/manifest-portal.json',
  './static/icons/icon-192.png',
  './static/icons/icon-512.png',
  './static/icons/icon-maskable.png',
  './static/icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS).catch(err => {
        console.warn('[Kuche SW] Advertencia al precargar:', err);
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignorar peticiones no GET o externas a GitHub / Backend Cloudflare
  if (req.method !== 'GET') return;

  // backend_url.json SIEMPRE directo de la red para frescura en tiempo real
  if (url.pathname.endsWith('backend_url.json')) {
    event.respondWith(fetch(req));
    return;
  }

  // Rutas de API al backend
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(req).catch(() => {
        return new Response(JSON.stringify({ 
          offline: true, 
          mensaje: 'Servidor Kuche fuera de línea o sin conexión.' 
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Navegación HTML: Network first con fallback a caché
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match('./app.html') || caches.match('./index.html')))
    );
    return;
  }

  // Recursos estáticos: Cache first con actualización en segundo plano
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(networkRes => {
        if (!networkRes || networkRes.status !== 200) return networkRes;
        const clone = networkRes.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        return networkRes;
      });
    })
  );
});

const CACHE_NAME = 'auxilios-v105'; // v105: tipos de servicio, tipos de tarifa e historial

const PRECACHE_ASSETS = [
  '/',
  '/Index.html',
  '/sigma.css',
  '/sigma.js',
  '/empresas.js',
  '/billing-bases.js',
  '/company-billing-settings.js',
  '/billing-base-operator-adapter.js',
  '/configuration-reference.css',
  '/configuration-reference.js',
  '/comercial.css',
  '/comercial.js',
  '/comercial-services.js',
  '/comercial-code-strategy.js',
  '/comercial-rules.js',
  '/comercial-summary.js',
  '/tariff-composition.js',
  '/operator-services.css',
  '/operator-service-desktop.css',
  '/operator-service-v2.css',
  '/operator-services.js',
  '/operator-service-wizard.js',
  '/operator-service-v2.js',
  '/supabase.js',
  '/offline.js',
  '/manifest.json',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('railway.app') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/uploads/')
  ) {
    return;
  }

  if (url.pathname === '/config.js') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  if (
    (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) &&
    url.origin === self.location.origin
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          const networkFetch = fetch(event.request).then(response => {
            cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);
          return cached ? (networkFetch.catch(() => {}), cached) : networkFetch;
        })
      )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
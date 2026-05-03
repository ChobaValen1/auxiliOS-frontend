const CACHE_NAME = 'auxilios-v1';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/sigma.css',
  '/sigma.js',
  '/supabase.js',
  '/manifest.json',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
];

// ── INSTALL: pre-cachear assets propios ──────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpiar cachés viejos + tomar control inmediato ────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH: estrategia por tipo de recurso ────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Network-Only: Supabase y Railway (datos en vivo, nunca cachear)
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('railway.app') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/uploads/')
  ) {
    return; // deja pasar sin interceptar
  }

  // 2. Network-First: config.js (detectar cambios de URL Railway)
  if (url.pathname === '/config.js') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. Stale-While-Revalidate: JS y CSS propios
  if (
    (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) &&
    url.origin === self.location.origin
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          const networkFetch = fetch(event.request).then(res => {
            cache.put(event.request, res.clone());
            return res;
          });
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // 4. Cache-First con fallback a red: HTML, íconos, manifest y CDN libs/fuentes
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
        }
        return res;
      });
    })
  );
});

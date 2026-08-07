const CACHE_NAME = 'auxilios-v134'; // v134: Servicios Bloque A · branding, workspace y dirty guard

const PRECACHE_ASSETS = [
  '/',
  '/Index.html',
  '/sigma.css',
  '/sigma.js',
  '/empresas.js',
  '/empresas-v2.js',
  '/empresas-v2.css',
  '/billing-bases.js',
  '/company-billing-settings.js',
  '/billing-base-operator-adapter.js',
  '/equal-billing-bases.js',
  '/configuration-reference.css',
  '/configuration-reference.js',
  '/configuration-center.css',
  '/configuration-center.js',
  '/frequent-navigation.js',
  '/fleet-admin-detail-v2.css',
  '/fleet-admin-detail-v2.js',
  '/fleet-fuel-crud-v1.css',
  '/fleet-fuel-crud-contrast-fix.css',
  '/fleet-fuel-closed-edit-fix.css',
  '/fleet-fuel-crud-v1.js',
  '/fleet-fuel-closed-edit-fix.js',
  '/fleet-fuel-modal-state-fix.js',
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
  '/operator-service-bridge.css',
  '/operator-service-creation-redesign.css',
  '/operator-service-lifecycle.css',
  '/operator-service-edit.css',
  '/toll-management.css',
  '/operator-console-v2.css',
  '/operator-active-desk-clean-v1.css',
  '/operator-active-desk-auxilios-theme-v2.css',
  '/operator-service-workspace-v2.css',
  '/operator-service-workspace-review-v3.css',
  '/operator-services-brand-system-v1.css',
  '/operator-services.js',
  '/operator-reference-loader.js',
  '/operator-service-wizard.js',
  '/operator-service-v2.js',
  '/operator-service-bridge.js',
  '/phase3-journey-start-guard.js',
  '/operator-service-creation-redesign.js',
  '/phase3b-modal-visibility-guard.js',
  '/operator-service-lifecycle.js',
  '/operator-service-edit.js',
  '/toll-management.js',
  '/rendition-journey-source-v1.js',
  '/feature-flags.js',
  '/operator-console-v2.js',
  '/operator-active-desk-clean-v1.js',
  '/operator-service-workspace-v2.js',
  '/operator-service-workspace-review-v3.js',
  '/operator-services-block-a-v1.js',
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

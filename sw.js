// Mantiene el prefijo canónico para invalidación y contratos de previews previos.
// Contrato histórico de previews: auxilios-billing-phase2-v208.
// Versión inmediatamente anterior: auxilios-billing-phase2-v211.
const CACHE_NAME='auxilios-billing-phase2-v217';
const PRECACHE_ASSETS=[
  '/sigma.css','/sigma.js',
  '/empresas-v2.js','/empresas-v2.css',
  '/billing-bases.js',
  '/service-types-catalog-v2.js','/tariff-types-catalog-v1.js',
  '/company-services-configuration-v4.js','/company-billing-parameters-v4.js','/company-tariffs-v4.js',
  '/configuration-center.css','/configuration-center.js',
  '/service-module-configuration.js','/service-module-configuration.css',
  '/fleet-operational-status-v1.js',
  '/jornadas-admin-tools-v1.css','/jornadas-admin-tools-v1.js',
  '/operator-services.css','/operator-services.js',
  '/operator-billing.css','/operator-billing.js','/operator-billing-export.js','/excel-export.js',
  '/operator-invoices.css','/operator-invoices.js',
  '/operator-service-workspace-reactive-v1.css','/operator-service-workspace-reactive-v1.js',
  '/operator-service-commercial-addons-v1.css','/operator-service-commercial-addons-v1.js',
  '/operator-service-bridge.css','/operator-service-bridge.js',
  '/operator-service-lifecycle.css','/operator-service-lifecycle.js',
  '/toll-management.css','/toll-management.js',
  '/rendition-journey-source-v1.js',
  '/remito-addons-v2.css','/remito-addons-v2.js',
  '/remito-mobile-flow-v3.css','/remito-mobile-flow-v3.js',
  '/operator-remito-review-v2.css','/operator-remito-review-v2.js',
  '/supabase.js','/offline.js','/manifest.json',
  '/assets/icons/icon-192.png','/assets/icons/icon-512.png'
];

self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE_NAME)
    .then(cache=>cache.addAll(PRECACHE_ASSETS))
    .then(()=>self.skipWaiting())
));

self.addEventListener('activate',event=>event.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim())
));

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);

  if(
    url.hostname.includes('supabase.co')||
    url.hostname.includes('railway.app')||
    url.pathname.startsWith('/api/')||
    url.pathname.startsWith('/uploads/')
  ) return;

  // La aplicación/HTML siempre intenta red primero. Así un nuevo preview no queda
  // oculto por el Index.html de un deploy anterior. La caché queda sólo como fallback offline.
  if(event.request.mode==='navigate'||url.pathname==='/'||url.pathname==='/Index.html'){
    event.respondWith(
      fetch(event.request)
        .then(response=>{
          if(response?.status===200){
            const copy=response.clone();
            caches.open(CACHE_NAME).then(cache=>cache.put('/Index.html',copy));
          }
          return response;
        })
        .catch(()=>caches.match('/Index.html'))
    );
    return;
  }

  // Config y módulos visuales usan red primero para reflejar el commit actual.
  if(
    url.pathname==='/config.js'||
    ((url.pathname.endsWith('.js')||url.pathname.endsWith('.css'))&&url.origin===self.location.origin)
  ){
    event.respondWith(
      fetch(event.request)
        .then(response=>{
          if(response?.status===200){
            const copy=response.clone();
            caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
          }
          return response;
        })
        .catch(()=>caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached=>cached||fetch(event.request).then(response=>{
        if(response?.status===200){
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
        }
        return response;
      }))
  );
});

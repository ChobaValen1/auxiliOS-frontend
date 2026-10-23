// Mantiene el prefijo canónico y renueva todos los recursos después de integrar
// el flujo de remitos con los hotfixes productivos.
const CACHE_NAME='auxilios-v552-mapa-nativo';
const PRECACHE_ASSETS=[
  '/ui/motion/motion-v1.js','/ui/motion/motion-v1.css','/assets/logo-auxilios-main.png',
  '/ui/service-price-calculator-v1.js','/ui/service-price-calculator-v1.css',
  '/ui/react-lazy-v1.js','/ui/customer-payment-v1.js','/ui/customer-payment-v1.css','/vendor/react-18.3.1.production.min.js','/vendor/react-dom-18.3.1.production.min.js','/vendor/htm-3.1.1.umd.js',
  '/ui/service-improvements-v1.js','/ui/service-improvements-v1.css','/ui/export-picker-v1.js','/ui/export-picker-v1.css','/ui/drag-sort-v1.js','/ui/drag-sort-v1.css','/ui/theme-v1.js','/ui/theme-light-v1.css',
  '/sigma.css','/auxilios-emoji-mono-v1.css','/sigma.js','/company-documents.js','/fuel-admin-editor.js','/fuel-tickets-v1.js','/fuel-tickets-v1.css','/outsourced-providers-v1.js','/outsourced-providers-v1.css','/outsourced-rates-v1.js','/outsourced-service-cost-v1.js','/outsourced-service-cost-v1.css','/outsourced-settlements-v1.js','/outsourced-settlements-v1.css','/payroll-matrix.js', '/payroll-view.js',
  '/empresas-v2.js','/empresas-v2.css',
  '/billing-bases.js',
  '/service-types-catalog-v2.js','/tariff-types-catalog-v1.js',
  '/company-services-configuration-v4.js','/company-billing-parameters-v4.js','/company-tariffs-v4.js',
  '/configuration-center.css','/configuration-center.js',
  '/service-module-configuration.js','/service-module-configuration.css',
  
  '/jornadas-admin-tools-v1.css','/jornadas-admin-tools-v1.js',
  '/operator-services.css','/operator-services.js','/private-service-v1.css','/private-service-v1.js','/private-payments-v1.css','/private-payments-v1.js','/private-view-v1.css','/private-view-v1.js','/fleet-control-v1.css','/fleet-control-v1.js','/fleet-truck-detail-v1.css','/fleet-truck-detail-v1.js','/fleet-type-plans-v1.js','/truck-doc-reader-v1.js',
  '/auxilios-filters-v1.css','/auxilios-filters-v1.js','/auxilios-date-inputs-v1.css','/auxilios-date-inputs-v1.js','/remitos-admin-panel-v1.css','/remitos-admin-panel-v1.js','/remitos-filtros-sheet-v1.css','/remitos-filtros-sheet-v1.js','/remito-pdf-v2.js','/remitos-calidad-v1.css','/remitos-calidad-v1.js','/operator-billing.css','/operator-billing.js','/operator-billing-export.js','/excel-export.js','/fuel-efficiency-v1.js',
  '/operator-invoices.css','/operator-invoices.js','/billing-breakdown-v1.js','/table-columns-v1.js',
  '/operator-service-workspace-reactive-v1.css','/operator-service-workspace-reactive-v1.js',
  '/operator-service-commercial-addons-v1.css','/operator-service-commercial-addons-v1.js',
  '/toll-route-detection-v1.js',
  '/finish-time-v1.js',
  '/driver-draft-route.js','/operator-service-bridge.css','/operator-service-bridge.js',
  '/ui/tokens.css','/ui/components.css','/ui/ax.js','/ui/icons.svg','/ui/app-v1.css','/ui/app-v1.js','/operaciones-ax-v1.css','/jornadas-ax-v1.css','/shell-ax-v1.css','/facturacion-ax-v1.css','/facturas-ax-v1.css','/camion-ax-v1.css','/remitos-ax-v1.css','/empresas-ax-v1.css','/configuracion-ax-v1.css','/dashboard-ax-v1.css','/driver-summary-ax-v1.css','/driver-summary-v1.js','/sueldos-ax-v1.css','/grilla-ax-v1.css','/documentos-ax-v1.css','/registro-ax-v1.css','/camion-modales-ax-v1.css','/chofer-servicios-ax-v1.css','/servicio-form-ax-v1.css','/estado-servicio-ax-v1.css','/remito-chofer-ax-v1.css','/remito-chofer-ax-v1.js',
  '/operator-service-lifecycle.css','/operator-service-lifecycle.js',
  '/toll-management.css','/toll-management.js','/toll-map-v1.css','/toll-map-v1.js',
  '/rendition-journey-source-v1.js',
  '/remito-addons-v2.css','/remito-addons-v2.js','/private-collection-v1.css','/private-collection-v1.js',
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
    url.origin!==self.location.origin||
    url.pathname==='/browser-map-config.json'||
    url.hostname.includes('supabase.co')||
    url.hostname.includes('railway.app')||
    url.pathname.startsWith('/api/')||
    url.pathname.startsWith('/uploads/')||
    // Página pública del remito (link de WhatsApp): no es la app, no se cachea como Index.html.
    url.pathname.startsWith('/r/')||url.pathname==='/remito.html'
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

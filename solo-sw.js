// AuxiliOS Solo · service worker propio, con alcance /solo (no toca el de Flota en /sw.js).
// La app siempre intenta red primero; la caché sirve para abrirla sin señal y para poder instalarla.
const CACHE_NAME='auxilios-solo-v613';
const PRECACHE=[
  '/solo.html','/solo/solo.css','/solo/solo-ui.js','/solo/solo.js','/solo/solo-ops.js','/solo/solo-pwa.js','/solo/solo-facturacion.js','/solo/solo-numeros.js','/solo/solo-offline.js','/solo/solo-config.js',
  '/ui/tokens.css','/ui/icons.svg','/runtime-config.js','/solo-manifest.json',
  '/assets/icons/icon-192.png','/assets/icons/icon-512.png'
];
// Librerías de CDN que la app necesita para arrancar (base de datos y PDF).
const CDN=['cdn.jsdelivr.net','cdnjs.cloudflare.com','fonts.googleapis.com','fonts.gstatic.com'];

self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE_NAME).then(cache=>cache.addAll(PRECACHE)).then(()=>self.skipWaiting())
));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key.startsWith('auxilios-solo-')&&key!==CACHE_NAME).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim())
));

const put=(req,res)=>{if(res&&(res.status===200||res.type==='opaque')){const copy=res.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy));}return res;};

self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.hostname.includes('supabase.co'))return;
  if(url.origin!==self.location.origin){
    if(!CDN.includes(url.hostname))return;
    // CDN: lo guardado primero y se renueva por detrás.
    event.respondWith(caches.match(req).then(hit=>{const net=fetch(req).then(r=>put(req,r)).catch(()=>hit);return hit||net;}));
    return;
  }
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(r=>{if(r.status===200)put('/solo.html',r);return r;}).catch(()=>caches.match('/solo.html')));
    return;
  }
  // Código y estilos: red primero (cada versión nueva se ve al instante), caché sin señal.
  event.respondWith(fetch(req).then(r=>put(req,r)).catch(()=>caches.match(req,{ignoreSearch:true})));
});

// AuxiliOS · medición de anuncios de Meta (píxel). Solo se carga si la instalación tiene AUXILIOS_META_PIXEL_ID.
// También guarda de qué anuncio o campaña vino la visita (utm_*) para saber qué funciona. No envía datos de servicios ni de clientes.
(function(){
  'use strict';
  var KEY='ax-utm-v1',RT=window.AUXILIOS_RUNTIME||{},id=String(RT.metaPixelId||'').replace(/\D/g,'');
  function store(){try{var q=new URLSearchParams(location.search),o={};['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(k){var v=q.get(k);if(v)o[k]=v.slice(0,80);});
    if(q.get('fbclid'))o.fbclid=q.get('fbclid').slice(0,200);if(Object.keys(o).length){o.at=new Date().toISOString();localStorage.setItem(KEY,JSON.stringify(o));}}catch(e){}}
  function source(){try{return JSON.parse(localStorage.getItem(KEY)||'null');}catch(e){return null;}}
  var queue=[];
  function boot(){if(!id||window.fbq)return;
    /* Código estándar de Meta, en versión corta */
    var n=window.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments);};if(!window._fbq)window._fbq=n;n.push=n;n.loaded=true;n.version='2.0';n.queue=[];
    var s=document.createElement('script');s.async=true;s.src='https://connect.facebook.net/es_LA/fbevents.js';document.head.appendChild(s);
    window.fbq('init',id);window.fbq('track','PageView');queue.forEach(function(a){window.fbq.apply(null,a);});queue=[];}
  function track(ev,params){if(!id)return;if(!window.fbq){queue.push(['track',ev,params||{}]);boot();return;}window.fbq('track',ev,params||{});}
  store();
  window.AxPixel={enabled:!!id,boot:boot,track:track,source:source};
})();

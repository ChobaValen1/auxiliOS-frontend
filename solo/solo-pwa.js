// AuxiliOS Solo · se instala como app en el celular: aviso la primera vez, instalación en Android y pasos para iPhone.
(function(){
'use strict';
const KEY='solo-install-v1';
const store={get(){try{return localStorage.getItem(KEY);}catch(e){return null;}},set(v){try{localStorage.setItem(KEY,v);}catch(e){}}};
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const ua=navigator.userAgent||'';
const ios=/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);
const phone=()=>matchMedia('(pointer: coarse)').matches;
let deferred=null;

if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/solo-sw.js',{scope:'/solo'}).catch(()=>{}));

addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;
  const s=document.getElementById('install');if(s&&!s.hidden)paint(s);});
addEventListener('appinstalled',()=>{deferred=null;store.set('installed');close();window.SoloCore?.toast('¡Listo! AuxiliOS Solo quedó en tu pantalla de inicio.');});

const icon=n=>`<svg class="ico" aria-hidden="true"><use href="/ui/icons.svg#${n}"/></svg>`;
function steps(){
  if(ios)return `<ol class="install-steps"><li>Tocá <b>Compartir</b> ${icon('share-2')} abajo en Safari.</li><li>Elegí <b>Agregar a inicio</b>.</li><li>Tocá <b>Agregar</b>. Listo: se abre como una app.</li></ol>`;
  return `<ol class="install-steps"><li>Tocá el menú <b>⋮</b> del navegador.</li><li>Elegí <b>Instalar app</b> o <b>Agregar a pantalla principal</b>.</li></ol>`;
}
function paint(s){
  s.querySelector('.install-body').innerHTML=deferred
    ?'<p class="sub">Se abre en pantalla completa, más rápido y sin la barra del navegador.</p>'
    :'<p class="sub">Se abre en pantalla completa, más rápido y sin la barra del navegador.</p>'+steps();
  const go=s.querySelector('#install-go');go.hidden=!deferred;
}
function open(){
  if(standalone())return false;
  let s=document.getElementById('install');
  if(!s){s=document.createElement('div');s.id='install';s.className='sheet-wrap';s.hidden=true;
    s.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="install-t">
      <div class="sheet-grip" aria-hidden="true"></div>
      <div class="install-head"><img src="/assets/icons/icon-192.png" alt="" width="56" height="56"><div><h2 id="install-t">Instalá AuxiliOS Solo</h2><p class="hint">Queda como una app en tu celular.</p></div></div>
      <div class="install-body"></div>
      <button class="btn pri block" type="button" id="install-go">${icon('download')} Instalar app</button>
      <button class="btn ghost block" type="button" id="install-no">Ahora no</button></div>`;
    document.body.appendChild(s);
    s.addEventListener('click',e=>{if(e.target===s)close();});
    s.querySelector('#install-no').onclick=close;
    s.querySelector('#install-go').onclick=async()=>{if(!deferred)return;deferred.prompt();const r=await deferred.userChoice.catch(()=>null);deferred=null;
      if(r?.outcome==='accepted'){store.set('installed');close();}else paint(s);};
  }
  paint(s);s.hidden=false;store.set(store.get()||'seen');
  requestAnimationFrame(()=>s.classList.add('on'));setTimeout(()=>s.querySelector('button:not([hidden])')?.focus({preventScroll:true}),60);
  return true;
}
function close(){const s=document.getElementById('install');if(!s||s.hidden)return;s.classList.remove('on');setTimeout(()=>{s.hidden=true;},220);}
addEventListener('keydown',e=>{if(e.key==='Escape')close();});

// La primera vez que se entra desde el celular aparece el aviso para instalar.
addEventListener('load',()=>{if(store.get()||standalone())return;
  setTimeout(()=>{if(!store.get()&&(deferred||phone()))open();},deferred?400:1400);});

// Sin zoom: la app se maneja como una app, no como una página (los campos ya usan letra de 16px).
['gesturestart','gesturechange'].forEach(t=>document.addEventListener(t,e=>e.preventDefault(),{passive:false}));
document.addEventListener('touchmove',e=>{if(e.touches&&e.touches.length>1)e.preventDefault();},{passive:false});

window.SoloPWA={open,close,get installed(){return standalone();},get ios(){return ios;}};
})();

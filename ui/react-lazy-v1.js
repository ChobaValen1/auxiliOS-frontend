/* AuxiliOS · React bajo demanda
   React 18.3.1 + htm (plantillas sin paso de compilación), guardados en /vendor para que funcione sin señal.
   Se cargan sólo la primera vez que una pantalla los pide. */
(()=>{'use strict';
const FILES=['/vendor/react-18.3.1.production.min.js','/vendor/react-dom-18.3.1.production.min.js','/vendor/htm-3.1.1.umd.js'];
let loading=null;
function script(src){return new Promise((resolve,reject)=>{const found=document.querySelector(`script[data-ax-vendor="${src}"]`);if(found&&found.dataset.loaded==='true')return resolve();const el=found||document.createElement('script');el.src=src;el.async=false;el.dataset.axVendor=src;el.addEventListener('load',()=>{el.dataset.loaded='true';resolve();},{once:true});el.addEventListener('error',()=>reject(new Error('No se pudo cargar '+src)),{once:true});if(!found)document.head.appendChild(el);});}
function ready(){return !!(window.React&&window.ReactDOM?.createRoot&&window.htm);}
function load(){if(ready())return Promise.resolve(api());if(!loading)loading=FILES.reduce((p,src)=>p.then(()=>script(src)),Promise.resolve()).then(api).catch(error=>{loading=null;throw error;});return loading;}
function api(){const html=window.htm.bind(window.React.createElement);return{React:window.React,ReactDOM:window.ReactDOM,html};}
window.AuxiliosReact={load,ready,files:FILES};
})();

/* AuxiliOS · Servicios · estabilidad de runtime v1 */
(()=>{'use strict';
if(window.OperatorServicesStabilityV1)return;

let timer=null;
let attempts=0;

function disconnectBlockAObserver(){
  const state=window.OperatorServicesBlockA?.state;
  if(!state)return false;
  if(state.observer){
    state.observer.disconnect();
    state.observer=null;
    console.info('[Servicios] Observer global de Bloque A desactivado para evitar loops de DOM.');
  }
  return true;
}

function stabilize(){
  return disconnectBlockAObserver();
}

function start(){
  if(stabilize()){
    if(timer)clearInterval(timer);
    timer=null;
    return;
  }
  if(timer)return;
  attempts=0;
  timer=setInterval(()=>{
    if(stabilize()||++attempts>600){
      clearInterval(timer);
      timer=null;
    }
  },100);
}

window.OperatorServicesStabilityV1={start,stabilize,disconnectBlockAObserver};
window.addEventListener('auxilios:features-ready',()=>setTimeout(start,0));
document.readyState==='loading'
  ?document.addEventListener('DOMContentLoaded',start,{once:true})
  :start();
})();

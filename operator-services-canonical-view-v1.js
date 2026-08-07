/* AuxiliOS · Servicios · Vista canónica */
(()=>{'use strict';
const ID='operator-services-canonical-view-v1';
if(window.OperatorServicesCanonicalViewV1)return;

function removeAlternativeConsole(){
  for(const id of ['ocv2-switch','ocv2-root','ocv2-settings']){
    document.getElementById(id)?.remove();
  }
  try{sessionStorage.removeItem('auxilios.operatorConsoleMode');}catch(_error){}
}

function keepLegacyBoardOutOfTheUI(){
  const board=document.getElementById('os-board');
  if(board){
    board.hidden=true;
    board.setAttribute('aria-hidden','true');
    board.dataset.canonicalFallback='1';
  }
}

function exposeCanonicalTable(){
  const root=document.getElementById('oad-root');
  if(root){
    root.hidden=false;
    root.removeAttribute('aria-hidden');
    root.dataset.canonicalView='1';
  }
}

function apply(){
  document.body.classList.add('services-canonical-table');
  removeAlternativeConsole();
  keepLegacyBoardOutOfTheUI();
  exposeCanonicalTable();
}

let scheduled=false;
function schedule(){
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(()=>{scheduled=false;apply();});
}

const observer=new MutationObserver(schedule);
function init(){
  apply();
  observer.observe(document.body,{subtree:true,childList:true});
  window.OperatorServicesCanonicalViewV1={apply,disconnect:()=>observer.disconnect()};
}

document.readyState==='loading'
  ? document.addEventListener('DOMContentLoaded',init,{once:true})
  : init();
})();

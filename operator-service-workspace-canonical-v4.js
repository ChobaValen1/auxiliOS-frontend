/* AuxiliOS · Nuevo Servicio · Canonical workspace owner v4 */
(()=>{'use strict';
const ID='operator-service-workspace-canonical-v4';
if(window.OperatorServiceWorkspaceCanonicalV4)return;

let observer=null;
let repaintQueued=false;
let installed=false;

const flags=()=>window.AuxiliosFeatures?.flags||{};
const enabled=()=>Boolean(flags().service_workspace_v2);
const shell=()=>document.getElementById('os-wizard-shell');
const v2=()=>window.OperatorServiceWorkspaceV2;

function disableLegacyCreationCss(){
  if(!enabled())return;
  document.querySelectorAll('link[href*="operator-service-creation-redesign.css"],#phase3b-service-creation-css').forEach(link=>{
    link.disabled=true;
    link.dataset.disabledByWorkspaceV4='1';
  });
}

function enforceThreeColumns(){
  if(!enabled())return false;
  const root=document.querySelector('#modal-operador-wizard .osv2-workspace');
  const grid=root?.querySelector('.osv2-grid');
  if(!root||!grid)return false;

  root.dataset.canonicalWorkspace='v4';
  root.style.setProperty('display','grid','important');
  root.style.setProperty('grid-template-rows','54px minmax(0, 1fr) 62px','important');
  root.style.setProperty('width','100%','important');
  root.style.setProperty('height','100%','important');
  root.style.setProperty('min-width','0','important');
  root.style.setProperty('min-height','0','important');
  root.style.setProperty('overflow','hidden','important');

  grid.dataset.canonicalGrid='three-columns';
  grid.style.setProperty('display','grid','important');
  grid.style.setProperty('grid-template-columns','repeat(3, minmax(0, 1fr))','important');
  grid.style.setProperty('grid-template-rows','minmax(0, 1fr)','important');
  grid.style.setProperty('width','100%','important');
  grid.style.setProperty('height','100%','important');
  grid.style.setProperty('min-width','0','important');
  grid.style.setProperty('min-height','0','important');
  grid.style.setProperty('padding','0','important');
  grid.style.setProperty('overflow','hidden','important');

  const columns=[...grid.children].filter(el=>el.classList.contains('osv2-column'));
  columns.forEach((column,index)=>{
    column.dataset.canonicalColumn=String(index+1);
    column.style.setProperty('width','auto','important');
    column.style.setProperty('min-width','0','important');
    column.style.setProperty('max-width','none','important');
    column.style.setProperty('margin','0','important');
  });

  return columns.length===3;
}

function restoreV2IfLegacyPainted(){
  if(!enabled())return false;
  const currentShell=shell();
  if(!currentShell)return false;
  const legacy=currentShell.querySelector('.p3b-create-grid');
  const canonical=currentShell.querySelector('.osv2-workspace .osv2-grid');
  if(!legacy||canonical)return false;
  if(repaintQueued)return true;
  repaintQueued=true;
  queueMicrotask(()=>{
    repaintQueued=false;
    try{v2()?.render?.();}catch(error){console.warn('[Workspace V4] No se pudo restaurar Workspace V2',error);}
    queueMicrotask(enforceThreeColumns);
  });
  return true;
}

function reconcile(){
  if(!enabled())return;
  disableLegacyCreationCss();
  if(!restoreV2IfLegacyPainted())enforceThreeColumns();
}

function observe(){
  if(observer)return;
  observer=new MutationObserver(()=>reconcile());
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden']});
}

function install(){
  if(installed||!enabled())return false;
  installed=true;
  disableLegacyCreationCss();
  observe();
  reconcile();
  window.addEventListener('auxilios:features-ready',reconcile);
  window.OperatorServiceWorkspaceCanonicalV4={reconcile,enforceThreeColumns,restoreV2IfLegacyPainted};
  return true;
}

let attempts=0;
const timer=setInterval(()=>{
  if(install())clearInterval(timer);
  else if(++attempts>160)clearInterval(timer);
},125);

window.addEventListener('auxilios:features-ready',()=>{
  if(install())clearInterval(timer);
  else reconcile();
});
})();

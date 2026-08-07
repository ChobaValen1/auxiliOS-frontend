/* AuxiliOS · Servicios · Bloque A · workspace unificado + dirty guard */
(()=>{'use strict';
const ID='operator-services-block-a-v1';
if(window.OperatorServicesBlockA)return;

const STATE={
 createDirty:false,
 editDirty:false,
 createSaving:false,
 editSaving:false,
 bypass:false,
 observer:null,
 installed:false,
 originals:{},
};

const O=()=>window.OperatorServices;
const flags=()=>window.AuxiliosFeatures?.flags||{};
const enabled=()=>Boolean(flags().operator_console_v2&&(flags().service_workspace_v2||flags().service_editing_tolls_v1));
const wizard=()=>O()?.S?.wizard||null;
const notify=(message,type='info')=>typeof window.toast==='function'?window.toast(message,type):console.log(message);

function modalActive(id){
 const el=document.getElementById(id);
 if(!el)return false;
 if(el.hidden)return false;
 return el.classList.contains('open')||el.getAttribute('aria-hidden')==='false'||el.getClientRects().length>0;
}
function createOpen(){return modalActive('modal-operador-wizard')&&Boolean(document.querySelector('#modal-operador-wizard .osv2-workspace'));}
function editOpen(){return modalActive('ose-modal')&&Boolean(document.querySelector('#ose-modal #ose-form'));}
function detailOpen(){return modalActive('modal-operador-servicio');}
function hasDirty(){return(createOpen()&&STATE.createDirty)||(editOpen()&&STATE.editDirty);}

function stateElement(kind){
 if(kind==='create')return document.querySelector('#modal-operador-wizard .osv2-save-state');
 if(kind==='edit')return document.querySelector('#ose-modal #ose-save-state');
 return null;
}
function paintState(kind){
 const el=stateElement(kind);if(!el)return;
 const dirty=kind==='create'?STATE.createDirty:STATE.editDirty;
 const saving=kind==='create'?STATE.createSaving:STATE.editSaving;
 el.classList.toggle('dirty',dirty&&!saving);
 el.classList.toggle('saving',saving);
 if(saving)el.textContent='Guardando cambios…';
 else if(dirty)el.textContent='Cambios sin guardar';
 else el.textContent='Sin cambios pendientes';
}
function setDirty(kind,value){
 if(kind==='create')STATE.createDirty=Boolean(value);
 if(kind==='edit')STATE.editDirty=Boolean(value);
 paintState(kind);
}
function setSaving(kind,value){
 if(kind==='create')STATE.createSaving=Boolean(value);
 if(kind==='edit')STATE.editSaving=Boolean(value);
 paintState(kind);
}

function ensureUnsavedDialog(){
 if(document.getElementById('svc-unsaved-dialog'))return;
 document.body.insertAdjacentHTML('beforeend',`
  <div id="svc-unsaved-dialog" hidden aria-hidden="true">
   <section class="svc-unsaved-card" role="dialog" aria-modal="true" aria-labelledby="svc-unsaved-title">
    <div class="body">
     <small>AuxiliOS · Servicios</small>
     <h3 id="svc-unsaved-title">Hay cambios sin guardar</h3>
     <p>Si salís ahora, las modificaciones realizadas en este servicio se van a perder.</p>
    </div>
    <footer>
     <button type="button" data-svc-stay>Seguir editando</button>
     <button type="button" data-svc-leave>Salir sin guardar</button>
    </footer>
   </section>
  </div>`);
}
function askUnsaved(){
 ensureUnsavedDialog();
 const dialog=document.getElementById('svc-unsaved-dialog');
 dialog.hidden=false;dialog.setAttribute('aria-hidden','false');
 return new Promise(resolve=>{
  let done=false;
  const finish=value=>{
   if(done)return;done=true;
   dialog.hidden=true;dialog.setAttribute('aria-hidden','true');
   dialog.removeEventListener('click',click,true);
   document.removeEventListener('keydown',key,true);
   resolve(value);
  };
  const click=event=>{
   if(event.target.closest('[data-svc-stay]'))finish(false);
   else if(event.target.closest('[data-svc-leave]'))finish(true);
   else if(event.target===dialog)finish(false);
  };
  const key=event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish(false);}};
  dialog.addEventListener('click',click,true);
  document.addEventListener('keydown',key,true);
  setTimeout(()=>dialog.querySelector('[data-svc-stay]')?.focus(),0);
 });
}

function addModeBadge(container,mode){
 if(!container)return;
 const old=container.querySelector('.svc-mode-badge');
 if(old)old.remove();
 const badge=document.createElement('span');
 badge.className=`svc-mode-badge ${mode}`;
 badge.textContent=mode==='new'?'Nuevo servicio':mode==='edit'?'Edición':'Vista del servicio';
 container.prepend(badge);
}
function enhanceCreate(){
 const root=document.querySelector('#modal-operador-wizard .osv2-workspace');if(!root)return;
 root.dataset.serviceWorkspaceMode='new';
 const head=root.querySelector('.osv2-header > div');
 addModeBadge(head,'new');
 const brand=head?.querySelector(':scope > span:not(.svc-mode-badge)');
 if(brand)brand.textContent='AuxiliOS · Servicios';
 paintState('create');
}
function enhanceEdit(){
 const form=document.querySelector('#ose-modal #ose-form');if(!form)return;
 form.dataset.serviceWorkspaceMode='edit';
 const head=form.querySelector('.ose-head > div');
 addModeBadge(head,'edit');
 const title=head?.querySelector('h3');if(title)title.textContent='Editar servicio';
 paintState('edit');
}
function enhanceDetail(){
 const shell=document.querySelector('#modal-operador-servicio .os-detail-shell');if(!shell)return;
 shell.dataset.serviceWorkspaceMode='view';
 const head=shell.querySelector('.os-detail-head > div');
 addModeBadge(head,'view');
}
function patchLifecycleLabels(){
 document.querySelectorAll('.p3b-lifecycle-head span').forEach(el=>{
  if(/fase\s*3b/i.test(el.textContent||''))el.textContent='Operación';
 });
 document.querySelectorAll('[data-phase-label],.p3b-phase-label').forEach(el=>{
  if(/fase\s*3b/i.test(el.textContent||''))el.textContent='Operación';
 });
}
function enhance(){enhanceCreate();enhanceEdit();enhanceDetail();patchLifecycleLabels();}

function closeDetailSilently(){
 const modal=document.getElementById('modal-operador-servicio');if(!modal)return;
 if(typeof window.closeModal==='function')window.closeModal('modal-operador-servicio');
 else{modal.classList.remove('open');modal.setAttribute('aria-hidden','true');}
}

function wrapCreateOpen(){
 const fn=window.abrirNuevoServicio;
 if(typeof fn!=='function'||fn.__svcBlockA)return false;
 STATE.originals.openCreate=fn;
 const wrapped=async function(){
  const result=await fn.apply(this,arguments);
  STATE.createSaving=false;setDirty('create',false);
  setTimeout(enhanceCreate,0);
  return result;
 };
 wrapped.__svcBlockA=true;window.abrirNuevoServicio=wrapped;return true;
}
function wrapCreateClose(){
 const fn=window.cerrarNuevoServicio;
 if(typeof fn!=='function'||fn.__svcBlockA)return false;
 STATE.originals.closeCreate=fn;
 const wrapped=async function(){
  if(STATE.createDirty&&!STATE.bypass){
   const leave=await askUnsaved();if(!leave)return false;
  }
  STATE.bypass=true;setDirty('create',false);setSaving('create',false);
  try{return await fn.apply(this,arguments);}finally{STATE.bypass=false;}
 };
 wrapped.__svcBlockA=true;window.cerrarNuevoServicio=wrapped;return true;
}
function wrapDraftSave(){
 const fn=window.guardarBorradorServicio;
 if(typeof fn!=='function'||fn.__svcBlockA)return false;
 STATE.originals.saveDraft=fn;
 const wrapped=async function(){
  setSaving('create',true);
  try{
   const before=wizard()?.draftSavedAt||null;
   const result=await fn.apply(this,arguments);
   await new Promise(resolve=>setTimeout(resolve,0));
   const after=wizard()?.draftSavedAt||null;
   if(after&&after!==before)setDirty('create',false);
   return result;
  }finally{setSaving('create',false);}
 };
 wrapped.__svcBlockA=true;window.guardarBorradorServicio=wrapped;return true;
}
function wrapFinish(){
 const fn=window.osv2Finish;
 if(typeof fn!=='function'||fn.__svcBlockA)return false;
 STATE.originals.finishCreate=fn;
 const wrapped=async function(){
  setSaving('create',true);
  try{
   const result=await fn.apply(this,arguments);
   setTimeout(()=>{if(!createOpen())setDirty('create',false);else paintState('create');},80);
   return result;
  }finally{setTimeout(()=>setSaving('create',false),90);}
 };
 wrapped.__svcBlockA=true;window.osv2Finish=wrapped;return true;
}
function wrapEditOpen(){
 const fn=window.editarServicioOperador;
 if(typeof fn!=='function'||fn.__svcBlockA)return false;
 STATE.originals.openEdit=fn;
 const wrapped=async function(){
  if(detailOpen())closeDetailSilently();
  STATE.editSaving=false;setDirty('edit',false);
  const result=await fn.apply(this,arguments);
  setTimeout(enhanceEdit,0);
  return result;
 };
 wrapped.__svcBlockA=true;window.editarServicioOperador=wrapped;return true;
}
function wrapDetail(){
 const service=O();const fn=service?.openDetail;
 if(typeof fn!=='function'||fn.__svcBlockA)return false;
 STATE.originals.openDetail=fn;
 const wrapped=async function(){
  const result=await fn.apply(this,arguments);
  setTimeout(enhanceDetail,0);
  return result;
 };
 wrapped.__svcBlockA=true;service.openDetail=wrapped;return true;
}
function wrapNavigation(){
 const fn=window.goTo;
 if(typeof fn!=='function'||fn.__svcBlockA)return false;
 STATE.originals.goTo=fn;
 const wrapped=async function(){
  if(hasDirty()&&!STATE.bypass){
   const leave=await askUnsaved();if(!leave)return false;
   setDirty('create',false);setDirty('edit',false);
  }
  STATE.bypass=true;
  try{return fn.apply(this,arguments);}finally{STATE.bypass=false;}
 };
 wrapped.__svcBlockA=true;window.goTo=wrapped;return true;
}
function installWrappers(){
 wrapCreateOpen();wrapCreateClose();wrapDraftSave();wrapFinish();wrapEditOpen();wrapDetail();wrapNavigation();
}

function onInput(event){
 if(event.target.closest('#modal-operador-wizard .osv2-workspace'))setDirty('create',true);
 if(event.target.closest('#ose-modal #ose-form'))setDirty('edit',true);
}
async function onClickCapture(event){
 if(event.target.closest('.ose-edit-button,.ose-edit-footer')){
  setDirty('edit',false);
  setTimeout(()=>{closeDetailSilently();enhanceEdit();},0);
  return;
 }
 if(STATE.bypass)return;
 const editClose=event.target.closest('#ose-modal [data-ose-close]');
 const editBackdrop=event.target.id==='ose-modal';
 if(STATE.editDirty&&editOpen()&&(editClose||editBackdrop)){
  event.preventDefault();event.stopImmediatePropagation();
  const leave=await askUnsaved();if(!leave)return;
  STATE.bypass=true;setDirty('edit',false);
  try{
   const button=editClose||document.querySelector('#ose-modal [data-ose-close]');
   button?.click();
  }finally{setTimeout(()=>{STATE.bypass=false;},0);}
  return;
 }
 const createBackdrop=event.target.id==='modal-operador-wizard';
 if(STATE.createDirty&&createOpen()&&createBackdrop){
  event.preventDefault();event.stopImmediatePropagation();
  const leave=await askUnsaved();if(!leave)return;
  STATE.bypass=true;setDirty('create',false);
  try{await STATE.originals.closeCreate?.();}finally{STATE.bypass=false;}
 }
}
function onSubmitCapture(event){
 if(event.target.matches('#ose-form'))setSaving('edit',true);
}
async function onKeyCapture(event){
 if(event.key!=='Escape'||STATE.bypass||document.getElementById('svc-unsaved-dialog')?.hidden===false)return;
 if(STATE.editDirty&&editOpen()){
  event.preventDefault();event.stopImmediatePropagation();
  const leave=await askUnsaved();if(!leave)return;
  STATE.bypass=true;setDirty('edit',false);
  try{document.querySelector('#ose-modal [data-ose-close]')?.click();}finally{setTimeout(()=>{STATE.bypass=false;},0);}
 }else if(STATE.createDirty&&createOpen()){
  event.preventDefault();event.stopImmediatePropagation();
  const leave=await askUnsaved();if(!leave)return;
  STATE.bypass=true;setDirty('create',false);
  try{await STATE.originals.closeCreate?.();}finally{STATE.bypass=false;}
 }
}
function onBeforeUnload(event){
 if(!hasDirty())return;
 event.preventDefault();event.returnValue='';
}

function observe(){
 if(STATE.observer)return;
 STATE.observer=new MutationObserver(()=>{
  installWrappers();enhance();
  if(!editOpen()&&STATE.editSaving){setSaving('edit',false);setDirty('edit',false);}
  if(!createOpen()&&STATE.createSaving){setSaving('create',false);setDirty('create',false);}
 });
 STATE.observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','aria-hidden']});
}

function install(){
 if(STATE.installed||!enabled())return false;
 ensureUnsavedDialog();
 installWrappers();
 document.addEventListener('input',onInput,true);
 document.addEventListener('change',onInput,true);
 document.addEventListener('click',onClickCapture,true);
 document.addEventListener('submit',onSubmitCapture,true);
 document.addEventListener('keydown',onKeyCapture,true);
 window.addEventListener('beforeunload',onBeforeUnload);
 observe();enhance();
 STATE.installed=true;
 window.OperatorServicesBlockA={state:STATE,enhance,setDirty,askUnsaved};
 return true;
}

let attempts=0;
const timer=setInterval(()=>{
 if(install())clearInterval(timer);
 else if(++attempts>120)clearInterval(timer);
},250);
})();

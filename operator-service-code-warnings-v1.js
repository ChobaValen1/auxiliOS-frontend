/* AuxiliOS · Nuevo Servicio · avisos de códigos de prestadora */
(()=>{'use strict';
const W=()=>window.OperatorServices?.S?.wizard||null;
const fmtDate=v=>{if(!v)return'';try{return new Date(v).toLocaleDateString('es-AR')}catch{return String(v)}};
function warningText(data){const m=data?.matches?.[0];if(!m)return'';return`Este código ya fue utilizado recientemente${m.service_number?` en ${m.service_number}`:''}${m.scheduled_for?` (${fmtDate(m.scheduled_for)})`:''}. Podés usarlo igualmente.`;}
function ensureNote(anchor,id){let el=document.getElementById(id);if(!el&&anchor){el=document.createElement('small');el.id=id;el.className='osv3-code-warning';anchor.insertAdjacentElement('afterend',el);}return el;}
function decorate(){
 const w=W();if(!w)return;
 const primary=document.getElementById('osv4-primary');const label=primary?.closest('label')?.querySelector(':scope > span');if(label)label.textContent='Tipo de Servicio *';
 const order=document.getElementById('osv4-service-order');const orderLabel=order?.closest('label')?.querySelector(':scope > span');if(orderLabel)orderLabel.textContent='Código prestadora *';
 const note=ensureNote(order,'osv3-provider-code-warning');if(note){note.textContent=warningText(w.codeWarning);note.hidden=!w.codeWarning;}
 for(const input of document.querySelectorAll('[data-row-code]')){
  const row=input.closest('.osv4-concept-row');const conceptId=row?.querySelector('[data-row-concept]')?.value;const id=`osv3-code-warning-${String(conceptId||'').replace(/[^a-zA-Z0-9_-]/g,'')}`;
  let n=row?.querySelector('.osv3-item-code-warning');if(!n&&row){n=document.createElement('small');n.className='osv3-item-code-warning';input.insertAdjacentElement('afterend',n);}
  const warning=conceptId?w.itemCodeWarnings?.[conceptId]:null;if(n){n.id=id;n.textContent=warningText(warning);n.hidden=!warning;}
 }
}
async function onFocusOut(e){
 const t=e.target;if(t?.id==='osv4-service-order'){await window.validarCodigoPrestadoraServicio?.();decorate();return;}
 if(t?.matches?.('[data-row-code]')){const row=t.closest('.osv4-concept-row');const conceptId=row?.querySelector('[data-row-concept]')?.value;if(conceptId){await window.validarCodigoConceptoServicio?.(conceptId,t.value);decorate();}}
}
document.addEventListener('focusout',onFocusOut,true);
const workspace=window.OperatorServiceWorkspaceV2;
if(workspace){
 const render=workspace.render?.bind(workspace),sync=workspace.sync?.bind(workspace);
 if(render)workspace.render=(...args)=>{const out=render(...args);queueMicrotask(decorate);return out;};
 if(sync)workspace.sync=(...args)=>{const out=sync(...args);queueMicrotask(decorate);return out;};
}
window.OperatorServiceCodeWarningsV1={decorate};
})();

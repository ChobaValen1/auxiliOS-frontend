/* AuxiliOS · Servicio · Reajuste administrativo V3 */
(()=>{'use strict';
const O=window.OperatorServices;
if(!O)return;
const S=O.S;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number(String(v??'').replace(',','.'))||0;
const money=(v,c='ARS')=>typeof O.money==='function'?O.money(v,c):new Intl.NumberFormat('es-AR',{style:'currency',currency:c||'ARS',maximumFractionDigits:2}).format(num(v));
const role=()=>String(typeof PERFIL_USUARIO==='undefined'?'':(PERFIL_USUARIO?.roles?.name||PERFIL_USUARIO?.role||'')).toLowerCase();
const isAdmin=()=>role()==='administracion';
const notify=(m,t='info')=>typeof toast==='function'?toast(m,t):console.log(m);
const state={itemId:null,serviceId:null,busy:false,historyLoaded:false};
let originalOpen=null;

function service(){return (S.services||[]).find(x=>String(x.service_id)===String(S.selected))||null;}
function adjustableItems(){return (S.items||[]).filter(i=>i.matrix_rate_id&&i.item_role!=='primary');}
function adjusted(i){return Math.abs(num(i.list_unit_price??i.unit_price)-num(i.unit_price))>.005;}
function ensureModal(){
 if(document.getElementById('osr3-modal'))return;
 document.body.insertAdjacentHTML('beforeend',`<div class="osr3-modal" id="osr3-modal" aria-hidden="true"><div class="osr3-dialog" role="dialog" aria-modal="true" aria-labelledby="osr3-title">
  <h3 id="osr3-title">Reajuste administrativo</h3><p id="osr3-subtitle">Modifica únicamente el valor aplicado a este servicio. El tarifario vigente no cambia.</p>
  <div class="osr3-summary"><div class="osr3-stat"><small>Tarifa de lista</small><b id="osr3-list-price">—</b></div><div class="osr3-stat"><small>Precio aplicado</small><b id="osr3-current-price">—</b></div><div class="osr3-stat"><small>Cantidad</small><b id="osr3-qty">—</b></div></div>
  <div class="osr3-form"><label><span>Nuevo precio unitario *</span><input id="osr3-new-price" type="number" min="0" step="0.01"></label><label class="full"><span>Motivo del reajuste *</span><textarea id="osr3-reason" rows="3" placeholder="Ej.: Autorización extraordinaria de la prestadora"></textarea></label></div>
  <div id="osr3-error" class="osr3-error" hidden></div>
  <div id="osr3-history" class="osr3-history" hidden><h4>Historial de reajustes</h4><div id="osr3-history-body"></div></div>
  <div class="osr3-actions"><button type="button" class="osr3-btn" data-osr3="history">Historial</button><div class="osr3-actions-right"><button type="button" class="osr3-btn" data-osr3="close">Cancelar</button><button type="button" class="osr3-btn osr3-primary" data-osr3="save">Aplicar reajuste</button></div></div>
 </div></div>`);
}
function setError(message=''){const e=document.getElementById('osr3-error');if(!e)return;e.textContent=message;e.hidden=!message;}
function setBusy(value){state.busy=value;const b=document.querySelector('[data-osr3="save"]');if(b){b.disabled=value;b.textContent=value?'Aplicando…':'Aplicar reajuste';}}
function openModal(itemId){
 if(!isAdmin())return;
 const item=adjustableItems().find(i=>String(i.item_id)===String(itemId));if(!item)return notify('El concepto seleccionado no admite reajuste','error');
 ensureModal();state.itemId=item.item_id;state.serviceId=item.service_id||S.selected;state.historyLoaded=false;setError('');
 const s=service(),currency=s?.currency||'ARS';
 document.getElementById('osr3-title').textContent=`Reajuste · ${item.service_name||'Concepto'}`;
 document.getElementById('osr3-list-price').textContent=money(item.list_unit_price??item.unit_price,currency);
 document.getElementById('osr3-current-price').textContent=money(item.unit_price,currency);
 document.getElementById('osr3-qty').textContent=`${num(item.quantity)} ${item.pricing_unit||''}`.trim();
 document.getElementById('osr3-new-price').value=num(item.unit_price);
 document.getElementById('osr3-reason').value='';
 document.getElementById('osr3-history').hidden=true;document.getElementById('osr3-history-body').innerHTML='';
 const modal=document.getElementById('osr3-modal');modal.classList.add('open');modal.setAttribute('aria-hidden','false');
 requestAnimationFrame(()=>document.getElementById('osr3-new-price')?.focus());
}
function closeModal(){const modal=document.getElementById('osr3-modal');if(!modal)return;modal.classList.remove('open');modal.setAttribute('aria-hidden','true');state.itemId=null;state.historyLoaded=false;}
async function loadHistory(){
 if(!state.itemId)return;
 const box=document.getElementById('osr3-history'),body=document.getElementById('osr3-history-body');if(!box||!body)return;box.hidden=false;body.innerHTML='<div class="osr3-history-note">Cargando…</div>';
 const {data,error}=await _db.rpc('get_operator_service_item_adjustments_v3',{p_item_id:state.itemId});
 if(error){body.innerHTML=`<div class="osr3-error">${esc(error.message)}</div>`;return;}
 const rows=Array.isArray(data)?data:[];state.historyLoaded=true;
 if(!rows.length){body.innerHTML='<div class="osr3-history-note">Este concepto todavía no tiene reajustes.</div>';return;}
 const currency=service()?.currency||'ARS';
 body.innerHTML=`<table><thead><tr><th>Fecha</th><th>Anterior</th><th>Nuevo</th><th>Diferencia</th><th>Motivo</th></tr></thead><tbody>${rows.map(r=>{const delta=num(r.new_unit_price)-num(r.previous_unit_price);return`<tr><td>${esc(new Date(r.adjusted_at).toLocaleString('es-AR'))}</td><td>${money(r.previous_unit_price,currency)}</td><td>${money(r.new_unit_price,currency)}</td><td class="osr3-delta ${delta>=0?'positive':'negative'}">${delta>=0?'+':''}${money(delta,currency)}</td><td>${esc(r.reason||'—')}</td></tr>`}).join('')}</tbody></table>`;
}
async function save(){
 if(state.busy||!state.itemId)return;
 const price=Number(document.getElementById('osr3-new-price')?.value),reason=String(document.getElementById('osr3-reason')?.value||'').trim();
 if(!Number.isFinite(price)||price<0)return setError('Ingresá un nuevo precio unitario válido.');
 if(reason.length<5)return setError('Ingresá el motivo del reajuste.');
 setError('');setBusy(true);
 const serviceId=state.serviceId;
 const {error}=await _db.rpc('adjust_operator_service_item_v3',{p_item_id:state.itemId,p_new_unit_price:price,p_reason:reason});
 setBusy(false);if(error)return setError(error.message||'No se pudo aplicar el reajuste.');
 closeModal();notify('Reajuste aplicado y auditado','success');
 if(serviceId&&originalOpen){await originalOpen(serviceId);decorate();}
}
function decorate(){
 if(!isAdmin())return;
 const shell=document.getElementById('os-detail-shell');if(!shell||!S.selected)return;
 shell.querySelector('.osr3-panel')?.remove();
 const panels=[...shell.querySelectorAll('.os-panel')];const concepts=panels.find(p=>String(p.querySelector('h4')?.textContent||'').trim()==='Conceptos');if(!concepts)return;
 const rows=adjustableItems(),s=service(),currency=s?.currency||'ARS';
 const panel=document.createElement('section');panel.className='os-panel osr3-panel';
 panel.innerHTML=`<div class="osr3-head"><div><h4>Reajustes</h4><small>Excepciones de este servicio. No modifican el tarifario de la prestadora.</small></div></div><div class="osr3-list">${rows.length?rows.map(i=>`<div class="osr3-row"><div class="osr3-name"><strong>${esc(i.service_name||'Concepto')}</strong><small>${num(i.quantity)} × ${money(i.unit_price,currency)} · ${esc(i.pricing_unit||'unidad')}</small>${adjusted(i)?'<span class="osr3-badge">Reajustado</span>':''}</div><div class="osr3-price"><b>${money(i.subtotal,currency)}</b><small>Lista: ${money(i.list_unit_price??i.unit_price,currency)}</small></div><button type="button" class="osr3-btn" data-osr3="open" data-item-id="${esc(i.item_id)}">Reajustar</button></div>`).join(''):'<div class="osr3-empty">No hay conceptos de Tarifario V3 reajustables en este servicio.</div>'}</div>`;
 concepts.insertAdjacentElement('afterend',panel);
}
function bind(){
 document.addEventListener('click',e=>{
  const btn=e.target?.closest?.('[data-osr3]');if(!btn)return;const action=btn.dataset.osr3;
  if(action==='open')openModal(btn.dataset.itemId);else if(action==='close')closeModal();else if(action==='history')loadHistory();else if(action==='save')save();
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('osr3-modal')?.classList.contains('open'))closeModal();});
}
function install(){
 if(!isAdmin())return;
 ensureModal();
 const candidate=window.abrirDetalleServicio||O.openDetail;if(typeof candidate!=='function')return setTimeout(install,200);
 if(candidate.__osr3Wrapped){originalOpen=candidate.__osr3Original||candidate;return;}
 originalOpen=candidate;
 const wrapped=async id=>{const result=await originalOpen(id);decorate();return result;};
 wrapped.__osr3Wrapped=true;wrapped.__osr3Original=originalOpen;
 window.abrirDetalleServicio=wrapped;O.openDetail=wrapped;
}
bind();install();
window.OperatorServiceReajusteV3={decorate,open:openModal,history:loadHistory};
})();

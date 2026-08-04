/* AuxiliOS · Catálogo y vigencias de peajes */
(()=>{'use strict';
const ID='toll-management';
if(window.AuxiliosTolls)return;
const STATE={rows:[],loading:false,modal:null,observer:null};
const CATEGORY={light_2_axles:'Liviano · 2 ejes',heavy_3_axles:'Pesado · 3 ejes',heavy_4_axles:'Pesado · 4 ejes',heavy_5_axles:'Pesado · 5 ejes',heavy_6_plus_axles:'Pesado · 6 o más ejes',motorcycle:'Moto',other:'Otra categoría'};
const PAYMENT={any:'Tarifa general',cash:'Efectivo',electronic:'Electrónico',telepass:'TelePASE',manual:'Manual'};
const DIRECTION={both:'Ambos sentidos',inbound:'Ingreso',outbound:'Egreso',north:'Norte',south:'Sur',east:'Este',west:'Oeste',clockwise:'Horario',counterclockwise:'Antihorario',other:'Otro'};
const db=()=>typeof _db!=='undefined'?_db:null;
const profile=()=>typeof PERFIL_USUARIO!=='undefined'?PERFIL_USUARIO:null;
const role=()=>String(profile()?.roles?.name||profile()?.role||profile()?.role_name||'').toLowerCase();
const canRead=()=>['administracion','operador','supervision','facturacion'].includes(role());
const canManage=()=>role()==='administracion';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=value=>Number(String(value??'').replace(',','.'))||0;
const money=(value,currency='ARS')=>new Intl.NumberFormat('es-AR',{style:'currency',currency,maximumFractionDigits:2}).format(number(value));
const notify=(message,type='info')=>typeof window.toast==='function'?window.toast(message,type):console.log(message);
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});

function loadCss(){if(document.getElementById(`${ID}-css`))return;const link=document.createElement('link');link.id=`${ID}-css`;link.rel='stylesheet';link.href='/toll-management.css';document.head.appendChild(link);}
function inject(){
 if(!document.getElementById('nav-peajes')){
  const bottom=document.querySelector('.sidenav .nav-bottom');
  bottom?.insertAdjacentHTML('beforebegin','<div class="nav-item" id="nav-peajes" onclick="goTo(\'peajes\')" style="display:none"><span class="nav-icon">🛣️</span><span class="nav-label">Peajes</span></div>');
 }
 if(!document.getElementById('screen-peajes')){
  document.querySelector('.content')?.insertAdjacentHTML('beforeend',`<div class="screen" id="screen-peajes">
   <div class="tm-head"><div><div class="tm-eyebrow">Configuración operativa</div><h2>Peajes</h2><p>Catálogo, categorías e historial de importes por vigencia.</p></div><div class="tm-head-actions"><button type="button" class="btn btn-ghost" data-tm-refresh>↻ Actualizar</button><button type="button" class="btn btn-primary tm-admin" data-tm-new>＋ Nuevo peaje</button></div></div>
   <div class="tm-toolbar"><input id="tm-query" class="form-input" placeholder="Buscar por nombre, código, ruta o concesionaria"><label><input type="checkbox" id="tm-inactive"> Mostrar inactivos</label></div>
   <div class="tm-summary" id="tm-summary"></div><div class="tm-table-wrap"><table class="tm-table"><thead><tr><th>Código</th><th>Peaje</th><th>Ruta / sentido</th><th>Concesionaria</th><th>Importes vigentes</th><th>Historial</th><th>Estado</th><th class="tm-admin">Acciones</th></tr></thead><tbody id="tm-body"><tr><td colspan="8">Cargando…</td></tr></tbody></table></div>
  </div>`);
 }
 if(!STATE.modal){const modal=document.createElement('div');modal.id='tm-modal';modal.className='tm-backdrop';modal.hidden=true;modal.setAttribute('aria-hidden','true');modal.addEventListener('click',event=>{if(event.target===modal||event.target.closest('[data-tm-close]'))closeModal();});modal.addEventListener('submit',handleSubmit);document.body.appendChild(modal);STATE.modal=modal;}
 bind();applyRole();
}
function applyRole(){const nav=document.getElementById('nav-peajes');if(nav)nav.style.display=canRead()?'':'none';document.querySelectorAll('.tm-admin').forEach(node=>node.style.display=canManage()?'':'none');}
function bind(){
 if(document.documentElement.dataset.tmBound==='1')return;document.documentElement.dataset.tmBound='1';
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-tm-refresh]'))load();
  if(event.target.closest('[data-tm-new]'))openLocation();
  const edit=event.target.closest('[data-tm-edit]');if(edit)openLocation(edit.dataset.tmEdit);
  const rate=event.target.closest('[data-tm-rate]');if(rate)openRate(rate.dataset.tmRate);
  const history=event.target.closest('[data-tm-history]');if(history)openHistory(history.dataset.tmHistory);
 });
 document.addEventListener('input',event=>{if(event.target.id==='tm-query')render();});
 document.addEventListener('change',event=>{if(event.target.id==='tm-inactive')load();});
}
function hookNavigation(){
 if(window.__tmNavHook||typeof window.goTo!=='function')return false;
 const base=window.goTo;window.goTo=(name,...args)=>{if(name==='peajes'&&!canRead())return notify('Sin permiso para consultar peajes.','error');const result=base(name,...args);if(name==='peajes')load();return result;};window.__tmNavHook=true;return true;
}
async function load(){
 if(!canRead()||STATE.loading)return;STATE.loading=true;
 const body=document.getElementById('tm-body');if(body)body.innerHTML='<tr><td colspan="8">Cargando catálogo…</td></tr>';
 try{const include=Boolean(document.getElementById('tm-inactive')?.checked);const{data,error}=await db().rpc('list_toll_catalog',{p_as_of:today(),p_include_inactive:include});if(error)throw error;STATE.rows=Array.isArray(data)?data:[];render();}
 catch(error){notify(error.message||'No se pudo cargar el catálogo.','error');if(body)body.innerHTML='<tr><td colspan="8">No se pudo cargar el catálogo.</td></tr>';}
 finally{STATE.loading=false;}
}
function currentRates(row){return(row.rates||[]).filter(rate=>rate.is_current&&rate.is_active);}
function filtered(){const query=(document.getElementById('tm-query')?.value||'').trim().toLowerCase();return STATE.rows.filter(row=>!query||`${row.code} ${row.name} ${row.road||''} ${row.concessionaire||''} ${row.province||''}`.toLowerCase().includes(query));}
function render(){
 const rows=filtered(),body=document.getElementById('tm-body');if(!body)return;
 const active=STATE.rows.filter(row=>row.is_active).length;document.getElementById('tm-summary').textContent=`${rows.length} visibles · ${active} activos · ${STATE.rows.length} totales`;
 if(!rows.length){body.innerHTML='<tr><td colspan="8">No hay peajes para mostrar.</td></tr>';return;}
 body.innerHTML=rows.map(row=>{
  const rates=currentRates(row);const history=(row.rates||[]).length;
  return`<tr><td><b class="tm-code">${esc(row.code)}</b></td><td><b>${esc(row.name)}</b>${row.province?`<small>${esc(row.province)}</small>`:''}</td><td><span>${esc(row.road||'—')}</span><small>${esc(DIRECTION[row.direction]||row.direction||'Ambos sentidos')}${row.km_marker?` · km ${esc(row.km_marker)}`:''}</small></td><td>${esc(row.concessionaire||'—')}</td><td><div class="tm-rates">${rates.length?rates.map(rate=>`<span><b>${money(rate.amount,rate.currency)}</b><small>${esc(CATEGORY[rate.vehicle_category]||rate.vehicle_category)} · ${esc(PAYMENT[rate.payment_method]||rate.payment_method)}</small></span>`).join(''):'<em>Sin importe vigente</em>'}</div></td><td><button type="button" class="tm-link" data-tm-history="${row.toll_id}">${history} vigencia${history===1?'':'s'}</button></td><td><span class="tm-state ${row.is_active?'active':'inactive'}">${row.is_active?'Activo':'Inactivo'}</span></td><td class="tm-admin"><div class="tm-actions"><button type="button" data-tm-edit="${row.toll_id}">Editar</button><button type="button" data-tm-rate="${row.toll_id}">Nueva tarifa</button></div></td></tr>`;
 }).join('');applyRole();
}
function openModal(html){STATE.modal.innerHTML=`<section class="tm-modal-shell">${html}</section>`;STATE.modal.hidden=false;STATE.modal.setAttribute('aria-hidden','false');}
function closeModal(){if(!STATE.modal)return;STATE.modal.hidden=true;STATE.modal.setAttribute('aria-hidden','true');STATE.modal.innerHTML='';}
function openLocation(id=null){
 if(!canManage())return notify('Solo administración puede gestionar el catálogo.','error');const row=STATE.rows.find(item=>String(item.toll_id)===String(id))||{};
 openModal(`<form data-tm-form="location"><header><div><small>Catálogo de peajes</small><h3>${id?'Editar peaje':'Nuevo peaje'}</h3></div><button type="button" data-tm-close>×</button></header><div class="tm-modal-body"><input type="hidden" name="toll_id" value="${esc(row.toll_id||'')}"><div class="tm-form-grid"><label><span>Código *</span><input name="code" required value="${esc(row.code||'')}"></label><label><span>Nombre *</span><input name="name" required value="${esc(row.name||'')}"></label><label><span>Ruta / autopista</span><input name="road" value="${esc(row.road||'')}"></label><label><span>Kilómetro</span><input name="km_marker" value="${esc(row.km_marker||'')}"></label><label><span>Sentido</span><select name="direction">${Object.entries(DIRECTION).map(([key,label])=>`<option value="${key}" ${row.direction===key?'selected':''}>${esc(label)}</option>`).join('')}</select></label><label><span>Concesionaria</span><input name="concessionaire" value="${esc(row.concessionaire||'')}"></label><label><span>Provincia</span><input name="province" value="${esc(row.province||'')}"></label><label><span>Latitud</span><input name="latitude" type="number" step="0.0000001" value="${esc(row.latitude??'')}"></label><label><span>Longitud</span><input name="longitude" type="number" step="0.0000001" value="${esc(row.longitude??'')}"></label><label class="span-two"><span>Notas</span><textarea name="notes">${esc(row.notes||'')}</textarea></label><label class="tm-check span-two"><input type="checkbox" name="is_active" ${row.is_active!==false?'checked':''}><span>Peaje activo</span></label></div></div><footer><button type="button" class="btn btn-ghost" data-tm-close>Cancelar</button><button type="submit" class="btn btn-primary">Guardar peaje</button></footer></form>`);
}
function openRate(tollId){
 if(!canManage())return notify('Solo administración puede gestionar los importes.','error');const row=STATE.rows.find(item=>String(item.toll_id)===String(tollId));if(!row)return;
 openModal(`<form data-tm-form="rate"><header><div><small>${esc(row.code)} · ${esc(row.name)}</small><h3>Nueva vigencia tarifaria</h3><p>El importe anterior se conserva en el historial.</p></div><button type="button" data-tm-close>×</button></header><div class="tm-modal-body"><input type="hidden" name="toll_id" value="${row.toll_id}"><div class="tm-form-grid"><label><span>Categoría *</span><select name="vehicle_category">${Object.entries(CATEGORY).map(([key,label])=>`<option value="${key}">${esc(label)}</option>`).join('')}</select></label><label><span>Modalidad *</span><select name="payment_method">${Object.entries(PAYMENT).map(([key,label])=>`<option value="${key}">${esc(label)}</option>`).join('')}</select></label><label><span>Importe *</span><input name="amount" required type="number" min="0" step="0.01"></label><label><span>Moneda *</span><input name="currency" required maxlength="3" value="ARS"></label><label><span>Vigente desde *</span><input name="valid_from" required type="date" value="${today()}"></label><label><span>Vigente hasta</span><input name="valid_until" type="date"></label><label class="span-two"><span>Notas</span><textarea name="notes"></textarea></label></div></div><footer><button type="button" class="btn btn-ghost" data-tm-close>Cancelar</button><button type="submit" class="btn btn-primary">Publicar vigencia</button></footer></form>`);
}
function openHistory(tollId){const row=STATE.rows.find(item=>String(item.toll_id)===String(tollId));if(!row)return;const rates=[...(row.rates||[])].sort((a,b)=>String(b.valid_from).localeCompare(String(a.valid_from)));openModal(`<div><header><div><small>${esc(row.code)}</small><h3>Historial de ${esc(row.name)}</h3></div><button type="button" data-tm-close>×</button></header><div class="tm-modal-body"><div class="tm-history">${rates.length?rates.map(rate=>`<article class="${rate.is_current?'current':''}"><div><b>${money(rate.amount,rate.currency)}</b><span>${esc(CATEGORY[rate.vehicle_category]||rate.vehicle_category)} · ${esc(PAYMENT[rate.payment_method]||rate.payment_method)}</span></div><small>${esc(rate.valid_from)} → ${esc(rate.valid_until||'sin fecha de fin')}</small></article>`).join(''):'<p>Sin vigencias registradas.</p>'}</div></div><footer><button type="button" class="btn btn-ghost" data-tm-close>Cerrar</button></footer></div>`);}
function formPayload(form){const data=new FormData(form),payload={};for(const[key,value]of data.entries())payload[key]=typeof value==='string'?value.trim():value;if(form.dataset.tmForm==='location')payload.is_active=form.elements.is_active.checked;return payload;}
async function handleSubmit(event){
 const form=event.target.closest('[data-tm-form]');if(!form)return;event.preventDefault();const submit=event.submitter;submit.disabled=true;
 try{const payload=formPayload(form),rpc=form.dataset.tmForm==='location'?'save_toll_location':'save_toll_rate';if(payload.currency)payload.currency=payload.currency.toUpperCase();const{error}=await db().rpc(rpc,{p_payload:payload});if(error)throw error;closeModal();notify(form.dataset.tmForm==='location'?'Peaje guardado.':'Nueva vigencia registrada.','success');await load();window.OperatorServiceEdit?.state&&(window.OperatorServiceEdit.state.catalog=[]);}
 catch(error){notify(error.message||'No se pudo guardar.','error');}
 finally{if(submit?.isConnected)submit.disabled=false;}
}
function init(){loadCss();inject();let attempts=0;const timer=setInterval(()=>{applyRole();if(hookNavigation()&&canRead()&&db()){clearInterval(timer);}else if(++attempts>120)clearInterval(timer);},250);}
window.AuxiliosTolls={state:STATE,load,openLocation,openRate,openHistory};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();

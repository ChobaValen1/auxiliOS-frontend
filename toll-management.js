/* AuxiliOS · Peajes y Adicionales · sin ownership de navegación */
(()=>{'use strict';
const ID='toll-management';
if(window.AuxiliosTolls)return;

const STATE={rows:[],loading:false,editingId:null,section:'tolls',modal:null};
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

function loadCss(){
 if(document.getElementById(`${ID}-css`))return;
 const link=document.createElement('link');link.id=`${ID}-css`;link.rel='stylesheet';link.href='/toll-management.css';document.head.appendChild(link);
}

function inject(){
 if(!document.getElementById('screen-peajes')){
  document.querySelector('.content')?.insertAdjacentHTML('beforeend',`<div class="screen" id="screen-peajes">
   <div class="tm-head"><div><div class="tm-eyebrow">Configuración operativa</div><h2>Peajes y Adicionales</h2><p>Alta, consulta y mantenimiento de conceptos complementarios del servicio.</p></div><button type="button" class="btn btn-ghost" data-tm-refresh>↻ Actualizar</button></div>
   <div class="tm-tabs" role="tablist"><button type="button" class="active" data-tm-section="tolls">Peajes</button><button type="button" data-tm-section="additionals">Adicionales <small>Próxima configuración</small></button></div>
   <section id="tm-section-tolls" class="tm-section">
    <div class="tm-workspace">
     <aside class="tm-entry-card tm-admin">
      <div class="tm-card-head"><div><small>Alta y edición</small><h3 id="tm-form-title">Nuevo peaje</h3><p>Nombre e importe son obligatorios. La dirección puede completarse después.</p></div></div>
      <form id="tm-simple-form" autocomplete="off">
       <input type="hidden" name="toll_id">
       <label><span>Nombre del peaje *</span><input name="name" required maxlength="140" placeholder="Ej: Peaje Hudson"></label>
       <label><span>Dirección</span><input name="address" maxlength="240" placeholder="Opcional"></label>
       <label><span>Importe *</span><div class="tm-money-input"><span>$</span><input name="amount" required type="number" min="0" step="0.01" placeholder="0"></div></label>
       <div class="tm-entry-note">Al modificar el importe, AuxiliOS conserva los valores anteriores en el historial.</div>
       <div class="tm-form-actions"><button type="button" class="btn btn-ghost" data-tm-cancel hidden>Cancelar edición</button><button type="submit" class="btn btn-primary" data-tm-save>Guardar peaje</button></div>
      </form>
     </aside>
     <section class="tm-list-card">
      <div class="tm-list-head"><div><small>Registro completo</small><h3>Todos los peajes cargados</h3><p>Incluye peajes activos y archivados.</p></div><div class="tm-list-tools"><input id="tm-query" class="form-input" placeholder="Buscar peaje o dirección"></div></div>
      <div class="tm-summary" id="tm-summary"></div>
      <div class="tm-table-wrap"><table class="tm-table"><thead><tr><th>Peaje</th><th>Dirección</th><th>Importe actual</th><th>Historial</th><th>Estado</th><th class="tm-admin">Acciones</th></tr></thead><tbody id="tm-body"><tr><td colspan="6">Cargando…</td></tr></tbody></table></div>
     </section>
    </div>
   </section>
   <section id="tm-section-additionals" class="tm-section" hidden>
    <div class="tm-additionals-placeholder"><span>＋</span><h3>Adicionales</h3><p>Este espacio queda reservado para configurar excedentes y otros adicionales en la próxima etapa.</p></div>
   </section>
  </div>`);
 }

 if(!STATE.modal){
  const modal=document.createElement('div');modal.id='tm-modal';modal.className='tm-backdrop';modal.hidden=true;modal.setAttribute('aria-hidden','true');
  modal.addEventListener('click',event=>{if(event.target===modal||event.target.closest('[data-tm-close]'))closeModal();});
  document.body.appendChild(modal);STATE.modal=modal;
 }
 bind();applyRole();
}

function applyRole(){
 document.querySelectorAll('.tm-admin').forEach(node=>node.style.display=canManage()?'':'none');
}

function bind(){
 if(document.documentElement.dataset.tmBound==='1')return;
 document.documentElement.dataset.tmBound='1';
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-tm-refresh]'))load();
  const section=event.target.closest('[data-tm-section]');if(section)showSection(section.dataset.tmSection);
  const edit=event.target.closest('[data-tm-edit]');if(edit)beginEdit(edit.dataset.tmEdit);
  const active=event.target.closest('[data-tm-active]');if(active)toggleActive(active.dataset.tmActive,active.dataset.active==='true');
  const history=event.target.closest('[data-tm-history]');if(history)openHistory(history.dataset.tmHistory);
  if(event.target.closest('[data-tm-cancel]'))resetForm();
 });
 document.addEventListener('input',event=>{if(event.target.id==='tm-query')render();});
 document.addEventListener('submit',event=>{if(event.target.id==='tm-simple-form')saveSimple(event);});
}

function hookNavigation(){
 if(window.__tmNavHook||typeof window.goTo!=='function')return false;
 const base=window.goTo;
 window.goTo=(name,...args)=>{
  if(name==='peajes'&&!canRead())return notify('Sin permiso para consultar Peajes y Adicionales.','error');
  const result=base(name,...args);if(name==='peajes')load();return result;
 };
 window.__tmNavHook=true;return true;
}

function showSection(section){
 STATE.section=section==='additionals'?'additionals':'tolls';
 document.querySelectorAll('[data-tm-section]').forEach(button=>button.classList.toggle('active',button.dataset.tmSection===STATE.section));
 const tolls=document.getElementById('tm-section-tolls'),additionals=document.getElementById('tm-section-additionals');
 if(tolls)tolls.hidden=STATE.section!=='tolls';
 if(additionals)additionals.hidden=STATE.section!=='additionals';
 if(STATE.section==='tolls'&&!STATE.rows.length)load();
}

async function load(){
 if(!canRead()||STATE.loading)return;
 STATE.loading=true;
 const body=document.getElementById('tm-body');if(body)body.innerHTML='<tr><td colspan="6">Cargando peajes…</td></tr>';
 try{
  const{data,error}=await db().rpc('list_toll_catalog',{p_as_of:today(),p_include_inactive:true});
  if(error)throw error;
  STATE.rows=Array.isArray(data)?data:[];render();
 }catch(error){
  notify(error.message||'No se pudieron cargar los peajes.','error');
  if(body)body.innerHTML='<tr><td colspan="6">No se pudieron cargar los peajes.</td></tr>';
 }finally{STATE.loading=false;}
}

function rateFor(row){
 const rates=Array.isArray(row.rates)?row.rates:[];
 const current=rates.filter(rate=>rate.is_current&&rate.is_active);
 return current.find(rate=>rate.vehicle_category==='light_2_axles'&&rate.payment_method==='any')
  ||current[0]
  ||[...rates].sort((a,b)=>String(b.valid_from||'').localeCompare(String(a.valid_from||'')))[0]
  ||null;
}

function filtered(){
 const query=(document.getElementById('tm-query')?.value||'').trim().toLowerCase();
 return STATE.rows.filter(row=>!query||`${row.name||''} ${row.road||''} ${row.code||''}`.toLowerCase().includes(query));
}

function render(){
 const rows=filtered(),body=document.getElementById('tm-body');if(!body)return;
 const active=STATE.rows.filter(row=>row.is_active).length,archived=STATE.rows.length-active;
 const summary=document.getElementById('tm-summary');if(summary)summary.textContent=`${rows.length} visibles · ${active} activos · ${archived} archivados · ${STATE.rows.length} históricos`;
 if(!rows.length){body.innerHTML='<tr><td colspan="6">No hay peajes para mostrar.</td></tr>';return;}
 body.innerHTML=rows.map(row=>{
  const rate=rateFor(row),history=(row.rates||[]).length;
  return`<tr class="${row.is_active?'':'archived'}"><td><b>${esc(row.name)}</b><small>${esc(row.code||'Código interno')}</small></td><td>${row.road?`<span>${esc(row.road)}</span>`:'<em>Sin dirección</em>'}</td><td>${rate?`<b class="tm-current-amount">${money(rate.amount,rate.currency||'ARS')}</b>`:'<em>Sin importe</em>'}</td><td><button type="button" class="tm-link" data-tm-history="${row.toll_id}">${history} valor${history===1?'':'es'}</button></td><td><span class="tm-state ${row.is_active?'active':'inactive'}">${row.is_active?'Activo':'Archivado'}</span></td><td class="tm-admin"><div class="tm-actions"><button type="button" data-tm-edit="${row.toll_id}">Editar</button><button type="button" class="${row.is_active?'danger':''}" data-tm-active="${row.toll_id}" data-active="${row.is_active?'false':'true'}">${row.is_active?'Eliminar':'Reactivar'}</button></div></td></tr>`;
 }).join('');
 applyRole();
}

function resetForm(){
 STATE.editingId=null;
 const form=document.getElementById('tm-simple-form');if(!form)return;
 form.reset();form.elements.toll_id.value='';
 const title=document.getElementById('tm-form-title');if(title)title.textContent='Nuevo peaje';
 const cancel=form.querySelector('[data-tm-cancel]');if(cancel)cancel.hidden=true;
 const save=form.querySelector('[data-tm-save]');if(save)save.textContent='Guardar peaje';
}

function beginEdit(id){
 if(!canManage())return notify('Solo administración puede editar peajes.','error');
 const row=STATE.rows.find(item=>String(item.toll_id)===String(id));if(!row)return;
 const rate=rateFor(row),form=document.getElementById('tm-simple-form');if(!form)return;
 STATE.editingId=row.toll_id;
 form.elements.toll_id.value=row.toll_id;
 form.elements.name.value=row.name||'';
 form.elements.address.value=row.road||'';
 form.elements.amount.value=rate?.amount??'';
 const title=document.getElementById('tm-form-title');if(title)title.textContent='Editar peaje';
 form.querySelector('[data-tm-cancel]').hidden=false;
 form.querySelector('[data-tm-save]').textContent='Guardar cambios';
 document.querySelector('.tm-entry-card')?.scrollIntoView({behavior:'smooth',block:'start'});
 form.elements.name.focus();
}

async function saveSimple(event){
 event.preventDefault();
 if(!canManage())return notify('Solo administración puede gestionar peajes.','error');
 const form=event.target,submit=event.submitter||form.querySelector('[data-tm-save]');
 const existing=STATE.rows.find(row=>String(row.toll_id)===String(form.elements.toll_id.value));
 const payload={
  toll_id:form.elements.toll_id.value||null,
  name:form.elements.name.value.trim(),
  address:form.elements.address.value.trim(),
  amount:form.elements.amount.value,
  is_active:existing?.is_active!==false
 };
 if(!payload.name)return notify('Completá el nombre del peaje.','warning');
 if(payload.amount===''||number(payload.amount)<0)return notify('Completá un importe válido.','warning');
 submit.disabled=true;
 try{
  const{error}=await db().rpc('save_simple_toll',{p_payload:payload});if(error)throw error;
  notify(payload.toll_id?'Peaje actualizado.':'Peaje creado.','success');
  resetForm();await load();
  if(window.OperatorServiceEdit?.state)window.OperatorServiceEdit.state.catalog=[];
 }catch(error){notify(error.message||'No se pudo guardar el peaje.','error');}
 finally{if(submit?.isConnected)submit.disabled=false;}
}

async function toggleActive(id,active){
 if(!canManage())return notify('Solo administración puede gestionar peajes.','error');
 const row=STATE.rows.find(item=>String(item.toll_id)===String(id));if(!row)return;
 const verb=active?'reactivar':'eliminar';
 if(!confirm(`¿${verb.charAt(0).toUpperCase()+verb.slice(1)} el peaje “${row.name}”?${active?'':' Permanecerá visible en el historial.'}`))return;
 try{
  const{error}=await db().rpc('set_simple_toll_active',{p_toll_id:id,p_active:active});if(error)throw error;
  notify(active?'Peaje reactivado.':'Peaje archivado.','success');
  if(STATE.editingId===id)resetForm();
  await load();
 }catch(error){notify(error.message||'No se pudo actualizar el peaje.','error');}
}

function openModal(html){
 STATE.modal.innerHTML=`<section class="tm-modal-shell">${html}</section>`;
 STATE.modal.hidden=false;STATE.modal.setAttribute('aria-hidden','false');
}
function closeModal(){if(!STATE.modal)return;STATE.modal.hidden=true;STATE.modal.setAttribute('aria-hidden','true');STATE.modal.innerHTML='';}

function openHistory(tollId){
 const row=STATE.rows.find(item=>String(item.toll_id)===String(tollId));if(!row)return;
 const rates=[...(row.rates||[])].sort((a,b)=>String(b.valid_from||'').localeCompare(String(a.valid_from||'')));
 openModal(`<div><header><div><small>Historial de importes</small><h3>${esc(row.name)}</h3><p>Los valores anteriores permanecen registrados.</p></div><button type="button" data-tm-close>×</button></header><div class="tm-modal-body"><div class="tm-history">${rates.length?rates.map(rate=>`<article class="${rate.is_current?'current':''}"><div><b>${money(rate.amount,rate.currency||'ARS')}</b><span>${rate.is_current?'Importe actual':'Importe anterior'}</span></div><small>${esc(rate.valid_from||'—')} → ${esc(rate.valid_until||'vigente')}</small></article>`).join(''):'<p>Sin importes registrados.</p>'}</div></div><footer><button type="button" class="btn btn-ghost" data-tm-close>Cerrar</button></footer></div>`);
}

function init(){
 loadCss();inject();let attempts=0;
 const timer=setInterval(()=>{applyRole();if(hookNavigation()&&canRead()&&db()){clearInterval(timer);}else if(++attempts>120)clearInterval(timer);},250);
}

window.AuxiliosTolls={state:STATE,load,beginEdit,openLocation:beginEdit,openHistory,resetForm,showSection};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();
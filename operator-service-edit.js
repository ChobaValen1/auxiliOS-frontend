/* AuxiliOS · Edición auditada de servicios abiertos */
(()=>{'use strict';
const ID='operator-service-edit';
const O=window.OperatorServices;
if(!O||window.OperatorServiceEdit)return;

const STATE={context:null,catalog:[],serviceId:null,modal:null,observer:null,saving:false};
const PROTECTED=new Set(['service_order_number','purchase_order_number','customer_name','customer_phone','customer_email','vehicle_plate','vehicle_make_model','origin','destination','estimated_distance_km']);
const CATEGORIES={
 light_2_axles:'Liviano · 2 ejes',
 heavy_3_axles:'Pesado · 3 ejes',
 heavy_4_axles:'Pesado · 4 ejes',
 heavy_5_axles:'Pesado · 5 ejes',
 heavy_6_plus_axles:'Pesado · 6 o más ejes',
 motorcycle:'Moto',
 other:'Otra categoría'
};
const PAYMENTS={any:'Tarifa general',cash:'Efectivo',electronic:'Electrónico',telepass:'TelePASE',manual:'Manual'};
const DIRECTION={both:'Ambos sentidos',inbound:'Ingreso',outbound:'Egreso',north:'Norte',south:'Sur',east:'Este',west:'Oeste',clockwise:'Horario',counterclockwise:'Antihorario',other:'Otro'};

const db=()=>typeof _db!=='undefined'?_db:null;
const profile=()=>typeof PERFIL_USUARIO!=='undefined'?PERFIL_USUARIO:null;
const role=()=>String(profile()?.roles?.name||profile()?.role||profile()?.role_name||'').toLowerCase();
const canEdit=()=>['administracion','operador'].includes(role());
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=value=>Number(String(value??'').replace(',','.'))||0;
const money=(value,currency='ARS')=>new Intl.NumberFormat('es-AR',{style:'currency',currency,maximumFractionDigits:2}).format(number(value));
const notify=(message,type='info')=>typeof window.toast==='function'?window.toast(message,type):console.log(message);
const localDate=value=>value?new Date(value).toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'}):new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});
const localDateTime=value=>{
 if(!value)return'';
 const date=new Date(value);
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const get=type=>parts.find(part=>part.type===type)?.value||'';
 return`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
};
const isoOrNull=value=>value?new Date(`${value}:00-03:00`).toISOString():null;

function loadCss(){
 if(document.getElementById(`${ID}-css`))return;
 const link=document.createElement('link');link.id=`${ID}-css`;link.rel='stylesheet';link.href='/operator-service-edit.css';document.head.appendChild(link);
}

function ensureModal(){
 if(STATE.modal)return;
 const modal=document.createElement('div');
 modal.id='ose-modal';modal.className='ose-backdrop';modal.hidden=true;modal.setAttribute('aria-hidden','true');
 modal.addEventListener('click',event=>{if(event.target===modal)closeEditor();});
 modal.addEventListener('click',handleClick);
 modal.addEventListener('change',handleChange);
 modal.addEventListener('input',event=>{if(event.target.matches('[data-ose-amount],[data-ose-quantity]'))renderTollTotal();});
 document.body.appendChild(modal);STATE.modal=modal;
}

function injectButton(){
 const shell=document.getElementById('os-detail-shell');
 if(!shell||!canEdit())return;
 const serviceId=O.S?.selected;
 const service=O.S?.services?.find(item=>String(item.service_id)===String(serviceId));
 if(!serviceId||['completed','cancelled'].includes(service?.status))return;
 const head=shell.querySelector('.os-detail-head');
 const close=head?.querySelector('.os-close');
 if(head&&!head.querySelector('.ose-edit-button')){
  const button=document.createElement('button');
  button.type='button';button.className='btn btn-ghost ose-edit-button';button.innerHTML='✎ Editar servicio';
  button.addEventListener('click',()=>openEditor(serviceId));
  close?head.insertBefore(button,close):head.appendChild(button);
 }
 const actions=shell.querySelector('.os-actions');
 if(actions&&!actions.querySelector('.ose-edit-footer')){
  const button=document.createElement('button');button.type='button';button.className='btn btn-primary ose-edit-footer';button.textContent='Editar servicio';button.addEventListener('click',()=>openEditor(serviceId));actions.insertBefore(button,actions.firstChild);
 }
}

async function loadContext(serviceId){
 const client=db();if(!client)throw new Error('La base de datos todavía no está disponible.');
 const {data:context,error:contextError}=await client.rpc('get_operator_service_edit_context',{p_service_id:serviceId});
 if(contextError)throw contextError;
 const asOf=localDate(context?.service?.scheduled_for);
 const {data:catalog,error:catalogError}=await client.rpc('list_toll_catalog',{p_as_of:asOf,p_include_inactive:false});
 if(catalogError)throw catalogError;
 STATE.context=context;STATE.catalog=Array.isArray(catalog)?catalog:[];STATE.serviceId=serviceId;
}

async function openEditor(serviceId){
 if(!canEdit())return notify('Sin permiso para editar servicios.','error');
 ensureModal();
 STATE.modal.hidden=false;STATE.modal.setAttribute('aria-hidden','false');STATE.modal.innerHTML='<section class="ose-shell loading"><div class="ose-loading">Cargando servicio…</div></section>';
 try{
  await loadContext(serviceId);
  if(!STATE.context?.locks?.can_edit){throw new Error('El servicio ya no admite modificaciones.');}
  renderEditor();
 }catch(error){closeEditor();notify(error.message||'No se pudo abrir la edición.','error');}
}

function closeEditor(){
 if(!STATE.modal)return;
 STATE.modal.hidden=true;STATE.modal.setAttribute('aria-hidden','true');STATE.modal.innerHTML='';
 STATE.context=null;STATE.catalog=[];STATE.serviceId=null;STATE.saving=false;
}

function field(name,label,value,type='text',options={}){
 const locked=STATE.context?.locks?.remito_locked&&PROTECTED.has(name);
 const attrs=[`name="${name}"`,options.required?'required':'',locked?'disabled':'',options.min!=null?`min="${options.min}"`:'',options.step?`step="${options.step}"`:'',options.placeholder?`placeholder="${esc(options.placeholder)}"`:''].filter(Boolean).join(' ');
 return`<label class="ose-field ${options.span||''}"><span>${esc(label)}${options.required?' *':''}</span><input type="${type}" value="${esc(value??'')}" ${attrs}>${locked?'<small>Bloqueado por remito firmado.</small>':''}</label>`;
}
function selectField(name,label,value,choices,options={}){
 const locked=STATE.context?.locks?.remito_locked&&PROTECTED.has(name);
 return`<label class="ose-field ${options.span||''}"><span>${esc(label)}</span><select name="${name}" ${locked?'disabled':''}>${Object.entries(choices).map(([key,text])=>`<option value="${esc(key)}" ${String(value)===String(key)?'selected':''}>${esc(text)}</option>`).join('')}</select>${locked?'<small>Bloqueado por remito firmado.</small>':''}</label>`;
}
function textareaField(name,label,value,options={}){return`<label class="ose-field ${options.span||'span-two'}"><span>${esc(label)}</span><textarea name="${name}" rows="${options.rows||3}">${esc(value||'')}</textarea></label>`;}

function renderEditor(){
 const {service:s,locks}=STATE.context;
 const remitoNotice=locks.remito_locked?'<div class="ose-notice danger"><b>Remito bloqueado</b><span>Ya está firmado o cerrado. Solo pueden ajustarse prioridad, horarios y notas internas.</span></div>':'';
 const reasonNotice=locks.requires_reason?'<div class="ose-notice warning"><b>Viaje iniciado</b><span>Las correcciones de cliente, vehículo, prestación o recorrido requieren un motivo.</span></div>':'';
 STATE.modal.innerHTML=`<form class="ose-shell" id="ose-form">
  <header class="ose-head"><div><small>Servicio ${esc(s.service_number)}</small><h3>Editar servicio abierto</h3><p>${esc(s.company_name||'Prestadora')} · ${esc(s.concept_name||'Servicio')}</p></div><button type="button" class="ose-close" data-ose-close>×</button></header>
  <div class="ose-body">${remitoNotice}${reasonNotice}
   <section class="ose-section"><div class="ose-section-title"><div><h4>Identificación y tiempos</h4><p>El número interno, el estado y la asignación se mantienen fuera de esta edición.</p></div></div><div class="ose-grid">
    ${field('service_order_number','N° de prestación',s.service_order_number)}
    ${field('purchase_order_number','Orden de compra',s.purchase_order_number)}
    ${field('scheduled_for','Fecha y hora programada',localDateTime(s.scheduled_for),'datetime-local')}
    ${field('estimated_arrival_at','ETA',localDateTime(s.estimated_arrival_at),'datetime-local')}
    ${field('estimated_finish_at','Fin estimado',localDateTime(s.estimated_finish_at),'datetime-local')}
    ${field('granted_delay_minutes','Demora concedida',s.granted_delay_minutes||0,'number',{min:0,step:'1'})}
    ${selectField('priority','Prioridad',s.priority,{normal:'Normal',urgent:'Urgente',critical:'Crítica'})}
    ${selectField('logistics_type','Logística',s.logistics_type,{own:'Propia',third_party:'Tercerizada'})}
   </div></section>
   <section class="ose-section"><div class="ose-section-title"><div><h4>Cliente y vehículo</h4><p>Estos datos también se sincronizan con el viaje y con el remito mientras siga editable.</p></div></div><div class="ose-grid">
    ${field('customer_name','Cliente',s.customer_name)}
    ${field('customer_phone','Teléfono',s.customer_phone,'tel')}
    ${field('customer_email','Correo',s.customer_email,'email')}
    ${field('vehicle_plate','Patente',s.vehicle_plate)}
    ${field('vehicle_make_model','Marca y modelo',s.vehicle_make_model,'text',{span:'span-two'})}
   </div></section>
   <section class="ose-section"><div class="ose-section-title"><div><h4>Recorrido</h4><p>Origen y destino se actualizan en la operación activa cuando corresponde.</p></div></div><div class="ose-grid">
    ${field('origin','Origen',s.origin,'text',{required:true,span:'span-two'})}
    ${field('destination','Destino',s.destination,'text',{required:true,span:'span-two'})}
    ${field('estimated_distance_km','Kilómetros estimados',s.estimated_distance_km||0,'number',{min:0,step:'0.1'})}
   </div></section>
   <section class="ose-section"><div class="ose-section-title"><div><h4>Peajes</h4><p>Los valores seleccionados quedan congelados en el servicio aunque el catálogo cambie después.</p></div><button type="button" class="ose-add" data-ose-add-toll ${locks.remito_locked?'disabled':''}>＋ Agregar peaje</button></div><div id="ose-toll-list" class="ose-toll-list"></div><div class="ose-toll-total"><span>Total cargado</span><b id="ose-toll-total">${money(0,s.currency||'ARS')}</b></div>${actualTollsHtml()}</section>
   <section class="ose-section"><div class="ose-section-title"><div><h4>Indicaciones</h4><p>Las notas internas no se muestran al cliente.</p></div></div><div class="ose-grid">
    ${textareaField('driver_instructions','Indicaciones para el chofer',s.driver_instructions)}
    ${textareaField('operator_notes','Notas internas',s.operator_notes)}
    ${locks.requires_reason?textareaField('change_reason','Motivo de la corrección','',{rows:2}):''}
   </div></section>
  </div>
  <footer class="ose-footer"><div class="ose-save-state" id="ose-save-state">Los cambios quedarán registrados en el historial.</div><div><button type="button" class="btn btn-ghost" data-ose-close>Cancelar</button><button type="submit" class="btn btn-primary">Guardar cambios</button></div></footer>
 </form>`;
 const form=document.getElementById('ose-form');form.addEventListener('submit',saveEditor);
 const editable=(STATE.context.tolls||[]).filter(t=>['planned','manual'].includes(t.source));
 if(editable.length)editable.forEach(toll=>addTollRow(toll));
 renderTollTotal();
}

function actualTollsHtml(){
 const actual=(STATE.context?.tolls||[]).filter(toll=>toll.source==='actual');
 if(!actual.length)return'';
 return`<div class="ose-actual"><b>Peajes reales informados</b>${actual.map(toll=>`<span>${esc(toll.toll_name_snapshot)} · ${money(toll.total_amount,toll.currency)}</span>`).join('')}</div>`;
}

function currentRates(location){return(location?.rates||[]).filter(rate=>rate.is_current&&rate.is_active);}
function catalogOptions(selected=''){
 return`<option value="">Carga manual</option>${STATE.catalog.map(location=>`<option value="${location.toll_id}" ${String(selected)===String(location.toll_id)?'selected':''}>${esc(location.code)} · ${esc(location.name)}${location.road?` · ${esc(location.road)}`:''}</option>`).join('')}`;
}
function rateOptions(location,selected=''){
 const rates=currentRates(location);
 return`<option value="">Importe manual</option>${rates.map(rate=>`<option value="${rate.toll_rate_id}" ${String(selected)===String(rate.toll_rate_id)?'selected':''}>${esc(CATEGORIES[rate.vehicle_category]||rate.vehicle_category)} · ${esc(PAYMENTS[rate.payment_method]||rate.payment_method)} · ${money(rate.amount,rate.currency)}</option>`).join('')}`;
}
function categoryOptions(selected='light_2_axles'){return Object.entries(CATEGORIES).map(([key,label])=>`<option value="${key}" ${selected===key?'selected':''}>${esc(label)}</option>`).join('');}
function paymentOptions(selected='any'){return Object.entries(PAYMENTS).map(([key,label])=>`<option value="${key}" ${selected===key?'selected':''}>${esc(label)}</option>`).join('');}

function addTollRow(toll={}){
 const list=document.getElementById('ose-toll-list');if(!list)return;
 const location=STATE.catalog.find(item=>String(item.toll_id)===String(toll.toll_id));
 const row=document.createElement('article');row.className='ose-toll-row';row.dataset.oseToll='1';
 row.innerHTML=`<div class="ose-toll-row-head"><b>Peaje</b><button type="button" data-ose-remove-toll>Eliminar</button></div><div class="ose-toll-grid">
  <label><span>Catálogo</span><select data-ose-toll-location>${catalogOptions(toll.toll_id)}</select></label>
  <label><span>Tarifa vigente</span><select data-ose-toll-rate>${rateOptions(location,toll.toll_rate_id)}</select></label>
  <label><span>Nombre manual</span><input data-ose-toll-name value="${esc(toll.toll_name_snapshot||'')}" ${location?'disabled':''}></label>
  <label><span>Categoría</span><select data-ose-category>${categoryOptions(toll.vehicle_category||'light_2_axles')}</select></label>
  <label><span>Modalidad</span><select data-ose-payment>${paymentOptions(toll.payment_method||'any')}</select></label>
  <label><span>Cantidad</span><input type="number" min="1" step="1" data-ose-quantity value="${esc(toll.quantity||1)}"></label>
  <label><span>Importe unitario</span><input type="number" min="0" step="0.01" data-ose-amount value="${esc(toll.unit_amount??'')}"></label>
  <label><span>Moneda</span><input maxlength="3" data-ose-currency value="${esc(toll.currency||'ARS')}"></label>
  <label class="span-two"><span>Observación</span><input data-ose-toll-notes value="${esc(toll.notes||'')}"></label>
 </div>`;
 list.appendChild(row);
 if(!toll.unit_amount&&location){applyRate(row,location,currentRates(location)[0]);}
 renderTollTotal();
}

function handleClick(event){
 if(event.target.closest('[data-ose-close]'))return closeEditor();
 if(event.target.closest('[data-ose-add-toll]'))return addTollRow();
 const remove=event.target.closest('[data-ose-remove-toll]');if(remove){remove.closest('[data-ose-toll]')?.remove();renderTollTotal();}
}
function handleChange(event){
 const row=event.target.closest('[data-ose-toll]');if(!row)return;
 if(event.target.matches('[data-ose-toll-location]')){
  const location=STATE.catalog.find(item=>String(item.toll_id)===String(event.target.value));
  const rateSelect=row.querySelector('[data-ose-toll-rate]');rateSelect.innerHTML=rateOptions(location);
  const name=row.querySelector('[data-ose-toll-name]');name.disabled=Boolean(location);name.value=location?.name||name.value;
  if(location){applyRate(row,location,currentRates(location)[0]);}
 }
 if(event.target.matches('[data-ose-toll-rate]')){
  const location=STATE.catalog.find(item=>String(item.toll_id)===String(row.querySelector('[data-ose-toll-location]').value));
  const rate=location?.rates?.find(item=>String(item.toll_rate_id)===String(event.target.value));applyRate(row,location,rate);
 }
}
function applyRate(row,location,rate){
 if(location){row.querySelector('[data-ose-toll-name]').value=location.name||'';}
 if(rate){
  row.querySelector('[data-ose-category]').value=rate.vehicle_category;
  row.querySelector('[data-ose-payment]').value=rate.payment_method;
  row.querySelector('[data-ose-amount]').value=rate.amount;
  row.querySelector('[data-ose-currency]').value=rate.currency;
  row.querySelector('[data-ose-toll-rate]').value=rate.toll_rate_id;
 }
 renderTollTotal();
}
function renderTollTotal(){
 const total=[...document.querySelectorAll('#ose-toll-list [data-ose-toll]')].reduce((sum,row)=>sum+number(row.querySelector('[data-ose-amount]')?.value)*Math.max(1,number(row.querySelector('[data-ose-quantity]')?.value)),0);
 const node=document.getElementById('ose-toll-total');if(node)node.textContent=money(total,STATE.context?.service?.currency||'ARS');
}

function collectTolls(){
 return[...document.querySelectorAll('#ose-toll-list [data-ose-toll]')].map(row=>{
  const tollId=row.querySelector('[data-ose-toll-location]').value||null;
  const rateId=row.querySelector('[data-ose-toll-rate]').value||null;
  const name=row.querySelector('[data-ose-toll-name]').value.trim();
  if(!tollId&&!name)throw new Error('Completá el nombre del peaje manual.');
  return{
   toll_id:tollId,
   toll_rate_id:rateId,
   toll_name:name||null,
   vehicle_category:row.querySelector('[data-ose-category]').value,
   payment_method:row.querySelector('[data-ose-payment]').value,
   quantity:Math.max(1,number(row.querySelector('[data-ose-quantity]').value)),
   unit_amount:Math.max(0,number(row.querySelector('[data-ose-amount]').value)),
   currency:(row.querySelector('[data-ose-currency]').value.trim()||'ARS').toUpperCase(),
   source:tollId?'planned':'manual',
   notes:row.querySelector('[data-ose-toll-notes]').value.trim()||null
  };
 });
}
function formValue(form,name){const element=form.elements.namedItem(name);return element?.disabled?undefined:element?.value;}
function buildPayload(form){
 const payload={};
 const stringFields=['service_order_number','purchase_order_number','customer_name','customer_phone','customer_email','vehicle_plate','vehicle_make_model','origin','destination','operator_notes','driver_instructions'];
 stringFields.forEach(name=>{const value=formValue(form,name);if(value!==undefined)payload[name]=value.trim()||null;});
 const dateFields=['scheduled_for','estimated_arrival_at','estimated_finish_at'];
 dateFields.forEach(name=>{const value=formValue(form,name);if(value!==undefined)payload[name]=isoOrNull(value);});
 ['priority','logistics_type'].forEach(name=>{const value=formValue(form,name);if(value!==undefined)payload[name]=value;});
 const delay=formValue(form,'granted_delay_minutes');if(delay!==undefined)payload.granted_delay_minutes=Math.max(0,number(delay));
 const distance=formValue(form,'estimated_distance_km');if(distance!==undefined)payload.estimated_distance_km=Math.max(0,number(distance));
 if(!STATE.context?.locks?.remito_locked)payload.tolls=collectTolls();
 return payload;
}

async function saveEditor(event){
 event.preventDefault();if(STATE.saving)return;
 const form=event.currentTarget;const submit=event.submitter;
 try{
  const payload=buildPayload(form);
  if(!payload.origin&&Object.hasOwn(payload,'origin'))throw new Error('El origen es obligatorio.');
  if(!payload.destination&&Object.hasOwn(payload,'destination'))throw new Error('El destino es obligatorio.');
  const reason=form.elements.namedItem('change_reason')?.value.trim()||null;
  STATE.saving=true;if(submit){submit.disabled=true;submit.textContent='Guardando…';}
  const {data,error}=await db().rpc('update_operator_service',{p_service_id:STATE.serviceId,p_payload:payload,p_reason:reason});
  if(error)throw error;
  const serviceId=STATE.serviceId;closeEditor();
  notify(data?.no_changes?'No había cambios para guardar.':'Servicio actualizado y auditado.','success');
  await O.loadServices?.();
  await O.openDetail?.(serviceId);
  window.AuxiliosPhase3?.loadQueue?.();
 }catch(error){notify(error.message||'No se pudo guardar el servicio.','error');}
 finally{STATE.saving=false;if(submit?.isConnected){submit.disabled=false;submit.textContent='Guardar cambios';}}
}

function watch(){
 const shell=document.getElementById('os-detail-shell');
 if(shell&&!STATE.observer){STATE.observer=new MutationObserver(injectButton);STATE.observer.observe(shell,{childList:true,subtree:true});}
 injectButton();
}
function init(){loadCss();ensureModal();let attempts=0;const timer=setInterval(()=>{if(document.getElementById('os-detail-shell')){clearInterval(timer);watch();}else if(++attempts>120)clearInterval(timer);},250);}

window.OperatorServiceEdit={state:STATE,open:openEditor,close:closeEditor,refreshButton:injectButton};
window.editarServicioOperador=openEditor;
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();

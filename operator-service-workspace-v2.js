/* AuxiliOS · Workspace de servicio V2 · Beta privada */
(()=>{'use strict';
const ID='operator-service-workspace-v2';
let originalOpen=null;
let observer=null;
let painting=false;
let conceptPickerOpen=false;
let panels={tolls:false,extras:false};
let lastSignature='';
let submitAttempted=false;
const touched=new Set();

const featureEnabled=()=>Boolean(window.AuxiliosFeatures?.flags?.service_workspace_v2);
const O=()=>window.OperatorServices;
const S=()=>O()?.S;
const W=()=>S()?.wizard||null;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const num=value=>Number.isFinite(Number(value))?Number(value):0;
const selected=(a,b)=>String(a??'')===String(b??'')?'selected':'';
const money=(value,currency='ARS')=>new Intl.NumberFormat('es-AR',{style:'currency',currency:currency||'ARS',maximumFractionDigits:2}).format(num(value));
const notify=(message,type='info')=>typeof window.toast==='function'?window.toast(message,type):console.log(message);

function normalize(){
 const w=W();
 if(!w)return null;
 const d=w.data;
 d.logistics_type??='own';
 d.estimated_asphalt_km??=num(d.estimated_distance_km);
 d.estimated_gravel_km??=0;
 d.estimated_finish_at??='';
 d.granted_delay_minutes??=0;
 d.secondary_items??={};
 if(d.vehicle_make===undefined){
  const pieces=String(d.vehicle_make_model||'').trim().split(/\s+/).filter(Boolean);
  d.vehicle_make=pieces.shift()||'';
  d.vehicle_model=pieces.join(' ');
 }
 return w;
}

function localParts(value){
 const raw=String(value||'');
 if(!raw)return{date:'',time:''};
 if(raw.includes('T')){
  const [date,time='']=raw.split('T');
  return{date,time:time.slice(0,5)};
 }
 const date=new Date(raw);
 if(Number.isNaN(date.getTime()))return{date:'',time:''};
 const pad=n=>String(n).padStart(2,'0');
 return{
  date:`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`,
  time:`${pad(date.getHours())}:${pad(date.getMinutes())}`
 };
}

function signature(){
 const w=W();
 if(!w)return'';
 return JSON.stringify({
  data:w.data,
  card:w.card?.price_card_id||w.card?.name||'',
  contract:w.contract?.contract_id||w.contract?.name||'',
  quote:w.quote?.company_estimated_total||'',
  items:(w.items||[]).length,
  links:(w.links||[]).length,
  busy:w.busy,
  error:w.error
 });
}

function resolvedItems(){
 const w=W();
 if(!w)return[];
 const branch=w.data.branch_id;
 const map=new Map();
 (w.items||[]).forEach(item=>{
  const itemBranch=item.billing_base_id||item.branch_id||'';
  if(itemBranch&&branch&&String(itemBranch)!==String(branch))return;
  const existing=map.get(String(item.concept_id));
  if(!existing||(!existing.branch_id&&itemBranch))map.set(String(item.concept_id),item);
 });
 return [...map.values()];
}

function primaryItems(){
 return resolvedItems().filter(item=>item.is_active&&item.can_be_primary);
}

function secondaryItems(){
 const w=W();
 if(!w)return[];
 const all=resolvedItems().filter(item=>item.is_active&&item.can_be_secondary&&String(item.concept_id)!==String(w.data.primary_concept_id));
 const links=(w.links||[]).filter(link=>String(link.primary_concept_id)===String(w.data.primary_concept_id)&&link.is_enabled!==false);
 return links.length?all.filter(item=>links.some(link=>String(link.secondary_concept_id)===String(item.concept_id))):all;
}

function conceptName(item){
 return S()?.concepts?.find(concept=>String(concept.concept_id)===String(item.concept_id))?.name||item.service_name||'Concepto';
}

function secondaryPrice(item){
 const w=W();
 const link=(w?.links||[]).find(candidate=>String(candidate.primary_concept_id)===String(w?.data?.primary_concept_id)&&String(candidate.secondary_concept_id)===String(item.concept_id));
 return link?.price_override??item.secondary_price??item.primary_price??item.unit_price??0;
}

function validationErrors(){
 const w=normalize();
 if(!w)return[];
 const d=w.data;
 const scheduled=localParts(d.scheduled_for);
 const errors=[];
 const push=(key,message)=>errors.push({key,message});
 if(!scheduled.date)push('scheduled_date','Completá la fecha del servicio.');
 if(!scheduled.time)push('scheduled_time','Completá la hora del servicio.');
 if(!d.company_id)push('company','Seleccioná una prestadora.');
 else if(!w.card)push('company','La prestadora debe tener un tarifario vigente.');
 if(w.contract?.requires_service_order&&!String(d.service_order_number||'').trim())push('service_order','Completá el número de prestación.');
 if(w.contract?.requires_purchase_order&&!String(d.purchase_order_number||'').trim())push('purchase_order','Completá la orden de compra.');
 if((w.contract?.requires_billing_base||w.contract?.requires_branch)&&!d.branch_id)push('branch','Seleccioná la base operativa.');
 if(!d.primary_concept_id)push('primary','Seleccioná el tipo de servicio.');
 if(!String(d.customer_phone||'').trim())push('customer_phone','Completá el teléfono del cliente.');
 if(!String(d.origin||'').trim())push('origin','Completá el origen.');
 if(!String(d.destination||'').trim())push('destination','Completá el destino.');
 if(Boolean(d.assigned_driver_id)!==Boolean(d.assigned_truck_id))push('assignment','Chofer y móvil deben seleccionarse juntos.');
 return errors;
}

function errorMap(){
 return new Map(validationErrors().map(error=>[error.key,error.message]));
}

function fieldErrorMarkup(key){
 return`<small class="osv2-field-error" data-error-for="${esc(key)}" aria-live="polite"></small>`;
}

function validationSummaryMarkup(){
 const errors=validationErrors();
 if(!errors.length)return'<span id="osv2-validation-summary" class="osv2-validation-summary ready">✓ Datos obligatorios completos</span>';
 return`<span id="osv2-validation-summary" class="osv2-validation-summary ${submitAttempted?'invalid':'pending'}">⚠ Faltan ${errors.length} ${errors.length===1?'dato obligatorio':'datos obligatorios'}</span>`;
}

function updateValidationUI(){
 const errors=errorMap();
 document.querySelectorAll('.osv2-workspace [data-field]').forEach(container=>{
  const key=container.dataset.field;
  const message=errors.get(key)||'';
  const reveal=Boolean(message)&&(submitAttempted||touched.has(key));
  container.classList.toggle('has-error',reveal);
  const target=container.querySelector(`[data-error-for="${key}"]`);
  if(target){target.textContent=reveal?message:'';target.hidden=!reveal;}
 });
 const summary=document.getElementById('osv2-validation-summary');
 if(summary){
  const count=errors.size;
  summary.className=`osv2-validation-summary ${count?(submitAttempted?'invalid':'pending'):'ready'}`;
  summary.textContent=count?`⚠ Faltan ${count} ${count===1?'dato obligatorio':'datos obligatorios'}`:'✓ Datos obligatorios completos';
 }
 const primaryButton=document.querySelector('.osv2-footer button.primary');
 if(primaryButton){
  const assigned=Boolean(W()?.data?.assigned_driver_id&&W()?.data?.assigned_truck_id);
  primaryButton.classList.toggle('assigned',assigned);
 }
}

function markTouched(key){
 touched.add(key);
 updateValidationUI();
}

function focusFirstError(errors){
 const first=errors[0];
 if(!first)return;
 const container=document.querySelector(`.osv2-workspace [data-field="${first.key}"]`);
 const control=container?.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])');
 control?.focus({preventScroll:false});
 container?.scrollIntoView({block:'nearest',behavior:'smooth'});
}

function conceptRows(){
 const w=W();
 const selectedIds=Object.keys(w?.data?.secondary_items||{});
 if(!selectedIds.length)return'<div class="osv2-empty compact">Todavía no agregaste conceptos adicionales.</div>';
 const items=secondaryItems();
 return selectedIds.map(id=>{
  const item=items.find(candidate=>String(candidate.concept_id)===String(id))||resolvedItems().find(candidate=>String(candidate.concept_id)===String(id));
  if(!item)return'';
  return`<div class="osv2-concept-row"><div><b>${esc(conceptName(item))}</b><small>${esc(item.pricing_unit||'unidad')} · ${money(secondaryPrice(item),w.card?.currency||'ARS')}</small></div><input aria-label="Cantidad" type="number" min="0.01" step="0.01" value="${esc(w.data.secondary_items[id])}" onchange="osv2SecondaryQuantity('${esc(id)}',this.value)"><button type="button" title="Eliminar concepto" onclick="osv2RemoveSecondary('${esc(id)}')">×</button></div>`;
 }).join('');
}

function conceptPicker(w){
 if(!conceptPickerOpen)return'';
 let body='';
 if(!w.data.company_id)body='<div class="osv2-table-state warning">Seleccioná una prestadora para cargar sus conceptos.</div>';
 else if(!w.card)body='<div class="osv2-table-state warning">La prestadora no tiene un tarifario vigente.</div>';
 else if(!w.data.primary_concept_id)body='<div class="osv2-table-state warning">Seleccioná primero el tipo de servicio principal.</div>';
 else{
  const available=secondaryItems().filter(item=>!Object.hasOwn(w.data.secondary_items||{},item.concept_id));
  body=available.length?`<div class="osv2-concept-picker-table" role="table" aria-label="Conceptos disponibles">
   <div class="head" role="row"><span>Concepto</span><span>Unidad</span><span>Precio</span><span>Acción</span></div>
   ${available.map(item=>`<div class="row" role="row"><span><b>${esc(conceptName(item))}</b></span><span>${esc(item.pricing_unit||'unidad')}</span><span>${money(secondaryPrice(item),w.card?.currency||'ARS')}</span><span><button type="button" onclick="osv2AddSecondary('${esc(item.concept_id)}')">Agregar</button></span></div>`).join('')}
  </div>`:'<div class="osv2-table-state">No quedan conceptos disponibles para agregar.</div>';
 }
 return`<section class="osv2-concept-picker"><div class="osv2-panel-head"><div><b>Conceptos disponibles</b><small>Servicios precargados en el tarifario vigente de la prestadora.</small></div><button type="button" onclick="osv2ToggleConceptPicker()" aria-label="Cerrar tabla">×</button></div>${body}</section>`;
}

function renderLocation(kind,title,value){
 const isOrigin=kind==='origin';
 return`<section class="osv2-location ${kind}" data-field="${kind}">
  <div class="osv2-section-label"><span></span><b>${title}</b></div>
  <label><span>Dirección *</span><textarea rows="2" placeholder="Buscar dirección..." oninput="osv2Input('${kind}',this.value)" onblur="osv2Blur('${kind}')">${esc(value)}</textarea></label>
  ${fieldErrorMarkup(kind)}
  <label class="osv2-coordinates"><span>Coordenadas</span><input value="" placeholder="Se completarán con Maps" disabled></label>
  <small>${isOrigin?'Punto de asistencia o retiro.':'Punto de entrega o taller.'}</small>
 </section>`;
}

function complementaryPanel(type,title,description,columns){
 const open=panels[type];
 if(!open)return'';
 return`<section class="osv2-dynamic-panel open ${type}">
  <div class="osv2-panel-head"><div><b>${title}</b><small>${description}</small></div><button type="button" onclick="osv2TogglePanel('${type}')" aria-label="Cerrar ${esc(title)}">×</button></div>
  <div class="osv2-placeholder-table"><div>${columns.map(column=>`<span>${esc(column)}</span>`).join('')}<span></span></div><p>No hay registros agregados.</p></div>
 </section>`;
}

function renderQuickColumn(w){
 const d=w.data;
 const quote=w.quote;
 const anyOpen=panels.tolls||panels.extras;
 return`<div class="osv2-quick-actions">
   <button type="button" class="${panels.tolls?'active':''}" onclick="osv2TogglePanel('tolls')">＋ Agregar Peaje</button>
   <button type="button" class="${panels.extras?'active':''}" onclick="osv2TogglePanel('extras')">＋ Agregar Excedente</button>
  </div>
  <div class="osv2-complementary-stack">
   ${!anyOpen?'<div class="osv2-empty complementary"><b>Acciones complementarias</b><span>Peajes y excedentes pueden abrirse y utilizarse al mismo tiempo.</span></div>':''}
   ${complementaryPanel('tolls','Peajes del servicio','Nombre, dirección opcional e importe.',['Nombre del peaje','Importe'])}
   ${complementaryPanel('extras','Excedentes','Conceptos adicionales fuera del servicio base.',['Concepto','Importe'])}
  </div>
  <section class="osv2-summary-card">
   <div><span>Conceptos</span><b>${quote?money(num(quote.company_estimated_total)-num(d.toll_estimate),quote.currency):'Pendiente'}</b></div>
   <div><span>Peajes</span><b>${money(d.toll_estimate,w.card?.currency||'ARS')}</b></div>
   <div><span>Excedentes</span><b>${money(0,w.card?.currency||'ARS')}</b></div>
   <div class="total"><span>Total estimado</span><b>${quote?money(quote.company_estimated_total,quote.currency):'Pendiente'}</b></div>
   <button type="button" onclick="osv2Calculate()" ${!w.card||!d.primary_concept_id||w.busy?'disabled':''}>${w.busy?'Calculando…':'Recalcular cotización'}</button>
  </section>`;
}

function render(){
 const w=normalize();
 const shell=document.getElementById('os-wizard-shell');
 if(!featureEnabled()||!w||!shell||painting)return;
 painting=true;
 try{
  const d=w.data;
  const scheduled=localParts(d.scheduled_for);
  const arrival=localParts(d.estimated_arrival_at);
  const finish=localParts(d.estimated_finish_at);
  const drivers=S()?.drivers||[];
  const trucks=S()?.trucks||[];
  const primary=primaryItems();
  const companyBranches=(S()?.branches||[]).filter(branch=>String(branch.company_id)===String(d.company_id));
  const baseRequired=Boolean(w.contract?.requires_billing_base||w.contract?.requires_branch);
  shell.classList.add('osv2-shell','p3b-shell');
  shell.innerHTML=`<div class="p3b-create-root osv2-workspace">
   <header class="osv2-header">
    <div><span>Administración · Despacho</span><h2>Nuevo Servicio</h2></div>
    <button type="button" onclick="cerrarNuevoServicio()">← Volver</button>
   </header>
   ${w.error?`<div class="osv2-global-error">${esc(String(w.error).replace(/^.*PRESTACION_DUPLICADA:\s*/i,''))}</div>`:''}
   <main class="osv2-grid">
    <section class="osv2-column admin-column">
     <div class="osv2-inline-grid three top-fields">
      <label><span>Código</span><input value="Se genera automáticamente" disabled></label>
      <label data-field="scheduled_date"><span>Fecha *</span><input type="date" value="${esc(scheduled.date)}" onchange="osv2Schedule('date',this.value)" onblur="osv2Blur('scheduled_date')">${fieldErrorMarkup('scheduled_date')}</label>
      <label data-field="scheduled_time"><span>Hora *</span><input type="time" value="${esc(scheduled.time)}" onchange="osv2Schedule('time',this.value)" onblur="osv2Blur('scheduled_time')">${fieldErrorMarkup('scheduled_time')}</label>
      <label><span>Arribo</span><input type="time" value="${esc(arrival.time)}" onchange="osv2TimeField('estimated_arrival_at',this.value)"></label>
      <label><span>Fin</span><input type="time" value="${esc(finish.time)}" onchange="osv2TimeField('estimated_finish_at',this.value)"></label>
      <label><span>Demora</span><input type="number" min="0" step="1" value="${num(d.granted_delay_minutes)}" oninput="osv2Input('granted_delay_minutes',this.value)"></label>
     </div>
     <section class="osv2-card admin-card">
      <div class="osv2-inline-grid two">
       <label data-field="company"><span>Prestadora *</span><select onchange="osv2Company(this.value)" onblur="osv2Blur('company')"><option value="">Seleccionar</option>${(S()?.companies||[]).filter(company=>company.status==='active').map(company=>`<option value="${company.company_id}" ${selected(d.company_id,company.company_id)}>${esc(company.trade_name||company.legal_name)}${company.is_test?' · QA':''}</option>`).join('')}</select>${fieldErrorMarkup('company')}</label>
       <label data-field="branch"><span>Base Operativa${baseRequired?' *':''}</span><select onchange="osv2Branch(this.value)" onblur="osv2Blur('branch')" ${d.company_id?'':'disabled'}><option value="">Tarifa general</option>${companyBranches.map(branch=>`<option value="${branch.branch_id}" ${selected(d.branch_id,branch.branch_id)}>${esc(branch.name)}</option>`).join('')}</select>${fieldErrorMarkup('branch')}</label>
      </div>
      <div class="osv2-inline-grid two">
       <label data-field="service_order"><span>N° prestación${w.contract?.requires_service_order?' *':''}</span><input value="${esc(d.service_order_number||'')}" oninput="osv2Input('service_order_number',this.value,'service_order')" onblur="osv2Blur('service_order')">${fieldErrorMarkup('service_order')}</label>
       <label data-field="purchase_order"><span>Orden de compra${w.contract?.requires_purchase_order?' *':''}</span><input value="${esc(d.purchase_order_number||'')}" oninput="osv2Input('purchase_order_number',this.value,'purchase_order')" onblur="osv2Blur('purchase_order')">${fieldErrorMarkup('purchase_order')}</label>
      </div>
      <label data-field="primary"><span>Tipo de Servicio *</span><select onchange="osv2Primary(this.value)" onblur="osv2Blur('primary')" ${w.card?'':'disabled'}><option value="">Seleccionar Tipo</option>${primary.map(item=>`<option value="${item.concept_id}" ${selected(d.primary_concept_id,item.concept_id)}>${esc(conceptName(item))}</option>`).join('')}</select>${fieldErrorMarkup('primary')}</label>
      <div class="osv2-logistics"><span>Tipo de Logística</span><div><button type="button" class="${d.logistics_type==='own'?'active':''}" onclick="osv2StructuralSet('logistics_type','own')">● Propia</button><button type="button" class="${d.logistics_type==='third_party'?'active':''}" onclick="osv2StructuralSet('logistics_type','third_party')">● Tercerizada</button></div></div>
      <div class="osv2-inline-grid two assignment-grid" data-field="assignment">
       <label><span>Asignar Chofer</span><select onchange="osv2Select('assigned_driver_id',this.value,'assignment')"><option value="">Sin asignar</option>${drivers.map(driver=>`<option value="${driver.user_id}" ${selected(d.assigned_driver_id,driver.user_id)}>${esc(driver.full_name||driver.legajo)}${driver.is_test?' · QA':''}</option>`).join('')}</select></label>
       <label><span>Asignar Móvil</span><select onchange="osv2Select('assigned_truck_id',this.value,'assignment')"><option value="">Sin asignar</option>${trucks.filter(truck=>truck.status==='active').map(truck=>`<option value="${truck.truck_id}" ${selected(d.assigned_truck_id,truck.truck_id)}>${esc(truck.numero_interno||truck.plate)} · ${esc(truck.plate)}</option>`).join('')}</select></label>
       ${fieldErrorMarkup('assignment')}
      </div>
     </section>
     <section class="osv2-concepts-section">
      <div class="osv2-concepts-head"><div><b>Conceptos adicionales</b><small>Servicios habilitados por la prestadora</small></div><button type="button" class="osv2-add-concept-trigger ${conceptPickerOpen?'active':''}" onclick="osv2ToggleConceptPicker()">＋ Agregar Concepto</button></div>
      <div class="osv2-concepts-body"><div class="osv2-concepts-list">${conceptRows()}</div>${conceptPicker(w)}</div>
     </section>
    </section>

    <section class="osv2-column route-column">
     ${renderLocation('origin','Origen',d.origin)}
     ${renderLocation('destination','Destino',d.destination)}
     <section class="osv2-card vehicle-card">
      <div class="osv2-section-label neutral"><span></span><b>Vehículo del cliente</b></div>
      <div class="osv2-inline-grid three">
       <label><span>Marca</span><input value="${esc(d.vehicle_make)}" oninput="osv2VehicleInput('vehicle_make',this.value)"></label>
       <label><span>Modelo</span><input value="${esc(d.vehicle_model)}" oninput="osv2VehicleInput('vehicle_model',this.value)"></label>
       <label><span>Patente</span><input value="${esc(d.vehicle_plate)}" oninput="this.value=this.value.toUpperCase();osv2Input('vehicle_plate',this.value)"></label>
      </div>
      <div class="osv2-inline-grid two client-row">
       <label data-field="customer_phone"><span>Tel. Cliente *</span><input value="${esc(d.customer_phone)}" oninput="osv2Input('customer_phone',this.value)" onblur="osv2Blur('customer_phone')">${fieldErrorMarkup('customer_phone')}</label>
       <label><span>Cliente / Socio</span><input value="${esc(d.customer_name)}" oninput="osv2Input('customer_name',this.value)"></label>
      </div>
     </section>
     <section class="osv2-card distance-card">
      <div class="osv2-section-label neutral"><span></span><b>Kilómetros</b></div>
      <div class="osv2-inline-grid two">
       <label><span>KM Asfalto</span><input type="number" min="0" step="0.1" value="${num(d.estimated_asphalt_km)}" oninput="osv2DistanceInput('estimated_asphalt_km',this.value)"></label>
       <label><span>KM Ripio</span><input type="number" min="0" step="0.1" value="${num(d.estimated_gravel_km)}" oninput="osv2DistanceInput('estimated_gravel_km',this.value)"></label>
      </div>
     </section>
     <label class="osv2-observations"><span>Observaciones</span><textarea rows="4" placeholder="Detalles relevantes del servicio..." oninput="osv2Input('operator_notes',this.value)">${esc(d.operator_notes)}</textarea></label>
    </section>

    <section class="osv2-column actions-column">${renderQuickColumn(w)}</section>
   </main>
   <footer class="osv2-footer">
    <button type="button" class="ghost" onclick="cerrarNuevoServicio()">Volver</button>
    <div>${validationSummaryMarkup()}<span class="osv2-save-state">${w.draftSavedAt?'Borrador guardado':'Autoguardado activo'}</span><button type="button" class="secondary" onclick="guardarBorradorServicio()">Guardar y seguir</button><button type="button" class="primary" onclick="osv2Finish()" ${w.busy?'disabled':''}>${w.busy?'Procesando…':'Guardar y Finalizar'}</button></div>
   </footer>
  </div>`;
  lastSignature=signature();
  shell.closest('.modal-backdrop')?.classList.add('osv2-modal-backdrop');
  shell.dataset.osv2='1';
  updateValidationUI();
 }finally{
  painting=false;
 }
}

function setCore(key,value){
 if(typeof window.p3bSetServicio==='function')window.p3bSetServicio(key,value,false);
 else if(typeof window.osSetServicio==='function')window.osSetServicio(key,value);
 else if(W())W().data[key]=value;
}

function input(key,value,validationKey=key){
 setCore(key,value);
 if(submitAttempted||touched.has(validationKey))updateValidationUI();
}

function selectValue(key,value,validationKey=key){
 touched.add(validationKey);
 setCore(key,value);
 updateValidationUI();
}

function structuralSet(key,value){
 setCore(key,value);
 render();
}

function setSchedule(part,value){
 if(typeof window.p3bSetHorario==='function')window.p3bSetHorario(part,value);
 else{
  const w=normalize();
  const current=localParts(w.data.scheduled_for);
  w.data.scheduled_for=`${part==='date'?value:current.date}T${part==='time'?value:current.time}`;
 }
 touched.add(part==='date'?'scheduled_date':'scheduled_time');
 updateValidationUI();
}

function setTimeField(key,value){
 const w=normalize();
 const date=localParts(w.data.scheduled_for).date||new Date().toISOString().slice(0,10);
 setCore(key,value?`${date}T${value}`:'');
}

function setVehicleInput(key,value){
 if(typeof window.p3bSetVehiculo==='function')window.p3bSetVehiculo(key,value);
 else{
  const w=normalize();
  w.data[key]=value;
  setCore('vehicle_make_model',[w.data.vehicle_make,w.data.vehicle_model].filter(Boolean).join(' '));
 }
}

function setDistanceInput(key,value){
 const w=normalize();
 w.data[key]=Math.max(0,num(value));
 setCore('estimated_distance_km',num(w.data.estimated_asphalt_km)+num(w.data.estimated_gravel_km));
}

async function company(value){
 touched.add('company');
 await window.seleccionarEmpresaServicio?.(value);
 conceptPickerOpen=false;
 render();
}

async function branch(value){
 touched.add('branch');
 await window.cambiarSucursalServicio?.(value);
 render();
}

async function primary(value){
 touched.add('primary');
 await window.seleccionarPrincipalServicio?.(value);
 conceptPickerOpen=false;
 render();
}

async function addSecondary(id){
 if(!id)return;
 await window.agregarSecundarioServicio?.(id);
 conceptPickerOpen=true;
 render();
}

async function removeSecondary(id){
 await window.quitarSecundarioServicio?.(id);
 render();
}

function secondaryQuantity(id,value){
 window.cantidadSecundarioServicio?.(id,value);
 setTimeout(render,0);
}

async function calculate(){
 await window.calcularNuevoServicio?.();
 render();
}

function toggleConceptPicker(){
 conceptPickerOpen=!conceptPickerOpen;
 render();
}

function togglePanel(panel){
 if(!Object.hasOwn(panels,panel))return;
 panels[panel]=!panels[panel];
 render();
}

async function finish(){
 submitAttempted=true;
 const errors=validationErrors();
 updateValidationUI();
 if(errors.length){
  focusFirstError(errors);
  notify(`Faltan ${errors.length} ${errors.length===1?'dato obligatorio':'datos obligatorios'} para crear el servicio.`,'warning');
  return;
 }
 const w=normalize();
 const mode=w.data.assigned_driver_id&&w.data.assigned_truck_id?'assigned':'pending';
 if(typeof window.crearServicioFase3B==='function')await window.crearServicioFase3B(mode);
 else await window.crearNuevoServicio?.();
}

function wrapOpen(){
 if(originalOpen||typeof window.abrirNuevoServicio!=='function')return false;
 originalOpen=window.abrirNuevoServicio;
 window.abrirNuevoServicio=async function(){
  const result=await originalOpen.apply(this,arguments);
  conceptPickerOpen=false;
  panels={tolls:false,extras:false};
  submitAttempted=false;
  touched.clear();
  setTimeout(render,0);
  return result;
 };
 return true;
}

function observe(){
 const shell=document.getElementById('os-wizard-shell');
 if(!shell||observer)return;
 observer=new MutationObserver(()=>{
  if(painting||!featureEnabled()||!W())return;
  const next=signature();
  if(!shell.querySelector('.osv2-workspace')||next!==lastSignature)setTimeout(render,0);
 });
 observer.observe(shell,{childList:true,subtree:false});
}

function init(){
 if(!featureEnabled())return;
 let attempts=0;
 const timer=setInterval(()=>{
  const wrapped=wrapOpen();
  observe();
  if(wrapped&&document.getElementById('os-wizard-shell'))clearInterval(timer);
  else if(++attempts>120)clearInterval(timer);
 },250);
}

Object.assign(window,{
 osv2Input:input,
 osv2Select:selectValue,
 osv2StructuralSet:structuralSet,
 osv2Blur:markTouched,
 osv2Schedule:setSchedule,
 osv2TimeField:setTimeField,
 osv2VehicleInput:setVehicleInput,
 osv2DistanceInput:setDistanceInput,
 osv2Company:company,
 osv2Branch:branch,
 osv2Primary:primary,
 osv2AddSecondary:addSecondary,
 osv2RemoveSecondary:removeSecondary,
 osv2SecondaryQuantity:secondaryQuantity,
 osv2Calculate:calculate,
 osv2ToggleConceptPicker:toggleConceptPicker,
 osv2TogglePanel:togglePanel,
 osv2Finish:finish
});
window.OperatorServiceWorkspaceV2={render,featureEnabled,validationErrors,updateValidationUI};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();

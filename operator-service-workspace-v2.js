/* AuxiliOS · Workspace de servicio V2 · Beta privada */
(()=>{'use strict';
const ID='operator-service-workspace-v2';
let originalOpen=null;
let observer=null;
let painting=false;
let activePanel='';
let lastSignature='';

const featureEnabled=()=>Boolean(window.AuxiliosFeatures?.flags?.service_workspace_v2);
const O=()=>window.OperatorServices;
const S=()=>O()?.S;
const W=()=>S()?.wizard||null;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const num=value=>Number.isFinite(Number(value))?Number(value):0;
const selected=(a,b)=>String(a??'')===String(b??'')?'selected':'';
const money=(value,currency='ARS')=>new Intl.NumberFormat('es-AR',{style:'currency',currency:currency||'ARS',maximumFractionDigits:2}).format(num(value));

function normalize(){
 const w=W();
 if(!w)return null;
 const d=w.data;
 d.logistics_type??='own';
 d.estimated_asphalt_km??=num(d.estimated_distance_km);
 d.estimated_gravel_km??=0;
 d.estimated_finish_at??='';
 d.granted_delay_minutes??=0;
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
  quote:w.quote?.company_estimated_total||'',
  items:(w.items||[]).length,
  busy:w.busy,
  error:w.error
 });
}

function availableItems(role){
 const w=W();
 if(!w)return[];
 const branch=w.data.branch_id;
 const map=new Map();
 (w.items||[]).forEach(item=>{
  const itemBranch=item.billing_base_id||item.branch_id||'';
  if(itemBranch&&branch&&String(itemBranch)!==String(branch))return;
  if(item.is_active&&item[role])map.set(item.concept_id,item);
 });
 return [...map.values()];
}

function conceptName(item){
 return S()?.concepts?.find(concept=>String(concept.concept_id)===String(item.concept_id))?.name||item.service_name||'Concepto';
}

function conceptRows(){
 const w=W();
 const selectedIds=Object.keys(w?.data?.secondary_items||{});
 if(!selectedIds.length)return'<div class="osv2-empty compact">Todavía no agregaste conceptos adicionales.</div>';
 return selectedIds.map(id=>{
  const item=availableItems('can_be_secondary').find(candidate=>String(candidate.concept_id)===String(id));
  if(!item)return'';
  return`<div class="osv2-concept-row"><div><b>${esc(conceptName(item))}</b><small>Concepto adicional</small></div><input aria-label="Cantidad" type="number" min="0.01" step="0.01" value="${esc(w.data.secondary_items[id])}" onchange="osv2SecondaryQuantity('${esc(id)}',this.value)"><button type="button" title="Eliminar concepto" onclick="osv2RemoveSecondary('${esc(id)}')">×</button></div>`;
 }).join('');
}

function renderLocation(kind,title,value){
 const isOrigin=kind==='origin';
 return`<section class="osv2-location ${kind}">
  <div class="osv2-section-label"><span></span><b>${title}</b></div>
  <label><span>Dirección *</span><textarea rows="2" placeholder="Buscar dirección..." oninput="osv2Set('${kind}',this.value)">${esc(value)}</textarea></label>
  <label class="osv2-coordinates"><span>Coordenadas</span><input value="" placeholder="Se completarán con Maps" disabled></label>
  <small>${isOrigin?'Punto de asistencia o retiro.':'Punto de entrega o taller.'}</small>
 </section>`;
}

function renderQuickColumn(w){
 const d=w.data;
 const quote=w.quote;
 return`<div class="osv2-quick-actions">
   <button type="button" class="${activePanel==='tolls'?'active':''}" onclick="osv2TogglePanel('tolls')">＋ Agregar Peaje</button>
   <button type="button" class="${activePanel==='extras'?'active':''}" onclick="osv2TogglePanel('extras')">＋ Agregar Excedente</button>
  </div>
  <section class="osv2-dynamic-panel ${activePanel?'open':''}">
   ${activePanel==='tolls'?`<div class="osv2-panel-head"><div><b>Peajes del servicio</b><small>La tabla simple con nombre, dirección e importe se incorpora en la siguiente etapa.</small></div></div><div class="osv2-placeholder-table"><div><span>Nombre del peaje</span><span>Importe</span><span></span></div><p>No hay peajes agregados.</p></div>`:''}
   ${activePanel==='extras'?`<div class="osv2-panel-head"><div><b>Excedentes</b><small>El componente seguirá el mismo patrón de tabla compacta.</small></div></div><div class="osv2-placeholder-table"><div><span>Concepto</span><span>Importe</span><span></span></div><p>No hay excedentes agregados.</p></div>`:''}
   ${!activePanel?'<div class="osv2-empty"><b>Acciones complementarias</b><span>Elegí Peaje o Excedente para trabajar dentro de esta columna.</span></div>':''}
  </section>
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
  const primary=availableItems('can_be_primary');
  const availableSecondary=availableItems('can_be_secondary').filter(item=>String(item.concept_id)!==String(d.primary_concept_id)&&!Object.hasOwn(d.secondary_items||{},item.concept_id));
  const companyBranches=(S()?.branches||[]).filter(branch=>String(branch.company_id)===String(d.company_id));
  const assigned=Boolean(d.assigned_driver_id&&d.assigned_truck_id);
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
      <label><span>Fecha *</span><input type="date" value="${esc(scheduled.date)}" onchange="osv2Schedule('date',this.value)"></label>
      <label><span>Hora</span><input type="time" value="${esc(scheduled.time)}" onchange="osv2Schedule('time',this.value)"></label>
      <label><span>Arribo</span><input type="time" value="${esc(arrival.time)}" onchange="osv2TimeField('estimated_arrival_at',this.value)"></label>
      <label><span>Fin</span><input type="time" value="${esc(finish.time)}" onchange="osv2TimeField('estimated_finish_at',this.value)"></label>
      <label><span>Demora</span><input type="number" min="0" step="1" value="${num(d.granted_delay_minutes)}" oninput="osv2Set('granted_delay_minutes',this.value)"></label>
     </div>
     <section class="osv2-card admin-card">
      <div class="osv2-inline-grid two">
       <label><span>Prestadora *</span><select onchange="osv2Company(this.value)"><option value="">Seleccionar</option>${(S()?.companies||[]).filter(company=>company.status==='active').map(company=>`<option value="${company.company_id}" ${selected(d.company_id,company.company_id)}>${esc(company.trade_name||company.legal_name)}${company.is_test?' · QA':''}</option>`).join('')}</select></label>
       <label><span>Base Operativa *</span><select onchange="osv2Branch(this.value)" ${d.company_id?'':'disabled'}><option value="">Tarifa general</option>${companyBranches.map(branch=>`<option value="${branch.branch_id}" ${selected(d.branch_id,branch.branch_id)}>${esc(branch.name)}</option>`).join('')}</select></label>
      </div>
      <label><span>Tipo de Servicio *</span><select onchange="osv2Primary(this.value)" ${w.card?'':'disabled'}><option value="">Seleccionar Tipo</option>${primary.map(item=>`<option value="${item.concept_id}" ${selected(d.primary_concept_id,item.concept_id)}>${esc(conceptName(item))}</option>`).join('')}</select></label>
      <div class="osv2-logistics"><span>Tipo de Logística</span><div><button type="button" class="${d.logistics_type==='own'?'active':''}" onclick="osv2Set('logistics_type','own')">● Propia</button><button type="button" class="${d.logistics_type==='third_party'?'active':''}" onclick="osv2Set('logistics_type','third_party')">● Tercerizada</button></div></div>
      <div class="osv2-inline-grid two">
       <label><span>Asignar Chofer</span><select onchange="osv2Set('assigned_driver_id',this.value)"><option value="">Sin asignar</option>${drivers.map(driver=>`<option value="${driver.user_id}" ${selected(d.assigned_driver_id,driver.user_id)}>${esc(driver.full_name||driver.legajo)}${driver.is_test?' · QA':''}</option>`).join('')}</select></label>
       <label><span>Asignar Móvil</span><select onchange="osv2Set('assigned_truck_id',this.value)"><option value="">Sin asignar</option>${trucks.filter(truck=>truck.status==='active').map(truck=>`<option value="${truck.truck_id}" ${selected(d.assigned_truck_id,truck.truck_id)}>${esc(truck.numero_interno||truck.plate)} · ${esc(truck.plate)}</option>`).join('')}</select></label>
      </div>
     </section>
     <section class="osv2-concepts-section">
      <div class="osv2-concepts-head"><div><b>＋ Agregar Concepto</b><small>Principal y adicionales del servicio</small></div><div><select id="osv2-secondary-select" ${availableSecondary.length?'':'disabled'}><option value="">Seleccionar</option>${availableSecondary.map(item=>`<option value="${item.concept_id}">${esc(conceptName(item))}</option>`).join('')}</select><button type="button" onclick="osv2AddSelectedSecondary()">＋ Agregar</button></div></div>
      <div class="osv2-concepts-list">${conceptRows()}</div>
     </section>
    </section>

    <section class="osv2-column route-column">
     ${renderLocation('origin','Origen',d.origin)}
     ${renderLocation('destination','Destino',d.destination)}
     <section class="osv2-card vehicle-card">
      <div class="osv2-section-label neutral"><span></span><b>Vehículo del cliente</b></div>
      <div class="osv2-inline-grid three">
       <label><span>Marca</span><input value="${esc(d.vehicle_make)}" oninput="osv2Vehicle('vehicle_make',this.value)"></label>
       <label><span>Modelo</span><input value="${esc(d.vehicle_model)}" oninput="osv2Vehicle('vehicle_model',this.value)"></label>
       <label><span>Patente</span><input value="${esc(d.vehicle_plate)}" oninput="osv2Set('vehicle_plate',this.value.toUpperCase())"></label>
      </div>
      <div class="osv2-inline-grid two client-row">
       <label><span>Tel. Cliente *</span><input value="${esc(d.customer_phone)}" oninput="osv2Set('customer_phone',this.value)"></label>
       <label><span>Cliente / Socio</span><input value="${esc(d.customer_name)}" oninput="osv2Set('customer_name',this.value)"></label>
      </div>
     </section>
     <section class="osv2-card distance-card">
      <div class="osv2-section-label blue"><span></span><b>Kilómetros</b></div>
      <div class="osv2-inline-grid two">
       <label><span>KM Asfalto</span><input type="number" min="0" step="0.1" value="${num(d.estimated_asphalt_km)}" oninput="osv2Distance('estimated_asphalt_km',this.value)"></label>
       <label><span>KM Ripio</span><input type="number" min="0" step="0.1" value="${num(d.estimated_gravel_km)}" oninput="osv2Distance('estimated_gravel_km',this.value)"></label>
      </div>
     </section>
     <label class="osv2-observations"><span>Observaciones</span><textarea rows="4" placeholder="Detalles relevantes del servicio..." oninput="osv2Set('operator_notes',this.value)">${esc(d.operator_notes)}</textarea></label>
    </section>

    <section class="osv2-column actions-column">${renderQuickColumn(w)}</section>
   </main>
   <footer class="osv2-footer">
    <button type="button" class="ghost" onclick="cerrarNuevoServicio()">Volver</button>
    <div><span>${w.draftSavedAt?'Borrador guardado':'Autoguardado activo'}</span><button type="button" class="secondary" onclick="guardarBorradorServicio()">Guardar y seguir</button><button type="button" class="primary" onclick="osv2Finish()" ${w.busy?'disabled':''}>${w.busy?'Procesando…':'Guardar y Finalizar'}</button></div>
   </footer>
  </div>`;
  lastSignature=signature();
  shell.closest('.modal-backdrop')?.classList.add('osv2-modal-backdrop');
  shell.dataset.osv2='1';
  if(assigned)document.querySelector('.osv2-footer .primary')?.classList.add('assigned');
 }finally{
  painting=false;
 }
}

function callSet(key,value){
 if(typeof window.p3bSetServicio==='function')window.p3bSetServicio(key,value,false);
 else if(typeof window.osSetServicio==='function')window.osSetServicio(key,value);
 render();
}
function setSchedule(part,value){
 if(typeof window.p3bSetHorario==='function')window.p3bSetHorario(part,value);
 else{
  const w=normalize();
  const current=localParts(w.data.scheduled_for);
  w.data.scheduled_for=`${part==='date'?value:current.date}T${part==='time'?value:current.time}`;
 }
 render();
}
function setTimeField(key,value){
 const w=normalize();
 const date=localParts(w.data.scheduled_for).date||new Date().toISOString().slice(0,10);
 callSet(key,value?`${date}T${value}`:'');
}
function setVehicle(key,value){
 if(typeof window.p3bSetVehiculo==='function')window.p3bSetVehiculo(key,value);
 else{
  const w=normalize();w.data[key]=value;w.data.vehicle_make_model=[w.data.vehicle_make,w.data.vehicle_model].filter(Boolean).join(' ');
 }
 render();
}
function setDistance(key,value){
 const w=normalize();
 w.data[key]=Math.max(0,num(value));
 callSet('estimated_distance_km',num(w.data.estimated_asphalt_km)+num(w.data.estimated_gravel_km));
}
async function company(value){await window.seleccionarEmpresaServicio?.(value);render();}
async function branch(value){await window.cambiarSucursalServicio?.(value);render();}
async function primary(value){await window.seleccionarPrincipalServicio?.(value);render();}
async function addSecondary(id){if(!id)return;await window.agregarSecundarioServicio?.(id);render();}
async function removeSecondary(id){await window.quitarSecundarioServicio?.(id);render();}
function secondaryQuantity(id,value){window.cantidadSecundarioServicio?.(id,value);render();}
function addSelectedSecondary(){const select=document.getElementById('osv2-secondary-select');if(select?.value)addSecondary(select.value);}
async function calculate(){await window.calcularNuevoServicio?.();render();}
function togglePanel(panel){activePanel=activePanel===panel?'':panel;render();}
async function finish(){
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
  activePanel='';
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
 osv2Set:callSet,
 osv2Schedule:setSchedule,
 osv2TimeField:setTimeField,
 osv2Vehicle:setVehicle,
 osv2Distance:setDistance,
 osv2Company:company,
 osv2Branch:branch,
 osv2Primary:primary,
 osv2AddSelectedSecondary:addSelectedSecondary,
 osv2RemoveSecondary:removeSecondary,
 osv2SecondaryQuantity:secondaryQuantity,
 osv2Calculate:calculate,
 osv2TogglePanel:togglePanel,
 osv2Finish:finish
});
window.OperatorServiceWorkspaceV2={render,featureEnabled};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();

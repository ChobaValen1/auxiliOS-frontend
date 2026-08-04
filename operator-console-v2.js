/* AuxiliOS · Consola operativa V2 · Beta privada */
(()=>{'use strict';
const ID='operator-console-v2';
const VIEW_KEY='operator_console_v2';
const MODE_KEY='auxilios.operatorConsoleMode';
const O=window.OperatorServices;
if(!O||window.OperatorConsoleV2)return;

const COLUMN_DEFS=[
 {id:'created_at',label:'Hora',defaultVisible:true,sortable:true,width:92},
 {id:'service',label:'Servicio',defaultVisible:true,required:true,sortable:true,width:158},
 {id:'company',label:'Prestadora',defaultVisible:true,sortable:true,width:150},
 {id:'origin',label:'Origen',defaultVisible:true,sortable:true,width:210},
 {id:'destination',label:'Destino',defaultVisible:true,sortable:true,width:210},
 {id:'resource',label:'Chofer / móvil',defaultVisible:true,sortable:true,width:170},
 {id:'status',label:'Estado',defaultVisible:true,required:true,sortable:true,width:150},
 {id:'eta',label:'ETA',defaultVisible:true,sortable:true,width:112},
 {id:'alerts',label:'Alertas',defaultVisible:true,sortable:false,width:180},
 {id:'updated_at',label:'Actualización',defaultVisible:true,sortable:true,width:132},
 {id:'priority',label:'Prioridad',defaultVisible:false,sortable:true,width:106,extra:true},
 {id:'concept',label:'Concepto',defaultVisible:false,sortable:true,width:150,extra:true},
 {id:'customer',label:'Cliente',defaultVisible:false,sortable:true,width:170,extra:true},
 {id:'vehicle',label:'Vehículo',defaultVisible:false,sortable:true,width:160,extra:true},
 {id:'distance',label:'Distancia',defaultVisible:false,sortable:true,width:112,extra:true},
 {id:'amount',label:'Importe estimado',defaultVisible:false,sortable:true,width:142,extra:true},
 {id:'base',label:'Base',defaultVisible:false,sortable:true,width:145,extra:true},
 {id:'logistics',label:'Logística',defaultVisible:false,sortable:true,width:112,extra:true},
 {id:'qa',label:'Entorno',defaultVisible:false,sortable:true,width:92,extra:true},
 {id:'action',label:'Acción',defaultVisible:true,required:true,sortable:false,width:92}
];

const STATUS={
 pending:{label:'Pendiente',tone:'amber'},
 assigned:{label:'Asignado',tone:'blue'},
 en_route:{label:'Camino al origen',tone:'blue'},
 at_origin:{label:'En origen',tone:'violet'},
 loaded:{label:'Listo para traslado',tone:'violet'},
 at_destination:{label:'En destino',tone:'green'},
 completed:{label:'Finalizado',tone:'green'},
 cancelled:{label:'Excepción',tone:'red'}
};
const PRIORITY={normal:'Normal',urgent:'Urgente',critical:'Crítica'};
const ACTIVE_STATUSES=new Set(['en_route','at_origin','loaded','at_destination']);
const REQUIRED_COLUMNS=new Set(COLUMN_DEFS.filter(x=>x.required).map(x=>x.id));
const DEF_BY_ID=Object.fromEntries(COLUMN_DEFS.map(x=>[x.id,x]));
const DEFAULT_PREFS={
 density:'compact',
 columns:COLUMN_DEFS.map((def,index)=>({id:def.id,visible:def.defaultVisible,order:index,width:def.width})),
 sort:{id:'created_at',direction:'desc'}
};
const STATE={
 mode:sessionStorage.getItem(MODE_KEY)==='classic'?'classic':'beta',
 prefs:structuredClone(DEFAULT_PREFS),
 draft:null,
 query:'',status:'all',company:'all',
 lastSignature:'',observer:null,poll:null,dragId:null,
 ready:false,saving:false
};

const db=()=>typeof _db!=='undefined'?_db:null;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=value=>Number(String(value??'').replace(',','.'))||0;
const notify=(message,type='info')=>typeof window.toast==='function'?window.toast(message,type):console.log(message);
const fmtMoney=(value,currency='ARS')=>new Intl.NumberFormat('es-AR',{style:'currency',currency,maximumFractionDigits:0}).format(number(value));
const fmtDate=value=>value?new Date(value).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const fmtTime=value=>value?new Date(value).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}):'—';
const clone=value=>JSON.parse(JSON.stringify(value));

function normalizedPreferences(raw){
 const result=clone(DEFAULT_PREFS);
 if(raw?.density==='normal'||raw?.density==='compact')result.density=raw.density;
 const incoming=Array.isArray(raw?.columns)?raw.columns:[];
 const byId=new Map(incoming.map(x=>[x?.id,x]));
 result.columns=COLUMN_DEFS.map((def,index)=>{
  const stored=byId.get(def.id)||{};
  return {
   id:def.id,
   visible:def.required?true:(typeof stored.visible==='boolean'?stored.visible:def.defaultVisible),
   order:Number.isFinite(Number(stored.order))?Number(stored.order):index,
   width:Math.max(72,Math.min(420,Number(stored.width)||def.width))
  };
 }).sort((a,b)=>a.order-b.order).map((item,index)=>({...item,order:index}));
 const sortId=DEF_BY_ID[raw?.sort?.id]?.sortable?raw.sort.id:'created_at';
 result.sort={id:sortId,direction:raw?.sort?.direction==='asc'?'asc':'desc'};
 return result;
}

function visibleColumns(){
 return STATE.prefs.columns
  .filter(column=>column.visible&&DEF_BY_ID[column.id])
  .sort((a,b)=>a.order-b.order);
}

function serviceRows(){return Array.isArray(O.S?.services)?O.S.services:[];}
function serviceSignature(){
 return serviceRows().map(s=>`${s.service_id}:${s.updated_at}:${s.status}`).join('|');
}
function companyOptions(){
 const map=new Map();
 serviceRows().forEach(service=>{
  const id=service.company_id||service.company_name;
  if(id)map.set(String(id),service.company_name||O.company?.(service.company_id)?.trade_name||O.company?.(service.company_id)?.legal_name||'Prestadora');
 });
 return [...map.entries()].sort((a,b)=>a[1].localeCompare(b[1],'es'));
}

function inject(){
 const screen=document.getElementById('screen-operaciones');
 const board=document.getElementById('os-board');
 if(!screen||!board)return false;
 if(!document.getElementById('ocv2-switch')){
  const actions=screen.querySelector('.os-head-actions');
  actions?.insertAdjacentHTML('afterbegin',`<div class="ocv2-switch" id="ocv2-switch" aria-label="Cambiar vista"><button type="button" data-ocv2-mode="beta">Tabla beta</button><button type="button" data-ocv2-mode="classic">Vista clásica</button></div>`);
 }
 if(!document.getElementById('ocv2-root')){
  board.insertAdjacentHTML('beforebegin',`<section id="ocv2-root" class="ocv2-root" hidden>
   <div class="ocv2-beta-banner"><div><b>Consola V2 · Beta privada</b><span>Esta vista solo cambia la presentación. Los servicios y acciones siguen usando el circuito productivo actual.</span></div><button type="button" id="ocv2-settings-button">⚙ Columnas</button></div>
   <div class="ocv2-toolbar">
    <label class="ocv2-search"><span>⌕</span><input id="ocv2-query" placeholder="Buscar servicio, prestación, patente, cliente o dirección"></label>
    <select id="ocv2-status"><option value="all">Todos los estados</option>${Object.entries(STATUS).map(([key,meta])=>`<option value="${key}">${meta.label}</option>`).join('')}</select>
    <select id="ocv2-company"><option value="all">Todas las prestadoras</option></select>
    <button type="button" id="ocv2-refresh">↻ Actualizar</button>
   </div>
   <div class="ocv2-summary"><span id="ocv2-count">0 servicios</span><span id="ocv2-sort-label"></span></div>
   <div class="ocv2-table-wrap"><table class="ocv2-table" id="ocv2-table"><thead></thead><tbody></tbody></table></div>
   <div class="ocv2-empty" id="ocv2-empty" hidden>No hay servicios para mostrar.</div>
  </section>`);
 }
 ensureSettings();
 bindEvents();
 return true;
}

function ensureSettings(){
 if(document.getElementById('ocv2-settings'))return;
 document.body.insertAdjacentHTML('beforeend',`<div class="ocv2-settings-backdrop" id="ocv2-settings" hidden aria-hidden="true">
  <aside class="ocv2-settings-panel" role="dialog" aria-modal="true" aria-labelledby="ocv2-settings-title">
   <header><div><small>Consola V2</small><h3 id="ocv2-settings-title">Personalizar tabla</h3><p>Elegí qué información ver y en qué orden.</p></div><button type="button" data-ocv2-close>×</button></header>
   <div class="ocv2-settings-body">
    <section><h4>Densidad</h4><div class="ocv2-density"><button type="button" data-density="compact">Compacta</button><button type="button" data-density="normal">Normal</button></div></section>
    <section><div class="ocv2-settings-section-head"><h4>Columnas</h4><span>Arrastrá para ordenar</span></div><div id="ocv2-column-list" class="ocv2-column-list"></div></section>
   </div>
   <footer><button type="button" id="ocv2-reset">Restaurar</button><div><button type="button" data-ocv2-close>Cancelar</button><button type="button" id="ocv2-save" class="primary">Guardar vista</button></div></footer>
  </aside>
 </div>`);
}

function bindEvents(){
 if(document.documentElement.dataset.ocv2Bound==='1')return;
 document.documentElement.dataset.ocv2Bound='1';
 document.addEventListener('click',event=>{
  const mode=event.target.closest('[data-ocv2-mode]')?.dataset.ocv2Mode;
  if(mode)return setMode(mode);
  if(event.target.closest('#ocv2-settings-button'))return openSettings();
  if(event.target.matches('[data-ocv2-close]')||event.target.id==='ocv2-settings')return closeSettings();
  if(event.target.closest('#ocv2-refresh'))return O.loadServices?.();
  if(event.target.closest('#ocv2-reset'))return resetDraft();
  if(event.target.closest('#ocv2-save'))return saveSettings();
  const density=event.target.closest('[data-density]')?.dataset.density;
  if(density&&STATE.draft){STATE.draft.density=density;renderSettings();return;}
  const move=event.target.closest('[data-column-move]');
  if(move)return moveDraftColumn(move.dataset.columnId,move.dataset.columnMove);
  const row=event.target.closest('tr[data-service-id]');
  if(row&&!event.target.closest('button,a,input,select'))O.openDetail?.(row.dataset.serviceId);
  const action=event.target.closest('[data-open-service]');
  if(action)O.openDetail?.(action.dataset.openService);
  const sort=event.target.closest('th[data-sort-id]');
  if(sort)return changeSort(sort.dataset.sortId);
 });
 document.addEventListener('input',event=>{
  if(event.target.id==='ocv2-query'){STATE.query=event.target.value;render();}
  const toggle=event.target.closest('[data-column-toggle]');
  if(toggle&&STATE.draft){
   const column=STATE.draft.columns.find(x=>x.id===toggle.dataset.columnToggle);
   if(column&&!REQUIRED_COLUMNS.has(column.id))column.visible=toggle.checked;
   renderSettings();
  }
 });
 document.addEventListener('change',event=>{
  if(event.target.id==='ocv2-status'){STATE.status=event.target.value;render();}
  if(event.target.id==='ocv2-company'){STATE.company=event.target.value;render();}
 });
 const settings=document.getElementById('ocv2-settings');
 settings?.addEventListener('dragstart',event=>{
  const item=event.target.closest('[data-column-id]');
  if(item){STATE.dragId=item.dataset.columnId;item.classList.add('dragging');event.dataTransfer.effectAllowed='move';}
 });
 settings?.addEventListener('dragend',event=>{event.target.closest('[data-column-id]')?.classList.remove('dragging');STATE.dragId=null;});
 settings?.addEventListener('dragover',event=>{if(event.target.closest('[data-column-id]'))event.preventDefault();});
 settings?.addEventListener('drop',event=>{
  const target=event.target.closest('[data-column-id]');
  if(!target||!STATE.dragId||target.dataset.columnId===STATE.dragId)return;
  event.preventDefault();reorderDraft(STATE.dragId,target.dataset.columnId);
 });
}

function setMode(mode){
 STATE.mode=mode==='classic'?'classic':'beta';
 sessionStorage.setItem(MODE_KEY,STATE.mode);
 applyMode();
}

function applyMode(){
 const beta=STATE.mode==='beta';
 const root=document.getElementById('ocv2-root');
 const classicKpis=document.getElementById('os-kpis');
 const classicToolbar=document.querySelector('#screen-operaciones > .os-toolbar');
 const classicBoard=document.getElementById('os-board');
 if(root)root.hidden=!beta;
 if(classicKpis)classicKpis.hidden=beta;
 if(classicToolbar)classicToolbar.hidden=beta;
 if(classicBoard)classicBoard.hidden=beta;
 document.querySelectorAll('[data-ocv2-mode]').forEach(button=>button.classList.toggle('active',button.dataset.ocv2Mode===STATE.mode));
 if(beta)render();
}

function rowSearchText(service){
 return [service.service_number,service.service_order_number,service.company_name,service.origin,service.destination,service.vehicle_plate,service.vehicle_make_model,service.customer_name,service.customer_phone,service.driver_name,service.truck_label,service.concept_name].filter(Boolean).join(' ').toLowerCase();
}
function filteredRows(){
 const query=STATE.query.trim().toLowerCase();
 return serviceRows().filter(service=>{
  if(STATE.status!=='all'&&service.status!==STATE.status)return false;
  if(STATE.company!=='all'&&String(service.company_id||service.company_name)!==STATE.company)return false;
  return !query||rowSearchText(service).includes(query);
 });
}

function sortValue(service,id){
 switch(id){
  case'created_at':return new Date(service.requested_at||service.created_at||0).getTime();
  case'service':return service.service_number||'';
  case'company':return service.company_name||'';
  case'origin':return service.origin||'';
  case'destination':return service.destination||'';
  case'resource':return `${service.driver_name||''} ${service.truck_label||''}`;
  case'status':return STATUS[service.status]?.label||service.status||'';
  case'eta':return new Date(service.estimated_arrival_at||0).getTime();
  case'updated_at':return new Date(service.updated_at||0).getTime();
  case'priority':return({normal:1,urgent:2,critical:3})[service.priority]||0;
  case'concept':return service.concept_name||'';
  case'customer':return service.customer_name||'';
  case'vehicle':return `${service.vehicle_plate||''} ${service.vehicle_make_model||''}`;
  case'distance':return number(service.estimated_distance_km);
  case'amount':return number(service.company_estimated_total);
  case'base':return service.billing_base_name||service.branch_name||'';
  case'logistics':return service.logistics_type||'';
  case'qa':return service.is_test?1:0;
  default:return'';
 }
}
function sortedRows(rows){
 const {id,direction}=STATE.prefs.sort;
 const factor=direction==='asc'?1:-1;
 return [...rows].sort((a,b)=>{
  const av=sortValue(a,id),bv=sortValue(b,id);
  if(typeof av==='number'&&typeof bv==='number')return(av-bv)*factor;
  return String(av).localeCompare(String(bv),'es',{numeric:true,sensitivity:'base'})*factor;
 });
}

function relativeTime(value){
 if(!value)return'—';
 const diff=Math.max(0,Date.now()-new Date(value).getTime());
 const minutes=Math.floor(diff/60000);
 if(minutes<1)return'Ahora';
 if(minutes<60)return`Hace ${minutes} min`;
 const hours=Math.floor(minutes/60);
 if(hours<24)return`Hace ${hours} h`;
 return fmtDate(value);
}
function etaValue(service){
 if(service.status==='completed')return'<span class="ocv2-eta done">Finalizado</span>';
 if(service.status==='cancelled')return'<span class="ocv2-muted">—</span>';
 if(service.estimated_arrival_at)return`<span class="ocv2-eta">${fmtTime(service.estimated_arrival_at)}</span>`;
 return'<span class="ocv2-eta pending">Sin calcular</span>';
}
function alertItems(service){
 const alerts=[];
 if(service.is_test)alerts.push(['QA','muted']);
 if(service.priority==='critical')alerts.push(['Prioridad crítica','red']);
 else if(service.priority==='urgent')alerts.push(['Urgente','amber']);
 if(['pending','assigned'].includes(service.status)&&(!service.assigned_driver_id||!service.assigned_truck_id))alerts.push(['Sin asignar','amber']);
 if(ACTIVE_STATUSES.has(service.status)&&!service.estimated_arrival_at)alerts.push(['ETA pendiente','blue']);
 if(service.status==='completed'&&!service.remito_id)alerts.push(['Remito pendiente','amber']);
 if(service.status==='cancelled')alerts.push(['Revisar excepción','red']);
 return alerts.slice(0,3);
}
function cell(service,id){
 const status=STATUS[service.status]||{label:service.status||'Pendiente',tone:'muted'};
 switch(id){
  case'created_at':return`<span class="ocv2-time">${fmtTime(service.requested_at||service.created_at)}</span><small>${new Date(service.requested_at||service.created_at||0).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'})}</small>`;
  case'service':return`<b class="ocv2-service-number">${esc(service.service_number||'—')}</b><small>${service.service_order_number?`Prestación ${esc(service.service_order_number)}`:'Sin número de prestación'}</small>`;
  case'company':return`<b>${esc(service.company_name||'—')}</b>${service.branch_name?`<small>${esc(service.branch_name)}</small>`:''}`;
  case'origin':return`<span class="ocv2-address" title="${esc(service.origin||'')}">${esc(service.origin||'—')}</span>`;
  case'destination':return`<span class="ocv2-address" title="${esc(service.destination||'')}">${esc(service.destination||'—')}</span>`;
  case'resource':return service.driver_name||service.truck_label?`<b>${esc(service.driver_name||'Sin chofer')}</b><small>${esc(service.truck_label||'Sin móvil')}</small>`:'<span class="ocv2-warning-text">Sin asignar</span>';
  case'status':return`<span class="ocv2-status ${status.tone}">${esc(status.label)}</span>`;
  case'eta':return etaValue(service);
  case'alerts':{const alerts=alertItems(service);return alerts.length?`<div class="ocv2-alerts">${alerts.map(([label,tone])=>`<span class="${tone}">${esc(label)}</span>`).join('')}</div>`:'<span class="ocv2-ok">Sin alertas</span>';}
  case'updated_at':return`<span title="${esc(fmtDate(service.updated_at))}">${esc(relativeTime(service.updated_at))}</span>`;
  case'priority':return`<span class="ocv2-priority ${esc(service.priority||'normal')}">${esc(PRIORITY[service.priority]||service.priority||'Normal')}</span>`;
  case'concept':return`<span>${esc(service.concept_icon||'◆')} ${esc(service.concept_name||service.pricing_snapshot?.components?.[0]?.service_name||'—')}</span>`;
  case'customer':return`<b>${esc(service.customer_name||'—')}</b>${service.customer_phone?`<small>${esc(service.customer_phone)}</small>`:''}`;
  case'vehicle':return`<b>${esc(service.vehicle_plate||'—')}</b>${service.vehicle_make_model?`<small>${esc(service.vehicle_make_model)}</small>`:''}`;
  case'distance':return service.estimated_distance_km!=null?`<b>${number(service.estimated_distance_km).toLocaleString('es-AR')} km</b>`:'<span class="ocv2-muted">—</span>';
  case'amount':return`<b>${esc(fmtMoney(service.company_estimated_total,service.currency||'ARS'))}</b>`;
  case'base':return`<span>${esc(service.billing_base_name||service.branch_name||'—')}</span>`;
  case'logistics':return`<span>${service.logistics_type==='third_party'?'Tercerizada':'Propia'}</span>`;
  case'qa':return service.is_test?'<span class="ocv2-env qa">QA</span>':'<span class="ocv2-env prod">Real</span>';
  case'action':return`<button type="button" class="ocv2-open" data-open-service="${esc(service.service_id)}">Abrir</button>`;
  default:return'—';
 }
}

function render(){
 if(STATE.mode!=='beta'||!document.getElementById('ocv2-root'))return;
 const columns=visibleColumns();
 const rows=sortedRows(filteredRows());
 const table=document.getElementById('ocv2-table');
 if(!table)return;
 table.className=`ocv2-table density-${STATE.prefs.density}`;
 table.querySelector('thead').innerHTML=`<tr>${columns.map(column=>{
  const def=DEF_BY_ID[column.id],active=STATE.prefs.sort.id===column.id;
  return`<th style="--ocv2-width:${column.width}px" ${def.sortable?`data-sort-id="${column.id}" tabindex="0"`:''}><span>${esc(def.label)}${active?` <i>${STATE.prefs.sort.direction==='asc'?'↑':'↓'}</i>`:''}</span></th>`;
 }).join('')}</tr>`;
 table.querySelector('tbody').innerHTML=rows.map(service=>`<tr data-service-id="${esc(service.service_id)}" class="status-${esc(service.status)}">${columns.map(column=>`<td data-column="${column.id}" style="--ocv2-width:${column.width}px">${cell(service,column.id)}</td>`).join('')}</tr>`).join('');
 document.getElementById('ocv2-empty').hidden=rows.length>0;
 document.querySelector('.ocv2-table-wrap').hidden=rows.length===0;
 document.getElementById('ocv2-count').textContent=`${rows.length} ${rows.length===1?'servicio':'servicios'} visibles · ${serviceRows().length} totales`;
 const sortDef=DEF_BY_ID[STATE.prefs.sort.id];
 document.getElementById('ocv2-sort-label').textContent=`Orden: ${sortDef?.label||'Hora'} ${STATE.prefs.sort.direction==='asc'?'ascendente':'descendente'}`;
 refreshCompanySelect();
}

function refreshCompanySelect(){
 const select=document.getElementById('ocv2-company');if(!select)return;
 const options=companyOptions();
 const signature=options.map(([id,label])=>`${id}:${label}`).join('|');
 if(select.dataset.signature===signature)return;
 select.dataset.signature=signature;
 select.innerHTML='<option value="all">Todas las prestadoras</option>'+options.map(([id,label])=>`<option value="${esc(id)}" ${STATE.company===String(id)?'selected':''}>${esc(label)}</option>`).join('');
}
function changeSort(id){
 if(!DEF_BY_ID[id]?.sortable)return;
 if(STATE.prefs.sort.id===id)STATE.prefs.sort.direction=STATE.prefs.sort.direction==='asc'?'desc':'asc';
 else STATE.prefs.sort={id,direction:'asc'};
 render();
 savePreferences(false);
}

function openSettings(){
 STATE.draft=clone(STATE.prefs);
 const modal=document.getElementById('ocv2-settings');
 modal.hidden=false;modal.setAttribute('aria-hidden','false');
 renderSettings();
}
function closeSettings(){
 const modal=document.getElementById('ocv2-settings');
 if(modal){modal.hidden=true;modal.setAttribute('aria-hidden','true');}
 STATE.draft=null;
}
function renderSettings(){
 if(!STATE.draft)return;
 document.querySelectorAll('[data-density]').forEach(button=>button.classList.toggle('active',button.dataset.density===STATE.draft.density));
 const list=document.getElementById('ocv2-column-list');
 list.innerHTML=STATE.draft.columns.sort((a,b)=>a.order-b.order).map((column,index)=>{
  const def=DEF_BY_ID[column.id],required=REQUIRED_COLUMNS.has(column.id);
  return`<article class="ocv2-column-item" draggable="true" data-column-id="${column.id}"><span class="handle" title="Arrastrar">⋮⋮</span><label><input type="checkbox" data-column-toggle="${column.id}" ${column.visible?'checked':''} ${required?'disabled':''}><span><b>${esc(def.label)}</b><small>${required?'Obligatoria':def.extra?'Columna extra':'Columna principal'}</small></span></label><div><button type="button" data-column-move="up" data-column-id="${column.id}" ${index===0?'disabled':''}>↑</button><button type="button" data-column-move="down" data-column-id="${column.id}" ${index===STATE.draft.columns.length-1?'disabled':''}>↓</button></div></article>`;
 }).join('');
}
function moveDraftColumn(id,direction){
 if(!STATE.draft)return;
 const list=STATE.draft.columns.sort((a,b)=>a.order-b.order),index=list.findIndex(x=>x.id===id),target=direction==='up'?index-1:index+1;
 if(index<0||target<0||target>=list.length)return;
 [list[index],list[target]]=[list[target],list[index]];
 list.forEach((column,position)=>column.order=position);renderSettings();
}
function reorderDraft(sourceId,targetId){
 if(!STATE.draft)return;
 const list=STATE.draft.columns.sort((a,b)=>a.order-b.order),sourceIndex=list.findIndex(x=>x.id===sourceId),targetIndex=list.findIndex(x=>x.id===targetId);
 if(sourceIndex<0||targetIndex<0)return;
 const [source]=list.splice(sourceIndex,1);list.splice(targetIndex,0,source);
 list.forEach((column,index)=>column.order=index);renderSettings();
}
function resetDraft(){STATE.draft=clone(DEFAULT_PREFS);renderSettings();}
async function saveSettings(){
 if(!STATE.draft||STATE.saving)return;
 STATE.prefs=normalizedPreferences(STATE.draft);
 render();
 await savePreferences(true);
 closeSettings();
}
async function savePreferences(showToast=true){
 const client=db(),userId=window.AuxiliosFeatures?.userId;
 if(!client||!userId)return;
 STATE.saving=true;
 try{
  const {error}=await client.from('user_view_preferences').upsert({
   user_id:userId,
   view_key:VIEW_KEY,
   preferences:STATE.prefs,
   updated_at:new Date().toISOString()
  },{onConflict:'user_id,view_key'});
  if(error)throw error;
  if(showToast)notify('Vista personalizada guardada.','success');
 }catch(error){notify(error.message||'No se pudo guardar la vista.','error');}
 finally{STATE.saving=false;}
}
async function loadPreferences(){
 const client=db();if(!client)return;
 try{
  const {data,error}=await client.from('user_view_preferences').select('preferences').eq('view_key',VIEW_KEY).maybeSingle();
  if(error)throw error;
  STATE.prefs=normalizedPreferences(data?.preferences);
 }catch(error){console.warn('[Operator Console V2]',error.message||error);STATE.prefs=clone(DEFAULT_PREFS);}
}

function watch(){
 const board=document.getElementById('os-board');
 if(board&&!STATE.observer){
  STATE.observer=new MutationObserver(()=>scheduleRender());
  STATE.observer.observe(board,{childList:true,subtree:true});
 }
 if(!STATE.poll){
  STATE.poll=setInterval(()=>{
   const signature=serviceSignature();
   if(signature!==STATE.lastSignature){STATE.lastSignature=signature;render();}
   if(!document.getElementById('ocv2-root'))boot();
  },1000);
 }
}
let renderTimer=null;
function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(render,40);}

async function boot(){
 if(!inject())return false;
 if(!STATE.ready){await loadPreferences();STATE.ready=true;}
 applyMode();watch();
 if(!serviceRows().length)O.loadServices?.();
 STATE.lastSignature=serviceSignature();render();
 window.OperatorConsoleV2={state:STATE,render,setMode,openSettings,reset:()=>{STATE.prefs=clone(DEFAULT_PREFS);render();}};
 return true;
}

let attempts=0;
const timer=setInterval(async()=>{
 if(await boot())clearInterval(timer);
 else if(++attempts>120)clearInterval(timer);
},250);
})();

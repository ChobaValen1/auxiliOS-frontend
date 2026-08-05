/* AuxiliOS · Revisión operativa del workspace V2 · Beta privada */
(()=>{'use strict';
const ID='operator-service-workspace-review-v3';
const DRAFT_KEY='auxilios.operator-service-draft.v1';
const ADDRESS_DELAY_MS=2000;
const RESOURCE_REFRESH_MS=45000;
let previousOpen=null;
let observer=null;
let enhancing=false;
let resourceTimer=null;
const resources={drivers:[],trucks:[],loaded:false,error:'',loadedAt:0};
const addressState={origin:null,destination:null};

const enabled=()=>Boolean(window.AuxiliosFeatures?.flags?.service_workspace_v2);
const O=()=>window.OperatorServices;
const S=()=>O()?.S;
const W=()=>S()?.wizard||null;
const V2=()=>window.OperatorServiceWorkspaceV2;
const db=()=>typeof _db!=='undefined'?_db:null;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const num=value=>Number.isFinite(Number(value))?Number(value):0;
const notify=(message,type='info')=>typeof window.toast==='function'?window.toast(message,type):console.log(message);

function nowInBuenosAires(){
 const parts=new Intl.DateTimeFormat('en-CA',{
  timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 }).formatToParts(new Date());
 const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return`${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function emptyData(){
 return{
  company_id:'',branch_id:'',billing_base_id:'',service_order_number:'',purchase_order_number:'',
  scheduled_for:nowInBuenosAires(),priority:'normal',primary_concept_id:'',secondary_items:{},
  estimated_distance_km:0,estimated_asphalt_km:0,estimated_gravel_km:0,toll_estimate:0,is_holiday:false,
  customer_name:'',customer_phone:'',customer_email:'',vehicle_plate:'',vehicle_make_model:'',
  vehicle_make:'',vehicle_model:'',origin:'',destination:'',origin_lat:'',origin_lng:'',destination_lat:'',destination_lng:'',
  origin_place_id:'',destination_place_id:'',origin_formatted_address:'',destination_formatted_address:'',
  operator_notes:'',driver_instructions:'',assigned_driver_id:'',assigned_truck_id:'',
  estimated_arrival_at:'',estimated_finish_at:'',granted_delay_minutes:0,logistics_type:'own',
  route_distance_meters:'',route_duration_seconds:'',route_toll_estimate:'',route_toll_currency:'',
  route_provider:'',route_calculated_at:'',route_legs:[]
 };
}

function resetAddressState(){
 for(const kind of ['origin','destination']){
  const current=addressState[kind];
  if(current?.timer)clearTimeout(current.timer);
  addressState[kind]={
   timer:null,sequence:0,suggestions:[],loading:false,error:'',
   sessionToken:crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`
  };
 }
}

function resetWizard(){
 const w=W();
 if(!w)return;
 w.data=emptyData();
 w.contract=null;w.card=null;w.items=[];w.links=[];w.quote=null;w.error=null;
 w.busy=false;w.loadingCatalog=false;w.dirty=false;w.draftSavedAt=null;
 try{localStorage.removeItem(DRAFT_KEY)}catch{}
 resetAddressState();
}

function stateMeta(state){
 return({
  available:{label:'Disponible',tone:'ok'},
  busy:{label:'Con servicio',tone:'warning'},
  no_open_shift:{label:'Sin jornada',tone:'warning'},
  stale_shift:{label:'Jornada anterior',tone:'warning'},
  workshop:{label:'En taller',tone:'danger'},
  inactive:{label:'Fuera de servicio',tone:'danger'},
  truck_unavailable:{label:'Móvil no operativo',tone:'danger'},
  driver_unavailable:{label:'Chofer no operativo',tone:'danger'}
 })[state]||{label:'Estado desconocido',tone:'muted'};
}

function hardUnavailable(state){
 return['inactive','workshop','truck_unavailable','driver_unavailable'].includes(state);
}

async function loadResources(force=false){
 if(!db()||!W())return;
 if(!force&&Date.now()-resources.loadedAt<RESOURCE_REFRESH_MS)return;
 try{
  const {data,error}=await db().rpc('get_operator_resource_availability');
  if(error)throw error;
  resources.drivers=Array.isArray(data?.drivers)?data.drivers:[];
  resources.trucks=Array.isArray(data?.trucks)?data.trucks:[];
  resources.loaded=true;resources.error='';resources.loadedAt=Date.now();
  if(W()&&document.querySelector('.osv2-workspace'))V2()?.render?.();
 }catch(error){
  resources.error=error.message||'No se pudo consultar la disponibilidad.';
  resources.loadedAt=Date.now();
  console.warn('[Workspace V3 · recursos]',error);
 }
}

function fallbackDrivers(){
 return(S()?.drivers||[]).map(driver=>({...driver,resource_state:'no_open_shift'}));
}
function fallbackTrucks(){
 return(S()?.trucks||[]).map(truck=>({...truck,resource_state:truck.status==='active'?'no_open_shift':'inactive'}));
}
function driverRows(){return resources.loaded?resources.drivers:fallbackDrivers();}
function truckRows(){return resources.loaded?resources.trucks:fallbackTrucks();}
function driverById(id){return driverRows().find(row=>String(row.user_id)===String(id));}
function truckById(id){return truckRows().find(row=>String(row.truck_id)===String(id));}

function driverLabel(driver){
 const meta=stateMeta(driver.resource_state);
 const truck=driver.truck_label?` · Móvil ${driver.truck_label}`:'';
 const service=driver.active_service_number?` · ${driver.active_service_number}`:'';
 return`${driver.full_name||driver.legajo||'Chofer'}${truck} · ${meta.label}${service}`;
}
function truckLabel(truck){
 const meta=stateMeta(truck.resource_state);
 const label=truck.numero_interno||truck.plate||`Móvil ${truck.truck_id}`;
 const driver=truck.driver_name?` · ${truck.driver_name}`:'';
 const service=truck.active_service_number?` · ${truck.active_service_number}`:'';
 return`${label}${driver} · ${meta.label}${service}`;
}

function assignmentMessage(){
 const d=W()?.data||{};
 const driver=driverById(d.assigned_driver_id);
 const truck=truckById(d.assigned_truck_id);
 if(!d.assigned_driver_id&&!d.assigned_truck_id)return{tone:'muted',text:'Sin asignación. Podés crear el servicio pendiente.'};
 if(d.assigned_driver_id&&!d.assigned_truck_id){
  const meta=stateMeta(driver?.resource_state);
  return{tone:'warning',text:`${driver?.full_name||'El chofer'}: ${meta.label}. Seleccioná un móvil para completar la asignación.`};
 }
 if(!d.assigned_driver_id&&d.assigned_truck_id){
  const meta=stateMeta(truck?.resource_state);
  return{tone:'warning',text:`${truck?.numero_interno||truck?.plate||'El móvil'}: ${meta.label}. Seleccioná un chofer para completar la asignación.`};
 }
 if(driver?.active_truck_id&&String(driver.active_truck_id)!==String(d.assigned_truck_id)){
  return{tone:'warning',text:`${driver.full_name} tiene jornada abierta en el móvil ${driver.truck_label||driver.active_truck_id}.`};
 }
 if(truck?.active_driver_id&&String(truck.active_driver_id)!==String(d.assigned_driver_id)){
  return{tone:'warning',text:`El móvil ${truck.numero_interno||truck.plate} tiene jornada abierta con ${truck.driver_name||'otro chofer'}.`};
 }
 const states=[driver?.resource_state,truck?.resource_state].filter(Boolean);
 if(states.some(state=>hardUnavailable(state)))return{tone:'danger',text:'La combinación seleccionada contiene un recurso no operativo.'};
 if(states.includes('busy'))return{tone:'warning',text:'La combinación tiene otro servicio activo. Verificá disponibilidad antes de confirmar.'};
 if(states.includes('stale_shift'))return{tone:'warning',text:'La jornada abierta corresponde a una fecha anterior. Debe regularizarse antes del servicio.'};
 if(states.includes('no_open_shift'))return{tone:'warning',text:'La asignación no tiene una jornada abierta. El chofer deberá iniciarla antes de comenzar.'};
 return{tone:'ok',text:`Jornada abierta: ${driver?.full_name||'Chofer'} ↔ móvil ${truck?.numero_interno||truck?.plate||d.assigned_truck_id}.`};
}

function setAssignment(driverId,truckId){
 window.osv2Select?.('assigned_driver_id',driverId||'','assignment');
 window.osv2Select?.('assigned_truck_id',truckId||'','assignment');
 V2()?.render?.();
}

function selectDriver(value){
 const w=W();if(!w)return;
 if(!value){setAssignment('',w.data.assigned_truck_id||'');return;}
 const driver=driverById(value);
 if(!driver||hardUnavailable(driver.resource_state))return V2()?.render?.();
 const pairedTruck=driver.active_truck_id;
 if(pairedTruck&&['available','busy'].includes(driver.resource_state)){
  const current=w.data.assigned_truck_id;
  if(current&&String(current)!==String(pairedTruck)&&!confirm(`${driver.full_name} tiene jornada abierta en el móvil ${driver.truck_label||pairedTruck}. ¿Reemplazar el móvil seleccionado?`)){
   return V2()?.render?.();
  }
  setAssignment(value,pairedTruck);
 }else setAssignment(value,w.data.assigned_truck_id||'');
}

function selectTruck(value){
 const w=W();if(!w)return;
 if(!value){setAssignment(w.data.assigned_driver_id||'','');return;}
 const truck=truckById(value);
 if(!truck||hardUnavailable(truck.resource_state))return V2()?.render?.();
 const pairedDriver=truck.active_driver_id;
 if(pairedDriver&&['available','busy'].includes(truck.resource_state)){
  const current=w.data.assigned_driver_id;
  if(current&&String(current)!==String(pairedDriver)&&!confirm(`El móvil ${truck.numero_interno||truck.plate} tiene jornada abierta con ${truck.driver_name}. ¿Reemplazar el chofer seleccionado?`)){
   return V2()?.render?.();
  }
  setAssignment(pairedDriver,value);
 }else setAssignment(w.data.assigned_driver_id||'',value);
}

function addressData(kind){
 const d=W()?.data||{};
 return{
  value:d[kind]||'',placeId:d[`${kind}_place_id`]||'',
  lat:d[`${kind}_lat`],lng:d[`${kind}_lng`],
  formatted:d[`${kind}_formatted_address`]||''
 };
}

function addressBias(){
 const d=W()?.data||{};
 const branch=(S()?.branches||[]).find(row=>String(row.branch_id||row.billing_base_id)===String(d.branch_id||d.billing_base_id));
 const latitude=Number(branch?.latitude),longitude=Number(branch?.longitude);
 if(Number.isFinite(latitude)&&Number.isFinite(longitude))return{latitude,longitude,radius:80000};
 return{latitude:-34.6037,longitude:-58.3816,radius:150000};
}

function addressStatus(kind){
 const data=addressData(kind);
 if(data.placeId&&Number.isFinite(Number(data.lat))&&Number.isFinite(Number(data.lng)))return{tone:'ok',text:'Dirección validada con Maps'};
 if(String(data.value).trim())return{tone:'warning',text:'Dirección manual sin validar'};
 return{tone:'muted',text:'Escribí al menos 3 caracteres'};
}

function updateAddressStatus(kind){
 const status=document.getElementById(`osv3-${kind}-status`);
 if(!status)return;
 const meta=addressStatus(kind);
 status.className=`osv3-address-status ${meta.tone}`;
 status.textContent=meta.text;
}

function clearAddressGeo(kind){
 for(const suffix of ['place_id','lat','lng','formatted_address'])window.osv2Input?.(`${kind}_${suffix}`,'');
}

function addressInput(kind,value){
 const state=addressState[kind]||resetAddressState()||addressState[kind];
 window.osv2Input?.(kind,value);
 clearAddressGeo(kind);
 state.suggestions=[];state.error='';state.loading=false;
 if(state.timer)clearTimeout(state.timer);
 renderSuggestions(kind);
 updateAddressStatus(kind);
 const query=String(value||'').trim();
 if(query.length<3)return;
 const sequence=++state.sequence;
 state.timer=setTimeout(()=>searchAddress(kind,query,sequence),ADDRESS_DELAY_MS);
}

async function searchAddress(kind,input,sequence){
 const state=addressState[kind];
 if(!state||sequence!==state.sequence||!db())return;
 state.loading=true;state.error='';renderSuggestions(kind);
 try{
  const {data,error}=await db().functions.invoke('maps-proxy',{body:{
   action:'autocomplete',input,sessionToken:state.sessionToken,regionCode:'AR',locationBias:addressBias()
  }});
  if(error)throw error;
  if(sequence!==state.sequence)return;
  state.suggestions=Array.isArray(data?.suggestions)?data.suggestions.slice(0,5):[];
 }catch(error){
  if(sequence!==state.sequence)return;
  state.suggestions=[];state.error=error.message||'No se pudieron buscar direcciones.';
 }finally{
  if(sequence===state.sequence){state.loading=false;renderSuggestions(kind);}
 }
}

function renderSuggestions(kind){
 const box=document.getElementById(`osv3-${kind}-suggestions`);
 const state=addressState[kind];
 if(!box||!state)return;
 if(state.loading){box.hidden=false;box.innerHTML='<div class="osv3-suggestion-state">Buscando direcciones…</div>';return;}
 if(state.error){box.hidden=false;box.innerHTML=`<div class="osv3-suggestion-state error">${esc(state.error)}</div>`;return;}
 if(!state.suggestions.length){box.hidden=true;box.innerHTML='';return;}
 box.hidden=false;
 box.innerHTML=state.suggestions.map((item,index)=>`<button type="button" data-index="${index}"><b>${esc(item.mainText||item.text)}</b><span>${esc(item.secondaryText||'')}</span></button>`).join('');
 box.querySelectorAll('button').forEach(button=>{
  button.addEventListener('mousedown',event=>event.preventDefault());
  button.addEventListener('click',()=>selectAddress(kind,Number(button.dataset.index)));
 });
}

async function selectAddress(kind,index){
 const state=addressState[kind];
 const suggestion=state?.suggestions?.[index];
 if(!suggestion||!db())return;
 state.loading=true;renderSuggestions(kind);
 try{
  const {data,error}=await db().functions.invoke('maps-proxy',{body:{action:'place',placeId:suggestion.placeId,sessionToken:state.sessionToken}});
  if(error)throw error;
  const formatted=data?.formattedAddress||suggestion.text||suggestion.mainText;
  const latitude=data?.location?.latitude;
  const longitude=data?.location?.longitude;
  window.osv2Input?.(kind,formatted);
  window.osv2Input?.(`${kind}_place_id`,data?.placeId||suggestion.placeId);
  window.osv2Input?.(`${kind}_lat`,latitude??'');
  window.osv2Input?.(`${kind}_lng`,longitude??'');
  window.osv2Input?.(`${kind}_formatted_address`,formatted);
  const input=document.getElementById(`osv3-${kind}-input`);if(input)input.value=formatted;
  state.suggestions=[];state.error='';state.sessionToken=crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;
  window.osv2Blur?.(kind);
 }catch(error){
  state.error=error.message||'No se pudo validar la dirección.';
 }finally{state.loading=false;renderSuggestions(kind);updateAddressStatus(kind);}
}

function patchProviderCode(){
 const top=document.querySelector('.osv2-workspace .top-fields');if(!top)return;
 const label=top.children[0];if(!label||label.dataset.osv3==='provider')return;
 const w=W(),required=Boolean(w?.contract?.requires_service_order);
 label.dataset.osv3='provider';label.dataset.field='service_order';
 label.innerHTML=`<span>Código prestadora${required?' *':''}</span><input id="osv3-provider-code" value="${esc(w?.data?.service_order_number||'')}" placeholder="Código recibido"><small class="osv2-field-error" data-error-for="service_order"></small>`;
 const input=label.querySelector('input');
 input.addEventListener('input',()=>window.osv2Input?.('service_order_number',input.value,'service_order'));
 input.addEventListener('blur',()=>window.osv2Blur?.('service_order'));

 const admin=document.querySelector('.osv2-workspace .admin-card');
 admin?.querySelectorAll('[data-field="service_order"]').forEach(node=>{if(node!==label)node.remove();});
 const purchase=admin?.querySelector('[data-field="purchase_order"]');
 if(purchase&&!w?.contract?.requires_purchase_order)purchase.remove();
 else if(purchase){purchase.style.gridColumn='1 / -1';}
 admin?.querySelectorAll('.osv2-inline-grid.two').forEach(grid=>{if(!grid.children.length)grid.remove();});
}

function patchDelay(){
 const top=document.querySelector('.osv2-workspace .top-fields');if(!top)return;
 const label=top.children[5];if(!label||label.dataset.osv3==='delay')return;
 const value=String(num(W()?.data?.granted_delay_minutes));
 label.dataset.osv3='delay';
 label.innerHTML=`<span>Demora</span><select id="osv3-delay"><option value="0">Sin demora</option>${[30,60,90,120,180,240].map(option=>`<option value="${option}" ${value===String(option)?'selected':''}>${option}</option>`).join('')}</select>`;
 label.querySelector('select').addEventListener('change',event=>window.osv2Input?.('granted_delay_minutes',Number(event.target.value)));
}

function patchKilometers(){
 const card=document.querySelector('.osv2-workspace .distance-card');if(!card)return;
 const grid=card.querySelector('.osv2-inline-grid');if(!grid)return;
 grid.classList.remove('two');grid.classList.add('three');
 if(!document.getElementById('osv3-total-km')){
  const label=document.createElement('label');label.className='osv3-total-km';
  label.innerHTML='<span>KM Totales</span><input id="osv3-total-km" disabled>';
  grid.appendChild(label);
  grid.querySelectorAll('input:not(#osv3-total-km)').forEach(input=>input.addEventListener('input',updateTotalKm));
 }
 updateTotalKm();
}
function updateTotalKm(){
 const d=W()?.data||{};const total=num(d.estimated_asphalt_km)+num(d.estimated_gravel_km);
 const input=document.getElementById('osv3-total-km');if(input)input.value=String(total);
}

function patchResources(){
 const grid=document.querySelector('.osv2-workspace .assignment-grid');if(!grid)return;
 const selects=grid.querySelectorAll('select');if(selects.length<2)return;
 const driverSelect=selects[0],truckSelect=selects[1];
 const d=W()?.data||{};
 driverSelect.innerHTML='<option value="">Sin asignar</option>'+driverRows().map(driver=>`<option value="${esc(driver.user_id)}" ${String(d.assigned_driver_id)===String(driver.user_id)?'selected':''} ${hardUnavailable(driver.resource_state)?'disabled':''}>${esc(driverLabel(driver))}</option>`).join('');
 truckSelect.innerHTML='<option value="">Sin asignar</option>'+truckRows().map(truck=>`<option value="${esc(truck.truck_id)}" ${String(d.assigned_truck_id)===String(truck.truck_id)?'selected':''} ${hardUnavailable(truck.resource_state)?'disabled':''}>${esc(truckLabel(truck))}</option>`).join('');
 driverSelect.onchange=event=>selectDriver(event.target.value);
 truckSelect.onchange=event=>selectTruck(event.target.value);
 if(!grid.querySelector('.osv3-resource-note')){
  const note=document.createElement('div');note.className='osv3-resource-note';grid.appendChild(note);
 }
 const note=grid.querySelector('.osv3-resource-note');const meta=assignmentMessage();
 note.className=`osv3-resource-note ${meta.tone}`;
 note.innerHTML=`<span>${esc(meta.text)}</span><button type="button">↻</button>`;
 note.querySelector('button').onclick=()=>loadResources(true);
}

function patchLocation(kind){
 const section=document.querySelector(`.osv2-workspace .osv2-location.${kind}`);if(!section)return;
 const existing=section.querySelector('.osv3-address-wrap');
 if(existing){updateAddressStatus(kind);return;}
 const old=section.querySelector('label:not(.osv2-coordinates)');if(!old)return;
 const data=addressData(kind);
 const wrap=document.createElement('div');wrap.className='osv3-address-wrap';
 wrap.innerHTML=`<label><span>Dirección *</span><div class="osv3-address-input"><span>⌕</span><input id="osv3-${kind}-input" autocomplete="off" value="${esc(data.value)}" placeholder="Buscar dirección..."></div></label><div id="osv3-${kind}-suggestions" class="osv3-suggestions" hidden></div><div id="osv3-${kind}-status" class="osv3-address-status"></div>`;
 old.replaceWith(wrap);
 const input=wrap.querySelector('input');
 input.addEventListener('input',()=>addressInput(kind,input.value));
 input.addEventListener('blur',()=>setTimeout(()=>window.osv2Blur?.(kind),150));
 input.addEventListener('keydown',event=>{if(event.key==='Escape'){addressState[kind].suggestions=[];renderSuggestions(kind);}});
 updateAddressStatus(kind);
}

function enhance(){
 if(enhancing||!enabled()||!W()||!document.querySelector('.osv2-workspace'))return;
 enhancing=true;
 try{
  patchProviderCode();patchDelay();patchKilometers();patchResources();patchLocation('origin');patchLocation('destination');
  window.OperatorServiceWorkspaceV2?.updateValidationUI?.();
 }finally{enhancing=false;}
}

function observe(){
 const shell=document.getElementById('os-wizard-shell');if(!shell||observer)return;
 observer=new MutationObserver(()=>setTimeout(enhance,0));
 observer.observe(shell,{childList:true,subtree:false});
}

function wrapOpen(){
 if(previousOpen||typeof window.abrirNuevoServicio!=='function'||!V2())return false;
 previousOpen=window.abrirNuevoServicio;
 window.abrirNuevoServicio=async function(){
  try{localStorage.removeItem(DRAFT_KEY)}catch{}
  const result=await previousOpen.apply(this,arguments);
  resetWizard();
  V2()?.render?.();
  setTimeout(enhance,0);
  loadResources(true);
  return result;
 };
 return true;
}

function startResourceRefresh(){
 if(resourceTimer)return;
 resourceTimer=setInterval(()=>{
  if(!W()||!document.querySelector('.osv2-workspace'))return;
  const active=document.activeElement;
  if(active?.tagName==='SELECT')return;
  loadResources(true);
 },RESOURCE_REFRESH_MS);
}

function init(){
 if(!enabled())return;
 resetAddressState();
 let attempts=0;
 const timer=setInterval(()=>{
  observe();
  const wrapped=wrapOpen();
  if(wrapped&&document.getElementById('os-wizard-shell')){
   clearInterval(timer);startResourceRefresh();
  }else if(++attempts>160)clearInterval(timer);
 },250);
}

window.OperatorServiceWorkspaceReviewV3={enabled,enhance,loadResources,selectDriver,selectTruck,searchAddress,selectAddress};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();

/* AuxiliOS · Servicios · puente canónico Chofer → Remito v2 */
(()=>{'use strict';
const P3=window.AuxiliosPhase3=window.AuxiliosPhase3||{queue:[],history:[],adHocDrafts:[],loading:false,timer:null,selectedServiceId:null,initialized:false,view:'active',activationInFlight:false,signedEditData:null,correctionInFlight:false};
try{P3.earlyStart=new Set(JSON.parse(sessionStorage.getItem('auxilios.earlyStart')||'[]').map(String))}catch(_){P3.earlyStart=new Set()}
P3.adHocDrafts=P3.adHocDrafts||[];
/* Íconos Lucide del sistema visual (ui/icons.svg). */
const ico=(name,cls='')=>`<svg class="ax-icon${cls?' '+cls:''}" aria-hidden="true"><use href="/ui/icons.svg#${name}"/></svg>`;
const STATUS={assigned:{label:'Asignado',icon:'●',tone:'blue'},at_origin:{label:'Arribado',icon:'⌖',tone:'violet'},completed:{label:'Finalizado',icon:'✓',tone:'green'},cancelled:{label:'Anulado',icon:'×',tone:'red'}};
/* El chofer informa POR QUÉ no se prestó el servicio, no que lo canceló.
   Todas las opciones arrancaban con "Cancelado por…" y el bloque se titulaba
   "Motivo de cancelación": el que marcaba ACTIVADO creía estar cancelando, y
   un activado se puede cobrar igual. */
const ACTIVATION_REASONS=[
 ['absent_or_not_towable','Socio ausente / vehículo no apto'],
 ['provider','La Prestadora lo dio de baja'],
 ['us','Lo dimos de baja nosotros'],
 ['other','Otro']
];
const PAYMENT_LABELS={cash:'Efectivo',transfer:'Transferencia',card:'Tarjeta',mercado_pago:'Mercado Pago',other:'Otro',not_collected:'No cobrado',to_define:'A definir'};
const TOLL_COVERAGE_LABELS={mixed_manual:'Uno y Uno',provider_roundtrip:'A cargo de la prestadora',customer_roundtrip:'A cargo del cliente'};
const EXTRA_FIELDS={
 'Email del cliente':{key:'customer_email',id:'phase3-service-email',label:'Email del cliente',type:'email'},
 'Observaciones':{key:'operator_notes',id:'phase3-service-operator-notes',label:'Observaciones del servicio',type:'textarea'},
 'Orden de compra':{key:'purchase_order_number',id:'phase3-service-purchase-order',label:'Orden de compra',type:'text'}
};
const db=()=>typeof _db!=='undefined'?_db:null;
const profile=()=>typeof PERFIL_USUARIO!=='undefined'?PERFIL_USUARIO:null;
const role=()=>String(profile()?.roles?.name||profile()?.role||'').toLowerCase();
const isDriver=()=>role()==='chofer';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const notify=(m,t='info')=>typeof window.toast==='function'?window.toast(m,t):console[t==='error'?'error':'log'](m);
const currentDate=()=>new Date().toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'});
const money=value=>Number(value||0).toLocaleString('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0});
const originDestinationKm=meters=>{
  const value=Number(meters);
  return Number.isFinite(value)&&value>0?`${(Math.round(value/100)/10).toLocaleString('es-AR')} km`:'Sin cálculo Maps';
};
const tollCoverageLabel=mode=>TOLL_COVERAGE_LABELS[String(mode||'')]||'Sin formato configurado';
function customerExcessSummary(s,{compact=false}={}){
  const data=s.customer_excess_summary||{};
  const total=Number(data.total_amount||s.customer_amount_due||0);
  const items=Array.isArray(data.items)?data.items.filter(Boolean):[];
  const count=Number(data.count||items.length||0);
  if(total<=0&&count<=0)return'';
  const first=items[0]||{};
  const firstName=first.concept_name||'Excedente';
  const remaining=Math.max(0,count-1);
  return`<div class="p3-summary-block p3-customer-excess ${compact?'compact':''}"><div class="p3-summary-line"><span>Excedentes</span><strong>${esc(firstName)} · ${esc(money(first.total_amount||total))}</strong></div>${remaining?`<div class="p3-summary-line muted"><span></span><strong>+${remaining} más · ${esc(money(total))}</strong></div>`:''}</div>`;
}
function tollSummary(s,{compact=false}={}){
  const data=s.toll_charge_summary||{};
  const groups=Array.isArray(data.groups)?data.groups.filter(group=>Number(group.count||0)>0):[];
  if(!groups.length)return'';
  const labels={customer:'A cargo del socio',provider:'A cargo de la prestadora',mixed:'Mixto'};
  const rows=groups.map(group=>{
    const items=Array.isArray(group.items)?group.items.filter(Boolean):[];
    const first=items[0]||{};
    const extra=Math.max(0,Number(group.count||items.length||0)-1);
    const amount=Number(first.amount||group.total_amount||0);
    const suffix=extra?` (+${extra} más)`:'';
    return`<div class="p3-summary-line"><span>${esc(labels[group.key]||group.label||'Peajes')}</span><strong>${esc(first.toll_name||'Peaje')} · ${esc(money(amount))}${suffix}</strong></div>`;
  }).join('');
  return`<div class="p3-summary-block p3-toll-summary ${compact?'compact':''}"><div class="p3-summary-title">Peajes</div>${rows}</div>`;
}
function customerSummary(s){
  const name=String(s.customer_name||'').trim(),phone=String(s.customer_phone||'').trim();
  if(!name&&!phone)return'';
  return`<div class="p3-fact-row p3-customer-fact"><span>Socio</span><strong>${esc(name||'Sin nombre')}${phone?` <em>${esc(phone)}</em>`:''}</strong></div>`;
}
function draftState(s){return s.remito_status==='pendiente'?`<div class="p3-draft-state">${ico('check','ax-icon-sm')}Borrador guardado</div>`:''}
function serviceFacts(s,{compact=false}={}){
  const vehicle=s.vehicle_make_model||'Vehículo sin informar',plate=s.vehicle_plate||'Sin patente';
  return`${draftState(s)}<div class="p3-facts">${customerSummary(s)}<div class="p3-fact-row p3-vehicle-fact"><span>Vehículo</span><strong>${esc(vehicle)} <em>${esc(plate)}</em></strong></div><div class="p3-fact-row"><span>${s.single_address?'Dirección':'Origen'}</span><strong>${esc(s.origin||'—')}</strong></div>${s.single_address?'':`<div class="p3-fact-row"><span>Destino</span><strong>${esc(s.destination||'—')}</strong></div>`}<div class="p3-fact-row"><span>KM</span><strong>${esc(originDestinationKm(s.origin_destination_distance_meters))}</strong></div><div class="p3-fact-row p3-toll-coverage-fact"><span>Formato de cobro de peajes</span><strong>${esc(tollCoverageLabel(s.toll_coverage_mode))}</strong></div>${customerExcessSummary(s,{compact})}${tollSummary(s,{compact})}</div>`;
}
function injectAssets(){if(document.getElementById('phase3-service-bridge-css'))return;const l=document.createElement('link');l.id='phase3-service-bridge-css';l.rel='stylesheet';l.href='/operator-service-bridge.css';document.head.appendChild(l)}
function applyDriverModuleLabels(){if(!isDriver())return;const nav=document.getElementById('nav-remitos'),screen=document.getElementById('screen-remitos');const label=nav?.querySelector('.nav-label'),icon=nav?.querySelector('.nav-icon');if(label)label.textContent='Servicios';if(icon)icon.innerHTML='<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="6.2" cy="13.8" r="1.6" fill="currentColor"/><path d="M6.2 10.4a3.4 3.4 0 0 1 3.4 3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M6.2 7a6.8 6.8 0 0 1 6.8 6.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M6.2 3.6a10.2 10.2 0 0 1 10.2 10.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';if(screen?.classList.contains('active')){const title=document.getElementById('topbar-title'),sub=document.getElementById('topbar-sub');if(title)title.textContent='Servicios';if(sub)sub.textContent='Asignados e historial'}}
function updateAssignedBadge(){if(!isDriver())return;try{window.dispatchEvent(new CustomEvent('auxilios:driver-queue-updated'));}catch(_){}const count=P3.queue.filter(s=>['assigned','at_origin'].includes(s.status)).length;const nav=document.getElementById('nav-remitos');if(nav){let badge=nav.querySelector('.p3-nav-badge');if(!badge){badge=document.createElement('span');badge.className='p3-nav-badge';nav.appendChild(badge)}badge.textContent=String(count);badge.hidden=count===0}const bell=document.getElementById('tb-bell'),bellBadge=document.getElementById('alx-bell-badge');if(bell)bell.title=count?`${count} servicio${count===1?'':'s'} asignado${count===1?'':'s'}`:'Sin servicios asignados';if(bellBadge){bellBadge.textContent=String(count);bellBadge.style.display=count?'flex':'none'}}
function hookNavigation(){if(window.__p3DriverNavHook||typeof window.goTo!=='function')return false;const base=window.goTo;window.goTo=(name,...args)=>{const result=base(name,...args);if(name==='remitos')applyDriverModuleLabels();return result};window.__p3DriverNavHook=true;return true}
function ensurePreviewModal(){if(document.getElementById('p3-service-preview'))return;document.body.insertAdjacentHTML('beforeend',`<div id="p3-service-preview" class="p3-preview" hidden><button type="button" class="p3-preview-backdrop" onclick="cerrarPreviewServicio()" aria-label="Cerrar"></button><section role="dialog" aria-modal="true" aria-labelledby="p3-preview-title"><div class="p3-preview-grip" aria-hidden="true"><span></span></div><header><div><small id="p3-preview-kicker">Servicio asignado</small><h2 id="p3-preview-title">Servicio</h2></div><button type="button" onclick="cerrarPreviewServicio()" aria-label="Cerrar">×</button></header><div id="p3-preview-body"></div><footer id="p3-preview-actions"></footer></section></div>`);bindPreviewGesture(document.getElementById('p3-service-preview'))}
function injectPanel(){if(!isDriver()||document.getElementById('phase3-driver-services'))return;const remitos=document.getElementById('screen-remitos');if(!remitos)return;remitos.classList.add('p3-driver-remitos');const header=remitos.querySelector('.sec-header'),anchor=header||remitos;anchor.insertAdjacentHTML(header?'afterend':'afterbegin',`<section id="phase3-driver-services" class="p3-driver-panel p3-remitos-assigned" data-location="remitos" aria-live="polite"><div class="p3-panel-head"><div class="p3-head-actions"><div class="p3-view-switch" role="group" aria-label="Ver"><button id="p3-view-active" type="button" class="p3-refresh" onclick="cambiarVistaServiciosChofer('active')">Activos</button><button id="p3-view-history" type="button" class="p3-refresh" onclick="cambiarVistaServiciosChofer('history')">Historial</button></div><button type="button" class="p3-refresh p3-new-ad-hoc" onclick="abrirRemitoSinAsignacion()">${ico('plus')}Sin asignación</button><button type="button" class="p3-refresh p3-refresh-icon" onclick="recargarServiciosChofer()" aria-label="Actualizar">${ico('refresh-cw')}</button></div></div><div id="phase3-driver-services-list" class="p3-service-list"><div class="p3-empty">Buscando servicios…</div></div></section>`);ensurePreviewModal();applyDriverModuleLabels()}
function setRefreshBusy(busy){
  const panel=document.getElementById('phase3-driver-services');
  if(!panel)return;
  panel.classList.toggle('p3-is-refreshing',busy);
  const button=panel.querySelector('.p3-refresh-icon');
  if(button){button.disabled=busy;button.setAttribute('aria-busy',String(busy));button.setAttribute('aria-label',busy?'Actualizando servicios…':'Actualizar');}
  const list=document.getElementById('phase3-driver-services-list');
  if(list)list.setAttribute('aria-busy',String(busy));
  let feedback=panel.querySelector('.p3-refresh-feedback');
  if(!feedback){feedback=document.createElement('div');feedback.className='p3-refresh-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');feedback.innerHTML='<div><span aria-hidden="true"></span><b></b></div>';panel.querySelector('.p3-panel-head')?.after(feedback);}
  feedback.querySelector('b').textContent=busy?'Actualizando servicios…':'';
}
function refreshDriverServices(){
  if(P3.manualRefreshPromise)return P3.manualRefreshPromise;
  if(!isDriver()||!db())return Promise.resolve(false);
  setRefreshBusy(true);
  P3.manualRefreshPromise=(async()=>{
    try{
      // Wait for every started read, even when another one fails.
      const reads=[Promise.resolve().then(()=>loadQueue({force:true}))];
      if(typeof window.cargarRemitos==='function')reads.push(Promise.resolve().then(()=>window.cargarRemitos()));
      // Keep very fast responses perceptible without delaying the network reads.
      reads.push(new Promise(resolve=>setTimeout(resolve,350)));
      const results=await Promise.allSettled(reads);
      const failed=results.find(result=>result.status==='rejected');
      if(failed)notify('No se pudo actualizar. Volvé a intentar.','error');
      return !failed&&results[0].value!==false;
    }finally{
      setRefreshBusy(false);
      P3.manualRefreshPromise=null;
    }
  })();
  return P3.manualRefreshPromise;
}
window.recargarServiciosChofer=refreshDriverServices;
async function loadQueue({silent=false,force=false}={}){
  if(!isDriver()||!db())return false;
  if(P3.loading){if(force)P3.reloadAfterCurrent=true;return P3.queuePromise||false}
  P3.loading=true;
  P3.queuePromise=(async()=>{
    try{
      const {data,error}=await db().rpc('get_driver_operator_queue_v4');
      if(error)throw error;
      const next=Array.isArray(data)?data:[],known=P3.knownServiceIds;
      P3.queue=next;
      /* Un servicio que aparece entre dos refrescos es una asignación nueva:
         se avisa para que el chofer no tenga que estar mirando la lista. */
      const ids=new Set(next.map(item=>String(item.service_id||item.id||'')).filter(Boolean));
      if(known){const fresh=next.filter(item=>{const id=String(item.service_id||item.id||'');return id&&!known.has(id)});if(fresh.length)notify(fresh.length===1?`Nuevo servicio asignado: ${fresh[0].service_order_number||fresh[0].service_number||''}`.trim():`${fresh.length} servicios nuevos asignados`,'success')}
      P3.knownServiceIds=ids;
      render();
      return true;
    }catch(e){
      if(!silent)notify(e.message||'No se pudieron cargar los servicios','error');
      const list=document.getElementById('phase3-driver-services-list');
      if(list)list.innerHTML='<div class="p3-empty">No se pudo actualizar la información.</div>';
      return false;
    }finally{
      P3.loading=false;
      P3.queuePromise=null;
      const reload=P3.reloadAfterCurrent;
      P3.reloadAfterCurrent=false;
      if(reload)await loadQueue({silent:true});
    }
  })();
  return P3.queuePromise;
}
function render(){injectPanel();applyDriverModuleLabels();updateAssignedBadge();const list=document.getElementById('phase3-driver-services-list'),panel=document.getElementById('phase3-driver-services'),screen=document.getElementById('screen-remitos');if(!list||!panel||!screen)return;const history=P3.view==='history';document.getElementById('p3-view-active')?.classList.toggle('active',!history);document.getElementById('p3-view-history')?.classList.toggle('active',history);screen.classList.toggle('p3-hide-remitos-archive',!history);panel.classList.toggle('p3-history-only',history);if(history){list.innerHTML='';return}const assigned=P3.queue,adHoc=P3.adHocDrafts;panel.classList.toggle('has-services',assigned.length+adHoc.length>0);if(!assigned.length&&!adHoc.length){list.innerHTML=`<div class="p3-empty"><span>${ico('circle-check','ax-icon-lg')}</span><b>No tenés servicios asignados</b><small>Cuando Operaciones te asigne uno, aparece acá y te avisamos.</small></div>`;return}const expanded=new Set([...list.querySelectorAll('.p3-driver-task')].filter(el=>el.querySelector('details[open]')).map(el=>el.dataset.serviceId));const now=Date.now(),later=assigned.filter(x=>isProgrammed(x,now)).sort((a,b)=>scheduledAt(a)-scheduledAt(b)),current=assigned.filter(x=>!later.includes(x));list.innerHTML=queueBanner()+current.map(activeCard).join('')+adHoc.map(activeAdHocCard).join('')+(current.length+adHoc.length?'':`<div class="p3-empty p3-empty-now"><b>No tenés servicios para ahora</b><small>Abajo están los programados.</small></div>`)+programmedSection(later);list.querySelectorAll('.p3-driver-task').forEach(el=>{if(expanded.has(el.dataset.serviceId))el.querySelector('details')?.setAttribute('open','');});const adHocBtn=panel.querySelector('.p3-new-ad-hoc');if(adHocBtn)adHocBtn.innerHTML=`${ico('plus')}${queueMode()?'Servicio en el camino':'Sin asignación'}`}
/* Tarjeta del chofer: arriba el N° y la empresa con el estado; después los datos
   del servicio; abajo lo que pasa al tocarla. La fecha no va: siempre es hoy. */
function cardAction(s){return s.remito_action==='edit'||s.can_edit_remito?'Ver remito firmado':s.remito_action==='complete'||s.can_complete_remito?'Completar remito':'Ver servicio'}
/* Cola del chofer (varios servicios a la vez). Solo si el chofer tiene el interruptor multi_service_v1. */
function queueMode(){return P3.queue.some(x=>x.multi_service)}
function queueStarted(s){return Boolean(s.trip_started||s.trip_id)||s.status==='at_origin'}
function queueState(s){if(!queueMode())return null;const i=P3.queue.findIndex(x=>String(x.service_id)===String(s.service_id));if(i<0)return null;const started=queueStarted(s),firstWaiting=P3.queue.findIndex(x=>!queueStarted(x)&&!isProgrammed(x));return{pos:i+1,started,next:!started&&i===firstWaiting,waiting:!started&&i!==firstWaiting,blockerPos:firstWaiting+1}}
function queueBanner(){if(!queueMode())return'';const cur=P3.queue.filter(queueStarted).length,wait=P3.queue.length-cur;if(P3.queue.length<2)return'';return`<div class="p3-queue-banner">Tenés <b>${cur} ${cur===1?'servicio en curso':'servicios en curso'}</b>${wait?` y ${wait} en cola`:''}.</div>`}
/* Programados: servicios para más adelante (más de 2 h). Van aparte, con fecha y hora; se pueden
   empezar antes, pero se pide confirmar (a veces el horario pactado se adelanta). */
const SCHEDULE_AHEAD_MS=2*60*60*1000;
function scheduledAt(s){const t=s&&s.scheduled_for?new Date(s.scheduled_for).getTime():NaN;return Number.isFinite(t)?t:null}
function isProgrammed(s,now=Date.now()){const t=scheduledAt(s);if(t==null||t-now<=SCHEDULE_AHEAD_MS)return false;return!(queueStarted(s)||s.remito_status==='pendiente'||s.remito_action==='edit'||s.can_edit_remito)&&!P3.earlyStart?.has(String(s.service_id))}
function dayKey(d){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires'}).format(d)}
function whenLabel(s,now=Date.now()){const t=scheduledAt(s);if(t==null)return'';const d=new Date(t),hm=d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'America/Argentina/Buenos_Aires'});const k=dayKey(d);if(k===dayKey(new Date(now)))return`Hoy ${hm}`;if(k===dayKey(new Date(now+864e5)))return`Mañana ${hm}`;const day=d.toLocaleDateString('es-AR',{weekday:'short',timeZone:'America/Argentina/Buenos_Aires'}).replace('.','')+' '+d.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',timeZone:'America/Argentina/Buenos_Aires'});return`${day.charAt(0).toUpperCase()+day.slice(1)} ${hm}`}
function untilLabel(s,now=Date.now()){const t=scheduledAt(s);if(t==null)return'';const m=Math.max(0,Math.round((t-now)/6e4));if(m<60)return`faltan ${m} min`;const h=Math.floor(m/60),r=m%60;if(h<24)return`faltan ${h} h${r?` ${r} min`:''}`;const dd=Math.floor(h/24);return`faltan ${dd} ${dd===1?'día':'días'}${h%24?` y ${h%24} h`:''}`}
function programmedCard(s){
  const order=s.service_order_number||'Sin N° prestación';
  return`<article class="p3-service-card is-actionable p3-programmed-card" role="button" tabindex="0" data-service-id="${esc(s.service_id)}" aria-label="Ver prestación programada ${esc(order)}, ${esc(whenLabel(s))}" onclick="abrirPreviewServicio(this.dataset.serviceId)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();abrirPreviewServicio(this.dataset.serviceId)}">
    <header class="p3-card-head">
      <div class="p3-card-id"><strong class="p3-order-value">${esc(order)}</strong><span class="p3-card-company">${esc(s.company_name||'Empresa sin informar')}</span></div>
      <span class="p3-when">${ico('calendar-clock')}${esc(whenLabel(s))}</span>
    </header>
    <p class="p3-programmed-route">${ico('route')}<span>${esc(s.origin||'Origen sin informar')}${s.single_address||!s.destination?'':` → ${esc(s.destination)}`}</span></p>
    <footer class="p3-card-foot p3-card-programmed"><span>Programado · ${esc(untilLabel(s))}</span>${ico('chevron-right')}</footer>
  </article>`;
}
function programmedSection(list){if(!list.length)return'';return`<section class="p3-programmed" aria-label="Servicios programados"><h3 class="p3-programmed-title">${ico('calendar-clock')}<span>Programados</span><small>${list.length}</small></h3><p class="p3-programmed-note">Para más adelante. Si te piden adelantarlo, abrilo y confirmá que lo empezás ahora.</p>${list.map(programmedCard).join('')}</section>`}
/* Empezar antes de hora: no se bloquea, se confirma. */
function confirmEarlyStart(id){const s=findService(id);if(!s)return;const body=document.getElementById('p3-preview-body'),actions=document.getElementById('p3-preview-actions');body.innerHTML=`<div class="p3-early-confirm">${ico('calendar-clock','ax-icon-lg')}<b>¿Empezás este servicio ahora?</b><p>Está programado para <strong>${esc(whenLabel(s).replace(/^./,c=>c.toLowerCase()))}</strong> (${esc(untilLabel(s))}). Si el horario se adelantó, confirmá y seguí como siempre.</p></div>`;actions.innerHTML=`<button class="p3-preview-primary" type="button" data-id="${esc(id)}" onclick="empezarServicioAntes(this.dataset.id)">Sí, lo empiezo ahora</button><button class="p3-preview-secondary" type="button" data-id="${esc(id)}" onclick="abrirPreviewServicio(this.dataset.id)">Volver</button>`;const kicker=document.getElementById('p3-preview-kicker');if(kicker)kicker.textContent='Servicio programado';P3.previewStep='early';slidePreview('next')}
function startEarly(id){if(!P3.earlyStart)P3.earlyStart=new Set();P3.earlyStart.add(String(id));try{const k='auxilios.earlyStart';const prev=JSON.parse(sessionStorage.getItem(k)||'[]');sessionStorage.setItem(k,JSON.stringify([...new Set([...prev,String(id)])]))}catch(_){}render();openPreview(id)}
function driverQuickLinks(s){
  const address=String((s.status==='at_origin'?s.destination||s.origin:s.origin)||'').trim();
  const phone=String(s.customer_phone||'').trim(),dial=phone.replace(/[\s().-]/g,'');
  const map=address?`<a href="https://www.google.com/maps/dir/?api=1&destination=${esc(encodeURIComponent(address))}&travelmode=driving" target="_blank" rel="noopener noreferrer" aria-label="${s.status==='at_origin'?'Navegar al destino':'Navegar al origen'}">${ico('map-pin')}Navegar</a>`:'';
  const call=/^\+?\d{6,15}$/.test(dial)?`<a href="tel:${esc(dial)}" aria-label="Llamar al cliente">${ico('phone')}Llamar</a>`:'';
  return map||call?`<div class="p3-quick-links">${map}${call}</div>`:'';
}
function driverCardLabel(s){if(s.remito_action==='edit'||s.can_edit_remito)return'Ver servicio';if(s.remito_action==='complete'||s.can_complete_remito)return s.status==='at_origin'?'Completar remito':'Llegué al origen';return'Ver servicio';}
function driverCardAction(id,button){const s=findService(id);if(!s||!isDriver())return;const q=queueState(s);if(q&&!q.started||isProgrammed(s)||s.remito_action==='edit'||s.can_edit_remito)return openPreview(id);if(s.remito_action==='complete'||s.can_complete_remito){if(s.status==='at_origin')return window.abrirRemitoServicio(id);return markArrived(id,button);}return openPreview(id);}
window.accionTarjetaServicioChofer=driverCardAction;
function activeCard(s){
  const meta=STATUS[s.status]||STATUS.assigned;
  const order=s.service_order_number||'Sin N° prestación';
  const q=queueState(s);
  const pill=q?(q.started?['blue','En curso']:q.next?['amber','Siguiente']:['','En cola']):[meta.tone,meta.label];
  const foot=q&&!q.started?['','Ver servicio']:['',driverCardLabel(s)];
  return`<article class="p3-service-card p3-driver-task${q?' p3-queue-card':''}${q?.waiting?' p3-queue-wait':''}" data-service-id="${esc(s.service_id)}" aria-label="Servicio ${esc(order)}">
    <header class="p3-card-head">
      <div class="p3-card-id">${q?`<span class="p3-queue-num${q.started?' is-current':q.next?' is-next':''}">${q.pos}</span>`:''}<strong class="p3-order-value">${esc(order)}</strong><span class="p3-card-company">${esc(s.company_name||'Empresa sin informar')}</span></div>
      <span class="p3-status ${pill[0]}">${esc(pill[1])}</span>
    </header>
    <div class="p3-task-main"><div class="p3-task-vehicle"><strong>${esc(s.vehicle_plate||'Sin patente')}</strong><span>${esc(s.vehicle_make_model||'Vehículo sin informar')}</span></div><div class="p3-task-route"><div><i aria-hidden="true"></i><span><small>${s.single_address?'Dirección':'Origen'}</small><b>${esc(s.origin||'Origen sin informar')}</b></span></div>${!s.single_address?`<div><i aria-hidden="true"></i><span><small>Destino</small><b>${esc(s.destination||'Destino sin informar')}</b></span></div>`:''}</div>${driverQuickLinks(s)}${draftState(s)}</div>
    <footer class="p3-task-actions">${q?.waiting?`<small>Se habilita después del ${q.blockerPos}º</small>`:''}<button type="button" class="p3-task-primary ${foot[0]}" data-id="${esc(s.service_id)}" onclick="accionTarjetaServicioChofer(this.dataset.id,this)">${esc(foot[1])}${ico('chevron-right')}</button>${foot[1]!=='Ver servicio'?`<button type="button" class="p3-task-secondary" data-id="${esc(s.service_id)}" onclick="abrirPreviewServicio(this.dataset.id)">Ver servicio</button>`:''}</footer>
  </article>`;
}
function draftRouteMetrics(r){const data=window.AuxiliosDraftRoute?.get(r);return{origin_destination_distance_meters:data?.meters,origin_destination_duration_seconds:data?.seconds,draft_route_status:data?.state==='ready'?'':data?.state==='offline'?'Sin conexión':data?.state==='unavailable'?'No disponible':'Calculando…'};}
function assignedRouteInput(s){return{...s,id:'service:'+s.service_id};}
function assignedRouteMetrics(s){
 const meters=Number(s.origin_destination_distance_meters),seconds=Number(s.origin_destination_duration_seconds),hasDistance=Number.isFinite(meters)&&meters>0,hasTime=Number.isFinite(seconds)&&seconds>0;
 if(hasDistance&&hasTime)return{};
 const input=assignedRouteInput(s);void window.AuxiliosDraftRoute?.ensure(input);const data=window.AuxiliosDraftRoute?.get(input),status=data?.state==='ready'?'':data?.state==='unavailable'?'No disponible':data?.state==='offline'?'Sin conexión':'Calculando…';
 return{origin_destination_distance_meters:hasDistance?meters:data?.meters,origin_destination_duration_seconds:hasTime?seconds:data?.seconds,route_distance_status:hasDistance?'':status,route_time_status:hasTime?'':status};
}
function activeAdHocCard(r){
  const id=String(r.id),order=r.nroSrv||r.nro||'Sin N° prestación';
  return`<article class="p3-service-card p3-driver-task p3-ad-hoc-draft" data-remito-id="${esc(id)}" aria-label="Servicio ${esc(order)}"><header class="p3-card-head"><div class="p3-card-id"><strong class="p3-order-value">${esc(order)}</strong><span class="p3-card-company">Sin asignación · ${esc(r.fecha||currentDate())}</span></div><span class="p3-draft-state">${ico('check','ax-icon-sm')}Borrador guardado</span></header><div class="p3-task-main"><div class="p3-task-vehicle"><strong>${esc(r.patente||'Sin patente')}</strong><span>${esc(r.marca||'Vehículo sin informar')}</span></div><div class="p3-task-route"><div><i aria-hidden="true"></i><span><small>Origen</small><b>${esc(r.origen||'Origen sin informar')}</b></span></div><div><i aria-hidden="true"></i><span><small>Destino</small><b>${esc(r.destino||'Destino sin informar')}</b></span></div></div>${driverQuickLinks({origin:r.origen,customer_phone:r.telefono})}</div><footer class="p3-task-actions"><button type="button" class="p3-task-primary" data-id="${esc(id)}" onclick="abrirPreviewRemitoSinAsignacion(this.dataset.id)">Ver servicio${ico('chevron-right')}</button></footer></article>`;
}
function closePreview(){const modal=document.getElementById('p3-service-preview');P3.resetPreviewGesture?.();if(modal)modal.hidden=true;P3.previewStep='facts';document.body.classList.remove('p3-preview-open');if(P3.previewOpener?.isConnected)P3.previewOpener.focus({preventScroll:true});}
// The full card is tappable; nested links and buttons keep their own actions.
document.addEventListener('click',event=>{
  const card=event.target.closest?.('#phase3-driver-services .p3-driver-task');
  if(!card||event.defaultPrevented||event.target.closest('button,a,input,select,textarea,summary,label,[contenteditable="true"]'))return;
  if(String(window.getSelection?.()||'').trim())return;
  card.setAttribute('tabindex','-1');card.focus({preventScroll:true});
  if(card.dataset.remitoId)openAdHocPreview(card.dataset.remitoId);
  else if(card.dataset.serviceId)openPreview(card.dataset.serviceId);
});
function bindPreviewGesture(modal){
  if(!modal||modal.dataset.gestureReady)return;
  modal.dataset.gestureReady='true';
  const sheet=modal.querySelector(':scope > section'),backdrop=modal.querySelector('.p3-preview-backdrop');
  if(!sheet)return;
  let drag=null,animation=null;
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const interactive=target=>target.closest('button,a,input,select,textarea,summary,label,[contenteditable="true"]');
  const reset=()=>{
    if(animation){animation.onfinish=null;animation.cancel();animation=null;}
    drag=null;sheet.style.removeProperty('transform');sheet.style.removeProperty('animation');
    sheet.classList.remove('p3-sheet-dragging');backdrop?.style.removeProperty('opacity');
  };
  P3.resetPreviewGesture=reset;
  function begin(x,y,target,pointerId){
    if(modal.hidden||animation||interactive(target)||sheet.scrollTop>1)return false;
    drag={x,y,dy:0,start:performance.now(),pointerId,active:false};return true;
  }
  function move(x,y,event){
    if(!drag)return;
    const dy=y-drag.y,dx=x-drag.x;
    if(!drag.active){
      if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)){drag=null;return;}
      if(dy<-8){drag=null;return;}
      if(dy<8||Math.abs(dx)>dy)return;
      drag.active=true;sheet.style.animation='none';sheet.classList.add('p3-sheet-dragging');
    }
    if(event.cancelable)event.preventDefault();
    drag.dy=Math.max(0,Math.min(dy,sheet.clientHeight));
    if(!reduced()){
      sheet.style.transform='translateY('+drag.dy+'px)';
      if(backdrop)backdrop.style.opacity=String(Math.max(.3,1-drag.dy/Math.max(1,sheet.clientHeight)));
    }
  }
  function finish(cancelled=false){
    if(!drag)return;
    const current=drag;drag=null;
    sheet.classList.remove('p3-sheet-dragging');
    const speed=current.dy/Math.max(1,performance.now()-current.start);
    const dismiss=!cancelled&&current.active&&(current.dy>=90||(current.dy>=45&&speed>.55));
    if(!current.active){backdrop?.style.removeProperty('opacity');return;}
    if(reduced()||typeof sheet.animate!=='function'){if(dismiss)closePreview();else reset();return;}
    const to=dismiss?Math.max(sheet.clientHeight,window.innerHeight):0;
    animation=sheet.animate([{transform:'translateY('+current.dy+'px)'},{transform:'translateY('+to+'px)'}],{duration:dismiss?220:180,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});
    animation.onfinish=()=>{
      const done=animation;animation=null;
      if(done){done.onfinish=null;done.cancel();}
      if(dismiss)closePreview();
      else{sheet.style.removeProperty('transform');backdrop?.style.removeProperty('opacity');}
    };
  }
  sheet.addEventListener('touchstart',event=>{
    if(event.touches.length!==1){finish(true);return;}
    const touch=event.touches[0];begin(touch.clientX,touch.clientY,event.target,null);
  },{passive:true});
  sheet.addEventListener('touchmove',event=>{
    if(event.touches.length!==1){finish(true);return;}
    const touch=event.touches[0];move(touch.clientX,touch.clientY,event);
  },{passive:false});
  sheet.addEventListener('touchend',()=>finish());
  sheet.addEventListener('touchcancel',()=>finish(true));
  sheet.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='mouse'||event.button!==0||!event.target.closest('.p3-preview-grip,section > header'))return;
    if(begin(event.clientX,event.clientY,event.target,event.pointerId))sheet.setPointerCapture?.(event.pointerId);
  });
  sheet.addEventListener('pointermove',event=>{if(drag?.pointerId===event.pointerId)move(event.clientX,event.clientY,event)});
  sheet.addEventListener('pointerup',event=>{if(drag?.pointerId===event.pointerId)finish()});
  sheet.addEventListener('pointercancel',event=>{if(drag?.pointerId===event.pointerId)finish(true)});
  sheet.addEventListener('lostpointercapture',()=>{if(drag?.pointerId!=null)finish(true)});
}
document.addEventListener('keydown',event=>{const modal=document.getElementById('p3-service-preview');if(!modal||modal.hidden)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closePreview();return;}if(event.key==='Tab'){const items=[...modal.querySelectorAll('section button:not(:disabled),section a[href],section input,section textarea,section summary')].filter(el=>el.getClientRects().length);const first=items[0],last=items.at(-1);if(event.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){event.preventDefault();first?.focus();}}},true);
function previewTripMetrics(s){
 const seconds=Number(s.origin_destination_duration_seconds),minutes=Number.isFinite(seconds)&&seconds>0?Math.max(1,Math.ceil(seconds/60)):null;
 const duration=minutes===null?'No disponible':minutes<60?`${minutes} min`:`${Math.floor(minutes/60)} h${minutes%60?' '+minutes%60+' min':''}`;
 const data=s.customer_excess_summary,items=Array.isArray(data?.items)?data.items.filter(Boolean):[];
 const excess=items.length?items.map(item=>{const q=Number(item.quantity),amount=item.total_amount;return`<div class="p3-sheet-excess-item"><span>${esc(item.concept_name||'Concepto sin detalle')}${Number.isFinite(q)&&q>0?' · '+esc(q)+' un.':''}</span><b>${amount!==null&&amount!==undefined&&Number.isFinite(Number(amount))?esc(money(Number(amount))):'Importe sin informar'}</b></div>`;}).join(''):data&&Number(data.total_amount)>0?`<span>Importe registrado · ${esc(money(Number(data.total_amount)))}</span>`:'<span>Sin excedentes informados</span>';
 return`<div class="p3-sheet-metrics"><div><span>Kilómetros del recorrido</span><strong>${esc(s.route_distance_status||s.draft_route_status||originDestinationKm(s.origin_destination_distance_meters))}</strong></div><div><span>Tiempo aproximado</span><strong>${esc(s.route_time_status||s.draft_route_status||duration)}</strong></div><div class="p3-sheet-toll-format"><span>Peajes:</span><strong>${esc(tollCoverageLabel(s.toll_coverage_mode))}</strong></div><div class="p3-sheet-excess"><span>Excedentes</span><div>${excess}</div></div></div>`;
}
function previewBody(s){
 const phone=String(s.customer_phone||'').trim(),dial=phone.replace(/[\s().-]/g,'');
 const call=/^\+?\d{6,15}$/.test(dial)?`<a class="p3-client-call" href="tel:${esc(dial)}">${ico('phone')}Llamar</a>`:'';
 const route=(label,address)=>`<div class="p3-sheet-place"><span><small>${label}</small><b>${esc(address||'Dirección sin informar')}</b></span>${address?`<a href="https://www.google.com/maps/dir/?api=1&destination=${esc(encodeURIComponent(address))}&travelmode=driving" target="_blank" rel="noopener noreferrer" aria-label="Navegar a ${label.toLowerCase()}">${ico('map-pin')}</a>`:''}</div>`;
 return`<div class="p3-sheet-client"><small>CLIENTE</small><div><h3>${esc(s.customer_name||'Nombre sin informar')}</h3>${call}</div>${phone?`<p>${esc(phone)}</p>`:'<p>Teléfono sin informar</p>'}${s.customer_document?`<p>DNI/CUIT ${esc(s.customer_document)}</p>`:''}</div><div class="p3-sheet-vehicle"><strong>${esc(s.vehicle_plate||'Sin patente')}</strong><span>${esc(s.vehicle_make_model||'Vehículo sin informar')}</span></div><div class="p3-sheet-route">${route(s.single_address?'Dirección':'Origen',s.origin)}${s.single_address?'':route('Destino',s.destination)}</div><div class="p3-sheet-commercial">${previewTripMetrics(s)}${draftState(s)}</div>`;
}
/* Pasar de la ficha a "Marcar como activado" (y volver) deslizando, no de golpe:
   el chofer ve que entró a otro paso y que "Volver" lo trae de nuevo a la ficha. */
function slidePreview(dir){['p3-preview-body','p3-preview-actions'].forEach(id=>{const el=document.getElementById(id);if(!el)return;el.classList.remove('p3-step-next','p3-step-prev');void el.offsetWidth;el.classList.add(dir==='prev'?'p3-step-prev':'p3-step-next');el.addEventListener('animationend',()=>el.classList.remove('p3-step-next','p3-step-prev'),{once:true})});const sheet=document.querySelector('#p3-service-preview > section');if(sheet)sheet.scrollTop=0}
function previewWasActivation(){const modal=document.getElementById('p3-service-preview');return !!modal&&!modal.hidden&&P3.previewStep==='activation'}
function openPreview(id){const s=findService(id);if(!s)return notify('El servicio ya no está disponible','error');ensurePreviewModal();const back=previewWasActivation();P3.previewStep='facts';const modal=document.getElementById('p3-service-preview'),title=document.getElementById('p3-preview-title'),body=document.getElementById('p3-preview-body'),actions=document.getElementById('p3-preview-actions');modal.dataset.draftRouteId='';modal.dataset.serviceRouteId=String(id);const programmed=isProgrammed(s);document.getElementById('p3-preview-kicker').textContent=programmed?`Programado · ${whenLabel(s)}`:'Servicio asignado';title.textContent=s.service_order_number||'Sin N° prestación';body.innerHTML=(programmed?`<div class="p3-when-banner">${ico('calendar-clock')}<span><b>${esc(whenLabel(s))}</b> · ${esc(untilLabel(s))}</span></div>`:'')+previewBody({...s,...assignedRouteMetrics(s)});const qs=queueState(s);if(programmed){actions.innerHTML=`<button class="p3-preview-primary" type="button" data-id="${esc(id)}" onclick="confirmarEmpezarAntes(this.dataset.id)">Empezar ahora</button><small>Es para ${esc(whenLabel(s).replace(/^./,c=>c.toLowerCase()))}. Podés empezarlo antes si te lo piden.</small>`}else if(qs?.waiting){actions.innerHTML=`<small>Este servicio está ${qs.pos}º en tu cola. Se habilita cuando empieces el ${qs.blockerPos}º.</small>`}else if(s.remito_action==='edit'||s.can_edit_remito){actions.innerHTML=`<button class="p3-preview-primary" type="button" data-id="${esc(id)}" onclick="cerrarPreviewServicio();abrirRemitoServicio(this.dataset.id)">Editar remito</button><small>Firmado. Sólo se pueden corregir cargos, evidencia y observaciones antes del cierre.</small>`}else if(s.remito_action==='complete'||s.can_complete_remito){/* Llegué al origen: el arribo queda con esta hora y el remito se puede completar después (por ejemplo, al terminar, para anotar los peajes). */const arrived=s.status==='at_origin',hhmm=arrived&&(s.driver_arrived_at||s.arrived_at)?new Date(s.driver_arrived_at||s.arrived_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',hour12:false}):'';actions.innerHTML=(arrived?`<div class="p3-arrived-chip">${ico('map-pin')}<span>Llegaste al origen${hhmm?` a las ${esc(hhmm)}`:''}</span></div><button class="p3-preview-primary" type="button" data-id="${esc(id)}" onclick="cerrarPreviewServicio();abrirRemitoServicio(this.dataset.id)">Completar remito</button>`:`<button class="p3-preview-primary p3-arrive-btn" type="button" data-id="${esc(id)}" onclick="marcarLlegadaServicio(this.dataset.id,this)">${ico('map-pin')}Llegué al origen</button><small>Tocalo al llegar. El remito lo podés completar después, cuando termines.</small><button class="p3-preview-secondary" type="button" data-id="${esc(id)}" onclick="cerrarPreviewServicio();abrirRemitoServicio(this.dataset.id)">Completar remito ahora</button>`)+`<div class="p3-other-actions p3-visible-actions"><button class="p3-preview-secondary" type="button" data-id="${esc(id)}" onclick="confirmarServicioActivado(this.dataset.id)">Marcar como activado</button><small>Usar si llegaste y el servicio no se prestó. No equivale a anularlo.</small></div>`}else{actions.innerHTML='<small>El remito firmado está disponible en el historial.</small>'}const firstOpen=modal.hidden;if(firstOpen)P3.previewOpener=document.activeElement;modal.hidden=false;document.body.classList.add('p3-preview-open');if(firstOpen)modal.querySelector('section>header button')?.focus({preventScroll:true});if(back)slidePreview('prev')}
function openAdHocPreview(id){const r=P3.adHocDrafts.find(item=>String(item.id)===String(id));if(!r)return notify('El borrador ya no está disponible','error');ensurePreviewModal();const back=previewWasActivation();P3.previewStep='facts';const order=r.nroSrv||r.nro||'Sin N° prestación',modal=document.getElementById('p3-service-preview'),body=document.getElementById('p3-preview-body'),actions=document.getElementById('p3-preview-actions');document.getElementById('p3-preview-kicker').textContent='Servicio sin asignación';document.getElementById('p3-preview-title').textContent=order;modal.dataset.serviceRouteId='';modal.dataset.draftRouteId=String(id);void window.AuxiliosDraftRoute?.ensure(r);body.innerHTML=previewBody({...draftRouteMetrics(r),customer_name:r.cliente,customer_phone:r.telefono,customer_document:r.cuit,vehicle_plate:r.patente,vehicle_make_model:r.marca,origin:r.origen,destination:r.destino,remito_status:'pendiente',company_name:'Sin asignación'});actions.innerHTML=`<button class="p3-preview-primary" type="button" data-id="${esc(id)}" onclick="cerrarPreviewServicio();abrirRemitoSinAsignacionPendiente(this.dataset.id)">Completar remito</button><div class="p3-other-actions p3-visible-actions"><button class="p3-preview-secondary" type="button" data-id="${esc(id)}" onclick="confirmarRemitoSinAsignacionActivado(this.dataset.id)">Marcar como activado</button><small>Usar si llegaste y el servicio no se prestó.</small><button class="p3-preview-link danger" type="button" data-id="${esc(id)}" onclick="confirmarAnularIngresoChofer(this.dataset.id)">Anular este ingreso</button></div>`;const firstOpen=modal.hidden;if(firstOpen)P3.previewOpener=document.activeElement;modal.hidden=false;document.body.classList.add('p3-preview-open');if(firstOpen)modal.querySelector('section>header button')?.focus({preventScroll:true});if(back)slidePreview('prev')}
function confirmAdHocActivated(id){const r=P3.adHocDrafts.find(item=>String(item.id)===String(id));if(!r)return;const choices=ACTIVATION_REASONS.map(([value,label])=>`<label class="p3-activation-reason"><input type="radio" name="p3-ad-hoc-activation-reason" data-reason-code="${esc(value)}"><span>${label}</span></label>`).join('');document.getElementById('p3-preview-body').innerHTML=`<div class="p3-activation-confirm"><b>¿Marcar este servicio como ACTIVADO?</b><p>El borrador se anulará. Operador o Administración definirán si la salida se cobra.</p><fieldset><legend>Motivo de la activación</legend>${choices}</fieldset></div>`;document.getElementById('p3-preview-actions').innerHTML=`<button class="p3-preview-primary" type="button" onclick="abrirPreviewRemitoSinAsignacion('${esc(id)}')">Volver</button><button class="p3-preview-secondary danger" type="button" data-id="${esc(id)}" onclick="marcarRemitoSinAsignacionActivado(this.dataset.id)">Confirmar activado</button>`;const kicker=document.getElementById('p3-preview-kicker');if(kicker)kicker.textContent='Marcar como activado';P3.previewStep='activation';slidePreview('next')}
/* Anular un ingreso sin asignación (cargado repetido o por error). Mismo paso deslizable que "Marcar como activado". */
const ANNUL_REASONS=[['duplicate','Lo cargué repetido'],['entry_error','Me equivoqué al cargarlo'],['customer_cancelled','El cliente canceló'],['other','Otro motivo']];
function confirmAdHocAnnul(id){const r=P3.adHocDrafts.find(item=>String(item.id)===String(id));if(!r)return notify('El borrador ya no está disponible','error');const choices=ANNUL_REASONS.map(([value,label])=>`<label class="p3-activation-reason"><input type="radio" name="p3-annul-reason" value="${esc(value)}"><span>${label}</span></label>`).join('');document.getElementById('p3-preview-body').innerHTML=`<div class="p3-activation-confirm p3-annul-confirm"><b>¿Anular este ingreso?</b><p>El borrador se anula y Operaciones deja de verlo. No se puede deshacer.</p><fieldset><legend>Motivo</legend>${choices}</fieldset><div class="p3-annul-detail" id="p3-annul-detail" data-open="false"><label class="p3-annul-detail-inner"><span>Contá brevemente qué pasó</span><textarea id="p3-annul-detail-text" rows="2" maxlength="200"></textarea></label></div></div>`;document.getElementById('p3-preview-actions').innerHTML=`<button class="p3-preview-primary" type="button" data-id="${esc(id)}" onclick="abrirPreviewRemitoSinAsignacion(this.dataset.id)">Volver</button><button class="p3-preview-secondary danger" type="button" id="p3-annul-confirm-btn" data-id="${esc(id)}" disabled onclick="anularIngresoChofer(this.dataset.id)">Anular ingreso</button>`;const body=document.getElementById('p3-preview-body'),detail=document.getElementById('p3-annul-detail'),text=document.getElementById('p3-annul-detail-text'),btn=document.getElementById('p3-annul-confirm-btn');const sync=()=>{const reason=body.querySelector('input[name="p3-annul-reason"]:checked')?.value;const other=reason==='other';detail.dataset.open=String(other);btn.disabled=!reason||(other&&!text.value.trim());if(other&&detail.dataset.open==='true'&&document.activeElement?.name==='p3-annul-reason')text.focus({preventScroll:true});};body.querySelector('.p3-annul-confirm').addEventListener('change',sync);text.addEventListener('input',sync);const kicker=document.getElementById('p3-preview-kicker');if(kicker)kicker.textContent='Anular ingreso';P3.previewStep='activation';slidePreview('next')}
async function annulAdHoc(id){if(P3.annulInFlight)return;const reason=document.querySelector('input[name="p3-annul-reason"]:checked')?.value;if(!reason)return notify('Elegí el motivo','warning');const detail=document.getElementById('p3-annul-detail-text')?.value.trim()||null;if(reason==='other'&&!detail)return notify('Contá brevemente qué pasó','warning');const btn=document.getElementById('p3-annul-confirm-btn');P3.annulInFlight=true;if(btn){btn.disabled=true;btn.setAttribute('aria-busy','true');btn.textContent='Anulando…';}try{const {error}=await db().rpc('annul_driver_service_intake_v1',{p_remito_id:Number(id),p_reason_code:reason,p_reason_detail:detail});if(error)throw error;P3.adHocDrafts=P3.adHocDrafts.filter(item=>String(item.id)!==String(id));closePreview();render();window.operationFeedback?.('Ingreso anulado','Operaciones ya no lo ve como pendiente.','success',2400);if(typeof window.cargarRemitos==='function')await window.cargarRemitos();return true}catch(e){notify(e.message||'No se pudo anular el ingreso','error');if(btn){btn.disabled=false;btn.removeAttribute('aria-busy');btn.textContent='Anular ingreso';}return false}finally{P3.annulInFlight=false}}
async function markAdHocActivated(id){if(P3.activationInFlight)return notify('La activación ya se está confirmando.','info');const reasonCode=document.querySelector('input[name="p3-ad-hoc-activation-reason"]:checked')?.dataset?.reasonCode;if(!reasonCode)return notify('Seleccioná el motivo de la activación','warning');const detail=reasonCode==='other'?'Otro motivo informado por el Chofer':null;P3.activationInFlight=true;try{const {data,error}=await db().rpc('mark_driver_ad_hoc_draft_activated_v1',{p_remito_id:Number(id),p_reason_code:reasonCode,p_reason_detail:detail});if(error)throw error;if(data?.status!=='anulado')throw new Error('No se confirmó el estado ACTIVADO');P3.adHocDrafts=P3.adHocDrafts.filter(item=>String(item.id)!==String(id));closePreview();render();window.operationFeedback?.('Servicio activado','La salida quedó registrada correctamente.','success',2400);if(typeof window.cargarRemitos==='function')await window.cargarRemitos();return true}catch(e){notify(e.message||'No se pudo marcar el servicio como ACTIVADO','error');return false}finally{P3.activationInFlight=false}}
function confirmActivated(id){
  const s=findService(id);if(!s)return;
  const body=document.getElementById('p3-preview-body'),actions=document.getElementById('p3-preview-actions');
  const detail=s.remito_id&&s.remito_status==='pendiente'?'El borrador guardado se anulará y el servicio quedará pendiente de cierre administrativo.':'La salida quedará registrada como Activado y estarás disponible para otro servicio.';const nota=' Operaciones o Administración van a definir después si la salida se cobra.';
  const choices=ACTIVATION_REASONS.map(([value,label])=>`<label class="p3-activation-reason"><input type="radio" name="p3-activation-reason" data-reason-code="${esc(value)}"><span>${label}</span></label>`).join('');
  body.innerHTML=`<div class="p3-activation-confirm"><b>¿Marcar este servicio como ACTIVADO?</b><p>${detail}${nota}</p><fieldset><legend>Motivo de la activación</legend>${choices}</fieldset></div>`;   /* sólo la pregunta: el chofer se concentra en una cosa */
  actions.innerHTML=`<button class="p3-preview-primary" type="button" onclick="abrirPreviewServicio('${esc(id)}')">Volver</button><button class="p3-preview-secondary danger" type="button" data-id="${esc(id)}" onclick="marcarServicioActivado(this.dataset.id)">Confirmar activado</button>`;
  const kicker=document.getElementById('p3-preview-kicker');if(kicker)kicker.textContent='Marcar como activado';
  P3.previewStep='activation';slidePreview('next');
}
async function markArrived(id,button){const s=findService(id);if(!s)return notify('El servicio ya no está disponible','error');if(P3.arriveInFlight)return;P3.arriveInFlight=true;if(button){button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Marcando…';}try{if(!s.trip_id){const t=await db().rpc('ensure_operator_service_trip_v2',{p_service_id:id});if(!t.error)s.trip_id=t.data?.trip_id||s.trip_id;}const {data,error}=await db().rpc('driver_mark_arrived_v1',{p_service_id:id});if(error)throw error;s.status='at_origin';s.driver_arrived_at=s.arrived_at=data?.arrived_at||new Date().toISOString();s.can_complete_remito=true;s.remito_action='complete';notify('Llegada al origen registrada','success');await loadQueue({silent:true,force:true});openPreview(id);}catch(e){notify(e.message||'No se pudo marcar la llegada','error');if(button){button.disabled=false;button.textContent='Llegué al origen';}}finally{P3.arriveInFlight=false;button?.removeAttribute('aria-busy');}}
async function markActivated(id){
  if(P3.activationInFlight){notify('La activación ya se está confirmando. Esperá un momento.','info');return false}
  const reasonCode=document.querySelector('input[name="p3-activation-reason"]:checked')?.dataset?.reasonCode;
  if(!reasonCode){notify('Seleccioná el motivo de la activación','warning');return false}
  const button=document.querySelector('#p3-preview-actions [data-id]');P3.activationInFlight=true;if(button){button.disabled=true;button.textContent='Confirmando…'}
  try{const {data,error}=await db().rpc('mark_driver_operator_service_activated_v3',{p_service_id:id,p_reason_code:reasonCode,p_reason_detail:null});if(error)throw error;if(data?.business_status!=='activated')throw new Error('El servicio no confirmó el estado ACTIVADO');P3.queue=P3.queue.filter(s=>String(s.service_id)!==String(id));closePreview();render();/* Cuando hubo salida el servicio NO se cierra: queda arribado para que el operador ajuste los km y lo finalice. Decirlo evita que el chofer crea que quedó algo a medias. */window.operationFeedback?.('Servicio activado','Ya estás disponible para otro servicio. Operaciones realizará el cierre.','success',2400);await loadQueue({silent:true});return true}catch(e){notify(e.message||'No se pudo marcar el servicio como ACTIVADO','error');if(button){button.disabled=false;button.textContent='Confirmar activado'}return false}finally{P3.activationInFlight=false}
}
function findService(id){return P3.queue.find(x=>String(x.service_id)===String(id))||null}
function setValue(id,value){const el=document.getElementById(id);if(!el||value==null||value==='')return;el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}
/* Tipo de servicio de una sola dirección: el servicio ya trae destino = origen,
   así que el chofer no ve ni completa Destino. */
function setSingleAddressRemito(single){const group=document.getElementById('rem-destino')?.closest('.form-group');if(group)group.classList.toggle('p3-single-address-hidden',!!single);document.body.classList.toggle('p3-single-address',!!single);}
function prefillRemito(s){setSingleAddressRemito(!!s.single_address);if(s.single_address&&!s.destination)s={...s,destination:s.origin,destination_place_id:s.origin_place_id,destination_lat:s.origin_lat,destination_lng:s.origin_lng,destination_formatted_address:s.origin_formatted_address};setValue('rem-nro-prestadora',s.service_order_number||s.service_number);setValue('rem-patente',s.vehicle_plate);setValue('rem-marca-modelo',s.vehicle_make_model);setValue('rem-origen',s.origin);setValue('rem-destino',s.destination);setValue('rem-cliente',s.customer_name);setValue('rem-telefono',s.customer_phone);setValue('rem-cuit',s.customer_document);window.AuxiliosRemitoMobileV3?.restoreMapLocations?.(s);const plateBox=document.querySelector('[data-remito-field="vehicle_plate"]');if(plateBox)delete plateBox.dataset.typed;window.AuxiliosRemitoMobileV3?.syncPlateField?.();const marker=document.getElementById('phase3-remito-context')||document.createElement('div');marker.id='phase3-remito-context';marker.className='p3-remito-context';marker.innerHTML=`<b>${esc(s.service_order_number||s.service_number)}</b> · Servicio asignado`;document.getElementById('remitos-nuevo')?.prepend(marker)}
async function restoreServiceDraft(s){
  if(!s?.service_id)return false;
  const {data,error}=await db().rpc('get_driver_operator_service_remito_draft_v1',{p_service_id:s.service_id});if(error)throw error;if(!data)return false;
  setValue('rem-nro',data.nro_remito);setValue('rem-nro-prestadora',data.nro_servicio||s.service_order_number);window.AuxiliosRemitoMobileV3?.restoreMapLocations?.({...data,km:data.km_reales});setValue('rem-patente',data.vehicle_plate);setValue('rem-marca-modelo',data.vehicle_make_model);setValue('rem-origen',data.origin);setValue('rem-destino',data.destination);setValue('rem-km',data.km_reales);setValue('rem-cliente',data.customer_name);setValue('rem-cuit',data.customer_document);setValue('rem-telefono',data.customer_phone);setValue('rem-observaciones',data.observations);
  await window.AuxiliosRemitoAddonsV2?.restore?.(data.addons||null);return true;
}
function extraFieldMarkup(meta){return meta.type==='textarea'?`<label><span>${esc(meta.label)} *</span><textarea id="${meta.id}" rows="2"></textarea></label>`:`<label><span>${esc(meta.label)} *</span><input id="${meta.id}" type="${meta.type}" autocomplete="off"></label>`;}
async function renderRequiredCompletion(s){const root=document.getElementById('remitos-nuevo');if(!root||!s?.service_id)return;document.getElementById('phase3-service-required')?.remove();try{const {data,error}=await db().rpc('validate_operator_service_required_fields_v2',{p_service_id:s.service_id,p_overrides:overridesFromRemito()});if(error)throw error;const missing=Array.isArray(data?.missing)?data.missing:[],extras=missing.map(label=>EXTRA_FIELDS[label]).filter(Boolean);if(!extras.length)return;const box=document.createElement('section');box.id='phase3-service-required';box.className='p3-required-card';box.innerHTML=`<div><b>Completá antes de firmar</b><small>Estos campos fueron definidos como obligatorios en Configuración → Servicios → Formulario.</small></div><div class="p3-required-grid">${extras.map(extraFieldMarkup).join('')}</div>`;document.getElementById('phase3-remito-context')?.after(box)}catch(e){notify(e.message||'No se pudieron validar los campos obligatorios','error')}}
async function openSignedEdit(id){
  try{const {data,error}=await db().rpc('get_driver_signed_remito_edit_v1',{p_service_id:id});if(error)throw error;if(!data?.can_edit)throw new Error('El remito ya no admite correcciones');P3.selectedServiceId=id;P3.signedEditData=data;sessionStorage.removeItem('auxilios_driver_ad_hoc_mode');sessionStorage.setItem('auxilios_phase3_service_id',id);sessionStorage.setItem('auxilios_phase3_signed_edit','1');await window.AuxiliosRemitoAddonsV2?.loadReference?.();window.goTo?.('remitos');window.showRemitosView?.('nuevo');setTimeout(()=>void(async()=>{try{window.AuxiliosRemitoMobileV3?.setAdHocMode?.(false);window.AuxiliosRemitoMobileV3?.setSignedEditMode?.(true,data);window.remWizardReset?.();await window.AuxiliosRemitoAddonsV2?.restore?.(data.addons||null);setValue('rem-observaciones',data.remito?.observations);window.remWizardAbrirEdicionFirmada?.();window.AuxiliosRemitoMobileV3?.syncEvidence?.()}catch(inner){notify(inner.message||'No se pudo preparar la edición','error')}})(),120)}catch(e){notify(e.message||'No se pudo abrir el remito firmado','error')}
}
async function saveSignedEdit(){
  if(P3.correctionInFlight)return false;const serviceId=sessionStorage.getItem('auxilios_phase3_service_id');if(!serviceId||sessionStorage.getItem('auxilios_phase3_signed_edit')!=='1')return false;
  const validation=window.AuxiliosRemitoAddonsV2?.validate?.();if(validation&&!validation.ok){notify(validation.errors?.[0]||'Revisá peajes y excedentes','warning');return false}
  const button=document.getElementById('rem-btn-next');P3.correctionInFlight=true;if(button){button.disabled=true;button.textContent='Guardando…'}
  try{const operationId=crypto.randomUUID();const bundle=window.AuxiliosRemitoAddonsV2?.collect?.()||{payload:{addons_version:2,tolls:[],excesses:[],evidence:[]},files:[]};const payload=await window.AuxiliosRemitoAddonsV2?.uploadEvidence?.(bundle,operationId)||bundle.payload;payload.observations=document.getElementById('rem-observaciones')?.value||'';const {data,error}=await db().rpc('update_driver_signed_remito_v1',{p_service_id:serviceId,p_payload:payload,p_client_operation_id:operationId});if(error)throw error;if(data?.remito_status!=='firmado')throw new Error('No se confirmó la corrección del remito');await window._guardarTogglesRemito?.(data?.remito_id,payload);sessionStorage.removeItem('auxilios_phase3_signed_edit');sessionStorage.removeItem('auxilios_phase3_service_id');P3.selectedServiceId=null;P3.signedEditData=null;window.AuxiliosRemitoMobileV3?.setSignedEditMode?.(false);window.showRemitosView?.('lista');notify('Cambios guardados. El remito volvió a revisión.','success');await loadQueue({silent:true});return true}catch(e){notify(e.message||'No se pudieron guardar los cambios','error');return false}finally{P3.correctionInFlight=false;if(button){button.disabled=false;button.textContent='Guardar cambios'}}
}
/* Completar el remito puede tardar (viaje, datos de referencia, borrador): se muestra "Preparando el remito…" si pasan más de 250 ms, para que la pantalla no parezca congelada. */
function remitoLoading(){let timer=setTimeout(()=>{timer=null;if(document.getElementById('p3-remito-loading'))return;const el=document.createElement('div');el.id='p3-remito-loading';el.className='p3-remito-loading';el.setAttribute('role','status');el.setAttribute('aria-live','polite');el.innerHTML='<div><svg class="ax-icon p3-spin" aria-hidden="true"><use href="/ui/icons.svg#loader-circle"/></svg><strong>Preparando el remito…</strong><small>Esperá un momento.</small></div>';document.body.appendChild(el)},250),fail=setTimeout(()=>stop(),25000);function stop(){clearTimeout(timer);clearTimeout(fail);document.getElementById('p3-remito-loading')?.remove()}return stop}
async function openRemito(id){const s=findService(id);if(!s)return notify('El servicio ya no está disponible','error');if(s.remito_action==='edit'||s.can_edit_remito)return openSignedEdit(id);if(!(s.remito_action==='complete'||s.can_complete_remito))return notify('Este remito ya no se puede completar','warning');/* Un remito sin asignación guardado para después deja su viaje abierto y la base no deja tomar otro servicio: se avisa antes de empezar, no al finalizar. */const pendiente=!s.trip_id&&(P3.adHocDrafts||[]).find(r=>r&&r.id);if(pendiente){const n=pendiente.nroSrv||pendiente.nro||'sin asignación';notify(`Tenés el remito ${n} sin terminar. Completalo o marcalo como activado antes de empezar este servicio.`,'warning');return openAdHocPreview(pendiente.id)}const stopLoading=remitoLoading();try{if(!s.trip_id){const {data,error}=await db().rpc('ensure_operator_service_trip_v2',{p_service_id:id});if(error)throw error;s.trip_id=data?.trip_id||s.trip_id}P3.selectedServiceId=id;P3.signedEditData=null;sessionStorage.removeItem('auxilios_phase3_signed_edit');sessionStorage.removeItem('auxilios_driver_ad_hoc_mode');sessionStorage.setItem('auxilios_phase3_service_id',id);window.AuxiliosRemitoMobileV3?.setSignedEditMode?.(false);await window.AuxiliosRemitoAddonsV2?.loadReference?.();if(typeof window.goTo==='function')window.goTo('remitos');if(typeof window.showRemitosView==='function')window.showRemitosView('nuevo');setTimeout(()=>void(async()=>{try{window.AuxiliosRemitoMobileV3?.setAdHocMode?.(false);window.remWizardReset?.();prefillRemito(s);await restoreServiceDraft(s);await renderRequiredCompletion(s)}catch(error){notify(error.message||'No se pudo recuperar el borrador del remito','error')}finally{stopLoading()}})(),120)}catch(e){stopLoading();notify(String(e.message||e).replace(/^.*(?:JORNADA_REQUERIDA|VIAJE_EN_CURSO|COLA_EN_ORDEN):\s*/i,''),'error')}}
async function resolveAssignedServiceForOpenRemito(){await loadQueue({silent:true,force:true});const input=document.getElementById('rem-nro'),number=String(input?.value||'');if(queueMode()||input?.dataset?.operationContext==='driver-ad-hoc'||number&&(P3.adHocDrafts||[]).some(r=>String(r.nro)===number))return null;const active=P3.queue.filter(s=>['assigned','at_origin'].includes(s.status)&&(s.remito_action==='complete'||s.can_complete_remito));if(active.length!==1)return null;const service=active[0];P3.selectedServiceId=service.service_id;sessionStorage.removeItem('auxilios_driver_ad_hoc_mode');sessionStorage.setItem('auxilios_phase3_service_id',service.service_id);window.AuxiliosRemitoMobileV3?.setAdHocMode?.(false);return service}
async function openAdHocRemito(){setSingleAddressRemito(false);try{await loadQueue({silent:true,force:true});const assigned=queueMode()?null:P3.queue.find(s=>['assigned','at_origin'].includes(s.status)&&(s.remito_action==='complete'||s.can_complete_remito));if(assigned){notify(`Tenés el servicio ${assigned.service_order_number||assigned.service_number||'asignado'} activo. Completá ese remito antes de crear uno sin asignación.`,'warning');openPreview(assigned.service_id);return false}P3.selectedServiceId=null;P3.signedEditData=null;sessionStorage.removeItem('auxilios_phase3_signed_edit');sessionStorage.removeItem('auxilios_phase3_service_id');sessionStorage.setItem('auxilios_driver_ad_hoc_mode','1');window.AuxiliosRemitoMobileV3?.setSignedEditMode?.(false);await window.AuxiliosRemitoAddonsV2?.loadReference?.();if(typeof window.goTo==='function')window.goTo('remitos');if(typeof window.showRemitosView==='function')window.showRemitosView('nuevo');setTimeout(()=>{window.AuxiliosRemitoMobileV3?.setAdHocMode?.(true);window.remWizardReset?.();const root=document.getElementById('remitos-nuevo');if(!root)return;const marker=document.getElementById('phase3-remito-context')||document.createElement('div');marker.id='phase3-remito-context';marker.className='p3-remito-context';marker.innerHTML='<b>Servicio sin asignación</b> · Quedará pendiente de vinculación por Operaciones';root.prepend(marker)},120);return true}catch(e){notify(e.message||'No se pudieron validar los servicios activos','error');return false}}
async function openAdHocDraft(id){const draft=P3.adHocDrafts.find(item=>String(item.id)===String(id));if(!draft)return notify('El borrador ya no está disponible','error');if(typeof window.completarRemitoPendiente!=='function')return notify('No se pudo abrir el borrador','error');try{await window.AuxiliosRemitoAddonsV2?.loadReference?.();window.completarRemitoPendiente(draft);const {data,error}=await db().rpc('get_driver_remito_addons_v2',{p_remito_id:Number(draft.id)});if(error)throw error;await window.AuxiliosRemitoAddonsV2?.restore?.(data||null)}catch(error){notify(error.message||'No se pudo recuperar el borrador','error')}}
function syncDriverRemitos(remitos){P3.adHocDrafts=(Array.isArray(remitos)?remitos:[]).filter(r=>r.estado==='pendiente'&&(r.driverIntakeId||r.documentSource==='driver_ad_hoc')&&!r.operatorServiceId);P3.adHocDrafts.forEach(r=>void window.AuxiliosDraftRoute?.ensure(r));if(P3.view==='active')render()}
function overridesFromRemito(d={}){return{customer_name:d.cliente||document.getElementById('rem-cliente')?.value||'',customer_phone:d.telefono||document.getElementById('rem-telefono')?.value||'',customer_email:d.email||document.getElementById('phase3-service-email')?.value||'',vehicle_plate:d.patente||document.getElementById('rem-patente')?.value||'',vehicle_make_model:d.marca||document.getElementById('rem-marca-modelo')?.value||'',origin:d.origen||document.getElementById('rem-origen')?.value||'',destination:d.destino||document.getElementById('rem-destino')?.value||'',operator_notes:d.observaciones||document.getElementById('phase3-service-operator-notes')?.value||document.getElementById('rem-observaciones')?.value||'',purchase_order_number:document.getElementById('phase3-service-purchase-order')?.value||''}}
async function completeBeforeSignature(serviceId,d){const payload=overridesFromRemito(d),{data,error}=await db().rpc('complete_driver_operator_service_fields_v2',{p_service_id:serviceId,p_payload:payload});if(error)throw error;if(!data?.valid){const missing=Array.isArray(data?.missing)?data.missing:[];throw new Error(`Antes de firmar completá: ${missing.join(', ')}`)}return data}
// Firmar y finalizar no pide confirmación: al guardar se muestra el aviso de remito finalizado.
function wrapRemitoSave(){if(window.__phase3RemitoWrappedV2||typeof window.guardarRemitoCompleto!=='function')return false;const original=window.guardarRemitoCompleto;window.guardarRemitoCompleto=async function(datosRemito){let serviceId=sessionStorage.getItem('auxilios_phase3_service_id');if(!serviceId&&sessionStorage.getItem('auxilios_driver_ad_hoc_mode')==='1'&&navigator.onLine){const detected=await resolveAssignedServiceForOpenRemito();serviceId=detected?.service_id||null;if(serviceId)notify(`El remito se vinculó al servicio ${detected.service_order_number||detected.service_number||'asignado'}`,'info')}if(!serviceId)return original.apply(this,arguments);const signed=!!datosRemito?.firmaDataURL||(typeof hasSig!=='undefined'&&hasSig),isOnline=navigator.onLine;try{if(signed&&isOnline){await completeBeforeSignature(serviceId,datosRemito)}datosRemito.operator_service_id=serviceId;const result=await original.apply(this,arguments);if(!result)return result;if(signed&&isOnline){sessionStorage.removeItem('auxilios_phase3_service_id');P3.selectedServiceId=null;document.getElementById('phase3-service-required')?.remove()}else if(signed){notify('Firma guardada. Pendiente de sincronización para confirmar ARRIBADO.','info')}void loadQueue({silent:true}).catch(()=>{});return result}catch(e){notify(e.message||'No se pudo guardar el remito','error');return false}};window.__phase3RemitoWrappedV2=true;return true}
function setView(view){P3.view=view==='history'?'history':'active';render();if(typeof window.cargarRemitos==='function')Promise.resolve(window.cargarRemitos()).catch(e=>notify(e.message||'No se pudieron actualizar los remitos','error'));if(P3.view==='history')return;loadQueue()}
/* El chofer recibe una señal privada en tiempo real y consulta el detalle por
   la RPC autorizada. La consulta cada 10 s respalda las desconexiones; nunca
   se transmiten datos comerciales de operator_services. */
function stopDriverRealtime(){const channel=P3.liveChannel;P3.liveChannel=null;P3.liveDriverId=null;P3.liveNeedsReconnect=false;clearTimeout(P3.liveRefreshTimer);P3.liveRefreshTimer=null;if(channel&&db()?.removeChannel)Promise.resolve(db().removeChannel(channel)).catch(()=>{});}
function scheduleDriverQueueRefresh(){P3.queueDirty=true;clearTimeout(P3.liveRefreshTimer);if(!isDriver()||document.visibilityState==='hidden'||navigator.onLine===false)return;P3.liveRefreshTimer=setTimeout(()=>{P3.liveRefreshTimer=null;P3.queueDirty=false;void loadQueue({silent:true,force:true});},80);}
function startDriverRealtime(){const id=profile()?.user_id||(typeof USUARIO_ACTUAL!=='undefined'?USUARIO_ACTUAL?.id:null),client=db();if(!isDriver()||!id||typeof client?.channel!=='function'){if(P3.liveChannel)stopDriverRealtime();return;}if(P3.liveChannel&&P3.liveDriverId===id&&!P3.liveNeedsReconnect)return;stopDriverRealtime();P3.liveDriverId=id;try{P3.liveGeneration=(P3.liveGeneration||0)+1;const channel=client.channel('driver-services:'+id+':'+P3.liveGeneration);P3.liveChannel=channel;const changed=()=>{if(P3.liveChannel===channel&&P3.liveDriverId===id)scheduleDriverQueueRefresh();};for(const event of ['INSERT','UPDATE'])channel.on('postgres_changes',{event,schema:'public',table:'driver_service_updates',filter:'driver_id=eq.'+id},changed);channel.subscribe(status=>{if(P3.liveChannel!==channel)return;if(status==='SUBSCRIBED'){P3.liveNeedsReconnect=false;changed();}else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status))P3.liveNeedsReconnect=true;});}catch(_){P3.liveNeedsReconnect=true;}}
const POLL_MS=10000;
function startPolling(){clearInterval(P3.timer);if(!isDriver())return;P3.timer=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine!==false){startDriverRealtime();loadQueue({silent:true})}},POLL_MS);if(!P3.focusBound){P3.focusBound=true;const resume=()=>{startDriverRealtime();loadQueue({silent:true,force:true});};window.addEventListener('focus',resume);window.addEventListener('online',resume);window.addEventListener('pageshow',resume);window.addEventListener('pagehide',stopDriverRealtime);}}
function init(){if(P3.initialized||!db()||!profile())return false;P3.initialized=true;injectAssets();hookNavigation();injectPanel();let attempts=0;const wrap=setInterval(()=>{if(wrapRemitoSave()||++attempts>60)clearInterval(wrap)},250);if(isDriver()){syncDriverRemitos(window._driverRemitosSnapshot||[]);loadQueue({silent:true});if(typeof window.cargarRemitos==='function')Promise.resolve(window.cargarRemitos()).catch(()=>{});startPolling();startDriverRealtime();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){startDriverRealtime();loadQueue({silent:true,force:true});if(typeof window.cargarRemitos==='function')Promise.resolve(window.cargarRemitos()).catch(()=>{})}})}return true}
window.addEventListener('auxilios:draft-route',event=>{const detail=event.detail;if(detail?.id?.startsWith('service:')){const id=detail.id.slice(8),s=findService(id),modal=document.getElementById('p3-service-preview');if(s&&window.AuxiliosDraftRoute?.key(assignedRouteInput(s))===detail.key&&modal&&!modal.hidden&&modal.dataset.serviceRouteId===id&&P3.previewStep==='facts')openPreview(id);return;}const r=P3.adHocDrafts.find(item=>String(item.id)===detail?.id);if(!r||window.AuxiliosDraftRoute?.key(r)!==detail.key)return;const modal=document.getElementById('p3-service-preview');if(modal&&!modal.hidden&&modal.dataset.draftRouteId===String(r.id)&&P3.previewStep==='facts')openAdHocPreview(r.id);});
window.addEventListener('online',()=>P3.adHocDrafts.forEach(r=>void window.AuxiliosDraftRoute?.ensure(r)));
Object.assign(window,{confirmarEmpezarAntes:confirmEarlyStart,empezarServicioAntes:startEarly,actualizarServiciosAsignados:()=>loadQueue({force:true}),actualizarRemitosActivosChofer:syncDriverRemitos,abrirPreviewServicio:openPreview,abrirPreviewRemitoSinAsignacion:openAdHocPreview,cerrarPreviewServicio:closePreview,confirmarServicioActivado:confirmActivated,marcarLlegadaServicio:markArrived,marcarServicioActivado:markActivated,confirmarRemitoSinAsignacionActivado:confirmAdHocActivated,confirmarAnularIngresoChofer:confirmAdHocAnnul,anularIngresoChofer:annulAdHoc,marcarRemitoSinAsignacionActivado:markAdHocActivated,abrirRemitoServicio:openRemito,abrirRemitoSinAsignacion:openAdHocRemito,abrirRemitoSinAsignacionPendiente:openAdHocDraft,guardarEdicionRemitoFirmado:saveSignedEdit,cambiarVistaServiciosChofer:setView,resolverServicioAsignadoParaRemito:resolveAssignedServiceForOpenRemito,obtenerServicioAsignadoRemito:()=>findService(sessionStorage.getItem('auxilios_phase3_service_id'))});
const boot=setInterval(()=>{if(init())clearInterval(boot)},250);setTimeout(()=>clearInterval(boot),30000);
})();

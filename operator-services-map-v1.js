/* AuxiliOS · Servicios / Mapa. Operational addresses, never device positions.
   Uses the same enriched rows, filters, page and lifecycle as the service table. */
(()=>{'use strict';
const O=()=>window.OperatorServices,L=()=>window.OperatorServiceLifecycleV2;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=n=>`<svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#${n}"/></svg>`;
const idOf=s=>String(s?.service_id||'');
const code=s=>s?.service_order_number||s?.service_number||'Servicio';
const number=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
function coordinate(lat,lng){const a=number(lat),b=number(lng);return a!==null&&b!==null&&Math.abs(a)<=85&&Math.abs(b)<=180?{lat:a,lng:b}:null;}
const same=(a,b)=>!!a&&!!b&&Math.abs(a.lat-b.lat)+Math.abs(a.lng-b.lng)<.00001;
const distance=(a,b)=>Math.hypot((a.lng-b.lng)*Math.cos((a.lat+b.lat)*Math.PI/360),a.lat-b.lat)*111195;
function pointsFor(s){
  const single=s.single_address===true||s.driver_activated||O()?.concept?.(s.primary_concept_id)?.single_address===true;
  const origin=coordinate(s.origin_lat,s.origin_lng),destination=single?null:coordinate(s.destination_lat,s.destination_lng);
  return{origin,destination,single,any:!!(origin||destination),route:!!(origin&&destination&&!same(origin,destination))};
}
// Validate responses requested specifically for A→B; billing geometry is never borrowed.
function operationalPath(path,p){return p.route&&path.length>1&&distance(path[0],p.origin)<120&&distance(path.at(-1),p.destination)<120?path:[];}
const geometryKey=s=>JSON.stringify([idOf(s),s.origin_lat,s.origin_lng,s.destination_lat,s.destination_lng,pointsFor(s).single,s.origin,s.destination]);
const scopeKey=()=>JSON.stringify(['view','query','status','company','driverFilter','truckFilter','periodSel','historyPage'].map(k=>O().S[k]));
function stamp(value){if(!value||!Number.isFinite(new Date(value).getTime()))return'No registrado';return new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));}
function crew(s){return s.logistics_type==='third_party'?{title:s.outsourced_provider_name||'Tercerizado sin informar',sub:'Logística tercerizada'}:{title:s.truck_label?'Móvil '+String(s.truck_label).replace(/^m[oó]vil\s*/i,''):'Móvil sin asignar',sub:s.driver_name||O()?.driver?.(O()?.serviceDriverId?.(s))?.full_name||'Chofer sin asignar'};}
function status(s){return O()?.statusMeta?.[O()?.normalizedStatus?.(s.status)||s.status]||{label:'Estado sin informar',tone:'neutral'};}
function badge(s){const st=status(s);return`<span class="osm-badge" data-tone="${esc(st.tone)}">${esc(s.driver_activated?'Activado · '+st.label:st.label)}</span>`;}
const DOCUMENTS={not_started:'Pendiente de carga',draft:'En borrador',submitted:'Pendiente de revisión',observed:'Requiere correcciones',approved:'Aprobado',exception_requested:'Excepción solicitada',exception_approved:'Excepción aprobada',exception_rejected:'Excepción rechazada'};
function documentLabel(s){return DOCUMENTS[s.document_status]||(O()?.hasSignedRemito?.(s)?'Firmado · pendiente de revisión':'Pendiente de carga');}
function primaryAction(s){
  if(!O()?.canTransitionState?.())return null;
  const actions=L()?.quickActions?.(s)||[],want=s.driver_activated?'finalize':O().hasSignedRemito(s)?'finalize':({pending:s.logistics_type==='third_party'?'assign_outsourced':'assign',assigned:s.logistics_type==='third_party'?'finalize':'arrive',at_origin:'finalize'})[O().normalizedStatus(s.status)];
  return actions.find(([key])=>key===want)||null;
}
const V={presentation:'list',selected:'',rows:[],scope:'',map:null,maps:null,pins:[],lines:[],cache:new Map(),session:0,request:0,fitNext:true,panel:'summary',owner:'',notice:null,returnView:null,routeKey:'',routeMessage:''};
let host,screen,themeObserver,screenObserver,authSubscription;
const el=id=>document.getElementById(id);
const usable=()=>V.presentation==='map'&&screen?.classList.contains('active')&&O()?.canRead?.();
function owner(){return typeof PERFIL_USUARIO==='undefined'?O()?.role?.()||'':String(PERFIL_USUARIO?.user_id||PERFIL_USUARIO?.id||'')+'|'+O()?.role?.();}
function replace(node,html){if(!node||node.__osmMarkup===html)return;const focus=node.contains(document.activeElement)?document.activeElement?.dataset?.osmFocus:null,scroll=node.scrollTop;node.__osmMarkup=html;node.innerHTML=html;node.scrollTop=scroll;if(focus){[...node.querySelectorAll('[data-osm-focus]')].find(b=>b.dataset.osmFocus===focus)?.focus({preventScroll:true});}}
function setMessage(message,retry=false){if(!host)return;const node=el('osm-map-message');node.hidden=!message;replace(node,message?`<span>${esc(message)}</span>${retry?'<button type="button" data-osm="retry">Reintentar</button>':''}`:'');}
function notice(){const n=V.notice;replace(el('osm-notice'),n?`<span>${esc(n.message)}</span>${n.history?'<button type="button" data-osm="history">Ver en Historial</button>':''}<button type="button" data-osm="dismiss" aria-label="Cerrar aviso">${icon('x')}</button>`:'');el('osm-notice').hidden=!n;}
function listHTML(s,i){const p=pointsFor(s),c=crew(s);return`<button type="button" class="osm-card" data-osm-select="${esc(idOf(s))}" data-osm-focus="select-${esc(idOf(s))}" aria-pressed="${idOf(s)===V.selected}"><span class="osm-card-top"><b><span class="osm-index">${i+1}</span>${esc(code(s))}</b>${badge(s)}</span><span class="osm-crew">${icon('truck')}<b>${esc(c.title)}</b></span><span class="osm-card-sub">${esc(c.sub)} · ${esc(stamp(s.scheduled_for))}</span><span class="osm-card-route"><span><i>A</i>${esc(s.origin_formatted_address||s.origin||'Origen sin dirección')}</span>${p.single?'':`<span><i>B</i>${esc(s.destination_formatted_address||s.destination||'Destino sin dirección')}</span>`}</span>${!p.any?'<span class="osm-coverage-missing">Sin coordenadas · disponible en la lista</span>':!p.route?'<span class="osm-point-only">Punto de servicio</span>':''}</button>`;}
function renderList(){
  replace(el('osm-list'),V.rows.map(listHTML).join('')||'<div class="osm-empty"><b>No hay servicios en esta vista</b><p>Revisá la búsqueda y los filtros de Servicios.</p></div>');
  const located=V.rows.filter(s=>pointsFor(s).any).length,missing=V.rows.length-located;
  el('osm-coverage').textContent=`${located} de ${V.rows.length} en el mapa${missing?' · '+missing+' sin coordenadas':''}`;
  el('osm-list-title').textContent=O().S.view==='history'?'Servicios del historial':'Servicios activos';
  el('osm-legend-text').textContent=O().S.view==='history'?'Recorridos de referencia · no son trayectos GPS':'Direcciones de servicios · A origen / B destino';
}
function renderDetails(){
  const s=V.rows.find(s=>idOf(s)===V.selected);host.dataset.selected=String(!!s);host.dataset.panel=V.panel;
  if(!s){replace(el('osm-detail-body'),'<div class="osm-empty">'+icon('mouse-pointer-2')+'<h3>Elegí un servicio</h3><p>Consultá su recorrido, responsables y próximas acciones.</p></div>');replace(el('osm-actions'),'');return;}
  const c=crew(s),p=pointsFor(s),primary=primaryAction(s),actions=O().canTransitionState()?(L()?.quickActions(s)||[]):[],q=O().driverQueue?.(O().serviceDriverId?.(s))||[];
  const queue=s.logistics_type!=='third_party'&&s.driver_multi_service&&q.length?`<section class="osm-queue"><h4>Cadena del chofer <span>${q.length}</span></h4><ol>${q.map((item,i)=>`<li><button type="button" data-osm-queue="${esc(idOf(item))}" data-osm-focus="queue-${esc(idOf(item))}" ${idOf(item)===V.selected?'aria-current="true"':''}><span>${i+1}</span><b>${esc(code(item))}</b><small>${esc(status(item).label)}</small></button></li>`).join('')}</ol></section>`:'';
  const html=`<div class="osm-detail-heading"><div><small>SERVICIO</small><h3 id="osm-detail-title" tabindex="-1">${esc(code(s))}</h3></div>${badge(s)}</div><div class="osm-assignment">${icon(s.logistics_type==='third_party'?'building-2':'truck')}<div><b>${esc(c.title)}</b><span>${esc(c.sub)}</span></div></div><p class="osm-scheduled">${icon('clock')}<span>Fecha y hora del servicio<b>${esc(stamp(s.scheduled_for))}</b></span></p><button type="button" class="osm-expand" data-osm="expand" aria-expanded="${V.panel==='expanded'}" aria-controls="osm-detail-extra">${V.panel==='expanded'?'Resumir detalle':'Ver recorrido y seguimiento'}${icon('chevron-down')}</button><div id="osm-detail-extra" class="osm-detail-extra"><ol class="osm-stops"><li><i>A</i><div><small>ORIGEN</small><p>${esc(s.origin_formatted_address||s.origin||'Sin dirección')}</p></div></li>${p.single?'':`<li><i>B</i><div><small>DESTINO</small><p>${esc(s.destination_formatted_address||s.destination||'Sin dirección')}</p></div></li>`}</ol><p class="osm-route-caption" id="osm-route-caption">${esc(V.routeMessage||(!p.any?'Sin coordenadas verificadas.':!p.route?'Servicio con un punto disponible.':'Recorrido de referencia origen → destino.'))}</p><dl class="osm-facts"><div><dt>Prestadora</dt><dd>${esc(s.company_name||'Sin informar')}</dd></div><div><dt>Patente</dt><dd>${esc(s.vehicle_plate||'Sin informar')}</dd></div><div><dt>Arribo registrado</dt><dd>${esc(stamp(s.arrived_at))}</dd></div>${!s.arrived_at&&s.estimated_arrival_at?`<div><dt>Arribo estimado cargado</dt><dd>${esc(stamp(s.estimated_arrival_at))}</dd></div>`:''}<div><dt>Finalización registrada</dt><dd>${esc(stamp(s.completed_at))}</dd></div><div><dt>Remito</dt><dd>${esc(documentLabel(s))}</dd></div></dl>${s.status==='completed'&&O().activeServices().some(x=>idOf(x)===idOf(s))?'<p class="osm-review-note">Finalizado; sigue en Activos por la revisión pendiente del remito.</p>':''}${queue}</div>`;
  replace(el('osm-detail-body'),html);
  replace(el('osm-actions'),`${primary?`<button type="button" class="osm-primary" data-osm-action="${esc(primary[0])}" data-osm-focus="primary">${esc(primary[0]==='arrive'?'Registrar arribo':primary[0]==='finalize'&&O().hasSignedRemito(s)?'Revisar y finalizar':primary[1])}${icon('arrow-right')}</button>`:''}<button type="button" data-osm="open" data-osm-focus="open">Abrir servicio${icon('external-link')}</button>${actions.filter(([key])=>key!==primary?.[0]).length?`<details class="osm-more"><summary>Más acciones</summary><div>${actions.filter(([key])=>key!==primary?.[0]).map(([key,label])=>`<button type="button" data-osm-action="${esc(key)}" data-osm-focus="action-${esc(key)}"${key==='annul'?' class="osm-danger"':''}>${esc(label)}</button>`).join('')}</div></details>`:''}`);
}
function sync(){
  if(!host)return;
  if(V.owner&&V.owner!==owner()){dispose(true);V.selected='';V.notice=null;V.returnView=null;V.presentation='list';}
  V.owner=owner();
  const allowed=O()?.canRead?.();host.hidden=V.presentation!=='map'||!allowed;el('os-presentation').hidden=!allowed;
  const mapMode=V.presentation==='map'&&allowed;
  if(screen.classList.contains('os-map-mode')!==mapMode)screen.classList.toggle('os-map-mode',mapMode);
  for(const b of el('os-presentation').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.osmView===V.presentation));
  if(!allowed){dispose(true);return;}if(V.presentation!=='map')return;
  const nextScope=scopeKey(),rows=O().S.visibleRows||O().filtered(),old=V.rows.find(s=>idOf(s)===V.selected);
  if(V.selected&&!rows.some(s=>idOf(s)===V.selected)){
    if(old&&nextScope===V.scope){const current=O().service(V.selected),history=O().historyServices().some(s=>idOf(s)===V.selected);V.notice={id:V.selected,history,message:history?`${code(old)} pasó a Historial.`:current?`${code(old)} cambió y ya no coincide con los filtros actuales.`:`${code(old)} ya no está entre los servicios cargados.`};}
    V.selected='';V.request++;V.routeKey='';V.routeMessage='';
  }
  if(nextScope!==V.scope)V.fitNext=true;
  V.rows=rows;V.scope=nextScope;renderList();renderDetails();notice();el('osm-return').hidden=!V.returnView;
  if(usable()){if(!V.map)void start();else{draw();void routeSelected();}}
}
function switchView(value){V.presentation=value==='map'?'map':'list';if(V.presentation==='list')dispose(false);sync();}
function select(id,focus=true){if(!usable()||!V.rows.some(s=>idOf(s)===String(id)))return;V.selected=String(id);V.request++;V.routeKey='';V.routeMessage='';V.panel='summary';V.fitNext=true;renderList();renderDetails();draw();void routeSelected();if(focus)el('osm-detail-title')?.focus({preventScroll:true});}
function clearOverlays(){for(const p of [...V.pins,...V.lines])p.setMap(null);V.pins=[];V.lines=[];}
function dispose(clear){V.session++;V.request++;V.starting=false;clearOverlays();if(V.map)V.maps?.event?.clearInstanceListeners(V.map);V.map=null;V.maps=null;V.routeKey='';V.drawSignature='';V.fitNext=true;if(clear)V.cache.clear();el('osm-canvas')?.replaceChildren();}
function fit(){if(!V.map)return;const bounds=new V.maps.LatLngBounds(),s=V.rows.find(s=>idOf(s)===V.selected),rows=s?[s]:V.rows;let count=0;for(const row of rows){const p=pointsFor(row);for(const point of [p.origin,p.destination])if(point){bounds.extend(point);count++;}const route=V.cache.get(geometryKey(row));for(const pt of route?.path||[])bounds.extend(pt);}if(count){V.map.fitBounds(bounds,{top:65,right:55,bottom:65,left:55});if(count===1)V.map.addListener('idle',function capped(){if(V.map?.getZoom?.()>16)V.map.setZoom(16);V.maps?.event?.clearListeners?.(V.map,'idle');});}}
function draw(){
  if(!V.map)return;
  const signature=JSON.stringify([V.selected,V.rows.map(s=>[geometryKey(s),code(s),crew(s).title,V.cache.has(geometryKey(s))])]);
  if(signature===V.drawSignature&&!V.fitNext)return;
  V.drawSignature=signature;clearOverlays();
  if(V.fitNext){fit();V.fitNext=false;}
  const maps=V.maps;
  class Pin extends maps.OverlayView{
    constructor(point,label,s,selected){super();this.point=point;this.button=document.createElement('button');this.button.type='button';this.button.className='osm-pin'+(selected?' is-selected':'');this.button.textContent=label;this.button.setAttribute('aria-label',`${code(s)} · ${label==='B'?'Destino':'Origen'} · ${crew(s).title}`);this.button.addEventListener('click',e=>{e.stopPropagation();select(idOf(s));});this.setMap(V.map);}
    onAdd(){this.getPanes().overlayMouseTarget.appendChild(this.button);maps.OverlayView.preventMapHitsAndGesturesFrom(this.button);}
    draw(){const p=this.getProjection()?.fromLatLngToDivPixel(new maps.LatLng(this.point.lat,this.point.lng));if(p){this.button.style.left=p.x+'px';this.button.style.top=p.y+'px';}}
    onRemove(){this.button.remove();}
  }
  // Context routes only use already requested, validated geometry. No fan-out route calls.
  for(const s of V.rows){const cached=V.cache.get(geometryKey(s));if(!cached?.path?.length)continue;const selected=idOf(s)===V.selected;const line=new maps.Polyline({map:V.map,path:cached.path,strokeColor:selected?'#f5a623':'#8c9cb2',strokeWeight:selected?5:2,strokeOpacity:selected?1:.45,clickable:false,zIndex:selected?4:1});line.setPath(cached.path);V.lines.push(line);}
  // Selected markers draw last so colocated jobs remain reachable through the list.
  for(const s of [...V.rows.filter(s=>idOf(s)!==V.selected),...V.rows.filter(s=>idOf(s)===V.selected)]){const p=pointsFor(s),selected=idOf(s)===V.selected,index=V.rows.indexOf(s)+1;if(p.origin)V.pins.push(new Pin(p.origin,selected?'A':String(index),s,selected));if(p.destination&&(selected||!p.origin)&&!same(p.origin,p.destination))V.pins.push(new Pin(p.destination,selected?'B':String(index),s,selected));}
  setMessage(V.rows.length&&!V.rows.some(s=>pointsFor(s).any)?'Estos servicios no tienen coordenadas verificadas. Podés operarlos desde las fichas.':V.rows.length?'':'No hay servicios que coincidan con esta vista.');
}
async function start(){
  if(!usable()||V.map||V.starting)return;V.starting=true;const session=++V.session,who=owner();setMessage('Cargando mapa…');
  try{
    if(!window.ServiceRouteMap)await loadAuxiliosModule('service-route-map-js','/service-route-map.js');
    const maps=await window.ServiceRouteMap.loadSdk();if(session!==V.session||!usable()||who!==owner())return;
    V.maps=maps;V.map=new maps.Map(el('osm-canvas'),{center:{lat:-34.6037,lng:-58.3816},zoom:10,mapTypeId:'roadmap',styles:window.ServiceRouteMap.mapStyle(),gestureHandling:'cooperative',zoomControlOptions:{position:maps.ControlPosition.RIGHT_TOP},mapTypeControl:false,streetViewControl:false,fullscreenControl:false,clickableIcons:false});
    V.fitNext=true;draw();void routeSelected();
  }catch(error){if(!window.ServiceRouteMap)el('service-route-map-js')?.remove();if(session===V.session&&usable())setMessage(error.message||'No se pudo cargar el mapa. Las fichas siguen disponibles.',true);}
  finally{if(session===V.session)V.starting=false;}
}
function timeout(promise){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('La consulta del recorrido tardó demasiado.')),20000);})]).finally(()=>clearTimeout(timer));}
async function routeSelected(){
  const s=V.rows.find(s=>idOf(s)===V.selected);if(!V.map||!s)return;const p=pointsFor(s),key=geometryKey(s);if(!p.route||V.routeKey===key)return;V.routeKey=key;
  const cached=V.cache.get(key);if(cached){V.routeMessage=cached.message;renderDetails();return;}
  const token=++V.request,session=V.session,who=owner(),valid=()=>token===V.request&&session===V.session&&usable()&&who===owner()&&geometryKey(O().service(idOf(s))||{})===key;
  V.routeMessage='Consultando recorrido origen → destino…';renderDetails();
  try{
    const decoder=window.ServiceRouteMap.decode;let path=[],meters=null;
    {
      const point=x=>({latitude:x.lat,longitude:x.lng});
      const r=await timeout(_db.functions.invoke('maps-proxy',{body:{action:'route',routeMode:'origin_destination',base:point(p.origin),origin:point(p.origin),destination:point(p.destination)}}));
      if(!valid())return;if(r.error||r.data?.error)throw Error('No se pudo consultar el recorrido.');path=operationalPath(decoder(r.data?.polyline),p);meters=number(r.data?.distanceMeters);
    }
    if(!valid())return;if(!path.length)throw Error('El trazado no coincide con el origen y destino.');
    const message=(meters>0?new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(meters/1000)+' km · ':'')+'Recorrido de referencia. No indica la posición del móvil.';
    if(V.cache.size>=100)V.cache.delete(V.cache.keys().next().value);V.cache.set(key,{path,message});V.routeMessage=message;renderDetails();draw();
  }catch(error){if(!valid())return;V.routeMessage=(error.message||'Recorrido no disponible.')+' Se muestran las direcciones verificadas.';renderDetails();const caption=el('osm-route-caption');if(caption)caption.insertAdjacentHTML('beforeend',' <button type="button" data-osm="retry-route">Reintentar trazado</button>');}
}
function jumpHistory(){
  const id=V.notice?.id,s=O().service(id);if(!s)return;
  V.returnView=Object.fromEntries(['view','query','status','company','driverFilter','truckFilter','periodSel','historyPage'].map(k=>[k,O().S[k]]));
  Object.assign(O().S,{query:String(code(s)),status:'all',company:'all',driverFilter:'',truckFilter:'',periodSel:{mode:'all'},historyPage:1});el('os-q').value=O().S.query;V.notice=null;window.cambiarVistaServicios('history');select(id);el('osm-return').hidden=false;
}
function handle(event){
  const selected=event.target.closest('[data-osm-select]');if(selected)return select(selected.dataset.osmSelect);
  const queue=event.target.closest('[data-osm-queue]');if(queue){const id=queue.dataset.osmQueue;if(V.rows.some(s=>idOf(s)===id))select(id);else window.verServicioOperador?.(id);return;}
  const action=event.target.closest('[data-osm-action]');if(action){if(!O().canTransitionState()||!V.selected)return;L()?.runQuickAction(action.dataset.osmAction,V.selected);return;}
  const task=event.target.closest('[data-osm]')?.dataset.osm;
  if(task==='open'&&V.selected)window.verServicioOperador?.(V.selected);
  if(task==='fit'){V.fitNext=true;draw();}
  if(task==='retry'){dispose(false);void start();}
  if(task==='retry-route'){V.routeKey='';void routeSelected();}
  if(task==='expand'){V.panel=V.panel==='expanded'?'summary':'expanded';renderDetails();el('osm-detail-body')?.querySelector('[data-osm="expand"]')?.focus({preventScroll:true});}
  if(task==='back'){const id=V.selected;V.selected='';V.request++;V.routeKey='';V.routeMessage='';renderList();renderDetails();draw();[...host.querySelectorAll('[data-osm-select]')].find(b=>b.dataset.osmSelect===id)?.focus({preventScroll:true});}
  if(task==='dismiss'){V.notice=null;notice();}
  if(task==='history')jumpHistory();
  if(task==='return'&&V.returnView){const saved=V.returnView;V.returnView=null;V.selected='';Object.assign(O().S,saved);el('os-q').value=saved.query;window.cambiarVistaServicios(saved.view);O().S.status=saved.status;O().renderServices();O().S.historyPage=saved.historyPage;O().renderServices();}
}
function init(){
  screen=el('screen-operaciones');if(!screen||el('os-presentation'))return;
  const toggle=document.createElement('div');toggle.id='os-presentation';toggle.className='osm-view-switch';toggle.setAttribute('role','group');toggle.setAttribute('aria-label','Presentación de servicios');toggle.innerHTML=`<button type="button" data-osm-view="list" aria-pressed="true">${icon('list')}Lista</button><button type="button" data-osm-view="map" aria-pressed="false">${icon('map')}Mapa</button>`;el('os-active-count')?.after(toggle);toggle.addEventListener('click',e=>{const b=e.target.closest('[data-osm-view]');if(b)switchView(b.dataset.osmView);});
  host=document.createElement('section');host.id='osm-workspace';host.hidden=true;host.setAttribute('aria-label','Mapa de servicios');host.innerHTML=`<div id="osm-notice" class="osm-notice" role="status" hidden></div><div class="osm-toolbar"><div><b>Mapa de servicios</b><span id="osm-coverage"></span></div><button type="button" id="osm-return" data-osm="return" hidden>Volver a la vista anterior</button><button type="button" data-osm="fit">${icon('scan')}Encuadrar</button></div><div class="osm-layout"><aside class="osm-sidebar"><header><h3 id="osm-list-title">Servicios activos</h3><span>Según tus filtros</span></header><div id="osm-list" class="osm-list"></div></aside><div class="osm-stage"><div id="osm-canvas" role="region" aria-label="Direcciones y recorridos de los servicios"></div><div id="osm-map-message" class="osm-map-message" role="status" hidden></div><div class="osm-legend"><i></i><span id="osm-legend-text"></span></div></div><aside class="osm-detail" aria-label="Detalle del servicio"><header><button type="button" data-osm="back">${icon('arrow-left')}Servicios</button><small>DETALLE OPERATIVO</small></header><div id="osm-detail-body" class="osm-detail-body"></div><footer id="osm-actions" class="osm-actions"></footer></aside></div>`;
  screen.querySelector('.os-table-wrap').after(host);host.addEventListener('click',handle);host.addEventListener('keydown',e=>{if(e.key==='Escape'&&V.selected&&!e.target.closest('details[open]')){e.preventDefault();host.querySelector('[data-osm="back"]').click();}});
  document.addEventListener('auxilios:services-rendered',sync);
  window.addEventListener('auxilios:map-auth-failure',event=>{if(usable()){dispose(false);setMessage(event.detail||'No se pudo autorizar el mapa. Las fichas siguen disponibles.',true);}});
  screenObserver=new MutationObserver(()=>{if(!usable())dispose(false);else sync();});screenObserver.observe(screen,{attributes:true,attributeFilter:['class']});
  themeObserver=new MutationObserver(()=>{if(V.map)V.map.setOptions({styles:window.ServiceRouteMap.mapStyle()});});themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  if(typeof _db!=='undefined')authSubscription=_db.auth?.onAuthStateChange?.((event)=>{if(event==='SIGNED_OUT'){dispose(true);V.selected='';V.rows=[];V.notice=null;V.returnView=null;V.presentation='list';host.hidden=true;}})?.data?.subscription;
  window.addEventListener('pagehide',event=>{dispose(true);if(!event.persisted){authSubscription?.unsubscribe();themeObserver?.disconnect();screenObserver?.disconnect();}});
  window.addEventListener('pageshow',event=>{if(event.persisted)sync();});sync();
}
window.OperatorServicesMap={sync,switchView,_test:{coordinate,pointsFor,operationalPath,geometryKey,primaryAction,documentLabel}};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();

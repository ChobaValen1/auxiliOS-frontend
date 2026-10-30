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
const FLEET_COLORS=['#56b4e9','#e69f00','#00b58a','#cf7cbe','#e66c42','#b5bc3d','#8e91fa','#e785ac','#42b9c2','#b59970','#a3c9ef','#cfa1e9'];
function mobileGroup(s){
  if(s.logistics_type==='third_party')return{key:'third:'+String(s.outsourced_provider_id||s.outsourced_provider_name||'unknown'),label:s.outsourced_provider_name?'Tercerizado · '+s.outsourced_provider_name:'Tercerizado sin informar',kind:'third'};
  const id=O()?.serviceTruckId?.(s)||s.assigned_truck_id||s.activation_truck_id||s.responsible_truck_id;
  const truck=id?O()?.truck?.(id):null,label=s.truck_label||truck?.numero_interno||truck?.plate;
  return id?{key:'truck:'+id,label:'Móvil '+String(label||id).replace(/^m[oó]vil\s*/i,''),kind:'truck'}:{key:'unassigned',label:'Sin móvil asignado',kind:'unassigned'};
}
function groupColor(key){if(key==='unassigned')return'#9ca3af';if(!V.colors.has(key)){const n=V.colors.size;V.colors.set(key,FLEET_COLORS[n]||`hsl(${Math.round(n*137.508)%360} 65% 64%)`);}return V.colors.get(key);}
function seedColors(){const keys=new Set((O().S.trucks||[]).map(t=>'truck:'+t.truck_id));for(const s of O().S.services||[])keys.add(mobileGroup(s).key);[...keys].filter(k=>k!=='unassigned').sort().forEach(groupColor);}
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
const V={presentation:'list',selected:'',rows:[],scope:'',map:null,maps:null,pins:[],lines:[],cache:new Map(),failures:new Map(),pending:new Map(),colors:new Map(),generation:0,session:0,fitNext:true,camera:'all',panel:'summary',listOpen:false,listPage:0,queuePage:0,legendPage:0,owner:'',notice:null,returnView:null,routeMessage:''};
let host,screen,themeObserver,screenObserver,sizeObserver,authSubscription,sizeFrame=0;
const el=id=>document.getElementById(id);
const usable=()=>V.presentation==='map'&&O()?.S.view==='active'&&screen?.classList.contains('active')&&O()?.canRead?.();
function sizeViewport(){
  cancelAnimationFrame(sizeFrame);sizeFrame=requestAnimationFrame(()=>{
    const content=screen?.closest('.content'),on=!!usable();if(!content)return;
    const entering=on&&!content.classList.contains('osm-content-fixed');content.classList.toggle('osm-content-fixed',on);
    if(!on){screen.style.removeProperty('--osm-screen-height');return;}if(entering)content.scrollTop=0;
    const rect=content.getBoundingClientRect(),viewport=window.visualViewport,bottom=(viewport?.height||innerHeight)+(viewport?.offsetTop||0),nav=document.querySelector('.sidenav')?.getBoundingClientRect();
    const limit=Math.min(rect.bottom,bottom,nav&&nav.width>nav.height&&nav.top>rect.top?nav.top:Infinity);
    const height=Math.max(0,Math.floor(limit-screen.getBoundingClientRect().top-parseFloat(getComputedStyle(content).paddingBottom||0)));
    if(screen.style.getPropertyValue('--osm-screen-height')!==height+'px')screen.style.setProperty('--osm-screen-height',height+'px');
    const detail=host?.querySelector('.osm-detail');
    if(detail?.clientHeight)host.style.setProperty('--osm-menu-height',Math.max(44,detail.clientHeight-el('osm-actions').offsetHeight-16)+'px');
    if(V.map)V.maps?.event?.trigger?.(V.map,'resize');
  });
}
function owner(){return typeof PERFIL_USUARIO==='undefined'?O()?.role?.()||'':String(PERFIL_USUARIO?.user_id||PERFIL_USUARIO?.id||'')+'|'+O()?.role?.();}
function replace(node,html){if(!node||node.__osmMarkup===html)return;const focus=node.contains(document.activeElement)?document.activeElement?.dataset?.osmFocus:null,scroll=node.scrollTop;node.__osmMarkup=html;node.innerHTML=html;node.scrollTop=scroll;if(focus){[...node.querySelectorAll('[data-osm-focus]')].find(b=>b.dataset.osmFocus===focus)?.focus({preventScroll:true});}}
function setMessage(message,retry=false){if(!host)return;const node=el('osm-map-message');node.hidden=!message;replace(node,message?`<span>${esc(message)}</span>${retry?'<button type="button" data-osm="retry">Reintentar</button>':''}`:'');}
function notice(){const n=V.notice;replace(el('osm-notice'),n?`<span>${esc(n.message)}</span>${n.history?'<button type="button" data-osm="history">Ver en Historial</button>':''}<button type="button" data-osm="dismiss" aria-label="Cerrar aviso">${icon('x')}</button>`:'');el('osm-notice').hidden=!n;}
function listHTML(s,i){const p=pointsFor(s),c=crew(s);return`<button type="button" class="osm-card" data-osm-select="${esc(idOf(s))}" data-osm-focus="select-${esc(idOf(s))}" aria-pressed="${idOf(s)===V.selected}"><span class="osm-card-top"><b>${esc(code(s))}</b>${badge(s)}</span><span class="osm-crew">${icon('truck')}<b>${esc(c.title)}</b></span><span class="osm-card-sub">${esc(c.sub)} · ${esc(stamp(s.scheduled_for))}</span><span class="osm-card-route"><span><i aria-label="Origen">●</i>${esc(s.origin_formatted_address||s.origin||'Origen sin dirección')}</span>${p.single?'':`<span><i aria-label="Destino">⚑</i>${esc(s.destination_formatted_address||s.destination||'Destino sin dirección')}</span>`}</span>${!p.any?'<span class="osm-coverage-missing">Sin coordenadas · disponible en la lista</span>':!p.route?'<span class="osm-point-only">Punto de servicio</span>':''}</button>`;}
function renderList(){
  const pageSize=1,total=Math.max(1,Math.ceil(V.rows.length/pageSize));V.listPage=Math.min(V.listPage,total-1);
  host.dataset.listOpen=String(V.listOpen);
  replace(el('osm-list'),V.rows.slice(V.listPage*pageSize,(V.listPage+1)*pageSize).map(listHTML).join('')||'<div class="osm-empty"><b>No hay servicios en esta vista</b><p>Revisá la búsqueda y los filtros.</p></div>');
  replace(el('osm-list-pages'),`<button type="button" data-osm="list-prev" ${V.listPage===0?'disabled':''} aria-label="Servicio anterior">←</button><span>${V.rows.length?V.listPage+1:0} / ${V.rows.length}</span><button type="button" data-osm="list-next" ${V.listPage===total-1?'disabled':''} aria-label="Servicio siguiente">→</button>`);
  el('osm-list-toggle').textContent=`Servicios · ${V.rows.length}`;el('osm-list-toggle').setAttribute('aria-expanded',String(V.listOpen));
  const tabs=[...screen.querySelectorAll('[data-os-tab]')];replace(el('osm-status'),tabs.map(b=>`<option value="${esc(b.dataset.osTab)}">${esc(b.textContent.replace(/(\D)(\d+)$/,'$1 · $2'))}</option>`).join(''));el('osm-status').value=O().S.status;
  const located=V.rows.filter(s=>pointsFor(s).any).length,missing=V.rows.length-located;
  el('osm-coverage').textContent=`${located} de ${V.rows.length} en el mapa${missing?' · '+missing+' sin coordenadas':''}`;
  el('osm-list-title').textContent='Servicios activos';
  renderLegend();
}
function renderDetails(){
  const s=V.rows.find(s=>idOf(s)===V.selected);host.dataset.selected=String(!!s);host.dataset.panel=V.panel;
  if(!s){replace(el('osm-detail-body'),'<div class="osm-empty">'+icon('mouse-pointer-2')+'<h3>Elegí un servicio</h3><p>Consultá su recorrido, responsables y próximas acciones.</p></div>');replace(el('osm-actions'),'');return;}
  V.routeMessage=routeCaption(s);
  const c=crew(s),p=pointsFor(s),primary=primaryAction(s),actions=O().canTransitionState()?(L()?.quickActions(s)||[]):[],q=O().driverQueue?.(O().serviceDriverId?.(s))||[];
  V.queuePage=Math.min(V.queuePage,Math.max(0,Math.ceil(q.length/2)-1));
  const queue=s.logistics_type!=='third_party'&&s.driver_multi_service&&q.length?`<section class="osm-queue"><h4>Cadena del chofer <span>${q.length}</span></h4><ol>${q.slice(V.queuePage*2,V.queuePage*2+2).map((item,i)=>`<li><button type="button" data-osm-queue="${esc(idOf(item))}" data-osm-focus="queue-${esc(idOf(item))}" ${idOf(item)===V.selected?'aria-current="true"':''}><span>${V.queuePage*2+i+1}</span><b>${esc(code(item))}</b><small>${esc(status(item).label)}</small></button></li>`).join('')}</ol>${q.length>2?`<div class="osm-pager"><button type="button" data-osm="queue-prev" ${V.queuePage===0?'disabled':''}>←</button><span>${V.queuePage+1} / ${Math.ceil(q.length/2)}</span><button type="button" data-osm="queue-next" ${(V.queuePage+1)*2>=q.length?'disabled':''}>→</button></div>`:''}</section>`:'';
  const html=`<div class="osm-detail-heading"><div><small>SERVICIO</small><h3 id="osm-detail-title" tabindex="-1">${esc(code(s))}</h3></div>${badge(s)}</div><div class="osm-overview"><div class="osm-assignment">${icon(s.logistics_type==='third_party'?'building-2':'truck')}<div><b>${esc(c.title)}</b><span>${esc(c.sub)}</span></div></div><p class="osm-scheduled">${icon('clock')}<span>Fecha y hora del servicio<b>${esc(stamp(s.scheduled_for))}</b></span></p></div><div class="osm-detail-tabs" role="group" aria-label="Información del servicio"><button type="button" data-osm="summary" aria-pressed="${V.panel==='summary'}">Resumen</button><button type="button" data-osm="tracking" aria-pressed="${V.panel==='tracking'}">Seguimiento</button><button type="button" data-osm="queue" aria-pressed="${V.panel==='queue'}">Cadena · ${q.length}</button></div><div id="osm-detail-extra" class="osm-detail-extra"><ol class="osm-stops"><li><i aria-label="Origen">●</i><div><small>ORIGEN</small><p>${esc(s.origin_formatted_address||s.origin||'Sin dirección')}</p></div></li>${p.single?'':`<li><i aria-label="Destino">⚑</i><div><small>DESTINO</small><p>${esc(s.destination_formatted_address||s.destination||'Sin dirección')}</p></div></li>`}</ol><p class="osm-route-caption" id="osm-route-caption">${esc(V.routeMessage||(!p.any?'Sin coordenadas verificadas.':!p.route?'Servicio con un punto disponible.':'Recorrido de referencia origen → destino.'))}</p><dl class="osm-facts"><div><dt>Prestadora</dt><dd>${esc(s.company_name||'Sin informar')}</dd></div><div><dt>Patente</dt><dd>${esc(s.vehicle_plate||'Sin informar')}</dd></div><div><dt>Arribo registrado</dt><dd>${esc(stamp(s.arrived_at))}</dd></div>${!s.arrived_at&&s.estimated_arrival_at?`<div><dt>Arribo estimado cargado</dt><dd>${esc(stamp(s.estimated_arrival_at))}</dd></div>`:''}<div><dt>Finalización registrada</dt><dd>${esc(stamp(s.completed_at))}</dd></div><div><dt>Remito</dt><dd>${esc(documentLabel(s))}</dd></div></dl>${s.status==='completed'&&O().activeServices().some(x=>idOf(x)===idOf(s))?'<p class="osm-review-note">Finalizado; sigue en Activos por la revisión pendiente del remito.</p>':''}${queue}</div>`;
  replace(el('osm-detail-body'),html);
  replace(el('osm-actions'),`${primary?`<button type="button" class="osm-primary" data-osm-action="${esc(primary[0])}" data-osm-focus="primary">${esc(primary[0]==='arrive'?'Registrar arribo':primary[0]==='finalize'&&O().hasSignedRemito(s)?'Revisar y finalizar':primary[1])}${icon('arrow-right')}</button>`:''}<button type="button" data-osm="open" data-osm-focus="open">Abrir servicio${icon('external-link')}</button>${actions.filter(([key])=>key!==primary?.[0]).length?`<details class="osm-more"><summary>Más acciones</summary><div>${actions.filter(([key])=>key!==primary?.[0]).map(([key,label])=>`<button type="button" data-osm-action="${esc(key)}" data-osm-focus="action-${esc(key)}"${key==='annul'?' class="osm-danger"':''}>${esc(label)}</button>`).join('')}</div></details>`:''}`);
}
function sync(){
  if(!host)return;
  if(V.owner&&V.owner!==owner()){dispose(true);V.selected='';V.notice=null;V.returnView=null;V.presentation='list';}
  V.owner=owner();
  const allowed=O()?.canRead?.(),active=O()?.S.view==='active';
  if(!active&&V.presentation==='map'){V.presentation='list';dispose(false);}
  host.hidden=V.presentation!=='map'||!allowed;el('os-presentation').hidden=!allowed||!active;
  el('osm-history-return').hidden=!allowed||active||!V.returnView;
  const mapMode=V.presentation==='map'&&allowed;
  if(screen.classList.contains('os-map-mode')!==mapMode)screen.classList.toggle('os-map-mode',mapMode);
  for(const b of el('os-presentation').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.osmView===V.presentation));
  sizeViewport();
  if(!allowed){dispose(true);return;}if(V.presentation!=='map')return;
  seedColors();
  const liveKeys=new Set(O().activeServices().map(geometryKey));for(const cache of [V.cache,V.failures])for(const key of cache.keys())if(!liveKeys.has(key))cache.delete(key);
  const nextScope=scopeKey(),rows=O().S.visibleRows||O().filtered(),old=V.rows.find(s=>idOf(s)===V.selected);
  if(V.selected&&!rows.some(s=>idOf(s)===V.selected)){
    if(old&&nextScope===V.scope){const current=O().service(V.selected),history=O().historyServices().some(s=>idOf(s)===V.selected);V.notice={id:V.selected,history,message:history?`${code(old)} pasó a Historial.`:current?`${code(old)} cambió y ya no coincide con los filtros actuales.`:`${code(old)} ya no está entre los servicios cargados.`};}
    V.selected='';V.routeMessage='';V.camera='all';V.fitNext=true;V.autoFit=true;
  }
  if(nextScope!==V.scope){V.listPage=0;V.legendPage=0;V.camera='all';V.fitNext=true;V.autoFit=true;}
  V.rows=rows;V.scope=nextScope;renderList();renderDetails();notice();
  if(usable()){if(!V.map)void start();else{draw();pumpRoutes();}}
}
function switchView(value){V.presentation=value==='map'&&O()?.S.view==='active'?'map':'list';if(V.presentation==='list')dispose(false);sync();}
function select(id,focus=true){
  const s=V.rows.find(s=>idOf(s)===String(id));if(!usable()||!s)return;
  V.selected=String(id);V.routeMessage='';V.panel='summary';V.listOpen=false;V.queuePage=0;V.camera='selection';V.fitNext=true;
  const key=geometryKey(s);V.autoFit=pointsFor(s).route&&!V.cache.has(key)&&!V.failures.has(key);
  renderList();renderDetails();draw();pumpRoutes();sizeViewport();if(focus)el('osm-detail-title')?.focus({preventScroll:true});
}
function clearOverlays(){for(const p of [...V.pins,...V.lines]){V.maps?.event?.clearInstanceListeners(p);p.setMap(null);}V.pins=[];V.lines=[];}
function dispose(clear){V.session++;V.starting=false;clearOverlays();if(V.map)V.maps?.event?.clearInstanceListeners(V.map);V.map=null;V.maps=null;V.drawSignature='';V.fitNext=true;if(clear){V.generation++;V.cache.clear();V.failures.clear();V.colors.clear();}el('osm-canvas')?.replaceChildren();}
function cameraRows(){return V.camera==='selection'?V.rows.filter(s=>idOf(s)===V.selected):V.rows;}
function fit(){
  if(!V.map)return;
  const bounds=new V.maps.LatLngBounds(),points=[];
  for(const row of cameraRows()){
    const p=pointsFor(row);for(const point of [p.origin,p.destination])if(point)points.push(point);
    points.push(...(V.cache.get(geometryKey(row))?.path||[]));
  }
  if(!points.length)return;
  if(points.every(p=>same(p,points[0]))){V.map.panTo(points[0]);V.map.setZoom(16);return;}
  for(const point of points)bounds.extend(point);
  const canvas=el('osm-canvas'),horizontal=Math.min(110,Math.round(canvas.clientWidth*.22)),vertical=Math.min(105,Math.round(canvas.clientHeight*.25));
  V.map.fitBounds(bounds,{top:vertical,right:horizontal,bottom:vertical,left:horizontal});
}
function renderLegend(){
  const groups=new Map();for(const s of V.rows){if(!pointsFor(s).any)continue;const g=mobileGroup(s);if(!groups.has(g.key))groups.set(g.key,{...g,count:0});groups.get(g.key).count++;}
  const groupRows=[...groups.values()],pages=Math.max(1,Math.ceil(groupRows.length/3));V.legendPage=Math.min(V.legendPage,pages-1);
  replace(el('osm-legend-pages'),pages>1?`<button type="button" data-osm="legend-prev" ${V.legendPage===0?'disabled':''}>←</button><span>${V.legendPage+1}/${pages}</span><button type="button" data-osm="legend-next" ${V.legendPage===pages-1?'disabled':''}>→</button>`:'');
  replace(el('osm-legend-items'),groupRows.slice(V.legendPage*3,V.legendPage*3+3).map(g=>`<span class="osm-legend-item" data-mobile="${esc(g.key)}"><i style="--osm-route-color:${groupColor(g.key)}" class="${g.kind==='unassigned'?'is-unassigned':''}"></i><span>${esc(g.label)}</span><small>${g.count}</small></span>`).join('')||'<small>Sin puntos para mostrar</small>');
  const routes=V.rows.filter(s=>pointsFor(s).route),ready=routes.filter(s=>V.cache.has(geometryKey(s))).length,failed=routes.filter(s=>V.failures.has(geometryKey(s))).length;
  replace(el('osm-route-progress'),routes.length?`${ready}/${routes.length} recorridos${failed?` · ${failed} sin trazado <button type="button" data-osm="retry-routes">Reintentar</button>`:ready<routes.length?' · Cargando…':''}`:'');
}
function routeCaption(s){const p=pointsFor(s),key=geometryKey(s);return!p.any?'Sin coordenadas verificadas.':!p.route?'Servicio con un punto disponible.':V.cache.get(key)?.message||V.failures.get(key)||'Consultando recorrido origen → destino…';}
function draw(){
  if(!V.map)return;
  const signature=JSON.stringify([V.selected,V.rows.map(s=>[geometryKey(s),code(s),mobileGroup(s),V.cache.has(geometryKey(s))])]);
  if(signature===V.drawSignature&&!V.fitNext)return;
  const focused=document.activeElement?.dataset?.osmPin;
  V.drawSignature=signature;clearOverlays();
  if(V.fitNext){fit();V.fitNext=false;}
  const maps=V.maps;
  class Pin extends maps.OverlayView{
    constructor(key,stops){
      super();this.point=stops[0].point;const selected=stops.some(x=>idOf(x.s)===V.selected),item=stops.find(x=>idOf(x.s)===V.selected)||stops[0],group=mobileGroup(item.s);
      this.button=document.createElement('button');this.button.type='button';this.button.className='osm-pin'+(selected?' is-selected':'');this.button.dataset.osmPin=key;this.button.style.setProperty('--osm-route-color',groupColor(group.key));
      this.button.innerHTML=`<span aria-hidden="true">${item.letter==='A'?'●':'⚑'}</span>${stops.length>1?`<sup>${stops.length}</sup>`:''}${selected?`<span class="osm-pin-caption">${item.letter==='A'?'Origen':'Destino'} · ${esc(code(item.s))}<small>${esc(group.label)}</small></span>`:''}`;
      const label=stops.map(x=>`${code(x.s)} · ${x.letter==='A'?'Origen':'Destino'} · ${mobileGroup(x.s).label}: ${x.letter==='A'?x.s.origin_formatted_address||x.s.origin:x.s.destination_formatted_address||x.s.destination}`).join('\n');
      this.button.title=label+(stops.length>1?'\nPulsá para recorrer los servicios de este punto.':'');this.button.setAttribute('aria-label',this.button.title);
      this.button.addEventListener('click',e=>{e.stopPropagation();const i=stops.findIndex(x=>idOf(x.s)===V.selected);select(idOf(stops[(i+1)%stops.length].s));});this.setMap(V.map);
    }
    onAdd(){this.getPanes().overlayMouseTarget.appendChild(this.button);maps.OverlayView.preventMapHitsAndGesturesFrom(this.button);}
    draw(){const p=this.getProjection()?.fromLatLngToDivPixel(new maps.LatLng(this.point.lat,this.point.lng));if(p){this.button.style.left=p.x+'px';this.button.style.top=p.y+'px';}}
    onRemove(){this.button.remove();}
  }
  const ordered=[...V.rows.filter(s=>idOf(s)!==V.selected),...V.rows.filter(s=>idOf(s)===V.selected)];
  for(const s of ordered){
    const cached=V.cache.get(geometryKey(s));if(!cached?.path?.length)continue;
    const selected=idOf(s)===V.selected,g=mobileGroup(s),color=groupColor(g.key);
    const line=new maps.Polyline({map:V.map,path:cached.path,strokeColor:color,strokeWeight:selected?6:4,strokeOpacity:g.kind==='unassigned'?0:.9,clickable:true,zIndex:selected?4:2,...(g.kind==='unassigned'?{icons:[{icon:{path:'M 0,-1 0,1',strokeOpacity:1,strokeColor:color,scale:2},offset:'0',repeat:'12px'}]}:{})});
    line.setPath(cached.path);line.addListener?.('click',()=>select(idOf(s)));V.lines.push(line);
  }
  // Coincident endpoints keep their exact anchor and expose every service by cycling.
  const stops=new Map();for(const [i,s] of V.rows.entries()){const p=pointsFor(s);for(const [letter,point] of [['A',p.origin],['B',p.destination]]){if(!point||(letter==='B'&&same(p.origin,point)))continue;const key=point.lat.toFixed(6)+','+point.lng.toFixed(6);if(!stops.has(key))stops.set(key,[]);stops.get(key).push({s,point,letter,index:i+1});}}
  for(const [key,items] of stops)V.pins.push(new Pin(key,items));
  if(focused)V.pins.find(p=>p.button.dataset.osmPin===focused)?.button.focus({preventScroll:true});
  setMessage(V.rows.length&&!V.rows.some(s=>pointsFor(s).any)?'Estos servicios no tienen coordenadas verificadas. Podés operarlos desde las fichas.':V.rows.length?'':'No hay servicios que coincidan con esta vista.');
}
async function start(){
  if(!usable()||V.map||V.starting)return;V.starting=true;const session=++V.session,who=owner();setMessage('Cargando mapa…');
  try{
    if(!window.ServiceRouteMap)await loadAuxiliosModule('service-route-map-js','/service-route-map.js');
    const maps=await window.ServiceRouteMap.loadSdk();if(session!==V.session||!usable()||who!==owner())return;
    V.maps=maps;V.map=new maps.Map(el('osm-canvas'),{center:{lat:-34.6037,lng:-58.3816},zoom:10,mapTypeId:'roadmap',styles:window.ServiceRouteMap.mapStyle(true),gestureHandling:'greedy',zoomControlOptions:{position:maps.ControlPosition.RIGHT_TOP},mapTypeControl:false,streetViewControl:false,fullscreenControl:false,clickableIcons:false});
    V.fitNext=true;V.autoFit=true;draw();pumpRoutes();
  }catch(error){if(!window.ServiceRouteMap)el('service-route-map-js')?.remove();if(session===V.session&&usable())setMessage(error.message||'No se pudo cargar el mapa. Las fichas siguen disponibles.',true);}
  finally{if(session===V.session)V.starting=false;}
}
function timeout(promise){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('La consulta del recorrido tardó demasiado.')),20000);})]).finally(()=>clearTimeout(timer));}
function pumpRoutes(){
  if(!usable()||!V.map)return;
  // At most three requests, no repeats on polling, and no queued work after leaving Activos.
  const candidates=[...V.rows].sort((a,b)=>Number(idOf(b)===V.selected)-Number(idOf(a)===V.selected));
  for(const s of candidates){if(V.pending.size>=3)break;const key=geometryKey(s);if(!pointsFor(s).route||V.cache.has(key)||V.failures.has(key)||V.pending.has(key))continue;const job={generation:V.generation,owner:owner()};V.pending.set(key,job);void loadRoute(s,key,job);}
  renderLegend();
}
async function loadRoute(s,key,job){
  const valid=()=>job.generation===V.generation&&job.owner===owner()&&usable()&&V.rows.some(row=>geometryKey(row)===key);
  try{
    const p=pointsFor(s),point=x=>({latitude:x.lat,longitude:x.lng});
    const r=await timeout(_db.functions.invoke('maps-proxy',{body:{action:'route',routeMode:'origin_destination',base:point(p.origin),origin:point(p.origin),destination:point(p.destination)}}));
    if(!valid())return;if(r.error||r.data?.error)throw Error('No se pudo consultar el recorrido.');
    const path=operationalPath(window.ServiceRouteMap.decode(r.data?.polyline),p),meters=number(r.data?.distanceMeters);
    if(!path.length)throw Error('El trazado no coincide con el origen y destino.');
    const message=(meters>0?new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(meters/1000)+' km · ':'')+'Recorrido de referencia. No indica la posición del móvil.';
    V.cache.set(key,{path,message});
  }catch(error){if(valid())V.failures.set(key,(error.message||'Recorrido no disponible.')+' Se muestran las direcciones verificadas.');}
  finally{
    if(V.pending.get(key)===job)V.pending.delete(key);
    if(usable()&&V.map){
      if(V.autoFit&&cameraRows().every(row=>!pointsFor(row).route||V.cache.has(geometryKey(row))||V.failures.has(geometryKey(row)))){V.fitNext=true;V.autoFit=false;}
      renderDetails();draw();pumpRoutes();
    }
  }
}
function jumpHistory(){
  const id=V.notice?.id,s=O().service(id);if(!s)return;
  V.returnView=Object.fromEntries(['view','query','status','company','driverFilter','truckFilter','periodSel','historyPage'].map(k=>[k,O().S[k]]));
  Object.assign(O().S,{query:String(code(s)),status:'all',company:'all',driverFilter:'',truckFilter:'',periodSel:{mode:'all'},historyPage:1});el('os-q').value=O().S.query;V.notice=null;window.cambiarVistaServicios('history');window.AuxiliosUI?.resaltarServicio?.(id);el('osm-history-return').hidden=false;
}
function handle(event){
  const selected=event.target.closest('[data-osm-select]');if(selected)return select(selected.dataset.osmSelect);
  const queue=event.target.closest('[data-osm-queue]');if(queue){const id=queue.dataset.osmQueue;if(V.rows.some(s=>idOf(s)===id))select(id);else window.verServicioOperador?.(id);return;}
  const action=event.target.closest('[data-osm-action]');if(action){if(!O().canTransitionState()||!V.selected)return;L()?.runQuickAction(action.dataset.osmAction,V.selected);return;}
  const task=event.target.closest('[data-osm]')?.dataset.osm;
  if(task==='open'&&V.selected)window.verServicioOperador?.(V.selected);
  if(task==='list'){V.listOpen=!V.listOpen;if(V.listOpen){V.selected='';renderDetails();draw();}renderList();sizeViewport();}
  if(task==='list-prev'||task==='list-next'){V.listPage=Math.max(0,V.listPage+(task==='list-next'?1:-1));renderList();}
  if(['summary','tracking','queue'].includes(task)){V.panel=task;renderDetails();}
  if(task==='queue-prev'||task==='queue-next'){V.queuePage=Math.max(0,V.queuePage+(task==='queue-next'?1:-1));renderDetails();}
  if(task==='legend-prev'||task==='legend-next'){V.legendPage=Math.max(0,V.legendPage+(task==='legend-next'?1:-1));renderLegend();}
  if(task==='fit'){V.camera='all';V.fitNext=true;V.autoFit=true;draw();}
  if(task==='retry'){dispose(false);void start();}
  if(task==='retry-route'){const s=V.rows.find(s=>idOf(s)===V.selected);if(s)V.failures.delete(geometryKey(s));renderDetails();pumpRoutes();}
  if(task==='retry-routes'){for(const s of V.rows)V.failures.delete(geometryKey(s));renderLegend();pumpRoutes();}
  if(task==='expand'){V.panel=V.panel==='expanded'?'summary':'expanded';renderDetails();el('osm-detail-body')?.querySelector('[data-osm="expand"]')?.focus({preventScroll:true});}
  if(task==='back'){const id=V.selected;V.listOpen=false;V.selected='';V.routeMessage='';V.camera='all';V.fitNext=true;V.autoFit=true;renderList();renderDetails();draw();el('osm-list-toggle')?.focus({preventScroll:true});}
  if(task==='dismiss'){V.notice=null;notice();}
  if(task==='history')jumpHistory();
  if(task==='return'&&V.returnView){const saved=V.returnView;V.returnView=null;V.selected='';Object.assign(O().S,saved);el('os-q').value=saved.query;window.cambiarVistaServicios(saved.view);O().S.status=saved.status;O().renderServices();switchView('map');}
}
function init(){
  screen=el('screen-operaciones');if(!screen||el('os-presentation'))return;
  const toggle=document.createElement('div');toggle.id='os-presentation';toggle.className='osm-view-switch';toggle.setAttribute('role','group');toggle.setAttribute('aria-label','Presentación de servicios');toggle.innerHTML=`<button type="button" data-osm-view="list" aria-pressed="true">${icon('list')}Lista</button><button type="button" data-osm-view="map" aria-pressed="false">${icon('map')}Mapa</button>`;screen.querySelector('.os-filters')?.append(toggle);toggle.addEventListener('click',e=>{const b=e.target.closest('[data-osm-view]');if(b)switchView(b.dataset.osmView);});
  const statusSelect=document.createElement('label');statusSelect.className='osm-status-filter';statusSelect.innerHTML='<span>Estado</span><select id="osm-status" aria-label="Estado de servicios"></select>';toggle.before(statusSelect);statusSelect.addEventListener('change',e=>window.filtrarEstadoServicios(e.target.value));
  host=document.createElement('section');host.id='osm-workspace';host.hidden=true;host.setAttribute('aria-label','Mapa de servicios');host.innerHTML=`<div id="osm-notice" class="osm-notice" role="status" hidden></div><div class="osm-toolbar"><div><button type="button" id="osm-list-toggle" data-osm="list" aria-expanded="false" aria-controls="osm-list">Servicios</button><span id="osm-coverage"></span><span id="osm-route-progress" role="status"></span></div><button type="button" data-osm="fit">${icon('scan')}Ver todos</button></div><div class="osm-layout"><aside class="osm-sidebar"><header><h3 id="osm-list-title">Servicios activos</h3><span>Según tus filtros</span></header><div id="osm-list" class="osm-list"></div><footer id="osm-list-pages" class="osm-pager"></footer></aside><div class="osm-stage"><div id="osm-canvas" role="region" aria-label="Direcciones y recorridos de los servicios"></div><div id="osm-map-message" class="osm-map-message" role="status" hidden></div><section class="osm-legend" aria-label="Colores por móvil"><b>Recorridos por móvil</b><div id="osm-legend-items"></div><div id="osm-legend-pages" class="osm-pager"></div><small>● Origen · ⚑ Destino</small></section></div><aside class="osm-detail" aria-label="Detalle del servicio"><header><button type="button" data-osm="back">${icon('x')}Cerrar</button><small>DETALLE OPERATIVO</small></header><div id="osm-detail-body" class="osm-detail-body"></div><footer id="osm-actions" class="osm-actions"></footer></aside></div>`;
  const back=document.createElement('button');back.id='osm-history-return';back.type='button';back.hidden=true;back.className='osm-history-return';back.dataset.osm='return';back.textContent='Volver al mapa de Activos';back.addEventListener('click',handle);screen.querySelector('.os-commandbar').after(back);
  screen.querySelector('.os-table-wrap').after(host);host.addEventListener('click',handle);host.addEventListener('keydown',e=>{if(e.key==='Escape'&&V.listOpen){V.listOpen=false;renderList();el('osm-list-toggle').focus({preventScroll:true});}else if(e.key==='Escape'&&V.selected&&!e.target.closest('details[open]')){e.preventDefault();host.querySelector('[data-osm="back"]').click();}});
  document.addEventListener('auxilios:services-rendered',sync);
  for(const name of ['pointerdown','wheel'])el('osm-canvas').addEventListener(name,()=>{V.autoFit=false;},{passive:true});
  window.addEventListener('auxilios:map-auth-failure',event=>{if(usable()){dispose(false);setMessage(event.detail||'No se pudo autorizar el mapa. Las fichas siguen disponibles.',true);}});
  screenObserver=new MutationObserver(()=>{if(!usable()){dispose(false);sizeViewport();}else sync();});screenObserver.observe(screen,{attributes:true,attributeFilter:['class']});
  sizeObserver=new ResizeObserver(sizeViewport);for(const node of [screen.closest('.content'),host.querySelector('.osm-stage'),...screen.querySelectorAll(':scope > :not(#osm-workspace)')])if(node)sizeObserver.observe(node);window.addEventListener('resize',sizeViewport);window.visualViewport?.addEventListener('resize',sizeViewport);
  themeObserver=new MutationObserver(()=>{if(V.map)V.map.setOptions({styles:window.ServiceRouteMap.mapStyle(true)});});themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  if(typeof _db!=='undefined')authSubscription=_db.auth?.onAuthStateChange?.((event)=>{if(event==='SIGNED_OUT'){dispose(true);V.selected='';V.rows=[];V.notice=null;V.returnView=null;V.presentation='list';host.hidden=true;sizeViewport();}})?.data?.subscription;
  window.addEventListener('pagehide',event=>{dispose(true);if(!event.persisted){authSubscription?.unsubscribe();themeObserver?.disconnect();screenObserver?.disconnect();sizeObserver?.disconnect();}});
  window.addEventListener('pageshow',event=>{if(event.persisted)sync();});sync();
}
window.OperatorServicesMap={sync,switchView,_test:{coordinate,pointsFor,operationalPath,geometryKey,primaryAction,documentLabel,mobileGroup,groupColor}};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();

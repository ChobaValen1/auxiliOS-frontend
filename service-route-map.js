/* AuxiliOS · read-only billing-route viewer. Google data stays on a Google map.
   No quotes, saves, resource assignments or editor state are changed here. */
(()=>{'use strict';
const O=()=>window.OperatorServices,db=()=>typeof _db==='undefined'?null:_db;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=n=>`<svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#${n}"/></svg>`;
const number=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
function coordinate(lat,lng){const a=number(lat),b=number(lng);return a!==null&&b!==null&&Math.abs(a)<=85&&Math.abs(b)<=180?{lat:a,lng:b}:null;}
const samePoint=(a,b)=>!!a&&!!b&&Math.abs(a.lat-b.lat)+Math.abs(a.lng-b.lng)<.00001;
const text=v=>String(v||'').trim();
const MODES={base_origin_destination_base:'Base → Origen → Destino → Base',base_origin:'Base → Origen',origin_destination:'Origen → Destino'};
function planFor(s,context){
  let mode=context?.billing?.route_mode;
  if(s.driver_activated){if(s.activation_kind!=='origin')return{stops:[],message:'Activado con kilometraje manual: no hay un recorrido automático.'};mode='base_origin_destination_base';}
  if(!MODES[mode])return{stops:[],message:mode==='manual'?'Kilometraje manual: no hay un recorrido automático de facturación.':'La prestadora no tiene un método de recorrido configurado.'};
  const b=context.bases?.find(x=>String(x.base_id)===String(s.billing_base_id||s.branch_id));
  const single=s.driver_activated||context.services?.some(c=>String(c.concept_id)===String(s.primary_concept_id||s.category_id)&&c.single_address===true);
  const base={key:'base',letter:'A',name:b?.name||s.billing_base_name||s.branch_name||'Base',address:text(b?.address),point:coordinate(b?.latitude,b?.longitude)};
  const origin={key:'origin',letter:mode==='origin_destination'?'A':'B',name:'Origen',address:text(s.origin_formatted_address||s.origin),point:coordinate(s.origin_lat,s.origin_lng)};
  const dest={key:'destination',letter:mode==='origin_destination'?'B':'C',name:'Destino',address:text(single?origin.address:s.destination_formatted_address||s.destination),point:single?origin.point:coordinate(s.destination_lat,s.destination_lng)};
  const stops=mode==='base_origin'?[base,origin]:mode==='origin_destination'?[origin,dest]:[base,origin,dest,{...base,name:'Regreso a base',return:true}];
  const value=p=>p.point?`${p.point.lat},${p.point.lng}`:p.address;
  let href='';if(stops.every(p=>value(p))){const u=new URL('https://www.google.com/maps/dir/');u.searchParams.set('api','1');u.searchParams.set('origin',value(stops[0]));u.searchParams.set('destination',value(stops.at(-1)));u.searchParams.set('travelmode','driving');if(stops.length>2)u.searchParams.set('waypoints',stops.slice(1,-1).map(value).join('|'));if(u.href.length<=2048)href=u.href;}
  return{mode,label:single&&mode==='base_origin_destination_base'?'Base → Origen → Base':MODES[mode],stops,href,ready:stops.every(p=>p.point),message:stops.every(p=>p.point)?'':'Faltan coordenadas verificadas. Podés consultar las direcciones, pero no se dibujará un trazado inventado.'};
}
function decode(poly){
  if(typeof poly!=='string'||poly.length>200000)return[];
  let i=0,lat=0,lng=0;const out=[];
  function read(){let v=0,shift=0,b;do{if(i>=poly.length||shift>30)throw Error('polyline');b=poly.charCodeAt(i++)-63;if(b<0||b>63)throw Error('polyline');v|=(b&31)<<shift;shift+=5;}while(b>=32);return(v&1)?~(v>>1):(v>>1);}
  try{while(i<poly.length){lat+=read();lng+=read();const p=coordinate(lat/1e5,lng/1e5);if(!p||out.length>=30000)return[];out.push(p);}}catch{return[];}return out;
}
const distance=(a,b)=>{const f=Math.PI/180,x=(a.lng-b.lng)*Math.cos((a.lat+b.lat)/2*f),y=a.lat-b.lat;return Math.hypot(x,y)*111195;};
// Ordered nearest waypoint cuts; no straight-line substitution when geometry is absent.
function splitPath(points,stops){
  if(points.length<2||stops.some(p=>!p.point)||distance(points[0],stops[0].point)>700||distance(points.at(-1),stops.at(-1).point)>700)return[];
  const cuts=[0];let from=0;
  for(const stop of stops.slice(1,-1)){let best=Infinity,index=from;for(let i=from;i<points.length;i++){const d=distance(points[i],stop.point);if(d<best){best=d;index=i;}}if(best>700)return[];cuts.push(index);from=index;}
  cuts.push(points.length-1);return cuts.slice(1).map((end,i)=>({points:points.slice(cuts[i],end+1),return:!!stops[i+1].return,label:`${stops[i].name} → ${stops[i+1].name}`}));
}
function tollsFor(commercial,reported,catalog){
  const find=id=>(catalog||[]).find(c=>id&&String(c.toll_id)===String(id));
  const planned=Array.isArray(commercial?.tolls)?commercial.tolls:[];
  // The remito is authoritative for reported rows. Its copied actual rows are not added again.
  const actual=Array.isArray(reported?.tolls)&&reported.tolls.length?reported.tolls:(commercial?.actual_tolls||[]);
  const normalize=(r,kind,index)=>{const c=find(r.toll_id),q=number(r.quantity)??1,total=number(r.total_amount),unit=number(r.unit_amount);return{
    id:`${kind}-${index}`,tollId:r.toll_id,code:`${kind==='planned'?'P':'I'}${index+1}`,kind,name:text(r.toll_name||r.toll_name_snapshot||c?.name)||'Peaje sin identificar',
    amount:total!==null?total:unit!==null?unit*q:null,currency:text(r.currency)||'ARS',quantity:q,
    payer:({provider:'Prestadora',customer:'Cliente',company:'Empresa'})[r.payer_agent]||'Pagador sin informar',direction:text(r.direction||r.direction_snapshot||c?.direction),
    point:coordinate(c?.latitude,c?.longitude),excluded:!!r.administratively_excluded||['rejected','excluded'].includes(r.review_status),
  };};
  return[...planned.map((r,i)=>normalize(r,'planned',i)),...actual.map((r,i)=>normalize(r,'reported',i))];
}
function canEdit(s,locks){return!!O()?.canManage?.()&&locks?.can_edit===true&&!['completed','cancelled'].includes(s.status);}
// Catalog proximity is a candidate, not proof of passage or a billable charge.
function routeTolls(path,catalog,registered){
  if(path.length<2)return[];
  const seen=new Set(registered.map(r=>String(r.tollId||'')).filter(Boolean)),found=[];
  for(const c of catalog||[]){
    if(!c.toll_id||seen.has(String(c.toll_id))||c.is_active===false)continue;
    const p=coordinate(c.latitude,c.longitude);if(!p)continue;
    const scale=Math.cos(p.lat*Math.PI/180);let nearest=Infinity,order=0;
    for(let i=1;i<path.length;i++){
      const a={x:(path[i-1].lng-p.lng)*scale*111195,y:(path[i-1].lat-p.lat)*111195},b={x:(path[i].lng-p.lng)*scale*111195,y:(path[i].lat-p.lat)*111195};
      const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,-(a.x*dx+a.y*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(a.x+t*dx,a.y+t*dy);
      if(d<nearest){nearest=d;order=i-1+t;}
    }
    if(nearest<=60){seen.add(String(c.toll_id));found.push({id:'route-'+c.toll_id,tollId:c.toll_id,kind:'route',name:text(c.name)||'Peaje',direction:text(c.direction),point:p,amount:null,currency:'ARS',payer:'No cargado en el servicio',quantity:1,order});}
  }
  return found.sort((a,b)=>a.order-b.order).map((r,i)=>({...r,code:'R'+(i+1)}));
}
const tollLabel=r=>r.kind==='route'?'Posible peaje del recorrido':r.kind==='planned'?'Previsto':'Informado por chofer';
let sdkJob=null,serial=0,current=null,modal=null;
const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const dark=()=>document.documentElement.dataset.theme!=='light';
const money=r=>r.amount===null?'Sin importe registrado':new Intl.NumberFormat('es-AR',{style:'currency',currency:/^[A-Z]{3}$/.test(r.currency)?r.currency:'ARS',maximumFractionDigits:2}).format(r.amount);
function timeout(promise,ms,message){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);})]).finally(()=>clearTimeout(timer));}
async function rpc(name,args){const result=await timeout(db().rpc(name,args),16000,'La consulta tardó demasiado. Reintentá.');if(result.error)throw Error(result.error.message||'No se pudo consultar el servicio.');return result.data;}
function loadSdk(){
  if(window.google?.maps?.Map)return Promise.resolve(window.google.maps);
  if(sdkJob)return sdkJob;
  sdkJob=(async()=>{
    const response=await timeout(fetch('/browser-map-config.json',{cache:'no-store',credentials:'same-origin'}),10000,'No se pudo leer la configuración del mapa.');
    if(!response.ok)throw Error('No está disponible la configuración del mapa.');
    const config=await response.json();if(!text(config.browserKey))throw Error('Falta configurar la clave de navegador de Google Maps en este entorno.');
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');let done=false;const callback='auxiliosGoogleMapReady';
      const timer=setTimeout(()=>finish(Error('Google Maps no respondió. Revisá la conexión y reintentá.')),18000);
      const finish=error=>{if(done)return;done=true;clearTimeout(timer);delete window[callback];if(error){window.gm_authFailure=priorAuth;script.remove();reject(error);}else resolve(window.google.maps);};
      const priorAuth=window.gm_authFailure;window.gm_authFailure=()=>{const error=Error('Google Maps rechazó la clave o el dominio. Revisá las restricciones de la clave de navegador.');if(!done)finish(error);else if(current){dispose(current);mapStatus(error.message,true);}};
      window[callback]=()=>window.google?.maps?.Map?finish():finish(Error('No se pudo iniciar Google Maps.'));
      const u=new URL('https://maps.googleapis.com/maps/api/js');for(const[k,v]of Object.entries({key:config.browserKey,callback,loading:'async',v:'quarterly',language:'es',region:'AR'}))u.searchParams.set(k,v);
      script.async=true;script.src=u.href;script.onerror=()=>finish(Error('No se pudo cargar Google Maps. Podés seguir usando el enlace externo.'));document.head.appendChild(script);
    });
  })().catch(error=>{sdkJob=null;throw error;});return sdkJob;
}
function ensure(){
  if(modal)return modal;
  modal=document.createElement('div');modal.id='service-route-modal';modal.className='srm-backdrop';modal.hidden=true;
  modal.innerHTML=`<section class="srm-dialog" role="dialog" aria-modal="true" aria-labelledby="srm-title" aria-describedby="srm-reference" tabindex="-1">
    <header class="srm-header"><span class="srm-header-icon">${icon('map')}</span><div><h2 id="srm-title">Ver recorrido</h2><p id="srm-reference"></p></div><button type="button" data-srm-close aria-label="Cerrar recorrido">${icon('x')}</button></header>
    <div class="srm-content"><aside class="srm-side"><h3>RECORRIDO SEGÚN FACTURACIÓN</h3><p id="srm-method" class="srm-method"></p><ol id="srm-stops" class="srm-stops"></ol><div id="srm-distance" class="srm-distance"></div><section class="srm-tolls"><h3>PEAJES DEL SERVICIO <span id="srm-toll-count"></span></h3><p class="srm-caption">Del recorrido, previstos e informados: separados y sin cargos automáticos.</p><div id="srm-tolls"></div></section></aside>
    <div class="srm-stage"><div id="srm-map" role="region" aria-label="Mapa del recorrido"></div><div id="srm-map-status" class="srm-map-status" role="status"></div><div class="srm-map-controls"><button type="button" data-srm-fit title="Ver recorrido completo" aria-label="Ver recorrido completo">${icon('map')}</button></div><div id="srm-legend" class="srm-legend" hidden><span><i></i>Ida</span><span><i class="is-return"></i>Regreso a base</span></div><div id="srm-toll-detail" class="srm-toll-detail" hidden></div></div></div>
    <div id="srm-notice" class="srm-notice" role="status"></div>
    <footer class="srm-footer"><small>${icon('info')}Vista de consulta. No modifica kilómetros ni importes.</small><div><button type="button" id="srm-edit" hidden>${icon('pencil')}Editar servicio</button><a id="srm-external" target="_blank" rel="noopener noreferrer">${icon('external-link')}Abrir en Google Maps</a><button type="button" data-srm-close>Cerrar</button></div></footer>
  </section>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',event=>{
    if(event.target===modal||event.target.closest('[data-srm-close]'))return close();
    if(event.target.closest('[data-srm-retry]')){const s=current;if(s)void open(s.id,s.opener);return;}
    if(event.target.closest('[data-srm-fit]'))return fit(current);
    const row=event.target.closest('[data-srm-toll]');if(row)return selectToll(current,row.dataset.srmToll);
    if(event.target.closest('[data-srm-detail-close]')){modal.querySelector('#srm-toll-detail').hidden=true;return;}
    if(event.target.closest('#srm-edit')){const s=current;if(!s||!canEdit(s.service,s.locks))return;const id=s.id;close();window.editarServicioOperador?.(id);}
  });
  document.addEventListener('keydown',event=>{
    if(modal.hidden)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}
    if(event.key==='Tab'){const elements=[...modal.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]')].filter(el=>!el.hidden&&el.getClientRects().length);const first=elements[0],last=elements.at(-1);if(!elements.length){event.preventDefault();modal.querySelector('.srm-dialog').focus();}else if(event.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){event.preventDefault();first.focus();}}
  },true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)finishAnimation(current);});
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>{if(reduced())finishAnimation(current);});
  new MutationObserver(()=>{if(current?.map)current.map.setOptions({styles:mapStyle()});}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  return modal;
}
function mapStatus(message,retry=false){modal.querySelector('#srm-map-status').innerHTML=`<span>${icon('map')}<b>${esc(message)}</b>${retry?'<button type="button" data-srm-retry>Reintentar</button>':''}</span>`;modal.querySelector('#srm-map-status').hidden=!message;}
function showShell(view){
  ensure();modal.hidden=false;view.previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  view.background=[...document.body.children].filter(el=>el!==modal&&el.tagName!=='SCRIPT'&&el.tagName!=='LINK').map(el=>({el,inert:el.inert}));view.background.forEach(({el})=>el.inert=true);
  for(const id of ['srm-method','srm-stops','srm-distance','srm-tolls','srm-toll-count','srm-notice','srm-map'])modal.querySelector('#'+id).textContent='';
  modal.querySelector('#srm-reference').textContent='Consultando servicio…';modal.querySelector('#srm-edit').hidden=true;modal.querySelector('#srm-external').hidden=true;modal.querySelector('#srm-external').removeAttribute('href');modal.querySelector('#srm-toll-detail').hidden=true;modal.querySelector('#srm-legend').hidden=true;modal.querySelector('[data-srm-fit]').disabled=true;mapStatus('Cargando el recorrido del servicio…');modal.querySelector('[data-srm-close]').focus();
}
const safely=fn=>{try{fn();}catch{/* A failed SDK must not prevent returning to the app. */}};
function dispose(view){if(!view)return;if(view.frame)cancelAnimationFrame(view.frame);view.frame=0;view.overlays?.forEach(o=>safely(()=>o.setMap(null)));view.lines?.forEach(l=>safely(()=>l.setMap(null)));view.mapListeners?.forEach(l=>safely(()=>l.remove()));if(view.map&&window.google?.maps?.event)safely(()=>window.google.maps.event.clearInstanceListeners(view.map));view.map=null;view.overlays=[];view.lines=[];view.mapListeners=[];}
function close(restore=true){const view=current;current=null;serial++;if(modal){modal.hidden=true;modal.dataset.animating='false';}if(!view)return;view.background?.forEach(({el,inert})=>el.inert=inert);document.body.style.overflow=view.previousOverflow||'';dispose(view);modal?.querySelector('#srm-map')?.replaceChildren();if(restore)safely(()=>{const target=view.opener?.isConnected&&view.opener.getClientRects().length?view.opener:document.querySelector(`[data-os-route-service="${CSS.escape(String(view.id))}"]`);target?.focus?.();});}
function renderDetails(view){
  const {service:s,plan,tolls}=view;
  modal.querySelector('#srm-reference').textContent=`Servicio ${s.service_order_number||s.service_number||''} · ${s.company_name||'Prestadora'}`;
  modal.querySelector('#srm-method').textContent=plan.label||'Recorrido no disponible';
  modal.querySelector('#srm-stops').innerHTML=plan.stops.map(p=>`<li><span class="srm-stop-letter${p.return?' is-return':''}">${p.letter}</span><div><b>${esc(p.name)}</b><small>${esc(p.address||'Dirección sin informar')}</small>${!p.point?'<small>Sin coordenadas verificadas</small>':''}</div></li>`).join('');
  const km=number(s.estimated_distance_km);modal.querySelector('#srm-distance').innerHTML=`<b>${km===null?'—':km.toLocaleString('es-AR',{maximumFractionDigits:1})+' km'}</b><span>Kilómetros guardados<small>${plan.stops.length?plan.stops.length-1+' tramos':'Sin trazado automático'}</small></span>`;
  const external=modal.querySelector('#srm-external');external.hidden=!plan.href;if(plan.href)external.href=plan.href;
  modal.querySelector('#srm-edit').hidden=!canEdit(s,view.locks);
  modal.querySelector('#srm-toll-count').textContent=String(tolls.length);
  modal.querySelector('#srm-tolls').innerHTML=tolls.length?tolls.map(r=>`<button type="button" class="srm-toll" data-srm-toll="${esc(r.id)}" aria-pressed="false"><span class="srm-toll-symbol">${r.code}</span><span><b>${esc(r.name)}</b><em>${tollLabel(r)}${r.excluded?' · Excluido':''}</em><small>${esc([r.direction,r.payer].filter(Boolean).join(' · '))}</small><small>${r.point?'Ubicación del catálogo':'Sin ubicación exacta · solo en la lista'}${r.quantity>1?' · '+esc(r.quantity)+' pasadas':''}</small></span><strong>${esc(r.kind==='route'?'Sin cargo agregado':money(r))}<small>${r.kind==='route'?'Referencia del catálogo':r.kind==='planned'?'Estimado registrado':'Importe informado'}</small></strong></button>`).join(''):'<p class="srm-empty">No hay peajes registrados ni candidatos del catálogo sobre el trazado.</p>';
  if(view.catalogError)modal.querySelector('#srm-notice').textContent='No se pudo consultar la ubicación de los peajes. Se mantienen los cargos registrados, sin inventar marcadores.';
}
async function open(id,opener){
  if(!O()?.canRead?.()||!db())return;
  if(O()?.S?.wizard&&!document.getElementById('modal-operador-wizard')?.hidden&&O().S.wizard.dirty){window.toast?.('Guardá o cerrá la edición antes de abrir el recorrido.','warning');return;}
  if(current)close(false);
  const view={id,opener,token:++serial,overlays:[],lines:[],mapListeners:[]};current=view;showShell(view);
  try{
    const ctx=await rpc('get_operator_service_handoff_context_v2',{p_service_id:id});if(current!==view)return;
    if(!ctx?.service||String(ctx.service.service_id)!==String(id))throw Error('No se pudo validar el servicio consultado.');
    view.service=ctx.service;view.locks=ctx.locks||{};
    const config=await rpc('get_operator_service_context_v1',{p_company_id:ctx.service.company_id,p_scheduled_for:new Date(ctx.service.scheduled_for).toISOString()});if(current!==view)return;
    view.plan=planFor(view.service,config);view.tolls=tollsFor(ctx.commercial_addons,ctx.reported_addons,[]);renderDetails(view);
    try{const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(ctx.service.scheduled_for));const catalog=await rpc('list_toll_catalog',{p_as_of:date,p_include_inactive:false});if(current!==view)return;view.catalog=Array.isArray(catalog)?catalog:[];view.tolls=tollsFor(ctx.commercial_addons,ctx.reported_addons,view.catalog);}catch{view.catalogError=true;}if(current!==view)return;renderDetails(view);
    if(!view.plan.ready){mapStatus(view.plan.message||'No hay trazado automático para este servicio.');return;}
    // Admin list may carry stored geometry. Operators get fresh coordinates from the
    // protected handoff; the viewer never widens that RPC's projection or saves data.
    const stored=O().service?.(id)?.route_polyline||view.service.route_polyline;
    let path=decode(stored),segments=splitPath(path,view.plan.stops);view.geometrySource=segments.length?'Trazado guardado':'Trazado consultado ahora';
    if(!segments.length){
      const point=p=>({latitude:p.lat,longitude:p.lng}),st=view.plan.stops;
      const result=await timeout(db().functions.invoke('maps-proxy',{body:{action:'route',routeMode:view.plan.mode,base:point(st.find(p=>p.key==='base')?.point||st[0].point),origin:point(st.find(p=>p.key==='origin').point),destination:point(st.find(p=>p.key==='destination')?.point||st.find(p=>p.key==='origin').point),departureTime:new Date(view.service.scheduled_for).toISOString()}}),20000,'No se pudo consultar el trazado a tiempo.');
      if(current!==view)return;if(result.error||result.data?.error)throw Error('No se pudo consultar el trazado. Los kilómetros guardados no se modificaron.');path=decode(result.data?.polyline);segments=splitPath(path,view.plan.stops);
    }
    if(current!==view)return;if(!segments.length)throw Error('El trazado no coincide con las paradas del servicio. No se dibujará una ruta aproximada.');
    view.path=path;view.segments=segments;view.tolls.push(...routeTolls(path,view.catalog,view.tolls));renderDetails(view);mapStatus('Cargando mapa…');const maps=await loadSdk();if(current!==view)return;drawMap(view,maps);mapStatus('');
    modal.querySelector('#srm-notice').textContent=[view.geometrySource+'. Kilómetros e importes guardados sin cambios.',view.catalogError?'No se pudo consultar la ubicación de los peajes.':''].filter(Boolean).join(' ');
  }catch(error){if(current!==view)return;mapStatus(error.message||'No se pudo abrir el recorrido.',true);}
}
function mapStyle(){return dark()?[
  {elementType:'geometry',stylers:[{color:'#19222e'}]},{elementType:'labels.text.fill',stylers:[{color:'#91a2b7'}]},{elementType:'labels.text.stroke',stylers:[{color:'#15202b'}]},
  {featureType:'water',elementType:'geometry',stylers:[{color:'#102d44'}]},{featureType:'road',elementType:'geometry',stylers:[{color:'#344355'}]},{featureType:'road.highway',elementType:'geometry',stylers:[{color:'#526179'}]},
  {featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]},{featureType:'transit',stylers:[{visibility:'off'}]},
]:[{featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]},{featureType:'transit',stylers:[{visibility:'off'}]}];}
function fit(view){if(!view?.map)return;const bounds=new window.google.maps.LatLngBounds();view.path.forEach(p=>bounds.extend(p));view.plan.stops.forEach(p=>p.point&&bounds.extend(p.point));view.map.fitBounds(bounds,80);}
function drawMap(view,maps){
  view.map=new maps.Map(modal.querySelector('#srm-map'),{center:view.path[0],zoom:11,mapTypeId:'roadmap',styles:mapStyle(),gestureHandling:'cooperative',zoomControlOptions:{position:maps.ControlPosition.RIGHT_TOP},mapTypeControl:false,streetViewControl:false,fullscreenControl:false,clickableIcons:false,backgroundColor:dark()?'#19222e':'#e9eef3'});
  modal.querySelector('[data-srm-fit]').disabled=false;
  fit(view);view.mapListeners.push(view.map.addListener('click',()=>{modal.querySelector('#srm-toll-detail').hidden=true;}));
  class Pin extends maps.OverlayView{
    constructor(point,label,name,select,toll){super();this.point=point;this.button=document.createElement('button');this.button.type='button';this.button.className='srm-pin'+(toll?' is-toll':'');this.button.textContent=label;this.button.title=name;this.button.setAttribute('aria-label',name);this.button.addEventListener('click',event=>{event.stopPropagation();select();});this.setMap(view.map);}
    onAdd(){this.getPanes().overlayMouseTarget.appendChild(this.button);maps.OverlayView.preventMapHitsAndGesturesFrom(this.button);}
    draw(){const p=this.getProjection().fromLatLngToDivPixel(new maps.LatLng(this.point.lat,this.point.lng));if(p){this.button.style.left=p.x+'px';this.button.style.top=p.y+'px';}}
    onRemove(){this.button.remove();}
  }
  const used=[];for(const stop of view.plan.stops){if(stop.return||used.some(p=>samePoint(p,stop.point)))continue;used.push(stop.point);view.overlays.push(new Pin(stop.point,stop.letter,`${stop.name}: ${stop.address}`,()=>{modal.querySelector('#srm-notice').textContent=`${stop.name}: ${stop.address}`;},false));}
  const groups=new Map();for(const r of view.tolls){if(!r.point)continue;const key=`${r.point.lat},${r.point.lng}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
  for(const rows of groups.values()){const first=rows[0];view.overlays.push(new Pin(first.point,rows.length>1?first.code+' +'+(rows.length-1):first.code,rows.map(r=>r.name).join(', '),()=>selectToll(view,first.id),true));}
  view.lines=view.segments.map(s=>new maps.Polyline({map:view.map,path:[],strokeColor:'#f5a623',strokeWeight:4,strokeOpacity:s.return?0:1,geodesic:false,clickable:false,zIndex:3,...(s.return?{icons:[{icon:{path:'M 0,-1 0,1',strokeOpacity:1,scale:2},offset:'0',repeat:'13px'}]}:{})}));
  const legend=modal.querySelector('#srm-legend');legend.hidden=false;legend.querySelector('.is-return').parentElement.hidden=!view.segments.some(s=>s.return);animate(view);
}
function finishAnimation(view){if(!view)return;if(view.frame)cancelAnimationFrame(view.frame);view.frame=0;if(view.segments&&view.lines)view.lines.forEach((line,i)=>line.setPath(view.segments[i].points));if(modal)modal.dataset.animating='false';}
function animate(view){
  if(reduced()){finishAnimation(view);return;}
  const counts=view.segments.map(s=>Math.max(1,s.points.length)),total=counts.reduce((a,b)=>a+b,0);let start;
  modal.dataset.animating='true';
  const tick=now=>{if(current!==view)return;if(document.hidden||reduced()){finishAnimation(view);return;}start??=now;let remaining=total*Math.min(1,(now-start)/1800);view.lines.forEach((line,i)=>{const n=Math.min(view.segments[i].points.length,Math.ceil(Math.max(0,remaining)));line.setPath(view.segments[i].points.slice(0,n));remaining-=counts[i];});if(now-start<1800)view.frame=requestAnimationFrame(tick);else finishAnimation(view);};view.frame=requestAnimationFrame(tick);
}
function selectToll(view,id){
  if(!view||current!==view)return;const r=view.tolls.find(t=>t.id===id);if(!r)return;
  modal.querySelectorAll('[data-srm-toll]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.srmToll===id)));
  const detail=modal.querySelector('#srm-toll-detail');detail.hidden=false;detail.innerHTML=`<button type="button" data-srm-detail-close aria-label="Cerrar detalle de peaje">${icon('x')}</button><b>${esc(r.code+' · '+r.name)}</b><em>${tollLabel(r)}${r.excluded?' · Excluido':''}</em><small>${esc([r.direction,r.payer].filter(Boolean).join(' · '))}</small><strong>${esc(r.kind==='route'?'Sin cargo agregado':money(r))}</strong><small>${r.point?'Ubicación del catálogo. Cercanía a la ruta no confirma pasada ni sentido de cobro.':'Sin ubicación exacta: no se coloca un marcador.'}</small>`;
  // No auto-pan: selecting a toll never hides the rest of the billing circuit.
}
window.ServiceRouteMap={open,close,_test:{coordinate,planFor,decode,splitPath,tollsFor,routeTolls,canEdit}};
})();

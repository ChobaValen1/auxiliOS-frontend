/* Ficha de servicio del Historial (solo lectura): mapa del recorrido, datos clave, línea de tiempo,
   cliente y vehículo, equipo, peajes, remito, notas y —sólo Administración/Facturación— el desglose.
   Escritorio: panel lateral. Celular: hoja desde abajo. El módulo dibuja y maneja el mapa;
   los datos y las acciones los entrega operator-services.js (host). */
(()=>{'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let host=null,el=null,backdrop=null,cur=null,opener=null,mapJob=0,view='ficha',swap=false,closeTimer=0;
const billingCache=new Map(),changesCache=new Map();
const MAP={map:null,line:null,markers:[],host:null,key:'',hasPath:false};

const row=(l,v)=>v===undefined||v===null||v===''?'':`<div class="hd-row"><dt>${esc(l)}</dt><dd>${v}</dd></div>`;
const section=(title,body,cls='')=>body?`<section class="hd-sec ${cls}"><h3>${esc(title)}</h3>${body}</section>`:'';

/* ---------- Mapa ---------- */
function schematic(m){
  const o=m.coords.origin,d=m.coords.destination;
  if(!o||!d)return`<div class="hd-map-empty"><strong>Sin coordenadas</strong><span>${m.coords.origin||m.coords.destination?'Falta el punto de '+(m.coords.origin?'destino':'origen')+'.':'Este servicio no tiene origen ni destino geolocalizados.'}</span></div>`;
  return`<svg class="hd-schem" viewBox="0 0 320 150" role="img" aria-label="Esquema del recorrido de ${esc(m.route.origin)} a ${esc(m.route.destination)}"><path d="M44 104 C 110 20, 214 138, 276 46" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="2 7" stroke-linecap="round"/><circle cx="44" cy="104" r="8" class="hd-pin-a"/><circle cx="276" cy="46" r="8" class="hd-pin-b"/><text x="44" y="108" text-anchor="middle">A</text><text x="276" y="50" text-anchor="middle">B</text></svg>`;
}
async function ensureRouteMap(){
  if(window.ServiceRouteMap)return window.ServiceRouteMap;
  try{
    if(!document.getElementById('service-route-map-css')){const l=document.createElement('link');l.id='service-route-map-css';l.rel='stylesheet';l.href='/service-route-map.css';document.head.appendChild(l);}
    if(typeof window.loadAuxiliosModule==='function')await window.loadAuxiliosModule('service-route-map-js','/service-route-map.js');
  }catch{/* queda el esquema */}
  return window.ServiceRouteMap||null;
}
/* Un solo mapa para todo el panel: pasar de un servicio a otro no vuelve a cargar el mapa (y no vuelve a facturarse). */
async function mountMap(m){
  const slot=el?.querySelector('[data-hd-map]');if(!slot||!m.coords.origin||!m.coords.destination)return;
  const key=`${m.id}|${m.coords.polyline?m.coords.polyline.length:0}`;
  if(MAP.key===key&&MAP.map&&MAP.host){slot.replaceChildren(MAP.host);slot.dataset.ready='1';const n=el.querySelector('[data-hd-map-note]');if(n)n.hidden=!!MAP.hasPath;return;}
  const job=++mapJob,SRM=await ensureRouteMap();
  if(job!==mapJob||!slot.isConnected||!SRM?.loadSdk)return;
  try{
    const maps=await SRM.loadSdk();if(job!==mapJob||!slot.isConnected)return;
    if(!MAP.host){MAP.host=document.createElement('div');MAP.host.className='hd-map-canvas';}
    slot.replaceChildren(MAP.host);
    if(!MAP.map)MAP.map=new maps.Map(MAP.host,{disableDefaultUI:true,zoomControl:true,gestureHandling:'cooperative',clickableIcons:false,styles:SRM.mapStyle?SRM.mapStyle():undefined});
    MAP.line?.setMap(null);MAP.markers.forEach(x=>x.setMap(null));MAP.markers=[];
    const path=SRM.decode?SRM.decode(m.coords.polyline):[],bounds=new maps.LatLngBounds(),pt=p=>SRM.coordinate?SRM.coordinate(p.lat,p.lng):p;
    const a=pt(m.coords.origin),b=pt(m.coords.destination);if(!a||!b)return;
    if(path.length){MAP.line=new maps.Polyline({map:MAP.map,path,strokeColor:'#f5a623',strokeWeight:5,strokeOpacity:.95,clickable:false});path.forEach(p=>bounds.extend(p));}
    else MAP.line=new maps.Polyline({map:MAP.map,path:[a,b],strokeOpacity:0,icons:[{icon:{path:'M 0,-1 0,1',strokeOpacity:.9,strokeColor:'#f5a623',scale:3},offset:'0',repeat:'14px'}],clickable:false});
    [['A',a,'Origen'],['B',b,'Destino']].forEach(([label,position,title])=>{MAP.markers.push(new maps.Marker({map:MAP.map,position,label,title}));bounds.extend(position);});
    maps.event.trigger(MAP.map,'resize');MAP.map.fitBounds(bounds,36);
    slot.dataset.ready='1';MAP.key=key;MAP.hasPath=path.length>0;
    const note=el.querySelector('[data-hd-map-note]');if(note)note.hidden=MAP.hasPath;
  }catch{/* se mantiene el esquema */}
}

/* ---------- Facturación (sólo Administración/Facturación) ---------- */
function money(v,cur){return new Intl.NumberFormat('es-AR',{style:'currency',currency:cur||'ARS',maximumFractionDigits:2}).format(Number(v)||0);}
function billingMarkup(m,entry){
  if(!entry||entry.state==='loading')return'<p class="hd-muted">Calculando el desglose…</p>';
  if(entry.state==='error')return`<p class="hd-muted">No se pudo cargar el desglose. <button type="button" class="hd-linkbtn" data-hd="retry-billing">Reintentar</button></p>`;
  const bd=window.AuxiliosBillingBreakdown,q=entry.detail?.current_quote;
  if(!bd||!q)return`<p class="hd-muted">Todavía no hay cotización para este servicio.</p>`;
  const cur=q.currency||'ARS',d=bd.filas(q,{currency:cur,total:q.current_company_amount});
  if(!d.filas.length)return'<p class="hd-muted">Sin conceptos para desglosar.</p>';
  const lines=d.filas.map(f=>`<li class="hd-bd-${esc(f.tipo)}"><span class="hd-bd-what"><b>${esc(f.etiqueta)}</b>${f.detalle?`<small>${esc(f.detalle)}</small>`:''}${f.cantidad==null?'':`<small>${esc(String(f.cantidad).replace('.',','))} × ${esc(money(f.unitario,cur))}</small>`}</span><span class="hd-bd-amt">${f.tipo==='peaje-aparte'?'<s>':''}${esc(money(f.importe,cur))}${f.tipo==='peaje-aparte'?'</s>':''}</span></li>`).join('');
  return`<ul class="hd-bd">${lines}</ul><div class="hd-bd-total"><span>Total a facturar</span><strong>${esc(money(d.total,cur))}</strong></div>`;
}
function loadBilling(id,force){
  if(!host?.billing)return;
  const key=String(id),have=billingCache.get(key);
  if(have&&!force&&have.state!=='error')return;
  billingCache.set(key,{state:'loading'});
  host.billing(key).then(detail=>{billingCache.set(key,{state:'ready',detail});},()=>{billingCache.set(key,{state:'error'});}).finally(()=>{if(String(cur)===key)paintBilling(key);});
}
function paintBilling(id){
  const slot=el?.querySelector('[data-hd-billing]'),m=host.model(id);if(!slot||!m)return;
  const entry=billingCache.get(String(id));slot.innerHTML=billingMarkup(m,entry);
  const km=el.querySelector('[data-hd-kpi-km]'),hint=el.querySelector('[data-hd-kpi-km-hint]'),q=entry?.state==='ready'?entry.detail?.current_quote:null,bd=window.AuxiliosBillingBreakdown;
  if(km&&q&&bd?.kilometros){const k=bd.kilometros(q,entry.detail?.service||{}),f=k.facturable;km.textContent=f==null?'—':`${f.toLocaleString('es-AR',{maximumFractionDigits:1})} km`;if(hint)hint.textContent=f==null?'':k.radio?`Radio cubierto: ${k.radio.toLocaleString('es-AR',{maximumFractionDigits:1})} km`:'';}
  else if(km&&entry?.state==='error')km.textContent='—';
}

/* ---------- Cambios: quién tocó el servicio ---------- */
function loadChanges(id,force){
  if(!host?.changes)return;
  const key=String(id),have=changesCache.get(key);
  if(have&&!force&&have.state!=='error')return;
  changesCache.set(key,{state:'loading'});
  host.changes(key).then(items=>{changesCache.set(key,{state:'ready',items});},()=>{changesCache.set(key,{state:'error'});}).finally(()=>{if(String(cur)===key&&view==='cambios')paintChanges(key);});
}
function changesMarkup(entry){
  if(!entry||entry.state==='loading')return'<p class="hd-muted">Cargando los cambios…</p>';
  if(entry.state==='error')return`<p class="hd-muted">No se pudieron cargar los cambios. <button type="button" class="hd-linkbtn" data-hd="retry-changes">Reintentar</button></p>`;
  if(!entry.items.length)return'<p class="hd-muted">Todavía no hay cambios registrados para este servicio.</p>';
  return`<ol class="hd-log">${entry.items.map(e=>`<li><div class="hd-log-main"><b>${esc(e.label)}</b>${e.note?`<span>${esc(e.note)}</span>`:''}</div><div class="hd-log-meta">${e.who?`<span class="hd-log-who">${esc(e.who)}</span>`:''}<time>${esc(e.time)}</time></div></li>`).join('')}</ol>`;
}
function paintChanges(id){const slot=el?.querySelector('[data-hd-changes]');if(slot)slot.innerHTML=changesMarkup(changesCache.get(String(id)));}

/* ---------- Ficha ---------- */
function ficha(m){
  const kpis=m.kpis.map(k=>`<div class="hd-kpi"><span>${esc(k.label)}</span><strong${k.id?` data-hd-${k.id}`:''}>${esc(k.value)}</strong>${k.hint||k.id?`<small${k.id?` data-hd-${k.id}-hint`:''}>${esc(k.hint||'')}</small>`:''}</div>`).join('');
  const tl=m.timeline.length?`<ol class="hd-tl">${m.timeline.map(e=>`<li class="${e.tone?'hd-tl-'+esc(e.tone):''}"><time>${esc(e.time)}</time><span>${esc(e.label)}${e.note?`<em>${esc(e.note)}</em>`:''}</span></li>`).join('')}</ol>`:'';
  const route=`<dl class="hd-kvs">${row('Base',esc(m.base))}${row('Origen',esc(m.route.origin))}${row('Destino',esc(m.route.destination))}</dl>`;
  const customer=`<dl class="hd-kvs">${row('Cliente',esc(m.customer.name))}${row('Teléfono',m.customer.phone?`<a href="tel:${esc(String(m.customer.phone).replace(/[^\d+]/g,''))}">${esc(m.customer.phone)}</a>`:'')}${row('Documento',esc(m.customer.document))}${row('Patente',esc(m.vehicle.plate))}${row('Vehículo',esc(m.vehicle.model))}</dl>`;
  const crew=`<dl class="hd-kvs">${row('Chofer',esc(m.crew.driver))}${row('Móvil',esc(m.crew.truck))}${row('Logística',esc(m.crew.logistics))}</dl>`;
  const docs=m.docs.length?`<dl class="hd-kvs">${m.docs.map(([l,v])=>row(l,esc(v))).join('')}</dl>`:'<p class="hd-muted">Todavía no hay remito.</p>';
  const pay=m.payment.length?`<dl class="hd-kvs">${m.payment.map(([l,v])=>row(l,esc(v))).join('')}</dl>`:'';
  const notes=m.notes.length?m.notes.map(n=>`<div class="hd-note"><b>${esc(n.label)}</b><p>${esc(n.text)}</p></div>`).join(''):'';
  const body=section('Línea de tiempo',tl)+section('Recorrido',route)+section('Cliente y vehículo',customer)+section('Equipo',crew)+section('Peajes',`<div class="hd-tolls">${m.tollsHtml}</div>`)+section('Remito y documentos',docs)+section('Cobros al cliente',pay)+section('Notas',notes)+(m.cancelReason?section('Motivo de anulación',`<p>${esc(m.cancelReason)}</p>`):'')+(m.showBilling?section('Facturación',`<div data-hd-billing></div>`,'hd-adm'):'');
  const links=[m.coords.mapsUrl?`<a class="hd-pill" href="${esc(m.coords.mapsUrl)}" target="_blank" rel="noopener">Abrir en Google Maps</a>`:'',m.coords.origin&&m.coords.destination?'<button type="button" class="hd-pill hd-pill-main" data-hd="expand" title="Base, origen, destino y regreso a base, con los km de cada tramo">Ver ruta con bases</button>':''].join('');
  return`<div class="hd-map" data-hd-map>${schematic(m)}</div><div class="hd-maplinks">${links}<span class="hd-map-note" data-hd-map-note${m.coords.polyline?' hidden':''}>Recorrido aproximado</span></div><div class="hd-kpis" style="--n:${m.kpis.length}">${kpis}</div><div class="hd-body">${body}</div>`;
}
function cambios(){return`<div class="hd-body"><section class="hd-sec"><h3>Quién modificó este servicio</h3><div data-hd-changes></div></section></div>`;}
function render(m){
  const chips=[`<span class="hd-chip hd-${esc(m.statusTone)}">${esc(m.statusLabel)}</span>`].concat(m.chips.map(c=>`<span class="hd-chip hd-${esc(c.tone||'soft')}">${esc(c.label)}</span>`)).join('');
  const pos=m.position?`<span class="hd-pos" aria-live="polite">${m.position.index} de ${m.position.total}</span>`:'';
  const tab=(v,l)=>`<button type="button" role="tab" class="hd-tab${view===v?' is-on':''}" aria-selected="${view===v}" data-hd="view-${v}">${l}</button>`;
  return `<header class="hd-head"><div class="hd-grab" aria-hidden="true"></div><div class="hd-top"><div class="hd-id"><small>${esc(m.provider)}${m.type?` · ${esc(m.type)}`:''}</small><strong class="hd-num">${esc(m.number)}</strong></div><div class="hd-tools">${pos}<button type="button" class="hd-btn" data-hd="prev" aria-label="Servicio anterior"${m.position&&m.position.index>1?'':' disabled'}>‹</button><button type="button" class="hd-btn" data-hd="next" aria-label="Servicio siguiente"${m.position&&m.position.index<m.position.total?'':' disabled'}>›</button><button type="button" class="hd-btn" data-hd="close" aria-label="Cerrar detalle">✕</button></div></div><div class="hd-chips">${chips}</div><div class="hd-tabs" role="tablist" aria-label="Vista del detalle">${tab('ficha','Ficha')}${tab('cambios','Cambios')}</div></header>
<div class="hd-scroll${swap?' hd-swap':''}">${view==='cambios'?cambios():ficha(m)}</div>
<footer class="hd-foot"><button type="button" class="hd-act" data-hd="copy">Copiar resumen</button>${m.canEdit?'<button type="button" class="hd-act" data-hd="edit">Editar servicio</button>':''}<button type="button" class="hd-act hd-primary" data-hd="full">Abrir completo</button></footer>`;
}
const isOpen=()=>!!el&&el.classList.contains('is-open');
function ensure(){
  if(el)return;
  backdrop=document.createElement('div');backdrop.className='hd-backdrop';backdrop.hidden=true;backdrop.addEventListener('click',close);
  el=document.createElement('aside');el.id='os-history-detail';el.className='hd';el.hidden=true;el.setAttribute('role','dialog');el.setAttribute('aria-label','Detalle del servicio');el.tabIndex=-1;
  el.addEventListener('click',e=>{const b=e.target.closest('[data-hd]');if(!b||b.disabled)return;const a=b.dataset.hd;if(a==='close')close();else if(a==='prev')nav(-1);else if(a==='next')nav(1);else if(a==='full'){const id=cur;close();host.openFull(id);}else if(a==='edit'){const id=cur;close();host.edit(id);}else if(a==='copy')copy();else if(a==='expand')host.openRoute?.(cur);else if(a==='retry-billing')loadBilling(cur,true),paintBilling(cur);else if(a==='retry-changes')loadChanges(cur,true),paintChanges(cur);else if(a==='view-ficha'||a==='view-cambios')setView(a.slice(5));});
  document.addEventListener('keydown',e=>{if(!isOpen())return;const typing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'');if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='ArrowDown'&&!typing){e.preventDefault();nav(1);}else if(e.key==='ArrowUp'&&!typing){e.preventDefault();nav(-1);}});
  document.body.append(backdrop,el);
}
function mark(){document.querySelectorAll('#os-table-body tr.os-row-selected').forEach(r=>r.classList.remove('os-row-selected'));if(cur==null)return;const r=[...document.querySelectorAll('#os-table-body tr[data-service-id]')].find(x=>x.dataset.serviceId===String(cur));if(r)r.classList.add('os-row-selected');}
function paint(animate){
  const m=host.model(cur);
  if(!m){close();return;}
  const sc=el.querySelector('.hd-scroll'),top=sc?.scrollTop||0,same=el.dataset.id===String(cur)&&!animate;
  /* El mapa vive en un nodo propio: se lo saca antes de redibujar para no destruirlo. */
  if(MAP.host?.parentNode)MAP.host.remove();
  swap=!!animate;el.innerHTML=render(m);swap=false;el.dataset.id=String(cur);
  if(same){const n=el.querySelector('.hd-scroll');if(n)n.scrollTop=top;}
  if(view==='cambios'){loadChanges(cur,false);paintChanges(cur);}
  else{if(m.showBilling){loadBilling(cur,false);paintBilling(cur);}void mountMap(m);}
  mark();
}
function setView(v){if(v===view)return;view=v;paint(true);}
function open(id){
  ensure();clearTimeout(closeTimer);opener=isOpen()?opener:document.activeElement;cur=id;paint(false);if(cur==null)return;
  el.hidden=false;backdrop.hidden=false;void el.offsetWidth;
  el.classList.add('is-open');backdrop.classList.add('is-open');document.body.classList.add('hd-open');el.focus({preventScroll:true});
}
function close(){
  if(!el||!isOpen())return;mapJob++;
  el.classList.remove('is-open');backdrop.classList.remove('is-open');document.body.classList.remove('hd-open');cur=null;view='ficha';mark();
  const done=()=>{if(!isOpen()){el.hidden=true;backdrop.hidden=true;}};
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(reduce)done();else closeTimer=setTimeout(done,300);
  if(opener&&document.contains(opener))opener.focus?.({preventScroll:true});opener=null;
}
function nav(d){const ids=host.ids(),i=ids.indexOf(String(cur)),n=ids[i+d];if(n===undefined)return;cur=n;host.onNav?.(n);paint(true);el.querySelector('.hd-scroll')?.scrollTo?.(0,0);}
function copy(){const t=host.summary(cur);if(!t)return;const done=()=>host.notify('Resumen copiado','success');(navigator.clipboard?.writeText(t)||Promise.reject()).then(done,()=>{const a=document.createElement('textarea');a.value=t;document.body.append(a);a.select();try{document.execCommand('copy');done();}catch{host.notify('No se pudo copiar','error');}a.remove();});}
function refresh(){if(!isOpen())return;paint(false);}
window.AuxiliosHistoryDetail={init(h){host=h;},open,close,refresh,isOpen,render};
})();

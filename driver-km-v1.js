/* Driver-only Km: read-only activity across trucks; existing journey actions own writes. */
(()=>{'use strict';
const PAGE=200,DAY=86400000;
const S={uid:null,rows:null,services:[],open:null,days:7,metric:'km',expanded:false,loading:false,reload:false,error:false,token:0,loaded:0,historyToken:0,history:[],historyDays:30,historyStatus:'all',offset:0,more:false,historyLoading:false};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v!==null&&v!==''&&v!==undefined&&Number.isFinite(Number(v))?Number(v):null;
const fmt=v=>v==null?'—':Number(v).toLocaleString('es-AR',{maximumFractionDigits:1});
const icon=n=>'<svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#'+n+'"/></svg>';
function identity(){try{return PERFIL_USUARIO?.roles?.name==='chofer'?USUARIO_ACTUAL?.id:null;}catch{return null;}}
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function shift(date,n){return new Date(Date.parse(date+'T12:00:00Z')+n*DAY).toISOString().slice(0,10);}
function dateLabel(date){return /^\d{4}-\d{2}-\d{2}$/.test(date||'')?new Intl.DateTimeFormat('es-AR',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')):'Sin fecha';}
function distance(j){const a=num(j.km_inicio),b=num(j.km_final);return j.status==='closed'&&a!==null&&b!==null&&b>=a?b-a:null;}
function services(j,uid){return j.status==='void'?0:(j.remitos||[]).filter(r=>r.status==='firmado'&&r.driver_id===uid).length;}
function summarize(rows,uid){const closed=rows.filter(j=>j.status==='closed'),valid=closed.map(distance).filter(v=>v!==null);return{km:valid.length?valid.reduce((a,b)=>a+b,0):closed.length?null:0,closed:closed.length,services:rows.reduce((a,j)=>a+services(j,uid),0),average:valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:null,missing:closed.length-valid.length};}
const columns='log_id,driver_id,log_date,truck_id,km_inicio,km_final,horas_inicio,horas_final,hora_inicio,hora_fin,status,trucks(plate,brand,model),remitos!remitos_log_id_fkey(status,driver_id)';
async function readPage(uid,from,to,offset,size,status='all'){
 let q=_db.from('daily_logs').select(columns).eq('driver_id',uid).lte('log_date',to);
 if(from)q=q.gte('log_date',from);
 if(status!=='all')q=q.eq('status',status);
 const {data,error}=await q.order('log_date',{ascending:false}).order('log_id',{ascending:false}).range(offset,offset+size-1);
 if(error)throw error;return data||[];
}
async function load(force=false){
 const uid=identity();if(!uid)return;
 if(S.uid!==uid){S.uid=uid;S.rows=null;S.services=[];S.open=null;S.loaded=0;S.expanded=false;S.history=[];S.historyToken++;S.loading=false;}
 if(S.loading){if(force)S.reload=true;return;}
 if(!force&&S.rows&&Date.now()-S.loaded<30000)return;
 const token=++S.token;S.loading=true;S.error=false;render();
 try{
  const rows=[],signed=[],active=[],to=today(),from=shift(to,-29);
  for(let offset=0;;offset+=PAGE){const page=await readPage(uid,from,to,offset,PAGE);rows.push(...page);if(page.length<PAGE)break;if(offset>=9800)throw Error('Demasiados registros');}
  for(let offset=0;;offset+=PAGE){const page=await readPage(uid,null,to,offset,PAGE,'open');active.push(...page);if(page.length<PAGE)break;if(offset>=9800)throw Error('Demasiadas jornadas abiertas');}
  for(let offset=0;;offset+=PAGE){
   const {data,error}=await _db.from('remitos').select('remito_id,firmado_at').eq('driver_id',uid).eq('status','firmado').gte('firmado_at',from+'T00:00:00-03:00').lt('firmado_at',shift(to,1)+'T00:00:00-03:00').order('firmado_at',{ascending:false}).order('remito_id',{ascending:false}).range(offset,offset+PAGE-1);
   if(error)throw error;const page=data||[];signed.push(...page.map(r=>({...r,date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(r.firmado_at))})));if(page.length<PAGE)break;if(offset>=9800)throw Error('Demasiados servicios');
  }
  if(token!==S.token||identity()!==uid)return;
  S.rows=rows;S.services=signed;S.open=active;S.loaded=Date.now();
 }catch(e){if(token===S.token){S.error=true;console.warn('No se pudo cargar la actividad de Km',e);}}
 finally{if(token===S.token){S.loading=false;render();if(S.reload){S.reload=false;void load(true);}}}
}
function totalsHTML(t){return '<dl class="dkm-totals"><div><dt>Kilómetros recorridos</dt><dd>'+fmt(t.km)+' <small>km</small></dd></div><div><dt>Servicios realizados</dt><dd>'+fmt(t.services)+'</dd></div><div><dt>Jornadas cerradas</dt><dd>'+fmt(t.closed)+'</dd></div><div><dt>Promedio por jornada</dt><dd>'+fmt(t.average)+' <small>km</small></dd></div></dl>'+(t.missing?'<p class="dkm-note">'+t.missing+' jornada(s) sin odómetros válidos; no suman kilómetros ni promedio.</p>':'');}
function statsHTML(){
 const rows=(S.rows||[]).filter(j=>j.log_date>=shift(today(),1-S.days)&&j.log_date<=today()),t=summarize(rows,S.uid);
 t.services=S.services.filter(r=>r.date>=shift(today(),1-S.days)&&r.date<=today()).length;
 const days=Array.from({length:S.days},(_,i)=>{const date=shift(today(),i+1-S.days),subset=rows.filter(j=>j.log_date===date),s=summarize(subset,S.uid);return{date,value:S.metric==='km'?s.km:S.services.filter(r=>r.date===date).length};}),max=Math.max(1,...days.map(d=>d.value));
 return '<div class="dkm-stat-head"><h3>Tu actividad</h3><div class="dkm-segment" aria-label="Período">'+[7,30].map(d=>'<button type="button" data-days="'+d+'" aria-pressed="'+(S.days===d)+'">'+d+' días</button>').join('')+'</div></div><p class="dkm-note">En todos tus camiones · '+dateLabel(shift(today(),1-S.days))+' al '+dateLabel(today())+'</p>'+totalsHTML(t)+'<div class="dkm-chart-head"><h4>Actividad por día</h4><div class="dkm-segment" aria-label="Métrica">'+[['km','Km'],['services','Servicios']].map(([m,label])=>'<button type="button" data-metric="'+m+'" aria-pressed="'+(S.metric===m)+'">'+label+'</button>').join('')+'</div></div><div class="dkm-chart" style="--dkm-count:'+days.length+'" aria-label="'+(S.metric==='km'?'Kilómetros de jornadas cerradas':'Servicios firmados')+' por día">'+days.map(d=>'<button type="button" class="dkm-day" data-date="'+d.date+'" aria-label="'+dateLabel(d.date)+': '+fmt(d.value)+(S.metric==='km'?' km':' servicios')+'"><span class="dkm-bar-track"><i style="height:'+Math.round(d.value/max*100)+'%"></i></span><small>'+Number(d.date.slice(-2))+'</small></button>').join('')+'</div><p class="dkm-chart-value" id="dkm-chart-value" role="status">Tocá un día para ver el detalle. Deslizá el gráfico para ver más días.</p><p class="dkm-note">Km según fecha de jornada cerrada. Servicios según fecha de firma; sin pendientes ni anulados.</p>';
}
function journeyHTML(j,prefix){
 const km=distance(j),state=j.status==='open'?'Abierta':j.status==='void'?'Anulada':'Cerrada',plate=j.trucks?.plate||'Camión sin informar';
 return '<details class="dkm-record"><summary><span class="dkm-record-icon">'+icon('truck')+'</span><span class="dkm-record-name"><b>'+esc(dateLabel(j.log_date))+' · '+esc(plate)+'</b><small>'+fmt(num(j.km_inicio))+' → '+fmt(num(j.km_final))+' km</small></span><span class="dkm-record-end"><strong>'+fmt(km)+(km===null?'':' km')+'</strong><small>'+services(j,S.uid)+' servicios · '+state+'</small></span>'+icon('chevron-down')+'</summary><dl class="dkm-record-detail"><div><dt>Inicio</dt><dd>'+esc(j.hora_inicio?.slice(0,5)||'—')+'</dd></div><div><dt>Cierre</dt><dd>'+esc(j.hora_fin?.slice(0,5)||'—')+'</dd></div><div><dt>Odómetro inicial</dt><dd>'+fmt(num(j.km_inicio))+' km</dd></div><div><dt>Odómetro final</dt><dd>'+fmt(num(j.km_final))+' km</dd></div></dl>'+(j.status==='open'?'<p class="dkm-note">El recorrido se calcula al cerrar la jornada.</p>':'')+'</details>';
}
function getOpen(){try{if(_jornadaActivaLocal?.log_id&&String(_jornadaActivaLocal.log_id).startsWith('TMP-'))return[{..._jornadaActivaLocal,status:'open',trucks:{plate:_jornadaActivaLocal.patente,brand:_jornadaActivaLocal.marca_modelo}}];}catch{}if(Array.isArray(S.open))return S.open;try{if(Array.isArray(_jornadasAbiertasCache)&&_jornadasAbiertasCache.length)return _jornadasAbiertasCache;}catch{}return(S.rows||[]).filter(j=>j.status==='open');}
function render(){
 const root=document.getElementById('dkm-root');if(!root||identity()!==S.uid)return;
 const open=getOpen(),j=open[0],truck=j?.trucks,older=open.filter(x=>x.log_date&&x.log_date<today()),recent=(S.rows||[]).filter(x=>x.status!=='open').slice(0,3),focus=document.activeElement,focusKey=focus?.dataset?.days?['days',focus.dataset.days]:focus?.dataset?.metric?['metric',focus.dataset.metric]:null;
 root.innerHTML='<header class="dkm-header"><div><h2>Km</h2><p>Tu jornada, en un vistazo</p></div><button type="button" class="dkm-refresh" data-refresh aria-label="Actualizar actividad" '+(S.loading?'disabled':'')+'>'+icon('refresh-cw')+'</button></header>'+
 (older.length?'<div class="dkm-attention"><b>'+older.length+' jornada(s) anterior(es) sin cerrar</b><button type="button" data-open-history>Revisar jornadas</button></div>':'')+
 '<article class="dkm-truck"><button type="button" class="dkm-truck-toggle" data-toggle aria-expanded="'+S.expanded+'" aria-controls="dkm-stats"><span class="dkm-eyebrow">'+(j?'TU CAMIÓN ACTUAL':'TU JORNADA')+'</span><span class="dkm-truck-heading"><span class="dkm-truck-icon">'+icon('truck')+'</span><span><strong>'+esc(truck?.plate||(j?'Jornada pendiente de sincronizar':'Sin jornada activa'))+'</strong><small>'+esc([truck?.brand,truck?.model].filter(Boolean).join(' ')||(j?'Camión de tu jornada':'Iniciá una jornada para registrar tu actividad'))+'</small><span class="dkm-badge">'+(j?'Jornada activa':'Sin iniciar')+'</span></span>'+icon('chevron-down')+'</span></button>'+
 (j?'<dl class="dkm-current"><div><dt>Inicio de jornada</dt><dd>'+esc(j.hora_inicio?.slice(0,5)||'—')+'</dd></div><div><dt>Odómetro inicial</dt><dd>'+fmt(num(j.km_inicio))+' <small>km</small></dd></div></dl>':'')+
 '<div id="dkm-stats" '+(S.expanded?'':'hidden')+'>'+(S.rows?statsHTML():'<p class="dkm-note">'+(S.error?'No pudimos cargar tu actividad.':'Cargando tu actividad…')+'</p>')+'</div><button type="button" class="dkm-disclosure" data-toggle aria-expanded="'+S.expanded+'" aria-controls="dkm-stats">'+(S.expanded?'Ocultar estadísticas':'Ver tus estadísticas')+icon('chevron-down')+'</button></article>'+
 '<div class="dkm-actions"><button type="button" class="dkm-primary" data-journey>'+(j?'Finalizar jornada':'Iniciar jornada')+icon(j?'square':'play')+'</button>'+(open.length>1?'<button type="button" class="dkm-secondary" data-open-history>Ver las '+open.length+' jornadas abiertas</button>':'')+'</div>'+
 (S.error?'<div class="dkm-error" role="status">'+(S.rows?'No se pudo actualizar. Mostrando la última consulta.':'No pudimos cargar tus registros.')+' <button type="button" data-refresh>Reintentar</button></div>':'')+
 '<section class="dkm-recent"><header><h3>Últimos registros</h3><button type="button" data-open-history>Ver historial '+icon('chevron-right')+'</button></header>'+(recent.length?recent.map(j=>journeyHTML(j,'recent')).join(''):'<p class="dkm-empty">'+(S.loading?'Cargando registros…':S.error?'Tus registros no están disponibles en este momento.':'Todavía no hay jornadas cerradas en los últimos 30 días.')+'</p>')+'</section>';
 if(focusKey)root.querySelector('[data-'+focusKey[0]+'="'+focusKey[1]+'"]')?.focus({preventScroll:true});
}
function reveal(){
 S.expanded=!S.expanded;render();const button=document.querySelector('#dkm-root .dkm-truck-toggle');button?.focus({preventScroll:true});
 const panel=document.getElementById('dkm-stats');if(S.expanded&&panel)window.dispatchEvent(new CustomEvent('auxilios:km-expanded',{detail:panel}));
}
function historyShell(){
 const modal=document.getElementById('modal-historial-jornadas'),body=modal?.querySelector('.modal-body');if(!body)return null;
 modal.classList.add('dkm-history');let host=document.getElementById('dkm-history-root');if(!host){host=document.createElement('section');host.id='dkm-history-root';body.append(host);}
 host.hidden=false; host.innerHTML='<div class="dkm-history-intro"><h3>Tu historial</h3><p>Jornadas y servicios, en todos tus camiones.</p></div><div class="dkm-history-filters"><label>Período<select id="dkm-history-period"><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="0">Todo el historial</option></select></label><label>Estado<select id="dkm-history-state"><option value="all">Todas</option><option value="closed">Cerradas</option><option value="open">Abiertas</option><option value="void">Anuladas</option></select></label></div><div id="dkm-history-summary"></div><div id="dkm-history-list" aria-live="polite"></div><button type="button" class="dkm-secondary" id="dkm-history-more" hidden>Cargar más</button>';
 host.querySelector('#dkm-history-period').value=String(S.historyDays);host.querySelector('#dkm-history-state').value=S.historyStatus;
 host.querySelectorAll('select').forEach(el=>el.addEventListener('change',()=>{S.historyDays=Number(host.querySelector('#dkm-history-period').value);S.historyStatus=host.querySelector('#dkm-history-state').value;void loadHistory(true);}));
 host.querySelector('#dkm-history-more').addEventListener('click',e=>void loadHistory(e.currentTarget.dataset.retryReset==='true'));return host;
}
async function loadHistory(reset){
 if(S.historyLoading&&!reset)return;
 const uid=identity();if(!uid)return;
 const token=++S.historyToken,to=today(),from=S.historyDays?shift(to,1-S.historyDays):null,list=document.getElementById('dkm-history-list'),more=document.getElementById('dkm-history-more'),summary=document.getElementById('dkm-history-summary');if(!list)return;
 if(reset){S.offset=0;S.history=[];list.innerHTML='<p class="dkm-empty">Cargando jornadas…</p>';summary.replaceChildren();}
 S.historyLoading=true;more.disabled=true;more.textContent='Cargando…';delete more.dataset.retryReset;
 try{
  const page=await readPage(uid,from,to,S.offset,21,S.historyStatus);
  if(token!==S.historyToken||identity()!==uid)return;
  S.more=page.length>20;S.history.push(...page.slice(0,20));S.offset+=Math.min(20,page.length);
  list.innerHTML=S.history.length?S.history.map(j=>journeyHTML(j,'history')).join(''):'<p class="dkm-empty">No hay jornadas para este período y estado.</p>';
  summary.innerHTML='<p class="dkm-note">Resumen de '+S.history.length+' jornadas cargadas'+(S.more?' · Hay más registros':'')+'</p>'+totalsHTML(summarize(S.history,uid));
  more.hidden=!S.more;
 }catch(e){if(token===S.historyToken){if(reset)list.innerHTML='<p class="dkm-error">No se pudo cargar el historial.</p>';more.hidden=false;more.textContent='Reintentar';more.dataset.retryReset=String(reset);console.warn('No se pudo cargar el historial de Km',e);}}
 finally{if(token===S.historyToken){S.historyLoading=false;more.disabled=false;if(more.textContent==='Cargando…')more.textContent='Cargar más';}}
}
function openHistory(openOnly=false){if(!identity())return false;if(S.uid!==identity())void load();S.historyStatus=openOnly?'open':'all';S.historyDays=openOnly?0:30;historyShell();openModal('modal-historial-jornadas');void loadHistory(true);return true;}
function init(){
 const screen=document.getElementById('screen-registro');if(!screen)return;
 const root=document.createElement('div');root.id='dkm-root';root.hidden=true;screen.prepend(root);
 root.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-toggle'))reveal();
  else if(b.dataset.days){S.days=Number(b.dataset.days);render();}
  else if(b.dataset.metric){S.metric=b.dataset.metric;render();}
  else if(b.dataset.date){document.getElementById('dkm-chart-value').textContent=b.getAttribute('aria-label');root.querySelectorAll('.dkm-day').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));}
  else if(b.hasAttribute('data-refresh'))void load(true);
  else if(b.hasAttribute('data-open-history'))openHistory(!!b.closest('.dkm-attention')||!!b.closest('.dkm-actions'));
  else if(b.hasAttribute('data-journey')){const j=getOpen()[0];if(j)iniciarCierreJornada(j);else abrirModalNuevaJornada();}
 });
 const sync=()=>{const on=!!identity();root.hidden=!on;const historyRoot=document.getElementById("dkm-history-root");if(historyRoot)historyRoot.hidden=!on;if(screen.classList.contains('driver-km-screen')!==on)screen.classList.toggle('driver-km-screen',on);document.getElementById('modal-historial-jornadas')?.classList.toggle('dkm-history',on);if(on&&screen.classList.contains('active'))void load();};
 new MutationObserver(sync).observe(screen,{attributes:true,attributeFilter:['class']});
 window.addEventListener('auxilios:profile-ready',sync);window.addEventListener('online',()=>{if(identity()&&screen.classList.contains('active'))void load(true);});sync();
}
window.AuxiliosDriverKm={openHistory,refresh:()=>load(true),updateOpen(rows){const uid=identity();if(!uid)return;if(S.uid!==uid){S.token++;S.uid=uid;S.rows=null;S.loaded=0;S.loading=false;}S.open=rows;render();void load(true);},distance,summarize,shift};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

/* AuxiliOS · Inicio del Operador (v1).
   Bandeja de acción: KPIs del día comparados a la misma hora, lo que hay que resolver con un botón
   que lo resuelve, choferes en jornada y cómo viene la gestión. Sin importes: todo sale de
   dashboard_operator_home_v1, que no devuelve ni un precio. */
(function(global){'use strict';
const TZ='America/Argentina/Buenos_Aires';
const S={data:null,error:'',busy:false,seq:0,root:null,days:14,cmp:'week',filter:'all',dtab:'on',metric:'asg',first:true,timer:null,watch:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const num=v=>new Intl.NumberFormat('es-AR',{maximumFractionDigits:0}).format(n(v));
const icon=(name,cls='')=>`<svg class="ax-icon ${cls}" aria-hidden="true"><use href="/ui/icons.svg#${name}"/></svg>`;
const reduced=()=>global.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const clock=v=>new Intl.DateTimeFormat('es-AR',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(v?new Date(v):new Date());
const weekday=d=>new Intl.DateTimeFormat('es-AR',{timeZone:TZ,weekday:'long'}).format(d);
const dayLabel=v=>String(v||'').slice(8,10)+'/'+String(v||'').slice(5,7);
const ini=name=>String(name||'?').trim().split(/\s+/).map(x=>x[0]||'').join('').slice(0,2).toUpperCase();
function age(since){if(!since)return'';const m=Math.max(0,Math.round((Date.now()-new Date(since).getTime())/60000));if(m<1)return'ahora';if(m<60)return m+' min';const h=Math.floor(m/60);if(h<48)return h+' h '+String(m%60).padStart(2,'0');return Math.floor(h/24)+' días';}
const ageMin=since=>since?(Date.now()-new Date(since).getTime())/60000:0;
const canCreate=()=>typeof global.OperatorServices?.canManage==='function'?global.OperatorServices.canManage():true;

/* ── Tareas: cada tipo con su tono, ícono, texto y acciones ── */
const FILTERS=[['all','Todo'],['now','Urgente'],['assign','Asignar'],['nosvc','Remitos sin servicio'],['relay','Relevos'],['doc','Remitos']];
const who=t=>t.driver||'El chofer';
const vehicle=t=>[t.vehicle,t.vehicle_plate].filter(Boolean).join(' · ');
const route=t=>[t.origin,t.destination].filter(Boolean).join(' → ');
const KIND={
  late_arrival:{f:'now',tone:'bad',ic:'clock',chip:'Demorado',ttl:t=>`${who(t)} lleva ${age(t.since)} sin llegar al origen`,pri:t=>t.driver_phone?['call','Llamar al chofer']:['open','Abrir'],sec:t=>t.driver_phone?['open','Abrir']:null},
  late_origin:{f:'now',tone:'bad',ic:'clock',chip:'Demorado en origen',ttl:t=>`${who(t)} lleva ${age(t.since)} en origen`,pri:t=>t.driver_phone?['call','Llamar al chofer']:['open','Abrir'],sec:t=>t.driver_phone?['open','Abrir']:null},
  unassigned:{f:'assign',tone:'warn',ic:'user',chip:'Sin chofer',ttl:t=>`${t.vehicle||t.vehicle_plate||'Servicio'} espera chofer`,pri:()=>['assign','Asignar'],sec:()=>['open','Abrir']},
  relay:{f:'relay',tone:'vio',ic:'repeat',chip:'Relevo por entregar',ttl:t=>`${who(t)} tiene que entregarle el vehículo a ${t.extra||'el 2º chofer'}`,pri:()=>['relay','Entregar relevo'],sec:()=>['open','Abrir'],place:true},
  intake:{f:'nosvc',tone:'warn',ic:'file-warning',chip:'Remito sin servicio',ttl:t=>`${who(t)} cargó un remito sin servicio asignado`,pri:()=>['intakes','Asociar o crear'],sec:t=>t.driver_phone?['call','Llamar']:null},
  remito_review:{f:'doc',tone:'info',ic:'file-check',chip:'Remito para revisar',ttl:t=>`Remito de ${who(t)} listo para revisar`,pri:()=>['open','Revisar remito'],sec:()=>null},
  remito_draft:{f:'doc',tone:'info',ic:'pencil',chip:'Remito en borrador',ttl:t=>`${who(t)} dejó el remito en borrador`,pri:()=>['open','Abrir'],sec:t=>t.driver_phone?['call','Recordar al chofer']:null},
  no_remito:{f:'doc',tone:'teal',ic:'flag',chip:'Servicio sin cerrar',ttl:()=>'Finalizado sin remito creado',pri:t=>t.driver_phone?['call','Pedir remito']:['open','Abrir'],sec:t=>t.driver_phone?['open','Abrir']:null},
};
const tasks=()=>(S.data?.tasks||[]).filter(t=>KIND[t.kind]);
const visible=()=>tasks().filter(t=>S.filter==='all'||KIND[t.kind].f===S.filter);
const taskKey=t=>t.kind+':'+(t.service_id||t.intake_id);
function taskHtml(t,i){const k=KIND[t.kind],pri=k.pri(t),sec=k.sec(t),urgent=k.tone==='bad'||(t.kind==='unassigned'&&ageMin(t.since)>20);
  const ctx=[vehicle(t)&&['truck',vehicle(t)],route(t)&&['route',(k.place?'Relevo en ':'')+route(t)],t.customer&&['building-2',t.customer],t.kind!=='relay'&&t.driver&&!/^late/.test(t.kind)&&t.kind!=='intake'&&['user',t.driver]].filter(Boolean);
  const btn=(a,cls)=>a?`<button type="button" class="btn sm ${cls}" data-oh-act="${a[0]}" data-oh-key="${esc(taskKey(t))}">${a[0]==='call'?icon('phone'):''}${esc(a[1])}</button>`:'';
  return`<article class="oh-task t-${k.tone}" data-key="${esc(taskKey(t))}" style="--i:${i}"><span class="sev"></span><div class="ic">${icon(k.ic)}</div><div class="body"><div class="k"><span class="oh-chip ${k.tone}">${esc(k.chip)}</span>${t.label?`<span class="mono">${esc(t.label)}</span>`:''}</div><div class="ttl">${esc(k.ttl(t))}</div>${ctx.length?`<div class="ctx">${ctx.map(([ic,tx])=>`<span>${icon(ic)}${esc(tx)}</span>`).join('')}</div>`:''}</div><div class="do"><span class="age ${urgent?'hot':''}" title="Desde ${esc(clock(t.since))}">${esc(age(t.since))}</span>${btn(sec,'')}${btn(pri,'pri')}</div></article>`;}

/* ── Esqueleto ── */
function montar(){const root=document.getElementById('aux-operator-home');if(!root)return null;S.root=root;root.innerHTML=`
<div class="oh-top"><span class="oh-live"><i></i>En vivo · <span id="oh-updated">—</span></span><div class="grow"></div>
  <button type="button" class="btn" data-oh-go="map">${icon('map')}Mapa</button>${canCreate()?`<button type="button" class="btn pri oh-hide-m" data-oh-go="create">${icon('plus')}Nuevo servicio</button>`:''}</div>
<section class="oh-card oh-kpis"><header><h2>Hoy</h2><small>Desde las 00:00 · comparado a la misma hora</small><div class="grow"></div><div class="oh-seg" id="oh-cmp"><button type="button" data-c="week"></button><button type="button" data-c="day">vs. ayer</button></div></header><div class="oh-kgrid" id="oh-kgrid"></div></section>
<div class="oh-wrap">
  <section class="oh-card oh-inbox"><div class="oh-ibar"><h2>Para resolver</h2><span class="oh-bubble" id="oh-bubble">0</span><div class="oh-filters" id="oh-filters"></div></div>
    <div class="oh-qwrap" id="oh-qwrap"><div class="oh-queue" id="oh-queue"></div><div class="fade"></div><button type="button" class="more" id="oh-more"><b id="oh-more-n">+0</b>más para ver${icon('chevron-down')}</button></div>
    <div class="oh-empty" id="oh-empty" hidden>${icon('circle-check')}<h3>Todo al día</h3><p>Apenas entre algo nuevo aparece acá.</p></div></section>
  <aside class="oh-rail">
    <section class="oh-card"><header><h2>Choferes en jornada</h2></header><div class="oh-dtabs" id="oh-dtabs"></div><div class="oh-drv" id="oh-drv"></div></section>
    <section class="oh-card oh-perf"><header><h2>Cómo viene la gestión</h2><div class="grow"></div><div class="oh-seg" id="oh-range"><button type="button" data-d="14" class="on">14 días</button><button type="button" data-d="30">30 días</button></div></header>
      <p class="sub">Lo que depende del equipo de operaciones</p><div class="oh-mtabs" id="oh-mtabs"></div>
      <div class="oh-chart"><svg id="oh-svg" viewBox="0 0 340 220" role="img" aria-label="Evolución diaria"></svg><div class="tip" id="oh-tip"></div></div>
      <div class="cap"><span><i></i>Últimos <b id="oh-cap-d">14</b> días</span><span><i class="p"></i>Período anterior</span><span id="oh-cap-goal"><i class="g"></i>Objetivo</span><span id="oh-cap-dir"></span></div></section>
  </aside>
</div>
${canCreate()?`<button type="button" class="btn pri oh-fab" data-oh-go="create">${icon('plus')}Nuevo servicio</button>`:''}
<div class="oh-error" id="oh-error" hidden></div>`;
  root.addEventListener('click',onClick);
  root.querySelector('#oh-queue').addEventListener('scroll',moreState,{passive:true});
  global.addEventListener('resize',()=>{if(!visibleNow())return;sizeQueue();moreState();pill();chart(false);});
  return root;}

/* ── KPIs ── */
const KP=[['services','Servicios del día','list-checks','up',1],['active','Activos ahora','navigation','flat'],['completed','Finalizados','circle-check','up'],['cancelled','Anulados','circle-x','down'],['km','Km recorridos','route','up',0,'km']];
function cmpText(){const d=new Date(Date.now()-7*864e5);return S.cmp==='week'?`el ${weekday(d)} pasado`:'ayer';}
function kpis(){const k=S.data?.kpis,el=S.root.querySelector('#oh-kgrid');S.root.querySelector('#oh-cmp [data-c="week"]').textContent=`vs. ${weekday(new Date(Date.now()-7*864e5))} pasado`;S.root.querySelectorAll('#oh-cmp button').forEach(b=>b.classList.toggle('on',b.dataset.c===S.cmp));
  el.innerHTML=KP.map(([key,label,ic,better,main,unit])=>{const v=k?n(k.now?.[key]):null,p=k?n(k[S.cmp]?.[key]):0,d=p?(v-p)/p*100:(v?100:0);const cls=!k||better==='flat'||!d?'flat':(better==='down'?(d<0?'good':'bad'):(d>0?'good':'bad'));
    const dtxt=!k?'…':p?`${d>0?'▲':d<0?'▼':'='} ${num(Math.abs(d))} %`:(v?'▲ nuevo':'= sin cambio');
    return`<div class="oh-kp ${main?'is-main':''}"><div class="l">${icon(ic)}${label}</div><div class="v"><span data-oh-count="${v??''}">${v==null?'—':num(v)}</span>${unit?`<small>${unit}</small>`:''}</div><span class="d ${cls}">${dtxt}</span><span class="was">A esta hora ${esc(cmpText())}: <b>${k?num(p)+(unit?' '+unit:''):'—'}</b></span></div>`;}).join('');
  if(S.first&&k&&!reduced())el.querySelectorAll('[data-oh-count]').forEach(s=>{const to=n(s.dataset.ohCount),t0=performance.now();const step=t=>{const q=Math.min(1,(t-t0)/700),e=1-Math.pow(1-q,3);s.textContent=num(to*e);if(q<1)requestAnimationFrame(step);};requestAnimationFrame(step);});}

/* ── Bandeja ── */
function filters(){const el=S.root.querySelector('#oh-filters'),all=tasks();if(S.filter!=='all'&&!all.some(t=>KIND[t.kind].f===S.filter))S.filter='all';
  el.innerHTML='<span class="pill" id="oh-pill"></span>'+FILTERS.map(([k,l])=>{const c=k==='all'?all.length:all.filter(t=>KIND[t.kind].f===k).length;return c||k==='all'?`<button type="button" class="${k===S.filter?'on':''}" data-oh-f="${k}">${l} <b>${c}</b></button>`:'';}).join('');requestAnimationFrame(pill);}
function pill(){const b=S.root?.querySelector('#oh-filters button.on'),p=S.root?.querySelector('#oh-pill');if(!b||!p)return;Object.assign(p.style,{left:b.offsetLeft+'px',top:b.offsetTop+'px',width:b.offsetWidth+'px'});}
function queue(){const l=visible(),q=S.root.querySelector('#oh-queue');q.innerHTML=l.map(taskHtml).join('');q.classList.toggle('enter',S.first&&!reduced());
  S.root.querySelector('#oh-empty').hidden=!!l.length;S.root.querySelector('#oh-qwrap').hidden=!l.length;const b=S.root.querySelector('#oh-bubble');b.textContent=tasks().length;b.classList.toggle('zero',!tasks().length);sizeQueue();moreState();}
/* Escritorio: la bandeja se estira hasta la altura de la columna derecha. Celular: 3 visibles y el resto a un scroll. */
function sizeQueue(){const q=S.root?.querySelector('#oh-queue');if(!q)return;const c=[...q.children],rail=S.root.querySelector('.oh-rail'),inbox=S.root.querySelector('.oh-inbox');q.style.height='';q.style.maxHeight='';
  if(global.innerWidth>1150&&rail&&inbox){const extra=inbox.offsetHeight-q.offsetHeight;const h=Math.max(320,rail.offsetHeight-extra);q.style.height=h+'px';q.style.maxHeight=h+'px';return;}
  if(c.length>3)q.style.maxHeight=(c.slice(0,3).reduce((a,x)=>a+x.offsetHeight,0)+8*2+40)+'px';}
function moreState(){const q=S.root?.querySelector('#oh-queue');if(!q)return;const hidden=[...q.children].filter(x=>x.offsetTop+x.offsetHeight/2>q.scrollTop+q.clientHeight).length;S.root.querySelector('#oh-more-n').textContent='+'+hidden;S.root.querySelector('#oh-qwrap').classList.toggle('end',hidden===0);}

/* ── Choferes ── */
function drivers(anim){const D=S.data?.drivers||[],on=D.filter(d=>d.state!=='inactive'),off=D.filter(d=>d.state==='inactive');const tabs=S.root.querySelector('#oh-dtabs');
  tabs.innerHTML='<span class="dpill" id="oh-dpill"></span>'+[['on','Activos',on.length,'ok'],['off','Inactivos',off.length,'']].map(([k,l,c,cl])=>`<button type="button" class="${k===S.dtab?'on':''}" data-oh-t="${k}">${l}<b class="${cl}">${c}</b></button>`).join('');
  requestAnimationFrame(()=>{const b=tabs.querySelector('button.on'),p=tabs.querySelector('#oh-dpill');if(b&&p){p.style.left=b.offsetLeft+'px';p.style.width=b.offsetWidth+'px';}});
  const CH={free:['Libre','ok'],busy:['Con servicio','info'],inactive:['Inactivo','']};const list=S.dtab==='on'?on:off;const el=S.root.querySelector('#oh-drv');
  el.innerHTML=(S.dtab==='on'&&on.length?`<div class="dsum"><span class="oh-chip ok">${on.filter(d=>d.state==='free').length} libres</span><span class="oh-chip info">${on.filter(d=>d.state==='busy').length} con servicio</span></div>`:'')+
    (list.length?list.map(d=>{const veh=[d.truck?(/^\d+$/.test(String(d.truck))?'Móvil '+d.truck:d.truck):'',d.plate].filter(Boolean);return`<div class="dr"><span class="av ${d.state}">${esc(ini(d.name))}</span><div class="who"><b>${esc(d.name)}</b><span class="truck">${icon('truck')}${veh.length?`${esc(veh[0])}${veh[1]?` · <span class="mono">${esc(veh[1])}</span>`:''}`:'Sin jornada iniciada'}</span></div><span class="oh-chip ${CH[d.state][1]}">${CH[d.state][0]}</span></div>`;}).join(''):`<p class="none">${S.dtab==='on'?'Ningún chofer inició jornada todavía.':'Todos los choferes están en jornada.'}</p>`);
  if(anim&&!reduced())el.querySelectorAll('.dr').forEach((r,i)=>r.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:280,delay:i*30,easing:'cubic-bezier(0,0,0,1)',fill:'backwards'}));}

/* ── Cómo viene la gestión ── */
const M=[
  {k:'asg',f:'assign_minutes',l:'Tiempo hasta asignar',u:' min',better:'down',goal:15,help:'Mediana de minutos desde que se carga el servicio hasta que tiene chofer'},
  {k:'late',f:'late',l:'Servicios demorados',u:'',better:'down',goal:null,help:'Finalizados que pasaron 2 h sin llegar al origen o 3 h en origen'},
  {k:'rem',f:'remito_same_day',l:'Remitos cerrados en el día',u:' %',better:'up',goal:90,help:'Finalizados con el remito firmado el mismo día'},
  {k:'fin',f:'completed',l:'Finalizados por día',u:'',better:'up',goal:null,help:'Servicios que llegaron a Finalizado'},
];
function seriesOf(m){const s=S.data?.series||[];const cur=s.filter(x=>!x.previous),prev=s.filter(x=>x.previous);const val=x=>x?.[m.f]==null?null:n(x[m.f]);return{days:cur.map(x=>x.day),cur:cur.map(val),prev:prev.map(val)};}
const avg=a=>{const v=a.filter(x=>x!=null);return v.length?v.reduce((x,y)=>x+y,0)/v.length:null;};
function mdelta(m){const s=seriesOf(m),c=avg(s.cur.slice(-7)),p=avg(s.prev.slice(-7));if(c==null||!p)return null;const d=(c-p)/p*100;return{d,good:m.better==='down'?d<=0:d>=0};}
function mtabs(){S.root.querySelector('#oh-mtabs').innerHTML=M.map(m=>{const s=seriesOf(m),last=[...s.cur].reverse().find(x=>x!=null),d=mdelta(m);return`<button type="button" class="oh-mtab ${m.k===S.metric?'on':''}" data-oh-m="${m.k}" title="${esc(m.help)}"><span>${m.l}</span><b>${last==null?'—':num(last)+m.u}</b><small class="${d?(d.good?'good':'bad'):''}">${d?`${d.d>0?'▲':'▼'} ${num(Math.abs(d.d))} % últ. 7 días`:'Sin base para comparar'}</small></button>`;}).join('');}
function chart(anim){const svg=S.root?.querySelector('#oh-svg');if(!svg||!S.data)return;const m=M.find(x=>x.k===S.metric),s=seriesOf(m),N=s.cur.length;if(!N){svg.innerHTML='';return;}
  const H=svg.clientHeight||220,W=Math.max(280,svg.clientWidth||340);svg.setAttribute('viewBox',`0 0 ${W} ${H}`);const L=30,R=8,T=12,B=22;
  const all=[...s.cur,...s.prev,...(m.goal!=null?[m.goal]:[])].filter(x=>x!=null);let lo=Math.min(0,...all),hi=Math.max(1,...all);hi=Math.ceil(hi+(hi-lo)*.12);
  const x=i=>L+i*(W-L-R)/Math.max(1,N-1),y=v=>T+(1-(v-lo)/((hi-lo)||1))*(H-T-B);
  const path=a=>{let d='',pen=false;a.forEach((v,i)=>{if(v==null){pen=false;return;}d+=(pen?'L':'M')+x(i).toFixed(1)+','+y(v).toFixed(1)+' ';pen=true;});return d.trim();};
  const ticks=[lo,Math.round((lo+hi)/2),hi],step=N>20?(W<420?7:5):(W<420?4:2);
  svg.innerHTML=`<defs><linearGradient id="oh-ga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--oh-ac)" stop-opacity=".22"/><stop offset="1" stop-color="var(--oh-ac)" stop-opacity="0"/></linearGradient></defs>
  <g class="grid">${ticks.map(t=>`<line x1="${L}" x2="${W-R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L-6}" y="${y(t)+3}" text-anchor="end">${t}</text>`).join('')}</g>
  <g class="xl">${s.days.map((d,i)=>i===N-1?`<text x="${x(i)}" y="${H-5}" text-anchor="end">Hoy</text>`:((N-1-i)%step===0&&N-1-i>=step*0.8?`<text x="${x(i)}" y="${H-5}" text-anchor="middle">${dayLabel(d)}</text>`:'')).join('')}</g>
  ${m.goal!=null?`<line class="goal" x1="${L}" x2="${W-R}" y1="${y(m.goal)}" y2="${y(m.goal)}"/><text class="goal-t" x="${L+4}" y="${y(m.goal)-5}">Objetivo ${m.goal}${m.u}</text>`:''}
  <path class="prev" d="${path(s.prev.slice(-N))}"/>
  <path class="line" id="oh-ln" d="${path(s.cur)}"/>
  ${s.cur.map((v,i)=>v==null?'':`<circle class="pt ${i===N-1?'last':''}" cx="${x(i)}" cy="${y(v)}" r="${i===N-1?4.5:N>20?2:2.8}"/>`).join('')}
  <rect x="${L}" y="0" width="${W-L-R}" height="${H-B}" fill="transparent" id="oh-hit"/>`;
  S.root.querySelector('#oh-cap-dir').textContent=m.better==='down'?'↓ Más bajo es mejor':'↑ Más alto es mejor';S.root.querySelector('#oh-cap-goal').hidden=m.goal==null;S.root.querySelector('#oh-cap-d').textContent=N;
  if(anim&&!reduced()){const ln=svg.querySelector('#oh-ln');if(ln&&ln.getTotalLength){const len=ln.getTotalLength();ln.style.strokeDasharray=len;ln.animate([{strokeDashoffset:len},{strokeDashoffset:0}],{duration:900,easing:'cubic-bezier(0,0,0,1)'}).onfinish=()=>{ln.style.strokeDasharray='';};}}
  const hit=svg.querySelector('#oh-hit'),tip=S.root.querySelector('#oh-tip');
  hit.onmousemove=e=>{const r=svg.getBoundingClientRect(),px=(e.clientX-r.left)/r.width*W,i=Math.max(0,Math.min(N-1,Math.round((px-L)/((W-L-R)/Math.max(1,N-1))))),v=s.cur[i],pv=s.prev.slice(-N)[i];tip.style.opacity=1;tip.style.left=(x(i)/W*r.width)+'px';tip.style.top=(y(v??lo)/H*r.height)+'px';tip.textContent=`${i===N-1?'Hoy':dayLabel(s.days[i])} · ${v==null?'sin datos':num(v)+m.u}${pv!=null?`  (antes ${num(pv)}${m.u})`:''}`;};
  hit.onmouseleave=()=>tip.style.opacity=0;}

/* ── Render completo ── */
function render(){if(!S.root)return;const err=S.root.querySelector('#oh-error');err.hidden=!S.error;err.textContent=S.error?'No se pudo actualizar el Inicio: '+S.error:'';
  S.root.querySelector('#oh-updated').textContent=S.data?'actualizado '+clock(S.data.generated_at):(S.busy?'cargando…':'—');
  kpis();filters();queue();drivers(false);mtabs();requestAnimationFrame(()=>{chart(S.first);sizeQueue();moreState();});
  if(S.first&&S.data){S.root.classList.add('ready');S.first=false;}}
async function rpc(name,args){if(typeof _db==='undefined')throw new Error('La sesión todavía no está lista.');const r=await _db.rpc(name,args);if(r.error)throw r.error;return r.data;}
async function cargar(){if(!S.root&&!montar())return;const seq=++S.seq;S.busy=true;if(!S.data)render();
  try{const d=await rpc('dashboard_operator_home_v1',{p_days:S.days});if(seq!==S.seq)return;S.data=d;S.error='';}
  catch(e){if(seq!==S.seq)return;S.error=e?.message||'error desconocido';}
  finally{if(seq===S.seq){S.busy=false;render();}}
  schedule();}
const visibleNow=()=>!!S.root&&S.root.offsetParent!==null&&document.getElementById('screen-dashboard')?.classList.contains('active');
function schedule(){clearTimeout(S.timer);S.timer=setTimeout(()=>{if(visibleNow()&&document.visibilityState==='visible')cargar();else schedule();},60000);}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&visibleNow()&&S.data&&Date.now()-new Date(S.data.generated_at).getTime()>30000)cargar();});

/* ── Acciones: reusan los flujos que ya existen en Servicios ── */
const findTask=key=>tasks().find(t=>taskKey(t)===key);
const notify=(m,t='info')=>typeof global.toast==='function'?global.toast(m,t):console.log(m);
/* Al cerrarse el modal de Servicios (asignar, ver), el Inicio se vuelve a pedir para que la tarea resuelta salga. */
function refreshAfterModal(){clearInterval(S.watch);let seen=false,ticks=0;S.watch=setInterval(()=>{ticks++;const open=[...document.querySelectorAll('#os-lifecycle-modal,#modal-operador-wizard')].some(m=>m&&!m.hidden&&(m.id!=='modal-operador-wizard'||m.classList.contains('open')));if(open)seen=true;if((seen&&!open)||ticks>600){clearInterval(S.watch);if(seen)cargar();}},500);}
async function ensureServices(id){const O=global.OperatorServices;const has=()=>O?.S?.services?.some(s=>String(s.service_id)===String(id));if(has())return true;await global.cargarServiciosOperador?.();for(let i=0;i<20&&!has();i++)await new Promise(r=>setTimeout(r,200));return has();}
function goServices(state){global.goTo?.('operaciones');const O=global.OperatorServices;if(!O)return;global.cambiarVistaServicios?.('active');O.S.query='';const q=document.getElementById('os-q');if(q)q.value='';O.S.company='all';O.S.driverFilter='';O.S.truckFilter='';global.filtrarEstadoServicios?.(state||'all');}
async function act(kind,key,btn){const t=findTask(key);if(!t)return;
  if(kind==='call'){if(t.driver_phone)global.location.href='tel:'+String(t.driver_phone).replace(/[^\d+]/g,'');return;}
  if(kind==='open'){if(t.service_id){global.verServicioOperador?.(t.service_id);refreshAfterModal();}return;}
  if(kind==='assign'){btn&&(btn.disabled=true);try{if(!await ensureServices(t.service_id)){notify('El servicio ya no está pendiente','warning');return cargar();}await global.asignarServicioRapido?.(t.service_id);refreshAfterModal();}finally{btn&&(btn.disabled=false);}return;}
  if(kind==='intakes'){goServices('all');const inbox=document.getElementById('os-driver-intakes');if(inbox){inbox.open=true;inbox.scrollIntoView({block:'start',behavior:reduced()?'instant':'smooth'});}return;}
  if(kind==='relay'){const ask=global.OperatorServiceLifecycleV2?.confirmAction;const from=t.driver||'El 1º chofer',to=t.extra||'el 2º chofer';
    const ok=typeof ask==='function'?await ask({title:'Registrar entrega del relevo',subtitle:'En nombre del chofer, si no pudo marcarla desde su app.',message:`${from} le entregó el vehículo a ${to}${t.origin?' en '+t.origin:''}.\nSe registra en nombre de ${from}, como si lo hubiera marcado desde su app. El servicio pasa a ${to} y a su móvil.\nQueda registrado con tu usuario en Cambios.`,confirmLabel:'Registrar entrega'}):null;
    if(ok===null){goServices('all');global.verServicioOperador?.(t.service_id);return;}if(!ok)return;
    btn&&(btn.disabled=true);try{await rpc('mark_operator_service_relay_handover_v1',{p_service_id:t.service_id});resolved(key,`Relevo entregado a ${to}`);}catch(e){notify(e?.message||'No se pudo registrar la entrega','error');btn&&(btn.disabled=false);}return;}}
/* La tarea resuelta se tilda y sale; las demás suben a ocupar su lugar. */
function resolved(key,msg){const q=S.root.querySelector('#oh-queue'),el=q.querySelector(`[data-key="${CSS.escape(key)}"]`);notify(msg,'success');if(!el||reduced())return cargar();
  el.insertAdjacentHTML('beforeend',`<div class="okmask"><svg class="check" viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7"/></svg>${esc(msg)}</div>`);
  setTimeout(()=>{const others=[...q.children].filter(x=>x!==el),first=new Map(others.map(x=>[x,x.getBoundingClientRect().top]));el.animate([{opacity:1},{opacity:0,transform:'translateX(40px) scale(.98)'}],{duration:260,easing:'cubic-bezier(.3,0,1,1)'}).onfinish=()=>{el.remove();others.forEach(x=>{const d=first.get(x)-x.getBoundingClientRect().top;if(d)x.animate([{transform:`translateY(${d}px)`},{transform:'none'}],{duration:420,easing:'cubic-bezier(.2,0,0,1)'});});setTimeout(cargar,450);};},650);}
function onClick(e){const b=e.target.closest('button');if(!b||!S.root.contains(b))return;
  if(b.dataset.ohAct)return act(b.dataset.ohAct,b.dataset.ohKey,b);
  if(b.dataset.ohF){S.filter=b.dataset.ohF;filters();queue();S.root.querySelector('#oh-queue').scrollTop=0;return;}
  if(b.dataset.ohT){S.dtab=b.dataset.ohT;drivers(true);requestAnimationFrame(()=>{sizeQueue();moreState();});return;}
  if(b.dataset.ohM){S.metric=b.dataset.ohM;mtabs();chart(true);return;}
  if(b.dataset.c){S.cmp=b.dataset.c;kpis();if(!reduced())S.root.querySelectorAll('.oh-kp .d').forEach(d=>d.animate([{transform:'scale(.9)',opacity:.4},{transform:'none',opacity:1}],{duration:380,easing:'cubic-bezier(.34,1.45,.64,1)'}));return;}
  if(b.dataset.d){S.days=Number(b.dataset.d);S.root.querySelectorAll('#oh-range button').forEach(x=>x.classList.toggle('on',x===b));S.first=false;cargar().then(()=>chart(true));return;}
  if(b.id==='oh-more'){const q=S.root.querySelector('#oh-queue');q.scrollBy({top:q.clientHeight*.8,behavior:reduced()?'auto':'smooth'});return;}
  if(b.dataset.ohGo==='create'){global.goTo?.('operaciones');global.abrirNuevoServicio?.();return;}
  if(b.dataset.ohGo==='map'){goServices('all');setTimeout(()=>global.OperatorServicesMap?.switchView?.('map'),60);return;}}

global.AuxOperatorHome={cargar,_test:{KIND,FILTERS,age,taskKey,seriesOf,mdelta,M}};
})(window);

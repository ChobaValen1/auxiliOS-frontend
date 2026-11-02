// AuxiliOS Solo · etapa 3 «Decidir mejor»: ganancia por servicio y por km, punto de equilibrio,
// comparación de los últimos meses y próximos vencimientos de los gastos fijos.
(function(){
'use strict';
const C=window.SoloCore;if(!C)return;
const {views,shell,go,esc,money,isoDate,monthName,errText,icon}=C;
const UI=()=>window.SoloUI||{SKELETON:'',countUp(el,v){el.textContent=money(v);}};
const $=x=>document.getElementById(x);
const addMonths=(d,n)=>new Date(d.getFullYear(),d.getMonth()+n,1);
const short=d=>d.toLocaleDateString('es-AR',{month:'short'}).replace('.','').replace(/^./,c=>c.toUpperCase());
const dmy=s=>String(s).split('-').reverse().join('/');

views.numeros=async function(tab){
  const t=tab==='vencimientos'?'vencimientos':'meses',m=C.month;
  shell(`<div class="top"><button class="btn ghost icon-btn" type="button" id="back" aria-label="Volver">${icon('arrow-left')}</button><h1 class="grow">Mis números</h1></div>
    <div class="month"><button class="btn ghost icon-btn" type="button" id="m-prev" aria-label="Mes anterior">${icon('chevron-left')}</button><h2>${esc(monthName(m))}</h2><button class="btn ghost icon-btn" type="button" id="m-next" aria-label="Mes siguiente">${icon('chevron-right')}</button></div>
    <div class="trio" id="nx-kpi">${['Por servicio','Por km','Servicios'].map(l=>`<div class="mini"><span>${l}</span><b class="num">…</b></div>`).join('')}</div>
    <section class="nx-be" id="nx-be" aria-label="Punto de equilibrio"><i class="sk"></i></section>
    <div class="seg" role="group" aria-label="Qué ver"><button type="button" data-t="meses" aria-pressed="${t==='meses'}">Últimos 6 meses</button><button type="button" data-t="vencimientos" aria-pressed="${t==='vencimientos'}">Vencimientos</button></div>
    <div id="nx" class="stack fill">${UI().SKELETON}</div>`,'inicio');
  $('back').onclick=()=>go('inicio');
  $('m-prev').onclick=()=>{C.month=addMonths(m,-1);views.numeros(t);};
  $('m-next').onclick=()=>{C.month=addMonths(m,1);views.numeros(t);};
  document.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>go(b.dataset.t==='meses'?'numeros':'numeros-vencimientos'));
  // Resumen de los últimos 6 meses (el elegido y los 5 anteriores) + km de los servicios.
  const months=[...Array(6)].map((_,i)=>addMonths(m,i-5));
  const from=months[0],to=addMonths(m,1);
  const [sums,{data:svc,error},{data:fixed}]=await Promise.all([
    Promise.all(months.map(d=>C.db.rpc('solo_month_summary_v1',{p_month:isoDate(d)}).then(r=>r.data||{}))),
    C.db.from('solo_services').select('service_date,km,total,status').neq('status','cancelled').gte('service_date',from.toISOString()).lt('service_date',to.toISOString()),
    C.db.from('solo_expenses').select('*').eq('kind','fixed')]);
  const box=$('nx');if(!box)return;
  if(error){box.innerHTML='<div class="empty">'+esc(errText(error))+'</div>';return;}
  const kmOf=d=>(svc||[]).filter(s=>{const x=new Date(s.service_date);return x.getFullYear()===d.getFullYear()&&x.getMonth()===d.getMonth();}).reduce((a,s)=>a+(Number(s.km)||0),0);
  const cur=sums[5],n=Number(cur.services)||0,left=Number(cur.left)||0,km=kmOf(m);
  // Ganancia por servicio y por km del mes elegido.
  const kpi=[[n?money(left/n):'—','Por servicio'],[km?money(left/km):'—','Por km'],[String(n),'Servicios']];
  $('nx-kpi').innerHTML=kpi.map(([v,l],i)=>`<div class="mini"><span>${l}</span><b class="num ${i<2&&left<0?'neg':''}">${esc(v)}</b></div>`).join('');
  // Punto de equilibrio: cuántos servicios hacen falta para cubrir los fijos con lo que deja cada uno.
  const billed=Number(cur.billed)||0,variable=Number(cur.variable_expenses)||0,fixedM=Number(cur.fixed_expenses)||0;
  const perSvc=n?(billed-variable)/n:0,need=perSvc>0?Math.ceil(fixedM/perSvc):null;
  const be=$('nx-be');
  if(!fixedM)be.innerHTML=`<div class="row"><b>Punto de equilibrio</b></div><p class="hint">Cargá tus gastos fijos (seguro, patente, monotributo) para saber cuántos servicios necesitás por mes.</p>`;
  else if(need===null)be.innerHTML=`<div class="row"><b>Punto de equilibrio</b><span class="num">${money(fixedM)} fijos</span></div><p class="hint">Todavía no hay servicios este mes para calcular cuánto deja cada uno.</p>`;
  else{const pct=Math.min(100,Math.round(n/need*100)),ok=n>=need;
    be.innerHTML=`<div class="row"><b>Punto de equilibrio</b><span class="pill ${ok?'ok':'wait'}">${ok?'Cubierto':'Faltan '+(need-n)}</span></div>
      <p class="nx-be-txt">Necesitás <b class="num">${need}</b> servicio${need===1?'':'s'} por mes para cubrir <span class="nowrap">${money(fixedM)}</span> de fijos. Llevás <b class="num">${n}</b>.</p>
      <div class="bar" role="img" aria-label="Llevás ${n} de ${need} servicios"><i style="--w:${pct}%"></i></div>
      <p class="hint">Cada servicio te deja en promedio ${money(perSvc)} después de los gastos del día.</p>`;}
  if(t==='meses'){
    // Comparación: «me queda» de cada mes, con facturé y gasté; el mes elegido resaltado.
    const max=Math.max(1,...sums.map(s=>Math.abs(Number(s.left)||0)));
    box.innerHTML=months.map((d,i)=>{const s=sums[i],l=Number(s.left)||0,w=Math.round(Math.abs(l)/max*100);
      return `<button class="nx-month ${i===5?'on':''}" type="button" data-m="${isoDate(d)}" aria-label="${esc(monthName(d))}: te quedó ${esc(money(l))}">
        <span class="nx-mname">${esc(short(d))}<small>${d.getFullYear()}</small></span>
        <span class="nx-mbar"><span class="nx-track"><i class="${l<0?'neg':''}" style="--w:${w}%"></i></span><small>Facturé ${money(s.billed)} · gasté ${money(s.spent)}${Number(s.services)?' · '+s.services+' serv.':''}</small></span>
        <b class="num ${l<0?'neg':''}">${money(l)}</b></button>`;}).reverse().join('');
    box.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{const [y,mo]=b.dataset.m.split('-').map(Number);C.month=new Date(y,mo-1,1);views.numeros('meses');});
  }else{
    // Vencimientos: el último pago de cada gasto fijo y cuándo hay que renovarlo.
    const last={};(fixed||[]).forEach(x=>{const d=new Date(x.spent_on+'T00:00:00');d.setMonth(d.getMonth()+Number(x.period_months||1));const end=isoDate(d);if(!last[x.category]||end>last[x.category].end)last[x.category]={x,end};});
    const today=isoDate(new Date()),days=e=>Math.round((new Date(e+'T00:00:00')-new Date(today+'T00:00:00'))/864e5);
    const rows=Object.values(last).sort((a,b)=>a.end<b.end?-1:1);
    box.innerHTML=rows.map(({x,end})=>{const d=days(end),k=d<0?'bad':d<=10?'wait':'ok';
      return `<div class="nx-due ${k}"><span class="ex-ico">${icon(d<0?'triangle-alert':'calendar-clock')}</span><span class="nx-due-t"><b>${esc(x.category)}${x.notes?' · '+esc(x.notes):''}</b><small>${money(x.amount)} cada ${x.period_months} ${x.period_months>1?'meses':'mes'}</small></span>
        <span class="nx-due-d"><b>${d<0?'Venció':d===0?'Hoy':'En '+d+' día'+(d===1?'':'s')}</b><small>${dmy(end)}</small></span></div>`;}).join('')
      ||`<div class="empty">${icon('calendar-clock','empty-ico')}<b>Sin vencimientos</b><span>Cuando cargues gastos fijos (seguro, patente, VTV) vas a ver acá cuándo vence cada uno.</span></div>`;
  }
};
})();

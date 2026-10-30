// AuxiliOS Solo · facturación agrupada por prestadora: cuánto le facturaste a cada una en el mes, qué remitos entran,
// cuándo vence y qué falta cobrar. Usa las columnas invoiced_at (facturado) y paid_at (cobrado) de cada servicio.
(function(){
'use strict';
const C=window.SoloCore;if(!C)return;
const {views,shell,go,toast,esc,money,isoDate,monthName,errText,icon}=C;
const UI=()=>window.SoloUI||{SKELETON:'',success(){},haptic(){}};
const $=x=>document.getElementById(x);
const range=()=>{const d=C.month;return [new Date(d.getFullYear(),d.getMonth(),1),new Date(d.getFullYear(),d.getMonth()+1,1)];};
const dmy=s=>s?String(s).slice(0,10).split('-').reverse().join('/'):'';
const shortDate=s=>new Date(s).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'});
const addDays=(iso,n)=>{const d=new Date(iso+'T00:00:00');d.setDate(d.getDate()+(Number(n)||0));return isoDate(d);};
const today=()=>isoDate(new Date());

// Lo que se le factura a la prestadora: el total menos los adicionales que el socio ya pagó en el lugar.
// Al particular se le cobra todo en el momento.
const paidHere=s=>(Number(s.payment_1_amount)||0)+(Number(s.payment_2_amount)||0);
const billOf=(client,s)=>client.kind==='particular'?Number(s.total||0):Math.max(0,Number(s.total||0)-paidHere(s));
// Agrupa los servicios del mes por cliente y calcula el estado de cada grupo.
function groupOf(client,rows){
  const bill=s=>billOf(client,s);
  const signed=rows.filter(s=>s.status==='signed');
  const total=rows.reduce((t,s)=>t+bill(s),0);
  const collected=rows.filter(s=>s.paid_at).reduce((t,s)=>t+bill(s),0);
  const toInvoice=signed.filter(s=>!s.invoiced_at&&!s.paid_at);
  const unpaid=signed.filter(s=>!s.paid_at);
  const invoicedOn=signed.map(s=>s.invoiced_at).filter(Boolean).sort()[0]||null;
  const due=invoicedOn?addDays(invoicedOn,client.payment_days):null;
  const particular=client.kind==='particular';
  let state;
  if(rows.length&&rows.every(s=>s.paid_at))state={k:'ok',t:'Cobrado'};
  else if(!particular&&toInvoice.length)state={k:'wait',t:'Por facturar'};
  else if(due&&due<today()&&unpaid.length)state={k:'bad',t:'Vencido'};
  else if(due&&unpaid.length)state={k:'wait',t:'Vence '+dmy(due).slice(0,5)};
  else state={k:'muted',t:unpaid.length?'Por cobrar':'Sin firmar'};
  return {client,rows,signed,bill,total,collected,pending:total-collected,toInvoice,unpaid,unsigned:rows.filter(s=>s.status==='open'),invoicedOn,due,particular,state};
}
async function load(clientId){
  const [a,z]=range();
  let q=C.db.from('solo_services').select('*').neq('status','cancelled').gte('service_date',a.toISOString()).lt('service_date',z.toISOString()).order('service_date');
  if(clientId)q=q.eq('client_id',clientId);
  const [{data:rows,error},{data:clients},{data:types}]=await Promise.all([q,C.db.from('solo_clients').select('*'),C.db.from('solo_service_types').select('id,name')]);
  return {rows:rows||[],clients:clients||[],types:types||[],error};
}
const monthNav=()=>`<div class="month"><button class="btn ghost icon-btn" type="button" id="m-prev" aria-label="Mes anterior">${icon('chevron-left')}</button><h2 id="m-name">${esc(monthName(C.month))}</h2><button class="btn ghost icon-btn" type="button" id="m-next" aria-label="Mes siguiente">${icon('chevron-right')}</button></div>`;
function bindMonth(again){
  $('m-prev').onclick=()=>{const m=C.month;C.month=new Date(m.getFullYear(),m.getMonth()-1,1);again();};
  $('m-next').onclick=()=>{const m=C.month;C.month=new Date(m.getFullYear(),m.getMonth()+1,1);again();};
}
const minis=(g,label='A facturar')=>`<div class="mini"><span>${label}</span><b class="num">${money(g.total)}</b></div><div class="mini"><span>Cobrado</span><b class="num" style="color:var(--ax-ok)">${money(g.collected)}</b></div><div class="mini"><span>Por cobrar</span><b class="num" style="color:var(--ax-warn)">${money(g.pending)}</b></div>`;

/* ── Lista del mes: una tarjeta por prestadora ─────────── */
views.facturacion=async function(clientId){
  if(clientId)return detail(clientId);
  shell(`<div class="top"><button class="btn ghost icon-btn" type="button" id="back" aria-label="Volver">${icon('arrow-left')}</button><h1 class="grow">Facturación</h1></div>
    ${monthNav()}
    <div class="trio" id="fx-sum">${minis({total:0,collected:0,pending:0},'Total')}</div>
    <div id="fx" class="stack fill">${UI().SKELETON}</div>`,'inicio');
  $('back').onclick=()=>go('inicio');bindMonth(()=>views.facturacion());
  const {rows,clients,error}=await load();const box=$('fx');if(!box)return;
  if(error){box.innerHTML='<div class="empty">'+esc(errText(error))+'</div>';return;}
  const groups=clients.map(c=>groupOf(c,rows.filter(s=>s.client_id===c.id))).filter(g=>g.rows.length)
    .sort((a,b)=>(a.particular-b.particular)||(b.total-a.total));
  const all={total:groups.reduce((t,g)=>t+g.total,0),collected:groups.reduce((t,g)=>t+g.collected,0)};all.pending=all.total-all.collected;
  $('fx-sum').innerHTML=minis(all,'Total');
  box.innerHTML=groups.map(g=>{const pct=g.total?Math.round(g.collected/g.total*100):0;
    return `<button class="item" type="button" data-id="${g.client.id}">
      <div class="row"><b class="ell">${esc(g.client.name)}</b><b class="num">${money(g.total)}</b></div>
      <div class="bar thin"><i style="--w:${pct}%"></i></div>
      <div class="row"><span class="hint ell">${g.rows.length} remito${g.rows.length>1?'s':''}${g.pending?' · falta '+money(g.pending):''}</span><span class="pill ${g.state.k==='bad'?'bad':g.state.k}">${esc(g.state.t)}</span></div></button>`;}).join('')
    ||`<div class="empty">No hay servicios en ${esc(monthName(C.month).toLowerCase())}.<button class="btn pri" type="button" id="fx-new">${icon('plus')} Servicio</button></div>`;
  box.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>go('facturacion-'+b.dataset.id));
  $('fx-new')?.addEventListener('click',()=>go('nuevo'));
};

/* ── Detalle: remitos de una prestadora en el mes y acciones ── */
async function detail(clientId){
  shell(`<div class="top"><button class="btn ghost icon-btn" type="button" id="back" aria-label="Facturación">${icon('arrow-left')}</button>
      <div class="grow"><h1 id="fd-name" class="ell">Prestadora</h1><p class="hint" id="fd-sub">${esc(monthName(C.month))}</p></div></div>
    <div class="trio" id="fd-sum">${minis({total:0,collected:0,pending:0})}</div>
    <div id="fd-state"></div>
    <div id="fd" class="stack fill">${UI().SKELETON}</div>
    <div class="rm-footer" id="fd-actions" hidden></div>`,'inicio',{bare:true});
  $('back').onclick=()=>go('facturacion');
  const {rows,clients,types,error}=await load(clientId);const box=$('fd');if(!box)return;
  const client=clients.find(c=>c.id===clientId);
  if(error||!client){box.innerHTML='<div class="empty">'+esc(error?errText(error):'No encontramos esa prestadora.')+'</div>';return;}
  const g=groupOf(client,rows),tname=id=>types.find(t=>t.id===id)?.name||'Servicio';
  $('fd-name').textContent=client.name;
  $('fd-sub').textContent=monthName(C.month)+(g.particular?' · cobro en el momento':' · paga a '+(Number(client.payment_days)||0)+' días');
  $('fd-sum').innerHTML=minis(g,g.particular?'Total':'A facturar');
  const notes=[];
  if(g.invoicedOn&&!g.particular)notes.push(`Facturado el ${dmy(g.invoicedOn)}${g.due?' · vence el '+dmy(g.due):''}`);
  if(g.unsigned.length)notes.push(`${g.unsigned.length} remito${g.unsigned.length>1?'s':''} sin firmar: no entra${g.unsigned.length>1?'n':''} en la facturación hasta que lo firmes.`);
  $('fd-state').innerHTML=notes.length?`<p class="notice ${g.state.k==='bad'?'bad':''}">${icon(g.state.k==='bad'?'triangle-alert':'info')}<span>${notes.map(esc).join('<br>')}</span></p>`:'';
  box.innerHTML=g.rows.map(s=>`<button class="item" type="button" data-s="${s.id}">
      <div class="row"><b class="ell">N.º ${s.remito_number} · ${esc(tname(s.service_type_id))}</b><b class="num">${money(g.bill(s))}</b></div>
      <div class="row"><span class="hint ell">${esc(shortDate(s.service_date))}${s.plate?' · '+esc(s.plate):''}${s.provider_order?' · serv. '+esc(s.provider_order):''}${s.km?' · '+esc(s.km)+' km':''}</span>${s.paid_at?'<span class="pill ok">Cobrado</span>':s.status==='open'?'<span class="pill muted">Sin firmar</span>':s.invoiced_at?'<span class="pill wait">Facturado</span>':'<span class="pill wait">Por facturar</span>'}</div></button>`).join('')
    ||'<div class="empty">No hay servicios de esta prestadora en el mes.</div>';
  box.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>go('servicio-'+b.dataset.s));
  // Acciones: enviar el resumen y avanzar el estado (facturado → cobrado). Las de varios remitos piden confirmar.
  const act=$('fd-actions');if(!g.signed.length)return;act.hidden=false;
  const next=!g.particular&&g.toInvoice.length?{id:'fd-inv',label:'Marcar facturado',ico:'file-check',rows:g.toInvoice,patch:()=>({invoiced_at:today()}),ok:'Marcado como facturado'}
    :g.unpaid.length?{id:'fd-paid',label:'Marcar cobrado',ico:'banknote',rows:g.unpaid,patch:()=>({paid_at:new Date().toISOString()}),ok:'Marcado como cobrado'}:null;
  act.innerHTML=`<button class="btn" type="button" id="fd-pdf">${icon('share-2')} Resumen PDF</button>`+(next?`<button class="btn pri" type="button" id="${next.id}">${icon(next.ico)} ${next.label}</button>`:'<span class="pill ok fd-done">Todo cobrado</span>');
  $('fd-pdf').onclick=()=>sharePdf(g,tname);
  if(next)$(next.id).onclick=async()=>{const b=$(next.id);
    if(b.dataset.sure!=='1'){b.dataset.sure='1';b.innerHTML=`Confirmar ${next.rows.length} remito${next.rows.length>1?'s':''} · ${money(next.rows.reduce((t,s)=>t+g.bill(s),0))}`;UI().haptic(10);return;}
    b.disabled=true;b.innerHTML='<span class="spin" aria-hidden="true"></span>Guardando…';
    const {error}=await C.db.from('solo_services').update(next.patch()).in('id',next.rows.map(s=>s.id));
    if(error){b.disabled=false;b.textContent=next.label;return toast(errText(error));}
    UI().success();toast(next.ok);detail(clientId);};
}

/* ── Resumen para mandarle a la prestadora (PDF) ───────── */
async function sharePdf(g,tname){
  if(!window.jspdf){toast('No se pudo armar el PDF. Revisá la conexión.');return;}
  const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'}),P=C.profile,rows=g.signed;let y=18;
  const t=(txt,x,size=10,bold=false,align)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.text(String(txt??''),x,y,align?{align}:undefined);};
  t(P.business_name||P.full_name,15,16,true);y+=7;t('Resumen de servicios · '+monthName(C.month),15,11);y+=6;
  t('Para: '+g.client.name,15,11,true);t('Emitido el '+dmy(today()),195,10,false,'right');y+=10;
  const cols=[[15,'N.º'],[30,'Fecha'],[50,'Servicio'],[95,'N.º prest.'],[125,'Patente'],[152,'Km'],[195,'Total']];
  const head=()=>{doc.setFillColor(240,240,240);doc.rect(13,y-5,184,7,'F');cols.forEach(([x,l],i)=>t(l,x,9,true,i===cols.length-1?'right':undefined));y+=7;};
  head();
  rows.forEach(s=>{if(y>275){doc.addPage();y=18;head();}
    const cells=[s.remito_number,shortDate(s.service_date),tname(s.service_type_id).slice(0,24),String(s.provider_order||'').slice(0,14),s.plate||'',s.km??'',money(g.bill(s))];
    cells.forEach((v,i)=>t(v,cols[i][0],9,false,i===cells.length-1?'right':undefined));y+=6;});
  y+=4;doc.line(13,y-4,197,y-4);
  // El resumen lista lo que paga la prestadora; los adicionales que pagó el socio en el lugar no entran.
  const tot=rows.reduce((a,s)=>a+g.bill(s),0);
  t(rows.length+' remito'+(rows.length>1?'s':''),15,10);t(g.particular?'Total':'Total a pagar',165,11,true,'right');t(money(tot),195,11,true,'right');y+=6;
  if(!g.particular&&g.client.payment_days){y+=4;t('Condición de pago: a '+g.client.payment_days+' días'+(g.due?' · vence el '+dmy(g.due):''),15,10);}
  const name='resumen-'+g.client.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+isoDate(C.month).slice(0,7)+'.pdf';
  const blob=doc.output('blob'),file=new File([blob],name,{type:'application/pdf'});
  if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:'Resumen '+g.client.name});return;}catch(e){if(e.name==='AbortError')return;}}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();toast('PDF descargado');
}
})();

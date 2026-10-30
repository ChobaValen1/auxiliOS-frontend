// AuxiliOS Solo · etapa 1c: servicios (con precio por tarifa), remito digital con firma y gastos fijos/variables.
(function(){
'use strict';
const C=window.SoloCore;if(!C)return;
const {views,shell,go,toast,esc,money,num,isoDate,monthName,errText}=C;
const PAY={cash:'Efectivo',transfer:'Transferencia',card:'Tarjeta',mercado_pago:'Mercado Pago',other:'Otro'};
const CATS={variable:['Combustible','Taller','Repuestos','Cubiertas','Peajes','Comida','Lavado','Otro'],fixed:['Seguro','Patente','Monotributo','VTV','GPS / celular','Cuota de la grúa','Otro']};
const range=()=>{const d=C.month;return [new Date(d.getFullYear(),d.getMonth(),1),new Date(d.getFullYear(),d.getMonth()+1,1)];};
const fmtDate=s=>{if(!s)return '';const d=new Date(s);return d.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'})+' '+d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});};
const localDT=d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());};
function rateFor(rates,clientId,typeId,when){const day=isoDate(when||new Date());return (rates||[]).filter(r=>r.client_id===clientId&&r.service_type_id===typeId&&r.valid_from<=day).sort((a,b)=>a.valid_from<b.valid_from?1:-1)[0]||null;}
function priceOf(rate,km){if(!rate)return {base:0,kmAmount:0};const extra=Math.max(0,(Number(km)||0)-Number(rate.included_km||0));return {base:Number(rate.base_amount)||0,kmAmount:Math.round(extra*Number(rate.per_km||0))};}

/* ── Servicios del mes ───────────────────────────────── */
views.servicios=async function(filter){
  const f=['pendientes','cobrados'].includes(filter)?filter:'todos';
  shell(`<div class="top"><h1>${esc(monthName(C.month))}</h1><button class="btn pri" type="button" id="add">+ Servicio</button></div>
    <div class="split" role="group" aria-label="Filtro">${[['todos','Todos'],['pendientes','Por cobrar'],['cobrados','Cobrados']].map(([k,l])=>`<button class="btn ${f===k?'pri':''}" type="button" data-f="${k}" aria-pressed="${f===k}">${l}</button>`).join('')}</div>
    <div id="list" class="stack"><p class="hint">Cargando…</p></div>`,'servicios');
  app().querySelector('.split').style.gridTemplateColumns='repeat(3,1fr)';
  document.getElementById('add').onclick=()=>go('nuevo');
  app().querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>go('servicios-'+b.dataset.f));
  const [a,z]=range();
  const [{data:rows,error},{data:clients},{data:types}]=await Promise.all([
    C.db.from('solo_services').select('*').neq('status','cancelled').gte('service_date',a.toISOString()).lt('service_date',z.toISOString()).order('service_date',{ascending:false}),
    C.db.from('solo_clients').select('id,name'),C.db.from('solo_service_types').select('id,name')]);
  const list=document.getElementById('list');if(!list)return;
  if(error){list.innerHTML='<div class="empty">'+esc(errText(error))+'</div>';return;}
  const name=(arr,id)=>(arr||[]).find(x=>x.id===id)?.name||'';
  const shown=(rows||[]).filter(s=>f==='todos'||(f==='cobrados'?!!s.paid_at:!s.paid_at));
  const total=shown.reduce((t,s)=>t+Number(s.total||0),0);
  list.innerHTML=(shown.length?`<p class="hint">${shown.length} servicios · ${money(total)}</p>`:'')+(shown.map(s=>`<button class="item" type="button" data-id="${s.id}">
    <div class="row"><b>${esc(name(types,s.service_type_id)||'Servicio')}${s.km?' · '+esc(s.km)+' km':''}</b><b class="num">${money(s.total)}</b></div>
    <div class="row"><span class="hint">N.º ${s.remito_number} · ${esc(name(clients,s.client_id))} · ${esc(fmtDate(s.service_date))}</span>${s.paid_at?'<span class="pill ok">Cobrado</span>':s.status==='signed'?'<span class="pill wait">Por cobrar</span>':'<span class="pill muted">Sin firmar</span>'}</div></button>`).join('')||'<div class="empty">No hay servicios para mostrar en este mes.</div>');
  list.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>go('servicio-'+b.dataset.id));
};
const app=()=>document.getElementById('app');

/* ── Nuevo servicio ──────────────────────────────────── */
views.nuevo=async function(){
  shell(`<div class="top"><button class="btn ghost" type="button" id="back">‹ Volver</button></div><h1>Nuevo servicio</h1><div id="nf" class="stack"><p class="hint">Cargando…</p></div>`,'servicios');
  document.getElementById('back').onclick=()=>go('servicios');
  const [{data:clients},{data:types},{data:rates},{data:trucks}]=await Promise.all([
    C.db.from('solo_clients').select('*').eq('active',true).order('kind',{ascending:false}).order('name'),
    C.db.from('solo_service_types').select('*').eq('active',true).order('name'),
    C.db.from('solo_rates').select('*'),C.db.from('solo_trucks').select('id').order('created_at').limit(1)]);
  const box=document.getElementById('nf');if(!box)return;
  if(!(clients||[]).length){box.innerHTML='<div class="empty">Primero cargá una prestadora.<button class="btn pri" type="button" id="toc">Ir a Prestadoras</button></div>';document.getElementById('toc').onclick=()=>go('clientes');return;}
  box.innerHTML=`<form id="svc" class="stack" novalidate>
    <div class="card">
      <div class="field"><label for="s-client">Cliente</label><select id="s-client">${clients.map(c=>`<option value="${c.id}" data-kind="${c.kind}">${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="s-type">Servicio</label><select id="s-type">${(types||[]).map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div>
      <div class="grid2"><div class="field"><label for="s-km">Km</label><input id="s-km" inputmode="decimal" placeholder="0"></div>
      <div class="field"><label for="s-date">Fecha y hora</label><input id="s-date" type="datetime-local" value="${localDT(new Date())}"></div></div>
      <div class="grid2"><div class="field"><label for="s-tolls">Peajes $</label><input id="s-tolls" inputmode="decimal" placeholder="0"></div>
      <div class="field"><label for="s-other">Otros $</label><input id="s-other" inputmode="decimal" placeholder="Espera, maniobra…"></div></div>
      <div class="field" id="s-manual-box" hidden><label for="s-manual">Precio del servicio $</label><input id="s-manual" inputmode="decimal"><span class="help">Particular: el precio lo ponés vos.</span></div>
      <div id="s-price" class="card" style="background:var(--ax-surface)"></div>
    </div>
    <details class="card"><summary><b>Vehículo y recorrido</b> <span class="hint">(para el remito)</span></summary>
      <div class="grid2"><div class="field"><label for="s-plate">Patente</label><input id="s-plate" autocapitalize="characters"></div><div class="field"><label for="s-mm">Marca y modelo</label><input id="s-mm"></div></div>
      <div class="field"><label for="s-orig">Origen</label><input id="s-orig"></div>
      <div class="field"><label for="s-dest">Destino</label><input id="s-dest"></div>
      <div class="field"><label for="s-order">N.º de servicio de la prestadora</label><input id="s-order"></div>
    </details>
    <details class="card"><summary><b>Cliente del vehículo</b> <span class="hint">(opcional)</span></summary>
      <div class="field"><label for="s-cname">Nombre o razón social</label><input id="s-cname" autocomplete="off"></div>
      <div class="grid2"><div class="field"><label for="s-cdoc">DNI / CUIT</label><input id="s-cdoc" inputmode="numeric"></div><div class="field"><label for="s-cphone">Teléfono</label><input id="s-cphone" type="tel" inputmode="tel"></div></div>
    </details>
    <p id="s-err" class="err" hidden></p>
    <button class="btn pri block" type="submit">Guardar y hacer el remito</button></form>`;
  const $=id=>document.getElementById(id);
  const calc=()=>{
    const part=$('s-client').selectedOptions[0]?.dataset.kind==='particular';$('s-manual-box').hidden=!part;
    const when=new Date($('s-date').value||Date.now()),km=num($('s-km').value),tolls=num($('s-tolls').value),other=num($('s-other').value);
    const rate=part?null:rateFor(rates,$('s-client').value,$('s-type').value,when),p=priceOf(rate,km);
    if(part)p.base=num($('s-manual').value);
    const total=p.base+p.kmAmount+tolls+other;
    $('s-price').innerHTML=(!part&&!rate?'<p class="err">Esta prestadora no tiene tarifa para este servicio. <button class="link" type="button" id="s-rate">Cargarla</button></p>':'')+
      `<div class="row"><span class="hint">${part?'Precio':'Base'}</span><span class="num">${money(p.base)}</span></div>`+
      (p.kmAmount?`<div class="row"><span class="hint">${Math.max(0,km-Number(rate.included_km))} km × ${money(rate.per_km)}</span><span class="num">${money(p.kmAmount)}</span></div>`:'')+
      (tolls?`<div class="row"><span class="hint">Peajes</span><span class="num">${money(tolls)}</span></div>`:'')+(other?`<div class="row"><span class="hint">Otros</span><span class="num">${money(other)}</span></div>`:'')+
      `<div class="row"><b>Total</b><b class="num" style="color:var(--ax-accent);font-size:20px">${money(total)}</b></div>`;
    $('s-rate')?.addEventListener('click',()=>go('cliente-'+$('s-client').value));
    return {p,total,tolls,other,km,when,part,rate};
  };
  ['s-client','s-type','s-km','s-date','s-tolls','s-other','s-manual'].forEach(id=>$(id).addEventListener('input',calc));calc();
  $('svc').onsubmit=async e=>{e.preventDefault();const er=$('s-err');er.hidden=true;const c=calc();
    if(!c.part&&!c.rate){er.textContent='Cargá la tarifa de este servicio o elegí «Particular».';er.hidden=false;return;}
    if(c.total<=0){er.textContent='El total no puede ser cero.';er.hidden=false;return;}
    const b=e.target.querySelector('button[type=submit]');b.disabled=true;
    const row={client_id:$('s-client').value,service_type_id:$('s-type').value||null,truck_id:trucks?.[0]?.id||null,service_date:c.when.toISOString(),
      km:c.km||null,base_amount:c.p.base,km_amount:c.p.kmAmount,tolls:c.tolls?[{name:'Peajes',amount:c.tolls}]:[],other_amount:c.other,extras_amount:c.tolls+c.other,total:c.total,
      plate:$('s-plate').value.trim().toUpperCase()||null,make_model:$('s-mm').value.trim()||null,origin:$('s-orig').value.trim()||null,destination:$('s-dest').value.trim()||null,
      provider_order:$('s-order').value.trim()||null,customer_name:$('s-cname').value.trim()||null,customer_doc:$('s-cdoc').value.trim()||null,customer_phone:$('s-cphone').value.trim()||null};
    const {data,error}=await C.db.from('solo_services').insert(row).select('id').single();
    if(error){er.textContent=errText(error);er.hidden=false;b.disabled=false;return;}
    toast('Servicio guardado');go('servicio-'+data.id);};
};

/* ── Remito digital del servicio ─────────────────────── */
views.servicio=async function(id){
  shell(`<div class="top"><button class="btn ghost" type="button" id="back">‹ Servicios</button></div><div id="rm" class="stack"><p class="hint">Cargando…</p></div>`,'servicios');
  document.getElementById('back').onclick=()=>go('servicios');
  const {data:s,error}=await C.db.from('solo_services').select('*').eq('id',id).maybeSingle();
  const box=document.getElementById('rm');if(!box)return;
  if(error||!s){box.innerHTML='<div class="empty">No encontramos ese servicio.</div>';return;}
  const [{data:cl},{data:tp},{data:tk}]=await Promise.all([C.db.from('solo_clients').select('*').eq('id',s.client_id).maybeSingle(),
    s.service_type_id?C.db.from('solo_service_types').select('name').eq('id',s.service_type_id).maybeSingle():Promise.resolve({data:null}),
    s.truck_id?C.db.from('solo_trucks').select('*').eq('id',s.truck_id).maybeSingle():Promise.resolve({data:null})]);
  const signed=s.status==='signed';
  const line=(l,v)=>v?`<div class="row"><span class="hint">${l}</span><span>${esc(v)}</span></div>`:'';
  box.innerHTML=`<div class="row"><h1>Remito N.º ${s.remito_number}</h1>${signed?'<span class="pill ok">Firmado</span>':'<span class="pill wait">Sin firmar</span>'}</div>
    <p class="sub">${esc(cl?.name||'')} · ${esc(tp?.name||'Servicio')} · ${esc(fmtDate(s.service_date))}</p>
    <div class="card">${line('Patente',s.plate)}${line('Vehículo',s.make_model)}${line('Origen',s.origin)}${line('Destino',s.destination)}${line('N.º prestadora',s.provider_order)}${line('Cliente',s.customer_name)}${line('Km',s.km)}
      <div class="row"><span class="hint">Llegada</span>${s.arrived_at?`<span>${esc(fmtDate(s.arrived_at))}</span>`:signed?'<span>—</span>':'<button class="btn" type="button" id="arr">Llegué</button>'}</div>
      <div class="row"><b>Total</b><b class="num" style="color:var(--ax-accent)">${money(s.total)}</b></div></div>
    <div class="card"><h2>Fotos</h2><div id="ph" class="grid2"></div>${signed?'':'<label class="btn block" for="f-in">📷 Agregar foto</label><input id="f-in" type="file" accept="image/*" capture="environment" multiple hidden>'}</div>
    ${signed?`<div class="card"><h2>Firma</h2><img id="sig-img" alt="Firma del cliente" style="width:100%;background:#fff;border-radius:10px">
      <p class="hint">${esc(s.signer_name||'')}${s.signer_doc?' · '+esc(s.signer_doc):''} · ${esc(fmtDate(s.signed_at))}</p></div>`:
    `<form id="sign" class="card" novalidate><h2>Cobro</h2>
      <div class="grid2"><div class="field"><label for="p1m">Pagó con</label><select id="p1m"><option value="">No pagó en el momento</option>${Object.entries(PAY).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></div>
      <div class="field"><label for="p1a">Monto $</label><input id="p1a" inputmode="decimal" value="${cl?.kind==='particular'?s.total:''}"></div></div>
      <h2>Conformidad del cliente</h2>
      ${[['conf_service','Conforme con el servicio'],['conf_charges','Conforme con los cargos'],['conf_tow','Conforme con el arrastre'],['no_damage','El vehículo no tiene daños nuevos'],['customer_present','El cliente estuvo presente']].map(([k,l])=>`<label class="row" style="justify-content:flex-start;gap:10px"><input type="checkbox" id="${k}" checked style="width:22px;height:22px"> ${l}</label>`).join('')}
      <h2>Firma del cliente</h2>
      <canvas id="pad" tabindex="0" width="600" height="220" style="width:100%;height:160px;background:#fff;border-radius:10px;touch-action:none" aria-label="Espacio para firmar"></canvas>
      <button class="link" type="button" id="clr">Borrar firma</button>
      <div class="grid2"><div class="field"><label for="sn">Aclaración</label><input id="sn" value="${esc(s.customer_name||'')}"></div><div class="field"><label for="sd">DNI</label><input id="sd" inputmode="numeric" value="${esc(s.customer_doc||'')}"></div></div>
      <div class="field"><label for="obs">Observaciones</label><input id="obs" value="${esc(s.notes||'')}"></div>
      <p id="sg-err" class="err" hidden></p><button class="btn pri block" type="submit">Firmar remito</button></form>`}
    <div class="card"><h2>Cobro</h2><div class="row"><span>${s.paid_at?'Cobrado el '+esc(fmtDate(s.paid_at)):'Todavía no cobrado'}</span><button class="btn" type="button" id="paid">${s.paid_at?'Marcar no cobrado':'Marcar cobrado'}</button></div>${s.payment_1_method?`<p class="hint">${PAY[s.payment_1_method]} · ${money(s.payment_1_amount)}</p>`:''}</div>
    ${signed?'<button class="btn pri block" type="button" id="share">Enviar remito (PDF)</button>':''}
    <button class="btn ghost block" type="button" id="cancel">Anular servicio</button>`;
  const $=x=>document.getElementById(x),uid=C.user.id;
  // Fotos
  async function showPhotos(paths){const ph=$('ph');if(!ph)return;if(!paths.length){ph.innerHTML='<p class="hint">Sin fotos.</p>';return;}
    const {data}=await C.db.storage.from('solo_files').createSignedUrls(paths,3600);ph.innerHTML=(data||[]).map(u=>`<img src="${esc(u.signedUrl)}" alt="Foto del vehículo" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px">`).join('');}
  showPhotos(s.photos||[]);
  $('f-in')?.addEventListener('change',async e=>{const files=[...e.target.files];if(!files.length)return;toast('Subiendo fotos…');const paths=[...(s.photos||[])];
    for(const f of files){const path=uid+'/services/'+s.id+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,7)+'.jpg';const {error}=await C.db.storage.from('solo_files').upload(path,await shrink(f),{contentType:'image/jpeg'});if(error){toast(errText(error));return;}paths.push(path);}
    const {error}=await C.db.from('solo_services').update({photos:paths}).eq('id',s.id);if(error)return toast(errText(error));s.photos=paths;showPhotos(paths);toast('Fotos guardadas');});
  $('arr')?.addEventListener('click',async()=>{const {error}=await C.db.from('solo_services').update({arrived_at:new Date().toISOString()}).eq('id',s.id);toast(error?errText(error):'Llegada marcada');if(!error)views.servicio(id);});
  $('paid').onclick=async()=>{const {error}=await C.db.from('solo_services').update({paid_at:s.paid_at?null:new Date().toISOString()}).eq('id',s.id);toast(error?errText(error):s.paid_at?'Marcado como no cobrado':'Marcado como cobrado');if(!error)views.servicio(id);};
  $('cancel').onclick=async()=>{const b=$('cancel');if(b.dataset.sure!=='1'){b.dataset.sure='1';b.textContent='Tocá de nuevo para anular';b.style.color='var(--ax-danger)';return;}
    const {error}=await C.db.from('solo_services').update({status:'cancelled'}).eq('id',s.id);toast(error?errText(error):'Servicio anulado');if(!error)go('servicios');};
  if(signed){
    if(s.signature_path){C.db.storage.from('solo_files').createSignedUrl(s.signature_path,3600).then(({data})=>{if(data&&$('sig-img'))$('sig-img').src=data.signedUrl;});}
    $('share').onclick=()=>sharePdf(s,cl,tp,tk);return;
  }
  // Firma con el dedo
  const pad=$('pad'),ctx=pad.getContext('2d');let drawing=false,dirty=false;ctx.lineWidth=3.2;ctx.lineCap='round';ctx.strokeStyle='#111';
  const pos=e=>{const r=pad.getBoundingClientRect();return [(e.clientX-r.left)*pad.width/r.width,(e.clientY-r.top)*pad.height/r.height];};
  pad.addEventListener('focus',()=>pad.scrollIntoView({block:'center'}));
  pad.addEventListener('pointerdown',e=>{drawing=true;dirty=true;pad.setPointerCapture(e.pointerId);const [x,y]=pos(e);ctx.beginPath();ctx.moveTo(x,y);});
  pad.addEventListener('pointermove',e=>{if(!drawing)return;const [x,y]=pos(e);ctx.lineTo(x,y);ctx.stroke();});
  ['pointerup','pointercancel'].forEach(t=>pad.addEventListener(t,()=>{drawing=false;}));
  $('clr').onclick=()=>{ctx.clearRect(0,0,pad.width,pad.height);dirty=false;};
  $('sign').onsubmit=async e=>{e.preventDefault();const er=$('sg-err');er.hidden=true;
    if(!dirty){er.textContent='Falta la firma del cliente.';er.hidden=false;return;}
    const name=$('sn').value.trim();if(name.length<2){er.textContent='Falta la aclaración de la firma.';er.hidden=false;return;}
    const b=e.target.querySelector('button[type=submit]');b.disabled=true;b.textContent='Guardando…';
    const blob=await new Promise(r=>pad.toBlob(r,'image/png'));const path=uid+'/signatures/'+s.id+'.png';
    const up=await C.db.storage.from('solo_files').upload(path,blob,{contentType:'image/png',upsert:true});
    if(up.error){er.textContent=errText(up.error);er.hidden=false;b.disabled=false;b.textContent='Firmar remito';return;}
    const m=$('p1m').value||null,patch={status:'signed',signed_at:new Date().toISOString(),signature_path:path,signer_name:name,signer_doc:$('sd').value.trim()||null,notes:$('obs').value.trim()||null,
      payment_1_method:m,payment_1_amount:m?num($('p1a').value):null};
    ['conf_service','conf_charges','conf_tow','no_damage','customer_present'].forEach(k=>{patch[k]=$(k).checked;});
    if(m&&patch.payment_1_amount>=Number(s.total))patch.paid_at=patch.signed_at;
    const {error}=await C.db.from('solo_services').update(patch).eq('id',s.id);
    if(error){er.textContent=errText(error);er.hidden=false;b.disabled=false;b.textContent='Firmar remito';return;}
    toast('Remito firmado');views.servicio(id);};
};

// Achica las fotos antes de subirlas (más rápido con poca señal).
function shrink(file){return new Promise(res=>{const img=new Image();img.onload=()=>{const k=Math.min(1,1600/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);c.toBlob(b=>res(b||file),'image/jpeg',.8);URL.revokeObjectURL(img.src);};img.onerror=()=>res(file);img.src=URL.createObjectURL(file);});}

async function sharePdf(s,cl,tp,tk){
  if(!window.jspdf){toast('No se pudo armar el PDF. Revisá la conexión.');return;}
  const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'}),P=C.profile;let y=18;
  const t=(txt,x,size=11,bold=false)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.text(String(txt??''),x,y);};
  t(P.business_name||P.full_name,15,16,true);t('Remito N.º '+s.remito_number,140,14,true);y+=7;t(fmtDate(s.service_date),140,10);t(tk?('Grúa '+tk.plate):'',15,10);y+=10;
  const rows=[['Prestadora',cl?.name],['Servicio',tp?.name],['N.º de servicio',s.provider_order],['Cliente',s.customer_name],['DNI / CUIT',s.customer_doc],['Patente',s.plate],['Vehículo',s.make_model],['Origen',s.origin],['Destino',s.destination],['Km',s.km],['Llegada',fmtDate(s.arrived_at)]].filter(r=>r[1]);
  rows.forEach(([k,v])=>{t(k,15,10,true);t(v,60,10);y+=6.5;});y+=3;
  [['Base',s.base_amount],['Km',s.km_amount],['Adicionales',s.extras_amount]].filter(r=>Number(r[1])).forEach(([k,v])=>{t(k,15,10);t(money(v),160,10);y+=6;});
  t('Total',15,12,true);t(money(s.total),160,12,true);y+=9;
  if(s.payment_1_method){t('Pagó: '+PAY[s.payment_1_method]+' '+money(s.payment_1_amount),15,10);y+=7;}
  const conf=[['conf_service','servicio'],['conf_charges','cargos'],['conf_tow','arrastre']].filter(([k])=>s[k]).map(([,l])=>l);
  if(conf.length){t('Conforme con: '+conf.join(', ')+(s.no_damage?' · sin daños nuevos':''),15,10);y+=7;}
  if(s.notes){t('Observaciones: '+s.notes,15,10);y+=7;}
  if(s.signature_path){const {data}=await C.db.storage.from('solo_files').download(s.signature_path);if(data){const url=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(data);});doc.addImage(url,'PNG',15,y,80,30);y+=33;}}
  t('Firma: '+(s.signer_name||'')+(s.signer_doc?' · DNI '+s.signer_doc:''),15,10);
  const blob=doc.output('blob'),file=new File([blob],'remito-'+s.remito_number+'.pdf',{type:'application/pdf'});
  if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:'Remito N.º '+s.remito_number});return;}catch(e){if(e.name==='AbortError')return;}}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file.name;document.body.appendChild(a);a.click();a.remove();toast('PDF descargado');
}

/* ── Gastos ──────────────────────────────────────────── */
views.gastos=async function(mode){
  const kind=mode==='fijo'?'fixed':'variable';
  shell(`<h1>Gastos · ${esc(monthName(C.month))}</h1>
    <form id="ex" class="card" novalidate><h2>Nuevo gasto</h2>
      <div class="split" role="group" aria-label="Tipo de gasto"><button class="btn ${kind==='variable'?'pri':''}" type="button" data-k="variable" aria-pressed="${kind==='variable'}">Del día</button><button class="btn ${kind==='fixed'?'pri':''}" type="button" data-k="fixed" aria-pressed="${kind==='fixed'}">Fijo</button></div>
      <div class="field"><label for="e-amount">Monto $</label><input id="e-amount" inputmode="decimal" style="font-size:22px"></div>
      <div class="field"><label>Categoría</label><div class="grid2" id="e-cats">${CATS[kind].map((c,i)=>`<button class="btn ${i===0?'pri':''}" type="button" data-c="${esc(c)}" aria-pressed="${i===0}">${esc(c)}</button>`).join('')}</div></div>
      <div class="grid2"><div class="field"><label for="e-date">${kind==='fixed'?'Pagado el':'Fecha'}</label><input id="e-date" type="date" value="${isoDate(new Date())}"></div>
      ${kind==='fixed'?'<div class="field"><label for="e-period">Cubre</label><select id="e-period"><option value="1">1 mes</option><option value="2">2 meses</option><option value="3">3 meses</option><option value="6">6 meses</option><option value="12" selected>12 meses</option></select></div>':''}</div>
      ${kind==='fixed'?'<p class="hint">Se reparte por mes: un seguro anual de $ 1.200.000 suma $ 100.000 en cada mes.</p>':''}
      <p id="e-err" class="err" hidden></p><button class="btn pri block" type="submit">Guardar gasto</button></form>
    <div id="el" class="stack"><p class="hint">Cargando…</p></div>`,'gastos');
  const $=x=>document.getElementById(x);let cat=CATS[kind][0];
  app().querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>go('gastos-'+(b.dataset.k==='fixed'?'fijo':'dia')));
  $('e-cats').querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{cat=b.dataset.c;$('e-cats').querySelectorAll('[data-c]').forEach(x=>{x.classList.toggle('pri',x===b);x.setAttribute('aria-pressed',x===b);});});
  if(mode==='nuevo')setTimeout(()=>$('e-amount')?.focus(),50);
  $('ex').onsubmit=async e=>{e.preventDefault();const er=$('e-err');er.hidden=true;const amount=num($('e-amount').value);
    if(amount<=0){er.textContent='Poné el monto del gasto.';er.hidden=false;return;}
    const row={kind,category:cat,amount,spent_on:$('e-date').value||isoDate(new Date()),period_months:kind==='fixed'?Number($('e-period').value):null};
    const {error}=await C.db.from('solo_expenses').insert(row);if(error){er.textContent=errText(error);er.hidden=false;return;}
    toast('Gasto guardado');views.gastos(mode==='fijo'?'fijo':'dia');};
  const [a,z]=range();
  const [{data:vars},{data:fixed}]=await Promise.all([
    C.db.from('solo_expenses').select('*').eq('kind','variable').gte('spent_on',isoDate(a)).lt('spent_on',isoDate(z)).order('spent_on',{ascending:false}),
    C.db.from('solo_expenses').select('*').eq('kind','fixed').lt('spent_on',isoDate(z)).order('spent_on',{ascending:false})]);
  const active=(fixed||[]).filter(x=>{const end=new Date(x.spent_on+'T00:00:00');end.setMonth(end.getMonth()+x.period_months);return end>a&&(!x.ends_on||x.ends_on>=isoDate(a));});
  const tv=(vars||[]).reduce((t,x)=>t+Number(x.amount),0),tf=active.reduce((t,x)=>t+Number(x.amount)/x.period_months,0);
  const el=$('el');if(!el)return;
  el.innerHTML=`<div class="split"><div class="mini"><span>Del día</span><b class="num">${money(tv)}</b></div><div class="mini"><span>Fijos del mes</span><b class="num">${money(tf)}</b></div></div>
    <h2>Fijos que cuentan este mes</h2>${active.map(x=>`<div class="item" style="cursor:default"><div class="row"><b>${esc(x.category)}</b><b class="num">${money(Number(x.amount)/x.period_months)}</b></div><span class="hint">${money(x.amount)} cada ${x.period_months} ${x.period_months>1?'meses':'mes'} · pagado ${esc(x.spent_on.split('-').reverse().join('/'))}</span></div>`).join('')||'<p class="hint">Todavía no cargaste gastos fijos (seguro, patente, monotributo…).</p>'}
    <h2>Del día</h2>${(vars||[]).map(x=>`<div class="item" style="cursor:default"><div class="row"><b>${esc(x.category)}</b><b class="num">${money(x.amount)}</b></div><span class="hint">${esc(x.spent_on.split('-').reverse().join('/'))}</span></div>`).join('')||'<p class="hint">Sin gastos del día en este mes.</p>'}`;
};
})();

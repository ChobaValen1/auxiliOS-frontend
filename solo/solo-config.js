// AuxiliOS Solo · configuración: prestadoras (con sus tarifas por tipo de servicio) y tipos de servicio.
// Reglas: todo cambio y todo borrado se confirma; una prestadora con servicios no se borra, se desactiva;
// un tipo de servicio se desactiva (borrarlo borraría sus tarifas). Una tarifa nueva no cambia servicios viejos.
(function(){
'use strict';
const C=window.SoloCore;if(!C)return;
const {views,shell,go,toast,esc,money,num,isoDate,errText,icon}=C;
const UI=()=>window.SoloUI||{SKELETON:'',validateForm:()=>true,success(){},haptic(){}};
const S=()=>window.SoloSheets;
const $=x=>document.getElementById(x);
const dmy=s=>String(s||'').split('-').reverse().join('/');
const DAYS=[0,15,30,45,60,90];
const rateTxt=r=>`Base ${money(r.base_amount)}${Number(r.included_km)?' · '+Number(r.included_km)+' km incluidos':''}${Number(r.per_km)?' · '+money(r.per_km)+' por km extra':''}`;
const currentRate=(rates,typeId)=>{const day=isoDate(new Date());return rates.filter(r=>r.service_type_id===typeId&&r.valid_from<=day).sort((a,b)=>a.valid_from<b.valid_from?1:-1)[0]
  ||rates.filter(r=>r.service_type_id===typeId).sort((a,b)=>a.valid_from<b.valid_from?-1:1)[0]||null;};
const daysChips=(sel)=>`<div class="cf-days" role="radiogroup" aria-label="Días de pago">${DAYS.map(d=>`<button type="button" class="chip" role="radio" data-d="${d}" aria-pressed="${Number(sel)===d}">${d?d+' días':'Al momento'}</button>`).join('')}</div>`;
function bindDays(root,input){root.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{input.value=b.dataset.d;root.querySelectorAll('[data-d]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));UI().haptic(5);});
  input.addEventListener('input',()=>root.querySelectorAll('[data-d]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.d===input.value.trim()))));}

/* ── Formulario de prestadora en hoja (alta y edición) ── */
function clientSheet(c){return new Promise(res=>{const edit=!!c;let done=false;
  const sh=S().sheet(edit?'Editar prestadora':'Nueva prestadora',`<form class="cf-form" novalidate>
      <div class="field"><label for="cf-name">Nombre</label><input id="cf-name" data-v="name!" placeholder="Ej.: Asistencia Ruta S.A." value="${esc(c?.name||'')}" autocomplete="off"></div>
      <div class="field"><label for="cf-days">¿A cuántos días te paga?</label>${daysChips(c?c.payment_days:30)}<input id="cf-days" data-v="days!" inputmode="numeric" value="${c?c.payment_days:30}"></div>
      <div class="field"><label for="cf-notes">Notas (opcional)</label><input id="cf-notes" data-v="text" placeholder="CUIT, contacto, mail para facturar…" value="${esc(c?.notes||'')}"></div>
      <p class="err" id="cf-err" hidden></p>
      <button class="btn pri block" type="button" id="cf-ok">${icon('check')} ${edit?'Guardar cambios':'Agregar prestadora'}</button></form>`);
  const f=sh.el.querySelector('form');bindDays(f,f.querySelector('#cf-days'));setTimeout(()=>f.querySelector('#cf-name').focus(),120);
  new MutationObserver((m,o)=>{if(!document.body.contains(sh.el)){o.disconnect();if(!done)res(null);}}).observe(document.body,{childList:true});
  f.querySelector('#cf-ok').onclick=()=>{if(!UI().validateForm(f))return;done=true;const v={name:f.querySelector('#cf-name').value.trim(),payment_days:Math.round(num(f.querySelector('#cf-days').value)),notes:f.querySelector('#cf-notes').value.trim()||null};sh.close();res(v);};});}

/* ── Lista de prestadoras ── */
views.clientes=async function(mode){
  shell(`<div class="top"><button class="btn ghost icon-btn" type="button" id="back" aria-label="Volver">${icon('arrow-left')}</button><h1 class="grow">Prestadoras</h1>
      <button class="btn ghost" type="button" id="to-types">${icon('list-checks')} Tipos</button></div>
    <p class="sub">A quién le facturás, a cuántos días te paga y cuánto le cobrás por cada servicio.</p>
    <div id="cl-list" class="stack fill">${UI().SKELETON}</div>
    <button class="btn pri block" type="button" id="cl-add">${icon('plus')} Nueva prestadora</button>`,'mas');
  $('back').onclick=()=>go('mas');$('to-types').onclick=()=>go('tipos');
  const add=async()=>{const v=await clientSheet(null);if(!v)return;const {data,error}=await C.db.from('solo_clients').insert(v).select('id').single();
    if(error)return toast(errText(error));UI().success();toast('Prestadora agregada · cargá sus tarifas');go('cliente-'+data.id);};
  $('cl-add').onclick=add;
  const [{data:clients,error},{data:rates},{data:types}]=await Promise.all([C.db.from('solo_clients').select('*').order('name'),C.db.from('solo_rates').select('client_id,service_type_id'),C.db.from('solo_service_types').select('id').eq('active',true)]);
  const box=$('cl-list');if(!box)return;if(error){box.innerHTML='<div class="empty">'+esc(errText(error))+'</div>';return;}
  const nTypes=(types||[]).length,ids=new Set((types||[]).map(t=>t.id));
  const covered=id=>new Set((rates||[]).filter(r=>r.client_id===id&&ids.has(r.service_type_id)).map(r=>r.service_type_id)).size;
  const prest=(clients||[]).filter(c=>c.kind!=='particular'),part=(clients||[]).find(c=>c.kind==='particular');
  const card=c=>{const n=covered(c.id),st=!c.active?['muted','Inactiva']:!n?['wait','Sin tarifas']:n<nTypes?['wait',`${n} de ${nTypes} tarifas`]:['ok','Tarifas completas'];
    return `<button class="cf-card ${c.active?'':'off'}" type="button" data-id="${c.id}"><span class="ex-ico">${icon('building-2')}</span><span class="cf-card-t"><b class="ell">${esc(c.name)}</b><small>${c.payment_days?'Paga a '+c.payment_days+' días':'Paga al momento'}${c.notes?' · '+esc(c.notes):''}</small></span><span class="pill ${st[0]}">${st[1]}</span>${icon('chevron-right','trail')}</button>`;};
  const act=prest.filter(c=>c.active),off=prest.filter(c=>!c.active);
  box.innerHTML=(act.map(card).join('')||`<div class="empty">${icon('building-2','empty-ico')}<b>Todavía no cargaste prestadoras</b><span>Agregá la empresa que te pasa servicios y cargale las tarifas.</span></div>`)
    +(part?`<button class="cf-card" type="button" data-id="${part.id}"><span class="ex-ico">${icon('user')}</span><span class="cf-card-t"><b>Particular</b><small>Cobro en el momento · precio que acordás en cada servicio</small></span>${icon('chevron-right','trail')}</button>`:'')
    +(off.length?`<p class="cf-sec">Inactivas</p>`+off.map(card).join(''):'');
  box.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>go('cliente-'+b.dataset.id));
  if(mode==='nueva')add();
};

/* ── Ficha de prestadora: datos, tarifas por tipo y acciones ── */
views.cliente=async function(id){
  shell(`<div class="top"><button class="btn ghost icon-btn" type="button" id="back" aria-label="Prestadoras">${icon('arrow-left')}</button><h1 class="grow ell" id="cf-title">Prestadora</h1><span id="cf-state"></span></div>
    <div id="cf-info"></div><div id="cf-rates" class="stack fill">${UI().SKELETON}</div><div class="rm-footer" id="cf-actions"></div>`,'mas');
  $('back').onclick=()=>go('clientes');
  const [{data:c,error},{data:types},{data:rates},{data:used}]=await Promise.all([
    C.db.from('solo_clients').select('*').eq('id',id).maybeSingle(),C.db.from('solo_service_types').select('*').eq('active',true).order('name'),
    C.db.from('solo_rates').select('*').eq('client_id',id),C.db.from('solo_services').select('id').eq('client_id',id).limit(1)]);
  const box=$('cf-rates');if(!box)return;
  if(error||!c){box.innerHTML='<div class="empty">No encontramos esa prestadora.</div>';return;}
  const particular=c.kind==='particular',hasServices=!!(used||[]).length;
  $('cf-title').textContent=c.name;$('cf-state').innerHTML=c.active?'':'<span class="pill muted">Inactiva</span>';
  $('cf-info').innerHTML=particular?`<p class="sub">Para clientes que pagan en el momento. El precio lo acordás en cada servicio, así que no lleva tarifas.</p>`
    :`<div class="cf-info"><div><span>Días de pago</span><b>${c.payment_days?c.payment_days+' días':'Al momento'}</b></div>${c.notes?`<div><span>Notas</span><b class="ell">${esc(c.notes)}</b></div>`:''}</div>`;
  if(particular){box.innerHTML='';$('cf-actions').hidden=true;return;}
  // Tarifas: una fila por tipo de servicio; tocarla abre la hoja de tarifa.
  const paintRates=()=>{box.innerHTML=`<div class="row cf-head"><h2>Tarifas</h2><button class="link" type="button" id="cf-types">Tipos de servicio</button></div>`+
    ((types||[]).map(t=>{const r=currentRate(rates||[],t.id),hist=(rates||[]).filter(x=>x.service_type_id===t.id).length;
      const next=(rates||[]).filter(x=>x.service_type_id===t.id&&x.valid_from>isoDate(new Date())).sort((a,b)=>a.valid_from<b.valid_from?-1:1)[0];
      return `<button class="cf-rate ${r?'':'empty-rate'}" type="button" data-t="${t.id}"><span class="cf-rate-t"><b>${esc(t.name)}</b><small>${r?esc(rateTxt(r)):'Sin tarifa · tocá para cargarla'}</small>${next&&next!==r?`<small class="cf-next">Pasa a base ${money(next.base_amount)} el ${dmy(next.valid_from).slice(0,5)}</small>`:''}</span><span class="cf-rate-s">${r?`<small>desde ${dmy(r.valid_from)}</small>${hist>1?`<small>${hist} precios</small>`:''}`:icon('plus')}</span></button>`;}).join('')
      ||`<div class="empty">Todavía no hay tipos de servicio.<button class="btn pri" type="button" id="cf-go-types">Cargar tipos</button></div>`);
    $('cf-types')?.addEventListener('click',()=>go('tipos'));$('cf-go-types')?.addEventListener('click',()=>go('tipos'));
    box.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>rateSheet(c,(types||[]).find(t=>t.id===b.dataset.t),rates||[],()=>views.cliente(id)));};
  paintRates();
  // Acciones con confirmación.
  $('cf-actions').innerHTML=`<button class="btn danger-ghost" type="button" id="cf-del">${icon(hasServices?(c.active?'ban':'rotate-ccw'):'trash-2')} ${hasServices?(c.active?'Desactivar':'Activar'):'Eliminar'}</button><button class="btn pri" type="button" id="cf-edit">${icon('pencil')} Editar</button>`;
  $('cf-edit').onclick=async()=>{const v=await clientSheet(c);if(!v)return;
    const LBL={name:'Nombre',payment_days:'Días de pago',notes:'Notas'},ch=Object.keys(v).filter(k=>String(v[k]??'')!==String(c[k]??''));
    if(!ch.length)return toast('No cambiaste nada');
    const ok=await S().confirmBox('¿Guardar los cambios?',`<ul class="diff">${ch.map(k=>`<li><span>${LBL[k]}</span><s>${esc(c[k]??'—')}</s><b>${esc(v[k]??'—')}</b></li>`).join('')}</ul>${ch.includes('payment_days')?'<p class="hint">Los vencimientos se recalculan con los días nuevos.</p>':''}`,'Guardar cambios');
    if(!ok)return;const {error}=await C.db.from('solo_clients').update(v).eq('id',id);if(error)return toast(errText(error));UI().success();toast('Prestadora actualizada');views.cliente(id);};
  $('cf-del').onclick=async()=>{
    if(hasServices){const to=!c.active;const ok=await S().confirmBox(to?'¿Activar la prestadora?':'¿Desactivar la prestadora?',
        to?'<p>Vuelve a aparecer al cargar un servicio nuevo.</p>':`<p><b>${esc(c.name)}</b> deja de aparecer al cargar servicios nuevos.</p><p class="hint">Tiene servicios cargados, por eso no se borra: sus remitos y su facturación quedan como están.</p>`,to?'Activar':'Desactivar',!to);
      if(!ok)return;const {error}=await C.db.from('solo_clients').update({active:to}).eq('id',id);if(error)return toast(errText(error));UI().success();toast(to?'Prestadora activada':'Prestadora desactivada');return views.cliente(id);}
    const ok=await S().confirmBox('¿Eliminar la prestadora?',`<p><b>${esc(c.name)}</b> y sus ${(rates||[]).length} tarifa${(rates||[]).length===1?'':'s'} se borran.</p><p class="hint">No tiene servicios cargados. No se puede deshacer.</p>`,'Eliminar',true);
    if(!ok)return;const {error}=await C.db.from('solo_clients').delete().eq('id',id);if(error)return toast(/foreign key|violates/i.test(error.message||'')?'Tiene servicios: desactivala en lugar de borrarla.':errText(error));UI().success();toast('Prestadora eliminada');go('clientes');};
};

/* ── Hoja de tarifa: precio vigente, ejemplo en vivo e historial ── */
function rateSheet(c,t,rates,after){
  const r=currentRate(rates,t.id),hist=rates.filter(x=>x.service_type_id===t.id).sort((a,b)=>a.valid_from<b.valid_from?1:-1);
  const sh=S().sheet('Tarifa · '+t.name,`<form class="cf-form" novalidate>
      <p class="hint">${esc(c.name)}${r?' · vigente desde '+dmy(r.valid_from):' · todavía sin tarifa'}</p>
      <div class="grid2"><div class="field"><label for="rt-base">Base $</label><input id="rt-base" data-v="money" inputmode="decimal" value="${r?Number(r.base_amount):''}" placeholder="0"></div>
        <div class="field"><label for="rt-km">Km incluidos</label><input id="rt-km" data-v="km" inputmode="decimal" value="${r?Number(r.included_km):''}" placeholder="0"></div></div>
      <div class="grid2"><div class="field"><label for="rt-per">$ por km extra</label><input id="rt-per" data-v="money" inputmode="decimal" value="${r?Number(r.per_km):''}" placeholder="0"></div>
        <div class="field"><label for="rt-from">Vigente desde</label><input id="rt-from" data-v="date!" type="date" value="${isoDate(new Date())}"></div></div>
      <div class="cf-example" id="rt-ex"></div>
      ${hist.length?`<details class="cf-hist"><summary>Historial de precios (${hist.length})</summary>${hist.map(h=>`<div class="cf-hist-row"><span>${dmy(h.valid_from)}</span><span class="ell">${esc(rateTxt(h))}</span><button class="btn ghost icon-btn" type="button" data-del="${h.id}" aria-label="Borrar precio del ${dmy(h.valid_from)}">${icon('trash-2')}</button></div>`).join('')}</details>`:''}
      <p class="err" id="rt-err" hidden></p>
      <button class="btn pri block" type="button" id="rt-ok">${icon('check')} ${r?'Guardar precio nuevo':'Guardar tarifa'}</button></form>`);
  const f=sh.el.querySelector('form'),g=k=>num(f.querySelector('#rt-'+k).value);
  // Ejemplo en vivo: cuánto cobrás en un servicio de X km.
  let exKm=r?Math.max(Number(r.included_km)+20,30):30;
  const paintEx=()=>{const base=g('base'),inc=g('km'),per=g('per'),extra=Math.max(0,exKm-inc),tot=base+extra*per;
    f.querySelector('#rt-ex').innerHTML=`<span>Con</span><button type="button" class="cf-exkm" data-dk="-10" aria-label="Menos km">−</button><b class="num">${exKm} km</b><button type="button" class="cf-exkm" data-dk="10" aria-label="Más km">+</button><span>cobrás</span><b class="num cf-ex-tot">${money(tot)}</b>${extra&&per?`<small>${money(base)} + ${extra} km × ${money(per)}</small>`:''}`;
    f.querySelectorAll('[data-dk]').forEach(b=>b.onclick=()=>{exKm=Math.max(0,exKm+Number(b.dataset.dk));paintEx();});};
  ['base','km','per'].forEach(k=>f.querySelector('#rt-'+k).addEventListener('input',paintEx));setTimeout(paintEx,0);
  f.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{const h=hist.find(x=>x.id===b.dataset.del);sh.close();
    const ok=await S().confirmBox('¿Borrar este precio?',`<p>${esc(t.name)} · desde ${dmy(h.valid_from)}</p><p class="hint">${esc(rateTxt(h))}. Los servicios ya cargados no cambian.</p>`,'Borrar',true);
    if(!ok)return rateSheet(c,t,rates,after);const {error}=await C.db.from('solo_rates').delete().eq('id',h.id);if(error)return toast(errText(error));toast('Precio borrado');after();});
  f.querySelector('#rt-ok').onclick=async()=>{const er=f.querySelector('#rt-err');er.hidden=true;if(!UI().validateForm(f))return;
    const row={client_id:c.id,service_type_id:t.id,base_amount:g('base'),included_km:g('km'),per_km:g('per'),valid_from:f.querySelector('#rt-from').value};
    if(!row.base_amount&&!row.per_km){er.textContent='Poné al menos el precio base o el precio por km extra.';er.hidden=false;return;}
    if(r){sh.close();const ok=await S().confirmBox('¿Guardar el precio nuevo?',`<ul class="diff">${[['Base','base_amount',money],['Km incluidos','included_km',v=>v+' km'],['$ por km extra','per_km',money]].filter(([,k])=>Number(r[k])!==Number(row[k])).map(([l,k,fm])=>`<li><span>${l}</span><s>${fm(Number(r[k]))}</s><b>${fm(row[k])}</b></li>`).join('')||'<li><span>Precio</span><b>Sin cambios en los importes</b></li>'}</ul><p class="hint">Vale desde el ${dmy(row.valid_from)}. Los servicios anteriores mantienen su precio.</p>`,'Guardar precio');
      if(!ok)return rateSheet(c,t,rates,after);}
    const {error}=await C.db.from('solo_rates').upsert(row,{onConflict:'client_id,service_type_id,valid_from'});if(error){toast(errText(error));return;}
    if(!r)sh.close();UI().success();toast('Tarifa guardada');after();};
}

/* ── Tipos de servicio (compartidos por todas las prestadoras) ── */
views.tipos=async function(){
  shell(`<div class="top"><button class="btn ghost icon-btn" type="button" id="back" aria-label="Volver">${icon('arrow-left')}</button><h1 class="grow">Tipos de servicio</h1></div>
    <p class="sub">Los servicios que hacés. Cada prestadora tiene su tarifa para cada tipo.</p>
    <div id="tp-list" class="stack fill">${UI().SKELETON}</div>
    <button class="btn pri block" type="button" id="tp-add">${icon('plus')} Nuevo tipo</button>`,'mas');
  $('back').onclick=()=>go('clientes');
  const ask=(title,val,okLabel)=>new Promise(res=>{let done=false;const sh=S().sheet(title,`<form class="cf-form" novalidate><div class="field"><label for="tp-name">Nombre</label><input id="tp-name" data-v="name!" placeholder="Ej.: Paso de corriente" value="${esc(val||'')}" autocomplete="off"></div><button class="btn pri block" type="button" id="tp-ok">${icon('check')} ${okLabel}</button></form>`);
    const f=sh.el.querySelector('form');setTimeout(()=>f.querySelector('#tp-name').focus(),120);
    new MutationObserver((m,o)=>{if(!document.body.contains(sh.el)){o.disconnect();if(!done)res(null);}}).observe(document.body,{childList:true});
    f.querySelector('#tp-ok').onclick=()=>{if(!UI().validateForm(f))return;done=true;const v=f.querySelector('#tp-name').value.trim();sh.close();res(v);};});
  $('tp-add').onclick=async()=>{const name=await ask('Nuevo tipo de servicio','','Agregar');if(!name)return;const {error}=await C.db.from('solo_service_types').insert({name});
    if(error)return toast(errText(error));UI().success();toast('Tipo agregado · cargá su tarifa en cada prestadora');views.tipos();};
  const [{data:types,error},{data:rates}]=await Promise.all([C.db.from('solo_service_types').select('*').order('name'),C.db.from('solo_rates').select('service_type_id,client_id')]);
  const box=$('tp-list');if(!box)return;if(error){box.innerHTML='<div class="empty">'+esc(errText(error))+'</div>';return;}
  const n=id=>new Set((rates||[]).filter(r=>r.service_type_id===id).map(r=>r.client_id)).size;
  const row=t=>`<div class="cf-type ${t.active?'':'off'}"><span class="cf-card-t"><b>${esc(t.name)}</b><small>${n(t.id)?'Con tarifa en '+n(t.id)+' prestadora'+(n(t.id)>1?'s':''):'Sin tarifas todavía'}${t.active?'':' · inactivo'}</small></span>
    <button class="btn ghost icon-btn" type="button" data-ren="${t.id}" aria-label="Cambiar nombre de ${esc(t.name)}">${icon('pencil')}</button>
    <button class="btn ghost icon-btn" type="button" data-tog="${t.id}" aria-label="${t.active?'Desactivar':'Activar'} ${esc(t.name)}">${icon(t.active?'ban':'rotate-ccw')}</button></div>`;
  const act=(types||[]).filter(t=>t.active),off=(types||[]).filter(t=>!t.active);
  box.innerHTML=(act.map(row).join('')||'<div class="empty">Todavía no hay tipos de servicio.</div>')+(off.length?'<p class="cf-sec">Inactivos</p>'+off.map(row).join(''):'');
  box.querySelectorAll('[data-ren]').forEach(b=>b.onclick=async()=>{const t=types.find(x=>x.id===b.dataset.ren);const name=await ask('Cambiar nombre',t.name,'Guardar');if(!name||name===t.name)return;
    const ok=await S().confirmBox('¿Cambiar el nombre?',`<ul class="diff"><li><span>Nombre</span><s>${esc(t.name)}</s><b>${esc(name)}</b></li></ul><p class="hint">Se ve con el nombre nuevo también en los remitos ya cargados.</p>`,'Guardar');
    if(!ok)return;const {error}=await C.db.from('solo_service_types').update({name}).eq('id',t.id);if(error)return toast(errText(error));toast('Nombre actualizado');views.tipos();});
  box.querySelectorAll('[data-tog]').forEach(b=>b.onclick=async()=>{const t=types.find(x=>x.id===b.dataset.tog),to=!t.active;
    const ok=await S().confirmBox(to?'¿Activar el tipo?':'¿Desactivar el tipo?',to?`<p>${esc(t.name)} vuelve a aparecer al cargar servicios.</p>`:`<p><b>${esc(t.name)}</b> deja de aparecer al cargar servicios nuevos.</p><p class="hint">Sus tarifas y los remitos ya cargados quedan guardados.</p>`,to?'Activar':'Desactivar',!to);
    if(!ok)return;const {error}=await C.db.from('solo_service_types').update({active:to}).eq('id',t.id);if(error)return toast(errText(error));toast(to?'Tipo activado':'Tipo desactivado');views.tipos();});
};

/* ── Datos del remito: lo que sale en el membrete del PDF (nombre, titular, teléfono, CUIT, condición fiscal y logo) ── */
const TAX={monotributo:'Monotributo',responsable_inscripto:'Responsable inscripto',exento:'Exento'};
const cuitTxt=d=>d&&d.length===11?d.slice(0,2)+'-'+d.slice(2,10)+'-'+d.slice(10):'';
// El logo se guarda como PNG chico (conserva el fondo transparente).
function logoPng(file){return new Promise(res=>{const img=new Image();img.onload=()=>{const k=Math.min(1,512/Math.max(img.width,img.height)),c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(img.width*k));c.height=Math.max(1,Math.round(img.height*k));c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(img.src);c.toBlob(b=>res(b),'image/png');};
  img.onerror=()=>res(null);img.src=URL.createObjectURL(file);});}
views.perfil=async function(){
  const P=C.profile||{};let logo=null,logoUrl=null,removeLogo=false;
  shell(`<div class="top"><button class="btn ghost icon-btn" type="button" id="back" aria-label="Volver">${icon('arrow-left')}</button><h1 class="grow">Datos del remito</h1></div>
    <div class="pf-prev" aria-label="Así se ve el encabezado del remito"><span class="pf-logo" id="pf-logo-prev"><img src="/assets/icons/icon-192.png" alt=""></span>
      <span class="pf-lines"><b id="pf-p1"></b><small id="pf-p2"></small><small id="pf-p3"></small></span><span class="pf-num"><i>REMITO</i><b>N.º 000001</b></span></div>
    <form id="pf" class="pf-form" novalidate>
      <div class="pf-logo-row"><button class="pf-logo-pick" type="button" id="pf-logo-btn" aria-label="Elegir logo"><span id="pf-logo-img"></span></button>
        <div class="pf-logo-txt"><b>Logo de tu grúa</b><span class="hint" id="pf-logo-hint">Opcional. Si no subís uno, va el de AuxiliOS.</span>
          <div class="row"><button class="link" type="button" id="pf-logo-ch">Elegir imagen</button><button class="link danger" type="button" id="pf-logo-rm" hidden>Quitar</button></div></div>
        <input type="file" id="pf-file" accept="image/png,image/jpeg,image/webp" hidden></div>
      <div class="field"><label for="pf-biz">Nombre de la grúa o empresa</label><input id="pf-biz" placeholder="Ej.: Grúas Pérez" value="${esc(P.business_name||'')}" autocomplete="organization"></div>
      <div class="grid2"><div class="field"><label for="pf-name">Titular</label><input id="pf-name" value="${esc(P.full_name||'')}" autocomplete="name"></div>
        <div class="field"><label for="pf-phone">Teléfono</label><input id="pf-phone" type="tel" inputmode="tel" placeholder="11 2345 6789" value="${esc(P.phone||'')}"></div></div>
      <div class="field"><label for="pf-cuit">CUIT</label><input id="pf-cuit" inputmode="numeric" placeholder="20-12345678-9" value="${esc(cuitTxt(P.cuit||''))}"></div>
      <div class="field"><span class="lbl">Condición frente a ARCA</span><input type="hidden" id="pf-tax" value="${esc(P.tax_condition||'')}">
        <div class="cf-days pf-tax" role="radiogroup" aria-label="Condición fiscal">${Object.entries(TAX).map(([k,l])=>`<button type="button" class="chip" role="radio" data-t="${k}" aria-pressed="${P.tax_condition===k}">${l}</button>`).join('')}</div></div>
      <button class="btn pri block" type="submit">${icon('check')} Guardar datos</button>
    </form>`,'mas');
  $('back').onclick=()=>go('mas');
  const digits=v=>String(v||'').replace(/\D/g,'');
  function paint(){const biz=$('pf-biz').value.trim(),name=$('pf-name').value.trim(),tel=$('pf-phone').value.trim(),cuit=digits($('pf-cuit').value),tax=$('pf-tax').value;
    $('pf-p1').textContent=biz||name||'Tu grúa';
    $('pf-p2').textContent=[cuit.length===11?'CUIT '+cuitTxt(cuit):'',TAX[tax]||''].filter(Boolean).join(' · ')||'CUIT y condición fiscal';
    $('pf-p3').textContent=[biz&&name?'Titular: '+name:'',tel?'Tel. '+tel:''].filter(Boolean).join(' · ')||C.user?.email||'';
    const src=logo?URL.createObjectURL(logo):(!removeLogo&&logoUrl)||null;
    $('pf-logo-prev').classList.toggle('own',!!src);$('pf-logo-prev').innerHTML=`<img src="${src||'/assets/icons/icon-192.png'}" alt="">`;
    $('pf-logo-img').innerHTML=src?`<img src="${src}" alt="">`:icon('upload');$('pf-logo-btn').classList.toggle('has',!!src);
    $('pf-logo-rm').hidden=!src;$('pf-logo-ch').textContent=src?'Cambiar':'Elegir imagen';}
  ['pf-biz','pf-name','pf-phone','pf-cuit'].forEach(id=>$(id).addEventListener('input',paint));
  document.querySelectorAll('.pf-tax [data-t]').forEach(b=>b.onclick=()=>{const on=$('pf-tax').value!==b.dataset.t;$('pf-tax').value=on?b.dataset.t:'';
    document.querySelectorAll('.pf-tax [data-t]').forEach(x=>x.setAttribute('aria-pressed',String(on&&x===b)));UI().haptic(5);paint();});
  const pick=()=>$('pf-file').click();$('pf-logo-btn').onclick=pick;$('pf-logo-ch').onclick=pick;
  $('pf-file').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;if(f.size>8e6)return toast('La imagen es muy pesada (máximo 8 MB).');
    const b=await logoPng(f);if(!b)return toast('No pudimos leer esa imagen. Probá con otra.');logo=b;removeLogo=false;paint();};
  $('pf-logo-rm').onclick=()=>{logo=null;removeLogo=true;paint();};
  if(P.logo_path){const {data}=await C.db.storage.from('solo_files').createSignedUrl(P.logo_path,3600);if(data?.signedUrl){logoUrl=data.signedUrl;}}
  paint();
  $('pf').addEventListener('submit',async e=>{e.preventDefault();const f=e.target;
    try{const patch={business_name:$('pf-biz').value.trim()||null,full_name:$('pf-name').value.trim(),phone:$('pf-phone').value.trim()||null,
        cuit:digits($('pf-cuit').value)||null,tax_condition:$('pf-tax').value||null};
      if(logo){const path=C.user.id+'/logo/logo-'+Date.now()+'.png';const up=await C.db.storage.from('solo_files').upload(path,logo,{contentType:'image/png',upsert:true});
        if(up.error)return toast(errText(up.error));patch.logo_path=path;}
      else if(removeLogo)patch.logo_path=null;
      const old=P.logo_path;
      const {data,error}=await C.db.from('solo_profiles').update(patch).eq('owner_id',C.user.id).select('*').single();
      if(error)return toast(errText(error));
      if(old&&old!==patch.logo_path&&'logo_path' in patch)Promise.resolve().then(()=>C.db.storage.from('solo_files').remove([old])).catch(()=>{});
      C.profile=data||{...P,...patch};UI().success();toast('Datos guardados. Ya salen en tus remitos.');go('mas');
    }finally{UI().setBusy(f,false);}});
};
})();

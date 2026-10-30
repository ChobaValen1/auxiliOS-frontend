// AuxiliOS Solo · servicios (con precio por tarifa), nuevo servicio por pasos, remito digital con firma y gastos fijos/variables.
(function(){
'use strict';
const C=window.SoloCore;if(!C)return;
const {views,shell,go,toast,esc,money,num,isoDate,monthName,errText}=C;
const icon=C.icon;
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
  shell(`<div class="top"><h1 class="grow">${esc(monthName(C.month))}</h1><button class="btn pri" type="button" id="add">${icon('plus')} Servicio</button></div>
    <div class="seg" role="group" aria-label="Filtro">${[['todos','Todos'],['pendientes','Por cobrar'],['cobrados','Cobrados']].map(([k,l])=>`<button type="button" data-f="${k}" aria-pressed="${f===k}">${l}</button>`).join('')}</div>
    <div id="list" class="stack fill"><div class="sk-group" aria-busy="true" aria-label="Cargando"><i class="sk"></i><i class="sk"></i><i class="sk short"></i></div></div>`,'servicios');
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
    <div class="row"><b class="ell">${esc(name(types,s.service_type_id)||'Servicio')}${s.km?' · '+esc(s.km)+' km':''}</b><b class="num">${money(s.total)}</b></div>
    <div class="row"><span class="hint ell">N.º ${s.remito_number} · ${esc(name(clients,s.client_id))} · ${esc(fmtDate(s.service_date))}</span>${s.paid_at?'<span class="pill ok">Cobrado</span>':s.status==='signed'?'<span class="pill wait">Por cobrar</span>':'<span class="pill muted">Sin firmar</span>'}</div></button>`).join('')||'<div class="empty">No hay servicios para mostrar en este mes.</div>');
  list.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>go('servicio-'+b.dataset.id));
};
const app=()=>document.getElementById('app');

/* ── Nuevo servicio por pasos: Prestadora | Particular → a quién → qué servicio (→ precio) ── */
views.nuevo=async function(){
  shell(`<div class="top"><button class="btn ghost icon-btn" type="button" id="nv-back" aria-label="Volver">${icon('arrow-left')}</button>
      <div class="grow"><h1 id="nv-t">Nuevo servicio</h1><p class="hint" id="nv-sub">Paso 1 de 3</p></div></div>
    <div class="steps" aria-hidden="true"><i class="on"></i><i></i><i></i></div>
    <div id="nv" class="fill">${UI().SKELETON}</div>`,'servicios',{bare:true});
  const [{data:clients},{data:types},{data:trucks},{data:rates}]=await Promise.all([
    C.db.from('solo_clients').select('*').eq('active',true).order('name'),
    C.db.from('solo_service_types').select('*').eq('active',true).order('name'),C.db.from('solo_trucks').select('id').order('created_at').limit(1),
    C.db.from('solo_rates').select('*')]);
  const box=document.getElementById('nv');if(!box)return;
  const $=x=>document.getElementById(x);
  const prest=(clients||[]).filter(c=>c.kind!=='particular');
  const st={kind:null,client:null,type:null},hist=[];
  const rateCount=id=>new Set((rates||[]).filter(r=>r.client_id===id).map(r=>r.service_type_id)).size;
  function frame(n,title,html,dir){
    $('nv-t').textContent=title;$('nv-sub').textContent='Paso '+n+' de 3'+(st.client?' · '+st.client.name:'');
    app().querySelectorAll('.steps i').forEach((b,i)=>b.classList.toggle('on',i<n));
    box.innerHTML=`<div class="rm-panel ${dir<0?'slide-r':'slide-l'}">${html}</div>`;}
  const goStep=(fn,dir=1)=>{if(dir>0&&cur)hist.push(cur);cur=fn;fn(dir);};let cur=null;
  $('nv-back').onclick=()=>{const prev=hist.pop();if(prev){cur=prev;prev(-1);}else go('servicios');};

  function stepKind(dir){st.kind=null;st.client=null;
    frame(1,'¿Para quién es?',`<div class="choice">
      <button class="pick big" type="button" data-kind="prestadora">${icon('building-2','pick-ico')}<b>Prestadora</b><span>Te lo pasó una empresa. Se cobra con tu tarifa.</span><em>${prest.length} cargada${prest.length===1?'':'s'}</em></button>
      <button class="pick big" type="button" data-kind="particular">${icon('user','pick-ico')}<b>Particular</b><span>Un cliente que te paga en el momento.</span><em>Precio que acordás</em></button></div>`,dir);
    box.querySelectorAll('[data-kind]').forEach(b=>b.onclick=async()=>{UI().haptic(8);
      if(b.dataset.kind==='prestadora'){st.kind='prestadora';return goStep(stepClient);}
      st.kind='particular';st.client=(clients||[]).find(c=>c.kind==='particular')||null;
      if(!st.client){const {data,error}=await C.db.from('solo_clients').insert({name:'Particular',kind:'particular',payment_days:0}).select('*').single();if(error)return toast(errText(error));st.client=data;}
      goStep(stepType);});}
  function stepClient(dir){st.client=null;
    frame(2,'¿Qué prestadora?',`<div class="pick-grid">${prest.map(c=>{const n=rateCount(c.id);return `<button class="pick" type="button" data-id="${c.id}"><b class="ell2">${esc(c.name)}</b><span>Paga a ${Number(c.payment_days)||0} días</span>${n?`<em class="ok">${n} tarifa${n>1?'s':''}</em>`:'<em class="wait">Sin tarifas</em>'}</button>`;}).join('')}
      <button class="pick add" type="button" id="nv-add">${icon('plus','pick-ico')}<b>Nueva prestadora</b><span>Cargala con sus tarifas</span></button></div>`,dir);
    box.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{st.client=prest.find(c=>c.id===b.dataset.id);UI().haptic(8);goStep(stepType);});
    $('nv-add').onclick=()=>go('clientes-nueva');}
  function stepType(dir){st.type=null;const n=st.kind==='prestadora'?3:2;
    frame(n,'¿Qué servicio?',(types||[]).length?`<div class="pick-grid">${types.map(t=>{const r=st.kind==='prestadora'?rateFor(rates,st.client.id,t.id,new Date()):null;
      return `<button class="pick" type="button" data-t="${t.id}"><b class="ell2">${esc(t.name)}</b>${st.kind!=='prestadora'?'<span>Precio a acordar</span>':r?`<span class="num">Base ${money(r.base_amount)}</span><em class="ok">${Number(r.included_km)||0} km incluidos</em>`:'<em class="wait">Sin tarifa</em>'}</button>`;}).join('')}</div>`
      :`<div class="empty">Todavía no hay tipos de servicio.<button class="btn pri" type="button" id="nv-types">Cargar tipos</button></div>`,dir);
    $('nv-types')?.addEventListener('click',()=>go('cliente-'+st.client.id));
    box.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{st.type=types.find(t=>t.id===b.dataset.t);UI().haptic(8);
      if(st.kind==='particular')return goStep(stepPrice);create(0,b);});}
  function stepPrice(dir){
    frame(3,'Precio acordado',`<form id="svc" class="card" novalidate><p class="sub">${esc(st.type.name)} para un particular. Poné lo que acordaste cobrarle; los adicionales los sumás en el remito.</p>
      <div class="field"><label for="n-manual">Precio $</label><input id="n-manual" class="big-input" data-v="moneypos!" inputmode="decimal" placeholder="0"></div>
      <p id="n-err" class="err" hidden></p><button class="btn pri block" type="submit" data-busy-text="Abriendo remito…">Empezar remito</button></form>`,dir);
    setTimeout(()=>$('n-manual')?.focus(),80);
    $('svc').onsubmit=e=>{e.preventDefault();create(num($('n-manual').value));};}
  async function create(base,btn){if(btn){btn.disabled=true;btn.classList.add('busy');}
    const {data,error}=await C.db.from('solo_services').insert({client_id:st.client.id,service_type_id:st.type?.id||null,truck_id:trucks?.[0]?.id||null,
      service_date:new Date().toISOString(),base_amount:base,total:base}).select('id').single();
    if(error){if(btn){btn.disabled=false;btn.classList.remove('busy');}const er=$('n-err');if(er){er.textContent=errText(error);er.hidden=false;}else toast(errText(error));return;}
    UI().success();go('servicio-'+data.id);}
  goStep(stepKind);
};
const UI=()=>window.SoloUI||{SKELETON:'',validateForm:()=>true,success(){},haptic(){}};

/* ── Remito por pasos, igual que el del chofer en AuxiliOS Flota ── */
const STEPS=['Servicio','Socio','Adicionales','Evidencia','Firma'];
const SLOTS=[['frente','Frente del vehículo'],['lateral','Lateral'],['danos','Daños o estado adicional'],['odometro','Odómetro'],['extra1','Foto extra 1'],['extra2','Foto extra 2']];
// Mismas conformidades que el remito del chofer en Flota; en pantalla va el nombre corto y el texto completo queda de ayuda.
const CONF=[['conf_service','Conformidad con el servicio','El socio confirma que el servicio fue prestado correctamente',true,'Servicio conforme'],
  ['conf_charges','Aceptación de cargos variables','Acepta peajes, excedentes y otros cargos detallados',true,'Acepta los cargos'],
  ['no_damage','Sin daños reportados','El vehículo fue entregado sin incidentes ni daños adicionales',true,'Sin daños'],
  ['conf_tow','Conformidad de arrastre','Autorizo a arrastrar mi vehículo bajo mi exclusiva responsabilidad',false,'Arrastre']];
const PAY_ICON={cash:'banknote',transfer:'building-2',card:'credit-card',mercado_pago:'wallet',other:'ellipsis'};
const extraOf=(s,name)=>Number((s.extras||[]).find(x=>x.name===name)?.amount)||0;

views.servicio=async function(id,stepArg){
  // Pantalla completa, sin barra inferior: cada paso entra entero en el celular.
  shell(`<div id="rm" class="rm">${UI().SKELETON}</div>`,'servicios',{bare:true});
  const {data:s,error}=await C.db.from('solo_services').select('*').eq('id',id).maybeSingle();
  const box=document.getElementById('rm');if(!box)return;
  if(error||!s){box.innerHTML=`<div class="top"><button class="btn ghost icon-btn" type="button" id="rm-x" aria-label="Volver">${icon('arrow-left')}</button></div><div class="empty">No encontramos ese servicio.</div>`;document.getElementById('rm-x').onclick=()=>go('servicios');return;}
  const [{data:cl},{data:tp},{data:tk},{data:rates}]=await Promise.all([C.db.from('solo_clients').select('*').eq('id',s.client_id).maybeSingle(),
    s.service_type_id?C.db.from('solo_service_types').select('name').eq('id',s.service_type_id).maybeSingle():Promise.resolve({data:null}),
    s.truck_id?C.db.from('solo_trucks').select('*').eq('id',s.truck_id).maybeSingle():Promise.resolve({data:null}),
    C.db.from('solo_rates').select('*').eq('client_id',s.client_id)]);
  if(s.status!=='open')return signedView(box,s,cl,tp,tk,id);
  wizard(box,s,cl,tp,tk,rates||[],Math.max(1,Math.min(5,Number(stepArg)||Number(sessionStorageGet('rm-step-'+id))||1)));
};
function sessionStorageGet(k){try{return sessionStorage.getItem(k);}catch(e){return null;}}
function sessionStorageSet(k,v){try{sessionStorage.setItem(k,v);}catch(e){}}

function wizard(box,s,cl,tp,tk,rates,step){
  const particular=cl?.kind==='particular';
  const $=x=>document.getElementById(x),uid=C.user.id;
  let sigDirty=false;
  box.innerHTML=`<div class="top"><button class="btn ghost icon-btn" type="button" id="rm-x" aria-label="Cerrar y guardar">${icon('x')}</button>
      <div class="grow"><h1>Remito N.º ${s.remito_number}</h1><p class="hint ell">${esc(cl?.name||'')} · ${esc(tp?.name||'Servicio')}</p></div><span class="pill wait">En curso</span></div>
    <ol class="rm-steps" aria-label="Progreso del remito">${STEPS.map((l,i)=>`<li data-i="${i+1}"><span class="rm-num">${i+1}</span><span class="rm-label">${l}</span></li>`).join('')}</ol>
    <div class="rm-counter hint" aria-live="polite"></div>
    <div id="rm-panels">
      <section class="rm-panel card" data-step="1" aria-label="Paso 1: Servicio">
        <!-- El N.º de remito lo pone el sistema: no se escribe. -->
        <div class="rm-group"><span class="rm-glabel">${icon('car')} Vehículo</span>
          <div class="grid2"><div class="field"><label for="r-plate">Patente</label><input id="r-plate" placeholder="AB 123 CD" value="${esc(s.plate||'')}"></div>
          <div class="field"><label for="r-mm">Marca y modelo</label><input id="r-mm" placeholder="Ford Focus" value="${esc(s.make_model||'')}"></div></div></div>
        <div class="rm-group"><span class="rm-glabel">${icon('route')} Recorrido</span>
          <div class="route"><div class="route-ends"><div class="field"><label for="r-orig">Desde</label><input id="r-orig" placeholder="Ciudad / dirección" value="${esc(s.origin||'')}"></div>
            <div class="field"><label for="r-dest">Hasta</label><input id="r-dest" placeholder="Ciudad / dirección" value="${esc(s.destination||'')}"></div></div>
            <div class="field route-km"><label for="r-km">Km</label><input id="r-km" placeholder="0" value="${s.km??''}"></div></div></div>
        <div class="rm-group"><span class="rm-glabel">${icon('calendar')} Servicio</span>
          <div class="grid2"><div class="field ${particular?'span2':''}"><label for="r-date">Fecha y hora</label><input id="r-date" type="datetime-local" value="${localDT(new Date(s.service_date))}"></div>
          ${particular?'':`<div class="field"><label for="r-order">N.º de servicio</label><input id="r-order" placeholder="De la prestadora" value="${esc(s.provider_order||'')}"></div>`}</div></div>
      </section>
      <section class="rm-panel card" data-step="2" aria-label="Paso 2: Socio" hidden>
        <div class="rm-group"><span class="rm-glabel">${icon('user')} Quién recibe el servicio</span>
          <div class="field"><label for="r-cname">Nombre y apellido</label><input id="r-cname" placeholder="Nombre completo" autocomplete="off" value="${esc(s.customer_name||'')}"></div>
          <div class="field"><label for="r-cdoc">DNI / CUIT</label><input id="r-cdoc" inputmode="numeric" placeholder="Ej.: 28.456.112" value="${esc(s.customer_doc||'')}"></div></div>
        <div class="rm-group"><span class="rm-glabel">${icon('phone')} Contacto <small>teléfono y/o email</small></span>
          <div class="field"><label for="r-cphone">Teléfono</label><input id="r-cphone" type="tel" inputmode="tel" placeholder="11 2345 6789 · sin 0 ni 15" value="${esc(s.customer_phone||'')}"></div>
          <div class="field"><label for="r-cemail">Email</label><input id="r-cemail" type="email" inputmode="email" autocapitalize="none" spellcheck="false" placeholder="Para mandarle el remito" value="${esc(s.customer_email||'')}"></div></div>
      </section>
      <section class="rm-panel card" data-step="3" aria-label="Paso 3: Adicionales" hidden>
        <div class="rm-group"><span class="rm-glabel">${icon('plus')} Adicionales <small>${particular?'se suman al precio':'los paga el socio en el lugar'}</small></span>
          <div class="add-grid">${[['r-tolls','Peajes','route',extraOf(s,'Peajes')],['r-exc','Excedente km','gauge',extraOf(s,'Excedente')],['r-wait','Espera / maniobras','clock',extraOf(s,'Espera')],['r-other','Otros','ellipsis',Number(s.other_amount)]]
            .map(([id,l,ic,v])=>`<label class="add-tile" for="${id}"><span class="add-name">${icon(ic)}${l}</span><span class="add-in"><i>$</i><input id="${id}" inputmode="decimal" placeholder="0" value="${v||''}"></span></label>`).join('')}</div></div>
        <div id="r-total" class="total-card"></div>
        <div class="rm-group" id="r-pay"><span class="rm-glabel">${icon('wallet')} <span id="r-pay-title">Cobro</span> <small id="r-pay-hint"></small></span>
          <input type="hidden" id="r-p1m" value="${esc(s.payment_1_method||'')}">
          <div class="pay-chips" id="r-p1chips" role="radiogroup" aria-label="Medio de pago">${Object.entries(PAY).map(([k,l])=>`<button type="button" class="pay-chip" data-m="${k}" role="radio">${icon(PAY_ICON[k])}<span>${l}</span></button>`).join('')}
            <button type="button" class="pay-chip pay-two" id="r-mixed-add">${icon('plus')}<span>Dos medios</span></button></div>
          <input type="checkbox" id="r-mixed" hidden ${s.payment_2_method?'checked':''}>
          <div id="r-p2" class="pay-second" ${s.payment_2_method?'':'hidden'}><input type="hidden" id="r-p2m" value="${esc(s.payment_2_method||'')}">
            <div class="row"><span class="hint">Segundo medio</span><button class="link" type="button" id="r-mixed-del">Quitar</button></div>
            <div class="pay-chips small" id="r-p2chips" role="radiogroup" aria-label="Segundo medio de pago">${Object.entries(PAY).map(([k,l])=>`<button type="button" class="pay-chip" data-m="${k}" role="radio">${icon(PAY_ICON[k])}<span>${l}</span></button>`).join('')}</div>
            <!-- Los montos por medio aparecen solo con dos medios; con uno, se cobra el total. -->
            <div class="pay-row"><div class="field"><label for="r-p1a">En <span id="r-p1lbl"></span> $</label><input id="r-p1a" value="${s.payment_2_method?(s.payment_1_amount??''):''}"></div>
              <div class="field"><label for="r-p2a">En <span id="r-p2lbl"></span> $</label><input id="r-p2a" value="${s.payment_2_amount??''}"></div></div></div>
          <p id="r-pay-err" class="err" hidden></p></div>
      </section>
      <section class="rm-panel card" data-step="4" aria-label="Paso 4: Evidencia" hidden>
        <span class="rm-glabel">${icon('camera')} Fotos del vehículo <small>antes de cargarlo</small></span>
        <div class="slots">${SLOTS.map(([k,l])=>`<label class="slot" data-slot="${k}"><input type="file" accept="image/*" capture="environment" hidden data-slot-in="${k}"><span class="slot-img"></span><span class="slot-label">${l}</span></label>`).join('')}</div>
        <div class="field"><label for="r-obs">Observaciones</label><input id="r-obs" placeholder="Clima, demoras, estado del vehículo…" value="${esc(s.notes||'')}"></div>
      </section>
      <section class="rm-panel card sign-panel" data-step="5" aria-label="Paso 5: Firma" hidden>
        <div class="sig-state" id="r-sig-state" role="status" aria-live="polite"></div>
        <div class="conf-area">
          <div class="conf-grid">${CONF.map(([k,t,d,req,short])=>`<label class="conf" title="${esc(t+': '+d)}"><input type="checkbox" id="r-${k}" ${req?'checked data-req="1"':''}><span class="conf-box">${icon('check')}</span><span class="conf-t">${short}${req?'':' <small>opcional</small>'}</span></label>`).join('')}</div>
          <label class="conf wide"><input type="checkbox" id="r-absent"><span class="conf-box">${icon('check')}</span><span class="conf-t">Socio ausente (firma el chofer)</span></label>
        </div>
        <div class="pad-wrap">
          <div class="pad-head"><span class="pad-title" id="r-sig-title">Firma del socio</span><span class="pad-status" id="pad-status"><i></i><span>Sin firma</span></span><button class="pad-clear" type="button" id="clr">${icon('trash-2')} Limpiar</button></div>
          <canvas id="pad" tabindex="0" width="600" height="300" aria-label="Espacio para firmar"></canvas><span class="pad-hint" id="pad-hint">Dibujá con el dedo</span>
          <div class="pad-foot"><div class="field"><label for="r-sn">Aclaración</label><input id="r-sn" value="${esc(s.signer_name||s.customer_name||'')}"></div><div class="field"><label for="r-sd">DNI</label><input id="r-sd" inputmode="numeric" value="${esc(s.signer_doc||s.customer_doc||'')}"></div></div>
        </div>
        <p id="r-sig-err" class="err" hidden></p>
      </section>
    </div>
    <div class="rm-footer"><button class="btn" type="button" id="r-back">${icon('chevron-left')} Atrás</button><button class="btn ghost" type="button" id="r-later">Guardar y seguir después</button><button class="btn pri" type="button" id="r-next">Siguiente ${icon('chevron-right')}</button></div>`;

  // ── Precio: base de la tarifa + km excedentes + adicionales ──
  const rate=()=>particular?null:rateForAt(rates,s.client_id,s.service_type_id,new Date($('r-date').value||s.service_date));
  function totals(){const km=num($('r-km').value),r=rate(),p=particular?{base:Number(s.base_amount)||0,kmAmount:0}:priceOf(r,km);
    const tolls=num($('r-tolls').value),exc=num($('r-exc').value),wait=num($('r-wait').value),other=num($('r-other').value);
    return {km,r,base:p.base,kmAmount:p.kmAmount,tolls,exc,wait,other,extras:tolls+exc+wait+other,total:p.base+p.kmAmount+tolls+exc+wait+other};}
  // Con prestadora: base + km se le facturan a la empresa (plazo de pago y tarifa); los adicionales los paga el socio acá.
  // Con particular: paga todo en el lugar.
  const owed=t=>particular?t.total:t.extras;
  function paintTotal(){const t=totals();
    const parts=[['Peajes',t.tolls],['Excedente km',t.exc],['Espera',t.wait],['Otros',t.other]].filter(x=>x[1]);
    $('r-total').innerHTML=particular
      ?`<div class="total-main"><span>Total a cobrar</span><b class="num total-pop">${money(t.total)}</b></div>
        <div class="total-parts"><span>Acordado <b class="num">${money(t.base)}</b></span>${parts.map(([l,v])=>`<i>+</i><span>${l} <b class="num">${money(v)}</b></span>`).join('')}</div>`
      :`<div class="total-main"><span>${icon('user')} Paga el socio</span><b class="num total-pop">${money(t.extras)}</b></div>
        <div class="total-parts">${parts.length?parts.map(([l,v])=>`<span>${l} <b class="num">${money(v)}</b></span>`).join('<i>+</i>'):'<span>Sin adicionales: el socio no paga nada en el lugar.</span>'}</div>`;
    const o=owed(t);$('r-pay').hidden=o<=0;
    $('r-pay-title').textContent=particular?'Cómo pagó el cliente':'Cómo pagó el socio';$('r-pay-hint').textContent=o>0?money(o):'';
    if(o<=0){$('r-p1m').value='';$('r-mixed').checked=false;$('r-p2m').value='';}
    payUI();}
  ['r-km','r-tolls','r-exc','r-wait','r-other','r-date'].forEach(x=>$(x).addEventListener('input',paintTotal));
  // ── Medio de pago con botones (el valor queda en r-p1m / r-p2m) ──
  function payUI(){const m1=$('r-p1m').value,mixed=$('r-mixed').checked&&!!m1,m2=$('r-p2m').value;
    $('r-p1chips').querySelectorAll('[data-m]').forEach(b=>b.setAttribute('aria-checked',String(!!m1&&b.dataset.m===m1)));
    $('r-mixed').checked=mixed;$('r-p2').hidden=!mixed;$('r-p1chips').classList.toggle('small',mixed);$('r-mixed-add').hidden=mixed;$('r-mixed-add').disabled=!m1;
    $('r-p1lbl').textContent=(PAY[m1]||'').toLowerCase();$('r-p2lbl').textContent=(PAY[m2]||'el segundo medio').toLowerCase();
    $('r-p2chips').querySelectorAll('[data-m]').forEach(b=>{b.disabled=b.dataset.m===m1;b.setAttribute('aria-checked',String(b.dataset.m===m2&&m2!==m1));});}
  $('r-p1chips').querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{$('r-p1m').value=b.dataset.m;UI().haptic(6);
    if(b.dataset.m===$('r-p2m').value)$('r-p2m').value='';payUI();$('r-pay-err').hidden=true;});
  $('r-p2chips').querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{$('r-p2m').value=b.dataset.m;UI().haptic(6);payUI();$('r-pay-err').hidden=true;setTimeout(()=>$('r-p1a').focus({preventScroll:true}),40);});
  $('r-mixed-add').onclick=()=>{if(!$('r-p1m').value)return;$('r-mixed').checked=true;payUI();};
  $('r-mixed-del').onclick=()=>{$('r-mixed').checked=false;$('r-p2m').value='';$('r-p1a').value='';$('r-p2a').value='';payUI();};

  // ── Validación de cada paso (misma lógica que Flota) ──
  function validate(n){const panel=box.querySelector(`.rm-panel[data-step="${n}"]`);
    if(!UI().validateForm(panel))return false;
    if(n===3){const er=$('r-pay-err');er.hidden=true;const t=totals(),o=owed(t);const m1=$('r-p1m').value,mixed=$('r-mixed').checked;
      const fail=msg=>{er.textContent=msg;er.hidden=false;UI().haptic([20,40,20]);return false;};
      if(t.total<=0)return fail('El total del servicio no puede ser cero.');
      if(o>0&&!m1)return fail(particular?'Elegí cómo pagó el cliente.':'Elegí cómo pagó el socio los adicionales.');
      if(mixed){const a1=num($('r-p1a').value),a2=num($('r-p2a').value);
        if(!$('r-p2m').value||$('r-p2m').value===m1)return fail('Elegí el segundo medio de pago (distinto del primero).');
        if(a1<=0||a2<=0)return fail('Poné cuánto pagó con cada medio.');
        if(Math.round(a1+a2)!==Math.round(o))return fail('Los dos medios suman '+money(a1+a2)+' y hay que cobrar '+money(o)+'.');}}
    if(n===5){const er=$('r-sig-err');er.hidden=true;const absent=$('r-absent').checked;
      const missing=CONF.filter(c=>c[3]&&!$('r-'+c[0]).checked);
      // Mismos avisos que en Flota: primero las conformidades, después la firma.
      if(!absent&&missing.length){er.textContent='Faltan confirmaciones: '+missing.map(c=>c[1].toLowerCase()).join(', ')+'.';er.hidden=false;sigState(true);UI().haptic([20,40,20]);return false;}
      if(!sigDirty){er.textContent=absent?'Falta la firma del chofer.':'Falta la firma del socio.';er.hidden=false;$('pad').classList.add('pad-err');sigState(true);UI().haptic([20,40,20]);return false;}}
    return true;}
  function patchFor(n){const t=totals();
    if(n===1)return {service_date:new Date($('r-date').value||s.service_date).toISOString(),provider_order:$('r-order')?($('r-order').value.trim()||null):null,plate:$('r-plate').value.trim().toUpperCase()||null,make_model:$('r-mm').value.trim()||null,origin:$('r-orig').value.trim()||null,destination:$('r-dest').value.trim()||null,km:t.km||null,base_amount:t.base,km_amount:t.kmAmount,total:t.total};
    if(n===2)return {customer_name:$('r-cname').value.trim()||null,customer_doc:$('r-cdoc').value.trim()||null,customer_phone:$('r-cphone').value.trim()||null,customer_email:$('r-cemail').value.trim()||null};
    if(n===3){const o=owed(t),m1=o>0?($('r-p1m').value||null):null,mixed=!!m1&&$('r-mixed').checked;return {extras:[['Peajes',t.tolls],['Excedente',t.exc],['Espera',t.wait]].filter(x=>x[1]).map(([name,amount])=>({name,amount})),tolls:t.tolls?[{name:'Peajes',amount:t.tolls}]:[],
      other_amount:t.other,extras_amount:t.extras,base_amount:t.base,km_amount:t.kmAmount,total:t.total,payment_1_method:m1,payment_1_amount:m1?(mixed?num($('r-p1a').value):o):null,
      payment_2_method:mixed?$('r-p2m').value:null,payment_2_amount:mixed?num($('r-p2a').value):null};}
    if(n===4)return {notes:$('r-obs').value.trim()||null};
    return {};}
  async function save(n){const patch=patchFor(n);if(!Object.keys(patch).length)return true;const {error}=await C.db.from('solo_services').update(patch).eq('id',s.id);
    if(error){toast(errText(error));return false;}Object.assign(s,patch);return true;}

  // ── Navegación entre pasos con progreso animado ──
  let current=0;
  function show(n,dir){const prev=current;current=n;sessionStorageSet('rm-step-'+s.id,String(n));
    box.querySelectorAll('.rm-panel').forEach(p=>{const on=Number(p.dataset.step)===n;p.hidden=!on;if(on&&prev){p.classList.remove('slide-l','slide-r');void p.offsetWidth;p.classList.add(dir<0?'slide-r':'slide-l');}});
    box.querySelectorAll('.rm-steps li').forEach(li=>{const i=Number(li.dataset.i);li.classList.toggle('is-done',i<n);li.classList.toggle('is-current',i===n);li.toggleAttribute('aria-current',i===n);if(i===n)li.setAttribute('aria-current','step');
      li.querySelector('.rm-num').textContent=i<n?'✓':i;});
    box.querySelector('.rm-counter').textContent='Paso '+n+' de 5 · '+STEPS[n-1];
    $('r-back').hidden=n===1;$('r-later').hidden=n!==1;$('r-next').innerHTML=n===5?icon('check')+' Finalizar':'Siguiente '+icon('chevron-right');
    if(n===3)paintTotal();if(n===4)paintSlots();if(n===5){if(!$('r-absent').checked){if(!$('r-sn').value.trim())$('r-sn').value=s.customer_name||'';if(!$('r-sd').value.trim())$('r-sd').value=s.customer_doc||'';}initPad();sigState();}
    if(prev)$('rm-panels').scrollTop=0;}
  $('r-back').onclick=()=>{if(current>1)show(current-1,-1);};
  // Cerrar guarda lo que haya en el paso actual (sin exigir que esté completo) y vuelve a Servicios.
  $('rm-x').onclick=async()=>{await save(current);toast('Remito guardado. Seguilo cuando quieras desde Servicios.');go('servicios');};
  $('r-later').onclick=async()=>{if(!UI().validateForm(box.querySelector('.rm-panel[data-step="1"]')))return;if(await save(1)){toast('Remito guardado. Seguilo cuando quieras desde Servicios.');go('servicios');}};
  $('r-next').onclick=async()=>{const b=$('r-next');if(b.disabled)return;if(!validate(current))return;b.disabled=true;
    try{if(!(await save(current)))return;if(current<5){show(current+1,1);UI().haptic(8);}else await finish();}finally{b.disabled=false;}};

  // ── Paso 4: fotos por posición ──
  async function paintSlots(){const paths=s.photos||[];const urls={};
    if(paths.length){const {data}=await C.db.storage.from('solo_files').createSignedUrls(paths,3600);(data||[]).forEach((u,i)=>{const k=(paths[i].match(/\/([a-z0-9]+)-\d+\.jpg$/)||[])[1];if(k)urls[k]=u.signedUrl;});}
    box.querySelectorAll('.slot').forEach(sl=>{const u=urls[sl.dataset.slot];sl.classList.toggle('has',!!u);sl.querySelector('.slot-img').style.backgroundImage=u?`url("${u}")`:'';});}
  box.querySelectorAll('[data-slot-in]').forEach(inp=>inp.addEventListener('change',async()=>{const f=inp.files[0];if(!f)return;const k=inp.dataset.slotIn,sl=inp.closest('.slot');sl.classList.add('loading');
    const path=uid+'/services/'+s.id+'/'+k+'-'+Date.now()+'.jpg';const {error}=await C.db.storage.from('solo_files').upload(path,await shrink(f),{contentType:'image/jpeg'});
    if(error){sl.classList.remove('loading');return toast(errText(error));}
    const paths=(s.photos||[]).filter(p=>!new RegExp('/'+k+'-\\d+\\.jpg$').test(p)).concat(path);
    const up=await C.db.from('solo_services').update({photos:paths}).eq('id',s.id);sl.classList.remove('loading');if(up.error)return toast(errText(up.error));
    s.photos=paths;paintSlots();UI().success();}));

  // ── Paso 5: conformidades y firma con el dedo, con el estado siempre a la vista ──
  function sigState(strong){const absent=$('r-absent').checked,missing=CONF.filter(c=>c[3]&&!$('r-'+c[0]).checked),name=$('r-sn').value.trim();
    const st=!absent&&missing.length?['warn','circle-alert','Faltan conformidades',missing.map(c=>c[4].toLowerCase()).join(', ')]
      :!sigDirty?['warn','signature',absent?'Falta la firma del chofer':'Falta la firma del socio','Que firme en el recuadro blanco']
      :name.length<2?['warn','pencil','Falta la aclaración','Nombre de quien firma']
      :['ok','circle-check','Listo para finalizar',absent?'Firma el chofer · socio ausente':'Firmado por '+name];
    const el=$('r-sig-state');el.dataset.state=st[0];el.classList.toggle('strong',!!strong&&st[0]!=='ok');
    el.innerHTML=`${icon(st[1])}<span><b>${esc(st[2])}</b><small>${esc(st[3])}</small></span>`;
    $('pad-status').dataset.on=String(sigDirty);$('pad-status').querySelector('span').textContent=sigDirty?'Firma registrada':'Sin firma';
    $('r-sig-title').textContent=absent?'Firma del chofer':'Firma del socio';
    $('r-next').classList.toggle('ready',st[0]==='ok');}
  box.querySelectorAll('.conf input').forEach(x=>x.addEventListener('change',()=>{UI().haptic(6);$('r-sig-err').hidden=true;sigState();}));
  ['r-sn','r-sd'].forEach(x=>$(x).addEventListener('input',()=>sigState()));
  $('r-absent').addEventListener('change',()=>{if($('r-absent').checked){$('r-sn').value=C.profile.full_name;$('r-sd').value='';}else{$('r-sn').value=s.customer_name||'';$('r-sd').value=s.customer_doc||'';}sigState();});
  let padReady=false;
  function initPad(){if(padReady)return;padReady=true;const pad=$('pad');
    // El lienzo toma el tamaño real del recuadro (60% de la pantalla) para que el trazo no se deforme.
    const r0=pad.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);if(r0.width>0&&r0.height>0){pad.width=Math.round(r0.width*dpr);pad.height=Math.round(r0.height*dpr);}
    const ctx=pad.getContext('2d');let drawing=false;ctx.lineWidth=2.6*dpr;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#111';
    const pos=e=>{const r=pad.getBoundingClientRect();return [(e.clientX-r.left)*pad.width/r.width,(e.clientY-r.top)*pad.height/r.height];};
    pad.addEventListener('pointerdown',e=>{drawing=true;if(!sigDirty){sigDirty=true;$('pad-hint').hidden=true;pad.classList.remove('pad-err');$('r-sig-err').hidden=true;}pad.setPointerCapture(e.pointerId);const [x,y]=pos(e);ctx.beginPath();ctx.moveTo(x,y);});
    pad.addEventListener('pointermove',e=>{if(!drawing)return;const [x,y]=pos(e);ctx.lineTo(x,y);ctx.stroke();});
    ['pointerup','pointercancel'].forEach(t=>pad.addEventListener(t,()=>{if(drawing){drawing=false;sigState();}}));
    $('clr').onclick=()=>{ctx.clearRect(0,0,pad.width,pad.height);sigDirty=false;$('pad-hint').hidden=false;sigState();};}
  async function finish(){const pad=$('pad'),er=$('r-sig-err');
    const blob=await new Promise(r=>pad.toBlob(r,'image/png'));const path=uid+'/signatures/'+s.id+'.png';
    const up=await C.db.storage.from('solo_files').upload(path,blob,{contentType:'image/png',upsert:true});
    if(up.error){er.textContent=errText(up.error);er.hidden=false;return;}
    const absent=$('r-absent').checked,now=new Date().toISOString();
    const patch={status:'signed',signed_at:now,signature_path:path,signer_name:$('r-sn').value.trim()||null,signer_doc:$('r-sd').value.trim()||null,customer_present:!absent};
    CONF.forEach(([k])=>{patch[k]=$('r-'+k).checked;});
    const paidHere=(Number(s.payment_1_amount)||0)+(Number(s.payment_2_amount)||0);if(particular&&paidHere>=Number(s.total))patch.paid_at=now;
    const {error}=await C.db.from('solo_services').update(patch).eq('id',s.id);if(error){er.textContent=errText(error);er.hidden=false;return;}
    try{sessionStorage.removeItem('rm-step-'+s.id);}catch(e){}
    Object.assign(s,patch);UI().success();doneView(box,s,cl,tp,tk);}
  show(step,1);
}
/* ── Remito terminado: confirmación y, abajo, la opción de enviarlo ── */
function doneView(box,s,cl,tp,tk){
  const particular=cl?.kind==='particular',here=(Number(s.payment_1_amount)||0)+(Number(s.payment_2_amount)||0);
  const ex=n=>extraOf(s,n),pays=s.payment_1_method?PAY[s.payment_1_method]+(s.payment_2_method?' + '+PAY[s.payment_2_method]:''):'';
  const line=(l,v,cls='')=>`<div class="dl-row ${cls}"><span>${l}</span><b class="num">${v}</b></div>`;
  const kmEx=Number(s.km_amount)?line('Km excedentes'+(s.km?' ('+esc(s.km)+' km)':''),money(s.km_amount)):'';
  box.innerHTML=`<div class="done" role="status">
      <div class="done-mark" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg></div>
      <h1>Remito creado exitosamente</h1>
      <div class="done-id">${s.plate?`<span class="plate">${esc(s.plate)}</span>`:''}${!particular&&s.provider_order?`<span class="done-chip">N.º ${esc(s.provider_order)}</span>`:''}<span class="done-chip">${icon(particular?'user':'building-2')} ${esc(particular?'Particular':cl?.name||'Prestadora')}</span></div>
      <p class="hint">Remito N.º ${s.remito_number} · ${esc(tp?.name||'Servicio')}</p>
      <div class="card tight done-card" aria-label="Desglose del servicio">
        ${line(particular?'Precio acordado':'Base',money(s.base_amount))}${kmEx}
        ${ex('Peajes')?line('Peajes',money(ex('Peajes'))):''}${ex('Excedente')?line('Excedente km',money(ex('Excedente'))):''}${ex('Espera')?line('Espera / maniobras',money(ex('Espera'))):''}${Number(s.other_amount)?line('Otros',money(s.other_amount)):''}
        ${line('Total del servicio',money(s.total),'dl-total')}
        ${here?line((particular?'Pagó el cliente':'Pagó el socio')+(pays?' · '+esc(pays):''),money(here),'dl-paid'):''}
        ${particular?'':line('A facturar a '+esc(cl?.name||'la prestadora'),money(Math.max(0,Number(s.total)-here)),'dl-bill')}
      </div>
    </div>
    <div class="done-actions"><button class="btn pri block" type="button" id="share">${icon('share-2')} Enviar remito (PDF)</button>
      <div class="split"><button class="btn" type="button" id="see">${icon('file-text')} Ver remito</button><button class="btn" type="button" id="fin">${icon('check')} Listo</button></div></div>`;
  document.getElementById('share').onclick=()=>sharePdf(s,cl,tp,tk);
  document.getElementById('see').onclick=()=>views.servicio(s.id);
  document.getElementById('fin').onclick=()=>go('servicios');
}
function rateForAt(rates,clientId,typeId,when){return rateFor(rates,clientId,typeId,when);}

/* ── Remito firmado: resumen, cobro y envío ── */
function signedView(box,s,cl,tp,tk,id){
  const cancelled=s.status==='cancelled',particular=cl?.kind==='particular';
  const paidHere=(Number(s.payment_1_amount)||0)+(Number(s.payment_2_amount)||0),bill=Math.max(0,Number(s.total)-(particular?0:paidHere));
  const pays=s.payment_1_method?PAY[s.payment_1_method]+(s.payment_2_method?` ${money(s.payment_1_amount)} + ${PAY[s.payment_2_method]} ${money(s.payment_2_amount)}`:''):'';
  const tel=String(s.customer_phone||'').replace(/\D/g,'');
  const row=(l,v,cls='')=>v?`<div class="rv-row ${cls}"><span>${l}</span><b>${v}</b></div>`:'';
  box.innerHTML=`<div class="top"><button class="btn ghost icon-btn" type="button" id="rm-x" aria-label="Volver a Servicios">${icon('arrow-left')}</button>
      <div class="grow"><h1>Remito N.º ${s.remito_number}</h1><p class="hint ell">${esc(cl?.name||'')} · ${esc(tp?.name||'Servicio')} · ${esc(fmtDate(s.service_date))}</p></div>${cancelled?'<span class="pill muted">Anulado</span>':'<span class="pill ok">Firmado</span>'}</div>
    <div class="fill stack rv">
      <section class="rv-card" aria-label="Servicio">
        <span class="rm-glabel">${icon('truck')} Servicio</span>
        ${particular?'':row('N.º de servicio',s.provider_order?`<span class="num">${esc(s.provider_order)}</span>`:'<span class="hint">Sin número</span>','rv-lead')}
        <div class="rv-vehicle">${s.plate?`<span class="plate big">${esc(s.plate)}</span>`:''}<span class="rv-vname">${esc(s.make_model||'Vehículo sin datos')}</span></div>
        <div class="rv-route"><div><i class="a"></i><span>${esc(s.origin||'—')}</span></div><div><i class="b"></i><span>${esc(s.destination||'—')}</span></div>${s.km?`<em class="num">${esc(s.km)} km</em>`:''}</div>
      </section>
      <section class="rv-card" aria-label="Cliente">
        <span class="rm-glabel">${icon('user')} Cliente</span>
        <div class="rv-name">${esc(s.customer_name||'Sin nombre')}${s.customer_doc?`<small>DNI / CUIT ${esc(s.customer_doc)}</small>`:''}</div>
        ${tel||s.customer_email?`<div class="rv-contact">${tel?`<a class="btn" href="tel:${esc(tel)}">${icon('phone')} ${esc(s.customer_phone)}</a>`:''}${s.customer_email?`<a class="btn ell" href="mailto:${esc(s.customer_email)}">${icon('link')} ${esc(s.customer_email)}</a>`:''}</div>`:'<p class="hint">Sin contacto cargado.</p>'}
      </section>
      <section class="rv-card" aria-label="Importes">
        <span class="rm-glabel">${icon('receipt')} Importes</span>
        ${row(particular?'Precio acordado':'Base',`<span class="num">${money(s.base_amount)}</span>`)}${Number(s.km_amount)?row('Km excedentes',`<span class="num">${money(s.km_amount)}</span>`):''}${Number(s.extras_amount)?row('Adicionales',`<span class="num">${money(s.extras_amount)}</span>`):''}
        <div class="rv-row rv-total"><span>Total</span><b class="num">${money(s.total)}</b></div>
        ${particular?row('Pagó',esc(pays||'—')):`${row('Se factura a '+esc(cl?.name||'la prestadora'),`<span class="num">${money(bill)}</span>`)}${paidHere?row('El socio pagó los adicionales',esc(pays)+(s.payment_2_method?'':' '+money(paidHere))):''}`}
        ${cancelled?'':`<div class="rv-pay"><span class="pill ${s.paid_at?'ok':'wait'}">${s.paid_at?'Cobrado '+esc(fmtDate(s.paid_at).split(' ')[0]):particular?'Sin cobrar':'Pago pendiente'}</span><button class="link" type="button" id="paid">${s.paid_at?'Marcar no cobrado':'Marcar cobrado'}</button></div>`}
      </section>
      <section class="rv-card rv-evidence" aria-label="Firma y fotos">
        <div class="rv-sigbox"><span class="rm-glabel">${icon('signature')} Firma</span><img id="sig-img" alt="Firma" class="rv-sig">
          <small class="hint ell">${esc(s.signer_name||'')}${s.customer_present===false?' (chofer)':''}</small></div>
        <div><span class="rm-glabel">${icon('camera')} Fotos</span><div id="ph" class="rv-photos"></div></div>
      </section>
    </div>
    ${cancelled?'':`<button class="btn pri block" type="button" id="share">${icon('share-2')} Enviar remito (PDF)</button>`}`;
  const $=x=>document.getElementById(x);
  $('rm-x').onclick=()=>go('servicios');
  (async()=>{const paths=s.photos||[];if(!paths.length){$('ph').innerHTML='<p class="hint">Sin fotos.</p>';return;}const {data}=await C.db.storage.from('solo_files').createSignedUrls(paths,3600);
    if($('ph'))$('ph').innerHTML=(data||[]).map(u=>`<img src="${esc(u.signedUrl)}" alt="Foto del vehículo">`).join('');})();
  if(s.signature_path)C.db.storage.from('solo_files').createSignedUrl(s.signature_path,3600).then(({data})=>{if(data&&$('sig-img'))$('sig-img').src=data.signedUrl;});
  if(cancelled)return;
  $('paid').onclick=async()=>{const {error}=await C.db.from('solo_services').update({paid_at:s.paid_at?null:new Date().toISOString()}).eq('id',s.id);toast(error?errText(error):s.paid_at?'Marcado como no cobrado':'Marcado como cobrado');if(!error){UI().success();views.servicio(id);}};
  $('share').onclick=()=>sharePdf(s,cl,tp,tk);
}

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
  if(s.payment_1_method){const pp=PAY[s.payment_1_method]+' '+money(s.payment_1_amount)+(s.payment_2_method?' + '+PAY[s.payment_2_method]+' '+money(s.payment_2_amount):'');
    t((cl?.kind==='particular'?'Pagó: ':'Adicionales pagados por el socio: ')+pp,15,10);y+=7;}
  if(cl?.kind!=='particular'){const here=(Number(s.payment_1_amount)||0)+(Number(s.payment_2_amount)||0);t('Se factura a '+(cl?.name||'la prestadora')+': '+money(Math.max(0,Number(s.total)-here)),15,10,true);y+=7;}
  const conf=[['conf_service','servicio'],['conf_charges','cargos'],['conf_tow','arrastre']].filter(([k])=>s[k]).map(([,l])=>l);
  if(conf.length){t('Conforme con: '+conf.join(', ')+(s.no_damage?' · sin daños nuevos':''),15,10);y+=7;}
  if(s.notes){t('Observaciones: '+s.notes,15,10);y+=7;}
  if(s.signature_path){const {data}=await C.db.storage.from('solo_files').download(s.signature_path);if(data){const url=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(data);});doc.addImage(url,'PNG',15,y,80,30);y+=33;}}
  t('Firma: '+(s.signer_name||'')+(s.signer_doc?' · DNI '+s.signer_doc:''),15,10);
  const blob=doc.output('blob'),file=new File([blob],'remito-'+s.remito_number+'.pdf',{type:'application/pdf'});
  if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:'Remito N.º '+s.remito_number});return;}catch(e){if(e.name==='AbortError')return;}}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file.name;document.body.appendChild(a);a.click();a.remove();toast('PDF descargado');
}

/* ── Gastos: cuánto gastaste en el mes, en qué y cada movimiento; el alta va en su propia pantalla ── */
const CAT_ICON={Combustible:'fuel',Taller:'wrench',Repuestos:'package',Cubiertas:'disc',Peajes:'route',Comida:'receipt',Lavado:'refresh-cw',
  Seguro:'shield-check',Patente:'file-text',Monotributo:'receipt',VTV:'clipboard-check','GPS / celular':'phone','Cuota de la grúa':'truck',Otro:'ellipsis'};
const catIcon=c=>icon(CAT_ICON[c]||'receipt');
const dayLabel=iso=>{const t=isoDate(new Date()),y=isoDate(new Date(Date.now()-864e5));if(iso===t)return 'Hoy';if(iso===y)return 'Ayer';
  return new Date(iso+'T12:00:00').toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'numeric'}).replace(/^./,c=>c.toUpperCase());};
views.gastos=async function(mode){
  if(String(mode||'').startsWith('nuevo'))return gastoNuevo(mode==='nuevo-fijo'?'fixed':'variable');
  if(String(mode||'').startsWith('ver-'))return gastoVer(String(mode).slice(4));
  const tab=['movimientos','fijo'].includes(mode)?mode:'categorias';
  const mName=monthName(C.month).split(' ')[0].toLowerCase();
  shell(`<div class="top"><h1 class="grow">Gastos</h1>
      <div class="mnav"><button class="btn ghost icon-btn" type="button" id="m-prev" aria-label="Mes anterior">${icon('chevron-left')}</button><span class="mnav-t">${esc(monthName(C.month))}</span><button class="btn ghost icon-btn" type="button" id="m-next" aria-label="Mes siguiente">${icon('chevron-right')}</button></div></div>
    <section class="ex-hero" aria-label="Total gastado">
      <span class="ex-label">Gastaste en ${esc(mName)}</span>
      <b class="ex-total num" id="ex-total">$ 0</b>
      <div class="ex-split"><span><i class="dot var"></i>Del día <b class="num" id="ex-var">…</b></span><span><i class="dot fix"></i>Fijos del mes <b class="num" id="ex-fix">…</b></span></div>
      <div class="ex-bar" aria-hidden="true"><i class="var" id="ex-bv"></i><i class="fix" id="ex-bf"></i></div>
    </section>
    <div class="seg" role="group" aria-label="Qué ver">${[['categorias','En qué'],['movimientos','Movimientos'],['fijo','Fijos']].map(([k,l])=>`<button type="button" data-t="${k}" aria-pressed="${tab===k}">${l}</button>`).join('')}</div>
    <div id="el" class="stack fill">${UI().SKELETON}</div>
    <button class="btn pri block" type="button" id="add">${icon('plus')} Cargar gasto</button>`,'gastos');
  const $=x=>document.getElementById(x);
  $('add').onclick=()=>go(tab==='fijo'?'gastos-nuevo-fijo':'gastos-nuevo');
  $('m-prev').onclick=()=>{const m=C.month;C.month=new Date(m.getFullYear(),m.getMonth()-1,1);views.gastos(mode);};
  $('m-next').onclick=()=>{const m=C.month;C.month=new Date(m.getFullYear(),m.getMonth()+1,1);views.gastos(mode);};
  app().querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>go(b.dataset.t==='categorias'?'gastos':'gastos-'+b.dataset.t));
  const [a,z]=range();
  const [{data:vars,error},{data:fixed}]=await Promise.all([
    C.db.from('solo_expenses').select('*').eq('kind','variable').gte('spent_on',isoDate(a)).lt('spent_on',isoDate(z)).order('spent_on',{ascending:false}).order('created_at',{ascending:false}),
    C.db.from('solo_expenses').select('*').eq('kind','fixed').lt('spent_on',isoDate(z)).order('spent_on',{ascending:false})]);
  const el=$('el');if(!el)return;
  if(error){el.innerHTML='<div class="empty">'+esc(errText(error))+'</div>';return;}
  const endOf=x=>{const d=new Date(x.spent_on+'T00:00:00');d.setMonth(d.getMonth()+x.period_months);return d;};
  const active=(fixed||[]).filter(x=>endOf(x)>a&&(!x.ends_on||x.ends_on>=isoDate(a)));
  const monthly=x=>Number(x.amount)/x.period_months;
  const tv=(vars||[]).reduce((t,x)=>t+Number(x.amount),0),tf=active.reduce((t,x)=>t+monthly(x),0),tt=tv+tf;
  UI().countUp($('ex-total'),tt);$('ex-var').textContent=money(tv);$('ex-fix').textContent=money(tf);
  $('ex-bv').style.flexGrow=tt?tv:1;$('ex-bf').style.flexGrow=tt?tf:0;if(!tt)$('ex-bv').classList.add('none');
  // En qué: una fila por categoría, de mayor a menor, con su parte del total.
  if(tab==='categorias'){
    const by={};(vars||[]).forEach(x=>{const k=x.category;by[k]=by[k]||{c:k,t:0,n:0,fixed:false};by[k].t+=Number(x.amount);by[k].n++;});
    active.forEach(x=>{const k=x.category+'\u0000f';by[k]=by[k]||{c:x.category,t:0,n:0,fixed:true};by[k].t+=monthly(x);by[k].n++;});
    const rows=Object.values(by).sort((p,q)=>q.t-p.t),max=rows[0]?.t||1;
    el.innerHTML=rows.map(r=>`<div class="ex-cat"><span class="ex-ico">${catIcon(r.c)}</span>
        <div class="ex-cat-main"><div class="row"><b class="ell">${esc(r.c)}${r.fixed?' <small class="tag">fijo</small>':''}</b><b class="num">${money(r.t)}</b></div>
        <div class="ex-cat-bar ${r.fixed?'fix':''}"><i style="--w:${Math.max(3,Math.round(r.t/max*100))}%"></i></div>
        <span class="hint">${Math.round(r.t/(tt||1)*100)}% del mes · ${r.n} ${r.fixed?'pago'+(r.n>1?'s':''):'gasto'+(r.n>1?'s':'')}</span></div></div>`).join('')
      ||`<div class="empty">${icon('wallet','empty-ico')}<b>Sin gastos en ${esc(mName)}</b><span>Cargá combustible, taller o peajes en dos toques.</span></div>`;
  }
  // Movimientos: los gastos del día agrupados por fecha; se borran con dos toques.
  if(tab==='movimientos'){
    const days={};(vars||[]).forEach(x=>{(days[x.spent_on]=days[x.spent_on]||[]).push(x);});
    el.innerHTML=Object.entries(days).map(([d,xs])=>`<div class="ex-day"><div class="row ex-day-h"><span>${esc(dayLabel(d))}</span><span class="num">${money(xs.reduce((t,x)=>t+Number(x.amount),0))}</span></div>
      ${xs.map(x=>`<button class="ex-mov" type="button" data-open="${x.id}" aria-label="Ver gasto de ${esc(x.category)} por ${esc(money(x.amount))}"><span class="ex-ico">${catIcon(x.category)}</span><span class="ex-mov-t"><b>${esc(x.category)}</b>${x.notes?`<span class="hint ell">${esc(x.notes)}</span>`:''}</span><b class="num">${money(x.amount)}</b>${x.receipt_path?`<span class="ex-has-rcpt" title="Tiene foto del ticket">${icon('camera')}</span>`:''}${icon('chevron-right','trail')}</button>`).join('')}</div>`).join('')
      ||`<div class="empty">${icon('receipt','empty-ico')}<b>Sin movimientos en ${esc(mName)}</b><span>Los gastos del día aparecen acá, agrupados por fecha.</span></div>`;
  }
  // Fijos: lo que suma por mes y hasta cuándo cubre cada pago.
  if(tab==='fijo'){
    el.innerHTML=active.map(x=>{const end=endOf(x),total=x.period_months,left=Math.max(0,Math.round((end-a)/(30.44*864e5))),used=Math.min(total,Math.max(1,total-left+1));
      return `<button class="ex-fix-row" type="button" data-open="${x.id}" aria-label="Ver gasto fijo ${esc(x.category)}"><span class="ex-ico">${catIcon(x.category)}</span><div class="ex-cat-main"><div class="row"><b class="ell">${esc(x.category)}</b><b class="num">${money(monthly(x))}<small>/mes</small></b></div>
        <div class="ex-cat-bar fix"><i style="--w:${Math.round(used/total*100)}%"></i></div>
        <span class="hint">${money(x.amount)} por ${total} ${total>1?'meses':'mes'} · cubre hasta ${esc(end.toLocaleDateString('es-AR',{month:'short',year:'numeric'}))}</span></div>
        ${x.receipt_path?`<span class="ex-has-rcpt" title="Tiene foto del ticket">${icon('camera')}</span>`:''}${icon('chevron-right','trail')}</button>`;}).join('')
      ||`<div class="empty">${icon('shield-check','empty-ico')}<b>Sin gastos fijos</b><span>Seguro, patente, monotributo: cargalos una vez y se reparten solos por mes.</span></div>`;
  }
  el.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>go('gastos-ver-'+b.dataset.open));
};
// Visor del ticket a pantalla completa; se cierra tocando o con Escape.
async function showReceipt(path){
  const v=document.createElement('div');v.className='viewer';v.setAttribute('role','dialog');v.setAttribute('aria-label','Foto del ticket');
  v.innerHTML=`<button class="btn ghost icon-btn viewer-x" type="button" aria-label="Cerrar">${icon('x')}</button><div class="viewer-img sk"></div>`;document.body.appendChild(v);
  const close=()=>{v.classList.remove('on');setTimeout(()=>v.remove(),200);removeEventListener('keydown',esc_);};const esc_=e=>{if(e.key==='Escape')close();};
  v.onclick=close;addEventListener('keydown',esc_);requestAnimationFrame(()=>v.classList.add('on'));v.querySelector('.viewer-x').focus();
  const {data,error}=await C.db.storage.from('solo_files').createSignedUrl(path,600);
  const box=v.querySelector('.viewer-img');box.classList.remove('sk');
  if(error||!data){box.innerHTML='<p class="hint">No se pudo abrir el ticket.</p>';return;}
  box.innerHTML=`<img src="${esc(data.signedUrl)}" alt="Foto del ticket">`;
}
/* ── Nuevo gasto: teclado propio, categorías a la vista y atajos (repetir, detalle con sugerencias, fecha) ──
   Ideas tomadas de apps abiertas de control de gastos (Cashew): la categoría se recuerda por el detalle,
   los gastos repetidos se cargan de un toque y los fijos avisan antes de vencer. */
function sheet(title,html){
  const w=document.createElement('div');w.className='sheet-wrap';
  w.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-grip" aria-hidden="true"></div><div class="row"><h2>${esc(title)}</h2><button class="btn ghost icon-btn" type="button" data-x aria-label="Cerrar">${icon('x')}</button></div>${html}</div>`;
  document.body.appendChild(w);requestAnimationFrame(()=>w.classList.add('on'));
  const close=()=>{w.classList.remove('on');setTimeout(()=>w.remove(),220);};
  w.addEventListener('click',e=>{if(e.target===w||e.target.closest('[data-x]'))close();});
  return {el:w,close};
}
// Modal de categorías: íconos grandes; devuelve la elegida (o null si se cierra).
function pickCategory(kind,current){return new Promise(res=>{let done=false;
  const sh=sheet('Elegir categoría',`<div class="gx-cats">${CATS[kind].map(c=>`<button class="gx-cat" type="button" data-c="${esc(c)}" aria-pressed="${c===current}">${catIcon(c)}<span>${esc(c)}</span></button>`).join('')}</div>`);
  sh.el.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{done=true;sh.close();res(b.dataset.c);});
  new MutationObserver((m,o)=>{if(!document.body.contains(sh.el)){o.disconnect();if(!done)res(null);}}).observe(document.body,{childList:true});
  setTimeout(()=>sh.el.querySelector('[aria-pressed="true"],[data-c]')?.focus(),80);});}
// Confirmación antes de borrar o de guardar cambios.
function confirmBox(title,body,okLabel,danger){return new Promise(res=>{let done=false;
  const sh=sheet(title,`<div class="confirm-body">${body}</div><div class="split"><button class="btn" type="button" data-no>Cancelar</button><button class="btn ${danger?'danger':'pri'}" type="button" data-ok>${okLabel}</button></div>`);
  const end=v=>{done=true;sh.close();res(v);};
  sh.el.querySelector('[data-no]').onclick=()=>end(false);sh.el.querySelector('[data-ok]').onclick=()=>end(true);
  new MutationObserver((m,o)=>{if(!document.body.contains(sh.el)){o.disconnect();if(!done)res(false);}}).observe(document.body,{childList:true});
  setTimeout(()=>sh.el.querySelector('[data-no]').focus(),80);});}
/* ── Ficha de un gasto: se ve lo cargado; «Modificar» habilita la edición y todo cambio o borrado se confirma ── */
async function gastoVer(id){
  shell(`<div class="top"><button class="btn ghost icon-btn" type="button" id="back" aria-label="Volver">${icon('arrow-left')}</button><h1 class="grow" id="gv-title">Gasto</h1><span class="pill muted" id="gv-kind"></span></div><div id="gv" class="gv">${UI().SKELETON}</div>`,'gastos',{bare:true});
  const $=x=>document.getElementById(x);
  const {data:x,error}=await C.db.from('solo_expenses').select('*').eq('id',id).maybeSingle();
  const box=$('gv');if(!box)return;
  if(error||!x){box.innerHTML='<div class="empty">No encontramos ese gasto.</div>';$('back').onclick=()=>go('gastos');return;}
  const fixed=x.kind==='fixed',back=()=>go(fixed?'gastos-fijo':'gastos-movimientos');$('back').onclick=back;
  $('gv-kind').textContent=fixed?'Fijo':'Del día';
  let cat=x.category,editing=false,ticket=null;
  // El monto va sin formato: la capa de campos (solo-ui) lo muestra como «15.500».
  box.innerHTML=`<form id="gv-form" class="card gv-form" novalidate>
      <div class="field gv-amount"><label for="gv-amount">Monto $</label><input id="gv-amount" data-v="moneypos!" inputmode="decimal" value="${Number(x.amount)}" disabled></div>
      <div class="field"><label>Categoría</label><button class="gx-catbtn on" type="button" id="gv-cat" disabled><span class="ex-ico">${catIcon(cat)}</span><span class="gx-catbtn-t"><b>${esc(cat)}</b></span>${icon('chevron-down','trail')}</button></div>
      <div class="grid2"><div class="field ${fixed?'':'span2'}"><label for="gv-date">${fixed?'Pagado el':'Fecha'}</label><input id="gv-date" data-v="date!" type="date" value="${esc(x.spent_on)}" disabled></div>
        ${fixed?`<div class="field"><label for="gv-period">Cubre</label><select id="gv-period" disabled>${[1,2,3,6,12].map(m=>`<option value="${m}" ${Number(x.period_months)===m?'selected':''}>${m} ${m>1?'meses':'mes'}</option>`).join('')}</select></div>`:''}</div>
      <div class="field"><label for="gv-note">Detalle</label><input id="gv-note" data-v="text" value="${esc(x.notes||'')}" placeholder="Sin detalle" disabled></div>
      <div class="field"><label>Foto del ticket</label>
        <div class="gv-ticket"><button class="gv-thumb" type="button" id="gv-thumb" ${x.receipt_path?'':'hidden'} aria-label="Ver foto del ticket"></button><span class="hint" id="gv-noticket" ${x.receipt_path?'hidden':''}>Sin foto del ticket</span>
          <label class="btn gv-change" id="gv-change" hidden>${icon('camera')} <span>${x.receipt_path?'Cambiar foto':'Agregar foto'}</span><input type="file" accept="image/*" capture="environment" hidden id="gv-file"></label></div></div>
      <p class="hint">Cargado el ${esc(new Date(x.created_at||x.spent_on).toLocaleDateString('es-AR'))}</p>
      <p id="gv-err" class="err" hidden></p></form>
    <div class="rm-footer" id="gv-actions"></div>`;
  if(x.receipt_path)C.db.storage.from('solo_files').createSignedUrl(x.receipt_path,600).then(({data})=>{if(data&&$('gv-thumb'))$('gv-thumb').style.backgroundImage=`url("${data.signedUrl}")`;});
  $('gv-thumb').onclick=()=>{if(ticket)return;showReceipt(x.receipt_path);};
  $('gv-cat').onclick=async()=>{const c=await pickCategory(x.kind,cat);if(c){cat=c;$('gv-cat').querySelector('.ex-ico').innerHTML=catIcon(c);$('gv-cat').querySelector('b').textContent=c;}};
  $('gv-file').addEventListener('change',()=>{const f=$('gv-file').files[0];if(!f)return;ticket=f;const t=$('gv-thumb');t.hidden=false;$('gv-noticket').hidden=true;t.style.backgroundImage=`url("${URL.createObjectURL(f)}")`;UI().success();});
  const fields=['gv-amount','gv-cat','gv-date','gv-period','gv-note'];
  function mode(edit){editing=edit;fields.forEach(f=>{const el=$(f);if(el)el.disabled=!edit;});$('gv-change').hidden=!edit;$('gv-form').classList.toggle('editing',edit);$('gv-title').textContent=edit?'Modificar gasto':'Gasto';
    $('gv-actions').innerHTML=edit?`<button class="btn" type="button" id="gv-cancel">Cancelar</button><button class="btn pri" type="button" id="gv-save">${icon('check')} Guardar cambios</button>`
      :`<button class="btn danger-ghost" type="button" id="gv-del">${icon('trash-2')} Eliminar</button><button class="btn pri" type="button" id="gv-edit">${icon('pencil')} Modificar</button>`;
    if(edit){$('gv-cancel').onclick=()=>gastoVer(id);$('gv-save').onclick=save;setTimeout(()=>$('gv-amount').focus(),50);}
    else{$('gv-edit').onclick=()=>mode(true);$('gv-del').onclick=del;}}
  async function del(){
    const ok=await confirmBox('¿Eliminar este gasto?',`<p><b>${esc(x.category)}</b> · <span class="num">${esc(money(x.amount))}</span> · ${esc(x.spent_on.split('-').reverse().join('/'))}</p><p class="hint">Se borra también la foto del ticket. No se puede deshacer.</p>`,'Eliminar',true);
    if(!ok)return;
    const {error}=await C.db.from('solo_expenses').delete().eq('id',x.id);if(error)return toast(errText(error));
    if(x.receipt_path)C.db.storage.from('solo_files').remove?.([x.receipt_path]);
    UI().success();toast('Gasto eliminado');back();}
  async function save(){const er=$('gv-err');er.hidden=true;
    if(!UI().validateForm($('gv-form')))return;
    const next={amount:num($('gv-amount').value),category:cat,spent_on:$('gv-date').value,notes:$('gv-note').value.trim()||null,period_months:fixed?Number($('gv-period').value):null};
    const LBL={amount:'Monto',category:'Categoría',spent_on:'Fecha',notes:'Detalle',period_months:'Cubre'},show=(k,v)=>k==='amount'?money(v):k==='spent_on'?String(v).split('-').reverse().join('/'):k==='period_months'?(v?v+(v>1?' meses':' mes'):''):(v||'—');
    const changes=Object.keys(next).filter(k=>String(next[k]??'')!==String(k==='amount'?Number(x[k]):(x[k]??'')));
    if(!changes.length&&!ticket){toast('No cambiaste nada');return mode(false);}
    const ok=await confirmBox('¿Guardar los cambios?',`<ul class="diff">${changes.map(k=>`<li><span>${LBL[k]}</span><s>${esc(show(k,k==='amount'?Number(x[k]):x[k]))}</s><b>${esc(show(k,next[k]))}</b></li>`).join('')}${ticket?'<li><span>Ticket</span><b>Foto nueva</b></li>':''}</ul>`,'Guardar cambios');
    if(!ok)return;
    if(ticket){const path=C.user.id+'/receipts/'+Date.now()+'.jpg';const up=await C.db.storage.from('solo_files').upload(path,await shrink(ticket),{contentType:'image/jpeg'});
      if(up.error){er.textContent='No se pudo subir la foto: '+errText(up.error);er.hidden=false;return;}next.receipt_path=path;}
    const {error}=await C.db.from('solo_expenses').update(next).eq('id',x.id);if(error){er.textContent=errText(error);er.hidden=false;return;}
    UI().success();toast('Cambios guardados');gastoVer(id);}
  mode(false);
}
async function gastoNuevo(kind){
  const fixed=kind==='fixed',$=x=>document.getElementById(x);
  let cat=null;
  let expr='',date=isoDate(new Date()),note='',period=12,ticket=null;
  shell(`<div class="top"><button class="btn ghost icon-btn" type="button" id="back" aria-label="Volver">${icon('arrow-left')}</button><h1 class="grow">Nuevo gasto</h1>
      <div class="seg mini-seg" role="group" aria-label="Tipo de gasto"><button type="button" data-k="variable" aria-pressed="${!fixed}">Del día</button><button type="button" data-k="fixed" aria-pressed="${fixed}">Fijo</button></div></div>
    <form id="ex" class="gx" novalidate>
      <div class="gx-amount" id="gx-amount" aria-live="polite"><span class="gx-cur">$</span><b class="num" id="gx-val">0</b><small id="gx-expr"></small></div>
      <div class="gx-quick" id="gx-quick" hidden></div>
      <button class="gx-catbtn" type="button" id="gx-catbtn" aria-haspopup="dialog"><span class="ex-ico">${icon('list-checks')}</span><span class="gx-catbtn-t"><small>Categoría</small><b>Elegir categoría</b></span>${icon('chevron-down','trail')}</button>
      <div class="gx-meta">
        <button class="gx-chip" type="button" id="gx-date">${icon('calendar')}<span>Hoy</span></button>
        ${fixed?`<button class="gx-chip" type="button" id="gx-period">${icon('calendar-clock')}<span>12 meses</span></button>`:''}
        <button class="gx-chip grow" type="button" id="gx-note">${icon('pencil')}<span class="ell">Detalle</span></button>
      </div>
      <label class="gx-ticket2" id="e-ticket"><span class="gx-ticket-thumb" id="e-ticket-img">${icon('camera')}</span><span class="gx-ticket-t"><b id="e-ticket-t">Sacar foto del ticket</b><small id="e-ticket-s">Opcional · queda guardada con el gasto</small></span>${icon('plus','trail')}<input type="file" accept="image/*" capture="environment" hidden id="e-file"></label>
      <input type="date" id="e-date" class="sr" tabindex="-1" aria-hidden="true" value="${date}"><input type="hidden" id="e-period" value="12"><input type="hidden" id="e-note" value="">
      <p id="e-err" class="err" hidden></p>
      <div class="gx-pad" role="group" aria-label="Teclado del monto">
        ${['7','8','9','del','4','5','6','+','1','2','3','ok','000','0',','].map(k=>k==='ok'?`<button class="gx-key ok" type="submit">${icon('check')}<span>Guardar</span></button>`
          :`<button class="gx-key ${k==='del'?'fn':k==='+'?'fn':''}" type="button" data-key="${k}" aria-label="${k==='del'?'Borrar':k==='+'?'Sumar otro ticket':k}">${k==='del'?icon('chevron-left'):k}</button>`).join('')}
      </div>
    </form>`,'gastos',{bare:true});
  $('back').onclick=()=>go(fixed?'gastos-fijo':'gastos');
  app().querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>go(b.dataset.k==='fixed'?'gastos-nuevo-fijo':'gastos-nuevo'));
  // ── Monto: teclado con suma (para juntar varios tickets) ──
  const terms=()=>expr.split('+').map(t=>t.trim()).filter(Boolean);
  const valueOf=t=>Number(t.replace(/\./g,'').replace(',','.'))||0;
  const total=()=>terms().reduce((a,t)=>a+valueOf(t),0);
  const fmtTerm=t=>{const [i,d]=t.split(',');const g=i?Number(i).toLocaleString('es-AR'):'0';return d!==undefined?g+','+d:g;};
  function paint(){const v=total(),ts=terms();
    $('gx-val').textContent=v?Math.round(v*100)/100===Math.round(v)?Math.round(v).toLocaleString('es-AR'):v.toLocaleString('es-AR',{maximumFractionDigits:2}):'0';
    $('gx-val').style.fontSize=Math.max(28,44-Math.max(0,$('gx-val').textContent.length-7)*4)+'px';
    $('gx-expr').textContent=ts.length>1||/\+$/.test(expr)?ts.map(fmtTerm).join(' + ')+(/\+$/.test(expr)?' +':''):fixed&&v?'= '+money(v/period)+' por mes':'';
    $('gx-amount').classList.toggle('empty',!v);}
  function press(k){UI().haptic(5);$('e-err').hidden=true;$('gx-amount').classList.remove('bad');
    const cur=expr.split('+').pop();
    if(k==='del')expr=expr.slice(0,-1);
    else if(k==='+'){if(cur&&valueOf(cur))expr+='+';}
    else if(k===','){if(!cur.includes(','))expr+=(cur?'':'0')+',';}
    else{const digits=cur.replace(/\D/g,'');if(digits.length>=10)return;if(cur.includes(',')&&cur.split(',')[1].length>=2)return;
      if((cur==='0')&&k!==',')expr=expr.slice(0,-1);expr+=k==='000'&&!cur?'':k;}
    paint();}
  app().querySelectorAll('[data-key]').forEach(b=>b.addEventListener('click',()=>press(b.dataset.key)));
  // Teclado físico (computadora): números, coma, + y borrar.
  const onKey=e=>{if(!document.body.contains($('gx-val'))){removeEventListener('keydown',onKey);return;}if(document.querySelector('.sheet-wrap'))return;
    if(/^[0-9]$/.test(e.key))press(e.key);else if(e.key===','||e.key==='.')press(',');else if(e.key==='+')press('+');else if(e.key==='Backspace')press('del');else return;e.preventDefault();};
  addEventListener('keydown',onKey);
  // ── Categoría (se recuerda la última usada) ──
  const setCat=c=>{cat=c;const b=$('gx-catbtn');b.classList.toggle('on',!!c);b.querySelector('.ex-ico').innerHTML=c?catIcon(c):icon('list-checks');b.querySelector('b').textContent=c||'Elegir categoría';};
  $('gx-catbtn').onclick=async()=>{const c=await pickCategory(kind,cat);if(c){setCat(c);UI().haptic(6);}};
  // ── Fecha: Hoy / Ayer / otra ──
  const dayTxt=d=>d===isoDate(new Date())?'Hoy':d===isoDate(new Date(Date.now()-864e5))?'Ayer':d.split('-').reverse().slice(0,2).join('/');
  const setDate=d=>{date=d;$('e-date').value=d;$('gx-date').querySelector('span').textContent=(fixed?'Pagado ':'')+dayTxt(d).toLowerCase().replace(/^./,c=>fixed?c:c.toUpperCase());};
  setDate(date);
  $('gx-date').onclick=()=>{const t=isoDate(new Date()),y=isoDate(new Date(Date.now()-864e5));
    const sh=sheet(fixed?'¿Cuándo lo pagaste?':'¿Cuándo fue?',`<div class="gx-opts">${[[t,'Hoy'],[y,'Ayer']].map(([d,l])=>`<button class="gx-opt" type="button" data-d="${d}" aria-pressed="${date===d}">${l}<small>${d.split('-').reverse().join('/')}</small></button>`).join('')}</div>
      <div class="field"><label for="gx-other">Otra fecha</label><input id="gx-other" type="date" value="${date}" max="${t}"></div>`);
    sh.el.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{setDate(b.dataset.d);sh.close();});
    sh.el.querySelector('#gx-other').addEventListener('change',e=>{if(e.target.value){setDate(e.target.value);sh.close();}});};
  // ── Período de los fijos ──
  $('gx-period')?.addEventListener('click',()=>{const sh=sheet('¿Cuántos meses cubre?',`<div class="gx-opts five">${[1,2,3,6,12].map(m=>`<button class="gx-opt" type="button" data-m="${m}" aria-pressed="${period===m}">${m}<small>${m>1?'meses':'mes'}</small></button>`).join('')}</div><p class="hint">Se reparte por mes: un seguro anual de $ 1.200.000 suma $ 100.000 en cada mes.</p>`);
    sh.el.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{period=Number(b.dataset.m);$('e-period').value=period;$('gx-period').querySelector('span').textContent=period+(period>1?' meses':' mes');sh.close();paint();});});
  // ── Detalle con sugerencias: elegir uno anterior también pone su categoría ──
  const {data:recent}=await C.db.from('solo_expenses').select('*').eq('kind',kind).order('created_at',{ascending:false}).limit(60);
  const past=[];(recent||[]).forEach(x=>{if(x.notes&&!past.some(p=>p.notes.toLowerCase()===x.notes.toLowerCase()))past.push(x);});
  const setNote=n=>{note=n.trim();$('e-note').value=note;const b=$('gx-note');b.querySelector('span').textContent=note||'Detalle';b.classList.toggle('on',!!note);};
  $('gx-note').onclick=()=>{const sh=sheet('Detalle',`<div class="field"><label for="gx-note-in">Qué fue</label><input id="gx-note-in" maxlength="160" autocomplete="off" placeholder="${fixed?'Ej.: póliza La Segunda':'Ej.: YPF Ruta 3'}" value="${esc(note)}"></div><div class="gx-sugg" id="gx-sugg"></div><button class="btn pri block" type="button" id="gx-note-ok">Listo</button>`);
    const inp=sh.el.querySelector('#gx-note-in'),sg=sh.el.querySelector('#gx-sugg');
    const draw=()=>{const q=inp.value.trim().toLowerCase();const list=past.filter(p=>!q||p.notes.toLowerCase().includes(q)).slice(0,5);
      sg.innerHTML=list.map((p,i)=>`<button class="gx-sug" type="button" data-i="${past.indexOf(p)}">${catIcon(p.category)}<span class="ell">${esc(p.notes)}</span><small>${esc(p.category)}</small></button>`).join('');
      sg.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{const p=past[Number(b.dataset.i)];setNote(p.notes);if(CATS[kind].includes(p.category))setCat(p.category);sh.close();});};
    inp.addEventListener('input',draw);draw();setTimeout(()=>inp.focus(),120);
    const done=()=>{setNote(inp.value);const m=past.find(p=>p.notes.toLowerCase()===note.toLowerCase());if(m&&CATS[kind].includes(m.category))setCat(m.category);sh.close();};
    sh.el.querySelector('#gx-note-ok').onclick=done;inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();done();}});};
  // ── Repetir: los últimos gastos distintos, de un toque ──
  const reps=[];(recent||[]).forEach(x=>{const k=x.category+'|'+Number(x.amount)+'|'+(x.notes||'');if(!reps.some(r=>r.k===k))reps.push({k,x});});
  if(reps.length){$('gx-quick').hidden=false;$('gx-quick').innerHTML=`<span class="hint">Repetir</span>`+reps.slice(0,3).map((r,i)=>`<button class="gx-rep" type="button" data-r="${i}">${catIcon(r.x.category)}<span class="ell">${esc(r.x.notes||r.x.category)}</span><b class="num">${money(r.x.amount)}</b></button>`).join('');
    $('gx-quick').querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{const x=reps[Number(b.dataset.r)].x;expr=String(Math.round(Number(x.amount)*100)/100).replace('.',',');
      if(CATS[kind].includes(x.category))setCat(x.category);setNote(x.notes||'');if(fixed&&x.period_months){period=x.period_months;$('e-period').value=period;$('gx-period').querySelector('span').textContent=period+(period>1?' meses':' mes');}
      paint();UI().haptic(8);});}
  // ── Foto del ticket ──
  $('e-file').addEventListener('change',()=>{const f=$('e-file').files[0];if(!f)return;ticket=f;const img=$('e-ticket-img');if(img.dataset.url)URL.revokeObjectURL(img.dataset.url);
    img.dataset.url=URL.createObjectURL(f);img.style.backgroundImage=`url("${img.dataset.url}")`;img.innerHTML='';$('e-ticket').classList.add('has');
    $('e-ticket-t').textContent='Foto del ticket agregada';$('e-ticket-s').textContent='Tocá para cambiarla';UI().success();});
  paint();
  // ── Guardar ──
  $('ex').onsubmit=async e=>{e.preventDefault();const er=$('e-err');er.hidden=true;const amount=Math.round(total()*100)/100;
    if(amount<=0){er.textContent='Marcá el monto con el teclado.';er.hidden=false;$('gx-amount').classList.add('bad');UI().haptic([20,40,20]);return;}
    if(!cat){er.textContent='Elegí la categoría del gasto.';er.hidden=false;UI().haptic([20,40,20]);const c=await pickCategory(kind,cat);if(!c)return;setCat(c);er.hidden=true;}
    // El estado «guardando» del botón lo maneja la capa común de formularios (solo-ui.js).
    let receipt_path=null;
      if(ticket){receipt_path=C.user.id+'/receipts/'+Date.now()+'.jpg';const up=await C.db.storage.from('solo_files').upload(receipt_path,await shrink(ticket),{contentType:'image/jpeg'});
        if(up.error){er.textContent='No se pudo subir la foto del ticket: '+errText(up.error);er.hidden=false;return;}}
      const row={kind,category:cat,amount,spent_on:$('e-date').value||isoDate(new Date()),period_months:fixed?Number($('e-period').value):null,notes:$('e-note').value.trim()||null,receipt_path};
      const {error}=await C.db.from('solo_expenses').insert(row);if(error){er.textContent=errText(error);er.hidden=false;return;}
      removeEventListener('keydown',onKey);UI().success();toast('Gasto guardado · '+money(amount));go(fixed?'gastos-fijo':'gastos-movimientos');};
}
})();

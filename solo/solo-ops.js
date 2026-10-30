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
const CONF=[['conf_service','Conformidad con el servicio','El socio confirma que el servicio fue prestado correctamente',true],
  ['conf_charges','Aceptación de cargos variables','Acepta peajes, excedentes y otros cargos detallados',true],
  ['no_damage','Sin daños reportados','El vehículo fue entregado sin incidentes ni daños adicionales',true],
  ['conf_tow','Conformidad de arrastre','Autorizo a arrastrar mi vehículo bajo mi exclusiva responsabilidad',false]];
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
  wizard(box,s,cl,tp,rates||[],Math.max(1,Math.min(5,Number(stepArg)||Number(sessionStorageGet('rm-step-'+id))||1)));
};
function sessionStorageGet(k){try{return sessionStorage.getItem(k);}catch(e){return null;}}
function sessionStorageSet(k,v){try{sessionStorage.setItem(k,v);}catch(e){}}

function wizard(box,s,cl,tp,rates,step){
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
        <div class="grid2"><div class="field ${particular?'span2':''}"><label for="r-date">Fecha y hora</label><input id="r-date" type="datetime-local" value="${localDT(new Date(s.service_date))}"></div>
        ${particular?'':`<div class="field"><label for="r-order">N.º de servicio</label><input id="r-order" placeholder="De la prestadora" value="${esc(s.provider_order||'')}"></div>`}</div>
        <div class="grid2"><div class="field"><label for="r-plate">Patente</label><input id="r-plate" placeholder="AB 123 CD" value="${esc(s.plate||'')}"></div>
        <div class="field"><label for="r-mm">Marca y modelo</label><input id="r-mm" placeholder="Ford Focus" value="${esc(s.make_model||'')}"></div></div>
        <div class="field"><label for="r-orig">Origen</label><input id="r-orig" placeholder="Ciudad / dirección" value="${esc(s.origin||'')}"></div>
        <div class="field"><label for="r-dest">Destino</label><input id="r-dest" placeholder="Ciudad / dirección" value="${esc(s.destination||'')}"></div>
        <div class="grid2"><div class="field"><label for="r-km">Km recorridos</label><input id="r-km" placeholder="Ej.: 48" value="${s.km??''}"></div>
        <div class="field"><label>Llegada</label>${s.arrived_at?`<input value="${esc(fmtDate(s.arrived_at))}" readonly>`:`<button class="btn block" type="button" id="arr">${icon('map-pin')} Llegué</button>`}</div></div>
        <button class="link danger" type="button" id="cancel">Anular servicio</button>
      </section>
      <section class="rm-panel card" data-step="2" aria-label="Paso 2: Socio" hidden>
        <div class="field"><label for="r-cname">Nombre del socio / cliente</label><input id="r-cname" placeholder="Nombre completo" autocomplete="off" value="${esc(s.customer_name||'')}"></div>
        <div class="field"><label for="r-cdoc">DNI / CUIT</label><input id="r-cdoc" inputmode="numeric" placeholder="Ej.: 28.456.112" value="${esc(s.customer_doc||'')}"></div>
        <div class="field"><label for="r-cphone">Teléfono de contacto</label><input id="r-cphone" type="tel" inputmode="tel" placeholder="Ej.: 11 2345 6789" value="${esc(s.customer_phone||'')}"><span class="help">Con característica, sin 0 ni 15.</span></div>
      </section>
      <section class="rm-panel card" data-step="3" aria-label="Paso 3: Adicionales" hidden>
        <div class="grid2"><div class="field"><label for="r-tolls">Peajes $</label><input id="r-tolls" value="${extraOf(s,'Peajes')||''}"></div>
        <div class="field"><label for="r-exc">Excedente km $</label><input id="r-exc" value="${extraOf(s,'Excedente')||''}"></div></div>
        <div class="grid2"><div class="field"><label for="r-wait">Espera / maniobras $</label><input id="r-wait" value="${extraOf(s,'Espera')||''}"></div>
        <div class="field"><label for="r-other">Otros $</label><input id="r-other" value="${Number(s.other_amount)||''}"></div></div>
        <div id="r-total" class="card tight" style="background:var(--ax-surface)"></div>
        <h2>Cobro en el lugar</h2>
        <p class="hint" id="r-pay-hint"></p>
        <div class="grid2"><div class="field"><label for="r-p1m">Medio de pago</label><select id="r-p1m"><option value="">${particular?'Elegí cómo pagó':'No pagó nada en el lugar'}</option>${Object.entries(PAY).map(([k,l])=>`<option value="${k}" ${s.payment_1_method===k?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="r-p1a">Monto $</label><input id="r-p1a" value="${s.payment_1_amount??''}"></div></div>
        <label class="toggle-row"><input type="checkbox" id="r-mixed" ${s.payment_2_method?'checked':''}> <span><b>Pago mixto</b><small>Pagó una parte con otro medio</small></span></label>
        <div class="grid2" id="r-p2" ${s.payment_2_method?'':'hidden'}><div class="field"><label for="r-p2m">Segundo medio</label><select id="r-p2m">${Object.entries(PAY).map(([k,l])=>`<option value="${k}" ${s.payment_2_method===k?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="r-p2a">Monto $</label><input id="r-p2a" value="${s.payment_2_amount??''}"></div></div>
        <p id="r-pay-err" class="err" hidden></p>
      </section>
      <section class="rm-panel card" data-step="4" aria-label="Paso 4: Evidencia" hidden>
        <p class="hint">Sacá las fotos del vehículo antes de cargarlo. Quedan guardadas con el remito.</p>
        <div class="slots">${SLOTS.map(([k,l])=>`<label class="slot" data-slot="${k}"><input type="file" accept="image/*" capture="environment" hidden data-slot-in="${k}"><span class="slot-img"></span><span class="slot-label">${l}</span></label>`).join('')}</div>
        <div class="field"><label for="r-obs">Observaciones</label><input id="r-obs" placeholder="Clima, demoras, estado del vehículo, notas del cliente…" value="${esc(s.notes||'')}"></div>
      </section>
      <section class="rm-panel card" data-step="5" aria-label="Paso 5: Firma" hidden>
        <div class="row"><h2>Conformidad del socio</h2><b class="num" id="r-conf-count"></b></div>
        <div class="bar thin"><i id="r-conf-bar" style="--w:0%"></i></div>
        <div class="stack">${CONF.map(([k,t,d,req])=>`<label class="toggle-row"><input type="checkbox" id="r-${k}" ${req?'checked':''} ${req?'data-req="1"':''}> <span><b>${t}${req?'':' <small>(opcional)</small>'}</b><small>${d}</small></span></label>`).join('')}</div>
        <label class="toggle-row"><input type="checkbox" id="r-absent"> <span><b>Socio ausente (firma el chofer)</b><small>Activar si el titular no está presente para firmar</small></span></label>
        <div class="pad-wrap"><span class="pad-title" id="r-sig-title">Firma digital del socio</span><canvas id="pad" tabindex="0" width="600" height="220" aria-label="Espacio para firmar"></canvas><span class="pad-hint" id="pad-hint">Dibujá con el dedo</span><button class="btn ghost pad-clear" type="button" id="clr">Limpiar</button></div>
        <div class="grid2"><div class="field"><label for="r-sn">Aclaración</label><input id="r-sn" value="${esc(s.signer_name||s.customer_name||'')}"></div><div class="field"><label for="r-sd">DNI</label><input id="r-sd" inputmode="numeric" value="${esc(s.signer_doc||s.customer_doc||'')}"></div></div>
        <p id="r-sig-err" class="err" hidden></p>
      </section>
    </div>
    <div class="rm-footer"><button class="btn" type="button" id="r-back">${icon('chevron-left')} Atrás</button><button class="btn ghost" type="button" id="r-later">Guardar y seguir después</button><button class="btn pri" type="button" id="r-next">Siguiente ${icon('chevron-right')}</button></div>`;

  // ── Precio: base de la tarifa + km excedentes + adicionales ──
  const rate=()=>particular?null:rateForAt(rates,s.client_id,s.service_type_id,new Date($('r-date').value||s.service_date));
  function totals(){const km=num($('r-km').value),r=rate(),p=particular?{base:Number(s.base_amount)||0,kmAmount:0}:priceOf(r,km);
    const tolls=num($('r-tolls').value),exc=num($('r-exc').value),wait=num($('r-wait').value),other=num($('r-other').value);
    return {km,r,base:p.base,kmAmount:p.kmAmount,tolls,exc,wait,other,extras:tolls+exc+wait+other,total:p.base+p.kmAmount+tolls+exc+wait+other};}
  function paintTotal(){const t=totals();
    $('r-total').innerHTML=(!particular&&!t.r?'<p class="err">Esta prestadora no tiene tarifa para este servicio. El total sale solo con los adicionales. <button class="link" type="button" id="r-rate">Cargar tarifa</button></p>':'')+
      `<div class="row"><span><b>Total del servicio</b><span class="hint block">${[(particular?'Acordado ':'Base ')+money(t.base),t.kmAmount?Math.max(0,t.km-Number(t.r.included_km))+' km × '+money(t.r.per_km):'',t.extras?'adicionales '+money(t.extras):''].filter(Boolean).join(' + ')}</span></span><b class="num total-pop" style="color:var(--ax-accent);font-size:20px">${money(t.total)}</b></div>`;
    $('r-rate')?.addEventListener('click',()=>go('cliente-'+s.client_id));
    $('r-pay-hint').textContent=particular?'El particular paga el total en el lugar.':'Lo paga la prestadora. Cargá solo lo que el socio pagó acá.';
    if(particular&&!$('r-p1a').value&&t.total)$('r-p1a').value=UI().moneyFmt?UI().moneyFmt(String(t.total)):t.total;}
  ['r-km','r-tolls','r-exc','r-wait','r-other','r-date'].forEach(x=>$(x).addEventListener('input',paintTotal));
  $('r-mixed').addEventListener('change',()=>{$('r-p2').hidden=!$('r-mixed').checked;});

  // ── Validación de cada paso (misma lógica que Flota) ──
  function validate(n){const panel=box.querySelector(`.rm-panel[data-step="${n}"]`);
    if(!UI().validateForm(panel))return false;
    if(n===3){const er=$('r-pay-err');er.hidden=true;const t=totals();const m1=$('r-p1m').value,a1=num($('r-p1a').value),mixed=$('r-mixed').checked,a2=mixed?num($('r-p2a').value):0;
      const fail=msg=>{er.textContent=msg;er.hidden=false;UI().haptic([20,40,20]);return false;};
      if(t.total<=0)return fail('El total del servicio no puede ser cero.');
      if(particular&&!m1)return fail('Elegí cómo pagó el particular.');
      if(m1&&a1<=0)return fail('Poné el monto que pagó con '+PAY[m1].toLowerCase()+'.');
      if(mixed&&(!a2||$('r-p2m').value===m1))return fail('En pago mixto, el segundo medio tiene que ser distinto y con monto.');
      if(particular&&Math.round(a1+a2)!==Math.round(t.total))return fail('Los pagos suman '+money(a1+a2)+' y el total es '+money(t.total)+'.');
      if(!particular&&a1+a2>t.total)return fail('Lo cobrado no puede superar el total del servicio.');}
    if(n===5){const er=$('r-sig-err');er.hidden=true;const absent=$('r-absent').checked;
      const missing=CONF.filter(c=>c[3]&&!$('r-'+c[0]).checked);
      if(!absent&&missing.length){er.textContent='Faltan confirmaciones: '+missing.map(c=>c[1].toLowerCase()).join(', ')+'.';er.hidden=false;UI().haptic([20,40,20]);return false;}
      if(!sigDirty){er.textContent=absent?'Falta la firma del chofer.':'Falta la firma del socio.';er.hidden=false;$('pad').classList.add('pad-err');UI().haptic([20,40,20]);return false;}}
    return true;}
  function patchFor(n){const t=totals();
    if(n===1)return {service_date:new Date($('r-date').value||s.service_date).toISOString(),provider_order:$('r-order')?($('r-order').value.trim()||null):null,plate:$('r-plate').value.trim().toUpperCase()||null,make_model:$('r-mm').value.trim()||null,origin:$('r-orig').value.trim()||null,destination:$('r-dest').value.trim()||null,km:t.km||null,base_amount:t.base,km_amount:t.kmAmount,total:t.total};
    if(n===2)return {customer_name:$('r-cname').value.trim()||null,customer_doc:$('r-cdoc').value.trim()||null,customer_phone:$('r-cphone').value.trim()||null};
    if(n===3){const m1=$('r-p1m').value||null,mixed=$('r-mixed').checked;return {extras:[['Peajes',t.tolls],['Excedente',t.exc],['Espera',t.wait]].filter(x=>x[1]).map(([name,amount])=>({name,amount})),tolls:t.tolls?[{name:'Peajes',amount:t.tolls}]:[],
      other_amount:t.other,extras_amount:t.extras,base_amount:t.base,km_amount:t.kmAmount,total:t.total,payment_1_method:m1,payment_1_amount:m1?num($('r-p1a').value):null,
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
    if(n===3)paintTotal();if(n===4)paintSlots();if(n===5){if(!$('r-absent').checked){if(!$('r-sn').value.trim())$('r-sn').value=s.customer_name||'';if(!$('r-sd').value.trim())$('r-sd').value=s.customer_doc||'';}initPad();paintConf();}
    if(prev)$('rm-panels').scrollTop=0;}
  $('r-back').onclick=()=>{if(current>1)show(current-1,-1);};
  // Cerrar guarda lo que haya en el paso actual (sin exigir que esté completo) y vuelve a Servicios.
  $('rm-x').onclick=async()=>{await save(current);toast('Remito guardado. Seguilo cuando quieras desde Servicios.');go('servicios');};
  $('r-later').onclick=async()=>{if(!UI().validateForm(box.querySelector('.rm-panel[data-step="1"]')))return;if(await save(1)){toast('Remito guardado. Seguilo cuando quieras desde Servicios.');go('servicios');}};
  $('r-next').onclick=async()=>{const b=$('r-next');if(b.disabled)return;if(!validate(current))return;b.disabled=true;
    try{if(!(await save(current)))return;if(current<5){show(current+1,1);UI().haptic(8);}else await finish();}finally{b.disabled=false;}};
  $('arr')?.addEventListener('click',async()=>{const at=new Date().toISOString();const {error}=await C.db.from('solo_services').update({arrived_at:at}).eq('id',s.id);
    if(error)return toast(errText(error));s.arrived_at=at;$('arr').outerHTML=`<input value="${esc(fmtDate(at))}" readonly>`;toast('Llegada marcada '+fmtDate(at).split(' ')[1]);UI().success();});
  $('cancel').onclick=async()=>{const b=$('cancel');if(b.dataset.sure!=='1'){b.dataset.sure='1';b.textContent='Tocá de nuevo para anular';b.style.color='var(--ax-danger)';return;}
    const {error}=await C.db.from('solo_services').update({status:'cancelled'}).eq('id',s.id);toast(error?errText(error):'Servicio anulado');if(!error)go('servicios');};

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

  // ── Paso 5: conformidades y firma con el dedo ──
  function paintConf(){const req=CONF.filter(c=>c[3]),ok=req.filter(c=>$('r-'+c[0]).checked).length,absent=$('r-absent').checked;
    $('r-conf-count').textContent=absent?'Socio ausente':ok+' / '+req.length;$('r-conf-bar').style.setProperty('--w',(absent?100:ok/req.length*100)+'%');
    $('r-sig-title').textContent=absent?'Firma del chofer':'Firma digital del socio';}
  box.querySelectorAll('[id^="r-conf_"],#r-no_damage,#r-absent').forEach(x=>x.addEventListener('change',paintConf));
  $('r-absent').addEventListener('change',()=>{if($('r-absent').checked){$('r-sn').value=C.profile.full_name;$('r-sd').value='';}else{$('r-sn').value=s.customer_name||'';$('r-sd').value=s.customer_doc||'';}});
  let padReady=false;
  function initPad(){if(padReady)return;padReady=true;const pad=$('pad'),ctx=pad.getContext('2d');let drawing=false;ctx.lineWidth=3.2;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#111';
    const pos=e=>{const r=pad.getBoundingClientRect();return [(e.clientX-r.left)*pad.width/r.width,(e.clientY-r.top)*pad.height/r.height];};
    pad.addEventListener('focus',()=>pad.scrollIntoView({block:'center'}));
    pad.addEventListener('pointerdown',e=>{drawing=true;if(!sigDirty){sigDirty=true;$('pad-hint').hidden=true;pad.classList.remove('pad-err');}pad.setPointerCapture(e.pointerId);const [x,y]=pos(e);ctx.beginPath();ctx.moveTo(x,y);});
    pad.addEventListener('pointermove',e=>{if(!drawing)return;const [x,y]=pos(e);ctx.lineTo(x,y);ctx.stroke();});
    ['pointerup','pointercancel'].forEach(t=>pad.addEventListener(t,()=>{drawing=false;}));
    $('clr').onclick=()=>{ctx.clearRect(0,0,pad.width,pad.height);sigDirty=false;$('pad-hint').hidden=false;};}
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
    UI().success();toast('Remito firmado');views.servicio(s.id);}
  show(step,1);
}
function rateForAt(rates,clientId,typeId,when){return rateFor(rates,clientId,typeId,when);}

/* ── Remito firmado: resumen, cobro y envío ── */
function signedView(box,s,cl,tp,tk,id){
  const line=(l,v)=>v?`<div class="row"><span class="hint">${l}</span><span>${esc(v)}</span></div>`:'';
  const cancelled=s.status==='cancelled';
  box.innerHTML=`<div class="top"><button class="btn ghost icon-btn" type="button" id="rm-x" aria-label="Volver a Servicios">${icon('arrow-left')}</button>
      <div class="grow"><h1>Remito N.º ${s.remito_number}</h1><p class="hint ell">${esc(cl?.name||'')} · ${esc(tp?.name||'Servicio')} · ${esc(fmtDate(s.service_date))}</p></div>${cancelled?'<span class="pill muted">Anulado</span>':'<span class="pill ok">Firmado</span>'}</div>
    <div class="fill stack"><div class="card">${line('Patente',s.plate)}${line('Vehículo',s.make_model)}${line('Origen',s.origin)}${line('Destino',s.destination)}${line('N.º prestadora',s.provider_order)}${line('Socio',s.customer_name)}${line('Km',s.km)}${line('Llegada',fmtDate(s.arrived_at))}
      <div class="row"><b>Total</b><b class="num" style="color:var(--ax-accent)">${money(s.total)}</b></div></div>
    <div class="card"><h2>Fotos</h2><div id="ph" class="grid2"></div></div>
    <div class="card"><h2>Firma</h2><img id="sig-img" alt="Firma" style="width:100%;background:#fff;border-radius:10px;min-height:80px">
      <p class="hint">${esc(s.signer_name||'')}${s.signer_doc?' · '+esc(s.signer_doc):''}${s.customer_present===false?' · firmó el chofer (socio ausente)':''} · ${esc(fmtDate(s.signed_at))}</p></div>
    ${cancelled?'':`<div class="card"><h2>Cobro</h2><div class="row"><span>${s.paid_at?'Cobrado el '+esc(fmtDate(s.paid_at)):'Todavía no cobrado'}</span><button class="btn" type="button" id="paid">${s.paid_at?'Marcar no cobrado':'Marcar cobrado'}</button></div>
      ${s.payment_1_method?`<p class="hint">${PAY[s.payment_1_method]} ${money(s.payment_1_amount)}${s.payment_2_method?' + '+PAY[s.payment_2_method]+' '+money(s.payment_2_amount):''}</p>`:''}</div>`}</div>
    ${cancelled?'':`<button class="btn pri block" type="button" id="share">${icon('share-2')} Enviar remito (PDF)</button>`}`;
  const $=x=>document.getElementById(x);
  $('rm-x').onclick=()=>go('servicios');
  (async()=>{const paths=s.photos||[];if(!paths.length){$('ph').innerHTML='<p class="hint">Sin fotos.</p>';return;}const {data}=await C.db.storage.from('solo_files').createSignedUrls(paths,3600);
    if($('ph'))$('ph').innerHTML=(data||[]).map(u=>`<img src="${esc(u.signedUrl)}" alt="Foto del vehículo" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px">`).join('');})();
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

/* ── Gastos: resumen del mes y lista; el alta va en su propia pantalla ── */
views.gastos=async function(mode){
  if(String(mode||'').startsWith('nuevo'))return gastoNuevo(mode==='nuevo-fijo'?'fixed':'variable');
  const tab=mode==='fijo'?'fixed':'variable';
  shell(`<div class="top"><h1 class="grow">Gastos · ${esc(monthName(C.month))}</h1><button class="btn pri" type="button" id="add">${icon('plus')} Gasto</button></div>
    <div id="ex-sum" class="split"><div class="mini"><span>Del día</span><b class="num">…</b></div><div class="mini"><span>Fijos del mes</span><b class="num">…</b></div></div>
    <div class="seg" role="group" aria-label="Qué gastos ver"><button type="button" data-k="variable" aria-pressed="${tab==='variable'}">Del día</button><button type="button" data-k="fixed" aria-pressed="${tab==='fixed'}">Fijos</button></div>
    <div id="el" class="stack fill"><div class="sk-group" aria-busy="true" aria-label="Cargando"><i class="sk"></i><i class="sk"></i><i class="sk short"></i></div></div>`,'gastos');
  const $=x=>document.getElementById(x);
  $('add').onclick=()=>go(tab==='fixed'?'gastos-nuevo-fijo':'gastos-nuevo');
  app().querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>go(b.dataset.k==='fixed'?'gastos-fijo':'gastos'));
  const [a,z]=range();
  const [{data:vars},{data:fixed}]=await Promise.all([
    C.db.from('solo_expenses').select('*').eq('kind','variable').gte('spent_on',isoDate(a)).lt('spent_on',isoDate(z)).order('spent_on',{ascending:false}),
    C.db.from('solo_expenses').select('*').eq('kind','fixed').lt('spent_on',isoDate(z)).order('spent_on',{ascending:false})]);
  const active=(fixed||[]).filter(x=>{const end=new Date(x.spent_on+'T00:00:00');end.setMonth(end.getMonth()+x.period_months);return end>a&&(!x.ends_on||x.ends_on>=isoDate(a));});
  const tv=(vars||[]).reduce((t,x)=>t+Number(x.amount),0),tf=active.reduce((t,x)=>t+Number(x.amount)/x.period_months,0);
  const el=$('el');if(!el)return;
  $('ex-sum').innerHTML=`<div class="mini"><span>Del día</span><b class="num">${money(tv)}</b></div><div class="mini"><span>Fijos del mes</span><b class="num">${money(tf)}</b></div>`;
  el.innerHTML=tab==='fixed'
    ?active.map(x=>`<div class="item static"><div class="row"><b>${esc(x.category)}</b><b class="num">${money(Number(x.amount)/x.period_months)}</b></div><span class="hint">${money(x.amount)} cada ${x.period_months} ${x.period_months>1?'meses':'mes'} · pagado ${esc(x.spent_on.split('-').reverse().join('/'))}</span></div>`).join('')||'<div class="empty">Todavía no cargaste gastos fijos (seguro, patente, monotributo…).</div>'
    :(vars||[]).map(x=>`<div class="item static"><div class="row"><b>${esc(x.category)}</b><b class="num">${money(x.amount)}</b></div><span class="hint">${esc(x.spent_on.split('-').reverse().join('/'))}</span></div>`).join('')||'<div class="empty">Sin gastos del día en este mes.</div>';
};
function gastoNuevo(kind){
  shell(`<div class="top"><button class="btn ghost icon-btn" type="button" id="back" aria-label="Volver">${icon('arrow-left')}</button><h1 class="grow">Nuevo gasto</h1></div>
    <form id="ex" class="card fill-card" novalidate>
      <div class="seg" role="group" aria-label="Tipo de gasto"><button type="button" data-k="variable" aria-pressed="${kind==='variable'}">Del día</button><button type="button" data-k="fixed" aria-pressed="${kind==='fixed'}">Fijo</button></div>
      <div class="field"><label for="e-amount">Monto $</label><input id="e-amount" class="big-input" inputmode="decimal" placeholder="0"></div>
      <div class="field"><label>Categoría</label><div class="chips" id="e-cats">${CATS[kind].map((c,i)=>`<button class="chip" type="button" data-c="${esc(c)}" aria-pressed="${i===0}">${esc(c)}</button>`).join('')}</div></div>
      <div class="grid2"><div class="field ${kind==='fixed'?'':'span2'}"><label for="e-date">${kind==='fixed'?'Pagado el':'Fecha'}</label><input id="e-date" type="date" value="${isoDate(new Date())}"></div>
      ${kind==='fixed'?'<div class="field"><label for="e-period">Cubre</label><select id="e-period"><option value="1">1 mes</option><option value="2">2 meses</option><option value="3">3 meses</option><option value="6">6 meses</option><option value="12" selected>12 meses</option></select></div>':''}</div>
      ${kind==='fixed'?'<p class="hint">Se reparte por mes: un seguro anual de $ 1.200.000 suma $ 100.000 en cada mes.</p>':''}
      <p id="e-err" class="err" hidden></p><button class="btn pri block push" type="submit">Guardar gasto</button></form>`,'gastos',{bare:true});
  const $=x=>document.getElementById(x);let cat=CATS[kind][0];
  $('back').onclick=()=>go(kind==='fixed'?'gastos-fijo':'gastos');
  app().querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>go(b.dataset.k==='fixed'?'gastos-nuevo-fijo':'gastos-nuevo'));
  $('e-cats').querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{cat=b.dataset.c;UI().haptic(6);$('e-cats').querySelectorAll('[data-c]').forEach(x=>x.setAttribute('aria-pressed',x===b));});
  setTimeout(()=>$('e-amount')?.focus(),60);
  $('ex').onsubmit=async e=>{e.preventDefault();const er=$('e-err');er.hidden=true;const amount=num($('e-amount').value);
    if(amount<=0){er.textContent='Poné el monto del gasto.';er.hidden=false;return;}
    const row={kind,category:cat,amount,spent_on:$('e-date').value||isoDate(new Date()),period_months:kind==='fixed'?Number($('e-period').value):null};
    const {error}=await C.db.from('solo_expenses').insert(row);if(error){er.textContent=errText(error);er.hidden=false;return;}
    UI().success();toast('Gasto guardado');go(kind==='fixed'?'gastos-fijo':'gastos');};
}
})();

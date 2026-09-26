/* AuxiliOS · Remitos · panel lateral de Administración v1
   Reemplaza el modal de detalle con edición por grupos.

   Qué se puede tocar y dónde:
   · Datos administrativos (cliente, CUIT, teléfono, email, patente, marca,
     N° de servicio, observaciones) → "Corregir datos": un solo formulario, con
     motivo obligatorio y registro en historial_ediciones.
   · Lo que firmó el cliente (importes, km, conformidades, firma) → bloqueado.
     Las diferencias de cargos se resuelven con "Revisar cargos" (revisión v2
     del Servicio), que guarda el valor aprobado sin pisar el firmado.
   · Datos del Servicio (tipo, recorrido, prestadora) → se editan en el Servicio.
   · Anular: solo remitos sin Servicio (los vinculados siguen al Servicio), con
     motivo y confirmación. No hay eliminación definitiva. */
(()=>{'use strict';
if(window.RemitoPanel)return;

const P={remito:null,servicio:null,editing:false,annulling:false,tab:'detalle',busy:false};
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const role=()=>{try{return PERFIL_USUARIO?.roles?.name||''}catch(_){return''}};
const isAdmin=()=>role()==='administracion';
const money=n=>'$ '+(Number(n)||0).toLocaleString('es-AR');
const fecha=v=>v?(typeof formatearFecha==='function'?formatearFecha(v):String(v)):'—';
const notify=(m,t)=>{if(typeof toast==='function')toast(m,t)};

const CORREGIBLES=[
  {col:'razon_social',label:'Cliente',grupo:'cliente'},
  {col:'cuit',label:'CUIT / DNI',grupo:'cliente'},
  {col:'telefono',label:'Teléfono',grupo:'cliente',tipo:'tel'},
  {col:'email_cliente',label:'Email',grupo:'cliente',tipo:'email'},
  {col:'patente',label:'Patente',grupo:'vehiculo',upper:true},
  {col:'marca_modelo',label:'Marca / modelo',grupo:'vehiculo'},
  {col:'nro_servicio',label:'N° de servicio',grupo:'servicio',vinculado:'Viene del Servicio'},
  {col:'observaciones',label:'Observaciones',grupo:'obs',textarea:true},
];
const CONFORMIDADES=[['conformidad_servicio','Conformidad del servicio'],['conformidad_cargos','Conformidad de cargos'],['sin_danos','Sin daños'],['conformidad_arrastre','Conformidad de arrastre']];

function estado(r){
  if(r.status==='anulado')return['is-void','Anulado'];
  if(r.status==='cerrado_admin')return['is-ok','Cerrado por admin'];
  if(r.status==='firmado'){
    if(r.addons_version===2&&r.addons_review_status==='approved')return['is-ok','Aprobado'];
    if(r.addons_version===2&&r.addons_review_status==='adjusted')return['is-ok','Ajustado'];
    if(r.addons_version===2)return['is-review','Por revisar'];
    return['is-ok','Firmado'];
  }
  return['is-pending','Pendiente'];
}
const porRevisar=r=>r?.status==='firmado'&&r.addons_version===2&&!['approved','adjusted'].includes(r.addons_review_status);
const corregible=(c,r)=>!(c.vinculado&&r.operator_service_id);

function ensure(){
  if($('rmp-panel'))return;
  const root=document.createElement('div');
  root.innerHTML=`<div class="rmp-backdrop" id="rmp-backdrop" hidden></div>
  <aside class="rmp-panel" id="rmp-panel" role="dialog" aria-modal="true" aria-labelledby="rmp-title" hidden>
    <header class="rmp-head"><div class="rmp-head-main"><h2 id="rmp-title">Remito</h2><div class="rmp-sub" id="rmp-sub"></div></div>
      <button class="rmp-close" type="button" aria-label="Cerrar" onclick="RemitoPanel.close()">×</button></header>
    <nav class="rmp-tabs" id="rmp-tabs"></nav>
    <div class="rmp-body" id="rmp-body"></div>
    <footer class="rmp-foot" id="rmp-foot"></footer>
  </aside>`;
  document.body.append(...root.children);
  $('rmp-backdrop').addEventListener('click',()=>close());
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('rmp-panel').hidden)close()});
  document.addEventListener('input',e=>{
    const el=e.target.closest?.('#rmp-panel [data-rmp-field], #rmp-motivo');if(!el)return;
    if(el.dataset.rmpField)marcarCambio(el);
    renderFoot();
  });
}

async function cargarServicio(id){
  if(!id)return null;
  try{
    const {data,error}=await _db.from('operator_services').select('service_id,service_order_number,service_number,status,primary_concept_id,origin,destination').eq('service_id',id).maybeSingle();
    if(error||!data)return null;
    const conceptos=typeof _rmxCargarConceptos==='function'?await _rmxCargarConceptos():[];
    return{...data,tipo:conceptos.find(c=>c.concept_id===data.primary_concept_id)?.name||''};
  }catch(_){return null}
}

/* Encuesta de calidad (link público /r/<token>) y estado del envío. */
async function cargarEncuesta(id){
  try{
    const [sv,ln]=await Promise.all([
      _db.from('remito_surveys').select('*').eq('remito_id',id).maybeSingle(),
      _db.from('remito_public_links').select('created_at').eq('remito_id',id).maybeSingle(),
    ]);
    return{respuesta:sv.error?null:sv.data,enviado:ln.error?null:ln.data?.created_at||null};
  }catch(_){return{respuesta:null,enviado:null}}
}
function renderEncuesta(){
  const e=P.encuesta||{},sv=e.respuesta;
  const estrellas=n=>n?`<span class="rmp-stars" aria-label="${n} de 5">${'★'.repeat(n)}<span>${'★'.repeat(5-n)}</span></span>`:'<span class="rmp-empty">Sin respuesta</span>';
  if(sv)return seccion('Encuesta del cliente',
    fila('General',estrellas(sv.rating_general))+
    (sv.rating_puntualidad?fila('Puntualidad',estrellas(sv.rating_puntualidad)):'')+
    (sv.rating_trato?fila('Trato del chofer',estrellas(sv.rating_trato)):'')+
    (sv.recomendaria!=null?fila('Nos recomendaría',sv.recomendaria?'Sí':'<span class="rmp-warn">No</span>'):'')+
    (sv.comentario?`<div class="rmp-quote">“${esc(sv.comentario)}”</div>`:'')+
    fila('Respondida',esc(fecha(sv.created_at))));
  const txt=e.enviado?`Link enviado el ${esc(fecha(e.enviado))} · todavía sin respuesta`:'Todavía no se envió al cliente';
  return seccion('Encuesta del cliente',`<div class="rmp-survey-empty"><span class="rmp-empty">${txt}</span>${P.remito.status==='firmado'?`<button class="rmp-link" type="button" onclick="RemitoPanel.whatsapp()">Enviar por WhatsApp</button>`:''}</div>`);
}

async function open(remitoId,{editar=false,anular=false}={}){
  ensure();
  P.editing=false;P.annulling=false;P.tab='detalle';
  $('rmp-title').textContent='Cargando…';$('rmp-sub').textContent='';$('rmp-tabs').innerHTML='';$('rmp-foot').innerHTML='';
  $('rmp-body').innerHTML='<div class="rmp-loading">Cargando remito…</div>';
  $('rmp-backdrop').hidden=false;$('rmp-panel').hidden=false;
  requestAnimationFrame(()=>$('rmp-panel').classList.add('is-open'));
  const r=typeof obtenerRemitoCompleto==='function'?await obtenerRemitoCompleto(remitoId):null;
  if(!r){$('rmp-body').innerHTML='<div class="rmp-loading is-error">No se pudo cargar el remito.</div>';return}
  P.remito=r;
  [P.servicio,P.encuesta]=await Promise.all([cargarServicio(r.operator_service_id),cargarEncuesta(r.remito_id)]);
  if(editar&&isAdmin()&&r.status!=='anulado')P.editing=true;
  if(anular&&puedeAnular())P.annulling=true;
  render();
  if(P.editing)$('rmp-body').querySelector('[data-rmp-field]')?.focus();
}

function close(){
  const panel=$('rmp-panel');if(!panel||panel.hidden)return;
  if(P.editing&&cambios().length&&!confirm('Tenés cambios sin guardar. ¿Descartarlos?'))return;
  panel.classList.remove('is-open');$('rmp-backdrop').hidden=true;
  setTimeout(()=>{panel.hidden=true},180);
  P.remito=null;P.servicio=null;P.encuesta=null;P.editing=false;P.annulling=false;
}

const puedeAnular=()=>isAdmin()&&P.remito&&P.remito.status!=='anulado'&&!P.remito.operator_service_id;

function valorCampo(c,r){
  const v=r[c.col];
  if(P.editing&&corregible(c,r)){
    const actual=draftValue(c)??'';
    const cambiado=normal(c,actual)!==normal(c,v);
    const input=c.textarea
      ?`<textarea data-rmp-field="${c.col}" rows="3" maxlength="1000">${esc(actual)}</textarea>`
      :`<input data-rmp-field="${c.col}" type="${c.tipo||'text'}" value="${esc(actual)}" autocomplete="off"${c.upper?' style="text-transform:uppercase"':''}>`;
    return`<div class="rmp-edit${cambiado?' is-changed':''}">${input}${cambiado?`<span class="rmp-before">Antes: <s>${esc(v||'—')}</s></span>`:''}</div>`;
  }
  const lock=c.vinculado&&r.operator_service_id?` <span class="rmp-lock" title="${esc(c.vinculado)}">🔗</span>`:'';
  return v?`<span>${esc(v)}</span>${lock}`:`<span class="rmp-empty">Sin cargar</span>${lock}`;
}
function marcarCambio(el){
  const c=CORREGIBLES.find(x=>x.col===el.dataset.rmpField),wrap=el.closest('.rmp-edit');if(!c||!wrap||!P.remito)return;
  const antes=P.remito[c.col],cambiado=normal(c,el.value)!==normal(c,antes);
  wrap.classList.toggle('is-changed',cambiado);
  let b=wrap.querySelector('.rmp-before');
  if(cambiado&&!b){b=document.createElement('span');b.className='rmp-before';b.innerHTML=`Antes: <s>${esc(antes||'—')}</s>`;wrap.appendChild(b)}
  if(!cambiado&&b)b.remove();
}
const draftValue=c=>{const el=$('rmp-panel')?.querySelector(`[data-rmp-field="${c.col}"]`);return el?el.value:P.remito?.[c.col]};
function normal(c,v){let s=String(v??'').trim();if(c.upper)s=s.toUpperCase().replace(/\s+/g,'');return s}
function cambios(){
  if(!P.remito||!P.editing)return[];
  return CORREGIBLES.filter(c=>corregible(c,P.remito)).map(c=>{
    const el=$('rmp-panel').querySelector(`[data-rmp-field="${c.col}"]`);if(!el)return null;
    const antes=P.remito[c.col]??null,nuevo=normal(c,el.value)||null;
    return normal(c,antes)===normal(c,nuevo)?null:{campo:c.col,label:c.label,antes,despues:nuevo};
  }).filter(Boolean);
}

const fila=(label,html)=>`<div class="rmp-row"><span class="rmp-label">${label}</span><span class="rmp-value">${html}</span></div>`;
const seccion=(titulo,cuerpo,extra='')=>`<section class="rmp-sec"><h3>${titulo}${extra}</h3>${cuerpo}</section>`;
const locked=(txt)=>` <span class="rmp-lock-note" title="${esc(txt)}">🔒 ${esc(txt)}</span>`;

function render(){
  const r=P.remito,s=P.servicio;if(!r)return;
  const [cls,label]=estado(r);
  const orden=s?.service_order_number||r.nro_servicio||'';
  $('rmp-title').textContent=orden?`Servicio ${orden}`:`Remito ${r.nro_remito||''}`;
  $('rmp-sub').innerHTML=`<span class="rmx-state ${cls}">${label}</span><span>Remito ${esc(r.nro_remito||'—')}</span>${s?.service_number?`<span>${esc(s.service_number)}</span>`:''}<span>${esc(r.users?.full_name||'—')}</span>`;
  const hist=Array.isArray(r.historial_ediciones)?r.historial_ediciones.length:0;
  $('rmp-tabs').innerHTML=[['detalle','Detalle'],['cambios',`Cambios${hist?` (${hist})`:''}`]].map(([id,t])=>`<button type="button" class="${P.tab===id?'is-active':''}" onclick="RemitoPanel.tab('${id}')">${t}</button>`).join('');
  $('rmp-body').innerHTML=P.tab==='cambios'?renderCambios(r):renderDetalle(r,s);
  renderFoot();
}

function renderDetalle(r,s){
  const campo=col=>CORREGIBLES.find(c=>c.col===col);
  const aviso=porRevisar(r)?`<div class="rmp-alert is-review"><div><b>Cargos por revisar</b><span>El chofer informó cargos que Administración todavía no aprobó.</span></div>${r.operator_service_id&&isAdmin()?`<button class="rmp-btn" type="button" onclick="RemitoPanel.revisar()">Revisar cargos</button>`:''}</div>`:'';
  const anulado=r.status==='anulado'?`<div class="rmp-alert"><div><b>Remito anulado</b><span>No cuenta para rendiciones ni facturación.</span></div></div>`:'';
  const editando=P.editing?`<div class="rmp-alert is-edit"><div><b>Corrigiendo datos</b><span>Solo datos administrativos. Lo que firmó el cliente queda como está.</span></div></div>`:'';
  const cliente=seccion('Cliente',['razon_social','cuit','telefono','email_cliente'].map(c=>fila(campo(c).label,valorCampo(campo(c),r))).join(''));
  const vehiculo=seccion('Vehículo',['patente','marca_modelo'].map(c=>fila(campo(c).label,valorCampo(campo(c),r))).join(''));
  const irServicio=r.operator_service_id&&isAdmin()?`<button class="rmp-link" type="button" onclick="RemitoPanel.irAlServicio()">Editar en el servicio ↗</button>`:'';
  const tipo=s?.tipo||'';
  const servicio=seccion('Servicio',
    fila('N° de servicio',valorCampo(campo('nro_servicio'),r))+
    fila('Tipo',tipo?esc(tipo):'<span class="rmp-empty">Sin clasificar</span>')+
    fila('Recorrido',`${esc(r.origen||'—')} → ${esc(r.destino||'—')}`)+
    fila('Km',r.km_reales!=null?`${Number(r.km_reales).toLocaleString('es-AR')} km`:'<span class="rmp-empty">Sin cargar</span>'),irServicio);
  const aprobado=r.accepted_imp_total_extras!=null&&Number(r.accepted_imp_total_extras)!==Number(r.imp_total_extras||0);
  const pagos=[[r.pago_1_metodo,r.pago_1_monto],[r.pago_2_metodo,r.pago_2_monto]].filter(([m])=>m).map(([m,v])=>`${esc(String(m).charAt(0).toUpperCase()+String(m).slice(1))} ${v!=null?money(v):''}`).join(' + ');
  const cargos=seccion('Cargos y pago',
    fila('Peaje',money(r.imp_peaje))+fila('Excedente',money(r.imp_excedente))+(Number(r.imp_otros)?fila('Otros',money(r.imp_otros)):'')+
    fila('<b>Total firmado</b>',`<b>${money(r.imp_total_extras)}</b>`)+
    (aprobado?fila('Aprobado por Administración',`<b>${money(r.accepted_imp_total_extras)}</b>`):'')+
    fila('Pago',pagos||'<span class="rmp-empty">Sin pago informado</span>'),locked('Firmado por el cliente'));
  const conf=seccion('Conformidades',CONFORMIDADES.map(([col,l])=>{
    const v=r[col];
    const txt=col==='conformidad_arrastre'?(v===true?'<span class="rmp-warn">Activada</span>':'No'):v===true?'Sí':v===false?'<span class="rmp-warn">No</span>':'<span class="rmp-empty">Sin dato</span>';
    return fila(l,txt);
  }).join(''),locked('Firmado por el cliente'));
  const obs=seccion('Observaciones',`<div class="rmp-obs">${valorCampo(campo('observaciones'),r)}</div>`);
  const fotos=Array.isArray(r.foto_urls)?r.foto_urls:[];
  const media=seccion(`Fotos y firma`,`<div class="rmp-media">${fotos.map(u=>`<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Foto del servicio" loading="lazy"></a>`).join('')||'<span class="rmp-empty">Sin fotos</span>'}</div>
    <div class="rmp-sign">${r.firma_imagen_url?`<img src="${esc(r.firma_imagen_url)}" alt="Firma del cliente"><span>Firmado el ${esc(fecha(r.firmado_at))}</span>`:'<span class="rmp-empty">Sin firma</span>'}</div>`);
  return aviso+anulado+editando+`<div class="rmp-grid">${cliente}${vehiculo}</div>`+servicio+cargos+conf+renderEncuesta()+obs+media+(P.annulling?renderAnular():'');
}

function renderAnular(){
  return`<section class="rmp-sec rmp-annul" id="rmp-annul"><h3>Anular remito</h3>
    <p>El remito queda en el listado como <b>Anulado</b> y deja de contar para rendiciones y facturación. No se puede deshacer.</p>
    <label class="rmp-field"><span>Motivo</span><textarea id="rmp-annul-motivo" rows="2" maxlength="500" placeholder="Ej.: cargado dos veces, servicio no realizado"></textarea></label>
    <label class="rmp-check"><input type="checkbox" id="rmp-annul-check"> Confirmo que quiero anular este remito</label></section>`;
}

function renderCambios(r){
  const hist=(Array.isArray(r.historial_ediciones)?r.historial_ediciones:[]).slice().reverse();
  const label=col=>CORREGIBLES.find(c=>c.col===col)?.label||({status:'Estado',_creacion:'Creación'}[col]||col);
  const items=hist.map(h=>{
    const cs=(h.cambios||[]).map(c=>c.campo==='_creacion'?`<li>Creado (${esc(c.despues||'')})</li>`:`<li><b>${esc(label(c.campo))}</b>: <s>${esc(c.antes??'—')}</s> → ${esc(c.despues??'—')}</li>`).join('');
    return`<li class="rmp-tl-item"><div class="rmp-tl-head"><b>${esc(h.user_nombre||'—')}</b><span>${esc(fecha(h.fecha))}</span></div>${h.motivo?`<div class="rmp-tl-reason">“${esc(h.motivo)}”</div>`:''}<ul>${cs}</ul></li>`;
  }).join('');
  const hito=(t,f)=>`<li class="rmp-tl-item is-base"><div class="rmp-tl-head"><b>${t}</b><span>${esc(fecha(f))}</span></div></li>`;
  const base=(r.firmado_at?hito('Firmado por el cliente',r.firmado_at):'')+hito(`Cargado por ${esc(r.users?.full_name||'—')}`,r.created_at_device);
  return`${hist.length?'':'<p class="rmp-empty rmp-pad">Sin correcciones desde que se cargó.</p>'}<ol class="rmp-timeline">${items}${base}</ol>`;
}

function renderFoot(){
  const r=P.remito,foot=$('rmp-foot');if(!r||!foot)return;
  if(P.editing){
    const n=cambios().length,motivo=($('rmp-motivo')?.value||'').trim();
    const prev=$('rmp-motivo')?.value||'';
    if(!$('rmp-motivo')){
      foot.innerHTML=`<div class="rmp-save"><input id="rmp-motivo" maxlength="300" placeholder="Motivo de la corrección (obligatorio)" value="${esc(prev)}"><div class="rmp-save-row"><span id="rmp-changes"></span><button class="rmp-btn ghost" type="button" onclick="RemitoPanel.cancelar()">Cancelar</button><button class="rmp-btn primary" id="rmp-save-btn" type="button" onclick="RemitoPanel.guardar()">Guardar corrección</button></div></div>`;
    }
    $('rmp-changes').textContent=n?`${n} ${n===1?'cambio':'cambios'}`:'Sin cambios';
    $('rmp-save-btn').disabled=!n||!motivo||P.busy;
    return;
  }
  if(P.annulling){
    foot.innerHTML=`<div class="rmp-actions"><span></span><button class="rmp-btn ghost" type="button" onclick="RemitoPanel.cancelar()">Cancelar</button><button class="rmp-btn danger" type="button" onclick="RemitoPanel.confirmarAnular()">Anular remito</button></div>`;
    return;
  }
  const admin=isAdmin();
  const menu=[
    admin&&r.status!=='pendiente'?`<button type="button" onclick="RemitoPanel.pdf()">Descargar PDF</button>`:'',
    r.status==='firmado'?`<button type="button" onclick="RemitoPanel.whatsapp()">Compartir por WhatsApp</button>`:'',
    puedeAnular()?`<button type="button" class="is-danger" onclick="RemitoPanel.anular()">Anular remito</button>`:'',
  ].filter(Boolean).join('');
  const conRevision=porRevisar(r)&&r.operator_service_id&&admin;
  const principal=conRevision
    ?`<button class="rmp-btn primary" type="button" onclick="RemitoPanel.revisar()">Revisar cargos</button>`
    :admin&&r.status!=='anulado'?`<button class="rmp-btn primary" type="button" onclick="RemitoPanel.corregir()">Corregir datos</button>`:'';
  const secundaria=conRevision&&r.status!=='anulado'?`<button class="rmp-btn" type="button" onclick="RemitoPanel.corregir()">Corregir datos</button>`:'';
  foot.innerHTML=`<div class="rmp-actions">${menu?`<details class="rmp-more"><summary aria-label="Más acciones">⋯</summary><div class="rmp-more-menu">${menu}</div></details>`:'<span></span>'}
    ${r.operator_service_id&&admin?`<button class="rmp-btn ghost" type="button" onclick="RemitoPanel.irAlServicio()">Ir al servicio</button>`:''}${secundaria}${principal}</div>`;
}

function tab(id){if(P.editing&&id!=='detalle')return;P.tab=id;render()}
function corregir(){if(!isAdmin()||!P.remito||P.remito.status==='anulado')return;P.editing=true;P.annulling=false;P.tab='detalle';$('rmp-foot').innerHTML='';render();$('rmp-body').querySelector('[data-rmp-field]')?.focus()}
function cancelar(){if(P.editing&&cambios().length&&!confirm('¿Descartar los cambios?'))return;P.editing=false;P.annulling=false;$('rmp-foot').innerHTML='';render()}
function anular(){if(!puedeAnular())return;P.annulling=true;P.editing=false;P.tab='detalle';render();$('rmp-annul')?.scrollIntoView({behavior:'smooth',block:'center'});$('rmp-annul-motivo')?.focus()}

function entrada(cs,motivo){
  let nombre='—',id=null;try{nombre=PERFIL_USUARIO?.full_name||'—';id=USUARIO_ACTUAL?.id||null}catch(_){}
  return{fecha:new Date().toISOString(),user_id:id,user_nombre:nombre,motivo,cambios:cs.map(({campo,antes,despues})=>({campo,antes,despues}))};
}
async function persistir(updates,cs,motivo){
  P.busy=true;renderFoot();
  try{
    const res=await actualizarRemitoAdmin(P.remito.remito_id,updates,entrada(cs,motivo),P.remito.historial_ediciones);
    if(!res.ok)throw new Error(res.msg);
    const r=await obtenerRemitoCompleto(P.remito.remito_id);if(r)P.remito=r;
    if(typeof cargarRemitos==='function')cargarRemitos();
    if(typeof actualizarKpisRemitos==='function')actualizarKpisRemitos();
    return true;
  }catch(e){notify('No se pudo guardar: '+(e.message||e),'error');return false}
  finally{P.busy=false}
}
async function guardar(){
  if(!isAdmin()||!P.editing||P.busy)return;
  const cs=cambios(),motivo=($('rmp-motivo')?.value||'').trim();
  if(!cs.length)return;if(!motivo){$('rmp-motivo')?.focus();return notify('Escribí el motivo de la corrección','warn')}
  const updates=Object.fromEntries(cs.map(c=>[c.campo,c.despues]));
  if(await persistir(updates,cs,motivo)){P.editing=false;$('rmp-foot').innerHTML='';render();notify(`Corrección guardada (${cs.length} ${cs.length===1?'cambio':'cambios'})`)}
}
async function confirmarAnular(){
  if(!puedeAnular()||P.busy)return;
  const motivo=($('rmp-annul-motivo')?.value||'').trim();
  if(!motivo){$('rmp-annul-motivo')?.focus();return notify('Escribí el motivo de la anulación','warn')}
  if(!$('rmp-annul-check')?.checked)return notify('Marcá la confirmación para anular','warn');
  if(await persistir({status:'anulado'},[{campo:'status',antes:P.remito.status,despues:'anulado'}],motivo)){P.annulling=false;render();notify('Remito anulado')}
}

function tarjeta(){const d=typeof _mapRemitoRow==='function'?_mapRemitoRow(P.remito):null;if(!d)return null;if(P.servicio){d.srvOrden=P.servicio.service_order_number||d.nroSrv;d.tipoReal=P.servicio.tipo}const el=document.createElement('div');el.setAttribute('data-rem',JSON.stringify(d));return el}
function pdf(){const el=tarjeta();if(el&&typeof descargarRemitoPDF==='function')descargarRemitoPDF(el)}
function whatsapp(){const el=tarjeta();if(el&&typeof compartirRemitoPorWhatsApp==='function')compartirRemitoPorWhatsApp(el)}
function revisar(){const id=P.remito?.operator_service_id;if(!id||!window.AuxiliosRemitoReviewV2?.open)return notify('La revisión de cargos todavía se está cargando','warn');P.editing=false;close();window.AuxiliosRemitoReviewV2.open(id)}
function irAlServicio(){const id=P.remito?.operator_service_id;if(!id)return;const ver=window.OperatorServices?.viewService;if(typeof ver!=='function')return notify('Servicios todavía se está cargando','warn');P.editing=false;close();ver(id)}

// Acciones desde una fila/tarjeta de la tabla (data-rem).
const idDe=card=>{try{return JSON.parse(card.getAttribute('data-rem'))?.id}catch(_){return null}};
const desdeFila={
  ver:card=>{const id=idDe(card);if(id)open(id)},
  corregir:card=>{const id=idDe(card);if(id)open(id,{editar:true})},
  anular:card=>{const id=idDe(card);if(id)open(id,{anular:true})},
  revisar:card=>{let d=null;try{d=JSON.parse(card.getAttribute('data-rem'))}catch(_){}if(d?.operatorServiceId&&window.AuxiliosRemitoReviewV2?.open)window.AuxiliosRemitoReviewV2.open(d.operatorServiceId);else if(d?.id)open(d.id)},
  servicio:card=>{let d=null;try{d=JSON.parse(card.getAttribute('data-rem'))}catch(_){}const ver=window.OperatorServices?.viewService;if(d?.operatorServiceId&&typeof ver==='function')ver(d.operatorServiceId);else notify('Servicios todavía se está cargando','warn')},
};
document.addEventListener('click',e=>{
  const more=$('rmp-panel')?.querySelector('details.rmp-more[open]');
  if(more&&(!more.contains(e.target)||e.target.closest('.rmp-more-menu button')))more.removeAttribute('open');
  const btn=e.target.closest?.('[data-rmx-action]');if(!btn)return;
  const card=btn.closest('[data-rem]');const fn=desdeFila[btn.dataset.rmxAction];
  if(card&&fn){e.preventDefault();fn(card)}
});

window.RemitoPanel={open,close,tab,corregir,cancelar,guardar,anular,confirmarAnular,revisar,irAlServicio,pdf,whatsapp,_state:P};
})();

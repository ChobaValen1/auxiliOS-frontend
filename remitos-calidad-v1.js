/* AuxiliOS · Remitos · Calidad y cobros v1 (Administración / Supervisión)
   Segunda vista de Remitos, junto a la lista:
   · Indicadores del período: calificación promedio, tasa de respuesta de la
     encuesta, cobrado en el lugar y cobros que el cliente NO confirmó.
   · Para revisar: calificaciones bajas (1–2 ★) y cobros no confirmados, con
     "Marcar revisado" (queda quién y una nota).
   · Por chofer: remitos, encuestas enviadas/respondidas, promedios, cobrado y
     cobros no confirmados.
   · Comentarios recientes.
   Datos: get_remito_quality_summary_v1 / mark_remito_survey_reviewed_v1. */
(()=>{'use strict';
if(window.RemitosCalidad)return;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const role=()=>{try{return PERFIL_USUARIO?.roles?.name||''}catch(_){return''}};
const gestion=()=>['administracion','supervision'].includes(role());
const money=n=>'$ '+Math.round(Number(n)||0).toLocaleString('es-AR');
const pad=n=>String(n).padStart(2,'0');
const fecha=iso=>{if(!iso)return'—';const d=new Date(iso);return isNaN(d)?'—':`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${String(d.getFullYear()).slice(-2)}`};
const prom=v=>v==null?'—':Number(v).toLocaleString('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1});
const pct=(a,b)=>b?Math.round(a*100/b)+'%':'—';
const hoy=new Date(),mesActual=`${hoy.getFullYear()}-${pad(hoy.getMonth()+1)}`;
const S={view:'lista',periodo:{mode:'mes',mes:mesActual},data:null,loading:false,turn:0};

function estrellas(v){if(v==null)return'<span class="rqc-muted">—</span>';const n=Math.round(Number(v));return`<span class="rqc-stars" aria-label="${prom(v)} de 5">${'★'.repeat(n)}<i>${'★'.repeat(5-n)}</i></span>`}

function syncRole(){
  const tabs=$('rmx-views');if(!tabs)return;
  tabs.hidden=!gestion();
  if(!gestion()&&S.view!=='lista')setView('lista');
}

function setView(view){
  S.view=view;
  $('screen-remitos')?.classList.toggle('rmx-view-calidad',view==='calidad');
  document.querySelectorAll('#rmx-views [data-view]').forEach(b=>{const on=b.dataset.view===view;b.classList.toggle('is-active',on);b.setAttribute('aria-selected',on)});
  if(view==='calidad')cargar();
}

function bounds(){if(S.periodo?.mode==='all')return{desde:'2000-01-01',hasta:null};const F=window.AuxFilters;const b=F?.periodBounds?F.periodBounds(S.periodo):{start:null,end:null};return{desde:b.start||null,hasta:b.end||null}}

async function cargar(){
  const box=$('rmx-calidad');if(!box)return;
  const turn=++S.turn;S.loading=true;render();
  try{
    const b=bounds();
    const {data,error}=await _db.rpc('get_remito_quality_summary_v1',{p_desde:b.desde,p_hasta:b.hasta});
    if(error)throw error;
    if(turn!==S.turn)return;
    S.data=data;S.error=null;
  }catch(e){if(turn!==S.turn)return;S.error=e?.message||'No se pudo cargar el resumen'}
  finally{if(turn===S.turn){S.loading=false;render()}}
}

function render(){
  const box=$('rmx-calidad');if(!box)return;
  const F=window.AuxFilters;
  const filtros=`<div class="rqc-bar auxf-bar" id="rqc-filters">${F?F.period({id:'periodo',value:S.periodo,allLabel:'Todo el historial'}):''}<span class="rqc-note">Remitos firmados en el período</span></div>`;
  if(S.loading&&!S.data){box.innerHTML=filtros+'<div class="rqc-empty">Cargando…</div>';bind();return}
  if(S.error){box.innerHTML=filtros+`<div class="rqc-empty is-error">${esc(S.error)} <button class="rqc-link" type="button" onclick="RemitosCalidad.reload()">Reintentar</button></div>`;bind();return}
  const d=S.data||{},t=d.totales||{};
  const alertas=d.alertas||[],pend=alertas.filter(a=>!a.revisado_at),rev=alertas.filter(a=>a.revisado_at);
  const tiles=`<div class="rqc-tiles">
    <div class="rqc-tile"><span>Calificación</span><b>${t.promedio_general!=null?`${prom(t.promedio_general)} <small>/ 5</small>`:'—'}</b><em>${t.respondidas||0} ${t.respondidas===1?'respuesta':'respuestas'}${t.promedio_trato!=null?` · trato ${prom(t.promedio_trato)}`:''}${t.promedio_puntualidad!=null?` · puntualidad ${prom(t.promedio_puntualidad)}`:''}</em></div>
    <div class="rqc-tile"><span>Respuesta a la encuesta</span><b>${pct(t.respondidas||0,t.enviados||0)}</b><em>${t.respondidas||0} de ${t.enviados||0} enviadas · ${t.enviados||0} de ${t.remitos||0} remitos enviados${t.sin_whatsapp?` · ${t.sin_whatsapp} sin WhatsApp`:''}</em></div>
    <div class="rqc-tile"><span>Cobrado en el lugar</span><b>${money(t.cobrado_total)}</b><em>${t.remitos_con_cobro||0} remitos con cobro · efectivo ${money(t.cobrado_efectivo)}</em></div>
    <div class="rqc-tile${t.cobros_no_confirmados?' is-alert':''}"><span>Cobros no confirmados</span><b>${t.cobros_no_confirmados||0}</b><em>${t.cobros_confirmados||0} ${t.cobros_confirmados===1?'confirmado':'confirmados'} por el cliente</em></div>
  </div>`;
  const pocoEnvio=(t.remitos||0)>0&&(t.enviados||0)/(t.remitos||1)<.5?`<p class="rqc-hint">Solo ${pct(t.enviados||0,t.remitos||0)} de los remitos del período se enviaron al cliente. El control de cobro depende de que el cliente reciba el link.</p>`:'';
  const alerta=a=>{
    const tags=[a.cobro_mal?`<span class="rqc-tag is-alert">Cobro no confirmado · remito ${money(a.cobrado)}${a.cobro_informado!=null?` · cliente dice ${money(a.cobro_informado)}`:''}</span>`:'',a.mala?`<span class="rqc-tag is-alert">${estrellas(a.rating_general)} calificación baja</span>`:''].join('');
    return`<article class="rqc-alert${a.revisado_at?' is-done':''}">
      <div class="rqc-alert-main"><div class="rqc-alert-head"><b>Servicio ${esc(a.nro_servicio||a.nro_remito)}</b><span>${esc(a.cliente||'—')} · ${esc(a.chofer)} · ${fecha(a.firmado_at)}</span></div>
      <div class="rqc-tags">${tags}</div>${a.comentario?`<p class="rqc-quote">“${esc(a.comentario)}”</p>`:''}
      ${a.revisado_at?`<p class="rqc-done">Revisado el ${fecha(a.revisado_at)}${a.revisado_nota?` · ${esc(a.revisado_nota)}`:''}</p>`:''}</div>
      <div class="rqc-alert-actions"><button class="rqc-btn" type="button" onclick="abrirDetalleRemitoAdmin(${Number(a.remito_id)})">Ver remito</button>${!a.revisado_at&&role()==='administracion'?`<button class="rqc-btn primary" type="button" onclick="RemitosCalidad.revisar(${Number(a.survey_id)})">Marcar revisado</button>`:''}</div>
    </article>`;
  };
  const seccionAlertas=`<section class="rqc-sec"><h3>Para revisar${pend.length?` <span class="rqc-count is-alert">${pend.length}</span>`:''}</h3>
    ${pend.length?pend.map(alerta).join(''):'<p class="rqc-empty-line">Nada para revisar: sin calificaciones bajas ni cobros no confirmados.</p>'}
    ${rev.length?`<details class="rqc-rev"><summary>Revisadas (${rev.length})</summary>${rev.map(alerta).join('')}</details>`:''}</section>`;
  const ch=(d.choferes||[]).slice().sort((a,b)=>(b.cobros_no_confirmados-a.cobros_no_confirmados)||((a.promedio_general??9)-(b.promedio_general??9))||String(a.chofer).localeCompare(b.chofer));
  const tabla=`<section class="rqc-sec"><h3>Por chofer</h3><div class="rqc-table-wrap"><table class="rqc-table"><thead><tr><th>Chofer</th><th class="n">Remitos</th><th class="n">Enviados</th><th class="n">Respondidas</th><th>Calificación</th><th class="n">Trato</th><th class="n">Puntualidad</th><th class="n">Cobrado</th><th class="n">No confirmados</th></tr></thead><tbody>
    ${ch.length?ch.map(c=>`<tr><td>${esc(c.chofer)}</td><td class="n">${c.remitos}</td><td class="n">${c.enviados}<small> ${pct(c.enviados,c.remitos)}</small>${c.sin_whatsapp?`<small title="Sin WhatsApp"> · ${c.sin_whatsapp} s/WA</small>`:''}</td><td class="n">${c.respondidas}</td><td>${c.promedio_general!=null?`${estrellas(c.promedio_general)} <span class="rqc-num${c.promedio_general<3.5?' is-alert':''}">${prom(c.promedio_general)}</span>`:'<span class="rqc-muted">Sin respuestas</span>'}</td><td class="n">${prom(c.promedio_trato)}</td><td class="n">${prom(c.promedio_puntualidad)}</td><td class="n">${money(c.cobrado_total)}</td><td class="n">${c.cobros_no_confirmados?`<span class="rqc-count is-alert">${c.cobros_no_confirmados}</span>`:'<span class="rqc-muted">0</span>'}</td></tr>`).join(''):'<tr><td colspan="9" class="rqc-empty-line">Sin remitos firmados en el período.</td></tr>'}
  </tbody></table></div></section>`;
  const com=(d.comentarios||[]);
  const comentarios=com.length?`<section class="rqc-sec"><h3>Comentarios recientes</h3>${com.map(c=>`<div class="rqc-comment"><div>${estrellas(c.rating_general)} <b>Servicio ${esc(c.nro_servicio||'—')}</b> <span>${esc(c.chofer)} · ${fecha(c.respondida_at)}</span></div><p>${esc(c.comentario)}</p><button class="rqc-link" type="button" onclick="abrirDetalleRemitoAdmin(${Number(c.remito_id)})">Ver remito</button></div>`).join('')}</section>`:'';
  box.innerHTML=filtros+tiles+pocoEnvio+seccionAlertas+tabla+comentarios;
  bind();
  const badge=$('rmx-views-badge');if(badge){badge.textContent=t.alertas_pendientes?String(t.alertas_pendientes):'';badge.hidden=!t.alertas_pendientes}
}

function bind(){const F=window.AuxFilters,root=$('rqc-filters');if(F&&root)F.bind(root,(id,v)=>{if(id==='periodo'){S.periodo=v;cargar()}})}

async function revisar(id){
  if(role()!=='administracion')return;
  const nota=prompt('Nota de la revisión (opcional). Ej.: se llamó al cliente, se habló con el chofer.','');
  if(nota===null)return;
  try{const {error}=await _db.rpc('mark_remito_survey_reviewed_v1',{p_survey_id:id,p_nota:nota});if(error)throw error;if(typeof toast==='function')toast('Marcado como revisado');cargar()}
  catch(e){if(typeof toast==='function')toast('No se pudo marcar: '+(e?.message||e),'error')}
}

/* Contador de alertas pendientes en la pestaña, aunque la vista no esté abierta. */
async function refrescarBadge(){
  if(!gestion()||S.view==='calidad')return;
  try{const b=bounds();const {data}=await _db.rpc('get_remito_quality_summary_v1',{p_desde:b.desde,p_hasta:b.hasta});const n=data?.totales?.alertas_pendientes||0;const badge=$('rmx-views-badge');if(badge){badge.textContent=n?String(n):'';badge.hidden=!n}}catch(_){}
}

document.addEventListener('click',e=>{const b=e.target.closest?.('#rmx-views [data-view]');if(b)setView(b.dataset.view)});
window.RemitosCalidad={setView,syncRole,reload:cargar,revisar,refrescarBadge,_state:S,_render:render};
})();

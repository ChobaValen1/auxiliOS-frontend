/* AuxiliOS · Jornadas Admin · correcciones, impacto y navegación canónica v2 */
(() => {
  'use strict';

  const state = { current: null, installed: false, originalRender: null };
  const $ = id => document.getElementById(id);
  const db = () => typeof _db === 'undefined' ? null : _db;
  const role = () => String(typeof PERFIL_USUARIO === 'undefined' ? '' : (PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role || '')).toLowerCase();
  const isAdmin = () => role() === 'administracion';
  const allowed = () => ['administracion', 'supervision'].includes(role());
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate = value => { if (!value) return '—'; const raw=String(value).slice(0,10); const [y,m,d]=raw.split('-'); return y&&m&&d?`${d}/${m}/${y}`:raw; };
  const fmtTime = value => value ? String(value).slice(0,5) : '—';
  const fmtMoney = value => Number(value || 0).toLocaleString('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2});
  const notify = (message,type='success') => typeof toast==='function' ? toast(message,type) : console[type==='error'?'error':'log'](message);
  const errorText = error => error?.message || error?.details || 'No se pudo completar la operación';

  function closeToolModal(){ $('jat-modal-root')?.remove(); }
  function mountModal({eyebrow='',title='',body='',footer='',wide=false}){
    closeToolModal();
    const root=document.createElement('div'); root.id='jat-modal-root'; root.className='jat-backdrop';
    root.innerHTML=`<section class="jat-modal ${wide?'wide':''}" role="dialog" aria-modal="true"><header class="jat-head"><div><small>${esc(eyebrow)}</small><h3>${esc(title)}</h3></div><button class="jat-close" type="button" data-jat-close aria-label="Cerrar">×</button></header><div class="jat-body">${body}</div>${footer?`<footer class="jat-footer">${footer}</footer>`:''}</section>`;
    root.addEventListener('click',e=>{if(e.target===root||e.target.closest('[data-jat-close]'))closeToolModal();});
    document.body.appendChild(root); setTimeout(()=>root.querySelector('input,textarea,select,button')?.focus(),0); return root;
  }
  function currentLog(){ return state.current?.log || null; }

  async function refreshCurrent(logId){
    try{ if(typeof window._jadminReload==='function') await window._jadminReload(); }catch(_){}
    if(!logId||typeof window.cargarDetalleJornadaAdmin!=='function')return;
    const det=await window.cargarDetalleJornadaAdmin(logId); if(det&&typeof window._jadminRenderDetalle==='function')window._jadminRenderDetalle(det);
  }

  async function impactFor(logId){
    const {data,error}=await db().rpc('get_daily_log_admin_impact',{p_log_id:logId});
    if(error) throw error; return data||{};
  }
  function impactCopy(impact){
    const liq=impact?.liquidacion;
    if(!liq) return 'No existe una liquidación generada para este período. La corrección actualizará la fuente de datos.';
    if(liq.estado==='pendiente') return 'Impacto: si cambiás kilometraje, la liquidación pendiente se recalculará automáticamente con el nuevo valor.';
    if(liq.estado==='aprobada') return 'Impacto: la liquidación ya está aprobada. No se sobrescribirá; quedará marcada como Requiere revisión y AuxiliOS calculará la diferencia.';
    if(liq.estado==='pagada') return 'Impacto: la liquidación ya está pagada. El pago histórico no se modifica; AuxiliOS registrará la diferencia como ajuste pendiente.';
    return 'AuxiliOS recalculará los derivados afectados por esta corrección.';
  }

  function editModal(){
    if(!isAdmin())return; const log=currentLog(); if(!log)return;
    const root=mountModal({eyebrow:`Jornada #${log.log_id}`,title:'Corregir jornada',wide:true,
      body:`<div class="jat-warning">Toda corrección queda registrada en auditoría. El motivo es obligatorio.</div><div id="jat-impact-preview" class="jat-warning">Analizando impacto contable…</div><form id="jat-edit-form"><div class="jat-grid"><label class="jat-field"><span>KM inicial</span><input name="km_inicio" type="number" min="0" step="1" required value="${esc(log.km_inicio??'')}"></label><label class="jat-field"><span>KM final</span><input name="km_final" type="number" min="0" step="1" value="${esc(log.km_final??'')}" ${log.status==='closed'?'required':''}></label><label class="jat-field"><span>Hora inicio</span><input name="hora_inicio" type="time" value="${esc(fmtTime(log.hora_inicio)==='—'?'':fmtTime(log.hora_inicio))}"></label><label class="jat-field"><span>Hora fin</span><input name="hora_fin" type="time" value="${esc(fmtTime(log.hora_fin)==='—'?'':fmtTime(log.hora_fin))}" ${log.status==='closed'?'required':''}></label><label class="jat-check jat-span-2"><input name="km_excepcion" type="checkbox" ${log.km_excepcion?'checked':''}><span>Permitir excepción de kilometraje solo si el KM final legítimamente queda por debajo del inicial.</span></label><label class="jat-check jat-span-2"><input name="in_workshop" type="checkbox" ${log.in_workshop?'checked':''}><span>La unidad ingresó a taller durante esta jornada.</span></label><label class="jat-field jat-span-2"><span>Detalle de taller</span><textarea name="workshop_detail">${esc(log.workshop_detail||'')}</textarea></label><label class="jat-field jat-span-2"><span>Notas de jornada</span><textarea name="notas">${esc(log.notas||'')}</textarea></label><label class="jat-field jat-span-2"><span>Motivo de la corrección *</span><textarea name="reason" minlength="5" required placeholder="Ej.: el odómetro correcto era 125.040 km"></textarea></label></div><div id="jat-edit-error" class="jat-error"></div></form>`,
      footer:`<button class="btn btn-ghost" type="button" data-jat-close>Cancelar</button><button class="btn btn-primary" type="submit" form="jat-edit-form">Guardar corrección</button>`});
    impactFor(log.log_id).then(i=>{root._impact=i;const el=root.querySelector('#jat-impact-preview');if(el)el.textContent=impactCopy(i);}).catch(()=>{const el=root.querySelector('#jat-impact-preview');if(el)el.textContent='No se pudo anticipar el impacto; la corrección seguirá auditada.';});
    const form=root.querySelector('#jat-edit-form');
    form.addEventListener('submit',async e=>{
      e.preventDefault(); const err=root.querySelector('#jat-edit-error'); err.style.display='none'; const submit=root.querySelector('[type="submit"]'); const fd=new FormData(form);
      const patch={km_inicio:fd.get('km_inicio'),km_final:fd.get('km_final'),hora_inicio:fd.get('hora_inicio'),hora_fin:fd.get('hora_fin'),km_excepcion:form.elements.km_excepcion.checked,in_workshop:form.elements.in_workshop.checked,workshop_detail:fd.get('workshop_detail'),notas:fd.get('notas')};
      const reason=String(fd.get('reason')||'').trim(); if(reason.length<5){err.textContent='Indicá un motivo de al menos 5 caracteres.';err.style.display='block';return;}
      const kmChanged=Number(patch.km_inicio)!==Number(log.km_inicio)||Number(patch.km_final)!==Number(log.km_final);
      const status=root._impact?.liquidacion?.estado;
      if(kmChanged&&['aprobada','pagada'].includes(status)&&!window.confirm(impactCopy(root._impact)+'\n\n¿Confirmás la corrección?'))return;
      submit.disabled=true;submit.textContent='Guardando…';
      try{const {error}=await db().rpc('update_daily_log_admin',{p_log_id:log.log_id,p_patch:patch,p_reason:reason});if(error)throw error;closeToolModal();notify('Jornada corregida y derivados sincronizados');await refreshCurrent(log.log_id);}catch(error){err.textContent=errorText(error);err.style.display='block';submit.disabled=false;submit.textContent='Guardar corrección';}
    });
  }

  function voidModal(){
    if(!isAdmin())return; const det=state.current,log=det?.log;if(!log)return;
    const linkedText=[['remitos',det.trips?.length||0],['combustible',det.fuel_records?.length||0],['rendición',det.rendicion?1:0],['checklist',det.tire_check?1:0],['incidentes',det.incidents?.length||0]].filter(([,n])=>n>0).map(([k,n])=>`${n} ${k}`).join(' · ')||'Sin registros vinculados';
    const root=mountModal({eyebrow:`Jornada #${log.log_id}`,title:'Anular jornada',body:`<div class="jat-warning jat-danger-warning"><b>La jornada se anulará, no se borrará físicamente.</b><br>Se preservan remitos, combustible, rendición, checklist, auditoría y trazabilidad.</div><div class="jat-warning">Registros vinculados: ${esc(linkedText)}</div><form id="jat-void-form"><label class="jat-field"><span>Motivo de anulación *</span><textarea name="reason" minlength="5" required placeholder="Ej.: jornada duplicada creada por error"></textarea></label><div id="jat-void-error" class="jat-error"></div></form>`,footer:`<button class="btn btn-ghost" data-jat-close>Cancelar</button><button class="btn jat-btn-danger" type="submit" form="jat-void-form">Anular jornada</button>`});
    root.querySelector('#jat-void-form').addEventListener('submit',async e=>{e.preventDefault();const reason=String(new FormData(e.currentTarget).get('reason')||'').trim();const err=root.querySelector('#jat-void-error');if(reason.length<5){err.textContent='Indicá un motivo de al menos 5 caracteres.';err.style.display='block';return;}const submit=root.querySelector('[type="submit"]');submit.disabled=true;submit.textContent='Anulando…';try{const {error}=await db().rpc('void_daily_log_admin',{p_log_id:log.log_id,p_reason:reason});if(error)throw error;closeToolModal();if(typeof closeModal==='function')closeModal('modal-jornada-detalle');notify('Jornada anulada. La trazabilidad fue preservada.');if(typeof window._jadminReload==='function')await window._jadminReload();}catch(error){err.textContent=errorText(error);err.style.display='block';submit.disabled=false;submit.textContent='Anular jornada';}});
  }

  function changedFields(before={},after={}){
    const keys=[['km_inicio','KM inicial'],['km_final','KM final'],['hora_inicio','Hora inicio'],['hora_fin','Hora fin'],['status','Estado'],['in_workshop','Taller'],['workshop_detail','Detalle taller'],['notas','Notas'],['correction_reason','Motivo']];
    return keys.filter(([k])=>JSON.stringify(before?.[k])!==JSON.stringify(after?.[k])).map(([k,label])=>`<div class="jat-history-change"><b>${esc(label)}</b><span>${esc(before?.[k]??'—')} → ${esc(after?.[k]??'—')}</span></div>`).join('');
  }
  async function historyModal(){
    const log=currentLog();if(!log)return; const root=mountModal({eyebrow:`Jornada #${log.log_id}`,title:'Historial de cambios',wide:true,body:'<div id="jat-history-list">Cargando historial…</div>',footer:'<button class="btn btn-ghost" data-jat-close>Cerrar</button>'});
    try{const {data,error}=await db().rpc('get_daily_log_admin_history',{p_log_id:log.log_id});if(error)throw error;const el=root.querySelector('#jat-history-list');if(!data?.length){el.innerHTML='<div class="jat-warning">Todavía no hay cambios auditados.</div>';return;}el.innerHTML=data.map(x=>`<article class="jat-history-item"><div class="jat-history-head"><b>${esc(x.actor_name||'Sistema')}</b><span>${new Date(x.occurred_at).toLocaleString('es-AR')} · ${esc(x.operation)}</span></div>${changedFields(x.before_data,x.after_data)||'<div class="jat-history-change"><span>Actualización sin cambios operativos visibles.</span></div>'}</article>`).join('');}catch(error){root.querySelector('#jat-history-list').textContent=errorText(error);}
  }

  async function openRemitoCanonical(trip){
    try{const id=trip?.trip_id;if(!id)throw new Error('Remito sin identificador');const {data,error}=await db().from('remitos').select('*').eq('remito_id',id).maybeSingle();if(error||!data)throw error||new Error('Remito no encontrado');if(typeof closeModal==='function')closeModal('modal-jornada-detalle');if(typeof goTo==='function')goTo('remitos');if(typeof cargarRemitos==='function')await cargarRemitos();setTimeout(()=>{if(typeof verRemitoModal==='function')verRemitoModal(data);else if(typeof verRemito==='function')verRemito(data.nro_remito);},30);}catch(error){notify(errorText(error),'error');}
  }
  async function openFleetCanonical(tab,truckId,recordId=null){
    if(!truckId)return notify('La jornada no tiene móvil asociado','error');if(typeof closeModal==='function')closeModal('modal-jornada-detalle');if(typeof goTo==='function')goTo('camion');
    try{if(typeof window._abrirCamionDetalleAdmin==='function')await window._abrirCamionDetalleAdmin(truckId);if(window.FleetAdminDetailV2?.openTab)window.FleetAdminDetailV2.openTab(tab);if(tab==='combustible'&&window.FleetFuelCRUD?.refresh)await window.FleetFuelCRUD.refresh();if(recordId)setTimeout(()=>{const rows=[...document.querySelectorAll('.ffcrud-table tbody tr')];const row=rows.find(el=>el.textContent.includes(`#${recordId}`));if(row){row.classList.add('jat-highlight');row.scrollIntoView({behavior:'smooth',block:'center'});}},120);}catch(error){notify(errorText(error),'error');}
  }
  function openRenditionCanonical(rend){
    if(typeof closeModal==='function')closeModal('modal-jornada-detalle');if(typeof goTo==='function')goTo('sueldos');setTimeout(()=>{const candidates=[...document.querySelectorAll('#screen-sueldos button,#screen-sueldos .ftab,#screen-sueldos [role="tab"]')];const target=candidates.find(el=>/rendiciones/i.test(el.textContent||''));if(target)target.click();else if(typeof cargarRendicionesTab==='function')cargarRendicionesTab();setTimeout(()=>{const needle=fmtDate(rend?.fecha||currentLog()?.log_date);const rows=[...document.querySelectorAll('#screen-sueldos tr,#screen-sueldos .rend-card')];const row=rows.find(el=>(el.textContent||'').includes(needle));if(row){row.classList.add('jat-highlight');row.scrollIntoView({behavior:'smooth',block:'center'});}},180);},80);
  }

  function addHint(el,label='Abrir →'){if(!el||el.querySelector('.jat-open-hint'))return;const hint=document.createElement('span');hint.className='jat-open-hint';hint.textContent=label;(el.querySelector('.lft > div:first-child, h4, .v')||el).appendChild(hint);}
  function makeClickable(el,handler,label){if(!el||el.dataset.jatClickable==='1')return;el.dataset.jatClickable='1';el.classList.add('jat-clickable');el.tabIndex=0;el.setAttribute('role','button');const run=e=>{if(e.type==='keydown'&&!['Enter',' '].includes(e.key))return;if(e.target.closest('button,a,input,select,textarea'))return;e.preventDefault();handler();};el.addEventListener('click',run);el.addEventListener('keydown',run);addHint(el,label);}
  function cardByTitle(fragment){return [...document.querySelectorAll('#jd-content .jd-card')].find(c=>(c.querySelector('h4')?.textContent||'').toLowerCase().includes(fragment.toLowerCase()));}

  async function restoreModal(row){
    const root=mountModal({eyebrow:`Jornada #${row.log_id}`,title:'Restaurar jornada',body:`<div class="jat-warning">Se restaurará con su estado anterior y se volverán a calcular odómetro y liquidaciones afectadas.</div><form id="jat-restore-form"><label class="jat-field"><span>Motivo de restauración *</span><textarea name="reason" minlength="5" required></textarea></label><div id="jat-restore-error" class="jat-error"></div></form>`,footer:'<button class="btn btn-ghost" data-jat-close>Cancelar</button><button class="btn btn-primary" type="submit" form="jat-restore-form">Restaurar</button>'});
    root.querySelector('#jat-restore-form').addEventListener('submit',async e=>{e.preventDefault();const reason=String(new FormData(e.currentTarget).get('reason')||'').trim();const err=root.querySelector('#jat-restore-error');if(reason.length<5){err.textContent='Indicá un motivo de al menos 5 caracteres.';err.style.display='block';return;}try{const {error}=await db().rpc('restore_daily_log_admin',{p_log_id:row.log_id,p_reason:reason});if(error)throw error;closeToolModal();notify('Jornada restaurada y derivados recalculados');if(typeof window._jadminReload==='function')await window._jadminReload();}catch(error){err.textContent=errorText(error);err.style.display='block';}});
  }
  async function voidedListModal(){
    if(!isAdmin())return;const root=mountModal({eyebrow:'Jornadas',title:'Jornadas anuladas',wide:true,body:'<div id="jat-voided-list">Cargando…</div>',footer:'<button class="btn btn-ghost" data-jat-close>Cerrar</button>'});
    try{const {data,error}=await db().rpc('list_voided_daily_logs_admin',{p_limit:100});if(error)throw error;const el=root.querySelector('#jat-voided-list');if(!data?.length){el.innerHTML='<div class="jat-warning">No hay jornadas anuladas.</div>';return;}el.innerHTML=`<div class="jat-voided-table">${data.map((r,i)=>`<div class="jat-voided-row"><div><b>#${r.log_id} · ${esc(r.driver_name||'—')}</b><span>${fmtDate(r.log_date)} · ${esc(r.truck_plate||'—')} · ${Number(r.km_inicio||0).toLocaleString('es-AR')} → ${Number(r.km_final||0).toLocaleString('es-AR')} km</span><small>${esc(r.void_reason||'Sin motivo')}</small></div><button class="btn btn-ghost" data-restore-index="${i}">Restaurar</button></div>`).join('')}</div>`;el.querySelectorAll('[data-restore-index]').forEach(btn=>btn.addEventListener('click',()=>restoreModal(data[Number(btn.dataset.restoreIndex)])));}catch(error){root.querySelector('#jat-voided-list').textContent=errorText(error);}
  }
  function installVoidedButton(){if(!isAdmin()||$('jat-open-voided'))return;const clear=$('jadmin-f-clear');if(!clear?.parentElement)return;const btn=document.createElement('button');btn.id='jat-open-voided';btn.type='button';btn.className='btn btn-ghost';btn.textContent='Jornadas anuladas';btn.addEventListener('click',voidedListModal);clear.parentElement.appendChild(btn);}

  function installFooterActions(){
    const footer=$('modal-jornada-detalle')?.querySelector('.modal-footer');if(!footer)return;footer.querySelector('#jat-jornada-actions')?.remove();const actions=document.createElement('div');actions.id='jat-jornada-actions';actions.className='jat-actions';
    actions.innerHTML=`${isAdmin()?'<button class="btn btn-ghost" type="button" data-jat-edit>✎ Editar jornada</button>':''}<button class="btn btn-ghost" type="button" data-jat-history>Historial</button>${isAdmin()?'<button class="btn jat-btn-danger" type="button" data-jat-void>Anular jornada</button>':''}`;
    actions.querySelector('[data-jat-edit]')?.addEventListener('click',editModal);actions.querySelector('[data-jat-history]')?.addEventListener('click',historyModal);actions.querySelector('[data-jat-void]')?.addEventListener('click',voidModal);footer.prepend(actions);
  }
  function enhanceDetail(det){
    state.current=det;installFooterActions();
    const serviceItems=[...(cardByTitle('servicios')?.querySelectorAll('.jd-item')||[])];serviceItems.forEach((el,i)=>{if(det.trips?.[i])makeClickable(el,()=>openRemitoCanonical(det.trips[i]),'Abrir Remito →');});
    const fuelItems=[...(cardByTitle('combustible')?.querySelectorAll('.jd-item')||[])];fuelItems.forEach((el,i)=>{if(det.fuel_records?.[i])makeClickable(el,()=>openFleetCanonical('combustible',det.log?.truck_id,det.fuel_records[i].fuel_id),'Abrir Combustible →');});
    const tireCard=cardByTitle('neumáticos');if(det.tire_check&&tireCard)makeClickable(tireCard,()=>openFleetCanonical('neumaticos',det.log?.truck_id),'Abrir Checklist →');
    const rendCard=cardByTitle('rendición');if(det.rendicion&&rendCard)makeClickable(rendCard,()=>openRenditionCanonical(det.rendicion),'Abrir Rendición →');
  }
  function install(){
    if(!allowed())return;installVoidedButton();if(state.installed)return;if(typeof window._jadminRenderDetalle!=='function')return;state.originalRender=window._jadminRenderDetalle;if(state.originalRender.__jatWrapped){state.installed=true;return;}const wrapped=function(det,...args){const result=state.originalRender.call(this,det,...args);try{enhanceDetail(det);}catch(error){console.error('[JornadasAdminTools] enhanceDetail',error);}return result;};wrapped.__jatWrapped=true;window._jadminRenderDetalle=wrapped;state.installed=true;
  }
  let attempts=0;const timer=setInterval(()=>{attempts++;install();if(state.installed&&$('jat-open-voided')||attempts>120)clearInterval(timer);},75);window.addEventListener('auxilios:features-ready',install);
  window.JornadasAdminToolsV1={edit:editModal,voidJourney:voidModal,history:historyModal,voided:voidedListModal,enhance:enhanceDetail};
})();
/* AuxiliOS · Jornadas Admin · correcciones + navegación vinculada v1 */
(() => {
  'use strict';

  const state = { current: null, installed: false, originalRender: null };
  const $ = id => document.getElementById(id);
  const db = () => typeof _db === 'undefined' ? null : _db;
  const role = () => String(typeof PERFIL_USUARIO === 'undefined' ? '' : (PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role || '')).toLowerCase();
  const isAdmin = () => role() === 'administracion';
  const allowed = () => ['administracion', 'supervision'].includes(role());
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtMoney = value => Number(value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
  const fmtDate = value => {
    if (!value) return '—';
    const raw = String(value).slice(0,10); const [y,m,d] = raw.split('-');
    return y && m && d ? `${d}/${m}/${y}` : raw;
  };
  const fmtTime = value => value ? String(value).slice(0,5) : '—';
  const notify = (message, type='success') => typeof toast === 'function' ? toast(message, type) : console[type === 'error' ? 'error' : 'log'](message);
  const errorText = error => error?.message || error?.details || 'No se pudo completar la operación';

  function closeToolModal() { $('jat-modal-root')?.remove(); }

  function mountModal({ eyebrow='', title='', body='', footer='', wide=false }) {
    closeToolModal();
    const root = document.createElement('div');
    root.id = 'jat-modal-root';
    root.className = 'jat-backdrop';
    root.innerHTML = `
      <section class="jat-modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        <header class="jat-head"><div><small>${esc(eyebrow)}</small><h3>${esc(title)}</h3></div><button class="jat-close" type="button" data-jat-close aria-label="Cerrar">×</button></header>
        <div class="jat-body">${body}</div>
        ${footer ? `<footer class="jat-footer">${footer}</footer>` : ''}
      </section>`;
    root.addEventListener('click', event => {
      if (event.target === root || event.target.closest('[data-jat-close]')) closeToolModal();
    });
    document.body.appendChild(root);
    setTimeout(() => root.querySelector('input,textarea,select,button')?.focus(), 0);
    return root;
  }

  function record(label, value, full=false) {
    return `<div class="jat-record ${full ? 'full' : ''}"><small>${esc(label)}</small><b>${value == null || value === '' ? '—' : value}</b></div>`;
  }

  function currentLog() { return state.current?.log || null; }

  async function refreshCurrent(logId) {
    try { if (typeof window._jadminReload === 'function') await window._jadminReload(); } catch (_) {}
    if (!logId || typeof window.cargarDetalleJornadaAdmin !== 'function') return;
    const det = await window.cargarDetalleJornadaAdmin(logId);
    if (det && typeof window._jadminRenderDetalle === 'function') window._jadminRenderDetalle(det);
  }

  function editModal() {
    if (!isAdmin()) return;
    const log = currentLog();
    if (!log) return;
    const root = mountModal({
      eyebrow: `Jornada #${log.log_id}`,
      title: 'Corregir jornada',
      wide: true,
      body: `
        <div class="jat-warning">Toda corrección queda registrada en auditoría. El motivo es obligatorio.</div>
        <form id="jat-edit-form">
          <div class="jat-grid">
            <label class="jat-field"><span>KM inicial</span><input name="km_inicio" type="number" min="0" step="1" required value="${esc(log.km_inicio ?? '')}"></label>
            <label class="jat-field"><span>KM final</span><input name="km_final" type="number" min="0" step="1" value="${esc(log.km_final ?? '')}" ${log.status === 'closed' ? 'required' : ''}></label>
            <label class="jat-field"><span>Hora inicio</span><input name="hora_inicio" type="time" value="${esc(fmtTime(log.hora_inicio) === '—' ? '' : fmtTime(log.hora_inicio))}"></label>
            <label class="jat-field"><span>Hora fin</span><input name="hora_fin" type="time" value="${esc(fmtTime(log.hora_fin) === '—' ? '' : fmtTime(log.hora_fin))}" ${log.status === 'closed' ? 'required' : ''}></label>
            <label class="jat-check jat-span-2"><input name="km_excepcion" type="checkbox" ${log.km_excepcion ? 'checked' : ''}><span>Permitir excepción de kilometraje. Usar únicamente si el KM final legítimamente queda por debajo del inicial.</span></label>
            <label class="jat-check jat-span-2"><input name="in_workshop" type="checkbox" ${log.in_workshop ? 'checked' : ''}><span>La unidad ingresó a taller durante esta jornada.</span></label>
            <label class="jat-field jat-span-2"><span>Detalle de taller</span><textarea name="workshop_detail">${esc(log.workshop_detail || '')}</textarea></label>
            <label class="jat-field jat-span-2"><span>Notas de jornada</span><textarea name="notas">${esc(log.notas || '')}</textarea></label>
            <label class="jat-field jat-span-2"><span>Motivo de la corrección *</span><textarea name="reason" minlength="5" required placeholder="Ej.: el chofer ingresó 125.400 km y el odómetro correcto era 125.040 km"></textarea></label>
          </div>
          <div id="jat-edit-error" class="jat-error"></div>
        </form>`,
      footer: `<button class="btn btn-ghost" type="button" data-jat-close>Cancelar</button><button class="btn btn-primary" type="submit" form="jat-edit-form">Guardar corrección</button>`
    });
    const form = root.querySelector('#jat-edit-form');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const err = root.querySelector('#jat-edit-error');
      err.style.display = 'none';
      const submit = root.querySelector('[type="submit"]');
      const data = new FormData(form);
      const patch = {
        km_inicio: data.get('km_inicio'),
        km_final: data.get('km_final'),
        hora_inicio: data.get('hora_inicio'),
        hora_fin: data.get('hora_fin'),
        km_excepcion: form.elements.km_excepcion.checked,
        in_workshop: form.elements.in_workshop.checked,
        workshop_detail: data.get('workshop_detail'),
        notas: data.get('notas'),
      };
      const reason = String(data.get('reason') || '').trim();
      if (reason.length < 5) { err.textContent = 'Indicá un motivo de al menos 5 caracteres.'; err.style.display = 'block'; return; }
      submit.disabled = true; submit.textContent = 'Guardando…';
      try {
        const { error } = await db().rpc('update_daily_log_admin', { p_log_id: log.log_id, p_patch: patch, p_reason: reason });
        if (error) throw error;
        closeToolModal();
        notify('Jornada corregida correctamente');
        await refreshCurrent(log.log_id);
      } catch (error) {
        err.textContent = errorText(error); err.style.display = 'block';
        submit.disabled = false; submit.textContent = 'Guardar corrección';
      }
    });
  }

  function voidModal() {
    if (!isAdmin()) return;
    const det = state.current; const log = det?.log;
    if (!log) return;
    const linked = {
      remitos: det.trips?.length || 0,
      combustible: det.fuel_records?.length || 0,
      rendicion: det.rendicion ? 1 : 0,
      checklist: det.tire_check ? 1 : 0,
      incidentes: det.incidents?.length || 0,
    };
    const linkedText = Object.entries(linked).filter(([,n]) => n > 0).map(([k,n]) => `${n} ${k}`).join(' · ') || 'Sin registros vinculados';
    const root = mountModal({
      eyebrow: `Jornada #${log.log_id}`,
      title: 'Eliminar jornada',
      body: `
        <div class="jat-warning jat-danger-warning"><b>La jornada se anulará, no se borrará físicamente.</b><br>Desaparecerá de la operación normal pero conservará auditoría y relaciones históricas.</div>
        ${log.status === 'open' ? '<div class="jat-warning">⚠ Esta jornada está abierta. El chofer dejará de verla como jornada activa al refrescar la aplicación.</div>' : ''}
        <div class="jat-record-grid">${record('Fecha', fmtDate(log.log_date))}${record('Chofer', esc(log.chofer?.full_name || '—'))}${record('Móvil', esc(log.truck?.plate || log.patente_camion || '—'))}${record('Vinculados', esc(linkedText), true)}</div>
        <form id="jat-void-form" style="margin-top:16px"><label class="jat-field"><span>Motivo de eliminación *</span><textarea name="reason" minlength="5" required placeholder="Ej.: jornada duplicada creada por error"></textarea></label><div id="jat-void-error" class="jat-error"></div></form>`,
      footer: `<button class="btn btn-ghost" type="button" data-jat-close>Cancelar</button><button class="btn jat-btn-danger" type="submit" form="jat-void-form">Eliminar jornada</button>`
    });
    root.querySelector('#jat-void-form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget; const reason = String(new FormData(form).get('reason') || '').trim();
      const err = root.querySelector('#jat-void-error');
      if (reason.length < 5) { err.textContent='Indicá un motivo de al menos 5 caracteres.'; err.style.display='block'; return; }
      const submit = root.querySelector('[type="submit"]'); submit.disabled=true; submit.textContent='Eliminando…';
      try {
        const { error } = await db().rpc('void_daily_log_admin', { p_log_id: log.log_id, p_reason: reason });
        if (error) throw error;
        closeToolModal();
        if (typeof closeModal === 'function') closeModal('modal-jornada-detalle');
        notify('Jornada eliminada de la operación');
        if (typeof window._jadminReload === 'function') await window._jadminReload();
      } catch (error) {
        err.textContent=errorText(error); err.style.display='block'; submit.disabled=false; submit.textContent='Eliminar jornada';
      }
    });
  }

  async function openRemito(trip) {
    if (!trip) return;
    try {
      let nro = trip.nro_remito || null;
      if (!nro && trip.trip_id && db()) {
        const { data } = await db().from('remitos').select('nro_remito').eq('remito_id', trip.trip_id).maybeSingle();
        nro = data?.nro_remito || null;
      }
      if (!nro) throw new Error('El remito no tiene número visible');
      if (typeof closeModal === 'function') closeModal('modal-jornada-detalle');
      if (typeof goTo === 'function') goTo('remitos');
      if (typeof cargarRemitos === 'function') await cargarRemitos();
      if (typeof verRemito === 'function') verRemito(nro);
      else if (typeof showRemitosView === 'function') showRemitosView('detalle', nro);
    } catch (error) { notify(errorText(error), 'error'); }
  }

  async function openFleet(tab, truckId, fuelId=null) {
    if (!truckId) return notify('La jornada no tiene móvil asociado', 'error');
    closeToolModal();
    if (typeof closeModal === 'function') closeModal('modal-jornada-detalle');
    if (typeof goTo === 'function') goTo('camion');
    try {
      if (typeof window._abrirCamionDetalleAdmin === 'function') await window._abrirCamionDetalleAdmin(truckId);
      if (window.FleetAdminDetailV2?.openTab) window.FleetAdminDetailV2.openTab(tab);
      if (tab === 'combustible' && window.FleetFuelCRUD?.refresh) await window.FleetFuelCRUD.refresh();
      if (fuelId) setTimeout(() => {
        const rows = [...document.querySelectorAll('.ffcrud-table tbody tr')];
        const row = rows.find(el => el.textContent.includes(`#${fuelId}`));
        if (row) { row.classList.add('jat-highlight'); row.scrollIntoView({ behavior:'smooth', block:'center' }); }
      }, 120);
    } catch (error) { notify(errorText(error), 'error'); }
  }

  async function fuelViewer(fuel) {
    if (!fuel?.fuel_id || !db()) return;
    const { data, error } = await db().from('fuel_records').select('*').eq('fuel_id', fuel.fuel_id).maybeSingle();
    if (error || !data) return notify(errorText(error || new Error('Carga no encontrada')), 'error');
    const log = currentLog();
    mountModal({
      eyebrow:`Combustible #${data.fuel_id}`, title:'Ver carga de combustible',
      body:`<div class="jat-record-grid">${record('Fecha',fmtDate(data.fuel_date))}${record('Litros',`${Number(data.liters||0).toLocaleString('es-AR')} L`)}${record('Precio / litro',fmtMoney(data.price_per_liter))}${record('Total',fmtMoney(data.total_cost))}${record('KM al cargar',data.km_at_load == null ? '—' : `${Number(data.km_at_load).toLocaleString('es-AR')} km`)}${record('Medio de pago',esc(data.payment_method || '—'))}${record('Estación',esc(data.gas_station || '—'),true)}${record('Estado',`<span class="jat-pill ${data.status==='voided'?'bad':'ok'}">${esc(data.status || 'active')}</span>`,true)}</div>`,
      footer:`<button class="btn btn-ghost" data-jat-close>Cerrar</button><button class="btn btn-primary" id="jat-open-fleet-fuel">Abrir en Flota · Combustible</button>`
    });
    $('jat-open-fleet-fuel')?.addEventListener('click', () => openFleet('combustible', data.truck_id || log?.truck_id, data.fuel_id));
  }

  async function checklistViewer(check) {
    if (!check?.check_id || !db()) return;
    const { data, error } = await db().from('tire_checks').select('*').eq('check_id', check.check_id).maybeSingle();
    if (error || !data) return notify(errorText(error || new Error('Checklist no encontrado')), 'error');
    const cond = v => ({bueno:'Bueno',regular:'Regular',malo:'Malo'}[v] || v || '—');
    const pill = v => `<span class="jat-pill ${v==='bueno'?'ok':v==='regular'?'warn':v==='malo'?'bad':''}">${esc(cond(v))}</span>`;
    mountModal({
      eyebrow:`Checklist #${data.check_id}`, title:'Ver checklist de neumáticos y frenos',
      body:`<div class="jat-record-grid">${record('Fecha',fmtDate(data.check_date))}${record('Presión',data.pressure_psi ? `${esc(data.pressure_psi)} PSI` : '—')}${record('Neumáticos',pill(data.tire_condition))}${record('Frenos',pill(data.brake_condition))}${record('Observaciones',esc(data.notes || 'Sin observaciones'),true)}</div>`,
      footer:`<button class="btn btn-ghost" data-jat-close>Cerrar</button><button class="btn btn-primary" id="jat-open-fleet-check">Abrir en Flota · Neumáticos y frenos</button>`
    });
    $('jat-open-fleet-check')?.addEventListener('click', () => openFleet('neumaticos', data.truck_id || currentLog()?.truck_id));
  }

  async function renditionViewer(rend) {
    if (!db()) return;
    let query = db().from('rendicion_cierre').select('*');
    query = rend?.rendicion_id ? query.eq('rendicion_id', rend.rendicion_id) : query.eq('log_id', currentLog()?.log_id);
    const { data, error } = await query.order('created_at',{ascending:false}).limit(1).maybeSingle();
    if (error || !data) return notify(errorText(error || new Error('Rendición no encontrada')), 'error');
    const diff = Number(data.diferencia || 0);
    mountModal({
      eyebrow:`Rendición · ${fmtDate(data.fecha)}`, title:'Ver rendición',
      body:`<div class="jat-record-grid">${record('Efectivo esperado',fmtMoney(data.efectivo_esperado))}${record('Efectivo declarado',fmtMoney(data.efectivo_declarado))}${record('Gastos sistema',fmtMoney(data.gastos_sistema))}${record('Gastos extra',fmtMoney(data.gastos_extra))}${record('Diferencia',`<span class="jat-pill ${Math.abs(diff)<.01?'ok':'bad'}">${fmtMoney(diff)}</span>`)}${record('Estado',esc(data.estado || '—'))}${record('Estado administración',esc(data.admin_status || 'pendiente'))}${record('Nota administración',esc(data.admin_nota || '—'))}${record('Notas chofer',esc(data.notas_chofer || '—'),true)}</div>`,
      footer:`<button class="btn btn-ghost" data-jat-close>Cerrar</button><button class="btn btn-primary" id="jat-open-renditions">Abrir módulo Rendiciones</button>`
    });
    $('jat-open-renditions')?.addEventListener('click', () => {
      closeToolModal(); if (typeof closeModal==='function') closeModal('modal-jornada-detalle');
      if (typeof goTo==='function') goTo('sueldos');
      setTimeout(() => {
        const candidates=[...document.querySelectorAll('#screen-sueldos button,#screen-sueldos .ftab,#screen-sueldos [role="tab"]')];
        const target=candidates.find(el=>/rendiciones/i.test(el.textContent||''));
        if(target) target.click(); else if(typeof cargarRendicionesTab==='function') cargarRendicionesTab();
      },80);
    });
  }

  function addHint(el) {
    if (!el || el.querySelector('.jat-open-hint')) return;
    const hint=document.createElement('span'); hint.className='jat-open-hint'; hint.textContent='Ver →';
    const first=el.querySelector('.lft > div:first-child, h4, .v') || el;
    first.appendChild(hint);
  }

  function makeClickable(el, handler) {
    if (!el || el.dataset.jatClickable==='1') return;
    el.dataset.jatClickable='1'; el.classList.add('jat-clickable'); el.tabIndex=0; el.setAttribute('role','button');
    const run=event=>{ if(event.type==='keydown' && !['Enter',' '].includes(event.key)) return; if(event.target.closest('button,a,input,select,textarea')) return; event.preventDefault(); handler(); };
    el.addEventListener('click',run); el.addEventListener('keydown',run); addHint(el);
  }

  function cardByTitle(fragment) {
    return [...document.querySelectorAll('#jd-content .jd-card')].find(card => (card.querySelector('h4')?.textContent || '').toLowerCase().includes(fragment.toLowerCase()));
  }

  function installFooterActions(det) {
    const footer=$('modal-jornada-detalle')?.querySelector('.modal-footer'); if(!footer) return;
    footer.querySelector('#jat-jornada-actions')?.remove();
    if(!isAdmin()) return;
    const actions=document.createElement('div'); actions.id='jat-jornada-actions'; actions.className='jat-actions';
    actions.innerHTML='<button class="btn btn-ghost" type="button" data-jat-edit>✎ Editar jornada</button><button class="btn jat-btn-danger" type="button" data-jat-void>Eliminar jornada</button>';
    actions.querySelector('[data-jat-edit]').addEventListener('click',editModal);
    actions.querySelector('[data-jat-void]').addEventListener('click',voidModal);
    footer.prepend(actions);
  }

  function enhanceDetail(det) {
    state.current=det;
    installFooterActions(det);
    const serviceCard=cardByTitle('servicios');
    const serviceItems=[...(serviceCard?.querySelectorAll('.jd-item')||[])];
    serviceItems.forEach((el,i)=>{ if(det.trips?.[i]) makeClickable(el,()=>openRemito(det.trips[i])); });
    const fuelCard=cardByTitle('combustible');
    const fuelItems=[...(fuelCard?.querySelectorAll('.jd-item')||[])];
    fuelItems.forEach((el,i)=>{ if(det.fuel_records?.[i]) makeClickable(el,()=>fuelViewer(det.fuel_records[i])); });
    const tireCard=cardByTitle('neumáticos'); if(det.tire_check && tireCard) makeClickable(tireCard,()=>checklistViewer(det.tire_check));
    const rendCard=cardByTitle('rendición'); if(det.rendicion && rendCard) makeClickable(rendCard,()=>renditionViewer(det.rendicion));
  }

  function install() {
    if (state.installed || !allowed()) return;
    if (typeof window._jadminRenderDetalle !== 'function') return;
    state.originalRender=window._jadminRenderDetalle;
    if(state.originalRender.__jatWrapped){state.installed=true;return;}
    const wrapped=function(det,...args){const result=state.originalRender.call(this,det,...args);try{enhanceDetail(det);}catch(error){console.error('[JornadasAdminTools] enhanceDetail',error);}return result;};
    wrapped.__jatWrapped=true; window._jadminRenderDetalle=wrapped; state.installed=true;
  }

  let attempts=0; const timer=setInterval(()=>{attempts++;install();if(state.installed||attempts>80)clearInterval(timer);},75);
  window.addEventListener('auxilios:features-ready',install);
  window.JornadasAdminToolsV1={edit:editModal,voidJourney:voidModal,enhance:enhanceDetail,openFuel:fuelViewer,openChecklist:checklistViewer,openRendition:renditionViewer};
})();

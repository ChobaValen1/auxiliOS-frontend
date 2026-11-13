/* AuxiliOS · Servicios enganchados · clip en la columna Código (12/11/2026)
   En la tabla de Operaciones, los servicios que forman parte de un enganche muestran un clip al final del
   código. Al pasar el mouse, tocar o enfocar el clip aparece un micro resumen (viene de / sigue con / cómo se factura).
   Una sola consulta liviana por tabla (list_operator_service_chain_route_modes_v1); el detalle se pide recién al abrir.
   Servicio con relevo (13/11/2026): los servicios con dos choferes llevan además un ícono violeta de relevo en el mismo lugar,
   con su resumen (tramo 1, tramo 2, punto de intercambio y estado de la entrega). Sale de list_operator_service_relays_v1. */
(() => {
  'use strict';
  const db = () => (typeof _db !== 'undefined' ? _db : null);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TTL = 45000;
  const modes = new Map();      // service_id → { mode: string|null, at }
  const details = new Map();    // service_id → { data, at }
  const relays = new Map();     // service_id → { data: relevo|null, at }
  let inflight = false, pop = null, anchor = null, pinned = false, hideTimer = 0;

  const ROLE = {
    base_origin_destination: { text: 'Servicio enganchado: sigue con otro servicio', short: 'Es el primero de la cadena' },
    origin_destination: { text: 'Servicio enganchado: viene de uno y sigue con otro', short: 'Está en el medio de la cadena' },
    origin_destination_base: { text: 'Servicio enganchado: viene de otro servicio', short: 'Es el último de la cadena' }
  };
  const place = v => String(v || '—').split(',')[0];
  const fresh = e => e && Date.now() - e.at < TTL;
  const icon = '<svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#paperclip"/></svg>';
  const relayIcon = '<svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#repeat"/></svg>';

  /* Dónde vive cada tabla: filas, cómo sacar el id, en qué celda va el clip y (Facturación) dónde se aclara el recorrido. */
  const SOURCES = [
    { rows: '#os-table-body tr[data-service-id]', id: tr => tr.dataset.serviceId, cells: ['td.col-code'] },
    { rows: '#screen-facturacion .ob-table tr[data-billing-service]', id: tr => tr.dataset.billingService,
      cells: ['td[data-col="order"]', 'td[data-col="datetime"]'], km: 'td[data-col="km"]' }
  ];
  const sourceRows = () => SOURCES.flatMap(src => [...document.querySelectorAll(src.rows)].map(tr => ({ src, tr, id: src.id(tr) })));
  const routeLabel = mode => (window.AuxEngancheServicio?._label || {})[
    mode === 'base_origin_destination' ? 'base_origin_destination' : mode === 'origin_destination_base' ? 'origin_destination_base' : 'origin_destination'] || '';

  /* Ícono de relevo: al final del código, junto al clip si lo hay. */
  function decorateRelay(tr, td, id) {
    const r = relays.get(id)?.data, has = td?.querySelector('.os-relay-mark');
    tr.classList.toggle('os-relay-row', Boolean(r));
    if (!r || !td) { has?.remove(); return; }
    const label = r.handed_over ? 'Servicio con relevo: el vehículo ya se entregó' : 'Servicio con relevo: esperando la entrega del vehículo';
    if (has) { if (has.getAttribute('aria-label') !== label) has.setAttribute('aria-label', label); has.dataset.relayDone = String(Boolean(r.handed_over)); return; }
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'os-relay-mark'; b.dataset.serviceId = id; b.dataset.relayDone = String(Boolean(r.handed_over));
    b.setAttribute('aria-label', label); b.setAttribute('aria-haspopup', 'true'); b.setAttribute('aria-expanded', 'false');
    b.innerHTML = relayIcon;
    td.appendChild(b);
  }

  function decorate() {
    for (const { src, tr, id } of sourceRows()) {
      const mode = modes.get(id)?.mode, ok = Boolean(mode && ROLE[mode]);
      const td = src.cells.map(sel => tr.querySelector(sel)).find(Boolean);
      decorateRelay(tr, td, id);
      const has = td?.querySelector('.os-chain-clip');
      if (!ok || !td) { has?.remove(); tr.querySelector('.ob-chain-route')?.remove(); continue; }
      if (has) { if (has.dataset.chainMode !== mode) { has.dataset.chainMode = mode; has.setAttribute('aria-label', ROLE[mode].text); } }
      else {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'os-chain-clip'; b.dataset.chainMode = mode; b.dataset.serviceId = id;
        b.setAttribute('aria-label', ROLE[mode].text); b.setAttribute('aria-haspopup', 'true'); b.setAttribute('aria-expanded', 'false');
        b.innerHTML = icon;
        td.appendChild(b);
      }
      const kmCell = src.km && tr.querySelector(src.km);
      if (kmCell) {
        let r = kmCell.querySelector('.ob-chain-route');
        const text = routeLabel(mode);
        if (!r) { r = document.createElement('small'); r.className = 'ob-chain-route'; kmCell.appendChild(r); }
        if (r.textContent !== text) r.textContent = text;
        r.title = 'Recorrido que se factura por estar enganchado';
      }
    }
    queueGroup();
  }

  /* Filas enganchadas: barra celeste a la izquierda; si A y B quedan una al lado de la otra, la barra las une. */
  const idFor = tr => tr?.dataset?.serviceId || tr?.dataset?.billingService || '';
  let grouping = false;
  function queueGroup() {
    if (grouping) return;
    grouping = true;
    Promise.resolve().then(groupRows).catch(() => {}).finally(() => { grouping = false; });
  }
  async function groupRows() {
    const all = sourceRows(), chained = all.filter(r => modes.get(r.id)?.mode);
    for (const r of all) if (!modes.get(r.id)?.mode) r.tr.classList.remove('os-chain-row', 'is-chain-join-next', 'is-chain-join-prev');
    for (const r of chained) r.tr.classList.add('os-chain-row');
    await Promise.all(chained.slice(0, 80).map(r => loadDetail(r.id).catch(() => null)));
    for (const r of chained) {
      const d = details.get(r.id)?.data;
      const next = r.tr.nextElementSibling, prev = r.tr.previousElementSibling;
      r.tr.classList.toggle('is-chain-join-next', Boolean(d?.next && next && idFor(next) === String(d.next.service_id)));
      r.tr.classList.toggle('is-chain-join-prev', Boolean(d?.previous && prev && idFor(prev) === String(d.previous.service_id)));
    }
  }

  /* Filtro «Enganchados»: se pide el estado de todos los servicios de la vista (de a 1000) y se guarda. */
  let warming = false;
  const isChained = id => Boolean(modes.get(String(id))?.mode);
  async function warm(ids) {
    const client = db();
    const need = [...new Set((ids || []).map(String))].filter(id => !(modes.get(id) && Date.now() - modes.get(id).at < 300000)).slice(0, 2000);
    if (!need.length || !client || warming) return false;
    warming = true;
    let changed = false;
    try {
      for (let i = 0; i < need.length; i += 1000) {
        const chunk = need.slice(i, i + 1000);
        try {
          const { data, error } = await client.rpc('list_operator_service_chain_route_modes_v1', { p_service_ids: chunk });
          if (error) throw error;
          const now = Date.now();
          for (const id of chunk) { const mode = data?.[id] || null; if (Boolean(mode) !== isChained(id)) changed = true; modes.set(id, { mode, at: now }); }
          if (await fetchRelays(chunk)) changed = true;
        } catch (e) {
          const now = Date.now() - TTL + 8000;
          for (const id of chunk) if (!modes.has(id)) modes.set(id, { mode: null, at: now });
        }
      }
    } finally { warming = false; }
    if (changed) document.dispatchEvent(new CustomEvent('auxilios:chain-modes-ready'));
    return changed;
  }

  /* Relevos de un grupo de servicios: una sola consulta. Sin permiso (p. ej. chofer) o sin la actualización de la base: sin ícono. */
  async function fetchRelays(ids) {
    const client = db();
    if (!client || !ids.length) return false;
    let changed = false;
    try {
      const { data, error } = await client.rpc('list_operator_service_relays_v1', { p_service_ids: ids });
      if (error) throw error;
      const now = Date.now();
      for (const id of ids) { const d = data?.[id] || null; if (JSON.stringify(d) !== JSON.stringify(relays.get(id)?.data ?? null)) changed = true; relays.set(id, { data: d, at: now }); }
    } catch (e) {
      const now = Date.now() - TTL + 8000;
      for (const id of ids) if (!relays.has(id)) relays.set(id, { data: null, at: now });
    }
    return changed;
  }
  const isRelay = id => Boolean(relays.get(String(id))?.data);
  const relayOf = id => relays.get(String(id))?.data || null;

  async function refresh() {
    const client = db();
    if (!client || inflight) return decorate();
    const ids = [...new Set(sourceRows().map(r => r.id))].filter(id => !fresh(modes.get(id)) || !fresh(relays.get(id)));
    decorate();
    if (!ids.length) return;
    inflight = true;
    void fetchRelays(ids).then(changed => { if (changed) decorate(); });
    try {
      const { data, error } = await client.rpc('list_operator_service_chain_route_modes_v1', { p_service_ids: ids });
      if (error) throw error;
      const now = Date.now();
      for (const id of ids) modes.set(id, { mode: data?.[id] || null, at: now });
    } catch (e) {
      /* Sin permiso o sin red: la tabla sigue igual, sin clip. Se reintenta en el próximo ciclo. */
      const now = Date.now() - TTL + 8000;
      for (const id of ids) if (!modes.has(id)) modes.set(id, { mode: null, at: now });
    }
    inflight = false;
    decorate();
  }

  async function loadDetail(id) {
    const hit = details.get(id);
    if (fresh(hit)) return hit.data;
    const { data, error } = await db().rpc('get_operator_service_chain_v1', { p_service_id: id });
    if (error) throw error;
    details.set(id, { data, at: Date.now() });
    return data;
  }

  const line = (label, s) => s ? `<p><span>${label}</span><b>${esc(s.label || 'Servicio')}</b><small>${esc(place(s.origin))} → ${esc(place(s.destination))}</small></p>` : '';
  function body(mode, d) {
    const L = window.AuxEngancheServicio?._label || {};
    return `<div class="os-chain-pop-head">${icon}<b>Servicio enganchado</b></div>
      ${line('Viene de', d?.previous)}${line('Sigue con', d?.next)}
      <p class="os-chain-pop-route"><span>Se factura</span><b>${esc(L[mode] || mode)}</b></p>
      <small class="os-chain-pop-note">Cada servicio cobra su movida; entre uno y otro no se factura la vuelta a la base.</small>`;
  }

  const hhmm = v => { try { return new Date(v).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch { return ''; } };
  const truckTxt = (label, plate) => [label && `Móvil ${label}`, plate].filter(Boolean).join(' · ');
  function relayBody(r) {
    if (!r) return `<div class="os-chain-pop-head">${relayIcon}<b>Servicio con relevo</b></div><small class="os-chain-pop-note">No se pudo leer el relevo.</small>`;
    const t1 = [r.from_driver_name || 'Primer chofer', truckTxt(r.from_truck_label, r.from_truck_plate)].filter(Boolean).join(' · ');
    const jornada = r.to_truck_label ? truckTxt(r.to_truck_label, r.to_truck_plate) : '';
    const t2 = [r.to_driver_name || 'Segundo chofer', jornada || (r.handed_over ? '' : 'sin jornada iniciada')].filter(Boolean).join(' · ');
    const state = r.delivered ? `Entregado en destino${r.delivered_at ? ` a las ${hhmm(r.delivered_at)}` : ''}${r.delivery_source === 'operator' ? ' (lo marcó Operaciones)' : ''}`
      : r.handed_over ? `Entregado en el punto de encuentro${r.handed_over_at ? ` a las ${hhmm(r.handed_over_at)}` : ''}${r.handover_source === 'operator' ? ' (lo marcó Operaciones)' : ''} · falta la entrega en destino`
      : r.has_remito ? 'Remito hecho · esperando la entrega del vehículo' : 'Esperando la entrega del vehículo · el remito lo hace el 1º chofer';
    return `<div class="os-chain-pop-head os-relay-pop-head">${relayIcon}<b>Servicio con relevo</b></div>
      <p><span>Tramo 1 · A → B</span><b>${esc(t1)}</b></p>
      <p><span>Punto de intercambio</span><b>${esc(place(r.exchange_address))}</b></p>
      <p><span>Tramo 2 · B → C</span><b>${esc(t2)}</b></p>
      <p class="os-chain-pop-route os-relay-pop-state${r.delivered ? ' is-done' : ''}"><span>Estado</span><b>${esc(state)}</b></p>
      ${!r.handed_over && canHandover() ? `<button type="button" class="os-relay-handover" data-relay-handover="${esc(r.service_id)}">Marcar entrega del vehículo</button>` : ''}
      ${r.handed_over && !r.delivered && canHandover() ? `<button type="button" class="os-relay-handover" data-relay-delivered="${esc(r.service_id)}">Marcar entrega en destino</button>` : ''}
      <small class="os-chain-pop-note">Un solo servicio y un solo remito: lo hace el 1º chofer con el cliente. Los dos cuentan el servicio completo.</small>`;
  }
  const canHandover = () => ['administracion', 'operador'].includes(typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO?.roles?.name : '');
  /* Operaciones puede marcar la entrega si el chofer no pudo (mismo efecto que el botón del chofer). Doble toque para confirmar. */
  async function markHandover(btn) {
    const dest = Boolean(btn.dataset.relayDelivered), id = btn.dataset.relayHandover || btn.dataset.relayDelivered, client = db();
    const idle = dest ? 'Marcar entrega en destino' : 'Marcar entrega del vehículo';
    if (!client || btn.disabled) return;
    if (btn.dataset.sure !== '1') { btn.dataset.sure = '1'; btn.textContent = 'Tocá de nuevo para confirmar la entrega'; return; }
    btn.disabled = true; btn.textContent = 'Marcando…';
    try {
      const { error } = await client.rpc(dest ? 'mark_operator_service_relay_delivered_v1' : 'mark_operator_service_relay_handover_v1', { p_service_id: id });
      if (error) throw error;
      relays.delete(id); await fetchRelays([id]);
      if (pop && !pop.hidden && anchor?.dataset.serviceId === id) { pop.innerHTML = relayBody(relayOf(id)); place_(pop); }
      if (typeof window.toast === 'function') window.toast(dest ? 'Listo: el vehículo quedó entregado en destino' : 'Vehículo entregado: el servicio pasó al segundo chofer', 'success');
      try { await window.OperatorServices?.loadServices?.(); } catch (_) {}
      decorate();
    } catch (e) {
      btn.disabled = false; btn.dataset.sure = ''; btn.textContent = idle;
      const msg = String(e?.message || 'No se pudo marcar la entrega').replace(/^[A-Z_]{4,}:\s*/, '');
      if (typeof window.toast === 'function') window.toast(msg, 'error'); else console.error(msg);
    }
  }

  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement('div');
    pop.id = 'os-chain-pop'; pop.className = 'os-chain-pop'; pop.setAttribute('role', 'tooltip'); pop.hidden = true;
    pop.addEventListener('click', e => { const b = e.target.closest?.('[data-relay-handover],[data-relay-delivered]'); if (b) { e.preventDefault(); e.stopPropagation(); markHandover(b); } });
    pop.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    pop.addEventListener('mouseleave', () => { if (!pinned) schedule(); });
    document.body.appendChild(pop);
    return pop;
  }
  function place_(el) {
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight, m = 8;
    const left = Math.max(m, Math.min(window.innerWidth - w - m, r.left + r.width / 2 - w / 2));
    const below = r.bottom + 6 + h <= window.innerHeight - m;
    el.style.left = `${left}px`;
    el.style.top = `${below ? r.bottom + 6 : Math.max(m, r.top - h - 6)}px`;
  }
  async function open(btn, pin) {
    clearTimeout(hideTimer);
    if (anchor && anchor !== btn) anchor.setAttribute('aria-expanded', 'false');
    anchor = btn; pinned = Boolean(pin);
    btn.setAttribute('aria-expanded', 'true'); btn.setAttribute('aria-describedby', 'os-chain-pop');
    const el = ensurePop(), mode = btn.dataset.chainMode, id = btn.dataset.serviceId;
    if (btn.classList.contains('os-relay-mark')) { el.hidden = false; el.dataset.state = 'ready'; el.innerHTML = relayBody(relayOf(id)); place_(el); return; }
    el.hidden = false; el.dataset.state = 'loading';
    el.innerHTML = `<div class="os-chain-pop-head">${icon}<b>Servicio enganchado</b></div><small class="os-chain-pop-note">${esc(ROLE[mode]?.short || 'Cargando')}. Cargando el detalle…</small>`;
    place_(el);
    try {
      const d = await loadDetail(id);
      if (anchor !== btn) return;
      el.dataset.state = 'ready'; el.innerHTML = body(mode, d);
    } catch (e) {
      if (anchor !== btn) return;
      el.dataset.state = 'error';
      el.innerHTML = `<div class="os-chain-pop-head">${icon}<b>Servicio enganchado</b></div><small class="os-chain-pop-note">${esc(ROLE[mode]?.text || '')}. No se pudo leer el detalle.</small>`;
    }
    place_(el);
  }
  function close() {
    clearTimeout(hideTimer);
    if (pop) pop.hidden = true;
    if (anchor) { anchor.setAttribute('aria-expanded', 'false'); anchor.removeAttribute('aria-describedby'); }
    anchor = null; pinned = false;
  }
  const schedule = () => { clearTimeout(hideTimer); hideTimer = setTimeout(close, 160); };
  const clipOf = t => t?.closest?.('.os-chain-clip, .os-relay-mark');

  /* Capturando antes que la fila, para que tocar el clip no abra el servicio. */
  document.addEventListener('click', e => {
    const b = clipOf(e.target);
    if (b) { e.preventDefault(); e.stopPropagation(); if (anchor === b && pinned) close(); else open(b, true); return; }
    if (anchor && !e.target.closest?.('#os-chain-pop')) close();
  }, true);
  document.addEventListener('mouseover', e => { const b = clipOf(e.target); if (b && !pinned) open(b, false); });
  document.addEventListener('mouseout', e => { const b = clipOf(e.target); if (b && !pinned && !b.contains(e.relatedTarget)) schedule(); });
  document.addEventListener('focusin', e => { const b = clipOf(e.target); if (b && !pinned) open(b, false); });
  document.addEventListener('focusout', e => { if (clipOf(e.target) && !pinned) schedule(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && anchor) { const a = anchor; close(); a.focus?.({ preventScroll: true }); } });
  window.addEventListener('scroll', () => { if (anchor) close(); }, true);
  window.addEventListener('resize', close);
  document.addEventListener('auxilios:services-rendered', refresh);
document.addEventListener('auxilios:billing-rendered', refresh);

  /* Mapa: detalle (previous/next con coordenadas) de los servicios enganchados ya consultados, y carga de los que faltan. */
  const cachedDetail = id => details.get(String(id))?.data || null;
  const modeOf = id => modes.get(String(id))?.mode || null;
  let loadingDetails = false;
  async function ensureDetails(ids) {
    const need = [...new Set((ids || []).map(String))].filter(id => isChained(id) && !details.get(id)).slice(0, 80);
    if (!need.length || !db() || loadingDetails) return false;
    loadingDetails = true;
    let changed = false;
    await Promise.all(need.map(async id => { try { await loadDetail(id); changed = true; } catch (e) { /* sin detalle: se reintenta luego */ } }));
    loadingDetails = false;
    if (changed) document.dispatchEvent(new CustomEvent('auxilios:chain-details-ready'));
    return changed;
  }

  /* Facturación: de lo seleccionado, qué servicios enganchados tienen a su compañero fuera de la selección.
     Devuelve [{ id, label, missing: [{ id, label, relation }] }]. Sólo informa: no bloquea nada. */
  async function selectionGaps(selectedIds) {
    const ids = [...new Set((selectedIds || []).map(String))];
    if (!ids.length || !db()) return [];
    const need = ids.filter(id => !fresh(modes.get(id)));
    if (need.length) {
      try {
        const { data, error } = await db().rpc('list_operator_service_chain_route_modes_v1', { p_service_ids: need });
        if (error) throw error;
        const now = Date.now();
        for (const id of need) modes.set(id, { mode: data?.[id] || null, at: now });
      } catch (e) { return []; }
    }
    const chained = ids.filter(id => modes.get(id)?.mode);
    const out = [];
    const sel = new Set(ids);
    await Promise.all(chained.map(async id => {
      try {
        const d = await loadDetail(id);
        const missing = [];
        if (d?.previous && !sel.has(String(d.previous.service_id))) missing.push({ id: d.previous.service_id, label: d.previous.label, relation: 'viene de' });
        if (d?.next && !sel.has(String(d.next.service_id))) missing.push({ id: d.next.service_id, label: d.next.label, relation: 'sigue con' });
        if (missing.length) out.push({ id, label: d?.service?.label || '', missing });
      } catch (e) { /* sin detalle: no se avisa */ }
    }));
    return out;
  }

  /* Al cambiar un enganche se vuelve a leer. */
  window.AuxEngancheClip = { refresh, selectionGaps, isChained, isRelay, relayOf, warm, cached: cachedDetail, modeOf, ensureDetails, invalidate() { modes.clear(); details.clear(); relays.clear(); refresh(); }, _decorate: decorate };
})();

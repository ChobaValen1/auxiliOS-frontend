/* AuxiliOS · Servicios enganchados · clip en la columna Código (12/11/2026)
   En la tabla de Operaciones, los servicios que forman parte de un enganche muestran un clip al final del
   código. Al pasar el mouse, tocar o enfocar el clip aparece un micro resumen (viene de / sigue con / cómo se factura).
   Una sola consulta liviana por tabla (list_operator_service_chain_route_modes_v1); el detalle se pide recién al abrir. */
(() => {
  'use strict';
  const db = () => (typeof _db !== 'undefined' ? _db : null);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TTL = 45000;
  const modes = new Map();      // service_id → { mode: string|null, at }
  const details = new Map();    // service_id → { data, at }
  let inflight = false, pop = null, anchor = null, pinned = false, hideTimer = 0;

  const ROLE = {
    base_origin_destination: { text: 'Servicio enganchado: sigue con otro servicio', short: 'Es el primero de la cadena' },
    origin_destination: { text: 'Servicio enganchado: viene de uno y sigue con otro', short: 'Está en el medio de la cadena' },
    origin_destination_base: { text: 'Servicio enganchado: viene de otro servicio', short: 'Es el último de la cadena' }
  };
  const place = v => String(v || '—').split(',')[0];
  const fresh = e => e && Date.now() - e.at < TTL;
  const icon = '<svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#paperclip"/></svg>';

  /* Dónde vive cada tabla: filas, cómo sacar el id, en qué celda va el clip y (Facturación) dónde se aclara el recorrido. */
  const SOURCES = [
    { rows: '#os-table-body tr[data-service-id]', id: tr => tr.dataset.serviceId, cells: ['td.col-code'] },
    { rows: '#screen-facturacion .ob-table tr[data-billing-service]', id: tr => tr.dataset.billingService,
      cells: ['td[data-col="order"]', 'td[data-col="datetime"]'], km: 'td[data-col="km"]' }
  ];
  const sourceRows = () => SOURCES.flatMap(src => [...document.querySelectorAll(src.rows)].map(tr => ({ src, tr, id: src.id(tr) })));
  const routeLabel = mode => (window.AuxEngancheServicio?._label || {})[
    mode === 'base_origin_destination' ? 'base_origin_destination' : mode === 'origin_destination_base' ? 'origin_destination_base' : 'origin_destination'] || '';

  function decorate() {
    for (const { src, tr, id } of sourceRows()) {
      const mode = modes.get(id)?.mode, ok = Boolean(mode && ROLE[mode]);
      const td = src.cells.map(sel => tr.querySelector(sel)).find(Boolean);
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
  }

  async function refresh() {
    const client = db();
    if (!client || inflight) return decorate();
    const ids = [...new Set(sourceRows().map(r => r.id))].filter(id => !fresh(modes.get(id)));
    decorate();
    if (!ids.length) return;
    inflight = true;
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

  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement('div');
    pop.id = 'os-chain-pop'; pop.className = 'os-chain-pop'; pop.setAttribute('role', 'tooltip'); pop.hidden = true;
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
  const clipOf = t => t?.closest?.('.os-chain-clip');

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
  window.AuxEngancheClip = { refresh, selectionGaps, invalidate() { modes.clear(); details.clear(); refresh(); }, _decorate: decorate };
})();

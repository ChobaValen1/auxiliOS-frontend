/* AuxiliOS · Servicios enganchados (12/11/2026)
   El móvil termina un servicio y sigue con otro de la misma prestadora sin volver a la base.
   En el formulario del servicio B se elige «Enganchado a» A. El recorrido facturado queda:
     A: Base → Origen → Destino        B: Origen → Destino → Base        (en el medio: Origen → Destino)
   Cada servicio cobra su movida y sus km. Los km de B se calculan con su recorrido al guardar; los de A
   se recalculan acá y se guardan junto con el enganche (set_operator_service_chain_v1).
   Se monta como Tercerizado y Pinacars: sync(w) al dibujar y persist(w, id) después de guardar. */
(() => {
  'use strict';
  const db = () => (typeof _db !== 'undefined' ? _db : null);
  const W = () => window.OperatorServices?.S?.wizard || null;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const has = v => v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(Number(v));
  const notify = (m, t = 'info') => (typeof window.toast === 'function' ? window.toast(m, t) : console[t === 'error' ? 'error' : 'log'](m));

  const FULL = 'base_origin_destination_base';
  const LABEL = {
    base_origin_destination_base: 'Base → Origen → Destino → Base',
    base_origin_destination: 'Base → Origen → Destino',
    origin_destination_base: 'Origen → Destino → Base',
    origin_destination: 'Origen → Destino',
    base_origin: 'Base → Origen'
  };

  /* Recorrido según el lugar en la cadena (igual que app_private.chain_route_mode_v1). */
  function modeFor(base, hasPrevious, hasNext) {
    if ((base || FULL) !== FULL) return base;
    if (hasPrevious && hasNext) return 'origin_destination';
    if (hasNext) return 'base_origin_destination';
    if (hasPrevious) return 'origin_destination_base';
    return FULL;
  }
  const baseMode = w => w?.context?.billing?.route_mode || FULL;
  /* Se muestra siempre en el alta/edición del operador; sólo se puede usar con prestadora y recorrido completo. */
  const shown = w => Boolean(w && !w.intakeActivated && !w.serviceSnapshot?.driver_activated);
  const eligible = w => Boolean(shown(w) && w.data?.company_id && baseMode(w) === FULL);
  const blockedReason = w => !w?.data?.company_id ? 'Elegí la prestadora para habilitarlo'
    : baseMode(w) !== FULL ? 'Esta prestadora no factura la vuelta a la base: no aplica el enganche' : '';

  function state(w) {
    const key = String(w.serviceId || 'new');
    if (!w.chain || w.chain.key !== key) {
      w.chain = { key, loaded: false, loading: false, on: false, previous: null, next: null, selectedId: null, originalId: null, candidates: [], candKey: '', candLoading: false, error: '' };
    }
    return w.chain;
  }

  /* Recorrido que usa el formulario para calcular los km de este servicio. */
  function routeMode(w, base) {
    if (!eligible(w) || !w.chain) return base;
    return modeFor(base, Boolean(w.chain.selectedId), Boolean(w.chain.next));
  }

  async function load(w) {
    const c = state(w);
    if (c.loaded || c.loading) return;
    c.loading = true;
    if (w.serviceId && db()) {
      try {
        const { data, error } = await db().rpc('get_operator_service_chain_v1', { p_service_id: w.serviceId });
        if (error) throw error;
        if (w.chain !== c) return;
        c.previous = data?.previous || null;
        c.next = data?.next || null;
        c.selectedId = c.previous?.service_id || null;
        c.originalId = c.selectedId;
      window.AuxEngancheClip?.invalidate?.();
        c.on = Boolean(c.selectedId);
      } catch (e) { c.error = 'No se pudo leer el enganche del servicio.'; console.warn('[enganche]', e); }
    }
    c.loaded = true; c.loading = false;
    render(w);
  }

  async function loadCandidates(w) {
    const c = state(w), d = w.data || {};
    if (!db() || w.mode === 'view' || !d.company_id || !d.scheduled_for) return;
    const key = [d.company_id, d.scheduled_for, d.origin_lat, d.origin_lng].join('|');
    if (c.candKey === key || c.candLoading) return;
    c.candKey = key; c.candLoading = true;
    try {
      const { data, error } = await db().rpc('list_operator_service_chain_candidates_v1', {
        p_company_id: d.company_id, p_scheduled_for: new Date(d.scheduled_for).toISOString(),
        p_origin_lat: has(d.origin_lat) ? Number(d.origin_lat) : null, p_origin_lng: has(d.origin_lng) ? Number(d.origin_lng) : null,
        p_service_id: w.serviceId || null
      });
      if (error) throw error;
      if (w.chain === c) c.candidates = Array.isArray(data) ? data : [];
    } catch (e) { console.warn('[enganche] candidatos', e); }
    c.candLoading = false;
    render(w);
  }

  const selected = c => c.candidates.find(x => String(x.service_id) === String(c.selectedId)) || (c.previous && String(c.previous.service_id) === String(c.selectedId) ? c.previous : null);
  const time = v => { try { return new Date(v).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch { return ''; } };
  const place = v => String(v || '—').split(',')[0];
  function optionLabel(x) {
    const gap = x.gap_km != null ? ` · termina a ${num(x.gap_km).toLocaleString('es-AR', { maximumFractionDigits: 1 })} km del origen` : '';
    return `${x.label || 'Servicio'} · ${time(x.scheduled_for)} · ${place(x.origin)} → ${place(x.destination)}${gap}`;
  }

  function render(w) {
    const box = document.getElementById('osv4-chain'), slot = document.getElementById('osv4-chain-switch'), card = document.getElementById('osv4-toggles');
    if (!box || !slot) return;
    if (!shown(w)) {
      box.hidden = true; box.innerHTML = ''; slot.innerHTML = ''; box.dataset.html = '';
      if (card && !(w?.toggles?.concepts || []).length) card.hidden = true;
      return;
    }
    if (card) card.hidden = false;
    const c = state(w), view = w.mode === 'view', blocked = blockedReason(w);
    /* Mismo interruptor que «¿Se derivó a taller?», en la misma fila. Se crea una vez y se actualiza en el lugar:
       si se vuelve a dibujar en cada cambio la perilla no anima y el clic puede caer sobre un elemento que ya no está. */
    let on = slot.querySelector('#osv4-chain-on');
    if (!on) {
      slot.innerHTML = '<label class="ax-switch osv4-toggle-row osv4-chain-toggle"><span>Servicio enganchado</span><input type="checkbox" id="osv4-chain-on"></label>';
      on = slot.querySelector('#osv4-chain-on');
      on.addEventListener('change', () => {
        const cw = W() || w, cc = state(cw);
        cc.on = on.checked;
        const had = Boolean(cc.selectedId);
        if (!cc.on) cc.selectedId = null;
        cw.dirty = true;
        render(cw);
        if (had && !cc.on) { cw.quote = null; window.OperatorServiceWorkspaceReactiveV1?.computeRoute?.(); }
      });
    }
    const active = !blocked && c.on;
    if (on.checked !== active && !on.hasAttribute('data-drag')) on.checked = active;
    on.disabled = view || c.loading || Boolean(blocked);
    const row = on.closest('label');
    row.classList.toggle('is-disabled', on.disabled);
    row.title = blocked && !view ? blocked : 'El móvil viene de terminar otro servicio de esta prestadora sin volver a la base';

    let html = '';
    if (!blocked) {
      const sel = selected(c);
      const options = [...c.candidates];
      if (c.previous && !options.some(x => String(x.service_id) === String(c.previous.service_id))) options.unshift(c.previous);
      const mode = routeMode(w, baseMode(w));
      const next = c.next ? `<p class="osv4-chain-next">Después sigue con <b>${esc(c.next.label)}</b>: este servicio no vuelve a la base.</p>` : '';
      const field = !c.on ? '' : view
        ? `<p class="osv4-chain-value">${sel ? `Enganchado a <b>${esc(sel.label)}</b> · ${esc(place(sel.origin))} → ${esc(place(sel.destination))}` : 'No está enganchado a otro servicio.'}</p>`
        : `<label class="osv4-chain-field"><span>¿A qué servicio sigue?</span><select id="osv4-chain-select" ${c.loading ? 'disabled' : ''} ${!c.selectedId ? 'aria-invalid="true"' : ''}>
          <option value="">Elegí el servicio anterior…</option>
          ${options.map(x => `<option value="${esc(x.service_id)}" ${String(x.service_id) === String(c.selectedId) ? 'selected' : ''}>${esc(optionLabel(x))}</option>`).join('')}
        </select></label>
        ${!options.length && !c.candLoading ? '<small class="osv4-chain-hint">No hay servicios de esta prestadora de las últimas 24 h para enganchar.</small>' : !c.selectedId ? '<small class="osv4-chain-hint">Hasta que elijas el servicio anterior, este servicio se calcula saliendo de la base.</small>' : ''}`;
      const route = sel || c.next ? `<p class="osv4-chain-route">Se factura <b>${esc(LABEL[mode] || mode)}</b>${sel ? ` · ${esc(sel.label)} pasa a facturarse <b>${esc(LABEL[modeFor(FULL, Boolean(sel.has_previous), true)])}</b>` : ''}</p>` : '';
      html = `${field}${next}${route}${c.error ? `<small class="osv4-chain-error">${esc(c.error)}</small>` : ''}`;
    }
    box.hidden = !html;
    /* Sólo se reescribe si cambió: así la lista no se cierra sola mientras se elige. */
    if (box.dataset.html !== html) { box.dataset.html = html; box.innerHTML = html; }
    if (!box.dataset.bound) {
      box.dataset.bound = '1';
      box.addEventListener('change', e => {
        if (e.target.id !== 'osv4-chain-select') return;
        const cw = W() || w, cc = state(cw);
        cc.selectedId = e.target.value || null;
        cw.dirty = true; cw.quote = null;
        render(cw);
        window.OperatorServiceWorkspaceReactiveV1?.computeRoute?.();
      });
    }
  }

  function sync(w) {
    if (!w || !db()) return;
    if (!eligible(w)) return render(w);
    const c = state(w);
    if (!c.loaded) void load(w);
    void loadCandidates(w);
    render(w);
  }

  async function route(mode, svc) {
    if (!has(svc.origin_lat) || !has(svc.destination_lat) || !has(svc.base_lat)) throw new Error(`a ${svc.label || 'el servicio'} le falta la ubicación de la base, el origen o el destino`);
    const { data, error } = await db().functions.invoke('maps-proxy', { body: {
      action: 'route', routeMode: mode,
      base: { latitude: svc.base_lat, longitude: svc.base_lng },
      origin: { latitude: svc.origin_lat, longitude: svc.origin_lng },
      destination: { latitude: svc.destination_lat, longitude: svc.destination_lng },
      departureTime: new Date(svc.scheduled_for || Date.now()).toISOString()
    } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return { distance_km: Math.round(num(data.distanceMeters) / 100) / 10, distance_meters: num(data.distanceMeters), duration_seconds: num(data.durationSeconds), legs: Array.isArray(data.legs) ? data.legs : [], polyline: data.polyline || null };
  }

  /* Después de guardar: engancha (o suelta) y guarda los km recalculados del anterior. */
  async function persist(w, serviceId) {
    const c = w?.chain;
    if (!serviceId || !c || w.mode === 'view' || !eligible(w)) return true;
    if (String(c.selectedId || '') === String(c.originalId || '')) return true;
    try {
      const sel = selected(c), old = c.previous && String(c.previous.service_id) === String(c.originalId) ? c.previous : null;
      const previousKm = sel ? await route(modeFor(FULL, Boolean(sel.has_previous), true), sel) : null;
      const releasedKm = old && c.originalId ? await route(modeFor(FULL, Boolean(old.has_previous), false), old) : null;
      const { error } = await db().rpc('set_operator_service_chain_v1', {
        p_service_id: serviceId, p_previous_service_id: c.selectedId || null, p_previous_km: previousKm, p_released_km: releasedKm
      });
      if (error) throw error;
      c.originalId = c.selectedId;
      c.previous = sel ? { ...sel, has_next: true } : null;
      c.key = String(serviceId);
      if (sel) notify(`Enganchado a ${sel.label}: se recalcularon sus km (${previousKm.distance_km.toLocaleString('es-AR')} km, sin vuelta a la base).`, 'success');
      return true;
    } catch (e) {
      notify(`El servicio se guardó, pero no se pudo ${c.selectedId ? 'enganchar' : 'desenganchar'}: ${e.message || e}. Abrilo de nuevo y revisá «Enganchado a».`, 'warning');
      return false;
    }
  }

  window.AuxEngancheServicio = { sync, render, persist, routeMode, visible: shown, enabled: eligible, _modeFor: modeFor, _label: LABEL };
})();

/* AuxiliOS · Servicio con relevo · formulario del operador (13/11/2026)
   Un mismo servicio lo hacen dos choferes: el 1º lleva el vehículo del cliente de A hasta el punto de
   intercambio (B) y el 2º, con otro móvil, de B hasta C. Es UN servicio y UN remito.
   En el formulario: interruptor «Servicio con relevo» (misma fila que Pinacars y Enganchado) y, al activarlo,
   el punto B (se elige con el buscador para que quede ubicado en el mapa) y el chofer que recibe. El móvil NO se
   elige: es el de la jornada activa de ese chofer (se muestra para que Operaciones lo vea).
   Se monta como Enganchado: sync(w) al dibujar y persist(w, id) después de guardar el servicio. La entrega
   del vehículo la marca el chofer desde su app (etapa 3). */
(() => {
  'use strict';
  const db = () => (typeof _db !== 'undefined' ? _db : null);
  const O = () => window.OperatorServices || null;
  const W = () => O()?.S?.wizard || null;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => (v === null || v === undefined || String(v).trim() === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
  const notify = (m, t = 'info') => (typeof window.toast === 'function' ? window.toast(m, t) : console[t === 'error' ? 'error' : 'log'](m));
  const token = () => (globalThis.crypto?.randomUUID?.() || `relay-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const isThird = w => w?.data?.logistics_type === 'third_party';
  /* Se muestra en altas y ediciones de servicios con móvil propio que siguen abiertos. */
  const shown = w => Boolean(w && !w.intakeActivated && !w.serviceSnapshot?.driver_activated && !isThird(w) && !['completed', 'cancelled'].includes(w.serviceStatus));

  function state(w) {
    const key = String(w.serviceId || 'new');
    if (!w.relay || w.relay.key !== key) {
      w.relay = { key, loaded: false, loading: false, on: false, original: null, address: '', placeId: '', lat: null, lng: null, toDriver: '', handedOver: false, truck: null, truckFor: '',
        search: { timer: null, seq: 0, focused: false, suggestions: [], loading: false, error: '', token: '' } };
    }
    return w.relay;
  }
  const located = c => Boolean(c.address && num(c.lat) !== null && num(c.lng) !== null);
  const missing = c => [!located(c) && 'el punto de intercambio ubicado en el mapa', !c.toDriver && 'el chofer que recibe'].filter(Boolean);

  async function load(w) {
    const c = state(w);
    if (c.loaded || c.loading) return;
    c.loading = true;
    if (w.serviceId && db()) {
      try {
        const { data, error } = await db().rpc('get_operator_service_relay_v1', { p_service_id: w.serviceId });
        if (error) throw error;
        if (w.relay !== c) return;
        if (data) {
          c.original = data; c.on = true; c.address = data.exchange_address || ''; c.placeId = data.exchange_place_id || '';
          c.lat = num(data.exchange_lat); c.lng = num(data.exchange_lng); c.toDriver = String(data.to_driver_id || '');
          c.truck = data.to_truck_id ? { has_active_jornada: Boolean(data.to_has_active_jornada) || Boolean(data.handed_over), truck_id: data.to_truck_id, truck_label: data.to_truck_label, truck_plate: data.to_truck_plate } : null; c.truckFor = c.toDriver;
          c.handedOver = Boolean(data.handed_over);
        }
      } catch (e) { console.warn('[relevo]', e); }
    }
    c.loaded = true; c.loading = false;
    update(w);
    void lookupTruck(w);
  }

  /* Móvil de la jornada activa del chofer que recibe (sólo se muestra: lo define la jornada). */
  async function lookupTruck(w) {
    const c = state(w), id = c.toDriver;
    if (!id || !db() || c.truckFor === id || c.handedOver) return;
    c.truckFor = id; c.truck = null; c.truckLoading = true; update(w);
    try {
      const { data, error } = await db().rpc('get_relay_receiver_truck_v1', { p_driver_id: id });
      if (error) throw error;
      if (c.toDriver === id) c.truck = data || null;
    } catch (e) { if (c.toDriver === id) c.truck = null; console.warn('[relevo] jornada', e); }
    c.truckLoading = false; update(w);
  }

  /* ── Buscador del punto de intercambio (mismo maps-proxy que Origen y Destino) ── */
  function bias(w) {
    const lat = num(w?.data?.origin_lat), lng = num(w?.data?.origin_lng);
    return lat !== null && lng !== null ? { latitude: lat, longitude: lng, radius: 80000 } : { latitude: -34.6037, longitude: -58.3816, radius: 150000 };
  }
  async function search(w, text, seq) {
    const c = state(w), s = c.search;
    if (!db() || seq !== s.seq || !s.focused) return;
    s.loading = true; paintSuggestions(c);
    try {
      if (!s.token) s.token = token();
      const { data, error } = await db().functions.invoke('maps-proxy', { body: { action: 'autocomplete', input: text, sessionToken: s.token, regionCode: 'AR', locationBias: bias(w) } });
      if (error) throw error;
      if (seq !== s.seq) return;
      s.suggestions = Array.isArray(data?.suggestions) ? data.suggestions.slice(0, 6) : []; s.error = '';
    } catch (e) { s.suggestions = []; s.error = e.message || 'No se pudieron buscar direcciones.'; }
    finally { s.loading = false; paintSuggestions(c); }
  }
  async function choose(w, index) {
    const c = state(w), s = c.search, pick = s.suggestions[index];
    if (!pick || !db()) return;
    s.focused = false; s.suggestions = []; paintSuggestions(c);
    const input = document.getElementById('osv4-relay-address');
    if (input) input.value = pick.text || pick.mainText || '';
    c.checking = true; paintStatus(c);
    try {
      const { data, error } = await db().functions.invoke('maps-proxy', { body: { action: 'place', placeId: pick.placeId, sessionToken: s.token || token() } });
      if (error) throw error;
      const lat = num(data?.location?.latitude), lng = num(data?.location?.longitude);
      if (lat === null || lng === null) throw new Error('Esa dirección no tiene ubicación en el mapa. Probá con otra.');
      c.address = data?.formattedAddress || pick.text || pick.mainText || ''; c.placeId = data?.placeId || pick.placeId || ''; c.lat = lat; c.lng = lng;
      s.token = token(); s.error = '';
      if (input) input.value = c.address;
      w.dirty = true;
    } catch (e) { c.lat = null; c.lng = null; s.error = e.message || 'No se pudo ubicar la dirección.'; }
    c.checking = false; paintStatus(c); paintSuggestions(c); update(w);
  }

  /* ── Pintado: el panel se arma una vez y después sólo se actualiza (sin perder el foco al escribir) ── */
  function paintSuggestions(c) {
    const box = document.getElementById('osv4-relay-suggestions'); if (!box) return;
    const s = c.search;
    if (!s.focused) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = s.loading ? '<li class="is-note">Buscando…</li>' : s.error ? `<li class="is-note is-error">${esc(s.error)}</li>`
      : s.suggestions.length ? s.suggestions.map((x, i) => `<li><button type="button" role="option" data-relay-pick="${i}"><b>${esc(x.mainText || x.text)}</b><small>${esc(x.secondaryText || '')}</small></button></li>`).join('')
      : '<li class="is-note">Escribí al menos tres letras de la dirección.</li>';
  }
  function paintStatus(c) {
    const el = document.getElementById('osv4-relay-status'); if (!el) return;
    const s = c.search;
    el.className = 'osv4-relay-status' + (c.checking ? '' : located(c) ? ' is-ok' : c.address || s.error ? ' is-warn' : '');
    el.textContent = c.checking ? 'Ubicando en el mapa…' : located(c) ? '✓ Ubicado en el mapa' : s.error && !s.focused ? s.error : 'Elegí una dirección de la lista para ubicarla en el mapa';
  }
  const optionsHtml = (rows, valueKey, label, selected, placeholder) =>
    `<option value="">${esc(placeholder)}</option>${rows.map(x => `<option value="${esc(x[valueKey])}" ${String(x[valueKey]) === String(selected) ? 'selected' : ''}>${esc(label(x))}</option>`).join('')}`;

  function ensureMarkup(w) {
    const box = document.getElementById('osv4-relay'), slot = document.getElementById('osv4-relay-switch');
    if (!box || !slot) return null;
    if (!slot.firstElementChild) {
      slot.innerHTML = '<label class="ax-switch osv4-toggle-row osv4-relay-toggle"><span>Servicio con relevo</span><input type="checkbox" id="osv4-relay-on"></label>';
      slot.querySelector('#osv4-relay-on').addEventListener('change', e => {
        const cw = W() || w, c = state(cw);
        c.on = e.target.checked; cw.dirty = true; update(cw);
      });
    }
    if (!box.firstElementChild) {
      box.innerHTML = `<label class="osv4-relay-field osv4-relay-address"><span>Punto de intercambio (B) *</span>
          <input id="osv4-relay-address" type="text" autocomplete="off" placeholder="Buscá la dirección donde se cambia de vehículo…" role="combobox" aria-expanded="false" aria-controls="osv4-relay-suggestions">
          <small id="osv4-relay-status" class="osv4-relay-status"></small>
          <ul id="osv4-relay-suggestions" class="osv4-relay-suggestions" role="listbox" hidden></ul></label>
        <div class="osv4-relay-grid">
          <label class="osv4-relay-field"><span>Chofer que recibe *</span><select id="osv4-relay-driver"></select></label>
          <div class="osv4-relay-field"><span>Móvil que recibe</span><div id="osv4-relay-truck" class="osv4-relay-truck" role="status"></div></div></div>
        <p class="osv4-relay-note">Es <b>un solo servicio y un solo remito</b>: lo cierra el chofer que recibe. Los dos choferes ven el servicio desde que lo guardás y los dos lo cuentan completo para el sueldo.</p>`;
      const input = box.querySelector('#osv4-relay-address');
      input.addEventListener('focus', () => { const c = state(W() || w); c.search.focused = true; paintSuggestions(c); });
      input.addEventListener('blur', () => setTimeout(() => { const c = state(W() || w); c.search.focused = false; paintSuggestions(c); paintStatus(c); }, 160));
      input.addEventListener('input', e => {
        const cw = W() || w, c = state(cw), s = c.search, text = e.target.value;
        c.lat = null; c.lng = null; c.address = text.trim(); c.placeId = ''; cw.dirty = true;
        if (s.timer) clearTimeout(s.timer);
        s.seq++; s.suggestions = []; s.error = ''; s.focused = true;
        if (text.trim().length < 3) { paintSuggestions(c); paintStatus(c); return; }
        const seq = s.seq; s.timer = setTimeout(() => search(cw, text.trim(), seq), 280);
        paintSuggestions(c); paintStatus(c);
      });
      /* mousedown evita que el blur cierre la lista antes del clic. */
      box.addEventListener('mousedown', e => { if (e.target.closest('[data-relay-pick]')) e.preventDefault(); });
      box.addEventListener('click', e => { const b = e.target.closest('[data-relay-pick]'); if (b) void choose(W() || w, Number(b.dataset.relayPick)); });
      box.querySelector('#osv4-relay-driver').addEventListener('change', e => { const cw = W() || w, c = state(cw); c.toDriver = e.target.value; c.truck = null; c.truckFor = ''; cw.dirty = true; update(cw); void lookupTruck(cw); });
    }
    return { box, slot };
  }

  function update(w) {
    const els = ensureMarkup(w); if (!els) return;
    const { box, slot } = els;
    const card = document.getElementById('osv4-toggles');
    if (!shown(w)) { box.hidden = true; slot.hidden = true; return; }
    slot.hidden = false;
    if (card) card.hidden = false;
    const c = state(w), view = w.mode === 'view', locked = view || c.handedOver || c.loading;
    const on = slot.querySelector('#osv4-relay-on');
    if (on.checked !== c.on && !on.hasAttribute('data-drag')) on.checked = c.on;
    on.disabled = locked;
    const row = on.closest('label');
    row.classList.toggle('is-disabled', on.disabled);
    row.title = c.handedOver ? 'El vehículo ya se entregó: el relevo no se puede cambiar' : 'Dos choferes hacen el mismo servicio: uno lo lleva hasta el punto de intercambio y el otro hasta el destino';
    box.hidden = !c.on;
    if (!c.on) return;
    const d = w.data || {}, drivers = (O()?.S?.drivers || []).filter(x => String(x.user_id) !== String(d.assigned_driver_id || ''));
    const dsel = box.querySelector('#osv4-relay-driver'), input = box.querySelector('#osv4-relay-address');
    const dHtml = optionsHtml(drivers, 'user_id', x => x.full_name, c.toDriver, 'Elegí el chofer…');
    if (dsel.dataset.html !== dHtml) { dsel.dataset.html = dHtml; dsel.innerHTML = dHtml; }
    dsel.value = c.toDriver;
    if (document.activeElement !== input && input.value !== c.address) input.value = c.address;
    for (const el of [dsel, input]) el.disabled = locked;
    dsel.setAttribute('aria-invalid', String(!locked && !c.toDriver));
    paintTruck(c);
    input.setAttribute('aria-expanded', String(Boolean(c.search.focused && c.search.suggestions.length)));
    paintStatus(c);
  }

  function paintTruck(c) {
    const el = document.getElementById('osv4-relay-truck'); if (!el) return;
    const t = c.truck;
    let html, cls = 'osv4-relay-truck';
    if (!c.toDriver) html = 'Se toma de la jornada activa del chofer que elijas';
    else if (c.truckLoading) html = 'Buscando su jornada activa…';
    else if (t?.has_active_jornada && t.truck_id) { cls += ' is-ok'; html = `<b>${esc([t.truck_label, t.truck_plate].filter(Boolean).join(' · '))}</b><small>Móvil de su jornada activa</small>`; }
    else { cls += ' is-warn'; html = 'Todavía no inició su jornada con un móvil. Se toma el de su jornada cuando el 1º entregue el vehículo, así que tiene que iniciarla antes.'; }
    if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; }
    el.className = cls;
  }

  function sync(w) {
    if (!w || !db()) return;
    if (!shown(w)) return update(w);
    const c = state(w);
    if (!c.loaded) void load(w);
    update(w);
  }

  /* Después de guardar el servicio: carga, cambia o quita el relevo. */
  async function persist(w, serviceId) {
    const c = w?.relay;
    if (!serviceId || !c || !c.loaded || w.mode === 'view' || !shown(w) || c.handedOver || !db()) return true;
    const orig = c.original;
    try {
      if (!c.on) {
        if (!orig) return true;
        const { error } = await db().rpc('remove_operator_service_relay_v1', { p_service_id: serviceId });
        if (error) throw error;
        c.original = null;
        notify('Relevo quitado del servicio.', 'success');
        return true;
      }
      const gaps = missing(c);
      if (gaps.length) { notify(`El servicio se guardó, pero falta ${gaps.join(', ')} para cargar el relevo.`, 'warning'); return false; }
      const same = orig && orig.exchange_address === c.address && num(orig.exchange_lat) === c.lat && num(orig.exchange_lng) === c.lng
        && String(orig.to_driver_id) === String(c.toDriver);
      if (same) return true;
      const { data, error } = await db().rpc('set_operator_service_relay_v1', {
        p_service_id: serviceId, p_exchange_address: c.address, p_exchange_lat: c.lat, p_exchange_lng: c.lng, p_exchange_place_id: c.placeId || null,
        p_to_driver_id: c.toDriver });
      if (error) throw error;
      c.original = data || { exchange_address: c.address, exchange_lat: c.lat, exchange_lng: c.lng, to_driver_id: c.toDriver };
      c.key = String(serviceId);
      notify(`Relevo cargado: ${data?.to_driver_name || 'el 2º chofer'} recibe en ${c.address}.`, 'success');
      return true;
    } catch (e) {
      notify(`El servicio se guardó, pero no se pudo ${c.on ? 'cargar' : 'quitar'} el relevo: ${e.message || e}. Abrilo de nuevo y revisá «Servicio con relevo».`, 'warning');
      return false;
    }
  }

  window.AuxRelevoServicio = { sync, update, persist, lookupTruck, visible: shown, _state: state, _missing: missing };
})();

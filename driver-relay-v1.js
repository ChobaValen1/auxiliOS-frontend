/* AuxiliOS · Servicio con relevo · app del chofer (13/11/2026)
   Un mismo servicio lo hacen dos choferes: el 1º lleva el vehículo del cliente de A hasta el punto de intercambio (B)
   y el 2º, con su móvil, de B hasta C. Un solo servicio y un solo remito (lo cierra el 2º).
   · 1º chofer: en su tarjeta aparece «Ir al punto B en Maps» y «Entregué el vehículo en B». No crea remito.
   · 2º chofer: ve el servicio DESDE ANTES (sección «Vas a recibir») con el punto B y un botón que abre Maps; cuando
     el 1º entrega, el servicio pasa a su lista normal con una nota de quién se lo entregó y Maps hacia el destino.
   Todo sale de get_driver_relay_state_v1; la entrega es mark_operator_service_relay_handover_v1. */
(() => {
  'use strict';
  const db = () => (typeof _db !== 'undefined' ? _db : null);
  const isDriver = () => (typeof PERFIL_USUARIO !== 'undefined' && PERFIL_USUARIO?.roles?.name === 'chofer');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = n => `<svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#${n}"/></svg>`;
  const notify = (m, t = 'info') => (typeof window.toast === 'function' ? window.toast(m, t) : console[t === 'error' ? 'error' : 'log'](m));
  const num = v => (v === null || v === undefined || String(v).trim() === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
  const place = v => String(v || '').trim();

  const S = { incoming: [], outgoing: [], received: [], loaded: false, loading: false, at: 0, confirming: '', busy: '', timer: 0 };
  const THROTTLE = 8000;

  /* Maps con la ruta directa (desde donde está el chofer hasta el punto). */
  function mapsUrl(lat, lng) {
    const a = num(lat), b = num(lng);
    return a === null || b === null ? '' : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a + ',' + b)}&travelmode=driving`;
  }
  const mapsButton = (lat, lng, label) => {
    const href = mapsUrl(lat, lng);
    return href ? `<a class="drl-btn drl-maps" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${ico('navigation')}<span>${esc(label)}</span></a>`
      : '<p class="drl-note is-warn">Este punto no tiene ubicación en el mapa. Pedile a Operaciones que lo corrija.</p>';
  };
  const time = v => { try { return new Date(v).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch { return ''; } };
  const vehicle = x => [x.vehicle_make_model, x.vehicle_plate].filter(Boolean).join(' · ') || 'Vehículo sin informar';
  const truckText = (label, plate) => [label && `Móvil ${label}`, plate].filter(Boolean).join(' · ');
  /* «RELEVO_SIN_JORNADA: Lucas P. todavía no inició…» → sólo la frase para el chofer. */
  const friendlyError = e => String(e?.message || e || 'No se pudo entregar el vehículo.').replace(/^[A-Z_]{4,}:\s*/, '');

  /* ── Sección «Vas a recibir» (2º chofer, antes de que le entreguen) ── */
  function incomingCard(x) {
    const trip = truckText(x.from_truck_label, x.from_truck_plate);
    return `<article class="drl-card" data-drl-service="${esc(x.service_id)}" aria-label="Servicio ${esc(x.label)} con relevo">
      <header><div class="drl-id"><strong>${esc(x.label || 'Servicio')}</strong><span class="drl-chip">${ico('repeat')}Tramo 2 de 2</span></div>
        <span class="drl-state">${ico('clock')}Esperando la entrega</span></header>
      <dl class="drl-facts">
        <div><dt>Retirás en (punto de intercambio)</dt><dd class="drl-b">${esc(place(x.exchange_address) || 'Punto sin dirección')}</dd></div>
        <div><dt>Vehículo a retirar</dt><dd>${esc(vehicle(x))}</dd></div>
        <div><dt>Te lo trae</dt><dd>${esc(x.from_driver_name || 'El primer chofer')}${trip ? `<small> · ${esc(trip)}</small>` : ''}</dd></div>
        <div><dt>Después lo llevás a</dt><dd>${esc(place(x.destination) || 'Destino sin informar')}</dd></div>
      </dl>
      ${x.to_has_active_jornada ? '' : `<p class="drl-note is-warn">${ico('triangle-alert')}<span>Iniciá tu jornada con tu móvil para poder recibir el vehículo.</span></p>`}
      ${mapsButton(x.exchange_lat, x.exchange_lng, 'Ir al punto de intercambio en Maps')}
    </article>`;
  }
  const incomingHtml = list => list.length
    ? `<h3 class="drl-title">${ico('repeat')}<span>Vas a recibir</span><b>${list.length}</b></h3>${list.map(incomingCard).join('')}` : '';

  /* ── 1º chofer: en su tarjeta, ir a B y entregar el vehículo ── */
  function outgoingBox(x, confirming, busy) {
    const wait = busy === String(x.service_id), sure = confirming === String(x.service_id);
    const next = x.to_driver_name ? `${esc(x.to_driver_name)}${x.to_truck_label ? `<small> · ${esc(truckText(x.to_truck_label, x.to_truck_plate))}</small>` : ''}` : 'el segundo chofer';
    return `<div class="drl-box drl-out-box">
      <div class="drl-id"><span class="drl-chip">${ico('repeat')}Con relevo · Tramo 1 de 2</span></div>
      <dl class="drl-facts"><div><dt>Llevá el vehículo hasta</dt><dd class="drl-b">${esc(place(x.exchange_address) || 'Punto sin dirección')}</dd></div>
        <div><dt>Lo recibe</dt><dd>${next}</dd></div></dl>
      ${mapsButton(x.exchange_lat, x.exchange_lng, 'Ir al punto de intercambio en Maps')}
      <button type="button" class="drl-btn ${sure ? 'drl-danger' : 'drl-primary'}" data-drl-handover="${esc(x.service_id)}" ${wait ? 'disabled aria-busy="true"' : ''}>
        ${wait ? 'Entregando…' : sure ? 'Tocá de nuevo para confirmar la entrega' : 'Entregué el vehículo en B'}</button>
      <p class="drl-note">${sure ? 'Al confirmar, el servicio pasa a ' + (x.to_driver_name ? esc(x.to_driver_name) : 'el segundo chofer') + ' y no vas a poder crear el remito.' : 'No hace falta crear remito: lo cierra quien recibe el vehículo.'}</p>
    </div>`;
  }

  /* ── 2º chofer, ya con el servicio: de quién lo recibió y Maps al destino ── */
  function receivedBox(x) {
    const trip = truckText(x.from_truck_label, x.from_truck_plate);
    return `<div class="drl-box drl-in-box">
      <div class="drl-id"><span class="drl-chip">${ico('repeat')}Con relevo · Tramo 2 de 2</span></div>
      <p class="drl-note is-ok">${ico('check')}<span>Recibiste el vehículo de <b>${esc(x.from_driver_name || 'el primer chofer')}</b>${trip ? ` (${esc(trip)})` : ''} en ${esc(place(x.exchange_address) || 'el punto de intercambio')}${x.handed_over_at ? ` · ${esc(time(x.handed_over_at))}` : ''}.</span></p>
      ${mapsButton(x.destination_lat, x.destination_lng, 'Ir al destino en Maps')}
    </div>`;
  }

  /* ── Pintado (se reinserta cada vez que la app vuelve a dibujar su lista) ── */
  function ensureSection() {
    const panel = document.getElementById('phase3-driver-services'); if (!panel) return null;
    let sec = document.getElementById('driver-relay-incoming');
    if (!sec) {
      sec = document.createElement('section'); sec.id = 'driver-relay-incoming'; sec.className = 'drl-incoming'; sec.hidden = true;
      const list = document.getElementById('phase3-driver-services-list');
      list ? list.before(sec) : panel.appendChild(sec);
    }
    return sec;
  }
  function paintIncoming() {
    const sec = ensureSection(); if (!sec) return;
    const html = incomingHtml(S.incoming);
    if (sec.dataset.html !== html) { sec.dataset.html = html; sec.innerHTML = html; }
    sec.hidden = !html;
  }
  function decorate() {
    const list = document.getElementById('phase3-driver-services-list'); if (!list) return;
    const out = new Map(S.outgoing.map(x => [String(x.service_id), x])), rec = new Map(S.received.map(x => [String(x.service_id), x]));
    for (const card of list.querySelectorAll('.p3-driver-task[data-service-id]')) {
      const id = card.dataset.serviceId, o = out.get(id), r = rec.get(id);
      let html = '';
      if (o) html = outgoingBox(o, S.confirming, S.busy); else if (r) html = receivedBox(r);
      const has = card.querySelector(':scope > .drl-box');
      card.classList.toggle('drl-out', Boolean(o)); card.classList.toggle('drl-in', Boolean(r));
      if (!html) { has?.remove(); continue; }
      if (has && has.dataset.html === html) continue;
      has?.remove();
      const wrap = document.createElement('div'); wrap.innerHTML = html;
      const box = wrap.firstElementChild; box.dataset.html = html;
      const footer = card.querySelector(':scope > .p3-task-actions');
      footer ? footer.before(box) : card.appendChild(box);
    }
  }
  function paint() { paintIncoming(); decorate(); }

  /* ── Datos ── */
  async function refresh({ force = false } = {}) {
    if (!isDriver() || !db() || S.loading) return false;
    if (!force && Date.now() - S.at < THROTTLE) return false;
    S.loading = true;
    try {
      const { data, error } = await db().rpc('get_driver_relay_state_v1');
      if (error) throw error;
      S.incoming = Array.isArray(data?.incoming) ? data.incoming : []; S.outgoing = Array.isArray(data?.outgoing) ? data.outgoing : [];
      S.received = Array.isArray(data?.received) ? data.received : []; S.loaded = true; S.at = Date.now();
    } catch (e) { console.warn('[relevo chofer]', e); /* sin red o sin la migración: la app sigue como siempre */ }
    S.loading = false; paint();
    return true;
  }

  async function handover(id) {
    if (S.busy) return;
    if (S.confirming !== id) {
      S.confirming = id; clearTimeout(S.timer); S.timer = setTimeout(() => { if (S.confirming === id) { S.confirming = ''; paint(); } }, 6000);
      return paint();
    }
    clearTimeout(S.timer); S.confirming = ''; S.busy = id; paint();
    try {
      const { data, error } = await db().rpc('mark_operator_service_relay_handover_v1', { p_service_id: id });
      if (error) throw error;
      const who = String(data?.to_driver_name || 'el segundo chofer');
      notify(`Entregaste el vehículo. El servicio sigue con ${who}${who.endsWith('.') ? '' : '.'}`, 'success');
    } catch (e) { notify(friendlyError(e), 'warning'); }
    S.busy = '';
    await refresh({ force: true });
    try { await window.recargarServiciosChofer?.(); } catch { /* la lista se actualiza sola en el próximo ciclo */ }
    paint();
  }

  function bind() {
    if (S.bound) return; S.bound = true;
    document.addEventListener('click', e => {
      const b = e.target.closest?.('[data-drl-handover]');
      if (b) { e.preventDefault(); e.stopPropagation(); void handover(b.dataset.drlHandover); }
    }, true);
    /* La app dibuja su lista de nuevo en cada refresco: se vuelve a decorar y se actualizan los datos. */
    window.addEventListener('auxilios:driver-queue-updated', () => { setTimeout(paint, 0); void refresh(); });
    window.addEventListener('focus', () => { void refresh({ force: true }); });
    window.addEventListener('online', () => { void refresh({ force: true }); });
    const watch = () => {
      const list = document.getElementById('phase3-driver-services-list');
      if (!list || list.dataset.drlWatch) return Boolean(list);
      list.dataset.drlWatch = '1';
      new MutationObserver(() => { if (!S.painting) { S.painting = true; try { paint(); } finally { S.painting = false; } } }).observe(list, { childList: true });
      return true;
    };
    let tries = 0;
    const boot = setInterval(() => { tries++; if (isDriver() && db() && watch()) { clearInterval(boot); void refresh({ force: true }); } else if (tries > 120) clearInterval(boot); }, 500);
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', bind, { once: true }) : bind();
  }
  window.AuxRelevoChofer = { refresh, paint, handover, _mapsUrl: mapsUrl, _friendlyError: friendlyError, _incomingHtml: incomingHtml, _outgoingBox: outgoingBox, _receivedBox: receivedBox, _state: S };
})();

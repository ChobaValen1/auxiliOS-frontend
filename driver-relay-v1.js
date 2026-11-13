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
  const pinLink = (lat, lng, label) => { const href = mapsUrl(lat, lng); return href ? `<a class="drl-pin" href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)}">${ico('map-pin')}</a>` : ''; };
  const routeRow = (label, addr, pin) => `<div class="drl-row"><span><small>${esc(label)}</small><b>${esc(addr)}</b></span>${pin || ''}</div>`;
  const vehicleBlock = (x, tramo) => `<div class="drl-main"><div class="drl-veh"><strong>${esc(x.vehicle_plate || 'Sin patente')}</strong><span>${esc(x.vehicle_make_model || 'Vehículo sin informar')}</span></div>${chipSide(tramo)}</div>`;
  function incomingCard(x) {
    const trip = truckText(x.from_truck_label, x.from_truck_plate);
    return `<article class="drl-card is-actionable" data-drl-service="${esc(x.service_id)}" role="button" tabindex="0" aria-label="Ver servicio ${esc(x.label)} con relevo">
      <header><strong class="drl-label">${esc(x.label || 'Servicio')}</strong><span class="drl-state">${ico('clock')}Esperando la entrega</span></header>
      ${vehicleBlock(x, 2)}
      <div class="drl-route">
        ${routeRow('Retirás en (punto de encuentro)', place(x.exchange_address) || 'Punto sin dirección', pinLink(x.exchange_lat, x.exchange_lng, 'Navegar al punto de encuentro'))}
        ${routeRow('Lo llevás a', place(x.destination) || 'Destino sin informar', pinLink(x.destination_lat, x.destination_lng, 'Navegar al destino'))}
      </div>
      <p class="drl-sub">Te lo trae <b>${esc(x.from_driver_name || 'el primer chofer')}</b>${trip ? ` · ${esc(trip)}` : ''}</p>
      ${x.to_has_active_jornada ? '' : `<p class="drl-note is-warn">${ico('triangle-alert')}<span>Iniciá tu jornada con tu móvil para poder recibir el vehículo.</span></p>`}
      <span class="drl-more" aria-hidden="true">Ver detalle${ico('chevron-right')}</span>
    </article>`;
  }
  const incomingHtml = list => list.length
    ? `<h3 class="drl-title">${ico('repeat')}<span>Vas a recibir</span><b>${list.length}</b></h3>${list.map(incomingCard).join('')}` : '';

  /* ── 1º chofer: en su tarjeta, ir a B y entregar el vehículo ── */
  function outgoingBox(x, confirming, busy) {
    const sure = confirming === String(x.service_id), wait = busy === String(x.service_id);
    return `<div class="drl-box drl-out-box">
      <button type="button" class="drl-btn ${sure ? 'drl-danger' : 'drl-primary'}" data-drl-handover="${esc(x.service_id)}" ${wait ? 'disabled aria-busy="true"' : ''}>
        ${wait ? 'Entregando…' : sure ? 'Tocá de nuevo para confirmar la entrega' : 'Entregué el vehículo en B'}</button>
      <p class="drl-note">${sure ? 'Al confirmar, el servicio pasa a ' + (x.to_driver_name ? esc(x.to_driver_name) : 'el segundo chofer') + ' y no vas a poder crear el remito.' : 'No hace falta crear remito: lo cierra quien recibe el vehículo.'}</p>
    </div>`;
  }
  const receiverText = x => `${esc(x.to_driver_name || 'El segundo chofer')}${x.to_truck_label ? ` <em>· ${esc(truckText(x.to_truck_label, x.to_truck_plate))}</em>` : ''}`;
  const chipSide = (n = 1) => `<span class="drl-chip drl-chip-side">${ico('repeat')}Con relevo · Tramo ${n} de 2</span>`;

  /* Tarjeta de la lista (1º chofer): el destino pasa a ser el punto de encuentro, el chip va arriba a la derecha y «Navegar»
     apunta al punto de encuentro una vez que llegó al origen. Se repite sin duplicar cada vez que la app redibuja la lista. */
  function patchCard(card, x) {
    const veh = card.querySelector('.p3-task-vehicle');
    if (veh && !veh.querySelector('.drl-chip')) veh.insertAdjacentHTML('beforeend', chipSide());
    const rows = card.querySelectorAll('.p3-task-route > div');
    const dest = rows[1];
    if (dest) {
      const label = dest.querySelector('small'), val = dest.querySelector('b'), addr = place(x.exchange_address) || 'Punto sin dirección';
      if (label && label.textContent !== 'Llevá el vehículo hasta') label.textContent = 'Llevá el vehículo hasta';
      if (val && val.textContent !== addr) val.textContent = addr;
    }
    const s = (window.AuxiliosPhase3?.queue || []).find(q => String(q.service_id) === String(x.service_id));
    const nav = card.querySelector('.p3-quick-links a[aria-label^="Navegar"]'), href = mapsUrl(x.exchange_lat, x.exchange_lng);
    if (nav && href && s?.status === 'at_origin' && nav.getAttribute('href') !== href) { nav.setAttribute('href', href); nav.setAttribute('aria-label', 'Navegar al punto de encuentro'); }
  }

  /* En la ventana de detalle todo va integrado: el punto de encuentro es una dirección más (con su pin de Maps),
     el chip de relevo queda a la derecha del vehículo y «Entregué el vehículo en B» ocupa el lugar del botón principal. */
  function sheetBox(x, confirming, busy, arrived) {
    const sure = confirming === String(x.service_id), wait = busy === String(x.service_id);
    const btn = arrived ? `<button type="button" class="drl-btn ${sure ? 'drl-danger' : 'drl-primary'}" data-drl-handover="${esc(x.service_id)}" ${wait ? 'disabled aria-busy="true"' : ''}>
        ${wait ? 'Entregando…' : sure ? 'Tocá de nuevo para confirmar la entrega' : 'Entregué el vehículo en B'}</button>` : '';
    const note = sure ? 'Al confirmar, el servicio pasa a ' + (x.to_driver_name ? esc(x.to_driver_name) : 'el segundo chofer') + ' y no vas a poder crear el remito.'
      : 'No hace falta crear remito: lo cierra quien recibe el vehículo.';
    return `<div class="drl-sheet-box drl-out-box">${btn}<p class="drl-note">${note}</p></div>`;
  }
  /* Jerarquía del detalle: dominio grande + vehículo chico, después el cliente (blanco, más chico). */
  function tidyClient(body, keepCall, tramo) {
    const vehicleBox = body.querySelector('.p3-sheet-vehicle'), client = body.querySelector('.p3-sheet-client');
    if (vehicleBox) {
      if (!vehicleBox.querySelector('.drl-chip')) vehicleBox.insertAdjacentHTML('beforeend', chipSide(tramo));
      if (body.firstElementChild !== vehicleBox) body.prepend(vehicleBox);
      if (client && vehicleBox.nextElementSibling !== client) vehicleBox.after(client);
    }
    if (client) {
      client.classList.add('drl-client');
      client.querySelectorAll(':scope > small, :scope > p' + (keepCall ? '' : ', a.p3-client-call')).forEach(n => n.remove());
    }
  }
  function decorateSheetBody(x) {
    const body = document.getElementById('p3-preview-body'); if (!body) return;
    tidyClient(body, false, 1);
    const route = body.querySelector('.p3-sheet-route');
    if (route && !route.querySelector('.drl-meet')) {
      const href = mapsUrl(x.exchange_lat, x.exchange_lng), addr = place(x.exchange_address) || 'Punto sin dirección';
      const pin = href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="Navegar al punto de encuentro">${ico('map-pin')}</a>` : '';
      const places = route.querySelectorAll('.p3-sheet-place');
      const meet = `<div class="p3-sheet-place drl-meet"><span><small>Punto de encuentro</small><b>${esc(addr)}</b></span>${pin}</div>`;
      const to = `<div class="p3-sheet-place drl-to"><span><small>Se lo entregás a</small><b>${receiverText(x)}</b></span></div>`;
      places[1]?.remove();
      places[0] ? places[0].insertAdjacentHTML('afterend', meet + to) : route.insertAdjacentHTML('afterbegin', meet + to);
    }
  }

  /* ── 2º chofer, ya con el servicio: de quién lo recibió y Maps al destino ── */
  function receivedBox(x) {
    const trip = truckText(x.from_truck_label, x.from_truck_plate);
    return `<div class="drl-box drl-in-box">
      <p class="drl-note is-ok">${ico('check')}<span>Recibiste el vehículo de <b>${esc(x.from_driver_name || 'el primer chofer')}</b>${trip ? ` (${esc(trip)})` : ''}${x.handed_over_at ? ` · ${esc(time(x.handed_over_at))}` : ''}.</span></p>
    </div>`;
  }
  /* Tarjeta de la lista (2º chofer, ya con el vehículo): chip arriba a la derecha, «Recibido en» en lugar del origen
     y «Navegar» directo al destino. */
  function patchReceivedCard(card, x) {
    const veh = card.querySelector('.p3-task-vehicle');
    if (veh && !veh.querySelector('.drl-chip')) veh.insertAdjacentHTML('beforeend', chipSide(2));
    const first = card.querySelector('.p3-task-route > div');
    if (first) {
      const label = first.querySelector('small'), val = first.querySelector('b'), addr = place(x.exchange_address) || 'Punto de encuentro';
      if (label && label.textContent !== 'Lo recibiste en') label.textContent = 'Lo recibiste en';
      if (val && val.textContent !== addr) val.textContent = addr;
    }
    const nav = card.querySelector('.p3-quick-links a[aria-label^="Navegar"]'), href = mapsUrl(x.destination_lat, x.destination_lng);
    if (nav && href && nav.getAttribute('href') !== href) { nav.setAttribute('href', href); nav.setAttribute('aria-label', 'Navegar al destino'); }
  }
  function decorateReceivedSheet(x) {
    const body = document.getElementById('p3-preview-body'); if (!body) return;
    tidyClient(body, true, 2);
    const first = body.querySelector('.p3-sheet-route .p3-sheet-place');
    if (first && !first.classList.contains('drl-from')) {
      first.classList.add('drl-from');
      const label = first.querySelector('small'), val = first.querySelector('b');
      if (label) label.textContent = 'Lo recibiste en';
      if (val) val.textContent = place(x.exchange_address) || 'Punto de encuentro';
      first.querySelector('a')?.remove();
    }
  }

  const when = v => { try { return new Date(v).toLocaleString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch { return ''; } };
  function incomingSheet(x) {
    const trip = truckText(x.from_truck_label, x.from_truck_plate);
    const place3 = (label, inner, pin) => `<div class="p3-sheet-place"><span><small>${esc(label)}</small><b>${inner}</b></span>${pin || ''}</div>`;
    return `<div class="drl-sheet">
      <div class="p3-sheet-vehicle drl-sheet-veh"><strong>${esc(x.vehicle_plate || 'Sin patente')}</strong><span>${esc(x.vehicle_make_model || 'Vehículo sin informar')}</span>${chipSide(2)}</div>
      <p class="drl-state">${ico('clock')}Esperando que ${esc(x.from_driver_name || 'el primer chofer')} entregue el vehículo</p>
      ${x.to_has_active_jornada ? '' : `<p class="drl-note is-warn">${ico('triangle-alert')}<span>Iniciá tu jornada con tu móvil para poder recibir el vehículo.</span></p>`}
      <div class="p3-sheet-route">
        ${place3('Retirás en (punto de encuentro)', esc(place(x.exchange_address) || 'Punto sin dirección'), pinLink(x.exchange_lat, x.exchange_lng, 'Navegar al punto de encuentro'))}
        ${place3('Te lo trae', `${esc(x.from_driver_name || 'El primer chofer')}${trip ? ` <em>· ${esc(trip)}</em>` : ''}`)}
        ${place3('Después lo llevás a', esc(place(x.destination) || 'Destino sin informar'), pinLink(x.destination_lat, x.destination_lng, 'Navegar al destino'))}
        ${x.scheduled_for ? place3('Horario del servicio', esc(when(x.scheduled_for))) : ''}
      </div>
      <p class="drl-note"><span>Cuando ${esc(x.from_driver_name || 'el primer chofer')} entregue el vehículo, el servicio pasa a tu lista y desde ahí completás el remito con el cliente.</span></p>
    </div>`;
  }
  function openIncoming(id) {
    const x = S.incoming.find(i => String(i.service_id) === String(id));
    const P3 = window.AuxiliosPhase3;
    if (!x || !P3?.openCustomPreview) return;
    P3.openCustomPreview({ kicker: 'Vas a recibir · Tramo 2 de 2', title: x.label || 'Servicio', body: incomingSheet(x),
      actions: '<small>Es un solo servicio y un solo remito: lo cerrás vos con el cliente.</small>' });
  }

  /* Ventana de detalle de un servicio normal: se le saca lo que no corresponde en un relevo. */
  function decoratePreview(id) {
    const actions = document.getElementById('p3-preview-actions'); if (!actions) return;
    const key = String(id), o = S.outgoing.find(x => String(x.service_id) === key), r = S.received.find(x => String(x.service_id) === key);
    if (!o && !r) return;
    if (o) {
      /* 1º chofer: no crea remito ni lo marca como activado; llega al origen, va a B y entrega. */
      actions.querySelectorAll('[onclick*="abrirRemitoServicio"], .p3-other-actions').forEach(n => n.remove());
      actions.querySelectorAll('small').forEach(n => { if (/remito|activado/i.test(n.textContent)) n.remove(); });
      actions.querySelectorAll(':scope > .drl-box, :scope > .drl-sheet-box').forEach(n => n.remove());
      const arrived = Boolean(actions.querySelector('.p3-arrived-chip'));
      decorateSheetBody(o);
      actions.insertAdjacentHTML('beforeend', sheetBox(o, S.confirming, S.busy, arrived));
    } else {
      /* 2º chofer: ya tiene el vehículo (no llega a ningún origen); sigue al destino y completa el remito. */
      actions.querySelectorAll('.p3-arrive-btn, .p3-arrived-chip').forEach(n => n.remove());
      actions.querySelectorAll('small').forEach(n => { if (/Tocalo al llegar/i.test(n.textContent)) n.remove(); });
      actions.querySelectorAll('[onclick*="abrirRemitoServicio"]').forEach(n => { n.classList.remove('p3-preview-secondary'); n.classList.add('p3-preview-primary'); });
      actions.querySelector(':scope > .drl-box')?.remove();
      decorateReceivedSheet(r);
      actions.insertAdjacentHTML('afterbegin', receivedBox(r));
    }
  }
  function refreshPreviewBox() {
    const modal = document.getElementById('p3-service-preview');
    if (!modal || modal.hidden) return;
    const id = modal.dataset.serviceRouteId; if (!id) return;
    const actions = document.getElementById('p3-preview-actions'), o = S.outgoing.find(x => String(x.service_id) === String(id));
    const box = actions?.querySelector(':scope > .drl-sheet-box');
    if (o && box) { const wrap = document.createElement('div'); wrap.innerHTML = sheetBox(o, S.confirming, S.busy, Boolean(actions.querySelector('.p3-arrived-chip'))); box.replaceWith(wrap.firstElementChild); }
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
      if (o) patchCard(card, o); else if (r) patchReceivedCard(card, r);
      if (!html) { has?.remove(); continue; }
      if (has && has.dataset.html === html) continue;
      has?.remove();
      const wrap = document.createElement('div'); wrap.innerHTML = html;
      const box = wrap.firstElementChild; box.dataset.html = html;
      const footer = card.querySelector(':scope > .p3-task-actions');
      footer ? footer.before(box) : card.appendChild(box);
    }
  }
  function paint() { paintIncoming(); decorate(); refreshPreviewBox(); }

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
    try { window.cerrarPreviewServicio?.(); } catch { /* sin ventana abierta */ }
    await refresh({ force: true });
    try { await window.recargarServiciosChofer?.(); } catch { /* la lista se actualiza sola en el próximo ciclo */ }
    paint();
  }

  function bind() {
    if (S.bound) return; S.bound = true;
    document.addEventListener('click', e => {
      const b = e.target.closest?.('[data-drl-handover]');
      if (b) { e.preventDefault(); e.stopPropagation(); void handover(b.dataset.drlHandover); return; }
      /* Toda la tarjeta se toca (como un servicio normal); los botones y links conservan lo suyo. */
      const card = e.target.closest?.('.drl-card[data-drl-service]');
      if (card && !e.target.closest('a,button,input,select,textarea,summary,label')) { if (String(window.getSelection?.() || '').trim()) return; openIncoming(card.dataset.drlService); }
    }, true);
    document.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest?.('.drl-card[data-drl-service]');
      if (card && e.target === card) { e.preventDefault(); openIncoming(card.dataset.drlService); }
    });
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
  window.AuxRelevoChofer = { refresh, paint, handover, openIncoming, decoratePreview, _incomingSheet: incomingSheet, _mapsUrl: mapsUrl, _friendlyError: friendlyError, _incomingHtml: incomingHtml, _outgoingBox: outgoingBox, _sheetBox: sheetBox, _patchCard: patchCard, _patchReceivedCard: patchReceivedCard, _receivedBox: receivedBox, _state: S };
})();

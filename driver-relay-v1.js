/* AuxiliOS · Servicio con relevo · app del chofer (13/11/2026)
   Un mismo servicio lo hacen dos choferes: el 1º lleva el vehículo del cliente de A hasta el punto de intercambio (B)
   y el 2º, con su móvil, de B hasta C. Un solo servicio y un solo remito: lo hace el 1º con el cliente al retirar.
   · 1º chofer: hace el remito y cobra como siempre; en su tarjeta aparece el punto de encuentro y, con el remito
     hecho, «Entregué el vehículo a <2º chofer>».
   · 2º chofer: ve el servicio DESDE ANTES (sección «Vas a recibir») con el punto B; cuando el 1º entrega, el servicio
     pasa a su lista. NO hace remito: lo lleva al destino y toca «Entregué el vehículo en destino».
   Todo sale de get_driver_relay_state_v1; las entregas son mark_operator_service_relay_handover_v1 (en B) y
   mark_operator_service_relay_delivered_v1 (en destino). */
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

  /* ── 1º chofer: primero el remito con el cliente; después, ir a B y entregar el vehículo ── */
  const receiverName = x => (x.to_driver_name ? esc(x.to_driver_name) : 'el segundo chofer');
  const handoverButton = (x, sure, wait) => `<button type="button" class="drl-btn ${sure ? 'drl-danger' : 'drl-primary'}" data-drl-handover="${esc(x.service_id)}" ${wait ? 'disabled aria-busy="true"' : ''}>
        ${wait ? 'Entregando…' : sure ? 'Tocá de nuevo para confirmar la entrega' : 'Entregué el vehículo a ' + (x.to_driver_name ? esc(x.to_driver_name) : 'el otro chofer')}</button>`;
  const handoverNote = (x, sure) => !x.has_remito
    ? `<p class="drl-note is-warn">${ico('file-text')}<span><b>Primero hacé el remito con el cliente</b> y cobrá como siempre. Después llevás el vehículo al punto de encuentro y se lo entregás a ${receiverName(x)}.</span></p>`
    : `<p class="drl-note">${sure ? 'Al confirmar, el servicio pasa a ' + receiverName(x) + ' para que lo lleve al destino.' : 'Remito hecho. Llevá el vehículo al punto de encuentro y, cuando se lo des a ' + receiverName(x) + ', tocá el botón.'}</p>`;
  function outgoingBox(x, confirming, busy) {
    const sure = confirming === String(x.service_id), wait = busy === String(x.service_id);
    return `<div class="drl-box drl-out-box">
      ${x.has_remito ? handoverButton(x, sure, wait) : ''}
      ${handoverNote(x, sure)}
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
     el chip de relevo queda a la derecha del vehículo y «Entregué el vehículo a <2º chofer>» ocupa el lugar del botón principal. */
  function sheetBox(x, confirming, busy) {
    const sure = confirming === String(x.service_id), wait = busy === String(x.service_id);
    return `<div class="drl-sheet-box drl-out-box">${x.has_remito ? handoverButton(x, sure, wait) : ''}${handoverNote(x, sure)}</div>`;
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
  function receivedBox(x, confirming, busy, cls = 'drl-box') {
    const trip = truckText(x.from_truck_label, x.from_truck_plate);
    const sure = confirming === 'd:' + String(x.service_id), wait = busy === 'd:' + String(x.service_id);
    const from = `<p class="drl-note is-ok">${ico('check')}<span>Recibiste el vehículo de <b>${esc(x.from_driver_name || 'el primer chofer')}</b>${trip ? ` (${esc(trip)})` : ''}${x.handed_over_at ? ` · ${esc(time(x.handed_over_at))}` : ''}.</span></p>`;
    if (x.delivered) {
      return `<div class="${cls} drl-in-box">${from}<p class="drl-note is-ok drl-done">${ico('check')}<span><b>Entregado en destino</b>${x.delivered_at ? ` · ${esc(time(x.delivered_at))}` : ''}. Listo, no tenés que hacer nada más.</span></p></div>`;
    }
    return `<div class="${cls} drl-in-box">${from}
      <button type="button" class="drl-btn ${sure ? 'drl-danger' : 'drl-primary'}" data-drl-delivered="${esc(x.service_id)}" ${wait ? 'disabled aria-busy="true"' : ''}>
        ${wait ? 'Marcando…' : sure ? 'Tocá de nuevo para confirmar' : 'Entregué el vehículo en destino'}</button>
      <p class="drl-note">${sure ? 'Confirmá sólo si ya dejaste el vehículo en el destino.' : `No hacés remito: lo hizo ${esc(x.from_driver_name || 'el primer chofer')} con el cliente. Llevalo al destino y tocá el botón.`}</p>
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
      <p class="drl-note"><span>Cuando ${esc(x.from_driver_name || 'el primer chofer')} te entregue el vehículo, el servicio pasa a tu lista. Lo llevás al destino y tocás «Entregué el vehículo en destino». <b>No hacés remito</b>: lo hace ${esc(x.from_driver_name || 'el primer chofer')} con el cliente.</span></p>
    </div>`;
  }
  function openIncoming(id) {
    const x = S.incoming.find(i => String(i.service_id) === String(id));
    const P3 = window.AuxiliosPhase3;
    if (!x || !P3?.openCustomPreview) return;
    P3.openCustomPreview({ kicker: 'Vas a recibir · Tramo 2 de 2', title: x.label || 'Servicio', body: incomingSheet(x),
      actions: `<small>Es un solo servicio y un solo remito: lo hace ${esc(x.from_driver_name || 'el primer chofer')} al retirar el vehículo.</small>` });
  }

  /* Ventana de detalle de un servicio normal: se le saca lo que no corresponde en un relevo. */
  function decoratePreview(id) {
    const actions = document.getElementById('p3-preview-actions'); if (!actions) return;
    const key = String(id), o = S.outgoing.find(x => String(x.service_id) === key), r = S.received.find(x => String(x.service_id) === key);
    if (!o && !r) return;
    if (o) {
      /* 1º chofer: llega al origen y hace el remito con el cliente como siempre (no lo marca como activado);
         con el remito hecho, va a B y entrega. */
      actions.querySelectorAll('.p3-other-actions').forEach(n => n.remove());
      actions.querySelectorAll('small').forEach(n => { if (/activado/i.test(n.textContent)) n.remove(); });
      actions.querySelectorAll(':scope > .drl-box, :scope > .drl-sheet-box').forEach(n => n.remove());
      decorateSheetBody(o);
      actions.insertAdjacentHTML('beforeend', sheetBox(o, S.confirming, S.busy));
    } else {
      /* 2º chofer: ya tiene el vehículo y el remito ya está hecho; lo lleva al destino y marca la entrega. */
      actions.querySelectorAll('.p3-arrive-btn, .p3-arrived-chip, [onclick*="abrirRemitoServicio"], .p3-other-actions').forEach(n => n.remove());
      actions.querySelectorAll('small').forEach(n => { if (/Tocalo al llegar|remito|activado/i.test(n.textContent)) n.remove(); });
      actions.querySelectorAll(':scope > .drl-box, :scope > .drl-sheet-box').forEach(n => n.remove());
      decorateReceivedSheet(r);
      actions.insertAdjacentHTML('afterbegin', receivedBox(r, S.confirming, S.busy, 'drl-sheet-box'));
    }
  }
  /* Pantalla de remito (1º chofer): el remito lo hace él con el cliente; después entrega el vehículo en el punto de encuentro. */
  function remitoBanner(o) {
    return `<div class="drl-remito-banner">${chipSide(1).replace(' drl-chip-side', '')}
      <p>Hacé el remito con el cliente y cobrá como siempre. Después llevás el vehículo a <b>${esc(place(o.exchange_address) || 'el punto de encuentro')}</b> y se lo entregás a <b>${esc(o.to_driver_name || 'el segundo chofer')}</b>.</p>
      <p class="drl-sub">Es un solo servicio y un solo remito: el otro chofer no hace remito.</p></div>`;
  }
  function decorateRemito(serviceId, retried) {
    const marker = document.getElementById('phase3-remito-context'); if (!marker) return;
    marker.querySelector('.drl-remito-banner')?.remove();
    const o = S.outgoing.find(x => String(x.service_id) === String(serviceId));
    if (o) { marker.insertAdjacentHTML('beforeend', remitoBanner(o)); return; }
    if (!S.loaded && !retried) refresh({ force: true }).then(() => decorateRemito(serviceId, true));
  }
  function refreshPreviewBox() {
    const modal = document.getElementById('p3-service-preview');
    if (!modal || modal.hidden) return;
    const id = modal.dataset.serviceRouteId; if (!id) return;
    const actions = document.getElementById('p3-preview-actions'), key = String(id);
    const o = S.outgoing.find(x => String(x.service_id) === key), r = S.received.find(x => String(x.service_id) === key);
    const box = actions?.querySelector(':scope > .drl-sheet-box');
    if (!box || (!o && !r)) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = o ? sheetBox(o, S.confirming, S.busy) : receivedBox(r, S.confirming, S.busy, 'drl-sheet-box');
    box.replaceWith(wrap.firstElementChild);
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
      if (o) html = outgoingBox(o, S.confirming, S.busy); else if (r) html = receivedBox(r, S.confirming, S.busy);
      /* El 2º chofer no hace remito: se sacan los botones de remito de su tarjeta. */
      if (r) card.querySelectorAll('[onclick*="abrirRemitoServicio"]').forEach(n => n.remove());
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
  /* Servicios que estaban «por recibir» y ahora ya son del chofer: el 1º entregó el vehículo. */
  const newlyReceived = (prevIncoming, nextReceived) => {
    const was = new Set((prevIncoming || []).map(x => String(x.service_id)));
    return (nextReceived || []).filter(x => was.has(String(x.service_id)));
  };
  async function refresh({ force = false } = {}) {
    if (!isDriver() || !db() || S.loading) return false;
    if (!force && Date.now() - S.at < THROTTLE) return false;
    S.loading = true;
    try {
      const { data, error } = await db().rpc('get_driver_relay_state_v1');
      if (error) throw error;
      const prevIncoming = S.loaded ? S.incoming : [];
      S.incoming = Array.isArray(data?.incoming) ? data.incoming : []; S.outgoing = Array.isArray(data?.outgoing) ? data.outgoing : [];
      S.received = Array.isArray(data?.received) ? data.received : []; S.loaded = true; S.at = Date.now();
      const arrived = newlyReceived(prevIncoming, S.received);
      if (arrived.length) {
        const x = arrived[0], who = String(x.from_driver_name || 'El primer chofer');
        notify(`${who} te entregó el vehículo${arrived.length > 1 ? ` (y ${arrived.length - 1} más)` : ''}. Llevalo al destino y marcá la entrega (no hacés remito).`, 'success');
        try { navigator.vibrate?.(200); } catch { /* sin vibración */ }
        try { void window.recargarServiciosChofer?.(); } catch { /* la lista se actualiza sola en el próximo ciclo */ }
      }
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

  async function deliver(id) {
    const key = 'd:' + id;
    if (S.busy) return;
    if (S.confirming !== key) {
      S.confirming = key; clearTimeout(S.timer); S.timer = setTimeout(() => { if (S.confirming === key) { S.confirming = ''; paint(); } }, 6000);
      return paint();
    }
    clearTimeout(S.timer); S.confirming = ''; S.busy = key; paint();
    try {
      const { error } = await db().rpc('mark_operator_service_relay_delivered_v1', { p_service_id: id });
      if (error) throw error;
      notify('Listo: marcaste el vehículo como entregado en destino.', 'success');
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
      if (b) { e.preventDefault(); e.stopPropagation(); void handover(b.dataset.drlHandover); return; }
      const dv = e.target.closest?.('[data-drl-delivered]');
      if (dv) { e.preventDefault(); e.stopPropagation(); void deliver(dv.dataset.drlDelivered); return; }
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
    /* Mientras espera un vehículo, se consulta cada 15 s (sólo con la app a la vista) para avisarle apenas se lo entregan. */
    setInterval(() => { if (document.visibilityState === 'visible' && S.incoming.length) void refresh({ force: true }); }, 15000);
    let tries = 0;
    const boot = setInterval(() => { tries++; if (isDriver() && db() && watch()) { clearInterval(boot); void refresh({ force: true }); } else if (tries > 120) clearInterval(boot); }, 500);
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', bind, { once: true }) : bind();
  }
  window.AuxRelevoChofer = { refresh, paint, handover, deliver, openIncoming, decoratePreview, _incomingSheet: incomingSheet, _mapsUrl: mapsUrl, _friendlyError: friendlyError, _incomingHtml: incomingHtml, _outgoingBox: outgoingBox, _sheetBox: sheetBox, _patchCard: patchCard, _newlyReceived: newlyReceived, _remitoBanner: remitoBanner, decorateRemito, _patchReceivedCard: patchReceivedCard, _receivedBox: receivedBox, _state: S };
})();

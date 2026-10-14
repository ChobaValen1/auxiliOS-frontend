/* Peajes › Mapa: un punto por peaje sobre las calles de OpenStreetMap.
   Activos en verde, archivados en gris (se pueden ocultar). Zoom con la rueda,
   los botones o pellizcando; se arrastra para moverse. Tocar un punto muestra el
   peaje (o los peajes que comparten ubicación) con su importe y Editar.
   Sin red, quedan los puntos sobre un fondo liso. */
(function () {
  'use strict';
  if (window.AuxiliosTollMap) return;

  const TILE = 256, ZMIN = 4, ZMAX = 17;
  const S = { z: 8, cx: 0, cy: 0, fitted: false, showArchived: true, selected: null, drag: null, pinch: null };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = n => `<svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#${n}"/></svg>`;
  const money = v => v == null ? 'Sin importe' : '$' + Number(v).toLocaleString('es-AR', { maximumFractionDigits: 2 });

  // Web Mercator: mundo 0..1 → píxeles del zoom z.
  const world = (lat, lng) => [(lng + 180) / 360, 0.5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI)];
  const size = z => TILE * Math.pow(2, z);

  function rows() { return (window.AuxiliosTolls?.state?.rows || []); }
  function located(r) { return r.latitude != null && r.longitude != null && Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude)); }
  function rateOf(r) {
    const rates = Array.isArray(r.rates) ? r.rates : [];
    const cur = rates.filter(x => x.is_current && x.is_active);
    return cur.find(x => x.vehicle_category === 'light_2_axles' && x.payment_method === 'any') || cur[0] || null;
  }

  /* Peajes en el mismo punto (misma dirección) van en un solo marcador. */
  function groups() {
    const map = new Map();
    rows().filter(located).filter(r => S.showArchived || r.is_active).forEach(r => {
      const key = Number(r.latitude).toFixed(5) + ',' + Number(r.longitude).toFixed(5);
      if (!map.has(key)) map.set(key, { key, lat: Number(r.latitude), lng: Number(r.longitude), items: [] });
      map.get(key).items.push(r);
    });
    return [...map.values()].map(g => ({ ...g, active: g.items.some(r => r.is_active) }));
  }

  function box() { return document.getElementById('tmm-canvas'); }

  function fit() {
    const el = box(), gs = groups();
    if (!el || !gs.length) return;
    const w = el.clientWidth || 600, h = el.clientHeight || 420;
    const pts = gs.map(g => world(g.lat, g.lng));
    const minX = Math.min(...pts.map(p => p[0])), maxX = Math.max(...pts.map(p => p[0]));
    const minY = Math.min(...pts.map(p => p[1])), maxY = Math.max(...pts.map(p => p[1]));
    let z = ZMAX;
    while (z > ZMIN && ((maxX - minX) * size(z) > w - 80 || (maxY - minY) * size(z) > h - 80)) z--;
    S.z = Math.min(z, 12);
    S.cx = (minX + maxX) / 2;
    S.cy = (minY + maxY) / 2;
    S.fitted = true;
  }

  function draw() {
    const el = box();
    if (!el) return;
    const w = el.clientWidth || 600, h = el.clientHeight || 420, n = Math.pow(2, S.z), px = size(S.z);
    const ox = S.cx * px - w / 2, oy = S.cy * px - h / 2; // esquina superior izquierda en píxeles del mundo
    let tiles = '';
    for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + h) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + w) / TILE); tx++) {
        const wx = ((tx % n) + n) % n;
        tiles += `<img alt="" draggable="false" src="https://tile.openstreetmap.org/${S.z}/${wx}/${ty}.png" style="left:${Math.round(tx * TILE - ox)}px;top:${Math.round(ty * TILE - oy)}px" onerror="this.style.visibility='hidden'">`;
      }
    }
    const marks = groups().map(g => {
      const p = world(g.lat, g.lng), x = p[0] * px - ox, y = p[1] * px - oy;
      if (x < -30 || y < -30 || x > w + 30 || y > h + 30) return '';
      const names = g.items.map(r => r.name).join(', ');
      return `<button type="button" class="tmm-pin ${g.active ? 'is-active' : 'is-archived'}${S.selected === g.key ? ' is-sel' : ''}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px" data-tmm-pin="${esc(g.key)}" aria-label="${esc(names)}${g.active ? '' : ' (archivado)'}">${g.items.length > 1 ? `<b>${g.items.length}</b>` : ''}</button>`;
    }).join('');
    el.querySelector('.tmm-tiles').innerHTML = tiles;
    el.querySelector('.tmm-pins').innerHTML = marks;
    renderCard();
  }

  function renderCard() {
    const card = document.getElementById('tmm-card');
    if (!card) return;
    const g = groups().find(x => x.key === S.selected);
    if (!g) { card.hidden = true; return; }
    card.hidden = false;
    card.innerHTML = `<button type="button" class="tmm-card-x" data-tmm-close aria-label="Cerrar">${ico('x')}</button>${g.items.length > 1 ? `<small class="tmm-card-note">${g.items.length} peajes en este punto</small>` : ''}${g.items.map(r => {
      const rate = rateOf(r);
      return `<div class="tmm-card-row"><div><b>${esc(r.name)}</b><small>${esc(r.address || r.road || 'Sin dirección')}</small></div>
        <div class="tmm-card-meta"><span class="tm-badge ${r.is_active ? 'is-active' : 'is-archived'}">${r.is_active ? 'Activo' : 'Archivado'}</span><strong>${esc(money(rate?.amount))}</strong></div>
        <button type="button" class="btn btn-ghost tm-admin" data-tmm-edit="${esc(r.toll_id)}">${ico('pencil')}Editar</button></div>`;
    }).join('')}`;
    if (typeof window.AuxiliosTolls?.applyRole === 'function') window.AuxiliosTolls.applyRole();
  }

  function renderSide() {
    const side = document.getElementById('tmm-side');
    if (!side) return;
    const all = rows();
    const conUb = all.filter(located), sinUb = all.filter(r => !located(r));
    const act = all.filter(r => r.is_active).length;
    const item = r => `<button type="button" class="tmm-item ${r.is_active ? '' : 'is-archived'}" data-tmm-focus="${esc(r.toll_id)}"><i class="tmm-dot ${r.is_active ? 'is-active' : 'is-archived'}" aria-hidden="true"></i><span><b>${esc(r.name)}</b><small>${esc(money(rateOf(r)?.amount))}</small></span></button>`;
    side.innerHTML = `<div class="tmm-legend"><span><i class="tmm-dot is-active"></i>${act} activo${act === 1 ? '' : 's'}</span><span><i class="tmm-dot is-archived"></i>${all.length - act} archivado${all.length - act === 1 ? '' : 's'}</span></div>
      <label class="ax-switch tmm-toggle"><span>Mostrar archivados</span><input type="checkbox" data-tmm-archived ${S.showArchived ? 'checked' : ''}></label>
      <div class="tmm-list">${conUb.filter(r => S.showArchived || r.is_active).sort((a, b) => (a.is_active ? 0 : 1) - (b.is_active ? 0 : 1)).map(item).join('')}</div>
      ${sinUb.length ? `<div class="tmm-missing"><b>${sinUb.length} sin ubicación</b><small>No aparecen en el mapa. Editalos y elegí la dirección de la lista.</small>${sinUb.map(r => `<button type="button" class="tmm-missing-item tm-admin" data-tmm-edit="${esc(r.toll_id)}">${esc(r.name)}${ico('chevron-right')}</button>`).join('')}</div>` : ''}`;
  }

  function zoomAt(dz, mx, my) {
    const el = box();
    if (!el) return;
    const nz = Math.max(ZMIN, Math.min(ZMAX, S.z + dz));
    if (nz === S.z) return;
    const w = el.clientWidth, h = el.clientHeight;
    mx = mx ?? w / 2; my = my ?? h / 2;
    // Mantiene fijo el punto bajo el cursor.
    const px = size(S.z), wx = S.cx + (mx - w / 2) / px, wy = S.cy + (my - h / 2) / px, npx = size(nz);
    S.cx = wx - (mx - w / 2) / npx; S.cy = wy - (my - h / 2) / npx; S.z = nz;
    draw();
  }

  function focus(id) {
    const r = rows().find(x => String(x.toll_id) === String(id));
    if (!r || !located(r)) return;
    if (!r.is_active) S.showArchived = true;
    const p = world(Number(r.latitude), Number(r.longitude));
    S.cx = p[0]; S.cy = p[1]; S.z = Math.max(S.z, 13);
    S.selected = Number(r.latitude).toFixed(5) + ',' + Number(r.longitude).toFixed(5);
    renderSide(); draw();
  }

  function edit(id) {
    window.AuxiliosTolls?.showSection?.('tolls');
    window.AuxiliosTolls?.beginEdit?.(id);
    document.getElementById('tm-simple-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function bind() {
    if (document.documentElement.dataset.tmmBound === '1') return;
    document.documentElement.dataset.tmmBound = '1';
    document.addEventListener('click', ev => {
      if (!ev.target.closest('#tm-section-map')) return;
      const pin = ev.target.closest('[data-tmm-pin]');
      if (pin) { S.selected = S.selected === pin.dataset.tmmPin ? null : pin.dataset.tmmPin; return draw(); }
      if (ev.target.closest('[data-tmm-close]')) { S.selected = null; return draw(); }
      const z = ev.target.closest('[data-tmm-zoom]');
      if (z) return zoomAt(Number(z.dataset.tmmZoom));
      if (ev.target.closest('[data-tmm-fit]')) { fit(); S.selected = null; return draw(); }
      const f = ev.target.closest('[data-tmm-focus]');
      if (f) return focus(f.dataset.tmmFocus);
      const e = ev.target.closest('[data-tmm-edit]');
      if (e) return edit(e.dataset.tmmEdit);
    });
    document.addEventListener('change', ev => {
      if (!ev.target.matches('[data-tmm-archived]')) return;
      S.showArchived = ev.target.checked; S.selected = null; renderSide(); draw();
    });
    document.addEventListener('wheel', ev => {
      const el = ev.target.closest('#tmm-canvas');
      if (!el) return;
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(ev.deltaY < 0 ? 1 : -1, ev.clientX - r.left, ev.clientY - r.top);
    }, { passive: false });
    document.addEventListener('pointerdown', ev => {
      const el = ev.target.closest('#tmm-canvas');
      if (!el || ev.target.closest('.tmm-pin, .tmm-controls, #tmm-card')) return;
      S.drag = { x: ev.clientX, y: ev.clientY, cx: S.cx, cy: S.cy, moved: false };
      el.setPointerCapture?.(ev.pointerId);
    });
    document.addEventListener('pointermove', ev => {
      if (!S.drag || S.pinch) return;
      const dx = ev.clientX - S.drag.x, dy = ev.clientY - S.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) S.drag.moved = true;
      const px = size(S.z);
      S.cx = S.drag.cx - dx / px; S.cy = S.drag.cy - dy / px;
      draw();
    });
    document.addEventListener('pointerup', () => { S.drag = null; });
    document.addEventListener('dblclick', ev => {
      const el = ev.target.closest('#tmm-canvas');
      if (!el || ev.target.closest('.tmm-pin, .tmm-controls, #tmm-card')) return;
      const r = el.getBoundingClientRect();
      zoomAt(1, ev.clientX - r.left, ev.clientY - r.top);
    });
    // Pellizco en el celular.
    document.addEventListener('touchstart', ev => {
      if (!ev.target.closest('#tmm-canvas') || ev.touches.length !== 2) return;
      S.drag = null;
      S.pinch = Math.hypot(ev.touches[0].clientX - ev.touches[1].clientX, ev.touches[0].clientY - ev.touches[1].clientY);
    }, { passive: true });
    document.addEventListener('touchmove', ev => {
      if (!S.pinch || ev.touches.length !== 2) return;
      const d = Math.hypot(ev.touches[0].clientX - ev.touches[1].clientX, ev.touches[0].clientY - ev.touches[1].clientY);
      if (d / S.pinch > 1.35) { zoomAt(1); S.pinch = d; } else if (d / S.pinch < 0.74) { zoomAt(-1); S.pinch = d; }
    }, { passive: true });
    document.addEventListener('touchend', ev => { if (ev.touches.length < 2) S.pinch = null; });
    window.addEventListener('resize', () => { if (!document.getElementById('tm-section-map')?.hidden) draw(); });
  }

  /* Lo llama Peajes cada vez que se muestra la pestaña o cambian los datos. */
  function refresh() {
    const sec = document.getElementById('tm-section-map');
    if (!sec) return;
    if (!sec.dataset.ready) {
      sec.dataset.ready = '1';
      sec.innerHTML = `<div class="tmm-wrap">
        <div class="tmm-map"><div id="tmm-canvas" class="tmm-canvas" role="application" aria-label="Mapa de peajes"><div class="tmm-tiles"></div><div class="tmm-pins"></div>
          <div class="tmm-controls"><button type="button" data-tmm-zoom="1" aria-label="Acercar">+</button><button type="button" data-tmm-zoom="-1" aria-label="Alejar">−</button><button type="button" data-tmm-fit aria-label="Ver todos los peajes" title="Ver todos">${ico('map')}</button></div>
          <div id="tmm-card" class="tmm-card" hidden></div>
          <small class="tmm-attrib">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></small></div></div>
        <aside id="tmm-side" class="tmm-side"></aside></div>`;
      bind();
    }
    renderSide();
    if (sec.hidden) return;
    if (!S.fitted) fit();
    draw();
  }

  window.AuxiliosTollMap = { refresh, _test: { groups, world, S } };
})();

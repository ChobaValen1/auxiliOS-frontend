/* AuxiliOS · Panel compacto (opción 1).
   Una sola barra: pestañas a la izquierda; período y botón «Filtros» a la derecha. Los filtros de la sección
   se abren en un panel (en celular, desde abajo) y los que están activos quedan a la vista como chips con ✕.
   No cambia cómo filtran las secciones: sólo mueve sus controles y les cambia el valor como lo haría la persona. */
(function (global) {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ICONO = '<svg class="ax-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function etiqueta(sel) {
    var a = String(sel.getAttribute('aria-label') || '').replace(/^Filtrar por\s*/i, '').trim();
    return a ? a.charAt(0).toUpperCase() + a.slice(1) : 'Filtro';
  }
  function cajasVisibles() { return Array.prototype.slice.call(document.querySelectorAll('#dashx-toolbar .dashx-toolbar-filtros:not([hidden])')); }
  function activos() {
    var out = [];
    cajasVisibles().forEach(function (c) { c.querySelectorAll('select').forEach(function (s) { if (s.value) out.push(s); }); });
    return out;
  }
  function cerrar() {
    var tb = $('dashx-toolbar'), b = $('dashx-filtros-btn');
    if (tb) tb.classList.remove('is-filters-open');
    if (b && b.getAttribute('aria-expanded') !== 'false') b.setAttribute('aria-expanded', 'false');
  }
  function quitar(sel) { sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true })); }

  /* Sólo toca el DOM si algo cambió: lo observa un MutationObserver y no tiene que realimentarse. */
  function chipsHtml(lista) {
    return lista.map(function (s) {
      var op = s.options[s.selectedIndex];
      return '<button type="button" class="dashx-chip" data-sel="' + esc(s.id) + '" aria-label="Quitar filtro ' + esc(etiqueta(s)) + '">' +
        esc(etiqueta(s)) + ': <b>' + esc(op ? op.text : s.value) + '</b><span aria-hidden="true">✕</span></button>';
    }).join('') + (lista.length > 1 ? '<button type="button" class="dashx-chip-clear">Limpiar filtros</button>' : '');
  }
  function pintar() {
    var btn = $('dashx-filtros-btn'), chips = $('dashx-chips');
    if (!btn || !chips) return;
    var hay = cajasVisibles().length > 0;
    if (btn.hidden === hay) btn.hidden = !hay;
    if (!hay) cerrar();
    var act = hay ? activos() : [], n = act.length ? String(act.length) : '';
    var badge = btn.querySelector('.dashx-filtros-n');
    if (badge.textContent !== n) badge.textContent = n;
    if (badge.hidden === !!n) badge.hidden = !n;
    var html = chipsHtml(act);
    if (chips.dataset.html !== html) { chips.dataset.html = html; chips.innerHTML = html; }
    if (chips.hidden === !!act.length) chips.hidden = !act.length;
  }

  function montar() {
    var vista = $('dash-view-analitica');
    var head = vista && vista.querySelector('.dashx-head'), barra = vista && vista.querySelector('.dashx-barra-secciones'), tb = $('dashx-toolbar');
    if (!head || !barra || !tb) return false;
    if (head.dataset.compacto === '1') return true;
    head.dataset.compacto = '1';
    head.classList.add('is-compact');
    head.insertBefore(barra, head.firstChild);

    var btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'dashx-filtros-btn'; btn.className = 'dashx-filtros-btn';
    btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-haspopup', 'true');
    btn.innerHTML = ICONO + '<span>Filtros</span><b class="dashx-filtros-n" hidden></b>';
    tb.appendChild(btn);
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var abierto = tb.classList.toggle('is-filters-open');
      btn.setAttribute('aria-expanded', abierto ? 'true' : 'false');
      if (abierto) { var p = cajasVisibles()[0], f = p && p.querySelector('select'); if (f) f.focus({ preventScroll: true }); }
    });
    document.addEventListener('click', function (e) {
      if (!tb.classList.contains('is-filters-open')) return;
      if (e.target.closest && e.target.closest('#dashx-toolbar .dashx-toolbar-filtros, #dashx-filtros-btn')) return;
      cerrar();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && tb.classList.contains('is-filters-open')) { cerrar(); btn.focus({ preventScroll: true }); } });

    var chips = document.createElement('div');
    chips.id = 'dashx-chips'; chips.className = 'dashx-chips'; chips.hidden = true; chips.setAttribute('aria-label', 'Filtros activos');
    head.parentNode.insertBefore(chips, head.nextSibling);
    chips.addEventListener('click', function (e) {
      var c = e.target.closest && e.target.closest('.dashx-chip');
      if (c) { var s = $(c.getAttribute('data-sel')); if (s) quitar(s); return; }
      if (e.target.closest && e.target.closest('.dashx-chip-clear')) activos().forEach(quitar);
    });
    tb.addEventListener('change', function () { setTimeout(pintar, 0); });
    new MutationObserver(pintar).observe(tb, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
    pintar();
    return true;
  }

  var intentos = 0, boot = setInterval(function () { if (montar() || ++intentos > 120) clearInterval(boot); }, 250);
  global.AuxDashCompacto = { montar: montar, pintar: pintar, _etiqueta: etiqueta, _chipsHtml: chipsHtml };
})(window);

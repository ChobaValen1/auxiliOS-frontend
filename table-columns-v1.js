/* AuxiliOS · Columnas personalizables de una tabla (v1)

   Cada usuario elige qué columnas ve y en qué orden. Se guarda en el navegador (por usuario y
   por tabla), sin tocar la base: si el catálogo cambia, lo guardado se reconcilia solo (las
   columnas nuevas aparecen donde corresponde y las que ya no existen se descartan).

     var cols = AuxiliosTableColumns.create({ id: 'facturas', columns: [
       { key: 'numero', label: 'Factura', locked: true },     // locked: no se puede ocultar
       { key: 'creada', label: 'Creada por', optional: true }  // optional: oculta por defecto
     ] });
     cols.list()        → claves visibles, en orden
     cols.has('creada') → ¿se ve?
     cols.open(fn)      → panel "Columnas"; llama a fn() cuando cambia algo
*/
(function (global) {
  'use strict';

  var PREFIX = 'auxilios.columns.v1:';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ico(name) { return '<svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#' + name + '"/></svg>'; }
  function userId() {
    try {
      var p = typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : (global.PERFIL_USUARIO || {});
      return String((p && (p.user_id || p.id)) || 'anon');
    } catch (_) { return 'anon'; }
  }

  /* Junta el catálogo con lo guardado: orden guardado primero, lo nuevo al final y
     lo bloqueado siempre visible. Pura, para probarla sin navegador. */
  function reconcile(catalog, saved) {
    var keys = catalog.map(function (c) { return c.key; });
    var byKey = {};
    catalog.forEach(function (c) { byKey[c.key] = c; });
    var order = [], seen = {};
    ((saved && Array.isArray(saved.order)) ? saved.order : []).forEach(function (k) {
      if (byKey[k] && !seen[k]) { order.push(k); seen[k] = true; }
    });
    keys.forEach(function (k) { if (!seen[k]) { order.push(k); seen[k] = true; } });
    var vis = (saved && saved.visible && typeof saved.visible === 'object') ? saved.visible : {};
    return order.map(function (k) {
      var c = byKey[k];
      var on = c.locked ? true : (Object.prototype.hasOwnProperty.call(vis, k) ? !!vis[k] : !c.optional);
      return { key: k, label: c.label, locked: !!c.locked, visible: on };
    });
  }

  function create(opts) {
    var catalog = opts.columns.slice();
    var storeKey = function () { return PREFIX + opts.id + ':' + userId(); };
    var cache = null, cacheUser = null;

    function read() {
      try {
        var raw = global.localStorage && global.localStorage.getItem(storeKey());
        var p = raw ? JSON.parse(raw) : null;
        return p && typeof p === 'object' ? p : null;
      } catch (_) { return null; }
    }
    function write(items) {
      var visible = {};
      items.forEach(function (i) { visible[i.key] = i.visible; });
      try { global.localStorage && global.localStorage.setItem(storeKey(), JSON.stringify({ order: items.map(function (i) { return i.key; }), visible: visible })); } catch (_) { /* sin almacenamiento: queda sólo en memoria */ }
    }
    function items() {
      var u = userId();
      if (!cache || cacheUser !== u) { cache = reconcile(catalog, read()); cacheUser = u; }
      return cache;
    }
    function commit(next) { cache = next; cacheUser = userId(); write(next); }

    var api = {
      all: function () { return items().map(function (i) { return Object.assign({}, i); }); },
      list: function () { return items().filter(function (i) { return i.visible; }).map(function (i) { return i.key; }); },
      has: function (key) { return items().some(function (i) { return i.key === key && i.visible; }); },
      label: function (key) { var c = catalog.find(function (x) { return x.key === key; }); return c ? c.label : key; },
      isCustom: function () {
        var d = reconcile(catalog, null);
        var now = items();
        return now.some(function (i, n) { return d[n].key !== i.key || d[n].visible !== i.visible; });
      },
      reset: function () { cache = reconcile(catalog, null); cacheUser = userId(); try { global.localStorage && global.localStorage.removeItem(storeKey()); } catch (_) { /* nada */ } },
      set: function (key, on) {
        commit(items().map(function (i) { return i.key === key && !i.locked ? Object.assign({}, i, { visible: !!on }) : i; }));
      },
      move: function (key, dir) {
        var list = items().slice(), i = list.findIndex(function (x) { return x.key === key; }), j = i + dir;
        if (i < 0 || j < 0 || j >= list.length) return;
        var t = list[i]; list[i] = list[j]; list[j] = t;
        commit(list);
      },
      open: function (onChange) { openPanel(api, opts, onChange); }
    };
    return api;
  }

  /* ── Panel ── */
  var root = null, current = null;

  function panelBody(api) {
    var list = api.all();
    var visibles = list.filter(function (i) { return i.visible; }).length;
    return list.map(function (i, n) {
      return '<div class="tc-row" data-tc-row="' + esc(i.key) + '">'
        + '<label class="ax-switch"><input type="checkbox" data-tc-toggle="' + esc(i.key) + '"' + (i.visible ? ' checked' : '') + (i.locked ? ' disabled' : '') + '><span>' + esc(i.label) + '</span></label>'
        + (i.locked ? '<small class="tc-lock">' + ico('lock') + 'Siempre visible</small>' : '')
        + '<span class="tc-move"><button type="button" class="ax-btn ax-btn-ghost ax-btn-icon ax-btn-sm tc-up" data-tc-move="-1" data-tc-key="' + esc(i.key) + '" aria-label="Subir ' + esc(i.label) + '"' + (n === 0 ? ' disabled' : '') + '>' + ico('chevron-down') + '</button>'
        + '<button type="button" class="ax-btn ax-btn-ghost ax-btn-icon ax-btn-sm" data-tc-move="1" data-tc-key="' + esc(i.key) + '" aria-label="Bajar ' + esc(i.label) + '"' + (n === list.length - 1 ? ' disabled' : '') + '>' + ico('chevron-down') + '</button></span></div>';
    }).join('') + '<p class="tc-count">' + visibles + ' de ' + list.length + ' columnas visibles</p>';
  }

  function paint() {
    if (!root || !current) return;
    var body = root.querySelector('[data-tc-body]');
    var scroll = body.scrollTop;
    body.innerHTML = panelBody(current.api);
    body.scrollTop = scroll;
    root.querySelector('[data-tc-reset]').disabled = !current.api.isCustom();
  }

  function openPanel(api, opts, onChange) {
    var doc = global.document;
    if (!doc || !global.AxUI) return;
    if (!root) {
      root = doc.createElement('div');
      root.id = 'tc-modal';
      root.className = 'ax-backdrop';
      root.hidden = true;
      root.innerHTML = '<section class="ax-modal tc-modal" role="dialog" aria-modal="true" aria-labelledby="tc-title"><header><div><h2 id="tc-title">Columnas</h2><p data-tc-sub></p></div>'
        + '<button class="ax-btn ax-btn-ghost ax-btn-icon" type="button" data-tc-close aria-label="Cerrar">' + ico('x') + '</button></header>'
        + '<div class="ax-modal-body tc-body" data-tc-body></div>'
        + '<footer><button class="ax-btn" type="button" data-tc-reset>' + ico('refresh-cw') + 'Restablecer</button><button class="ax-btn ax-btn-primary" type="button" data-tc-close>Listo</button></footer></section>';
      doc.body.appendChild(root);
      root.addEventListener('change', function (e) {
        var t = e.target.closest && e.target.closest('[data-tc-toggle]');
        if (!t || !current) return;
        current.api.set(t.getAttribute('data-tc-toggle'), t.checked);
        paint(); current.onChange && current.onChange();
      });
      root.addEventListener('click', function (e) {
        if (!current) return;
        var mv = e.target.closest('[data-tc-move]');
        if (mv) {
          current.api.move(mv.getAttribute('data-tc-key'), Number(mv.getAttribute('data-tc-move')));
          paint(); current.onChange && current.onChange();
          var again = root.querySelector('[data-tc-key="' + mv.getAttribute('data-tc-key') + '"][data-tc-move="' + mv.getAttribute('data-tc-move') + '"]');
          if (again && !again.disabled) again.focus();
          return;
        }
        if (e.target.closest('[data-tc-reset]')) { current.api.reset(); paint(); current.onChange && current.onChange(); return; }
        if (e.target.closest('[data-tc-close]') || e.target === root) { global.AxUI.closeModal(root); current = null; }
      });
    }
    current = { api: api, onChange: onChange };
    root.querySelector('[data-tc-sub]').textContent = opts.title || 'Elegí qué columnas ver y en qué orden. Se guarda para tu usuario en este navegador.';
    paint();
    global.AxUI.openModal(root);
  }

  global.AuxiliosTableColumns = { create: create, reconcile: reconcile };
  if (typeof module !== 'undefined') module.exports = global.AuxiliosTableColumns;
})(typeof window !== 'undefined' ? window : globalThis);

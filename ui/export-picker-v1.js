/* AuxiliOS · Selector de columnas para exportar (Excel o CSV)
   Reutilizable: cada pantalla pasa su catálogo de columnas y una clave propia.
   Recuerda en este navegador qué columnas se eligieron, en qué orden y el formato. */
(function (global) {
  'use strict';
  var PREFIX = 'auxilios.export.columns.v1.';
  var state = null;

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function read(key) { try { var raw = global.localStorage && global.localStorage.getItem(PREFIX + key); var v = raw ? JSON.parse(raw) : null; return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } }
  function write(key, value) { try { global.localStorage && global.localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* sin almacenamiento: no se recuerda */ } }

  /* Orden guardado + columnas nuevas al final; selección guardada o, si no hay, las no opcionales. */
  function restore(key, columns) {
    var ids = columns.map(function (c) { return c.id; }), saved = read(key);
    var order = (Array.isArray(saved.order) ? saved.order : []).filter(function (id) { return ids.indexOf(id) >= 0; });
    ids.forEach(function (id) { if (order.indexOf(id) < 0) order.push(id); });
    var selected = Array.isArray(saved.selected)
      ? saved.selected.filter(function (id) { return ids.indexOf(id) >= 0; })
      : columns.filter(function (c) { return !c.optional; }).map(function (c) { return c.id; });
    return { order: order, selected: selected, format: saved.format === 'csv' ? 'csv' : 'xlsx' };
  }

  function byId(id) { return state.columns.filter(function (c) { return c.id === id; })[0]; }

  function markup() {
    var s = state, count = s.selected.length;
    var rows = s.order.map(function (id, i) {
      var c = byId(id); if (!c) return '';
      var on = s.selected.indexOf(id) >= 0;
      var grip = global.AxDragSort ? global.AxDragSort.grip : '';
      return '<li class="axx-row' + (on ? ' is-on' : '') + '" data-drag-key="' + esc(id) + '">' + grip + '<label><input type="checkbox" data-axx-col="' + esc(id) + '"' + (on ? ' checked' : '') + '><span>' + esc(c.header) + (c.optional ? ' <small>opcional</small>' : '') + '</span></label>'
        + '<span class="axx-move"><button type="button" data-axx-move="-1" data-axx-key="' + esc(id) + '" aria-label="Subir ' + esc(c.header) + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>'
        + '<button type="button" data-axx-move="1" data-axx-key="' + esc(id) + '" aria-label="Bajar ' + esc(c.header) + '"' + (i === s.order.length - 1 ? ' disabled' : '') + '>↓</button></span></li>';
    }).join('');
    var formats = s.formats.length > 1 ? '<div class="axx-format" role="radiogroup" aria-label="Formato">' + s.formats.map(function (f) {
      return '<button type="button" role="radio" data-axx-format="' + f + '" aria-checked="' + (s.format === f) + '">' + (f === 'csv' ? 'CSV' : 'Excel') + '</button>';
    }).join('') + '</div>' : '';
    return '<section class="axx-sheet" role="dialog" aria-modal="true" aria-labelledby="axx-title">'
      + '<header><div><small>Exportar</small><h3 id="axx-title">' + esc(s.title) + '</h3>' + (s.subtitle ? '<p>' + esc(s.subtitle) + '</p>' : '') + '</div><button type="button" class="axx-x" data-axx-close aria-label="Cerrar">×</button></header>'
      + '<div class="axx-tools">' + formats + '<span class="axx-count" data-axx-count>' + count + ' de ' + s.columns.length + ' columnas</span><button type="button" data-axx-all="1">Todas</button><button type="button" data-axx-all="0">Ninguna</button></div>'
      + '<ol class="axx-list">' + rows + '</ol>'
      + '<p class="axx-error" data-axx-error hidden></p>'
      + '<footer><button type="button" class="axx-secondary" data-axx-close>Cancelar</button><button type="button" class="axx-primary" data-axx-ok>Descargar</button></footer></section>';
  }

  function render(focusSel) {
    var back = document.getElementById('axx-backdrop');
    if (!back) {
      back = document.createElement('div'); back.id = 'axx-backdrop'; back.className = 'axx-backdrop';
      back.addEventListener('click', onClick); back.addEventListener('change', onChange); back.addEventListener('keydown', onKey);
      document.body.appendChild(back);
      // Arrastrar la fila para cambiar el orden (las flechas siguen para teclado).
      if (global.AxDragSort) global.AxDragSort.attach(back, { onMove: function (key, to) { if (!state) return; global.AxDragSort.reorder(state.order, key, to); render('[data-drag-key="' + key + '"] input'); } });
    }
    var scroll = back.querySelector('.axx-list') ? back.querySelector('.axx-list').scrollTop : 0;
    back.innerHTML = markup();
    var list = back.querySelector('.axx-list'); if (list) list.scrollTop = scroll;
    var target = focusSel && back.querySelector(focusSel);
    (target && !target.disabled ? target : back.querySelector('[data-axx-ok]')).focus();
  }

  function finish(result) {
    var s = state; state = null;
    var back = document.getElementById('axx-backdrop'); if (back) back.remove();
    if (s && s.returnFocus && s.returnFocus.isConnected) s.returnFocus.focus();
    if (s) s.resolve(result);
  }

  function onChange(e) {
    var input = e.target.closest && e.target.closest('[data-axx-col]'); if (!input || !state) return;
    var id = input.getAttribute('data-axx-col'), i = state.selected.indexOf(id);
    if (input.checked && i < 0) state.selected.push(id);
    if (!input.checked && i >= 0) state.selected.splice(i, 1);
    input.closest('.axx-row').classList.toggle('is-on', input.checked);
    var count = document.querySelector('[data-axx-count]'); if (count) count.textContent = state.selected.length + ' de ' + state.columns.length + ' columnas';
  }

  function onClick(e) {
    if (!state) return;
    if (e.target === e.currentTarget || (e.target.closest && e.target.closest('[data-axx-close]'))) return finish(null);
    var move = e.target.closest('[data-axx-move]');
    if (move) {
      var key = move.getAttribute('data-axx-key'), dir = Number(move.getAttribute('data-axx-move')), o = state.order, i = o.indexOf(key), j = i + dir;
      if (i < 0 || j < 0 || j >= o.length) return;
      o[i] = o[j]; o[j] = key;
      return render('[data-axx-key="' + key + '"][data-axx-move="' + dir + '"]');
    }
    var all = e.target.closest('[data-axx-all]');
    if (all) { state.selected = all.getAttribute('data-axx-all') === '1' ? state.order.slice() : []; return render('[data-axx-all="' + all.getAttribute('data-axx-all') + '"]'); }
    var fmt = e.target.closest('[data-axx-format]');
    if (fmt) { state.format = fmt.getAttribute('data-axx-format'); return render('[data-axx-format="' + state.format + '"]'); }
    if (e.target.closest('[data-axx-ok]')) {
      var chosen = state.order.filter(function (id) { return state.selected.indexOf(id) >= 0; });
      if (!chosen.length) { var err = document.querySelector('[data-axx-error]'); if (err) { err.textContent = 'Elegí al menos una columna.'; err.hidden = false; } return; }
      write(state.key, { order: state.order, selected: chosen, format: state.format });
      return finish({ format: state.format, columns: chosen.map(byId) });
    }
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return finish(null); }
    if (e.key !== 'Tab') return;
    var list = Array.prototype.slice.call(e.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled)'));
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* open({key, title, subtitle, columns:[{id, header, optional?}], formats?}) → Promise<{format, columns}|null> */
  function open(opts) {
    var o = opts || {}, columns = (o.columns || []).filter(function (c) { return c && c.id; });
    if (!columns.length) return Promise.resolve(null);
    if (state) finish(null);
    return new Promise(function (resolve) {
      var saved = restore(o.key || 'default', columns), formats = Array.isArray(o.formats) && o.formats.length ? o.formats : ['xlsx', 'csv'];
      state = { key: o.key || 'default', title: o.title || 'Columnas', subtitle: o.subtitle || '', columns: columns, order: saved.order, selected: saved.selected, format: formats.indexOf(saved.format) >= 0 ? saved.format : formats[0], formats: formats, resolve: resolve, returnFocus: document.activeElement };
      render();
    });
  }

  /* Descarga con el exportador de AuxiliOS en el formato elegido. Las columnas llevan header/width/type/value. */
  function download(choice, o) {
    var excel = global.AuxiliosExcelExport; if (!excel) throw new Error('El exportador todavía no está disponible. Recargá AuxiliOS.');
    if (choice.format === 'csv') return excel.downloadCsv({ filename: o.filename, columns: choice.columns, rows: o.rows, detalle: o.detalle });
    return excel.download({ filename: o.filename, summaryRows: o.summaryRows || [], sheets: [{ name: o.sheetName || 'Datos', columns: choice.columns, rows: o.rows }], detalle: o.detalle });
  }

  global.AuxiliosExportPicker = { open: open, download: download, _restore: restore };
})(window);

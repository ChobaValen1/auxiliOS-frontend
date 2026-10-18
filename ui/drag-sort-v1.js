/* AuxiliOS · Arrastrar para ordenar (mouse y dedo)
   Se engancha una vez a un contenedor estable; las filas pueden volver a dibujarse.
   Cada fila lleva data-drag-key y una manija [data-drag-handle]. Al soltar avisa
   onMove(clave, nuevaPosición) y la pantalla reordena y vuelve a dibujar como hace con las flechas. */
(function (global) {
  'use strict';
  var ROW = '[data-drag-key]', HANDLE = '[data-drag-handle]';

  function rowsOf(list) { return Array.prototype.slice.call(list.children).filter(function (el) { return el.matches && el.matches(ROW); }); }
  function scrollParent(el) {
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      var s = getComputedStyle(n);
      if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) return n;
    }
    return null;
  }

  /* Posición final (0…n-1) si se suelta en (x, y): el lugar original más cercano al puntero.
     Usa las posiciones del comienzo del arrastre, así las filas que se corren no lo hacen saltar. */
  function targetIndex(slots, x, y) {
    var best = 0, bestD = Infinity;
    slots.forEach(function (b, i) {
      var dx = x < b.left ? b.left - x : x > b.right ? x - b.right : 0, dy = y < b.top ? b.top - y : y > b.bottom ? y - b.bottom : 0, d = dx * dx + dy * dy;
      if (d < bestD || (d === bestD && d === 0)) { bestD = d; best = i; }
    });
    return best;
  }
  function isGrid(list, rows) {
    if (rows.length < 2) return false;
    return Math.abs(rows[0].getBoundingClientRect().top - rows[1].getBoundingClientRect().top) < 2;
  }

  function attach(root, opts) {
    if (!root || root.__axDragSort) return;
    root.__axDragSort = true;
    var o = opts || {}, drag = null;

    /* Las demás filas se corren al lugar que ocuparían si se suelta ahora; la arrastrada sigue al puntero. */
    function mark() {
      var others = drag.rows.filter(function (r) { return r !== drag.row; }), final = others.slice();
      final.splice(drag.index, 0, drag.row);
      final.forEach(function (r, p) {
        if (r === drag.row) return;
        var from = drag.rects[drag.rows.indexOf(r)], to = drag.rects[p];
        r.style.transform = (from.left === to.left && from.top === to.top) ? '' : 'translate(' + (to.left - from.left) + 'px,' + (to.top - from.top) + 'px)';
      });
      drag.row.style.transform = 'translate(' + (drag.grid ? drag.dx : 0) + 'px,' + drag.dy + 'px)';
    }
    function move(e) {
      if (!drag || e.pointerId !== drag.id) return;
      e.preventDefault();
      drag.x = e.clientX; drag.y = e.clientY;
      drag.dx = e.clientX - drag.startX;
      drag.dy = e.clientY - drag.startY + (drag.scroller ? drag.scroller.scrollTop - drag.startScroll : 0);
      drag.index = targetIndex(drag.rects, drag.x, drag.y + (drag.scroller ? drag.scroller.scrollTop - drag.startScroll : 0));
      mark();
    }
    function tick() {
      if (!drag) return;
      var sc = drag.scroller;
      if (sc) {
        var b = sc.getBoundingClientRect(), edge = 40, step = 0;
        if (drag.y < b.top + edge) step = -8; else if (drag.y > b.bottom - edge) step = 8;
        if (step) { sc.scrollTop += step; drag.dy = drag.y - drag.startY + sc.scrollTop - drag.startScroll; drag.index = targetIndex(drag.rects, drag.x, drag.y + (drag.scroller ? drag.scroller.scrollTop - drag.startScroll : 0)); mark(); }
      }
      drag.raf = requestAnimationFrame(tick);
    }
    function end(e, cancel) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var d = drag; drag = null;
      cancelAnimationFrame(d.raf);
      d.rows.forEach(function (r) { r.classList.remove('ax-dragging', 'ax-drag-shift'); r.style.transform = ''; });
      d.list.classList.remove('ax-drag-active', 'ax-drag-grid');
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancelUp);
      document.removeEventListener('keydown', esc, true);
      if (!cancel && d.index !== d.from && typeof o.onMove === 'function') o.onMove(d.row.getAttribute('data-drag-key'), d.index, d.list);
    }
    function up(e) { end(e, false); }
    function cancelUp(e) { end(e, true); }
    function esc(e) { if (e.key === 'Escape' && drag) { e.preventDefault(); e.stopPropagation(); end(null, true); } }

    root.addEventListener('pointerdown', function (e) {
      var handle = e.target.closest && e.target.closest(HANDLE);
      if (!handle || !root.contains(handle) || (e.pointerType === 'mouse' && e.button !== 0)) return;
      var row = handle.closest(ROW), list = row && row.parentElement;
      if (!row || !list || row.getAttribute('data-drag-disabled') === 'true') return;
      e.preventDefault();
      var rows = rowsOf(list), sc = scrollParent(list);
      drag = { id: e.pointerId, row: row, list: list, rows: rows, from: rows.indexOf(row), index: rows.indexOf(row), startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, dx: 0, dy: 0, grid: isGrid(list, rows), scroller: sc, startScroll: sc ? sc.scrollTop : 0 };
      drag.rects = rows.map(function (r) { var b = r.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; });
      rows.forEach(function (r) { if (r !== row) r.classList.add('ax-drag-shift'); });
      row.classList.add('ax-dragging'); list.classList.add('ax-drag-active'); if (drag.grid) list.classList.add('ax-drag-grid');
      document.addEventListener('pointermove', move, { passive: false });
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', cancelUp);
      document.addEventListener('keydown', esc, true);
      drag.raf = requestAnimationFrame(tick);
    });
  }

  /* Mueve una clave dentro de un arreglo a la posición indicada (la usan todas las pantallas). */
  function reorder(list, key, toIndex) {
    var from = list.indexOf(key); if (from < 0) return list;
    list.splice(from, 1); list.splice(Math.max(0, Math.min(toIndex, list.length)), 0, key);
    return list;
  }

  var GRIP = '<span class="ax-drag-handle" data-drag-handle title="Arrastrá para ordenar" aria-hidden="true"><svg viewBox="0 0 12 16" width="12" height="16"><circle cx="3" cy="3" r="1.4"/><circle cx="9" cy="3" r="1.4"/><circle cx="3" cy="8" r="1.4"/><circle cx="9" cy="8" r="1.4"/><circle cx="3" cy="13" r="1.4"/><circle cx="9" cy="13" r="1.4"/></svg></span>';

  global.AxDragSort = { attach: attach, reorder: reorder, grip: GRIP, _targetIndex: targetIndex };
})(window);

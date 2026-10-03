/* AuxiliOS · Comportamiento de los componentes base (v1)

   JS sin dependencias para que todas las pantallas se comporten igual:
     AxUI.toast({ title, text, tone })       aviso flotante (éxito se va solo; error queda)
     AxUI.openModal(el) / closeModal(el)     modal o panel lateral con foco atrapado y Esc
     AxUI.menu(boton, menu)                  menú ⋯ con teclado y cierre al tocar afuera
     AxUI.busy(boton, promesa)               botón "Guardando…" → tilde, sin doble clic
     AxUI.loading(el, promesa, esqueleto)    muestra el esqueleto sólo si tarda más de 300 ms
     AxUI.tabs(contenedor)                   raya de la pestaña que se desliza
     AxUI.flash(el)                          marca en ámbar algo que acaba de cambiar
     AxUI.multi(el, opciones)                selector múltiple con etiquetas (filtros)
     AxUI.mark(el, estado, avance)           marca en curso / listo / error
     AxUI.task(caja, { label, run })         chip de tarea con tiempo y "Reintentar"
     AxUI.swipe(fila, { start, end })        deslizar la fila en el celular (atajo)
     AxUI.seg(grupo, clave)                  control segmentado: la marca se desliza a la opción elegida
     AxUI.select(select)                     lista desplegable con el aspecto del sistema (usa el <select>)
   Los interruptores .ax-switch también se pueden arrastrar con el dedo.
   Además: [data-ax-collapse="#id"] abre y cierra un bloque .ax-collapse.
   Las duraciones salen de ui/tokens.css; con "reducir movimiento" no hay animación. */
(function (global) {
  'use strict';

  var doc = global.document;
  function reduce() { return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function ms(name, fallback) {
    var v = global.getComputedStyle ? global.getComputedStyle(doc.documentElement).getPropertyValue(name).trim() : '';
    var n = parseFloat(v);
    return isFinite(n) ? n : fallback;
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function icon(name, cls) { return '<svg class="ax-icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="/ui/icons.svg#' + name + '"/></svg>'; }
  /* Espera a que termine la animación de salida (o nada, si no hay movimiento). */
  function afterAnim(el, done) {
    if (reduce()) return done();
    var t = setTimeout(done, ms('--ax-dur', 180) + 60);
    el.addEventListener('animationend', function fin() { clearTimeout(t); el.removeEventListener('animationend', fin); done(); });
  }

  /* ── Avisos flotantes ─────────────────────────────────────────────── */
  var TONE = { ok: 'circle-check', danger: 'circle-x', info: 'info', warn: 'triangle-alert' };
  function toast(o) {
    o = o || {};
    var tone = o.tone || 'ok';
    var box = doc.querySelector('.ax-toasts');
    if (!box) { box = doc.createElement('div'); box.className = 'ax-toasts'; doc.body.appendChild(box); }
    // De a 3 como máximo: el más viejo se va.
    while (box.children.length >= 3) box.removeChild(box.firstElementChild);
    var el = doc.createElement('div');
    el.className = 'ax-toast ax-toast-' + tone;
    // Errores: anuncio inmediato y quedan hasta que se cierran. Éxito: se van solos.
    el.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
    var auto = o.timeout != null ? o.timeout : (tone === 'danger' ? 0 : ms('--ax-toast-ms', 4000));
    el.innerHTML = icon(TONE[tone] || 'info', 'ax-icon-lg') +
      '<span><b>' + esc(o.title) + '</b>' + (o.text ? '<small>' + esc(o.text) + '</small>' : '') + '</span>' +
      (o.action ? '<button type="button" class="ax-btn ax-btn-sm" data-ax-toast-action>' + esc(o.action.label) + '</button>' : '') +
      '<button type="button" class="ax-btn ax-btn-ghost ax-btn-icon ax-btn-sm ax-toast-close" aria-label="Cerrar aviso">' + icon('x') + '</button>' +
      (auto ? '<i class="ax-toast-bar" style="animation-duration:' + auto + 'ms"></i>' : '');
    box.appendChild(el);
    var timer = null, restante = auto, desde = Date.now();
    function cerrar() {
      if (el.hasAttribute('data-closing')) return;
      clearTimeout(timer);
      el.setAttribute('data-closing', '');
      afterAnim(el, function () { if (el.parentNode) el.parentNode.removeChild(el); });
    }
    function correr() { if (restante > 0) { desde = Date.now(); timer = setTimeout(cerrar, restante); } }
    // Con el mouse encima, el tiempo se frena (para poder leerlo).
    el.addEventListener('mouseenter', function () { clearTimeout(timer); restante -= Date.now() - desde; });
    el.addEventListener('mouseleave', correr);
    el.querySelector('.ax-toast-close').addEventListener('click', cerrar);
    var act = el.querySelector('[data-ax-toast-action]');
    if (act) act.addEventListener('click', function () { cerrar(); o.action.onClick && o.action.onClick(); });
    correr();
    return { close: cerrar };
  }

  /* ── Modal y panel lateral ────────────────────────────────────────── */
  var FOCO = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  var abiertos = [];
  function openModal(el, opts) {
    opts = opts || {};
    if (!el || abiertos.some(function (x) { return x.el === el; })) return;
    var ctx = { el: el, volver: doc.activeElement, estatico: !!opts.static || el.hasAttribute('data-static') };
    abiertos.push(ctx);
    el.hidden = false;
    el.removeAttribute('data-closing');
    el.setAttribute('data-anim', '');
    doc.body.style.overflow = 'hidden';
    // Foco: el primer campo, si no el botón principal, si no el primero que haya.
    var panel = el.querySelector('.ax-modal') || el;
    var primero = panel.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled])') ||
      panel.querySelector('.ax-btn-primary') || panel.querySelector(FOCO);
    setTimeout(function () { primero && primero.focus(); }, 30);
  }
  function closeModal(el) {
    var i = abiertos.findIndex(function (x) { return x.el === el; });
    if (i < 0) return;
    var ctx = abiertos.splice(i, 1)[0];
    el.removeAttribute('data-anim');
    el.setAttribute('data-closing', '');
    afterAnim(el, function () {
      el.hidden = true;
      el.removeAttribute('data-closing');
      if (!abiertos.length) doc.body.style.overflow = '';
      if (ctx.volver && ctx.volver.focus) ctx.volver.focus();   // el foco vuelve a quien lo abrió
    });
  }
  doc.addEventListener('keydown', function (ev) {
    var ctx = abiertos[abiertos.length - 1];
    if (!ctx) return;
    if (ev.key === 'Escape' && !ctx.estatico) { ev.preventDefault(); closeModal(ctx.el); return; }
    if (ev.key !== 'Tab') return;
    // Foco atrapado adentro del modal.
    var f = [].slice.call(ctx.el.querySelectorAll(FOCO)).filter(function (x) { return x.offsetParent !== null; });
    if (!f.length) return;
    if (ev.shiftKey && doc.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
    else if (!ev.shiftKey && doc.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
  });
  doc.addEventListener('click', function (ev) {
    var ctx = abiertos[abiertos.length - 1];
    // Tocar el fondo cierra, salvo en los modales que tienen datos a medio cargar (data-static).
    if (ctx && ev.target === ctx.el && ctx.el.classList.contains('ax-backdrop') && !ctx.estatico) closeModal(ctx.el);
    var c = ev.target.closest && ev.target.closest('[data-ax-close]');
    if (c) { var m = c.closest('.ax-backdrop,.ax-drawer'); if (m) closeModal(m); }
  });

  /* ── Menú ⋯ ───────────────────────────────────────────────────────── */
  var menuAbierto = null;
  function cerrarMenu(devolverFoco) {
    if (!menuAbierto) return;
    var m = menuAbierto; menuAbierto = null;
    m.menu.hidden = true;
    m.boton.setAttribute('aria-expanded', 'false');
    if (devolverFoco) m.boton.focus();
  }
  function menu(boton, el) {
    if (menuAbierto && menuAbierto.menu === el) return cerrarMenu(true);
    cerrarMenu();
    el.hidden = false;
    el.classList.add('ax-menu-float');
    el.setAttribute('role', 'menu');
    el.removeAttribute('data-anim'); void el.offsetWidth; el.setAttribute('data-anim', '');
    // Se abre debajo del botón, alineado a la derecha; si no entra abajo, arriba.
    var r = boton.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    var top = r.bottom + 4 + h > global.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4;
    el.style.top = top + 'px';
    el.style.left = Math.max(8, Math.min(global.innerWidth - w - 8, r.right - w)) + 'px';
    boton.setAttribute('aria-expanded', 'true');
    menuAbierto = { boton: boton, menu: el };
    var items = el.querySelectorAll('button:not([disabled])');
    if (items[0]) items[0].focus();
  }
  doc.addEventListener('click', function (ev) {
    if (!menuAbierto) return;
    // Las opciones con tilde (selector múltiple) no cierran el menú: se eligen varias.
    if (menuAbierto.menu.contains(ev.target)) { var mb = ev.target.closest('button'); if (mb && !mb.hasAttribute('aria-checked')) cerrarMenu(); return; }
    if (!menuAbierto.boton.contains(ev.target)) cerrarMenu();
  }, true);
  doc.addEventListener('keydown', function (ev) {
    if (!menuAbierto) return;
    var items = [].slice.call(menuAbierto.menu.querySelectorAll('button:not([disabled])'));
    var i = items.indexOf(doc.activeElement);
    if (ev.key === 'Escape') { ev.preventDefault(); cerrarMenu(true); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); (items[i + 1] || items[0]).focus(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
    else if (ev.key === 'Tab') cerrarMenu();
  });
  global.addEventListener('scroll', function () { cerrarMenu(); }, true);

  /* ── Botón que guarda ─────────────────────────────────────────────── */
  /* Evita el doble clic, muestra "Guardando…" y, si sale bien, un tilde un segundo.
     Si sale mal, el botón vuelve a como estaba (el error lo muestra quien llama). */
  function busy(btn, promesa, textos) {
    textos = textos || {};
    if (!btn || btn.getAttribute('data-state') === 'loading') return promesa;
    var antes = btn.innerHTML, ancho = btn.offsetWidth;
    btn.style.minWidth = ancho + 'px';
    btn.setAttribute('data-state', 'loading');
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;
    btn.innerHTML = icon('loader-circle') + esc(textos.loading || 'Guardando…');
    var inicio = Date.now();
    function volver() { btn.innerHTML = antes; btn.removeAttribute('data-state'); btn.removeAttribute('aria-busy'); btn.disabled = false; btn.style.minWidth = ''; }
    return Promise.resolve(promesa).then(function (r) {
      // Al menos 400 ms de "Guardando…" para que no parpadee.
      var espera = Math.max(0, 400 - (Date.now() - inicio));
      return new Promise(function (ok) { setTimeout(ok, espera); }).then(function () {
        btn.setAttribute('data-state', 'done');
        btn.innerHTML = icon('check') + esc(textos.done || 'Listo');
        setTimeout(volver, 1000);
        return r;
      });
    }, function (e) { volver(); throw e; });
  }

  /* ── Carga ────────────────────────────────────────────────────────── */
  /* Si responde en menos de 300 ms no se muestra nada (evita el parpadeo);
     si tarda más, el esqueleto; cuando llega, el contenido aparece suave. */
  function loading(el, promesa, esqueleto) {
    var t = setTimeout(function () { el.setAttribute('aria-busy', 'true'); el.innerHTML = esqueleto || '<div class="ax-skeleton" style="width:60%"></div>'; }, 300);
    return Promise.resolve(promesa).then(function (html) {
      clearTimeout(t); el.removeAttribute('aria-busy');
      if (typeof html === 'string') { el.innerHTML = html; el.classList.remove('ax-fade-in'); void el.offsetWidth; el.classList.add('ax-fade-in'); }
      return html;
    }, function (e) { clearTimeout(t); el.removeAttribute('aria-busy'); throw e; });
  }

  /* ── Pestañas ─────────────────────────────────────────────────────── */
  function tabs(box) {
    if (!box) return;
    var ink = box.querySelector('.ax-tabs-ink');
    if (!ink) { ink = doc.createElement('span'); ink.className = 'ax-tabs-ink'; box.appendChild(ink); }
    box.setAttribute('data-ink', '');
    function mover() {
      var t = box.querySelector('.ax-tab[aria-selected="true"]');
      if (!t) return;
      ink.style.width = t.offsetWidth + 'px';
      ink.style.transform = 'translateX(' + (t.offsetLeft - box.scrollLeft) + 'px)';
    }
    box.addEventListener('click', function (ev) {
      var t = ev.target.closest('.ax-tab');
      if (!t) return;
      box.querySelectorAll('.ax-tab').forEach(function (x) { x.setAttribute('aria-selected', String(x === t)); });
      mover();
    });
    // Flechas del teclado entre pestañas.
    box.addEventListener('keydown', function (ev) {
      if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
      var l = [].slice.call(box.querySelectorAll('.ax-tab')), i = l.indexOf(doc.activeElement);
      var n = l[(i + (ev.key === 'ArrowRight' ? 1 : -1) + l.length) % l.length];
      if (n) { n.focus(); n.click(); }
    });
    box.addEventListener('scroll', mover);
    global.addEventListener('resize', mover);
    mover();
  }

  /* ── Marcar un cambio ─────────────────────────────────────────────── */
  function flash(el) {
    if (!el) return;
    el.classList.remove('ax-flash'); void el.offsetWidth; el.classList.add('ax-flash');
    setTimeout(function () { el.classList.remove('ax-flash'); }, 1700);
  }

  /* ── Bloques que se abren y cierran ───────────────────────────────── */
  doc.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-ax-collapse]');
    if (!b) return;
    var box = doc.querySelector(b.getAttribute('data-ax-collapse'));
    if (!box) return;
    var abrir = !box.hasAttribute('data-open');
    box.toggleAttribute('data-open', abrir);
    b.setAttribute('aria-expanded', String(abrir));
  });

  /* ── Interruptor que se arrastra ──────────────────────────────────── */
  /* Tocar lo cambia como siempre; arrastrar la perilla lo deja del lado donde se suelta. */
  var arrastre = null;
  doc.addEventListener('pointerdown', function (ev) {
    var i = ev.target.closest && ev.target.closest('.ax-switch input');
    if (!i || i.disabled) return;
    arrastre = { input: i, x: ev.clientX, movio: false, destino: null };
  });
  doc.addEventListener('pointermove', function (ev) {
    if (!arrastre) return;
    var dx = ev.clientX - arrastre.x;
    if (!arrastre.movio && Math.abs(dx) < 6) return;
    arrastre.movio = true;
    arrastre.destino = dx > 0;
    arrastre.input.setAttribute('data-drag', dx > 0 ? 'on' : 'off');
  });
  doc.addEventListener('pointerup', function () {
    if (!arrastre) return;
    var a = arrastre; arrastre = null;
    a.input.removeAttribute('data-drag');
    if (!a.movio) return;
    // El clic que sigue al soltar se anula y se aplica el lado elegido.
    var destino = a.destino;
    a.input.addEventListener('click', function una(ev) {
      a.input.removeEventListener('click', una);
      ev.preventDefault();
      setTimeout(function () {
        if (a.input.checked === destino) return;
        a.input.checked = destino;
        a.input.dispatchEvent(new Event('change', { bubbles: true }));
      }, 0);
    });
    // Si soltó fuera del interruptor no llega el clic: se aplica igual.
    setTimeout(function () {
      if (a.input.checked !== destino) { a.input.checked = destino; a.input.dispatchEvent(new Event('change', { bubbles: true })); }
    }, 60);
  });

  /* ── Selector múltiple ────────────────────────────────────────────── */
  /* AxUI.multi(caja, { options: [{ value, label }], value: [...], placeholder, onChange })
     Lo elegido se ve como etiquetas; cada una se quita con su ×. */
  function multi(box, o) {
    o = o || {};
    var elegidos = (o.value || []).slice();
    var id = 'axm-' + Math.random().toString(36).slice(2, 8);
    box.classList.add('ax-multi');
    box.innerHTML = '<button type="button" class="ax-multi-btn" aria-haspopup="menu" aria-expanded="false"></button>' +
      '<div class="ax-menu" id="' + id + '" hidden>' + (o.options || []).map(function (op) {
        return '<button type="button" role="menuitemcheckbox" aria-checked="false" data-value="' + esc(op.value) + '"><span class="ax-check">' + icon('check') + '</span>' + esc(op.label) + '</button>';
      }).join('') + '</div>';
    var btn = box.querySelector('.ax-multi-btn'), lista = box.querySelector('.ax-menu');
    btn.setAttribute('aria-controls', id);
    function etiqueta(v) { var op = (o.options || []).filter(function (x) { return String(x.value) === String(v); })[0]; return op ? op.label : v; }
    function pintar() {
      btn.innerHTML = (elegidos.length ? elegidos.map(function (v) {
        return '<span class="ax-tag" data-value="' + esc(v) + '">' + esc(etiqueta(v)) + '<i role="button" aria-label="Quitar ' + esc(etiqueta(v)) + '">' + icon('x', 'ax-icon-sm') + '</i></span>';
      }).join('') : '<span class="ax-multi-ph">' + esc(o.placeholder || 'Todos') + '</span>') + icon('chevron-down', 'ax-chevron');
      lista.querySelectorAll('[aria-checked]').forEach(function (b) { b.setAttribute('aria-checked', String(elegidos.indexOf(b.getAttribute('data-value')) >= 0)); });
    }
    function cambiar(v, si) {
      var i = elegidos.indexOf(v);
      if (si && i < 0) elegidos.push(v); else if (!si && i >= 0) elegidos.splice(i, 1); else return;
      var tag = !si && btn.querySelector('.ax-tag[data-value="' + v.replace(/"/g, '\\"') + '"]');
      function listo() { pintar(); o.onChange && o.onChange(elegidos.slice()); }
      if (tag) { tag.setAttribute('data-closing', ''); if (reduce()) listo(); else setTimeout(listo, ms('--ax-dur-fast', 120)); } else listo();
    }
    btn.addEventListener('click', function (ev) {
      var x = ev.target.closest('.ax-tag i');
      if (x) { ev.stopPropagation(); cambiar(x.parentNode.getAttribute('data-value'), false); return; }
      lista.style.minWidth = btn.offsetWidth + 'px';
      menu(btn, lista);
    });
    lista.addEventListener('click', function (ev) {
      var b = ev.target.closest('[aria-checked]');
      if (b) cambiar(b.getAttribute('data-value'), b.getAttribute('aria-checked') !== 'true');
    });
    pintar();
    return { value: function () { return elegidos.slice(); }, set: function (v) { elegidos = (v || []).slice(); pintar(); } };
  }

  /* ── Marca de estado ──────────────────────────────────────────────── */
  var MARCA = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle class="ax-mark-ring" cx="10" cy="10" r="8"/><circle class="ax-mark-arc" cx="10" cy="10" r="8"/>' +
    '<path class="ax-mark-ok" d="M6.2 10.4l2.5 2.5 5.1-5.3"/><path class="ax-mark-ko" d="M7.3 7.3l5.4 5.4M12.7 7.3l-5.4 5.4"/></svg>';
  /* estado: 'running' | 'done' | 'error'; avance de 0 a 1 (si no se sabe, el arco gira). */
  function mark(el, estado, avance) {
    if (!el.querySelector('svg')) { el.classList.add('ax-mark'); el.innerHTML = MARCA; el.setAttribute('role', 'img'); }
    el.setAttribute('data-state', estado || 'running');
    if (avance != null && estado === 'running') { el.setAttribute('data-p', ''); el.style.setProperty('--p', Math.max(0, Math.min(1, avance))); }
    else { el.removeAttribute('data-p'); el.style.removeProperty('--p'); }
    el.setAttribute('aria-label', estado === 'done' ? 'Listo' : estado === 'error' ? 'Con error' : 'En curso');
    return el;
  }

  /* ── Chip de tarea ────────────────────────────────────────────────── */
  /* AxUI.task(caja, { label, done, error, run: () => promesa })
     Muestra el tiempo sólo si tarda más de 1 s. Si falla, queda con "Reintentar".
     Si sale bien, se va solo a los 4 s (salvo keep: true). */
  function task(box, o) {
    var el = doc.createElement('div');
    el.className = 'ax-task';
    el.setAttribute('role', 'status');
    el.innerHTML = '<i class="ax-mark"></i><span></span><time hidden></time>';
    box.appendChild(el);
    var m = el.querySelector('.ax-mark'), txt = el.querySelector('span'), reloj = el.querySelector('time'), timer = null;
    function correr() {
      var inicio = Date.now();
      el.setAttribute('data-state', 'running');
      mark(m, 'running');
      txt.textContent = o.label;
      var b = el.querySelector('.ax-btn'); if (b) b.remove();
      reloj.hidden = true;
      timer = setInterval(function () { var s = Math.floor((Date.now() - inicio) / 1000); if (s >= 1) { reloj.hidden = false; reloj.textContent = s + ' s'; } }, 250);
      return Promise.resolve().then(o.run).then(function (r) {
        clearInterval(timer);
        el.setAttribute('data-state', 'done'); mark(m, 'done');
        txt.textContent = o.done || 'Listo'; reloj.hidden = true;
        if (!o.keep) setTimeout(function () { el.setAttribute('data-closing', ''); afterAnim(el, function () { el.remove(); }); }, ms('--ax-toast-ms', 4000));
        return r;
      }, function (e) {
        clearInterval(timer);
        el.setAttribute('data-state', 'error'); mark(m, 'error');
        txt.textContent = o.error || 'No se pudo enviar'; reloj.hidden = true;
        var r = doc.createElement('button'); r.type = 'button'; r.className = 'ax-btn ax-btn-sm'; r.textContent = 'Reintentar';
        r.addEventListener('click', correr);
        el.appendChild(r);
      });
    }
    correr();
    return el;
  }

  /* ── Fila que se desliza ──────────────────────────────────────────── */
  /* AxUI.swipe(fila, { start: { label, icon, tone, onAction }, end: {...} })
     start = deslizar a la derecha; end = a la izquierda. Pasada la mitad, la acción
     se hace al soltar; menos que eso, vuelve. Si onAction devuelve 'remove', la fila se va. */
  function swipe(row, o) {
    o = o || {};
    if (row.querySelector('.ax-swipe-body')) return;
    var body = doc.createElement('div'); body.className = 'ax-swipe-body';
    while (row.firstChild) body.appendChild(row.firstChild);
    row.classList.add('ax-swipe');
    ['start', 'end'].forEach(function (lado) {
      var a = o[lado]; if (!a) return;
      var b = doc.createElement('button');
      b.type = 'button'; b.className = 'ax-swipe-act'; b.tabIndex = -1;   // con teclado se usa el menú ⋯
      b.setAttribute('data-side', lado); b.setAttribute('aria-hidden', 'true');
      if (a.tone) b.setAttribute('data-tone', a.tone);
      b.innerHTML = (lado === 'end' ? esc(a.label) + icon(a.icon || 'check') : icon(a.icon || 'check') + esc(a.label));
      row.appendChild(b);
    });
    row.appendChild(body);
    var p = null;
    function mover(x) { body.style.transform = x ? 'translateX(' + x + 'px)' : ''; }
    row.addEventListener('pointerdown', function (ev) {
      if (ev.button > 0) return;
      p = { x: ev.clientX, y: ev.clientY, dx: 0, activo: false, w: row.offsetWidth };
    });
    row.addEventListener('pointermove', function (ev) {
      if (!p) return;
      var dx = ev.clientX - p.x, dy = ev.clientY - p.y;
      if (!p.activo) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { p = null; return; }   // era scroll
        if (Math.abs(dx) < 10) return;
        p.activo = true; row.setAttribute('data-drag', ''); row.setPointerCapture && row.setPointerCapture(ev.pointerId);
      }
      var lado = dx > 0 ? 'start' : 'end';
      if (!o[lado]) dx = dx / 6;                         // sin acción de ese lado: casi no se mueve
      else if (Math.abs(dx) > p.w * .6) dx = Math.sign(dx) * (p.w * .6 + (Math.abs(dx) - p.w * .6) / 4);
      p.dx = dx;
      row.setAttribute('data-show', lado);
      row.toggleAttribute('data-armed', !!o[lado] && Math.abs(dx) > p.w * .45);
      mover(dx);
    });
    function soltar() {
      if (!p) return;
      var q = p; p = null;
      row.removeAttribute('data-drag');
      if (!q.activo) return;
      var lado = q.dx > 0 ? 'start' : 'end', a = o[lado];
      row.removeAttribute('data-armed');
      // Evita que el soltar abra la fila como si fuera un toque.
      function una(ev) { ev.stopPropagation(); ev.preventDefault(); row.removeEventListener('click', una, true); }
      row.addEventListener('click', una, true);
      setTimeout(function () { row.removeEventListener('click', una, true); }, 400);
      setTimeout(function () { row.removeAttribute('data-show'); }, ms('--ax-dur', 180));
      if (!a || Math.abs(q.dx) < q.w * .45) { mover(0); return; }
      mover(Math.sign(q.dx) * q.w);
      setTimeout(function () {
        var r = a.onAction && a.onAction(row);
        if (r === 'remove') {
          row.style.maxHeight = row.offsetHeight + 'px';
          row.setAttribute('data-gone', '');
          afterAnim(row, function () { row.remove(); });
        } else { mover(0); }
      }, reduce() ? 0 : ms('--ax-dur', 180));
    }
    row.addEventListener('pointerup', soltar);
    row.addEventListener('pointercancel', function () { if (p) { p = null; row.removeAttribute('data-drag'); row.removeAttribute('data-armed'); mover(0); } });
  }

  /* ── Control segmentado con marca que se desliza ──────────────────── */
  /* grupo: contenedor con botones [aria-pressed]. clave: nombre estable; si la
     pantalla se repinta, la marca sale de donde estaba y se desliza a la nueva. */
  var segPrev = {};
  function seg(box, clave) {
    if (!box) return;
    var on = box.querySelector('[aria-pressed="true"]');
    box.classList.add('ax-seg-slide');
    if (!on) { box.style.setProperty('--ax-seg-w', '0px'); return; }
    var pos = { x: on.offsetLeft, w: on.offsetWidth };
    var k = clave || box.getAttribute('data-ax-seg') || '';
    var antes = k && segPrev[k];
    if (antes && (antes.x !== pos.x || antes.w !== pos.w) && !reduce()) {
      box.style.setProperty('--ax-seg-x', antes.x + 'px');
      box.style.setProperty('--ax-seg-w', antes.w + 'px');
      box.setAttribute('data-seg-static', '');
      void box.offsetWidth;
      box.removeAttribute('data-seg-static');
    }
    box.style.setProperty('--ax-seg-x', pos.x + 'px');
    box.style.setProperty('--ax-seg-w', pos.w + 'px');
    if (k) segPrev[k] = pos;
  }

  /* ── Lista desplegable ─────────────────────────────────────────────── */
  /* Deja el <select> en su lugar (oculto) para que el formulario lo lea igual;
     el botón muestra la opción elegida y el menú dispara "change" en el select. */
  function select(sel) {
    if (!sel || sel.hasAttribute('data-ax-enhanced') || sel.multiple) return;
    sel.setAttribute('data-ax-enhanced', '');
    sel.classList.add('ax-native-select');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');
    var box = doc.createElement('span');
    box.className = 'ax-select-box';
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'ax-select-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    var lab = sel.id && doc.querySelector('label[for="' + sel.id + '"] > span');
    if (lab) btn.setAttribute('aria-label', lab.textContent.replace(/\s*\*$/, ''));
    var lista = doc.createElement('div');
    lista.className = 'ax-menu ax-select-menu';
    lista.hidden = true;
    lista.setAttribute('role', 'listbox');
    sel.insertAdjacentElement('afterend', box);
    box.appendChild(btn);
    doc.body.appendChild(lista);
    var ultimo = null;
    function texto() {
      var o = sel.options[sel.selectedIndex];
      var vacio = !o || o.value === '';
      var clave = (o ? o.value + '|' + o.textContent : '') + '|' + sel.disabled + '|' + sel.getAttribute('aria-invalid');
      if (clave === ultimo) return;   // sin cambios: no se toca el DOM (el observador no se dispara solo)
      ultimo = clave;
      btn.innerHTML = '<span class="ax-select-txt' + (vacio ? ' is-empty' : '') + '">' + esc(o ? o.textContent : '') + '</span>' + icon('chevron-down', 'ax-chevron');
      btn.disabled = sel.disabled;
      box.classList.toggle('is-invalid', sel.getAttribute('aria-invalid') === 'true');
    }
    function pintarLista() {
      lista.innerHTML = [].map.call(sel.options, function (o, i) {
        var elegido = i === sel.selectedIndex;
        return '<button type="button" role="option" data-i="' + i + '" aria-selected="' + elegido + '"' + (o.disabled ? ' disabled' : '') + '>' +
          '<span>' + esc(o.textContent) + '</span>' + (elegido ? icon('check', 'ax-select-check') : '') + '</button>';
      }).join('');
    }
    btn.addEventListener('click', function () {
      pintarLista();
      lista.style.minWidth = btn.offsetWidth + 'px';
      menu(btn, lista);
      var elegido = lista.querySelector('[aria-selected="true"]');
      if (elegido) { elegido.focus(); elegido.scrollIntoView({ block: 'nearest' }); }
    });
    lista.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-i]');
      if (!b) return;
      var i = Number(b.getAttribute('data-i'));
      if (i !== sel.selectedIndex) {
        sel.selectedIndex = i;
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      texto();
      btn.focus();
    });
    sel.addEventListener('change', texto);
    // Si la pantalla se repinta y el select desaparece, la lista flotante también.
    var obs = new MutationObserver(function () { if (!sel.isConnected) { lista.remove(); obs.disconnect(); } });
    obs.observe(doc.body, { childList: true, subtree: true });
    // Opciones que cambian por código (se rearma la lista del select).
    new MutationObserver(texto).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-invalid'] });
    texto();
    return { refresh: texto };
  }

  global.AxUI = { toast: toast, openModal: openModal, closeModal: closeModal, menu: menu, busy: busy, loading: loading, tabs: tabs, flash: flash, icon: icon,
    multi: multi, mark: mark, task: task, swipe: swipe, seg: seg, select: select };
})(window);

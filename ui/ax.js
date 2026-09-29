/* AuxiliOS · Comportamiento de los componentes base (v1)

   JS sin dependencias para que todas las pantallas se comporten igual:
     AxUI.toast({ title, text, tone })       aviso flotante (éxito se va solo; error queda)
     AxUI.openModal(el) / closeModal(el)     modal o panel lateral con foco atrapado y Esc
     AxUI.menu(boton, menu)                  menú ⋯ con teclado y cierre al tocar afuera
     AxUI.busy(boton, promesa)               botón "Guardando…" → tilde, sin doble clic
     AxUI.loading(el, promesa, esqueleto)    muestra el esqueleto sólo si tarda más de 300 ms
     AxUI.tabs(contenedor)                   raya de la pestaña que se desliza
     AxUI.flash(el)                          marca en ámbar algo que acaba de cambiar
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
    if (menuAbierto.menu.contains(ev.target)) { if (ev.target.closest('button')) cerrarMenu(); return; }
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

  global.AxUI = { toast: toast, openModal: openModal, closeModal: closeModal, menu: menu, busy: busy, loading: loading, tabs: tabs, flash: flash, icon: icon };
})(window);

/* AuxiliOS · Sistema visual aplicado a la app (v1)

   Une las pantallas actuales con ui/ax.js sin tocar a quienes llaman:
   · toast(mensaje, tipo) de sigma.js pasa a ser el aviso del sistema visual
     (abajo a la derecha, tres como máximo; los de error quedan hasta cerrarlos).
   · operationFeedback(título, detalle, tipo) (servicio creado, finalizado, archivo
     subido…): en la oficina es un aviso que no tapa la pantalla; al chofer, en la
     calle, se le muestra en el centro con el tilde que se dibuja.
   · resaltarServicio(id, código): marca en la tabla de Servicios la fila que se
     acaba de crear o cambiar.
   Se carga después de sigma.js y de ui/ax.js. */
(function (global) {
  'use strict';

  var TONO = { success: 'ok', ok: 'ok', error: 'danger', danger: 'danger', warning: 'warn', warn: 'warn', info: 'info' };

  function avisar(mensaje, tipo) {
    var ax = global.AxUI;
    var texto = String(mensaje == null ? '' : mensaje).trim();
    if (!ax || !ax.toast || !texto) return null;
    return ax.toast({ title: texto, tone: TONO[tipo] || (tipo ? 'info' : 'ok') });
  }

  // toast() es una función global de sigma.js: reemplazarla en window cambia
  // todas las llamadas, incluso las de módulos que la leen sin "window.".
  function instalar() {
    if (!global.AxUI || global.toast === avisar) return !!global.AxUI;
    global.toast = avisar;
    return true;
  }

  function rol() {
    try { return String((PERFIL_USUARIO && PERFIL_USUARIO.roles && PERFIL_USUARIO.roles.name) || '').toLowerCase(); } catch (e) { return ''; }
  }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* Confirmación en el centro (chofer): tilde que se dibuja, se va sola o al tocarla. */
  function confirmacionCentral(titulo, detalle, tono, ms) {
    var doc = global.document, ax = global.AxUI;
    var viejo = doc.getElementById('ax-feedback');
    if (viejo) viejo.remove();
    var el = doc.createElement('div');
    el.id = 'ax-feedback';
    el.className = 'ax-feedback ax-feedback-' + tono;
    el.setAttribute('role', tono === 'danger' ? 'alert' : 'status');
    el.innerHTML = '<div><i class="ax-mark ax-feedback-mark"></i><strong>' + esc(titulo) + '</strong>' + (detalle ? '<small>' + esc(detalle) + '</small>' : '') + '</div>';
    doc.body.appendChild(el);
    var m = el.querySelector('.ax-mark');
    if (ax && ax.mark) { ax.mark(m, 'running'); setTimeout(function () { ax.mark(m, tono === 'danger' ? 'error' : 'done'); }, 60); }
    var cerrar = function () { if (!el.isConnected) return; el.setAttribute('data-closing', ''); setTimeout(function () { el.remove(); }, 200); };
    el.addEventListener('click', cerrar);
    setTimeout(cerrar, Math.min(3200, Math.max(1600, Number(ms) || 2400)));
    return { close: cerrar };
  }
  function operationFeedback(titulo, detalle, tipo, ms) {
    var tono = tipo === 'error' ? (/^Revisá/.test(String(titulo)) ? 'warn' : 'danger') : tipo === 'warning' ? 'warn' : tipo === 'info' ? 'info' : 'ok';
    if (rol() === 'chofer' || !global.AxUI) return confirmacionCentral(titulo, detalle, tono === 'warn' ? 'danger' : tono, ms);
    return global.AxUI.toast({ title: titulo, text: detalle, tone: tono });
  }

  /* La fila del servicio que se acaba de crear o cambiar se marca en ámbar. La lista
     se repinta después de cargar, así que se busca unas veces antes de desistir. */
  function resaltarServicio(id, codigo, intentos) {
    var doc = global.document, n = intentos == null ? 12 : intentos;
    var body = doc.getElementById('os-table-body');
    var fila = body && id ? body.querySelector('tr[data-service-id="' + String(id).replace(/"/g, '') + '"]') : null;
    if (!fila && body && codigo) {
      fila = Array.prototype.find.call(body.querySelectorAll('tr'), function (tr) {
        var c = tr.querySelector('.os-service-code');
        return c && c.textContent.trim() === String(codigo).trim();
      }) || null;
    }
    if (!fila) { if (n > 0) setTimeout(function () { resaltarServicio(id, codigo, n - 1); }, 150); return false; }
    if (fila.scrollIntoView) fila.scrollIntoView({ block: 'nearest' });
    if (global.AxUI && global.AxUI.flash) global.AxUI.flash(fila);
    return true;
  }

  /* Menú lateral: cada ítem lleva su nombre como ayuda (se lee al contraerlo) y, en el
     celular, el ítem activo se acerca al centro de la barra inferior. */
  function armarMenu() {
    var doc = global.document, nav = doc && doc.querySelector ? doc.querySelector('.sidenav') : null;
    if (!nav || nav.getAttribute('data-ax-shell')) return;
    nav.setAttribute('data-ax-shell', '1');
    function rotular() {
      Array.prototype.forEach.call(nav.querySelectorAll('.nav-item'), function (it) {
        var l = it.querySelector('.nav-label');
        if (l && !it.title) it.title = l.textContent.trim();
        if (!it.hasAttribute('tabindex')) { it.setAttribute('tabindex', '0'); it.setAttribute('role', 'link'); }
      });
    }
    function centrar() {
      var a = nav.querySelector('.nav-item.active');
      if (!a || !global.matchMedia || !global.matchMedia('(max-width: 767px)').matches) return;
      nav.scrollLeft = Math.max(0, a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2);
    }
    nav.addEventListener('keydown', function (e) {
      var it = e.target.closest && e.target.closest('.nav-item');
      if (it && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); it.click(); }
    });
    if (global.MutationObserver) {
      new global.MutationObserver(function () { rotular(); centrar(); })
        .observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    }
    rotular(); centrar();
  }
  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', armarMenu);
  else armarMenu();

  instalar();
  if (global.AxUI) global.operationFeedback = operationFeedback;
  global.AuxiliosUI = { avisar: avisar, instalar: instalar, TONO: TONO, operationFeedback: operationFeedback, resaltarServicio: resaltarServicio };
})(window);

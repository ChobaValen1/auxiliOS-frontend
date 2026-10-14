/* AuxiliOS · Remito del chofer con el sistema visual (v1)

   Decora el paso a paso de sigma.js sin tocar su lógica:
   · botones de abajo con íconos (Atrás · Siguiente · Finalizar);
   · al cambiar de paso, el nuevo entra desde el lado hacia el que se avanza;
   · la firma muestra la marca de listo cuando queda registrada;
   · la flecha de volver del encabezado es un ícono.
   Se carga después de sigma.js, del flujo móvil y de ui/ax.js. */
(function (global) {
  'use strict';

  var doc = global.document;
  var ultimoPaso = null;

  function ico(name, cls) { return '<svg class="ax-icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="/ui/icons.svg#' + name + '"/></svg>'; }
  function pasoActual() { try { return _remPasoActual; } catch (e) { return null; } }   // let de sigma.js

  /* Botones: mismo texto que pone sigma.js, con íconos. */
  function botones() {
    var next = doc.getElementById('rem-btn-next'), back = doc.getElementById('rem-btn-back'), pend = doc.getElementById('btn-pendiente-footer');
    if (next) {
      var t = next.textContent.replace(/[→✅]/g, '').trim();
      var fin = /Finalizar|Guardar cambios/.test(t);
      next.innerHTML = fin ? ico('check') + '<span>' + t + '</span>' : '<span>' + t + '</span>' + ico('chevron-right');
      next.classList.toggle('rmx-final', fin);
    }
    if (back && !back.querySelector('.ax-icon')) back.innerHTML = ico('chevron-left') + '<span>Atrás</span>';
    if (pend) {
      var tp = pend.textContent.replace(/💾/g, '').trim();
      // El estilo en línea lo maneja sigma.js (muestra u oculta el botón según el paso): no se toca.
      if (/💾/.test(pend.textContent) || !pend.querySelector('span')) pend.innerHTML = '<span>' + tp + '</span>';
    }
  }

  /* El paso que entra: desde la derecha si se avanza, desde la izquierda si se vuelve. */
  function animarPaso() {
    var n = pasoActual();
    if (n == null) return;
    var panel = doc.querySelector('#remitos-nuevo .rem-step-panel.active');
    if (panel && ultimoPaso != null && n !== ultimoPaso) {
      panel.classList.remove('rmx-enter-next', 'rmx-enter-prev');
      void panel.offsetWidth;
      panel.classList.add(n > ultimoPaso ? 'rmx-enter-next' : 'rmx-enter-prev');
    }
    ultimoPaso = n;
  }

  function encabezado() {
    var b = doc.querySelector('#remitos-nuevo .rem-wizard-back');
    if (b && !b.querySelector('.ax-icon')) { b.innerHTML = ico('arrow-left'); b.setAttribute('aria-label', 'Volver'); }
    // "/ COMPLETAR REMITO" → "Completar remito" (el flujo móvil cambia el texto según el caso).
    var tit = doc.querySelector('#remitos-nuevo .rem-wizard-title');
    if (tit) {
      var limpio = tit.textContent.replace(/^\s*\/\s*/, '').trim().toLowerCase();
      limpio = limpio.charAt(0).toUpperCase() + limpio.slice(1);
      if (tit.textContent !== limpio) tit.textContent = limpio;
    }
    var h = doc.querySelector('#remitos-nuevo .rem-wizard-help');
    if (h && !h.getAttribute('aria-label')) h.setAttribute('aria-label', 'Ver formatos de campos');
    var l = doc.querySelector('#remitos-nuevo #sig-canvas ~ button[onclick="limpiarFirma()"]');
    if (l && !l.querySelector('.ax-icon')) { l.innerHTML = ico('trash-2', 'ax-icon-sm') + 'Limpiar'; l.classList.add('rmx-sig-clear'); l.removeAttribute('style'); }
  }

  /* Firma: marca de listo al registrarla; "Sin firma" con la marca vacía. */
  function firma() {
    var txt = doc.getElementById('sig-status-txt'), dot = doc.getElementById('sig-status-dot');
    if (!txt || !dot) return;
    var firmada = /registrada/i.test(txt.textContent);
    if (!dot.classList.contains('ax-mark') && global.AxUI && global.AxUI.mark) { dot.removeAttribute('style'); global.AxUI.mark(dot, firmada ? 'done' : 'running', firmada ? null : 0); }
    else if (global.AxUI && global.AxUI.mark && dot.getAttribute('data-state') !== (firmada ? 'done' : 'running')) global.AxUI.mark(dot, firmada ? 'done' : 'running', firmada ? null : 0);
    dot.removeAttribute('style');
    txt.textContent = txt.textContent.replace(/^✓\s*/, '');
    txt.removeAttribute('style');
    txt.parentElement && txt.parentElement.classList.toggle('rmx-signed', firmada);
  }

  function decorar() { encabezado(); botones(); animarPaso(); firma(); }

  function envolver(nombre, despues) {
    var f = global[nombre];
    if (typeof f !== 'function' || f.__rmx) return !!(f && f.__rmx);
    var w = function () { var r = f.apply(this, arguments); try { despues(); } catch (e) { /* la decoración nunca frena el remito */ } return r; };
    w.__rmx = true;
    global[nombre] = w;
    return true;
  }

  function instalar() {
    var ok = envolver('_remWizardActualizar', decorar);
    envolver('remWizardActualizarFlujo', decorar);
    envolver('updateSigStatus', firma);
    envolver('stopDraw', firma);
    envolver('limpiarFirma', firma);
    return ok;
  }

  if (!instalar()) {
    var n = 0, t = setInterval(function () { if (instalar() || ++n > 40) clearInterval(t); }, 250);
  }

  global.AuxiliosRemitoChoferAx = { decorar: decorar };
})(window);

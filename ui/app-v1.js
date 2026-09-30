/* AuxiliOS · Sistema visual aplicado a la app (v1)

   Une las pantallas actuales con ui/ax.js sin tocar a quienes llaman:
   · toast(mensaje, tipo) de sigma.js pasa a ser el aviso del sistema visual
     (abajo a la derecha, tres como máximo; los de error quedan hasta cerrarlos).
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

  instalar();
  global.AuxiliosUI = { avisar: avisar, instalar: instalar, TONO: TONO };
})(window);

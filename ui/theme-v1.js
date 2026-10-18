/* AuxiliOS · Tema de pantalla: Oscuro, Claro o Sistema (el del celular o la computadora).
   Se carga primero, antes de los estilos, para que no parpadee. La elección queda en este navegador,
   por usuario cuando ya inició sesión. */
(function (global) {
  'use strict';
  var KEY = 'auxilios.theme', VALID = { dark: 1, light: 1, system: 1 };
  var root = document.documentElement, media = global.matchMedia ? global.matchMedia('(prefers-color-scheme: light)') : null;

  function userKey() {
    try { var p = global.PERFIL_USUARIO; return p && p.user_id ? KEY + '.' + p.user_id : null; } catch (e) { return null; }
  }
  function read() {
    try {
      var uk = userKey(), v = (uk && global.localStorage.getItem(uk)) || global.localStorage.getItem(KEY);
      return VALID[v] ? v : 'dark';
    } catch (e) { return 'dark'; }
  }
  function resolve(pref) { return pref === 'system' ? (media && media.matches ? 'light' : 'dark') : pref; }
  function apply(pref) {
    var p = VALID[pref] ? pref : read(), mode = resolve(p);
    root.setAttribute('data-theme', mode);
    root.setAttribute('data-theme-pref', p);
    root.style.colorScheme = mode;
    try { global.dispatchEvent(new CustomEvent('auxilios:theme', { detail: { pref: p, mode: mode } })); } catch (e) { /* navegadores viejos */ }
    return mode;
  }
  function set(pref) {
    if (!VALID[pref]) return read();
    try { global.localStorage.setItem(KEY, pref); var uk = userKey(); if (uk) global.localStorage.setItem(uk, pref); } catch (e) { /* sin almacenamiento: sólo esta vez */ }
    apply(pref);
    return pref;
  }
  if (media) {
    var onChange = function () { if (read() === 'system') apply('system'); };
    if (media.addEventListener) media.addEventListener('change', onChange); else if (media.addListener) media.addListener(onChange);
  }
  apply();
  // Cuando se conoce el usuario, se aplica su elección (puede ser distinta de la del último que usó este navegador).
  var tries = 0, wait = setInterval(function () { if (userKey() || ++tries > 120) { clearInterval(wait); apply(); } }, 500);

  /* Selector reutilizable: tres botones segmentados. */
  function pickerHtml() {
    var cur = read();
    return '<div class="ax-seg ax-theme-seg" role="radiogroup" aria-label="Tema de pantalla">' + [['dark', 'Oscuro'], ['light', 'Claro'], ['system', 'Sistema']].map(function (o) {
      return '<button type="button" role="radio" aria-checked="' + (cur === o[0]) + '" aria-pressed="' + (cur === o[0]) + '" class="' + (cur === o[0] ? 'active is-active' : '') + '" onclick="AuxTheme.choose(\'' + o[0] + '\',this)">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function choose(pref, btn) {
    set(pref);
    var seg = btn && btn.closest && btn.closest('.ax-theme-seg');
    // Se redibuja después del clic: así un menú que se cierra "al tocar afuera" no lo toma como afuera.
    if (seg) setTimeout(function () { if (seg.isConnected) seg.outerHTML = pickerHtml(); }, 0);
  }

  global.AuxTheme = { get: read, set: set, apply: apply, resolve: resolve, pickerHtml: pickerHtml, choose: choose };
})(window);

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

  /* Botón con ícono al lado del perfil (arriba a la derecha): muestra el tema elegido y abre un menú chico. */
  var OPTIONS = [['dark', 'Oscuro', 'moon'], ['light', 'Claro', 'sun'], ['system', 'Sistema', 'monitor']];
  function iconFor(pref) { return pref === 'light' ? 'sun' : pref === 'system' ? 'monitor' : 'moon'; }
  function syncButton() {
    var btn = document.getElementById('tb-theme'); if (!btn) return;
    var pref = read(), use = btn.querySelector('use'), label = OPTIONS.filter(function (o) { return o[0] === pref; })[0][1];
    if (use) use.setAttribute('href', '/ui/icons.svg#' + iconFor(pref));
    btn.setAttribute('title', 'Tema de pantalla: ' + label);
  }
  var menu = null;
  function closeMenu() {
    if (!menu) return;
    var m = menu; menu = null; m.remove();
    document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', onKey, true);
    var btn = document.getElementById('tb-theme'); if (btn) btn.setAttribute('aria-expanded', 'false');
  }
  function outside(e) { if (menu && !menu.contains(e.target) && !e.target.closest('#tb-theme')) closeMenu(); }
  function onKey(e) {
    if (!menu) return;
    if (e.key === 'Escape') { e.preventDefault(); var b = document.getElementById('tb-theme'); closeMenu(); if (b) b.focus(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      var items = Array.prototype.slice.call(menu.querySelectorAll('button')), i = items.indexOf(document.activeElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    }
  }
  function toggleMenu(btn) {
    if (menu) return closeMenu();
    var cur = read(), r = btn.getBoundingClientRect();
    menu = document.createElement('div');
    menu.className = 'ax-theme-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Tema de pantalla');
    menu.innerHTML = '<small>Pantalla</small>' + OPTIONS.map(function (o) {
      return '<button type="button" role="menuitemradio" aria-checked="' + (cur === o[0]) + '" data-theme-pick="' + o[0] + '"><svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#' + o[2] + '"/></svg><span>' + o[1] + '</span>' + (cur === o[0] ? '<b aria-hidden="true">✓</b>' : '') + '</button>';
    }).join('');
    menu.style.top = Math.round(r.bottom + 8) + 'px';
    menu.style.right = Math.max(8, Math.round(global.innerWidth - r.right)) + 'px';
    menu.addEventListener('click', function (e) { var b = e.target.closest('[data-theme-pick]'); if (!b) return; set(b.getAttribute('data-theme-pick')); closeMenu(); btn.focus(); });
    document.body.appendChild(menu);
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', onKey, true);
    var checked = menu.querySelector('[aria-checked="true"]'); if (checked) checked.focus();
  }
  global.addEventListener('auxilios:theme', syncButton);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncButton); else syncButton();

  global.AuxTheme = { get: read, set: set, apply: apply, resolve: resolve, pickerHtml: pickerHtml, choose: choose, toggleMenu: toggleMenu };
})(window);

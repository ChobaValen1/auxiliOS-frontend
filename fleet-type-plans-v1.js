/* AuxiliOS · Control del camión · planes base por tipo de camión (v1)

   Desde la flota, Administración elige qué planes del catálogo lleva cada tipo
   de camión (plancha, asistencia, pesado…) y los asigna a todos sus móviles de
   una vez (set_truck_type_plans_v1). Los móviles nuevos, o a los que se les
   cambia el tipo, reciben los planes base solos. Sacar un plan de la lista no
   se lo quita a los móviles que ya lo tienen. */
(function (global) {
  'use strict';

  var TIPO = { plancha: 'Plancha', asistencia: 'Asistencia', pesado: 'Pesado' };
  var st = null;

  function db() { return typeof _db !== 'undefined' ? _db : null; }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function nombreTipo(t) { return TIPO[t] || (t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Sin tipo'); }
  function cadencia(p) {
    var partes = [];
    if (p.interval_km) partes.push('cada ' + Number(p.interval_km).toLocaleString('es-AR') + ' km');
    if (p.interval_hours) partes.push('cada ' + Number(p.interval_hours).toLocaleString('es-AR') + ' h');
    return partes.join(' o ') || '—';
  }

  /* Cuántos móviles del tipo van a recibir al menos un plan nuevo al guardar (sin DOM). */
  function resumen(tipo, marcados) {
    var nuevos = marcados.filter(function (id) { return Number((tipo.cobertura || {})[String(id)] || 0) < Number(tipo.moviles || 0); });
    return { planes: marcados.length, faltan: nuevos.length };
  }

  function modal() {
    var m = document.getElementById('ftp-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'ftp-modal';
      m.className = 'psv-backdrop';
      m.hidden = true;
      document.body.appendChild(m);
    }
    return m;
  }

  function tipoActual() { return (st.tipos || []).find(function (t) { return t.tipo === st.tipo; }) || null; }

  function pintar() {
    var m = modal();
    m.hidden = false;
    document.body.classList.add('psv-open');
    var t = tipoActual();
    var marcados = st.marcados[st.tipo] || [];
    var r = t ? resumen(t, marcados) : { planes: 0, faltan: 0 };
    m.innerHTML =
      '<div class="psv-dialog ftp-dialog" role="dialog" aria-modal="true" aria-labelledby="ftp-t">' +
        '<header><div><h2 id="ftp-t">Planes base por tipo de camión</h2>' +
          '<p>Los planes marcados se asignan a todos los móviles del tipo. Los móviles nuevos los reciben solos.</p></div>' +
          '<button type="button" class="psv-x" data-ftp="cerrar" aria-label="Cerrar">×</button></header>' +
        '<div class="psv-body">' +
          (st.error ? '<div class="psv-error" role="alert">' + esc(st.error) + '</div>' : '') +
          (st.cargando ? '<p class="psv-hint">Cargando…</p>' :
            '<div class="ftp-tipos" role="tablist">' + (st.tipos || []).map(function (x) {
              return '<button type="button" role="tab" class="ftp-tipo' + (x.tipo === st.tipo ? ' on' : '') + '" aria-selected="' + (x.tipo === st.tipo) + '" data-ftp-tipo="' + esc(x.tipo) + '">' +
                esc(nombreTipo(x.tipo)) + '<small>' + x.moviles + (x.moviles === 1 ? ' móvil' : ' móviles') + '</small></button>';
            }).join('') + '</div>' +
            (t ? '<ul class="ftp-planes">' + (st.catalogo || []).map(function (p) {
              var on = marcados.indexOf(p.id) >= 0;
              var n = Number((t.cobertura || {})[String(p.id)] || 0);
              return '<li><label class="psv-check ftp-plan"><input type="checkbox" data-ftp-plan="' + esc(p.id) + '"' + (on ? ' checked' : '') + '>' +
                '<span><b>' + esc(p.name) + '</b><small>' + esc(cadencia(p)) + '</small></span></label>' +
                '<span class="ftp-cob' + (on && n < t.moviles ? ' ftp-falta' : '') + '">' + n + '/' + t.moviles + ' lo tienen</span></li>';
            }).join('') + '</ul>' : '<p class="psv-hint">No hay tipos de camión cargados.</p>') +
            '<p class="psv-hint">Desmarcar un plan no se lo quita a los móviles que ya lo tienen: eso se hace desde cada móvil.</p>') +
        '</div>' +
        '<footer><button type="button" class="psv-btn" data-ftp="cerrar">Cancelar</button>' +
          (t ? '<button type="button" class="psv-btn primary" data-ftp="guardar"' + (st.guardando ? ' disabled' : '') + '>' +
            (st.guardando ? 'Guardando…' : r.faltan ? 'Guardar y asignar a los ' + t.moviles + ' móviles' : 'Guardar') + '</button>' : '') +
        '</footer>' +
      '</div>';
  }

  async function abrir() {
    st = { cargando: true, tipos: [], catalogo: [], tipo: null, marcados: {}, error: '', guardando: false };
    pintar();
    try {
      var r = await db().rpc('get_truck_type_plans_v1');
      if (r.error) throw r.error;
      st.tipos = (r.data && r.data.tipos) || [];
      st.catalogo = (r.data && r.data.catalogo) || [];
      st.tipos.forEach(function (x) { st.marcados[x.tipo] = (x.planes || []).map(Number); });
      var pref = st.tipos.slice().sort(function (a, b) { return b.moviles - a.moviles; })[0];
      st.tipo = pref ? pref.tipo : null;
    } catch (e) { st.error = (e && e.message) || 'No se pudieron cargar los planes base.'; }
    st.cargando = false;
    pintar();
  }

  function cerrar() {
    st = null;
    var m = document.getElementById('ftp-modal');
    if (m) { m.hidden = true; m.innerHTML = ''; }
    document.body.classList.remove('psv-open');
  }

  async function guardar() {
    if (!st || st.guardando || !st.tipo) return;
    st.guardando = true; st.error = '';
    pintar();
    try {
      var r = await db().rpc('set_truck_type_plans_v1', { p_tipo: st.tipo, p_plan_ids: st.marcados[st.tipo] || [] });
      if (r.error) throw r.error;
      var d = r.data || {};
      if (typeof toast === 'function') {
        toast(d.asignados ? 'Planes base guardados: se asignaron ' + d.asignados + ' planes a los móviles ' + nombreTipo(st.tipo).toLowerCase() : 'Planes base guardados', 'success');
      }
      cerrar();
      if (global.AuxiliosControlFlota && global.AuxiliosControlFlota.cargar) global.AuxiliosControlFlota.cargar();
    } catch (e) {
      st.guardando = false;
      st.error = (e && e.message) || 'No se pudieron guardar los planes base.';
      pintar();
    }
  }

  document.addEventListener('click', function (ev) {
    var abre = ev.target.closest && ev.target.closest('[data-fcv="planes-base"]');
    if (abre) return abrir();
    if (!st) return;
    if (ev.target.id === 'ftp-modal') return cerrar();
    var t = ev.target.closest && ev.target.closest('[data-ftp-tipo]');
    if (t) { st.tipo = t.getAttribute('data-ftp-tipo'); return pintar(); }
    var b = ev.target.closest && ev.target.closest('[data-ftp]');
    if (!b) return;
    if (b.getAttribute('data-ftp') === 'cerrar') return cerrar();
    if (b.getAttribute('data-ftp') === 'guardar') return guardar();
  });
  document.addEventListener('change', function (ev) {
    if (!st || !ev.target.hasAttribute || !ev.target.hasAttribute('data-ftp-plan')) return;
    var id = Number(ev.target.getAttribute('data-ftp-plan'));
    var lista = (st.marcados[st.tipo] || []).filter(function (x) { return x !== id; });
    if (ev.target.checked) lista.push(id);
    st.marcados[st.tipo] = lista;
    pintar();
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && st) cerrar(); });

  global.AuxiliosPlanesBase = { abrir: abrir, _test: { resumen: resumen, cadencia: cadencia, nombreTipo: nombreTipo } };
})(window);

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
        '<header><div><h2 id="ftp-t">Planes de mantenimiento</h2>' +
          '<p>' + (st.vista === 'catalogo' ? 'Los planes que se pueden asignar a los camiones: cada cuántos km u horas se hace el service.' : 'Los planes marcados se asignan a todos los móviles del tipo. Los móviles nuevos los reciben solos.') + '</p></div>' +
          '<button type="button" class="psv-x" data-ftp="cerrar" aria-label="Cerrar">×</button></header>' +
        '<div class="psv-body">' +
          (st.error ? '<div class="psv-error" role="alert">' + esc(st.error) + '</div>' : '') +
          '<div class="ftp-vistas" role="tablist">' +
            '<button type="button" role="tab" aria-selected="' + (st.vista !== 'catalogo') + '" data-ftp-vista="tipos">Por tipo de camión</button>' +
            '<button type="button" role="tab" aria-selected="' + (st.vista === 'catalogo') + '" data-ftp-vista="catalogo">Catálogo de planes</button></div>' +
          (st.cargando ? '<p class="psv-hint">Cargando…</p>' : st.vista === 'catalogo' ? catalogoHTML() :
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
        '<footer>' + (st.vista === 'catalogo'
          ? '<button type="button" class="psv-btn" data-ftp="cerrar">Cerrar</button><button type="button" class="psv-btn primary" data-ftp="nuevo-plan">+ Nuevo plan</button>'
          : '<button type="button" class="psv-btn" data-ftp="cerrar">Cancelar</button>' +
          (t ? '<button type="button" class="psv-btn primary" data-ftp="guardar"' + (st.guardando ? ' disabled' : '') + '>' +
            (st.guardando ? 'Guardando…' : r.faltan ? 'Guardar y asignar a los ' + t.moviles + ' móviles' : 'Guardar') + '</button>' : '')) +
        '</footer>' +
      '</div>';
  }

  /* Catálogo completo (activos e inactivos): se crea, edita y da de baja con los formularios de siempre. */
  function catalogoHTML() {
    var lista = (st.todos || []).slice().sort(function (a, b) { return (a.activo === false ? 1 : 0) - (b.activo === false ? 1 : 0); });
    if (!lista.length) return '<p class="psv-hint">Todavía no hay planes. Creá el primero con «+ Nuevo plan».</p>';
    return '<ul class="ftp-planes ftp-catalogo">' + lista.map(function (p) {
      var on = p.activo !== false;
      return '<li class="' + (on ? '' : 'is-off') + '"><span class="ftp-plan"><span><b>' + esc(p.name) + '</b><small>' + esc(cadencia(p)) +
        (p.alert_before_km ? ' · avisa ' + Number(p.alert_before_km).toLocaleString('es-AR') + ' km antes' : '') + '</small></span></span>' +
        '<span class="ftp-estado ' + (on ? 'on' : 'off') + '">' + (on ? 'Activo' : 'Dado de baja') + '</span>' +
        '<span class="ftp-acciones"><button type="button" class="psv-btn" data-ftp="editar-plan" data-id="' + esc(p.id) + '">Editar</button>' +
        '<button type="button" class="psv-btn" data-ftp="estado-plan" data-id="' + esc(p.id) + '" data-activo="' + on + '">' + (on ? 'Dar de baja' : 'Reactivar') + '</button></span></li>';
    }).join('') + '</ul>';
  }

  async function cargarCatalogo() {
    var r = await db().from('master_service_plans').select('id, name, trigger_type, interval_km, interval_hours, alert_before_km, activo').order('name');
    if (r.error) throw r.error;
    st.todos = r.data || [];
    global._planesCache = st.todos;   // lo usa abrirEditarPlan()
  }

  async function recargar() {
    if (!st) return;
    try {
      var r = await db().rpc('get_truck_type_plans_v1');
      if (r.error) throw r.error;
      st.catalogo = (r.data && r.data.catalogo) || [];
      await cargarCatalogo();
    } catch (e) { st.error = (e && e.message) || 'No se pudo actualizar el catálogo.'; }
    pintar();
  }

  async function abrir() {
    st = { cargando: true, tipos: [], catalogo: [], todos: [], tipo: null, marcados: {}, error: '', guardando: false, vista: 'tipos' };
    pintar();
    try {
      var r = await db().rpc('get_truck_type_plans_v1');
      if (r.error) throw r.error;
      st.tipos = (r.data && r.data.tipos) || [];
      st.catalogo = (r.data && r.data.catalogo) || [];
      st.tipos.forEach(function (x) { st.marcados[x.tipo] = (x.planes || []).map(Number); });
      var pref = st.tipos.slice().sort(function (a, b) { return b.moviles - a.moviles; })[0];
      st.tipo = pref ? pref.tipo : null;
      await cargarCatalogo();
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
    var v = ev.target.closest && ev.target.closest('[data-ftp-vista]');
    if (v) { st.vista = v.getAttribute('data-ftp-vista'); return pintar(); }
    var b = ev.target.closest && ev.target.closest('[data-ftp]');
    if (!b) return;
    if (b.getAttribute('data-ftp') === 'cerrar') return cerrar();
    if (b.getAttribute('data-ftp') === 'guardar') return guardar();
    if (b.getAttribute('data-ftp') === 'nuevo-plan' && typeof global.openAdminPlanModal === 'function') return global.openAdminPlanModal();
    if (b.getAttribute('data-ftp') === 'editar-plan' && typeof global.abrirEditarPlan === 'function') return global.abrirEditarPlan(b.getAttribute('data-id'));
    if (b.getAttribute('data-ftp') === 'estado-plan' && typeof global.toggleEstadoPlan === 'function') return global.toggleEstadoPlan(b.getAttribute('data-id'), b.getAttribute('data-activo') === 'true');
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

  global.AuxiliosPlanesBase = { abrir: abrir, recargar: recargar, _test: { resumen: resumen, cadencia: cadencia, nombreTipo: nombreTipo } };
})(window);

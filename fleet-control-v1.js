/* AuxiliOS · Control del camión · estado general de la flota (v1)

   Administración y Supervisión ven todos los móviles en una tabla, con lo que
   importa de cada uno sin entrar: estado (en servicio, en jornada, sin jornada,
   en taller), chofer, km, neumáticos y frenos, combustible, próximo service y
   documentación. Colores sólo para lo que requiere atención: rojo (vencido,
   malo) y ámbar (próximo, sin control hoy). Al tocar un móvil se abre su
   detalle de siempre.

   Datos: get_fleet_control_v1 (una consulta) + planes de service por móvil
   (cargarPlanesDetalleOptimizados, igual que antes). */
(function (global) {
  'use strict';

  var st = { rows: [], planes: {}, filtro: 'todos', q: '', today: null, cargando: false };

  function db() { return typeof _db !== 'undefined' ? _db : null; }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function fechaCorta(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] : '—'; }
  function diasDesde(iso, hoy) {
    if (!iso || !hoy) return null;
    return Math.round((new Date(hoy + 'T12:00:00') - new Date(iso + 'T12:00:00')) / 86400000);
  }
  var COND = { bueno: 'Bueno', regular: 'Regular', malo: 'Malo' };

  function titulo(t) {
    if (t.numero_interno != null && String(t.numero_interno).trim()) {
      var ni = String(t.numero_interno).trim();
      return /^m[oó]vil/i.test(ni) ? ni.toUpperCase() : ni.toUpperCase();
    }
    return t.plate || 'ID ' + t.truck_id;
  }

  /* Estado operativo del móvil. */
  function estado(t) {
    if (String(t.status || '').toLowerCase() !== 'active') return { key: 'inactivo', label: 'Inactivo', tono: 'muted' };
    if (t.in_workshop) return { key: 'taller', label: 'En taller', tono: 'alerta' };
    if (t.service_number) return { key: 'servicio', label: 'En servicio', tono: 'info', det: t.service_number };
    if (t.log_id) return { key: 'jornada', label: 'Disponible', tono: 'ok' };
    return { key: 'sin_jornada', label: 'Sin jornada', tono: 'muted' };
  }

  function neumaticos(t) {
    var d = diasDesde(t.tire_date, st.today);
    var malo = t.tire_condition === 'malo' || t.brake_condition === 'malo';
    var txt = t.tire_date
      ? (d === 0 ? 'Hoy' : d === 1 ? 'Ayer' : 'Hace ' + d + ' días') + ' · ' + (COND[t.tire_condition] || '—') + ' / ' + (COND[t.brake_condition] || '—')
      : 'Sin controles';
    // En jornada y sin control de hoy: alerta. Malo: crítico.
    var tono = malo ? 'critico' : (t.log_id && d !== 0) ? 'alerta' : '';
    return { txt: txt, tono: tono, alerta: !!tono, sub: t.log_id && d !== 0 ? 'Falta el control de hoy' : '' };
  }

  function combustible(t) {
    if (!t.fuel_date) return { txt: 'Sin cargas', tono: '' };
    var hoy = num(t.fuel_today_liters) > 0;
    return {
      txt: hoy ? 'Hoy · ' + num(t.fuel_today_liters).toLocaleString('es-AR') + ' L' : fechaCorta(t.fuel_date) + ' · ' + num(t.fuel_liters).toLocaleString('es-AR') + ' L',
      tono: ''
    };
  }

  /* Plan de service más urgente (misma regla que el detalle del camión). */
  function service(t) {
    var planes = st.planes[t.truck_id];
    if (planes === undefined) return { txt: '…', tono: '' };
    var p = (planes || []).filter(function (x) { return x.plan_estado && x.plan_estado !== '_error'; })
      .sort(function (a, b) { return (a.km_restantes == null ? Infinity : a.km_restantes) - (b.km_restantes == null ? Infinity : b.km_restantes); })[0];
    if (!p) return { txt: (planes || []).length ? 'Al día' : 'Sin planes', tono: '' };
    var k = p.km_restantes;
    if (p.plan_estado === 'vencido' || (k != null && k <= 0)) return { txt: p.name + ' · vencido' + (k != null ? ' por ' + Math.abs(k).toLocaleString('es-AR') + ' km' : ''), tono: 'critico', alerta: true };
    if (p.plan_estado === 'proximo' || (k != null && k <= 1000)) return { txt: p.name + ' · en ' + num(k).toLocaleString('es-AR') + ' km', tono: 'alerta', alerta: true };
    if (k == null) return { txt: p.plan_estado === 'sin_odometro' ? 'Sin odómetro inicial' : 'Sin ejecución registrada', tono: '' };
    return { txt: p.name + ' · en ' + num(k).toLocaleString('es-AR') + ' km', tono: '' };
  }

  function documentos(t) {
    if (num(t.docs_vencidos)) return { txt: num(t.docs_vencidos) + (num(t.docs_vencidos) === 1 ? ' vencido' : ' vencidos'), tono: 'critico', alerta: true };
    if (num(t.docs_proximos)) return { txt: num(t.docs_proximos) + ' por vencer', tono: 'alerta', alerta: true };
    if (num(t.docs_faltan)) return { txt: num(t.docs_faltan) + ' sin archivo', tono: 'alerta', alerta: true };
    return { txt: 'Al día', tono: '' };
  }

  function alertas(t) {
    return [neumaticos(t), service(t), documentos(t)].filter(function (x) { return x.alerta; }).length +
      (estado(t).key === 'taller' ? 1 : 0);
  }

  function celda(label, c) {
    return '<td data-label="' + label + '"><span class="fcv-val' + (c.tono ? ' fcv-' + c.tono : '') + '">' + (c.tono ? '<i aria-hidden="true"></i>' : '') + esc(c.txt) + '</span>' +
      (c.sub ? '<small>' + esc(c.sub) + '</small>' : '') + '</td>';
  }

  function pintar() {
    var cont = document.getElementById('camion-cards-container');
    if (!cont) return;
    if (st.cargando && !st.rows.length) { cont.innerHTML = '<div class="fcv-empty">Cargando la flota…</div>'; return; }

    var cuenta = { todos: 0, alertas: 0, servicio: 0, jornada: 0, sin_jornada: 0, taller: 0 };
    st.rows.forEach(function (t) {
      var e = estado(t).key;
      cuenta.todos++;
      if (cuenta[e] != null) cuenta[e]++;
      if (alertas(t)) cuenta.alertas++;
    });
    var q = st.q.trim().toLowerCase();
    var filas = st.rows.filter(function (t) {
      var e = estado(t).key;
      if (st.filtro === 'alertas' && !alertas(t)) return false;
      if (['servicio', 'jornada', 'sin_jornada', 'taller'].indexOf(st.filtro) >= 0 && e !== st.filtro) return false;
      if (q && (titulo(t) + ' ' + (t.plate || '') + ' ' + (t.brand || '') + ' ' + (t.model || '') + ' ' + (t.driver_name || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });

    var kpi = function (k, label) {
      return '<button type="button" class="fcv-kpi' + (st.filtro === k ? ' on' : '') + (k === 'alertas' && cuenta.alertas ? ' fcv-kpi-alerta' : '') + '" data-fcv-filtro="' + k + '">' +
        '<b>' + cuenta[k] + '</b><span>' + label + '</span></button>';
    };

    cont.innerHTML =
      '<div class="fcv">' +
        '<div class="fcv-kpis">' + kpi('todos', 'Móviles') + kpi('servicio', 'En servicio') + kpi('jornada', 'Disponibles') +
          kpi('sin_jornada', 'Sin jornada') + kpi('taller', 'En taller') + kpi('alertas', 'Con alertas') + '</div>' +
        '<div class="fcv-toolbar"><input type="search" class="fcv-search" data-fcv-q placeholder="Buscar móvil, patente o chofer…" value="' + esc(st.q) + '">' +
          '<button type="button" class="fcv-refresh" data-fcv="refresh">Actualizar</button></div>' +
        (filas.length
          ? '<div class="fcv-table-wrap"><table class="fcv-table"><thead><tr>' +
              '<th>Móvil</th><th>Estado</th><th>Km</th><th>Neumáticos y frenos</th><th>Combustible</th><th>Service</th><th>Documentación</th><th></th>' +
            '</tr></thead><tbody>' + filas.map(function (t) {
              var e = estado(t);
              return '<tr data-fcv-truck="' + esc(t.truck_id) + '" tabindex="0">' +
                '<td data-label="Móvil"><b>' + esc(titulo(t)) + '</b><small>' + esc([t.plate, [t.brand, t.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ')) + '</small></td>' +
                '<td data-label="Estado"><span class="fcv-estado fcv-e-' + e.tono + '">' + esc(e.label) + '</span><small>' +
                  esc(e.key === 'servicio' ? e.det + (t.driver_name ? ' · ' + t.driver_name : '') : e.key === 'taller' ? (t.workshop_detail || t.driver_name || '') : (t.driver_name || '')) + '</small></td>' +
                '<td data-label="Km" class="fcv-num">' + (t.current_km != null ? esc(num(t.current_km).toLocaleString('es-AR')) : '—') + '</td>' +
                celda('Neumáticos y frenos', neumaticos(t)) + celda('Combustible', combustible(t)) +
                celda('Service', service(t)) + celda('Documentación', documentos(t)) +
                '<td class="fcv-go" aria-hidden="true">›</td></tr>';
            }).join('') + '</tbody></table></div>'
          : '<div class="fcv-empty">' + (st.rows.length ? 'Ningún móvil con este filtro.' : 'No hay móviles cargados.') + '</div>') +
      '</div>';
  }

  async function cargar() {
    if (!db()) return;
    st.cargando = true;
    pintar();
    try {
      var r = await db().rpc('get_fleet_control_v1');
      if (r.error) throw r.error;
      st.today = r.data && r.data.today;
      st.rows = (r.data && r.data.trucks) || [];
      // El detalle del camión busca el móvil en _flotaAdmin.
      try { _flotaAdmin = st.rows.map(function (t) { return Object.assign({}, t); }); } catch (e) { /* sin detalle clásico */ }
    } catch (e) {
      var cont = document.getElementById('camion-cards-container');
      st.cargando = false;
      if (cont) cont.innerHTML = '<div class="fcv-empty fcv-error">No se pudo cargar la flota: ' + esc(e.message || e) + '</div>';
      return;
    }
    st.cargando = false;
    st.planes = {};
    pintar();
    // Planes de service por móvil (se completan a medida que llegan).
    var fn = typeof cargarPlanesDetalleOptimizados === 'function' ? cargarPlanesDetalleOptimizados : null;
    if (!fn) return;
    await Promise.all(st.rows.map(function (t) {
      return fn(t.truck_id).then(function (p) { st.planes[t.truck_id] = p || []; })
        .catch(function () { st.planes[t.truck_id] = []; });
    }));
    pintar();
  }

  /* Reemplaza la vista de flota anterior (tarjetas de a una). */
  async function renderFlota() {
    var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    set('camion-sec-sub', 'Flota completa');
    var hero = document.getElementById('camion-hero-card');
    if (hero) hero.style.display = 'none';
    if (typeof _volverCamionMain === 'function') _volverCamionMain();
    await cargar();
  }

  document.addEventListener('click', function (ev) {
    var f = ev.target.closest && ev.target.closest('[data-fcv-filtro]');
    if (f) { st.filtro = st.filtro === f.getAttribute('data-fcv-filtro') && st.filtro !== 'todos' ? 'todos' : f.getAttribute('data-fcv-filtro'); return pintar(); }
    if (ev.target.closest && ev.target.closest('[data-fcv="refresh"]')) return cargar();
    var row = ev.target.closest && ev.target.closest('[data-fcv-truck]');
    if (row && typeof global._abrirCamionDetalleAdmin === 'function') global._abrirCamionDetalleAdmin(Number(row.getAttribute('data-fcv-truck')));
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter') return;
    var row = ev.target.closest && ev.target.closest('[data-fcv-truck]');
    if (row && typeof global._abrirCamionDetalleAdmin === 'function') global._abrirCamionDetalleAdmin(Number(row.getAttribute('data-fcv-truck')));
  });
  document.addEventListener('input', function (ev) {
    if (!ev.target.hasAttribute || !ev.target.hasAttribute('data-fcv-q')) return;
    st.q = ev.target.value;
    var pos = ev.target.selectionStart;
    pintar();
    var i = document.querySelector('[data-fcv-q]');
    if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (e) {} }
  });

  function enganchar() {
    if (typeof global._renderCamionFlotaAdmin !== 'function') return false;
    if (global._renderCamionFlotaAdmin.__fcv) return true;
    renderFlota.__fcv = true;
    global._renderCamionFlotaAdmin = renderFlota;
    return true;
  }
  if (!enganchar()) {
    var n = 0, tm = setInterval(function () { if (enganchar() || ++n > 40) clearInterval(tm); }, 250);
  }

  global.AuxiliosControlFlota = {
    cargar: cargar,
    _test: {
      set: function (s) { st = Object.assign(st, s); },
      estado: estado, neumaticos: neumaticos, service: service, documentos: documentos, alertas: alertas
    }
  };
})(window);

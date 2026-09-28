/* AuxiliOS · Control del camión · detalle de un móvil (v1)

   Administración y Supervisión ven todo el camión en una sola pantalla, sin
   sub-pantallas: arriba lo que hay que resolver y debajo Mantenimiento,
   Documentación, Combustible y Neumáticos y frenos. La documentación
   obligatoria que el móvil no tiene cargada se muestra como faltante.
   Las acciones (cargar, registrar, subir) son sólo de Administración y usan
   los mismos formularios de siempre; al guardar se vuelve a esta pantalla.
   La vista del chofer no cambia. */
(function (global) {
  'use strict';

  var st = { id: null, t: null, planes: [], services: [], fuel: [], tires: [], docs: [], cargando: false, error: '', cerradoAt: 0 };
  var MODALES = ['modal-combustible', 'modal-neumaticos', 'modal-service-log', 'modal-asignar-plan', 'modal-upload-truck-doc', 'fuel-edit-admin'];
  var COND = { bueno: 'Bueno', regular: 'Regular', malo: 'Malo' };
  var PAGO = { efectivo: 'Efectivo', transferencia: 'Transferencia', app: 'App', tarjeta: 'Tarjeta' };

  function db() { return typeof _db !== 'undefined' ? _db : null; }
  function F() { return global.AuxiliosControlFlota || {}; }
  function rol() { try { return String((PERFIL_USUARIO && PERFIL_USUARIO.roles && PERFIL_USUARIO.roles.name) || ''); } catch (e) { return ''; } }
  function gestion() { return ['administracion', 'supervision'].indexOf(rol()) >= 0; }
  function admin() { return rol() === 'administracion'; }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function km(v) { return num(v).toLocaleString('es-AR') + ' km'; }
  function money(v) { return '$ ' + Math.round(num(v)).toLocaleString('es-AR'); }
  function hoy() {
    var h = F().hoy && F().hoy();
    if (h) return h;
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fecha(iso) {
    var p = String(iso || '').slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0].slice(2) : '—';
  }
  function dias(desde, hasta) {
    if (!desde || !hasta) return null;
    return Math.round((new Date(String(hasta).slice(0, 10) + 'T12:00:00') - new Date(String(desde).slice(0, 10) + 'T12:00:00')) / 86400000);
  }
  function obligatorios() { return F().DOC_OBLIGATORIOS || { VTV: 'VTV', SEGURO_POLIZA: 'Seguro', HABILITACION_RUTA: 'RUTA', CEDULA_VERDE: 'Cédula verde', MATAFUEGOS: 'Matafuegos' }; }
  function nombreDoc(code) {
    var meta = typeof DOC_CAMION_META !== 'undefined' ? DOC_CAMION_META : {};
    return (meta[code] && meta[code].name) || obligatorios()[code] || code || 'Documento';
  }
  function val(txt, tono) { return '<span class="fcv-val' + (tono ? ' fcv-' + tono : '') + '">' + (tono ? '<i aria-hidden="true"></i>' : '') + esc(txt) + '</span>'; }

  /* ── Reglas (sin DOM, se prueban) ───────────────────────────────── */

  function planEstado(p) {
    var k = p.km_restantes;
    if (p.plan_estado === 'vencido' || (k != null && k <= 0)) return { txt: 'Vencido' + (k != null ? ' por ' + km(Math.abs(k)) : ''), tono: 'critico' };
    if (p.plan_estado === 'proximo' || (k != null && k <= 1000)) return { txt: 'Faltan ' + km(k), tono: 'alerta' };
    if (k == null) return { txt: p.plan_estado === 'sin_odometro' ? 'Sin odómetro inicial' : 'Sin ejecución registrada', tono: '' };
    return { txt: 'Faltan ' + km(k), tono: '' };
  }
  function planAvance(p) {
    if (!p.interval_km || p.km_restantes == null) return null;
    return Math.min(100, Math.max(0, Math.round((p.interval_km - p.km_restantes) / p.interval_km * 100)));
  }

  /* Documentos: primero los obligatorios (cargados o no), después el resto. */
  function docsLista(docs, today) {
    var por = {};
    (docs || []).forEach(function (d) { if (d.internal_code && !por[d.internal_code]) por[d.internal_code] = d; });
    var filas = Object.keys(obligatorios()).map(function (code) { return docFila(code, por[code], today, true); });
    (docs || []).forEach(function (d) {
      if (!obligatorios()[d.internal_code] && por[d.internal_code] === d) filas.push(docFila(d.internal_code, d, today, false));
    });
    return filas;
  }
  function docFila(code, d, today, obligatorio) {
    var f = { code: code, nombre: nombreDoc(code), doc: d || null, obligatorio: obligatorio };
    if (!d) return Object.assign(f, { txt: 'Falta cargar', tono: 'alerta' });
    if (d.status === 'falta_archivo' || (obligatorio && !d.file_url)) return Object.assign(f, { txt: 'Sin archivo', tono: 'alerta' });
    if (!d.expiry_date) return Object.assign(f, { txt: d.periodo ? 'Período ' + d.periodo : 'Cargado', tono: '' });
    var n = dias(today, d.expiry_date);
    if (n < 0) return Object.assign(f, { txt: 'Vencido el ' + fecha(d.expiry_date), tono: 'critico' });
    if (n <= num(d.alert_days || 30)) return Object.assign(f, { txt: n === 0 ? 'Vence hoy' : 'Vence en ' + n + (n === 1 ? ' día' : ' días'), tono: 'alerta' });
    return Object.assign(f, { txt: 'Vigente hasta ' + fecha(d.expiry_date), tono: '' });
  }

  function neumaticosEstado(t, ultimo, today) {
    if (!ultimo) return { txt: 'Sin controles registrados', tono: t && t.log_id ? 'alerta' : '' };
    var malo = ultimo.tire_condition === 'malo' || ultimo.brake_condition === 'malo';
    if (malo) return { txt: 'Neumáticos ' + (COND[ultimo.tire_condition] || '—') + ' · Frenos ' + (COND[ultimo.brake_condition] || '—'), tono: 'critico' };
    if (t && t.log_id && ultimo.check_date !== today) return { txt: 'Falta el control de hoy', tono: 'alerta' };
    return { txt: 'Neumáticos ' + (COND[ultimo.tire_condition] || '—') + ' · Frenos ' + (COND[ultimo.brake_condition] || '—'), tono: '' };
  }

  /* Lo que hay que resolver, lo más grave primero. */
  function pendientes(d) {
    var out = [];
    var today = d.today || hoy();
    if (d.t && d.t.in_workshop) out.push({ tono: 'alerta', txt: 'En taller' + (d.t.workshop_detail ? ': ' + d.t.workshop_detail : '') });
    (d.planes || []).filter(function (p) { return p.plan_estado && p.plan_estado !== '_error'; }).forEach(function (p) {
      var e = planEstado(p);
      if (e.tono) out.push({ tono: e.tono, txt: 'Service ' + p.name + ': ' + e.txt.toLowerCase() });
    });
    docsLista(d.docs, today).forEach(function (f) {
      if (f.tono) out.push({ tono: f.tono, txt: f.nombre + ': ' + f.txt.toLowerCase() });
    });
    var n = neumaticosEstado(d.t, (d.tires || [])[0], today);
    if (n.tono) out.push({ tono: n.tono, txt: n.tono === 'critico' ? n.txt : 'Neumáticos y frenos: ' + n.txt.toLowerCase() });
    return out.sort(function (a, b) { return (a.tono === 'critico' ? 0 : 1) - (b.tono === 'critico' ? 0 : 1); });
  }

  function combustibleMes(fuel, today) {
    var mes = String(today || '').slice(0, 7);
    var r = { cargas: 0, litros: 0, total: 0 };
    (fuel || []).forEach(function (f) {
      if (String(f.fuel_date || '').slice(0, 7) !== mes) return;
      r.cargas++; r.litros += num(f.liters); r.total += num(f.total_cost);
    });
    return r;
  }

  function gastoMantenimiento(services, today) {
    return (services || []).reduce(function (s, x) {
      var n = dias(x.performed_at, today);
      return n != null && n <= 365 ? s + num(x.cost) : s;
    }, 0);
  }

  /* ── Vista ──────────────────────────────────────────────────────── */

  function seccion(titulo, acciones, cuerpo) {
    return '<section class="ftd-sec"><header><h3>' + titulo + '</h3>' +
      (acciones.length ? '<div class="ftd-acc">' + acciones.join('') + '</div>' : '') + '</header>' + cuerpo + '</section>';
  }
  function boton(accion, label, extra) {
    return admin() ? '<button type="button" class="ftd-btn" data-ftd="' + accion + '"' + (extra || '') + '>' + label + '</button>' : '';
  }

  function mantenimiento() {
    var planes = (st.planes || []).filter(function (p) { return p.plan_estado !== '_error'; });
    var filas = planes.length
      ? '<ul class="ftd-planes">' + planes.map(function (p) {
          var e = planEstado(p), av = planAvance(p);
          return '<li><div><b>' + esc(p.name) + '</b><small>' + (p.interval_km ? 'Cada ' + km(p.interval_km) : '') +
            (p.next_due_km ? ' · próximo a los ' + km(p.next_due_km) : '') + '</small></div>' + val(e.txt, e.tono) +
            (av != null ? '<span class="ftd-bar' + (e.tono ? ' ftd-bar-' + e.tono : '') + '"><span style="width:' + av + '%"></span></span>' : '') + '</li>';
        }).join('') + '</ul>'
      : '<p class="ftd-vacio">Sin planes de service.' + (admin() ? ' Asigná uno con "+ Plan".' : '') + '</p>';
    var hist = (st.services || []).slice(0, 5);
    var gasto = gastoMantenimiento(st.services, hoy());
    var tabla = hist.length
      ? '<h4>Últimos services' + (gasto ? '<span>Gastado en 12 meses: ' + money(gasto) + '</span>' : '') + '</h4>' +
        '<table class="ftd-table"><thead><tr><th>Fecha</th><th>Service</th><th>Km</th><th>Taller</th><th class="ftd-r">Costo</th></tr></thead><tbody>' +
        hist.map(function (s) {
          return '<tr><td>' + fecha(s.performed_at) + '</td><td>' + esc((s.master_service_plans && s.master_service_plans.name) || '—') + '</td>' +
            '<td class="ftd-n">' + (s.km_at_service != null ? km(s.km_at_service) : '—') + '</td><td>' + esc(s.workshop_name || '—') + '</td>' +
            '<td class="ftd-r ftd-n">' + (s.cost ? money(s.cost) : '—') + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<p class="ftd-vacio">Todavía no hay services registrados.</p>';
    return seccion('Mantenimiento', [boton('service', '+ Service'), boton('plan', '+ Plan')], filas + tabla);
  }

  function documentacion() {
    var filas = docsLista(st.docs, hoy());
    return seccion('Documentación', [boton('doc', '+ Documento')],
      '<ul class="ftd-docs">' + filas.map(function (f) {
        var d = f.doc;
        return '<li><div><b>' + esc(f.nombre) + '</b>' + (d && d.doc_number ? '<small>N° ' + esc(d.doc_number) + '</small>' : '') + '</div>' +
          val(f.txt, f.tono) +
          '<span class="ftd-li-acc">' +
            (d && d.file_url ? '<button type="button" class="ftd-link" data-ftd="ver-doc" data-path="' + esc(d.file_url) + '">Ver</button>' : '') +
            (!d || f.tono ? boton('doc', d ? 'Actualizar' : 'Cargar', ' data-code="' + esc(f.code) + '"') : '') +
          '</span></li>';
      }).join('') + '</ul>');
  }

  function combustible() {
    var mes = combustibleMes(st.fuel, hoy());
    var lista = (st.fuel || []).slice(0, 8);
    var resumen = '<div class="ftd-resumen"><div><span>Cargas del mes</span><b>' + mes.cargas + '</b></div>' +
      '<div><span>Litros</span><b>' + Math.round(mes.litros).toLocaleString('es-AR') + ' L</b></div>' +
      '<div><span>Gastado</span><b>' + money(mes.total) + '</b></div></div>';
    var tabla = lista.length
      ? '<table class="ftd-table"><thead><tr><th>Fecha</th><th class="ftd-r">Litros</th><th class="ftd-r">Total</th><th class="ftd-r">Km</th><th>Pago</th>' + (admin() ? '<th></th>' : '') + '</tr></thead><tbody>' +
        lista.map(function (f) {
          return '<tr><td>' + fecha(f.fuel_date) + '</td><td class="ftd-r ftd-n">' + num(f.liters).toLocaleString('es-AR') + ' L</td>' +
            '<td class="ftd-r ftd-n">' + money(f.total_cost) + '</td><td class="ftd-r ftd-n">' + (f.km_at_load != null ? num(f.km_at_load).toLocaleString('es-AR') : '—') + '</td>' +
            '<td>' + esc(f.payment_app || PAGO[f.payment_method] || f.payment_method || '—') + '</td>' +
            (admin() ? '<td class="ftd-r"><button type="button" class="ftd-link" data-ftd="editar-carga" data-id="' + esc(f.fuel_id) + '">Editar</button></td>' : '') + '</tr>';
        }).join('') + '</tbody></table>'
      : '<p class="ftd-vacio">Sin cargas registradas.</p>';
    return seccion('Combustible', [boton('carga', '+ Carga')], resumen + tabla);
  }

  function neumaticos() {
    var ult = (st.tires || [])[0];
    var e = neumaticosEstado(st.t, ult, hoy());
    var cab = '<div class="ftd-estado">' + val(e.txt, e.tono) + (ult ? '<small>Último control: ' + fecha(ult.check_date) + (ult.pressure_psi ? ' · ' + esc(ult.pressure_psi) + ' PSI' : '') + '</small>' : '') + '</div>';
    var lista = (st.tires || []).slice(0, 6);
    var tabla = lista.length
      ? '<table class="ftd-table"><thead><tr><th>Fecha</th><th>Neumáticos</th><th>Frenos</th><th>Notas</th></tr></thead><tbody>' +
        lista.map(function (c) {
          var m = function (v) { return v === 'malo' ? val(COND[v], 'critico') : esc(COND[v] || '—'); };
          return '<tr><td>' + fecha(c.check_date) + '</td><td>' + m(c.tire_condition) + '</td><td>' + m(c.brake_condition) + '</td><td class="ftd-notas">' + esc(c.notes || '') + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '';
    return seccion('Neumáticos y frenos', [boton('neumaticos', '+ Control')], cab + tabla);
  }

  function pintar() {
    var cont = document.getElementById('camion-cards-container');
    if (!cont || !st.t) return;
    var t = st.t;
    var titulo = F().titulo ? F().titulo(t) : (t.numero_interno || t.plate);
    var e = F().estado ? F().estado(t) : { label: '', key: '' };
    var sub = [t.plate, [t.brand, t.model].filter(Boolean).join(' '), t.year].filter(Boolean).join(' · ');
    var estadoTxt = e.label + (e.key === 'servicio' && e.det ? ' · ' + e.det : '') + (t.driver_name ? ' · ' + t.driver_name : '');
    var cab =
      '<div class="ftd-head">' +
        '<button type="button" class="ftd-back" data-ftd="volver">← Flota</button>' +
        '<div class="ftd-id"><h2>' + esc(titulo) + '</h2><p>' + esc(sub) + '</p></div>' +
        '<dl class="ftd-meta"><div><dt>Estado</dt><dd>' + esc(estadoTxt || '—') + '</dd></div>' +
          '<div><dt>Km actuales</dt><dd class="ftd-n">' + (t.current_km != null ? km(t.current_km) : '—') + '</dd></div></dl>' +
      '</div>';
    if (st.cargando) { cont.innerHTML = '<div class="ftd">' + cab + '<div class="fcv-empty">Cargando el camión…</div></div>'; return; }
    if (st.error) { cont.innerHTML = '<div class="ftd">' + cab + '<div class="fcv-empty fcv-error">' + esc(st.error) + '</div></div>'; return; }
    var pend = pendientes({ t: t, planes: st.planes, docs: st.docs, tires: st.tires, today: hoy() });
    cont.innerHTML =
      '<div class="ftd">' + cab +
        (pend.length
          ? '<div class="ftd-pend"><h3>Para resolver <span>' + pend.length + '</span></h3><ul>' +
              pend.map(function (p) { return '<li>' + val(p.txt, p.tono) + '</li>'; }).join('') + '</ul></div>'
          : '<div class="ftd-pend ftd-ok">Todo en orden: sin services vencidos, documentación al día y controles hechos.</div>') +
        '<div class="ftd-grid">' + mantenimiento() + documentacion() + combustible() + neumaticos() + '</div>' +
      '</div>';
  }

  async function datos(id) {
    var q = db();
    var tires = q ? q.from('tire_checks').select('check_id, check_date, tire_condition, brake_condition, pressure_psi, notes')
      .eq('truck_id', id).order('check_date', { ascending: false }).order('created_at', { ascending: false }).limit(10) : null;
    var r = await Promise.all([
      typeof cargarPlanesDetalleOptimizados === 'function' ? cargarPlanesDetalleOptimizados(id) : [],
      typeof cargarHistorialServices === 'function' ? cargarHistorialServices(id) : [],
      typeof cargarCombustible === 'function' ? cargarCombustible(id) : [],
      tires ? tires.then(function (x) { if (x.error) throw x.error; return x.data || []; }) : [],
      typeof cargarTruckDocs === 'function' ? cargarTruckDocs(id) : []
    ]);
    return { planes: Array.isArray(r[0]) ? r[0] : [], services: r[1] || [], fuel: (r[2] || []).filter(function (f) { return !f.voided_at && f.status !== 'anulado'; }), tires: r[3] || [], docs: r[4] || [] };
  }

  async function abrir(id) {
    var t = null;
    try { t = (_flotaAdmin || []).find(function (x) { return Number(x.truck_id) === Number(id); }); } catch (e) { /* sin flota */ }
    if (!t) return;
    if (st.id !== Number(id)) Object.assign(st, { planes: [], services: [], fuel: [], tires: [], docs: [] });
    st = Object.assign(st, { id: Number(id), t: t, cargando: true, error: '' });
    // Los formularios de siempre (combustible, service, plan, neumáticos) usan estos globales.
    try { _camionVistaAdmin = 'detalle'; _camionLogDate = null; _truckActual = t; } catch (e) { /* sin globales */ }
    var sub = document.getElementById('camion-sec-sub');
    if (sub) sub.textContent = '';
    var hero = document.getElementById('camion-hero-card');
    if (hero) hero.style.display = 'none';
    if (typeof _volverCamionMain === 'function') _volverCamionMain();
    pintar();
    try {
      var d = await datos(t.truck_id);
      if (st.id !== Number(id)) return;
      Object.assign(st, d);
      try { _camionPlanes = d.planes; _camionHistorial = d.services; _camionCombustible = d.fuel; _camionNeumaticos = d.tires[0] || null; } catch (e) { /* sin globales */ }
    } catch (e) {
      st.error = 'No se pudo cargar el camión: ' + ((e && e.message) || e);
    }
    st.cargando = false;
    pintar();
  }

  function recargar() { if (st.id) return abrir(st.id); }

  function volver() {
    st.id = null; st.t = null;
    try { _camionVistaAdmin = 'flota'; } catch (e) { /* sin globales */ }
    if (typeof global._renderCamionFlotaAdmin === 'function') global._renderCamionFlotaAdmin();
  }

  async function verDoc(path) {
    var w = global.open('', '_blank');
    try {
      var url = /^https?:/.test(path) && path.indexOf('/object/') < 0 ? path : await obtenerSignedUrl(path);
      if (w) w.location = url; else global.open(url, '_blank', 'noopener');
    } catch (e) {
      if (w) w.close();
      if (typeof toast === 'function') toast('No se pudo abrir el archivo: ' + ((e && e.message) || e), 'error');
    }
  }

  function subirDoc(code) {
    if (typeof abrirUploadTruckDoc !== 'function') return;
    try {
      if (!_listaCamiones || !_listaCamiones.length) _listaCamiones = (_flotaAdmin || []).map(function (x) { return { truck_id: x.truck_id, numero_interno: x.numero_interno, plate: x.plate, brand: x.brand || '' }; });
    } catch (e) { /* sin lista */ }
    abrirUploadTruckDoc(code || '');
    var sel = document.getElementById('utd-truck-id');
    if (sel) sel.value = String(st.id);
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-ftd]');
    if (!b || !st.id) return;
    var a = b.getAttribute('data-ftd');
    if (a === 'volver') return volver();
    if (a === 'ver-doc') return verDoc(b.getAttribute('data-path'));
    if (!admin()) return;
    if (a === 'service' && typeof openServiceModal === 'function') return openServiceModal();
    if (a === 'plan' && typeof openPlanModal === 'function') return openPlanModal();
    if (a === 'carga' && typeof openFuelModal === 'function') return openFuelModal();
    if (a === 'neumaticos' && typeof openNeumaticosModal === 'function') return openNeumaticosModal();
    if (a === 'editar-carga' && typeof global.editarCargaCombustibleAdmin === 'function') return global.editarCargaCombustibleAdmin(Number(b.getAttribute('data-id')));
    if (a === 'doc') return subirDoc(b.getAttribute('data-code'));
  });

  /* ── Enganches ──────────────────────────────────────────────────── */

  function envolver(nombre, fn) {
    var orig = global[nombre];
    if (typeof orig !== 'function' || orig.__ftd) return typeof orig === 'function';
    var w = fn(orig);
    w.__ftd = true;
    global[nombre] = w;
    return true;
  }

  function enganchar() {
    var ok = envolver('_abrirCamionDetalleAdmin', function (orig) {
      return function (id) { return gestion() ? abrir(id) : orig.apply(this, arguments); };
    });
    // Al guardar desde un formulario, los de siempre vuelven a la flota: si se abrió
    // desde este detalle, se recarga el detalle.
    envolver('closeModal', function (orig) {
      return function (id) { if (st.id && MODALES.indexOf(id) >= 0) st.cerradoAt = Date.now(); return orig.apply(this, arguments); };
    });
    envolver('cargarScreenCamion', function (orig) {
      return function () {
        if (gestion() && st.id && Date.now() - st.cerradoAt < 5000) { st.cerradoAt = 0; return recargar(); }
        st.id = null;
        return orig.apply(this, arguments);
      };
    });
    var refrescar = function (orig) {
      return function () {
        var r = orig.apply(this, arguments);
        if (gestion() && st.id && Date.now() - st.cerradoAt < 5000) { clearTimeout(refrescar.t); refrescar.t = setTimeout(recargar, 80); }
        return r;
      };
    };
    envolver('renderPlanes', refrescar);
    envolver('renderHistorialServices', refrescar);
    envolver('subirDocCamion', function (orig) {
      return async function () {
        var r = await orig.apply(this, arguments);
        if (gestion() && st.id) recargar();
        return r;
      };
    });
    return ok;
  }
  if (!enganchar()) {
    var n = 0, tm = setInterval(function () { if (enganchar() || ++n > 40) clearInterval(tm); }, 250);
  }

  global.AuxiliosDetalleCamion = {
    abrir: abrir,
    recargar: recargar,
    _test: {
      set: function (s) { st = Object.assign(st, s); },
      planEstado: planEstado, planAvance: planAvance, docsLista: docsLista, neumaticosEstado: neumaticosEstado,
      pendientes: pendientes, combustibleMes: combustibleMes, gastoMantenimiento: gastoMantenimiento
    }
  };
})(window);

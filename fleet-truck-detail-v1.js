/* AuxiliOS · Control del camión · detalle de un móvil (v1)

   Administración y Supervisión ven el camión en una sola pantalla: arriba los
   datos del móvil (tipo, chofer y jornada, km actuales y del mes), cuatro
   tarjetas de resumen con el mismo lenguaje corto de la flota (Service,
   Documentación, Neumáticos y frenos, Combustible) y debajo una pestaña por
   tema, más Historial (todo en una línea de tiempo). Tocar una tarjeta abre su
   pestaña. Mantenimiento estima la fecha de cada service con los km por día;
   Combustible muestra cuánto rinde cada carga (km/l). La documentación obligatoria que el
   móvil no tiene cargada se muestra como faltante.
   Las acciones (cargar, registrar, subir) son sólo de Administración y usan
   los mismos formularios de siempre; al guardar se vuelve a esta pantalla.
   La vista del chofer no cambia. */
(function (global) {
  'use strict';

  var st = { id: null, t: null, planes: [], services: [], fuel: [], tires: [], docs: [], logs: [], tab: 'mantenimiento', cargando: false, error: '', cerradoAt: 0 };
  var TABS = [['mantenimiento', 'Mantenimiento'], ['documentacion', 'Documentación'], ['neumaticos', 'Neumáticos y frenos'], ['combustible', 'Combustible'], ['historial', 'Historial']];
  var TIPO = { plancha: 'Plancha', asistencia: 'Asistencia', pesado: 'Pesado' };
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

  /* Tarjetas de resumen: el mismo lenguaje corto que la tabla de flota. */
  function resumenService(planes) {
    var ok = (planes || []).filter(function (p) { return p.plan_estado !== '_error'; });
    if (F().servicioDe) return F().servicioDe(ok);
    return { txt: ok.length ? ok[0].name : 'Sin service informado', tono: '' };
  }
  function resumenDocs(docs, today) {
    var filas = docsLista(docs, today).filter(function (f) { return f.obligatorio; });
    var cargados = filas.filter(function (f) { return f.doc; }).length;
    var txt = cargados === filas.length ? 'Completo' : cargados + '/' + filas.length;
    var venc = filas.filter(function (f) { return f.tono === 'critico'; });
    var falta = filas.filter(function (f) { return !f.doc; });
    var otros = filas.filter(function (f) { return f.doc && f.tono === 'alerta'; });
    var corto = function (l) { return l.map(function (f) { return obligatorios()[f.code] || f.nombre; }).join(', '); };
    if (venc.length) return { txt: txt, tono: 'critico', sub: 'Vencido: ' + corto(venc) };
    if (falta.length) return { txt: txt, tono: 'alerta', sub: 'Falta ' + corto(falta) };
    if (otros.length) return { txt: txt, tono: 'alerta', sub: otros.map(function (f) { return (obligatorios()[f.code] || f.nombre) + ' ' + f.txt.toLowerCase(); }).join(', ') };
    return { txt: txt, tono: '' };
  }
  function resumenNeumaticos(t, tires) {
    var u = (tires || [])[0];
    var fila = { log_id: t && t.log_id, tire_date: u && u.check_date, tire_condition: u && u.tire_condition, brake_condition: u && u.brake_condition };
    if (F().neumaticos) return F().neumaticos(fila);
    return { txt: u ? 'Control del ' + fecha(u.check_date) : 'Sin controles', tono: '' };
  }
  function resumenCombustible(fuel, today) {
    var u = (fuel || [])[0];
    if (!u) return { txt: 'Sin cargas', tono: '' };
    var mes = combustibleMes(fuel, today);
    return {
      txt: fecha(u.fuel_date).slice(0, 5) + ' · ' + num(u.liters).toLocaleString('es-AR') + ' L',
      tono: '',
      sub: mes.cargas ? 'Este mes: ' + mes.cargas + (mes.cargas === 1 ? ' carga' : ' cargas') + ' · ' + money(mes.total) : 'Sin cargas este mes'
    };
  }
  /* Km recorridos en el mes según las jornadas del móvil. */
  function kmMes(logs, today) {
    var mes = String(today || '').slice(0, 7);
    var r = { km: 0, jornadas: 0 };
    (logs || []).forEach(function (l) {
      if (String(l.log_date || '').slice(0, 7) !== mes || l.voided_at) return;
      r.jornadas++; r.km += num(l.km_recorridos);
    });
    return r;
  }

  /* Km por día: promedio de las jornadas de los últimos 30 días (calendario). */
  function kmPorDia(logs, today) {
    var total = 0, alguna = false;
    (logs || []).forEach(function (l) {
      var n = dias(l.log_date, today);
      if (l.voided_at || n == null || n < 0 || n >= 30) return;
      total += num(l.km_recorridos); alguna = true;
    });
    return alguna && total > 0 ? total / 30 : 0;
  }
  /* Fecha estimada en que el móvil llega a los km del próximo service. */
  function estimarService(p, porDia, today) {
    if (!porDia || p.km_restantes == null || p.km_restantes <= 0) return null;
    var d = Math.ceil(p.km_restantes / porDia);
    if (d > 730) return { dias: d, txt: 'Más de 2 años' };
    var f = new Date(String(today).slice(0, 10) + 'T12:00:00');
    f.setDate(f.getDate() + d);
    var iso = f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0');
    return { dias: d, fecha: iso, txt: 'En unos ' + d + (d === 1 ? ' día' : ' días') + ' (' + fecha(iso).slice(0, 5) + ')' };
  }

  /* Rendimiento km/l: km entre una carga y la anterior, sobre los litros de la carga nueva.
     Se descartan saltos imposibles (km en baja o más de 3.000 km entre cargas). */
  function rendimientos(fuel) {
    var lista = (fuel || []).filter(function (f) { return f.km_at_load != null && num(f.liters) > 0; })
      .slice().sort(function (a, b) { return num(b.km_at_load) - num(a.km_at_load); });
    var out = {};
    for (var i = 0; i < lista.length - 1; i++) {
      var km = num(lista[i].km_at_load) - num(lista[i + 1].km_at_load);
      if (km <= 0 || km > 3000) continue;
      out[lista[i].fuel_id] = Math.round(km / num(lista[i].liters) * 10) / 10;
    }
    var vals = Object.keys(out).map(function (k) { return out[k]; });
    var prom = vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length * 10) / 10 : null;
    return { porCarga: out, promedio: prom };
  }
  /* Consumo alto: una carga que rinde menos del 75 % del promedio del móvil. */
  function consumoAlto(v, prom) { return v != null && prom != null && prom > 0 && v < prom * 0.75; }

  /* Historial del móvil en una sola línea de tiempo, lo más nuevo primero. */
  function historial(d) {
    var ev = [];
    (d.fuel || []).forEach(function (f) {
      ev.push({ f: f.fuel_date, tipo: 'Combustible', txt: num(f.liters).toLocaleString('es-AR') + ' L · ' + money(f.total_cost) + (f.gas_station ? ' · ' + f.gas_station : '') });
    });
    (d.tires || []).forEach(function (c) {
      var mal = [c.tire_condition === 'malo' ? 'neumáticos' : '', c.brake_condition === 'malo' ? 'frenos' : ''].filter(Boolean).join(' y ');
      var reg = [c.tire_condition === 'regular' ? 'neumáticos' : '', c.brake_condition === 'regular' ? 'frenos' : ''].filter(Boolean).join(' y ');
      ev.push({ f: c.check_date, tipo: 'Control', txt: mal ? 'Mal: ' + mal : reg ? 'Regular: ' + reg : 'Bien', tono: mal ? 'critico' : reg ? 'alerta' : '' });
    });
    (d.services || []).forEach(function (x) {
      ev.push({ f: x.performed_at, tipo: 'Service', txt: ((x.master_service_plans && x.master_service_plans.name) || 'Service') + (x.km_at_service != null ? ' · ' + km(x.km_at_service) : '') + (x.workshop_name ? ' · ' + x.workshop_name : '') + (x.cost ? ' · ' + money(x.cost) : '') });
    });
    (d.docs || []).forEach(function (x) {
      if (x.created_at) ev.push({ f: String(x.created_at).slice(0, 10), tipo: 'Documento', txt: nombreDoc(x.internal_code) + ' cargado' + (x.expiry_date ? ' · vence ' + fecha(x.expiry_date) : '') });
    });
    (d.logs || []).forEach(function (l) {
      if (!l.voided_at) ev.push({ f: l.log_date, tipo: 'Jornada', txt: l.km_recorridos ? km(l.km_recorridos) + ' recorridos' : 'Jornada abierta' });
    });
    var orden = { Jornada: 0, Combustible: 1, Control: 2, Service: 3, Documento: 4 };
    return ev.filter(function (e) { return e.f; }).sort(function (a, b) {
      return String(b.f).localeCompare(String(a.f)) || orden[a.tipo] - orden[b.tipo];
    });
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

  function seccion(clave, titulo, acciones, cuerpo) {
    acciones = acciones.filter(Boolean);
    return '<section class="ftd-sec" role="tabpanel" id="ftd-panel-' + clave + '" aria-label="' + esc(titulo) + '" data-ftd-sec="' + clave + '">' +
      (acciones.length ? '<header><div class="ftd-acc">' + acciones.join('') + '</div></header>' : '') + cuerpo + '</section>';
  }
  function boton(accion, label, extra) {
    return admin() ? '<button type="button" class="ftd-btn" data-ftd="' + accion + '"' + (extra || '') + '>' + label + '</button>' : '';
  }

  function mantenimiento() {
    var planes = (st.planes || []).filter(function (p) { return p.plan_estado !== '_error'; });
    var porDia = kmPorDia(st.logs, hoy());
    var filas = planes.length
      ? '<ul class="ftd-planes">' + planes.map(function (p) {
          var e = planEstado(p), av = planAvance(p), est = estimarService(p, porDia, hoy());
          var hecho = p.interval_km && p.km_restantes != null ? Math.max(0, p.interval_km - p.km_restantes) : null;
          return '<li><div><b>' + esc(p.name) + '</b><small>' + (p.interval_km ? 'Cada ' + km(p.interval_km) : '') +
            (p.next_due_km ? ' · próximo a los ' + km(p.next_due_km) : '') + '</small></div>' +
            '<span class="ftd-li-acc">' + val(e.txt, e.tono) + (admin() && p.plan_id != null ? '<button type="button" class="ftd-link ftd-quitar" data-ftd="quitar-plan" data-id="' + esc(p.plan_id) + '" title="Quitar este plan del móvil">Quitar</button>' : '') + '</span>' +
            (av != null ? '<span class="ftd-bar' + (e.tono ? ' ftd-bar-' + e.tono : '') + '"><span style="width:' + av + '%"></span></span>' +
              '<span class="ftd-bar-leyenda"><span>' + (hecho != null ? num(hecho).toLocaleString('es-AR') + ' de ' + km(p.interval_km) : '') + '</span>' +
              (est ? '<span>' + esc(est.txt) + '</span>' : '') + '</span>' : '') + '</li>';
        }).join('') + '</ul>'
      : '<p class="ftd-vacio">Sin planes de service.' + (admin() ? ' Asigná uno con "+ Plan".' : '') + '</p>';
    if (planes.length) filas += '<p class="ftd-nota">' + (porDia ? 'Fechas estimadas con el promedio de los últimos 30 días: ' + Math.round(porDia).toLocaleString('es-AR') + ' km por día.' : 'Sin jornadas en los últimos 30 días: no se pueden estimar fechas.') + '</p>';
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
    return seccion('mantenimiento', 'Mantenimiento', [boton('service', '+ Service'), boton('plan', '+ Plan')], filas + tabla);
  }

  function documentacion() {
    var filas = docsLista(st.docs, hoy());
    return seccion('documentacion', 'Documentación', [boton('doc', '+ Documento')],
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
    var rend = rendimientos(st.fuel);
    var lista = (st.fuel || []).slice(0, 10);
    var kml = function (v) { return v == null ? '—' : v.toLocaleString('es-AR') + ' km/l'; };
    var resumen = '<div class="ftd-resumen"><div><span>Cargas del mes</span><b>' + mes.cargas + '</b></div>' +
      '<div><span>Litros</span><b>' + Math.round(mes.litros).toLocaleString('es-AR') + ' L</b></div>' +
      '<div><span>Gastado</span><b>' + money(mes.total) + '</b></div>' +
      '<div><span>Rendimiento promedio</span><b>' + kml(rend.promedio) + '</b></div></div>';
    var tabla = lista.length
      ? '<table class="ftd-table"><thead><tr><th>Fecha</th><th class="ftd-r">Litros</th><th class="ftd-r">Total</th><th class="ftd-r">Km</th><th class="ftd-r">Rinde</th><th>Pago</th>' + (admin() ? '<th></th>' : '') + '</tr></thead><tbody>' +
        lista.map(function (f) {
          var v = rend.porCarga[f.fuel_id];
          return '<tr data-ftd-carga="' + esc(f.fuel_id) + '"><td>' + fecha(f.fuel_date) + '</td><td class="ftd-r ftd-n">' + num(f.liters).toLocaleString('es-AR') + ' L</td>' +
            '<td class="ftd-r ftd-n">' + money(f.total_cost) + '</td><td class="ftd-r ftd-n">' + (f.km_at_load != null ? num(f.km_at_load).toLocaleString('es-AR') : '—') + '</td>' +
            '<td class="ftd-r ftd-n">' + (consumoAlto(v, rend.promedio) ? val(kml(v), 'alerta') : kml(v)) + '</td>' +
            '<td>' + esc(f.payment_app || PAGO[f.payment_method] || f.payment_method || '—') + '</td>' +
            (admin() ? '<td class="ftd-r"><button type="button" class="ftd-link" data-ftd="editar-carga" data-id="' + esc(f.fuel_id) + '">Editar</button></td>' : '') + '</tr>';
        }).join('') + '</tbody></table>'
      : '<p class="ftd-vacio">Sin cargas registradas.</p>';
    if (lista.length) tabla += '<p class="ftd-nota">Rinde: km desde la carga anterior sobre los litros cargados. En ámbar, las cargas que rinden menos del 75 % del promedio.</p>';
    return seccion('combustible', 'Combustible', [boton('carga', '+ Carga')], resumen + tabla);
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
    return seccion('neumaticos', 'Neumáticos y frenos', [boton('neumaticos', '+ Control')], cab + tabla);
  }

  function historialPanel() {
    var ev = historial({ fuel: st.fuel, tires: st.tires, services: st.services, docs: st.docs, logs: st.logs });
    var lista = ev.slice(0, 40), ultimo = null;
    var cuerpo = lista.length
      ? '<ol class="ftd-hist">' + lista.map(function (e) {
          var dia = e.f !== ultimo ? '<span class="ftd-hist-f">' + fecha(e.f) + '</span>' : '<span class="ftd-hist-f"></span>';
          ultimo = e.f;
          return '<li>' + dia + '<span class="ftd-hist-t">' + esc(e.tipo) + '</span>' + (e.tono ? val(e.txt, e.tono) : '<span>' + esc(e.txt) + '</span>') + '</li>';
        }).join('') + '</ol>' + (ev.length > lista.length ? '<p class="ftd-nota">Se muestran los últimos ' + lista.length + ' movimientos.</p>' : '')
      : '<p class="ftd-vacio">Todavía no hay movimientos del móvil.</p>';
    return seccion('historial', 'Historial', [], cuerpo);
  }

  function tarjeta(tab, titulo, r) {
    return '<button type="button" class="ftd-card' + (st.tab === tab ? ' on' : '') + '" data-ftd-tab="' + tab + '" aria-controls="ftd-panel-' + tab + '">' +
      '<span class="ftd-card-t">' + titulo + '</span>' + val(r.txt, r.tono) + (r.sub ? '<small>' + esc(r.sub) + '</small>' : '') + '</button>';
  }

  function cabecera(t) {
    var titulo = F().titulo ? F().titulo(t) : (t.numero_interno || t.plate);
    var e = F().estado ? F().estado(t) : { label: '', key: '' };
    var tipo = t.tipo_equipo ? (TIPO[t.tipo_equipo] || t.tipo_equipo) : '';
    var sub = [t.plate, [t.brand, t.model].filter(Boolean).join(' '), t.year].filter(Boolean).join(' · ');
    var estadoTxt = e.label + (e.key === 'servicio' && e.det ? ' · ' + e.det : '') + (e.key === 'taller' && t.workshop_detail ? ': ' + t.workshop_detail : '');
    var jornada = (st.logs || []).find(function (l) { return t.log_id && Number(l.log_id) === Number(t.log_id); });
    var chofer = t.driver_name ? t.driver_name + (jornada && jornada.hora_inicio ? ' · desde las ' + String(jornada.hora_inicio).slice(0, 5) : '') : 'Sin jornada abierta';
    var mes = kmMes(st.logs, hoy());
    var dato = function (dt, dd, cls) { return '<div><dt>' + dt + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + dd + '</dd></div>'; };
    return '<div class="ftd-head">' +
        '<button type="button" class="ftd-back" data-ftd="volver">← Flota</button>' +
        '<div class="ftd-id"><h2>' + esc(titulo) + (tipo ? '<span class="ftd-tipo">' + esc(tipo) + '</span>' : '') + '</h2><p>' + esc(sub) + '</p></div>' +
        '<dl class="ftd-meta">' +
          dato('Estado', '<span class="fcv-estado fcv-e-' + esc(e.tono || '') + '">' + esc(estadoTxt || '—') + '</span>') +
          dato('Chofer', esc(chofer)) +
          dato('Km actuales', t.current_km != null ? km(t.current_km) : '—', 'ftd-n') +
          dato('Km este mes', st.cargando ? '…' : km(mes.km) + '<small>' + mes.jornadas + (mes.jornadas === 1 ? ' jornada' : ' jornadas') + '</small>', 'ftd-n') +
        '</dl>' +
      '</div>';
  }

  function pintar() {
    var cont = document.getElementById('camion-cards-container');
    if (!cont || !st.t) return;
    var t = st.t, today = hoy();
    var cab = cabecera(t);
    if (st.cargando) { cont.innerHTML = '<div class="ftd">' + cab + '<div class="fcv-empty">Cargando el camión…</div></div>'; return; }
    if (st.error) { cont.innerHTML = '<div class="ftd">' + cab + '<div class="fcv-empty fcv-error">' + esc(st.error) + '</div></div>'; return; }
    var res = {
      mantenimiento: resumenService(st.planes),
      documentacion: resumenDocs(st.docs, today),
      neumaticos: resumenNeumaticos(t, st.tires),
      combustible: resumenCombustible(st.fuel, today)
    };
    var panel = { mantenimiento: mantenimiento, documentacion: documentacion, combustible: combustible, neumaticos: neumaticos, historial: historialPanel }[st.tab] || mantenimiento;
    cont.innerHTML =
      '<div class="ftd">' + cab +
        '<div class="ftd-cards">' +
          tarjeta('mantenimiento', 'Service', res.mantenimiento) + tarjeta('documentacion', 'Documentación', res.documentacion) +
          tarjeta('neumaticos', 'Neumáticos y frenos', res.neumaticos) + tarjeta('combustible', 'Combustible', res.combustible) +
        '</div>' +
        '<div class="ftd-tabs" role="tablist">' + TABS.map(function (x) {
          var r = res[x[0]];
          return '<button type="button" role="tab" class="ftd-tab' + (st.tab === x[0] ? ' on' : '') + '" aria-selected="' + (st.tab === x[0]) + '" aria-controls="ftd-panel-' + x[0] + '" data-ftd-tab="' + x[0] + '">' +
            x[1] + (r && r.tono ? '<i class="ftd-dot ftd-dot-' + r.tono + '" aria-hidden="true"></i>' : '') + '</button>';
        }).join('') + '</div>' +
        panel() +
      '</div>';
  }

  async function datos(id) {
    var q = db();
    var tires = q ? q.from('tire_checks').select('check_id, check_date, tire_condition, brake_condition, pressure_psi, notes')
      .eq('truck_id', id).order('check_date', { ascending: false }).order('created_at', { ascending: false }).limit(10) : null;
    var desde = new Date(hoy() + 'T12:00:00'); desde.setDate(desde.getDate() - 45);
    var mes = hoy().slice(0, 8) + '01';
    var d45 = desde.getFullYear() + '-' + String(desde.getMonth() + 1).padStart(2, '0') + '-' + String(desde.getDate()).padStart(2, '0');
    var logs = q ? q.from('daily_logs').select('log_id, log_date, hora_inicio, km_recorridos, voided_at')
      .eq('truck_id', id).gte('log_date', d45 < mes ? d45 : mes).order('log_date', { ascending: false }).limit(90) : null;
    var r = await Promise.all([
      typeof cargarPlanesDetalleOptimizados === 'function' ? cargarPlanesDetalleOptimizados(id) : [],
      typeof cargarHistorialServices === 'function' ? cargarHistorialServices(id) : [],
      typeof cargarCombustible === 'function' ? cargarCombustible(id) : [],
      tires ? tires.then(function (x) { if (x.error) throw x.error; return x.data || []; }) : [],
      typeof cargarTruckDocs === 'function' ? cargarTruckDocs(id) : [],
      // Los km del mes son un dato más: si falla, el detalle se muestra igual.
      logs ? logs.then(function (x) { return x.error ? [] : (x.data || []); }, function () { return []; }) : []
    ]);
    return { planes: Array.isArray(r[0]) ? r[0] : [], services: r[1] || [], fuel: (r[2] || []).filter(function (f) { return !f.voided_at && f.status !== 'anulado'; }), tires: r[3] || [], docs: r[4] || [], logs: r[5] || [] };
  }

  function buscar(id) {
    try { return (_flotaAdmin || []).find(function (x) { return Number(x.truck_id) === Number(id); }) || null; } catch (e) { return null; }
  }

  /* opts.seccion ('combustible', 'neumaticos', …) lleva a esa sección; opts.carga resalta esa carga. */
  async function abrir(id, opts) {
    opts = opts || {};
    var t = buscar(id);
    // Desde otra pantalla (p. ej. Jornadas) la flota puede no estar cargada todavía.
    if (!t && F().cargar) { st.id = Number(id); st.t = null; await F().cargar(); t = buscar(id); }
    if (!t) { st.id = null; return; }
    if (st.id !== Number(id)) Object.assign(st, { planes: [], services: [], fuel: [], tires: [], docs: [], logs: [], tab: 'mantenimiento' });
    if (opts.seccion && TABS.some(function (x) { return x[0] === opts.seccion; })) st.tab = opts.seccion;
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
    irA(opts);
  }

  function irA(opts) {
    var fila = opts.carga && document.querySelector('[data-ftd-carga="' + String(opts.carga).replace(/"/g, '') + '"]');
    if (fila) fila.classList.add('jat-highlight');
    var el = fila || (opts.seccion && document.querySelector('.ftd-tabs'));
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    var tab = ev.target.closest && ev.target.closest('[data-ftd-tab]');
    if (tab && st.id) { st.tab = tab.getAttribute('data-ftd-tab'); return pintar(); }
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
    if (a === 'quitar-plan' && typeof desactivarPlanUI === 'function') return desactivarPlanUI(Number(b.getAttribute('data-id')));
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
    // Al guardar desde un formulario, los de siempre vuelven a la flota: si se abrió
    // desde este detalle, se recarga el detalle.
    var ok = envolver('closeModal', function (orig) {
      return function (id) { if (st.id && MODALES.indexOf(id) >= 0) st.cerradoAt = Date.now(); return orig.apply(this, arguments); };
    });
    envolver('cargarScreenCamion', function (orig) {
      return function () {
        if (gestion() && st.id && Date.now() - st.cerradoAt < 5000) { st.cerradoAt = 0; return recargar(); }
        st.id = null;
        return orig.apply(this, arguments);
      };
    });
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
    abierto: function () { return st.id; },
    _test: {
      set: function (s) { st = Object.assign(st, s); },
      planEstado: planEstado, planAvance: planAvance, docsLista: docsLista, neumaticosEstado: neumaticosEstado,
      resumenService: resumenService, resumenDocs: resumenDocs, resumenNeumaticos: resumenNeumaticos, resumenCombustible: resumenCombustible,
      kmMes: kmMes, kmPorDia: kmPorDia, estimarService: estimarService, rendimientos: rendimientos, consumoAlto: consumoAlto, historial: historial,
      combustibleMes: combustibleMes, gastoMantenimiento: gastoMantenimiento
    }
  };
})(window);

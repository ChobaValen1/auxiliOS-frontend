/* AuxiliOS · Vista de un servicio particular (v1)

   Al entrar a un servicio particular no se abre el workspace de prestadora
   (tarifario, prestación, peajes): se abre esta ficha propia con Cliente,
   Vehículo, Servicio, Cobro (presupuesto, pagos y saldo), Chofer y Remito, y las
   acciones que corresponden: Registrar cobro, Finalizar, Editar, Ver remito. */
(function (global) {
  'use strict';

  var ESTADO = { pending: 'Pendiente', scheduled: 'Programado', assigned: 'Asignado', at_origin: 'Arribado', completed: 'Finalizado', cancelled: 'Anulado' };
  var MEDIO = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', mercado_pago: 'Mercado Pago', other: 'Otro' };
  var IVA = { consumidor_final: 'Consumidor final', monotributo: 'Monotributo', responsable_inscripto: 'Responsable inscripto', exento: 'Exento' };
  var st = null;

  function db() { return typeof _db !== 'undefined' ? _db : null; }
  function OS() { return (global.OperatorServices && global.OperatorServices.S) || {}; }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function money(v) { return '$ ' + Math.round(num(v)).toLocaleString('es-AR'); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fecha(v) {
    if (!v) return '—';
    var d = new Date(v);
    return isNaN(d) ? '—' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  function servicio(id) { return (OS().services || []).find(function (s) { return String(s.service_id) === String(id); }) || null; }
  function esParticular(s) {
    var P = global.AuxiliosParticulares;
    return !!(s && (s.quoted_total != null || s.client_kind === 'particular' ||
      (P && P.esCuentaParticular && P.esCuentaParticular({ company_id: s.company_id, trade_name: s.company_name, client_kind: s.client_kind }))));
  }
  function dato(label, valor) { return '<div class="pvw-dato"><span>' + label + '</span><b>' + (valor || '—') + '</b></div>'; }

  function modal() {
    var m = document.getElementById('pvw-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'pvw-modal';
      m.className = 'psv-backdrop';
      m.hidden = true;
      document.body.appendChild(m);
    }
    return m;
  }

  function pintar() {
    var m = modal();
    m.hidden = false;
    document.body.classList.add('psv-open');
    var s = st.s || {}, p = st.pagos, c = st.ctx || {};
    var cerrado = ['completed', 'cancelled'].indexOf(s.status) >= 0;
    var saldo = p ? num(p.balance) : 0;
    var numero = s.service_order_number || s.service_number || 'Particular';
    var pagos = p ? (p.payments || []).filter(function (x) { return !x.voided_at; }) : [];
    var doc = (p && p.customer_document) || s.customer_document || s.remito_customer_document;
    m.innerHTML =
      '<div class="psv-dialog psv-form pvw-dialog" role="dialog" aria-modal="true" aria-labelledby="pvw-t">' +
        '<header><div><h2 id="pvw-t">' + esc(numero) + ' <span class="pvw-estado pvw-' + esc(s.status) + '">' + esc(ESTADO[s.status] || s.status || '') + '</span></h2>' +
          '<p>Servicio particular · ' + esc(s.customer_name || 'Cliente') + '</p></div>' +
          '<button type="button" class="psv-x" data-pvw="cerrar" aria-label="Cerrar">×</button></header>' +
        '<div class="psv-body">' +
          (st.error ? '<div class="psv-error" role="alert">' + esc(st.error) + '</div>' : '') +
          '<div class="psv-cols"><div class="psv-col">' +
            '<section><h3>Cliente</h3><div class="pvw-grid">' +
              dato('Nombre', esc(s.customer_name)) +
              dato('Teléfono', esc(s.customer_phone || s.remito_customer_phone)) +
              dato('DNI / CUIT', esc(doc)) +
              dato('Factura', p ? (p.invoice_requested ? 'Pide · ' + esc(IVA[p.customer_tax_condition] || p.customer_tax_condition || '') : 'No pide') : '…') +
            '</div></section>' +
            '<section><h3>Vehículo</h3><div class="pvw-grid">' +
              dato('Patente', esc(s.vehicle_plate || s.remito_vehicle_plate)) +
              dato('Marca y modelo', esc(s.vehicle_make_model || s.remito_vehicle_make_model)) +
            '</div></section>' +
            '<section><h3>Servicio</h3><div class="pvw-grid">' +
              dato('Tipo', esc(s.concept_name)) +
              dato('Fecha y hora', esc(fecha(s.scheduled_for))) +
              dato('Origen', esc(s.origin_formatted_address || s.origin)) +
              dato('Destino', esc(s.destination_formatted_address || s.destination)) +
              dato('Km', s.remito_km_reales != null ? esc(num(s.remito_km_reales).toLocaleString('es-AR')) + ' km (remito)' : s.estimated_distance_km ? esc(num(s.estimated_distance_km).toLocaleString('es-AR')) + ' km (estimado)' : '') +
            '</div>' +
            ((c.operator_notes || s.operator_notes) ? '<p class="pvw-notas">' + esc(c.operator_notes || s.operator_notes) + '</p>' : '') +
            '</section>' +
          '</div><div class="psv-col">' +
            '<section><h3>Cobro</h3>' +
              (p
                ? '<div class="ppv-resumen">' +
                    '<div><span>Presupuesto</span><b>' + money(p.quoted_total) + '</b></div>' +
                    '<div><span>Pagado</span><b>' + money(p.paid) + '</b></div>' +
                    '<div class="ppv-saldo"><span>Saldo</span><b>' + money(saldo) + '</b></div></div>' +
                  (pagos.length
                    ? '<ul class="ppv-pagos">' + pagos.map(function (x) {
                        return '<li><span>' + (x.kind === 'sena' ? 'Seña' : 'Pago') + ' · ' + esc(MEDIO[x.method] || x.method) +
                          '<small>' + esc(fecha(x.paid_at)) + (x.received_by ? ' · ' + esc(x.received_by) : '') + '</small></span><b>' + money(x.amount) + '</b></li>';
                      }).join('') + '</ul>'
                    : '<p class="psv-hint">Todavía no hay pagos registrados.</p>')
                : '<p class="psv-hint">Cargando cobro…</p>') +
            '</section>' +
            '<section><h3>Chofer y móvil</h3><div class="pvw-grid">' +
              dato('Chofer', esc(s.driver_name || (s.assigned_driver_id ? 'Asignado' : 'Sin asignar'))) +
              dato('Móvil', esc(s.truck_label || (s.assigned_truck_id ? 'Asignado' : 'Sin asignar'))) +
            '</div></section>' +
            '<section><h3>Remito</h3>' +
              (s.remito_id
                ? '<div class="pvw-remito"><span>' + (s.document_status === 'approved' ? 'Firmado y aprobado' : s.document_status === 'submitted' ? 'Firmado · para revisar' : 'Remito cargado') + '</span>' +
                  '<button type="button" class="psv-btn" data-pvw="remito">Ver remito</button></div>'
                : '<p class="psv-hint">El chofer todavía no cargó el remito.</p>') +
            '</section>' +
          '</div></div>' +
        '</div>' +
        '<footer><button type="button" class="psv-btn" data-pvw="cerrar">Cerrar</button>' +
          (!cerrado && typeof global.editarServicioOperador === 'function' ? '<button type="button" class="psv-btn" data-pvw="editar">Editar</button>' : '') +
          (p && saldo > 0 && s.status !== 'cancelled' ? '<button type="button" class="psv-btn" data-pvw="cobro">Registrar cobro</button>' : '') +
          (['assigned', 'at_origin'].indexOf(s.status) >= 0 && typeof global.finalizarServicioOperador === 'function' ? '<button type="button" class="psv-btn primary" data-pvw="finalizar">Finalizar</button>' : '') +
        '</footer>' +
      '</div>';
  }

  async function abrir(id) {
    st = { id: id, s: servicio(id) || { service_id: id }, pagos: null, ctx: null, error: '' };
    pintar();
    try {
      var r = await db().rpc('get_service_payments_v1', { p_service_id: id });
      if (r.error) throw r.error;
      st.pagos = r.data || {};
    } catch (e) { st.error = e.message || 'No se pudo cargar el cobro.'; }
    if (st && st.id === id) pintar();
  }

  function cerrar() {
    st = null;
    var m = document.getElementById('pvw-modal');
    if (m) { m.hidden = true; m.innerHTML = ''; }
    document.body.classList.remove('psv-open');
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-pvw]');
    if (!b) { if (ev.target.id === 'pvw-modal') cerrar(); return; }
    var a = b.getAttribute('data-pvw'), id = st && st.id;
    if (a === 'cerrar' || !id) return cerrar();
    cerrar();
    if (a === 'cobro' && global.AuxiliosCobroOperador) return global.AuxiliosCobroOperador.abrir(id);
    if (a === 'finalizar') return global.finalizarServicioOperador(id);
    if (a === 'editar') return global.editarServicioOperador(id);
    if (a === 'remito' && typeof global.abrirRemitoFirmadoOperador === 'function') return global.abrirRemitoFirmadoOperador(id);
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && st) cerrar(); });

  /* Entrar al servicio (clic en la fila o "Ver servicio") abre esta ficha si es particular. */
  var original = null;
  function enganchar() {
    if (typeof global.verServicioWorkspace !== 'function') return false;
    if (global.verServicioWorkspace.__pvw) return true;
    original = global.verServicioWorkspace;
    var w = function (id) {
      if (esParticular(servicio(id))) return abrir(id);
      return original.apply(this, arguments);
    };
    w.__pvw = true;
    global.verServicioWorkspace = w;
    return true;
  }
  if (!enganchar()) {
    var n = 0, t = setInterval(function () { if (enganchar() || ++n > 40) clearInterval(t); }, 250);
  }

  global.AuxiliosVistaParticular = { abrir: abrir, _test: { esParticular: esParticular } };
})(window);

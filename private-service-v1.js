/* AuxiliOS · Crear servicio: Particular | Prestadora (v1)

   "Nuevo servicio" primero pregunta para quién es:
   · Prestadora → el alta de siempre (operator-service-wizard). En su selector
     de prestadoras no aparece la cuenta interna "Particulares".
   · Particular → este formulario: cliente de una sola vez, precio
     presupuestado, seña opcional y factura opcional.

   Por dentro un particular es un servicio de la cuenta "Particulares": pasa por
   la misma asignación, remito y cierre que cualquier otro. Lo guarda la RPC
   create_private_service_v1, que fija el presupuesto y registra la seña. */
(function (global) {
  'use strict';

  var CONDICIONES = [
    ['consumidor_final', 'Consumidor final'],
    ['monotributo', 'Monotributo'],
    ['responsable_inscripto', 'Responsable inscripto'],
    ['exento', 'Exento']
  ];
  var MEDIOS = [
    ['cash', 'Efectivo'],
    ['transfer', 'Transferencia'],
    ['card', 'Tarjeta']
  ];
  // Pago previo al servicio: nada, una seña o el total (queda $0 a cobrar).
  var NOMBRE_MEDIO = { cash: 'en efectivo', transfer: 'por transferencia', card: 'con tarjeta', mercado_pago: 'por Mercado Pago', other: '' };
  var PAGOS = [['no', 'Sin pago'], ['sena', 'Seña'], ['total', 'Pago total']];
  // Desde el remito de un chofer: lo que cobró en el lugar.
  var COBROS = [['no', 'No cobró'], ['sena', 'Una parte'], ['total', 'Todo']];

  var st = null;          // estado del formulario abierto
  var cuenta = null;      // { company_id, name } de la cuenta Particulares
  var abrirPrestadora = null;

  function db() { return typeof _db !== 'undefined' ? _db : null; }
  function OS() { return global.OperatorServices && global.OperatorServices.S || {}; }
  function el(id) { return document.getElementById(id); }
  function num(v) { var n = Number(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0; }
  function digits(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pesos(v) { return '$ ' + Math.round(num(v)).toLocaleString('es-AR'); }
  function notify(msg, type) { if (global.toast) global.toast(msg, type || 'info'); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function localNow() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function localDe(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d)) return localNow();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function newToken() { return (global.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random(); }

  /* La cuenta interna nunca es una prestadora elegible. */
  function esCuentaParticular(c) {
    if (!c) return false;
    if (c.client_kind === 'particular') return true;
    if (cuenta && String(c.company_id) === String(cuenta.company_id)) return true;
    return /^particulares$/i.test(String(c.trade_name || c.name || c.legal_name || '').trim());
  }

  function ocultarCuentaEnPrestadoras() {
    var S = OS();
    if (Array.isArray(S.companies)) S.companies = S.companies.filter(function (c) { return !esCuentaParticular(c); });
  }

  async function cargarCuenta() {
    if (cuenta) return cuenta;
    var d = db();
    if (!d) return null;
    var r = await d.rpc('get_private_account_v1');
    if (r.error) {
      if (r.error.code === 'PGRST202' || /Could not find the function/i.test(r.error.message || '')) {
        throw new Error('La cuenta Particulares todavía no está habilitada en la base.');
      }
      throw r.error;
    }
    if (!r.data || !r.data.company_id) throw new Error('Falta configurar la cuenta Particulares.');
    cuenta = r.data;
    return cuenta;
  }

  /* ── Selector Particular | Prestadora ─────────────────────────────────── */

  function modal(id) {
    var m = el(id);
    if (m) return m;
    m = document.createElement('div');
    m.id = id;
    m.className = 'psv-backdrop';
    m.hidden = true;
    document.body.appendChild(m);
    return m;
  }

  function cerrar(id) { var m = el(id); if (m) { m.hidden = true; m.innerHTML = ''; } document.body.classList.remove('psv-open'); }

  function elegirTipo(intakeId) {
    intakeElegido = intakeId || null;
    var m = modal('psv-tipo');
    m.innerHTML =
      '<div class="psv-dialog psv-choose" role="dialog" aria-modal="true" aria-labelledby="psv-tipo-t">' +
        '<header><div><h2 id="psv-tipo-t">' + (intakeElegido ? 'Crear servicio desde el remito' : 'Nuevo servicio') + '</h2><p>¿Para quién es el servicio?</p></div>' +
          '<button type="button" class="psv-x" data-psv="cerrar-tipo" aria-label="Cerrar">×</button></header>' +
        '<div class="psv-choices">' +
          '<button type="button" class="psv-choice" data-psv="particular">' +
            '<span class="psv-choice-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4.5 20c.8-3.8 3.9-6 7.5-6s6.7 2.2 7.5 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>' +
            '<b>Particular</b><small>Cliente de una sola vez. Precio presupuestado; puede dejar seña o pagar en el lugar.</small></button>' +
          '<button type="button" class="psv-choice" data-psv="prestadora">' +
            '<span class="psv-choice-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20V7l8-4 8 4v13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 20v-5h6v5M8 10h2M14 10h2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>' +
            '<b>Prestadora</b><small>Servicio derivado por una prestadora, con su tarifa y su N° de prestación.</small></button>' +
        '</div></div>';
    m.hidden = false;
    document.body.classList.add('psv-open');
    var primero = m.querySelector('.psv-choice');
    if (primero) primero.focus();
  }

  var intakeElegido = null;  // ingreso del chofer desde el que se crea el servicio

  function nuevoServicio(intake) {
    if (intake) {
      var id = typeof intake === 'string' ? intake : intake.intake_id;
      var info = ((OS().intakes) || []).find(function (x) { return String(x.intake_id) === String(id); });
      // Un activado (el chofer salió y no hubo servicio) sigue por el alta de prestadora.
      if (info && info.driver_activated) return abrirPrestadora(intake);
      // Si el chofer ya lo marcó como Particular, se abre directo ese formulario.
      if (info && info.client_kind === 'particular') return abrirParticular(id);
      return elegirTipo(id);
    }
    elegirTipo();
  }

  /* ── Formulario de Particular ─────────────────────────────────────────── */

  function estadoInicial() {
    return {
      busy: false, error: '', ctx: null,
      d: {
        customer_name: '', customer_phone: '', customer_document: '',
        vehicle_plate: '', vehicle_make_model: '',
        primary_concept_id: '', billing_base_id: '',
        cuando: 'ahora', scheduled_for: localNow(),
        origin: '', origin_lat: '', origin_lng: '', origin_place_id: '', origin_formatted_address: '',
        destination: '', destination_lat: '', destination_lng: '', destination_place_id: '', destination_formatted_address: '',
        route: null,
        presupuesto: '', pago: 'no', sena_monto: '', sena_medio: 'cash',
        factura: false, condicion: 'consumidor_final',
        assigned_truck_id: '', assigned_driver_id: '',
        captado: false, referred_by_driver_id: '',
        operator_notes: ''
      },
      addr: { origin: { seq: 0, list: [], token: '' }, destination: { seq: 0, list: [], token: '' } }
    };
  }

  async function abrirParticular(intakeId) {
    st = estadoInicial();
    st.busy = true;
    pintar();
    try {
      await cargarCuenta();
      var r = await db().rpc('get_operator_service_context_v1', { p_company_id: cuenta.company_id, p_scheduled_for: new Date().toISOString() });
      if (r.error) throw r.error;
      st.ctx = r.data || {};
      var bases = st.ctx.bases || [];
      if (bases.length) st.d.billing_base_id = bases[0].base_id;
      if (intakeId) {
        var ir = await db().rpc('get_driver_service_intake_context_v1', { p_intake_id: intakeId });
        if (ir.error) throw ir.error;
        if (!ir.data || ir.data.status !== 'pending_admin' || (ir.data.remito && ir.data.remito.status !== 'firmado')) {
          throw new Error('Este ingreso no tiene un remito firmado pendiente de clasificación.');
        }
        desdeIngreso(ir.data);
      }
    } catch (e) {
      st.error = e.message || 'No se pudo preparar el formulario.';
    }
    st.busy = false;
    pintar();
    var f = el('psv-customer_name');
    if (f) f.focus();
  }

  /* Editar un particular con este mismo formulario (no el de prestadora). */
  async function editarParticular(id) {
    st = estadoInicial();
    st.busy = true;
    st.edit = { id: id };
    pintar();
    try {
      await cargarCuenta();
      var er = await db().rpc('get_private_service_edit_v1', { p_service_id: id });
      if (er.error) throw er.error;
      var e = er.data || {};
      var r = await db().rpc('get_operator_service_context_v1', { p_company_id: cuenta.company_id, p_scheduled_for: e.scheduled_for || new Date().toISOString() });
      if (r.error) throw r.error;
      st.ctx = r.data || {};
      var d = st.d;
      ['customer_name', 'vehicle_plate', 'vehicle_make_model', 'origin', 'destination', 'operator_notes', 'primary_concept_id', 'billing_base_id', 'assigned_driver_id'].forEach(function (k) { if (e[k] != null) d[k] = String(e[k]); });
      ['origin', 'destination'].forEach(function (k) {
        ['_lat', '_lng', '_place_id', '_formatted_address'].forEach(function (x) { if (e[k + x] != null) d[k + x] = String(e[k + x]); });
      });
      d.customer_phone = digits(e.customer_phone);
      d.customer_document = digits(e.customer_document);
      d.assigned_truck_id = e.assigned_truck_id != null ? String(e.assigned_truck_id) : '';
      d.cuando = 'programar';
      d.scheduled_for = localDe(e.scheduled_for);
      d.presupuesto = String(Math.round(num(e.quoted_total)));
      d.factura = !!e.invoice_requested;
      d.condicion = e.customer_tax_condition || 'consumidor_final';
      d.captado = !!e.referred_by_driver_id;
      d.referred_by_driver_id = e.referred_by_driver_id || '';
      st.edit = { id: id, numero: e.service_order_number || e.service_number, pagado: num(e.paid), firmado: !!e.remito_signed, cerrado: e.status === 'completed' };
    } catch (err) {
      st.error = err.message || 'No se pudo abrir el servicio.';
    }
    st.busy = false;
    pintar();
  }

  /* El remito del chofer ya trae cliente, vehículo, direcciones, chofer y móvil. */
  function desdeIngreso(ctx) {
    var s = ctx.service || {}, d = st.d;
    var info = ((OS().intakes) || []).find(function (x) { return String(x.intake_id) === String(ctx.intake_id); }) || {};
    st.intake = {
      id: ctx.intake_id, numero: (ctx.remito && ctx.remito.nro_remito) || ctx.intake_number,
      chofer: info.driver_name || 'Chofer', movil: info.truck_label || '', scheduled_for: s.scheduled_for || null
    };
    ['customer_name', 'vehicle_plate', 'vehicle_make_model', 'origin', 'destination', 'operator_notes'].forEach(function (k) { if (s[k]) d[k] = String(s[k]); });
    d.customer_phone = digits(s.customer_phone);
    d.customer_document = digits(s.customer_document);
    ['origin', 'destination'].forEach(function (k) {
      ['_lat', '_lng', '_place_id', '_formatted_address'].forEach(function (x) { if (s[k + x] != null) d[k + x] = String(s[k + x]); });
    });
    d.assigned_driver_id = s.assigned_driver_id || '';
    d.assigned_truck_id = s.assigned_truck_id != null ? String(s.assigned_truck_id) : '';
    // Si no había servicio asignado, en general lo consiguió el chofer.
    d.captado = !!s.assigned_driver_id;
    d.referred_by_driver_id = s.assigned_driver_id || '';
    // El chofer lo marcó como Particular: monto acordado y lo que cobró.
    if (ctx.client_kind === 'particular') {
      var c = ctx.private_collection || {}, lineas = (c.lines || []).filter(function (l) { return num(l.amount) > 0; });
      var cobrado = lineas.reduce(function (t, l) { return t + num(l.amount); }, 0);
      if (num(ctx.agreed_amount) > 0) d.presupuesto = String(Math.round(num(ctx.agreed_amount)));
      d.pago = cobrado <= 0 ? 'no' : cobrado >= num(ctx.agreed_amount) ? 'total' : 'sena';
      d.sena_monto = cobrado > 0 ? String(Math.round(cobrado)) : '';
      if (lineas[0]) d.sena_medio = lineas[0].method;
      st.intake.particular = true;
      st.intake.lineas = lineas;
      st.intake.cobrado = cobrado;
      st.intake.informe = lineas.length
        ? 'El chofer informó que cobró ' + lineas.map(function (l) { return pesos(l.amount) + ' ' + (NOMBRE_MEDIO[l.method] || l.method); }).join(' + ') + '.'
        : c.not_collected ? 'El chofer no cobró' + (c.reason ? ': ' + c.reason : '.') : '';
    }
  }

  function servicios() {
    return ((st.ctx && st.ctx.services) || []).filter(function (s) { return s.available !== false && ['primary', 'mixed'].indexOf(s.category) >= 0; });
  }
  function servicioElegido() {
    return servicios().find(function (s) { return String(s.concept_id) === String(st.d.primary_concept_id); }) || null;
  }
  function unaDireccion() { var s = servicioElegido(); return !!(s && s.single_address); }

  function saldo() {
    return Math.max(num(st.d.presupuesto) - pagado(), 0);
  }
  function pagado() {
    var d = st.d;
    if (d.pago === 'total') return num(d.presupuesto);
    return d.pago === 'sena' ? num(d.sena_monto) : 0;
  }
  function deposito() {
    var d = st.d, monto = pagado();
    return d.pago !== 'no' && monto > 0 ? { amount: monto, method: d.sena_medio } : null;
  }

  function errores() {
    var d = st.d, e = [];
    if (!d.customer_name.trim()) e.push('Completá el nombre del cliente.');
    if (digits(d.customer_phone).length < 8) e.push('Completá el teléfono del cliente.');
    if (!d.primary_concept_id) e.push('Elegí el tipo de servicio.');
    if (!d.origin.trim()) e.push('Completá el origen.');
    if (!unaDireccion() && !d.destination.trim()) e.push('Completá el destino.');
    if (d.cuando === 'programar' && !d.scheduled_for) e.push('Elegí fecha y hora.');
    if (num(d.presupuesto) <= 0) e.push('Completá el presupuesto.');
    if (st.edit && num(d.presupuesto) > 0 && num(d.presupuesto) < st.edit.pagado) e.push('El presupuesto no puede ser menor a lo ya cobrado (' + pesos(st.edit.pagado) + ').');
    if (!st.edit && d.pago === 'sena' && num(d.sena_monto) <= 0) e.push(st.intake ? 'Completá cuánto cobró el chofer.' : 'Completá el monto de la seña.');
    if (!st.edit && d.pago === 'sena' && num(d.sena_monto) >= num(d.presupuesto) && num(d.presupuesto) > 0) e.push(st.intake ? 'Lo cobrado tiene que ser menor al presupuesto. Si cobró todo, elegí Todo.' : 'La seña tiene que ser menor al presupuesto. Si pagó todo, elegí Pago total.');
    var doc = digits(d.customer_document);
    if (doc && doc.length !== 8 && doc.length !== 11) e.push('El DNI tiene 8 dígitos y el CUIT 11.');
    else if (d.factura && !doc) e.push('Para facturar completá el DNI o CUIT.');
    if (d.assigned_driver_id && !d.assigned_truck_id) e.push('Si asignás chofer, elegí también el móvil.');
    if (d.captado && !d.referred_by_driver_id) e.push('Elegí el chofer que consiguió el servicio.');
    // Crear y finalizar: un particular no se finaliza sin el cobro del total.
    if (st.intake && num(d.presupuesto) > 0 && d.pago !== 'total') e.push('Para crear y finalizar, el cobro tiene que cubrir el presupuesto. Marcá Todo si ya se cobró el total.');
    return e;
  }

  function opciones(lista, sel, vacio) {
    return (vacio ? '<option value="">' + esc(vacio) + '</option>' : '') + lista.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(sel) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('');
  }

  function campo(id, label, html, extra) {
    return '<label class="psv-field' + (extra ? ' ' + extra : '') + '" for="psv-' + id + '"><span>' + label + '</span>' + html + '</label>';
  }
  function grupo(label, html) {
    return '<div class="psv-field"><span>' + label + '</span>' + html + '</div>';
  }
  function seg(k, lista, sel) {
    return '<div class="psv-seg psv-seg-wide" role="group">' + lista.map(function (o) {
      return '<button type="button" data-psv-seg="' + k + '" data-v="' + o[0] + '" aria-pressed="' + (sel === o[0]) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }
  function input(id, value, attrs) {
    return '<input id="psv-' + id + '" data-psv-k="' + id + '" value="' + esc(value) + '" ' + (attrs || '') + '>';
  }

  function direccion(kind, label) {
    var d = st.d, ok = d[kind + '_place_id'];
    return '<div class="psv-field psv-addr"><span>' + label + '</span>' +
      '<input id="psv-' + kind + '" data-psv-addr="' + kind + '" value="' + esc(d[kind]) + '" autocomplete="off" placeholder="Calle y número, localidad">' +
      '<em class="psv-addr-state ' + (ok ? 'ok' : d[kind] ? 'warn' : '') + '">' + (ok ? 'Validada' : d[kind] ? 'Sin validar' : '') + '</em>' +
      '<div class="psv-sugs" id="psv-' + kind + '-sugs" hidden></div></div>';
  }

  function pintar() {
    var m = modal('psv-form');
    if (!st) { m.hidden = true; return; }
    m.hidden = false;
    document.body.classList.add('psv-open');
    if (st.busy && !st.ctx) {
      m.innerHTML = '<div class="psv-dialog psv-form"><div class="psv-loading">Preparando el formulario…</div></div>';
      return;
    }
    var d = st.d, ctx = st.ctx || {};
    var S = OS();
    var drivers = (S.drivers || []).filter(function (x) { return x.is_active !== false; })
      .map(function (x) { return [x.user_id, x.full_name || x.name || x.email]; });
    // El chofer del remito siempre aparece para elegirlo como el que consiguió el servicio.
    if (st.intake && d.assigned_driver_id && !drivers.some(function (x) { return String(x[0]) === String(d.assigned_driver_id); })) {
      drivers.unshift([d.assigned_driver_id, st.intake.chofer]);
    }
    var trucks = (S.trucks || []).filter(function (x) { return x.is_active !== false; })
      .map(function (x) { return [x.truck_id, [x.numero_interno, x.plate || x.patente].filter(Boolean).join(' · ') || x.truck_id]; });
    var bases = (ctx.bases || []).map(function (b) { return [b.base_id, b.name]; });
    var tipos = servicios().map(function (s) { return [s.concept_id, s.name]; });

    m.innerHTML =
      '<div class="psv-dialog psv-form" role="dialog" aria-modal="true" aria-labelledby="psv-form-t">' +
      '<header><div><h2 id="psv-form-t">' + (st.edit ? 'Editar servicio · Particular' : 'Nuevo servicio · Particular') + '</h2><p>' +
        (st.edit ? esc(st.edit.numero || '') + (st.edit.firmado ? ' · Con remito firmado: cliente, vehículo y asignación vienen del remito.' : '') :
         st.intake ? 'Desde el remito ' + esc(st.intake.numero || '') + ' de ' + esc(st.intake.chofer) + '. Al crearlo queda finalizado.' : 'Cliente de una sola vez con precio presupuestado.') + '</p></div>' +
        '<button type="button" class="psv-x" data-psv="cerrar-form" aria-label="Cerrar">×</button></header>' +
      '<div class="psv-body">' +
        (st.error ? '<div class="psv-error" role="alert">' + esc(st.error) + '</div>' : '') +

        '<div class="psv-cols"><div class="psv-col">' +
        '<section><h3>Cliente</h3><div class="psv-grid">' +
          campo('customer_name', 'Nombre y apellido *', input('customer_name', d.customer_name, 'autocomplete="name"')) +
          campo('customer_phone', 'Teléfono *', input('customer_phone', d.customer_phone, 'inputmode="tel" placeholder="11 2345 6789"')) +
          campo('customer_document', 'DNI / CUIT' + (d.factura ? ' *' : ''), input('customer_document', d.customer_document, 'inputmode="numeric" placeholder="8 u 11 dígitos"')) +
        '</div></section>' +

        '<section><h3>Vehículo</h3><div class="psv-grid">' +
          campo('vehicle_plate', 'Patente', input('vehicle_plate', d.vehicle_plate, 'autocapitalize="characters"')) +
          campo('vehicle_make_model', 'Marca y modelo', input('vehicle_make_model', d.vehicle_make_model)) +
        '</div></section>' +

        '<section><h3>Servicio</h3><div class="psv-grid">' +
          campo('primary_concept_id', 'Tipo de servicio *', '<select id="psv-primary_concept_id" data-psv-k="primary_concept_id">' + opciones(tipos, d.primary_concept_id, 'Elegí…') + '</select>') +
          (bases.length > 1 ? campo('billing_base_id', 'Base que lo atiende', '<select id="psv-billing_base_id" data-psv-k="billing_base_id">' + opciones(bases, d.billing_base_id) + '</select>') : '') +
          (st.edit ? campo('scheduled_for', 'Fecha y hora *', input('scheduled_for', d.scheduled_for, 'type="datetime-local"')) : st.intake ? '' :
          '<div class="psv-field"><span>Cuándo</span><div class="psv-seg" role="group" aria-label="Cuándo">' +
            '<button type="button" data-psv-cuando="ahora" aria-pressed="' + (d.cuando === 'ahora') + '">Ahora</button>' +
            '<button type="button" data-psv-cuando="programar" aria-pressed="' + (d.cuando === 'programar') + '">Programar</button></div></div>' +
          (d.cuando === 'programar' ? campo('scheduled_for', 'Fecha y hora *', input('scheduled_for', d.scheduled_for, 'type="datetime-local"')) : '')) +
        '</div>' +
        '<div class="psv-grid psv-grid-addr' + (unaDireccion() ? ' is-single' : '') + '">' + direccion('origin', unaDireccion() ? 'Dirección *' : 'Origen *') + (unaDireccion() ? '' : direccion('destination', 'Destino *')) + '</div>' +
        (d.route ? '<p class="psv-hint">Recorrido: ' + esc(d.route) + '</p>' : '') +
        '</section>' +
        '<section><h3>Observaciones</h3>' +
          '<textarea id="psv-operator_notes" data-psv-k="operator_notes" rows="2" placeholder="Indicaciones para el chofer">' + esc(d.operator_notes) + '</textarea>' +
        '</section>' +
        '</div><div class="psv-col">' +

        '<section><h3>Precio y cobro</h3><div class="psv-grid">' +
          campo('presupuesto', 'Presupuesto *', '<div class="psv-money"><i>$</i>' + input('presupuesto', d.presupuesto, 'inputmode="decimal" placeholder="0"') + '</div>') +
          (st.edit ? '' : grupo(st.intake ? '¿El chofer cobró en el lugar?' : '¿Pagó algo antes del servicio?', seg('pago', st.intake ? COBROS : PAGOS, d.pago))) +
        '</div>' +
        (st.edit ? '<div class="psv-total"><span>Pagado ' + pesos(st.edit.pagado) + ' · Saldo</span><b>' + pesos(Math.max(num(d.presupuesto) - st.edit.pagado, 0)) + '</b></div>' +
          '<p class="psv-hint">Los pagos se registran con "Registrar cobro".</p>' : '') +
        (!st.edit && d.pago !== 'no' ? '<div class="psv-grid">' +
          (d.pago === 'sena'
            ? campo('sena_monto', st.intake ? 'Cuánto cobró *' : 'Monto de la seña *', '<div class="psv-money"><i>$</i>' + input('sena_monto', d.sena_monto, 'inputmode="decimal" placeholder="0"') + '</div>')
            : campo('pago_total', st.intake ? 'Cobró' : 'Pagó', '<div class="psv-money"><i>$</i><input id="psv-pago_total" value="' + esc(Math.round(num(d.presupuesto)).toLocaleString('es-AR')) + '" readonly tabindex="-1"></div>')) +
          grupo('Medio de pago', seg('sena_medio', MEDIOS, d.sena_medio)) +
        '</div>' : '') +
        (st.intake && st.intake.informe ? '<p class="psv-hint psv-informe">' + esc(st.intake.informe) + '</p>' : '') +
        (st.edit ? '' : '<div class="psv-total"><span>' + (st.intake ? 'Queda pendiente de cobro' : 'A cobrar en el lugar') + '</span><b>' + pesos(saldo()) + '</b></div>') +
        '</section>' +

        '<section><h3>Factura</h3>' +
          '<label class="psv-check"><input type="checkbox" data-psv-k="factura"' + (d.factura ? ' checked' : '') + '> El cliente pide factura</label>' +
          (d.factura ? '<div class="psv-grid">' + campo('condicion', 'Condición frente al IVA *', '<select id="psv-condicion" data-psv-k="condicion">' + opciones(CONDICIONES, d.condicion) + '</select>') + '</div>' : '') +
        '</section>' +

        (st.intake
          ? '<section><h3>Lo hizo</h3><p class="psv-hecho"><b>' + esc(st.intake.chofer) + '</b>' + (st.intake.movil ? ' · ' + esc(st.intake.movil) : '') + '</p>'
          : '<section><h3>Asignación <small>(opcional)</small></h3><div class="psv-grid">' +
          campo('assigned_truck_id', 'Móvil', '<select id="psv-assigned_truck_id" data-psv-k="assigned_truck_id">' + opciones(trucks, d.assigned_truck_id, 'Sin asignar') + '</select>') +
          campo('assigned_driver_id', 'Chofer', '<select id="psv-assigned_driver_id" data-psv-k="assigned_driver_id">' + opciones(drivers, d.assigned_driver_id, 'El de la jornada del móvil') + '</select>') +
        '</div>') +
        '<div class="psv-grid psv-captado">' +
          '<label class="psv-check"><input type="checkbox" data-psv-k="captado"' + (d.captado ? ' checked' : '') + '> Lo consiguió un chofer</label>' +
          (d.captado ? campo('referred_by_driver_id', 'Chofer que lo consiguió *', '<select id="psv-referred_by_driver_id" data-psv-k="referred_by_driver_id">' + opciones(drivers, d.referred_by_driver_id, 'Elegí el chofer') + '</select>') : '') +
        '</div></section>' +

        '</div></div>' +
      '</div>' +
      '<footer><button type="button" class="psv-btn" data-psv="cerrar-form">Cancelar</button>' +
        '<button type="button" class="psv-btn primary" data-psv="guardar"' + (st.busy ? ' disabled' : '') + '>' +
        (st.busy ? 'Guardando…' : st.edit ? 'Guardar cambios' : st.intake ? 'Crear y finalizar' : 'Crear servicio') + '</button></footer>' +
      '</div>';
    // Con remito firmado, cliente, vehículo y asignación vienen del remito.
    if (st.edit && st.edit.firmado) {
      ['customer_name', 'customer_phone', 'vehicle_plate', 'vehicle_make_model', 'assigned_truck_id', 'assigned_driver_id'].forEach(function (k) {
        var f = el('psv-' + k); if (f) { f.disabled = true; f.title = 'Viene del remito firmado'; }
      });
    }
  }

  /* Repintar pierde el foco del campo que se está escribiendo; sólo se repinta
     cuando cambia la forma del formulario, no en cada tecla. */
  var ESTRUCTURALES = { primary_concept_id: 1, factura: 1, captado: 1 };

  function onInput(ev) {
    var t = ev.target;
    if (!st || !t) return;
    var k = t.getAttribute('data-psv-k');
    if (k) {
      if (k === 'customer_document' || k === 'customer_phone') {
        var limpio = digits(t.value).slice(0, k === 'customer_document' ? 11 : 13);
        if (limpio !== t.value) t.value = limpio;
      }
      st.d[k] = t.type === 'checkbox' ? t.checked : t.value;
      // Por defecto lo consiguió el chofer asignado.
      if (k === 'captado' && st.d.captado && !st.d.referred_by_driver_id) st.d.referred_by_driver_id = st.d.assigned_driver_id || '';
      if (ESTRUCTURALES[k] && ev.type === 'change') return pintar();
      if (k === 'presupuesto' || k === 'sena_monto') {
        var tot = document.querySelector('#psv-form .psv-total b');
        if (tot) tot.textContent = pesos(saldo());
        var pt = el('psv-pago_total');
        if (pt) pt.value = Math.round(num(st.d.presupuesto)).toLocaleString('es-AR');
      }
      if (k === 'primary_concept_id' && ev.type === 'change') calcularRuta();
      return;
    }
    var kind = t.getAttribute('data-psv-addr');
    if (kind && ev.type === 'input') escribirDireccion(kind, t.value);
  }

  /* ── Direcciones (maps-proxy, igual que el alta de prestadoras) ───────── */

  function escribirDireccion(kind, value) {
    var d = st.d, a = st.addr[kind];
    d[kind] = value;
    ['_lat', '_lng', '_place_id', '_formatted_address'].forEach(function (s) { d[kind + s] = ''; });
    d.route = null;
    a.seq++;
    var seq = a.seq;
    clearTimeout(a.timer);
    var q = value.trim();
    if (q.length < 3) return mostrarSugerencias(kind, null, '');
    a.timer = setTimeout(async function () {
      try {
        if (!a.token) a.token = newToken();
        mostrarSugerencias(kind, null, 'Buscando direcciones…');
        var r = await db().functions.invoke('maps-proxy', { body: { action: 'autocomplete', input: q, sessionToken: a.token, regionCode: 'AR',
          locationBias: sesgo(kind) } });
        if (seq !== a.seq) return;
        if (r.error) throw r.error;
        a.list = (r.data && r.data.suggestions || []).slice(0, 6);
        mostrarSugerencias(kind, a.list, a.list.length ? '' : 'Sin resultados. Probá con calle y altura.');
      } catch (e) {
        if (seq !== a.seq) return;
        console.error('[particulares] autocomplete ' + kind, e);
        mostrarSugerencias(kind, null, 'No se pudieron buscar direcciones: ' + (e.message || 'error'));
      }
    }, 400);
  }

  /* Sesgo de búsqueda: cerca del origen para el destino, cerca de la base
     elegida para el origen. Radio dentro del máximo que acepta Google (50 km). */
  function sesgo(kind) {
    var d = st.d;
    if (kind === 'destination' && d.origin_lat && d.origin_lng) {
      return { latitude: Number(d.origin_lat), longitude: Number(d.origin_lng), radius: 50000 };
    }
    var b = ((st.ctx && st.ctx.bases) || []).find(function (x) { return String(x.base_id) === String(d.billing_base_id); });
    if (b && isFinite(Number(b.latitude)) && isFinite(Number(b.longitude)) && b.latitude != null) {
      return { latitude: Number(b.latitude), longitude: Number(b.longitude), radius: 50000 };
    }
    return { latitude: -34.6037, longitude: -58.3816, radius: 50000 };
  }

  function mostrarSugerencias(kind, list, estado) {
    var box = el('psv-' + kind + '-sugs');
    if (!box) return;
    if (!list || !list.length) {
      box.hidden = !estado;
      box.innerHTML = estado ? '<div class="psv-sug-state">' + esc(estado) + '</div>' : '';
      return;
    }
    box.hidden = false;
    box.innerHTML = list.map(function (x, i) {
      return '<button type="button" data-psv-pick="' + kind + '" data-i="' + i + '"><b>' + esc(x.mainText || x.text) + '</b><span>' + esc(x.secondaryText || '') + '</span></button>';
    }).join('');
  }

  async function elegirDireccion(kind, i) {
    var a = st.addr[kind], s = a.list[i];
    if (!s) return;
    try {
      var r = await db().functions.invoke('maps-proxy', { body: { action: 'place', placeId: s.placeId, sessionToken: a.token || newToken() } });
      if (r.error) throw r.error;
      var p = r.data || {}, f = p.formattedAddress || s.text || s.mainText;
      Object.assign(st.d, (function () {
        var o = {};
        o[kind] = f; o[kind + '_formatted_address'] = f; o[kind + '_place_id'] = p.placeId || s.placeId;
        o[kind + '_lat'] = p.location ? p.location.latitude : ''; o[kind + '_lng'] = p.location ? p.location.longitude : '';
        return o;
      })());
      a.token = newToken();
      a.list = [];
      pintar();
      calcularRuta();
    } catch (e) { notify(e.message || 'No se pudo validar la dirección.', 'error'); }
  }

  async function calcularRuta() {
    var d = st.d;
    var dest = unaDireccion() ? { latitude: d.origin_lat, longitude: d.origin_lng } : { latitude: d.destination_lat, longitude: d.destination_lng };
    if (!d.origin_lat || !dest.latitude) return;
    try {
      var r = await db().functions.invoke('maps-proxy', { body: { action: 'route', routeMode: 'origin_destination',
        origin: { latitude: d.origin_lat, longitude: d.origin_lng }, destination: dest,
        departureTime: new Date(d.cuando === 'programar' ? d.scheduled_for : Date.now()).toISOString() } });
      if (r.error) throw r.error;
      var x = r.data || {}, km = Math.round((Number(x.distanceMeters) || 0) / 100) / 10;
      st.routeData = { route_distance_meters: Number(x.distanceMeters) || 0, route_duration_seconds: Number(x.durationSeconds) || 0,
        route_toll_estimate: Number(x.toll && x.toll.amount) || 0, route_toll_currency: (x.toll && x.toll.currencyCode) || '',
        route_provider: x.provider || 'google_routes', route_calculated_at: new Date().toISOString(), route_legs: x.legs || [],
        estimated_asphalt_km: km, estimated_gravel_km: 0, estimated_distance_km: km };
      d.route = km ? km.toLocaleString('es-AR') + ' km' : null;
      var h = document.querySelector('#psv-form .psv-hint');
      if (h) h.textContent = d.route ? 'Recorrido: ' + d.route : '';
      else if (d.route) pintar();
    } catch (e) { st.routeData = null; }
  }

  /* ── Guardar ──────────────────────────────────────────────────────────── */

  function payload() {
    var d = st.d, single = unaDireccion();
    var when = st.edit && d.scheduled_for ? new Date(d.scheduled_for)
      : st.intake && st.intake.scheduled_for ? new Date(st.intake.scheduled_for)
      : d.cuando === 'programar' && d.scheduled_for ? new Date(d.scheduled_for) : new Date();
    var p = {
      billing_base_id: d.billing_base_id || null,
      primary_concept_id: d.primary_concept_id, category_id: d.primary_concept_id,
      scheduled_for: when.toISOString(), priority: 'normal', service_order_number: '',
      items: [], item_codes: {},
      customer_name: d.customer_name.trim(), customer_phone: digits(d.customer_phone),
      customer_document: digits(d.customer_document) || null,
      invoice_requested: !!d.factura, customer_tax_condition: d.factura ? d.condicion : null,
      vehicle_plate: d.vehicle_plate.trim().toUpperCase(), vehicle_make_model: d.vehicle_make_model.trim(),
      origin: d.origin.trim(), origin_lat: d.origin_lat || null, origin_lng: d.origin_lng || null,
      origin_place_id: d.origin_place_id || null, origin_formatted_address: d.origin_formatted_address || null,
      destination: single ? d.origin.trim() : d.destination.trim(),
      destination_lat: (single ? d.origin_lat : d.destination_lat) || null,
      destination_lng: (single ? d.origin_lng : d.destination_lng) || null,
      destination_place_id: (single ? d.origin_place_id : d.destination_place_id) || null,
      destination_formatted_address: (single ? d.origin_formatted_address : d.destination_formatted_address) || null,
      assigned_truck_id: d.assigned_truck_id || null, assigned_driver_id: d.assigned_driver_id || null,
      referred_by_driver_id: d.captado ? d.referred_by_driver_id || null : null,
      operator_notes: d.operator_notes.trim(), logistics_type: 'own', is_holiday: false, granted_delay_minutes: 0
    };
    return Object.assign(p, st.routeData || { estimated_asphalt_km: 0, estimated_gravel_km: 0, estimated_distance_km: 0 });
  }

  /* Si el operador deja lo que informó el chofer, se guardan sus líneas tal cual
     (pueden ser dos medios); si lo cambia, vale lo del formulario. */
  function lineasCobro(intake, dep) {
    if (!dep) return [];
    if (intake && intake.lineas && intake.lineas.length && Math.abs(num(dep.amount) - num(intake.cobrado)) < 0.5 &&
        (intake.lineas.length > 1 || intake.lineas[0].method === dep.method)) {
      return intake.lineas.map(function (l) { return { method: l.method, amount: num(l.amount) }; });
    }
    return [{ method: dep.method, amount: dep.amount }];
  }

  async function guardar() {
    if (!st || st.busy) return;
    var e = errores();
    if (e.length) { st.error = e.join(' '); pintar(); return; }
    st.busy = true; st.error = '';
    pintar();
    try {
      var d = st.d;
      if (st.edit) {
        var eid = st.edit.id;
        var ru = await db().rpc('update_private_service_v1', {
          p_service_id: eid, p_payload: payload(), p_quoted_total: num(d.presupuesto),
          p_invoice: { invoice_requested: !!d.factura, customer_tax_condition: d.factura ? d.condicion : null, customer_document: digits(d.customer_document) || null },
          p_reason: null
        });
        if (ru.error) throw ru.error;
        cerrarForm(true);
        if (typeof global.operationFeedback === 'function') global.operationFeedback('Servicio actualizado', 'Los cambios quedaron guardados.', 'success', 2400);
        if (global.cargarServiciosOperador) await global.cargarServiciosOperador();
        return;
      }
      var intake = st.intake, dep = deposito();
      var r = intake
        ? await db().rpc('create_private_service_from_intake_v1', {
            p_intake_id: intake.id,
            p_payload: payload(),
            p_quoted_total: num(d.presupuesto),
            p_collection: { lines: lineasCobro(intake, dep) }
          })
        : await db().rpc('create_private_service_v1', {
            p_payload: payload(),
            p_quoted_total: num(d.presupuesto),
            p_deposit: dep
          });
      if (r.error) throw r.error;
      var res = r.data || {};
      cerrarForm(true);
      if (intake) {
        var nro = res.service_order_number || res.service_number;
        if (typeof global.operationFeedback === 'function') global.operationFeedback('Servicio creado y finalizado', 'Particular' + (nro ? ' N° ' + nro : '') + ' con el remito del chofer.', 'success', 2400);
        var S0 = OS(); S0.selectedIntakeId = null;
        if (global.cargarServiciosOperador) await global.cargarServiciosOperador();
        return;
      }
      // Igual que el alta de prestadoras: mismo aviso, y vuelve a la lista de Servicios activos.
      var numero = res.service_order_number || res.service_number;
      var detalle = 'Quedó cargado' + (numero ? ' con el N° ' + numero : '') + '.';
      if (typeof global.operationFeedback === 'function') global.operationFeedback('Servicio creado', detalle, 'success', 2400);
      else notify('Servicio creado', 'success');
      var S = OS();
      S.view = 'active'; S.status = 'all'; S.selectedIntakeId = null;
      if (typeof global.goTo === 'function') global.goTo('operaciones');
      if (global.cargarServiciosOperador) await global.cargarServiciosOperador();
    } catch (err) {
      st.busy = false;
      st.error = err.message || 'No se pudo crear el servicio.';
      pintar();
    }
  }

  function cerrarForm(force) {
    if (!force && st && (st.d.customer_name || st.d.presupuesto || st.d.origin)) {
      if (!global.confirm('¿Descartar el servicio particular sin guardar?')) return;
    }
    st = null;
    cerrar('psv-form');
  }

  /* ── Eventos ──────────────────────────────────────────────────────────── */

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-psv],[data-psv-cuando],[data-psv-pick],[data-psv-seg]');
    if (!b) {
      if (ev.target.classList && ev.target.classList.contains('psv-backdrop')) {
        if (ev.target.id === 'psv-tipo') cerrar('psv-tipo');
      }
      return;
    }
    var a = b.getAttribute('data-psv');
    if (a === 'cerrar-tipo') return cerrar('psv-tipo');
    if (a === 'prestadora') { cerrar('psv-tipo'); ocultarCuentaEnPrestadoras(); return intakeElegido ? abrirPrestadora(intakeElegido) : abrirPrestadora(); }
    if (a === 'particular') { cerrar('psv-tipo'); return abrirParticular(intakeElegido); }
    if (a === 'cerrar-form') return cerrarForm(false);
    if (a === 'guardar') return guardar();
    if (b.hasAttribute('data-psv-seg')) { st.d[b.getAttribute('data-psv-seg')] = b.getAttribute('data-v'); return pintar(); }
    if (b.hasAttribute('data-psv-cuando')) { st.d.cuando = b.getAttribute('data-psv-cuando'); return pintar(); }
    if (b.hasAttribute('data-psv-pick')) return elegirDireccion(b.getAttribute('data-psv-pick'), Number(b.getAttribute('data-i')));
  });
  document.addEventListener('input', function (ev) { if (ev.target.closest && ev.target.closest('#psv-form')) onInput(ev); });
  document.addEventListener('change', function (ev) { if (ev.target.closest && ev.target.closest('#psv-form')) onInput(ev); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    var t = el('psv-tipo');
    if (t && !t.hidden) return cerrar('psv-tipo');
    var f = el('psv-form');
    if (f && !f.hidden) cerrarForm(false);
  });

  /* ── Enganche con "Nuevo servicio" ───────────────────────────────────── */

  function enganchar() {
    if (typeof global.abrirNuevoServicio !== 'function' || global.abrirNuevoServicio.__psv) return !!(global.abrirNuevoServicio && global.abrirNuevoServicio.__psv);
    abrirPrestadora = global.abrirNuevoServicio;
    nuevoServicio.__psv = true;
    global.abrirNuevoServicio = nuevoServicio;
    // Editar un particular abre este formulario, no el de prestadora.
    if (typeof global.editarServicioOperador === 'function' && !global.editarServicioOperador.__psv) {
      var editarOriginal = global.editarServicioOperador;
      var ed = function (id) {
        var S0 = OS(), sv = (S0.services || []).find(function (x) { return String(x.service_id) === String(id); });
        if (sv && esCuentaParticular({ company_id: sv.company_id, trade_name: sv.company_name, client_kind: sv.client_kind })) return editarParticular(id);
        return editarOriginal.apply(this, arguments);
      };
      ed.__psv = true;
      global.editarServicioOperador = ed;
    }
    // "Crear servicio con estos datos" (ingreso del chofer) abre el asistente directo.
    var O = global.OperatorServices;
    if (O && typeof O.openWizard === 'function' && !O.openWizard.__psv) {
      var w = function (intake) { return intake ? nuevoServicio(intake) : abrirPrestadora(); };
      w.__psv = true;
      O.openWizard = w;
    }
    cargarCuenta().then(ocultarCuentaEnPrestadoras).catch(function () {});
    return true;
  }
  if (!enganchar()) {
    var intentos = 0, t = setInterval(function () { if (enganchar() || ++intentos > 40) clearInterval(t); }, 250);
  }

  global.AuxiliosParticulares = {
    abrir: abrirParticular,
    editar: editarParticular,
    elegirTipo: elegirTipo,
    esCuentaParticular: esCuentaParticular,
    _test: { estadoInicial: estadoInicial, desdeIngreso: function (s, ctx) { var prev = st; st = s; try { desdeIngreso(ctx); return st; } finally { st = prev; } }, errores: function (s) { var prev = st; st = s; try { return errores(); } finally { st = prev; } },
             saldo: function (s) { var prev = st; st = s; try { return saldo(); } finally { st = prev; } },
             lineasCobro: lineasCobro,
             payload: function (s) { var prev = st; st = s; try { return payload(); } finally { st = prev; } },
             deposito: function (s) { var prev = st; st = s; try { return deposito(); } finally { st = prev; } } }
  };
})(window);

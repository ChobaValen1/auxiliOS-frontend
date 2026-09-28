/* AuxiliOS · Cobro de un servicio particular desde Operaciones (v1)

   Si el cliente dejó una seña (o el chofer no cobró todo), el operador completa
   el pago desde el menú ⋯ del servicio: "Registrar cobro". Muestra
   Presupuesto · Pagado · Saldo, los pagos hechos, y registra el nuevo con
   register_service_payment_v1. */
(function (global) {
  'use strict';

  var MEDIOS = [['cash', 'Efectivo'], ['transfer', 'Transferencia'], ['card', 'Tarjeta']];
  var NOMBRE = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', mercado_pago: 'Mercado Pago', other: 'Otro' };
  var st = null;

  function db() { return typeof _db !== 'undefined' ? _db : null; }
  function OS() { return (global.OperatorServices && global.OperatorServices.S) || {}; }
  function num(v) { var n = Number(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0; }
  function money(v) { return '$ ' + Math.round(num(v)).toLocaleString('es-AR'); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fecha(v) {
    if (!v) return '';
    var d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  function servicio(id) { return (OS().services || []).find(function (s) { return String(s.service_id) === String(id); }) || null; }
  function esParticular(s) {
    if (!s) return false;
    if (s.quoted_total != null || s.client_kind === 'particular') return true;
    var P = global.AuxiliosParticulares;
    return !!(P && P.esCuentaParticular && P.esCuentaParticular({ company_id: s.company_id, trade_name: s.company_name, client_kind: s.client_kind }));
  }

  function errores() {
    if (!st || !st.info) return [];
    var e = [];
    if (num(st.monto) <= 0) e.push('Completá el monto.');
    else if (num(st.monto) > num(st.info.balance) + 0.5) e.push('El monto supera el saldo (' + money(st.info.balance) + ').');
    if (!st.medio) e.push('Elegí el medio de pago.');
    return e;
  }

  function modal() {
    var m = document.getElementById('ppv-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'ppv-modal';
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
    var i = st.info, s = st.servicio || {};
    var titulo = 'Cobro del servicio' + (s.service_order_number || s.service_number ? ' · ' + esc(s.service_order_number || s.service_number) : '');
    if (!i) {
      m.innerHTML = '<div class="psv-dialog ppv-dialog"><div class="psv-loading">' + (st.error ? esc(st.error) : 'Cargando cobros…') + '</div></div>';
      return;
    }
    var pagos = (i.payments || []).filter(function (p) { return !p.voided_at; });
    var saldo = num(i.balance);
    m.innerHTML =
      '<div class="psv-dialog ppv-dialog" role="dialog" aria-modal="true" aria-labelledby="ppv-t">' +
        '<header><div><h2 id="ppv-t">' + titulo + '</h2><p>' + esc(s.customer_name || 'Cliente particular') + '</p></div>' +
          '<button type="button" class="psv-x" data-ppv="cerrar" aria-label="Cerrar">×</button></header>' +
        '<div class="psv-body">' +
          (st.error ? '<div class="psv-error" role="alert">' + esc(st.error) + '</div>' : '') +
          '<div class="ppv-resumen">' +
            '<div><span>Presupuesto</span><b>' + money(i.quoted_total) + '</b></div>' +
            '<div><span>Pagado</span><b>' + money(i.paid) + '</b></div>' +
            '<div class="ppv-saldo"><span>Saldo</span><b>' + money(saldo) + '</b></div>' +
          '</div>' +
          (pagos.length
            ? '<ul class="ppv-pagos">' + pagos.map(function (p) {
                return '<li><span>' + (p.kind === 'sena' ? 'Seña' : 'Pago') + ' · ' + esc(NOMBRE[p.method] || p.method) +
                  '<small>' + esc(fecha(p.paid_at)) + (p.received_by ? ' · ' + esc(p.received_by) : '') + '</small></span><b>' + money(p.amount) + '</b></li>';
              }).join('') + '</ul>'
            : '<p class="psv-hint">Todavía no hay pagos registrados.</p>') +
          (saldo <= 0
            ? '<p class="ppv-ok">El servicio está pago.</p>'
            : '<section class="ppv-form"><h3>Registrar pago</h3>' +
                '<div class="psv-grid">' +
                  '<label class="psv-field" for="ppv-monto"><span>Monto *</span><div class="psv-money"><i>$</i><input id="ppv-monto" data-ppv-k="monto" inputmode="decimal" value="' + esc(st.monto) + '"></div></label>' +
                  '<div class="psv-field"><span>Medio de pago *</span><div class="psv-seg psv-seg-wide" role="group">' + MEDIOS.map(function (o) {
                    return '<button type="button" data-ppv-medio="' + o[0] + '" aria-pressed="' + (st.medio === o[0]) + '">' + o[1] + '</button>';
                  }).join('') + '</div></div>' +
                '</div>' +
                (num(st.monto) !== saldo ? '<button type="button" class="pcv-link ppv-todo" data-ppv="todo">Cobrar todo el saldo (' + money(saldo) + ')</button>' : '') +
                '<label class="psv-field ppv-nota" for="ppv-nota"><span>Nota</span><input id="ppv-nota" data-ppv-k="nota" value="' + esc(st.nota) + '" placeholder="Opcional"></label>' +
              '</section>') +
        '</div>' +
        '<footer><button type="button" class="psv-btn" data-ppv="cerrar">' + (saldo <= 0 ? 'Cerrar' : 'Cancelar') + '</button>' +
          (saldo > 0 ? '<button type="button" class="psv-btn primary" data-ppv="guardar"' + (st.busy ? ' disabled' : '') + '>' + (st.busy ? 'Guardando…' : 'Registrar pago') + '</button>' : '') +
        '</footer>' +
      '</div>';
  }

  async function cargar() {
    var r = await db().rpc('get_service_payments_v1', { p_service_id: st.id });
    if (r.error) throw r.error;
    st.info = r.data || {};
    if (!st.info.particular) throw new Error('Este servicio no es particular.');
    st.monto = String(Math.round(num(st.info.balance)));
  }

  async function abrir(id) {
    st = { id: id, servicio: servicio(id), info: null, monto: '', medio: 'cash', nota: '', busy: false, error: '' };
    pintar();
    try { await cargar(); } catch (e) { st.error = e.message || 'No se pudieron cargar los cobros.'; }
    pintar();
  }

  function cerrar() {
    st = null;
    var m = document.getElementById('ppv-modal');
    if (m) { m.hidden = true; m.innerHTML = ''; }
    document.body.classList.remove('psv-open');
  }

  async function guardar() {
    if (!st || st.busy) return;
    var e = errores();
    if (e.length) { st.error = e.join(' '); return pintar(); }
    st.busy = true; st.error = '';
    pintar();
    try {
      var monto = num(st.monto);
      var r = await db().rpc('register_service_payment_v1', {
        p_service_id: st.id, p_kind: 'saldo', p_amount: monto, p_method: st.medio, p_note: st.nota.trim() || null
      });
      if (r.error) throw r.error;
      var saldo = num((r.data || {}).balance);
      cerrar();
      if (typeof global.operationFeedback === 'function') {
        global.operationFeedback('Pago registrado', money(monto) + (saldo > 0 ? ' · Queda ' + money(saldo) + ' de saldo.' : ' · El servicio quedó pago.'), 'success', 2400);
      }
    } catch (err) {
      st.busy = false;
      st.error = err.message || 'No se pudo registrar el pago.';
      pintar();
    }
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-ppv],[data-ppv-medio]');
    if (!b) {
      if (ev.target.id === 'ppv-modal') cerrar();
      return;
    }
    if (!b.closest('#ppv-modal') && !b.hasAttribute('data-ppv-abrir')) return;
    var a = b.getAttribute('data-ppv');
    if (a === 'cerrar') return cerrar();
    if (a === 'guardar') return guardar();
    if (a === 'todo') { st.monto = String(Math.round(num(st.info.balance))); return pintar(); }
    if (b.hasAttribute('data-ppv-medio')) { st.medio = b.getAttribute('data-ppv-medio'); return pintar(); }
  });
  document.addEventListener('input', function (ev) {
    var k = ev.target.getAttribute && ev.target.getAttribute('data-ppv-k');
    if (!k || !st) return;
    st[k] = ev.target.value;
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && st) cerrar();
  });

  /* Menú ⋯ del servicio: "Registrar cobro" en los particulares. */
  function enganchar() {
    if (typeof global.abrirMenuServicio !== 'function') return false;
    if (global.abrirMenuServicio.__ppv) return true;
    var original = global.abrirMenuServicio;
    var w = function (event, id) {
      var r = original.apply(this, arguments);
      var menu = document.getElementById('os-row-menu');
      if (menu && !menu.hidden && esParticular(servicio(id))) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = 'Registrar cobro';
        b.addEventListener('click', function (e) { e.stopPropagation(); menu.hidden = true; abrir(id); });
        var anular = menu.querySelector('.danger');
        menu.insertBefore(b, anular || null);
      }
      return r;
    };
    w.__ppv = true;
    global.abrirMenuServicio = w;
    return true;
  }
  if (!enganchar()) {
    var n = 0, t = setInterval(function () { if (enganchar() || ++n > 40) clearInterval(t); }, 250);
  }

  global.AuxiliosCobroOperador = {
    abrir: abrir,
    _test: {
      set: function (s) { st = s; },
      errores: errores,
      esParticular: esParticular
    }
  };
})(window);

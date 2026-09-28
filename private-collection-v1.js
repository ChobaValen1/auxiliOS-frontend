/* AuxiliOS · Cobro del servicio particular en el remito del chofer (v1)

   En un servicio particular el cliente paga todo el servicio. El paso 2 del
   remito ("Peajes y excedentes") cambia:
   · Arriba, el cobro: Presupuesto · Seña · A cobrar, y cómo pagó el cliente el
     saldo (uno o dos medios), o "No cobré" con motivo. El servicio se puede
     cerrar igual: el saldo queda pendiente para Administración.
   · Peajes se ocultan: en un particular están dentro del presupuesto.
   · Excedentes pasa a ser "Adicionales fuera del presupuesto", con su revisión
     de siempre.

   El cobro viaja en el remito (customer_collections, kind 'private_service'),
   así que funciona con la misma cola offline. Lo guarda
   save_driver_operator_service_remito_v5. */
(function (global) {
  'use strict';

  var MEDIOS = [['cash', 'Efectivo'], ['transfer', 'Transferencia'], ['card', 'Tarjeta']];
  var origCollect = null;

  // Remito sin servicio asignado: el chofer elige Prestadora | Particular en el paso 1.
  var adhoc = { particular: false, monto: '' };
  var st = { serviceId: null, info: null, modo: 'cobrado', dividir: false, l1: { method: '', amount: '' }, l2: { method: '', amount: '' }, motivo: '' };
  var cache = Object.create(null);

  function $(s) { return document.querySelector(s); }
  function db() { return typeof _db !== 'undefined' ? _db : null; }
  function num(v) { var n = Number(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0; }
  function money(v) { return '$ ' + Math.round(num(v)).toLocaleString('es-AR'); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function servicioActivo() {
    try { return typeof global.obtenerServicioActivoRemito === 'function' ? global.obtenerServicioActivoRemito() : null; }
    catch (e) { return null; }
  }
  function activo() { return !!(st.info && st.info.particular); }
  function saldo() { return st.info ? num(st.info.balance) : 0; }

  /* Adicionales fuera del presupuesto que el cliente pagó en el lugar: se suman
     a lo que hay que cobrarle. Cada adicional lleva su propio medio de pago. */
  function adicionales() {
    try {
      var b = origCollect ? origCollect.call(global.AuxiliosRemitoAddonsV2) : null;
      return ((b && b.payload && b.payload.excesses) || []);
    } catch (e) { return []; }
  }
  function totalAdicionales(lista) {
    return (lista || adicionales()).filter(function (l) { return l.customer_payment_method !== 'not_collected'; })
      .reduce(function (s, l) { return s + num(l.unit_amount) * (num(l.quantity) || 1); }, 0);
  }

  function lineas() {
    if (!activo() || st.modo !== 'cobrado') return [];
    if (!st.dividir) return st.l1.method ? [{ method: st.l1.method, amount: saldo() }] : [];
    return [st.l1, st.l2].filter(function (l) { return l.method && num(l.amount) > 0; })
      .map(function (l) { return { method: l.method, amount: num(l.amount) }; });
  }

  function errores() {
    if (adhoc.particular && enAdHoc() && num(adhoc.monto) <= 0) return ['Completá el monto acordado con el cliente (paso 1).'];
    if (!activo()) return [];
    var e = [];
    if (saldo() <= 0) return e;
    if (st.modo === 'no_cobrado') {
      if (!st.motivo.trim()) e.push('Indicá por qué no cobraste el saldo.');
      return e;
    }
    if (!st.dividir) {
      if (!st.l1.method) e.push('Elegí cómo pagó el cliente el saldo.');
      return e;
    }
    var ls = lineas(), total = ls.reduce(function (s, l) { return s + l.amount; }, 0);
    if (ls.length < 2) e.push('Completá los dos medios de pago con su monto.');
    else if (Math.abs(total - saldo()) > 0.5) e.push('Los dos pagos tienen que sumar ' + money(saldo()) + ' (suman ' + money(total) + ').');
    return e;
  }

  function payload() {
    if (!activo()) return null;
    return {
      kind: st.info.ad_hoc ? 'private_ad_hoc' : 'private_service',
      quoted_total: st.info.ad_hoc ? num(st.info.quoted_total) : undefined,
      lines: lineas(),
      not_collected: st.modo === 'no_cobrado',
      reason: st.modo === 'no_cobrado' ? st.motivo.trim() : null
    };
  }

  /* ── Pintado ──────────────────────────────────────────────────────────── */

  function chips(sel, cual) {
    return '<div class="pcv-chips" role="group">' + MEDIOS.map(function (m) {
      return '<button type="button" data-pcv-medio="' + cual + '" data-v="' + m[0] + '" aria-pressed="' + (sel === m[0]) + '">' + m[1] + '</button>';
    }).join('') + '</div>';
  }

  function pintar() {
    var step = $('.rem-addons-v2');
    if (!step) return;
    var card = $('#pcv-card');
    var tollCard = $('#rem-add-toll') && $('#rem-add-toll').closest('.rem-addons-card');
    var excessCard = $('#rem-add-excess') && $('#rem-add-excess').closest('.rem-addons-card');
    var head = $('#rem-addons-step-head h2');
    if (!activo()) {
      if (card) card.remove();
      if (tollCard) tollCard.hidden = false;
      if (excessCard) {
        excessCard.hidden = false;
        var t0 = excessCard.querySelector('.rem-addons-title'); if (t0 && t0.dataset.pcvOrig) t0.textContent = t0.dataset.pcvOrig;
        var h0 = excessCard.querySelector('.rem-addons-help'); if (h0 && h0.dataset.pcvOrig) h0.textContent = h0.dataset.pcvOrig;
        var b0 = $('#rem-add-excess'); if (b0 && b0.dataset.pcvOrig) b0.textContent = b0.dataset.pcvOrig;
        var s0 = excessCard.querySelector('.rem-addon-total span'); if (s0 && s0.dataset.pcvOrig) s0.textContent = s0.dataset.pcvOrig;
      }
      if (head && head.dataset.pcvOrig) head.textContent = head.dataset.pcvOrig;
      return;
    }
    if (tollCard) tollCard.hidden = true;
    if (excessCard) {
      var t = excessCard.querySelector('.rem-addons-title');
      if (t) { if (!t.dataset.pcvOrig) t.dataset.pcvOrig = t.textContent; t.textContent = 'Adicionales fuera del presupuesto'; }
      var h = excessCard.querySelector('.rem-addons-help');
      if (h) { if (!h.dataset.pcvOrig) h.dataset.pcvOrig = h.textContent; h.textContent = 'Lo que surgió en el lugar y no estaba en el presupuesto (espera, extracción…).'; }
      var bt = $('#rem-add-excess');
      if (bt) { if (!bt.dataset.pcvOrig) bt.dataset.pcvOrig = bt.textContent; bt.textContent = '+ Agregar adicional'; }
      var tt = excessCard.querySelector('.rem-addon-total span');
      if (tt) { if (!tt.dataset.pcvOrig) tt.dataset.pcvOrig = tt.textContent; tt.textContent = 'Total adicionales'; }
    }
    if (head) { if (!head.dataset.pcvOrig) head.dataset.pcvOrig = head.textContent; head.textContent = 'Cobro del servicio'; }

    if (!card) {
      card = document.createElement('section');
      card.id = 'pcv-card';
      card.className = 'rem-addons-card pcv-card';
      var ref = step.querySelector('.rem-addons-card');
      step.insertBefore(card, ref || null);
    }
    var i = st.info, pendiente = saldo(), extras = adicionales(), extra = totalAdicionales(extras);
    if (excessCard) excessCard.hidden = !extras.length;
    card.innerHTML =
      '<div class="rem-addons-head"><div><div class="rem-addons-title">Cliente particular' + (i.customer_name ? ' · ' + esc(i.customer_name) : '') + '</div>' +
        '<div class="rem-addons-help">' + (i.ad_hoc ? 'Cobrá el monto acordado. Los peajes están incluidos.' : 'Los peajes están incluidos en el presupuesto.') + '</div></div></div>' +
      '<div class="pcv-resumen">' +
        '<div><span>' + (i.ad_hoc ? 'Acordado' : 'Presupuesto') + '</span><b>' + money(i.quoted_total) + '</b></div>' +
        '<div><span>Saldo</span><b>' + money(pendiente) + '</b>' + (num(i.paid) > 0 ? '<small>Pagó ' + money(i.paid) + '</small>' : '') + '</div>' +
        '<div class="pcv-saldo"><span>A cobrar</span><b>' + money(pendiente + extra) + '</b>' + (extra > 0 ? '<small>+ ' + money(extra) + ' adicionales</small>' : '') + '</div>' +
      '</div>' +
      (pendiente <= 0 ? '<p class="pcv-ok">El presupuesto ya está pago.</p>' :
        st.modo === 'no_cobrado'
          ? '<label class="pcv-motivo"><span>¿Por qué no cobraste el saldo?</span><textarea data-pcv-motivo rows="2" placeholder="Ej.: paga por transferencia mañana">' + esc(st.motivo) + '</textarea></label>' +
            '<p class="pcv-help">Podés cerrar el servicio igual. El saldo queda pendiente para Administración.</p>' +
            '<div class="pcv-links"><button type="button" class="pcv-link" data-pcv-modo="cobrado">Sí, cobré el saldo</button></div>'
          : (st.dividir
              ? '<div class="pcv-linea"><span>Medio 1</span>' + chips(st.l1.method, 'l1') +
                  '<label class="pcv-monto">$<input data-pcv-monto="l1" inputmode="decimal" value="' + esc(st.l1.amount) + '" placeholder="0"></label></div>' +
                '<div class="pcv-linea"><span>Medio 2</span>' + chips(st.l2.method, 'l2') +
                  '<label class="pcv-monto">$<input data-pcv-monto="l2" inputmode="decimal" value="' + esc(st.l2.amount) + '" placeholder="0"></label></div>' +
                '<div class="pcv-links"><button type="button" class="pcv-link" data-pcv="un-medio">Pagó con un solo medio</button>' +
                  '<button type="button" class="pcv-link" data-pcv-modo="no_cobrado">No cobré</button></div>'
              : '<div class="pcv-linea"><span>Medio de pago del saldo</span>' + chips(st.l1.method, 'l1') + '</div>' +
                '<div class="pcv-links"><button type="button" class="pcv-link" data-pcv="dividir">Pagó con dos medios</button>' +
                  '<button type="button" class="pcv-link" data-pcv-modo="no_cobrado">No cobré</button></div>')) +
      '<div class="pcv-extra"><span>¿Tuvo que pagar algo más?</span>' +
        '<button type="button" class="pcv-extra-btn" data-pcv="adicional">+ Agregar adicional</button></div>';
  }

  /* ── Datos del servicio ───────────────────────────────────────────────── */

  function enAdHoc() {
    try { return !!(global.AuxiliosRemitoMobileV3 && global.AuxiliosRemitoMobileV3.isAdHocMode && global.AuxiliosRemitoMobileV3.isAdHocMode()); }
    catch (e) { return false; }
  }

  async function sync() {
    var id = servicioActivo();
    if (!id) {
      if (st.serviceId !== 'adhoc') st = { serviceId: 'adhoc', info: null, modo: 'cobrado', dividir: false, l1: { method: '', amount: '' }, l2: { method: '', amount: '' }, motivo: '' };
      var cli = document.getElementById('rem-cliente');
      st.info = enAdHoc() && adhoc.particular && num(adhoc.monto) > 0
        ? { particular: true, ad_hoc: true, quoted_total: num(adhoc.monto), paid: 0, balance: num(adhoc.monto), customer_name: cli ? cli.value.trim() : '' }
        : null;
      pintar();
      return;
    }
    if (id !== st.serviceId) {
      st = { serviceId: id, info: null, modo: 'cobrado', dividir: false, l1: { method: '', amount: '' }, l2: { method: '', amount: '' }, motivo: '' };
    }
    if (!cache[id] && db()) {
      try {
        var r = await db().rpc('get_driver_private_collection_v1', { p_service_id: id });
        if (!r.error) cache[id] = r.data || { particular: false };
      } catch (e) { /* sin conexión: el remito sigue como uno común */ }
    }
    if (st.serviceId !== id) return;
    st.info = cache[id] || null;
    pintar();
  }

  /* ── Enganche con el paso 2 del remito ────────────────────────────────── */

  function envolver() {
    var A = global.AuxiliosRemitoAddonsV2;
    if (!A || A.__pcv) return !!(A && A.__pcv);
    var validate = A.validate, collect = A.collect, reset = A.reset, restore = A.restore;
    origCollect = collect;
    A.validate = function () {
      var r = validate.apply(this, arguments) || { ok: true, errors: [] };
      var e = errores();
      if (!e.length) return r;
      var all = (r.errors || []).concat(e);
      var box = $('#rem-addons-errors');
      if (box) { box.innerHTML = all.map(esc).join('<br>'); box.classList.add('visible'); }
      return { ok: false, errors: all };
    };
    A.collect = function () {
      var b = collect.apply(this, arguments);
      var p = payload();
      if (p && b && b.payload) b.payload.customer_collections = p;
      return b;
    };
    A.reset = function () { var r = reset.apply(this, arguments); adhoc = { particular: false, monto: '' }; setTimeout(function () { pintarTipo(); sync(); }, 0); return r; };
    A.restore = function () { var r = restore.apply(this, arguments); Promise.resolve(r).then(function () { sync(); }); return r; };
    A.__pcv = true;
    return true;
  }

  document.addEventListener('click', function (ev) {
    var tipo = ev.target.closest && ev.target.closest('[data-pcv-tipo]');
    if (tipo) {
      adhoc.particular = tipo.getAttribute('data-pcv-tipo') === 'particular';
      pintarTipo();
      sync();
      var inp = adhoc.particular && document.querySelector('[data-pcv-acordado]');
      if (inp) inp.focus();
      return;
    }
    var b = ev.target.closest('[data-pcv],[data-pcv-modo],[data-pcv-medio]');
    if (!b || !b.closest('#pcv-card')) return;
    if (b.hasAttribute('data-pcv-modo')) st.modo = b.getAttribute('data-pcv-modo');
    else if (b.hasAttribute('data-pcv-medio')) st[b.getAttribute('data-pcv-medio')].method = b.getAttribute('data-v');
    else if (b.getAttribute('data-pcv') === 'dividir') { st.dividir = true; st.l1.amount = st.l1.amount || String(Math.round(saldo())); }
    else if (b.getAttribute('data-pcv') === 'un-medio') { st.dividir = false; }
    else if (b.getAttribute('data-pcv') === 'adicional') { var add = $('#rem-add-excess'); if (add) add.click(); return; }
    pintar();
  });
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.hasAttribute && t.hasAttribute('data-pcv-acordado')) { adhoc.monto = t.value; return; }
    if (!t.closest || !t.closest('#pcv-card')) return;
    if (t.hasAttribute('data-pcv-monto')) {
      var k = t.getAttribute('data-pcv-monto');
      st[k].amount = t.value;
      // El segundo medio completa lo que falta: el chofer carga uno solo.
      if (k === 'l1') {
        var resto = Math.max(saldo() - num(t.value), 0);
        st.l2.amount = String(Math.round(resto));
        var o = document.querySelector('[data-pcv-monto="l2"]'); if (o) o.value = st.l2.amount;
      }
    }
    if (t.hasAttribute('data-pcv-motivo')) st.motivo = t.value;
  });

  /* El paso 2 se muestra y se esconde con el avance del remito: cuando aparece
     se vuelve a consultar el servicio activo. */
  /* Paso 1 del remito sin asignación: ¿Prestadora o Particular? */
  function pintarTipo() {
    var card = document.querySelector('.rmv-ad-hoc-card');
    if (!card) return;
    var box = card.querySelector('#pcv-tipo');
    if (!box) {
      box = document.createElement('div');
      box.id = 'pcv-tipo';
      box.className = 'pcv-tipo';
      var head = card.querySelector('.rmv-step-head');
      if (head) head.after(box); else card.prepend(box);
    }
    var order = card.querySelector('[data-ad-hoc="order"]');
    var orderLabel = order && order.closest('label');
    if (orderLabel) orderLabel.hidden = adhoc.particular;
    box.innerHTML =
      '<span>¿Para quién es el servicio?</span>' +
      '<div class="pcv-modo" role="group" aria-label="Tipo de cliente">' +
        '<button type="button" data-pcv-tipo="prestadora" aria-pressed="' + !adhoc.particular + '">Prestadora</button>' +
        '<button type="button" data-pcv-tipo="particular" aria-pressed="' + adhoc.particular + '">Particular</button></div>' +
      (adhoc.particular
        ? '<label class="pcv-acordado"><span>Monto acordado con el cliente *</span><span class="pcv-monto">$<input data-pcv-acordado inputmode="decimal" value="' + esc(adhoc.monto) + '" placeholder="0"></span>' +
          '<small class="pcv-help">Lo cobrás en el paso de cobro. Operaciones lo confirma.</small></label>'
        : '');
  }

  function observar() {
    var addons = document.querySelector('.rem-addons-v2');
    var step = addons && addons.closest('.rem-step-panel');
    if (!step || step.dataset.pcvObs === '1') return !!step;
    step.dataset.pcvObs = '1';
    new MutationObserver(function () { if (step.offsetParent !== null) sync(); })
      .observe(step, { attributes: true, attributeFilter: ['class', 'style', 'hidden'], childList: true });
    // El paso de servicio del remito sin asignación se crea y se quita según el modo.
    var root = document.getElementById('remitos-nuevo');
    if (root) new MutationObserver(function () {
      var card = document.querySelector('.rmv-ad-hoc-card');
      if (card && !card.querySelector('#pcv-tipo')) pintarTipo();
    }).observe(root, { childList: true, subtree: true });
    // Al agregar o quitar un adicional cambia el total: se repinta "A cobrar".
    var tot = document.getElementById('rem-excess-summary');
    if (tot) new MutationObserver(function () { if (activo()) pintar(); }).observe(tot, { childList: true, subtree: true });
    return true;
  }

  function arrancar() {
    var listo = envolver() && observar();
    if (listo) sync();
    return listo;
  }
  if (!arrancar()) {
    var n = 0, t = setInterval(function () { if (arrancar() || ++n > 60) clearInterval(t); }, 500);
  }

  global.AuxiliosCobroParticular = {
    sync: sync,
    _test: {
      setAdHoc: function (a) { adhoc = Object.assign({ particular: false, monto: '' }, a); },
      set: function (s) { st = Object.assign({ serviceId: 'x', modo: 'cobrado', dividir: false, l1: { method: '', amount: '' }, l2: { method: '', amount: '' }, motivo: '' }, s); },
      errores: errores, payload: payload, totalAdicionales: totalAdicionales
    }
  };
})(window);

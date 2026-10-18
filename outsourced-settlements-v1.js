/* AuxiliOS · Tercerizados (paso 4): liquidación mensual, en la pestaña «Liquidaciones» de la ficha.
   · Mes: los servicios finalizados del mes con costo cargado (paso 3) que todavía no están en una
     liquidación. Se eligen y se arma el borrador (si ya hay uno del mes, se suman a ese).
   · Liquidación: Borrador → Aprobada → Pagada. En borrador se pueden sacar servicios o anularla;
     una aprobada puede volver a borrador. Mientras un servicio está liquidado su costo no cambia.
   La base vuelve a validar todo (get/create/remove/set_outsourced_settlement_*_v1). */
(function (global) {
  'use strict';
  var STATUS = { draft: { label: 'Borrador', cls: 'is-draft' }, approved: { label: 'Aprobada', cls: 'is-approved' }, paid: { label: 'Pagada', cls: 'is-paid' }, cancelled: { label: 'Anulada', cls: 'is-cancelled' } };
  var st = { el: null, provider: null, month: '', data: null, list: [], sel: {}, view: null, remove: {}, form: {}, busy: false, error: '', loading: false, seq: 0 };

  function db() { return typeof _db !== 'undefined' ? _db : null; }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ico(n) { return '<svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#' + n + '"/></svg>'; }
    function money(n) { return '$ ' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(Number(n) || 0); }
  function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()); }
  function monthOf(iso) { return String(iso || today()).slice(0, 7) + '-01'; }
  function shiftMonth(m, n) { var p = m.split('-').map(Number), y = p[0], mo = p[1] + n; while (mo > 12) { mo -= 12; y++; } while (mo < 1) { mo += 12; y--; } return y + '-' + String(mo).padStart(2, '0') + '-01'; }
  function monthName(m) { var p = String(m || '').split('-').map(Number); if (!p[0]) return ''; var s = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(p[0], p[1] - 1, 1))); return s.charAt(0).toUpperCase() + s.slice(1).replace(' de ', ' '); }
  function fmt(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1].slice(2) : '—'; }
  function pill(s) { var x = STATUS[s] || STATUS.draft; return '<span class="osl-pill ' + x.cls + '">' + x.label + '</span>'; }
  function ids(obj) { return Object.keys(obj).filter(function (k) { return obj[k]; }); }
  function err(e) { return (e && (e.message || e.details)) || 'No se pudo completar'; }

  /* ── Cálculos de pantalla (puros, testeables) ───────────────────────── */
  function selection(rows, sel) { var n = 0, total = 0; (rows || []).forEach(function (r) { if (sel[r.service_id]) { n++; total += Number(r.total_amount) || 0; } }); return { n: n, total: Math.round(total * 100) / 100 }; }
  function draftOf(data) { return (data && data.settlements || []).find(function (s) { return s.status === 'draft'; }) || null; }
  function canPay(form) { var d = String(form.paid_at || ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'Elegí la fecha de pago'; if (d > today()) return 'La fecha de pago no puede ser futura'; return ''; }

  /* ── Datos ──────────────────────────────────────────────────────────── */
  async function loadMonth() {
    var seq = ++st.seq; st.loading = true; st.error = ''; st.view = null; st.done = ''; render();
    var r = await Promise.all([db().rpc('get_outsourced_settlement_month_v1', { p_provider_id: st.provider.provider_id, p_month: st.month }), db().rpc('list_outsourced_settlements_v1', { p_provider_id: st.provider.provider_id })]);
    if (seq !== st.seq) return;
    st.loading = false;
    if (r[0].error) { st.error = err(r[0].error); st.data = null; return render(); }
    st.data = r[0].data || { available: [], pending: [], settlements: [] };
    st.list = Array.isArray(r[1].data) ? r[1].data : [];
    st.sel = {}; (st.data.available || []).forEach(function (x) { st.sel[x.service_id] = true; });
    render();
  }
  async function open(id) {
    var seq = ++st.seq; st.loading = true; st.error = ''; st.done = ''; render();
    var r = await db().rpc('get_outsourced_settlement_v1', { p_settlement_id: id });
    if (seq !== st.seq) return;
    st.loading = false;
    if (r.error) { st.error = err(r.error); return render(); }
    show(r.data);
  }
  function show(v) {
    st.view = v; st.remove = {}; st.error = '';
    st.form = { invoice_number: v.invoice_number || '', invoice_date: v.invoice_date || '', notes: v.notes || '', paid_at: v.paid_at || today(), payment_reference: v.payment_reference || '' };
    render();
  }
  async function run(fn, okMsg) {
    if (st.busy) return; st.busy = true; st.error = ''; render();
    var r = await fn(); st.busy = false;
    if (r.error) { st.error = err(r.error); render(); return null; }
    /* Sin aviso flotante: en el celular tapaba el botón del pie. El cambio se ve en los pasos y en el estado. */
    st.done = okMsg || '';
    return r.data;
  }
  async function createDraft() {
    var pick = ids(st.sel); if (!pick.length) return;
    var v = await run(function () { return db().rpc('create_outsourced_settlement_v1', { p_provider_id: st.provider.provider_id, p_month: st.month, p_service_ids: pick }); }, draftOf(st.data) ? 'Servicios sumados al borrador' : 'Borrador creado');
    if (v) show(v);
  }
  async function removeSel() {
    var pick = ids(st.remove); if (!pick.length) return;
    var v = await run(function () { return db().rpc('remove_outsourced_settlement_services_v1', { p_settlement_id: st.view.settlement_id, p_service_ids: pick }); }, pick.length === 1 ? 'Se sacó 1 servicio' : 'Se sacaron ' + pick.length + ' servicios');
    if (v) show(v);
  }
  var ASK = { cancel: '¿Anular el borrador? Los servicios vuelven a quedar para liquidar.', reopen: '¿Volver a borrador? Vas a poder sacar servicios y tendrás que aprobarla de nuevo.' };
  var DONE = { approve: 'Liquidación aprobada', reopen: 'Volvió a borrador', pay: 'Pago registrado', cancel: 'Borrador anulado' };
  async function act(a) {
    if (ASK[a] && !global.confirm(ASK[a])) return;
    var f = st.form, payload = a === 'approve' ? { invoice_number: f.invoice_number, invoice_date: f.invoice_date || null, notes: f.notes } : a === 'pay' ? { paid_at: f.paid_at, payment_reference: f.payment_reference } : {};
    if (a === 'pay') { var why = canPay(f); if (why) { st.error = why; return render(); } }
    var v = await run(function () { return db().rpc('set_outsourced_settlement_status_v1', { p_settlement_id: st.view.settlement_id, p_action: a, p_payload: payload }); }, DONE[a]);
    if (!v) return;
    if (a === 'cancel') return loadMonth();
    show(v);
  }

  /* ── Pantalla ───────────────────────────────────────────────────────── */
  function serviceRow(s, check) {
    var where = [s.origin, s.destination].filter(Boolean).join(' → ');
    return '<li class="osl-row' + (check && check.on ? ' is-on' : '') + '">'
      + (check ? '<label class="osl-check"><input type="checkbox" class="ax-check" ' + check.attr + '="' + esc(s.service_id) + '"' + (check.on ? ' checked' : '') + (check.disabled ? ' disabled' : '') + ' aria-label="Servicio ' + esc(s.service_order_number || '') + '"></label>' : '')
      + '<span class="osl-date">' + fmt(s.service_date) + '</span>'
      + '<span class="osl-main"><b>' + esc(s.service_order_number || 'Sin código') + '</b><small>' + esc([s.company_name, s.concept_name].filter(Boolean).join(' · ')) + '</small>' + (where ? '<small class="osl-where">' + esc(where) + '</small>' : '') + '</span>'
      + '<span class="osl-amt"><b>' + money(s.total_amount) + '</b>' + (Number(s.adjustment_amount) ? '<small title="' + esc(s.adjustment_reason || '') + '">Ajuste ' + money(s.adjustment_amount) + '</small>' : '') + '</span></li>';
  }
  function monthHtml() {
    var d = st.data, draft = draftOf(d), av = d.available || [], pend = d.pending || [], sum = selection(av, st.sel), all = av.length && sum.n === av.length;
    var others = (d.settlements || []).map(function (s) {
      return '<button type="button" class="osl-card" data-osl-open="' + esc(s.settlement_id) + '"><span>' + pill(s.status) + '<b>' + s.services_count + (s.services_count === 1 ? ' servicio' : ' servicios') + '</b></span><span class="osl-card-amt">' + money(s.total_amount) + ico('chevron-right') + '</span></button>';
    }).join('');
    var hist = st.list.filter(function (s) { return s.period_month !== st.month; }).slice(0, 6).map(function (s) {
      return '<button type="button" class="osl-hist" data-osl-open="' + esc(s.settlement_id) + '"><span>' + esc(monthName(s.period_month)) + '</span>' + pill(s.status) + '<b>' + money(s.total_amount) + '</b></button>';
    }).join('');
    return (others ? '<section class="osl-block"><h4>Liquidaciones de ' + esc(monthName(st.month)) + '</h4><div class="osl-cards">' + others + '</div></section>' : '')
      + '<section class="osl-block"><div class="osl-block-head"><h4>Para liquidar</h4>' + (av.length ? '<label class="osl-all"><input type="checkbox" class="ax-check" data-osl-all' + (all ? ' checked' : '') + '><span>Todos</span></label>' : '') + '</div>'
      + (av.length ? '<ul class="osl-list">' + av.map(function (s) { return serviceRow(s, { attr: 'data-osl-pick', on: !!st.sel[s.service_id] }); }).join('') + '</ul>'
        : '<p class="osl-empty">' + ico('check') + '<span>' + (others ? 'Todos los servicios finalizados de ' + esc(monthName(st.month)) + ' ya están en una liquidación.' : 'No hay servicios finalizados de ' + esc(st.provider.display_name) + ' en ' + esc(monthName(st.month)) + '.') + '</span></p>')
      + (pend.length ? '<p class="osl-note">' + ico('clock') + '<span><b>' + pend.length + (pend.length === 1 ? ' servicio' : ' servicios') + '</b> de este mes ' + (pend.length === 1 ? 'todavía no está finalizado' : 'todavía no están finalizados') + '. Se pueden liquidar cuando terminen.</span></p>' : '')
      + '</section>'
      + (hist ? '<section class="osl-block"><h4>Meses anteriores</h4><div class="osl-hists">' + hist + '</div></section>' : '')
      + '<div role="alert" class="osl-error">' + esc(st.error) + '</div>'
      + (av.length ? '<footer class="osp-foot osl-foot"><p class="osp-status" aria-live="polite">' + (sum.n ? '<b>' + sum.n + '</b> ' + (sum.n === 1 ? 'servicio' : 'servicios') + ' · <b>' + money(sum.total) + '</b>' : 'Elegí los servicios') + '</p><button type="button" class="ax-btn ax-btn-primary" data-osl-create' + (sum.n && !st.busy ? '' : ' disabled') + '>' + (st.busy ? 'Guardando…' : draft ? 'Sumar al borrador' : 'Crear borrador') + '</button></footer>' : '');
  }
  function steps(s) {
    var order = ['draft', 'approved', 'paid'], k = order.indexOf(s);
    return '<ol class="osl-steps">' + order.map(function (x, i) { return '<li class="' + (i < k ? 'is-done' : i === k ? 'is-now' : '') + '"><span>' + (i < k ? ico('check') : i + 1) + '</span>' + STATUS[x].label + '</li>'; }).join('') + '</ol>';
  }
  function input(k, label, type, extra) { return '<label class="osl-field"><span>' + label + '</span><input class="ax-input" ' + (type ? 'type="' + type + '" ' : '') + 'data-osl-f="' + k + '" value="' + esc(st.form[k]) + '" ' + (extra || '') + '></label>'; }
  function detailHtml() {
    var v = st.view, draft = v.status === 'draft', svc = v.services || [], rem = ids(st.remove).length;
    var totals = { base: 0, extras: 0, tolls: 0, adj: 0 };
    svc.forEach(function (s) { totals.base += Number(s.base_amount) || 0; totals.extras += Number(s.extras_amount) || 0; totals.tolls += Number(s.tolls_payable) || 0; totals.adj += Number(s.adjustment_amount) || 0; });
    var action = '';
    if (draft) action = '<section class="osl-block osl-act"><h4>Aprobar</h4><p class="osl-hint">Revisá los servicios. Al aprobarla ya no se pueden sacar servicios.</p><div class="osl-grid">' + input('invoice_number', 'Factura del tercerizado <i>(opcional)</i>', '', 'maxlength="40" placeholder="Ej.: C 0001-00001234"') + input('invoice_date', 'Fecha de la factura', 'date') + '</div>' + input('notes', 'Notas <i>(opcional)</i>', '', 'maxlength="200"') + '</section>';
    else if (v.status === 'approved') action = '<section class="osl-block osl-act"><h4>Registrar el pago</h4><div class="osl-grid">' + input('paid_at', 'Fecha de pago', 'date', 'max="' + today() + '"') + input('payment_reference', 'Comprobante <i>(opcional)</i>', '', 'maxlength="60" placeholder="Ej.: Transferencia 0012345"') + '</div></section>';
    var facts = [v.invoice_number ? ['Factura', esc(v.invoice_number) + (v.invoice_date ? ' · ' + fmt(v.invoice_date) : '')] : null, v.notes ? ['Notas', esc(v.notes)] : null, v.status === 'paid' ? ['Pagada', fmt(v.paid_at) + (v.payment_reference ? ' · ' + esc(v.payment_reference) : '')] : null].filter(Boolean);
    var buttons = draft ? '<button type="button" class="ax-btn ax-btn-ghost osl-danger" data-osl-act="cancel">Anular borrador</button>' + (rem ? '<button type="button" class="ax-btn" data-osl-remove>Sacar ' + rem + '</button>' : '') + '<button type="button" class="ax-btn ax-btn-primary" data-osl-act="approve"' + (svc.length && !rem ? '' : ' disabled') + '>Aprobar · ' + money(v.total_amount) + '</button>'
      : v.status === 'approved' ? '<button type="button" class="ax-btn ax-btn-ghost" data-osl-act="reopen">Volver a borrador</button><button type="button" class="ax-btn ax-btn-primary" data-osl-act="pay">Registrar pago · ' + money(v.total_amount) + '</button>' : '';
    return '<div class="osl-detail-head"><button type="button" class="ax-btn ax-btn-ghost ax-btn-sm" data-osl-back>' + ico('chevron-left') + esc(monthName(v.period_month)) + '</button>' + (st.done ? '<span class="osl-done" role="status">' + ico('check') + esc(st.done) + '</span>' : '') + pill(v.status) + '</div>'
      + steps(v.status)
      + '<section class="osl-total"><span>A pagar a ' + esc(v.provider_name || st.provider.display_name) + '</span><b>' + money(v.total_amount) + '</b><small>' + v.services_count + (v.services_count === 1 ? ' servicio' : ' servicios') + ' de ' + esc(monthName(v.period_month)) + '</small>'
      + '<dl class="osl-split"><div><dt>Servicios</dt><dd>' + money(totals.base) + '</dd></div><div><dt>Adicionales</dt><dd>' + money(totals.extras) + '</dd></div><div><dt>Peajes</dt><dd>' + money(totals.tolls) + '</dd></div>' + (totals.adj ? '<div><dt>Ajustes</dt><dd>' + money(totals.adj) + '</dd></div>' : '') + '</dl></section>'
      + (facts.length ? '<dl class="osl-facts">' + facts.map(function (f) { return '<div><dt>' + f[0] + '</dt><dd>' + f[1] + '</dd></div>'; }).join('') + '</dl>' : '')
      + '<section class="osl-block"><div class="osl-block-head"><h4>Servicios</h4>' + (draft ? '<small class="osl-hint">Marcá los que querés sacar.</small>' : '') + '</div>'
      + (svc.length ? '<ul class="osl-list">' + svc.map(function (s) { return serviceRow(s, draft ? { attr: 'data-osl-rm', on: !!st.remove[s.service_id] } : null); }).join('') + '</ul>' : '<p class="osl-empty">' + ico('info') + '<span>No le quedan servicios. Sumá servicios desde el mes o anulá el borrador.</span></p>')
      + '</section>' + action
      + '<div role="alert" class="osl-error">' + esc(st.error) + '</div>'
      + (buttons ? '<footer class="osp-foot osl-foot">' + buttons + '</footer>' : '');
  }
  function render() {
    var el = st.el; if (!el) return;
    var head = st.view ? '' : '<div class="osl-month" role="group" aria-label="Mes"><button type="button" class="ax-btn ax-btn-ghost ax-btn-sm" data-osl-month="-1" aria-label="Mes anterior">' + ico('chevron-left') + '</button><b>' + esc(monthName(st.month)) + '</b><button type="button" class="ax-btn ax-btn-ghost ax-btn-sm" data-osl-month="1" aria-label="Mes siguiente"' + (st.month >= monthOf() ? ' disabled' : '') + '>' + ico('chevron-right') + '</button></div>';
    var body = st.loading ? '<p class="osl-loading">Cargando…</p>' : st.view ? detailHtml() : st.data ? monthHtml() : '<div role="alert" class="osl-error">' + esc(st.error) + '</div>';
    el.innerHTML = '<div class="osl' + (st.busy ? ' is-busy' : '') + '">' + head + body + '</div>';
    bind();
  }
  function bind() {
    var el = st.el;
    el.querySelectorAll('[data-osl-month]').forEach(function (b) { b.onclick = function () { st.month = shiftMonth(st.month, Number(b.getAttribute('data-osl-month'))); loadMonth(); }; });
    el.querySelectorAll('[data-osl-open]').forEach(function (b) { b.onclick = function () { open(b.getAttribute('data-osl-open')); }; });
    el.querySelectorAll('[data-osl-pick]').forEach(function (i) { i.onchange = function () { st.sel[i.getAttribute('data-osl-pick')] = i.checked; render(); var n = st.el.querySelector('[data-osl-pick="' + i.getAttribute('data-osl-pick') + '"]'); if (n) n.focus(); }; });
    var all = el.querySelector('[data-osl-all]'); if (all) all.onchange = function () { (st.data.available || []).forEach(function (x) { st.sel[x.service_id] = all.checked; }); render(); var n = st.el.querySelector('[data-osl-all]'); if (n) n.focus(); };
    var cr = el.querySelector('[data-osl-create]'); if (cr) cr.onclick = createDraft;
    el.querySelectorAll('[data-osl-rm]').forEach(function (i) { i.onchange = function () { st.remove[i.getAttribute('data-osl-rm')] = i.checked; render(); var n = st.el.querySelector('[data-osl-rm="' + i.getAttribute('data-osl-rm') + '"]'); if (n) n.focus(); }; });
    var rm = el.querySelector('[data-osl-remove]'); if (rm) rm.onclick = removeSel;
    el.querySelectorAll('[data-osl-act]').forEach(function (b) { b.onclick = function () { act(b.getAttribute('data-osl-act')); }; });
    el.querySelectorAll('[data-osl-f]').forEach(function (i) { i.oninput = function () { st.form[i.getAttribute('data-osl-f')] = i.value; }; });
    var back = el.querySelector('[data-osl-back]'); if (back) back.onclick = function () { st.month = st.view.period_month; loadMonth(); };
  }
  function mount(el, provider) {
    st.el = el; st.provider = provider; st.view = null; st.data = null; st.error = '';
    if (!st.month || st._prov !== provider.provider_id) st.month = monthOf();
    st._prov = provider.provider_id;
    if (!db()) return;
    loadMonth();
  }

  global.AuxTercerizadosLiquidaciones = { mount: mount, _selection: selection, _draftOf: draftOf, _canPay: canPay, _shiftMonth: shiftMonth, _monthName: monthName, _state: st };
})(typeof window !== 'undefined' ? window : this);

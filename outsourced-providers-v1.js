/* AuxiliOS · Tercerizados (paso 1): ficha con datos obligatorios y de pago.
   Configuración › Prestadoras y tarifas › Tercerizados. Sólo Administración.
   Lee public.outsourced_providers (RLS) y guarda con save_outsourced_provider_v1, que vuelve a validar todo.
   Formulario: lo que se completa en orden (identificación → contacto → pago), cada dato se valida al escribirlo
   y abajo se ve qué falta. Guardar se habilita sólo cuando hay cambios. */
(function (global) {
  'use strict';
  var IVA = [['responsable_inscripto', 'Resp. Inscripto'], ['monotributo', 'Monotributo'], ['exento', 'Exento']];
  var IVA_LABEL = { responsable_inscripto: 'Responsable Inscripto', monotributo: 'Monotributo', exento: 'Exento' };
  var MODE = [['monthly', 'Una vez por mes'], ['per_service', 'Por cada servicio']];
  var TERMS = [0, 15, 30, 45];
  var st = { rows: [], filter: 'active', query: '', sel: null, form: null, orig: null, tried: false, saving: false, mobileForm: false, tab: 'datos', ratesDirty: false };

  function db() { return typeof _db !== 'undefined' ? _db : null; }
  function role() { try { return PERFIL_USUARIO && PERFIL_USUARIO.roles && PERFIL_USUARIO.roles.name; } catch (e) { return null; } }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ico(n) { return '<svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#' + n + '"/></svg>'; }
  function notify(m, t) { if (typeof global.toast === 'function') global.toast(m, t || 'info'); }
  function digits(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  function norm(v) { return String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }

  /* ── Validaciones (las mismas reglas que la base) ───────────────────── */
  function validCuit(v) {
    var d = digits(v); if (d.length !== 11) return false;
    var w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2], s = 0;
    for (var i = 0; i < 10; i++) s += Number(d[i]) * w[i];
    var dv = 11 - (s % 11); if (dv === 11) dv = 0; if (dv === 10) return false;
    return dv === Number(d[10]);
  }
  function validCbu(v) {
    var d = digits(v); if (d.length !== 22) return false;
    if (d.slice(0, 3) === '000') return true;
    var w1 = [7, 1, 3, 9, 7, 1, 3], w2 = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3], s = 0, i;
    for (i = 0; i < 7; i++) s += Number(d[i]) * w1[i];
    if ((10 - s % 10) % 10 !== Number(d[7])) return false;
    s = 0; for (i = 0; i < 13; i++) s += Number(d[8 + i]) * w2[i];
    return (10 - s % 10) % 10 === Number(d[21]);
  }
  function validAlias(v) { return /^[a-z0-9.-]{6,20}$/.test(String(v || '').trim().toLowerCase()); }
  function fmtCuit(v) { var d = digits(v).slice(0, 11); return d.length > 10 ? d.slice(0, 2) + '-' + d.slice(2, 10) + '-' + d.slice(10) : d.length > 2 ? d.slice(0, 2) + '-' + d.slice(2) : d; }
  function fmtCbu(v) { var d = digits(v).slice(0, 22); return d.length > 8 ? d.slice(0, 8) + ' ' + d.slice(8) : d; }
  function cbuKind(v) { var d = digits(v); return d.length >= 3 && d.slice(0, 3) === '000' ? 'CVU · billetera virtual' : d.length >= 3 ? 'CBU · banco ' + d.slice(0, 3) : ''; }

  function blank() { return { display_name: '', legal_name: '', cuit: '', iva_condition: '', contact_name: '', contact_phone: '', cbu: '', payment_alias: '', account_holder: '', invoicing_mode: 'monthly', payment_term_days: 15, is_active: true }; }
  function fromRow(r) { var f = blank(); Object.keys(f).forEach(function (k) { if (r[k] != null) f[k] = r[k]; }); f.cuit = fmtCuit(f.cuit); f.cbu = fmtCbu(f.cbu); return f; }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function dirty() { return !!st.form && !same(st.form, st.orig); }
  function anyDirty() { return dirty() || (st.tab === 'tarifas' && st.ratesDirty); }

  function problems(f) {
    var p = {};
    if (String(f.display_name).trim().length < 2) p.display_name = 'Indicá cómo lo conocen.';
    if (String(f.legal_name).trim().length < 2) p.legal_name = 'Indicá la razón social.';
    if (!digits(f.cuit)) p.cuit = 'Indicá el CUIT.';
    else if (digits(f.cuit).length < 11) p.cuit = 'Faltan ' + (11 - digits(f.cuit).length) + ' números.';
    else if (!validCuit(f.cuit)) p.cuit = 'El CUIT no es válido: revisá los números.';
    else if (dupCuit(f.cuit)) p.cuit = 'Ya está cargado: ' + dupCuit(f.cuit).display_name + '.';
    if (!f.iva_condition) p.iva_condition = 'Elegí la condición frente al IVA.';
    if (String(f.contact_name).trim().length < 2) p.contact_name = 'Indicá a quién llamar.';
    var ph = digits(f.contact_phone).length; if (ph < 8 || ph > 15) p.contact_phone = ph ? 'El teléfono tiene entre 8 y 15 números.' : 'Indicá el teléfono.';
    var hasCbu = !!digits(f.cbu), hasAlias = !!String(f.payment_alias).trim();
    if (!hasCbu && !hasAlias) p.pay = 'Cargá el CBU/CVU o el alias para poder pagarle.';
    if (hasCbu && digits(f.cbu).length < 22) p.cbu = 'Faltan ' + (22 - digits(f.cbu).length) + ' números.';
    else if (hasCbu && !validCbu(f.cbu)) p.cbu = 'El CBU no es válido: revisá los números.';
    if (hasAlias && !validAlias(f.payment_alias)) p.payment_alias = 'Entre 6 y 20 letras, números, puntos o guiones.';
    var d = Number(f.payment_term_days); if (f.payment_term_days === '' || !Number.isInteger(d) || d < 0 || d > 180) p.payment_term_days = 'De 0 a 180 días.';
    return p;
  }
  function dupCuit(v) { var d = digits(v); return st.rows.find(function (r) { return r.cuit === d && (!st.sel || r.provider_id !== st.sel); }) || null; }
  var LABEL = { display_name: 'nombre', legal_name: 'razón social', cuit: 'CUIT', iva_condition: 'IVA', contact_name: 'responsable', contact_phone: 'teléfono', pay: 'CBU o alias', cbu: 'CBU', payment_alias: 'alias', payment_term_days: 'plazo' };

  /* ── Carga ─────────────────────────────────────────────────────────── */
  async function load() {
    var r = await db().from('outsourced_providers').select('*').order('display_name');
    if (r.error) throw r.error;
    st.rows = Array.isArray(r.data) ? r.data : [];
  }

  /* ── Pantalla ───────────────────────────────────────────────────────── */
  function box() {
    var b = document.getElementById('outsourced-providers');
    if (!b) { b = document.createElement('div'); b.id = 'outsourced-providers'; b.className = 'modal-backdrop osp-modal'; document.body.appendChild(b); }
    return b;
  }
  async function open() {
    if (role() !== 'administracion') return notify('Los tercerizados los carga Administración.', 'warning');
    var b = box(); b.classList.add('open');
    b.innerHTML = '<div class="modal-box osp-box" role="dialog" aria-modal="true" aria-labelledby="osp-title"><div class="osp-loading">Cargando tercerizados…</div></div>';
    try { await load(); } catch (x) { b.querySelector('.osp-box').innerHTML = '<div class="osp-loading" role="alert">No se pudieron cargar: ' + esc(x.message || x) + '</div>'; return; }
    st.sel = null; st.form = null; st.orig = null; st.tried = false; st.mobileForm = false;
    if (st.rows.length) select(visible()[0] ? visible()[0].provider_id : st.rows[0].provider_id, true); else startNew(true);
    render();
  }
  function close() {
    if (anyDirty() && !global.confirm('Tenés cambios sin guardar. ¿Cerrar igual?')) return;
    if (typeof global.closeModal === 'function') global.closeModal('outsourced-providers'); else box().classList.remove('open');
  }
  function visible() {
    var q = norm(st.query);
    return st.rows.filter(function (r) { return (st.filter === 'all' || (st.filter === 'active') === !!r.is_active) && (!q || norm(r.display_name + ' ' + r.legal_name + ' ' + r.cuit + ' ' + r.contact_name).indexOf(q) >= 0); });
  }
  function select(id, quiet) {
    st.lastTerm = null;
    if (!quiet && anyDirty() && !global.confirm('Tenés cambios sin guardar. ¿Descartarlos?')) return false;
    var r = st.rows.find(function (x) { return x.provider_id === id; }); if (!r) return false;
    if (st.sel !== id) st.tab = 'datos';
    st.ratesDirty = false;
    st.sel = id; st.form = fromRow(r); st.orig = fromRow(r); st.tried = false; st.mobileForm = true;
    return true;
  }
  function startNew(quiet) {
    if (!quiet && anyDirty() && !global.confirm('Tenés cambios sin guardar. ¿Descartarlos?')) return false;
    st.tab = 'datos'; st.ratesDirty = false;
    st.sel = null; st.form = blank(); st.orig = blank(); st.tried = false; st.mobileForm = true;
    return true;
  }

  function listHtml() {
    var rows = visible(), counts = { active: st.rows.filter(function (r) { return r.is_active; }).length };
    counts.inactive = st.rows.length - counts.active;
    var seg = '<div class="ax-seg osp-filter" role="group" aria-label="Mostrar">' + [['active', 'Activos', counts.active], ['inactive', 'Inactivos', counts.inactive], ['all', 'Todos', st.rows.length]].map(function (o) { return '<button type="button" data-osp-filter="' + o[0] + '" aria-pressed="' + (st.filter === o[0]) + '">' + o[1] + ' <small>' + o[2] + '</small></button>'; }).join('') + '</div>';
    var items = rows.length ? rows.map(function (r) {
      var pay = r.cbu ? (r.cbu.slice(0, 3) === '000' ? 'CVU' : 'CBU') + ' …' + r.cbu.slice(-4) : r.payment_alias ? 'Alias ' + r.payment_alias : 'Sin datos de pago';
      return '<button type="button" class="osp-item' + (r.provider_id === st.sel ? ' is-on' : '') + (r.is_active ? '' : ' is-off') + '" data-osp-id="' + esc(r.provider_id) + '"><b>' + esc(r.display_name) + '</b><small>CUIT ' + esc(fmtCuit(r.cuit)) + ' · ' + esc(IVA_LABEL[r.iva_condition] || '') + '</small><small>' + esc(pay) + ' · ' + (r.invoicing_mode === 'monthly' ? 'factura mensual' : 'factura por servicio') + '</small>' + (r.is_active ? '' : '<span class="osp-off">Inactivo</span>') + '</button>';
    }).join('') : '<p class="osp-empty">' + (st.rows.length ? 'No hay tercerizados con ese filtro.' : 'Todavía no hay tercerizados cargados.') + '</p>';
    return '<aside class="osp-list" aria-label="Tercerizados"><div class="osp-list-head"><button type="button" class="ax-btn ax-btn-primary ax-btn-sm" data-osp-new>' + ico('plus') + 'Nuevo tercerizado</button></div>'
      + '<label class="osp-search">' + ico('search') + '<input class="ax-input" type="search" placeholder="Buscar por nombre o CUIT" value="' + esc(st.query) + '" data-osp-q></label>' + seg
      + '<div class="osp-items">' + items + '</div></aside>';
  }

  function field(k, label, input, help) { return '<label class="osp-field" data-f="' + k + '"><span>' + label + '</span>' + input + '<small class="osp-msg" data-msg="' + k + '">' + (help || '') + '</small></label>'; }
  function segHtml(name, opts, val) { return '<div class="ax-seg osp-seg" role="group" data-osp-seg="' + name + '">' + opts.map(function (o) { return '<button type="button" data-v="' + esc(o[0]) + '" aria-pressed="' + (String(val) === String(o[0])) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>'; }

  function formHtml() {
    var f = st.form, editing = !!st.sel;
    var title = editing ? esc(st.orig.display_name || 'Tercerizado') : 'Nuevo tercerizado';
    var termCustom = TERMS.indexOf(Number(f.payment_term_days)) < 0;
    return '<section class="osp-form" aria-labelledby="osp-form-title"><form novalidate autocomplete="off">'
      + '<header class="osp-form-head"><button type="button" class="ax-btn ax-btn-ghost ax-btn-sm osp-back" data-osp-back>' + ico('chevron-left') + 'Lista</button><div><h3 id="osp-form-title">' + title + '</h3><p>' + (editing ? 'Los cambios quedan registrados.' : 'Completá los datos para poder asignarle servicios y pagarle.') + '</p></div>'
      + (editing && st.tab === 'datos' ? '<label class="ax-switch osp-active"><input type="checkbox" data-k="is_active"' + (f.is_active ? ' checked' : '') + '><span>' + (f.is_active ? 'Activo' : 'Inactivo') + '</span></label>' : '') + '</header>'
      + (editing ? '<div class="ax-seg osp-tabs" role="tablist" aria-label="Ficha"><button type="button" role="tab" data-osp-tab="datos" aria-pressed="' + (st.tab === 'datos') + '">Datos</button><button type="button" role="tab" data-osp-tab="tarifas" aria-pressed="' + (st.tab === 'tarifas') + '">Tarifas</button><button type="button" role="tab" data-osp-tab="liquidaciones" aria-pressed="' + (st.tab === 'liquidaciones') + '">Liquidaciones</button></div>' : '')
      + (editing && st.tab === 'tarifas' ? '<div class="osp-form-body osp-rates" data-osp-rates></div></form></section>' : '')
      + (editing && st.tab === 'liquidaciones' ? '<div class="osp-form-body osp-rates" data-osp-liq></div></form></section>' : '')
      + (editing && st.tab !== 'datos' ? '' : '<div class="osp-form-body">'
      + '<section class="osp-step" data-step="id"><h4><span class="osp-num">1</span>Identificación</h4><div class="osp-grid">'
      + field('display_name', 'Nombre', '<input class="ax-input" data-k="display_name" maxlength="80" placeholder="Cómo lo conocen · ej.: Grúas Sur" value="' + esc(f.display_name) + '">')
      + field('legal_name', 'Razón social', '<input class="ax-input" data-k="legal_name" maxlength="120" placeholder="Como figura en la factura" value="' + esc(f.legal_name) + '">')
      + field('cuit', 'CUIT', '<input class="ax-input osp-mono" data-k="cuit" inputmode="numeric" maxlength="13" placeholder="30-12345678-9" value="' + esc(f.cuit) + '">')
      + '<div class="osp-field" data-f="iva_condition"><span>Condición frente al IVA</span>' + segHtml('iva_condition', IVA, f.iva_condition) + '<small class="osp-msg" data-msg="iva_condition"></small></div>'
      + '</div></section>'
      + '<section class="osp-step" data-step="contact"><h4><span class="osp-num">2</span>Contacto</h4><div class="osp-grid">'
      + field('contact_name', 'Responsable', '<input class="ax-input" data-k="contact_name" maxlength="80" placeholder="A quién llamar" value="' + esc(f.contact_name) + '">')
      + field('contact_phone', 'Teléfono', '<input class="ax-input" data-k="contact_phone" type="tel" inputmode="tel" maxlength="24" placeholder="11 5555-1234" value="' + esc(f.contact_phone) + '">')
      + '</div></section>'
      + '<section class="osp-step" data-step="pay"><h4><span class="osp-num">3</span>Pago</h4><p class="osp-hint" data-msg="pay">Con el CBU/CVU o el alias alcanza; si tenés los dos, mejor.</p><div class="osp-grid">'
      + field('cbu', 'CBU o CVU', '<input class="ax-input osp-mono" data-k="cbu" inputmode="numeric" maxlength="23" placeholder="22 números" value="' + esc(f.cbu) + '">')
      + field('payment_alias', 'Alias', '<input class="ax-input" data-k="payment_alias" maxlength="20" autocapitalize="none" spellcheck="false" placeholder="ej.: gruas.sur.mp" value="' + esc(f.payment_alias) + '">')
      + field('account_holder', 'Titular de la cuenta', '<input class="ax-input" data-k="account_holder" maxlength="120" placeholder="Si lo dejás vacío, es la razón social" value="' + esc(f.account_holder) + '">')
      + '<div class="osp-field" data-f="invoicing_mode"><span>Cómo factura</span>' + segHtml('invoicing_mode', MODE, f.invoicing_mode) + '<small class="osp-msg">Mensual: una factura por la liquidación del mes.</small></div>'
      + '<div class="osp-field osp-wide" data-f="payment_term_days"><span>Plazo de pago</span><div class="osp-terms">' + TERMS.map(function (t) { return '<button type="button" class="ax-chip" data-term="' + t + '" aria-pressed="' + (!termCustom && Number(f.payment_term_days) === t) + '">' + (t ? t + ' días' : 'Al aprobar') + '</button>'; }).join('')
      + '<span class="osp-term-custom"><input class="ax-input" data-k="payment_term_days" inputmode="numeric" maxlength="3" placeholder="Otro" value="' + (termCustom ? esc(f.payment_term_days) : '') + '" aria-label="Otro plazo, en días"><i>días</i></span></div><small class="osp-msg" data-msg="payment_term_days">Desde que se aprueba la liquidación.</small></div>'
      + '</div></section>'
      + '<div role="alert" class="osp-error"></div></div>'
      + '<footer class="osp-foot"><p class="osp-status" data-osp-status aria-live="polite"></p>' + (dirty() || !editing ? '<button type="button" class="ax-btn ax-btn-ghost" data-osp-discard>' + (editing ? 'Descartar cambios' : 'Cancelar') + '</button>' : '') + '<button type="submit" class="ax-btn ax-btn-primary" data-osp-save>' + (editing ? 'Guardar cambios' : 'Crear tercerizado') + '</button></footer>'
      + '</form></section>');
  }

  function render() {
    var b = box(), boxEl = b.querySelector('.osp-box');
    boxEl.innerHTML = '<div class="modal-head"><span class="modal-head-title" id="osp-title">Tercerizados</span><button type="button" class="modal-close" data-osp-close aria-label="Cerrar">×</button></div>'
      + '<div class="osp-layout' + (st.mobileForm ? ' show-form' : '') + '">' + listHtml() + (st.form ? formHtml() : '') + '</div>';
    bind(); paint();
  }
  function renderList() { var l = box().querySelector('.osp-list'); if (!l) return; l.outerHTML = listHtml(); bindList(); }

  /* Pinta errores, estados y el pie sin redibujar el formulario (no se pierde el foco). */
  function paint() {
    var b = box(), f = st.form; if (!f || st.tab !== 'datos') return;
    var pr = problems(f), touched = st.touched || {};
    Object.keys(LABEL).forEach(function (k) {
      var fld = b.querySelector('[data-f="' + k + '"]'), msg = b.querySelector('[data-msg="' + k + '"]');
      var show = pr[k] && (st.tried || touched[k]);
      if (fld) { fld.classList.toggle('is-invalid', !!show); fld.classList.toggle('is-ok', !pr[k] && (k === 'cuit' || k === 'cbu' || k === 'payment_alias') && !!String(f[k] || '').trim()); }
      if (msg && k !== 'pay') msg.textContent = show ? pr[k] : defaultMsg(k);
    });
    var payHint = b.querySelector('[data-msg="pay"]'); if (payHint) { payHint.classList.toggle('is-bad', !!(pr.pay && st.tried)); payHint.textContent = pr.pay && st.tried ? pr.pay : 'Con el CBU/CVU o el alias alcanza; si tenés los dos, mejor.'; }
    // El titular distinto de la razón social es válido, pero conviene revisarlo.
    var holderMsg = b.querySelector('[data-msg="account_holder"]'), holder = String(f.account_holder || '').trim();
    if (holderMsg) { var diff = holder && norm(holder) !== norm(f.legal_name); holderMsg.textContent = diff ? 'No coincide con la razón social: confirmá que la cuenta sea de ellos.' : ''; holderMsg.classList.toggle('is-warn', !!diff); }
    b.querySelector('[data-step="id"]').classList.toggle('is-done', !pr.display_name && !pr.legal_name && !pr.cuit && !pr.iva_condition);
    b.querySelector('[data-step="contact"]').classList.toggle('is-done', !pr.contact_name && !pr.contact_phone);
    b.querySelector('[data-step="pay"]').classList.toggle('is-done', !pr.pay && !pr.cbu && !pr.payment_alias && !pr.payment_term_days);
    var miss = Object.keys(pr).map(function (k) { return LABEL[k]; }), status = b.querySelector('[data-osp-status]'), save = b.querySelector('[data-osp-save]');
    var editing = !!st.sel, changed = dirty();
    if (status) {
      status.classList.toggle('is-ready', !miss.length && (changed || !editing));
      status.innerHTML = editing && !changed ? ico('check') + ' Sin cambios' : miss.length ? 'Falta: <b>' + esc(miss.join(', ')) + '</b>' : ico('check') + ' Listo para ' + (editing ? 'guardar' : 'crear');
    }
    if (save) save.disabled = st.saving || (editing && !changed);
  }
  function defaultMsg(k) {
    var f = st.form;
    if (k === 'cuit' && validCuit(f.cuit) && !dupCuit(f.cuit)) return 'CUIT válido';
    if (k === 'cbu' && validCbu(f.cbu)) return cbuKind(f.cbu);
    if (k === 'cbu' && digits(f.cbu)) return cbuKind(f.cbu);
    if (k === 'payment_term_days') return 'Desde que se aprueba la liquidación.';
    return '';
  }

  function bindList() {
    var b = box();
    b.querySelectorAll('[data-osp-id]').forEach(function (x) { x.onclick = function () { if (select(x.getAttribute('data-osp-id'))) render(); }; });
    var nw = b.querySelector('[data-osp-new]'); if (nw) nw.onclick = function () { if (startNew()) { render(); focusFirst(); } };
    var q = b.querySelector('[data-osp-q]'); if (q) q.oninput = function () { st.query = q.value; var pos = q.selectionStart; renderList(); var q2 = box().querySelector('[data-osp-q]'); q2.focus(); try { q2.setSelectionRange(pos, pos); } catch (e) { /* nada */ } };
    b.querySelectorAll('[data-osp-filter]').forEach(function (x) { x.onclick = function () { st.filter = x.getAttribute('data-osp-filter'); renderList(); }; });
  }
  function focusFirst() { var i = box().querySelector('[data-k="display_name"]'); if (i) i.focus(); }
  function bind() {
    var b = box(); bindList();
    b.querySelector('[data-osp-close]').onclick = close;
    if (!st.form) return;
    b.querySelectorAll('[data-osp-tab]').forEach(function (t) { t.onclick = function () {
      var to = t.getAttribute('data-osp-tab'); if (to === st.tab) return;
      if (st.tab === 'datos' && dirty() && !global.confirm('Tenés cambios sin guardar en los datos. ¿Descartarlos?')) return;
      if (st.tab === 'tarifas' && st.ratesDirty && !global.confirm('Tenés cambios sin guardar en la tarifa. ¿Descartarlos?')) return;
      if (to !== 'datos') st.form = JSON.parse(JSON.stringify(st.orig));
      st.tab = to; st.ratesDirty = false; render();
    }; });
    var back0 = b.querySelector('[data-osp-back]'); if (back0) back0.onclick = function () { st.mobileForm = false; b.querySelector('.osp-layout').classList.remove('show-form'); };
    var rates = b.querySelector('[data-osp-rates]');
    if (rates) {
      var prov = st.rows.find(function (x) { return x.provider_id === st.sel; });
      if (global.AuxTercerizadosTarifas && prov) global.AuxTercerizadosTarifas.mount(rates, prov, { onChange: function (d) { st.ratesDirty = d; } });
      return;
    }
    var liq = b.querySelector('[data-osp-liq]');
    if (liq) {
      var prov2 = st.rows.find(function (x) { return x.provider_id === st.sel; });
      if (global.AuxTercerizadosLiquidaciones && prov2) global.AuxTercerizadosLiquidaciones.mount(liq, prov2);
      return;
    }
    st.touched = st.touched || {};
    var f = st.form, form = b.querySelector('form');
    b.querySelectorAll('[data-k]').forEach(function (inp) {
      var k = inp.getAttribute('data-k');
      if (inp.type === 'checkbox') { inp.onchange = function () { f[k] = inp.checked; inp.nextElementSibling.textContent = inp.checked ? 'Activo' : 'Inactivo'; paint(); }; return; }
      inp.addEventListener('input', function () {
        if (k === 'cuit') { inp.value = fmtCuit(inp.value); }
        if (k === 'cbu') { inp.value = fmtCbu(inp.value); }
        if (k === 'payment_alias') { var p = inp.selectionStart; inp.value = inp.value.toLowerCase().replace(/\s/g, ''); try { inp.setSelectionRange(p, p); } catch (e) { /* nada */ } }
        // Plazo: el campo es para «otro»; si se borra, vuelve al botón elegido antes (o 15 días).
        if (k === 'payment_term_days') { var dv = digits(inp.value); inp.value = dv; f[k] = dv === '' ? (TERMS.indexOf(Number(st.lastTerm)) >= 0 ? Number(st.lastTerm) : 15) : Number(dv); }
        else f[k] = inp.value;
        if (k === 'payment_term_days') b.querySelectorAll('[data-term]').forEach(function (c) { c.setAttribute('aria-pressed', String(Number(c.getAttribute('data-term')) === f.payment_term_days)); });
        // Al completar el CUIT o el CBU, el foco pasa solo al siguiente dato.
        if (k === 'cuit' && validCuit(inp.value) && !dupCuit(inp.value)) { st.touched[k] = true; if (!f.iva_condition) { var iv = b.querySelector('[data-osp-seg="iva_condition"] button'); if (iv) iv.focus(); } }
        if (k === 'cbu' && validCbu(inp.value)) { st.touched[k] = true; var al = b.querySelector('[data-k="payment_alias"]'); if (al && !f.payment_alias) al.focus(); }
        paint();
      });
      inp.addEventListener('blur', function () { st.touched[k] = true; paint(); });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && inp.tagName === 'INPUT') { e.preventDefault(); var all = [].slice.call(b.querySelectorAll('.osp-form [data-k]:not([type=checkbox])')), i = all.indexOf(inp); if (all[i + 1]) all[i + 1].focus(); else b.querySelector('[data-osp-save]').focus(); } });
    });
    b.querySelectorAll('[data-osp-seg]').forEach(function (g) {
      g.addEventListener('click', function (e) { var btn = e.target.closest('button'); if (!btn) return; var k = g.getAttribute('data-osp-seg'); f[k] = btn.getAttribute('data-v'); g.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === btn)); }); st.touched[k] = true; paint(); if (k === 'iva_condition') { var nx = b.querySelector('[data-k="contact_name"]'); if (nx && !f.contact_name) nx.focus(); } });
    });
    b.querySelectorAll('[data-term]').forEach(function (c) { c.onclick = function () { f.payment_term_days = Number(c.getAttribute('data-term')); st.lastTerm = f.payment_term_days; b.querySelector('[data-k="payment_term_days"]').value = ''; b.querySelectorAll('[data-term]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); }); paint(); }; });
    var back = b.querySelector('[data-osp-back]'); if (back) back.onclick = function () { st.mobileForm = false; b.querySelector('.osp-layout').classList.remove('show-form'); };
    var discard = b.querySelector('[data-osp-discard]'); if (discard) discard.onclick = function () {
      if (st.sel) { st.form = JSON.parse(JSON.stringify(st.orig)); st.tried = false; st.touched = {}; render(); }
      else if (st.rows.length) { select(st.rows[0].provider_id, true); render(); } else close();
    };
    form.onsubmit = save;
  }

  async function save(e) {
    e.preventDefault();
    if (st.saving) return;
    var b = box(), err = b.querySelector('.osp-error'); err.textContent = '';
    st.tried = true; paint();
    var pr = problems(st.form), first = Object.keys(pr)[0];
    if (first) { var el = b.querySelector('[data-k="' + (first === 'pay' ? 'cbu' : first) + '"]') || b.querySelector('[data-f="' + first + '"] button'); if (el) el.focus(); return; }
    var f = st.form, payload = { display_name: f.display_name.trim(), legal_name: f.legal_name.trim(), cuit: digits(f.cuit), iva_condition: f.iva_condition, contact_name: f.contact_name.trim(), contact_phone: f.contact_phone.trim(), cbu: digits(f.cbu) || null, payment_alias: String(f.payment_alias || '').trim().toLowerCase() || null, account_holder: String(f.account_holder || '').trim() || null, invoicing_mode: f.invoicing_mode, payment_term_days: Number(f.payment_term_days), is_active: !!f.is_active };
    st.saving = true; var btn = b.querySelector('[data-osp-save]'), label = btn.textContent; btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      var r = await db().rpc('save_outsourced_provider_v1', { p_provider_id: st.sel, p_payload: payload });
      if (r.error) throw r.error;
      var row = r.data || {}, created = !st.sel;
      var i = st.rows.findIndex(function (x) { return x.provider_id === row.provider_id; });
      if (i >= 0) st.rows[i] = row; else st.rows.push(row);
      st.rows.sort(function (a, c) { return String(a.display_name).localeCompare(String(c.display_name), 'es'); });
      if (!row.is_active && st.filter === 'active') st.filter = 'all';
      st.saving = false; select(row.provider_id, true); st.touched = {}; render();
      notify(created ? 'Tercerizado creado.' : 'Cambios guardados.', 'success');
    } catch (x) { st.saving = false; btn.textContent = label; err.textContent = x.message || 'No se pudo guardar.'; paint(); }
  }

  global.AuxTercerizados = { open: open, _validCuit: validCuit, _validCbu: validCbu, _validAlias: validAlias, _problems: problems, _fmtCuit: fmtCuit, _fmtCbu: fmtCbu };
})(window);

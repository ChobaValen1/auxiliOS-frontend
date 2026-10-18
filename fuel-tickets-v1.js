/* AuxiliOS · Combustible: carga desde Administración en una jornada y tickets guardados.
   - Administración agrega una carga dentro de la jornada (admin_create_fuel_record_v1); la rendición y el sueldo
     se recalculan solos en la base.
   - El ticket (foto o PDF) se guarda en el espacio privado fuel-tickets y se ve con un enlace temporal.
   - El chofer guarda la foto que escaneó al registrar la carga (set_fuel_record_ticket_v1). */
(function (global) {
  'use strict';
  var BUCKET = 'fuel-tickets', MAX = 10 * 1024 * 1024;
  var MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
  function db() { return typeof _db !== 'undefined' ? _db : null; }
  function role() { try { return PERFIL_USUARIO && PERFIL_USUARIO.roles && PERFIL_USUARIO.roles.name; } catch (e) { return null; } }
  function uid() { try { return (USUARIO_ACTUAL && USUARIO_ACTUAL.id) || (PERFIL_USUARIO && PERFIL_USUARIO.user_id); } catch (e) { return null; } }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function notify(m, t) { if (typeof global.toast === 'function') global.toast(m, t || 'info'); }
  /* Acepta 1500, 1.500, 1500,50 y 1.500,50 (formato argentino) y 40.5. */
  function decimal(v) {
    var s = String(v == null ? '' : v).replace(/[$\s]/g, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    return s === '' ? NaN : Number(s);
  }
  function ico(n) { return '<svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#' + n + '"/></svg>'; }
  function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()); }

  function box(id) {
    var b = document.getElementById(id);
    if (!b) { b = document.createElement('div'); b.id = id; b.className = 'modal-backdrop fuelt-modal'; document.body.appendChild(b); }
    b.classList.add('open');
    return b;
  }
  function close(id) { if (typeof global.closeModal === 'function') global.closeModal(id); else { var b = document.getElementById(id); if (b) b.classList.remove('open'); } }
  function checkFile(file) {
    if (!file) return null;
    if (MIME.indexOf(String(file.type || '').toLowerCase()) < 0) throw new Error('El ticket tiene que ser una foto (JPG, PNG, WEBP, HEIC) o un PDF.');
    if (file.size > MAX) throw new Error('El ticket pesa más de 10 MB.');
    return file;
  }

  /* Sube el archivo a la carpeta del usuario y lo vincula a la carga. */
  async function attach(fuelId, file) {
    checkFile(file);
    var me = uid(); if (!me || !db()) throw new Error('Iniciá sesión de nuevo para adjuntar el ticket.');
    var ext = (String(file.name || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
    var path = me + '/fuel-' + Number(fuelId) + '-' + Date.now() + '.' + ext;
    var up = await db().storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) throw up.error;
    var res = await db().rpc('set_fuel_record_ticket_v1', { p_fuel_id: Number(fuelId), p_path: path, p_mime: file.type });
    if (res.error) throw res.error;
    return path;
  }

  async function refresh(logId, truckId) {
    try {
      if (logId && document.getElementById('modal-jornada-detalle') && document.getElementById('modal-jornada-detalle').classList.contains('open') && typeof global.abrirDetalleJornadaAdmin === 'function') await global.abrirDetalleJornadaAdmin(logId);
      if (truckId && global.AuxiliosDetalleCamion && Number(global.AuxiliosDetalleCamion.abierto && global.AuxiliosDetalleCamion.abierto()) === Number(truckId)) await global.AuxiliosDetalleCamion.recargar();
    } catch (e) { console.warn('[combustible] refrescar', e); }
  }

  /* ── Nueva carga desde Administración ─────────────────────────────── */
  /* Sigue el orden en que se lee un ticket: cuánto (litros, precio, total), cómo se pagó y por qué.
     Lo opcional queda plegado; abajo se ve qué falta, y el foco avanza solo al terminar cada paso. */
  var PAY = [['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['transferencia', 'Transferencia'], ['app', 'App']];
  var APPS = ['Shell Flota', 'YPF Ruta', 'Axion'];
  var MOTIVOS = ['El chofer no la cargó', 'Corrección de un ticket', 'Carga pagada por la empresa'];
  function money(v) { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(v); }
  function round2(v) { return Math.round(v * 100) / 100; }
  function numText(v) { return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(v); }
  function fmtDate(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1].slice(2) : ''; }
  function segHtml(name, opts) {
    return '<div class="ax-seg fuelt-seg" role="group" data-fuelt-seg="' + name + '">' + opts.map(function (o) { return '<button type="button" aria-pressed="false" data-v="' + esc(o[0]) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>';
  }

  function openNew(logId, info) {
    if (role() !== 'administracion') return notify('Sólo Administración puede cargar combustible en una jornada.', 'warning');
    var i = info || {}, b = box('fuelt-new'), jornadaDate = i.date || today();
    var st = { pay: '', app: '', last: 'price', file: null, preview: '', touched: {}, tried: false };
    b.innerHTML = '<div class="modal-box fuelt-box" role="dialog" aria-modal="true" aria-labelledby="fuelt-new-title">'
      + '<div class="modal-head"><div class="fuelt-head"><span class="modal-head-title" id="fuelt-new-title">Cargar combustible</span>'
      + '<span class="fuelt-context">' + ico('fuel') + '<span>' + (i.label ? esc(i.label) : 'Jornada #' + Number(logId)) + '</span></span></div>'
      + '<button type="button" class="modal-close" data-fuelt-close aria-label="Cerrar">×</button></div>'
      + '<form novalidate><div class="modal-body fuelt-body">'
      // 1 · Cuánto
      + '<section class="fuelt-step" data-step="amount"><h3 class="fuelt-step-title"><span class="fuelt-num">1</span>¿Cuánto se cargó?</h3>'
      + '<div class="fuelt-amounts">'
      + '<label class="fuelt-field" data-f="liters"><span>Litros</span><span class="fuelt-affix"><input class="ax-input" name="liters" inputmode="decimal" autocomplete="off" placeholder="0"><i>L</i></span><small class="fuelt-msg"></small></label>'
      + '<span class="fuelt-op" aria-hidden="true">×</span>'
      + '<label class="fuelt-field" data-f="price"><span>Precio por litro</span><span class="fuelt-affix is-prefix"><i>$</i><input class="ax-input" name="price_per_liter" inputmode="decimal" autocomplete="off" placeholder="0"></span><small class="fuelt-msg"></small></label>'
      + '<span class="fuelt-op" aria-hidden="true">=</span>'
      + '<label class="fuelt-field fuelt-total-field" data-f="total"><span>Total del ticket</span><span class="fuelt-affix is-prefix"><i>$</i><input class="ax-input" name="total" inputmode="decimal" autocomplete="off" placeholder="0"></span><small class="fuelt-msg">Si cargás el total, calculamos el precio por litro.</small></label>'
      + '</div></section>'
      // 2 · Cómo se pagó
      + '<section class="fuelt-step" data-step="pay"><h3 class="fuelt-step-title"><span class="fuelt-num">2</span>¿Cómo se pagó?</h3>'
      + segHtml('pay', PAY)
      + '<div class="fuelt-apps" data-fuelt-apps hidden><div class="fuelt-chips">' + APPS.map(function (a) { return '<button type="button" class="ax-chip" aria-pressed="false" data-app="' + esc(a) + '">' + esc(a) + '</button>'; }).join('')
      + '<button type="button" class="ax-chip" aria-pressed="false" data-app="">Otra</button></div>'
      + '<input class="ax-input" name="payment_app" placeholder="¿Qué app?" autocomplete="off" hidden></div>'
      + '<small class="fuelt-msg" data-f-msg="pay"></small></section>'
      // 3 · Por qué
      + '<section class="fuelt-step" data-step="reason"><h3 class="fuelt-step-title"><span class="fuelt-num">3</span>¿Por qué la carga Administración?</h3>'
      + '<div class="fuelt-chips fuelt-chips-scroll">' + MOTIVOS.map(function (m) { return '<button type="button" class="ax-chip" data-motivo="' + esc(m) + '">' + esc(m) + '</button>'; }).join('') + '</div>'
      + '<label class="fuelt-field" data-f="reason"><span class="fuelt-sr">Motivo</span><textarea class="ax-textarea" name="reason" rows="2" placeholder="Contá en pocas palabras qué pasó"></textarea><small class="fuelt-msg"></small></label></section>'
      // Ticket
      + '<section class="fuelt-step fuelt-step-plain"><label class="fuelt-drop" data-fuelt-drop tabindex="0"><input name="ticket" type="file" accept="image/*,application/pdf" hidden>'
      + '<span class="fuelt-drop-empty">' + ico('upload') + '<span><b>Adjuntar ticket</b><small>Foto o PDF · opcional · lo ven Administración y Supervisión</small></span></span>'
      + '<span class="fuelt-drop-file" hidden><span class="fuelt-thumb"></span><span class="fuelt-file-name"></span><button type="button" class="ax-btn ax-btn-ghost ax-btn-sm" data-fuelt-unfile>Quitar</button></span></label></section>'
      // Opcionales
      + '<details class="fuelt-more"><summary><span>Más datos</span><small data-fuelt-more-sum>Fecha ' + esc(fmtDate(jornadaDate)) + ' · km y estación opcionales</small></summary>'
      + '<div class="fuelt-more-grid">'
      + '<label class="fuelt-field"><span>Fecha de la carga</span><input class="ax-input" name="fuel_date" type="date" value="' + esc(jornadaDate) + '"></label>'
      + '<label class="fuelt-field" data-f="km"><span>Kilometraje</span><span class="fuelt-affix"><input class="ax-input" name="km_at_load" inputmode="numeric" autocomplete="off" placeholder="Opcional"><i>km</i></span><small class="fuelt-msg"></small></label>'
      + '<label class="fuelt-field fuelt-wide"><span>Estación</span><input class="ax-input" name="gas_station" autocomplete="off" placeholder="Opcional · ej.: YPF Ruta 2 km 45"></label>'
      + '</div></details>'
      + '<div role="alert" class="fuelt-error"></div></div>'
      + '<div class="modal-footer fuelt-footer"><p class="fuelt-status" data-fuelt-status aria-live="polite"></p><button type="button" class="btn btn-ghost" data-fuelt-close>Cancelar</button><button type="submit" class="btn btn-primary">Guardar carga</button></div></form></div>';

    var f = b.querySelector('form'), err = b.querySelector('[role=alert]'), E = f.elements;
    var q = function (sel) { return b.querySelector(sel); };
    b.querySelectorAll('[data-fuelt-close]').forEach(function (x) { x.onclick = function () { close('fuelt-new'); }; });

    function values() {
      var l = decimal(E.liters.value), p = decimal(E.price_per_liter.value), t = decimal(E.total.value);
      return { l: l, p: p, t: t, km: String(E.km_at_load.value || '').trim(), reason: String(E.reason.value || '').trim(), app: st.pay === 'app' ? (st.app || String(E.payment_app.value || '').trim()) : '' };
    }
    function problems() {
      var v = values(), out = {};
      if (!(v.l > 0)) out.liters = 'Indicá los litros.';
      if (!(v.p > 0)) out.price = 'Indicá el precio por litro o el total.';
      if (!st.pay) out.pay = 'Elegí cómo se pagó.';
      else if (st.pay === 'app' && !v.app) out.pay = 'Indicá la app de pago.';
      if (v.reason.length < 5) out.reason = 'Contá el motivo (al menos 5 letras).';
      if (v.km && !(/^\d+$/.test(v.km.replace(/\./g, '')))) out.km = 'El kilometraje es un número entero.';
      return out;
    }
    var LABEL = { liters: 'litros', price: 'precio', pay: 'medio de pago', reason: 'motivo', km: 'kilometraje' };
    function paint() {
      var pr = problems(), v = values();
      ['liters', 'price', 'reason', 'km'].forEach(function (k) {
        var fld = q('[data-f="' + k + '"]'); if (!fld) return;
        var show = pr[k] && (st.tried || st.touched[k]);
        fld.classList.toggle('is-invalid', !!show);
        fld.classList.toggle('is-done', !pr[k] && (k !== 'km' || !!v.km));
        if (k !== 'km' || show || fld.querySelector('.fuelt-msg').textContent) fld.querySelector('.fuelt-msg').textContent = show ? pr[k] : '';
      });
      var pm = q('[data-f-msg="pay"]'); pm.textContent = pr.pay && st.tried ? pr.pay : ''; pm.classList.toggle('is-bad', !!(pr.pay && st.tried));
      q('[data-step="amount"]').classList.toggle('is-done', !pr.liters && !pr.price);
      q('[data-step="pay"]').classList.toggle('is-done', !pr.pay);
      q('[data-step="reason"]').classList.toggle('is-done', !pr.reason);
      var miss = Object.keys(pr).map(function (k) { return LABEL[k]; }), status = q('[data-fuelt-status]');
      status.classList.toggle('is-ready', !miss.length);
      status.innerHTML = miss.length ? 'Falta: <b>' + esc(miss.join(', ')) + '</b>' : ico('check') + ' Listo · ' + esc(money(round2(v.l * v.p)));
      q('[data-fuelt-more-sum]').textContent = 'Fecha ' + fmtDate(E.fuel_date.value || jornadaDate) + (v.km ? ' · ' + v.km + ' km' : '') + (E.gas_station.value.trim() ? ' · ' + E.gas_station.value.trim() : (v.km ? '' : ' · km y estación opcionales'));
    }
    // Litros × precio = total; si se escribe el total, se calcula el precio (lo último que se tocó manda).
    function recalc(src) {
      var v = values();
      if (src === 'total') st.last = 'total'; else if (src === 'price') st.last = 'price';
      if (st.last === 'total') {
        if (v.l > 0 && v.t > 0) E.price_per_liter.value = numText(round2(v.t / v.l));
      } else if (v.l > 0 && v.p > 0) E.total.value = numText(round2(v.l * v.p));
      else if (src !== 'total') E.total.value = '';
      q('.fuelt-total-field').classList.toggle('is-calc', st.last !== 'total' && !!E.total.value);
      q('.fuelt-total-field .fuelt-msg').textContent = st.last === 'total' && v.l > 0 && v.t > 0 ? 'Precio por litro calculado: ' + money(round2(v.t / v.l)) : 'Si cargás el total, calculamos el precio por litro.';
      paint();
    }
    E.liters.oninput = function () { recalc('liters'); };
    E.price_per_liter.oninput = function () { recalc('price'); };
    E.total.oninput = function () { recalc('total'); };
    [['liters', 'liters'], ['price_per_liter', 'price'], ['reason', 'reason'], ['km_at_load', 'km']].forEach(function (x) { E[x[0]].addEventListener('blur', function () { st.touched[x[1]] = true; paint(); }); });
    E.reason.oninput = paint; E.km_at_load.oninput = paint; E.gas_station.oninput = paint; E.fuel_date.onchange = paint; E.payment_app.oninput = paint;
    // Enter pasa al siguiente dato en vez de guardar a medias.
    [[E.liters, E.price_per_liter], [E.price_per_liter, function () { return q('[data-fuelt-seg="pay"] button'); }], [E.total, function () { return q('[data-fuelt-seg="pay"] button'); }]].forEach(function (x) {
      x[0].addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); var n = typeof x[1] === 'function' ? x[1]() : x[1]; if (n) n.focus(); } });
    });

    var paySeg = q('[data-fuelt-seg="pay"]');
    paySeg.addEventListener('click', function (e) {
      var btn = e.target.closest('button'); if (!btn) return;
      st.pay = btn.getAttribute('data-v');
      paySeg.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === btn)); });
      q('[data-fuelt-apps]').hidden = st.pay !== 'app';
      paint();
      if (st.pay === 'app' && !st.app) { var c = q('[data-app]'); if (c) c.focus(); } else if (!values().reason) E.reason.focus();
    });
    q('[data-fuelt-apps]').addEventListener('click', function (e) {
      var c = e.target.closest('[data-app]'); if (!c) return;
      st.app = c.getAttribute('data-app');
      b.querySelectorAll('[data-app]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); });
      E.payment_app.hidden = !!st.app;
      if (!st.app) E.payment_app.focus(); else if (!values().reason) E.reason.focus();
      paint();
    });
    b.querySelectorAll('[data-motivo]').forEach(function (c) {
      c.onclick = function () { E.reason.value = c.getAttribute('data-motivo'); st.touched.reason = true; paint(); E.reason.focus(); E.reason.setSelectionRange(E.reason.value.length, E.reason.value.length); };
    });

    // Ticket: zona para tocar o soltar el archivo, con vista previa.
    var drop = q('[data-fuelt-drop]');
    function setFile(file) {
      err.textContent = '';
      try { checkFile(file); } catch (x) { err.textContent = x.message; return; }
      if (st.preview) { try { URL.revokeObjectURL(st.preview); } catch (e) { /* nada */ } }
      st.file = file || null; st.preview = '';
      q('.fuelt-drop-empty').hidden = !!file; q('.fuelt-drop-file').hidden = !file;
      drop.classList.toggle('has-file', !!file);
      if (!file) { E.ticket.value = ''; return; }
      var th = q('.fuelt-thumb');
      if (/^image\//.test(file.type) && typeof URL !== 'undefined' && URL.createObjectURL) { st.preview = URL.createObjectURL(file); th.innerHTML = '<img alt="" src="' + esc(st.preview) + '">'; }
      else th.innerHTML = ico('file-text');
      q('.fuelt-file-name').textContent = file.name || 'Ticket';
    }
    E.ticket.onchange = function () { setFile(E.ticket.files && E.ticket.files[0]); };
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); E.ticket.click(); } });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('is-over'); var x = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (x) setFile(x); });
    q('[data-fuelt-unfile]').onclick = function (e) { e.preventDefault(); e.stopPropagation(); setFile(null); };

    paint();
    setTimeout(function () { E.liters.focus(); }, 30);

    f.onsubmit = async function (e) {
      e.preventDefault();
      var btn = f.querySelector('[type=submit]'); if (btn.disabled) return;
      err.textContent = ''; st.tried = true; paint();
      var pr = problems(), first = Object.keys(pr)[0];
      if (first) {
        if (first === 'km') q('.fuelt-more').open = true;
        var target = { liters: E.liters, price: E.price_per_liter, pay: q('[data-fuelt-seg="pay"] button'), reason: E.reason, km: E.km_at_load }[first];
        if (target) target.focus();
        return;
      }
      var v = values();
      var payload = { fuel_date: E.fuel_date.value || jornadaDate, liters: v.l, price_per_liter: round2(v.p), km_at_load: v.km ? Number(v.km.replace(/\./g, '')) : null, payment_method: st.pay, payment_app: st.pay === 'app' ? v.app : null, gas_station: String(E.gas_station.value || '').trim() || null, reason: v.reason };
      var file = st.file;
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        var res = await db().rpc('admin_create_fuel_record_v1', { p_log_id: Number(logId), p_payload: payload });
        if (res.error) throw res.error;
        var data = res.data || {}, warn = '';
        if (file) { try { await attach(data.fuel_id, file); } catch (x) { warn = ' La carga se guardó, pero el ticket no: ' + (x.message || x); } }
        close('fuelt-new');
        notify((data.rendicion_observed ? 'Carga guardada. La rendición aprobada quedó observada para revisarla.' : 'Carga de combustible guardada.') + warn, warn ? 'warning' : 'success');
        await refresh(logId, data.truck_id);
      } catch (x) { err.textContent = x.message || 'No se pudo guardar la carga.'; }
      finally { btn.disabled = false; btn.textContent = 'Guardar carga'; }
    };
  }

  /* ── Corregir una carga ───────────────────────────────────────────── */
  /* Corregir no es cargar de nuevo: cada dato muestra lo que tenía, lo cambiado se marca con
     «Antes» y «Deshacer», y abajo se resume antes → ahora. Sólo se manda lo que cambió. */
  var PAY_LABEL = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', app: 'App' };
  var MOTIVOS_EDIT = ['Error de tipeo', 'El ticket dice otro importe', 'Medio de pago equivocado', 'Fecha o km equivocados'];
  function openEdit(r, ctx) {
    if (role() !== 'administracion') return;
    var c = ctx || {}, b = box('fuel-edit-admin'), id = Number(r.fuel_id);
    var orig = { fuel_date: String(r.fuel_date || '').slice(0, 10), liters: Number(r.liters) || 0, price: Number(r.price_per_liter) || 0, km: r.km_at_load == null ? '' : String(r.km_at_load), pay: r.payment_method || '', app: r.payment_app || '', station: r.gas_station || '' };
    var st = { pay: orig.pay, app: orig.app, last: 'price', tried: false };
    var byAdmin = /^Cargada por Administración/.test(r.correction_reason || '');
    var ctxText = [c.plate, fmtDate(orig.fuel_date), byAdmin ? 'cargada por Administración' : 'cargada por el chofer'].filter(Boolean).join(' · ');
    var prev = r.correction_reason && !byAdmin ? r.correction_reason : '';
    var appOther = orig.app && APPS.indexOf(orig.app) < 0;
    b.innerHTML = '<div class="modal-box fuelt-box fuelt-edit" role="dialog" aria-modal="true" aria-labelledby="fuel-edit-title">'
      + '<div class="modal-head"><div class="fuelt-head"><span class="modal-head-title" id="fuel-edit-title">Corregir carga #' + id + '</span>'
      + '<span class="fuelt-context">' + ico('fuel') + '<span>' + esc(ctxText) + '</span></span></div>'
      + '<button type="button" class="modal-close" data-fuelt-close aria-label="Cerrar">×</button></div>'
      + '<form novalidate><div class="modal-body fuelt-body">'
      + (prev ? '<p class="fuelt-prev">' + ico('info') + '<span>Ya se corrigió antes: <i>' + esc(prev) + '</i></span></p>' : '')
      + '<section class="fuelt-step"><h3 class="fuelt-step-title">Importe</h3><div class="fuelt-amounts">'
      + '<label class="fuelt-field" data-f="liters"><span>Litros</span><span class="fuelt-affix"><input class="ax-input" name="liters" inputmode="decimal" autocomplete="off" value="' + esc(numText(orig.liters)) + '"><i>L</i></span><small class="fuelt-was"></small><small class="fuelt-msg"></small></label>'
      + '<span class="fuelt-op" aria-hidden="true">×</span>'
      + '<label class="fuelt-field" data-f="price"><span>Precio por litro</span><span class="fuelt-affix is-prefix"><i>$</i><input class="ax-input" name="price_per_liter" inputmode="decimal" autocomplete="off" value="' + esc(numText(orig.price)) + '"></span><small class="fuelt-was"></small><small class="fuelt-msg"></small></label>'
      + '<span class="fuelt-op" aria-hidden="true">=</span>'
      + '<label class="fuelt-field fuelt-total-field" data-f="total"><span>Total del ticket</span><span class="fuelt-affix is-prefix"><i>$</i><input class="ax-input" name="total" inputmode="decimal" autocomplete="off" value="' + esc(numText(round2(orig.liters * orig.price))) + '"></span><small class="fuelt-was"></small><small class="fuelt-msg"></small></label>'
      + '</div></section>'
      + '<section class="fuelt-step"><h3 class="fuelt-step-title">Pago</h3><div class="fuelt-pay-wrap" data-f="pay">' + segHtml('pay', PAY)
      + '<div class="fuelt-apps" data-fuelt-apps hidden><div class="fuelt-chips">' + APPS.map(function (a) { return '<button type="button" class="ax-chip" aria-pressed="false" data-app="' + esc(a) + '">' + esc(a) + '</button>'; }).join('')
      + '<button type="button" class="ax-chip" aria-pressed="false" data-app="">Otra</button></div><input class="ax-input" name="payment_app" placeholder="¿Qué app?" autocomplete="off" value="' + esc(appOther ? orig.app : '') + '" hidden></div>'
      + '<small class="fuelt-was"></small><small class="fuelt-msg" data-f-msg="pay"></small></div></section>'
      + '<section class="fuelt-step"><h3 class="fuelt-step-title">Datos de la carga</h3><div class="fuelt-more-grid fuelt-grid-flat">'
      + '<label class="fuelt-field" data-f="fuel_date"><span>Fecha</span><input class="ax-input" name="fuel_date" type="date" value="' + esc(orig.fuel_date) + '"><small class="fuelt-was"></small></label>'
      + '<label class="fuelt-field" data-f="km"><span>Kilometraje</span><span class="fuelt-affix"><input class="ax-input" name="km_at_load" inputmode="numeric" autocomplete="off" placeholder="Sin dato" value="' + esc(orig.km ? numText(Number(orig.km)) : '') + '"><i>km</i></span><small class="fuelt-was"></small><small class="fuelt-msg"></small></label>'
      + '<label class="fuelt-field fuelt-wide" data-f="station"><span>Estación</span><input class="ax-input" name="gas_station" autocomplete="off" placeholder="Sin dato" value="' + esc(orig.station) + '"><small class="fuelt-was"></small></label>'
      + '</div><div class="fuelt-ticket-row">' + ico('receipt') + '<span>' + (r.ticket_path ? 'Ticket adjunto' : 'Sin ticket') + '<small>Se guarda aparte, al momento</small></span>' + buttonHtml(r, { logId: r.log_id, truckId: r.truck_id }).replace(' Ticket</button>', ' Ver ticket</button>') + '</div></section>'
      + '<section class="fuelt-step"><h3 class="fuelt-step-title">Motivo de la corrección</h3>'
      + '<div class="fuelt-chips fuelt-chips-scroll">' + MOTIVOS_EDIT.map(function (m) { return '<button type="button" class="ax-chip" data-motivo="' + esc(m) + '">' + esc(m) + '</button>'; }).join('') + '</div>'
      + '<label class="fuelt-field" data-f="reason"><span class="fuelt-sr">Motivo</span><textarea class="ax-textarea" name="reason" rows="2" placeholder="Qué estaba mal y de dónde sale el dato correcto"></textarea><small class="fuelt-msg"></small></label>'
      + '<p class="fuelt-audit">' + ico('shield-check') + '<span>Queda registrado quién corrigió y por qué. Si la rendición de la jornada estaba aprobada, vuelve a quedar observada.</span></p></section>'
      + '<div role="alert" class="fuelt-error"></div></div>'
      + '<div class="modal-footer fuelt-footer"><p class="fuelt-status" data-fuelt-status aria-live="polite"></p><button type="button" class="btn btn-ghost" data-fuelt-close>Cancelar</button><button type="submit" class="btn btn-primary">Guardar corrección</button></div></form></div>';

    var f = b.querySelector('form'), err = b.querySelector('[role=alert]'), E = f.elements, q = function (sel) { return b.querySelector(sel); };
    var submit = f.querySelector('[type=submit]');
    b.querySelectorAll('[data-fuelt-close]').forEach(function (x) { x.onclick = function () { close('fuel-edit-admin'); }; });
    var paySeg = q('[data-fuelt-seg="pay"]');
    function markPay() {
      paySeg.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-v') === st.pay)); });
      q('[data-fuelt-apps]').hidden = st.pay !== 'app';
      var known = APPS.indexOf(st.app) >= 0;
      b.querySelectorAll('[data-app]').forEach(function (x) { var v = x.getAttribute('data-app'); x.setAttribute('aria-pressed', String(known ? v === st.app : (v === '' && st.pay === 'app' && (st.app !== '' || !E.payment_app.hidden)))); });
      E.payment_app.hidden = st.pay !== 'app' || known;
    }
    function cur() {
      var l = decimal(E.liters.value), p = decimal(E.price_per_liter.value), km = String(E.km_at_load.value || '').trim().replace(/\./g, '');
      return { fuel_date: E.fuel_date.value, liters: l, price: p, km: km, pay: st.pay, app: st.pay === 'app' ? (APPS.indexOf(st.app) >= 0 ? st.app : String(E.payment_app.value || '').trim()) : '', station: String(E.gas_station.value || '').trim(), reason: String(E.reason.value || '').trim() };
    }
    var same = function (a, b2) { return Math.abs(a - b2) < 0.005; };
    function changes() {
      var v = cur(), out = [];
      if (v.fuel_date !== orig.fuel_date) out.push(['fuel_date', 'Fecha', fmtDate(orig.fuel_date), fmtDate(v.fuel_date)]);
      if (!same(v.liters, orig.liters)) out.push(['liters', 'Litros', numText(orig.liters) + ' L', (v.liters > 0 ? numText(v.liters) : '—') + ' L']);
      if (!same(v.price, orig.price)) out.push(['price', 'Precio', money(orig.price), v.price > 0 ? money(v.price) : '—']);
      if (v.pay !== orig.pay || (v.pay === 'app' && v.app !== orig.app)) out.push(['pay', 'Pago', (PAY_LABEL[orig.pay] || orig.pay) + (orig.pay === 'app' && orig.app ? ' · ' + orig.app : ''), (PAY_LABEL[v.pay] || v.pay) + (v.pay === 'app' && v.app ? ' · ' + v.app : '')]);
      if (v.km !== orig.km) out.push(['km', 'Km', orig.km ? numText(Number(orig.km)) : 'sin dato', v.km ? numText(Number(v.km)) : 'sin dato']);
      if (v.station !== orig.station) out.push(['station', 'Estación', orig.station || 'sin dato', v.station || 'sin dato']);
      return out;
    }
    function problems() {
      var v = cur(), out = {};
      if (!(v.liters > 0)) out.liters = 'Los litros tienen que ser mayores a cero.';
      if (!(v.price > 0)) out.price = 'El precio tiene que ser mayor a cero.';
      if (v.pay === 'app' && !v.app) out.pay = 'Indicá la app de pago.';
      if (v.km && !/^\d+$/.test(v.km)) out.km = 'El kilometraje es un número entero.';
      if (!v.fuel_date) out.fuel_date = 'Indicá la fecha.';
      if (v.reason.length < 5) out.reason = 'Contá el motivo (al menos 5 letras).';
      return out;
    }
    var WAS = { fuel_date: function () { return fmtDate(orig.fuel_date); }, liters: function () { return numText(orig.liters) + ' L'; }, price: function () { return money(orig.price); }, total: function () { return money(round2(orig.liters * orig.price)); }, km: function () { return orig.km ? numText(Number(orig.km)) + ' km' : 'sin dato'; }, station: function () { return orig.station || 'sin dato'; }, pay: function () { return (PAY_LABEL[orig.pay] || orig.pay) + (orig.pay === 'app' && orig.app ? ' · ' + orig.app : ''); } };
    function paint() {
      var ch = changes(), keys = ch.map(function (x) { return x[0]; }), pr = problems(), v = cur();
      var totalChanged = !same(round2(v.liters * v.price), round2(orig.liters * orig.price));
      Object.keys(WAS).forEach(function (k) {
        var fld = q('[data-f="' + k + '"]'); if (!fld) return;
        var on = k === 'total' ? totalChanged : keys.indexOf(k) >= 0, was = fld.querySelector('.fuelt-was');
        fld.classList.toggle('is-changed', on);
        was.innerHTML = on ? 'Antes: <b>' + esc(WAS[k]()) + '</b>' + (k === 'total' ? '' : ' · <button type="button" class="fuelt-undo" data-undo="' + k + '">Deshacer</button>') : '';
      });
      ['liters', 'price', 'km', 'reason'].forEach(function (k) {
        var fld = q('[data-f="' + k + '"]'), show = pr[k] && (st.tried || (k !== 'reason' && keys.indexOf(k) >= 0));
        fld.classList.toggle('is-invalid', !!show);
        fld.querySelector('.fuelt-msg').textContent = show ? pr[k] : '';
      });
      var pm = q('[data-f-msg="pay"]'); pm.textContent = pr.pay ? pr.pay : ''; pm.classList.toggle('is-bad', !!pr.pay);
      var status = q('[data-fuelt-status]'), blocking = Object.keys(pr).filter(function (k) { return k !== 'reason'; });
      submit.disabled = !ch.length;
      status.classList.toggle('is-ready', !!ch.length && !Object.keys(pr).length);
      if (!ch.length) status.innerHTML = 'Sin cambios todavía';
      else status.innerHTML = '<span class="fuelt-diff">' + ch.length + (ch.length === 1 ? ' cambio' : ' cambios') + (totalChanged ? ' · total <s>' + esc(money(round2(orig.liters * orig.price))) + '</s> → <b>' + esc(v.liters > 0 && v.price > 0 ? money(round2(v.liters * v.price)) : '—') + '</b>' : '') + '</span>'
        + (blocking.length || pr.reason ? '<span class="fuelt-miss">' + (pr.reason && !blocking.length ? 'Falta el motivo' : 'Revisá los datos marcados') + '</span>' : '');
    }
    function recalc(src) {
      var v = cur(), t = decimal(E.total.value);
      if (src === 'total') st.last = 'total'; else if (src === 'price') st.last = 'price';
      if (st.last === 'total') { if (v.liters > 0 && t > 0) E.price_per_liter.value = numText(round2(t / v.liters)); }
      else if (v.liters > 0 && v.price > 0) E.total.value = numText(round2(v.liters * v.price));
      paint();
    }
    E.liters.oninput = function () { recalc('liters'); };
    E.price_per_liter.oninput = function () { recalc('price'); };
    E.total.oninput = function () { recalc('total'); };
    [E.km_at_load, E.gas_station, E.reason, E.payment_app].forEach(function (x) { x.oninput = paint; });
    E.fuel_date.onchange = paint;
    paySeg.addEventListener('click', function (e) {
      var btn2 = e.target.closest('button'); if (!btn2) return;
      st.pay = btn2.getAttribute('data-v'); if (st.pay !== 'app') st.app = st.pay === orig.pay ? orig.app : '';
      markPay(); paint();
      if (st.pay === 'app' && !cur().app) { var cc = q('[data-app]'); if (cc) cc.focus(); }
    });
    q('[data-fuelt-apps]').addEventListener('click', function (e) {
      var cc = e.target.closest('[data-app]'); if (!cc) return;
      st.app = cc.getAttribute('data-app');
      if (!st.app) { E.payment_app.hidden = false; markPay(); E.payment_app.focus(); } else markPay();
      paint();
    });
    b.querySelectorAll('[data-motivo]').forEach(function (cc) {
      cc.onclick = function () { E.reason.value = cc.getAttribute('data-motivo'); paint(); E.reason.focus(); E.reason.setSelectionRange(E.reason.value.length, E.reason.value.length); };
    });
    // Deshacer devuelve un dato a lo que tenía.
    b.addEventListener('click', function (e) {
      var u = e.target.closest('[data-undo]'); if (!u) return;
      e.preventDefault();
      var k = u.getAttribute('data-undo');
      if (k === 'liters') E.liters.value = numText(orig.liters);
      if (k === 'price') { E.price_per_liter.value = numText(orig.price); st.last = 'price'; }
      if (k === 'liters' || k === 'price') E.total.value = numText(round2(decimal(E.liters.value) * decimal(E.price_per_liter.value)));
      if (k === 'fuel_date') E.fuel_date.value = orig.fuel_date;
      if (k === 'km') E.km_at_load.value = orig.km ? numText(Number(orig.km)) : '';
      if (k === 'station') E.gas_station.value = orig.station;
      if (k === 'pay') { st.pay = orig.pay; st.app = orig.app; E.payment_app.value = appOther ? orig.app : ''; markPay(); }
      paint();
    });
    markPay(); paint();
    setTimeout(function () { E.liters.focus(); E.liters.select(); }, 30);

    f.onsubmit = async function (e) {
      e.preventDefault();
      if (submit.disabled && !changes().length) return;
      err.textContent = ''; st.tried = true; paint();
      var pr = problems(), first = Object.keys(pr)[0];
      if (first) { var target = { liters: E.liters, price: E.price_per_liter, pay: E.payment_app, km: E.km_at_load, fuel_date: E.fuel_date, reason: E.reason }[first]; if (target && !target.hidden) target.focus(); return; }
      var v = cur(), payload = {};
      changes().forEach(function (x) {
        if (x[0] === 'fuel_date') payload.fuel_date = v.fuel_date;
        if (x[0] === 'liters') payload.liters = v.liters;
        if (x[0] === 'price') payload.price_per_liter = round2(v.price);
        if (x[0] === 'km') payload.km_at_load = v.km ? Number(v.km) : null;
        if (x[0] === 'station') payload.gas_station = v.station || null;
        if (x[0] === 'pay') { payload.payment_method = v.pay; payload.payment_app = v.pay === 'app' ? v.app : null; }
      });
      submit.disabled = true; submit.textContent = 'Guardando…';
      try {
        var res = await db().rpc('update_fuel_record', { p_fuel_id: id, p_payload: payload, p_reason: v.reason });
        if (res.error) throw res.error;
        close('fuel-edit-admin');
        notify(res.data && res.data.rendicion_observed ? 'Carga corregida. La rendición aprobada quedó observada.' : 'Carga corregida y auditada.', 'success');
        if (typeof c.onSaved === 'function') await c.onSaved();
      } catch (x) { err.textContent = x.message || 'No se pudo guardar la corrección.'; }
      finally { submit.textContent = 'Guardar corrección'; paint(); }
    };
  }

  /* ── Ver y adjuntar ticket ────────────────────────────────────────── */
  async function view(fuelId, path, mime, ctx) {
    var b = box('fuelt-view'), c = ctx || {};
    b.innerHTML = '<div class="modal-box fuelt-box fuelt-viewer" role="dialog" aria-modal="true" aria-labelledby="fuelt-view-title"><div class="modal-head"><span class="modal-head-title" id="fuelt-view-title">Ticket · carga #' + Number(fuelId) + '</span><button type="button" class="modal-close" data-fuelt-close aria-label="Cerrar">×</button></div><div class="modal-body"><div class="fuelt-preview">Cargando ticket…</div></div><div class="modal-footer">'
      + (role() === 'administracion' ? '<button type="button" class="btn btn-ghost" data-fuelt-replace>' + ico('upload') + 'Cambiar ticket</button>' : '')
      + '<a class="btn btn-ghost" data-fuelt-open target="_blank" rel="noopener" hidden>' + ico('external-link') + 'Abrir</a><button type="button" class="btn btn-primary" data-fuelt-close>Cerrar</button></div></div>';
    b.querySelectorAll('[data-fuelt-close]').forEach(function (x) { x.onclick = function () { close('fuelt-view'); }; });
    var rep = b.querySelector('[data-fuelt-replace]'); if (rep) rep.onclick = function () { close('fuelt-view'); pick(fuelId, c); };
    try {
      var s = await db().storage.from(BUCKET).createSignedUrl(path, 300);
      if (s.error) throw s.error;
      var url = s.data.signedUrl, pv = b.querySelector('.fuelt-preview'), open = b.querySelector('[data-fuelt-open]');
      open.href = url; open.hidden = false;
      pv.innerHTML = String(mime || '').indexOf('pdf') >= 0 ? '<iframe title="Ticket de combustible" src="' + esc(url) + '"></iframe>' : '<img alt="Ticket de combustible" src="' + esc(url) + '">';
    } catch (x) { b.querySelector('.fuelt-preview').textContent = 'No se pudo abrir el ticket: ' + (x.message || x); }
  }
  function pick(fuelId, ctx) {
    if (role() !== 'administracion') return;
    var input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*,application/pdf';
    input.onchange = async function () {
      var file = input.files && input.files[0]; if (!file) return;
      try { await attach(fuelId, file); notify('Ticket adjuntado.', 'success'); await refresh(ctx && ctx.logId, ctx && ctx.truckId); }
      catch (x) { notify(x.message || 'No se pudo adjuntar el ticket.', 'error'); }
    };
    input.click();
  }
  /* Botón para listas: Ver ticket si hay, Adjuntar si es Administración. */
  function buttonHtml(r, ctx) {
    var c = ctx || {}, attrs = ' data-fuel-id="' + Number(r.fuel_id) + '" data-log-id="' + esc(c.logId || r.log_id || '') + '" data-truck-id="' + esc(c.truckId || r.truck_id || '') + '"';
    if (r.ticket_path) return '<button type="button" class="ax-btn ax-btn-ghost ax-btn-sm fuelt-btn" data-fuelt-view="' + esc(r.ticket_path) + '" data-fuelt-mime="' + esc(r.ticket_mime || '') + '"' + attrs + '>' + ico('receipt') + ' Ticket</button>';
    if (role() === 'administracion') return '<button type="button" class="ax-btn ax-btn-ghost ax-btn-sm fuelt-btn is-missing" data-fuelt-pick' + attrs + '>' + ico('upload') + ' Adjuntar ticket</button>';
    return '';
  }
  document.addEventListener('click', function (e) {
    var v = e.target.closest && e.target.closest('[data-fuelt-view]');
    if (v) { e.preventDefault(); return view(v.getAttribute('data-fuel-id'), v.getAttribute('data-fuelt-view'), v.getAttribute('data-fuelt-mime'), { logId: v.getAttribute('data-log-id'), truckId: v.getAttribute('data-truck-id') }); }
    var p = e.target.closest && e.target.closest('[data-fuelt-pick]');
    if (p) { e.preventDefault(); return pick(p.getAttribute('data-fuel-id'), { logId: p.getAttribute('data-log-id'), truckId: p.getAttribute('data-truck-id') }); }
  });

  /* El chofer: guarda la foto que escaneó, sin frenar el registro de la carga. */
  async function attachDriverScan(fuelId, file) {
    if (!fuelId || !file) return false;
    try { await attach(fuelId, file); return true; } catch (x) { console.warn('[combustible] ticket del chofer', x); return false; }
  }

  global.AuxFuelTickets = { openNew: openNew, view: view, pick: pick, attach: attach, buttonHtml: buttonHtml, attachDriverScan: attachDriverScan, openEdit: openEdit, _decimal: decimal };
})(window);

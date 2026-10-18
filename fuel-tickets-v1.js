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
  function decimal(v) { var s = String(v == null ? '' : v).trim(); return Number(s.indexOf(',') >= 0 ? s.replace(/\./g, '').replace(',', '.') : s); }
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
  function openNew(logId, info) {
    if (role() !== 'administracion') return notify('Sólo Administración puede cargar combustible en una jornada.', 'warning');
    var i = info || {}, b = box('fuelt-new');
    b.innerHTML = '<div class="modal-box fuelt-box" role="dialog" aria-modal="true" aria-labelledby="fuelt-new-title">'
      + '<div class="modal-head"><span class="modal-head-title" id="fuelt-new-title">Cargar combustible</span><button type="button" class="modal-close" data-fuelt-close aria-label="Cerrar">×</button></div>'
      + '<form novalidate><div class="modal-body">'
      + '<p class="fuelt-context">' + ico('fuel') + '<span>Jornada' + (i.label ? ' · ' + esc(i.label) : ' #' + Number(logId)) + '</span></p>'
      + '<div class="fuelt-grid">'
      + '<label>Fecha<input class="form-input" name="fuel_date" type="date" value="' + esc(i.date || today()) + '"></label>'
      + '<label>Litros<input class="form-input" name="liters" inputmode="decimal" placeholder="0"></label>'
      + '<label>Precio por litro<input class="form-input" name="price_per_liter" inputmode="decimal" placeholder="$"></label>'
      + '<label>Kilometraje<input class="form-input" name="km_at_load" inputmode="numeric" placeholder="Opcional"></label>'
      + '<label>Medio de pago<select class="form-input" name="payment_method"><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option><option value="app">App</option></select></label>'
      + '<label data-fuelt-app hidden>App de pago<input class="form-input" name="payment_app" placeholder="Ej.: YPF App"></label>'
      + '<label class="fuelt-wide">Estación<input class="form-input" name="gas_station" placeholder="Opcional"></label>'
      + '<label class="fuelt-wide">Motivo<textarea class="form-input" name="reason" rows="2" placeholder="Ej.: el chofer no la pudo cargar desde el celular"></textarea></label>'
      + '<label class="fuelt-wide fuelt-file">Ticket (foto o PDF)<input name="ticket" type="file" accept="image/*,application/pdf"><small>Opcional. Se guarda privado: lo ven Administración y Supervisión.</small></label>'
      + '</div><p class="fuelt-total" data-fuelt-total></p><div role="alert" class="fuelt-error"></div></div>'
      + '<div class="modal-footer"><button type="button" class="btn btn-ghost" data-fuelt-close>Cancelar</button><button type="submit" class="btn btn-primary">Guardar carga</button></div></form></div>';
    var f = b.querySelector('form'), err = b.querySelector('[role=alert]');
    b.querySelectorAll('[data-fuelt-close]').forEach(function (x) { x.onclick = function () { close('fuelt-new'); }; });
    var total = function () {
      var l = decimal(f.elements.liters.value), p = decimal(f.elements.price_per_liter.value), t = b.querySelector('[data-fuelt-total]');
      t.textContent = l > 0 && p > 0 ? 'Total: ' + new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(l * p) : '';
    };
    f.elements.liters.oninput = total; f.elements.price_per_liter.oninput = total;
    f.elements.payment_method.onchange = function () { b.querySelector('[data-fuelt-app]').hidden = f.elements.payment_method.value !== 'app'; };
    f.elements.liters.focus();
    f.onsubmit = async function (e) {
      e.preventDefault();
      var btn = f.querySelector('[type=submit]'); if (btn.disabled) return;
      err.textContent = '';
      var v = function (k) { return String(f.elements[k].value || '').trim(); };
      var payload = { fuel_date: v('fuel_date'), liters: decimal(v('liters')), price_per_liter: decimal(v('price_per_liter')), km_at_load: v('km_at_load') ? decimal(v('km_at_load')) : null, payment_method: v('payment_method'), payment_app: v('payment_method') === 'app' ? v('payment_app') : null, gas_station: v('gas_station') || null, reason: v('reason') };
      var file = f.elements.ticket.files && f.elements.ticket.files[0];
      try {
        if (!(payload.liters > 0)) throw new Error('Indicá los litros.');
        if (!(payload.price_per_liter > 0)) throw new Error('Indicá el precio por litro.');
        if (payload.km_at_load !== null && !(Number.isInteger(payload.km_at_load) && payload.km_at_load >= 0)) throw new Error('El kilometraje tiene que ser un número entero.');
        if (payload.payment_method === 'app' && !payload.payment_app) throw new Error('Indicá la app de pago.');
        if (payload.reason.length < 5) throw new Error('Indicá el motivo de la carga (al menos 5 caracteres).');
        checkFile(file);
      } catch (x) { err.textContent = x.message; return; }
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

  global.AuxFuelTickets = { openNew: openNew, view: view, pick: pick, attach: attach, buttonHtml: buttonHtml, attachDriverScan: attachDriverScan };
})(window);

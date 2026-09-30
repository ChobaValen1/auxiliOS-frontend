/* AuxiliOS · Hora de fin al finalizar un servicio (v1)

   El arribo se marca solo cuando el chofer firma el remito; la hora de fin se marca cuando Operaciones o
   Administración finalizan el servicio. Por defecto es la hora actual y se puede editar en el momento.
   · field()  : campo "Hora de fin" para dentro de un formulario (modal de Estado).
   · read(el) : lee y valida ese campo; devuelve la fecha o null.
   · ask()    : pregunta la hora en un cuadro chico (cierre desde Revisión del remito).
   · apply()  : guarda la hora en el servicio ya finalizado (set_service_finish_time_v1). */
(function (global) {
  'use strict';

  function pad(n) { return String(n).padStart(2, '0'); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function local(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function notify(m, t) { if (typeof global.toast === 'function') global.toast(m, t || 'info'); }

  var seq = 0;
  function field(opts) {
    opts = opts || {};
    var id = opts.id || 'osl-finish-at', now = new Date();
    return '<label class="osl-other osl-finish-time"><span>Hora de fin</span>' +
      '<input type="datetime-local" id="' + esc(id) + '" value="' + local(now) + '" max="' + local(now) + '" required>' +
      '<small>Por defecto es la hora actual. Podés cambiarla si el servicio terminó antes.</small></label>';
  }

  function read(root, id) {
    var input = root && root.querySelector('#' + (id || 'osl-finish-at'));
    if (!input) return null;
    var d = new Date(input.value);
    if (isNaN(d.getTime())) { notify('Indicá la hora de fin', 'error'); return undefined; }
    if (d.getTime() > Date.now() + 2 * 60 * 1000) { notify('La hora de fin no puede ser futura', 'error'); return undefined; }
    return d;
  }

  /* Devuelve una promesa: la fecha elegida o null si cancela. */
  function ask() {
    return new Promise(function (resolve) {
      var doc = global.document, n = ++seq;
      var el = doc.createElement('div');
      el.id = 'ax-finish-ask';
      el.className = 'ax-finish-ask';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', 'Hora de fin');
      el.innerHTML = '<form><b>Hora de fin del servicio</b><p>Se marca la hora actual. Podés cambiarla antes de cerrar.</p>' + field({ id: 'ax-finish-at-' + n }) +
        '<div><button type="button" data-cancel>Cancelar</button><button type="submit" class="primary">Finalizar y cerrar</button></div></form>';
      doc.body.appendChild(el);
      var form = el.querySelector('form');
      function cerrar(valor) { el.remove(); doc.removeEventListener('keydown', tecla, true); resolve(valor); }
      function tecla(ev) { if (ev.key === 'Escape') { ev.preventDefault(); cerrar(null); } }
      doc.addEventListener('keydown', tecla, true);
      el.addEventListener('mousedown', function (ev) { if (ev.target === el) cerrar(null); });
      el.querySelector('[data-cancel]').addEventListener('click', function () { cerrar(null); });
      form.addEventListener('submit', function (ev) { ev.preventDefault(); var d = read(el, 'ax-finish-at-' + n); if (d) cerrar(d); });
      setTimeout(function () { var i = el.querySelector('input'); if (i) i.focus(); }, 30);
    });
  }

  /* El servicio ya está finalizado con la hora actual: si eligió otra, se corrige. */
  async function apply(serviceId, date) {
    if (!serviceId || !date) return true;
    if (Math.abs(Date.now() - date.getTime()) < 60 * 1000) return true;           // es la hora actual: no hay nada que cambiar
    try {
      var client = typeof _db !== 'undefined' ? _db : null;
      if (!client) return false;
      var res = await client.rpc('set_service_finish_time_v1', { p_service_id: serviceId, p_finished_at: date.toISOString() });
      if (res.error) throw res.error;
      return true;
    } catch (e) {
      notify('El servicio se finalizó, pero no se pudo guardar la hora de fin: ' + (e.message || e), 'warning');
      return false;
    }
  }

  global.AuxiliosFinishTime = { field: field, read: read, ask: ask, apply: apply };
})(window);

/* Correcciones y anulaciones administrativas: RPC existentes con auditoría. */
(function (global) {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const admin = () => typeof PERFIL_USUARIO !== 'undefined' && PERFIL_USUARIO?.roles?.name === 'administracion';
  const voided = r => !!r.voided_at || ['voided', 'anulado'].includes(r.status);
  function boxFor(id) {
    let box = document.getElementById(id);
    if (!box) { box = document.createElement('div'); box.id = id; box.className = 'modal-backdrop'; document.body.appendChild(box); }
    box.classList.add('open');
    return box;
  }
  async function refresh(r) {
    if (Number(global.AuxiliosDetalleCamion?.abierto?.()) === Number(r.truck_id)) await global.AuxiliosDetalleCamion.recargar();
    else if (!global.AuxiliosDetalleCamion?.abierto?.()) await cargarScreenCamion();
    if (r.log_id && document.getElementById('modal-jornada-detalle')?.classList.contains('open')) await abrirDetalleJornadaAdmin(r.log_id);
  }
  async function record(id, truckId) {
    let q = _db.from('fuel_records').select('*').eq('fuel_id', Number(id));
    if (truckId) q = q.eq('truck_id', Number(truckId));
    const {data, error} = await q.single();
    if (error) throw error;
    return data;
  }
  function loadError(box, error) {
    box.innerHTML = '<div class="modal-box"><div class="modal-body" role="alert">' + esc(error.message) + '</div><div class="modal-footer"><button class="btn btn-ghost" data-fuel-close>Cerrar</button></div></div>';
    box.querySelector('[data-fuel-close]').onclick = () => closeModal(box.id);
  }
  global.editarCargaCombustibleAdmin = async function (id) {
    if (!admin()) return;
    const box = boxFor('fuel-edit-admin');
    box.innerHTML = '<div class="modal-box"><div class="modal-body">Cargando registro…</div></div>';
    try {
      const r = await record(id);
      if (voided(r)) throw Error('La carga está anulada. Restaurala antes de corregirla.');
      // Modal de corrección: fuel-tickets-v1.js (muestra lo anterior, marca cambios y manda sólo lo cambiado).
      let plate = '';
      try { const t = await _db.from('trucks').select('plate, numero_interno').eq('truck_id', r.truck_id).maybeSingle(); if (t.data) plate = t.data.plate + (t.data.numero_interno ? ' #' + t.data.numero_interno : ''); } catch (_) { /* sin patente */ }
      global.AuxFuelTickets.openEdit(r, { plate, onSaved: () => refresh(r) });
    } catch (error) { loadError(box, error); }
  };
  global.cambiarEstadoCargaCombustibleAdmin = async function (id, restaurar, truckId) {
    if (!admin()) return;
    const box = boxFor('fuel-state-admin');
    box.innerHTML = '<div class="modal-box"><div class="modal-body">Cargando registro…</div></div>';
    try {
      const r = await record(id, truckId);
      if (voided(r) !== restaurar) throw Error(restaurar ? 'La carga ya está activa.' : 'La carga ya está anulada.');
      const verbo = restaurar ? 'Restaurar' : 'Anular';
      box.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="fuel-state-title"><div class="modal-head"><span id="fuel-state-title" class="modal-head-title">${verbo} carga #${Number(id)}</span><button type="button" class="modal-close" data-fuel-close aria-label="Cerrar">×</button></div><form><div class="modal-body"><p>${esc(String(r.fuel_date).slice(0,10))} · ${esc(r.liters)} litros · ${esc(r.gas_station || 'Sin estación')}</p><p>${restaurar ? 'La carga volverá a incluirse en los totales.' : 'La carga quedará fuera de los totales y podrá restaurarse.'} La operación queda auditada y puede observar una rendición aprobada vinculada.</p><label class="form-group">Motivo de ${restaurar ? 'restauración' : 'anulación'}<textarea name="reason" class="form-input" required minlength="5" placeholder="Explicá el motivo (mínimo 5 caracteres)"></textarea></label><div role="alert"></div></div><div class="modal-footer"><button type="button" class="btn btn-ghost" data-fuel-close>Cancelar</button><button type="submit" class="btn btn-primary">Confirmar ${restaurar ? 'restauración' : 'anulación'}</button></div></form></div>`;
      box.querySelectorAll('[data-fuel-close]').forEach(b => b.onclick = () => closeModal(box.id));
      box.querySelector('textarea').focus();
      box.querySelector('form').onsubmit = async e => {
        e.preventDefault();
        const f = e.target, btn = f.querySelector('[type=submit]');
        if (btn.disabled) return;
        const reason = f.elements.reason.value.trim();
        if (reason.length < 5) { f.querySelector('[role=alert]').textContent = 'Ingresá un motivo de al menos 5 caracteres.'; return; }
        btn.disabled = true;
        try {
          const {error} = await _db.rpc(restaurar ? 'restore_fuel_record' : 'void_fuel_record', {p_fuel_id:Number(id), p_reason:reason});
          if (error) throw error;
          closeModal(box.id); toast(restaurar ? 'Carga restaurada' : 'Carga anulada', 'success'); await refresh(r);
        } catch (error) { f.querySelector('[role=alert]').textContent = error.message; }
        finally { btn.disabled = false; }
      };
    } catch (error) { loadError(box, error); }
  };
})(window);

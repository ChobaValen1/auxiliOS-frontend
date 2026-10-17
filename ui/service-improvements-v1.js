/* AuxiliOS · Confirmación de ediciones y presentación de duraciones. */
(function (global) {
  'use strict';
  const labels = {
    company_id: 'Prestadora', billing_base_id: 'Base', service_order_number: 'Código de prestadora',
    scheduled_for: 'Fecha y hora', priority: 'Prioridad', primary_concept_id: 'Tipo de servicio', status: 'Estado',
    customer_name: 'Cliente / socio', customer_phone: 'Teléfono', customer_document: 'DNI / CUIT',
    customer_email: 'Email', vehicle_plate: 'Patente', vehicle_make_model: 'Marca y modelo',
    origin: 'Origen', destination: 'Destino', origin_lat: 'Latitud de origen', origin_lng: 'Longitud de origen',
    destination_lat: 'Latitud de destino', destination_lng: 'Longitud de destino',
    assigned_driver_id: 'Chofer', assigned_truck_id: 'Móvil', operator_notes: 'Observaciones',
    estimated_asphalt_km: 'Km de asfalto', estimated_gravel_km: 'Km de ripio',
    estimated_arrival_at: 'Arribo estimado', estimated_finish_at: 'Fin estimado',
    granted_delay_minutes: 'Demora otorgada (min)', logistics_type: 'Logística', is_holiday: 'Feriado',
    secondary_items: 'Conceptos adicionales', item_codes: 'Códigos de conceptos',
    commercial_addons: 'Peajes y excedentes', presupuesto: 'Presupuesto', factura: 'Solicita factura',
    condicion: 'Condición frente al IVA', referred_by_driver_id: 'Chofer que lo consiguió',
    medios: 'Medios de cobros registrados', toggle_ids: 'Conceptos sin importe'
  };
  const names = { normal: 'Normal', urgent: 'Urgente', high: 'Alta', own: 'Propia', outsourced: 'Tercerizada', assigned:'Asignado', pending:'Sin asignar',
    cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', mercado_pago: 'Mercado Pago',
    consumidor_final: 'Consumidor final', monotributo: 'Monotributo', responsable_inscripto: 'Responsable inscripto', exento: 'Exento' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function stable(value) {
    if (value == null || value === '') return null;
    if (Array.isArray(value)) return value.map(stable);
    if (typeof value === 'object') return Object.fromEntries(Object.keys(value).filter(k => !k.startsWith('_')).sort().map(k => [k, stable(value[k])]));
    return value;
  }
  function changes(before = {}, after = {}) {
    return Object.entries(labels).filter(([key]) => JSON.stringify(stable(before[key])) !== JSON.stringify(stable(after[key])))
      .map(([key, label]) => ({key, label, before: before[key], after: after[key]}));
  }
  const hoursToMinutes = value => Math.round(Number(value || 0) * 60 * 100) / 100;
  const minutesToHours = value => Number(String(value).replace(',', '.')) / 60;
  function duration(hours) {
    const minutes = hoursToMinutes(hours);
    if (!Number.isFinite(minutes)) return '—';
    const h = Math.floor(minutes / 60), m = Math.round((minutes - h * 60) * 100) / 100;
    return h ? `${h} ${h === 1 ? 'hora' : 'horas'}${m ? ' ' + m.toLocaleString('es-AR') + ' min' : ''}` : `${m.toLocaleString('es-AR')} min`;
  }
  const isHourly = row => row?.pricing_unit === 'hour' || row?.default_pricing_unit === 'hour' ||
    ['a1e5c0de-0002-4000-8000-000000000002', 'a1e5c0de-0003-4000-8000-000000000003'].includes(String(row?.concept_id));
  function display(key, value, resolve) {
    if (value == null || value === '') return 'Sin informar';
    if (resolve) { const label = resolve(key, value); if (label != null) return String(label); }
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (key === 'commercial_addons') {
      const coverage = {provider_roundtrip:'A cargo de la Prestadora',customer_roundtrip:'A cargo del cliente',mixed_manual:'Uno y Uno'};
      const lines = [...(value.tolls || []), ...(value.excess_charges || [])].map(r => {
        const label = r.concept_name || r.toll_name || resolve?.(r.concept_id ? 'primary_concept_id' : 'toll_id', r.concept_id || r.toll_id) || 'Cargo';
        const quantity = isHourly(r) ? duration(r.quantity) : `${r.quantity || 1} ×`;
        const payer = ({customer:'Cliente',provider:'Prestadora',company:'Empresa'})[r.payer_agent || r.collector_agent] || 'Sin cobrador';
        return `${label}: ${quantity}${r.unit_amount != null ? ' $ ' + Number(r.unit_amount).toLocaleString('es-AR') : ''} · ${payer}${r.customer_payment_method ? ' · ' + (names[r.customer_payment_method] || r.customer_payment_method) : ''}`;
      });
      return [coverage[value.toll_coverage_mode] || 'Formato sin definir', ...lines].join('\n');
    }
    if (key === 'secondary_items') return Object.entries(value).map(([id, qty]) => `${resolve?.('primary_concept_id', id) || 'Concepto'}: ${resolve?.('quantity:' + id, qty) || qty}`).join('\n') || 'Sin conceptos';
    if (key === 'item_codes') return Object.entries(value).map(([id, code]) => `${resolve?.('primary_concept_id', id) || 'Concepto'}: ${code}`).join('\n') || 'Sin códigos';
    if (key === 'toggle_ids') return value.map(id => resolve?.('toggle_id', id) || 'Concepto').join(', ') || 'Ninguno';
    if (key === 'medios') return Object.values(value).map(v => names[v] || v).join(', ') || 'Sin cobros';
    if (['scheduled_for','estimated_arrival_at','estimated_finish_at'].includes(key)) {
      const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-AR');
    }
    if (key === 'presupuesto') return '$ ' + Number(value).toLocaleString('es-AR');
    const enumKeys = ['priority','logistics_type','status','condicion'];
    return enumKeys.includes(key) && Object.prototype.hasOwnProperty.call(names, value) ? names[value] : String(value);
  }
  let pending = false;
  async function confirmEdit({before, after, resolve, reference = '', notice = '', extraRows = []}) {
    if (pending) return false;
    const rows = [...changes(before, after), ...extraRows];
    if (!rows.length) return true;
    pending = true;
    try {
      return await new Promise(done => {
        const backdrop = document.createElement('div');
        backdrop.className = 'ax-backdrop ax-edit-confirm'; backdrop.hidden = true;
        backdrop.setAttribute('data-static', '');
        backdrop.innerHTML = `<section class="ax-modal" role="dialog" aria-modal="true" aria-labelledby="ax-edit-title" aria-describedby="ax-edit-subtitle">
          <header><div><h2 id="ax-edit-title">Confirmar cambios</h2><p id="ax-edit-subtitle">${esc(reference || 'Revisá los cambios del servicio antes de guardarlos.')}</p></div><button type="button" class="ax-btn ax-btn-ghost ax-btn-icon" data-edit-cancel aria-label="Cerrar">${global.AxUI.icon('x')}</button></header>
          <div class="ax-edit-body">${notice ? `<p class="ax-edit-notice">${esc(notice)}</p>` : ''}<div class="ax-edit-columns" aria-hidden="true"><span>Campo</span><span>Antes</span><span>Después</span></div>
          <dl>${rows.map(r => `<div class="ax-edit-row"><dt>${esc(r.label)}</dt><dd data-label="Antes">${esc(display(r.key, r.before, resolve))}</dd><dd data-label="Después">${esc(display(r.key, r.after, resolve))}</dd></div>`).join('')}</dl></div>
          <footer><button type="button" class="ax-btn" data-edit-cancel>Volver a editar</button><button type="button" class="ax-btn ax-btn-primary" data-edit-confirm>Confirmar cambios</button></footer></section>`;
        document.body.appendChild(backdrop);
        let settled = false;
        const finish = result => {
          if (settled) return; settled = true;
          document.removeEventListener('keydown', onKey, true);
          global.AxUI.closeModal(backdrop);
          setTimeout(() => backdrop.remove(), 350);
          done(result);
        };
        const onKey = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish(false); } };
        backdrop.querySelectorAll('[data-edit-cancel]').forEach(b => b.addEventListener('click', () => finish(false)));
        backdrop.querySelector('[data-edit-confirm]').addEventListener('click', () => finish(true));
        document.addEventListener('keydown', onKey, true);
        global.AxUI.openModal(backdrop, {static: true});
      });
    } finally { pending = false; }
  }
  function remitoPreparing(s) {
    return !!s && ['assigned','at_origin'].includes(s.status) && !s.driver_activated &&
      !s.remito_signed_at && s.remito_status !== 'firmado' && !['submitted','approved','exception_approved'].includes(s.document_status) &&
      (s.document_status === 'draft' || s.remito_status === 'borrador' || !!s.trip_id || s.trip_started === true);
  }
  const remitoNotice = s => remitoPreparing(s) ? '<span class="ax-remito-preparing" role="status">' + global.AxUI.icon('file-text') + '<span>Remito en preparación<small>Preparación iniciada. Pendiente de firma del cliente.</small></span></span>' : '';
  global.AuxiliosServiceImprovements = {changes, display, confirmEdit, hoursToMinutes, minutesToHours, duration, isHourly, remitoPreparing, remitoNotice};
})(window);

/* AuxiliOS · Flota · corrección de estado y submit del CRUD de combustible */
(() => {
  'use strict';

  const ACTIONS = new Set(['edit', 'void', 'restore']);
  const state = {
    fuelId: null,
    action: null,
    submitting: false,
  };

  const role = () => String(
    typeof PERFIL_USUARIO === 'undefined'
      ? ''
      : (PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role || '')
  ).toLowerCase();
  const isAdmin = () => role() === 'administracion';
  const db = () => typeof _db === 'undefined' ? null : _db;
  const notify = (message, type = 'success') => {
    if (typeof toast === 'function') toast(message, type);
    else console[type === 'error' ? 'error' : 'log'](message);
  };
  const errorMessage = error => error?.message || 'No se pudo completar la operación';

  function normalizeDecimal(value) {
    let text = String(value ?? '').trim().replace(/\s+/g, '');
    if (!text) return '';
    if (text.includes(',') && text.includes('.')) {
      return text.replace(/\./g, '').replace(',', '.');
    }
    return text.replace(',', '.');
  }

  function selectedFuelId(form) {
    if (Number.isInteger(state.fuelId) && state.fuelId > 0) return state.fuelId;
    const label = form.closest('.ffcrud-modal')
      ?.querySelector('.ffcrud-modal-head small')
      ?.textContent || '';
    const match = label.match(/#(\d+)/);
    const id = Number(match?.[1]);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  function clearInlineError(form) {
    form.querySelector('.ffcrud-inline-error')?.remove();
  }

  function showInlineError(form, message, input = null) {
    clearInlineError(form);
    const box = document.createElement('div');
    box.className = 'ffcrud-inline-error';
    box.setAttribute('role', 'alert');
    box.textContent = message;
    const actions = form.querySelector('.ffcrud-modal-actions');
    (actions || form).insertAdjacentElement(actions ? 'beforebegin' : 'afterbegin', box);
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.focus({ preventScroll: true });
      input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function closeAndRefresh() {
    document.getElementById('fleet-fuel-crud-modal')?.remove();
    state.fuelId = null;
    state.action = null;
    state.submitting = false;
    setTimeout(() => {
      document.querySelector('[data-fuel-action="refresh"]')?.click();
    }, 0);
  }

  function validateEdit(form) {
    const date = form.elements.namedItem('fuel_date');
    const liters = form.elements.namedItem('liters');
    const price = form.elements.namedItem('price_per_liter');
    const km = form.elements.namedItem('km_at_load');
    const payment = form.elements.namedItem('payment_method');
    const reason = form.elements.namedItem('reason');

    const litersValue = Number(normalizeDecimal(liters?.value));
    const priceValue = Number(normalizeDecimal(price?.value));
    const kmText = String(km?.value || '').trim();

    if (!date?.value) return ['Ingresá la fecha de la carga.', date];
    if (!Number.isFinite(litersValue) || litersValue <= 0) {
      return ['Ingresá una cantidad de litros mayor a cero.', liters];
    }
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      return ['Ingresá un precio por litro mayor a cero.', price];
    }
    if (kmText && (!Number.isFinite(Number(kmText)) || Number(kmText) < 0)) {
      return ['El kilometraje debe ser igual o mayor a cero.', km];
    }
    if (!['efectivo', 'transferencia', 'app', 'tarjeta'].includes(payment?.value)) {
      return ['Seleccioná un medio de pago válido.', payment];
    }
    if (String(reason?.value || '').trim().length < 5) {
      return ['Escribí un motivo de corrección de al menos 5 caracteres.', reason];
    }
    return null;
  }

  async function submitEdit(form, fuelId) {
    const validation = validateEdit(form);
    if (validation) {
      showInlineError(form, validation[0], validation[1]);
      return;
    }

    const client = db();
    if (!client) {
      showInlineError(form, 'La conexión con la base todavía no está disponible. Recargá la pantalla.');
      return;
    }

    const submit = form.querySelector('[type="submit"]');
    const reason = String(form.elements.namedItem('reason').value || '').trim();
    const payload = {
      fuel_date: form.elements.namedItem('fuel_date').value,
      liters: normalizeDecimal(form.elements.namedItem('liters').value),
      price_per_liter: normalizeDecimal(form.elements.namedItem('price_per_liter').value),
      km_at_load: String(form.elements.namedItem('km_at_load').value || '').trim(),
      gas_station: String(form.elements.namedItem('gas_station').value || '').trim(),
      payment_method: form.elements.namedItem('payment_method').value,
      payment_app: String(form.elements.namedItem('payment_app').value || '').trim(),
    };

    state.submitting = true;
    clearInlineError(form);
    submit.disabled = true;
    submit.textContent = 'Guardando corrección…';

    try {
      const { data, error } = await client.rpc('update_fuel_record', {
        p_fuel_id: fuelId,
        p_payload: payload,
        p_reason: reason,
      });
      if (error) throw error;
      notify('Carga de combustible corregida');
      if (data?.rendicion_observed) {
        notify('La rendición aprobada quedó observada para revisión', 'warning');
      }
      closeAndRefresh();
    } catch (error) {
      state.submitting = false;
      submit.disabled = false;
      submit.textContent = 'Guardar corrección histórica';
      showInlineError(form, errorMessage(error));
      console.error('[Flota · combustible · editar]', error);
    }
  }

  async function submitReason(form, fuelId) {
    const action = form.dataset.action;
    const reasonField = form.elements.namedItem('reason');
    const reason = String(reasonField?.value || '').trim();
    if (!['void', 'restore'].includes(action)) {
      showInlineError(form, 'La acción solicitada no es válida.');
      return;
    }
    if (reason.length < 5) {
      showInlineError(form, 'Ingresá un motivo de al menos 5 caracteres.', reasonField);
      return;
    }

    const client = db();
    if (!client) {
      showInlineError(form, 'La conexión con la base todavía no está disponible. Recargá la pantalla.');
      return;
    }

    const submit = form.querySelector('[type="submit"]');
    const rpc = action === 'restore' ? 'restore_fuel_record' : 'void_fuel_record';
    state.submitting = true;
    clearInlineError(form);
    submit.disabled = true;
    submit.textContent = action === 'restore' ? 'Restaurando…' : 'Anulando…';

    try {
      const { data, error } = await client.rpc(rpc, {
        p_fuel_id: fuelId,
        p_reason: reason,
      });
      if (error) throw error;
      notify(action === 'restore' ? 'Carga restaurada' : 'Carga anulada');
      if (data?.rendicion_observed) {
        notify('La rendición aprobada quedó observada para revisión', 'warning');
      }
      closeAndRefresh();
    } catch (error) {
      state.submitting = false;
      submit.disabled = false;
      submit.textContent = action === 'restore' ? 'Restaurar carga' : 'Anular carga';
      showInlineError(form, errorMessage(error));
      console.error(`[Flota · combustible · ${action}]`, error);
    }
  }

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-fuel-action][data-fuel-id]');
    if (!button) return;
    const action = button.dataset.fuelAction;
    if (!ACTIONS.has(action)) return;
    const fuelId = Number(button.dataset.fuelId);
    if (!Number.isInteger(fuelId) || fuelId <= 0) return;
    state.fuelId = fuelId;
    state.action = action;
  }, true);

  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!['ffcrud-edit-form', 'ffcrud-reason-form'].includes(form.id)) return;
    if (!isAdmin()) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (state.submitting) return;
    const fuelId = selectedFuelId(form);
    if (!fuelId) {
      showInlineError(form, 'No se pudo identificar la carga seleccionada. Cerrá el formulario y volvé a abrirla.');
      return;
    }

    if (form.id === 'ffcrud-edit-form') {
      submitEdit(form, fuelId);
    } else {
      submitReason(form, fuelId);
    }
  }, true);
})();

/* AuxiliOS · Flota · corrección de edición histórica de combustible */
(() => {
  'use strict';

  const FORM_ID = 'ffcrud-edit-form';
  const PAYMENT_METHODS = new Set(['efectivo', 'transferencia', 'app', 'tarjeta']);

  const field = (form, name) => form?.elements?.namedItem(name) || null;

  function normalizeDecimal(value) {
    let text = String(value ?? '').trim().replace(/\s+/g, '');
    if (!text) return '';

    const hasComma = text.includes(',');
    const hasDot = text.includes('.');
    if (hasComma && hasDot) {
      // Formato habitual AR: 2.499,50
      text = text.replace(/\./g, '').replace(',', '.');
    } else if (hasComma) {
      text = text.replace(',', '.');
    }
    return text;
  }

  function clearError(form) {
    form.querySelector('.ffcrud-inline-error')?.remove();
    form.querySelectorAll('[aria-invalid="true"]').forEach(input => {
      input.removeAttribute('aria-invalid');
    });
  }

  function showError(form, message, input) {
    clearError(form);
    const error = document.createElement('div');
    error.className = 'ffcrud-inline-error';
    error.setAttribute('role', 'alert');
    error.textContent = message;
    const actions = form.querySelector('.ffcrud-modal-actions');
    (actions || form).insertAdjacentElement(actions ? 'beforebegin' : 'afterbegin', error);

    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.focus({ preventScroll: true });
      input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function prepareForm(form) {
    if (!form || form.dataset.closedEditFix === '1') return;
    form.dataset.closedEditFix = '1';
    form.noValidate = true;

    for (const name of ['liters', 'price_per_liter']) {
      const input = field(form, name);
      if (!input) continue;
      input.type = 'text';
      input.inputMode = 'decimal';
      input.autocomplete = 'off';
    }

    const warning = form.closest('.ffcrud-modal')?.querySelector('.ffcrud-warning');
    if (warning && /jornada cerrada/i.test(warning.textContent || '')) {
      const firstLine = [...warning.querySelectorAll('div')]
        .find(node => /jornada cerrada/i.test(node.textContent || ''));
      if (firstLine) {
        firstLine.textContent = '⚠ Registro histórico: la jornada ya está cerrada. La edición está permitida y quedará auditada.';
      }
      warning.classList.add('ffcrud-warning-allowed');
      const submit = form.querySelector('[type="submit"]');
      if (submit) submit.textContent = 'Guardar corrección histórica';
    }
  }

  function validate(form) {
    const date = field(form, 'fuel_date');
    const liters = field(form, 'liters');
    const price = field(form, 'price_per_liter');
    const km = field(form, 'km_at_load');
    const payment = field(form, 'payment_method');
    const reason = field(form, 'reason');

    liters.value = normalizeDecimal(liters.value);
    price.value = normalizeDecimal(price.value);

    if (!date.value) return ['Ingresá la fecha de la carga.', date];

    const litersValue = Number(liters.value);
    if (!Number.isFinite(litersValue) || litersValue <= 0) {
      return ['Ingresá una cantidad de litros mayor a cero. Podés usar coma o punto decimal.', liters];
    }

    const priceValue = Number(price.value);
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      return ['Ingresá un precio por litro mayor a cero. Podés usar coma o punto decimal.', price];
    }

    if (km.value !== '' && (!Number.isFinite(Number(km.value)) || Number(km.value) < 0)) {
      return ['El kilometraje debe ser un número igual o mayor a cero.', km];
    }

    if (!PAYMENT_METHODS.has(payment.value)) {
      return ['Seleccioná un medio de pago válido.', payment];
    }

    if (String(reason.value || '').trim().length < 5) {
      return ['Escribí un motivo de corrección de al menos 5 caracteres.', reason];
    }

    return null;
  }

  document.addEventListener('input', event => {
    const input = event.target;
    const form = input?.closest?.(`#${FORM_ID}`);
    if (!form || !['liters', 'price_per_liter'].includes(input.name)) return;
    const normalized = normalizeDecimal(input.value);
    if (normalized !== input.value) input.value = normalized;
  }, true);

  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== FORM_ID) return;
    prepareForm(form);
    clearError(form);
    const error = validate(form);
    if (!error) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    showError(form, error[0], error[1]);
  }, true);

  document.addEventListener('invalid', event => {
    const form = event.target?.closest?.(`#${FORM_ID}`);
    if (!form) return;
    event.preventDefault();
    showError(form, event.target.validationMessage || 'Revisá el campo marcado.', event.target);
  }, true);

  const observer = new MutationObserver(() => {
    prepareForm(document.getElementById(FORM_ID));
  });

  function init() {
    prepareForm(document.getElementById(FORM_ID));
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();

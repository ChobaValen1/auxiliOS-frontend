(function (root) {
  'use strict';
  const pattern = /^(?:[A-Z]{3}[0-9]{3}|[A-Z]{2}[0-9]{3}[A-Z]{2}|[0-9]{3}[A-Z]{3}|[A-Z][0-9]{3}[A-Z]{3})$/;
  const message = 'Patente inválida. Usá ABC123 o AB123CD; para motos, 123ABC o A123BCD (máximo 7 caracteres).';
  const normalize = value => String(value ?? '').toUpperCase().replace(/[\s-]/g, '');
  const valid = value => pattern.test(normalize(value));
  const api = { normalize, valid, message };
  root.AuxiliosPlate = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (!root.document) return;
  const selector = '#osv4-plate,#rem-patente,#firma-edit-patente,#nv-patente,#psv-vehicle_plate';
  function prepare(input) {
    input.maxLength = 7;
    input.pattern = pattern.source;
    input.title = message;
    input.setAttribute('autocapitalize', 'characters');
  }
  document.addEventListener('focusin', e => { if (e.target.matches(selector)) prepare(e.target); });
  document.addEventListener('input', e => {
    if (!e.target.matches(selector)) return;
    prepare(e.target);
    e.target.value = normalize(e.target.value);
    e.target.setCustomValidity(e.target.value && !valid(e.target.value) ? message : '');
  }, true);
  document.addEventListener('paste', e => {
    const input = e.target;
    if (!input.matches(selector) || !e.clipboardData) return;
    e.preventDefault();
    const value = normalize(input.value.slice(0, input.selectionStart) + e.clipboardData.getData('text') + input.value.slice(input.selectionEnd));
    // Preserve the full pasted value: never silently truncate an invalid plate.
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (!valid(value)) input.reportValidity();
  });
})(typeof window !== 'undefined' ? window : globalThis);

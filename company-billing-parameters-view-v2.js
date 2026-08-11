/* AuxiliOS · Parámetros de facturación v2 · limpieza de vista de prestadora */
(() => {
  'use strict';

  let timer = null;
  let patching = false;

  function cleanProviderView() {
    if (patching) return;
    patching = true;
    try {
      const root = document.getElementById('empv2-root');
      if (root) {
        root.querySelectorAll('.empv2-hero-stat').forEach(stat => {
          const label = stat.querySelector('small')?.textContent.trim() || '';
          if (/Base principal|Bases habilitadas|Bases operativas/i.test(label)) stat.remove();
        });
        root.querySelectorAll('.empv2-alert-item').forEach(item => {
          const title = item.querySelector('b')?.textContent || '';
          if (/base/i.test(title)) item.remove();
        });
        root.querySelectorAll('.empv2-tabs button').forEach(button => {
          if (button.textContent.trim() === 'Reglas y parámetros') button.remove();
        });
        root.querySelectorAll('.empv2-feature-card').forEach(card => {
          const title = card.querySelector('h3')?.textContent.trim();
          if (title !== 'Parámetros de facturación') return;
          const description = card.querySelector('p');
          if (description) description.textContent = 'Recorrido, peajes, recargos y vigencia comercial.';
        });
      }

      const detailCopy = document.querySelector('.bp2-detail-head p');
      if (detailCopy) detailCopy.textContent = 'Configuración de recorrido, peajes, recargos y vigencia.';

      // Evita que el adaptador anterior agregue una segunda respuesta reactiva de peajes.
      const toll = document.getElementById('cb-tolls');
      if (toll) toll.dataset.ccReactive = '1';
    } finally {
      patching = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(cleanProviderView, 40);
  }

  function init() {
    cleanProviderView();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }

  window.AuxiliosBillingParametersViewV2 = { clean: cleanProviderView };
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();
/* AuxiliOS · Compatibilidad visual Base Operativa → Base Tarifaria */
(() => {
  'use strict';

  const exactLabel = /^Base Operativa(\s*\*)?$/i;
  const exactText = /^Base Operativa$/i;
  const help = 'Referencia contractual utilizada únicamente para calcular kilómetros y peajes facturables. No representa la ubicación del móvil.';

  function patch(root = document) {
    root.querySelectorAll?.('label,.form-label,.osv2-field label,.os-field label').forEach(label => {
      const text = label.textContent.trim();
      if (!exactLabel.test(text)) return;
      label.textContent = /\*/.test(text) ? 'Base tarifaria *' : 'Base tarifaria';
      label.title = help;
    });

    root.querySelectorAll?.('[data-field-label],.osv2-base>span,.field-caption').forEach(el => {
      if (!exactText.test(el.textContent.trim())) return;
      el.textContent = 'Base tarifaria';
      el.title = help;
    });

    root.querySelectorAll?.('select[id*="branch"],select[id*="base"]').forEach(select => {
      const parent = select.closest('.form-group,.osv2-field,.os-field');
      const label = parent?.querySelector('label');
      if (label?.textContent.toLowerCase().includes('base tarifaria')) {
        select.setAttribute('aria-description', help);
        select.title = help;
      }
    });
  }

  function init() {
    patch();
    const observer = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) patch(node);
      }));
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();

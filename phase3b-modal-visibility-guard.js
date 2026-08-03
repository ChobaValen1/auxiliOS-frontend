/* AuxiliOS · Guard de visibilidad para modales Fase 3B */
(() => {
  'use strict';

  const STYLE_ID = 'phase3b-modal-visibility-guard';
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .p3b-modal-backdrop[hidden],
    .p3b-modal-backdrop[aria-hidden="true"] {
      display: none !important;
      backdrop-filter: none !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);
})();

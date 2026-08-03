/* AuxiliOS · Accesos operativos frecuentes fuera de Configuración */
(() => {
  'use strict';

  const MANAGEMENT_ROLES = new Set(['administracion', 'supervision']);
  let applying = false;
  let scheduled = false;

  const role = () => String(typeof PERFIL_USUARIO === 'undefined'
    ? ''
    : (PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role || '')).toLowerCase();
  const canUseFrequentNavigation = () => MANAGEMENT_ROLES.has(role());

  function setNavContent(id, icon, label) {
    const node = document.getElementById(id);
    if (!node) return null;
    const iconNode = node.querySelector('.nav-icon');
    const labelNode = node.querySelector('.nav-label');
    if (iconNode) iconNode.textContent = icon;
    if (labelNode) labelNode.textContent = label;
    return node;
  }

  function injectStyles() {
    if (document.getElementById('frequent-navigation-css')) return;
    const style = document.createElement('style');
    style.id = 'frequent-navigation-css';
    style.textContent = `
      body.aux-backoffice-nav.aux-frequent-navigation .sidenav > #nav-jornadas-admin.aux-frequent-direct,
      body.aux-backoffice-nav.aux-frequent-navigation .sidenav > #nav-documentos.aux-frequent-direct,
      body.aux-backoffice-nav.aux-frequent-navigation .sidenav > #nav-remitos.aux-frequent-direct,
      body.aux-backoffice-nav.aux-frequent-navigation .sidenav > #nav-grilla.aux-frequent-direct {
        display: flex !important;
      }

      body.aux-frequent-navigation #aux-settings-grid,
      body.aux-frequent-navigation .aux-center-tool[onclick*="'grilla'"],
      body.aux-frequent-navigation #screen-historial-sistema .aux-history-shortcuts button[onclick*="'jornadas-admin'"],
      body.aux-frequent-navigation #screen-historial-sistema .aux-history-shortcuts button[onclick*="'documentos'"],
      body.aux-frequent-navigation #screen-historial-sistema .aux-history-shortcuts button[onclick*="'remitos'"] {
        display: none !important;
      }

      @media (max-height: 790px) {
        body.aux-backoffice-nav.aux-frequent-navigation .sidenav {
          padding-top: 8px;
          padding-bottom: 8px;
          gap: 2px;
        }
        body.aux-backoffice-nav.aux-frequent-navigation .nav-logo {
          margin-bottom: 7px;
          padding-bottom: 7px;
        }
        body.aux-backoffice-nav.aux-frequent-navigation .sidenav > .nav-item {
          width: 48px;
          height: 46px;
          min-height: 46px;
        }
        body.aux-backoffice-nav.aux-frequent-navigation .sidenav > .nav-item .nav-icon {
          font-size: 18px;
        }
        body.aux-backoffice-nav.aux-frequent-navigation .sidenav > .nav-item .nav-label {
          font-size: 7px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function removeGroupedDuplicates() {
    document.getElementById('aux-settings-grid')?.remove();
    document.querySelectorAll('.aux-center-tool').forEach(button => {
      if ((button.getAttribute('onclick') || '').includes("'grilla'")) button.remove();
    });
  }

  function apply() {
    scheduled = false;
    if (applying) return;
    applying = true;
    try {
      if (!canUseFrequentNavigation()) {
        document.body.classList.remove('aux-frequent-navigation');
        return;
      }

      injectStyles();
      document.body.classList.add('aux-frequent-navigation');

      const sidenav = document.querySelector('.sidenav');
      const bottom = sidenav?.querySelector('.nav-bottom');
      if (!sidenav || !bottom) return;

      const dashboard = setNavContent('nav-dashboard', '📊', 'Resumen');
      const services = setNavContent('nav-operaciones', '🧭', 'Servicios');
      const journeys = setNavContent('nav-jornadas-admin', '🗓️', 'Jornadas');
      const documents = setNavContent('nav-documentos', '📄', 'Docs');
      const remitos = setNavContent('nav-remitos', '🧾', 'Remitos');
      const grid = setNavContent('nav-grilla', '📅', 'Grilla');
      const configuration = setNavContent('nav-configuracion', '⚙️', 'Configuración');
      const billing = setNavContent('nav-config-tariff-matrix', '💳', 'Facturación');
      const history = setNavContent('nav-historial-sistema', '◷', 'Historial');

      [journeys, documents, remitos, grid].filter(Boolean).forEach(node => {
        node.classList.add('aux-frequent-direct');
      });

      [dashboard, services, journeys, documents, remitos, grid, configuration, billing, history]
        .filter(Boolean)
        .forEach(node => {
          node.classList.add('aux-top-nav');
          sidenav.insertBefore(node, bottom);
        });

      removeGroupedDuplicates();
    } finally {
      applying = false;
    }
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(apply, 40);
  }

  function init() {
    injectStyles();
    apply();

    window.addEventListener('auxilios:profile-ready', scheduleApply);
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true });

    let attempts = 0;
    const timer = setInterval(() => {
      apply();
      if ((role() && document.getElementById('nav-historial-sistema')) || ++attempts > 50) clearInterval(timer);
    }, 200);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();

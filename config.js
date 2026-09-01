const ENV = {
  API_BASE_URL: 'https://auxilios.up.railway.app'
};

// Build visible para distinguir previews y evitar confundir ramas antiguas.
window.AUXILIOS_BUILD_ID = 'remito-review-headers-v34-20260901';

const AUXILIOS_ASSET_VERSION = encodeURIComponent(window.AUXILIOS_BUILD_ID);
function versionedAuxiliosAsset(path) {
  if (!path || !path.startsWith('/')) return path;
  return `${path}${path.includes('?') ? '&' : '?'}v=${AUXILIOS_ASSET_VERSION}`;
}

window.AuxiliosFeatures = window.AuxiliosFeatures || { flags: {}, userId: null, ready: false };
window.AuxiliosFeatures.flags = window.AuxiliosFeatures.flags || {};

function loadAuxiliosStyle(id, href) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = versionedAuxiliosAsset(href);
  document.head.appendChild(link);
}

function loadAuxiliosModule(id, src) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) {
      // Los módulos declarados con defer en Index.html ya se ejecutaron cuando
      // DOMContentLoaded dispara el arranque. Esperar otro evento load en ese
      // punto deja la cadena crítica bloqueada para siempre.
      if (existing.dataset.loaded === '1' || (existing.defer && document.readyState !== 'loading')) {
        existing.dataset.loaded = '1';
        resolve();
      }
      else {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
      }
      return;
    }
    const script = document.createElement('script');
    script.id = id;
    script.src = versionedAuxiliosAsset(src);
    script.async = false;
    script.addEventListener('load', () => {
      script.dataset.loaded = '1';
      resolve();
    }, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.body.appendChild(script);
  });
}

function waitForAuxiliosProfile() {
  return new Promise(resolve => {
    const ready = () => typeof PERFIL_USUARIO !== 'undefined' && PERFIL_USUARIO?.roles?.name;
    if (ready()) return resolve(PERFIL_USUARIO);
    const timer = setInterval(() => {
      if (!ready()) return;
      clearInterval(timer);
      resolve(PERFIL_USUARIO);
    }, 50);
  });
}

function setNavigationBooting(booting) {
  const sidenav = document.querySelector('.sidenav');
  if (!sidenav) return;
  sidenav.classList.toggle('aux-navigation-booting', !!booting);
  sidenav.setAttribute('aria-busy', booting ? 'true' : 'false');
}

async function loadCriticalAuxiliosModules() {
  // Un único set de estilos canónicos. La creación de servicios es parte del arranque crítico.
  loadAuxiliosStyle('auxilios-service-module-configuration-css', '/service-module-configuration.css');
  loadAuxiliosStyle('auxilios-operator-services-css', '/operator-services.css');
  loadAuxiliosStyle('auxilios-operator-service-workspace-reactive-v1-css', '/operator-service-workspace-reactive-v1.css');
  loadAuxiliosStyle('auxilios-operator-service-commercial-addons-v1-css', '/operator-service-commercial-addons-v1.css');
  loadAuxiliosStyle('auxilios-operator-billing-css', '/operator-billing.css');
  loadAuxiliosStyle('auxilios-toll-management-css', '/toll-management.css');
  loadAuxiliosStyle('auxilios-operator-invoices-css', '/operator-invoices.css');
  loadAuxiliosStyle('auxilios-configuration-center-css', '/configuration-center.css');
  loadAuxiliosStyle('auxilios-remito-addons-v2-css', '/remito-addons-v2.css');
  loadAuxiliosStyle('auxilios-remito-mobile-flow-v3-css', '/remito-mobile-flow-v3.css');
  loadAuxiliosStyle('auxilios-operator-remito-review-v2-css', '/operator-remito-review-v2.css');

  await loadAuxiliosModule('auxilios-excel-export', '/excel-export.js');
  await Promise.all([
    loadAuxiliosModule('auxilios-billing-bases', '/billing-bases.js'),
    loadAuxiliosModule('auxilios-operator-services', '/operator-services.js'),
    loadAuxiliosModule('auxilios-operator-billing', '/operator-billing.js'),
    loadAuxiliosModule('auxilios-toll-management', '/toll-management.js'),
    loadAuxiliosModule('auxilios-configuration-center', '/configuration-center.js'),
    loadAuxiliosModule('auxilios-service-module-configuration', '/service-module-configuration.js')
  ]);

  // El botón Nuevo servicio no se habilita hasta que el modal definitivo y sus dependencias estén listos.
  await loadAuxiliosModule('auxilios-operator-service-workspace-reactive-v1', '/operator-service-workspace-reactive-v1.js');
  await loadAuxiliosModule('auxilios-operator-wizard', '/operator-service-wizard.js');
  await loadAuxiliosModule('auxilios-operator-service-commercial-addons-v1', '/operator-service-commercial-addons-v1.js');
  await loadAuxiliosModule('auxilios-remito-mobile-flow-v3', '/remito-mobile-flow-v3.js');
  await loadAuxiliosModule('auxilios-phase3-service-bridge', '/operator-service-bridge.js');
  await loadAuxiliosModule('auxilios-remito-addons-v2', '/remito-addons-v2.js');
  await loadAuxiliosModule('auxilios-operator-remito-review-v2', '/operator-remito-review-v2.js');

  await loadAuxiliosModule('auxilios-operator-billing-export', '/operator-billing-export.js');
  await loadAuxiliosModule('auxilios-operator-invoices', '/operator-invoices.js');

  // Estado es una interacción primaria de la mesa: debe existir antes de liberar la UI.
  await loadAuxiliosModule('auxilios-phase3b-service-lifecycle', '/operator-service-lifecycle.js');
  window.AuxiliosConfigurationCenter?.configure?.();
}

function loadGeographicBasesInBackground() {
  Promise.resolve(window.cargarBasesGeograficas?.()).catch(error => {
    console.error('No se pudieron precargar las bases geográficas:', error);
  });
}

async function loadSecondaryAuxiliosModules() {
  loadAuxiliosStyle('auxilios-jornadas-admin-tools-v1-css', '/jornadas-admin-tools-v1.css');

  await Promise.all([
    loadAuxiliosModule('auxilios-empresas-v2', '/empresas-v2.js'),
    loadAuxiliosModule('auxilios-service-types-catalog-v2', '/service-types-catalog-v2.js'),
    loadAuxiliosModule('auxilios-tariff-types-catalog-v1', '/tariff-types-catalog-v1.js'),
    loadAuxiliosModule('auxilios-company-tariffs-v4', '/company-tariffs-v4.js'),
    loadAuxiliosModule('auxilios-company-services-v4', '/company-services-configuration-v4.js'),
    loadAuxiliosModule('auxilios-company-billing-parameters-v4', '/company-billing-parameters-v4.js'),
    loadAuxiliosModule('auxilios-fleet-operational-status-v1', '/fleet-operational-status-v1.js'),
    loadAuxiliosModule('auxilios-rendition-journey-source-v1', '/rendition-journey-source-v1.js'),
    loadAuxiliosModule('auxilios-jornadas-admin-tools-v1', '/jornadas-admin-tools-v1.js')
  ]);
}

setNavigationBooting(true);

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await waitForAuxiliosProfile();
    await loadCriticalAuxiliosModules();

    // El shell ya está operativo. Ninguna carga secundaria debe bloquear la UI.
    setNavigationBooting(false);
    loadGeographicBasesInBackground();

    void loadSecondaryAuxiliosModules().catch(error => {
      console.error('No se pudieron cargar módulos secundarios de AuxiliOS:', error);
    });
  } catch (error) {
    console.error('No se pudo completar el arranque de AuxiliOS:', error);
    setNavigationBooting(false);
  }
}, { once: true });

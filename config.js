const ENV = {
  API_BASE_URL: 'https://auxilios.up.railway.app'
};

window.AuxiliosFeatures = window.AuxiliosFeatures || { flags: {}, userId: null, ready: false };
window.AuxiliosFeatures.flags = window.AuxiliosFeatures.flags || {};

function loadAuxiliosStyle(id, href) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function loadAuxiliosModule(id, src) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) {
      if (existing.dataset.loaded === '1') resolve();
      else {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
      }
      return;
    }
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
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
  loadAuxiliosStyle('auxilios-service-module-configuration-css', '/service-module-configuration.css');
  await Promise.all([
    loadAuxiliosModule('auxilios-billing-bases', '/billing-bases.js'),
    loadAuxiliosModule('auxilios-operator-services', '/operator-services.js'),
    loadAuxiliosModule('auxilios-operator-billing', '/operator-billing.js'),
    loadAuxiliosModule('auxilios-toll-management', '/toll-management.js'),
    loadAuxiliosModule('auxilios-configuration-center', '/configuration-center.js'),
    loadAuxiliosModule('auxilios-service-module-configuration', '/service-module-configuration.js')
  ]);

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
  loadAuxiliosStyle('auxilios-operator-service-workspace-v2-css', '/operator-service-workspace-v2.css');
  loadAuxiliosStyle('auxilios-operator-service-workspace-reactive-v1-css', '/operator-service-workspace-reactive-v1.css');
  loadAuxiliosStyle('auxilios-operator-service-commercial-addons-v1-css', '/operator-service-commercial-addons-v1.css');
  loadAuxiliosStyle('auxilios-jornadas-admin-tools-v1-css', '/jornadas-admin-tools-v1.css');

  await Promise.all([
    loadAuxiliosModule('auxilios-empresas-v2', '/empresas-v2.js'),
    loadAuxiliosModule('auxilios-service-types-catalog-v2', '/service-types-catalog-v2.js'),
    loadAuxiliosModule('auxilios-tariff-types-catalog-v1', '/tariff-types-catalog-v1.js'),
    loadAuxiliosModule('auxilios-company-tariffs-v4', '/company-tariffs-v4.js'),
    loadAuxiliosModule('auxilios-company-services-v4', '/company-services-configuration-v4.js'),
    loadAuxiliosModule('auxilios-company-billing-parameters-v4', '/company-billing-parameters-v4.js'),
    loadAuxiliosModule('auxilios-operator-wizard', '/operator-service-wizard.js'),
    loadAuxiliosModule('auxilios-fleet-operational-status-v1', '/fleet-operational-status-v1.js'),
    loadAuxiliosModule('auxilios-rendition-journey-source-v1', '/rendition-journey-source-v1.js'),
    loadAuxiliosModule('auxilios-feature-flags', '/feature-flags.js'),
    loadAuxiliosModule('auxilios-jornadas-admin-tools-v1', '/jornadas-admin-tools-v1.js')
  ]);

  await loadAuxiliosModule('auxilios-operator-service-workspace-reactive-v1', '/operator-service-workspace-reactive-v1.js');
  await Promise.all([
    loadAuxiliosModule('auxilios-operator-service-commercial-addons-v1', '/operator-service-commercial-addons-v1.js'),
    loadAuxiliosModule('auxilios-phase3-service-bridge', '/operator-service-bridge.js')
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
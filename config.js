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
      else existing.addEventListener('load', resolve, { once: true });
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
  sidenav.style.visibility = booting ? 'hidden' : '';
  sidenav.setAttribute('aria-busy', booting ? 'true' : 'false');
}

setNavigationBooting(true);

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await waitForAuxiliosProfile();

    await loadAuxiliosModule('auxilios-billing-bases', '/billing-bases.js');
    await window.cargarBasesGeograficas?.();
    await loadAuxiliosModule('auxilios-operator-services', '/operator-services.js');
    await loadAuxiliosModule('auxilios-toll-management', '/toll-management.js');
    await loadAuxiliosModule('auxilios-configuration-center', '/configuration-center.js');
    loadAuxiliosStyle('auxilios-service-module-configuration-css', '/service-module-configuration.css');
    await loadAuxiliosModule('auxilios-service-module-configuration', '/service-module-configuration.js');
    window.AuxiliosConfigurationCenter?.configure?.();

    await loadAuxiliosModule('auxilios-empresas-v2', '/empresas-v2.js');
    await loadAuxiliosModule('auxilios-service-types-catalog-v2', '/service-types-catalog-v2.js');
    await loadAuxiliosModule('auxilios-tariff-types-catalog-v1', '/tariff-types-catalog-v1.js');
    await loadAuxiliosModule('auxilios-company-tariffs-v4', '/company-tariffs-v4.js');
    await loadAuxiliosModule('auxilios-company-services-v4', '/company-services-configuration-v4.js');
    await loadAuxiliosModule('auxilios-company-billing-parameters-v4', '/company-billing-parameters-v4.js');

    await loadAuxiliosModule('auxilios-operator-wizard', '/operator-service-wizard.js');
    loadAuxiliosStyle('auxilios-operator-service-workspace-v2-css', '/operator-service-workspace-v2.css');
    loadAuxiliosStyle('auxilios-operator-service-workspace-reactive-v1-css', '/operator-service-workspace-reactive-v1.css');
    await loadAuxiliosModule('auxilios-operator-service-workspace-reactive-v1', '/operator-service-workspace-reactive-v1.js');
    loadAuxiliosStyle('auxilios-operator-service-commercial-addons-v1-css', '/operator-service-commercial-addons-v1.css');
    await loadAuxiliosModule('auxilios-operator-service-commercial-addons-v1', '/operator-service-commercial-addons-v1.js');

    await loadAuxiliosModule('auxilios-fleet-operational-status-v1', '/fleet-operational-status-v1.js');
    await loadAuxiliosModule('auxilios-phase3-service-bridge', '/operator-service-bridge.js');
    await loadAuxiliosModule('auxilios-phase3-journey-start-guard', '/phase3-journey-start-guard.js');
    await loadAuxiliosModule('auxilios-phase3b-service-lifecycle', '/operator-service-lifecycle.js');
    await loadAuxiliosModule('auxilios-rendition-journey-source-v1', '/rendition-journey-source-v1.js');
    await loadAuxiliosModule('auxilios-feature-flags', '/feature-flags.js');

    loadAuxiliosStyle('auxilios-jornadas-admin-tools-v1-css', '/jornadas-admin-tools-v1.css');
    await loadAuxiliosModule('auxilios-jornadas-admin-tools-v1', '/jornadas-admin-tools-v1.js');
  } catch (error) {
    console.error('No se pudieron cargar los módulos de AuxiliOS:', error);
  } finally {
    setNavigationBooting(false);
  }
}, { once: true });
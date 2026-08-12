const ENV = {
  API_BASE_URL: 'https://auxilios.up.railway.app'
};

window.AuxiliosFeatures = window.AuxiliosFeatures || { flags: {}, userId: null, ready: false };
window.AuxiliosFeatures.flags = window.AuxiliosFeatures.flags || {};
window.AuxiliosFeatures.flags.service_workspace_v2 = true;

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
    if (ready()) {
      resolve(PERFIL_USUARIO);
      return;
    }

    const timer = setInterval(() => {
      if (!ready()) return;
      clearInterval(timer);
      resolve(PERFIL_USUARIO);
    }, 50);
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  try {
    // Los módulos con permisos no deben inicializarse hasta conocer el rol real.
    // Esto evita que Administración sea interpretada como rol vacío durante el bootstrap.
    await waitForAuxiliosProfile();

    await loadAuxiliosModule('auxilios-empresas-module', '/empresas.js');
    await loadAuxiliosModule('auxilios-empresas-v2', '/empresas-v2.js');
    await loadAuxiliosModule('auxilios-billing-bases', '/billing-bases.js');
    await loadAuxiliosModule('auxilios-configuration-reference', '/configuration-reference.js');

    // Ownership único: catálogo maestro y tarifas versionadas.
    await loadAuxiliosModule('auxilios-service-types-catalog-v2', '/service-types-catalog-v2.js');
    await loadAuxiliosModule('auxilios-company-tariffs-v4', '/company-tariffs-v4.js');

    await loadAuxiliosModule('auxilios-comercial-core', '/comercial.js');
    await loadAuxiliosModule('auxilios-comercial-services', '/comercial-services.js');
    await loadAuxiliosModule('auxilios-comercial-code-strategy', '/comercial-code-strategy.js');
    await loadAuxiliosModule('auxilios-comercial-rules', '/comercial-rules.js');
    await loadAuxiliosModule('auxilios-comercial-summary', '/comercial-summary.js');
    await loadAuxiliosModule('auxilios-tariff-composition', '/tariff-composition.js');
    await loadAuxiliosModule('auxilios-operator-services', '/operator-services.js');
    await loadAuxiliosModule('auxilios-operator-wizard', '/operator-service-wizard.js');

    loadAuxiliosStyle('auxilios-operator-service-workspace-v2-css', '/operator-service-workspace-v2.css');
    loadAuxiliosStyle('auxilios-operator-service-workspace-reactive-v1-css', '/operator-service-workspace-reactive-v1.css');
    loadAuxiliosStyle('auxilios-operator-service-tariff-v3-css', '/operator-service-tariff-v3.css');
    await loadAuxiliosModule('auxilios-operator-service-workspace-reactive-v1', '/operator-service-workspace-reactive-v1.js');
    await loadAuxiliosModule('auxilios-operator-service-tariff-v3-ui', '/operator-service-tariff-v3-ui.js');
    await loadAuxiliosModule('auxilios-operator-service-workspace-behavior-v1', '/operator-service-workspace-behavior-v1.js');

    await loadAuxiliosModule('auxilios-operator-desk-v2', '/operator-service-v2.js');
    await loadAuxiliosModule('auxilios-billing-base-operator-adapter', '/billing-base-operator-adapter.js');
    await loadAuxiliosModule('auxilios-configuration-center', '/configuration-center.js');

    // Prestadora: allowlist y parámetros comerciales. Sin dependencias de la matriz tarifaria vieja.
    await loadAuxiliosModule('auxilios-company-services-v4', '/company-services-configuration-v4.js');
    await loadAuxiliosModule('auxilios-company-billing-parameters-v4', '/company-billing-parameters-v4.js');

    await loadAuxiliosModule('auxilios-frequent-navigation', '/frequent-navigation.js');
    await loadAuxiliosModule('auxilios-phase3-service-bridge', '/operator-service-bridge.js');
    await loadAuxiliosModule('auxilios-phase3-journey-start-guard', '/phase3-journey-start-guard.js');
    await loadAuxiliosModule('auxilios-phase3b-modal-visibility-guard', '/phase3b-modal-visibility-guard.js');
    await loadAuxiliosModule('auxilios-phase3b-service-lifecycle', '/operator-service-lifecycle.js');
    await loadAuxiliosModule('auxilios-rendition-journey-source-v1', '/rendition-journey-source-v1.js');
    await loadAuxiliosModule('auxilios-feature-flags', '/feature-flags.js');
    await loadAuxiliosModule('auxilios-operator-services-stability-v1', '/operator-services-stability-v1.js');

    loadAuxiliosStyle('auxilios-operator-service-reajuste-v3-css', '/operator-service-reajuste-v3.css');
    await loadAuxiliosModule('auxilios-operator-service-reajuste-v3', '/operator-service-reajuste-v3.js');

    loadAuxiliosStyle('auxilios-jornadas-admin-tools-v1-css', '/jornadas-admin-tools-v1.css');
    await loadAuxiliosModule('auxilios-jornadas-admin-tools-v1', '/jornadas-admin-tools-v1.js');
  } catch (error) {
    console.error('No se pudieron cargar los módulos comerciales y operativos:', error);
  }
}, { once: true });
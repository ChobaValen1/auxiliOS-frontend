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
    script.id = id; script.src = src; script.async = false;
    script.addEventListener('load', () => { script.dataset.loaded = '1'; resolve(); }, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.body.appendChild(script);
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadAuxiliosModule('auxilios-empresas-module', '/empresas.js');
    await loadAuxiliosModule('auxilios-empresas-v2', '/empresas-v2.js');
    await loadAuxiliosModule('auxilios-billing-bases', '/billing-bases.js');
    await loadAuxiliosModule('auxilios-company-billing-settings', '/company-billing-settings.js');
    await loadAuxiliosModule('auxilios-configuration-reference', '/configuration-reference.js');
    await loadAuxiliosModule('auxilios-configuration-service-unit-v1', '/configuration-service-unit-v1.js');
    loadAuxiliosStyle('auxilios-tariff-matrix-v3-css', '/tariff-matrix-v3.css');
    await loadAuxiliosModule('auxilios-tariff-matrix-v3', '/tariff-matrix-v3.js');
    await loadAuxiliosModule('auxilios-comercial-core', '/comercial.js');
    await loadAuxiliosModule('auxilios-comercial-services', '/comercial-services.js');
    await loadAuxiliosModule('auxilios-comercial-code-strategy', '/comercial-code-strategy.js');
    await loadAuxiliosModule('auxilios-comercial-rules', '/comercial-rules.js');
    await loadAuxiliosModule('auxilios-comercial-summary', '/comercial-summary.js');
    await loadAuxiliosModule('auxilios-tariff-composition', '/tariff-composition.js');
    await loadAuxiliosModule('auxilios-operator-services', '/operator-services.js');
    await loadAuxiliosModule('auxilios-operator-wizard', '/operator-service-wizard.js');

    // Único alta permitida: workspace full-screen 3 columnas. Se monta una vez
    // y luego actualiza sectores puntuales para evitar parpadeos/reflows globales.
    loadAuxiliosStyle('auxilios-operator-service-workspace-v2-css', '/operator-service-workspace-v2.css');
    loadAuxiliosStyle('auxilios-operator-service-workspace-reactive-v1-css', '/operator-service-workspace-reactive-v1.css');
    loadAuxiliosStyle('auxilios-operator-service-tariff-v3-css', '/operator-service-tariff-v3.css');
    await loadAuxiliosModule('auxilios-operator-service-workspace-reactive-v1', '/operator-service-workspace-reactive-v1.js');
    await loadAuxiliosModule('auxilios-operator-service-tariff-v3-ui', '/operator-service-tariff-v3-ui.js');
    await loadAuxiliosModule('auxilios-operator-service-workspace-behavior-v1', '/operator-service-workspace-behavior-v1.js');

    await loadAuxiliosModule('auxilios-operator-desk-v2', '/operator-service-v2.js');
    await loadAuxiliosModule('auxilios-billing-base-operator-adapter', '/billing-base-operator-adapter.js');
    await loadAuxiliosModule('auxilios-equal-billing-bases', '/equal-billing-bases.js');
    await loadAuxiliosModule('auxilios-configuration-center', '/configuration-center.js');
    await loadAuxiliosModule('auxilios-frequent-navigation', '/frequent-navigation.js');
    await loadAuxiliosModule('auxilios-phase3-service-bridge', '/operator-service-bridge.js');
    await loadAuxiliosModule('auxilios-phase3-journey-start-guard', '/phase3-journey-start-guard.js');
    await loadAuxiliosModule('auxilios-phase3b-modal-visibility-guard', '/phase3b-modal-visibility-guard.js');
    await loadAuxiliosModule('auxilios-phase3b-service-lifecycle', '/operator-service-lifecycle.js');
    await loadAuxiliosModule('auxilios-rendition-journey-source-v1', '/rendition-journey-source-v1.js');
    await loadAuxiliosModule('auxilios-feature-flags', '/feature-flags.js');
    await loadAuxiliosModule('auxilios-operator-services-stability-v1', '/operator-services-stability-v1.js');

    // Jornadas admin: correcciones auditadas, anulación lógica y navegación
    // directa a remitos/combustible/rendiciones/checklists vinculados.
    loadAuxiliosStyle('auxilios-jornadas-admin-tools-v1-css', '/jornadas-admin-tools-v1.css');
    await loadAuxiliosModule('auxilios-jornadas-admin-tools-v1', '/jornadas-admin-tools-v1.js');
  } catch (error) {
    console.error('No se pudieron cargar los módulos comerciales y operativos:', error);
  }
}, { once: true });

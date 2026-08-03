const ENV = {
  API_BASE_URL: 'https://auxilios.up.railway.app'
};

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

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadAuxiliosModule('auxilios-empresas-module', '/empresas.js');
    await loadAuxiliosModule('auxilios-empresas-v2', '/empresas-v2.js');
    await loadAuxiliosModule('auxilios-billing-bases', '/billing-bases.js');
    await loadAuxiliosModule('auxilios-company-billing-settings', '/company-billing-settings.js');
    await loadAuxiliosModule('auxilios-configuration-reference', '/configuration-reference.js');
    await loadAuxiliosModule('auxilios-comercial-core', '/comercial.js');
    await loadAuxiliosModule('auxilios-comercial-services', '/comercial-services.js');
    await loadAuxiliosModule('auxilios-comercial-code-strategy', '/comercial-code-strategy.js');
    await loadAuxiliosModule('auxilios-comercial-rules', '/comercial-rules.js');
    await loadAuxiliosModule('auxilios-comercial-summary', '/comercial-summary.js');
    await loadAuxiliosModule('auxilios-tariff-composition', '/tariff-composition.js');
    await loadAuxiliosModule('auxilios-operator-services', '/operator-services.js');
    await loadAuxiliosModule('auxilios-operator-wizard', '/operator-service-wizard.js');
    await loadAuxiliosModule('auxilios-operator-desk-v2', '/operator-service-v2.js');
    await loadAuxiliosModule('auxilios-billing-base-operator-adapter', '/billing-base-operator-adapter.js');
    await loadAuxiliosModule('auxilios-equal-billing-bases', '/equal-billing-bases.js');
    await loadAuxiliosModule('auxilios-configuration-center', '/configuration-center.js');
    await loadAuxiliosModule('auxilios-frequent-navigation', '/frequent-navigation.js');
    await loadAuxiliosModule('auxilios-phase3-service-bridge', '/operator-service-bridge.js');
  } catch (error) {
    console.error('No se pudieron cargar los módulos comerciales y operativos:', error);
  }
}, { once: true });

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
    await loadAuxiliosModule('auxilios-comercial-core', '/comercial.js');
    await loadAuxiliosModule('auxilios-comercial-services', '/comercial-services.js');
    await loadAuxiliosModule('auxilios-comercial-rules', '/comercial-rules.js');
    await loadAuxiliosModule('auxilios-comercial-summary', '/comercial-summary.js');
  } catch (error) {
    console.error('No se pudieron cargar los módulos comerciales:', error);
  }
}, { once: true });

const ENV = {
  API_BASE_URL: 'https://auxilios.up.railway.app'
};

// Módulo comercial Fase 1: empresas, contactos y sucursales.
window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('auxilios-empresas-module')) return;
  const script = document.createElement('script');
  script.id = 'auxilios-empresas-module';
  script.src = '/empresas.js';
  script.defer = true;
  document.body.appendChild(script);
}, { once: true });

(function () {
  'use strict';
  window.AUXILIOS_DEMO = true;
  const openOriginal = window.open.bind(window);
  window.open = function(url, ...args) {
    if (/^https:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//i.test(String(url))) { alert('Demo: el envío por WhatsApp está deshabilitado.'); return null; }
    return openOriginal(url, ...args);
  };
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = function (input, options) {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.hostname === ['bcjcrlrr','qfbipleiwkqi.supabase.co'].join('') || url.hostname === ['auxilios.up','railway.app'].join('.')) {
      return Promise.reject(new Error('La demo no puede conectarse a producción.'));
    }
    return fetchOriginal(input, options);
  };
  document.addEventListener('DOMContentLoaded', function () {
    const badge = document.createElement('div');
    badge.textContent = 'DEMO · Datos ficticios';
    badge.title = 'Entorno independiente para demostraciones. Mapas e IA requieren configuración propia.';
    badge.style.cssText = 'position:fixed;bottom:6px;left:50%;transform:translateX(-50%);z-index:99999;background:#b45309;color:white;padding:5px 12px;border-radius:20px;font:600 11px system-ui;pointer-events:none;box-shadow:0 2px 8px #0003';
    document.body.appendChild(badge);
  });
})();

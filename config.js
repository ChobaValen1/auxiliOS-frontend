const ENV = {
  API_BASE_URL: 'https://auxilios.up.railway.app',
  ADMIN_API_BASE_URL: 'https://bcjcrlrrqfbipleiwkqi.supabase.co/functions/v1/auxilios-admin'
};

/* Formato de fecha único en toda la app: DD/MM/AA (y HH:MM cuando hay hora).
   Las pantallas formatean fechas de muchas formas (toLocaleDateString,
   toLocaleString, Intl.DateTimeFormat con 'es-AR'); en vez de tocar cada una,
   se normaliza acá, que carga antes que el resto. Solo afecta a los locales en
   español o sin locale: 'en-CA' / 'sv-SE' se usan para armar fechas ISO y no
   se tocan. Los formatos con mes en texto ("Septiembre 2026", "lun 14 mar")
   son rótulos de período y quedan como están. */
(function installAuxiliosDateFormat() {
  const root = typeof window !== 'undefined' ? window : globalThis;
  if (root.__auxDateFormat) return;
  root.__auxDateFormat = true;
  const isSpanish = locales => {
    const first = Array.isArray(locales) ? locales[0] : locales;
    return first == null || /^es\b/i.test(String(first));
  };
  const DATE_KEYS = ['day', 'month', 'year'];
  const TIME_KEYS = ['hour', 'minute', 'second'];
  function normalize(options, kind) {
    const o = options ? { ...options } : {};
    if (o.dateStyle || o.timeStyle) {
      const withDate = !!o.dateStyle, withTime = !!o.timeStyle;
      delete o.dateStyle; delete o.timeStyle;
      if (withDate) Object.assign(o, { day: '2-digit', month: '2-digit', year: '2-digit' });
      if (withTime) Object.assign(o, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      return o;
    }
    const hasDate = DATE_KEYS.some(k => o[k]) || o.weekday || o.era;
    const hasTime = TIME_KEYS.some(k => o[k]) || o.dayPeriod || o.fractionalSecondDigits;
    if (!hasDate && !hasTime) {
      if (kind !== 'time') Object.assign(o, { day: '2-digit', month: '2-digit', year: '2-digit' });
      if (kind === 'datetime' || kind === 'time') Object.assign(o, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      return o;
    }
    if (o.hour && o.hour12 == null && !o.hourCycle) o.hourCycle = 'h23';
    const textualMonth = o.month && !['numeric', '2-digit'].includes(o.month);
    if (hasDate && !textualMonth && !o.weekday && o.day && o.month) {
      o.day = '2-digit'; o.month = '2-digit';
      if (o.year) o.year = '2-digit';
    }
    return o;
  }
  const nativeDate = Date.prototype.toLocaleDateString;
  const nativeString = Date.prototype.toLocaleString;
  Date.prototype.toLocaleDateString = function (locales, options) {
    return isSpanish(locales) ? nativeDate.call(this, 'es-AR', normalize(options, 'date')) : nativeDate.call(this, locales, options);
  };
  Date.prototype.toLocaleString = function (locales, options) {
    return isSpanish(locales) ? nativeString.call(this, 'es-AR', normalize(options, 'datetime')) : nativeString.call(this, locales, options);
  };
  const NativeDTF = Intl.DateTimeFormat;
  function AuxDateTimeFormat(locales, options) {
    if (!isSpanish(locales)) return new NativeDTF(locales, options);
    return new NativeDTF('es-AR', normalize(options, 'date'));
  }
  AuxDateTimeFormat.prototype = NativeDTF.prototype;
  AuxDateTimeFormat.supportedLocalesOf = NativeDTF.supportedLocalesOf.bind(NativeDTF);
  Intl.DateTimeFormat = AuxDateTimeFormat;
  /* Para las pantallas que arman la fecha a mano. Acepta Date, ISO con hora o
     'AAAA-MM-DD' (sin corrimiento de zona). */
  root.auxFormatDate = function (value, { time = false } = {}) {
    if (!value) return '';
    const raw = String(value);
    if (!time && /^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10)) && raw.length <= 10) {
      const [y, m, d] = raw.split('-');
      return `${d}/${m}/${y.slice(2)}`;
    }
    const date = value instanceof Date ? value : new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    const p = n => String(n).padStart(2, '0');
    const out = `${p(date.getDate())}/${p(date.getMonth() + 1)}/${String(date.getFullYear()).slice(2)}`;
    return time ? `${out} ${p(date.getHours())}:${p(date.getMinutes())}` : out;
  };
})();

// Build visible para distinguir previews y evitar confundir ramas antiguas.
window.AUXILIOS_BUILD_ID = 'remito-encuesta-v152-20260926';

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

  loadAuxiliosStyle('auxilios-filters-v1-css', '/auxilios-filters-v1.css');
  await loadAuxiliosModule('auxilios-filters-v1', '/auxilios-filters-v1.js');
  loadAuxiliosStyle('auxilios-remitos-admin-panel-v1-css', '/remitos-admin-panel-v1.css');
  await loadAuxiliosModule('auxilios-remitos-admin-panel-v1', '/remitos-admin-panel-v1.js');
  await loadAuxiliosModule('auxilios-remito-pdf-v2', '/remito-pdf-v2.js');
  loadAuxiliosStyle('auxilios-remitos-filtros-sheet-v1-css', '/remitos-filtros-sheet-v1.css');
  await loadAuxiliosModule('auxilios-remitos-filtros-sheet-v1', '/remitos-filtros-sheet-v1.js');
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

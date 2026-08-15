/* AuxiliOS · Experiencia operativa diaria v1 */
(() => {
  'use strict';

  const S = {
    basesLoadedAt: 0,
    basesObserver: null,
    serviceSaveWrapped: false,
    companySyncBound: false,
  };

  const role = () => String(
    typeof PERFIL_USUARIO === 'undefined'
      ? ''
      : (PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role || PERFIL_USUARIO?.role_name || '')
  ).toLowerCase();
  const canReadBases = () => ['administracion', 'facturacion', 'supervision'].includes(role());
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  function injectStyles() {
    if (document.getElementById('daily-operations-experience-v1-css')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="daily-operations-experience-v1-css">
      #screen-operaciones .os-table{width:100%!important;min-width:0!important;table-layout:fixed!important}
      #screen-operaciones .os-table th,#screen-operaciones .os-table td{min-width:0!important;box-sizing:border-box}
      #screen-operaciones .os-table th{padding-left:5px!important;padding-right:5px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #screen-operaciones .os-table td{padding-left:5px!important;padding-right:5px!important;font-size:9.5px!important}
      #screen-operaciones .os-table th.col-code{width:6%!important}
      #screen-operaciones .os-table th.col-datetime{width:6%!important}
      #screen-operaciones .os-table th.col-arrival,#screen-operaciones .os-table th.col-finish,#screen-operaciones .os-table th.col-delay{width:4.25%!important}
      #screen-operaciones .os-table th.col-provider{width:7%!important}
      #screen-operaciones .os-table th.col-base{width:6%!important}
      #screen-operaciones .os-table th.col-type{width:7%!important}
      #screen-operaciones .os-table th.col-origin,#screen-operaciones .os-table th.col-destination{width:12%!important}
      #screen-operaciones .os-table th.col-client{width:7%!important}
      #screen-operaciones .os-table th.col-km{width:4.5%!important}
      #screen-operaciones .os-table th.col-driver{width:6.5%!important}
      #screen-operaciones .os-table th.col-mobile{width:4.5%!important}
      #screen-operaciones .os-table th.col-status{width:6.5%!important}
      #screen-operaciones .os-table th.col-amount_due{width:6.5%!important}
      #screen-operaciones .os-table th.col-actions{width:3%!important}
      #screen-operaciones .os-table td b,#screen-operaciones .os-table td small,#screen-operaciones .os-status{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #screen-operaciones .os-status{display:flex!important;width:100%!important;box-sizing:border-box;justify-content:center}
      #screen-operaciones .os-table-wrap{overflow-x:auto}
      #screen-operaciones tr.os-row-created{animation:osRowCreated 2.4s ease-out}
      @keyframes osRowCreated{0%,35%{box-shadow:inset 4px 0 0 var(--green),0 0 0 1px rgba(39,196,122,.35);background:var(--green-lo)}100%{box-shadow:none;background:var(--panel)}}
      @media(max-width:1220px){
        #screen-operaciones .os-table th.col-origin,#screen-operaciones .os-table th.col-destination{width:10.5%!important}
        #screen-operaciones .os-table th.col-provider,#screen-operaciones .os-table th.col-type{width:6.5%!important}
        #screen-operaciones .os-table th.col-client{width:6.5%!important}
        #screen-operaciones .os-table td{font-size:9px!important}
      }
      @media(max-width:980px){#screen-operaciones .os-table{min-width:1050px!important}}
    </style>`);
  }

  async function loadBases(force = false) {
    if (!canReadBases() || typeof window.cargarBasesGeograficas !== 'function' || typeof _db === 'undefined') return;
    const now = Date.now();
    if (!force && S.basesLoadedAt && now - S.basesLoadedAt < 60000) return;
    try {
      await window.cargarBasesGeograficas();
      S.basesLoadedAt = Date.now();
    } catch (error) {
      S.basesLoadedAt = 0;
      console.warn('[daily ux] bases geográficas', error?.message || error);
    }
  }

  function observeBasesScreen() {
    const screen = document.getElementById('screen-bases-geograficas');
    if (!screen || S.basesObserver) return;
    S.basesObserver = new MutationObserver(() => {
      if (screen.classList.contains('active')) loadBases(false);
    });
    S.basesObserver.observe(screen, { attributes: true, attributeFilter: ['class'] });
  }

  function highlightService(serviceId) {
    if (!serviceId) return;
    requestAnimationFrame(() => {
      const row = document.querySelector(`#os-table-body tr[data-service-id="${serviceId}"]`);
      if (!row) return;
      row.classList.remove('os-row-created');
      void row.offsetWidth;
      row.classList.add('os-row-created');
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      setTimeout(() => row.classList.remove('os-row-created'), 2600);
    });
  }

  function wrapServiceCreateFlow() {
    if (S.serviceSaveWrapped) return;
    const original = window.guardarServicioWorkspace;
    if (typeof original !== 'function') return;

    const wrapped = async function (...args) {
      const wizard = window.OperatorServices?.S?.wizard;
      const wasCreate = wizard?.mode === 'create';
      const result = await original.apply(this, args);
      if (!wasCreate) return result;

      const current = window.OperatorServices?.S?.wizard;
      if (current?.mode === 'view' && current?.serviceId) {
        const createdId = current.serviceId;
        window.cerrarNuevoServicio?.(true);
        highlightService(createdId);
      }
      return result;
    };

    wrapped.__dailyOperationsExperienceV1 = true;
    window.guardarServicioWorkspace = wrapped;
    if (window.crearNuevoServicio === original) window.crearNuevoServicio = wrapped;
    S.serviceSaveWrapped = true;
  }

  async function refreshServiceCompanies() {
    const operator = window.OperatorServices;
    if (!operator?.loadReferences || !operator?.S) return;
    try {
      operator.S.referencesLoaded = false;
      await operator.loadReferences();
      if (operator.S.company !== 'all' && !operator.S.companies.some(company => String(company.company_id) === String(operator.S.company))) {
        operator.S.company = 'all';
        const selector = document.getElementById('os-company');
        if (selector) selector.value = 'all';
      }
      operator.renderServices?.();
    } catch (error) {
      console.warn('[daily ux] referencias de prestadoras', error?.message || error);
    }
  }

  async function waitForCompanySave() {
    const modal = document.getElementById('modal-empresa');
    if (!modal) return;
    const started = Date.now();
    while (Date.now() - started < 15000) {
      await wait(120);
      if (!modal.classList.contains('open')) {
        await refreshServiceCompanies();
        return;
      }
    }
  }

  function bindCompanyStatusSync() {
    if (S.companySyncBound) return;
    document.addEventListener('click', event => {
      if (event.target.closest?.('#ec-save')) waitForCompanySave();
    });
    S.companySyncBound = true;
  }

  function init() {
    injectStyles();
    wrapServiceCreateFlow();
    bindCompanyStatusSync();
    observeBasesScreen();
    loadBases(true);

    let attempts = 0;
    const retry = setInterval(() => {
      wrapServiceCreateFlow();
      observeBasesScreen();
      if (S.serviceSaveWrapped && document.getElementById('screen-bases-geograficas')) clearInterval(retry);
      else if (++attempts > 80) clearInterval(retry);
    }, 100);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();

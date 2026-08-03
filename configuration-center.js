/* AuxiliOS · Centro de configuración y navegación administrativa */
(() => {
  'use strict';

  const S = {
    flyoutOpen: false,
    loading: false,
    summary: null,
    audit: [],
    auditLoading: false,
    auditQuery: '',
    auditOperation: 'all',
  };

  const BACKOFFICE_ROLES = new Set(['administracion', 'supervision', 'facturacion']);
  const MANAGEMENT_ROLES = new Set(['administracion', 'supervision']);
  const CONFIG_CHILD_ROUTES = new Set([
    'empresas',
    'bases-geograficas',
    'bases-tarifarias',
    'config-service-types',
    'config-tariff-types',
  ]);

  const role = () => String(typeof PERFIL_USUARIO === 'undefined'
    ? ''
    : (PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role || '')).toLowerCase();
  const canUseCenter = () => BACKOFFICE_ROLES.has(role());
  const canUseManagementTools = () => MANAGEMENT_ROLES.has(role());
  const canWrite = () => role() === 'administracion';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
  const notify = (message, type = 'info') => typeof toast === 'function'
    ? toast(message, type)
    : console[type === 'error' ? 'error' : 'log'](message);
  const dateTime = value => value
    ? new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
  const hasTariff = row => Boolean(row?.valid_from) && (
    row.service_day_value != null
    || row.service_day_mode === 'automatic'
    || row.asphalt_day_value != null
    || row.asphalt_day_mode === 'automatic'
  );

  function inject() {
    if (document.getElementById('screen-configuracion')) return;

    const css = document.createElement('link');
    css.id = 'configuration-center-css';
    css.rel = 'stylesheet';
    css.href = '/configuration-center.css';
    document.head.appendChild(css);

    const bottom = document.querySelector('.sidenav .nav-bottom');
    bottom?.insertAdjacentHTML('beforebegin', `
      <div class="nav-item aux-config-trigger" id="nav-configuracion" onclick="abrirCentroConfiguracion(event)" style="display:none">
        <span class="nav-icon">⚙️</span><span class="nav-label">Configuración</span><span class="nav-caret">⌄</span>
      </div>
      <div class="nav-item" id="nav-historial-sistema" onclick="goTo('historial-sistema')" style="display:none">
        <span class="nav-icon">◷</span><span class="nav-label">Historial</span>
      </div>`);

    document.querySelector('.content')?.insertAdjacentHTML('beforeend', `
      <div class="screen" id="screen-configuracion"><div class="aux-loading">Cargando Centro de Configuración…</div></div>
      <div class="screen" id="screen-historial-sistema"><div class="aux-loading">Cargando historial…</div></div>`);

    document.body.insertAdjacentHTML('beforeend', `
      <aside class="aux-config-flyout" id="aux-config-flyout" aria-hidden="true">
        <div class="aux-config-flyout-head">
          <div><small>Centro administrativo</small><b>Configuración</b><p>Accesos organizados por dominio, sin duplicar módulos ni permisos.</p></div>
          <button class="aux-config-close" onclick="cerrarMenuConfiguracion()" aria-label="Cerrar">×</button>
        </div>
        <div class="aux-config-flyout-body">
          ${flyoutGroup('Empresas y red', 'aux-config-company')}
          ${flyoutGroup('Operación', 'aux-config-operation')}
          ${flyoutGroup('Tarifas y facturación', 'aux-config-billing')}
          ${flyoutGroup('Datos', 'aux-config-data')}
        </div>
      </aside>`);
  }

  function flyoutGroup(title, id) {
    return `<section class="aux-config-group"><div class="aux-config-group-title">${title}</div><div class="aux-config-group-links" id="${id}"></div></section>`;
  }

  function ensureScreens() {
    if (typeof SCREENS === 'undefined') return;
    Object.assign(SCREENS, {
      configuracion: { title: 'CENTRO DE CONFIGURACIÓN', sub: 'Módulos, parámetros y estado general' },
      'historial-sistema': { title: 'HISTORIAL', sub: 'Auditoría y registros administrativos' },
      empresas: { title: 'PRESTADORAS / EMPRESAS', sub: 'Configuración contractual de clientes corporativos' },
      'bases-geograficas': { title: 'BASES GEOGRÁFICAS', sub: 'Puntos de referencia reutilizables' },
      'bases-tarifarias': { title: 'BASES GEOGRÁFICAS', sub: 'Puntos de referencia reutilizables' },
      'config-service-types': { title: 'TIPOS DE SERVICIO', sub: 'Catálogo operativo global' },
      'config-tariff-types': { title: 'TIPOS DE TARIFA', sub: 'Reglas de cálculo por familia' },
      'config-tariff-matrix': { title: 'FACTURACIÓN', sub: 'Matriz tarifaria e historial de vigencias' },
    });
  }

  function setNavContent(id, icon, label) {
    const node = document.getElementById(id);
    if (!node) return null;
    const iconNode = node.querySelector('.nav-icon');
    const labelNode = node.querySelector('.nav-label');
    if (iconNode) iconNode.textContent = icon;
    if (labelNode) labelNode.textContent = label;
    return node;
  }

  function actionLink(id, icon, label, subtitle, action, tag = '') {
    return `<button type="button" class="aux-config-link" id="${id}" onclick="${action}"><span class="aux-config-link-icon">${icon}</span><span class="aux-config-link-label">${label}<small>${subtitle}</small></span>${tag ? `<span class="aux-config-link-tag">${tag}</span>` : '<span>›</span>'}</button>`;
  }

  function futureLink(id, icon, label, subtitle) {
    return `<div class="aux-config-link future" id="${id}"><span class="aux-config-link-icon">${icon}</span><span class="aux-config-link-label">${label}<small>${subtitle}</small></span><span class="aux-config-link-tag">Próxima fase</span></div>`;
  }

  function populateFlyout() {
    const companyGroup = document.getElementById('aux-config-company');
    const operationGroup = document.getElementById('aux-config-operation');
    const billingGroup = document.getElementById('aux-config-billing');
    const dataGroup = document.getElementById('aux-config-data');
    if (!companyGroup || !operationGroup || !billingGroup || !dataGroup) return;

    const companies = document.getElementById('nav-empresas');
    const bases = document.getElementById('nav-bases-geograficas');
    const services = document.getElementById('nav-config-service-types');
    const tariffTypes = document.getElementById('nav-config-tariff-types');

    companyGroup.replaceChildren();
    if (companies) {
      companies.classList.add('aux-config-nav-link');
      companyGroup.appendChild(companies);
    }
    companyGroup.insertAdjacentHTML('beforeend', futureLink('aux-future-particulares', '👤', 'Particulares', 'Clientes sin convenio corporativo'));
    if (bases) {
      bases.classList.add('aux-config-nav-link');
      companyGroup.appendChild(bases);
    }

    operationGroup.replaceChildren();
    if (services) {
      services.classList.add('aux-config-nav-link');
      operationGroup.appendChild(services);
    }
    if (canUseManagementTools()) {
      operationGroup.insertAdjacentHTML('beforeend', actionLink('aux-settings-fleet', '🚛', 'Vehículos', 'Flota y móviles registrados', "abrirHerramientaConfiguracion('tab-flota')"));
      operationGroup.insertAdjacentHTML('beforeend', actionLink('aux-settings-users', '👥', 'Choferes y personal', 'Usuarios, roles y estado', "abrirHerramientaConfiguracion('tab-usuarios')"));
      operationGroup.insertAdjacentHTML('beforeend', actionLink('aux-settings-maintenance', '🔧', 'Mantenimiento', 'Planes y seguimiento de taller', "abrirHerramientaConfiguracion('tab-mantenimiento')"));
      operationGroup.insertAdjacentHTML('beforeend', actionLink('aux-settings-grid', '🗓️', 'Grilla de móviles', 'Asignaciones y francos', "irModuloConfiguracion('grilla')"));
    }
    operationGroup.insertAdjacentHTML('beforeend', futureLink('aux-future-outsourced', '↗️', 'Logística tercerizada', 'Prestadores, recursos y disponibilidad'));

    billingGroup.replaceChildren();
    if (tariffTypes) {
      tariffTypes.classList.add('aux-config-nav-link');
      billingGroup.appendChild(tariffTypes);
    }
    billingGroup.insertAdjacentHTML('beforeend', futureLink('aux-future-surcharges', '％', 'Parámetros y recargos', 'Nocturnidad, distancia y reglas especiales'));
    billingGroup.insertAdjacentHTML('beforeend', futureLink('aux-future-tolls', '🛣️', 'Peajes y adicionales', 'Conceptos automáticos y comprobantes'));
    billingGroup.insertAdjacentHTML('beforeend', futureLink('aux-future-holidays', '📅', 'Feriados', 'Calendario aplicable a la facturación'));
    billingGroup.insertAdjacentHTML('beforeend', '<div class="aux-config-group-note">La matriz tarifaria se abre desde el acceso principal <b>Facturación</b>.</div>');

    dataGroup.innerHTML = [
      futureLink('aux-future-import', '⬆️', 'Importar Excel', 'Carga masiva con validación previa'),
      futureLink('aux-future-export', '⬇️', 'Exportar información', 'Descarga controlada por permisos'),
      futureLink('aux-future-import-history', '◷', 'Historial de importaciones', 'Resultados, errores y trazabilidad'),
    ].join('');
  }

  function configureTopNavigation() {
    const currentRole = role();
    if (!currentRole) return;

    const configurationNav = document.getElementById('nav-configuracion');
    const historyNav = document.getElementById('nav-historial-sistema');
    if (!canUseCenter()) {
      document.body.classList.remove('aux-backoffice-nav');
      if (configurationNav) configurationNav.style.display = 'none';
      if (historyNav) historyNav.style.display = 'none';
      setFlyout(false);
      return;
    }

    document.body.classList.add('aux-backoffice-nav');
    if (configurationNav) configurationNav.style.display = '';
    if (historyNav) historyNav.style.display = '';

    const sidenav = document.querySelector('.sidenav');
    const bottom = sidenav?.querySelector('.nav-bottom');
    if (!sidenav || !bottom) return;

    const dashboard = setNavContent('nav-dashboard', '📊', 'Resumen');
    const operations = setNavContent('nav-operaciones', '🧭', 'Servicios');
    const billing = setNavContent('nav-config-tariff-matrix', '💳', 'Facturación');
    setNavContent('nav-configuracion', '⚙️', 'Configuración');
    setNavContent('nav-historial-sistema', '◷', 'Historial');

    [dashboard, operations, configurationNav, billing, historyNav].filter(Boolean).forEach(node => {
      node.classList.add('aux-top-nav');
      sidenav.insertBefore(node, bottom);
    });

    populateFlyout();
  }

  function setFlyout(open) {
    S.flyoutOpen = Boolean(open) && canUseCenter();
    const flyout = document.getElementById('aux-config-flyout');
    const trigger = document.getElementById('nav-configuracion');
    flyout?.classList.toggle('open', S.flyoutOpen);
    trigger?.classList.toggle('open', S.flyoutOpen);
    flyout?.setAttribute('aria-hidden', S.flyoutOpen ? 'false' : 'true');
  }

  function openCenter(event) {
    event?.stopPropagation?.();
    if (!canUseCenter()) return notify('Sin permiso para acceder a Configuración', 'error');
    const centerActive = document.getElementById('screen-configuracion')?.classList.contains('active');
    if (!centerActive && typeof goTo === 'function') goTo('configuracion');
    setFlyout(centerActive ? !S.flyoutOpen : true);
  }

  function closeFlyout() {
    setFlyout(false);
  }

  function markConfigurationActive(routeName) {
    if (!CONFIG_CHILD_ROUTES.has(routeName)) return;
    document.getElementById('nav-configuracion')?.classList.add('active');
  }

  function installNavigationHook() {
    const previous = window.goTo;
    if (typeof previous !== 'function' || previous.__configurationCenterWrapped) return false;

    const wrapped = function(name, ...args) {
      if (['configuracion', 'historial-sistema'].includes(name) && !canUseCenter()) {
        return notify('Sin permiso para acceder a este módulo', 'error');
      }
      const result = previous.call(this, name, ...args);
      if (name === 'configuracion') {
        loadSummary();
      } else if (name === 'historial-sistema') {
        closeFlyout();
        loadHistory();
      } else {
        closeFlyout();
        markConfigurationActive(name);
      }
      return result;
    };
    wrapped.__configurationCenterWrapped = true;
    window.goTo = wrapped;
    return true;
  }

  function goModule(routeName) {
    closeFlyout();
    if (typeof goTo === 'function') goTo(routeName);
  }

  async function openSettingsTab(tabId) {
    if (!canUseManagementTools()) return notify('Tu rol no tiene acceso a esta herramienta', 'error');
    closeFlyout();
    if (typeof openSettingsHub !== 'function' || typeof switchConfigTab !== 'function') {
      return notify('La herramienta todavía no está disponible', 'error');
    }
    await openSettingsHub();
    switchConfigTab(tabId);
  }

  async function mapLimit(items, limit, mapper) {
    const queue = [...items];
    const results = [];
    const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (!item) continue;
        results.push(await mapper(item));
      }
    });
    await Promise.all(workers);
    return results;
  }

  async function companyCommercialState(company) {
    try {
      const billingResult = await _db.rpc('get_company_billing_configuration', {
        p_company_id: company.company_id,
        p_scheduled_for: new Date().toISOString(),
      });
      if (billingResult.error) throw billingResult.error;
      const setting = billingResult.data?.setting || null;
      const bases = (billingResult.data?.links || []).filter(link => link.is_active !== false && link.base_active !== false);
      const coverage = await Promise.all(bases.map(async base => {
        const matrixResult = await _db.rpc('list_company_tariff_matrix_v2', {
          p_company_id: company.company_id,
          p_base_id: base.base_id,
          p_as_of: new Date().toISOString().slice(0, 10),
        });
        if (matrixResult.error) return false;
        return (Array.isArray(matrixResult.data) ? matrixResult.data : []).some(hasTariff);
      }));
      const coveredBases = coverage.filter(Boolean).length;
      return {
        companyId: company.company_id,
        setting,
        bases: bases.length,
        coveredBases,
        tariffComplete: bases.length > 0 && coveredBases === bases.length,
        configured: Boolean(setting) && bases.length > 0,
        activeRules: [setting?.route_mode, setting?.toll_calculation_mode, setting?.requires_verified_base].filter(value => value !== null && value !== undefined && value !== '').length,
      };
    } catch (error) {
      console.warn('[centro configuración] resumen empresa:', company.company_id, error);
      return { companyId: company.company_id, setting: null, bases: 0, coveredBases: 0, tariffComplete: false, configured: false, activeRules: 0 };
    }
  }

  async function loadSummary(force = false) {
    if (!canUseCenter() || S.loading || (S.summary && !force)) {
      if (S.summary) renderCenter();
      return;
    }
    S.loading = true;
    renderCenter();
    try {
      const [companiesResult, basesResult, servicesResult, tariffTypesResult] = await Promise.all([
        _db.from('companies').select('company_id,status').order('company_id'),
        _db.rpc('list_geographic_bases', { p_include_inactive: true }),
        _db.rpc('list_service_types_config', { p_include_inactive: true }),
        _db.rpc('list_tariff_types_config'),
      ]);
      if (companiesResult.error) throw companiesResult.error;
      if (basesResult.error) throw basesResult.error;
      if (servicesResult.error) throw servicesResult.error;
      if (tariffTypesResult.error) throw tariffTypesResult.error;

      const companies = companiesResult.data || [];
      const activeCompanies = companies.filter(company => company.status === 'active');
      const bases = Array.isArray(basesResult.data) ? basesResult.data : [];
      const services = Array.isArray(servicesResult.data) ? servicesResult.data : [];
      const tariffTypes = Array.isArray(tariffTypesResult.data) ? tariffTypesResult.data : [];
      const commercial = await mapLimit(activeCompanies, 3, companyCommercialState);

      S.summary = { companies, activeCompanies, bases, services, tariffTypes, commercial };
    } catch (error) {
      console.error('[centro configuración] carga:', error);
      notify(error.message || 'No se pudo cargar el Centro de Configuración', 'error');
      S.summary = { error: true, companies: [], activeCompanies: [], bases: [], services: [], tariffTypes: [], commercial: [] };
    } finally {
      S.loading = false;
      renderCenter();
    }
  }

  function stat(label, value) {
    return `<div class="aux-center-card-stat"><small>${esc(label)}</small><b>${esc(value)}</b></div>`;
  }

  function centerCard({ icon, title, description, stats, status, tone = '', action = '', disabled = false }) {
    return `<article class="aux-center-card"><div class="aux-center-card-top"><div class="aux-center-card-icon">${icon}</div><div><h3>${esc(title)}</h3><p>${esc(description)}</p></div></div><div class="aux-center-card-stats">${stats.map(([label, value]) => stat(label, value)).join('')}</div><div class="aux-center-card-foot"><span class="aux-center-status ${tone}">${esc(status)}</span><button class="aux-center-open" ${disabled ? 'disabled' : `onclick="${action}"`}>${disabled ? 'Próxima fase' : 'Abrir →'}</button></div></article>`;
  }

  function overviewKpi(label, value, note) {
    return `<div class="aux-center-kpi"><small>${esc(label)}</small><b>${esc(value)}</b><span>${esc(note)}</span></div>`;
  }

  function renderCenter() {
    const root = document.getElementById('screen-configuracion');
    if (!root) return;
    if (!canUseCenter()) {
      root.innerHTML = '<div class="aux-empty">Tu rol no tiene acceso al Centro de Configuración.</div>';
      return;
    }
    if (S.loading && !S.summary) {
      root.innerHTML = '<div class="aux-loading">Analizando módulos y configuraciones…</div>';
      return;
    }

    const data = S.summary || { companies: [], activeCompanies: [], bases: [], services: [], tariffTypes: [], commercial: [] };
    const activeBases = data.bases.filter(base => base.is_active !== false);
    const verifiedBases = activeBases.filter(base => base.address_verified);
    const activeServices = data.services.filter(service => service.is_active !== false);
    const primary = activeServices.filter(service => service.category === 'primary').length;
    const secondary = activeServices.filter(service => service.category === 'secondary').length;
    const mixed = activeServices.filter(service => service.category === 'mixed').length;
    const fullyTariffed = data.commercial.filter(item => item.tariffComplete).length;
    const partiallyTariffed = data.commercial.filter(item => item.coveredBases > 0 && !item.tariffComplete).length;
    const configuredCompanies = data.commercial.filter(item => item.configured).length;
    const incompleteCompanies = Math.max(data.activeCompanies.length - data.commercial.filter(item => item.configured && item.tariffComplete).length, 0);
    const activeRules = data.commercial.reduce((sum, item) => sum + item.activeRules, 0);
    const readOnly = !canWrite();

    const cards = [
      centerCard({
        icon: '🏢', title: 'Prestadoras', description: 'Datos legales, contactos, bases y reglas contractuales.',
        stats: [['Total', data.companies.length], ['Activas', data.activeCompanies.length], ['Incompletas', incompleteCompanies]],
        status: incompleteCompanies ? `${incompleteCompanies} requieren atención` : 'Configuración al día', tone: incompleteCompanies ? 'warn' : '', action: "irModuloConfiguracion('empresas')",
      }),
      centerCard({
        icon: '📍', title: 'Bases geográficas', description: 'Puntos reutilizables para recorridos y facturación.',
        stats: [['Total', data.bases.length], ['Validadas', verifiedBases.length], ['Pendientes', Math.max(activeBases.length - verifiedBases.length, 0)]],
        status: activeBases.length === verifiedBases.length ? 'Todas verificadas' : 'Hay direcciones pendientes', tone: activeBases.length === verifiedBases.length ? '' : 'warn', action: "irModuloConfiguracion('bases-geograficas')",
      }),
      centerCard({
        icon: '🛠️', title: 'Tipos de servicio', description: 'Catálogo global y clasificación operativa.',
        stats: [['Primarios', primary], ['Secundarios', secondary], ['Mixtos', mixed]],
        status: `${activeServices.length} servicios habilitados`, action: "irModuloConfiguracion('config-service-types')",
      }),
      centerCard({
        icon: '💳', title: 'Tarifas', description: 'Cobertura vigente por prestadora, base y servicio.',
        stats: [['Completas', fullyTariffed], ['Parciales', partiallyTariffed], ['Tipos', data.tariffTypes.length]],
        status: fullyTariffed === data.activeCompanies.length && data.activeCompanies.length ? 'Cobertura completa' : 'Revisar vigencias', tone: fullyTariffed === data.activeCompanies.length && data.activeCompanies.length ? '' : 'warn', action: "irModuloConfiguracion('config-tariff-matrix')",
      }),
      centerCard({
        icon: '🛡️', title: 'Parámetros', description: 'Recorridos, peajes y validaciones configuradas por prestadora.',
        stats: [['Configuradas', configuredCompanies], ['Pendientes', Math.max(data.activeCompanies.length - configuredCompanies, 0)], ['Reglas activas', activeRules]],
        status: configuredCompanies === data.activeCompanies.length && data.activeCompanies.length ? 'Parámetros completos' : 'Configuración parcial', tone: configuredCompanies === data.activeCompanies.length && data.activeCompanies.length ? '' : 'warn', action: "irModuloConfiguracion('empresas')",
      }),
      centerCard({
        icon: '⬆️', title: 'Importaciones', description: 'Carga masiva, validación y trazabilidad de archivos.',
        stats: [['Última carga', '—'], ['Errores', '—'], ['Estado', 'No activo']],
        status: 'Módulo todavía no habilitado', tone: 'muted', disabled: true,
      }),
    ];

    root.innerHTML = `<section class="aux-center-page">
      <header class="aux-center-head"><div><div class="aux-center-eyebrow">Administración central</div><h2>Centro de Configuración</h2><p>Una única entrada para administrar la red, la operación y la facturación. Cada módulo conserva sus permisos y su fuente de datos original.</p></div><button class="btn btn-ghost" onclick="actualizarCentroConfiguracion()">↻ Actualizar</button></header>
      ${readOnly ? '<div class="aux-center-readonly">Acceso de consulta. Las modificaciones continúan reservadas a Administración.</div>' : ''}
      <div class="aux-center-overview">
        ${overviewKpi('Prestadoras activas', data.activeCompanies.length, `${incompleteCompanies} con pendientes`)}
        ${overviewKpi('Bases verificadas', verifiedBases.length, `${activeBases.length} activas`)}
        ${overviewKpi('Servicios activos', activeServices.length, `${primary} pueden iniciar servicios`)}
        ${overviewKpi('Tarifarios completos', fullyTariffed, `${data.activeCompanies.length} prestadoras activas`)}
      </div>
      <div class="aux-center-grid">${cards.join('')}</div>
      ${managementTools()}
    </section>`;
  }

  function tool(icon, title, subtitle, action) {
    return `<button class="aux-center-tool" onclick="${action}"><span>${icon}</span><b>${esc(title)}</b><small>${esc(subtitle)}</small></button>`;
  }

  function managementTools() {
    if (!canUseManagementTools()) return '';
    return `<section class="aux-center-tools"><div class="aux-center-tools-head"><div><h3>Herramientas administrativas</h3><p>Accesos contextuales que antes ocupaban lugares separados en la navegación.</p></div></div><div class="aux-center-tool-grid">
      ${tool('🚛', 'Flota', 'Vehículos y móviles', "abrirHerramientaConfiguracion('tab-flota')")}
      ${tool('👥', 'Personal', 'Choferes y usuarios', "abrirHerramientaConfiguracion('tab-usuarios')")}
      ${tool('🔧', 'Mantenimiento', 'Planes y controles', "abrirHerramientaConfiguracion('tab-mantenimiento')")}
      ${tool('🗓️', 'Grilla', 'Asignaciones mensuales', "irModuloConfiguracion('grilla')")}
      ${tool('💵', 'Liquidaciones', 'Sueldos y rendiciones', "irModuloConfiguracion('sueldos')")}
    </div></section>`;
  }

  async function loadHistory(force = false) {
    if (!canUseCenter() || S.auditLoading || (S.audit.length && !force)) {
      renderHistory();
      return;
    }
    S.auditLoading = true;
    renderHistory();
    try {
      const { data, error } = await _db.from('audit_events')
        .select('event_id,occurred_at,actor_id,operation,entity_table,entity_id')
        .order('occurred_at', { ascending: false })
        .limit(250);
      if (error) throw error;
      S.audit = data || [];
    } catch (error) {
      console.error('[historial administrativo] carga:', error);
      notify(error.message || 'No se pudo cargar el historial', 'error');
      S.audit = [];
    } finally {
      S.auditLoading = false;
      renderHistory();
    }
  }

  const ENTITY_LABELS = {
    companies: 'Prestadora',
    company_contacts: 'Contacto de prestadora',
    company_branches: 'Sucursal heredada',
    billing_bases: 'Base geográfica',
    company_billing_settings: 'Configuración de facturación',
    company_billing_base_links: 'Vínculo de base',
    service_concepts: 'Tipo de servicio',
    tariff_types: 'Tipo de tarifa',
    company_service_settings: 'Servicio de prestadora',
    company_service_price_versions: 'Versión tarifaria',
    operator_services: 'Servicio operativo',
    users: 'Usuario',
    trucks: 'Vehículo',
    remitos: 'Remito',
    jornadas: 'Jornada',
  };

  function entityLabel(table) {
    return ENTITY_LABELS[table] || String(table || 'Registro').replaceAll('_', ' ');
  }

  function operationLabel(operation) {
    return ({ INSERT: 'Alta', UPDATE: 'Modificación', DELETE: 'Baja' }[operation] || operation || 'Cambio');
  }

  function renderHistory() {
    const root = document.getElementById('screen-historial-sistema');
    if (!root) return;
    if (!canUseCenter()) {
      root.innerHTML = '<div class="aux-empty">Tu rol no tiene acceso al historial administrativo.</div>';
      return;
    }
    if (S.auditLoading && !S.audit.length) {
      root.innerHTML = '<div class="aux-loading">Cargando eventos de auditoría…</div>';
      return;
    }

    const query = S.auditQuery.toLowerCase().trim();
    const rows = S.audit.filter(event => {
      const matchesOperation = S.auditOperation === 'all' || event.operation === S.auditOperation;
      const matchesQuery = !query || `${entityLabel(event.entity_table)} ${event.entity_table || ''} ${event.entity_id || ''} ${operationLabel(event.operation)}`.toLowerCase().includes(query);
      return matchesOperation && matchesQuery;
    });

    root.innerHTML = `<section class="aux-center-page">
      <header class="aux-center-head"><div><div class="aux-center-eyebrow">Trazabilidad</div><h2>Historial administrativo</h2><p>Eventos auditados de configuración y operación. Se muestran metadatos de cambio, sin exponer contenido comercial protegido.</p></div><div class="aux-history-shortcuts">${historyShortcuts()}<button class="btn btn-ghost" onclick="actualizarHistorialSistema()">↻ Actualizar</button></div></header>
      <section class="aux-history-panel">
        <div class="aux-history-toolbar"><input class="form-input" id="aux-history-q" value="${esc(S.auditQuery)}" placeholder="Buscar módulo, entidad o identificador" oninput="filtrarHistorialSistema(this.value)"><select class="form-input" id="aux-history-operation" onchange="filtrarOperacionHistorial(this.value)"><option value="all" ${S.auditOperation === 'all' ? 'selected' : ''}>Todas las acciones</option><option value="INSERT" ${S.auditOperation === 'INSERT' ? 'selected' : ''}>Altas</option><option value="UPDATE" ${S.auditOperation === 'UPDATE' ? 'selected' : ''}>Modificaciones</option><option value="DELETE" ${S.auditOperation === 'DELETE' ? 'selected' : ''}>Bajas</option></select><span style="font-size:9px;color:var(--muted);white-space:nowrap">${rows.length} eventos</span></div>
        <div class="aux-history-table-wrap"><table class="aux-history-table"><thead><tr><th>Fecha</th><th>Acción</th><th>Módulo</th><th>Identificador</th><th>Origen</th></tr></thead><tbody>${rows.length ? rows.map(historyRow).join('') : '<tr><td colspan="5"><div class="aux-empty">No hay eventos que coincidan con los filtros.</div></td></tr>'}</tbody></table></div>
      </section>
    </section>`;
  }

  function historyRow(event) {
    const operation = String(event.operation || '').toLowerCase();
    return `<tr><td>${dateTime(event.occurred_at)}</td><td><span class="aux-history-operation ${operation}">${esc(operationLabel(event.operation))}</span></td><td><div class="aux-history-entity"><b>${esc(entityLabel(event.entity_table))}</b><small>${esc(event.entity_table || '—')}</small></div></td><td>${esc(event.entity_id || '—')}</td><td>${event.actor_id ? 'Usuario autenticado' : 'Sistema'}</td></tr>`;
  }

  function historyShortcuts() {
    const links = [];
    if (canUseManagementTools()) {
      links.push('<button class="btn btn-ghost" onclick="irModuloConfiguracion(\'jornadas-admin\')">Jornadas</button>');
      links.push('<button class="btn btn-ghost" onclick="irModuloConfiguracion(\'documentos\')">Documentación</button>');
    }
    links.push('<button class="btn btn-ghost" onclick="irModuloConfiguracion(\'remitos\')">Remitos</button>');
    return links.join('');
  }

  function setAuditQuery(value) {
    S.auditQuery = String(value || '');
    renderHistory();
    const input = document.getElementById('aux-history-q');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  function setAuditOperation(value) {
    S.auditOperation = value || 'all';
    renderHistory();
  }

  function init() {
    inject();
    ensureScreens();
    installNavigationHook();

    let attempts = 0;
    const timer = setInterval(() => {
      ensureScreens();
      installNavigationHook();
      configureTopNavigation();
      if (role() || ++attempts > 60) clearInterval(timer);
    }, 200);

    window.addEventListener('auxilios:profile-ready', () => {
      ensureScreens();
      configureTopNavigation();
      if (canUseCenter()) loadSummary();
    });

    document.addEventListener('click', event => {
      if (!S.flyoutOpen) return;
      if (event.target.closest('#aux-config-flyout') || event.target.closest('#nav-configuracion')) return;
      closeFlyout();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeFlyout();
    });

    setTimeout(() => {
      configureTopNavigation();
      if (canUseCenter()) loadSummary();
    }, 1400);
  }

  Object.assign(window, {
    abrirCentroConfiguracion: openCenter,
    cerrarMenuConfiguracion: closeFlyout,
    irModuloConfiguracion: goModule,
    abrirHerramientaConfiguracion: openSettingsTab,
    actualizarCentroConfiguracion: () => { S.summary = null; loadSummary(true); },
    actualizarHistorialSistema: () => { S.audit = []; loadHistory(true); },
    filtrarHistorialSistema: setAuditQuery,
    filtrarOperacionHistorial: setAuditOperation,
  });

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();

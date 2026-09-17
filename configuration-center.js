/* AuxiliOS · Navegación canónica y Centro de Configuración */
(() => {
  'use strict';

  const BACKOFFICE_ROLES = new Set(['administracion', 'supervision', 'facturacion']);
  const MANAGEMENT_ROLES = new Set(['administracion', 'supervision']);
  const HISTORY_ROLES = new Set(['administracion', 'supervision', 'operador']);
  const CONFIG_CHILD_ROUTES = new Set(['empresas', 'bases-geograficas', 'bases-tarifarias', 'config-service-types', 'config-tariff-types', 'peajes', 'config-services', 'config-tariff-matrix']);
  const CANCELLATION_STATES = new Set(['cancelled', 'canceled', 'cancelado', 'cancelada', 'anulado', 'anulada', 'void', 'voided']);
  const ENTITY_LABELS = {
    remitos: 'Remito',
    asignaciones_grilla: 'Asignación de grilla',
    payroll_liquidaciones: 'Liquidación de sueldo',
    company_service_settings: 'Servicio habilitado de prestadora',
    daily_logs: 'Jornada',
    company_rate_items: 'Valor de tarifa',
    trucks: 'Camión',
    company_rate_codes: 'Código tarifario',
    fuel_records: 'Carga de combustible',
    rendicion_cierre: 'Rendición',
    company_billing_base_links: 'Base habilitada de prestadora',
    company_rate_rules: 'Regla de recargo',
    alertas_operativas: 'Alerta operativa',
    service_concepts: 'Tipo de servicio',
    tire_checks: 'Control de neumáticos',
    company_rate_rule_exceptions: 'Excepción de recargo',
    tariff_type_service_links: 'Asignación de tipo de tarifa',
    company_rate_billing_settings: 'Parámetro tarifario',
    company_rate_cards: 'Tarifario',
    company_billing_settings: 'Parámetro de facturación',
    company_rate_service_links: 'Servicio de tarifario',
    company_contracts: 'Contrato',
    billing_bases: 'Base geográfica',
    users: 'Usuario',
    company_branches: 'Prestadora / sucursal',
    emergencias_config: 'Contacto de emergencia',
    tariff_types: 'Tipo de tarifa',
    truck_docs: 'Documento de camión',
  };

  // Solo se extraen campos puntuales del JSON de auditoría. Nunca se descarga
  // before_data/after_data completo al navegador.
  const AUDIT_SELECT = `
    event_id,
    occurred_at,
    actor_id,
    operation,
    entity_table,
    entity_id,
    before_status:before_data->>status,
    after_status:after_data->>status,
    before_estado:before_data->>estado,
    after_estado:after_data->>estado,
    before_voided_at:before_data->>voided_at,
    after_voided_at:after_data->>voided_at,
    before_is_active:before_data->>is_active,
    after_is_active:after_data->>is_active,
    before_name:before_data->>name,
    after_name:after_data->>name,
    before_full_name:before_data->>full_name,
    after_full_name:after_data->>full_name,
    before_plate:before_data->>plate,
    after_plate:after_data->>plate,
    before_numero_interno:before_data->>numero_interno,
    after_numero_interno:after_data->>numero_interno,
    before_nro_remito:before_data->>nro_remito,
    after_nro_remito:after_data->>nro_remito,
    before_nro_servicio:before_data->>nro_servicio,
    after_nro_servicio:after_data->>nro_servicio,
    before_service_number:before_data->>service_number,
    after_service_number:after_data->>service_number,
    before_base_code:before_data->>base_code,
    after_base_code:after_data->>base_code,
    before_title:before_data->>title,
    after_title:after_data->>title,
    before_legajo:before_data->>legajo,
    after_legajo:after_data->>legajo,
    before_log_date:before_data->>log_date,
    after_log_date:after_data->>log_date,
    before_fecha:before_data->>fecha,
    after_fecha:after_data->>fecha,
    before_concept_id:before_data->>concept_id,
    after_concept_id:after_data->>concept_id,
    before_company_id:before_data->>company_id,
    after_company_id:after_data->>company_id
  `;

  const S = {
    flyoutOpen: false,
    auditLoading: false,
    auditRows: [],
    actors: new Map(),
    concepts: new Map(),
    companies: new Map(),
  };

  const role = () => String(typeof PERFIL_USUARIO === 'undefined' ? '' : (PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role || '')).toLowerCase();
  const canUseCenter = () => BACKOFFICE_ROLES.has(role());
  const canUseManagementTools = () => MANAGEMENT_ROLES.has(role());
  const canUseHistory = () => HISTORY_ROLES.has(role());
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const notify = (message, type = 'info') => typeof toast === 'function' ? toast(message, type) : console[type === 'error' ? 'error' : 'log'](message);
  const dateTime = value => value ? new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)).replace(',', ' ·') : '—';
  const localDay = value => value ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) : '';

  function ensureNavNode(id, routeName, icon, label, hidden = true) {
    let node = document.getElementById(id);
    if (!node) {
      node = document.createElement('div');
      node.className = 'nav-item';
      node.id = id;
      node.setAttribute('onclick', `goTo('${routeName}')`);
      node.innerHTML = `<span class="nav-icon">${icon}</span><span class="nav-label">${label}</span>`;
      const bottom = document.querySelector('.sidenav .nav-bottom');
      bottom?.parentElement?.insertBefore(node, bottom);
    }
    const iconNode = node.querySelector('.nav-icon');
    const labelNode = node.querySelector('.nav-label');
    if (iconNode) iconNode.textContent = icon;
    if (labelNode) labelNode.textContent = label;
    if (hidden) node.style.display = 'none';
    return node;
  }

  function ensureScreen(id) {
    let screen = document.getElementById(id);
    if (!screen) {
      screen = document.createElement('div');
      screen.className = 'screen';
      screen.id = id;
      document.querySelector('.content')?.appendChild(screen);
    }
    return screen;
  }

  function ensureRouteShells() {
    if (!canUseCenter()) return;
    ensureNavNode('nav-empresas', 'empresas', '▦', 'Prestadoras / Empresas');
    ensureScreen('screen-empresas');
    ensureNavNode('nav-config-service-types', 'config-service-types', '🛠️', 'Tipos de servicio');
    ensureScreen('screen-config-service-types');
    ensureNavNode('nav-config-tariff-types', 'config-tariff-types', '💰', 'Tipos de tarifa');
    ensureScreen('screen-config-tariff-types');
    ensureNavNode('nav-peajes', 'peajes', '🛣️', 'Peajes y Adicionales');
    ensureScreen('screen-peajes');
    ensureNavNode('nav-config-tariff-matrix', 'config-tariff-matrix', '💳', 'Tarifas');
    ensureScreen('screen-config-tariff-matrix');
  }

  function ensureHistoryShell() {
    if (!canUseHistory()) return;
    if (!document.getElementById('configuration-center-css')) {
      const css = document.createElement('link');
      css.id = 'configuration-center-css';
      css.rel = 'stylesheet';
      css.href = '/configuration-center.css';
      document.head.appendChild(css);
    }
    ensureNavNode('nav-historial-sistema', 'historial-sistema', '◷', 'Historial', false);
    ensureScreen('screen-historial-sistema');
  }

  function injectCenter() {
    if (!document.getElementById('configuration-center-css')) {
      const css = document.createElement('link');
      css.id = 'configuration-center-css';
      css.rel = 'stylesheet';
      css.href = '/configuration-center.css';
      document.head.appendChild(css);
    }

    if (!document.getElementById('nav-configuracion')) {
      const node = ensureNavNode('nav-configuracion', 'configuracion', '⚙️', 'Configuración');
      node.setAttribute('onclick', 'abrirCentroConfiguracion(event)');
    }
    ensureNavNode('nav-historial-sistema', 'historial-sistema', '◷', 'Historial');
    ensureScreen('screen-configuracion');
    ensureScreen('screen-historial-sistema');

    if (!document.getElementById('aux-config-flyout')) {
      document.body.insertAdjacentHTML('beforeend', `<aside class="aux-config-flyout" id="aux-config-flyout" aria-hidden="true">
        <div class="aux-config-flyout-head"><div><small>Centro administrativo</small><b>Configuración</b><p>Definiciones y altas que no forman parte del seguimiento diario.</p></div><button class="aux-config-close" type="button" onclick="cerrarMenuConfiguracion()">×</button></div>
        <div class="aux-config-flyout-body">
          <section class="aux-config-group"><div class="aux-config-group-title">Prestadoras y red</div><div class="aux-config-group-links" id="aux-config-company"></div></section>
          <section class="aux-config-group"><div class="aux-config-group-title">Catálogos</div><div class="aux-config-group-links" id="aux-config-catalogs"></div></section>
          <section class="aux-config-group"><div class="aux-config-group-title">Personal, camiones y mantenimiento</div><div class="aux-config-group-links" id="aux-config-management"></div></section>
          <section class="aux-config-group"><div class="aux-config-group-title">Administración interna</div><div class="aux-config-group-links" id="aux-config-administration"></div></section>
        </div>
      </aside>`);
    }
  }

  function ensureScreenMetadata() {
    if (typeof SCREENS === 'undefined') return;
    Object.assign(SCREENS, {
      configuracion: { title: 'CENTRO DE CONFIGURACIÓN', sub: 'Altas, catálogos y definiciones estructurales' },
      'historial-sistema': { title: 'HISTORIAL', sub: 'Auditoría administrativa' },
      empresas: { title: 'PRESTADORAS / EMPRESAS', sub: 'Configuración contractual de clientes corporativos' },
      'bases-geograficas': { title: 'BASES GEOGRÁFICAS', sub: 'Catálogo maestro de ubicaciones' },
      'bases-tarifarias': { title: 'BASES GEOGRÁFICAS', sub: 'Catálogo maestro de ubicaciones' },
      'config-service-types': { title: 'TIPOS DE SERVICIO', sub: 'Catálogo maestro global' },
      'config-tariff-types': { title: 'TIPOS DE TARIFA', sub: 'Formas de cálculo disponibles' },
      peajes: { title: 'PEAJES Y ADICIONALES', sub: 'Catálogo de conceptos complementarios' },
      'config-services': { title: 'CONFIGURACIÓN · SERVICIOS', sub: 'Panel, formulario y flujo operativo' },
      'config-tariff-matrix': { title: 'TARIFAS', sub: 'Valores versionados por prestadora' },
    });
  }

  function asFlyoutLink(node) {
    if (!node) return null;
    node.style.display = '';
    node.classList.remove('aux-top-nav');
    node.classList.add('aux-config-nav-link');
    return node;
  }

  function moveTo(group, node) {
    if (group && node) group.appendChild(asFlyoutLink(node));
  }

  function addAction(group, icon, label, subtitle, handler) {
    if (!group) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'aux-config-link';
    button.innerHTML = `<span class="aux-config-link-icon">${icon}</span><span class="aux-config-link-label">${label}<small>${subtitle}</small></span><span>›</span>`;
    button.addEventListener('click', handler);
    group.appendChild(button);
  }

  async function openLegacySettingsTab(tabId) {
    if (!canUseManagementTools()) return notify('Sin permiso para administrar esta configuración', 'error');
    if (typeof openSettingsHub !== 'function' || typeof switchConfigTab !== 'function') return notify('La herramienta administrativa todavía no está disponible', 'error');
    closeFlyout();
    await openSettingsHub();
    switchConfigTab(tabId);
  }

  function populateFlyout() {
    if (!canUseCenter()) return;
    const company = document.getElementById('aux-config-company');
    const catalogs = document.getElementById('aux-config-catalogs');
    const management = document.getElementById('aux-config-management');
    const administration = document.getElementById('aux-config-administration');
    [company, catalogs, management, administration].forEach(group => group?.replaceChildren());

    moveTo(company, document.getElementById('nav-empresas'));
    moveTo(company, document.getElementById('nav-bases-geograficas') || document.getElementById('nav-bases-tarifarias'));
    moveTo(catalogs, document.getElementById('nav-config-service-types'));
    moveTo(catalogs, document.getElementById('nav-config-tariff-types'));
    moveTo(catalogs, document.getElementById('nav-peajes'));
    moveTo(catalogs, document.getElementById('nav-config-services'));
    addAction(catalogs, '💳', 'Tarifas', 'Valores y vigencias por prestadora', () => {
      closeFlyout();
      if (typeof goTo === 'function') goTo('config-tariff-matrix');
    });

    if (canUseManagementTools()) {
      addAction(management, '👤', 'Personal / Choferes', 'Alta y gestión del personal', () => openLegacySettingsTab('tab-usuarios'));
      addAction(management, '🚛', 'Camiones', 'Alta y administración de vehículos', () => openLegacySettingsTab('tab-flota'));
      addAction(management, '🧰', 'Planes de mantenimiento', 'Crear y administrar planes globales', () => openLegacySettingsTab('tab-planes'));
      addAction(management, '🔧', 'Mantenimiento', 'Seguimiento y asignación de mantenimiento', () => openLegacySettingsTab('tab-mantenimiento'));
      addAction(management, '🆘', 'Contactos de emergencia', 'Teléfonos y referencias operativas', () => openLegacySettingsTab('tab-emergencias'));
      moveTo(administration, document.getElementById('nav-documentos'));
      moveTo(administration, document.getElementById('nav-grilla'));

      addAction(administration, '👤', 'Mi cuenta', 'Datos y preferencias de la cuenta', () => openLegacySettingsTab('tab-mi-cuenta'));
    } else {
      ['nav-documentos', 'nav-grilla', 'nav-sueldos'].forEach(id => {
        const node = document.getElementById(id);
        if (node) node.style.display = 'none';
      });
    }
  }

  function ensureDriverNode(id, routeName, icon, label) {
    const node = ensureNavNode(id, routeName, icon, label, false);
    node.classList.remove('aux-config-nav-link', 'aux-top-nav');
    return node;
  }

  function orderTop(nodes) {
    const sidenav = document.querySelector('.sidenav');
    const bottom = sidenav?.querySelector('.nav-bottom');
    if (!sidenav || !bottom) return;
    nodes.filter(Boolean).forEach(node => {
      node.style.display = '';
      node.classList.remove('aux-config-nav-link');
      node.classList.add('aux-top-nav');
      sidenav.insertBefore(node, bottom);
    });
  }

  function configureDriverNavigation() {
    document.body.classList.remove('aux-backoffice-nav');
    closeFlyout();
    ['nav-configuracion', 'nav-historial-sistema', 'nav-empresas', 'nav-bases-geograficas', 'nav-bases-tarifarias', 'nav-config-service-types', 'nav-config-tariff-types', 'nav-config-services', 'nav-config-tariff-matrix', 'nav-peajes', 'nav-operaciones'].forEach(id => {
      const node = document.getElementById(id);
      if (node) node.style.display = 'none';
    });
    orderTop([
      ensureDriverNode('nav-dashboard', 'dashboard', '📊', 'Panel'),
      ensureDriverNode('nav-registro', 'registro', '📋', 'Km'),
      ensureDriverNode('nav-camion', 'camion', '🚛', 'Camión'),
      ensureDriverNode('nav-documentos', 'documentos', '📄', 'Docs'),
      ensureDriverNode('nav-remitos', 'remitos', '🧾', 'Remitos'),
      ensureDriverNode('nav-grilla', 'grilla', '🗓️', 'Grilla'),
    ]);
  }

  function configureBackofficeNavigation() {
    document.body.classList.add('aux-backoffice-nav');
    const registro = document.getElementById('nav-registro');
    if (registro) registro.remove();

    const dashboard = ensureNavNode('nav-dashboard', 'dashboard', '📊', 'Resumen', false);
    const operations = document.getElementById('nav-operaciones');
    if (operations) {
      const icon = operations.querySelector('.nav-icon');
      const label = operations.querySelector('.nav-label');
      if (icon) icon.textContent = '🧭';
      if (label) label.textContent = 'Servicios';
      operations.style.display = canUseManagementTools() ? '' : 'none';
    }

    let jornadas = null;
    let camion = null;
    let remitos = null;
    if (canUseManagementTools()) {
      jornadas = ensureNavNode('nav-jornadas-admin', 'jornadas-admin', '🗓️', 'Jornadas', false);
      camion = ensureNavNode('nav-camion', 'camion', '🚛', 'Camión', false);
      remitos = ensureNavNode('nav-remitos', 'remitos', '🧾', 'Remitos', false);
    } else {
      ['nav-jornadas-admin', 'nav-camion', 'nav-remitos'].forEach(id => {
        const node = document.getElementById(id);
        if (node) node.style.display = 'none';
      });
    }

    const configuration = ensureNavNode('nav-configuracion', 'configuracion', '⚙️', 'Configuración', false);
    configuration.setAttribute('onclick', 'abrirCentroConfiguracion(event)');
    const payroll = canUseManagementTools() ? ensureNavNode('nav-sueldos', 'sueldos', '💵', 'Sueldos', false) : null;
    document.getElementById('nav-config-tariff-matrix')?.remove();
    const history = ensureNavNode('nav-historial-sistema', 'historial-sistema', '◷', 'Historial', false);

    populateFlyout();
    orderTop([dashboard, canUseManagementTools() ? operations : null, jornadas, camion, remitos, payroll, configuration, history]);
  }

  function configureOperatorNavigation() {
    document.body.classList.add('aux-backoffice-nav');
    closeFlyout();
    ['nav-registro','nav-jornadas-admin','nav-camion','nav-remitos','nav-sueldos','nav-configuracion'].forEach(id => {
      const node = document.getElementById(id);
      if (node) node.style.display = 'none';
    });
    const dashboard = ensureNavNode('nav-dashboard', 'dashboard', '📊', 'Resumen', false);
    const operations = document.getElementById('nav-operaciones');
    if (operations) operations.style.display = '';
    const history = ensureNavNode('nav-historial-sistema', 'historial-sistema', '◷', 'Historial', false);
    orderTop([dashboard, operations, history]);
  }

  function managementToolsMarkup() {
    if (!canUseManagementTools()) return '';
    return `<section class="aux-center-tools">
      <div class="aux-center-tools-head"><div><h3>Personal, camiones y mantenimiento</h3><p>Altas y parámetros internos que ya existían en AuxiliOS.</p></div></div>
      <div class="aux-center-tool-grid"><button class="aux-center-tool" onclick="CompanyDocuments.open()"><span>▤</span><b>Empresa y documentos</b><small>Datos fiscales y firma institucional.</small></button>
        <button class="aux-center-tool" onclick="abrirHerramientaConfiguracion('tab-usuarios')"><span>👤</span><b>Personal / Choferes</b><small>Alta y gestión del personal.</small></button>
        <button class="aux-center-tool" onclick="abrirHerramientaConfiguracion('tab-flota')"><span>🚛</span><b>Camiones</b><small>Alta y administración de vehículos.</small></button>
        <button class="aux-center-tool" onclick="abrirHerramientaConfiguracion('tab-planes')"><span>🧰</span><b>Planes de mantenimiento</b><small>Catálogo de planes globales.</small></button>
        <button class="aux-center-tool" onclick="abrirHerramientaConfiguracion('tab-mantenimiento')"><span>🔧</span><b>Mantenimiento</b><small>Seguimiento y asignaciones.</small></button>
        <button class="aux-center-tool" onclick="abrirHerramientaConfiguracion('tab-emergencias')"><span>🆘</span><b>Contactos de emergencia</b><small>Referencias operativas.</small></button>
      </div>
    </section>
    <section class="aux-center-tools">
      <div class="aux-center-tools-head"><div><h3>Administración interna</h3><p>Herramientas periódicas que no forman parte del seguimiento diario principal.</p></div></div>
      <div class="aux-center-tool-grid">
        <button class="aux-center-tool" onclick="irModuloConfiguracion('documentos')"><span>📄</span><b>Documentación</b><small>Legajos y vencimientos.</small></button>
        <button class="aux-center-tool" onclick="irModuloConfiguracion('grilla')"><span>🗓️</span><b>Grilla</b><small>Asignaciones y francos.</small></button>
        <button class="aux-center-tool" onclick="abrirHerramientaConfiguracion('tab-mi-cuenta')"><span>👤</span><b>Mi cuenta</b><small>Datos de la cuenta actual.</small></button>
      </div>
    </section>`;
  }

  function renderCenter() {
    const screen = document.getElementById('screen-configuracion');
    if (!screen || !canUseCenter()) return;
    const admin = role() === 'administracion';
    const manage = canUseManagementTools();
    const sectionIcon = label => {
      const paths = {
        'Datos de empresa y firma':'M4 3h12l4 4v14H4Z M8 9h8 M8 13h8 M8 17h5',
        'Documentación':'M5 3h14v18H5Z M8 7h8 M8 11h8 M8 15h5',
        'Servicios':'M4 6h16 M4 12h16 M4 18h16',
        'Camiones':'M2 6h12v11H2Z M14 10h5l3 4v3h-8 M7 18a2 2 0 1 1-4 0a2 2 0 1 1 4 0 M21 18a2 2 0 1 1-4 0a2 2 0 1 1 4 0',
        'Planes de mantenimiento':'M6 4h12v17H6Z M9 2h6v4H9Z M9 10h6 M9 14h6',
        'Mantenimiento':'M14 3a6 6 0 0 0-6 8L2 17l5 5 6-6a6 6 0 0 0 8-7l-4 4-4-4 4-4Z',
        'Contactos de emergencia':'M8 3H4v4c0 7 6 13 13 13h4v-4l-5-2-2 2-6-6 2-2Z',
        'Grilla':'M3 5h18v16H3Z M7 2v6 M17 2v6 M3 10h18 M9 10v11 M15 10v11',
        'Tipos de servicio':'M3 3h7v7H3Z M14 3h7v7h-7Z M3 14h7v7H3Z M14 14h7v7h-7Z',
        'Tipos de tarifa':'M3 4h12l6 8-6 8H3Z M7 9h3 M7 14h6',
        'Peajes':'M3 21V8h18v13 M2 8l10-5 10 5 M7 12v9 M17 12v9 M12 15v3',
        'Bases geográficas':'M12 22S4 15 4 9a8 8 0 1 1 16 0c0 6-8 13-8 13Z M12 6a3 3 0 1 0 0 6a3 3 0 1 0 0-6',
        'Prestadoras':'M4 21V3h12v18 M16 10h4v11 M8 7h4 M8 11h4 M8 15h4 M2 21h20',
        'Tarifas':'M4 3h16v18H4Z M8 7h8 M8 11h2 M14 11h2 M8 15h2 M14 15h2',
        'Personal / Choferes':'M8 11a4 4 0 1 0 0-8a4 4 0 1 0 0 8 M1 21v-3a7 7 0 0 1 14 0v3 M17 4a4 4 0 0 1 0 8 M18 15a5 5 0 0 1 5 5',
        'Mi cuenta':'M12 12a5 5 0 1 0 0-10a5 5 0 1 0 0 10 M3 22v-2a9 9 0 0 1 18 0v2'
      };
      return '<svg class="aux-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(paths[label]||paths.Servicios)+'"/></svg>';
    };
    const link = (label, detail, action) => '<button class="aux-area-link" onclick="'+action+'">'+sectionIcon(label)+'<span class="aux-section-label"><b>'+label+'</b><small>'+detail+'</small></span><span aria-hidden="true">→</span></button>';
    const route = (label, detail, name) => link(label, detail, "irModuloConfiguracion('"+name+"')");
    const legacy = (label, detail, name) => link(label, detail, "abrirHerramientaConfiguracion('"+name+"')");
    const area = (title, subtitle, icon, links) => '<details class="aux-area"><summary><span class="aux-area-icon" aria-hidden="true">'+icon+'</span><h3>'+title+'</h3><p>'+subtitle+'</p><span class="aux-area-open">Ver opciones <span aria-hidden="true">↓</span></span></summary><div class="aux-area-links">'+links+'</div></details>';
    screen.innerHTML = '<div class="aux-center-page"><div class="aux-center-head"><div><div class="aux-center-eyebrow">Configuración</div><h2>Configuración por áreas</h2><p>Elegí un área para ver sus herramientas y parámetros.</p></div></div><div class="aux-areas-grid">'
      + area('Empresa y documentos','Identidad de la empresa y documentos emitidos.','▤',
          (admin ? link('Datos de empresa y firma','Razón social, CUIT, contacto y firma institucional.','CompanyDocuments.open()') : '<p class="aux-area-note">Los datos de empresa los configura Administración.</p>')
          + (manage ? route('Documentación','Legajos y vencimientos.','documentos') : ''))
      + area('Operación','Formularios, flujo y recursos de trabajo.','⚙',
          route('Servicios','Columnas, formulario y flujo operativo.','config-services')
          + (manage ? legacy('Camiones','Alta y administración de vehículos.','tab-flota')+legacy('Planes de mantenimiento','Catálogo de planes globales.','tab-planes')+legacy('Mantenimiento','Seguimiento y asignaciones.','tab-mantenimiento')+legacy('Contactos de emergencia','Referencias operativas.','tab-emergencias')+route('Grilla','Asignaciones y francos.','grilla') : ''))
      + area('Catálogos','Conceptos compartidos por toda la operación.','▦',
          route('Tipos de servicio','Alta y definición de servicios.','config-service-types')+route('Tipos de tarifa','Modalidades de cálculo.','config-tariff-types')+route('Peajes','Catálogo e importes vigentes.','peajes')+route('Bases geográficas','Ubicaciones operativas.','bases-geograficas'))
      + area('Prestadoras y tarifas','Servicios habilitados, precios y vigencias.','▥',
          route('Prestadoras','Datos, servicios habilitados y parámetros de facturación.','empresas')+route('Tarifas','Valores y vigencias por prestadora.','config-tariff-matrix'))
      + area('Usuarios y permisos','Personal, roles y administración interna.','♙',
          manage ? legacy('Personal / Choferes','Alta y gestión del personal.','tab-usuarios')+legacy('Mi cuenta','Datos de la cuenta actual.','tab-mi-cuenta') : '<p class="aux-area-note">La gestión de usuarios corresponde a Administración.</p>')
      + '</div></div>';
  }

  function actionFor(row) {
    const operation = String(row.operation || '').trim().toUpperCase();
    if (operation === 'INSERT') return { key: 'create', label: 'CREACIÓN' };
    if (operation === 'DELETE') return { key: 'delete', label: 'ELIMINACIÓN' };
    if (/CANCEL|VOID|ANUL/.test(operation)) return { key: 'cancel', label: 'ANULACIÓN' };

    const beforeState = String(row.before_status || row.before_estado || '').trim().toLowerCase();
    const afterState = String(row.after_status || row.after_estado || '').trim().toLowerCase();
    if ((afterState && CANCELLATION_STATES.has(afterState) && afterState !== beforeState) || (row.after_voided_at && !row.before_voided_at)) {
      return { key: 'cancel', label: 'ANULACIÓN' };
    }

    if (String(row.before_is_active).toLowerCase() === 'true' && String(row.after_is_active).toLowerCase() === 'false') {
      return { key: 'delete', label: 'ELIMINACIÓN' };
    }
    return { key: 'update', label: 'MODIFICACIÓN' };
  }

  function shortId(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.length > 16 ? `${text.slice(0, 8)}…` : `#${text}`;
  }

  function subjectFor(row) {
    const type = ENTITY_LABELS[row.entity_table] || String(row.entity_table || 'Registro').replaceAll('_', ' ');
    const name = row.after_name || row.before_name;
    const fullName = row.after_full_name || row.before_full_name;
    const plate = row.after_plate || row.before_plate;
    const internal = row.after_numero_interno || row.before_numero_interno;
    const remito = row.after_nro_remito || row.before_nro_remito;
    const service = row.after_service_number || row.before_service_number || row.after_nro_servicio || row.before_nro_servicio;
    const baseCode = row.after_base_code || row.before_base_code;
    const title = row.after_title || row.before_title;
    const legajo = row.after_legajo || row.before_legajo;
    const date = row.after_log_date || row.before_log_date || row.after_fecha || row.before_fecha;
    const conceptId = row.after_concept_id || row.before_concept_id;
    const companyId = row.after_company_id || row.before_company_id;
    const conceptName = conceptId ? S.concepts.get(String(conceptId)) : '';
    const companyName = companyId ? S.companies.get(String(companyId)) : '';

    let detail = name || fullName || remito || service || title || baseCode || legajo || '';
    if (row.entity_table === 'trucks' && plate) detail = [plate, internal].filter(Boolean).join(' · ');
    if ((row.entity_table === 'daily_logs' || row.entity_table === 'asignaciones_grilla') && date) detail = date;
    if (!detail && (companyName || conceptName)) detail = [companyName, conceptName].filter(Boolean).join(' · ');
    if (!detail) detail = shortId(row.entity_id);
    return { type, detail };
  }

  function actorName(row) {
    if (!row.actor_id) return 'Sistema';
    const actor = S.actors.get(String(row.actor_id));
    return actor?.full_name || actor?.email || 'Usuario';
  }

  function filteredHistory() {
    const query = String(document.getElementById('aux-history-query')?.value || '').trim().toLowerCase();
    const action = document.getElementById('aux-history-action')?.value || '';
    const actor = document.getElementById('aux-history-actor')?.value || '';
    const day = document.getElementById('aux-history-date')?.value || '';
    return S.auditRows.filter(row => {
      const rowAction = actionFor(row);
      const subject = subjectFor(row);
      const actorLabel = actorName(row);
      if (action && rowAction.key !== action) return false;
      if (actor && String(row.actor_id || 'system') !== actor) return false;
      if (day && localDay(row.occurred_at) !== day) return false;
      if (!query) return true;
      return `${rowAction.label} ${subject.type} ${subject.detail} ${actorLabel}`.toLowerCase().includes(query);
    });
  }

  function renderHistoryRows() {
    const body = document.getElementById('aux-history-body');
    const count = document.getElementById('aux-history-count');
    if (!body) return;
    const rows = filteredHistory();
    if (count) count.textContent = `${rows.length} evento${rows.length === 1 ? '' : 's'}`;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="4"><div class="aux-empty">No hay eventos para los filtros seleccionados.</div></td></tr>';
      return;
    }
    body.innerHTML = rows.map(row => {
      const action = actionFor(row);
      const subject = subjectFor(row);
      return `<tr>
        <td><span class="aux-history-operation ${action.key}">${action.label}</span></td>
        <td class="aux-history-entity"><b>${esc(subject.type)}</b>${subject.detail ? `<small>${esc(subject.detail)}</small>` : ''}</td>
        <td>${esc(actorName(row))}</td>
        <td><time>${esc(dateTime(row.occurred_at))}</time></td>
      </tr>`;
    }).join('');
  }

  function renderHistory() {
    const screen = document.getElementById('screen-historial-sistema');
    if (!screen) return;
    const actors = [...S.actors.entries()].sort((a, b) => String(a[1]?.full_name || a[1]?.email || '').localeCompare(String(b[1]?.full_name || b[1]?.email || ''), 'es'));
    screen.innerHTML = `<div class="aux-center-page">
      <div class="aux-center-head"><div><div class="aux-center-eyebrow">Auditoría</div><h2>Historial</h2><p>Lectura administrativa simple: qué se hizo, sobre qué registro, quién lo hizo y cuándo.</p></div><div id="aux-history-count" class="aux-center-readonly"></div></div>
      <section class="aux-center-tools"><button class="aux-center-tool" onclick="abrirHistorialServicios()"><span>▤</span><b>Historial de servicios</b><small>Consultar servicios finalizados y anulados.</small></button></section><section class="aux-history-panel">
        <div class="aux-history-toolbar">
          <input class="form-input" id="aux-history-query" type="search" placeholder="Buscar por registro o usuario" data-audit-filter>
          <select class="form-input" id="aux-history-action" data-audit-filter>
            <option value="">Todas las acciones</option>
            <option value="create">Creación</option>
            <option value="update">Modificación</option>
            <option value="cancel">Anulación</option>
            <option value="delete">Eliminación</option>
          </select>
          <select class="form-input" id="aux-history-actor" data-audit-filter>
            <option value="">Todos los usuarios</option>
            <option value="system">Sistema</option>
            ${actors.map(([id, data]) => `<option value="${esc(id)}">${esc(data?.full_name || data?.email || 'Usuario')}</option>`).join('')}
          </select>
          <input class="form-input" id="aux-history-date" type="date" data-audit-filter>
        </div>
        <div class="aux-history-table-wrap"><table class="aux-history-table">
          <thead><tr><th>Qué hizo</th><th>Sobre qué lo hizo</th><th>Quién lo hizo</th><th>Cuándo lo hizo</th></tr></thead>
          <tbody id="aux-history-body"></tbody>
        </table></div>
      </section>
    </div>`;
    screen.querySelectorAll('[data-audit-filter]').forEach(control => {
      control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', renderHistoryRows);
    });
    renderHistoryRows();
  }

  async function loadLookupMap(table, idColumn, valueColumns, ids, target, formatter) {
    target.clear();
    if (!ids.length) return;
    const { data, error } = await _db.from(table).select([idColumn, ...valueColumns].join(',')).in(idColumn, ids);
    if (error) return;
    (data || []).forEach(item => target.set(String(item[idColumn]), formatter(item)));
  }

  async function loadHistory() {
    const screen = document.getElementById('screen-historial-sistema');
    if (!screen || !canUseHistory() || S.auditLoading) return;
    S.auditLoading = true;
    screen.innerHTML = '<div class="aux-loading">Cargando historial…</div>';
    try {
      const { data, error } = await _db.from('audit_events').select(AUDIT_SELECT).order('occurred_at', { ascending: false }).limit(250);
      if (error) throw error;
      S.auditRows = Array.isArray(data) ? data : [];

      const actorIds = [...new Set(S.auditRows.map(row => row.actor_id).filter(Boolean).map(String))];
      const conceptIds = [...new Set(S.auditRows.map(row => row.after_concept_id || row.before_concept_id).filter(Boolean).map(String))];
      const companyIds = [...new Set(S.auditRows.map(row => row.after_company_id || row.before_company_id).filter(Boolean).map(String))];
      await Promise.all([
        loadLookupMap('users', 'user_id', ['full_name', 'email'], actorIds, S.actors, item => ({ full_name: item.full_name, email: item.email })),
        loadLookupMap('service_concepts', 'concept_id', ['name'], conceptIds, S.concepts, item => item.name || ''),
        loadLookupMap('companies', 'company_id', ['trade_name', 'legal_name'], companyIds, S.companies, item => item.trade_name || item.legal_name || ''),
      ]);
      renderHistory();
    } catch (error) {
      screen.innerHTML = `<div class="aux-loading">No se pudo cargar el historial: ${esc(error?.message || '')}</div>`;
    } finally {
      S.auditLoading = false;
    }
  }

  function setFlyout(open) {
    S.flyoutOpen = Boolean(open) && canUseCenter();
    const flyout = document.getElementById('aux-config-flyout');
    const trigger = document.getElementById('nav-configuracion');
    flyout?.classList.toggle('open', S.flyoutOpen);
    trigger?.classList.toggle('open', S.flyoutOpen);
    flyout?.setAttribute('aria-hidden', S.flyoutOpen ? 'false' : 'true');
  }

  function closeFlyout() { setFlyout(false); }

  function openCenter(event) {
    event?.stopPropagation?.();
    if (!canUseCenter()) return notify('Sin permiso para acceder a Configuración', 'error');
    if (!document.getElementById('screen-configuracion')?.classList.contains('active') && typeof goTo === 'function') goTo('configuracion');
    closeFlyout();
    renderCenter();
  }

  function installNavigationHook() {
    const previous = window.goTo;
    if (typeof previous !== 'function' || previous.__auxCanonicalNavigation) return;
    const wrapped = function(name, ...args) {
      if (name === 'historial-sistema' && !canUseHistory()) return notify('Sin permiso para acceder a Historial', 'error');
      if ((name === 'configuracion' || CONFIG_CHILD_ROUTES.has(name)) && !canUseCenter()) return notify('Sin permiso para acceder a este módulo', 'error');
      const result = previous.call(this, name, ...args);
      closeFlyout();
      if (canUseCenter() && CONFIG_CHILD_ROUTES.has(name)) document.getElementById('nav-configuracion')?.classList.add('active');
      if (name === 'configuracion') renderCenter();
      if (name === 'historial-sistema') loadHistory();
      return result;
    };
    wrapped.__auxCanonicalNavigation = true;
    window.goTo = wrapped;
  }

  function init() {
    ensureScreenMetadata();
    ensureHistoryShell();
    if (canUseCenter()) {
      ensureRouteShells();
      injectCenter();
      configureBackofficeNavigation();
      renderCenter();
    } else if (role() === 'operador') {
      configureOperatorNavigation();
    } else {
      configureDriverNavigation();
    }
    installNavigationHook();
    document.addEventListener('click', event => {
      if (!S.flyoutOpen) return;
      if (event.target.closest('#aux-config-flyout') || event.target.closest('#nav-configuracion')) return;
      closeFlyout();
    });
    const sidenav = document.querySelector('.sidenav');
    if (sidenav) {
      sidenav.style.visibility = '';
      sidenav.setAttribute('aria-busy', 'false');
    }
  }

  Object.assign(window, {
    abrirCentroConfiguracion: openCenter,
    cerrarMenuConfiguracion: closeFlyout,
    irModuloConfiguracion: routeName => { closeFlyout(); if (typeof goTo === 'function') goTo(routeName); },
    abrirHerramientaConfiguracion: openLegacySettingsTab,
  });
  window.AuxiliosConfigurationCenter = {
    configure: () => canUseCenter() ? configureBackofficeNavigation() : role() === 'operador' ? configureOperatorNavigation() : configureDriverNavigation(),
    renderCenter,
    loadHistory,
  };

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();

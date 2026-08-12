/* AuxiliOS · Navegación canónica y Centro de Configuración */
(() => {
  'use strict';

  const BACKOFFICE_ROLES = new Set(['administracion', 'supervision', 'facturacion']);
  const MANAGEMENT_ROLES = new Set(['administracion', 'supervision']);
  const CONFIG_CHILD_ROUTES = new Set(['empresas', 'bases-geograficas', 'bases-tarifarias', 'config-service-types', 'config-tariff-types']);
  const S = { flyoutOpen: false, auditLoading: false };

  const role = () => String(typeof PERFIL_USUARIO === 'undefined' ? '' : (PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role || '')).toLowerCase();
  const canUseCenter = () => BACKOFFICE_ROLES.has(role());
  const canUseManagementTools = () => MANAGEMENT_ROLES.has(role());
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const notify = (message, type = 'info') => typeof toast === 'function' ? toast(message, type) : console[type === 'error' ? 'error' : 'log'](message);
  const dateTime = value => value ? new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

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
    ensureNavNode('nav-config-tariff-matrix', 'config-tariff-matrix', '💳', 'Tarifas');
    ensureScreen('screen-config-tariff-matrix');
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
        <div class="aux-config-flyout-head"><div><small>Centro administrativo</small><b>Configuración</b><p>Una sola navegación, organizada por dominio.</p></div><button class="aux-config-close" type="button" onclick="cerrarMenuConfiguracion()">×</button></div>
        <div class="aux-config-flyout-body">
          <section class="aux-config-group"><div class="aux-config-group-title">Prestadoras y red</div><div class="aux-config-group-links" id="aux-config-company"></div></section>
          <section class="aux-config-group"><div class="aux-config-group-title">Catálogos</div><div class="aux-config-group-links" id="aux-config-catalogs"></div></section>
          <section class="aux-config-group"><div class="aux-config-group-title">Operación y administración</div><div class="aux-config-group-links" id="aux-config-operation"></div></section>
          <section class="aux-config-group"><div class="aux-config-group-title">Facturación</div><div class="aux-config-group-links" id="aux-config-billing"></div></section>
        </div>
      </aside>`);
    }
  }

  function ensureScreenMetadata() {
    if (typeof SCREENS === 'undefined') return;
    Object.assign(SCREENS, {
      configuracion: { title: 'CENTRO DE CONFIGURACIÓN', sub: 'Prestadoras, catálogos y herramientas administrativas' },
      'historial-sistema': { title: 'HISTORIAL', sub: 'Auditoría y registros administrativos' },
      empresas: { title: 'PRESTADORAS / EMPRESAS', sub: 'Configuración contractual de clientes corporativos' },
      'bases-geograficas': { title: 'BASES GEOGRÁFICAS', sub: 'Catálogo maestro de ubicaciones' },
      'bases-tarifarias': { title: 'BASES GEOGRÁFICAS', sub: 'Catálogo maestro de ubicaciones' },
      'config-service-types': { title: 'TIPOS DE SERVICIO', sub: 'Catálogo maestro global' },
      'config-tariff-types': { title: 'TIPOS DE TARIFA', sub: 'Formas de cálculo disponibles' },
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
    if (!group || !node) return;
    group.appendChild(asFlyoutLink(node));
  }

  function addAction(group, id, icon, label, subtitle, routeName) {
    if (!group) return;
    let button = document.getElementById(id);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'aux-config-link';
      button.id = id;
      button.innerHTML = `<span class="aux-config-link-icon">${icon}</span><span class="aux-config-link-label">${label}<small>${subtitle}</small></span><span>›</span>`;
      button.addEventListener('click', () => { closeFlyout(); if (typeof goTo === 'function') goTo(routeName); });
    }
    group.appendChild(button);
  }

  function populateFlyout() {
    if (!canUseCenter()) return;
    const company = document.getElementById('aux-config-company');
    const catalogs = document.getElementById('aux-config-catalogs');
    const operation = document.getElementById('aux-config-operation');
    const billing = document.getElementById('aux-config-billing');
    [company, catalogs, operation, billing].forEach(group => group?.replaceChildren());

    moveTo(company, document.getElementById('nav-empresas'));
    moveTo(company, document.getElementById('nav-bases-geograficas') || document.getElementById('nav-bases-tarifarias'));
    moveTo(catalogs, document.getElementById('nav-config-service-types'));
    moveTo(catalogs, document.getElementById('nav-config-tariff-types'));

    if (canUseManagementTools()) {
      moveTo(operation, document.getElementById('nav-camion'));
      moveTo(operation, document.getElementById('nav-jornadas-admin'));
      moveTo(operation, document.getElementById('nav-documentos'));
      moveTo(operation, document.getElementById('nav-remitos'));
      moveTo(operation, document.getElementById('nav-grilla'));
      moveTo(operation, document.getElementById('nav-sueldos'));
    } else {
      ['nav-camion','nav-jornadas-admin','nav-documentos','nav-remitos','nav-grilla','nav-sueldos'].forEach(id => {
        const node = document.getElementById(id);
        if (node) node.style.display = 'none';
      });
    }

    addAction(billing, 'aux-open-tariffs', '💳', 'Tarifas', 'Vigencias, valores y excepciones por base', 'config-tariff-matrix');
    const note = document.createElement('div');
    note.className = 'aux-config-group-note';
    note.innerHTML = 'Las <b>bases habilitadas, recorrido, peajes y recargos</b> se configuran dentro de cada Prestadora.';
    billing?.appendChild(note);
  }

  function ensureDriverNode(id, route, icon, label) {
    const node = ensureNavNode(id, route, icon, label, false);
    node.classList.remove('aux-config-nav-link', 'aux-top-nav');
    return node;
  }

  function orderTop(nodes) {
    const sidenav = document.querySelector('.sidenav');
    const bottom = sidenav?.querySelector('.nav-bottom');
    if (!sidenav || !bottom) return;
    nodes.filter(Boolean).forEach(node => {
      node.style.display = '';
      node.classList.add('aux-top-nav');
      sidenav.insertBefore(node, bottom);
    });
  }

  function configureDriverNavigation() {
    document.body.classList.remove('aux-backoffice-nav');
    closeFlyout();
    ['nav-configuracion','nav-historial-sistema','nav-empresas','nav-bases-geograficas','nav-bases-tarifarias','nav-config-service-types','nav-config-tariff-types','nav-config-tariff-matrix','nav-operaciones'].forEach(id => {
      const node = document.getElementById(id);
      if (node) node.style.display = 'none';
    });
    const nodes = [
      ensureDriverNode('nav-dashboard', 'dashboard', '📊', 'Panel'),
      ensureDriverNode('nav-registro', 'registro', '📋', 'Km'),
      ensureDriverNode('nav-camion', 'camion', '🚛', 'Camión'),
      ensureDriverNode('nav-documentos', 'documentos', '📄', 'Docs'),
      ensureDriverNode('nav-remitos', 'remitos', '🧾', 'Remitos'),
      ensureDriverNode('nav-grilla', 'grilla', '🗓️', 'Grilla'),
    ];
    orderTop(nodes);
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
    const configuration = ensureNavNode('nav-configuracion', 'configuracion', '⚙️', 'Configuración', false);
    configuration.setAttribute('onclick', 'abrirCentroConfiguracion(event)');
    const tariffs = ensureNavNode('nav-config-tariff-matrix', 'config-tariff-matrix', '💳', 'Tarifas', false);
    const history = ensureNavNode('nav-historial-sistema', 'historial-sistema', '◷', 'Historial', false);

    populateFlyout();
    orderTop([dashboard, canUseManagementTools() ? operations : null, configuration, tariffs, history]);
  }

  function renderCenter() {
    const screen = document.getElementById('screen-configuracion');
    if (!screen || !canUseCenter()) return;
    screen.innerHTML = `<div class="aux-center-shell"><div class="aux-center-head"><div><small>Centro administrativo</small><h2>Configuración</h2><p>La configuración estructural de AuxiliOS vive acá. Los módulos operativos no duplican estas definiciones.</p></div></div><div class="aux-center-grid">
      <button class="aux-center-tool" onclick="irModuloConfiguracion('empresas')"><span>▦</span><b>Prestadoras</b><small>Datos, servicios habilitados y parámetros de facturación.</small></button>
      <button class="aux-center-tool" onclick="irModuloConfiguracion('bases-geograficas')"><span>⌖</span><b>Bases geográficas</b><small>Catálogo maestro de ubicaciones disponibles.</small></button>
      <button class="aux-center-tool" onclick="irModuloConfiguracion('config-service-types')"><span>🛠️</span><b>Tipos de servicio</b><small>Único lugar donde se crean y definen servicios.</small></button>
      <button class="aux-center-tool" onclick="irModuloConfiguracion('config-tariff-types')"><span>💰</span><b>Tipos de tarifa</b><small>Define la modalidad de cálculo y si suma kilómetros.</small></button>
      <button class="aux-center-tool" onclick="irModuloConfiguracion('config-tariff-matrix')"><span>💳</span><b>Tarifas</b><small>Valores versionados de los servicios habilitados.</small></button>
    </div></div>`;
  }

  async function loadHistory() {
    const screen = document.getElementById('screen-historial-sistema');
    if (!screen || !canUseCenter() || S.auditLoading) return;
    S.auditLoading = true;
    screen.innerHTML = '<div class="aux-loading">Cargando historial…</div>';
    try {
      const { data, error } = await _db.from('audit_events').select('event_id,occurred_at,actor_id,operation,entity_table,entity_id').order('occurred_at', { ascending: false }).limit(120);
      if (error) throw error;
      const rows = data || [];
      screen.innerHTML = `<div class="aux-history-shell"><div class="aux-center-head"><div><small>Auditoría</small><h2>Historial</h2><p>Últimos cambios administrativos registrados por el sistema.</p></div></div><div class="aux-history-list">${rows.length ? rows.map(row => `<article class="aux-history-row"><span>${row.operation === 'INSERT' ? '+' : row.operation === 'DELETE' ? '−' : '✎'}</span><div><b>${esc(String(row.entity_table || '').replaceAll('_', ' '))}</b><small>${esc(row.operation || 'CAMBIO')} · ${row.actor_id ? 'Usuario autenticado' : 'Sistema'}</small></div><time>${dateTime(row.occurred_at)}</time></article>`).join('') : '<div class="aux-loading">Sin eventos visibles.</div>'}</div></div>`;
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
    setFlyout(true);
  }

  function installNavigationHook() {
    const previous = window.goTo;
    if (typeof previous !== 'function' || previous.__auxCanonicalNavigation) return;
    const wrapped = function(name, ...args) {
      if ((name === 'configuracion' || name === 'historial-sistema' || CONFIG_CHILD_ROUTES.has(name) || name === 'config-tariff-matrix') && !canUseCenter()) return notify('Sin permiso para acceder a este módulo', 'error');
      const result = previous.call(this, name, ...args);
      closeFlyout();
      if (CONFIG_CHILD_ROUTES.has(name)) document.getElementById('nav-configuracion')?.classList.add('active');
      if (name === 'configuracion') renderCenter();
      if (name === 'historial-sistema') loadHistory();
      return result;
    };
    wrapped.__auxCanonicalNavigation = true;
    window.goTo = wrapped;
  }

  function init() {
    ensureScreenMetadata();
    if (canUseCenter()) {
      ensureRouteShells();
      injectCenter();
      configureBackofficeNavigation();
      renderCenter();
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
    if (sidenav) { sidenav.style.visibility = ''; sidenav.setAttribute('aria-busy', 'false'); }
  }

  Object.assign(window, {
    abrirCentroConfiguracion: openCenter,
    cerrarMenuConfiguracion: closeFlyout,
    irModuloConfiguracion: routeName => { closeFlyout(); if (typeof goTo === 'function') goTo(routeName); },
  });
  window.AuxiliosConfigurationCenter = { configure: () => canUseCenter() ? configureBackofficeNavigation() : configureDriverNavigation(), renderCenter, loadHistory };

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();
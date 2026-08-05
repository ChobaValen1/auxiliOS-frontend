/* AuxiliOS · Accesos operativos frecuentes fuera de Configuración */
(() => {
  'use strict';

  const MANAGEMENT_ROLES = new Set(['administracion', 'supervision']);
  const ACTIVE_SERVICE_STATUSES = new Set([
    'assigned',
    'en_route',
    'at_origin',
    'loaded',
    'at_destination',
  ]);
  const NON_OPERATIONAL_TRUCK_STATUSES = new Set([
    'maintenance',
    'workshop',
    'taller',
    'out_of_service',
    'fuera_de_servicio',
    'inactive',
    'inactivo',
  ]);
  const SERVICE_STATUS_LABELS = {
    assigned: 'Asignado',
    en_route: 'En camino',
    at_origin: 'En origen',
    loaded: 'Vehículo cargado',
    at_destination: 'En destino',
  };

  let applying = false;
  let scheduled = false;
  let fleetHooksInstalled = false;
  let serviceStateLoadedAt = 0;
  let serviceStateLoading = null;
  const activeServiceByTruck = new Map();

  const role = () => String(typeof PERFIL_USUARIO === 'undefined'
    ? ''
    : (PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role || '')).toLowerCase();
  const canUseFrequentNavigation = () => MANAGEMENT_ROLES.has(role());

  function setNavContent(id, icon, label) {
    const node = document.getElementById(id);
    if (!node) return null;
    const iconNode = node.querySelector('.nav-icon');
    const labelNode = node.querySelector('.nav-label');
    if (iconNode && iconNode.textContent !== icon) iconNode.textContent = icon;
    if (labelNode && labelNode.textContent !== label) labelNode.textContent = label;
    return node;
  }

  function injectStyles() {
    if (document.getElementById('frequent-navigation-css')) return;
    const style = document.createElement('style');
    style.id = 'frequent-navigation-css';
    style.textContent = `
      body.aux-backoffice-nav.aux-frequent-navigation .sidenav > #nav-camion.aux-frequent-direct,
      body.aux-backoffice-nav.aux-frequent-navigation .sidenav > #nav-jornadas-admin.aux-frequent-direct,
      body.aux-backoffice-nav.aux-frequent-navigation .sidenav > #nav-documentos.aux-frequent-direct,
      body.aux-backoffice-nav.aux-frequent-navigation .sidenav > #nav-remitos.aux-frequent-direct,
      body.aux-backoffice-nav.aux-frequent-navigation .sidenav > #nav-grilla.aux-frequent-direct {
        display: flex !important;
      }

      body.aux-frequent-navigation #aux-settings-grid,
      body.aux-frequent-navigation .aux-center-tool[onclick*="'grilla'"],
      body.aux-frequent-navigation #screen-historial-sistema .aux-history-shortcuts button[onclick*="'jornadas-admin'"],
      body.aux-frequent-navigation #screen-historial-sistema .aux-history-shortcuts button[onclick*="'documentos'"],
      body.aux-frequent-navigation #screen-historial-sistema .aux-history-shortcuts button[onclick*="'remitos'"] {
        display: none !important;
      }

      body.aux-frequent-navigation .camion-flota-card[data-fleet-state="workshop"] {
        border-left-color: var(--red) !important;
        opacity: .82;
      }
      body.aux-frequent-navigation .camion-flota-card[data-fleet-state="active-service"] {
        border-left-color: var(--blue) !important;
      }
      body.aux-frequent-navigation .camion-flota-card[data-fleet-state="available"] {
        border-left-color: var(--green) !important;
      }
      body.aux-frequent-navigation .camion-flota-card[data-fleet-state="no-shift"] {
        border-left-color: var(--muted) !important;
      }
      body.aux-frequent-navigation .aux-fleet-service-ref {
        display: block;
        margin-top: 3px;
        color: var(--muted2);
        font-size: 9px;
        font-family: 'DM Mono', monospace;
      }

      @media (max-height: 790px) {
        body.aux-backoffice-nav.aux-frequent-navigation .sidenav {
          padding-top: 8px;
          padding-bottom: 8px;
          gap: 2px;
        }
        body.aux-backoffice-nav.aux-frequent-navigation .nav-logo {
          margin-bottom: 7px;
          padding-bottom: 7px;
        }
        body.aux-backoffice-nav.aux-frequent-navigation .sidenav > .nav-item {
          width: 48px;
          height: 46px;
          min-height: 46px;
        }
        body.aux-backoffice-nav.aux-frequent-navigation .nav-item .nav-icon {
          font-size: 18px;
        }
        body.aux-backoffice-nav.aux-frequent-navigation .nav-item .nav-label {
          font-size: 7px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function removeGroupedDuplicates() {
    document.getElementById('aux-settings-grid')?.remove();
    document.querySelectorAll('.aux-center-tool').forEach(button => {
      if ((button.getAttribute('onclick') || '').includes("'grilla'")) button.remove();
    });
  }

  function ensureNavigationOrder(sidenav, bottom, nodes) {
    const ordered = nodes.filter(Boolean);
    const alreadyOrdered = ordered.every((node, index) => (
      node.parentElement === sidenav
      && node.nextElementSibling === (ordered[index + 1] || bottom)
    ));
    if (alreadyOrdered) return;
    ordered.forEach(node => sidenav.insertBefore(node, bottom));
  }

  function updateFleetScreenMeta() {
    if (typeof SCREENS === 'undefined') return;
    SCREENS.camion = {
      title: 'FLOTA',
      sub: 'Disponibilidad, uso y mantenimiento de móviles',
    };
    const screen = document.getElementById('screen-camion');
    if (!screen?.classList.contains('active')) return;
    const title = document.getElementById('topbar-title');
    const subtitle = document.getElementById('topbar-sub');
    if (title) title.textContent = SCREENS.camion.title;
    if (subtitle) subtitle.textContent = SCREENS.camion.sub;
  }

  async function loadActiveServiceState(force = false) {
    if (!canUseFrequentNavigation() || typeof _db === 'undefined') return;
    const now = Date.now();
    if (!force && now - serviceStateLoadedAt < 30000) return;
    if (serviceStateLoading) return serviceStateLoading;

    serviceStateLoading = (async () => {
      try {
        const { data, error } = await _db.rpc('list_operator_services', { p_limit: 300 });
        if (error) throw error;
        activeServiceByTruck.clear();
        (Array.isArray(data) ? data : []).forEach(service => {
          const truckId = service?.assigned_truck_id;
          if (!truckId || !ACTIVE_SERVICE_STATUSES.has(service.status)) return;
          const current = activeServiceByTruck.get(String(truckId));
          const currentDate = current?.updated_at || current?.assigned_at || current?.scheduled_for || '';
          const nextDate = service.updated_at || service.assigned_at || service.scheduled_for || '';
          if (!current || String(nextDate) >= String(currentDate)) {
            activeServiceByTruck.set(String(truckId), service);
          }
        });
        serviceStateLoadedAt = Date.now();
      } catch (error) {
        console.warn('[Flota] No se pudo cruzar el estado de servicios:', error?.message || error);
      } finally {
        serviceStateLoading = null;
      }
    })();

    return serviceStateLoading;
  }

  function visibleFleetRows() {
    if (typeof _flotaAdmin === 'undefined' || !Array.isArray(_flotaAdmin)) return [];
    const filter = typeof _flotaFiltro === 'undefined' ? 'todos' : _flotaFiltro;
    const query = typeof _flotaQuery === 'undefined' ? '' : String(_flotaQuery || '').trim().toLowerCase();
    const state = typeof _flotaEstado === 'undefined' ? {} : (_flotaEstado || {});

    return _flotaAdmin.filter(truck => {
      const truckState = state[truck.truck_id] || {};
      if (filter === 'enRuta' && !truckState.conductor) return false;
      if (filter === 'enBase' && truckState.conductor) return false;
      if (filter === 'alertas' && truckState.severidad !== 'critico' && truckState.severidad !== 'alerta') return false;
      if (filter === 'sinDatos' && truckState.severidad !== 'sin_datos') return false;
      if (query) {
        const searchable = `${truck.plate || ''} ${truck.numero_interno || ''} ${truck.brand || ''} ${truck.model || ''}`.toLowerCase();
        if (!searchable.includes(query)) return false;
      }
      return true;
    });
  }

  function normalizedTruckStatus(truck) {
    return String(truck?.status || '').trim().toLowerCase();
  }

  function fleetStatusFor(truck) {
    const maintenance = typeof _flotaEstado === 'undefined'
      ? {}
      : (_flotaEstado?.[truck.truck_id] || {});
    const service = activeServiceByTruck.get(String(truck.truck_id));
    const truckStatus = normalizedTruckStatus(truck);
    const nonOperational = NON_OPERATIONAL_TRUCK_STATUSES.has(truckStatus);

    if (nonOperational) {
      const workshop = ['maintenance', 'workshop', 'taller'].includes(truckStatus);
      return {
        key: 'workshop',
        html: `<span style="color:var(--red)">⛔ ${workshop ? 'En taller' : 'Fuera de servicio'}</span>`,
      };
    }
    if (maintenance.severidad === 'critico') {
      return {
        key: 'workshop',
        html: '<span style="color:var(--red)">⛔ No apto · service vencido</span>',
      };
    }
    if (service) {
      const serviceLabel = SERVICE_STATUS_LABELS[service.status] || 'Servicio activo';
      const number = service.service_number
        ? `<span class="aux-fleet-service-ref">${String(service.service_number)}</span>`
        : '';
      return {
        key: 'active-service',
        html: `<span style="color:var(--blue)">● ${serviceLabel}</span>${number}`,
      };
    }
    if (maintenance.conductor) {
      const alert = maintenance.severidad === 'alerta' ? ' · mantenimiento próximo' : '';
      return {
        key: 'available',
        html: `<span style="color:var(--green)">● Disponible${alert}</span>`,
      };
    }
    if (maintenance.severidad === 'alerta') {
      return {
        key: 'no-shift',
        html: '<span style="color:var(--amber)">○ Sin jornada · mantenimiento próximo</span>',
      };
    }
    if (maintenance.severidad === 'sin_datos') {
      return {
        key: 'no-shift',
        html: '<span style="color:var(--muted)">○ Sin jornada · sin historial</span>',
      };
    }
    return {
      key: 'no-shift',
      html: '<span style="color:var(--muted)">○ Sin jornada</span>',
    };
  }

  function decorateFleetCards() {
    if (!canUseFrequentNavigation()) return;
    const rows = visibleFleetRows();
    const cards = [...document.querySelectorAll('#camion-cards-container .camion-flota-card')];
    cards.forEach((card, index) => {
      const truck = rows[index];
      if (!truck) return;
      const status = fleetStatusFor(truck);
      card.dataset.truckId = String(truck.truck_id);
      card.dataset.fleetState = status.key;
      const target = card.querySelector('.camion-flota-status');
      if (target) target.innerHTML = status.html;
    });
  }

  function installFleetHooks() {
    if (fleetHooksInstalled || !canUseFrequentNavigation()) return;
    if (typeof window._renderCamionFlotaAdmin !== 'function' || typeof window._pintarFlotaAdmin !== 'function') return;

    const previousRender = window._renderCamionFlotaAdmin;
    const previousPaint = window._pintarFlotaAdmin;

    window._renderCamionFlotaAdmin = async function(...args) {
      const result = await previousRender.apply(this, args);
      await loadActiveServiceState(true);
      decorateFleetCards();
      return result;
    };

    window._pintarFlotaAdmin = function(...args) {
      const result = previousPaint.apply(this, args);
      decorateFleetCards();
      return result;
    };

    fleetHooksInstalled = true;
  }

  function apply() {
    scheduled = false;
    if (applying) return;
    applying = true;
    try {
      if (!canUseFrequentNavigation()) {
        document.body.classList.remove('aux-frequent-navigation');
        return;
      }

      injectStyles();
      document.body.classList.add('aux-frequent-navigation');
      updateFleetScreenMeta();
      installFleetHooks();

      const sidenav = document.querySelector('.sidenav');
      const bottom = sidenav?.querySelector('.nav-bottom');
      if (!sidenav || !bottom) return;

      const dashboard = setNavContent('nav-dashboard', '📊', 'Resumen');
      const services = setNavContent('nav-operaciones', '🧭', 'Servicios');
      const fleet = setNavContent('nav-camion', '🚛', 'Flota');
      const journeys = setNavContent('nav-jornadas-admin', '🗓️', 'Jornadas');
      const documents = setNavContent('nav-documentos', '📄', 'Docs');
      const remitos = setNavContent('nav-remitos', '🧾', 'Remitos');
      const grid = setNavContent('nav-grilla', '📅', 'Grilla');
      const configuration = setNavContent('nav-configuracion', '⚙️', 'Configuración');
      const billing = setNavContent('nav-config-tariff-matrix', '💳', 'Facturación');
      const history = setNavContent('nav-historial-sistema', '◷', 'Historial');

      [fleet, journeys, documents, remitos, grid].filter(Boolean).forEach(node => {
        node.classList.add('aux-frequent-direct');
      });

      const orderedNavigation = [
        dashboard,
        services,
        fleet,
        journeys,
        documents,
        remitos,
        grid,
        configuration,
        billing,
        history,
      ].filter(Boolean);
      orderedNavigation.forEach(node => node.classList.add('aux-top-nav'));
      ensureNavigationOrder(sidenav, bottom, orderedNavigation);

      removeGroupedDuplicates();
    } finally {
      applying = false;
    }
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(apply, 40);
  }

  function init() {
    injectStyles();
    apply();

    window.addEventListener('auxilios:profile-ready', scheduleApply);
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true });

    let attempts = 0;
    const timer = setInterval(() => {
      apply();
      if ((role() && document.getElementById('nav-historial-sistema') && fleetHooksInstalled) || ++attempts > 50) clearInterval(timer);
    }, 200);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();
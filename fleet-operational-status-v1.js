/* AuxiliOS · Estado operativo de flota · sin ownership de navegación */
(() => {
  'use strict';

  const MANAGEMENT_ROLES = new Set(['administracion', 'supervision']);
  const ACTIVE_SERVICE_STATUSES = new Set(['assigned', 'en_route', 'at_origin', 'loaded', 'at_destination']);
  const NON_OPERATIONAL_TRUCK_STATUSES = new Set(['maintenance', 'workshop', 'taller', 'out_of_service', 'fuera_de_servicio', 'inactive', 'inactivo']);
  const SERVICE_STATUS_LABELS = {
    assigned: 'Asignado',
    en_route: 'En camino',
    at_origin: 'En origen',
    loaded: 'Vehículo cargado',
    at_destination: 'En destino',
  };

  const activeServiceByTruck = new Map();
  let loadedAt = 0;
  let loading = null;
  let hooksInstalled = false;

  const role = () => String(typeof PERFIL_USUARIO === 'undefined'
    ? ''
    : (PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role || '')).toLowerCase();
  const allowed = () => MANAGEMENT_ROLES.has(role());

  function injectStyles() {
    if (document.getElementById('fleet-operational-status-v1-css')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="fleet-operational-status-v1-css">
      .camion-flota-card[data-fleet-state="workshop"]{border-left-color:var(--red)!important;opacity:.82}
      .camion-flota-card[data-fleet-state="active-service"]{border-left-color:var(--blue)!important}
      .camion-flota-card[data-fleet-state="available"]{border-left-color:var(--green)!important}
      .camion-flota-card[data-fleet-state="no-shift"]{border-left-color:var(--muted)!important}
      .aux-fleet-service-ref{display:block;margin-top:3px;color:var(--muted2);font-size:9px;font-family:'DM Mono',monospace}
    </style>`);
  }

  async function loadActiveServices(force = false) {
    if (!allowed() || typeof _db === 'undefined') return;
    const now = Date.now();
    if (!force && now - loadedAt < 30000) return;
    if (loading) return loading;
    loading = (async () => {
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
          if (!current || String(nextDate) >= String(currentDate)) activeServiceByTruck.set(String(truckId), service);
        });
        loadedAt = Date.now();
      } catch (error) {
        console.warn('[Flota] No se pudo cruzar el estado de servicios:', error?.message || error);
      } finally {
        loading = null;
      }
    })();
    return loading;
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
      if (filter === 'alertas' && !['critico', 'alerta'].includes(truckState.severidad)) return false;
      if (filter === 'sinDatos' && truckState.severidad !== 'sin_datos') return false;
      if (!query) return true;
      return `${truck.plate || ''} ${truck.numero_interno || ''} ${truck.brand || ''} ${truck.model || ''}`.toLowerCase().includes(query);
    });
  }

  function statusFor(truck) {
    const maintenance = typeof _flotaEstado === 'undefined' ? {} : (_flotaEstado?.[truck.truck_id] || {});
    const service = activeServiceByTruck.get(String(truck.truck_id));
    const truckStatus = String(truck?.status || '').trim().toLowerCase();
    if (NON_OPERATIONAL_TRUCK_STATUSES.has(truckStatus) || maintenance.severidad === 'critico') {
      const workshop = ['maintenance', 'workshop', 'taller'].includes(truckStatus);
      return { key: 'workshop', html: `<span style="color:var(--red)">⛔ ${workshop ? 'En taller' : maintenance.severidad === 'critico' ? 'No apto · service vencido' : 'Fuera de servicio'}</span>` };
    }
    if (service) {
      const number = service.service_number ? `<span class="aux-fleet-service-ref">${String(service.service_number)}</span>` : '';
      return { key: 'active-service', html: `<span style="color:var(--blue)">● ${SERVICE_STATUS_LABELS[service.status] || 'Servicio activo'}</span>${number}` };
    }
    if (maintenance.conductor) {
      return { key: 'available', html: `<span style="color:var(--green)">● Disponible${maintenance.severidad === 'alerta' ? ' · mantenimiento próximo' : ''}</span>` };
    }
    const suffix = maintenance.severidad === 'alerta' ? ' · mantenimiento próximo' : maintenance.severidad === 'sin_datos' ? ' · sin historial' : '';
    return { key: 'no-shift', html: `<span style="color:var(--muted)">○ Sin jornada${suffix}</span>` };
  }

  function decorate() {
    if (!allowed()) return;
    const rows = visibleFleetRows();
    [...document.querySelectorAll('#camion-cards-container .camion-flota-card')].forEach((card, index) => {
      const truck = rows[index];
      if (!truck) return;
      const state = statusFor(truck);
      card.dataset.truckId = String(truck.truck_id);
      card.dataset.fleetState = state.key;
      const target = card.querySelector('.camion-flota-status');
      if (target) target.innerHTML = state.html;
    });
  }

  function installHooks() {
    if (hooksInstalled || !allowed()) return;
    if (typeof window._renderCamionFlotaAdmin !== 'function' || typeof window._pintarFlotaAdmin !== 'function') return;
    const previousRender = window._renderCamionFlotaAdmin;
    const previousPaint = window._pintarFlotaAdmin;
    window._renderCamionFlotaAdmin = async function(...args) {
      const result = await previousRender.apply(this, args);
      await loadActiveServices(true);
      decorate();
      return result;
    };
    window._pintarFlotaAdmin = function(...args) {
      const result = previousPaint.apply(this, args);
      decorate();
      return result;
    };
    hooksInstalled = true;
  }

  function init() {
    if (!allowed()) return;
    injectStyles();
    if (typeof SCREENS !== 'undefined') SCREENS.camion = { title: 'FLOTA', sub: 'Disponibilidad, uso y mantenimiento de móviles' };
    let attempts = 0;
    const timer = setInterval(() => {
      installHooks();
      if (hooksInstalled || ++attempts > 40) clearInterval(timer);
    }, 200);
  }

  window.AuxiliosFleetOperationalStatusV1 = { refresh: async () => { await loadActiveServices(true); decorate(); } };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();
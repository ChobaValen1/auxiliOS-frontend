/* AuxiliOS · Flota administrativa · Detalle por móvil v2 */
(() => {
  'use strict';

  const MANAGEMENT_ROLES = new Set(['administracion', 'supervision']);
  const state = {
    installed: false,
    truckId: null,
    truck: null,
    journeys: [],
    summaryHtml: '',
    activeTab: 'resumen',
    loading: false,
  };

  const role = () => String(typeof PERFIL_USUARIO === 'undefined'
    ? ''
    : (PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role || '')).toLowerCase();
  const allowed = () => MANAGEMENT_ROLES.has(role());
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
  const number = value => Number(value || 0);
  const km = value => Number.isFinite(Number(value))
    ? `${Number(value).toLocaleString('es-AR')} km`
    : '—';
  const money = value => Number(value || 0).toLocaleString('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  });
  const dateLabel = value => {
    if (!value) return '—';
    const raw = String(value).slice(0, 10);
    const [year, month, day] = raw.split('-');
    return year && month && day ? `${day}/${month}/${year}` : raw;
  };
  const timeLabel = value => value ? String(value).slice(0, 5) : '—';
  const journeyStatus = row => String(row?.status || '').toLowerCase() === 'open'
    ? '<span class="fadv-pill open">Abierta</span>'
    : '<span class="fadv-pill closed">Cerrada</span>';
  const currentTruck = truckId => (typeof _flotaAdmin === 'undefined' ? [] : (_flotaAdmin || []))
    .find(truck => String(truck.truck_id) === String(truckId)) || null;

  function injectAssets() {
    if (!document.getElementById('fleet-admin-detail-v2-css')) {
      const link = document.createElement('link');
      link.id = 'fleet-admin-detail-v2-css';
      link.rel = 'stylesheet';
      link.href = '/fleet-admin-detail-v2.css';
      document.head.appendChild(link);
    }
  }

  async function loadJourneys(truckId) {
    const baseFields = 'log_id,log_date,status,km_inicio,km_final,hora_inicio,hora_fin,driver_id,truck_id,created_at';
    let response = await _db
      .from('daily_logs')
      .select(`${baseFields},users(full_name)`)
      .eq('truck_id', truckId)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);

    if (!response.error) return response.data || [];

    response = await _db
      .from('daily_logs')
      .select(baseFields)
      .eq('truck_id', truckId)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);
    if (response.error) throw response.error;

    const rows = response.data || [];
    const driverIds = [...new Set(rows.map(row => row.driver_id).filter(Boolean))];
    if (!driverIds.length) return rows;
    const usersResponse = await _db.from('users').select('user_id,full_name').in('user_id', driverIds);
    const names = new Map((usersResponse.data || []).map(user => [String(user.user_id), user.full_name]));
    return rows.map(row => ({
      ...row,
      users: { full_name: names.get(String(row.driver_id)) || null },
    }));
  }

  function totalJourneyKm(rows = state.journeys) {
    return rows.reduce((sum, row) => {
      const start = number(row.km_inicio);
      const end = number(row.km_final);
      return sum + (end >= start && end > 0 ? end - start : 0);
    }, 0);
  }

  function renderJourneyKpis() {
    const rows = state.journeys;
    const closed = rows.filter(row => String(row.status).toLowerCase() !== 'open');
    const open = rows.find(row => String(row.status).toLowerCase() === 'open');
    const total = totalJourneyKm(rows);
    const average = closed.length ? Math.round(total / closed.length) : 0;
    return `
      <div class="fadv-kpis">
        <div class="fadv-kpi"><small>Jornadas registradas</small><b>${rows.length}</b></div>
        <div class="fadv-kpi"><small>Jornada actual</small><b class="${open ? 'ok' : 'muted'}">${open ? 'Abierta' : 'Sin jornada'}</b></div>
        <div class="fadv-kpi"><small>KM recorridos</small><b>${total.toLocaleString('es-AR')}</b></div>
        <div class="fadv-kpi"><small>Promedio por jornada</small><b>${average.toLocaleString('es-AR')}</b></div>
      </div>`;
  }

  function renderCurrentJourney() {
    const open = state.journeys.find(row => String(row.status).toLowerCase() === 'open');
    if (!open) {
      return `<div class="fadv-current empty"><div><small>Jornada actual</small><b>Sin jornada abierta</b><span>El móvil permanece visible en Flota, pero no tiene un chofer operativo asociado.</span></div></div>`;
    }
    const driver = open.users?.full_name || 'Chofer sin identificar';
    return `
      <div class="fadv-current">
        <div><small>Jornada actual</small><b>${esc(driver)}</b><span>Inició ${dateLabel(open.log_date)} a las ${timeLabel(open.hora_inicio)}</span></div>
        <div class="fadv-current-km"><small>Odómetro inicial</small><b>${km(open.km_inicio)}</b></div>
        ${journeyStatus(open)}
      </div>`;
  }

  function renderJourneyTable() {
    if (!state.journeys.length) {
      return '<div class="fadv-empty">Este móvil todavía no tiene jornadas registradas.</div>';
    }
    const rows = state.journeys.map(row => {
      const start = number(row.km_inicio);
      const end = number(row.km_final);
      const travelled = end >= start && end > 0 ? end - start : null;
      return `
        <tr>
          <td><b>${dateLabel(row.log_date)}</b></td>
          <td>${esc(row.users?.full_name || 'Sin identificar')}</td>
          <td>${timeLabel(row.hora_inicio)}</td>
          <td>${timeLabel(row.hora_fin)}</td>
          <td>${km(row.km_inicio)}</td>
          <td>${row.km_final != null ? km(row.km_final) : '—'}</td>
          <td><b>${travelled == null ? '—' : km(travelled)}</b></td>
          <td>${journeyStatus(row)}</td>
        </tr>`;
    }).join('');
    return `<div class="fadv-table-wrap"><table class="fadv-table"><thead><tr><th>Fecha</th><th>Chofer</th><th>Inicio</th><th>Fin</th><th>KM inicio</th><th>KM final</th><th>Recorrido</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function renderJourneys() {
    return `
      <section class="fadv-section-head"><div><small>Uso del móvil</small><h3>Jornadas y uso</h3><p>Turnos vinculados a esta unidad. El módulo global Jornadas continúa disponible para supervisar toda la operación.</p></div><button class="btn btn-ghost" onclick="goTo('jornadas-admin')">Abrir Jornadas</button></section>
      ${renderJourneyKpis()}
      ${renderCurrentJourney()}
      ${renderJourneyTable()}`;
  }

  function maintenanceSeverity() {
    const plans = typeof _camionPlanes === 'undefined' ? [] : (_camionPlanes || []);
    return [...plans]
      .filter(plan => plan.plan_estado && plan.plan_estado !== '_error')
      .sort((a, b) => (a.km_restantes ?? Infinity) - (b.km_restantes ?? Infinity))[0] || null;
  }

  function renderMaintenance() {
    const plans = typeof _camionPlanes === 'undefined' ? [] : (_camionPlanes || []);
    const executions = typeof _camionHistorial === 'undefined' ? [] : (_camionHistorial || []);
    const urgent = maintenanceSeverity();
    const urgentText = !urgent ? 'Sin planes configurados'
      : urgent.km_restantes == null ? `${esc(urgent.name)} · sin referencia de odómetro`
      : urgent.km_restantes <= 0 ? `${esc(urgent.name)} · vencido por ${Math.abs(urgent.km_restantes).toLocaleString('es-AR')} km`
      : `${esc(urgent.name)} · faltan ${urgent.km_restantes.toLocaleString('es-AR')} km`;
    return `
      <section class="fadv-section-head"><div><small>Estado técnico</small><h3>Mantenimiento</h3><p>Planes preventivos y ejecuciones registradas para el móvil.</p></div><div class="fadv-actions"><button class="btn btn-ghost" onclick="openPlanModal()">＋ Plan</button><button class="btn btn-primary" onclick="openServiceModal()">＋ Service</button></div></section>
      <div class="fadv-kpis fadv-kpis-three"><div class="fadv-kpi"><small>Planes activos</small><b>${plans.filter(plan => !plan._error).length}</b></div><div class="fadv-kpi"><small>Ejecuciones</small><b>${executions.length}</b></div><div class="fadv-kpi"><small>Próximo control</small><b class="${urgent?.km_restantes != null && urgent.km_restantes <= 0 ? 'bad' : ''}">${urgentText}</b></div></div>
      <div class="fadv-callout"><div><b>Detalle técnico existente</b><span>La gestión completa de planes y services continúa utilizando la lógica productiva actual.</span></div><button class="btn btn-ghost" onclick="_abrirSubCamion('camion-sub-planes')">Ver planes y services</button></div>`;
  }

  function renderFuel() {
    const rows = typeof _camionCombustible === 'undefined' ? [] : (_camionCombustible || []);
    const liters = rows.reduce((sum, row) => sum + number(row.liters), 0);
    const cost = rows.reduce((sum, row) => sum + number(row.total_cost), 0);
    const table = rows.length ? `
      <div class="fadv-table-wrap"><table class="fadv-table"><thead><tr><th>Fecha</th><th>Litros</th><th>Precio/L</th><th>Total</th><th>KM</th><th>Estación</th></tr></thead><tbody>${rows.slice(0, 30).map(row => `<tr><td>${dateLabel(row.fuel_date)}</td><td><b>${number(row.liters).toLocaleString('es-AR')} L</b></td><td>${money(row.price_per_liter)}</td><td><b>${money(row.total_cost)}</b></td><td>${row.km_at_load != null ? km(row.km_at_load) : '—'}</td><td>${esc(row.gas_station || '—')}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="fadv-empty">No hay cargas de combustible registradas para este móvil.</div>';
    return `
      <section class="fadv-section-head"><div><small>Consumo</small><h3>Combustible</h3><p>Cargas registradas y trazabilidad económica de la unidad.</p></div><button class="btn btn-primary" onclick="openFuelModal()">＋ Cargar combustible</button></section>
      <div class="fadv-kpis fadv-kpis-three"><div class="fadv-kpi"><small>Cargas</small><b>${rows.length}</b></div><div class="fadv-kpi"><small>Litros acumulados</small><b>${liters.toLocaleString('es-AR')}</b></div><div class="fadv-kpi"><small>Costo acumulado</small><b>${money(cost)}</b></div></div>${table}`;
  }

  function conditionLabel(value) {
    const labels = { bueno: 'Bueno', regular: 'Regular', malo: 'Malo' };
    return labels[value] || 'Sin dato';
  }

  function conditionClass(value) {
    return value === 'bueno' ? 'ok' : value === 'regular' ? 'warn' : value === 'malo' ? 'bad' : 'muted';
  }

  function renderTires() {
    const control = typeof _camionNeumaticos === 'undefined' ? null : _camionNeumaticos;
    return `
      <section class="fadv-section-head"><div><small>Control preventivo</small><h3>Neumáticos y frenos</h3><p>Último control registrado para la unidad.</p></div><button class="btn btn-primary" onclick="openNeumaticosModal()">＋ Registrar control</button></section>
      ${control ? `<div class="fadv-condition-grid"><div class="fadv-condition ${conditionClass(control.tire_condition)}"><small>Neumáticos</small><b>${conditionLabel(control.tire_condition)}</b><span>${control.pressure_psi ? `${esc(control.pressure_psi)} PSI` : 'Presión no informada'}</span></div><div class="fadv-condition ${conditionClass(control.brake_condition)}"><small>Frenos</small><b>${conditionLabel(control.brake_condition)}</b><span>Estado del último control</span></div><div class="fadv-condition"><small>Fecha del control</small><b>${dateLabel(control.check_date)}</b><span>${esc(control.notes || 'Sin observaciones')}</span></div></div>` : '<div class="fadv-empty">Este móvil no tiene controles de neumáticos y frenos registrados.</div>'}`;
  }

  function historyEvents() {
    const journeys = state.journeys.map(row => ({
      date: `${row.log_date || ''} ${row.hora_inicio || ''}`,
      icon: '🗓️',
      title: String(row.status).toLowerCase() === 'open' ? 'Jornada iniciada' : 'Jornada cerrada',
      detail: `${row.users?.full_name || 'Chofer sin identificar'}${row.km_final != null ? ` · ${km(Math.max(0, number(row.km_final) - number(row.km_inicio)))}` : ''}`,
    }));
    const services = (typeof _camionHistorial === 'undefined' ? [] : (_camionHistorial || [])).map(row => ({
      date: row.performed_at || row.created_at || '',
      icon: '🔧', title: row.master_service_plans?.name || 'Service registrado',
      detail: `${row.km_at_service != null ? km(row.km_at_service) : 'Sin KM'}${row.workshop ? ` · ${row.workshop}` : ''}`,
    }));
    const fuel = (typeof _camionCombustible === 'undefined' ? [] : (_camionCombustible || [])).map(row => ({
      date: row.fuel_date || row.created_at || '', icon: '⛽', title: 'Carga de combustible',
      detail: `${number(row.liters).toLocaleString('es-AR')} L · ${money(row.total_cost)}`,
    }));
    return [...journeys, ...services, ...fuel]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 50);
  }

  function renderHistory() {
    const events = historyEvents();
    return `
      <section class="fadv-section-head"><div><small>Trazabilidad</small><h3>Historial del móvil</h3><p>Eventos operativos, jornadas, combustible y mantenimiento ordenados cronológicamente.</p></div></section>
      ${events.length ? `<div class="fadv-timeline">${events.map(event => `<div class="fadv-event"><span class="fadv-event-icon">${event.icon}</span><div><small>${dateLabel(event.date)}</small><b>${esc(event.title)}</b><span>${esc(event.detail)}</span></div></div>`).join('')}</div>` : '<div class="fadv-empty">No hay eventos registrados para este móvil.</div>'}`;
  }

  function panelContent(tab) {
    if (tab === 'jornadas') return renderJourneys();
    if (tab === 'mantenimiento') return renderMaintenance();
    if (tab === 'combustible') return renderFuel();
    if (tab === 'neumaticos') return renderTires();
    if (tab === 'historial') return renderHistory();
    return `<div class="fadv-summary">${state.summaryHtml}</div>`;
  }

  function renderShell() {
    const container = document.getElementById('camion-cards-container');
    if (!container || !state.truck) return;
    const truckName = state.truck.numero_interno != null
      ? `Móvil ${esc(state.truck.numero_interno)}`
      : esc(state.truck.plate || `Unidad ${state.truck.truck_id}`);
    const tabs = [
      ['resumen', 'Resumen'],
      ['jornadas', 'Jornadas y uso'],
      ['mantenimiento', 'Mantenimiento'],
      ['combustible', 'Combustible'],
      ['neumaticos', 'Neumáticos y frenos'],
      ['historial', 'Historial'],
    ];
    container.innerHTML = `
      <div class="fadv-shell" data-truck-id="${esc(state.truckId)}">
        <div class="fadv-toolbar"><button class="btn btn-ghost" onclick="FleetAdminDetailV2.back()">← Volver a Flota</button><div><small>Detalle del móvil</small><b>${truckName}</b></div><button class="btn btn-ghost" onclick="FleetAdminDetailV2.refresh()">↻ Actualizar</button></div>
        <nav class="fadv-tabs" aria-label="Secciones del móvil">${tabs.map(([key, label]) => `<button class="fadv-tab ${state.activeTab === key ? 'active' : ''}" onclick="FleetAdminDetailV2.openTab('${key}')">${label}</button>`).join('')}</nav>
        <div class="fadv-panel" id="fadv-panel">${panelContent(state.activeTab)}</div>
      </div>`;
  }

  async function enhance(truckId) {
    if (!allowed()) return;
    const container = document.getElementById('camion-cards-container');
    if (!container) return;
    const back = container.querySelector('.btn-camion-back');
    back?.remove();
    state.truckId = truckId;
    state.truck = currentTruck(truckId) || (typeof _truckActual === 'undefined' ? null : _truckActual);
    state.summaryHtml = container.innerHTML;
    state.activeTab = 'resumen';
    state.loading = true;
    renderShell();
    try {
      state.journeys = await loadJourneys(truckId);
    } catch (error) {
      console.error('[Flota] No se pudieron cargar las jornadas del móvil:', error);
      state.journeys = [];
      if (typeof toast === 'function') toast('No se pudieron cargar las jornadas del móvil', 'error');
    } finally {
      state.loading = false;
      renderShell();
    }
  }

  function install() {
    if (state.installed || !allowed()) return;
    if (typeof window._abrirCamionDetalleAdmin !== 'function') return;
    const previous = window._abrirCamionDetalleAdmin;
    if (previous.__fleetDetailV2Wrapped) {
      state.installed = true;
      return;
    }
    const wrapped = async function(truckId, ...args) {
      const result = await previous.call(this, truckId, ...args);
      await enhance(truckId);
      return result;
    };
    wrapped.__fleetDetailV2Wrapped = true;
    window._abrirCamionDetalleAdmin = wrapped;
    state.installed = true;
  }

  window.FleetAdminDetailV2 = {
    openTab(tab) {
      state.activeTab = tab;
      renderShell();
    },
    async refresh() {
      if (!state.truckId || typeof window._abrirCamionDetalleAdmin !== 'function') return;
      await window._abrirCamionDetalleAdmin(state.truckId);
    },
    back() {
      state.truckId = null;
      state.truck = null;
      state.journeys = [];
      state.summaryHtml = '';
      state.activeTab = 'resumen';
      if (typeof _renderCamionFlotaAdmin === 'function') _renderCamionFlotaAdmin();
    },
    enhance,
  };

  function init() {
    injectAssets();
    install();
    let attempts = 0;
    const timer = setInterval(() => {
      install();
      if (state.installed || ++attempts > 60) clearInterval(timer);
    }, 200);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();

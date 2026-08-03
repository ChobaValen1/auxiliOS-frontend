/* AuxiliOS · Fase 3A · Puente servicio → jornada → viaje → remito */
(() => {
  'use strict';

  const P3 = window.AuxiliosPhase3 = window.AuxiliosPhase3 || {
    queue: [],
    loading: false,
    timer: null,
    selectedServiceId: null,
    traceObserver: null,
    initialized: false,
  };

  const ACTIVE_STATUSES = ['assigned', 'en_route', 'at_origin', 'loaded', 'at_destination'];
  const STATUS = {
    assigned:       { label: 'Asignado',          icon: '●', tone: 'blue' },
    en_route:       { label: 'En camino',         icon: '➜', tone: 'blue' },
    at_origin:      { label: 'En origen',         icon: '⌖', tone: 'violet' },
    loaded:         { label: 'Vehículo cargado',  icon: '↑', tone: 'violet' },
    at_destination: { label: 'En destino',        icon: '◆', tone: 'green' },
    completed:      { label: 'Finalizado',        icon: '✓', tone: 'green' },
    cancelled:      { label: 'Cancelado',         icon: '×', tone: 'red' },
  };
  const NEXT = {
    assigned:       { status: 'en_route',       label: 'Iniciar viaje' },
    en_route:       { status: 'at_origin',      label: 'Llegué al origen' },
    at_origin:      { status: 'loaded',         label: 'Vehículo cargado' },
    loaded:         { status: 'at_destination', label: 'Llegué al destino' },
    at_destination: { status: 'completed',      label: 'Finalizar servicio' },
  };

  const getDb = () => typeof _db !== 'undefined' ? _db : null;
  const getProfile = () => typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : null;
  const getCurrentUser = () => typeof USUARIO_ACTUAL !== 'undefined' ? USUARIO_ACTUAL : null;
  const role = () => getProfile()?.roles?.name || getProfile()?.role || '';
  const isDriver = () => role() === 'chofer';
  const canTrace = () => ['administracion', 'operador', 'supervision', 'facturacion'].includes(role());
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const notify = (message, type = 'info') => {
    if (typeof window.toast === 'function') window.toast(message, type);
    else console[type === 'error' ? 'error' : 'log'](message);
  };
  const formatDate = value => value
    ? new Date(value).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })
    : '—';

  function injectAssets() {
    if (!document.getElementById('phase3-service-bridge-css')) {
      const link = document.createElement('link');
      link.id = 'phase3-service-bridge-css';
      link.rel = 'stylesheet';
      link.href = '/operator-service-bridge.css';
      document.head.appendChild(link);
    }
  }

  function injectDriverPanel() {
    if (!isDriver() || document.getElementById('phase3-driver-services')) return;
    const dashboard = document.getElementById('screen-dashboard');
    if (!dashboard) return;

    dashboard.insertAdjacentHTML('afterbegin', `
      <section id="phase3-driver-services" class="p3-driver-panel" aria-live="polite">
        <div class="p3-panel-head">
          <div>
            <div class="p3-eyebrow">Despacho conectado</div>
            <h3>Servicios asignados</h3>
          </div>
          <button type="button" class="p3-refresh" onclick="actualizarServiciosAsignados()" aria-label="Actualizar servicios">↻</button>
        </div>
        <div id="phase3-driver-services-list" class="p3-service-list">
          <div class="p3-empty">Buscando servicios asignados…</div>
        </div>
      </section>
    `);
  }

  async function loadDriverQueue({ silent = false } = {}) {
    if (!isDriver() || P3.loading || !getDb()) return;
    P3.loading = true;
    try {
      const { data, error } = await getDb().rpc('get_driver_operator_queue');
      if (error) throw error;
      P3.queue = Array.isArray(data) ? data.filter(item => ACTIVE_STATUSES.includes(item.status)) : [];
      renderDriverQueue();
    } catch (error) {
      if (!silent) notify(error.message || 'No se pudieron cargar los servicios asignados', 'error');
      const list = document.getElementById('phase3-driver-services-list');
      if (list && !P3.queue.length) {
        list.innerHTML = '<div class="p3-empty">No se pudo actualizar el despacho.</div>';
      }
    } finally {
      P3.loading = false;
    }
  }

  function serviceAction(service) {
    if (service.status === 'at_destination' && !service.remito_id) {
      return `<button type="button" class="p3-primary" onclick="abrirRemitoServicio('${service.service_id}')">Completar remito</button>`;
    }

    const next = NEXT[service.status];
    if (!next) return '';

    const disabled = service.status === 'at_destination' && !['firmado', 'cerrado_admin'].includes(service.remito_status);
    const title = disabled ? 'El remito todavía no está firmado' : '';
    return `<button type="button" class="p3-primary" ${disabled ? 'disabled' : ''}
      title="${esc(title)}"
      onclick="avanzarServicioAsignado('${service.service_id}','${next.status}')">${next.label}</button>`;
  }

  function renderDriverQueue() {
    injectDriverPanel();
    const list = document.getElementById('phase3-driver-services-list');
    const panel = document.getElementById('phase3-driver-services');
    if (!list || !panel) return;

    panel.classList.toggle('has-services', P3.queue.length > 0);
    if (!P3.queue.length) {
      list.innerHTML = `
        <div class="p3-empty">
          <span>✓</span>
          No tenés servicios activos asignados.
        </div>`;
      return;
    }

    list.innerHTML = P3.queue.map(service => {
      const meta = STATUS[service.status] || STATUS.assigned;
      const hasRemito = Boolean(service.remito_id);
      const evidence = Number(service.evidence_count || 0);
      const incidents = Number(service.incident_count || 0);
      return `
        <article class="p3-service-card priority-${esc(service.priority || 'normal')}">
          <div class="p3-service-top">
            <div>
              <span class="p3-service-number">${esc(service.service_number)}</span>
              ${service.service_order_number ? `<span class="p3-order">Prestación ${esc(service.service_order_number)}</span>` : ''}
            </div>
            <span class="p3-status ${meta.tone}">${meta.icon} ${meta.label}</span>
          </div>

          <div class="p3-company">${esc(service.company_name || 'Prestadora')}</div>
          <div class="p3-concept">${esc(service.concept_icon || '◆')} ${esc(service.concept_name || 'Servicio')}</div>

          <div class="p3-route">
            <div><small>Origen</small><b>${esc(service.origin)}</b></div>
            <span>→</span>
            <div><small>Destino</small><b>${esc(service.destination)}</b></div>
          </div>

          <div class="p3-service-meta">
            <span>🕒 ${formatDate(service.scheduled_for)}</span>
            ${service.vehicle_plate ? `<span>🚗 ${esc(service.vehicle_plate)}</span>` : ''}
            ${service.truck_label ? `<span>🚛 ${esc(service.truck_label)}</span>` : ''}
          </div>

          ${service.driver_instructions ? `<div class="p3-instructions">${esc(service.driver_instructions)}</div>` : ''}

          <div class="p3-linkage">
            <span class="${service.trip_id ? 'ok' : ''}">${service.trip_id ? '✓ Viaje iniciado' : '○ Viaje pendiente'}</span>
            <span class="${hasRemito ? 'ok' : ''}">${hasRemito ? `✓ ${esc(service.remito_number || 'Remito vinculado')}` : '○ Remito pendiente'}</span>
            <span class="${incidents ? 'warn' : ''}">${incidents ? `⚠ ${incidents} incidente${incidents === 1 ? '' : 's'} · ${evidence} evidencia${evidence === 1 ? '' : 's'}` : '✓ Sin incidentes'}</span>
          </div>

          <div class="p3-actions">
            ${service.trip_id && service.journey_log_id
              ? `<button type="button" class="p3-secondary" onclick="reportarIncidenteServicio('${service.service_id}')">Reportar incidente</button>`
              : ''}
            ${service.status === 'at_destination' && service.remito_id
              ? `<button type="button" class="p3-secondary" onclick="abrirRemitoServicio('${service.service_id}')">Ver / completar remito</button>`
              : ''}
            ${serviceAction(service)}
          </div>
        </article>`;
    }).join('');
  }

  async function advanceService(serviceId, toStatus) {
    if (!isDriver() || !getDb()) return;
    const button = document.querySelector(`[onclick="avanzarServicioAsignado('${serviceId}','${toStatus}')"]`);
    if (button) {
      button.disabled = true;
      button.dataset.previousText = button.textContent;
      button.textContent = 'Actualizando…';
    }

    try {
      const note = toStatus === 'completed'
        ? (window.prompt('Nota final del servicio (opcional):') || null)
        : null;
      const { error } = await getDb().rpc('advance_operator_service', {
        p_service_id: serviceId,
        p_to_status: toStatus,
        p_note: note,
      });
      if (error) throw error;
      notify(toStatus === 'completed' ? 'Servicio finalizado y viaje cerrado' : 'Estado actualizado', 'success');
      await loadDriverQueue({ silent: true });
      if (typeof window.cargarServiciosDia === 'function') window.cargarServiciosDia();
    } catch (error) {
      const message = String(error.message || 'No se pudo avanzar el servicio')
        .replace(/^.*(?:JORNADA_REQUERIDA|VIAJE_EN_CURSO|REMITO_REQUERIDO|REMITO_INCOMPLETO):\s*/i, '');
      notify(message, 'error');
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
        button.textContent = button.dataset.previousText || 'Continuar';
      }
    }
  }

  function findService(serviceId) {
    return P3.queue.find(item => item.service_id === serviceId) || null;
  }

  function setValue(id, value) {
    const input = document.getElementById(id);
    if (!input || value == null || value === '') return;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function prefillRemito(service) {
    setValue('rem-nro-prestadora', service.service_order_number || service.service_number);
    setValue('rem-patente', service.vehicle_plate);
    setValue('rem-marca-modelo', service.vehicle_make_model);
    setValue('rem-origen', service.origin);
    setValue('rem-destino', service.destination);
    setValue('rem-cliente', service.customer_name);
    setValue('rem-telefono', service.customer_phone);

    const serviceType = document.getElementById('rem-tipo-servicio');
    if (serviceType && service.concept_name) {
      const matching = [...serviceType.options].find(option =>
        option.value.toLowerCase() === String(service.concept_name).toLowerCase()
        || option.textContent.toLowerCase().includes(String(service.concept_name).toLowerCase())
      );
      if (matching) serviceType.value = matching.value;
    }

    const observations = document.getElementById('rem-observaciones');
    if (observations && service.driver_instructions && !observations.value) {
      observations.value = service.driver_instructions;
    }

    const marker = document.getElementById('phase3-remito-context') || document.createElement('div');
    marker.id = 'phase3-remito-context';
    marker.className = 'p3-remito-context';
    marker.innerHTML = `<b>${esc(service.service_number)}</b> · Datos precargados desde la mesa operativa`;
    document.getElementById('remitos-nuevo')?.prepend(marker);
  }

  function openServiceRemito(serviceId) {
    const service = findService(serviceId);
    if (!service) return notify('El servicio ya no está disponible', 'error');
    if (!service.trip_id) return notify('Primero iniciá el viaje del servicio', 'error');

    P3.selectedServiceId = serviceId;
    sessionStorage.setItem('auxilios_phase3_service_id', serviceId);

    if (typeof window.goTo === 'function') window.goTo('remitos');
    if (typeof window.showRemitosView === 'function') window.showRemitosView('nuevo');

    setTimeout(() => prefillRemito(service), 120);
  }

  function reportIncident(serviceId) {
    const service = findService(serviceId);
    if (!service?.journey_log_id) return notify('El servicio no tiene una jornada activa vinculada', 'error');
    if (typeof window.abrirModalIncidente !== 'function') {
      return notify('El módulo de incidentes no está disponible', 'error');
    }

    window.abrirModalIncidente({
      logId: service.journey_log_id,
      driverId: getCurrentUser()?.id || null,
      contexto: `${service.service_number} · ${service.origin} → ${service.destination}`,
    });
  }

  function wrapRemitoSave() {
    if (window.__phase3RemitoWrapped || typeof window.guardarRemitoCompleto !== 'function') return;
    const original = window.guardarRemitoCompleto;

    window.guardarRemitoCompleto = async function phase3GuardarRemito(datosRemito) {
      const serviceId = sessionStorage.getItem('auxilios_phase3_service_id');
      const remitoNumber = datosRemito?.nro || null;
      const result = await original.apply(this, arguments);

      if (!result || !serviceId) return result;

      sessionStorage.removeItem('auxilios_phase3_service_id');
      P3.selectedServiceId = null;

      if (!navigator.onLine || !remitoNumber) {
        await loadDriverQueue({ silent: true });
        return result;
      }

      try {
        const { data: remito, error: remitoError } = await getDb()
          .from('remitos')
          .select('remito_id,nro_remito,trip_id,status')
          .eq('nro_remito', remitoNumber)
          .maybeSingle();
        if (remitoError) throw remitoError;
        if (!remito?.remito_id) throw new Error('No se encontró el remito recién guardado');

        const { error: linkError } = await getDb().rpc('link_operator_service_remito', {
          p_service_id: serviceId,
          p_remito_id: remito.remito_id,
        });
        if (linkError) throw linkError;
        notify('Remito vinculado al servicio', 'success');
      } catch (error) {
        console.warn('[Fase 3] El vínculo automático quedará a cargo del trigger:', error.message);
      }

      await loadDriverQueue({ silent: true });
      return result;
    };

    window.__phase3RemitoWrapped = true;
  }

  async function appendTrace(serviceId) {
    const shell = document.getElementById('os-detail-shell');
    if (!shell || !serviceId || shell.querySelector(`.p3-trace[data-service-id="${serviceId}"]`)) return;

    const placeholder = document.createElement('section');
    placeholder.className = 'os-panel p3-trace';
    placeholder.dataset.serviceId = serviceId;
    placeholder.innerHTML = '<h4>Trazabilidad operativa</h4><div class="p3-trace-loading">Cargando jornada, viaje y remito…</div>';
    shell.querySelector('.os-detail-body')?.appendChild(placeholder);

    try {
      const { data, error } = await getDb().rpc('get_operator_service_trace', {
        p_service_id: serviceId,
      });
      if (error) throw error;
      renderTrace(placeholder, data || {});
    } catch (error) {
      placeholder.innerHTML = `<h4>Trazabilidad operativa</h4><div class="p3-trace-error">${esc(error.message || 'No disponible')}</div>`;
    }
  }

  function traceStep(label, value, detail, ok) {
    return `
      <div class="p3-trace-step ${ok ? 'ok' : ''}">
        <span>${ok ? '✓' : '○'}</span>
        <div><small>${esc(label)}</small><b>${esc(value || 'Pendiente')}</b>${detail ? `<em>${esc(detail)}</em>` : ''}</div>
      </div>`;
  }

  function renderTrace(container, trace) {
    const trip = trace.trip;
    const journey = trace.journey;
    const remito = trace.remito;
    const incidents = Array.isArray(trace.incidents) ? trace.incidents : [];

    container.innerHTML = `
      <div class="p3-trace-head">
        <h4>Trazabilidad operativa</h4>
        <span>${incidents.length ? `${incidents.length} incidente${incidents.length === 1 ? '' : 's'}` : 'Sin incidentes'}</span>
      </div>
      <div class="p3-trace-grid">
        ${traceStep('Jornada', journey ? `#${journey.log_id} · ${journey.status}` : null,
          journey ? `${journey.log_date} · móvil ${journey.truck_id}` : null, Boolean(journey))}
        ${traceStep('Viaje', trip ? `#${trip.trip_id}` : null,
          trip ? `${formatDate(trip.started_at)}${trip.finished_at ? ` → ${formatDate(trip.finished_at)}` : ' · en curso'}` : null, Boolean(trip))}
        ${traceStep('Remito', remito ? remito.nro_remito : null,
          remito ? `${remito.status} · ${remito.photo_count || 0} fotos${remito.has_signature ? ' · firma ✓' : ''}` : null, Boolean(remito))}
      </div>
      ${incidents.length ? `
        <div class="p3-incidents">
          ${incidents.map(item => `
            <div>
              <b>${esc(item.type)} · ${esc(item.severity || '—')}</b>
              <span>${esc(item.description)}</span>
              <small>${formatDate(item.created_at)} · ${Number(item.photo_count || 0)} evidencia${Number(item.photo_count || 0) === 1 ? '' : 's'}</small>
            </div>`).join('')}
        </div>` : ''}`;
  }

  function installManagementTrace() {
    if (!canTrace() || P3.traceObserver) return;
    const shell = document.getElementById('os-detail-shell');
    if (!shell) return;

    P3.traceObserver = new MutationObserver(() => {
      const serviceId = window.OperatorServices?.S?.selected;
      if (serviceId && shell.textContent.trim()) appendTrace(serviceId);
    });
    P3.traceObserver.observe(shell, { childList: true, subtree: true });
  }

  function startPolling() {
    clearInterval(P3.timer);
    if (!isDriver()) return;
    P3.timer = setInterval(() => {
      if (document.visibilityState === 'visible') loadDriverQueue({ silent: true });
    }, 30000);
  }

  function initialize() {
    if (P3.initialized || !getDb() || !getProfile()) return false;
    P3.initialized = true;
    injectAssets();
    wrapRemitoSave();

    if (isDriver()) {
      injectDriverPanel();
      loadDriverQueue({ silent: true });
      startPolling();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') loadDriverQueue({ silent: true });
      });
    } else {
      installManagementTrace();
      const traceWait = setInterval(() => {
        installManagementTrace();
        if (P3.traceObserver) clearInterval(traceWait);
      }, 500);
      setTimeout(() => clearInterval(traceWait), 15000);
    }

    return true;
  }

  window.actualizarServiciosAsignados = () => loadDriverQueue();
  window.avanzarServicioAsignado = advanceService;
  window.abrirRemitoServicio = openServiceRemito;
  window.reportarIncidenteServicio = reportIncident;

  const boot = setInterval(() => {
    if (initialize()) clearInterval(boot);
  }, 250);
  setTimeout(() => clearInterval(boot), 30000);
})();

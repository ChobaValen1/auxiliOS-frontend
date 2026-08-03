/* AuxiliOS · Fase 3 · Inicio intuitivo de jornada y viaje */
(() => {
  'use strict';

  const STATE = {
    installed: false,
    pending: null,
    originalAdvance: null,
    originalConfirmJourney: null,
    timer: null,
  };

  const getDb = () => typeof _db !== 'undefined' ? _db : null;
  const getUser = () => typeof USUARIO_ACTUAL !== 'undefined' ? USUARIO_ACTUAL : null;
  const getProfile = () => typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : null;
  const isDriver = () => (getProfile()?.roles?.name || getProfile()?.role || '') === 'chofer';
  const notify = (message, type = 'info') => {
    if (typeof window.toast === 'function') window.toast(message, type);
    else console[type === 'error' ? 'error' : 'log'](message);
  };

  function findService(serviceId) {
    return (window.AuxiliosPhase3?.queue || [])
      .find(service => String(service.service_id) === String(serviceId)) || null;
  }

  async function findActiveJourney(service) {
    const db = getDb();
    const userId = getUser()?.id;
    if (!db || !userId || !service?.assigned_truck_id) return null;

    const { data, error } = await db
      .from('daily_logs')
      .select('log_id,truck_id,status,hora_fin')
      .eq('driver_id', userId)
      .eq('truck_id', service.assigned_truck_id)
      .eq('status', 'open')
      .is('hora_fin', null)
      .order('log_id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  async function loadAssignedTruck(service) {
    const db = getDb();
    if (!db || !service?.assigned_truck_id) return null;

    const { data, error } = await db
      .from('trucks')
      .select('truck_id,plate,brand,model,current_km,numero_interno,status')
      .eq('truck_id', service.assigned_truck_id)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  function selectAssignedTruck(truck) {
    if (!truck) return;
    try {
      if (typeof _camionActual !== 'undefined') _camionActual = truck;
    } catch (error) {
      console.warn('[Fase 3] No se pudo preseleccionar el móvil asignado:', error);
    }
  }

  async function openJourneyForService(service) {
    const truck = await loadAssignedTruck(service);
    selectAssignedTruck(truck);

    STATE.pending = {
      serviceId: service.service_id,
      toStatus: 'en_route',
      assignedTruckId: service.assigned_truck_id,
      createdAt: Date.now(),
    };

    if (typeof window.goTo === 'function') window.goTo('registro');

    if (typeof window.abrirModalNuevaJornada !== 'function') {
      STATE.pending = null;
      throw new Error('No se pudo abrir el inicio de jornada. Ingresá a Registro diario e iniciá la jornada manualmente.');
    }

    await window.abrirModalNuevaJornada();
    notify(
      `Iniciá la jornada con ${service.truck_label || truck?.numero_interno || truck?.plate || 'el móvil asignado'}. Al confirmarla, el viaje comenzará automáticamente.`,
      'warning'
    );
  }

  async function guardedAdvance(serviceId, toStatus, original, thisArg, args) {
    if (!isDriver() || toStatus !== 'en_route') {
      return original.apply(thisArg, args);
    }

    const service = findService(serviceId);
    if (!service) return original.apply(thisArg, args);

    if (!service.assigned_truck_id) {
      notify('El servicio no tiene un móvil asignado. Solicitá una asignación antes de iniciar.', 'error');
      return null;
    }

    try {
      const journey = await findActiveJourney(service);
      if (journey) return original.apply(thisArg, args);
      await openJourneyForService(service);
      return null;
    } catch (error) {
      notify(error.message || 'No se pudo verificar la jornada activa', 'error');
      return null;
    }
  }

  function wrapAdvance() {
    if (STATE.originalAdvance || typeof window.avanzarServicioAsignado !== 'function') return;

    STATE.originalAdvance = window.avanzarServicioAsignado;
    window.avanzarServicioAsignado = function phase3AdvanceWithJourneyGuard(serviceId, toStatus) {
      return guardedAdvance(serviceId, toStatus, STATE.originalAdvance, this, arguments);
    };
  }

  function pendingIsCurrent(pending) {
    if (!pending) return false;
    if (Date.now() - pending.createdAt > 15 * 60 * 1000) return false;
    const service = findService(pending.serviceId);
    return Boolean(service && service.status === 'assigned');
  }

  function wrapJourneyConfirmation() {
    if (STATE.originalConfirmJourney || typeof window.confirmarNuevaJornada !== 'function') return;

    STATE.originalConfirmJourney = window.confirmarNuevaJornada;
    window.confirmarNuevaJornada = async function phase3ConfirmJourneyAndStartTrip() {
      const result = await STATE.originalConfirmJourney.apply(this, arguments);
      const pending = STATE.pending;

      if (!pendingIsCurrent(pending)) {
        STATE.pending = null;
        return result;
      }

      try {
        const service = findService(pending.serviceId);
        const journey = await findActiveJourney(service);
        if (!journey) return result;

        STATE.pending = null;
        notify('Jornada iniciada. Iniciando el viaje del servicio…', 'success');
        await STATE.originalAdvance(pending.serviceId, pending.toStatus);
      } catch (error) {
        notify(error.message || 'La jornada se inició, pero no se pudo iniciar el viaje', 'error');
      }

      return result;
    };
  }

  function install() {
    if (STATE.installed) return;
    wrapAdvance();
    wrapJourneyConfirmation();

    if (STATE.originalAdvance && STATE.originalConfirmJourney) {
      STATE.installed = true;
      if (STATE.timer) clearInterval(STATE.timer);
    }
  }

  function init() {
    install();
    if (!STATE.installed) {
      STATE.timer = setInterval(install, 150);
      setTimeout(() => {
        if (STATE.timer) clearInterval(STATE.timer);
      }, 30000);
    }
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();

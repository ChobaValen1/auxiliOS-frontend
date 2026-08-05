/* AuxiliOS · Flota · CRUD seguro de combustible v1 */
(() => {
  'use strict';

  const MANAGEMENT = new Set(['administracion', 'supervision']);
  const state = {
    truckId: null,
    records: [],
    includeVoided: false,
    loading: false,
    renderedKey: '',
    modalRecord: null,
  };

  const role = () => String(
    typeof PERFIL_USUARIO === 'undefined'
      ? ''
      : (PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role || '')
  ).toLowerCase();
  const allowed = () => MANAGEMENT.has(role());
  const isAdmin = () => role() === 'administracion';
  const db = () => typeof _db === 'undefined' ? null : _db;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
  const num = value => Number(value || 0);
  const money = value => num(value).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  });
  const quantity = value => num(value).toLocaleString('es-AR', {
    maximumFractionDigits: 2,
  });
  const dateLabel = value => {
    if (!value) return '—';
    const [year, month, day] = String(value).slice(0, 10).split('-');
    return year && month && day ? `${day}/${month}/${year}` : String(value);
  };
  const dateTimeLabel = value => value
    ? new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
  const notify = (message, type = 'success') => {
    if (typeof toast === 'function') toast(message, type);
    else console[type === 'error' ? 'error' : 'log'](message);
  };
  const errorMessage = error => error?.message || 'No se pudo completar la operación';

  function injectAssets() {
    if (document.getElementById('fleet-fuel-crud-v1-css')) return;
    const link = document.createElement('link');
    link.id = 'fleet-fuel-crud-v1-css';
    link.rel = 'stylesheet';
    link.href = '/fleet-fuel-crud-v1.css';
    document.head.appendChild(link);
  }

  function currentContext() {
    const shell = document.querySelector('.fadv-shell[data-truck-id]');
    if (!shell) return null;
    const activeTab = [...shell.querySelectorAll('.fadv-tab')]
      .find(button => button.classList.contains('active'));
    if (!activeTab || activeTab.textContent.trim() !== 'Combustible') return null;
    const panel = shell.querySelector('#fadv-panel, .fadv-panel');
    const truckId = Number(shell.dataset.truckId);
    if (!panel || !Number.isInteger(truckId) || truckId <= 0) return null;
    return { shell, panel, truckId };
  }

  async function loadRecords(truckId, force = false) {
    if (!db()) throw new Error('La base de datos todavía no está disponible');
    const key = `${truckId}:${state.includeVoided}`;
    if (!force && state.renderedKey === key && state.records.length) return state.records;

    const { data, error } = await db().rpc('list_fuel_records_for_truck', {
      p_truck_id: truckId,
      p_include_voided: state.includeVoided,
    });
    if (error) throw error;

    state.truckId = truckId;
    state.records = Array.isArray(data) ? data : [];
    state.renderedKey = key;
    return state.records;
  }

  function paymentLabel(record) {
    const labels = {
      efectivo: 'Efectivo',
      transferencia: 'Transferencia',
      app: 'App',
      tarjeta: 'Tarjeta',
    };
    const base = labels[record.payment_method] || record.payment_method || '—';
    return record.payment_app ? `${base} · ${record.payment_app}` : base;
  }

  function statusBadges(record) {
    const badges = [];
    if (record.status === 'voided') {
      badges.push('<span class="ffcrud-pill voided">Anulada</span>');
    } else {
      badges.push('<span class="ffcrud-pill active">Activa</span>');
    }
    if (record.journey_status === 'closed') {
      badges.push('<span class="ffcrud-pill warning">Jornada cerrada</span>');
    }
    if (record.rendicion_admin_status === 'aprobada') {
      badges.push('<span class="ffcrud-pill warning">Rendición aprobada</span>');
    } else if (record.rendicion_admin_status === 'observada') {
      badges.push('<span class="ffcrud-pill observed">Rendición observada</span>');
    }
    return badges.join(' ');
  }

  function actionButtons(record) {
    const history = `<button class="ffcrud-link" data-fuel-action="history" data-fuel-id="${record.fuel_id}">Historial</button>`;
    if (!isAdmin()) return history;
    if (record.status === 'voided') {
      return `${history}<button class="ffcrud-link restore" data-fuel-action="restore" data-fuel-id="${record.fuel_id}">Restaurar</button>`;
    }
    return `${history}<button class="ffcrud-link" data-fuel-action="edit" data-fuel-id="${record.fuel_id}">Editar</button><button class="ffcrud-link danger" data-fuel-action="void" data-fuel-id="${record.fuel_id}">Anular</button>`;
  }

  function renderPanel(panel) {
    const records = state.records;
    const active = records.filter(record => record.status !== 'voided');
    const voided = records.filter(record => record.status === 'voided');
    const totalLiters = active.reduce((sum, record) => sum + num(record.liters), 0);
    const totalCost = active.reduce((sum, record) => sum + num(record.total_cost), 0);

    const rows = records.length
      ? records.map(record => `
          <tr class="${record.status === 'voided' ? 'is-voided' : ''}">
            <td><b>${dateLabel(record.fuel_date)}</b><small>#${record.fuel_id}</small></td>
            <td>${esc(record.driver_name || 'Sin chofer')}<small>${record.log_id ? `Jornada #${record.log_id}` : 'Sin jornada vinculada'}</small></td>
            <td><b>${quantity(record.liters)} L</b></td>
            <td>${money(record.price_per_liter)}</td>
            <td><b>${money(record.total_cost)}</b></td>
            <td>${record.km_at_load == null ? '—' : `${num(record.km_at_load).toLocaleString('es-AR')} km`}</td>
            <td>${esc(record.gas_station || '—')}<small>${esc(paymentLabel(record))}</small></td>
            <td><div class="ffcrud-badges">${statusBadges(record)}</div>${record.void_reason ? `<small class="ffcrud-reason">${esc(record.void_reason)}</small>` : ''}</td>
            <td><div class="ffcrud-row-actions">${actionButtons(record)}</div></td>
          </tr>`).join('')
      : `<tr><td colspan="9"><div class="fadv-empty">No hay cargas de combustible para este móvil.</div></td></tr>`;

    panel.dataset.fuelCrud = '1';
    panel.innerHTML = `
      <section class="fadv-section-head ffcrud-head">
        <div>
          <small>Consumo y trazabilidad</small>
          <h3>Combustible</h3>
          <p>Administración puede corregir, anular y restaurar cargas. Las anuladas no integran los totales.</p>
        </div>
        <div class="fadv-actions">
          <button class="btn btn-ghost" data-fuel-action="refresh">↻ Actualizar</button>
          ${isAdmin() ? '<button class="btn btn-primary" data-fuel-action="create">＋ Cargar combustible</button>' : ''}
        </div>
      </section>

      ${!isAdmin() ? '<div class="ffcrud-readonly">Vista de solo lectura para Supervisión.</div>' : ''}

      <div class="fadv-kpis ffcrud-kpis">
        <div class="fadv-kpi"><small>Cargas activas</small><b>${active.length}</b></div>
        <div class="fadv-kpi"><small>Litros activos</small><b>${quantity(totalLiters)}</b></div>
        <div class="fadv-kpi"><small>Costo activo</small><b>${money(totalCost)}</b></div>
        <div class="fadv-kpi"><small>Anuladas</small><b>${voided.length}</b></div>
      </div>

      <div class="ffcrud-toolbar">
        <label class="ffcrud-toggle">
          <input type="checkbox" data-fuel-action="toggle-voided" ${state.includeVoided ? 'checked' : ''}>
          <span>Incluir cargas anuladas</span>
        </label>
        <span>${records.length} registro${records.length === 1 ? '' : 's'} mostrado${records.length === 1 ? '' : 's'}</span>
      </div>

      <div class="fadv-table-wrap ffcrud-table-wrap">
        <table class="fadv-table ffcrud-table">
          <thead>
            <tr>
              <th>Fecha</th><th>Chofer / jornada</th><th>Litros</th><th>Precio/L</th>
              <th>Total</th><th>KM</th><th>Estación / pago</th><th>Estado</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  async function enhance(force = false) {
    if (!allowed() || state.loading) return;
    const context = currentContext();
    if (!context) return;

    const desiredKey = `${context.truckId}:${state.includeVoided}`;
    if (!force && context.panel.dataset.fuelCrud === '1' && state.renderedKey === desiredKey) return;

    state.loading = true;
    context.panel.dataset.fuelCrud = 'loading';
    context.panel.innerHTML = '<div class="ffcrud-loading">Cargando combustible…</div>';
    try {
      await loadRecords(context.truckId, force);
      const current = currentContext();
      if (current && current.truckId === context.truckId) renderPanel(current.panel);
    } catch (error) {
      context.panel.innerHTML = `<div class="fadv-empty"><b>No se pudo cargar combustible.</b><br>${esc(errorMessage(error))}<br><button class="btn btn-ghost" data-fuel-action="refresh">Reintentar</button></div>`;
      context.panel.dataset.fuelCrud = 'error';
    } finally {
      state.loading = false;
    }
  }

  function recordById(id) {
    return state.records.find(record => Number(record.fuel_id) === Number(id)) || null;
  }

  function closeModal() {
    document.getElementById('fleet-fuel-crud-modal')?.remove();
    state.modalRecord = null;
  }

  function warnings(record) {
    const items = [];
    if (record.journey_status === 'closed') {
      items.push('Esta carga pertenece a una jornada cerrada.');
    }
    if (record.rendicion_admin_status === 'aprobada') {
      items.push('La rendición está aprobada. Al confirmar quedará observada para revisión.');
    }
    return items.length
      ? `<div class="ffcrud-warning">${items.map(item => `<div>⚠ ${esc(item)}</div>`).join('')}</div>`
      : '';
  }

  function mountModal(content) {
    closeModal();
    const modal = document.createElement('div');
    modal.id = 'fleet-fuel-crud-modal';
    modal.className = 'ffcrud-modal-backdrop';
    modal.innerHTML = `<div class="ffcrud-modal" role="dialog" aria-modal="true">${content}</div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('[data-fuel-modal-close]')) closeModal();
    });
    setTimeout(() => modal.querySelector('input,select,textarea,button')?.focus(), 0);
    return modal;
  }

  function openEdit(record) {
    if (!record || !isAdmin()) return;
    state.modalRecord = record;
    const modal = mountModal(`
      <div class="ffcrud-modal-head">
        <div><small>Combustible #${record.fuel_id}</small><h3>Editar carga</h3></div>
        <button class="ffcrud-close" data-fuel-modal-close aria-label="Cerrar">×</button>
      </div>
      ${warnings(record)}
      <form id="ffcrud-edit-form" class="ffcrud-form">
        <div class="ffcrud-grid">
          <label>Fecha<input name="fuel_date" type="date" required value="${esc(String(record.fuel_date || '').slice(0, 10))}"></label>
          <label>Litros<input name="liters" type="number" min="0.01" step="0.01" required value="${esc(record.liters)}"></label>
          <label>Precio por litro<input name="price_per_liter" type="number" min="0.01" step="0.01" required value="${esc(record.price_per_liter)}"></label>
          <label>Kilometraje<input name="km_at_load" type="number" min="0" step="1" value="${record.km_at_load ?? ''}"></label>
          <label>Estación<input name="gas_station" maxlength="120" value="${esc(record.gas_station || '')}"></label>
          <label>Medio de pago
            <select name="payment_method" required>
              ${['efectivo', 'transferencia', 'app', 'tarjeta'].map(value => `<option value="${value}" ${record.payment_method === value ? 'selected' : ''}>${esc(paymentLabel({ payment_method: value }))}</option>`).join('')}
            </select>
          </label>
          <label>Aplicación / referencia<input name="payment_app" maxlength="120" value="${esc(record.payment_app || '')}"></label>
          <div class="ffcrud-total-preview"><small>Total calculado</small><b id="ffcrud-total-preview">${money(record.total_cost)}</b></div>
        </div>
        <label class="ffcrud-reason-field">Motivo de la corrección *
          <textarea name="reason" minlength="5" required placeholder="Ej.: precio ingresado incorrectamente"></textarea>
        </label>
        <div class="ffcrud-modal-actions">
          <button type="button" class="btn btn-ghost" data-fuel-modal-close>Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar corrección</button>
        </div>
      </form>`);

    const form = modal.querySelector('#ffcrud-edit-form');
    const updatePreview = () => {
      const liters = num(form.elements.liters.value);
      const price = num(form.elements.price_per_liter.value);
      modal.querySelector('#ffcrud-total-preview').textContent = money(liters * price);
    };
    form.elements.liters.addEventListener('input', updatePreview);
    form.elements.price_per_liter.addEventListener('input', updatePreview);
    form.addEventListener('submit', submitEdit);
  }

  async function submitEdit(event) {
    event.preventDefault();
    if (!state.modalRecord || !isAdmin()) return;
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const payload = {
      fuel_date: form.elements.fuel_date.value,
      liters: form.elements.liters.value,
      price_per_liter: form.elements.price_per_liter.value,
      km_at_load: form.elements.km_at_load.value,
      gas_station: form.elements.gas_station.value,
      payment_method: form.elements.payment_method.value,
      payment_app: form.elements.payment_app.value,
    };
    const reason = form.elements.reason.value.trim();
    if (reason.length < 5) {
      notify('Ingresá un motivo de al menos 5 caracteres', 'error');
      form.elements.reason.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Guardando…';
    try {
      const { data, error } = await db().rpc('update_fuel_record', {
        p_fuel_id: state.modalRecord.fuel_id,
        p_payload: payload,
        p_reason: reason,
      });
      if (error) throw error;
      closeModal();
      notify('Carga de combustible corregida');
      if (data?.rendicion_observed) {
        notify('La rendición aprobada quedó observada para revisión', 'warning');
      }
      await enhance(true);
    } catch (error) {
      notify(errorMessage(error), 'error');
      submit.disabled = false;
      submit.textContent = 'Guardar corrección';
    }
  }

  function openReasonAction(record, action) {
    if (!record || !isAdmin()) return;
    state.modalRecord = record;
    const restore = action === 'restore';
    const title = restore ? 'Restaurar carga' : 'Anular carga';
    const verb = restore ? 'restauración' : 'anulación';
    const buttonClass = restore ? 'btn btn-primary' : 'btn ffcrud-danger-button';
    const modal = mountModal(`
      <div class="ffcrud-modal-head">
        <div><small>Combustible #${record.fuel_id}</small><h3>${title}</h3></div>
        <button class="ffcrud-close" data-fuel-modal-close aria-label="Cerrar">×</button>
      </div>
      ${warnings(record)}
      <div class="ffcrud-record-summary">
        <b>${dateLabel(record.fuel_date)} · ${quantity(record.liters)} L · ${money(record.total_cost)}</b>
        <span>${esc(record.gas_station || 'Estación no informada')}</span>
      </div>
      <form id="ffcrud-reason-form" class="ffcrud-form" data-action="${action}">
        <label class="ffcrud-reason-field">Motivo de la ${verb} *
          <textarea name="reason" minlength="5" required placeholder="${restore ? 'Ej.: la carga fue anulada por error' : 'Ej.: registro duplicado'}"></textarea>
        </label>
        <div class="ffcrud-modal-actions">
          <button type="button" class="btn btn-ghost" data-fuel-modal-close>Cancelar</button>
          <button type="submit" class="${buttonClass}">${title}</button>
        </div>
      </form>`);
    modal.querySelector('#ffcrud-reason-form').addEventListener('submit', submitReasonAction);
  }

  async function submitReasonAction(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const action = form.dataset.action;
    const reason = form.elements.reason.value.trim();
    if (!state.modalRecord || !isAdmin()) return;
    if (reason.length < 5) {
      notify('Ingresá un motivo de al menos 5 caracteres', 'error');
      form.elements.reason.focus();
      return;
    }

    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = action === 'restore' ? 'Restaurando…' : 'Anulando…';
    const rpc = action === 'restore' ? 'restore_fuel_record' : 'void_fuel_record';
    try {
      const { data, error } = await db().rpc(rpc, {
        p_fuel_id: state.modalRecord.fuel_id,
        p_reason: reason,
      });
      if (error) throw error;
      closeModal();
      notify(action === 'restore' ? 'Carga restaurada' : 'Carga anulada');
      if (data?.rendicion_observed) {
        notify('La rendición aprobada quedó observada para revisión', 'warning');
      }
      await enhance(true);
    } catch (error) {
      notify(errorMessage(error), 'error');
      submit.disabled = false;
      submit.textContent = action === 'restore' ? 'Restaurar carga' : 'Anular carga';
    }
  }

  function changedFields(event) {
    const before = event.before_data || {};
    const after = event.after_data || {};
    const labels = {
      fuel_date: 'Fecha',
      liters: 'Litros',
      price_per_liter: 'Precio/L',
      total_cost: 'Total',
      km_at_load: 'Kilometraje',
      payment_method: 'Medio de pago',
      payment_app: 'Aplicación',
      gas_station: 'Estación',
      status: 'Estado',
      correction_reason: 'Motivo',
      void_reason: 'Motivo de anulación',
    };
    return Object.keys(labels)
      .filter(key => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null))
      .map(key => `<li><b>${labels[key]}:</b> ${esc(before?.[key] ?? '—')} → ${esc(after?.[key] ?? '—')}</li>`)
      .join('');
  }

  async function openHistory(record) {
    if (!record) return;
    const modal = mountModal(`
      <div class="ffcrud-modal-head">
        <div><small>Combustible #${record.fuel_id}</small><h3>Historial de cambios</h3></div>
        <button class="ffcrud-close" data-fuel-modal-close aria-label="Cerrar">×</button>
      </div>
      <div class="ffcrud-loading">Cargando historial…</div>`);
    try {
      const { data, error } = await db().rpc('get_fuel_record_history', {
        p_fuel_id: record.fuel_id,
      });
      if (error) throw error;
      const events = Array.isArray(data) ? data : [];
      const body = events.length
        ? `<div class="ffcrud-timeline">${events.map(item => {
            const labels = { INSERT: 'Creación', UPDATE: 'Modificación', DELETE: 'Eliminación' };
            const changes = changedFields(item);
            return `<article>
              <div class="ffcrud-timeline-dot"></div>
              <div><small>${dateTimeLabel(item.occurred_at)}</small><h4>${labels[item.operation] || esc(item.operation)}</h4>
              <p>${esc(item.actor_name || 'Usuario del sistema')}</p>
              ${changes ? `<ul>${changes}</ul>` : '<span>Registro inicial.</span>'}</div>
            </article>`;
          }).join('')}</div>`
        : '<div class="fadv-empty">No hay eventos de auditoría disponibles.</div>';
      modal.querySelector('.ffcrud-loading').outerHTML = body;
    } catch (error) {
      modal.querySelector('.ffcrud-loading').outerHTML = `<div class="fadv-empty">${esc(errorMessage(error))}</div>`;
    }
  }

  function openCreate() {
    if (!isAdmin()) return;
    if (typeof openFuelModal !== 'function') {
      notify('El formulario de carga no está disponible', 'error');
      return;
    }
    openFuelModal();
    watchCreateModal();
  }

  function watchCreateModal() {
    let attempts = 0;
    const timer = setInterval(() => {
      const modal = document.getElementById('modal-combustible')
        || document.querySelector('[id*="combustible"].modal-backdrop, [id*="fuel"].modal-backdrop');
      attempts += 1;
      if (!modal && attempts < 20) return;
      clearInterval(timer);
      if (!modal) return;
      const observer = new MutationObserver(() => {
        const hidden = modal.style.display === 'none'
          || modal.hidden
          || !document.body.contains(modal)
          || !modal.classList.contains('show') && getComputedStyle(modal).display === 'none';
        if (hidden) {
          observer.disconnect();
          setTimeout(() => enhance(true), 250);
        }
      });
      observer.observe(modal, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    }, 100);
  }

  async function handleAction(action, id) {
    if (action === 'refresh') return enhance(true);
    if (action === 'create') return openCreate();
    const record = recordById(id);
    if (!record) return;
    if (action === 'edit') openEdit(record);
    if (action === 'void') openReasonAction(record, 'void');
    if (action === 'restore') openReasonAction(record, 'restore');
    if (action === 'history') openHistory(record);
  }

  function installEvents() {
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-fuel-action]');
      if (!button) return;
      const action = button.dataset.fuelAction;
      if (action === 'toggle-voided') return;
      event.preventDefault();
      handleAction(action, button.dataset.fuelId);
    });

    document.addEventListener('change', event => {
      const input = event.target.closest('[data-fuel-action="toggle-voided"]');
      if (!input) return;
      state.includeVoided = Boolean(input.checked);
      state.renderedKey = '';
      enhance(true);
    });
  }

  function installObserver() {
    let timer = null;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => enhance(false), 35);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    document.addEventListener('click', event => {
      if (event.target.closest('.fadv-tab')) setTimeout(schedule, 0);
    });
    schedule();
  }

  function init() {
    if (!allowed()) return;
    injectAssets();
    installEvents();
    installObserver();
  }

  window.FleetFuelCRUD = {
    refresh: () => enhance(true),
    closeModal,
  };

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();

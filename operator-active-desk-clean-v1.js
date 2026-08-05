/* AuxiliOS · Mesa activa · Clean UI */
(() => {
  'use strict';

  const ID = 'operator-active-desk-clean-v1';
  const VIEW_KEY = 'operator_active_desk_v1';
  const O = window.OperatorServices;
  if (!O || window.OperatorActiveDeskV1) return;

  const ACTIVE_STATUSES = new Set([
    'pending',
    'assigned',
    'en_route',
    'at_origin',
    'loaded',
    'at_destination',
  ]);

  const STATUS = {
    pending: { label: 'Pendiente', tone: 'amber', icon: '○' },
    assigned: { label: 'Asignado', tone: 'blue', icon: '●' },
    en_route: { label: 'En camino', tone: 'cyan', icon: '→' },
    at_origin: { label: 'Arribado', tone: 'amber', icon: '⌖' },
    loaded: { label: 'Vehículo cargado', tone: 'purple', icon: '↑' },
    at_destination: { label: 'En destino', tone: 'green', icon: '◆' },
  };

  const STATUS_ORDER = [
    'pending',
    'assigned',
    'en_route',
    'at_origin',
    'loaded',
    'at_destination',
  ];

  const COLUMN_DEFS = [
    { id: 'service', label: 'Código', visible: true, required: true, sortable: true, width: 150 },
    { id: 'scheduled', label: 'Fecha / hora', visible: true, sortable: true, width: 126 },
    { id: 'company', label: 'Prestadora', visible: true, sortable: true, width: 140 },
    { id: 'base', label: 'Base', visible: false, sortable: true, width: 128 },
    { id: 'concept', label: 'Tipo', visible: true, sortable: true, width: 120 },
    { id: 'origin', label: 'Origen', visible: true, sortable: true, width: 205 },
    { id: 'destination', label: 'Destino', visible: true, sortable: true, width: 205 },
    { id: 'customer', label: 'Cliente', visible: true, sortable: true, width: 170 },
    { id: 'vehicle', label: 'Vehículo', visible: false, sortable: true, width: 150 },
    { id: 'distance', label: 'Km', visible: false, sortable: true, width: 82 },
    { id: 'resource', label: 'Chofer / móvil', visible: true, sortable: true, width: 170 },
    { id: 'delay', label: 'Demora', visible: false, sortable: true, width: 96 },
    { id: 'status', label: 'Estado', visible: true, required: true, sortable: true, width: 154 },
    { id: 'amount', label: 'Por cobrar', visible: false, sortable: true, width: 124 },
    { id: 'updated', label: 'Actualización', visible: false, sortable: true, width: 120 },
    { id: 'actions', label: 'Acciones', visible: true, required: true, sortable: false, width: 92 },
  ];

  const DEF_BY_ID = Object.fromEntries(COLUMN_DEFS.map(def => [def.id, def]));
  const REQUIRED = new Set(COLUMN_DEFS.filter(def => def.required).map(def => def.id));
  const clone = value => JSON.parse(JSON.stringify(value));
  const DEFAULT_PREFS = {
    density: 'compact',
    columns: COLUMN_DEFS.map((def, index) => ({
      id: def.id,
      visible: def.visible,
      order: index,
      width: def.width,
    })),
    sort: { id: 'scheduled', direction: 'desc' },
  };

  const STATE = {
    prefs: clone(DEFAULT_PREFS),
    draft: null,
    query: '',
    status: 'all',
    company: 'all',
    menu: null,
    saving: false,
    loadingAction: false,
    ready: false,
    lastSignature: '',
    observer: null,
    poll: null,
    dragId: null,
  };

  const db = () => typeof _db !== 'undefined' ? _db : null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const number = value => Number(String(value ?? '').replace(',', '.')) || 0;
  const notify = (message, type = 'info') => {
    if (typeof window.toast === 'function') window.toast(message, type);
    else console[type === 'error' ? 'error' : 'log'](message);
  };
  const money = (value, currency = 'ARS') => new Intl.NumberFormat('es-AR', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(number(value));
  const dateTime = value => value ? new Date(value).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }) : '—';
  const dateOnly = value => value ? new Date(value).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }) : '—';
  const timeOnly = value => value ? new Date(value).toLocaleTimeString('es-AR', {
    hour: '2-digit', minute: '2-digit',
  }) : '—';
  const role = () => String(
    typeof PERFIL_USUARIO === 'undefined'
      ? ''
      : (PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role || PERFIL_USUARIO?.role_name || '')
  ).toLowerCase();
  const canOperate = () => ['administracion', 'operador', 'supervision'].includes(role());

  function normalizePreferences(raw) {
    const result = clone(DEFAULT_PREFS);
    if (['compact', 'comfortable'].includes(raw?.density)) result.density = raw.density;
    const incoming = new Map((Array.isArray(raw?.columns) ? raw.columns : []).map(item => [item?.id, item]));
    result.columns = COLUMN_DEFS.map((def, index) => {
      const saved = incoming.get(def.id) || {};
      return {
        id: def.id,
        visible: def.required ? true : (typeof saved.visible === 'boolean' ? saved.visible : def.visible),
        order: Number.isFinite(Number(saved.order)) ? Number(saved.order) : index,
        width: Math.max(76, Math.min(360, Number(saved.width) || def.width)),
      };
    }).sort((a, b) => a.order - b.order).map((item, index) => ({ ...item, order: index }));
    const sortId = DEF_BY_ID[raw?.sort?.id]?.sortable ? raw.sort.id : 'scheduled';
    result.sort = { id: sortId, direction: raw?.sort?.direction === 'asc' ? 'asc' : 'desc' };
    return result;
  }

  function activeServices() {
    return (Array.isArray(O.S?.services) ? O.S.services : []).filter(service => ACTIVE_STATUSES.has(service.status));
  }

  function signature() {
    return activeServices().map(service => `${service.service_id}:${service.status}:${service.updated_at}`).join('|');
  }

  function serviceById(id) {
    return (O.S?.services || []).find(service => String(service.service_id) === String(id)) || null;
  }

  function visibleColumns() {
    return STATE.prefs.columns.filter(column => column.visible && DEF_BY_ID[column.id]).sort((a, b) => a.order - b.order);
  }

  function companyOptions() {
    const map = new Map();
    activeServices().forEach(service => {
      const key = String(service.company_id || service.company_name || '');
      if (key) map.set(key, service.company_name || 'Prestadora');
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }

  function inject() {
    const screen = document.getElementById('screen-operaciones');
    const board = document.getElementById('os-board');
    if (!screen || !board) return false;

    document.body.classList.add('oad-clean-active');
    const eyebrow = screen.querySelector('.os-eyebrow');
    const title = document.getElementById('os-title');
    const subtitle = document.getElementById('os-subtitle');
    if (eyebrow) eyebrow.textContent = 'Mesa activa';
    if (title) title.innerHTML = 'Gestión de <span>Servicios</span>';
    if (subtitle) subtitle.textContent = 'Servicios activos, recursos y estados operativos en una sola vista.';

    if (!document.getElementById('oad-root')) {
      board.insertAdjacentHTML('beforebegin', `
        <section id="oad-root" class="oad-root" aria-label="Mesa activa de servicios">
          <div class="oad-commandbar">
            <label class="oad-search">
              <span aria-hidden="true">⌕</span>
              <input id="oad-query" type="search" autocomplete="off" placeholder="Buscar código, patente, cliente o dirección">
            </label>
            <select id="oad-status-filter" aria-label="Filtrar por estado">
              <option value="all">Todos los estados</option>
              ${STATUS_ORDER.map(key => `<option value="${key}">${esc(STATUS[key].label)}</option>`).join('')}
            </select>
            <select id="oad-company-filter" aria-label="Filtrar por prestadora">
              <option value="all">Todas las prestadoras</option>
            </select>
            <button type="button" class="oad-icon-button" id="oad-settings-button" title="Personalizar columnas" aria-label="Personalizar columnas">⚙</button>
            <button type="button" class="oad-secondary-button" id="oad-refresh-button">↻ Actualizar</button>
          </div>
          <div class="oad-status-strip" id="oad-status-strip"></div>
          <div class="oad-table-meta">
            <span id="oad-count">0 servicios activos</span>
            <span id="oad-sort-label"></span>
          </div>
          <div class="oad-table-wrap">
            <table class="oad-table" id="oad-table">
              <thead></thead>
              <tbody></tbody>
            </table>
          </div>
          <div class="oad-empty" id="oad-empty" hidden>
            <b>La mesa está limpia</b>
            <span>No hay servicios activos con los filtros seleccionados.</span>
          </div>
          <div class="oad-inline-error" id="oad-inline-error" hidden role="alert"></div>
        </section>
      `);
    }

    ensureOverlays();
    bindEvents();
    patchDeveloperLabels();
    return true;
  }

  function ensureOverlays() {
    if (!document.getElementById('oad-popover')) {
      document.body.insertAdjacentHTML('beforeend', '<div id="oad-popover" class="oad-popover" hidden></div>');
    }
    if (!document.getElementById('oad-modal')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="oad-modal" class="oad-modal-backdrop" hidden aria-hidden="true">
          <section class="oad-modal" role="dialog" aria-modal="true" aria-labelledby="oad-modal-title"></section>
        </div>
      `);
    }
    if (!document.getElementById('oad-settings')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="oad-settings" class="oad-settings-backdrop" hidden aria-hidden="true">
          <aside class="oad-settings" role="dialog" aria-modal="true" aria-labelledby="oad-settings-title">
            <header>
              <div><small>Mesa activa</small><h3 id="oad-settings-title">Personalizar tabla</h3><p>Elegí qué ver y ordená las columnas según tu forma de trabajo.</p></div>
              <button type="button" data-oad-settings-close aria-label="Cerrar">×</button>
            </header>
            <div class="oad-settings-body">
              <section>
                <h4>Densidad</h4>
                <div class="oad-density">
                  <button type="button" data-oad-density="compact">Compacta</button>
                  <button type="button" data-oad-density="comfortable">Cómoda</button>
                </div>
              </section>
              <section>
                <div class="oad-settings-section-head"><h4>Columnas</h4><span>Arrastrá para ordenar</span></div>
                <div id="oad-column-list" class="oad-column-list"></div>
              </section>
            </div>
            <footer>
              <button type="button" id="oad-reset-settings">Restaurar</button>
              <div><button type="button" data-oad-settings-close>Cancelar</button><button type="button" id="oad-save-settings" class="primary">Guardar vista</button></div>
            </footer>
          </aside>
        </div>
      `);
    }
  }

  function bindEvents() {
    if (document.documentElement.dataset.oadBound === '1') return;
    document.documentElement.dataset.oadBound = '1';

    document.addEventListener('click', event => {
      const statusButton = event.target.closest('[data-oad-status-menu]');
      if (statusButton) {
        event.preventDefault(); event.stopPropagation();
        return openStatusMenu(statusButton.dataset.oadStatusMenu, statusButton);
      }

      const moreButton = event.target.closest('[data-oad-more-menu]');
      if (moreButton) {
        event.preventDefault(); event.stopPropagation();
        return openMoreMenu(moreButton.dataset.oadMoreMenu, moreButton);
      }

      const command = event.target.closest('[data-oad-command]');
      if (command) {
        event.preventDefault(); event.stopPropagation();
        const serviceId = command.dataset.serviceId;
        const value = command.dataset.value || '';
        const action = command.dataset.oadCommand;
        closePopover();
        return handleCommand(action, serviceId, value);
      }

      if (event.target.closest('#oad-settings-button')) return openSettings();
      if (event.target.closest('#oad-refresh-button')) return refreshServices();
      if (event.target.matches('[data-oad-settings-close]') || event.target.id === 'oad-settings') return closeSettings();
      if (event.target.closest('#oad-reset-settings')) return resetDraft();
      if (event.target.closest('#oad-save-settings')) return saveSettings();

      const density = event.target.closest('[data-oad-density]')?.dataset.oadDensity;
      if (density && STATE.draft) { STATE.draft.density = density; renderSettings(); return; }

      const move = event.target.closest('[data-oad-column-move]');
      if (move) return moveDraftColumn(move.dataset.columnId, move.dataset.oadColumnMove);

      const sort = event.target.closest('th[data-oad-sort]');
      if (sort) return changeSort(sort.dataset.oadSort);

      const edit = event.target.closest('[data-oad-edit]');
      if (edit) { event.stopPropagation(); return editService(edit.dataset.oadEdit); }

      const row = event.target.closest('tr[data-service-id]');
      if (row && !event.target.closest('button,input,select,a')) return openService(row.dataset.serviceId);

      const modal = document.getElementById('oad-modal');
      if (event.target === modal || event.target.closest('[data-oad-modal-close]')) return closeModal();

      if (!event.target.closest('#oad-popover')) closePopover();
    });

    document.addEventListener('input', event => {
      if (event.target.id === 'oad-query') { STATE.query = event.target.value; render(); }
      const toggle = event.target.closest('[data-oad-column-toggle]');
      if (toggle && STATE.draft) {
        const column = STATE.draft.columns.find(item => item.id === toggle.dataset.oadColumnToggle);
        if (column && !REQUIRED.has(column.id)) column.visible = toggle.checked;
        renderSettings();
      }
      const width = event.target.closest('[data-oad-column-width]');
      if (width && STATE.draft) {
        const column = STATE.draft.columns.find(item => item.id === width.dataset.oadColumnWidth);
        if (column) column.width = Number(width.value);
        width.nextElementSibling.textContent = `${width.value}px`;
      }
    });

    document.addEventListener('change', event => {
      if (event.target.id === 'oad-status-filter') { STATE.status = event.target.value; render(); }
      if (event.target.id === 'oad-company-filter') { STATE.company = event.target.value; render(); }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') { closePopover(); closeModal(); closeSettings(); }
      const th = event.target.closest('th[data-oad-sort]');
      if (th && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); changeSort(th.dataset.oadSort); }
    });

    const settings = document.getElementById('oad-settings');
    settings?.addEventListener('dragstart', event => {
      const item = event.target.closest('[data-oad-column-id]');
      if (!item) return;
      STATE.dragId = item.dataset.oadColumnId;
      item.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
    });
    settings?.addEventListener('dragend', event => {
      event.target.closest('[data-oad-column-id]')?.classList.remove('dragging');
      STATE.dragId = null;
    });
    settings?.addEventListener('dragover', event => {
      if (event.target.closest('[data-oad-column-id]')) event.preventDefault();
    });
    settings?.addEventListener('drop', event => {
      const target = event.target.closest('[data-oad-column-id]');
      if (!target || !STATE.dragId || target.dataset.oadColumnId === STATE.dragId) return;
      event.preventDefault(); reorderDraft(STATE.dragId, target.dataset.oadColumnId);
    });

    window.addEventListener('resize', closePopover, { passive: true });
    document.querySelector('.oad-table-wrap')?.addEventListener('scroll', closePopover, { passive: true });
  }

  function rowText(service) {
    return [
      service.service_number,
      service.service_order_number,
      service.company_name,
      service.branch_name,
      service.origin,
      service.destination,
      service.customer_name,
      service.vehicle_plate,
      service.vehicle_make_model,
      service.driver_name,
      service.truck_label,
      service.concept_name,
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function filteredServices() {
    const query = STATE.query.trim().toLowerCase();
    return activeServices().filter(service => {
      if (STATE.status !== 'all' && service.status !== STATE.status) return false;
      if (STATE.company !== 'all' && String(service.company_id || service.company_name) !== STATE.company) return false;
      return !query || rowText(service).includes(query);
    });
  }

  function sortValue(service, id) {
    switch (id) {
      case 'service': return service.service_number || '';
      case 'scheduled': return new Date(service.scheduled_for || service.requested_at || 0).getTime();
      case 'company': return service.company_name || '';
      case 'base': return service.billing_base_name || service.branch_name || '';
      case 'concept': return service.concept_name || '';
      case 'origin': return service.origin || '';
      case 'destination': return service.destination || '';
      case 'customer': return service.customer_name || '';
      case 'vehicle': return `${service.vehicle_plate || ''} ${service.vehicle_make_model || ''}`;
      case 'distance': return number(service.estimated_distance_km);
      case 'resource': return `${service.driver_name || ''} ${service.truck_label || ''}`;
      case 'delay': return number(service.granted_delay_minutes);
      case 'status': return STATUS_ORDER.indexOf(service.status);
      case 'amount': return number(service.company_estimated_total);
      case 'updated': return new Date(service.updated_at || 0).getTime();
      default: return '';
    }
  }

  function sortedServices(rows) {
    const { id, direction } = STATE.prefs.sort;
    const factor = direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = sortValue(a, id), bv = sortValue(b, id);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
      return String(av).localeCompare(String(bv), 'es', { numeric: true, sensitivity: 'base' }) * factor;
    });
  }

  function relativeTime(value) {
    if (!value) return '—';
    const diff = Math.max(0, Date.now() - new Date(value).getTime());
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours} h`;
    return dateOnly(value);
  }

  function cell(service, id) {
    const status = STATUS[service.status] || STATUS.pending;
    switch (id) {
      case 'service':
        return `<b class="oad-service-code">${esc(service.service_number || '—')}</b><small>${service.service_order_number ? `Prestación ${esc(service.service_order_number)}` : 'Sin código de prestadora'}</small>`;
      case 'scheduled':
        return `<b>${esc(dateOnly(service.scheduled_for || service.requested_at))}</b><small>${esc(timeOnly(service.scheduled_for || service.requested_at))}</small>`;
      case 'company':
        return `<b>${esc(service.company_name || '—')}</b>`;
      case 'base':
        return `<span>${esc(service.billing_base_name || service.branch_name || '—')}</span>`;
      case 'concept':
        return `<span>${esc(service.concept_name || service.pricing_snapshot?.components?.[0]?.service_name || '—')}</span>`;
      case 'origin':
        return `<span class="oad-address" title="${esc(service.origin || '')}">${esc(service.origin || '—')}</span>`;
      case 'destination':
        return `<span class="oad-address" title="${esc(service.destination || '')}">${esc(service.destination || '—')}</span>`;
      case 'customer':
        return `<b>${esc(service.customer_name || '—')}</b>${service.vehicle_plate ? `<small>${esc(service.vehicle_plate)}</small>` : ''}`;
      case 'vehicle':
        return `<b>${esc(service.vehicle_plate || '—')}</b><small>${esc(service.vehicle_make_model || '')}</small>`;
      case 'distance':
        return service.estimated_distance_km != null ? `<b>${number(service.estimated_distance_km).toLocaleString('es-AR')}</b><small>km</small>` : '—';
      case 'resource':
        return service.driver_name || service.truck_label
          ? `<b>${esc(service.driver_name || 'Sin chofer')}</b><small>${esc(service.truck_label || 'Sin móvil')}</small>`
          : '<button type="button" class="oad-unassigned" data-oad-command="assign" data-service-id="' + esc(service.service_id) + '">Asignar recursos</button>';
      case 'delay':
        return number(service.granted_delay_minutes) > 0 ? `<b>${number(service.granted_delay_minutes)} min</b>` : '<span class="oad-muted">Sin demora</span>';
      case 'status':
        return `<button type="button" class="oad-status ${status.tone}" data-oad-status-menu="${esc(service.service_id)}" aria-haspopup="menu"><span>${status.icon}</span>${esc(status.label)}<i>⌄</i></button>`;
      case 'amount':
        return `<b class="oad-amount">${esc(money(service.company_estimated_total, service.currency || 'ARS'))}</b>`;
      case 'updated':
        return `<span title="${esc(dateTime(service.updated_at))}">${esc(relativeTime(service.updated_at))}</span>`;
      case 'actions':
        return `<div class="oad-row-actions"><button type="button" class="oad-row-button primary" data-oad-edit="${esc(service.service_id)}" title="Editar" aria-label="Editar servicio">✎</button><button type="button" class="oad-row-button" data-oad-more-menu="${esc(service.service_id)}" title="Más acciones" aria-label="Más acciones">⋮</button></div>`;
      default:
        return '—';
    }
  }

  function renderStatusStrip() {
    const services = activeServices();
    const strip = document.getElementById('oad-status-strip');
    if (!strip) return;
    strip.innerHTML = STATUS_ORDER.map(key => {
      const meta = STATUS[key];
      const count = services.filter(service => service.status === key).length;
      return `<button type="button" class="oad-status-summary ${meta.tone} ${STATE.status === key ? 'active' : ''}" data-oad-filter-status="${key}"><span>${meta.icon}</span><b>${count}</b><small>${esc(meta.label)}</small></button>`;
    }).join('');
    strip.querySelectorAll('[data-oad-filter-status]').forEach(button => {
      button.addEventListener('click', () => {
        STATE.status = STATE.status === button.dataset.oadFilterStatus ? 'all' : button.dataset.oadFilterStatus;
        const filter = document.getElementById('oad-status-filter');
        if (filter) filter.value = STATE.status;
        render();
      });
    });
  }

  function render() {
    const root = document.getElementById('oad-root');
    if (!root) return;
    patchDeveloperLabels();
    const rows = sortedServices(filteredServices());
    const columns = visibleColumns();
    const table = document.getElementById('oad-table');
    table.className = `oad-table density-${STATE.prefs.density}`;
    table.querySelector('thead').innerHTML = `<tr>${columns.map(column => {
      const def = DEF_BY_ID[column.id];
      const active = STATE.prefs.sort.id === column.id;
      return `<th data-column="${column.id}" style="--oad-width:${column.width}px" ${def.sortable ? `data-oad-sort="${column.id}" tabindex="0"` : ''}><span>${esc(def.label)}${active ? `<i>${STATE.prefs.sort.direction === 'asc' ? '↑' : '↓'}</i>` : ''}</span></th>`;
    }).join('')}</tr>`;
    table.querySelector('tbody').innerHTML = rows.map(service => `
      <tr data-service-id="${esc(service.service_id)}" class="status-${esc(service.status)}">
        ${columns.map(column => `<td data-column="${column.id}" style="--oad-width:${column.width}px">${cell(service, column.id)}</td>`).join('')}
      </tr>
    `).join('');

    const empty = document.getElementById('oad-empty');
    const wrap = root.querySelector('.oad-table-wrap');
    empty.hidden = rows.length > 0;
    wrap.hidden = rows.length === 0;
    document.getElementById('oad-count').textContent = `${rows.length} ${rows.length === 1 ? 'servicio activo' : 'servicios activos'}`;
    const sortDef = DEF_BY_ID[STATE.prefs.sort.id];
    document.getElementById('oad-sort-label').textContent = `Orden: ${sortDef?.label || 'Fecha / hora'} ${STATE.prefs.sort.direction === 'asc' ? 'ascendente' : 'descendente'}`;
    refreshCompanySelect();
    renderStatusStrip();
  }

  function refreshCompanySelect() {
    const select = document.getElementById('oad-company-filter');
    if (!select) return;
    const options = companyOptions();
    const signature = options.map(([id, label]) => `${id}:${label}`).join('|');
    if (select.dataset.signature === signature) return;
    select.dataset.signature = signature;
    select.innerHTML = '<option value="all">Todas las prestadoras</option>' + options.map(([id, label]) => `<option value="${esc(id)}" ${STATE.company === String(id) ? 'selected' : ''}>${esc(label)}</option>`).join('');
  }

  function changeSort(id) {
    if (!DEF_BY_ID[id]?.sortable) return;
    if (STATE.prefs.sort.id === id) STATE.prefs.sort.direction = STATE.prefs.sort.direction === 'asc' ? 'desc' : 'asc';
    else STATE.prefs.sort = { id, direction: 'asc' };
    render();
    savePreferences(false);
  }

  function menuItemsForStatus(service) {
    const items = [];
    if (service.status === 'pending') {
      items.push(['assign', '', '＋', 'Asignar chofer y móvil', 'primary']);
    }
    if (service.status === 'assigned') {
      items.push(['transition', 'en_route', '→', 'Marcar En camino', 'primary']);
      items.push(['assign', '', '↔', 'Reasignar recursos', '']);
    }
    if (service.status === 'en_route') {
      items.push(['transition', 'at_origin', '⌖', 'Registrar arribo', 'primary']);
      items.push(['assign', '', '↔', 'Reasignar recursos', '']);
    }
    if (service.status === 'at_origin') {
      items.push(['transition', 'loaded', '↑', 'Vehículo cargado', 'primary']);
      items.push(['finalize', 'completed', '✓', 'Finalizar servicio', 'success']);
      items.push(['transition', 'en_route', '↶', 'Quitar arribo', '']);
      items.push(['assign', '', '↔', 'Reasignar recursos', '']);
    }
    if (service.status === 'loaded') {
      items.push(['transition', 'at_destination', '◆', 'Marcar En destino', 'primary']);
      items.push(['finalize', 'completed', '✓', 'Finalizar servicio', 'success']);
      items.push(['transition', 'at_origin', '↶', 'Volver a Arribado', '']);
      items.push(['assign', '', '↔', 'Reasignar recursos', '']);
    }
    if (service.status === 'at_destination') {
      items.push(['finalize', 'completed', '✓', 'Finalizar servicio', 'success']);
      items.push(['transition', 'loaded', '↶', 'Volver a Vehículo cargado', '']);
    }
    items.push(['open', '', '↗', 'Abrir servicio', '']);
    return items;
  }

  function openStatusMenu(serviceId, anchor) {
    const service = serviceById(serviceId);
    if (!service) return;
    const items = menuItemsForStatus(service);
    openPopover(anchor, `
      <div class="oad-popover-title"><small>Estado actual</small><b>${esc(STATUS[service.status]?.label || service.status)}</b></div>
      <div class="oad-popover-actions">${items.map(([command, value, icon, label, tone]) => `
        <button type="button" class="${tone}" data-oad-command="${command}" data-value="${esc(value)}" data-service-id="${esc(serviceId)}"><span>${icon}</span>${esc(label)}</button>
      `).join('')}</div>
    `);
  }

  function openMoreMenu(serviceId, anchor) {
    const service = serviceById(serviceId);
    if (!service) return;
    openPopover(anchor, `
      <div class="oad-popover-title"><small>Servicio</small><b>${esc(service.service_number || '')}</b></div>
      <div class="oad-popover-actions">
        <button type="button" data-oad-command="open" data-service-id="${esc(serviceId)}"><span>↗</span>Abrir servicio</button>
        <button type="button" data-oad-command="edit" data-service-id="${esc(serviceId)}"><span>✎</span>Editar datos</button>
        <button type="button" data-oad-command="assign" data-service-id="${esc(serviceId)}"><span>↔</span>${service.assigned_driver_id ? 'Reasignar recursos' : 'Asignar recursos'}</button>
        <div class="oad-popover-separator"></div>
        <button type="button" class="warning" data-oad-command="annul" data-service-id="${esc(serviceId)}"><span>⊘</span>Anular servicio</button>
        <button type="button" class="danger" data-oad-command="cancel" data-service-id="${esc(serviceId)}"><span>×</span>Cancelar servicio</button>
      </div>
    `);
  }

  function openPopover(anchor, html) {
    const popover = document.getElementById('oad-popover');
    popover.innerHTML = html;
    popover.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const width = 245;
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right - width));
    popover.style.left = `${left}px`;
    popover.style.top = `${Math.min(window.innerHeight - 320, rect.bottom + 7)}px`;
    STATE.menu = { anchor };
  }

  function closePopover() {
    const popover = document.getElementById('oad-popover');
    if (popover) { popover.hidden = true; popover.innerHTML = ''; }
    STATE.menu = null;
  }

  function handleCommand(command, serviceId, value) {
    switch (command) {
      case 'open': return openService(serviceId);
      case 'edit': return editService(serviceId);
      case 'assign': return openAssignment(serviceId);
      case 'transition': return openTransition(serviceId, value);
      case 'finalize': return openTransition(serviceId, 'completed');
      case 'annul': return openAnnul(serviceId);
      case 'cancel': return cancelService(serviceId);
      default: return undefined;
    }
  }

  function openService(serviceId) {
    closePopover();
    if (typeof O.openDetail === 'function') O.openDetail(serviceId);
  }

  function editService(serviceId) {
    closePopover();
    if (typeof window.editarServicioOperador === 'function') window.editarServicioOperador(serviceId);
    else openService(serviceId);
  }

  function cancelService(serviceId) {
    closePopover();
    if (typeof window.cerrarServicioSinCompletar === 'function') window.cerrarServicioSinCompletar(serviceId);
    else if (typeof window.cancelarServicioOperador === 'function') window.cancelarServicioOperador(serviceId);
    else showInlineError('El flujo de cancelación todavía no está disponible.');
  }

  function transitionCopy(service, toStatus) {
    const from = STATUS[service.status]?.label || service.status;
    if (toStatus === 'completed') return {
      title: 'Finalizar servicio',
      description: `El servicio ${service.service_number} saldrá de la Mesa activa y quedará disponible en Historial.`,
      confirm: 'Finalizar servicio',
      tone: 'success',
      reasonLabel: 'Nota final (opcional)',
      required: false,
    };
    const forward = STATUS_ORDER.indexOf(toStatus) > STATUS_ORDER.indexOf(service.status);
    return {
      title: forward ? `Marcar ${STATUS[toStatus]?.label}` : `Corregir estado a ${STATUS[toStatus]?.label}`,
      description: forward
        ? `${from} → ${STATUS[toStatus]?.label}. La operación quedará registrada en el historial.`
        : `Se revertirá el estado ${from}. Indicá el motivo de la corrección.`,
      confirm: forward ? 'Confirmar cambio' : 'Guardar corrección',
      tone: forward ? 'primary' : 'warning',
      reasonLabel: forward ? 'Observación (opcional)' : 'Motivo de la corrección',
      required: !forward,
    };
  }

  function openTransition(serviceId, toStatus) {
    const service = serviceById(serviceId);
    if (!service || !canOperate()) return;
    const copy = transitionCopy(service, toStatus);
    openActionModal({
      ...copy,
      body: `<div class="oad-transition-summary"><span class="oad-status ${STATUS[service.status]?.tone}">${esc(STATUS[service.status]?.label || service.status)}</span><i>→</i><span class="oad-status ${toStatus === 'completed' ? 'green' : STATUS[toStatus]?.tone}">${esc(toStatus === 'completed' ? 'Finalizado' : STATUS[toStatus]?.label)}</span></div>`,
      onConfirm: async note => executeTransition(service, toStatus, note),
    });
  }

  async function executeTransition(service, toStatus, note) {
    const client = db();
    if (!client) throw new Error('No hay conexión con la base. Actualizá la pantalla y volvé a intentar.');
    const { data, error } = await client.rpc('transition_operator_service_from_desk', {
      p_service_id: service.service_id,
      p_to_status: toStatus,
      p_note: note || null,
    });
    if (error) throw error;
    if (toStatus === 'completed') {
      O.S.services = (O.S.services || []).filter(item => String(item.service_id) !== String(service.service_id));
      render();
      notify('Servicio finalizado. Ya se encuentra en Historial.', 'success');
    } else {
      O.S.services = (O.S.services || []).map(item => String(item.service_id) === String(service.service_id)
        ? { ...item, status: toStatus, updated_at: new Date().toISOString(), trip_id: data?.trip_id ?? item.trip_id }
        : item);
      render();
      notify(`Estado actualizado a ${STATUS[toStatus]?.label}.`, 'success');
    }
    setTimeout(() => refreshServices(true), 150);
  }

  function openAnnul(serviceId) {
    const service = serviceById(serviceId);
    if (!service || !canOperate()) return;
    openActionModal({
      title: 'Anular servicio',
      description: `Usá esta acción únicamente si ${service.service_number} fue creado por error o está duplicado.`,
      body: '<div class="oad-warning-box"><b>No es una cancelación operativa.</b><span>El servicio saldrá de la mesa y quedará auditado como anulado.</span></div>',
      confirm: 'Anular servicio',
      tone: 'danger',
      reasonLabel: 'Motivo de la anulación',
      required: true,
      onConfirm: async reason => executeAnnul(service, reason),
    });
  }

  async function executeAnnul(service, reason) {
    const client = db();
    if (!client) throw new Error('No hay conexión con la base.');
    const { error } = await client.rpc('void_operator_service_from_desk', {
      p_service_id: service.service_id,
      p_reason: reason,
    });
    if (error) throw error;
    O.S.services = (O.S.services || []).filter(item => String(item.service_id) !== String(service.service_id));
    render();
    notify('Servicio anulado y enviado a Historial.', 'success');
    setTimeout(() => refreshServices(true), 150);
  }

  function openAssignment(serviceId) {
    const service = serviceById(serviceId);
    if (!service || !canOperate()) return;
    const drivers = Array.isArray(O.S?.drivers) ? O.S.drivers : [];
    const trucks = Array.isArray(O.S?.trucks) ? O.S.trucks : [];
    const active = !['pending', 'assigned'].includes(service.status);
    const modal = document.getElementById('oad-modal');
    const shell = modal.querySelector('.oad-modal');
    shell.innerHTML = `
      <form id="oad-assignment-form">
        <header><div><small>Mesa activa</small><h3 id="oad-modal-title">${service.assigned_driver_id ? 'Reasignar recursos' : 'Asignar recursos'}</h3><p>${esc(service.service_number || '')}</p></div><button type="button" data-oad-modal-close>×</button></header>
        <div class="oad-modal-body">
          ${active ? '<div class="oad-warning-box"><b>Servicio iniciado</b><span>La reasignación cerrará la intervención actual y devolverá el servicio a Asignado.</span></div>' : ''}
          <div class="oad-form-grid">
            <label><span>Chofer *</span><select name="driver" required><option value="">Seleccionar chofer</option>${drivers.map(driver => `<option value="${esc(driver.user_id)}" ${String(driver.user_id) === String(service.assigned_driver_id) ? 'selected' : ''}>${esc(driver.full_name || driver.legajo || 'Chofer')}</option>`).join('')}</select></label>
            <label><span>Móvil *</span><select name="truck" required><option value="">Seleccionar móvil</option>${trucks.map(truck => `<option value="${esc(truck.truck_id)}" ${String(truck.truck_id) === String(service.assigned_truck_id) ? 'selected' : ''}>${esc(truck.numero_interno || truck.plate || 'Móvil')} · ${esc(truck.plate || '')}</option>`).join('')}</select></label>
            <label class="span-two"><span>Observación (opcional)</span><textarea name="notes" rows="3" placeholder="Motivo operativo o referencia"></textarea></label>
          </div>
          <div class="oad-modal-error" hidden role="alert"></div>
        </div>
        <footer><button type="button" data-oad-modal-close>Cancelar</button><button type="submit" class="primary">Confirmar asignación</button></footer>
      </form>
    `;
    modal.hidden = false; modal.setAttribute('aria-hidden', 'false');
    const form = document.getElementById('oad-assignment-form');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = event.submitter;
      const errorBox = form.querySelector('.oad-modal-error');
      errorBox.hidden = true;
      const driverId = form.elements.namedItem('driver').value;
      const truckId = Number(form.elements.namedItem('truck').value);
      if (!driverId || !truckId) return showModalError(errorBox, 'Seleccioná chofer y móvil.');
      if (String(driverId) === String(service.assigned_driver_id) && String(truckId) === String(service.assigned_truck_id)) {
        return showModalError(errorBox, 'El servicio ya está asignado a esos recursos.');
      }
      submit.disabled = true; submit.textContent = 'Asignando…';
      try {
        const { error } = await db().rpc('reassign_operator_service', {
          p_service_id: service.service_id,
          p_driver_id: driverId,
          p_truck_id: truckId,
          p_reason_code: service.assigned_driver_id ? 'operational_adjustment' : 'initial_assignment',
          p_notes: form.elements.namedItem('notes').value.trim() || null,
        });
        if (error) throw error;
        closeModal();
        notify(service.assigned_driver_id ? 'Servicio reasignado.' : 'Servicio asignado.', 'success');
        await refreshServices(true);
      } catch (error) {
        showModalError(errorBox, errorMessage(error));
        submit.disabled = false; submit.textContent = 'Confirmar asignación';
      }
    });
  }

  function openActionModal({ title, description, body = '', confirm, tone = 'primary', reasonLabel, required, onConfirm }) {
    const modal = document.getElementById('oad-modal');
    const shell = modal.querySelector('.oad-modal');
    shell.innerHTML = `
      <form id="oad-action-form">
        <header><div><small>Mesa activa</small><h3 id="oad-modal-title">${esc(title)}</h3><p>${esc(description || '')}</p></div><button type="button" data-oad-modal-close>×</button></header>
        <div class="oad-modal-body">
          ${body}
          <label class="oad-modal-field"><span>${esc(reasonLabel || 'Observación')}${required ? ' *' : ''}</span><textarea name="note" rows="3" ${required ? 'required' : ''} placeholder="${required ? 'Escribí al menos 5 caracteres' : 'Opcional'}"></textarea></label>
          <div class="oad-modal-error" hidden role="alert"></div>
        </div>
        <footer><button type="button" data-oad-modal-close>Cancelar</button><button type="submit" class="${esc(tone)}">${esc(confirm)}</button></footer>
      </form>
    `;
    modal.hidden = false; modal.setAttribute('aria-hidden', 'false');
    const form = document.getElementById('oad-action-form');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (STATE.loadingAction) return;
      const note = form.elements.namedItem('note').value.trim();
      const errorBox = form.querySelector('.oad-modal-error');
      errorBox.hidden = true;
      if (required && note.length < 5) return showModalError(errorBox, 'Escribí un motivo de al menos 5 caracteres.');
      const submit = event.submitter;
      STATE.loadingAction = true; submit.disabled = true; submit.dataset.label = submit.textContent; submit.textContent = 'Procesando…';
      try {
        await onConfirm(note);
        closeModal();
      } catch (error) {
        showModalError(errorBox, errorMessage(error));
        submit.disabled = false; submit.textContent = submit.dataset.label || confirm;
      } finally {
        STATE.loadingAction = false;
      }
    });
  }

  function errorMessage(error) {
    const message = String(error?.message || error || 'No se pudo completar la operación');
    return message
      .replace(/^.*(?:JORNADA_REQUERIDA|VIAJE_EN_CURSO|REMITO_REQUERIDO|REMITO_INCOMPLETO):\s*/i, '')
      .replace(/^PGRST\d+:\s*/i, '');
  }

  function showModalError(box, message) {
    box.textContent = message;
    box.hidden = false;
  }

  function closeModal() {
    const modal = document.getElementById('oad-modal');
    if (!modal || modal.hidden) return;
    modal.hidden = true; modal.setAttribute('aria-hidden', 'true');
    modal.querySelector('.oad-modal').innerHTML = '';
    STATE.loadingAction = false;
  }

  function showInlineError(message) {
    const box = document.getElementById('oad-inline-error');
    if (!box) return;
    box.textContent = message; box.hidden = false;
    setTimeout(() => { if (box.textContent === message) box.hidden = true; }, 7000);
  }

  async function refreshServices(silent = false) {
    const button = document.getElementById('oad-refresh-button');
    if (button && !silent) { button.disabled = true; button.textContent = 'Actualizando…'; }
    try {
      await O.loadServices?.();
      render();
    } catch (error) {
      showInlineError(errorMessage(error));
    } finally {
      if (button) { button.disabled = false; button.textContent = '↻ Actualizar'; }
    }
  }

  function openSettings() {
    STATE.draft = clone(STATE.prefs);
    const settings = document.getElementById('oad-settings');
    settings.hidden = false; settings.setAttribute('aria-hidden', 'false');
    renderSettings();
  }

  function closeSettings() {
    const settings = document.getElementById('oad-settings');
    if (!settings || settings.hidden) return;
    settings.hidden = true; settings.setAttribute('aria-hidden', 'true');
    STATE.draft = null;
  }

  function renderSettings() {
    if (!STATE.draft) return;
    document.querySelectorAll('[data-oad-density]').forEach(button => button.classList.toggle('active', button.dataset.oadDensity === STATE.draft.density));
    const list = document.getElementById('oad-column-list');
    const columns = [...STATE.draft.columns].sort((a, b) => a.order - b.order);
    list.innerHTML = columns.map((column, index) => {
      const def = DEF_BY_ID[column.id];
      const required = REQUIRED.has(column.id);
      return `
        <article class="oad-column-item" draggable="true" data-oad-column-id="${column.id}">
          <span class="handle" title="Arrastrar">⋮⋮</span>
          <label class="oad-column-toggle"><input type="checkbox" data-oad-column-toggle="${column.id}" ${column.visible ? 'checked' : ''} ${required ? 'disabled' : ''}><span><b>${esc(def.label)}</b><small>${required ? 'Obligatoria' : 'Opcional'}</small></span></label>
          <label class="oad-column-width"><span>Ancho</span><input type="range" min="76" max="360" step="4" value="${column.width}" data-oad-column-width="${column.id}"><output>${column.width}px</output></label>
          <div class="oad-column-move"><button type="button" data-oad-column-move="up" data-column-id="${column.id}" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-oad-column-move="down" data-column-id="${column.id}" ${index === columns.length - 1 ? 'disabled' : ''}>↓</button></div>
        </article>
      `;
    }).join('');
  }

  function moveDraftColumn(id, direction) {
    if (!STATE.draft) return;
    const list = STATE.draft.columns.sort((a, b) => a.order - b.order);
    const index = list.findIndex(item => item.id === id);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    list.forEach((item, position) => { item.order = position; });
    renderSettings();
  }

  function reorderDraft(sourceId, targetId) {
    if (!STATE.draft) return;
    const list = STATE.draft.columns.sort((a, b) => a.order - b.order);
    const sourceIndex = list.findIndex(item => item.id === sourceId);
    const targetIndex = list.findIndex(item => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [source] = list.splice(sourceIndex, 1);
    list.splice(targetIndex, 0, source);
    list.forEach((item, index) => { item.order = index; });
    renderSettings();
  }

  function resetDraft() {
    STATE.draft = clone(DEFAULT_PREFS);
    renderSettings();
  }

  async function saveSettings() {
    if (!STATE.draft || STATE.saving) return;
    STATE.prefs = normalizePreferences(STATE.draft);
    render();
    await savePreferences(true);
    closeSettings();
  }

  async function savePreferences(showToast = true) {
    const client = db();
    const userId = window.AuxiliosFeatures?.userId;
    if (!client || !userId) return;
    STATE.saving = true;
    try {
      const { error } = await client.from('user_view_preferences').upsert({
        user_id: userId,
        view_key: VIEW_KEY,
        preferences: STATE.prefs,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,view_key' });
      if (error) throw error;
      if (showToast) notify('Vista personalizada guardada.', 'success');
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      STATE.saving = false;
    }
  }

  async function loadPreferences() {
    const client = db();
    if (!client) return;
    try {
      const { data, error } = await client.from('user_view_preferences').select('preferences').eq('view_key', VIEW_KEY).maybeSingle();
      if (error) throw error;
      STATE.prefs = normalizePreferences(data?.preferences);
    } catch (error) {
      console.warn('[Mesa activa]', errorMessage(error));
      STATE.prefs = clone(DEFAULT_PREFS);
    }
  }

  function patchDeveloperLabels() {
    document.querySelectorAll('.p3b-lifecycle-head span').forEach(label => {
      if (/fase\s*3b/i.test(label.textContent || '')) label.textContent = 'Operación';
    });
  }

  function watch() {
    const source = document.getElementById('os-board');
    if (source && !STATE.observer) {
      STATE.observer = new MutationObserver(() => {
        patchDeveloperLabels();
        const next = signature();
        if (next !== STATE.lastSignature) {
          STATE.lastSignature = next;
          render();
        }
      });
      STATE.observer.observe(source, { childList: true, subtree: true });
    }
    if (!STATE.poll) {
      STATE.poll = setInterval(() => {
        const next = signature();
        if (next !== STATE.lastSignature) { STATE.lastSignature = next; render(); }
        patchDeveloperLabels();
        if (!document.getElementById('oad-root')) boot();
      }, 1000);
    }
  }

  async function boot() {
    if (!inject()) return false;
    if (!STATE.ready) { await loadPreferences(); STATE.ready = true; }
    STATE.lastSignature = signature();
    render();
    watch();
    if (!Array.isArray(O.S?.services) || !O.S.services.length) refreshServices(true);
    window.OperatorActiveDeskV1 = {
      state: STATE,
      render,
      refresh: refreshServices,
      openSettings,
      activeStatuses: ACTIVE_STATUSES,
    };
    return true;
  }

  let attempts = 0;
  const timer = setInterval(async () => {
    if (await boot()) clearInterval(timer);
    else if (++attempts > 120) clearInterval(timer);
  }, 250);
})();

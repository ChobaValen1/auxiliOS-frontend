/* AuxiliOS · Facturación · mesa administrativa canónica */
(() => {
  'use strict';

  const B = window.OperatorBilling = window.OperatorBilling || {};
  const S = B.S = {
    rows: [],
    tollRows: [],
    tollTotal: 0,
    filters: { companies: [], periods: [] },
    tab: 'services',
    search: '',
    company: '',
    period: '',
    periodSel: { mode: 'all' },
    base: '',
    serviceType: '',
    allRows: [],
    allTollRows: [],
    selected: new Set(),
    selectedTolls: new Set(),
    // Excedentes que cobra la Prestadora: se seleccionan por servicio (una línea de factura por servicio).
    selectedExcesses: new Set(),
    extraCollector: 'all',
    loading: false,
    detail: null,
    detailLoading: false,
    rowAction: null,
    invoiceOpen: false,
    invoiceForm: null,
    invoiceBusy: false,
    searchTimer: null
  };

  const norm = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  const profile = () => typeof PERFIL_USUARIO !== 'undefined'
    ? PERFIL_USUARIO
    : (window.PERFIL_USUARIO || {});
  const role = () => norm(
    profile()?.roles?.name || profile()?.role?.name || profile()?.role || profile()?.role_name || ''
  );
  const canRead = () => ['administracion', 'facturacion', 'supervision'].includes(role());
  const canInvoice = () => ['administracion', 'facturacion'].includes(role());
  const canCorrect = () => role() === 'administracion';
  const canRevert = () => ['administracion', 'facturacion'].includes(role());
  const db = () => typeof _db !== 'undefined' ? _db : null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const notify = (message, type = 'info') => typeof window.toast === 'function'
    ? window.toast(message, type)
    : console[type === 'error' ? 'error' : 'log'](message);
  /* Anular y revertir son acciones con consecuencias contables: se confirman
     con el mismo cuadro que el resto de AuxiliOS, no con un toast en la
     esquina. Si sigma.js no está cargado cae al toast, que es lo que había. */
  const confirmar = (titulo, detalle) => typeof window.operationFeedback === 'function'
    ? window.operationFeedback(titulo, detalle, 'success', 2400)
    : notify(titulo, 'success');
  const ico = name => `<svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#${name}"/></svg>`;
  const money = (value, currency = 'ARS') => new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: currency || 'ARS', maximumFractionDigits: 2
  }).format(num(value));

  function dateParts(value) {
    if (!value) return { day: '—', time: '—' };
    const parts = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(value));
    const get = type => parts.find(part => part.type === type)?.value || '';
    return { day: `${get('day')}/${get('month')}/${get('year')}`, time: `${get('hour')}:${get('minute')}` };
  }

  const date = value => value ? new Date(value).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
  }) : '—';

  function todayLocalDate() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function periodLabel(value) {
    if (!value) return 'Todos los períodos';
    const [year, month] = value.split('-').map(Number);
    if (!year || !month) return value;
    return new Intl.DateTimeFormat('es-AR', {
      month: 'long', year: 'numeric', timeZone: 'UTC'
    }).format(new Date(Date.UTC(year, month - 1, 1))).replace(/^./, x => x.toUpperCase());
  }

  function periodBounds(value) {
    if (!value) return { start: null, end: null };
    const [year, month] = value.split('-').map(Number);
    if (!year || !month) return { start: null, end: null };
    const pad = number => String(number).padStart(2, '0');
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(lastDay)}` };
  }

  function injectAssets() {
    if (document.getElementById('auxilios-operator-billing-css')) return;
    const link = document.createElement('link');
    link.id = 'auxilios-operator-billing-css';
    link.rel = 'stylesheet';
    link.href = '/operator-billing.css';
    document.head.appendChild(link);
  }

  function ensureShell() {
    injectAssets();
    let screen = document.getElementById('screen-facturacion');
    if (!screen) {
      const content = document.querySelector('.content');
      if (!content) return null;
      screen = document.createElement('div');
      screen.id = 'screen-facturacion';
      screen.className = 'screen ob-screen';
      content.appendChild(screen);
    }

    let nav = document.getElementById('nav-facturacion');
    if (!nav) {
      const sidenav = document.querySelector('.sidenav');
      const bottom = sidenav?.querySelector('.nav-bottom');
      if (sidenav && bottom) {
        nav = document.createElement('div');
        nav.id = 'nav-facturacion';
        nav.className = 'nav-item';
        nav.innerHTML = '<span class="nav-icon">$</span><span class="nav-label">Facturación</span>';
        nav.addEventListener('click', open);
        sidenav.insertBefore(nav, bottom);
      }
    }
    if (nav) nav.style.display = canRead() ? '' : 'none';

    if (!screen.dataset.boundOb) {
      screen.dataset.boundOb = '1';
      screen.addEventListener('click', onClick);
      screen.addEventListener('input', onInput);
      screen.addEventListener('change', onChange);
    }
    return screen;
  }

  function setTopbar() {
    const title = document.getElementById('topbar-title');
    const sub = document.getElementById('topbar-sub');
    if (title) title.textContent = 'Facturación';
    if (sub) sub.textContent = 'Servicios y peajes disponibles para facturar';
  }

  function open() {
    if (!canRead()) return notify('Sin permiso para Facturación', 'error');
    const screen = ensureShell();
    if (!screen) return;
    window.dispatchEvent(new CustomEvent('auxilios:navigation-changed', { detail: { screen: 'facturacion' } }));
    document.querySelectorAll('.screen').forEach(node => node.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(node => node.classList.remove('active'));
    screen.classList.add('active');
    document.getElementById('nav-facturacion')?.classList.add('active');
    setTopbar();
    render();
    load();
  }

  function clearSelection() {
    S.selected.clear();
    S.selectedTolls.clear();
    S.selectedExcesses.clear();
  }

  /* ── Excedentes que cobra la Prestadora ──
     Cada fila de Adicionales es un excedente; para facturar se agrupan por servicio,
     igual que la línea de factura que arma la base. */
  const isProviderExcess = row => row.collector_agent === 'provider';
  const excessInvoiceable = row => isProviderExcess(row) && row.invoiceable === true;
  function excessGroups(rows = S.extraRows || []) {
    const groups = new Map();
    for (const row of rows) {
      if (!excessInvoiceable(row)) continue;
      const id = String(row.service_id);
      const g = groups.get(id) || { service_id: id, company_id: row.company_id, company_name: row.company_name, currency: row.currency || 'ARS', rows: [], total: 0, first: row };
      g.rows.push(row);
      g.total += num(row.total_amount);
      groups.set(id, g);
    }
    return groups;
  }
  const selectedExcessGroups = () => [...excessGroups().values()].filter(g => S.selectedExcesses.has(g.service_id));

  const selectedRows = () => S.rows.filter(row => S.selected.has(String(row.service_id)));
  const selectedTollRows = () => S.tollRows.filter(row => S.selectedTolls.has(String(row.service_toll_id)));
  const selectedCount = () => S.selected.size + S.selectedTolls.size + S.selectedExcesses.size;

  function selectedCompanies() {
    return new Map([
      ...selectedRows().map(row => [String(row.company_id), row.company_name || 'Prestadora']),
      ...selectedTollRows().map(row => [String(row.company_id), row.company_name || 'Prestadora']),
      ...selectedExcessGroups().map(g => [String(g.company_id), g.company_name || 'Prestadora'])
    ]);
  }

  function selectedCurrencies() {
    return new Set([
      ...selectedRows().map(row => String(row.currency || 'ARS')),
      ...selectedTollRows().map(row => String(row.currency || 'ARS')),
      ...selectedExcessGroups().map(g => String(g.currency || 'ARS'))
    ]);
  }

  const selectedExcessTotal = () => selectedExcessGroups().reduce((total, g) => total + g.total, 0);
  function selectedTotal() {
    return selectedRows().reduce((total, row) => total + num(row.current_company_amount), 0)
      + selectedTollRows().reduce((total, row) => total + num(row.amount), 0)
      + selectedExcessTotal();
  }

  function selectedCurrency() {
    return selectedRows()[0]?.currency || selectedTollRows()[0]?.currency || selectedExcessGroups()[0]?.currency || 'ARS';
  }

  /* Servicios tildados que tienen excedentes de la Prestadora sin sumar a la factura. */
  function relatedPendingExcesses() {
    const groups = excessGroups();
    return selectedRows().map(row => groups.get(String(row.service_id))).filter(g => g && !S.selectedExcesses.has(g.service_id));
  }

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  function selectionParts() {
    return [
      S.selected.size ? plural(S.selected.size, 'servicio', 'servicios') : '',
      S.selectedTolls.size ? plural(S.selectedTolls.size, 'peaje', 'peajes') : '',
      S.selectedExcesses.size ? plural(S.selectedExcesses.size, 'excedente', 'excedentes') : ''
    ].filter(Boolean);
  }
  const joinParts = parts => parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : (parts[0] || '');

  function invoiceGroupCounts(rows = selectedRows()) {
    const counts = { liviano: 0, semipesado: 0, uml: 0, otros: 0 };
    for (const row of rows) {
      const name = norm(row.service_name);
      if (name === 'liviano') counts.liviano++;
      else if (name === 'semipesado') counts.semipesado++;
      else if (name === 'uml') counts.uml++;
      else counts.otros++;
    }
    return counts;
  }

  const freshInvoiceForm = () => ({
    document_type: 'FA', point_of_sale: '', document_number: '', issued_on: todayLocalDate(), notes: ''
  });

  /* Base y Tipo se filtran sobre lo que ya trajo el servidor: las RPC de
     Facturación solo reciben prestadora, período y búsqueda. */
  const uniqueOptions = (rows, key) => [...new Set(rows.map(row => row[key]).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), 'es'))
    .map(value => ({ value, label: value }));

  function applyLocalFilters() {
    S.rows = S.allRows.filter(row => (!S.base || row.billing_base_name === S.base) && (!S.serviceType || row.service_name === S.serviceType));
    S.tollRows = S.allTollRows.filter(row => !S.base || row.billing_base_name === S.base);
    S.extraRows = (S.allExtraRows || []).filter(row => !S.base || row.billing_base_name === S.base);
    for (const id of [...S.selected]) if (!S.rows.some(row => String(row.service_id) === id)) S.selected.delete(id);
    for (const id of [...S.selectedTolls]) if (!S.tollRows.some(row => String(row.service_toll_id) === id)) S.selectedTolls.delete(id);
    const groups = excessGroups();
    for (const id of [...S.selectedExcesses]) if (!groups.has(id)) S.selectedExcesses.delete(id);
  }

  function activeFilterCount() {
    return [S.search.trim(), S.company, S.periodSel.mode !== 'all', S.base, S.tab === 'services' && S.serviceType].filter(Boolean).length;
  }

  function filtersMarkup() {
    const F = window.AuxFilters;
    const searchInput = `<label class="auxf-search"><span aria-hidden="true">${ico('search')}</span><input class="ob-search" id="ob-search" type="search" autocomplete="off" placeholder="Buscar código, cliente, origen, destino…" value="${esc(S.search)}"></label>`;
    if (!F) return `${searchInput}<select class="ob-filter" id="ob-company-filter">${filterOptions().companies}</select>`;
    const companies = S.filters.companies.map(item => ({ value: String(item.company_id), label: item.company_name }));
    const bases = uniqueOptions([...S.allRows, ...S.allTollRows], 'billing_base_name');
    return searchInput
      + F.period({ id: 'period', value: S.periodSel, allLabel: 'Todos los períodos', months: S.filters.periods })
      + F.select({ id: 'company', label: 'Prestadora', icon: ico('building-2'), value: S.company, options: companies, allLabel: 'Todas' })
      + F.select({ id: 'base', label: 'Base', icon: ico('map-pin'), value: S.base, options: bases, allLabel: 'Todas' })
      + (S.tab === 'services' ? F.select({ id: 'serviceType', label: 'Tipo', icon: ico('truck'), value: S.serviceType, options: uniqueOptions(S.allRows, 'service_name'), allLabel: 'Todos' }) : '')
      + F.clear({ count: activeFilterCount() });
  }

  function onFilterChange(id, value) {
    if (id === 'period') {
      S.periodSel = value;
      const bounds = window.AuxFilters.periodBounds(value);
      S.period = value.mode === 'mes' ? value.mes : value.mode === 'rango' ? `${bounds.start}_${bounds.end}` : '';
      return clearAndLoad();
    }
    if (id === 'company') { S.company = value || ''; return clearAndLoad(); }
    if (id === 'base') S.base = value || '';
    if (id === 'serviceType') S.serviceType = value || '';
    applyLocalFilters();
    render();
  }

  function clearFilters() {
    Object.assign(S, { search: '', company: '', period: '', periodSel: { mode: 'all' }, base: '', serviceType: '' });
    clearAndLoad();
  }

  function filterOptions() {
    const companies = [
      '<option value="">Todas las prestadoras</option>',
      ...S.filters.companies.map(item =>
        `<option value="${esc(item.company_id)}" ${String(S.company) === String(item.company_id) ? 'selected' : ''}>${esc(item.company_name)}</option>`
      )
    ].join('');
    const periods = [
      '<option value="">Todos los períodos</option>',
      ...S.filters.periods.map(period =>
        `<option value="${esc(period)}" ${S.period === period ? 'selected' : ''}>${esc(periodLabel(period))}</option>`
      )
    ].join('');
    return { companies, periods };
  }

  function excelMenuMarkup() {
    const serviceCount = S.selected.size;
    // En Peajes no hay selección de servicios: solo «Peajes visibles» y «Todo lo filtrado».
    return `<div class="obx-menu" role="menu">
      ${S.tab === 'tolls' ? '' : `<button type="button" data-ob="excel-selected"><b>Selección de servicios</b><small>${serviceCount} servicios seleccionados</small></button>`}
      <button type="button" data-ob="excel-current"><b>${S.tab === 'tolls' ? 'Peajes' : 'Servicios'} visibles</b><small>${S.tab === 'tolls' ? S.tollRows.length : S.rows.length} registros con estos filtros</small></button>
      <button type="button" data-ob="excel-all"><b>Todo lo filtrado</b><small>Servicios + Peajes</small></button>
    </div>`;
  }

  function closeRowActionMenu() {
    document.querySelectorAll('[data-ob-row-menu][aria-expanded="true"]')
      .forEach(node => node.setAttribute('aria-expanded', 'false'));
    document.getElementById('ob-row-action-menu')?.remove();
  }

  function rowActionMenuMarkup(id) {
    return `<button type="button" data-ob-row-action="view" data-service-id="${esc(id)}">Visualizar</button>
      ${canCorrect() ? `<button type="button" data-ob-row-action="edit" data-service-id="${esc(id)}">Modificar</button>` : ''}
      ${canRevert() ? `<button type="button" data-ob-row-action="revert" data-service-id="${esc(id)}">Revertir</button>` : ''}
      ${canCorrect() ? `<button type="button" class="danger" data-ob-row-action="annul" data-service-id="${esc(id)}">Anular</button>` : ''}`;
  }

  function toggleRowActionMenu(trigger, id) {
    const existing = document.getElementById('ob-row-action-menu');
    if (existing?.dataset.serviceId === String(id)) {
      closeRowActionMenu();
      return;
    }
    closeRowActionMenu();
    const menu = document.createElement('div');
    menu.id = 'ob-row-action-menu';
    menu.className = 'ob-row-action-menu';
    menu.dataset.serviceId = String(id);
    menu.setAttribute('role', 'menu');
    menu.innerHTML = rowActionMenuMarkup(id);
    document.body.appendChild(menu);
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const left = Math.max(margin, Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - margin));
    let top = rect.bottom + gap;
    if (top + menu.offsetHeight > window.innerHeight - margin) top = Math.max(margin, rect.top - menu.offsetHeight - gap);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    trigger.setAttribute('aria-expanded', 'true');
  }

  function selectionMarkup() {
    if (!selectedCount()) { S.selectionShown = false; return ''; }
    const companies = selectedCompanies();
    const currencies = selectedCurrencies();
    const singleCompany = companies.size === 1;
    const singleCurrency = currencies.size === 1;
    const services = selectedRows();
    const invalidPricing = services.some(row => row.pricing_error);
    const disabled = S.invoiceBusy || !singleCompany || !singleCurrency || invalidPricing;
    const summary = singleCompany
      ? `${[...companies.values()][0]} · ${money(selectedTotal(), selectedCurrency())}`
      : `${companies.size} prestadoras seleccionadas`;
    const title = !singleCompany
      ? 'Seleccioná conceptos de una sola prestadora'
      : !singleCurrency
        ? 'La selección debe tener una sola moneda'
        : invalidPricing ? 'Corregí los errores tarifarios antes de facturar' : '';
    const related = singleCompany ? relatedPendingExcesses() : [];
    const relatedTotal = related.reduce((t, g) => t + g.total, 0);
    const hint = related.length
      ? `<div class="ob-selection-hint" role="note">${ico('circle-alert')}<span>${related.length === 1 ? 'Un servicio seleccionado tiene' : `${related.length} servicios seleccionados tienen`} excedentes que cobra la Prestadora sin facturar · <b class="ob-money">${esc(money(relatedTotal, selectedCurrency()))}</b></span><button class="ob-button ob-hint-action" type="button" data-ob="add-related-excess" ${S.invoiceBusy ? 'disabled' : ''}>${ico('plus')}Sumar a la factura</button></div>`
      : '';
    const enter = S.selectionShown ? '' : ' is-entering';
    S.selectionShown = true;
    return `<section class="ob-selection${enter}" aria-live="polite">
      <div><b>${esc(joinParts(selectionParts()))}</b><small>${esc(summary)}</small></div>
      <div class="ob-selection-actions">
        <button class="ob-button" data-ob="clear-selection" ${S.invoiceBusy ? 'disabled' : ''}>Limpiar</button>
        ${canInvoice() ? `<button class="ob-button success" data-ob="invoice-selection" ${disabled ? 'disabled' : ''} ${title ? `title="${esc(title)}"` : ''}>${S.invoiceBusy ? 'Facturando…' : 'Facturar'}</button>` : ''}
      </div>
      ${hint}
    </section>`;
  }

  function invoiceModalMarkup() {
    const services = selectedRows();
    const tolls = selectedTollRows();
    const company = [...selectedCompanies().values()][0] || 'Prestadora';
    const currency = selectedCurrency();
    const groups = invoiceGroupCounts(services);
    const form = S.invoiceForm || freshInvoiceForm();
    const tipoChips = [['Liviano', groups.liviano], ['Semipesado', groups.semipesado], ['UML', groups.uml], ['Otros', groups.otros]]
      .filter(([, n]) => n > 0).map(([label, n]) => `<span><b>${n}</b>${label}</span>`).join('');
    const subServicios = services.reduce((t, row) => t + num(row.current_company_amount), 0);
    const subPeajes = tolls.reduce((t, row) => t + num(row.amount), 0);
    const excesses = selectedExcessGroups();
    const subExcedentes = excesses.reduce((t, g) => t + g.total, 0);
    const includes = joinParts(selectionParts());
    const enter = S.invoiceShown ? '' : ' is-entering';
    S.invoiceShown = true;
    return `<section role="dialog" aria-modal="true" aria-labelledby="ob-invoice-title" class="ob-invoice-modal${enter}">
      <header class="ob-invoice-head">
        <div><small>Facturación</small><h3 id="ob-invoice-title">Crear factura</h3><p>${esc(company)}</p></div>
        <button class="ob-button" type="button" data-ob="close-invoice" ${S.invoiceBusy ? 'disabled' : ''}>${ico('x')}Cerrar</button>
      </header>
      <div class="ob-invoice-body">
       <div class="ob-invoice-main">
        <section class="ob-invoice-card ob-invoice-fields" aria-label="Datos de la factura">
          <h4 class="ob-invoice-section">Comprobante</h4>
          <label class="ob-field-type"><span>Tipo</span><select data-ob-invoice-field="document_type">
            <option value="FA" ${form.document_type === 'FA' ? 'selected' : ''}>Factura A</option>
            <option value="FB" ${form.document_type === 'FB' ? 'selected' : ''}>Factura B</option>
            <option value="FC" ${form.document_type === 'FC' ? 'selected' : ''}>Factura C</option>
          </select></label>
          <div class="ob-field-number" role="group" aria-label="Número de comprobante">
            <label><span>Punto de venta</span><input data-ob-invoice-field="point_of_sale" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="0004" value="${esc(form.point_of_sale)}"></label>
            <i aria-hidden="true">–</i>
            <label><span>Número</span><input data-ob-invoice-field="document_number" inputmode="numeric" autocomplete="off" maxlength="20" placeholder="00001258" value="${esc(form.document_number)}"></label>
          </div>
          <label class="ob-field-date"><span>Fecha de emisión</span><input type="date" data-ob-invoice-field="issued_on" value="${esc(form.issued_on)}"></label>
          <label class="ob-invoice-notes"><span>Observaciones <small>opcional</small></span><input data-ob-invoice-field="notes" maxlength="300" placeholder="Referencia u observación breve" value="${esc(form.notes)}"></label>
        </section>
        <section class="ob-invoice-card ob-invoice-summary" aria-label="Conceptos incluidos">
          <h4 class="ob-invoice-section">Qué incluye</h4>
          <dl>
            <div><dt>Servicios</dt><dd>${services.length}</dd></div>
            <div><dt>Peajes</dt><dd>${tolls.length}</dd></div>
            ${excesses.length ? `<div><dt>Excedentes de la Prestadora</dt><dd>${excesses.length}</dd></div>` : ''}
          </dl>
          ${tipoChips ? `<div class="ob-invoice-types" aria-label="Servicios por tipo">${tipoChips}</div>` : ''}
        </section>
       </div>
       <div class="ob-invoice-side">
        <section class="ob-invoice-lines" aria-label="Qué se factura">
          <h4>Se factura <small>${esc(includes)}</small></h4>
          <div class="ob-invoice-table-wrap"><table class="ob-invoice-table">
            <thead><tr><th>Servicio</th><th>Fecha</th><th>Recorrido</th><th>Importe</th></tr></thead>
            <tbody>${services.map(row => `<tr><td><b>${esc(row.service_order_number || row.service_number || 'Servicio')}</b><small>${esc([row.service_name, row.customer_name].filter(Boolean).join(' · ') || '—')}</small></td><td class="ob-it-date">${esc(dateParts(row.scheduled_for).day || '—')}</td><td class="ob-it-route"><span>${esc(row.origin || '—')}</span><span>${esc(row.destination || '—')}</span></td><td class="ob-it-amount"><span class="ob-money">${esc(money(row.current_company_amount, row.currency))}</span></td></tr>`).join('')}${tolls.map(row => `<tr class="is-toll"><td><b>${esc(row.toll_name || 'Peaje')}</b><small>Peaje · ${esc(row.service_order_number || row.service_number || '—')}</small></td><td class="ob-it-date">${esc(dateParts(row.scheduled_for).day || '—')}</td><td class="ob-it-route"><span>${esc([row.road, row.direction].filter(Boolean).join(' · ') || '—')}</span></td><td class="ob-it-amount"><span class="ob-money">${esc(money(row.amount, row.currency))}</span></td></tr>`).join('')}${excesses.map(g => `<tr class="is-excess"><td><b>${esc(g.rows.map(r => r.concept_name || 'Adicional').join(' · '))}</b><small>Excedente · cobra la Prestadora · ${esc(orderCode(g.first))}</small></td><td class="ob-it-date">${esc(dateParts(g.first.scheduled_for).day || '—')}</td><td class="ob-it-route"><span>${esc(g.first.customer_name || g.first.vehicle_plate || '—')}</span></td><td class="ob-it-amount"><span class="ob-money">${esc(money(g.total, g.currency))}</span></td></tr>`).join('')}</tbody>
          </table></div>
        </section>
        <section class="ob-invoice-total">
          ${tolls.length || excesses.length ? `<dl class="ob-invoice-subtotals">${services.length ? `<div><dt>Servicios</dt><dd>${esc(money(subServicios, currency))}</dd></div>` : ''}${tolls.length ? `<div><dt>Peajes</dt><dd>${esc(money(subPeajes, currency))}</dd></div>` : ''}${excesses.length ? `<div><dt>Excedentes</dt><dd>${esc(money(subExcedentes, currency))}</dd></div>` : ''}</dl>` : ''}
          <div class="ob-invoice-total-row"><div><small>Total a facturar</small><b>${esc(money(selectedTotal(), currency))}</b></div><span>${esc(currency)}</span></div>
        </section>
       </div>
      </div>
      <footer class="ob-invoice-footer">
        <small>Al crear la factura, ${esc(includes)} ${selectedCount() === 1 ? 'quedará facturado' : 'quedarán facturados'} con importes congelados.</small>
        <div><button class="ob-button" type="button" data-ob="close-invoice" ${S.invoiceBusy ? 'disabled' : ''}>Cancelar</button><button class="ob-button success" type="button" data-ob="confirm-invoice" ${S.invoiceBusy ? 'disabled' : ''}>${S.invoiceBusy ? 'Creando factura…' : 'Crear factura'}</button></div>
      </footer>
    </section>`;
  }

  /* Particulares: tienen su propia pestaña; en Servicios quedan sólo las prestadoras. */
  const privIds = () => new Set((S.privRows || []).map(row => String(row.service_id)));
  const isPrivate = row => privIds().has(String(row.service_id)) || /^particulares$/i.test(String(row.company_name || '').trim());
  const serviceRows = () => S.rows.filter(row => !isPrivate(row));
  const MEDIO = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', mercado_pago: 'Mercado Pago', other: 'Otro' };
  const PAGA = { customer: 'Cliente', company: 'Prestadora', provider: 'Prestadora' };
  const ESTADO_FACT = { pending: 'Pendiente', reviewed: 'Pendiente', invoiced: 'Facturado', excluded: 'Excluido' };
  const ORIGEN = { administrative: 'Corrección administrativa', actual: 'Real del remito', planned: 'Planificado' };
  const COBRA = { provider: 'Prestadora', company: 'Empresa' };
  const collectorPill = row => {
    const key = isProviderExcess(row) ? 'provider' : 'company';
    return `<span class="ob-collector is-${key}" title="${key === 'provider' ? 'Lo cobra la Prestadora: se le factura' : 'Lo cobra la Empresa al cliente'}">${esc(COBRA[key])}</span>`;
  };
  function extraBillingState(row) {
    if (!isProviderExcess(row)) return '<span class="ob-state is-muted">Cobro al cliente</span><small>No se factura a la Prestadora</small>';
    if (row.invoice_number) return `<span class="ob-state is-done">Facturado</span><small>${esc(row.invoice_number)}</small>`;
    if (row.invoiceable === true) return '<span class="ob-state is-pending">Para facturar</span>';
    return '<span class="ob-state is-pending">Sin datos de facturación</span><small>Actualizá la base de Facturación</small>';
  }
  const IVA = { consumidor_final: 'Consumidor final', monotributo: 'Monotributo', responsable_inscripto: 'Responsable inscripto', exento: 'Exento' };

  /* ── Columnas: cada pestaña tiene su catálogo y cada usuario elige cuáles ve (table-columns-v1.js) ── */
  const kmText = value => `${num(value).toLocaleString('es-AR', { maximumFractionDigits: 1 })} km`;
  const stacked = (top, sub) => `<b>${esc(top)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`;
  const when = row => { const parts = dateParts(row.scheduled_for); return stacked(parts.day, parts.time); };
  const orderCode = row => row.service_order_number || row.service_number || '—';
  const paymentLabel = value => MEDIO[value] || (value === 'not_collected' ? 'No cobrado' : value) || '—';

  const COLUMN_DEFS = {
    services: [
      { key: 'order', label: 'Código', optional: true, td: row => `<b>${esc(orderCode(row))}</b>` },
      { key: 'datetime', label: 'Fecha/Hora', locked: true, td: row => `${when(row)}${row.pricing_error ? `<small class="ob-error">${esc(row.pricing_error)}</small>` : ''}` },
      { key: 'completed', label: 'Finalizado', optional: true, td: row => { const p = dateParts(row.completed_at); return row.completed_at ? stacked(p.day, p.time) : '<small>—</small>'; } },
      { key: 'company', label: 'Prestadora', td: row => `<b>${esc(row.company_name || '—')}</b>` },
      { key: 'base', label: 'Base', td: row => `<b>${esc(row.billing_base_name || '—')}</b>` },
      { key: 'type', label: 'Tipo de Servicio', td: row => `<b>${esc(row.service_name || '—')}</b><small class="ob-state is-pending">Pendiente</small>` },
      { key: 'origin', label: 'Origen', cls: 'ob-place', td: row => esc(row.origin || '—') },
      { key: 'destination', label: 'Destino', cls: 'ob-place', td: row => esc(row.destination || '—') },
      { key: 'client', label: 'Cliente', td: row => `<b>${esc(row.customer_name || '—')}</b>` },
      { key: 'plate', label: 'Patente', optional: true, td: row => esc(row.vehicle_plate || '—') },
      { key: 'vehicle', label: 'Vehículo', optional: true, td: row => esc(row.vehicle_make_model || '—') },
      { key: 'km', label: 'KM', cls: 'ob-km', td: row => esc(kmText(row.km)) },
      { key: 'kmsplit', label: 'Km asfalto / ripio', optional: true, cls: 'ob-km', td: row => (row.estimated_asphalt_km != null || row.estimated_gravel_km != null) ? esc(`${num(row.estimated_asphalt_km).toLocaleString('es-AR', { maximumFractionDigits: 1 })} / ${num(row.estimated_gravel_km).toLocaleString('es-AR', { maximumFractionDigits: 1 })} km`) : '<small>—</small>' },
      { key: 'amount', label: 'Importe a facturar', cls: 'ob-money-cell', td: row => `<b class="ob-money">${esc(money(row.current_company_amount, row.currency))}</b>` },
      { key: 'remito', label: 'Remito', optional: true, td: row => row.remito_id ? 'Con remito' : '<small>Sin remito</small>' }
    ],
    tolls: [
      { key: 'datetime', label: 'Fecha/Hora', locked: true, td: when },
      { key: 'company', label: 'Prestadora', td: row => `<b>${esc(row.company_name || '—')}</b>` },
      { key: 'service', label: 'Servicio', td: row => stacked(orderCode(row), row.vehicle_plate || '') },
      { key: 'toll', label: 'Peaje', td: row => stacked(row.toll_name || 'Peaje', row.source || '') },
      { key: 'route', label: 'Ruta', cls: 'ob-place', td: row => esc([row.road, row.direction].filter(Boolean).join(' · ') || `${row.origin || '—'} → ${row.destination || '—'}`) },
      { key: 'base', label: 'Base', td: row => `<b>${esc(row.billing_base_name || '—')}</b>` },
      { key: 'quantity', label: 'Cantidad', optional: true, td: row => esc(num(row.quantity || 1).toLocaleString('es-AR')) },
      { key: 'client', label: 'Cliente', optional: true, td: row => esc(row.customer_name || '—') },
      { key: 'payment', label: 'Medio de pago', optional: true, td: row => esc(paymentLabel(row.payment_method)) },
      { key: 'source', label: 'Origen del dato', optional: true, td: row => esc({ planned: 'Planificado', actual: 'Real', manual: 'Manual' }[row.source] || row.source || '—') },
      { key: 'crossed', label: 'Hora de pasada', optional: true, td: row => { if (!row.crossed_at) return '<small>—</small>'; const p = dateParts(row.crossed_at); return stacked(p.day, p.time); } },
      { key: 'amount', label: 'Importe', td: row => `<b class="ob-money">${esc(money(row.amount, row.currency))}</b>` },
      { key: 'status', label: 'Estado', td: () => '<span class="ob-state is-pending">Disponible</span><small>Peaje separado del servicio</small>' }
    ],
    extras: [
      { key: 'datetime', label: 'Fecha/Hora', locked: true, td: when },
      { key: 'service', label: 'Servicio', td: row => stacked(orderCode(row), row.vehicle_plate || '') },
      { key: 'company', label: 'Prestadora', td: row => stacked(row.company_name || '—', row.billing_base_name || '') },
      { key: 'concept', label: 'Adicional', td: row => stacked(row.concept_name || 'Adicional', ORIGEN[row.origin] || '') },
      { key: 'client', label: 'Cliente', optional: true, td: row => esc(row.customer_name || '—') },
      { key: 'quantity', label: 'Cant.', td: row => esc(num(row.quantity).toLocaleString('es-AR')) },
      { key: 'amount', label: 'Importe', cls: 'ob-money-cell', td: row => `<b class="ob-money">${esc(money(row.total_amount, row.currency))}</b>` },
      { key: 'collector', label: 'Cobra', td: collectorPill },
      { key: 'collect', label: 'Cobro', td: row => isProviderExcess(row) ? '<small>Se factura a la Prestadora</small>' : esc(paymentLabel(row.customer_payment_method)) },
      { key: 'payer', label: 'Paga', optional: true, td: row => esc(PAGA[row.payer_agent] || row.payer_agent || '—') },
      { key: 'billing', label: 'Facturación', td: extraBillingState }
    ],
    private: [
      { key: 'datetime', label: 'Fecha/Hora', locked: true, td: when },
      { key: 'service', label: 'Servicio', td: row => stacked(orderCode(row), row.service_name || '') },
      { key: 'client', label: 'Cliente', td: row => stacked(row.customer_name || '—', (!colsFor('private').has('driver') && row.driver_name) ? 'Chofer: ' + row.driver_name : '') },
      { key: 'driver', label: 'Chofer', optional: true, td: row => esc(row.driver_name || '—') },
      { key: 'document', label: 'DNI / CUIT', td: row => esc(row.customer_document || '—') },
      { key: 'invoice', label: 'Factura', td: row => row.invoice_requested ? stacked('Pide factura', IVA[row.customer_tax_condition] || row.customer_tax_condition || '') : '<small>No pide</small>' },
      { key: 'budget', label: 'Presupuesto', td: row => `<b class="ob-money">${esc(money(row.quoted_total, row.currency))}</b>` },
      { key: 'collect', label: 'Cobro', td: row => { const saldo = num(row.balance); const medios = (row.methods || []).map(m => MEDIO[m] || m).join(' · '); return `${saldo > 0 ? `<span class="ob-state is-pending">Saldo ${esc(money(saldo, row.currency))}</span>` : '<span class="ob-state">Pagado</span>'}<small>${esc(medios)}</small>`; } }
    ]
  };

  const COLUMN_SETS = {};
  function colsFor(tab) {
    const T = window.AuxiliosTableColumns;
    if (!COLUMN_SETS[tab] && T) COLUMN_SETS[tab] = T.create({ id: `facturacion.${tab}`, columns: COLUMN_DEFS[tab].map(({ key, label, locked, optional }) => ({ key, label, locked, optional })) });
    return COLUMN_SETS[tab] || { list: () => COLUMN_DEFS[tab].filter(c => !c.optional).map(c => c.key), has: key => COLUMN_DEFS[tab].some(c => c.key === key && !c.optional), open: () => {}, isCustom: () => false };
  }
  const visibleDefs = tab => colsFor(tab).list().map(key => COLUMN_DEFS[tab].find(c => c.key === key)).filter(Boolean);
  const headCells = tab => visibleDefs(tab).map(c => `<th data-col="${c.key}">${esc(c.label)}</th>`).join('');
  const bodyCells = (tab, row) => visibleDefs(tab).map(c => `<td data-col="${c.key}" data-label="${esc(c.label)}"${c.cls ? ` class="${c.cls}"` : ''}>${c.td(row)}</td>`).join('');

  function privateTableMarkup() {
    const rows = S.privRows || [];
    if (!rows.length) return '<div class="ob-empty">No hay servicios particulares pendientes de facturar con estos filtros.</div>';
    return `<div class="ob-table-wrap"><table class="ob-table"><thead><tr>${headCells('private')}<th class="ob-actions"></th></tr></thead><tbody>${rows.map(row => {
        const id = String(row.service_id);
        return `<tr data-billing-private="${esc(id)}" class="${S.selected.has(id) ? 'selected' : ''}">${bodyCells('private', row)}
          <td class="ob-actions ob-private-actions">${canInvoice() ? `<button class="ob-button primary" type="button" data-ob-private="invoice" data-service-id="${esc(id)}">Facturar</button><button class="ob-button" type="button" data-ob-private="no-invoice" data-service-id="${esc(id)}">Sin factura</button>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  const visibleExtraRows = () => (S.extraRows || []).filter(row => S.extraCollector === 'all'
    || (S.extraCollector === 'provider' ? isProviderExcess(row) : !isProviderExcess(row)));

  /* Resumen de Adicionales: qué falta facturar a la Prestadora, qué ya se facturó y qué cobra la Empresa. */
  function extraSummaryMarkup(rows, enter) {
    const all = S.extraRows || [];
    const cur = all[0]?.currency || 'ARS';
    const sum = list => list.reduce((t, r) => t + num(r.total_amount), 0);
    const pending = all.filter(excessInvoiceable);
    const invoiced = all.filter(r => isProviderExcess(r) && r.invoice_number);
    const company = all.filter(r => !isProviderExcess(r));
    const card = (cls, label, list, note) => `<article class="ob-kpi ${cls}"><small>${label}</small><b class="ob-money" data-ob-tween="${sum(list)}" data-ob-currency="${esc(cur)}">${esc(money(sum(list), cur))}</b><span>${note(list.length)}</span></article>`;
    const seg = (value, label, count) => `<button type="button" class="ob-seg-btn${S.extraCollector === value ? ' active' : ''}" data-ob-extra-filter="${value}" aria-pressed="${S.extraCollector === value}">${label}<span class="ob-tab-count">${count}</span></button>`;
    return `<div class="ob-extras-head${enter}">
      <div class="ob-kpis" role="group" aria-label="Resumen de adicionales">
        ${card('is-pending', 'Para facturar a la Prestadora', pending, n => plural(n, 'excedente', 'excedentes'))}
        ${card('is-done', 'Ya facturado a la Prestadora', invoiced, n => plural(n, 'excedente', 'excedentes'))}
        ${card('is-company', 'Cobra la Empresa al cliente', company, n => plural(n, 'adicional', 'adicionales'))}
      </div>
      <div class="ob-seg" role="group" aria-label="Quién cobra">
        ${seg('all', 'Todos', all.length)}${seg('provider', 'Cobra la Prestadora', all.filter(isProviderExcess).length)}${seg('company', 'Cobra la Empresa', company.length)}
      </div>
    </div>`;
  }

  function extraRowMarkup(row) {
    const id = String(row.service_id);
    const selectable = excessInvoiceable(row) && canInvoice();
    const checked = selectable && S.selectedExcesses.has(id);
    const check = selectable
      ? `<input type="checkbox" data-ob-excess-select="${esc(id)}" ${checked ? 'checked' : ''} aria-label="Facturar excedentes del servicio ${esc(orderCode(row))}">`
      : '';
    const cls = [checked ? 'selected' : '', isProviderExcess(row) ? 'is-provider' : 'is-company'].filter(Boolean).join(' ');
    return `<tr data-billing-extra="${esc(row.line_key || row.excess_charge_id)}" class="${cls}">
      <td class="ob-check">${check}</td>${bodyCells('extras', row)}</tr>`;
  }

  function extraTableMarkup() {
    const enter = S.extrasShown ? '' : ' is-entering';
    S.extrasShown = true;
    if (!(S.extraRows || []).length) return '<div class="ob-empty">No hay adicionales en los servicios finalizados de este período.</div>';
    const rows = visibleExtraRows();
    const head = extraSummaryMarkup(rows, enter);
    if (!rows.length) return `${head}<div class="ob-empty">No hay adicionales con este filtro.</div>`;
    const total = rows.reduce((t, r) => t + num(r.total_amount), 0);
    const defs = visibleDefs('extras');
    const groups = excessGroups(rows);
    const allSelected = groups.size > 0 && [...groups.keys()].every(id => S.selectedExcesses.has(id));
    const selectAll = groups.size && canInvoice()
      ? `<input type="checkbox" data-ob-excess-select-all ${allSelected ? 'checked' : ''} aria-label="Seleccionar todos los excedentes de la Prestadora">` : '';
    const foot = defs.map((c, i) => c.key === 'amount'
      ? `<td class="ob-money-cell" data-col="amount"><b class="ob-money" data-ob-tween="${total}" data-ob-currency="${esc(rows[0]?.currency || 'ARS')}">${esc(money(total, rows[0]?.currency || 'ARS'))}</b></td>`
      : i === 0 ? `<td><b>Total ${S.extraCollector === 'provider' ? 'que cobra la Prestadora' : S.extraCollector === 'company' ? 'que cobra la Empresa' : 'adicionales'}</b></td>` : '<td></td>').join('');
    return `${head}<div class="ob-table-wrap"><table class="ob-table ob-extras-table"><thead><tr><th class="ob-check">${selectAll}</th>${headCells('extras')}</tr></thead><tbody>${rows.map(extraRowMarkup).join('')}</tbody><tfoot><tr><td></td>${foot}</tr></tfoot></table></div>`;
  }

  function tableMarkup() {
    if (S.tab === 'tolls') return tollTableMarkup();
    if (S.tab === 'private') return privateTableMarkup();
    if (S.tab === 'extras') return extraTableMarkup();
    const rowsSrv = serviceRows();
    if (!rowsSrv.length) return '<div class="ob-empty">No hay servicios disponibles para facturar con estos filtros.</div>';
    const selectable = rowsSrv.filter(row => !row.pricing_error);
    const allSelected = selectable.length > 0 && selectable.every(row => S.selected.has(String(row.service_id)));
    return `<div class="ob-table-wrap"><table class="ob-table"><thead><tr>
      <th class="ob-check"><input type="checkbox" data-ob-select-all ${allSelected ? 'checked' : ''} aria-label="Seleccionar todos"></th>
      ${headCells('services')}<th class="ob-actions"></th>
      </tr></thead><tbody>${rowsSrv.map(rowMarkup).join('')}</tbody></table></div>`;
  }

  function rowMarkup(row) {
    const id = String(row.service_id);
    const checked = S.selected.has(id);
    const disabled = Boolean(row.pricing_error);
    return `<tr data-billing-service="${esc(id)}" class="${checked ? 'selected' : ''}">
      <td class="ob-check"><input type="checkbox" data-ob-select="${esc(id)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled title="Corregí el error tarifario antes de seleccionar"' : ''}></td>
      ${bodyCells('services', row)}
      <td class="ob-actions"><button class="ob-row-menu-trigger" type="button" data-ob-row-menu="${esc(id)}" aria-haspopup="menu" aria-expanded="false" title="Acciones del servicio" aria-label="Acciones del servicio">${ico('ellipsis')}</button></td>
    </tr>`;
  }

  function tollTableMarkup() {
    if (!S.tollRows.length) return '<div class="ob-empty">No hay peajes con facturación separada disponibles con estos filtros.</div>';
    const allSelected = S.tollRows.every(row => S.selectedTolls.has(String(row.service_toll_id)));
    return `<div class="ob-table-wrap"><table class="ob-table"><thead><tr>
      <th class="ob-check"><input type="checkbox" data-ob-toll-select-all ${allSelected ? 'checked' : ''} aria-label="Seleccionar todos"></th>
      ${headCells('tolls')}
      </tr></thead><tbody>${S.tollRows.map(tollRowMarkup).join('')}</tbody></table></div>`;
  }

  function tollRowMarkup(row) {
    const id = String(row.service_toll_id);
    const checked = S.selectedTolls.has(id);
    return `<tr data-billing-toll="${esc(id)}" class="${checked ? 'selected' : ''}">
      <td class="ob-check"><input type="checkbox" data-ob-toll-select="${esc(id)}" ${checked ? 'checked' : ''}></td>
      ${bodyCells('tolls', row)}
    </tr>`;
  }

  /* El desglose lo arma billing-breakdown-v1.js: el mismo que se ve en Facturas. */
  function componentMarkup(quote) {
    const bd = window.AuxiliosBillingBreakdown;
    return bd
      ? bd.tabla(quote, { currency: quote.currency, total: quote.current_company_amount })
      : '<div class="ob-empty">El desglose no está disponible.</div>';
  }

  const revisionLabel = value => value === 'invoiced' ? 'FACTURADO' : value === 'excluded' ? 'EXCLUIDO' : 'PENDIENTE';
  /* Revertir y Anular se resuelven desde la fila. Antes el menú abría el
     detalle completo —una RPC entera— sólo para mostrar el confirmar adentro:
     había que entrar al servicio para sacarlo. Las dos RPC piden nada más que
     el service_id, así que el confirmar se arma con lo que la fila ya tiene. */
  function rowById(id) {
    return S.rows.find(item => String(item.service_id) === String(id)) || {};
  }

  function noInvoiceMarkup() {
    const { id, busy } = S.rowAction;
    const row = (S.privRows || []).find(item => String(item.service_id) === String(id)) || {};
    return `<section role="dialog" aria-modal="true" aria-labelledby="ob-confirm-title" class="ob-confirm-modal">
      <header class="ob-invoice-head">
        <div><small>Facturación · Particulares</small><h3 id="ob-confirm-title">Cerrar sin factura</h3><p>${row.invoice_requested ? 'El cliente pidió factura. Indicá por qué se cierra sin facturar.' : 'El servicio sale de Facturación sin emitir factura. Queda auditado.'}</p></div>
        <button class="ob-button" type="button" data-ob="cancel-action" ${busy ? 'disabled' : ''}>${ico('x')}Cerrar</button>
      </header>
      <div class="ob-confirm-body">
        <div class="ob-confirm-service">
          <article><small>Servicio</small><b>${esc(row.service_order_number || row.service_number || '—')}</b></article>
          <article><small>Cliente</small><b>${esc(row.customer_name || '—')}</b></article>
          <article><small>Importe</small><b>${esc(money(row.quoted_total, row.currency))}</b></article>
        </div>
        <label class="ob-field ob-sin-factura-nota"><small>Motivo${row.invoice_requested ? ' *' : ' (opcional)'}</small><textarea data-ob-sin-factura-nota rows="2" placeholder="Ej.: consumidor final, no pidió factura">${esc(S.rowAction.reason || '')}</textarea></label>
      </div>
      <footer class="ob-invoice-footer">
        <small>No se puede deshacer desde Facturación.</small>
        <div><button class="ob-button" type="button" data-ob="cancel-action" ${busy ? 'disabled' : ''}>Cancelar</button><button class="ob-button primary" type="button" data-ob="confirm-action" ${busy ? 'disabled' : ''}>${busy ? 'Procesando…' : 'Cerrar sin factura'}</button></div>
      </footer>
    </section>`;
  }

  function confirmActionMarkup() {
    if (S.rowAction.type === 'no-invoice') return noInvoiceMarkup();
    const { id, type, busy } = S.rowAction;
    const row = rowById(id);
    const annul = type === 'annul';
    const parts = dateParts(row.scheduled_for);
    const copy = annul
      ? 'El servicio pasará a ANULADO, saldrá de Facturación y quedará en Servicios → Historial. La acción queda auditada automáticamente.'
      : 'El servicio saldrá de Facturación y conservará FINALIZADO en Servicios → Historial. La acción queda auditada automáticamente.';
    return `<section role="dialog" aria-modal="true" aria-labelledby="ob-confirm-title" class="ob-confirm-modal${annul ? ' danger' : ''}">
      <header class="ob-invoice-head">
        <div><small>Facturación</small><h3 id="ob-confirm-title">${annul ? 'Anular servicio FINALIZADO' : 'Revertir Facturación'}</h3><p>${esc(copy)}</p></div>
        <button class="ob-button" type="button" data-ob="cancel-action" ${busy ? 'disabled' : ''}>${ico('x')}Cerrar</button>
      </header>
      <div class="ob-confirm-body">
        <div class="ob-confirm-service">
          <article><small>Servicio</small><b>${esc(row.service_order_number || row.service_number || '—')}</b></article>
          <article><small>Fecha</small><b>${esc(parts.day || '—')} ${esc(parts.time || '')}</b></article>
          <article><small>Prestadora</small><b>${esc(row.company_name || '—')}</b></article>
          <article><small>Base</small><b>${esc(row.billing_base_name || '—')}</b></article>
          <article><small>Cliente</small><b>${esc(row.customer_name || '—')}</b></article>
          <article><small>Importe</small><b>${esc(money(row.current_company_amount, row.currency))}</b></article>
        </div>
      </div>
      <footer class="ob-invoice-footer">
        <small>${annul ? 'El servicio deja de ser facturable.' : 'Se puede volver a enviar a Facturación.'}</small>
        <div><button class="ob-button" type="button" data-ob="cancel-action" ${busy ? 'disabled' : ''}>Cancelar</button><button class="ob-button ${annul ? 'danger' : 'primary'}" type="button" data-ob="confirm-action" ${busy ? 'disabled' : ''}>${busy ? 'Procesando…' : (annul ? 'Anular servicio' : 'Revertir Facturación')}</button></div>
      </footer>
    </section>`;
  }

  const BD = () => window.AuxiliosBillingBreakdown || null;

  function revisionTimeline(rows, currency) {
    if (!rows?.length) return '<div class="ob-empty">Todavía no hay movimientos de Facturación.</div>';
    return `<ol class="ob-timeline">${rows.map(row => {
      const before = row.previous_company_amount;
      const change = before != null && Math.abs(num(row.company_amount) - num(before)) > .009
        ? `<small>Antes ${esc(money(before, row.currency || currency))}</small>` : '';
      return `<li><span class="ob-tl-dot" aria-hidden="true"></span><div><b>${esc(ESTADO_FACT[row.billing_status] || revisionLabel(row.billing_status))} · ${esc(money(row.company_amount, row.currency || currency))}</b>${change}<small>${esc(row.created_by_name || 'Usuario')} · ${esc(date(row.created_at))}</small>${row.reason ? `<p>${esc(row.reason)}</p>` : ''}</div></li>`;
    }).join('')}</ol>`;
  }

  function detailMarkup() {
    const detail = S.detail;
    const service = detail.service || {};
    const quote = detail.current_quote || {};
    const cur = quote.currency;
    const delta = num(quote.billing_delta);
    const changed = Math.abs(delta) > .009;
    const separateTolls = quote.toll_billing_mode === 'separate' && num(quote.separate_toll_amount) > 0;
    const km = BD()?.kilometros(quote, service) || {};
    const kmLine = [
      km.asfalto ? `Asfalto ${esc(num(km.asfalto).toLocaleString('es-AR', { maximumFractionDigits: 1 }))} km` : '',
      km.ripio ? `Ripio ${esc(num(km.ripio).toLocaleString('es-AR', { maximumFractionDigits: 1 }))} km` : '',
      km.radio != null ? `Radio cubierto ${esc(km.radio)} km` : '',
      km.facturable != null ? `<b>Facturable ${esc(num(km.facturable).toLocaleString('es-AR', { maximumFractionDigits: 1 }))} km</b>` : ''
    ].filter(Boolean).join(' · ');
    const vehicle = [service.vehicle_make_model, service.vehicle_plate].filter(Boolean).join(' · ');
    const remito = service.remito_id && window.RemitoPanel?.open
      ? `<button class="ob-button" type="button" data-ob="open-remito" data-remito-id="${esc(service.remito_id)}">${ico('file-text')}Ver remito</button>` : '';
    const table = componentMarkup(quote);
    return `<aside class="ob-detail"><div class="ob-detail-head"><div><small>Facturación · Pendiente</small><h3>${esc(service.service_order_number || service.service_number || 'Servicio')}</h3></div><div class="ob-detail-actions">${remito}<button class="ob-button" type="button" data-ob="close-detail">${ico('x')}Cerrar</button></div></div><div class="ob-detail-body">
      <section class="ob-hero${changed ? ' has-change' : ''}"><small>Importe a facturar</small><b class="ob-money">${esc(money(quote.current_company_amount, cur))}</b>
        ${changed ? `<div class="ob-hero-change">${ico('triangle-alert')}<span>La tarifa cambió desde el cierre: al cierre era <b>${esc(money(quote.stored_company_amount, cur))}</b> (${delta > 0 ? '+' : '−'}${esc(money(Math.abs(delta), cur))}). Revisá la diferencia antes de facturar.</span></div>` : `<small class="ob-hero-ok">Coincide con el importe al cierre.</small>`}
        ${separateTolls ? `<small>Más ${esc(money(quote.separate_toll_amount, cur))} de peajes que se facturan por separado.</small>` : ''}
      </section>
      <section class="ob-section ob-ficha"><h4>Servicio</h4>
        <div class="ob-route"><div><small>Origen</small><b>${esc(service.origin || '—')}</b></div><span class="ob-route-arrow" aria-hidden="true">${ico('chevron-right')}</span><div><small>Destino</small><b>${esc(service.destination || '—')}</b></div></div>
        ${kmLine ? `<p class="ob-km-line">${kmLine}</p>` : ''}
        <div class="ob-grid"><div class="ob-field"><small>Fecha del servicio</small><b>${esc(date(service.scheduled_for))}</b></div><div class="ob-field"><small>Finalizado</small><b>${esc(date(service.completed_at))}</b></div><div class="ob-field"><small>Prestadora</small><b>${esc(service.company_name || '—')}</b></div><div class="ob-field"><small>Base</small><b>${esc(service.billing_base_name || '—')}</b></div><div class="ob-field"><small>Tipo</small><b>${esc(service.service_name || '—')}</b></div><div class="ob-field"><small>Cliente</small><b>${esc(service.customer_name || '—')}</b></div><div class="ob-field"><small>Vehículo</small><b>${esc(vehicle || '—')}</b></div></div>
        ${service.operator_notes ? `<div class="ob-note"><small>Notas del operador</small><p>${esc(service.operator_notes)}</p></div>` : ''}
      </section>
      <section class="ob-section"><h4>Desglose de costos</h4>${table}
        <p class="ob-tariff">${ico('file-check')}<span>${esc(quote.rate_card_name || 'Sin tarifario')}${quote.rate_card_version ? ` · v${esc(quote.rate_card_version)}` : ''}${quote.contract_name ? ` · Contrato ${esc(quote.contract_name)}` : ''}</span></p>
        ${changed ? `<div class="ob-compare"><div><small>Al cierre</small><b class="ob-money">${esc(money(quote.stored_company_amount, cur))}</b></div><div><small>Con la tarifa de hoy</small><b class="ob-money">${esc(money(quote.current_company_amount, cur))}</b></div><div class="${delta > 0 ? 'is-up' : 'is-down'}"><small>Diferencia</small><b class="ob-money">${delta > 0 ? '+' : '−'}${esc(money(Math.abs(delta), cur))}</b></div></div>` : ''}
      </section>
      <section class="ob-section"><h4>Historial de Facturación</h4>${revisionTimeline(detail.revisions, cur)}</section>
    </div></aside>`;
  }

  /* Cada render redibuja la mesa entera: se conserva el scroll de la tabla y el foco del
     control que se usó, así tildar una fila no te manda al principio. */
  function captureView(screen) {
    const wrap = screen.querySelector('.ob-table-wrap');
    const active = document.activeElement;
    const key = active && screen.contains(active)
      ? ['data-ob-select', 'data-ob-toll-select', 'data-ob-excess-select', 'data-ob-extra-filter', 'data-ob-tab', 'data-ob']
        .map(name => active.hasAttribute(name) ? `[${name}="${CSS.escape(active.getAttribute(name))}"]` : '').find(Boolean)
      : '';
    return { top: wrap?.scrollTop || 0, left: wrap?.scrollLeft || 0, focus: key || '', tab: S.tab };
  }
  function restoreView(screen, view) {
    if (!view) return;
    const wrap = screen.querySelector('.ob-table-wrap');
    if (wrap && view.tab === S.tab) { wrap.scrollTop = view.top; wrap.scrollLeft = view.left; }
    if (view.focus) screen.querySelector(view.focus)?.focus({ preventScroll: true });
  }

  /* Montos que cambian (selección, resumen) se deslizan del valor anterior al nuevo.
     Con movimiento reducido se muestran directo. */
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const tweenMemory = new Map();
  function tweenAmounts(screen) {
    screen.querySelectorAll('[data-ob-tween]').forEach((el, index) => {
      const key = el.closest('[data-ob-tween-key]')?.dataset.obTweenKey || `${S.tab}:${index}`;
      const to = num(el.dataset.obTween), from = tweenMemory.has(key) ? tweenMemory.get(key) : 0;
      tweenMemory.set(key, to);
      if (reducedMotion() || from === to || typeof requestAnimationFrame !== 'function') return;
      const cur = el.dataset.obCurrency || 'ARS', start = performance.now(), dur = 520;
      const frame = now => {
        if (!el.isConnected) return;
        const p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
        el.textContent = money(from + (to - from) * e, cur);
        if (p < 1) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  const tabButton = (key, label, count, picked) => `<button class="ob-tab ${S.tab === key ? 'active' : ''}" type="button" data-ob-tab="${key}">${label}${count ? ` <span class="ob-tab-count">${count}</span>` : ''}${picked ? `<span class="ob-tab-picked" title="${picked} seleccionados">${picked}</span>` : ''}</button>`;

  function render() {
    const screen = ensureShell();
    if (!screen) return;
    const view = screen.firstElementChild ? captureView(screen) : null;
    if (S.renderedTab !== S.tab) { S.extrasShown = false; S.tabChanged = Boolean(S.renderedTab); S.renderedTab = S.tab; }
    if (!S.invoiceOpen) S.invoiceShown = false;
    closeRowActionMenu();
    window.AuxFilters?.bind(screen, onFilterChange, clearFilters);
    document.querySelector('.topbar-right #obx-wrap')?.remove();
    // Servicios: aparece al tildar servicios. Peajes: siempre que haya peajes con estos filtros.
    const excelControl = (S.tab === 'tolls' ? (S.tollRows || []).length : S.selected.size)
      ? `<div id="obx-wrap" class="obx-wrap"><button type="button" class="obx-trigger" id="obx-trigger" aria-haspopup="menu" aria-expanded="false" data-ob="excel-toggle">${ico('download')}Excel</button></div>`
      : '';
    const overlayOpen = S.invoiceOpen || S.rowAction || S.detail || S.detailLoading;
    const overlay = S.rowAction
      ? confirmActionMarkup()
      : S.invoiceOpen
        ? invoiceModalMarkup()
        : S.detailLoading
          ? '<aside class="ob-detail"><div class="ob-empty">Calculando detalle de facturación…</div></aside>'
          : S.detail ? detailMarkup() : '';
    // Centrado para la factura y para el confirmar; el detalle va pegado a la
    // derecha, que es de donde sale.
    const backdropClass = S.invoiceOpen ? ' ob-invoice-backdrop' : S.rowAction ? ' ob-confirm-backdrop' : '';
    screen.innerHTML = `<div class="ob-shell">
      <div class="ob-toolbar"><div class="ob-tabs" role="tablist" aria-label="Qué facturar">${tabButton('services', 'Servicios', serviceRows().length, S.tab === 'services' ? 0 : S.selected.size)}${tabButton('tolls', 'Peajes', S.tollRows.length, S.tab === 'tolls' ? 0 : S.selectedTolls.size)}${tabButton('extras', 'Adicionales', (S.extraRows || []).length, S.tab === 'extras' ? 0 : S.selectedExcesses.size)}${tabButton('private', 'Particulares', (S.privRows || []).length, 0)}</div>
      <div class="ob-filters auxf-bar">${filtersMarkup()}<button class="ob-button ob-columns${colsFor(S.tab).isCustom() ? ' is-custom' : ''}" type="button" data-ob="columns" title="Columnas" aria-label="Columnas">${ico('sliders-horizontal')}Columnas</button>${excelControl}<button class="ob-button ob-filter-action" type="button" data-ob="refresh" title="Actualizar" aria-label="Actualizar">${ico('refresh-cw')}Actualizar</button></div></div>
      ${selectionMarkup()}<div class="ob-table-card${S.tabChanged ? ' is-switching' : ''}">${S.loading ? '<div class="ob-empty ob-loading"><span class="ob-spinner" aria-hidden="true"></span>Actualizando Facturación…</div>' : tableMarkup()}</div>
      <div id="ob-detail-backdrop" class="ob-detail-backdrop${backdropClass}" ${overlayOpen ? '' : 'hidden'}>${overlay}</div>
    </div>`;
    S.tabChanged = false;
    restoreView(screen, view);
    tweenAmounts(screen);
  }

  /* Adicionales v2 trae quién cobra y el estado de facturación de cada excedente, sin
     duplicar planificado y real. Si la base todavía no tiene la v2, se usa la v1 (sólo lectura). */
  async function loadExtras(params) {
    const v2 = await db().rpc('list_operator_billing_extras_v2', params);
    if (!v2.error) return v2;
    const v1 = await db().rpc('list_operator_billing_extras_v1', params);
    if (v1.error || !Array.isArray(v1.data)) return v1;
    return { data: v1.data.map(row => ({ ...row, line_key: row.excess_charge_id, invoiceable: false })), error: null };
  }

  async function load() {
    if (S.loading || !db() || !canRead()) return;
    S.loading = true;
    render();
    const bounds = window.AuxFilters ? window.AuxFilters.periodBounds(S.periodSel) : periodBounds(S.period);
    try {
      const [services, tolls, privs, extras] = await Promise.all([
        db().rpc('list_operator_billing_services_v3_km_v1', { p_search: S.search || null, p_company_id: S.company || null, p_period_start: bounds.start, p_period_end: bounds.end }),
        db().rpc('list_operator_billing_tolls_v2', { p_search: S.search || null, p_company_id: S.company || null, p_period_start: bounds.start, p_period_end: bounds.end }),
        db().rpc('list_operator_billing_private_v1_km_v1', { p_search: S.search || null, p_period_start: bounds.start, p_period_end: bounds.end }),
        loadExtras({ p_search: S.search || null, p_company_id: S.company || null, p_period_start: bounds.start, p_period_end: bounds.end })
      ]);
      if (services.error) throw services.error;
      if (tolls.error) throw tolls.error;
      S.allRows = Array.isArray(services.data?.rows) ? services.data.rows : [];
      S.filters = {
        companies: (Array.isArray(services.data?.filters?.companies) ? services.data.filters.companies : []).filter(c => !(c && (c.client_kind === 'particular' || /^particulares$/i.test(String(c.company_name || c.trade_name || '').trim())))),   // "Particulares" no es una prestadora
        periods: Array.isArray(services.data?.filters?.periods) ? services.data.filters.periods : []
      };
      S.allTollRows = Array.isArray(tolls.data?.rows) ? tolls.data.rows : [];
      // Particulares y Adicionales: si su consulta falla, el resto de Facturación sigue.
      S.privRows = !privs.error && Array.isArray(privs.data) ? privs.data : [];
      S.allExtraRows = !extras.error && Array.isArray(extras.data) ? extras.data : [];
      S.tollTotal = num(tolls.data?.total_amount);
      applyLocalFilters();
    } catch (error) {
      notify(error.message || 'No se pudo cargar Facturación', 'error');
      S.rows = [];
      S.tollRows = [];
      S.allRows = [];
      S.allTollRows = [];
      S.tollTotal = 0;
      clearSelection();
    } finally {
      S.loading = false;
      render();
    }
  }

  async function openDetail(id) {
    if (!id || S.detailLoading) return;
    S.invoiceOpen = false;
    S.detail = null;
    S.detailLoading = true;
    S.rowAction = null;
    render();
    try {
      const { data, error } = await db().rpc('get_operator_billing_service_detail_v4_km_v1', { p_service_id: id });
      if (error) throw error;
      S.detail = data;
    } catch (error) {
      notify(error.message || 'No se pudo abrir el detalle', 'error');
      S.detail = null;
    } finally {
      S.detailLoading = false;
      render();
    }
  }

  function openRowAction(id, type) {
    if (type === 'annul' && !canCorrect()) return notify('Sin permiso para anular', 'error');
    if (type === 'revert' && !canRevert()) return notify('Sin permiso para revertir Facturación', 'error');
    if (!rowById(id).service_id) return notify('Ese servicio ya no está en la mesa de Facturación', 'warning');
    S.rowAction = { id: String(id), type: type, busy: false };
    render();
  }

  function closeDetail() {
    S.detail = null;
    S.detailLoading = false;
    render();
  }

  function toggleSelection(id, on) {
    const row = S.rows.find(item => String(item.service_id) === String(id));
    if (!row || row.pricing_error || S.invoiceBusy) return;
    if (on) S.selected.add(String(id)); else S.selected.delete(String(id));
    render();
  }

  function toggleAll(on) {
    if (S.invoiceBusy) return;
    const rows = serviceRows().filter(row => !row.pricing_error);
    if (on) rows.forEach(row => S.selected.add(String(row.service_id)));
    else rows.forEach(row => S.selected.delete(String(row.service_id)));
    render();
  }

  function toggleTollSelection(id, on) {
    const row = S.tollRows.find(item => String(item.service_toll_id) === String(id));
    if (!row || row.invoiceable === false || S.invoiceBusy) return;
    if (on) S.selectedTolls.add(String(id)); else S.selectedTolls.delete(String(id));
    render();
  }

  function toggleAllTolls(on) {
    if (S.invoiceBusy) return;
    if (on) S.tollRows.forEach(row => S.selectedTolls.add(String(row.service_toll_id)));
    else S.tollRows.forEach(row => S.selectedTolls.delete(String(row.service_toll_id)));
    render();
  }

  function toggleExcessSelection(id, on) {
    if (S.invoiceBusy || !canInvoice() || !excessGroups().has(String(id))) return;
    if (on) S.selectedExcesses.add(String(id)); else S.selectedExcesses.delete(String(id));
    render();
  }

  function toggleAllExcesses(on) {
    if (S.invoiceBusy || !canInvoice()) return;
    for (const id of excessGroups(visibleExtraRows()).keys()) on ? S.selectedExcesses.add(id) : S.selectedExcesses.delete(id);
    render();
  }

  function addRelatedExcesses() {
    const related = relatedPendingExcesses();
    if (!related.length || S.invoiceBusy) return;
    related.forEach(g => S.selectedExcesses.add(g.service_id));
    notify(`${plural(related.length, 'excedente sumado', 'excedentes sumados')} a la factura`, 'success');
    render();
  }

  function validateSelection() {
    const services = selectedRows();
    const tolls = selectedTollRows();
    if (!services.length && !tolls.length && !S.selectedExcesses.size) return 'Seleccioná al menos un servicio, peaje o excedente';
    if (selectedExcessGroups().length !== S.selectedExcesses.size) return 'La selección contiene excedentes que ya no están disponibles para facturar';
    if (!services.every(row => ['pending', 'reviewed'].includes(row.billing_status))) return 'La selección contiene servicios que ya no están disponibles para facturar';
    if (services.some(row => row.pricing_error)) return 'Corregí los errores tarifarios antes de facturar';
    if (tolls.some(row => row.invoiceable === false)) return 'La selección contiene peajes que ya no están disponibles para facturar';
    if (selectedCompanies().size !== 1) return 'Para facturar, seleccioná conceptos de una sola prestadora';
    if (selectedCurrencies().size !== 1) return 'Para facturar, seleccioná conceptos de una sola moneda';
    return '';
  }

  function openInvoice() {
    if (!canInvoice() || S.invoiceBusy) return;
    const error = validateSelection();
    if (error) return notify(error, 'warning');
    S.detail = null;
    S.rowAction = null;
    S.invoiceForm = freshInvoiceForm();
    S.invoiceOpen = true;
    render();
  }

  function closeInvoice() {
    if (S.invoiceBusy) return;
    S.invoiceOpen = false;
    S.invoiceForm = null;
    render();
  }

  function validateInvoiceForm() {
    const form = S.invoiceForm || {};
    if (!['FA', 'FB', 'FC'].includes(form.document_type)) return 'Tipo de comprobante inválido';
    if (!/^\d+$/.test(String(form.point_of_sale || ''))) return 'Ingresá el punto de venta usando sólo números';
    if (!/^\d+$/.test(String(form.document_number || ''))) return 'Ingresá el número de factura usando sólo números';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(form.issued_on || ''))) return 'Ingresá una fecha de emisión válida';
    return '';
  }

  async function createInvoice() {
    if (!canInvoice() || S.invoiceBusy) return;
    if (!S.invoiceOpen) return openInvoice();
    const selectionError = validateSelection();
    if (selectionError) return notify(`${selectionError}. Actualizá Facturación e intentá nuevamente`, 'warning');
    const formError = validateInvoiceForm();
    if (formError) return notify(formError, 'warning');

    const serviceIds = selectedRows().map(row => String(row.service_id));
    const tollIds = selectedTollRows().map(row => String(row.service_toll_id));
    const excessIds = selectedExcessGroups().map(g => g.service_id);
    const form = S.invoiceForm;
    S.invoiceBusy = true;
    render();
    try {
      const payload = {
        p_service_ids: serviceIds,
        p_service_toll_ids: tollIds,
        p_document_type: form.document_type,
        p_point_of_sale: form.point_of_sale.trim(),
        p_document_number: form.document_number.trim(),
        p_issued_on: form.issued_on,
        p_notes: form.notes.trim() || null
      };
      // Con excedentes de la Prestadora se usa la v5; sin ellos, la factura de siempre.
      const { data, error } = excessIds.length
        ? await db().rpc('create_operator_invoice_v5_km_v1', { ...payload, p_excess_service_ids: excessIds })
        : await db().rpc('create_operator_invoice_v4_km_v1', payload);
      if (error) throw error;
      S.invoiceOpen = false;
      S.invoiceForm = null;
      clearSelection();
      const created = [
        `${data?.service_count || 0} servicios`, `${data?.toll_count || 0} peajes`,
        data?.excess_count ? `${data.excess_count} excedentes` : ''
      ].filter(Boolean).join(' · ');
      notify(`${data?.invoice_number || 'Factura'} creada · ${created}`, 'success');
      await load();
      if (window.OperatorInvoices?.open) window.OperatorInvoices.open(data?.invoice_id || null);
    } catch (error) {
      notify(error.message || 'No se pudo crear la factura', 'error');
    } finally {
      S.invoiceBusy = false;
      render();
    }
  }

  async function confirmAdminAction() {
    if (!S.rowAction || S.rowAction.busy) return;
    const { id, type } = S.rowAction;
    const label = rowById(id).service_order_number || rowById(id).service_number || 'El servicio';
    if (type === 'no-invoice') {
      const reason = (document.querySelector('[data-ob-sin-factura-nota]')?.value || '').trim();
      S.rowAction.reason = reason;
      S.rowAction.busy = true;
      render();
      try {
        const { error } = await db().rpc('close_private_billing_without_invoice_v1', { p_service_id: id, p_reason: reason || null });
        if (error) throw error;
        S.rowAction = null;
        clearSelection();
        await load();
        confirmar('Cerrado sin factura', `${label} salió de Facturación.`);
      } catch (error) {
        if (S.rowAction) S.rowAction.busy = false;
        notify(error.message || 'No se pudo cerrar sin factura', 'error');
        render();
      }
      return;
    }
    S.rowAction.busy = true;
    render();
    try {
      const rpc = type === 'annul' ? 'annul_operator_billing_service_v2' : 'revert_operator_billing_service_v2';
      const { error } = await db().rpc(rpc, { p_service_id: id, p_reason: null });
      if (error) throw error;
      S.rowAction = null;
      S.detail = null;
      clearSelection();
      await load();
      // Se queda en Facturación: la acción se disparó desde una fila de esta
      // mesa, y mandarlo a Operaciones lo sacaba de donde estaba trabajando.
      confirmar(
        type === 'annul' ? 'Servicio anulado' : 'Facturación revertida',
        `${label} salió de Facturación y queda en Servicios → Historial.`
      );
    } catch (error) {
      if (S.rowAction) S.rowAction.busy = false;
      notify(error.message || 'No se pudo completar la acción', 'error');
      render();
    }
  }

  function editServiceById(id) {
    if (!id || !canCorrect()) return;
    if (typeof window.editarServicioFacturacion !== 'function') return notify('El editor de Servicios todavía se está cargando', 'warning');
    window.editarServicioFacturacion(id);
  }

  function handleRowAction(action, id) {
    if (action === 'view') return openDetail(id);
    if (action === 'edit') return editServiceById(id);
    if (action === 'revert') return openRowAction(id, 'revert');
    if (action === 'annul') return openRowAction(id, 'annul');
  }

  function clearAndLoad() {
    clearSelection();
    S.invoiceOpen = false;
    S.invoiceForm = null;
    return load();
  }

  function onInput(event) {
    const invoiceField = event.target.dataset?.obInvoiceField;
    if (invoiceField) {
      if (!S.invoiceForm) S.invoiceForm = freshInvoiceForm();
      if (['point_of_sale', 'document_number'].includes(invoiceField)) {
        const digits = event.target.value.replace(/\D/g, '');
        event.target.value = digits;
        S.invoiceForm[invoiceField] = digits;
      } else S.invoiceForm[invoiceField] = event.target.value;
      return;
    }
    if (event.target.id !== 'ob-search') return;
    S.search = event.target.value;
    clearTimeout(S.searchTimer);
    S.searchTimer = setTimeout(clearAndLoad, 300);
  }

  function onChange(event) {
    const invoiceField = event.target.dataset?.obInvoiceField;
    if (invoiceField) {
      if (!S.invoiceForm) S.invoiceForm = freshInvoiceForm();
      S.invoiceForm[invoiceField] = event.target.value;
      return;
    }
    if (event.target.id === 'ob-company-filter') { S.company = event.target.value || ''; return clearAndLoad(); }
    if (event.target.id === 'ob-period-filter') { S.period = event.target.value || ''; return clearAndLoad(); }
    if (event.target.matches('[data-ob-select]')) return toggleSelection(event.target.dataset.obSelect, event.target.checked);
    if (event.target.matches('[data-ob-select-all]')) return toggleAll(event.target.checked);
    if (event.target.matches('[data-ob-toll-select]')) return toggleTollSelection(event.target.dataset.obTollSelect, event.target.checked);
    if (event.target.matches('[data-ob-toll-select-all]')) return toggleAllTolls(event.target.checked);
    if (event.target.matches('[data-ob-excess-select]')) return toggleExcessSelection(event.target.dataset.obExcessSelect, event.target.checked);
    if (event.target.matches('[data-ob-excess-select-all]')) return toggleAllExcesses(event.target.checked);
  }

  function onClick(event) {
    const rowMenu = event.target.closest('[data-ob-row-menu]');
    if (rowMenu) {
      event.stopPropagation();
      return toggleRowActionMenu(rowMenu, rowMenu.dataset.obRowMenu);
    }

    const excelAction = event.target.closest('[data-ob^="excel-"]')?.dataset.ob;
    if (excelAction) {
      const wrap = document.getElementById('obx-wrap');
      const trigger = document.getElementById('obx-trigger');
      const menu = wrap?.querySelector('.obx-menu');
      if (excelAction === 'excel-toggle') {
        if (menu) { menu.remove(); trigger?.setAttribute('aria-expanded', 'false'); }
        else { wrap?.insertAdjacentHTML('beforeend', excelMenuMarkup()); trigger?.setAttribute('aria-expanded', 'true'); }
        return;
      }
      menu?.remove();
      trigger?.setAttribute('aria-expanded', 'false');
      if (excelAction === 'excel-current') return window.OperatorBillingExcel?.exportCurrent?.();
      if (excelAction === 'excel-selected') return window.OperatorBillingExcel?.exportSelected?.();
      if (excelAction === 'excel-all') return window.OperatorBillingExcel?.exportAllFiltered?.();
      return;
    }

    const priv = event.target.closest('[data-ob-private]');
    if (priv) {
      const id = priv.dataset.serviceId;
      if (priv.dataset.obPrivate === 'invoice') {
        // Una factura por cliente: se factura de a un servicio particular.
        clearSelection();
        if (S.rows.some(row => String(row.service_id) === String(id))) S.selected.add(String(id));
        else return notify('Actualizá Facturación: el servicio no está en la lista.', 'warning');
        return openInvoice();
      }
      S.rowAction = { id, type: 'no-invoice', busy: false, reason: '' };
      return render();
    }

    const tab = event.target.closest('[data-ob-tab]');
    if (tab) {
      // La selección se conserva entre pestañas: una factura junta servicios, peajes y excedentes.
      // Particulares se factura de a uno, así que entrar ahí sí la limpia.
      if (S.tab !== tab.dataset.obTab && tab.dataset.obTab === 'private') clearSelection();
      S.tab = tab.dataset.obTab;
      S.invoiceOpen = false;
      return render();
    }

    const extraFilter = event.target.closest('[data-ob-extra-filter]');
    if (extraFilter) { S.extraCollector = extraFilter.dataset.obExtraFilter || 'all'; return render(); }

    const action = event.target.closest('[data-ob]')?.dataset.ob;
    if (!action) return;
    if (action === 'add-related-excess') return addRelatedExcesses();
    if (action === 'refresh') return clearAndLoad();
    if (action === 'clear-selection') { clearSelection(); return render(); }
    if (action === 'invoice-selection') return openInvoice();
    if (action === 'close-invoice') return closeInvoice();
    if (action === 'confirm-invoice') return createInvoice();
    if (action === 'columns') return colsFor(S.tab).open(() => render());
    if (action === 'close-detail') return closeDetail();
    if (action === 'open-remito') { const id = Number(event.target.closest('[data-remito-id]')?.dataset.remitoId); if (id && window.RemitoPanel?.open) window.RemitoPanel.open(id); return; }
    if (action === 'cancel-action') { if (S.rowAction?.busy) return; S.rowAction = null; return render(); }
    if (action === 'confirm-action') return confirmAdminAction();
  }

  function onDocumentClick(event) {
    const action = event.target.closest('[data-ob-row-action]');
    if (action) {
      event.preventDefault();
      const type = action.dataset.obRowAction;
      const id = action.dataset.serviceId;
      closeRowActionMenu();
      return handleRowAction(type, id);
    }
    if (!event.target.closest('[data-ob-row-menu]') && !event.target.closest('#ob-row-action-menu')) closeRowActionMenu();
  }

  function init() {
    ensureShell();
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('scroll', closeRowActionMenu, true);
    window.addEventListener('resize', closeRowActionMenu);
    let attempts = 0;
    const timer = setInterval(() => {
      const nav = document.getElementById('nav-facturacion');
      if (nav) nav.style.display = canRead() ? '' : 'none';
      if (canRead() && db()) clearInterval(timer);
      else if (++attempts > 120) clearInterval(timer);
    }, 100);
  }

  Object.assign(B, {
    open, load, render, openDetail, clearSelection, canRead, canInvoice, canCorrect,
    openInvoice, createInvoice, selectedRows, selectedTollRows, selectedExcessGroups,
    _test: { excessGroups, extraBillingState, collectorPill, joinParts, selectionParts }
  });
  Object.assign(window, { abrirFacturacionOperador: open, cargarFacturacionOperador: load });
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();

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
    selected: new Set(),
    selectedTolls: new Set(),
    loading: false,
    detail: null,
    detailLoading: false,
    actionConfirm: null,
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
    if (title) title.textContent = 'FACTURACIÓN';
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
  }

  const selectedRows = () => S.rows.filter(row => S.selected.has(String(row.service_id)));
  const selectedTollRows = () => S.tollRows.filter(row => S.selectedTolls.has(String(row.service_toll_id)));
  const selectedCount = () => S.selected.size + S.selectedTolls.size;

  function selectedCompanies() {
    return new Map([
      ...selectedRows().map(row => [String(row.company_id), row.company_name || 'Prestadora']),
      ...selectedTollRows().map(row => [String(row.company_id), row.company_name || 'Prestadora'])
    ]);
  }

  function selectedCurrencies() {
    return new Set([
      ...selectedRows().map(row => String(row.currency || 'ARS')),
      ...selectedTollRows().map(row => String(row.currency || 'ARS'))
    ]);
  }

  function selectedTotal() {
    return selectedRows().reduce((total, row) => total + num(row.current_company_amount), 0)
      + selectedTollRows().reduce((total, row) => total + num(row.amount), 0);
  }

  function selectedCurrency() {
    return selectedRows()[0]?.currency || selectedTollRows()[0]?.currency || 'ARS';
  }

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
    return `<div class="obx-menu" role="menu">
      <button type="button" data-ob="excel-selected"><b>Selección de servicios</b><small>${serviceCount} servicios seleccionados</small></button>
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
    if (!selectedCount()) return '';
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
    return `<section class="ob-selection">
      <div><b>${S.selected.size} servicios · ${S.selectedTolls.size} peajes</b><small>${esc(summary)}</small></div>
      <div class="ob-selection-actions">
        <button class="ob-button" data-ob="clear-selection" ${S.invoiceBusy ? 'disabled' : ''}>Limpiar</button>
        ${canInvoice() ? `<button class="ob-button success" data-ob="invoice-selection" ${disabled ? 'disabled' : ''} ${title ? `title="${esc(title)}"` : ''}>${S.invoiceBusy ? 'Facturando…' : 'FACTURAR'}</button>` : ''}
      </div>
    </section>`;
  }

  function invoiceModalMarkup() {
    const services = selectedRows();
    const tolls = selectedTollRows();
    const company = [...selectedCompanies().values()][0] || 'Prestadora';
    const currency = selectedCurrency();
    const groups = invoiceGroupCounts(services);
    const form = S.invoiceForm || freshInvoiceForm();
    const other = groups.otros
      ? `<article><small>Otros servicios</small><b>${groups.otros}</b></article>`
      : '';
    return `<section role="dialog" aria-modal="true" aria-labelledby="ob-invoice-title" class="ob-invoice-modal">
      <header class="ob-invoice-head">
        <div><small>Facturación</small><h3 id="ob-invoice-title">Crear factura</h3><p>${esc(company)}</p></div>
        <button class="ob-button" type="button" data-ob="close-invoice" ${S.invoiceBusy ? 'disabled' : ''}>× Cerrar</button>
      </header>
      <div class="ob-invoice-body">
        <section class="ob-invoice-fields" aria-label="Datos de la factura">
          <label><span>Comprobante</span><select data-ob-invoice-field="document_type">
            <option value="FA" ${form.document_type === 'FA' ? 'selected' : ''}>Factura A</option>
            <option value="FB" ${form.document_type === 'FB' ? 'selected' : ''}>Factura B</option>
            <option value="FC" ${form.document_type === 'FC' ? 'selected' : ''}>Factura C</option>
          </select></label>
          <label><span>Punto de venta</span><input data-ob-invoice-field="point_of_sale" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="0004" value="${esc(form.point_of_sale)}"></label>
          <label><span>Número</span><input data-ob-invoice-field="document_number" inputmode="numeric" autocomplete="off" maxlength="20" placeholder="00001258" value="${esc(form.document_number)}"></label>
          <label><span>Fecha</span><input type="date" data-ob-invoice-field="issued_on" value="${esc(form.issued_on)}"></label>
        </section>
        <section class="ob-invoice-summary" aria-label="Conceptos incluidos">
          <article class="total"><small>Servicios</small><b>${services.length}</b></article>
          <article class="tolls"><small>Peajes</small><b>${tolls.length}</b></article>
          <article><small>Liviano</small><b>${groups.liviano}</b></article>
          <article><small>Semipesado</small><b>${groups.semipesado}</b></article>
          <article><small>UML</small><b>${groups.uml}</b></article>${other}
        </section>
        <section class="ob-invoice-total"><div><small>Total a facturar</small><b>${esc(money(selectedTotal(), currency))}</b></div><span>${esc(currency)}</span></section>
        <label class="ob-invoice-notes"><span>Observaciones <small>opcional</small></span><input data-ob-invoice-field="notes" maxlength="300" placeholder="Referencia u observación breve" value="${esc(form.notes)}"></label>
      </div>
      <footer class="ob-invoice-footer">
        <small>Al crear la factura, ${services.length} servicios y ${tolls.length} peajes quedarán facturados con importes congelados.</small>
        <div><button class="ob-button" type="button" data-ob="close-invoice" ${S.invoiceBusy ? 'disabled' : ''}>Cancelar</button><button class="ob-button success" type="button" data-ob="confirm-invoice" ${S.invoiceBusy ? 'disabled' : ''}>${S.invoiceBusy ? 'Creando factura…' : 'Crear factura'}</button></div>
      </footer>
    </section>`;
  }

  function tableMarkup() {
    if (S.tab === 'tolls') return tollTableMarkup();
    if (!S.rows.length) return '<div class="ob-empty">No hay servicios disponibles para facturar con estos filtros.</div>';
    const selectable = S.rows.filter(row => !row.pricing_error);
    const allSelected = selectable.length > 0 && selectable.every(row => S.selected.has(String(row.service_id)));
    return `<div class="ob-table-wrap"><table class="ob-table"><thead><tr>
      <th class="ob-check"><input type="checkbox" data-ob-select-all ${allSelected ? 'checked' : ''}></th>
      <th>Fecha/Hora</th><th>Prestadora</th><th>Base</th><th>Tipo de Servicio</th><th>Origen</th><th>Destino</th><th>Cliente</th><th>KM</th><th class="ob-actions"></th>
      </tr></thead><tbody>${S.rows.map(rowMarkup).join('')}</tbody></table></div>`;
  }

  function rowMarkup(row) {
    const id = String(row.service_id);
    const parts = dateParts(row.scheduled_for);
    const checked = S.selected.has(id);
    const disabled = Boolean(row.pricing_error);
    return `<tr data-billing-service="${esc(id)}" class="${checked ? 'selected' : ''}">
      <td class="ob-check"><input type="checkbox" data-ob-select="${esc(id)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled title="Corregí el error tarifario antes de seleccionar"' : ''}></td>
      <td><b>${esc(parts.day)}</b><small>${esc(parts.time)}</small></td>
      <td><b>${esc(row.company_name || '—')}</b></td><td><b>${esc(row.billing_base_name || '—')}</b></td>
      <td><b>${esc(row.service_name || '—')}</b><small>PENDIENTE</small>${row.pricing_error ? `<small class="ob-error">${esc(row.pricing_error)}</small>` : ''}</td>
      <td class="ob-place">${esc(row.origin || '—')}</td><td class="ob-place">${esc(row.destination || '—')}</td>
      <td><b>${esc(row.customer_name || '—')}</b></td><td class="ob-km">${esc(num(row.km).toLocaleString('es-AR', { maximumFractionDigits: 1 }))} km</td>
      <td class="ob-actions"><button class="ob-row-menu-trigger" type="button" data-ob-row-menu="${esc(id)}" aria-haspopup="menu" aria-expanded="false" title="Acciones del servicio">⋯</button></td>
    </tr>`;
  }

  function tollTableMarkup() {
    if (!S.tollRows.length) return '<div class="ob-empty">No hay peajes con facturación separada disponibles con estos filtros.</div>';
    const allSelected = S.tollRows.every(row => S.selectedTolls.has(String(row.service_toll_id)));
    return `<div class="ob-table-wrap"><table class="ob-table"><thead><tr>
      <th class="ob-check"><input type="checkbox" data-ob-toll-select-all ${allSelected ? 'checked' : ''}></th>
      <th>Fecha/Hora</th><th>Prestadora</th><th>Servicio</th><th>Peaje</th><th>Ruta</th><th>Base</th><th>Importe</th><th>Estado</th>
      </tr></thead><tbody>${S.tollRows.map(tollRowMarkup).join('')}</tbody></table></div>`;
  }

  function tollRowMarkup(row) {
    const id = String(row.service_toll_id);
    const parts = dateParts(row.scheduled_for);
    const route = [row.road, row.direction].filter(Boolean).join(' · ') || `${row.origin || '—'} → ${row.destination || '—'}`;
    const checked = S.selectedTolls.has(id);
    return `<tr data-billing-toll="${esc(id)}" class="${checked ? 'selected' : ''}">
      <td class="ob-check"><input type="checkbox" data-ob-toll-select="${esc(id)}" ${checked ? 'checked' : ''}></td>
      <td><b>${esc(parts.day)}</b><small>${esc(parts.time)}</small></td><td><b>${esc(row.company_name || '—')}</b></td>
      <td><b>${esc(row.service_order_number || row.service_number || '—')}</b><small>${esc(row.vehicle_plate || '')}</small></td>
      <td><b>${esc(row.toll_name || 'Peaje')}</b><small>${esc(row.source || '')}</small></td><td class="ob-place">${esc(route)}</td>
      <td><b>${esc(row.billing_base_name || '—')}</b></td><td><b class="ob-money">${esc(money(row.amount, row.currency))}</b></td>
      <td><b>DISPONIBLE</b><small>Peaje separado del servicio</small></td>
    </tr>`;
  }

  function componentMarkup(quote) {
    const rows = [...(Array.isArray(quote.components) ? quote.components : [])];
    if (num(quote.surcharge_total) > 0) rows.push({ service_name: 'Recargo', quantity: 1, unit_price: quote.surcharge_total, subtotal: quote.surcharge_total, pricing_unit: 'recargo' });
    if (quote.toll_billing_mode !== 'separate' && num(quote.toll_total) > 0) rows.push({ service_name: 'Peajes facturables', quantity: 1, unit_price: quote.toll_total, subtotal: quote.toll_total, pricing_unit: 'peajes' });
    if (!rows.length) return '<div class="ob-empty">Sin componentes.</div>';
    return `<div class="ob-components">${rows.map(item => `<div class="ob-component"><div><b>${esc(item.service_name || item.role || 'Concepto')}</b><small>${esc(item.pricing_unit || '')} · ${esc(item.quantity ?? 1)} × ${esc(money(item.unit_price || 0, quote.currency))}</small></div><small>${esc(item.price_source || '')}</small><b class="ob-money">${esc(money(item.subtotal || 0, quote.currency))}</b></div>`).join('')}</div>`;
  }

  const revisionLabel = value => value === 'invoiced' ? 'FACTURADO' : value === 'excluded' ? 'EXCLUIDO' : 'PENDIENTE';
  function revisionsMarkup(rows, currency) {
    if (!rows?.length) return '<div class="ob-empty">Todavía no hay movimientos de Facturación.</div>';
    return `<div class="ob-history">${rows.map(row => `<article><b>${esc(revisionLabel(row.billing_status))} · ${esc(money(row.company_amount, row.currency || currency))}</b><small>${esc(row.created_by_name || 'Usuario')} · ${esc(date(row.created_at))}${row.reason ? ` · ${esc(row.reason)}` : ''}</small></article>`).join('')}</div>`;
  }

  function actionConfirmMarkup() {
    if (!S.actionConfirm) return '';
    const type = S.actionConfirm;
    const title = type === 'annul' ? 'Anular servicio FINALIZADO' : 'Revertir Facturación';
    const copy = type === 'annul'
      ? 'El servicio pasará a ANULADO, saldrá de Facturación y quedará en Servicios → Historial. La acción queda auditada automáticamente.'
      : 'El servicio saldrá de Facturación y conservará FINALIZADO en Servicios → Historial. La acción queda auditada automáticamente.';
    return `<section class="ob-action-confirm ${type === 'annul' ? 'danger' : ''}"><div><b>${title}</b><small>${copy}</small></div><div class="ob-review-actions"><button class="ob-button" data-ob="cancel-action">Cancelar</button><button class="ob-button ${type === 'annul' ? 'danger' : 'primary'}" data-ob="confirm-action">Confirmar</button></div></section>`;
  }

  function detailMarkup() {
    const detail = S.detail;
    const service = detail.service || {};
    const quote = detail.current_quote || {};
    const delta = num(quote.billing_delta);
    const separateTolls = quote.toll_billing_mode === 'separate' && num(quote.separate_toll_amount) > 0;
    return `<aside class="ob-detail"><div class="ob-detail-head"><div><small>Facturación · Pendiente</small><h3>${esc(service.service_number || 'Servicio')}</h3></div><button class="ob-button" type="button" data-ob="close-detail">× Cerrar</button></div><div class="ob-detail-body">
      <div class="ob-summary"><article><small>Importe actual</small><b>${esc(money(quote.current_company_amount, quote.currency))}</b></article><article><small>Importe al cierre</small><b>${esc(money(quote.stored_company_amount, quote.currency))}</b></article><article><small>Diferencia</small><b>${delta > 0 ? '+' : ''}${esc(money(delta, quote.currency))}</b></article></div>
      ${separateTolls ? `<section class="ob-section"><h4>Peajes facturados por separado</h4><div class="ob-field"><b>${esc(money(quote.separate_toll_amount, quote.currency))}</b><small>Este importe no forma parte del total del servicio y se factura desde la pestaña Peajes.</small></div></section>` : ''}
      ${Math.abs(delta) > .009 ? `<section class="ob-section"><h4>Cambio tarifario detectado</h4><div class="ob-field"><b>${delta > 0 ? '+' : ''}${esc(money(delta, quote.currency))} respecto del cierre operativo.</b><small>Revisá esta diferencia antes de facturar el servicio.</small></div></section>` : ''}
      <section class="ob-section"><h4>Servicio</h4><div class="ob-grid"><div class="ob-field"><small>Fecha/Hora</small><b>${esc(date(service.scheduled_for))}</b></div><div class="ob-field"><small>Prestadora</small><b>${esc(service.company_name || '—')}</b></div><div class="ob-field"><small>Base</small><b>${esc(service.billing_base_name || '—')}</b></div><div class="ob-field"><small>Tipo</small><b>${esc(service.service_name || '—')}</b></div><div class="ob-field"><small>Origen</small><b>${esc(service.origin || '—')}</b></div><div class="ob-field"><small>Destino</small><b>${esc(service.destination || '—')}</b></div><div class="ob-field"><small>Cliente</small><b>${esc(service.customer_name || '—')}</b></div><div class="ob-field"><small>Patente</small><b>${esc(service.vehicle_plate || '—')}</b></div></div></section>
      <section class="ob-section"><h4>Tarifa aplicada ahora</h4><div class="ob-grid"><div class="ob-field"><small>Tarifario</small><b>${esc(quote.rate_card_name || '—')} · v${esc(quote.rate_card_version || '—')}</b></div><div class="ob-field"><small>Contrato</small><b>${esc(quote.contract_name || '—')}</b></div><div class="ob-field"><small>Radio cubierto</small><b>${quote.covered_radius_km == null ? '—' : esc(`${quote.covered_radius_km} km`)}</b></div><div class="ob-field"><small>KM facturables</small><b>${esc(`${quote.billable_distance_km ?? 0} km`)}</b></div></div></section>
      <section class="ob-section"><h4>Composición</h4>${componentMarkup(quote)}</section>${actionConfirmMarkup()}
      <section class="ob-section"><h4>Historial de Facturación</h4>${revisionsMarkup(detail.revisions, quote.currency)}</section>
    </div></aside>`;
  }

  function render() {
    const screen = ensureShell();
    if (!screen) return;
    closeRowActionMenu();
    document.querySelector('.topbar-right #obx-wrap')?.remove();
    const opts = filterOptions();
    const excelControl = S.selected.size
      ? '<div id="obx-wrap" class="obx-wrap"><button type="button" class="obx-trigger" id="obx-trigger" aria-haspopup="menu" aria-expanded="false" data-ob="excel-toggle">⇩ Excel</button></div>'
      : '';
    const overlayOpen = S.invoiceOpen || S.detail || S.detailLoading;
    const overlay = S.invoiceOpen
      ? invoiceModalMarkup()
      : S.detailLoading
        ? '<aside class="ob-detail"><div class="ob-empty">Calculando detalle de facturación…</div></aside>'
        : S.detail ? detailMarkup() : '';
    screen.innerHTML = `<div class="ob-shell">
      <div class="ob-toolbar"><div class="ob-tabs"><button class="ob-tab ${S.tab === 'services' ? 'active' : ''}" type="button" data-ob-tab="services">Servicios</button><button class="ob-tab ${S.tab === 'tolls' ? 'active' : ''}" type="button" data-ob-tab="tolls">Peajes</button></div>
      <div class="ob-filters"><input class="ob-search" id="ob-search" placeholder="Buscar código, cliente, origen, destino…" value="${esc(S.search)}"><select class="ob-filter" id="ob-company-filter">${opts.companies}</select><select class="ob-filter" id="ob-period-filter">${opts.periods}</select>${excelControl}<button class="ob-button ob-filter-action" type="button" data-ob="refresh">↻ Actualizar</button></div></div>
      ${selectionMarkup()}<div class="ob-table-card">${S.loading ? '<div class="ob-empty">Actualizando Facturación…</div>' : tableMarkup()}</div>
      <div id="ob-detail-backdrop" class="ob-detail-backdrop ${S.invoiceOpen ? 'ob-invoice-backdrop' : ''}" ${overlayOpen ? '' : 'hidden'}>${overlay}</div>
    </div>`;
  }

  async function load() {
    if (S.loading || !db() || !canRead()) return;
    S.loading = true;
    render();
    const bounds = periodBounds(S.period);
    try {
      const [services, tolls] = await Promise.all([
        db().rpc('list_operator_billing_services_v3', { p_search: S.search || null, p_company_id: S.company || null, p_period_start: bounds.start, p_period_end: bounds.end }),
        db().rpc('list_operator_billing_tolls_v2', { p_search: S.search || null, p_company_id: S.company || null, p_period_start: bounds.start, p_period_end: bounds.end })
      ]);
      if (services.error) throw services.error;
      if (tolls.error) throw tolls.error;
      S.rows = Array.isArray(services.data?.rows) ? services.data.rows : [];
      S.filters = {
        companies: Array.isArray(services.data?.filters?.companies) ? services.data.filters.companies : [],
        periods: Array.isArray(services.data?.filters?.periods) ? services.data.filters.periods : []
      };
      S.tollRows = Array.isArray(tolls.data?.rows) ? tolls.data.rows : [];
      S.tollTotal = num(tolls.data?.total_amount);
      for (const id of [...S.selected]) if (!S.rows.some(row => String(row.service_id) === id)) S.selected.delete(id);
      for (const id of [...S.selectedTolls]) if (!S.tollRows.some(row => String(row.service_toll_id) === id)) S.selectedTolls.delete(id);
    } catch (error) {
      notify(error.message || 'No se pudo cargar Facturación', 'error');
      S.rows = [];
      S.tollRows = [];
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
    S.actionConfirm = null;
    render();
    try {
      const { data, error } = await db().rpc('get_operator_billing_service_detail_v3', { p_service_id: id });
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

  async function openDetailAction(id, type) {
    if (type === 'annul' && !canCorrect()) return notify('Sin permiso para anular', 'error');
    if (type === 'revert' && !canRevert()) return notify('Sin permiso para revertir Facturación', 'error');
    await openDetail(id);
    if (String(S.detail?.service?.service_id || '') !== String(id)) return;
    S.actionConfirm = type;
    render();
  }

  function closeDetail() {
    S.detail = null;
    S.detailLoading = false;
    S.actionConfirm = null;
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
    const rows = S.rows.filter(row => !row.pricing_error);
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

  function validateSelection() {
    const services = selectedRows();
    const tolls = selectedTollRows();
    if (!services.length && !tolls.length) return 'Seleccioná al menos un servicio o peaje';
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
    S.actionConfirm = null;
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
    const form = S.invoiceForm;
    S.invoiceBusy = true;
    render();
    try {
      const { data, error } = await db().rpc('create_operator_invoice_v3', {
        p_service_ids: serviceIds,
        p_service_toll_ids: tollIds,
        p_document_type: form.document_type,
        p_point_of_sale: form.point_of_sale.trim(),
        p_document_number: form.document_number.trim(),
        p_issued_on: form.issued_on,
        p_notes: form.notes.trim() || null
      });
      if (error) throw error;
      S.invoiceOpen = false;
      S.invoiceForm = null;
      clearSelection();
      notify(`${data?.invoice_number || 'Factura'} creada · ${data?.service_count || 0} servicios · ${data?.toll_count || 0} peajes`, 'success');
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
    const id = S.detail?.service?.service_id;
    const type = S.actionConfirm;
    if (!id || !type) return;
    const button = document.querySelector('[data-ob="confirm-action"]');
    if (button) { button.disabled = true; button.textContent = 'Procesando…'; }
    try {
      const rpc = type === 'annul' ? 'annul_operator_billing_service_v2' : 'revert_operator_billing_service_v2';
      const { error } = await db().rpc(rpc, { p_service_id: id, p_reason: null });
      if (error) throw error;
      notify(type === 'annul' ? 'Servicio ANULADO' : 'Facturación revertida', 'success');
      S.detail = null;
      S.actionConfirm = null;
      clearSelection();
      await load();
      if (typeof window.goTo === 'function') {
        window.goTo('operaciones');
        window.cambiarVistaServicios?.('history');
      }
    } catch (error) {
      notify(error.message || 'No se pudo completar la acción', 'error');
      render();
    }
  }

  function editServiceById(id) {
    if (!id || !canCorrect()) return;
    if (typeof window.editarServicioOperador !== 'function') return notify('El editor de Servicios todavía se está cargando', 'warning');
    window.editarServicioOperador(id);
  }

  function handleRowAction(action, id) {
    if (action === 'view') return openDetail(id);
    if (action === 'edit') return editServiceById(id);
    if (action === 'revert') return openDetailAction(id, 'revert');
    if (action === 'annul') return openDetailAction(id, 'annul');
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

    const tab = event.target.closest('[data-ob-tab]');
    if (tab) {
      S.tab = tab.dataset.obTab;
      S.invoiceOpen = false;
      return render();
    }

    const action = event.target.closest('[data-ob]')?.dataset.ob;
    if (!action) return;
    if (action === 'refresh') return clearAndLoad();
    if (action === 'clear-selection') { clearSelection(); return render(); }
    if (action === 'invoice-selection') return openInvoice();
    if (action === 'close-invoice') return closeInvoice();
    if (action === 'confirm-invoice') return createInvoice();
    if (action === 'close-detail') return closeDetail();
    if (action === 'cancel-action') { S.actionConfirm = null; return render(); }
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
    openInvoice, createInvoice, selectedRows, selectedTollRows
  });
  Object.assign(window, { abrirFacturacionOperador: open, cargarFacturacionOperador: load });
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();

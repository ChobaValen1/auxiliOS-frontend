/* AuxiliOS · Facturas · mesa administrativa canónica */
(() => {
  'use strict';

  const I = window.OperatorInvoices = window.OperatorInvoices || {};
  const PDF_BUCKET = 'operator-invoice-pdfs';
  const S = I.S = {
    rows: [],
    filters: { companies: [], periods: [] },
    search: '',
    company: '',
    period: '',
    loading: false,
    detail: null,
    detailLoading: false,
    action: null,
    actionBusy: false,
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
    profile()?.roles?.name ||
    profile()?.role?.name ||
    profile()?.role ||
    profile()?.role_name ||
    ''
  );
  const canRead = () => ['administracion', 'facturacion', 'supervision'].includes(role());
  const canManage = () => ['administracion', 'facturacion'].includes(role());
  const db = () => typeof _db !== 'undefined' ? _db : null;
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const notify = (message, type = 'info') => typeof window.toast === 'function'
    ? window.toast(message, type)
    : console[type === 'error' ? 'error' : 'log'](message);
  const money = (value, currency = 'ARS') => new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency || 'ARS',
    maximumFractionDigits: 2
  }).format(num(value));
  const date = value => value
    ? new Date(value).toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit'
      })
    : '—';

  function todayLocalDate() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function invoiceDate(value, fallback) {
    const raw = String(value || '').slice(0, 10);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : date(fallback);
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
    const pad = value => String(value).padStart(2, '0');
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      start: `${year}-${pad(month)}-01`,
      end: `${year}-${pad(month)}-${pad(lastDay)}`
    };
  }

  function cleanFilePart(value) {
    return String(value || 'Factura')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'Factura';
  }

  function injectAssets() {
    if (document.getElementById('auxilios-operator-invoices-css')) return;
    const link = document.createElement('link');
    link.id = 'auxilios-operator-invoices-css';
    link.rel = 'stylesheet';
    link.href = '/operator-invoices.css';
    document.head.appendChild(link);
  }

  function ensureShell() {
    injectAssets();
    let screen = document.getElementById('screen-facturas');
    if (!screen) {
      const content = document.querySelector('.content');
      if (!content) return null;
      screen = document.createElement('div');
      screen.id = 'screen-facturas';
      screen.className = 'screen oi-screen';
      content.appendChild(screen);
    }

    let nav = document.getElementById('nav-facturas');
    if (!nav) {
      const sidenav = document.querySelector('.sidenav');
      const billingNav = document.getElementById('nav-facturacion');
      const bottom = sidenav?.querySelector('.nav-bottom');
      if (sidenav) {
        nav = document.createElement('div');
        nav.id = 'nav-facturas';
        nav.className = 'nav-item';
        nav.innerHTML = '<span class="nav-icon">▤</span><span class="nav-label">Facturas</span>';
        nav.addEventListener('click', () => open());
        if (billingNav?.parentNode === sidenav) sidenav.insertBefore(nav, billingNav.nextSibling);
        else if (bottom) sidenav.insertBefore(nav, bottom);
        else sidenav.appendChild(nav);
      }
    }

    if (nav) nav.style.display = canRead() ? '' : 'none';
    if (!screen.dataset.boundOi) {
      screen.dataset.boundOi = '1';
      screen.addEventListener('click', onClick);
      screen.addEventListener('input', onInput);
      screen.addEventListener('change', onChange);
    }
    return screen;
  }

  function setTopbar() {
    const title = document.getElementById('topbar-title');
    const sub = document.getElementById('topbar-sub');
    if (title) title.textContent = 'FACTURAS';
    if (sub) sub.textContent = 'Comprobantes · archivos · notas de crédito';
  }

  async function open(invoiceId = null) {
    if (!canRead()) return notify('Sin permiso para Facturas', 'error');
    const screen = ensureShell();
    if (!screen) return;

    window.dispatchEvent(new CustomEvent('auxilios:navigation-changed', {
      detail: { screen: 'facturas' }
    }));
    document.querySelectorAll('.screen').forEach(node => node.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(node => node.classList.remove('active'));
    screen.classList.add('active');
    document.getElementById('nav-facturas')?.classList.add('active');
    setTopbar();

    S.detail = null;
    S.action = null;
    render();
    await load();
    if (invoiceId) await openDetail(invoiceId);
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

  function statusLabel(value) {
    if (value === 'cancelled') return 'ANULADA';
    if (value === 'credited') return 'ACREDITADA';
    return 'FACTURADA';
  }

  function statusClass(value) {
    if (value === 'cancelled') return 'cancelled';
    if (value === 'credited') return 'credited';
    return '';
  }

  function rowById(id) {
    return S.rows.find(row => String(row.invoice_id) === String(id)) || null;
  }

  function creditType(invoiceType) {
    if (invoiceType === 'FA') return 'NCA';
    if (invoiceType === 'FB') return 'NCB';
    if (invoiceType === 'FC') return 'NCC';
    return '';
  }

  function creditTypeLabel(value) {
    if (value === 'NCA') return 'Nota de Crédito A';
    if (value === 'NCB') return 'Nota de Crédito B';
    if (value === 'NCC') return 'Nota de Crédito C';
    return 'Nota de Crédito';
  }

  function creditNumber(creditNote) {
    if (!creditNote) return '';
    return `${creditTypeLabel(creditNote.document_type)} ${creditNote.point_of_sale || ''}-${creditNote.document_number || ''}`.trim();
  }

  function closeActionMenu() {
    document.querySelectorAll('[data-oi-menu][aria-expanded="true"]')
      .forEach(node => node.setAttribute('aria-expanded', 'false'));
    document.getElementById('oi-action-menu')?.remove();
  }

  function actionMenuMarkup(row) {
    const active = row.status === 'created';
    const pdfActions = row.pdf_path
      ? `<button type="button" data-oi-row-action="view-pdf" data-invoice-id="${esc(row.invoice_id)}">Ver PDF</button>
         <button type="button" data-oi-row-action="attach-pdf" data-invoice-id="${esc(row.invoice_id)}">Reemplazar PDF</button>`
      : `<button type="button" data-oi-row-action="attach-pdf" data-invoice-id="${esc(row.invoice_id)}">Adjuntar PDF</button>`;
    const lifecycleActions = canManage() && active
      ? `<button type="button" data-oi-row-action="credit-note" data-invoice-id="${esc(row.invoice_id)}">Emitir Nota de Crédito</button>
         <button type="button" class="danger" data-oi-row-action="annul" data-invoice-id="${esc(row.invoice_id)}">Anular</button>`
      : '';

    return `${pdfActions}
      <button type="button" data-oi-row-action="excel" data-invoice-id="${esc(row.invoice_id)}">Descargar Excel</button>
      ${lifecycleActions}`;
  }

  function toggleActionMenu(trigger, id) {
    const existing = document.getElementById('oi-action-menu');
    if (existing?.dataset.invoiceId === String(id)) {
      closeActionMenu();
      return;
    }
    const row = rowById(id) || (S.detail?.invoice?.invoice_id === id ? S.detail.invoice : null);
    if (!row) return;

    closeActionMenu();
    const menu = document.createElement('div');
    menu.id = 'oi-action-menu';
    menu.className = 'oi-action-menu';
    menu.dataset.invoiceId = String(id);
    menu.innerHTML = actionMenuMarkup(row);
    document.body.appendChild(menu);

    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const left = Math.max(margin, Math.min(
      rect.right - menu.offsetWidth,
      window.innerWidth - menu.offsetWidth - margin
    ));
    let top = rect.bottom + gap;
    if (top + menu.offsetHeight > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - menu.offsetHeight - gap);
    }
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    trigger.setAttribute('aria-expanded', 'true');
  }

  function tableMarkup() {
    if (!S.rows.length) return '<div class="oi-empty">Todavía no hay facturas con estos filtros.</div>';
    const rows = S.rows.map(row => {
      const credit = row.credit_note_id
        ? `<small>${esc(`${creditTypeLabel(row.credit_note_type)} ${row.credit_note_point_of_sale}-${row.credit_note_number}`)}</small>`
        : '';
      const pdf = row.pdf_path
        ? '<span class="oi-file">PDF adjunto</span>'
        : '<span class="oi-muted">Sin PDF</span>';
      return `<tr>
        <td><b>${esc(row.invoice_number || '—')}</b>${credit}</td>
        <td>${esc(invoiceDate(row.issued_on, row.created_at))}</td>
        <td><b>${esc(row.company_name || '—')}</b></td>
        <td>${esc(row.service_count || 0)}</td>
        <td><b class="oi-money">${esc(money(row.total_amount, row.currency))}</b></td>
        <td><span class="oi-status ${statusClass(row.status)}">${esc(statusLabel(row.status))}</span></td>
        <td>${pdf}</td>
        <td class="oi-actions">
          <button class="oi-button" type="button" data-oi-detail="${esc(row.invoice_id)}">Ver</button>
          <button class="oi-menu-trigger" type="button" data-oi-menu="${esc(row.invoice_id)}" aria-haspopup="menu" aria-expanded="false" title="Acciones">⋯</button>
        </td>
      </tr>`;
    }).join('');

    return `<div class="oi-table-wrap"><table class="oi-table">
      <thead><tr><th>Factura</th><th>Fecha</th><th>Prestadora</th><th>Servicios</th><th>Total</th><th>Estado</th><th>PDF</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }

  function lineMarkup(line) {
    const service = line.service_snapshot || {};
    const quote = line.quote_snapshot || {};
    const released = Boolean(line.released_at);
    return `<article class="oi-line ${released ? 'released' : ''}">
      <div class="oi-line-main">
        <b>${esc(service.service_order_number || service.service_number || 'Servicio')}</b>
        <small>${esc(date(service.scheduled_for))} · ${esc(service.customer_name || 'Sin cliente')}</small>
        <small>${esc([service.vehicle_make_model, service.vehicle_plate].filter(Boolean).join(' · ') || 'Sin vehículo')}</small>
        ${released ? '<small class="oi-release">Liberado por anulación</small>' : ''}
      </div>
      <div class="oi-line-route">
        <small>Origen</small><b>${esc(service.origin || '—')}</b>
        <small>Destino</small><b>${esc(service.destination || '—')}</b>
      </div>
      <div class="oi-line-price">
        <small>Importe congelado</small>
        <b>${esc(money(line.company_amount, line.currency))}</b>
        <small>${quote.rate_card_name ? `${esc(quote.rate_card_name)} · v${esc(quote.rate_card_version || '—')}` : 'Tarifa congelada'}</small>
      </div>
    </article>`;
  }

  function detailMarkup() {
    const detail = S.detail;
    const invoice = detail.invoice || {};
    const lines = Array.isArray(detail.lines) ? detail.lines : [];
    const creditNote = detail.credit_note || null;
    const creditSection = creditNote
      ? `<section class="oi-section oi-credit">
          <h4>Nota de Crédito</h4>
          <div class="oi-grid">
            <div><small>Comprobante</small><b>${esc(creditNumber(creditNote))}</b></div>
            <div><small>Fecha</small><b>${esc(invoiceDate(creditNote.issued_on, creditNote.created_at))}</b></div>
            <div><small>Importe</small><b>${esc(money(creditNote.amount, creditNote.currency))}</b></div>
            <div><small>Alcance</small><b>Total</b></div>
          </div>
        </section>`
      : '';

    return `<aside class="oi-detail">
      <div class="oi-detail-head">
        <div><small>Factura · ${esc(statusLabel(invoice.status))}</small><h3>${esc(invoice.invoice_number || 'Factura')}</h3></div>
        <div class="oi-detail-head-actions">
          <button class="oi-menu-trigger" type="button" data-oi-menu="${esc(invoice.invoice_id)}" aria-haspopup="menu" aria-expanded="false">Acciones ⋯</button>
          <button class="oi-button" type="button" data-oi="close-detail">× Cerrar</button>
        </div>
      </div>
      <div class="oi-detail-body">
        <div class="oi-summary">
          <article><small>Prestadora</small><b>${esc(invoice.company_name || '—')}</b></article>
          <article><small>Servicios</small><b>${esc(invoice.service_count || 0)}</b></article>
          <article><small>Total</small><b>${esc(money(invoice.total_amount, invoice.currency))}</b></article>
        </div>
        <section class="oi-section">
          <h4>Datos de factura</h4>
          <div class="oi-grid">
            <div><small>Fecha de emisión</small><b>${esc(invoiceDate(invoice.issued_on, invoice.created_at))}</b></div>
            <div><small>Creada por</small><b>${esc(invoice.created_by_name || 'Usuario')}</b></div>
            <div><small>Estado</small><b>${esc(statusLabel(invoice.status))}</b></div>
            <div><small>Moneda</small><b>${esc(invoice.currency || 'ARS')}</b></div>
            <div><small>PDF</small><b>${invoice.pdf_path ? esc(invoice.pdf_name || 'Adjunto') : 'Sin PDF'}</b></div>
            ${invoice.notes ? `<div><small>Observaciones</small><b>${esc(invoice.notes)}</b></div>` : ''}
            ${invoice.cancellation_reason ? `<div class="oi-wide"><small>Motivo de anulación</small><b>${esc(invoice.cancellation_reason)}</b></div>` : ''}
          </div>
        </section>
        ${creditSection}
        <section class="oi-section">
          <h4>Servicios facturados</h4>
          <div class="oi-lines">${lines.length ? lines.map(lineMarkup).join('') : '<div class="oi-empty">Sin servicios.</div>'}</div>
        </section>
      </div>
    </aside>`;
  }

  function actionModalMarkup() {
    const action = S.action;
    if (!action) return '';
    const row = rowById(action.invoiceId) || S.detail?.invoice || {};
    const busy = S.actionBusy;

    if (action.type === 'annul') {
      return `<section class="oi-modal" role="dialog" aria-modal="true">
        <header>
          <div><small>Factura</small><h3>Anular ${esc(row.invoice_number || 'factura')}</h3></div>
          <button class="oi-button" data-oi="close-action" ${busy ? 'disabled' : ''}>×</button>
        </header>
        <div class="oi-modal-body">
          <div class="oi-warning">
            <b>Se devolverán ${esc(row.service_count || 0)} servicios a Facturación.</b>
            <span>La factura y sus líneas permanecen en el historial. Esta acción no anula fiscalmente el comprobante ante ARCA.</span>
          </div>
          <label><span>Motivo de anulación</span><input data-oi-action-field="reason" maxlength="300" placeholder="Motivo obligatorio" value="${esc(action.form.reason || '')}"></label>
        </div>
        <footer>
          <button class="oi-button" data-oi="close-action" ${busy ? 'disabled' : ''}>Cancelar</button>
          <button class="oi-button danger" data-oi="confirm-annul" ${busy ? 'disabled' : ''}>${busy ? 'Anulando…' : 'Anular y devolver servicios'}</button>
        </footer>
      </section>`;
    }

    if (action.type === 'credit-note') {
      const type = creditType(row.document_type);
      return `<section class="oi-modal" role="dialog" aria-modal="true">
        <header>
          <div><small>${esc(row.invoice_number || 'Factura')}</small><h3>Emitir Nota de Crédito</h3></div>
          <button class="oi-button" data-oi="close-action" ${busy ? 'disabled' : ''}>×</button>
        </header>
        <div class="oi-modal-body">
          <div class="oi-credit-total">
            <small>Nota de Crédito total</small>
            <b>${esc(money(row.total_amount, row.currency))}</b>
            <span>Los servicios permanecen vinculados a la factura original.</span>
          </div>
          <div class="oi-modal-grid">
            <label><span>Comprobante</span><input value="${esc(creditTypeLabel(type))}" disabled></label>
            <label><span>Punto de venta</span><input data-oi-action-field="point_of_sale" inputmode="numeric" maxlength="10" placeholder="0004" value="${esc(action.form.point_of_sale || '')}"></label>
            <label><span>Número</span><input data-oi-action-field="document_number" inputmode="numeric" maxlength="20" placeholder="00000125" value="${esc(action.form.document_number || '')}"></label>
            <label><span>Fecha</span><input type="date" data-oi-action-field="issued_on" value="${esc(action.form.issued_on || todayLocalDate())}"></label>
          </div>
          <label><span>Observaciones <small>opcional</small></span><input data-oi-action-field="notes" maxlength="300" placeholder="Referencia breve" value="${esc(action.form.notes || '')}"></label>
        </div>
        <footer>
          <button class="oi-button" data-oi="close-action" ${busy ? 'disabled' : ''}>Cancelar</button>
          <button class="oi-button primary" data-oi="confirm-credit-note" ${busy ? 'disabled' : ''}>${busy ? 'Emitiendo…' : 'Emitir Nota de Crédito'}</button>
        </footer>
      </section>`;
    }

    return '';
  }

  function render() {
    const screen = ensureShell();
    if (!screen) return;
    closeActionMenu();
    const opts = filterOptions();
    const detailOpen = Boolean(S.detail || S.detailLoading);
    const actionOpen = Boolean(S.action);
    const detail = S.detailLoading
      ? '<aside class="oi-detail"><div class="oi-empty">Cargando factura…</div></aside>'
      : S.detail ? detailMarkup() : '';

    screen.innerHTML = `<div class="oi-shell">
      <div class="oi-toolbar"><div class="oi-filters">
        <input class="oi-search" id="oi-search" placeholder="Buscar factura, prestadora o servicio…" value="${esc(S.search)}">
        <select class="oi-filter" id="oi-company-filter">${opts.companies}</select>
        <select class="oi-filter" id="oi-period-filter">${opts.periods}</select>
        <button class="oi-button" type="button" data-oi="refresh">↻ Actualizar</button>
      </div></div>
      <div class="oi-table-card">${S.loading ? '<div class="oi-empty">Actualizando Facturas…</div>' : tableMarkup()}</div>
      <div class="oi-detail-backdrop" ${detailOpen ? '' : 'hidden'}>${detail}</div>
      <div class="oi-modal-backdrop" ${actionOpen ? '' : 'hidden'}>${actionOpen ? actionModalMarkup() : ''}</div>
    </div>`;
  }

  async function load() {
    if (S.loading || !db() || !canRead()) return;
    S.loading = true;
    render();
    const bounds = periodBounds(S.period);
    try {
      const { data, error } = await db().rpc('list_operator_invoices_v2', {
        p_search: S.search || null,
        p_company_id: S.company || null,
        p_period_start: bounds.start,
        p_period_end: bounds.end
      });
      if (error) throw error;
      S.rows = Array.isArray(data?.rows) ? data.rows : [];
      S.filters = {
        companies: Array.isArray(data?.filters?.companies) ? data.filters.companies : [],
        periods: Array.isArray(data?.filters?.periods) ? data.filters.periods : []
      };
    } catch (error) {
      S.rows = [];
      notify(error.message || 'No se pudieron cargar las Facturas', 'error');
    } finally {
      S.loading = false;
      render();
    }
  }

  async function fetchDetail(id) {
    const { data, error } = await db().rpc('get_operator_invoice_detail_v2', { p_invoice_id: id });
    if (error) throw error;
    return data;
  }

  async function openDetail(id) {
    if (!id || S.detailLoading) return;
    S.detail = null;
    S.detailLoading = true;
    render();
    try {
      S.detail = await fetchDetail(id);
    } catch (error) {
      S.detail = null;
      notify(error.message || 'No se pudo abrir la factura', 'error');
    } finally {
      S.detailLoading = false;
      render();
    }
  }

  function closeDetail() {
    S.detail = null;
    S.detailLoading = false;
    render();
  }

  function openAnnul(id) {
    const row = rowById(id);
    if (!canManage()) return notify('Sin permiso para anular facturas', 'error');
    if (!row || row.status !== 'created') return notify('Sólo se puede anular una factura activa', 'warning');
    S.action = { type: 'annul', invoiceId: id, form: { reason: '' } };
    render();
  }

  function openCreditNote(id) {
    const row = rowById(id);
    if (!canManage()) return notify('Sin permiso para emitir Notas de Crédito', 'error');
    if (!row || row.status !== 'created') return notify('La factura ya no admite una Nota de Crédito', 'warning');
    const type = creditType(row.document_type);
    if (!type) return notify('El tipo de factura no admite Nota de Crédito', 'warning');
    S.action = {
      type: 'credit-note',
      invoiceId: id,
      form: {
        document_type: type,
        point_of_sale: row.point_of_sale || '',
        document_number: '',
        issued_on: todayLocalDate(),
        notes: ''
      }
    };
    render();
  }

  function closeAction() {
    if (S.actionBusy) return;
    S.action = null;
    render();
  }

  async function confirmAnnul() {
    const action = S.action;
    const row = rowById(action?.invoiceId);
    if (!action || action.type !== 'annul' || !row || S.actionBusy) return;
    const reason = String(action.form.reason || '').trim();
    if (reason.length < 3) return notify('Ingresá un motivo de anulación', 'warning');

    S.actionBusy = true;
    render();
    try {
      const { data, error } = await db().rpc('annul_operator_invoice_v2', {
        p_invoice_id: action.invoiceId,
        p_reason: reason
      });
      if (error) throw error;
      S.action = null;
      S.detail = null;
      notify(`Factura anulada · ${data?.released_service_count || row.service_count || 0} servicios volvieron a Facturación`, 'success');
      await load();
    } catch (error) {
      notify(error.message || 'No se pudo anular la factura', 'error');
    } finally {
      S.actionBusy = false;
      render();
    }
  }

  async function confirmCreditNote() {
    const action = S.action;
    const row = rowById(action?.invoiceId);
    if (!action || action.type !== 'credit-note' || !row || S.actionBusy) return;
    const form = action.form;
    if (!/^\d+$/.test(String(form.point_of_sale || ''))) return notify('Ingresá el punto de venta usando sólo números', 'warning');
    if (!/^\d+$/.test(String(form.document_number || ''))) return notify('Ingresá el número usando sólo números', 'warning');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(form.issued_on || ''))) return notify('Ingresá una fecha válida', 'warning');

    S.actionBusy = true;
    render();
    try {
      const { error } = await db().rpc('create_operator_invoice_credit_note_v1', {
        p_invoice_id: action.invoiceId,
        p_document_type: form.document_type,
        p_point_of_sale: form.point_of_sale.trim(),
        p_document_number: form.document_number.trim(),
        p_issued_on: form.issued_on,
        p_notes: String(form.notes || '').trim() || null
      });
      if (error) throw error;
      S.action = null;
      notify('Nota de Crédito total registrada', 'success');
      await load();
      await openDetail(row.invoice_id);
    } catch (error) {
      notify(error.message || 'No se pudo emitir la Nota de Crédito', 'error');
    } finally {
      S.actionBusy = false;
      render();
    }
  }

  function choosePdf(id) {
    if (!canManage()) return notify('Sin permiso para adjuntar PDF', 'error');
    const row = rowById(id);
    if (!row) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.hidden = true;
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      if (file.type && file.type !== 'application/pdf') return notify('Seleccioná un archivo PDF', 'warning');
      if (file.size > 15 * 1024 * 1024) return notify('El PDF no puede superar 15 MB', 'warning');

      const path = `${id}/factura.pdf`;
      notify('Subiendo PDF…');
      try {
        const storage = db()?.storage?.from(PDF_BUCKET);
        if (!storage) throw new Error('Storage no está disponible');
        const { error: uploadError } = await storage.upload(path, file, {
          upsert: true,
          contentType: 'application/pdf',
          cacheControl: '3600'
        });
        if (uploadError) throw uploadError;
        const { error: linkError } = await db().rpc('attach_operator_invoice_pdf_v1', {
          p_invoice_id: id,
          p_pdf_path: path,
          p_pdf_name: file.name
        });
        if (linkError) throw linkError;
        notify('PDF adjuntado a la factura', 'success');
        await load();
        if (S.detail?.invoice?.invoice_id === id) await openDetail(id);
      } catch (error) {
        notify(error.message || 'No se pudo adjuntar el PDF', 'error');
      }
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  }

  async function viewPdf(id) {
    const row = rowById(id) || S.detail?.invoice;
    if (!row?.pdf_path) return notify('La factura no tiene PDF adjunto', 'warning');
    try {
      const storage = db()?.storage?.from(PDF_BUCKET);
      if (!storage) throw new Error('Storage no está disponible');
      const { data, error } = await storage.createSignedUrl(row.pdf_path, 3600);
      if (error) throw error;
      if (!data?.signedUrl) throw new Error('No se pudo generar el acceso al PDF');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      notify(error.message || 'No se pudo abrir el PDF', 'error');
    }
  }

  async function exportExcel(id) {
    try {
      const detail = S.detail?.invoice?.invoice_id === id ? S.detail : await fetchDetail(id);
      const invoice = detail?.invoice || {};
      const lines = Array.isArray(detail?.lines) ? detail.lines : [];
      const excel = window.AuxiliosExcelExport;
      if (!excel) throw new Error('El exportador Excel todavía no está disponible');
      excel.ensureReady?.();

      const serviceColumns = [
        { header: 'Línea', width: 9, key: 'line_number', type: 'number' },
        { header: 'N° Orden', width: 18, key: 'order' },
        { header: 'Servicio', width: 18, key: 'service_number' },
        { header: 'Fecha', width: 14, key: 'scheduled_for' },
        { header: 'Cliente', width: 24, key: 'customer' },
        { header: 'Vehículo', width: 24, key: 'vehicle' },
        { header: 'Patente', width: 14, key: 'plate' },
        { header: 'Origen', width: 40, key: 'origin' },
        { header: 'Destino', width: 40, key: 'destination' },
        { header: 'Importe', width: 16, key: 'amount', type: 'number' },
        { header: 'Moneda', width: 10, key: 'currency' },
        { header: 'Estado vínculo', width: 16, key: 'link_status' }
      ];
      const serviceRows = lines.map(line => {
        const service = line.service_snapshot || {};
        return {
          line_number: line.line_number,
          order: service.service_order_number || '',
          service_number: service.service_number || '',
          scheduled_for: invoiceDate(String(service.scheduled_for || '').slice(0, 10), service.scheduled_for),
          customer: service.customer_name || '',
          vehicle: service.vehicle_make_model || '',
          plate: service.vehicle_plate || '',
          origin: service.origin || '',
          destination: service.destination || '',
          amount: num(line.company_amount),
          currency: line.currency || invoice.currency || 'ARS',
          link_status: line.released_at ? 'Liberado por anulación' : 'Facturado'
        };
      });
      const summaryColumns = [
        { header: 'Dato', width: 28, key: 'label' },
        { header: 'Valor', width: 30, key: 'value' }
      ];
      const summaryRows = [
        { label: 'Factura', value: invoice.invoice_number || '' },
        { label: 'Prestadora', value: invoice.company_name || '' },
        { label: 'Fecha emisión', value: invoiceDate(invoice.issued_on, invoice.created_at) },
        { label: 'Estado', value: statusLabel(invoice.status) },
        { label: 'Servicios', value: String(invoice.service_count || lines.length) },
        { label: 'Total', value: num(invoice.total_amount) },
        { label: 'Moneda', value: invoice.currency || 'ARS' }
      ];
      if (detail.credit_note) {
        summaryRows.push(
          { label: 'Nota de Crédito', value: creditNumber(detail.credit_note) },
          { label: 'Importe NC', value: num(detail.credit_note.amount) }
        );
      }

      excel.download({
        filename: `AuxiliOS_${cleanFilePart(invoice.invoice_number || 'Factura')}`,
        sheets: [
          { name: 'Resumen', columns: summaryColumns, rows: summaryRows },
          { name: 'Servicios', columns: serviceColumns, rows: serviceRows }
        ]
      });
      notify('Excel de la factura descargado', 'success');
    } catch (error) {
      notify(error.message || 'No se pudo descargar el Excel', 'error');
    }
  }

  function handleRowAction(action, id) {
    if (action === 'attach-pdf') return choosePdf(id);
    if (action === 'view-pdf') return viewPdf(id);
    if (action === 'excel') return exportExcel(id);
    if (action === 'credit-note') return openCreditNote(id);
    if (action === 'annul') return openAnnul(id);
  }

  function onInput(event) {
    const field = event.target.dataset?.oiActionField;
    if (field && S.action) {
      if (['point_of_sale', 'document_number'].includes(field)) {
        const digits = event.target.value.replace(/\D/g, '');
        event.target.value = digits;
        S.action.form[field] = digits;
      } else {
        S.action.form[field] = event.target.value;
      }
      return;
    }
    if (event.target.id !== 'oi-search') return;
    S.search = event.target.value;
    clearTimeout(S.searchTimer);
    S.searchTimer = setTimeout(load, 300);
  }

  function onChange(event) {
    const field = event.target.dataset?.oiActionField;
    if (field && S.action) {
      S.action.form[field] = event.target.value;
      return;
    }
    if (event.target.id === 'oi-company-filter') {
      S.company = event.target.value || '';
      return load();
    }
    if (event.target.id === 'oi-period-filter') {
      S.period = event.target.value || '';
      return load();
    }
  }

  function onClick(event) {
    const menu = event.target.closest('[data-oi-menu]');
    if (menu) {
      event.stopPropagation();
      return toggleActionMenu(menu, menu.dataset.oiMenu);
    }
    const detail = event.target.closest('[data-oi-detail]');
    if (detail) return openDetail(detail.dataset.oiDetail);

    const action = event.target.closest('[data-oi]')?.dataset.oi;
    if (action === 'refresh') return load();
    if (action === 'close-detail') return closeDetail();
    if (action === 'close-action') return closeAction();
    if (action === 'confirm-annul') return confirmAnnul();
    if (action === 'confirm-credit-note') return confirmCreditNote();
  }

  function onDocumentClick(event) {
    const action = event.target.closest('[data-oi-row-action]');
    if (action) {
      event.preventDefault();
      const type = action.dataset.oiRowAction;
      const id = action.dataset.invoiceId;
      closeActionMenu();
      return handleRowAction(type, id);
    }
    if (!event.target.closest('[data-oi-menu]') && !event.target.closest('#oi-action-menu')) {
      closeActionMenu();
    }
  }

  function init() {
    ensureShell();
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('scroll', closeActionMenu, true);
    window.addEventListener('resize', closeActionMenu);
    let attempts = 0;
    const timer = setInterval(() => {
      const nav = document.getElementById('nav-facturas');
      if (nav) nav.style.display = canRead() ? '' : 'none';
      if (canRead() && db()) clearInterval(timer);
      else if (++attempts > 120) clearInterval(timer);
    }, 100);
  }

  Object.assign(I, { open, load, render, openDetail, canRead, canManage, exportExcel });
  Object.assign(window, { abrirFacturasOperador: open, cargarFacturasOperador: load });
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();

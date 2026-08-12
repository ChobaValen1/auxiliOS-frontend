/* AuxiliOS · Prestadoras / Empresas v2 · módulo canónico autosuficiente */
(() => {
  'use strict';

  const S = {
    companies: [], summaries: new Map(), selectedId: null, selected: null,
    contacts: [], branches: [], audit: [], view: 'list', tab: 'summary',
    editCompany: null, editContact: null, editBranch: null,
    loading: false, detailLoading: false,
  };

  const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const profile = () => typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : (window.PERFIL_USUARIO || {});
  const role = () => norm(profile()?.roles?.name || profile()?.role?.name || profile()?.role || profile()?.role_name || '');
  const canRead = () => ['administracion', 'facturacion', 'supervision'].includes(role());
  const canWrite = () => role() === 'administracion';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = v => String(v ?? '').trim() || null;
  const digits = v => String(v || '').replace(/\D/g, '');
  const cuit = v => { const d = digits(v); return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : (v || '—'); };
  const notify = (message, type = 'info') => typeof toast === 'function' ? toast(message, type) : console[type === 'error' ? 'error' : 'log'](message);
  const openModalSafe = id => typeof openModal === 'function' ? openModal(id) : document.getElementById(id)?.classList.add('open');
  const closeModalSafe = id => typeof closeModal === 'function' ? closeModal(id) : document.getElementById(id)?.classList.remove('open');
  const statusLabel = value => ({ active: 'Activa', suspended: 'Suspendida', inactive: 'Inactiva' }[value] || value || 'Sin estado');
  const categoryLabel = value => ({ primary: 'Primario', secondary: 'Secundario', mixed: 'Mixto' }[value] || value || '—');
  const unitLabel = value => ({ service: 'Por servicio', hour: 'Por hora', unit: 'Por unidad', day: 'Por día', fixed: 'Monto fijo', km: 'Por km' }[value] || value || '—');
  const routeLabel = value => ({ base_origin_destination_base: 'Base → Origen → Destino → Base', base_origin: 'Base → Origen', origin_destination: 'Origen → Destino', manual: 'Kilometraje manual' }[value] || 'Sin definir');
  const tollLabel = value => ({ route_estimate: 'Estimación por ruta', manual: 'Carga manual / comprobante', not_applicable: 'No corresponde' }[value] || 'Sin definir');
  const currentSummary = () => S.summaries.get(S.selectedId) || emptySummary();

  function emptySummary() {
    return { configuration: { services: [] }, billing: { setting: null, links: [] }, tariffs: null, bases: [], services: [], enabledServices: [], configured: false, hasTariff: false, alerts: ['Configuración pendiente'], completion: 0 };
  }

  function injectAssets() {
    if (!document.getElementById('empresas-v2-css')) {
      const css = document.createElement('link');
      css.id = 'empresas-v2-css'; css.rel = 'stylesheet'; css.href = '/empresas-v2.css';
      document.head.appendChild(css);
    }
    if (!document.getElementById('empresas-v2-canonical-css')) {
      document.head.insertAdjacentHTML('beforeend', `<style id="empresas-v2-canonical-css">
        .empv2-config-list{display:grid;gap:8px}.empv2-config-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:11px 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg)}.empv2-config-row b{display:block;font-size:11px;color:var(--text)}.empv2-config-row small{display:block;margin-top:3px;font-size:9px;line-height:1.4;color:var(--muted2)}.empv2-inline-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.empv2-equal-base{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center}.empv2-equal-base:after{content:'Habilitada';font-size:8px;font-weight:800;color:var(--green);padding:3px 7px;border:1px solid rgba(39,196,122,.28);border-radius:999px}.empv2-section-actions{display:flex;gap:8px;flex-wrap:wrap}.empv2-simple-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.empv2-simple-stat{padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--bg)}.empv2-simple-stat small{display:block;font-size:8px;text-transform:uppercase;color:var(--muted)}.empv2-simple-stat b{display:block;margin-top:5px;font-size:11px;color:var(--text)}.empv2-card-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.empv2-card-actions button{font-size:9px}.empv2-plain-card{padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--bg)}.empv2-plain-card b{display:block;font-size:11px;color:var(--text)}.empv2-plain-card small{display:block;margin-top:4px;font-size:9px;color:var(--muted2);line-height:1.4}.empv2-modal{width:min(720px,calc(100vw - 24px));max-width:720px}.empv2-form-check{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text);margin:8px 0}.empv2-form-check input{accent-color:var(--amber)}
        @media(max-width:760px){.empv2-simple-grid{grid-template-columns:1fr}.empv2-equal-base{grid-template-columns:1fr}}
      </style>`);
    }
  }

  function ensureModals() {
    if (!document.getElementById('modal-empresa')) {
      document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-empresa"><div class="modal-box empv2-modal"><div class="modal-head"><span class="modal-head-title" id="ec-title">Nueva prestadora</span><button class="modal-close" type="button" data-emp-close="modal-empresa">×</button></div><div class="modal-body">
        <div class="form-grid-2"><div class="form-group"><label class="form-label">Razón social *</label><input class="form-input" id="ec-legal"></div><div class="form-group"><label class="form-label">Nombre comercial</label><input class="form-input" id="ec-trade"></div></div>
        <div class="form-grid-2"><div class="form-group"><label class="form-label">CUIT</label><input class="form-input" id="ec-cuit" inputmode="numeric"></div><div class="form-group"><label class="form-label">Estado</label><select class="form-input" id="ec-status"><option value="active">Activa</option><option value="suspended">Suspendida</option><option value="inactive">Inactiva</option></select></div></div>
        <div class="form-grid-2"><div class="form-group"><label class="form-label">Teléfono</label><input class="form-input" id="ec-phone"></div><div class="form-group"><label class="form-label">WhatsApp</label><input class="form-input" id="ec-wa"></div></div>
        <div class="form-grid-2"><div class="form-group"><label class="form-label">Email operativo</label><input class="form-input" id="ec-op" type="email"></div><div class="form-group"><label class="form-label">Email facturación</label><input class="form-input" id="ec-bill" type="email"></div></div>
        <div class="form-group"><label class="form-label">Condición de pago (días)</label><input class="form-input" id="ec-days" type="number" min="0" max="365" value="30"></div><div class="form-group"><label class="form-label">Observaciones</label><textarea class="form-input" id="ec-notes"></textarea></div><div class="modal-error" id="ec-error" style="display:none"></div>
        </div><div class="modal-footer"><button class="btn btn-ghost" type="button" data-emp-close="modal-empresa">Cancelar</button><button class="btn btn-primary" id="ec-save" type="button">Guardar</button></div></div></div>`);
    }
    if (!document.getElementById('modal-emp-contact')) {
      document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-emp-contact"><div class="modal-box"><div class="modal-head"><span class="modal-head-title" id="ct-title">Nuevo contacto</span><button class="modal-close" type="button" data-emp-close="modal-emp-contact">×</button></div><div class="modal-body"><div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="ct-name"></div><div class="form-grid-2"><div class="form-group"><label class="form-label">Cargo</label><input class="form-input" id="ct-job"></div><div class="form-group"><label class="form-label">Tipo</label><select class="form-input" id="ct-type"><option value="operativo">Operativo</option><option value="facturacion">Facturación</option><option value="comercial">Comercial</option><option value="otro">Otro</option></select></div></div><div class="form-grid-2"><div class="form-group"><label class="form-label">Teléfono</label><input class="form-input" id="ct-phone"></div><div class="form-group"><label class="form-label">WhatsApp</label><input class="form-input" id="ct-wa"></div></div><div class="form-group"><label class="form-label">Email</label><input class="form-input" id="ct-email" type="email"></div><label class="empv2-form-check"><input id="ct-primary" type="checkbox"> Contacto principal</label><div class="form-group"><label class="form-label">Notas</label><textarea class="form-input" id="ct-notes"></textarea></div><div class="modal-error" id="ct-error" style="display:none"></div></div><div class="modal-footer"><button class="btn btn-ghost" type="button" data-emp-close="modal-emp-contact">Cancelar</button><button class="btn btn-primary" id="ct-save" type="button">Guardar</button></div></div></div>`);
    }
    if (!document.getElementById('modal-emp-branch')) {
      document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-emp-branch"><div class="modal-box empv2-modal"><div class="modal-head"><span class="modal-head-title" id="br-title">Nueva sucursal</span><button class="modal-close" type="button" data-emp-close="modal-emp-branch">×</button></div><div class="modal-body"><div class="form-grid-2"><div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="br-name"></div><div class="form-group"><label class="form-label">Código</label><input class="form-input" id="br-code"></div></div><div class="form-group"><label class="form-label">Dirección *</label><input class="form-input" id="br-address"></div><div class="form-grid-2"><div class="form-group"><label class="form-label">Localidad</label><input class="form-input" id="br-city"></div><div class="form-group"><label class="form-label">Provincia</label><input class="form-input" id="br-province" value="Buenos Aires"></div></div><div class="form-grid-2"><div class="form-group"><label class="form-label">Código postal</label><input class="form-input" id="br-postal"></div><div class="form-group"><label class="form-label">Teléfono</label><input class="form-input" id="br-phone"></div></div><div class="form-group"><label class="form-label">Email operativo</label><input class="form-input" id="br-email" type="email"></div><div class="form-grid-2"><div class="form-group"><label class="form-label">Latitud</label><input class="form-input" id="br-lat"></div><div class="form-group"><label class="form-label">Longitud</label><input class="form-input" id="br-lng"></div></div><div class="form-group"><label class="form-label">Horarios</label><input class="form-input" id="br-hours"></div><label class="empv2-form-check"><input id="br-primary" type="checkbox"> Sucursal principal</label><div class="form-group"><label class="form-label">Notas</label><textarea class="form-input" id="br-notes"></textarea></div><div class="modal-error" id="br-error" style="display:none"></div></div><div class="modal-footer"><button class="btn btn-ghost" type="button" data-emp-close="modal-emp-branch">Cancelar</button><button class="btn btn-primary" id="br-save" type="button">Guardar</button></div></div></div>`);
    }
    document.querySelectorAll('[data-emp-close]').forEach(button => { if (button.dataset.boundEmp) return; button.dataset.boundEmp = '1'; button.addEventListener('click', () => closeModalSafe(button.dataset.empClose)); });
    const companySave = document.getElementById('ec-save'); if (companySave && !companySave.dataset.boundEmp) { companySave.dataset.boundEmp = '1'; companySave.addEventListener('click', saveCompany); }
    const contactSave = document.getElementById('ct-save'); if (contactSave && !contactSave.dataset.boundEmp) { contactSave.dataset.boundEmp = '1'; contactSave.addEventListener('click', saveContact); }
    const branchSave = document.getElementById('br-save'); if (branchSave && !branchSave.dataset.boundEmp) { branchSave.dataset.boundEmp = '1'; branchSave.addEventListener('click', saveBranch); }
  }

  function mount() {
    injectAssets(); ensureModals();
    const screen = document.getElementById('screen-empresas');
    if (!screen) return false;
    screen.classList.add('emp-v2');
    if (!document.getElementById('empv2-root')) screen.innerHTML = '<div id="empv2-root" class="empv2-root"><div class="empv2-loading">Cargando prestadoras…</div></div>';
    return true;
  }

  async function fetchSummary(companyId) {
    const [configResult, billingResult, tariffResult] = await Promise.all([
      _db.rpc('get_company_configuration_v2', { p_company_id: companyId }),
      _db.rpc('get_company_billing_configuration', { p_company_id: companyId, p_scheduled_for: new Date().toISOString() }),
      _db.rpc('get_company_tariffs_v4', { p_company_id: companyId }),
    ]);
    if (configResult.error) throw configResult.error;
    if (billingResult.error) throw billingResult.error;
    const configuration = configResult.data || { services: [], bases: [] };
    const billing = billingResult.data || { setting: null, links: [], available_bases: [] };
    const tariffs = tariffResult.error ? null : (tariffResult.data || null);
    const bases = (billing.links || []).filter(base => base.is_active !== false && base.base_active !== false);
    const services = Array.isArray(configuration.services) ? configuration.services : [];
    const enabledServices = services.filter(service => service.is_enabled === true);
    const hasTariff = Boolean(tariffs?.active_card?.rate_card_id);
    const alerts = [];
    if (!bases.length) alerts.push('Sin bases habilitadas');
    if (!enabledServices.length) alerts.push('Sin servicios habilitados');
    if (!billing.setting) alerts.push('Sin parámetros de facturación');
    if (!hasTariff) alerts.push('Sin tarifario publicado');
    const completion = Math.round(([bases.length > 0, enabledServices.length > 0, Boolean(billing.setting), hasTariff].filter(Boolean).length / 4) * 100);
    return { configuration, billing, tariffs, bases, services, enabledServices, hasTariff, alerts, completion, configured: completion === 100 };
  }

  async function hydrateSummaries() {
    const queue = S.companies.filter(company => company.status !== 'inactive' && !S.summaries.has(company.company_id));
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) {
        const company = queue.shift(); if (!company) continue;
        try { S.summaries.set(company.company_id, await fetchSummary(company.company_id)); }
        catch (error) { console.warn('[prestadoras] resumen', company.company_id, error?.message || error); S.summaries.set(company.company_id, emptySummary()); }
        render();
      }
    });
    await Promise.all(workers);
  }

  async function fetchAudit(companyId) {
    const { data, error } = await _db.from('audit_events').select('event_id,occurred_at,actor_id,operation,entity_table,entity_id,before_data,after_data').order('occurred_at', { ascending: false }).limit(120);
    if (error) return [];
    return (data || []).filter(event => event.entity_id === companyId || event.before_data?.company_id === companyId || event.after_data?.company_id === companyId).slice(0, 30);
  }

  async function load(options = {}) {
    if (!canRead() || S.loading) return;
    if (!mount()) return;
    const preserveSelection = Boolean(options?.preserveSelection);
    const previous = preserveSelection ? S.selectedId : null;
    S.loading = true;
    try {
      const { data, error } = await _db.from('companies').select('*').order('legal_name');
      if (error) throw error;
      S.companies = data || [];
      S.summaries.clear();
      if (previous && S.companies.some(company => company.company_id === previous)) S.selectedId = previous;
      else if (!preserveSelection) { S.selectedId = null; S.selected = null; S.view = 'list'; S.tab = 'summary'; }
      render();
      hydrateSummaries();
      if (S.selectedId) await selectCompany(S.selectedId, false);
    } catch (error) { notify(error?.message || 'No se pudieron cargar las prestadoras', 'error'); }
    finally { S.loading = false; render(); }
  }

  async function selectCompany(companyId, rerender = true) {
    if (!canRead() || !companyId || S.detailLoading) return;
    S.selectedId = companyId;
    S.selected = S.companies.find(company => company.company_id === companyId) || null;
    S.view = 'detail';
    window.__auxCompanySelected = companyId;
    S.detailLoading = true;
    if (rerender) render();
    try {
      const summaryPromise = S.summaries.has(companyId) ? Promise.resolve(S.summaries.get(companyId)) : fetchSummary(companyId);
      const [contacts, branches, summary, audit] = await Promise.all([
        _db.from('company_contacts').select('*').eq('company_id', companyId).eq('is_active', true).order('is_primary', { ascending: false }).order('full_name'),
        _db.from('company_branches').select('*').eq('company_id', companyId).eq('is_active', true).order('is_primary', { ascending: false }).order('name'),
        summaryPromise,
        fetchAudit(companyId),
      ]);
      if (contacts.error) throw contacts.error;
      if (branches.error) throw branches.error;
      S.contacts = contacts.data || [];
      S.branches = branches.data || [];
      S.summaries.set(companyId, summary || emptySummary());
      S.audit = audit;
    } catch (error) { notify(error?.message || 'No se pudo cargar el detalle de la prestadora', 'error'); }
    finally { S.detailLoading = false; render(); }
  }

  function initials(company) {
    const text = company?.trade_name || company?.legal_name || 'PR';
    return text.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  }

  function renderList() {
    const query = norm(document.getElementById('empv2-search')?.value || '');
    const filter = document.getElementById('empv2-filter')?.value || 'all';
    const rows = S.companies.filter(company => (filter === 'all' || company.status === filter) && (!query || norm(`${company.legal_name} ${company.trade_name || ''} ${company.company_code || ''} ${company.cuit || ''}`).includes(query)));
    const configured = [...S.summaries.values()].filter(summary => summary.configured).length;
    return `<div class="empv2-page"><div class="empv2-page-head"><div><div class="empv2-eyebrow">Configuración comercial</div><h2>Prestadoras / Empresas</h2><p>Alta, servicios habilitados, bases, parámetros y tarifario desde una sola ficha.</p></div>${canWrite() ? '<button class="btn btn-primary empv2-primary" id="empv2-new" type="button">＋ Nueva prestadora</button>' : ''}</div>${canRead() && !canWrite() ? '<div class="empv2-readonly">Acceso de consulta. Las modificaciones corresponden a Administración.</div>' : ''}<div class="empv2-kpis"><article class="empv2-kpi blue"><div><span>Total</span><b>${S.companies.length}</b><small>Prestadoras registradas</small></div></article><article class="empv2-kpi green"><div><span>Activas</span><b>${S.companies.filter(c => c.status === 'active').length}</b><small>Disponibles para operar</small></div></article><article class="empv2-kpi amber"><div><span>Configuradas</span><b>${configured}</b><small>Base + servicios + parámetros + tarifa</small></div></article><article class="empv2-kpi red"><div><span>Con pendientes</span><b>${Math.max(0, S.companies.filter(c => c.status !== 'inactive').length - configured)}</b><small>Requieren configuración</small></div></article></div><section class="empv2-main-card"><div class="empv2-toolbar"><div class="empv2-search"><span>⌕</span><input id="empv2-search" placeholder="Buscar por nombre, código o CUIT" value="${esc(document.getElementById('empv2-search')?.value || '')}"></div><select id="empv2-filter"><option value="all" ${filter === 'all' ? 'selected' : ''}>Todos los estados</option><option value="active" ${filter === 'active' ? 'selected' : ''}>Activas</option><option value="suspended" ${filter === 'suspended' ? 'selected' : ''}>Suspendidas</option><option value="inactive" ${filter === 'inactive' ? 'selected' : ''}>Inactivas</option></select><button class="btn btn-ghost" id="empv2-refresh" type="button">↻</button></div><div class="empv2-table-wrap"><table class="empv2-table"><thead><tr><th>Prestadora</th><th>Estado</th><th>Bases</th><th>Servicios</th><th>Tarifario</th><th>Configuración</th><th></th></tr></thead><tbody>${rows.map(company => {
      const summary = S.summaries.get(company.company_id) || emptySummary();
      return `<tr data-empv2-company="${esc(company.company_id)}"><td><div class="empv2-company-cell"><div class="empv2-avatar">${esc(initials(company))}</div><div><b>${esc(company.trade_name || company.legal_name)}</b><small>${esc(company.legal_name)} · ${esc(cuit(company.cuit))}</small></div></div></td><td><span class="empv2-status ${esc(company.status)}"><i></i>${esc(statusLabel(company.status))}</span></td><td><div class="empv2-count"><b>${summary.bases.length}</b><small> habilitadas</small></div></td><td><div class="empv2-count"><b>${summary.enabledServices.length}</b><small> habilitados</small></div></td><td><span class="empv2-tariff ${summary.hasTariff ? 'ok' : 'bad'}">${summary.hasTariff ? `v${esc(summary.tariffs?.active_card?.version || '—')} publicada` : 'Pendiente'}</span></td><td><span class="empv2-chip ${summary.configured ? 'blue' : 'red'}">${summary.completion}%</span></td><td><button class="empv2-open" type="button">Abrir ›</button></td></tr>`;
    }).join('')}</tbody></table></div><div class="empv2-table-foot">${rows.length} resultado${rows.length === 1 ? '' : 's'}</div></section></div>`;
  }

  function tabs() {
    const items = [['summary', 'Resumen'], ['general', 'Datos y contactos'], ['billing', 'Parámetros de facturación'], ['services', 'Servicios habilitados'], ['tariffs', 'Tarifas'], ['history', 'Historial']];
    return `<div class="empv2-tabs">${items.map(([id, label]) => `<button type="button" data-empv2-tab="${id}" class="${S.tab === id ? 'active' : ''}">${label}</button>`).join('')}</div>`;
  }

  function summaryTab(summary) {
    const cards = [
      ['billing', 'Parámetros de facturación', `${summary.bases.length} base${summary.bases.length === 1 ? '' : 's'} · ${summary.billing.setting ? 'regla configurada' : 'pendiente'}`, summary.bases.length && summary.billing.setting ? 'Configurado' : 'Pendiente'],
      ['services', 'Servicios habilitados', `${summary.enabledServices.length} servicio${summary.enabledServices.length === 1 ? '' : 's'} disponibles para esta prestadora`, summary.enabledServices.length ? 'Configurado' : 'Pendiente'],
      ['tariffs', 'Tarifas', summary.hasTariff ? `Tarifario v${summary.tariffs?.active_card?.version || '—'} publicado` : 'Sin tarifario publicado', summary.hasTariff ? 'Configurado' : 'Pendiente'],
    ];
    return `<div class="empv2-feature-grid">${cards.map(([tab, title, desc, state]) => `<article class="empv2-feature-card"><div class="empv2-feature-top"><span>◆</span><div><h3>${title}</h3><p>${esc(desc)}</p></div></div><div class="empv2-feature-foot"><em class="${state === 'Configurado' ? 'ok' : 'warn'}">${state}</em><button type="button" data-empv2-tab-jump="${tab}">Ver</button></div></article>`).join('')}</div>${summary.alerts.length ? `<section class="empv2-alert-strip"><h3>Pendientes de configuración</h3><div class="empv2-alert-grid">${summary.alerts.map(alert => `<div class="empv2-alert-item"><span class="warn">!</span><div><b>${esc(alert)}</b><small>Completalo para dejar la prestadora lista para operar.</small></div></div>`).join('')}</div></section>` : '<div class="empv2-readonly" style="color:var(--green);border-color:rgba(39,196,122,.28)">Configuración comercial completa.</div>'}`;
  }

  function generalTab(company) {
    return `<section class="empv2-section-card"><div class="empv2-section-head"><div><h3>Datos generales</h3><p>Información legal, operativa y de facturación.</p></div>${canWrite() ? '<button class="btn btn-ghost" id="empv2-edit-company" type="button">Editar prestadora</button>' : ''}</div><div class="empv2-simple-grid"><article class="empv2-simple-stat"><small>Razón social</small><b>${esc(company.legal_name)}</b></article><article class="empv2-simple-stat"><small>CUIT</small><b>${esc(cuit(company.cuit))}</b></article><article class="empv2-simple-stat"><small>Condición de pago</small><b>${Number(company.payment_terms_days || 0)} días</b></article><article class="empv2-simple-stat"><small>Email operativo</small><b>${esc(company.operational_email || '—')}</b></article><article class="empv2-simple-stat"><small>Email facturación</small><b>${esc(company.billing_email || '—')}</b></article><article class="empv2-simple-stat"><small>Teléfono / WhatsApp</small><b>${esc(company.whatsapp || company.phone || '—')}</b></article></div></section><div class="empv2-simple-grid" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:12px"><section class="empv2-section-card"><div class="empv2-section-head"><div><h3>Contactos</h3><p>Referentes de la prestadora.</p></div>${canWrite() ? '<button class="btn btn-primary" id="empv2-new-contact" type="button">＋ Contacto</button>' : ''}</div><div class="empv2-config-list">${S.contacts.length ? S.contacts.map(contact => `<article class="empv2-plain-card"><b>${esc(contact.full_name)}${contact.is_primary ? ' · Principal' : ''}</b><small>${esc(contact.job_title || contact.contact_type || '')}<br>${esc(contact.email || contact.whatsapp || contact.phone || '')}</small>${canWrite() ? `<div class="empv2-card-actions"><button class="btn btn-ghost" data-empv2-contact="${esc(contact.contact_id)}">Editar</button><button class="btn btn-ghost" data-empv2-contact-off="${esc(contact.contact_id)}">Desactivar</button></div>` : ''}</article>`).join('') : '<div class="empv2-empty">Sin contactos activos.</div>'}</div></section><section class="empv2-section-card"><div class="empv2-section-head"><div><h3>Sucursales</h3><p>Sedes administrativas u operativas de la empresa.</p></div>${canWrite() ? '<button class="btn btn-primary" id="empv2-new-branch" type="button">＋ Sucursal</button>' : ''}</div><div class="empv2-config-list">${S.branches.length ? S.branches.map(branch => `<article class="empv2-plain-card"><b>${esc(branch.name)}${branch.is_primary ? ' · Principal' : ''}</b><small>${esc(branch.address || 'Sin dirección')}<br>${esc([branch.city, branch.province].filter(Boolean).join(', '))}</small>${canWrite() ? `<div class="empv2-card-actions"><button class="btn btn-ghost" data-empv2-branch="${esc(branch.branch_id)}">Editar</button><button class="btn btn-ghost" data-empv2-branch-off="${esc(branch.branch_id)}">Desactivar</button></div>` : ''}</article>`).join('') : '<div class="empv2-empty">Sin sucursales activas.</div>'}</div></section></div>`;
  }

  function billingTab(summary) {
    const setting = summary.billing.setting || {};
    return `<section class="empv2-section-card"><div class="empv2-section-head"><div><h3>Parámetros de facturación</h3><p>Bases habilitadas, recorrido, peajes y vigencia. No existe una base principal: todas las habilitadas tienen igual jerarquía.</p></div>${canWrite() ? '<button class="btn btn-primary" id="empv2-edit-billing" type="button">Editar parámetros</button>' : ''}</div><div class="empv2-simple-grid"><article class="empv2-simple-stat"><small>Recorrido</small><b>${esc(routeLabel(setting.route_mode))}</b></article><article class="empv2-simple-stat"><small>Peajes</small><b>${esc(tollLabel(setting.toll_calculation_mode))}</b></article><article class="empv2-simple-stat"><small>Vigencia</small><b>${esc(setting.valid_from || 'Sin definir')}${setting.valid_until ? ` → ${esc(setting.valid_until)}` : ''}</b></article></div><div style="margin-top:14px"><div class="empv2-eyebrow">Bases habilitadas para esta prestadora</div><div class="empv2-config-list">${summary.bases.length ? summary.bases.map(base => `<article class="empv2-config-row empv2-equal-base"><div><b>${esc(base.name || base.base_name || 'Base')}</b><small>${esc(base.address || base.formatted_address || 'Sin dirección')}</small></div></article>`).join('') : '<div class="empv2-empty">No hay bases habilitadas.</div>'}</div></div></section>`;
  }

  function servicesTab(summary) {
    return `<section class="empv2-section-card"><div class="empv2-section-head"><div><h3>Servicios habilitados</h3><p>Allowlist de Tipos de Servicio existentes. Los servicios se crean únicamente en Configuración → Tipos de servicio.</p></div>${canWrite() ? '<button class="btn btn-primary" id="empv2-edit-services" type="button">Configurar servicios</button>' : ''}</div><div class="empv2-config-list">${summary.enabledServices.length ? summary.enabledServices.map(service => `<article class="empv2-config-row"><div><b>${esc(service.name)}</b><div class="empv2-inline-chips"><span class="empv2-chip blue">${esc(categoryLabel(service.category))}</span><span class="empv2-chip blue">${esc(unitLabel(service.pricing_unit))}</span><span class="empv2-chip ${service.distance_chargeable ? 'blue' : ''}">${service.distance_chargeable ? 'Suma KM' : 'No suma KM'}</span></div></div></article>`).join('') : '<div class="empv2-empty">No hay servicios habilitados para esta prestadora.</div>'}</div></section>`;
  }

  function tariffsTab(summary) {
    const tariffs = summary.tariffs || {};
    const services = tariffs.services || [];
    const active = tariffs.active_card;
    const draft = tariffs.draft_card;
    return `<section class="empv2-section-card"><div class="empv2-section-head"><div><h3>Tarifas</h3><p>Tarifario V4 versionado. La tarifa general aplica a las bases habilitadas de esta prestadora; las diferencias se manejan como excepciones por base.</p></div><button class="btn btn-primary" id="empv2-open-tariffs" type="button">Abrir Tarifas</button></div><div class="empv2-simple-grid"><article class="empv2-simple-stat"><small>Publicada</small><b>${active ? `v${esc(active.version)} · ${esc(active.valid_from)}` : 'Sin tarifario'}</b></article><article class="empv2-simple-stat"><small>Borrador</small><b>${draft ? `v${esc(draft.version)} · ${esc(draft.valid_from)}` : 'Sin borrador'}</b></article><article class="empv2-simple-stat"><small>Pendientes</small><b>${Number(tariffs.pending_count || 0)}</b></article></div><div class="empv2-config-list" style="margin-top:14px">${services.length ? services.map(service => `<article class="empv2-config-row"><div><b>${esc(service.name)}</b><small>${service.general_rate ? 'Tarifa general configurada' : 'Pendiente de tarifar'}${(service.base_exceptions || []).length ? ` · ${(service.base_exceptions || []).length} excepción(es) por base` : ''}</small></div><span class="empv2-chip ${service.general_rate ? 'blue' : 'red'}">${service.general_rate ? 'Tarifado' : 'Pendiente'}</span></article>`).join('') : '<div class="empv2-empty">No hay servicios habilitados para tarifar.</div>'}</div></section>`;
  }

  function historyTab() {
    return `<section class="empv2-section-card"><div class="empv2-section-head"><div><h3>Historial</h3><p>Últimos cambios asociados a esta prestadora.</p></div></div><div class="empv2-config-list">${S.audit.length ? S.audit.map(event => `<article class="empv2-config-row"><div><b>${esc(String(event.entity_table || '').replaceAll('_', ' '))}</b><small>${esc(event.operation || 'CAMBIO')} · ${event.occurred_at ? new Date(event.occurred_at).toLocaleString('es-AR') : '—'}</small></div></article>`).join('') : '<div class="empv2-empty">Sin eventos visibles.</div>'}</div></section>`;
  }

  function renderDetail() {
    const company = S.selected || S.companies.find(c => c.company_id === S.selectedId);
    if (!company) return renderList();
    const summary = currentSummary();
    let body = summaryTab(summary);
    if (S.tab === 'general') body = generalTab(company);
    if (S.tab === 'billing') body = billingTab(summary);
    if (S.tab === 'services') body = servicesTab(summary);
    if (S.tab === 'tariffs') body = tariffsTab(summary);
    if (S.tab === 'history') body = historyTab();
    return `<div class="empv2-detail-page"><div class="empv2-breadcrumb"><button id="empv2-back" type="button">Prestadoras</button><span>›</span><span>${esc(company.trade_name || company.legal_name)}</span></div><section class="empv2-company-hero"><div class="empv2-hero-main"><div class="empv2-hero-avatar">${esc(initials(company))}</div><div><div class="empv2-title-line"><h2>${esc(company.trade_name || company.legal_name)}</h2><span class="empv2-status ${esc(company.status)}"><i></i>${esc(statusLabel(company.status))}</span></div><div class="empv2-contact-line"><span>${esc(company.legal_name)}</span><span>CUIT ${esc(cuit(company.cuit))}</span>${company.billing_email ? `<span>${esc(company.billing_email)}</span>` : ''}</div></div></div><div class="empv2-hero-stats"><article class="empv2-hero-stat"><div><small>Bases habilitadas</small><b>${summary.bases.length}</b></div></article><article class="empv2-hero-stat"><div><small>Servicios</small><b>${summary.enabledServices.length}</b></div></article><article class="empv2-hero-stat"><div><small>Tarifario</small><b>${summary.hasTariff ? `v${esc(summary.tariffs?.active_card?.version || '—')}` : 'Pendiente'}</b></div></article><article class="empv2-hero-stat"><div><small>Configuración</small><b>${summary.completion}%</b></div></article></div></section>${tabs()}<div>${S.detailLoading ? '<div class="empv2-loading">Actualizando configuración…</div>' : body}</div></div>`;
  }

  function bind() {
    const root = document.getElementById('empv2-root'); if (!root) return;
    document.getElementById('empv2-new')?.addEventListener('click', () => openCompany());
    document.getElementById('empv2-refresh')?.addEventListener('click', () => load({ preserveSelection: Boolean(S.selectedId) }));
    document.getElementById('empv2-search')?.addEventListener('input', render);
    document.getElementById('empv2-filter')?.addEventListener('change', render);
    root.querySelectorAll('[data-empv2-company]').forEach(row => row.addEventListener('click', () => selectCompany(row.dataset.empv2Company)));
    document.getElementById('empv2-back')?.addEventListener('click', () => { S.view = 'list'; S.tab = 'summary'; S.selectedId = null; S.selected = null; window.__auxCompanySelected = null; render(); });
    root.querySelectorAll('[data-empv2-tab]').forEach(button => button.addEventListener('click', () => { S.tab = button.dataset.empv2Tab; render(); }));
    root.querySelectorAll('[data-empv2-tab-jump]').forEach(button => button.addEventListener('click', () => { S.tab = button.dataset.empv2TabJump; render(); }));
    document.getElementById('empv2-edit-company')?.addEventListener('click', () => openCompany(S.selectedId));
    document.getElementById('empv2-new-contact')?.addEventListener('click', () => openContact());
    document.getElementById('empv2-new-branch')?.addEventListener('click', () => openBranch());
    root.querySelectorAll('[data-empv2-contact]').forEach(button => button.addEventListener('click', () => openContact(button.dataset.empv2Contact)));
    root.querySelectorAll('[data-empv2-contact-off]').forEach(button => button.addEventListener('click', () => deactivateContact(button.dataset.empv2ContactOff)));
    root.querySelectorAll('[data-empv2-branch]').forEach(button => button.addEventListener('click', () => openBranch(button.dataset.empv2Branch)));
    root.querySelectorAll('[data-empv2-branch-off]').forEach(button => button.addEventListener('click', () => deactivateBranch(button.dataset.empv2BranchOff)));
    document.getElementById('empv2-edit-billing')?.addEventListener('click', () => window.AuxiliosBillingParametersV4?.open?.(S.selectedId));
    document.getElementById('empv2-edit-services')?.addEventListener('click', () => window.AuxiliosCompanyServicesV4?.open?.(S.selectedId));
    document.getElementById('empv2-open-tariffs')?.addEventListener('click', openTariffs);
  }

  function render() {
    const root = document.getElementById('empv2-root'); if (!root) return;
    root.innerHTML = S.view === 'detail' ? renderDetail() : renderList();
    bind();
  }

  function setError(id, message = '') { const el = document.getElementById(id); if (!el) return; el.textContent = message; el.style.display = message ? 'block' : 'none'; }

  function openCompany(id = null) {
    if (!canWrite()) return;
    const company = S.companies.find(row => row.company_id === id) || null;
    S.editCompany = company?.company_id || null;
    document.getElementById('ec-title').textContent = company ? 'Editar prestadora' : 'Nueva prestadora';
    [['ec-legal', company?.legal_name], ['ec-trade', company?.trade_name], ['ec-cuit', company?.cuit ? cuit(company.cuit) : ''], ['ec-phone', company?.phone], ['ec-wa', company?.whatsapp], ['ec-op', company?.operational_email], ['ec-bill', company?.billing_email], ['ec-days', company?.payment_terms_days ?? 30], ['ec-notes', company?.notes]].forEach(([field, value]) => { const el = document.getElementById(field); if (el) el.value = value ?? ''; });
    document.getElementById('ec-status').value = company?.status || 'active'; setError('ec-error'); openModalSafe('modal-empresa');
  }

  async function saveCompany() {
    if (!canWrite()) return;
    const legal = String(document.getElementById('ec-legal')?.value || '').trim();
    const taxId = digits(document.getElementById('ec-cuit')?.value || '');
    const days = Number(document.getElementById('ec-days')?.value || 0);
    if (legal.length < 2) return setError('ec-error', 'Ingresá una razón social válida.');
    if (taxId && taxId.length !== 11) return setError('ec-error', 'El CUIT debe tener 11 dígitos.');
    if (days < 0 || days > 365) return setError('ec-error', 'La condición de pago no es válida.');
    const payload = { legal_name: legal, trade_name: clean(document.getElementById('ec-trade')?.value), cuit: taxId || null, status: document.getElementById('ec-status')?.value || 'active', phone: clean(document.getElementById('ec-phone')?.value), whatsapp: clean(document.getElementById('ec-wa')?.value), operational_email: clean(document.getElementById('ec-op')?.value)?.toLowerCase() || null, billing_email: clean(document.getElementById('ec-bill')?.value)?.toLowerCase() || null, payment_terms_days: days, notes: clean(document.getElementById('ec-notes')?.value) };
    const result = S.editCompany ? await _db.from('companies').update(payload).eq('company_id', S.editCompany).select().single() : await _db.from('companies').insert(payload).select().single();
    if (result.error) return setError('ec-error', result.error.code === '23505' ? 'Ya existe una prestadora con ese CUIT.' : result.error.message || 'No se pudo guardar.');
    closeModalSafe('modal-empresa'); S.selectedId = result.data.company_id; S.view = 'detail'; S.editCompany = null; notify('Prestadora guardada', 'success'); await load({ preserveSelection: true });
  }

  async function deactivateCompany(id) {
    if (!canWrite() || !window.confirm('¿Desactivar esta prestadora?')) return;
    const { error } = await _db.from('companies').update({ status: 'inactive' }).eq('company_id', id);
    if (error) return notify(error.message || 'No se pudo desactivar', 'error');
    await load();
  }

  function openContact(id = null) {
    if (!canWrite() || !S.selectedId) return;
    const contact = S.contacts.find(row => row.contact_id === id) || null; S.editContact = contact?.contact_id || null;
    document.getElementById('ct-title').textContent = contact ? 'Editar contacto' : 'Nuevo contacto';
    [['ct-name', contact?.full_name], ['ct-job', contact?.job_title], ['ct-phone', contact?.phone], ['ct-wa', contact?.whatsapp], ['ct-email', contact?.email], ['ct-notes', contact?.notes]].forEach(([field, value]) => { const el = document.getElementById(field); if (el) el.value = value ?? ''; });
    document.getElementById('ct-type').value = contact?.contact_type || 'operativo'; document.getElementById('ct-primary').checked = Boolean(contact?.is_primary); setError('ct-error'); openModalSafe('modal-emp-contact');
  }

  async function saveContact() {
    if (!canWrite() || !S.selectedId) return;
    const name = String(document.getElementById('ct-name')?.value || '').trim();
    const phone = clean(document.getElementById('ct-phone')?.value); const whatsapp = clean(document.getElementById('ct-wa')?.value); const email = clean(document.getElementById('ct-email')?.value)?.toLowerCase() || null;
    const type = document.getElementById('ct-type')?.value || 'operativo'; const primary = Boolean(document.getElementById('ct-primary')?.checked);
    if (name.length < 2) return setError('ct-error', 'Ingresá el nombre.');
    if (!phone && !whatsapp && !email) return setError('ct-error', 'Ingresá al menos un medio de contacto.');
    if (primary) { let query = _db.from('company_contacts').update({ is_primary: false }).eq('company_id', S.selectedId).eq('contact_type', type).eq('is_primary', true); if (S.editContact) query = query.neq('contact_id', S.editContact); const reset = await query; if (reset.error) return setError('ct-error', reset.error.message); }
    const payload = { company_id: S.selectedId, full_name: name, job_title: clean(document.getElementById('ct-job')?.value), contact_type: type, phone, whatsapp, email, is_primary: primary, is_active: true, notes: clean(document.getElementById('ct-notes')?.value) };
    const result = S.editContact ? await _db.from('company_contacts').update(payload).eq('contact_id', S.editContact) : await _db.from('company_contacts').insert(payload);
    if (result.error) return setError('ct-error', result.error.message || 'No se pudo guardar.');
    closeModalSafe('modal-emp-contact'); S.editContact = null; await selectCompany(S.selectedId, false);
  }

  async function deactivateContact(id) {
    if (!canWrite() || !window.confirm('¿Desactivar este contacto?')) return;
    const { error } = await _db.from('company_contacts').update({ is_active: false, is_primary: false }).eq('contact_id', id); if (error) return notify(error.message, 'error'); await selectCompany(S.selectedId, false);
  }

  function openBranch(id = null) {
    if (!canWrite() || !S.selectedId) return;
    const branch = S.branches.find(row => row.branch_id === id) || null; S.editBranch = branch?.branch_id || null;
    document.getElementById('br-title').textContent = branch ? 'Editar sucursal' : 'Nueva sucursal';
    [['br-name', branch?.name], ['br-code', branch?.branch_code], ['br-address', branch?.address], ['br-city', branch?.city], ['br-province', branch?.province || 'Buenos Aires'], ['br-postal', branch?.postal_code], ['br-phone', branch?.phone], ['br-email', branch?.operational_email], ['br-lat', branch?.latitude], ['br-lng', branch?.longitude], ['br-hours', branch?.schedule_notes], ['br-notes', branch?.notes]].forEach(([field, value]) => { const el = document.getElementById(field); if (el) el.value = value ?? ''; });
    document.getElementById('br-primary').checked = Boolean(branch?.is_primary); setError('br-error'); openModalSafe('modal-emp-branch');
  }

  async function saveBranch() {
    if (!canWrite() || !S.selectedId) return;
    const name = String(document.getElementById('br-name')?.value || '').trim(); const address = String(document.getElementById('br-address')?.value || '').trim(); const primary = Boolean(document.getElementById('br-primary')?.checked); const lat = clean(document.getElementById('br-lat')?.value); const lng = clean(document.getElementById('br-lng')?.value);
    if (name.length < 2) return setError('br-error', 'Ingresá el nombre.'); if (address.length < 3) return setError('br-error', 'Ingresá la dirección.');
    if (primary) { let query = _db.from('company_branches').update({ is_primary: false }).eq('company_id', S.selectedId).eq('is_primary', true); if (S.editBranch) query = query.neq('branch_id', S.editBranch); const reset = await query; if (reset.error) return setError('br-error', reset.error.message); }
    const payload = { company_id: S.selectedId, name, address, branch_code: clean(document.getElementById('br-code')?.value)?.toUpperCase() || null, city: clean(document.getElementById('br-city')?.value), province: clean(document.getElementById('br-province')?.value) || 'Buenos Aires', postal_code: clean(document.getElementById('br-postal')?.value), phone: clean(document.getElementById('br-phone')?.value), operational_email: clean(document.getElementById('br-email')?.value)?.toLowerCase() || null, latitude: lat ? Number(lat.replace(',', '.')) : null, longitude: lng ? Number(lng.replace(',', '.')) : null, schedule_notes: clean(document.getElementById('br-hours')?.value), is_primary: primary, is_active: true, notes: clean(document.getElementById('br-notes')?.value) };
    const result = S.editBranch ? await _db.from('company_branches').update(payload).eq('branch_id', S.editBranch) : await _db.from('company_branches').insert(payload); if (result.error) return setError('br-error', result.error.message || 'No se pudo guardar.');
    closeModalSafe('modal-emp-branch'); S.editBranch = null; await selectCompany(S.selectedId, false);
  }

  async function deactivateBranch(id) {
    if (!canWrite() || !window.confirm('¿Desactivar esta sucursal?')) return;
    const { error } = await _db.from('company_branches').update({ is_active: false, is_primary: false }).eq('branch_id', id); if (error) return notify(error.message, 'error'); await selectCompany(S.selectedId, false);
  }

  function openTariffs() {
    const companyId = S.selectedId; if (!companyId || typeof goTo !== 'function') return;
    goTo('config-tariff-matrix');
    setTimeout(async () => {
      const api = window.AuxiliosCompanyTariffsV4; if (!api) return;
      api.state.companyId = companyId;
      const select = document.getElementById('ct4-company'); if (select) select.value = companyId;
      await api.loadCompany?.();
    }, 0);
  }

  function init() {
    if (!canRead()) return;
    mount(); load();
  }

  Object.assign(window, {
    cargarEmpresasV2: load,
    cargarEmpresas: load,
    seleccionarEmpresaV2: selectCompany,
    seleccionarEmpresa: selectCompany,
    abrirTabEmpresaV2: tab => { S.tab = ['summary', 'general', 'billing', 'services', 'tariffs', 'history'].includes(tab) ? tab : 'summary'; render(); },
    abrirEmpresa: openCompany,
    guardarEmpresa: saveCompany,
    desactivarEmpresa: deactivateCompany,
    abrirContacto: openContact,
    guardarContacto: saveContact,
    desactivarContacto: deactivateContact,
    abrirSucursal: openBranch,
    guardarSucursal: saveBranch,
    desactivarSucursal: deactivateBranch,
  });
  window.AuxiliosEmpresasV2 = { load, selectCompany, state: S };

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();
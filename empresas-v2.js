/* AuxiliOS · Gestión de empresas v2 */
(() => {
  'use strict';

  const S = {
    companies: [],
    summaries: new Map(),
    selectedId: null,
    selected: null,
    contacts: [],
    branches: [],
    configuration: null,
    matrix: [],
    audit: [],
    view: 'list',
    tab: 'summary',
    loading: false,
    detailLoading: false,
  };

  const ORIGINALS = {};
  const TODAY = () => new Date().toISOString().slice(0, 10);
  const role = () => String(typeof PERFIL_USUARIO === 'undefined' ? '' : (PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role || '')).toLowerCase();
  const canRead = () => ['administracion', 'facturacion', 'supervision'].includes(role());
  const canWrite = () => role() === 'administracion';
  const canSeeCommercial = () => ['administracion', 'facturacion'].includes(role());
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const digits = value => String(value || '').replace(/\D/g, '');
  const cuit = value => { const d = digits(value); return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : (value || '—'); };
  const statusLabel = value => ({ active: 'Activa', suspended: 'Suspendida', inactive: 'Inactiva' }[value] || value || 'Sin estado');
  const dateTime = value => value ? new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const money = (value, currency = 'ARS') => new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));
  const notify = (message, type = 'info') => typeof toast === 'function' ? toast(message, type) : console[type === 'error' ? 'error' : 'log'](message);

  const ICONS = {
    company: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M9 21v-3h3v3"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v4M17 3v4M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/></svg>',
    database: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
    service: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v6M6 21v-6M18 21v-6M5 9h14v6H5zM3 3h6v6H3zM15 3h6v6h-6z"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m8.5 12 2.3 2.3 4.8-5"/></svg>',
    history: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    route: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3"/></svg>',
    alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5M12 17h.01"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-1 5 5-1L19 9l-4-4L4 16Z"/><path d="m13 7 4 4"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  };

  function icon(name) { return `<span class="empv2-icon">${ICONS[name] || ICONS.company}</span>`; }
  function currentCompany() { return S.companies.find(company => company.company_id === S.selectedId) || S.selected; }
  function currentSummary(id = S.selectedId) { return S.summaries.get(id) || emptySummary(); }
  function emptySummary() { return { bases: [], services: [], matrix: [], configured: false, hasTariff: false, alerts: ['Configuración pendiente'], completion: 0, primaryBase: null, enabledServices: 0, totalServices: 0, activeRules: 0 }; }

  function mount() {
    const screen = document.getElementById('screen-empresas');
    if (!screen) return false;
    screen.classList.add('emp-v2');
    screen.innerHTML = '<div id="empv2-root" class="empv2-root"><div class="empv2-loading">Cargando gestión de empresas…</div></div>';
    const nav = document.getElementById('nav-empresas');
    if (nav) {
      const label = nav.querySelector('.nav-label');
      const iconNode = nav.querySelector('.nav-icon');
      if (label) label.textContent = 'Prestadoras / Empresas';
      if (iconNode) iconNode.innerHTML = '▦';
      nav.style.display = canRead() ? '' : 'none';
    }
    return true;
  }

  async function load() {
    if (!canRead() || S.loading) return;
    if (!document.getElementById('empv2-root')) mount();
    S.loading = true;
    render();
    try {
      const { data, error } = await _db.from('companies').select('*').order('legal_name');
      if (error) throw error;
      S.companies = data || [];
      if (S.selectedId && !S.companies.some(company => company.company_id === S.selectedId)) {
        S.selectedId = null;
        S.view = 'list';
      }
      render();
      hydrateSummaries();
      if (S.view === 'detail' && S.selectedId) await selectCompany(S.selectedId, false);
    } catch (error) {
      console.error('[empresas v2] carga:', error);
      notify('No se pudieron cargar las empresas', 'error');
      const root = document.getElementById('empv2-root');
      if (root) root.innerHTML = '<div class="empv2-empty">No se pudo cargar el módulo.</div>';
    } finally {
      S.loading = false;
      render();
    }
  }

  async function hydrateSummaries() {
    const active = S.companies.filter(company => company.status !== 'inactive');
    const queue = [...active];
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) {
        const company = queue.shift();
        if (!company || S.summaries.has(company.company_id)) continue;
        try {
          const summary = await fetchSummary(company.company_id);
          S.summaries.set(company.company_id, summary);
        } catch (error) {
          console.warn('[empresas v2] resumen:', company.company_id, error);
          S.summaries.set(company.company_id, emptySummary());
        }
        render();
      }
    });
    await Promise.all(workers);
  }

  async function fetchSummary(companyId) {
    const [configResult, billingResult] = await Promise.all([
      _db.rpc('get_company_configuration_v2', { p_company_id: companyId }),
      _db.rpc('get_company_billing_configuration', { p_company_id: companyId, p_scheduled_for: new Date().toISOString() }),
    ]);
    if (configResult.error) throw configResult.error;
    const configuration = configResult.data || { bases: [], services: [] };
    const billing = billingResult.error ? { setting: null, links: [] } : (billingResult.data || { setting: null, links: [] });
    configuration.billing_setting = billing.setting || null;
    configuration.billing = billing;
    const linkedBases = Array.isArray(billing.links) ? billing.links.filter(base => base.is_active !== false && base.base_active !== false) : [];
    const bases = linkedBases.length ? linkedBases : (Array.isArray(configuration.bases) ? configuration.bases : []);
    const services = Array.isArray(configuration.services) ? configuration.services : [];
    const primaryBase = bases.find(base => base.is_primary) || bases[0] || null;
    let matrix = [];
    const matrixResult = await _db.rpc('list_company_tariff_matrix_v2', {
      p_company_id: companyId,
      p_base_id: primaryBase?.base_id || null,
      p_as_of: TODAY(),
    });
    if (!matrixResult.error && Array.isArray(matrixResult.data)) matrix = matrixResult.data;
    const enabled = services.filter(service => service.is_enabled !== false);
    const hasTariff = matrix.some(row => row.valid_from && (
      row.service_day_value != null || row.service_day_mode === 'automatic' || row.asphalt_day_value != null || row.asphalt_day_mode === 'automatic'
    ));
    const alerts = [];
    if (!bases.length) alerts.push('Sin base asignada');
    if (!enabled.length) alerts.push('Sin servicios habilitados');
    if (!hasTariff) alerts.push('Sin tarifario vigente');
    const configured = bases.length > 0 && enabled.length > 0 && hasTariff;
    const completion = Math.round(([bases.length > 0, enabled.length > 0, hasTariff, Boolean(configuration.billing_setting)].filter(Boolean).length / 4) * 100);
    return {
      configuration,
      bases,
      services,
      matrix,
      configured,
      hasTariff,
      alerts,
      completion,
      primaryBase,
      enabledServices: enabled.length,
      totalServices: services.length,
      activeRules: [configuration.billing_setting?.route_mode, configuration.billing_setting?.toll_calculation_mode, configuration.billing_setting?.requires_verified_base].filter(Boolean).length,
    };
  }

  async function selectCompany(companyId, rerender = true) {
    if (!canRead() || !companyId || S.detailLoading) return;
    S.selectedId = companyId;
    S.selected = S.companies.find(company => company.company_id === companyId) || null;
    S.view = 'detail';
    S.detailLoading = true;
    if (rerender) render();
    try {
      const summaryPromise = S.summaries.has(companyId) ? Promise.resolve(S.summaries.get(companyId)) : fetchSummary(companyId);
      const [contactsResult, branchesResult, summary, audit] = await Promise.all([
        _db.from('company_contacts').select('*').eq('company_id', companyId).order('is_primary', { ascending: false }).order('full_name'),
        _db.from('company_branches').select('*').eq('company_id', companyId).order('is_primary', { ascending: false }).order('name'),
        summaryPromise,
        fetchAudit(companyId),
      ]);
      if (contactsResult.error) throw contactsResult.error;
      if (branchesResult.error) throw branchesResult.error;
      S.contacts = contactsResult.data || [];
      S.branches = branchesResult.data || [];
      S.summaries.set(companyId, summary || emptySummary());
      S.configuration = summary?.configuration || null;
      S.matrix = summary?.matrix || [];
      S.audit = audit;
    } catch (error) {
      console.error('[empresas v2] detalle:', error);
      notify('No se pudo cargar el detalle de la empresa', 'error');
    } finally {
      S.detailLoading = false;
      render();
    }
  }

  async function fetchAudit(companyId) {
    const { data, error } = await _db.from('audit_events')
      .select('event_id,occurred_at,actor_id,operation,entity_table,entity_id,before_data,after_data')
      .order('occurred_at', { ascending: false })
      .limit(120);
    if (error) return [];
    return (data || []).filter(event => {
      const beforeId = event.before_data?.company_id || event.before_data?.companyId;
      const afterId = event.after_data?.company_id || event.after_data?.companyId;
      return event.entity_id === companyId || beforeId === companyId || afterId === companyId;
    }).slice(0, 30);
  }

  function render() {
    const root = document.getElementById('empv2-root');
    if (!root) return;
    if (!canRead()) {
      root.innerHTML = '<div class="empv2-empty">Tu rol no tiene acceso al módulo de empresas.</div>';
      return;
    }
    root.innerHTML = S.view === 'detail' && S.selectedId ? detailTemplate() : listTemplate();
  }

  function listTemplate() {
    const q = String(document.getElementById('empv2-q')?.value || '').toLowerCase().trim();
    const filter = document.getElementById('empv2-filter')?.value || 'all';
    const rows = S.companies.filter(company => {
      const summary = currentSummary(company.company_id);
      const matchesText = !q || `${company.company_code || ''} ${company.legal_name || ''} ${company.trade_name || ''} ${company.cuit || ''}`.toLowerCase().includes(q);
      const matchesFilter = filter === 'all' || company.status === filter || (filter === 'incomplete' && !summary.configured);
      return matchesText && matchesFilter;
    });
    const active = S.companies.filter(company => company.status === 'active').length;
    const tariff = S.companies.filter(company => currentSummary(company.company_id).hasTariff).length;
    const incomplete = S.companies.filter(company => company.status !== 'inactive' && !currentSummary(company.company_id).configured).length;
    const withoutBase = S.companies.filter(company => company.status !== 'inactive' && currentSummary(company.company_id).bases.length === 0).length;
    const moduleCompletion = S.companies.length ? Math.round(S.companies.reduce((sum, company) => sum + currentSummary(company.company_id).completion, 0) / S.companies.length) : 0;
    return `
      <section class="empv2-page">
        <header class="empv2-page-head">
          <div><div class="empv2-eyebrow">Configuración contractual</div><h2>Gestión de Empresas</h2><p>Configurá prestadoras y controlá su operación contractual desde una única ficha.</p></div>
          ${canWrite() ? '<button class="btn btn-primary empv2-primary" onclick="abrirEmpresa()">＋ Nueva empresa</button>' : ''}
        </header>
        ${!canWrite() ? '<div class="empv2-readonly">Acceso de consulta. Las modificaciones corresponden a Administración.</div>' : ''}
        <div class="empv2-kpis">
          ${kpi('company', 'Empresas activas', active, 'Operativas en el sistema', 'green')}
          ${kpi('calendar', 'Con tarifario vigente', tariff, `${S.companies.length ? Math.round(tariff / S.companies.length * 100) : 0}% del total`, 'blue')}
          ${kpi('shield', 'Configuración incompleta', incomplete, incomplete ? 'Requiere atención' : 'Sin pendientes', 'amber')}
          ${kpi('database', 'Sin base asignada', withoutBase, withoutBase ? 'Requiere atención' : 'Todas vinculadas', 'red')}
        </div>
        <div class="empv2-list-layout">
          <div class="empv2-main-card">
            <div class="empv2-toolbar">
              <label class="empv2-search"><span>⌕</span><input id="empv2-q" value="${esc(q)}" placeholder="Buscar por nombre, CUIT o código…" oninput="renderEmpresasV2()"></label>
              <select id="empv2-filter" onchange="renderEmpresasV2()">
                <option value="all" ${filter === 'all' ? 'selected' : ''}>Todas</option>
                <option value="active" ${filter === 'active' ? 'selected' : ''}>Activas</option>
                <option value="incomplete" ${filter === 'incomplete' ? 'selected' : ''}>Incompletas</option>
                <option value="inactive" ${filter === 'inactive' ? 'selected' : ''}>Inactivas</option>
              </select>
              <button class="btn btn-ghost" onclick="cargarEmpresasV2()">↻ Actualizar</button>
            </div>
            <div class="empv2-table-wrap">
              <table class="empv2-table">
                <thead><tr><th>Empresa</th><th>Estado</th><th>Bases</th><th>Servicios</th><th>Tarifario</th><th>Última modificación</th><th>Alertas</th><th></th></tr></thead>
                <tbody>${rows.length ? rows.map(companyRow).join('') : '<tr><td colspan="8"><div class="empv2-empty">Sin resultados.</div></td></tr>'}</tbody>
              </table>
            </div>
            <div class="empv2-table-foot">Mostrando ${rows.length} de ${S.companies.length} empresas</div>
          </div>
          <aside class="empv2-module-card">
            <div class="empv2-module-title">${icon('database')}<b>Estado del módulo</b></div>
            <div class="empv2-progress"><div class="empv2-progress-ring" style="--progress:${moduleCompletion * 3.6}deg"><span>${moduleCompletion}%</span></div><div><small>Progreso general</small><strong>Configuración completa</strong></div></div>
            ${moduleCheck('Datos generales', 100, true)}
            ${moduleCheck('Bases contractuales', S.companies.length ? Math.round((S.companies.length - withoutBase) / S.companies.length * 100) : 0, withoutBase === 0)}
            ${moduleCheck('Servicios habilitados', S.companies.length ? Math.round(S.companies.filter(company => currentSummary(company.company_id).enabledServices > 0).length / S.companies.length * 100) : 0, incomplete === 0)}
            ${moduleCheck('Tarifas vigentes', S.companies.length ? Math.round(tariff / S.companies.length * 100) : 0, tariff === S.companies.length)}
            <div class="empv2-module-note">Seleccioná una empresa para administrar su configuración contractual.</div>
          </aside>
        </div>
      </section>`;
  }

  function kpi(iconName, label, value, note, tone) {
    return `<article class="empv2-kpi ${tone}"><div class="empv2-kpi-icon">${icon(iconName)}</div><div><span>${label}</span><b>${value}</b><small>${note}</small></div></article>`;
  }

  function moduleCheck(label, value, complete) {
    return `<div class="empv2-module-check"><span class="${complete ? 'ok' : 'warn'}">${complete ? '✓' : '!'}</span><b>${label}</b><em>${value}%</em></div>`;
  }

  function companyRow(company) {
    const summary = currentSummary(company.company_id);
    const alerts = summary.alerts || [];
    return `<tr onclick="seleccionarEmpresaV2('${company.company_id}')">
      <td><div class="empv2-company-cell"><div class="empv2-avatar">${esc((company.trade_name || company.legal_name || 'E').slice(0, 2).toUpperCase())}</div><div><b>${esc(company.trade_name || company.legal_name)}</b><small>${esc(company.legal_name)} · CUIT ${esc(cuit(company.cuit))}</small></div></div></td>
      <td><span class="empv2-status ${esc(company.status)}"><i></i>${statusLabel(company.status)}</span></td>
      <td>${summary.bases.length ? `<span class="empv2-chip blue">${esc(summary.primaryBase?.name || summary.bases[0]?.name || 'Base vinculada')}</span>${summary.bases.length > 1 ? `<small class="empv2-plus">+${summary.bases.length - 1}</small>` : ''}` : '<span class="empv2-chip red">Sin base</span>'}</td>
      <td><div class="empv2-count"><b>${summary.enabledServices}</b><small>de ${summary.totalServices || '—'}</small></div></td>
      <td>${summary.hasTariff ? '<span class="empv2-tariff ok">Vigente</span>' : '<span class="empv2-tariff bad">Sin tarifario</span>'}</td>
      <td><span class="empv2-date">${dateTime(company.updated_at || company.created_at)}</span></td>
      <td>${alerts.length ? `<span class="empv2-alert">${icon('alert')}${esc(alerts[0])}</span>` : '<span class="empv2-muted">—</span>'}</td>
      <td><button class="empv2-open" onclick="event.stopPropagation();seleccionarEmpresaV2('${company.company_id}')">Abrir ${icon('arrow')}</button></td>
    </tr>`;
  }

  function detailTemplate() {
    const company = currentCompany();
    const summary = currentSummary();
    if (!company) return '<div class="empv2-empty">Empresa no encontrada.</div>';
    if (S.detailLoading) return '<div class="empv2-loading">Cargando configuración de la empresa…</div>';
    const activity = S.audit.slice(0, 5);
    const tabs = [
      ['summary', 'Resumen'], ['general', 'Datos generales'], ['bases', 'Bases y facturación'],
      ['services', 'Servicios habilitados'], ['tariffs', 'Tarifas'], ['rules', 'Reglas y parámetros'], ['history', 'Historial'],
    ];
    return `<section class="empv2-detail-page">
      <div class="empv2-breadcrumb"><button onclick="volverEmpresasV2()">Empresas</button><span>/</span><b>${esc(company.trade_name || company.legal_name)}</b></div>
      <article class="empv2-company-hero">
        <div class="empv2-hero-main"><div class="empv2-hero-avatar">${esc((company.trade_name || company.legal_name).slice(0, 2).toUpperCase())}</div><div><div class="empv2-title-line"><h2>${esc(company.trade_name || company.legal_name)}</h2><span class="empv2-status ${esc(company.status)}"><i></i>${statusLabel(company.status)}</span></div><div class="empv2-contact-line"><span>✉ ${esc(company.operational_email || company.billing_email || 'Sin email')}</span><span>☎ ${esc(company.phone || company.whatsapp || 'Sin teléfono')}</span><span>CUIT ${esc(cuit(company.cuit))}</span></div></div></div>
        <div class="empv2-hero-actions">${canWrite() ? `<button class="btn btn-ghost" onclick="abrirEmpresa('${company.company_id}')">${icon('edit')} Editar empresa</button><button class="btn btn-primary" onclick="abrirNuevaVigenciaEmpresaV2()">${icon('calendar')} Nueva vigencia</button>` : ''}<button class="btn btn-ghost" onclick="abrirTabEmpresaV2('history')">${icon('history')} Ver historial</button></div>
        <div class="empv2-hero-stats">
          ${heroStat('shield', 'Estado', statusLabel(company.status), 'green')}
          ${heroStat('calendar', 'Tarifario vigente', summary.hasTariff ? 'Vigente' : 'Pendiente', summary.hasTariff ? 'blue' : 'amber')}
          ${heroStat('database', 'Base principal', summary.primaryBase?.name || 'Sin asignar', 'purple')}
          ${heroStat('service', 'Servicios habilitados', `${summary.enabledServices} / ${summary.totalServices || 0}`, 'green')}
          ${heroStat('shield', 'Reglas activas', summary.activeRules || (summary.configured ? 3 : 0), 'amber')}
          ${heroStat('history', 'Última modificación', dateTime(company.updated_at || company.created_at), 'blue')}
        </div>
      </article>
      <nav class="empv2-tabs">${tabs.map(([id, label]) => `<button class="${S.tab === id ? 'active' : ''}" onclick="abrirTabEmpresaV2('${id}')">${label}</button>`).join('')}</nav>
      <div id="emp-detail" class="empv2-detail-grid"><div class="emp-detail">${tabContent(company, summary)}</div>${S.tab === 'summary' ? activityPanel(activity) : ''}</div>
    </section>`;
  }

  function heroStat(iconName, label, value, tone) {
    return `<div class="empv2-hero-stat"><span class="${tone}">${icon(iconName)}</span><div><small>${label}</small><b>${esc(value)}</b></div></div>`;
  }

  function tabContent(company, summary) {
    switch (S.tab) {
      case 'general': return generalTab(company);
      case 'bases': return basesTab(summary);
      case 'services': return servicesTab(summary);
      case 'tariffs': return tariffsTab(summary);
      case 'rules': return rulesTab(summary);
      case 'history': return historyTab();
      default: return summaryTab(summary);
    }
  }

  function summaryTab(summary) {
    const cards = [
      ['company', 'Datos generales', 'Información legal, contactos y condiciones administrativas.', 'general', 'Completo'],
      ['database', 'Bases y facturación', 'Bases contractuales, recorrido, peajes y vigencia.', 'bases', summary.bases.length ? 'Configurado' : 'Pendiente'],
      ['service', 'Servicios habilitados', 'Catálogo disponible para la prestadora y códigos externos.', 'services', `${summary.enabledServices} / ${summary.totalServices || 0} activos`],
      ['calendar', 'Tarifas', 'Valores vigentes, próximas vigencias e historial comercial.', 'tariffs', summary.hasTariff ? 'Vigente' : 'Pendiente'],
      ['shield', 'Reglas y parámetros', 'Validaciones de operación y parámetros contractuales.', 'rules', summary.configured ? 'Activas' : 'Incompletas'],
      ['history', 'Historial', 'Cambios auditados y vigencias anteriores.', 'history', S.audit.length ? 'Actualizado' : 'Sin actividad'],
    ];
    return `<div class="empv2-feature-grid">${cards.map(([iconName, title, description, tab, status]) => `<article class="empv2-feature-card"><div class="empv2-feature-top"><span>${icon(iconName)}</span><div><h3>${title}</h3><p>${description}</p></div></div><div class="empv2-feature-foot"><em class="${status === 'Pendiente' || status === 'Incompletas' ? 'warn' : 'ok'}">${status === 'Pendiente' || status === 'Incompletas' ? '!' : '✓'} ${status}</em><button onclick="abrirTabEmpresaV2('${tab}')">Abrir</button></div></article>`).join('')}</div>
      <section class="empv2-alert-strip"><h3>Alertas y estado de la configuración</h3><div class="empv2-alert-grid">
        ${alertItem(summary.bases.length > 0, summary.bases.length ? 'Todas las bases configuradas' : 'Falta asignar una base', summary.bases.length ? 'La base principal y las adicionales están disponibles.' : 'La empresa no puede calcular recorridos contractuales.')}
        ${alertItem(summary.enabledServices > 0, summary.enabledServices ? `${summary.enabledServices} servicios habilitados` : 'Sin servicios habilitados', summary.enabledServices ? 'El catálogo operativo está disponible.' : 'Configurá qué servicios acepta esta prestadora.')}
        ${alertItem(summary.hasTariff, summary.hasTariff ? 'Tarifario vigente' : 'Tarifario pendiente', summary.hasTariff ? 'Existen precios aplicables para la fecha actual.' : 'Creá una vigencia antes de operar comercialmente.')}
      </div></section>`;
  }

  function alertItem(ok, title, description) {
    return `<div class="empv2-alert-item"><span class="${ok ? 'ok' : 'warn'}">${ok ? '✓' : '!'}</span><div><b>${esc(title)}</b><small>${esc(description)}</small></div></div>`;
  }

  function generalTab(company) {
    const contacts = S.contacts.filter(contact => contact.is_active !== false);
    const branches = S.branches.filter(branch => branch.is_active !== false);
    return `<section class="empv2-section-card"><div class="empv2-section-head"><div><h3>Datos generales</h3><p>Información legal y administrativa de la empresa.</p></div>${canWrite() ? `<button class="btn btn-primary" onclick="abrirEmpresa('${company.company_id}')">Editar datos</button>` : ''}</div>
      <div class="empv2-info-grid">${info('Razón social', company.legal_name)}${info('Nombre comercial', company.trade_name)}${info('CUIT', cuit(company.cuit))}${info('Estado', statusLabel(company.status))}${info('Email operativo', company.operational_email)}${info('Email facturación', company.billing_email)}${info('Teléfono', company.phone)}${info('WhatsApp', company.whatsapp)}${info('Condición de pago', Number(company.payment_terms_days || 0) === 0 ? 'Contado' : `${company.payment_terms_days} días`)}</div>
      ${company.notes ? `<div class="empv2-note"><b>Observaciones</b><p>${esc(company.notes)}</p></div>` : ''}
      <div class="empv2-subsection"><div class="empv2-section-head"><div><h3>Contactos</h3><p>${contacts.length} contactos activos.</p></div>${canWrite() ? '<button class="btn btn-ghost" onclick="abrirContacto()">＋ Agregar contacto</button>' : ''}</div><div class="empv2-card-grid">${contacts.length ? contacts.map(contactCard).join('') : '<div class="empv2-empty">Sin contactos activos.</div>'}</div></div>
      <div class="empv2-subsection"><div class="empv2-section-head"><div><h3>Sucursales heredadas</h3><p>Puntos operativos previos al modelo de bases contractuales.</p></div>${canWrite() ? '<button class="btn btn-ghost" onclick="abrirSucursal()">＋ Agregar sucursal</button>' : ''}</div><div class="empv2-card-grid">${branches.length ? branches.map(branchCard).join('') : '<div class="empv2-empty">Sin sucursales activas.</div>'}</div></div>
    </section>`;
  }

  function info(label, value) { return `<div class="empv2-info"><small>${label}</small><b>${esc(value || '—')}</b></div>`; }
  function contactCard(contact) { return `<article class="empv2-person-card"><div class="empv2-person-avatar">${icon('user')}</div><div><b>${esc(contact.full_name)}</b><small>${esc(contact.job_title || contact.contact_type || 'Contacto')}${contact.is_primary ? ' · Principal' : ''}</small><p>${esc(contact.email || contact.phone || contact.whatsapp || 'Sin dato de contacto')}</p></div>${canWrite() ? `<button onclick="abrirContacto('${contact.contact_id}')">Editar</button>` : ''}</article>`; }
  function branchCard(branch) { return `<article class="empv2-person-card"><div class="empv2-person-avatar">${icon('database')}</div><div><b>${esc(branch.name)}</b><small>${branch.is_primary ? 'Principal · ' : ''}${esc(branch.branch_code || 'Sin código')}</small><p>${esc([branch.address, branch.city, branch.province].filter(Boolean).join(', '))}</p></div>${canWrite() ? `<button onclick="abrirSucursal('${branch.branch_id}')">Editar</button>` : ''}</article>`; }

  function basesTab(summary) {
    const setting = summary.configuration?.billing_setting || summary.configuration?.setting || {};
    return `<section class="empv2-section-card"><div class="empv2-section-head"><div><h3>Bases y facturación</h3><p>Configuración contractual utilizada para kilometraje y peajes.</p></div>${canWrite() ? '<button class="btn btn-primary" onclick="abrirConfiguracionFacturacionEmpresa()">Editar configuración</button>' : ''}</div>
      <div class="empv2-contract-strip">${info('Base principal', summary.primaryBase?.name || 'Sin asignar')}${info('Modo de kilometraje', routeLabel(setting.route_mode))}${info('Peajes', tollLabel(setting.toll_calculation_mode))}${info('Vigencia', setting.valid_from || 'Sin vigencia')}</div>
      <div class="empv2-table-wrap"><table class="empv2-table compact"><thead><tr><th>Base</th><th>Prioridad</th><th>Principal</th><th>Estado</th><th>Coordenadas</th></tr></thead><tbody>${summary.bases.length ? summary.bases.map((base, index) => `<tr><td><b>${esc(base.name)}</b><small>${esc(base.address || '')}</small></td><td>${base.priority ?? index + 1}</td><td>${base.is_primary ? '<span class="empv2-chip blue">Sí</span>' : '—'}</td><td><span class="empv2-status active"><i></i>Activa</span></td><td>${base.address_verified || base.route_ready ? '<span class="empv2-tariff ok">Verificadas</span>' : '<span class="empv2-tariff bad">Pendientes</span>'}</td></tr>`).join('') : '<tr><td colspan="5"><div class="empv2-empty">No hay bases vinculadas.</div></td></tr>'}</tbody></table></div>
      <div class="empv2-contract-panel"><div>${icon('route')}<b>Vista contractual</b></div><p>El recorrido se aplicará como <strong>${esc(routeLabel(setting.route_mode))}</strong>. ${setting.requires_verified_base === false ? 'Se admiten bases sin coordenadas verificadas.' : 'El cálculo automático requiere coordenadas verificadas.'}</p></div>
    </section>`;
  }

  function routeLabel(value) { return ({ base_origin_destination_base: 'Base → Origen → Destino → Base', base_origin: 'Base → Origen', origin_destination: 'Origen → Destino', manual: 'Kilometraje manual' }[value] || 'Base → Origen → Destino → Base'); }
  function tollLabel(value) { return ({ route_estimate: 'Estimados por ruta', manual: 'Carga manual', not_applicable: 'No corresponde' }[value] || 'Según configuración'); }

  function servicesTab(summary) {
    const services = summary.services.filter(service => service.is_enabled !== false);
    return `<section class="empv2-section-card"><div class="empv2-section-head"><div><h3>Servicios habilitados</h3><p>Prestaciones aceptadas y códigos operativos por empresa.</p></div>${canWrite() ? '<button class="btn btn-primary" onclick="abrirServiciosEmpresaV2()">Configurar servicios</button>' : ''}</div>
      <div class="empv2-service-grid">${services.length ? services.map(service => `<article><span>${icon('service')}</span><div><b>${esc(service.name || service.service_name)}</b><small>${esc(service.category || service.service_category || 'Servicio')}</small></div><em class="ok">Habilitado</em><code>${esc(service.external_code || service.service_code || 'Sin código')}</code></article>`).join('') : '<div class="empv2-empty">No hay servicios habilitados.</div>'}</div>
    </section>`;
  }

  function tariffsTab(summary) {
    return `<section class="empv2-section-card"><div class="empv2-section-head"><div><h3>Tarifas vigentes</h3><p>Precios versionados por servicio, base y fecha.</p></div>${canWrite() ? '<button class="btn btn-primary" onclick="abrirNuevaVigenciaEmpresaV2()">＋ Nueva vigencia</button>' : ''}</div>
      <div class="empv2-table-wrap"><table class="empv2-table compact"><thead><tr><th>Servicio</th><th>Vigencia</th><th>Servicio día</th><th>Servicio noche</th><th>KM asfalto</th><th>Estado</th></tr></thead><tbody>${summary.matrix.length ? summary.matrix.map(row => `<tr><td><b>${esc(row.service_name)}</b><small>${esc(row.service_code || '')}</small></td><td>${esc(row.valid_from || '—')}</td><td>${canSeeCommercial() ? tariffValue(row.service_day_mode, row.service_day_value, row.currency) : 'Protegido por rol'}</td><td>${canSeeCommercial() ? tariffValue(row.service_night_mode, row.service_night_value, row.currency) : 'Protegido por rol'}</td><td>${canSeeCommercial() ? tariffValue(row.asphalt_day_mode, row.asphalt_day_value, row.currency) : 'Protegido por rol'}</td><td><span class="empv2-tariff ${row.valid_from ? 'ok' : 'bad'}">${row.valid_from ? 'Vigente' : 'Pendiente'}</span></td></tr>`).join('') : '<tr><td colspan="6"><div class="empv2-empty">No existen tarifas vigentes para la base principal.</div></td></tr>'}</tbody></table></div>
    </section>`;
  }

  function tariffValue(mode, value, currency) { if (mode === 'automatic') return '<span class="empv2-chip blue">Auto</span>'; if (mode === 'not_applicable' || value == null) return '—'; return `<b>${money(value, currency || 'ARS')}</b>`; }

  function rulesTab(summary) {
    const setting = summary.configuration?.billing_setting || summary.configuration?.setting || {};
    const rules = [
      ['Recorrido contractual', routeLabel(setting.route_mode), true],
      ['Tratamiento de peajes', tollLabel(setting.toll_calculation_mode), Boolean(setting.toll_calculation_mode)],
      ['Coordenadas verificadas', setting.requires_verified_base === false ? 'No obligatorio' : 'Obligatorio', summary.bases.some(base => base.address_verified || base.route_ready)],
      ['Base principal', summary.primaryBase?.name || 'Sin asignar', Boolean(summary.primaryBase)],
      ['Servicios habilitados', String(summary.enabledServices), summary.enabledServices > 0],
      ['Tarifario vigente', summary.hasTariff ? 'Disponible' : 'Pendiente', summary.hasTariff],
    ];
    return `<section class="empv2-section-card"><div class="empv2-section-head"><div><h3>Reglas y parámetros</h3><p>Controles operativos que determinan cómo se crea y factura un servicio.</p></div>${canWrite() ? '<button class="btn btn-primary" onclick="abrirConfiguracionFacturacionEmpresa()">Editar reglas</button>' : ''}</div><div class="empv2-rule-grid">${rules.map(([label, value, ok]) => `<article><span class="${ok ? 'ok' : 'warn'}">${ok ? '✓' : '!'}</span><div><b>${esc(label)}</b><small>${esc(value)}</small></div></article>`).join('')}</div></section>`;
  }

  function historyTab() {
    return `<section class="empv2-section-card"><div class="empv2-section-head"><div><h3>Historial de cambios</h3><p>Eventos de auditoría disponibles para esta empresa.</p></div></div>${S.audit.length ? `<div class="empv2-history-list">${S.audit.map(auditItem).join('')}</div>` : '<div class="empv2-empty">No hay eventos de auditoría visibles para esta empresa.</div>'}</section>`;
  }

  function activityPanel(activity) {
    return `<aside class="empv2-activity"><div class="empv2-activity-head"><div>${icon('history')}<b>Actividad reciente</b></div><button onclick="abrirTabEmpresaV2('history')">Ver todo</button></div>${activity.length ? `<div class="empv2-timeline">${activity.map(auditItem).join('')}</div>` : '<div class="empv2-empty">Sin actividad reciente.</div>'}</aside>`;
  }

  function auditItem(event) {
    const label = auditLabel(event);
    return `<article class="empv2-event"><span>${event.operation === 'INSERT' ? '+' : event.operation === 'DELETE' ? '−' : '✎'}</span><div><b>${esc(label)}</b><small>${esc(event.entity_table)} · ${event.actor_id ? 'Usuario autenticado' : 'Sistema'}</small></div><time>${dateTime(event.occurred_at)}</time></article>`;
  }

  function auditLabel(event) {
    const table = String(event.entity_table || '').replaceAll('_', ' ');
    return ({ INSERT: `${table} creado`, UPDATE: `${table} actualizado`, DELETE: `${table} eliminado` }[event.operation] || `Cambio en ${table}`);
  }

  function setTab(tab) { S.tab = tab || 'summary'; render(); }
  function backToList() { S.view = 'list'; S.tab = 'summary'; render(); }
  function renderOnly() { render(); }

  function openTariffConfiguration() {
    if (!S.selectedId) return;
    if (typeof goTo === 'function') goTo('config-tariff-matrix');
    setTimeout(() => {
      const select = document.getElementById('cr-matrix-company');
      if (select) select.value = S.selectedId;
      if (typeof cambiarEmpresaTarifasConfig === 'function') cambiarEmpresaTarifasConfig(S.selectedId);
    }, 350);
  }

  function openServicesConfiguration() {
    openTariffConfiguration();
    setTimeout(() => { if (typeof abrirServiciosPrestadoraConfig === 'function') abrirServiciosPrestadoraConfig(); }, 700);
  }

  function wrapLegacy(name) {
    const original = window[name];
    if (typeof original !== 'function' || original.__empV2Wrapped) return;
    ORIGINALS[name] = original;
    const wrapped = async function(...args) {
      const result = await original.apply(this, args);
      setTimeout(() => { mount(); load(); }, 80);
      return result;
    };
    wrapped.__empV2Wrapped = true;
    window[name] = wrapped;
  }

  function installNavigationHook() {
    const original = window.goTo;
    if (typeof original !== 'function' || original.__empV2Wrapped) return;
    const wrapped = function(name, ...args) {
      const result = original.call(this, name, ...args);
      if (name === 'empresas') setTimeout(() => { mount(); load(); }, 0);
      return result;
    };
    wrapped.__empV2Wrapped = true;
    window.goTo = wrapped;
  }

  function init() {
    const css = document.createElement('link');
    css.id = 'empresas-v2-css';
    css.rel = 'stylesheet';
    css.href = '/empresas-v2.css';
    if (!document.getElementById(css.id)) document.head.appendChild(css);
    mount();
    ['guardarEmpresa', 'desactivarEmpresa', 'guardarContacto', 'desactivarContacto', 'guardarSucursal', 'desactivarSucursal'].forEach(wrapLegacy);
    installNavigationHook();
    Object.assign(window, {
      cargarEmpresasV2: load,
      renderEmpresasV2: renderOnly,
      seleccionarEmpresaV2: selectCompany,
      volverEmpresasV2: backToList,
      abrirTabEmpresaV2: setTab,
      abrirNuevaVigenciaEmpresaV2: openTariffConfiguration,
      abrirServiciosEmpresaV2: openServicesConfiguration,
      cargarEmpresas: load,
      renderEmpresas: renderOnly,
      seleccionarEmpresa: selectCompany,
    });
    window.addEventListener('auxilios:profile-ready', () => { mount(); load(); });
    setTimeout(load, 500);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();
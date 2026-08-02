/* AuxiliOS · Módulo de Bases Tarifarias */
(() => {
  'use strict';

  const S = {
    bases: [],
    companies: [],
    contracts: [],
    selected: null,
    editing: null,
    suggestions: [],
    suggestionTimer: null,
    sessionToken: null,
    placeDetails: {},
    mapsAvailable: null,
    loading: false,
  };

  const role = () => typeof PERFIL_USUARIO === 'undefined'
    ? ''
    : String(PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role || '').toLowerCase();
  const canRead = () => ['administracion', 'facturacion', 'supervision'].includes(role());
  const canWrite = () => role() === 'administracion';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
  const clean = value => String(value ?? '').trim() || null;
  const notify = (message, type = 'info') => typeof toast === 'function'
    ? toast(message, type)
    : console[type === 'error' ? 'error' : 'log'](message);
  const open = id => typeof openModal === 'function'
    ? openModal(id)
    : document.getElementById(id)?.classList.add('open');
  const close = id => typeof closeModal === 'function'
    ? closeModal(id)
    : document.getElementById(id)?.classList.remove('open');
  const uuid = () => globalThis.crypto?.randomUUID?.()
    || `bt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const current = () => S.bases.find(base => base.billing_base_id === S.selected) || null;

  const STATUS = {
    active: { label: 'Activa y validada', cls: 'ok' },
    unverified: { label: 'Dirección sin validar', cls: 'warn' },
    expired: { label: 'Vencida', cls: 'bad' },
    scheduled: { label: 'Programada', cls: 'info' },
    inactive: { label: 'Inactiva', cls: 'muted' },
  };

  const ROUTE_LABELS = {
    base_origin_destination_base: 'Base → Origen → Destino → Base',
    base_origin: 'Base → Origen',
    origin_destination: 'Origen → Destino',
    manual: 'Kilometraje manual',
  };

  const TOLL_LABELS = {
    route_estimate: 'Estimación de la ruta',
    manual: 'Carga manual / comprobante',
    not_applicable: 'No corresponde',
  };

  function inject() {
    if (document.getElementById('screen-bases-tarifarias')) return;

    document.head.insertAdjacentHTML('beforeend', `<style id="billing-bases-css">
      #screen-bases-tarifarias{padding-bottom:42px}.bt-head,.bt-toolbar,.bt-detail-head,.bt-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.bt-head{margin-bottom:12px}.bt-head h2{margin:0;font:29px 'Bebas Neue',sans-serif;letter-spacing:.6px}.bt-sub{max-width:760px;font-size:11px;line-height:1.45;color:var(--muted)}.bt-notice{margin:0 0 12px;padding:10px 12px;border:1px solid rgba(88,166,255,.28);border-left:3px solid var(--blue);border-radius:9px;background:rgba(88,166,255,.06);font-size:11px;line-height:1.45;color:var(--muted2)}.bt-notice b{color:var(--text)}.bt-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px}.bt-kpi,.bt-panel,.bt-mini{background:var(--panel);border:1px solid var(--border);border-radius:10px}.bt-kpi{padding:11px 12px}.bt-kpi small{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}.bt-kpi b{display:block;margin-top:4px;font:21px 'DM Mono',monospace}.bt-toolbar{margin-bottom:10px}.bt-toolbar input{flex:1}.bt-toolbar select{min-width:170px}.bt-layout{display:grid;grid-template-columns:minmax(310px,.82fr) minmax(480px,1.5fr);gap:12px}.bt-list{max-height:680px;overflow:auto}.bt-row{padding:12px;border-bottom:1px solid var(--border);cursor:pointer;transition:.15s}.bt-row:last-child{border-bottom:0}.bt-row:hover,.bt-row.active{background:var(--amber-lo)}.bt-row.active{box-shadow:inset 3px 0 var(--amber)}.bt-row-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.bt-row-name{font-size:13px;font-weight:700}.bt-row-company{margin-top:2px;font-size:9px;color:var(--amber);text-transform:uppercase;letter-spacing:.06em}.bt-row-address{margin-top:7px;font-size:10px;line-height:1.35;color:var(--muted2)}.bt-row-meta{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-top:8px}.bt-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border:1px solid var(--border);border-radius:999px;font-size:8px;white-space:nowrap}.bt-pill.ok{border-color:rgba(39,196,122,.35);background:rgba(39,196,122,.08);color:var(--green)}.bt-pill.warn{border-color:rgba(245,166,35,.35);background:rgba(245,166,35,.08);color:var(--amber)}.bt-pill.bad{border-color:rgba(226,80,74,.38);background:rgba(226,80,74,.08);color:var(--red)}.bt-pill.info{border-color:rgba(88,166,255,.35);background:rgba(88,166,255,.08);color:var(--blue)}.bt-pill.muted{color:var(--muted)}.bt-detail{padding:16px;min-height:420px}.bt-detail h3{margin:0;font:25px 'Bebas Neue',sans-serif;letter-spacing:.5px}.bt-detail-company{font-size:10px;color:var(--amber);text-transform:uppercase;letter-spacing:.07em}.bt-detail-actions{display:flex;gap:6px;flex-wrap:wrap}.bt-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:14px 0}.bt-mini{padding:10px;background:var(--bg);min-width:0}.bt-mini small{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}.bt-mini div{margin-top:4px;font-size:10px;line-height:1.35;overflow-wrap:anywhere}.bt-section{margin-top:15px}.bt-section-head{padding-bottom:6px;border-bottom:1px solid var(--border)}.bt-section-head h4{margin:0;font-size:11px}.bt-address-card{margin-top:8px;padding:12px;border:1px solid var(--border);border-radius:9px;background:var(--bg)}.bt-address-card.verified{border-color:rgba(39,196,122,.32)}.bt-address-main{font-size:12px;font-weight:600}.bt-address-sub{margin-top:4px;font-size:10px;color:var(--muted)}.bt-coords{margin-top:8px;font:9px 'DM Mono',monospace;color:var(--muted2)}.bt-empty{padding:32px;text-align:center;color:var(--muted);font-size:11px}.bt-readonly{padding:8px 10px;border:1px solid rgba(88,166,255,.3);border-radius:8px;color:var(--blue);font-size:10px;margin-bottom:10px}.bt-modal{width:min(820px,calc(100vw - 24px));max-width:820px}.bt-modal .modal-body{max-height:min(74vh,690px);overflow:auto}.bt-form-section{margin:2px 0 14px}.bt-form-title{margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid var(--border);font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--amber)}.bt-address-field{position:relative}.bt-suggestions{display:none;position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:100;max-height:220px;overflow:auto;border:1px solid var(--border);border-radius:8px;background:var(--panel);box-shadow:0 15px 35px rgba(0,0,0,.46)}.bt-suggestions button{display:block;width:100%;padding:9px 10px;border:0;border-bottom:1px solid var(--border);background:transparent;text-align:left;color:var(--text);cursor:pointer}.bt-suggestions button:last-child{border-bottom:0}.bt-suggestions button:hover{background:rgba(255,255,255,.05)}.bt-suggestions b,.bt-suggestions span{display:block;font-size:10px}.bt-suggestions span{margin-top:2px;color:var(--muted)}.bt-geo-state{display:flex;align-items:center;gap:7px;margin-top:6px;padding:6px 8px;border:1px dashed var(--border);border-radius:7px;font-size:9px;color:var(--muted)}.bt-geo-state.ok{border-style:solid;border-color:rgba(39,196,122,.28);background:rgba(39,196,122,.06);color:var(--green)}.bt-geo-state.warn{border-style:solid;border-color:rgba(245,166,35,.28);background:rgba(245,166,35,.06);color:var(--amber)}.bt-checks{display:flex;gap:18px;align-items:center;flex-wrap:wrap}.bt-check{display:flex;align-items:center;gap:7px;font-size:11px}.bt-help{margin-top:5px;font-size:9px;line-height:1.35;color:var(--muted)}.bt-map-error{display:none;margin-top:6px;font-size:9px;color:var(--amber)}@media(max-width:1050px){.bt-layout{grid-template-columns:1fr}.bt-list{max-height:360px}}@media(max-width:760px){.bt-head,.bt-toolbar,.bt-detail-head{align-items:stretch;flex-direction:column}.bt-kpis,.bt-grid{grid-template-columns:repeat(2,1fr)}.bt-toolbar select{width:100%}.bt-detail-actions{width:100%}.bt-detail-actions .btn{flex:1}}@media(max-width:460px){.bt-kpis,.bt-grid{grid-template-columns:1fr}.bt-checks{align-items:flex-start;flex-direction:column}}
    </style>`);

    const bottom = document.querySelector('.sidenav .nav-bottom');
    bottom?.insertAdjacentHTML('beforebegin', `<div class="nav-item" id="nav-bases-tarifarias" onclick="goTo('bases-tarifarias')" style="display:none"><span class="nav-icon">📍</span><span class="nav-label">Bases tarifarias</span></div>`);

    document.querySelector('.content')?.insertAdjacentHTML('beforeend', `<div class="screen" id="screen-bases-tarifarias">
      <div class="bt-head"><div><h2>Bases tarifarias</h2><div class="bt-sub">Referencias contractuales utilizadas para calcular kilómetros y peajes facturables.</div></div><button class="btn btn-primary bt-write" onclick="abrirBaseTarifaria()">＋ Nueva base</button></div>
      <div class="bt-notice"><b>No es la ubicación del móvil.</b> La base tarifaria se usa exclusivamente para el recorrido contractual <b>Base → Origen → Destino → Base</b>. El despacho utilizará la ubicación real o última ubicación del móvil.</div>
      <div id="bt-readonly" class="bt-readonly" style="display:none">Acceso de consulta. Solo Administración puede crear o modificar bases tarifarias.</div>
      <div class="bt-kpis"><div class="bt-kpi"><small>Total</small><b id="bt-kpi-total">0</b></div><div class="bt-kpi"><small>Vigentes</small><b id="bt-kpi-active">0</b></div><div class="bt-kpi"><small>Validadas Google</small><b id="bt-kpi-verified">0</b></div><div class="bt-kpi"><small>Requieren atención</small><b id="bt-kpi-issues">0</b></div></div>
      <div class="bt-toolbar"><input class="form-input" id="bt-q" placeholder="Buscar base, empresa, código o dirección" oninput="renderBasesTarifarias()"><select class="form-input" id="bt-company-filter" onchange="renderBasesTarifarias()"><option value="all">Todas las empresas</option></select><select class="form-input" id="bt-status-filter" onchange="renderBasesTarifarias()"><option value="all">Todos los estados</option><option value="active">Activas y validadas</option><option value="unverified">Sin validar</option><option value="scheduled">Programadas</option><option value="expired">Vencidas</option><option value="inactive">Inactivas</option></select><button class="btn btn-ghost" onclick="cargarBasesTarifarias()">↻</button></div>
      <div class="bt-layout"><div class="bt-panel"><div class="bt-list" id="bt-list"><div class="bt-empty">Cargando…</div></div></div><div class="bt-panel bt-detail" id="bt-detail"><div class="bt-empty">Seleccioná una base tarifaria.</div></div></div>
    </div>`);

    document.body.insertAdjacentHTML('beforeend', modalHtml());
  }

  function modalHtml() {
    return `<div class="modal-backdrop" id="modal-billing-base"><div class="modal-box bt-modal"><div class="modal-head"><span class="modal-head-title" id="bt-modal-title">Nueva base tarifaria</span><button class="modal-close" onclick="closeModal('modal-billing-base')">×</button></div><div class="modal-body">
      <div class="bt-form-section"><div class="bt-form-title">Aplicación contractual</div>
        <div class="form-grid-2"><div class="form-group"><label class="form-label">Empresa *</label><select class="form-input" id="bt-company" onchange="cambiarEmpresaBaseTarifaria()"></select></div><div class="form-group"><label class="form-label">Contrato</label><select class="form-input" id="bt-contract"><option value="">Base general de la empresa</option></select><div class="bt-help">Podés limitar la base a un convenio específico.</div></div></div>
        <div class="form-grid-2"><div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="bt-name" placeholder="Ej: Base tarifaria CABA"></div><div class="form-group"><label class="form-label">Código interno</label><input class="form-input" id="bt-code" placeholder="Ej: BT-CABA"></div></div>
      </div>
      <div class="bt-form-section"><div class="bt-form-title">Dirección de referencia</div>
        <div class="form-group bt-address-field"><label class="form-label">Dirección *</label><input class="form-input" id="bt-address" placeholder="Empezá a escribir y seleccioná una dirección" oninput="buscarDireccionBaseTarifaria()"><div class="bt-suggestions" id="bt-suggestions"></div><div class="bt-map-error" id="bt-map-error"></div></div>
        <div id="bt-geo-state" class="bt-geo-state warn">⚠ Dirección manual. Para trazabilidad completa debe seleccionarse una sugerencia de Google.</div>
        <input type="hidden" id="bt-place-id">
        <div class="form-grid-2" style="margin-top:8px"><div class="form-group"><label class="form-label">Localidad</label><input class="form-input" id="bt-city"></div><div class="form-group"><label class="form-label">Provincia</label><input class="form-input" id="bt-province" value="Buenos Aires"></div></div>
        <div class="form-grid-2"><div class="form-group"><label class="form-label">Código postal</label><input class="form-input" id="bt-postal"></div><div class="form-group"><label class="form-label">Estado de geocodificación</label><input class="form-input" id="bt-geocode-label" value="Manual / no verificada" readonly></div></div>
        <div class="form-grid-2"><div class="form-group"><label class="form-label">Latitud</label><input class="form-input" id="bt-lat" inputmode="decimal" oninput="invalidarDireccionGoogle()"></div><div class="form-group"><label class="form-label">Longitud</label><input class="form-input" id="bt-lng" inputmode="decimal" oninput="invalidarDireccionGoogle()"></div></div>
      </div>
      <div class="bt-form-section"><div class="bt-form-title">Reglas de facturación</div>
        <div class="form-grid-2"><div class="form-group"><label class="form-label">Recorrido reconocido</label><select class="form-input" id="bt-route-mode"><option value="base_origin_destination_base">Base → Origen → Destino → Base</option><option value="base_origin">Base → Origen</option><option value="origin_destination">Origen → Destino</option><option value="manual">Kilometraje manual</option></select></div><div class="form-group"><label class="form-label">Peajes facturables</label><select class="form-input" id="bt-toll-mode"><option value="route_estimate">Estimación de la ruta</option><option value="manual">Carga manual / comprobante</option><option value="not_applicable">No corresponde</option></select></div></div>
        <div class="form-grid-2"><div class="form-group"><label class="form-label">Vigente desde *</label><input class="form-input" type="date" id="bt-valid-from"></div><div class="form-group"><label class="form-label">Vigente hasta</label><input class="form-input" type="date" id="bt-valid-until"></div></div>
        <div class="form-group"><label class="form-label">Prioridad de selección</label><input class="form-input" type="number" min="0" max="10000" id="bt-priority" value="100"><div class="bt-help">Un número menor aparece primero cuando hay varias bases aplicables.</div></div>
        <div class="bt-checks"><label class="bt-check"><input type="checkbox" id="bt-primary"> Base predeterminada</label><label class="bt-check"><input type="checkbox" id="bt-active" checked> Activa</label></div>
        <div class="form-group" style="margin-top:10px"><label class="form-label">Observaciones</label><textarea class="form-input" id="bt-notes" rows="3" placeholder="Condiciones contractuales o aclaraciones internas"></textarea></div>
      </div>
      <div class="modal-error" id="bt-error" style="display:none"></div>
    </div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal('modal-billing-base')">Cancelar</button><button class="btn btn-primary" id="bt-save" onclick="guardarBaseTarifaria()">Guardar base</button></div></div></div>`;
  }

  function applyRole() {
    const nav = document.getElementById('nav-bases-tarifarias');
    if (nav) nav.style.display = canRead() ? '' : 'none';
    document.querySelectorAll('.bt-write').forEach(el => { el.style.display = canWrite() ? '' : 'none'; });
    const readOnly = document.getElementById('bt-readonly');
    if (readOnly) readOnly.style.display = canRead() && !canWrite() ? '' : 'none';
  }

  async function loadCompanies() {
    if (!canWrite() && role() === 'facturacion') {
      S.companies = uniqueCompaniesFromBases();
      populateCompanyControls();
      return;
    }
    const { data, error } = await _db.from('companies')
      .select('company_id,company_code,legal_name,trade_name,status')
      .order('legal_name');
    if (error) {
      S.companies = uniqueCompaniesFromBases();
    } else {
      S.companies = (data || []).filter(company => company.status !== 'inactive');
    }
    populateCompanyControls();
  }

  function uniqueCompaniesFromBases() {
    const map = new Map();
    S.bases.forEach(base => {
      if (!map.has(base.company_id)) map.set(base.company_id, {
        company_id: base.company_id,
        company_code: base.company_code,
        legal_name: base.company_name,
        trade_name: base.company_name,
        status: 'active',
      });
    });
    return [...map.values()].sort((a, b) => (a.trade_name || a.legal_name).localeCompare(b.trade_name || b.legal_name));
  }

  function populateCompanyControls() {
    const options = S.companies.map(company => {
      const label = company.trade_name || company.legal_name;
      return `<option value="${esc(company.company_id)}">${esc(label)}${company.company_code ? ` · ${esc(company.company_code)}` : ''}</option>`;
    }).join('');
    const filter = document.getElementById('bt-company-filter');
    if (filter) {
      const previous = filter.value;
      filter.innerHTML = `<option value="all">Todas las empresas</option>${options}`;
      if ([...filter.options].some(option => option.value === previous)) filter.value = previous;
    }
    const select = document.getElementById('bt-company');
    if (select) select.innerHTML = `<option value="">Seleccioná una empresa</option>${options}`;
  }

  async function loadContracts(companyId, selectedContract = null) {
    const select = document.getElementById('bt-contract');
    if (!select) return;
    select.innerHTML = '<option value="">Base general de la empresa</option>';
    S.contracts = [];
    if (!companyId) return;
    const { data, error } = await _db.from('company_contracts')
      .select('contract_id,name,contract_number,status,valid_from,valid_until,is_primary')
      .eq('company_id', companyId)
      .order('is_primary', { ascending: false })
      .order('valid_from', { ascending: false });
    if (error) {
      console.warn('[bases tarifarias] contratos:', error);
      return;
    }
    S.contracts = data || [];
    select.insertAdjacentHTML('beforeend', S.contracts.map(contract => {
      const suffix = contract.contract_number ? ` · ${contract.contract_number}` : '';
      const state = contract.status !== 'active' ? ` [${contract.status}]` : '';
      return `<option value="${esc(contract.contract_id)}">${esc(contract.name)}${esc(suffix)}${esc(state)}</option>`;
    }).join(''));
    if (selectedContract && [...select.options].some(option => option.value === selectedContract)) select.value = selectedContract;
  }

  async function load() {
    if (!canRead()) return;
    if (S.loading) return;
    S.loading = true;
    const list = document.getElementById('bt-list');
    if (list) list.innerHTML = '<div class="bt-empty">Cargando bases tarifarias…</div>';
    try {
      const { data, error } = await _db.rpc('list_billing_bases', {
        p_company_id: null,
        p_include_inactive: true,
      });
      if (error) throw error;
      S.bases = Array.isArray(data) ? data : [];
      if (S.selected && !S.bases.some(base => base.billing_base_id === S.selected)) S.selected = null;
      if (!S.selected && S.bases.length) S.selected = S.bases[0].billing_base_id;
      await loadCompanies();
      render();
      applyRole();
    } catch (error) {
      console.error('[bases tarifarias] carga:', error);
      if (list) list.innerHTML = '<div class="bt-empty">No se pudieron cargar las bases tarifarias.</div>';
      notify(error.message || 'No se pudieron cargar las bases tarifarias', 'error');
    } finally {
      S.loading = false;
    }
  }

  function filteredBases() {
    const q = (document.getElementById('bt-q')?.value || '').toLowerCase().trim();
    const company = document.getElementById('bt-company-filter')?.value || 'all';
    const status = document.getElementById('bt-status-filter')?.value || 'all';
    return S.bases.filter(base => {
      if (company !== 'all' && base.company_id !== company) return false;
      if (status !== 'all' && base.status_key !== status) return false;
      if (!q) return true;
      return `${base.name || ''} ${base.code || ''} ${base.company_name || ''} ${base.address || ''} ${base.city || ''} ${base.contract_name || ''}`
        .toLowerCase().includes(q);
    });
  }

  function render() {
    const active = S.bases.filter(base => base.is_active && !['expired', 'scheduled'].includes(base.status_key)).length;
    const verified = S.bases.filter(base => base.address_verified).length;
    const issues = S.bases.filter(base => ['unverified', 'expired', 'inactive'].includes(base.status_key)).length;
    const kpis = { total: S.bases.length, active, verified, issues };
    Object.entries(kpis).forEach(([key, value]) => {
      const el = document.getElementById(`bt-kpi-${key}`);
      if (el) el.textContent = value;
    });

    const rows = filteredBases();
    const list = document.getElementById('bt-list');
    if (list) {
      list.innerHTML = rows.length ? rows.map(base => {
        const status = STATUS[base.status_key] || STATUS.inactive;
        return `<div class="bt-row ${S.selected === base.billing_base_id ? 'active' : ''}" onclick="seleccionarBaseTarifaria('${esc(base.billing_base_id)}')">
          <div class="bt-row-top"><div><div class="bt-row-name">${esc(base.name)}</div><div class="bt-row-company">${esc(base.company_name)}</div></div><span class="bt-pill ${status.cls}">${esc(status.label)}</span></div>
          <div class="bt-row-address">${esc(base.address)}${base.city ? ` · ${esc(base.city)}` : ''}</div>
          <div class="bt-row-meta">${base.is_primary ? '<span class="bt-pill info">Predeterminada</span>' : ''}${base.contract_name ? `<span class="bt-pill">${esc(base.contract_name)}</span>` : '<span class="bt-pill">General empresa</span>'}<span class="bt-pill">${esc(ROUTE_LABELS[base.route_mode] || base.route_mode)}</span></div>
        </div>`;
      }).join('') : '<div class="bt-empty">No hay bases que coincidan con los filtros.</div>';
    }
    renderDetail();
  }

  function renderDetail() {
    const base = current();
    const detail = document.getElementById('bt-detail');
    if (!detail) return;
    if (!base) {
      detail.innerHTML = '<div class="bt-empty">Seleccioná una base tarifaria.</div>';
      return;
    }
    const status = STATUS[base.status_key] || STATUS.inactive;
    const coords = base.latitude != null && base.longitude != null
      ? `${Number(base.latitude).toFixed(6)}, ${Number(base.longitude).toFixed(6)}`
      : 'Sin coordenadas';
    const validity = `${formatDate(base.valid_from)} → ${base.valid_until ? formatDate(base.valid_until) : 'sin vencimiento'}`;
    detail.innerHTML = `<div class="bt-detail-head"><div><div class="bt-detail-company">${esc(base.company_name)}${base.company_code ? ` · ${esc(base.company_code)}` : ''}</div><h3>${esc(base.name)}</h3><div class="bt-row-meta"><span class="bt-pill ${status.cls}">${esc(status.label)}</span>${base.is_primary ? '<span class="bt-pill info">Predeterminada</span>' : ''}${base.code ? `<span class="bt-pill">${esc(base.code)}</span>` : ''}</div></div><div class="bt-detail-actions">${canWrite() ? `<button class="btn btn-ghost" onclick="abrirBaseTarifaria('${esc(base.billing_base_id)}')">Editar</button><button class="btn ${base.is_active ? 'btn-ghost' : 'btn-primary'}" onclick="cambiarEstadoBaseTarifaria('${esc(base.billing_base_id)}',${base.is_active ? 'false' : 'true'})">${base.is_active ? 'Desactivar' : 'Activar'}</button>` : ''}</div></div>
      <div class="bt-grid"><div class="bt-mini"><small>Contrato</small><div>${esc(base.contract_name || 'General de la empresa')}</div></div><div class="bt-mini"><small>Vigencia</small><div>${esc(validity)}</div></div><div class="bt-mini"><small>Prioridad</small><div>${esc(base.priority)}</div></div><div class="bt-mini"><small>Recorrido facturable</small><div>${esc(ROUTE_LABELS[base.route_mode] || base.route_mode)}</div></div><div class="bt-mini"><small>Peajes</small><div>${esc(TOLL_LABELS[base.toll_calculation_mode] || base.toll_calculation_mode)}</div></div><div class="bt-mini"><small>Uso registrado</small><div>${Number(base.services_count || 0)} servicios · ${Number(base.linked_rate_items || 0)} valores específicos</div></div></div>
      <div class="bt-section"><div class="bt-section-head"><h4>Dirección contractual</h4><span class="bt-pill ${base.address_verified ? 'ok' : 'warn'}">${base.address_verified ? 'Google validada' : 'Manual / pendiente'}</span></div><div class="bt-address-card ${base.address_verified ? 'verified' : ''}"><div class="bt-address-main">${esc(base.address)}</div><div class="bt-address-sub">${esc([base.city, base.province, base.postal_code].filter(Boolean).join(' · ') || 'Sin datos complementarios')}</div><div class="bt-coords">${esc(coords)}${base.google_place_id ? ` · Place ID ${esc(base.google_place_id)}` : ''}</div></div></div>
      <div class="bt-section"><div class="bt-section-head"><h4>Criterio de uso</h4></div><div class="bt-notice" style="margin-top:8px;margin-bottom:0"><b>Facturación:</b> esta base define el punto contractual del kilometraje. <b>Despacho:</b> no se utilizará para calcular cercanía, ETA ni ubicación del móvil.</div></div>
      ${base.notes ? `<div class="bt-section"><div class="bt-section-head"><h4>Observaciones</h4></div><div style="margin-top:8px;font-size:11px;line-height:1.5;color:var(--muted2)">${esc(base.notes)}</div></div>` : ''}`;
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('es-AR');
  }

  function selectBase(id) {
    S.selected = id;
    render();
  }

  async function openEditor(id = null) {
    if (!canWrite()) return notify('Solo Administración puede modificar bases tarifarias', 'error');
    S.editing = id;
    S.suggestions = [];
    S.placeDetails = {};
    S.sessionToken = uuid();
    hideSuggestions();
    setFormError('');
    setMapError('');

    const base = S.bases.find(item => item.billing_base_id === id) || null;
    document.getElementById('bt-modal-title').textContent = base ? 'Editar base tarifaria' : 'Nueva base tarifaria';
    populateCompanyControls();
    const companySelect = document.getElementById('bt-company');
    const initialCompany = base?.company_id || S.companies[0]?.company_id || '';
    companySelect.value = initialCompany;
    companySelect.disabled = Boolean(base);
    await loadContracts(initialCompany, base?.contract_id || null);

    const today = new Date().toLocaleDateString('sv-SE');
    const values = {
      'bt-name': base?.name || '',
      'bt-code': base?.code || '',
      'bt-address': base?.address || '',
      'bt-city': base?.city || '',
      'bt-province': base?.province || 'Buenos Aires',
      'bt-postal': base?.postal_code || '',
      'bt-place-id': base?.google_place_id || '',
      'bt-lat': base?.latitude ?? '',
      'bt-lng': base?.longitude ?? '',
      'bt-valid-from': base?.valid_from || today,
      'bt-valid-until': base?.valid_until || '',
      'bt-route-mode': base?.route_mode || 'base_origin_destination_base',
      'bt-toll-mode': base?.toll_calculation_mode || 'route_estimate',
      'bt-priority': base?.priority ?? 100,
      'bt-notes': base?.notes || '',
    };
    Object.entries(values).forEach(([field, value]) => {
      const el = document.getElementById(field);
      if (el) el.value = value;
    });
    document.getElementById('bt-primary').checked = Boolean(base?.is_primary);
    document.getElementById('bt-active').checked = base ? Boolean(base.is_active) : true;
    S.placeDetails = base?.place_details || {};
    setVerifiedState(Boolean(base?.address_verified));
    open('modal-billing-base');
  }

  async function companyChanged() {
    await loadContracts(document.getElementById('bt-company')?.value || '', null);
  }

  function setVerifiedState(verified) {
    const state = document.getElementById('bt-geo-state');
    const label = document.getElementById('bt-geocode-label');
    if (state) {
      state.className = `bt-geo-state ${verified ? 'ok' : 'warn'}`;
      state.textContent = verified
        ? '✓ Dirección validada con Google Maps. Place ID y coordenadas quedan guardados.'
        : '⚠ Dirección manual. Para trazabilidad completa debe seleccionarse una sugerencia de Google.';
    }
    if (label) label.value = verified ? 'Google Maps validada' : 'Manual / no verificada';
    state?.setAttribute('data-verified', verified ? '1' : '0');
  }

  function invalidateGoogle() {
    const state = document.getElementById('bt-geo-state');
    if (state?.dataset.verified !== '1') return;
    document.getElementById('bt-place-id').value = '';
    S.placeDetails = {};
    setVerifiedState(false);
  }

  function searchAddress() {
    invalidateGoogle();
    clearTimeout(S.suggestionTimer);
    const input = document.getElementById('bt-address')?.value.trim() || '';
    if (input.length < 3) {
      hideSuggestions();
      return;
    }
    S.suggestionTimer = setTimeout(() => runAutocomplete(input), 350);
  }

  async function mapsInvoke(body) {
    const { data, error } = await _db.functions.invoke('maps-proxy', { body });
    if (error) {
      const message = S.mapsAvailable === false
        ? 'Google Maps todavía no está configurado en el servidor.'
        : (error.message || 'No se pudo consultar Google Maps');
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    S.mapsAvailable = true;
    return data || {};
  }

  async function runAutocomplete(input) {
    const box = document.getElementById('bt-suggestions');
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML = '<button type="button" disabled>Buscando direcciones…</button>';
    try {
      const data = await mapsInvoke({
        action: 'autocomplete',
        input,
        sessionToken: S.sessionToken,
        regionCode: 'AR',
      });
      S.suggestions = data.suggestions || [];
      if (!S.suggestions.length) {
        box.innerHTML = '<button type="button" disabled>No se encontraron coincidencias.</button>';
        return;
      }
      box.innerHTML = S.suggestions.map((suggestion, index) => `<button type="button" onclick="seleccionarDireccionBaseTarifaria(${index})"><b>${esc(suggestion.mainText || suggestion.text)}</b><span>${esc(suggestion.secondaryText || suggestion.text || '')}</span></button>`).join('');
      setMapError('');
    } catch (error) {
      S.mapsAvailable = false;
      S.suggestions = [];
      box.style.display = 'none';
      setMapError(`${error.message} Podés guardar la dirección manualmente, pero quedará pendiente de validación.`);
    }
  }

  async function selectSuggestion(index) {
    const suggestion = S.suggestions[index];
    if (!suggestion?.placeId) return;
    try {
      const data = await mapsInvoke({ action: 'place', placeId: suggestion.placeId });
      document.getElementById('bt-address').value = data.formattedAddress || suggestion.text || '';
      document.getElementById('bt-place-id').value = data.placeId || suggestion.placeId;
      document.getElementById('bt-lat').value = data.location?.latitude ?? '';
      document.getElementById('bt-lng').value = data.location?.longitude ?? '';
      if (data.city) document.getElementById('bt-city').value = data.city;
      if (data.province) document.getElementById('bt-province').value = data.province;
      if (data.postalCode) document.getElementById('bt-postal').value = data.postalCode;
      S.placeDetails = data;
      setVerifiedState(true);
      setMapError('');
      hideSuggestions();
      S.sessionToken = uuid();
    } catch (error) {
      setMapError(error.message || 'No se pudo validar la dirección seleccionada.');
    }
  }

  function hideSuggestions() {
    const box = document.getElementById('bt-suggestions');
    if (box) {
      box.style.display = 'none';
      box.innerHTML = '';
    }
  }

  function setMapError(message) {
    const el = document.getElementById('bt-map-error');
    if (!el) return;
    el.textContent = message || '';
    el.style.display = message ? 'block' : 'none';
  }

  function setFormError(message) {
    const el = document.getElementById('bt-error');
    if (!el) return;
    el.textContent = message || '';
    el.style.display = message ? 'block' : 'none';
  }

  async function save() {
    if (!canWrite()) return;
    const verified = document.getElementById('bt-geo-state')?.dataset.verified === '1';
    const payload = {
      billing_base_id: S.editing || null,
      company_id: document.getElementById('bt-company')?.value || null,
      contract_id: document.getElementById('bt-contract')?.value || null,
      name: clean(document.getElementById('bt-name')?.value),
      code: clean(document.getElementById('bt-code')?.value),
      address: clean(document.getElementById('bt-address')?.value),
      city: clean(document.getElementById('bt-city')?.value),
      province: clean(document.getElementById('bt-province')?.value) || 'Buenos Aires',
      postal_code: clean(document.getElementById('bt-postal')?.value),
      latitude: clean(document.getElementById('bt-lat')?.value),
      longitude: clean(document.getElementById('bt-lng')?.value),
      google_place_id: verified ? clean(document.getElementById('bt-place-id')?.value) : null,
      address_source: verified ? 'google' : 'manual',
      address_verified: verified,
      geocoded_at: verified ? new Date().toISOString() : null,
      place_details: verified ? S.placeDetails : {},
      valid_from: document.getElementById('bt-valid-from')?.value || null,
      valid_until: document.getElementById('bt-valid-until')?.value || null,
      route_mode: document.getElementById('bt-route-mode')?.value || 'base_origin_destination_base',
      toll_calculation_mode: document.getElementById('bt-toll-mode')?.value || 'route_estimate',
      priority: document.getElementById('bt-priority')?.value || 100,
      is_primary: Boolean(document.getElementById('bt-primary')?.checked),
      is_active: Boolean(document.getElementById('bt-active')?.checked),
      notes: clean(document.getElementById('bt-notes')?.value),
    };

    if (!payload.company_id) return setFormError('Seleccioná una empresa.');
    if (!payload.name || payload.name.length < 2) return setFormError('Ingresá el nombre de la base tarifaria.');
    if (!payload.address || payload.address.length < 3) return setFormError('Ingresá una dirección.');
    if (payload.valid_until && payload.valid_from && payload.valid_until < payload.valid_from) return setFormError('La fecha hasta no puede ser anterior a la fecha desde.');
    if ((payload.latitude && !payload.longitude) || (!payload.latitude && payload.longitude)) return setFormError('Latitud y longitud deben cargarse juntas.');

    const button = document.getElementById('bt-save');
    if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
    setFormError('');
    try {
      const { data, error } = await _db.rpc('save_billing_base', { p_payload: payload });
      if (error) throw error;
      S.selected = data?.billing_base_id || data?.branch_id || S.selected;
      close('modal-billing-base');
      notify('Base tarifaria guardada', 'success');
      await load();
    } catch (error) {
      console.error('[bases tarifarias] guardar:', error);
      setFormError(error.message || 'No se pudo guardar la base tarifaria.');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Guardar base'; }
    }
  }

  async function changeStatus(id, active) {
    if (!canWrite()) return;
    const base = S.bases.find(item => item.billing_base_id === id);
    const action = active ? 'activar' : 'desactivar';
    if (!confirm(`¿${action.charAt(0).toUpperCase() + action.slice(1)} la base "${base?.name || ''}"?`)) return;
    try {
      const { error } = await _db.rpc('set_billing_base_status', {
        p_billing_base_id: id,
        p_active: Boolean(active),
      });
      if (error) throw error;
      notify(`Base ${active ? 'activada' : 'desactivada'}`, 'success');
      await load();
    } catch (error) {
      notify(error.message || 'No se pudo cambiar el estado', 'error');
    }
  }

  function init() {
    inject();
    if (typeof SCREENS !== 'undefined') {
      SCREENS['bases-tarifarias'] = {
        title: 'BASES TARIFARIAS',
        sub: 'Configuración contractual de kilómetros y peajes',
      };
    }
    if (typeof goTo === 'function' && !window.__billingBasesNav) {
      const previous = goTo;
      window.goTo = name => {
        previous(name);
        if (name === 'bases-tarifarias') load();
      };
      window.__billingBasesNav = true;
    }
    document.addEventListener('click', event => {
      if (!event.target.closest('.bt-address-field')) hideSuggestions();
    });
    let attempts = 0;
    const timer = setInterval(() => {
      applyRole();
      if (role() || ++attempts > 40) clearInterval(timer);
    }, 250);
  }

  Object.assign(window, {
    cargarBasesTarifarias: load,
    renderBasesTarifarias: render,
    seleccionarBaseTarifaria: selectBase,
    abrirBaseTarifaria: openEditor,
    guardarBaseTarifaria: save,
    cambiarEstadoBaseTarifaria: changeStatus,
    cambiarEmpresaBaseTarifaria: companyChanged,
    buscarDireccionBaseTarifaria: searchAddress,
    seleccionarDireccionBaseTarifaria: selectSuggestion,
    invalidarDireccionGoogle: invalidateGoogle,
  });

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();

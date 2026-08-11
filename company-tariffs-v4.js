/* AuxiliOS · Tarifas v4 · única pantalla administrativa de precios */
(() => {
  'use strict';

  const S = {
    companies: [],
    companyId: '',
    data: null,
    loading: false,
    saving: false,
    pendingAction: null,
    editing: null,
    historyService: null,
  };

  const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const profile = () => typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : (window.PERFIL_USUARIO || {});
  const role = () => norm(profile()?.roles?.name || profile()?.role?.name || profile()?.role || profile()?.role_name || '');
  const canRead = () => ['administracion', 'facturacion', 'supervision'].includes(role());
  const canWrite = () => role() === 'administracion';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const notify = (message, type = 'info') => typeof toast === 'function' ? toast(message, type) : console[type === 'error' ? 'error' : 'log'](message);
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const money = (value, currency = 'ARS') => new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency || 'ARS', maximumFractionDigits: 2 }).format(Number(value) || 0);
  const unitLabel = value => ({ service: 'por servicio', hour: 'por hora', km: 'por km', unit: 'por unidad', day: 'por día', fixed: 'monto fijo' }[value] || value || 'por servicio');
  const categoryLabel = value => ({ primary: 'Primario', secondary: 'Secundario', mixed: 'Mixto' }[value] || value || '—');
  const card = () => S.data?.draft_card || S.data?.active_card || null;
  const currency = () => card()?.currency || 'ARS';
  const hasDraft = () => Boolean(S.data?.draft_card?.rate_card_id);

  function injectStyles() {
    if (document.getElementById('company-tariffs-v4-css')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="company-tariffs-v4-css">
      .ct4{display:grid;gap:14px}.ct4-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.ct4-head h2{margin:0}.ct4-head p{margin:5px 0 0;max-width:780px;font-size:11px;line-height:1.5;color:var(--muted2)}
      .ct4-select-panel{display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:12px;align-items:end;padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:var(--panel)}.ct4-field{display:grid;gap:6px}.ct4-field>span{font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted2)}
      .ct4-context{padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:var(--bg);font-size:10px;line-height:1.45;color:var(--muted2)}.ct4-context b{color:var(--text)}
      .ct4-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.ct4-kpi{padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--panel)}.ct4-kpi small{display:block;font-size:8px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.ct4-kpi b{display:block;margin-top:5px;font-size:19px;color:var(--text)}.ct4-kpi em{display:block;margin-top:3px;font-size:9px;font-style:normal;color:var(--muted2)}
      .ct4-draft{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid rgba(245,166,35,.32);border-radius:10px;background:rgba(245,166,35,.06)}.ct4-draft b{display:block;font-size:11px;color:var(--text)}.ct4-draft span{display:block;margin-top:3px;font-size:9px;color:var(--muted2)}.ct4-draft.published{border-color:rgba(39,196,122,.25);background:rgba(39,196,122,.04)}
      .ct4-panel{border:1px solid var(--border);border-radius:12px;background:var(--panel);overflow:hidden}.ct4-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 15px;border-bottom:1px solid var(--border)}.ct4-panel-head h3{margin:0;font-size:12px}.ct4-panel-head p{margin:3px 0 0;font-size:9px;color:var(--muted2)}
      .ct4-table-wrap{overflow:auto}.ct4-table{width:100%;border-collapse:collapse}.ct4-table th,.ct4-table td{padding:11px 12px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top;font-size:10px}.ct4-table th{font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.ct4-table strong{display:block;color:var(--text);font-size:11px}.ct4-table small{display:block;margin-top:3px;color:var(--muted2);font-size:9px;line-height:1.35}.ct4-table tr:last-child td{border-bottom:0}
      .ct4-chip{display:inline-flex;align-items:center;padding:3px 7px;border:1px solid var(--border2);border-radius:999px;font-size:8px;color:var(--muted2);white-space:nowrap}.ct4-chip.good{color:var(--green);border-color:rgba(39,196,122,.3)}.ct4-chip.pending{color:var(--amber);border-color:rgba(245,166,35,.3)}.ct4-chip.base{color:var(--cyan);border-color:rgba(46,196,214,.32)}
      .ct4-price{white-space:nowrap}.ct4-price-main{font-weight:850;color:var(--text)}.ct4-price-km{margin-top:3px;font-size:9px;color:var(--muted2)}.ct4-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.ct4-action{border:1px solid var(--border2);background:var(--bg);color:var(--text);border-radius:7px;padding:6px 8px;font-size:9px;cursor:pointer}.ct4-action.primary{border-color:rgba(79,142,247,.35);color:var(--primary)}.ct4-action.danger{border-color:rgba(226,80,74,.3);color:var(--red)}
      .ct4-exceptions{display:grid;gap:5px;margin-top:7px}.ct4-exception{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:7px;background:var(--bg)}.ct4-exception span{font-size:8px;color:var(--muted2)}.ct4-exception b{font-size:9px;color:var(--text)}
      .ct4-empty{padding:28px;text-align:center;color:var(--muted2);font-size:11px}.ct4-error{padding:13px 15px;border:1px solid rgba(226,80,74,.3);border-radius:9px;background:rgba(226,80,74,.06);color:var(--red);font-size:10px}.ct4-dialog{width:min(680px,calc(100vw - 24px));max-width:680px}.ct4-dialog.wide{width:min(850px,calc(100vw - 24px));max-width:850px}.ct4-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.ct4-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.ct4-full{grid-column:1/-1}.ct4-readonly{padding:9px 11px;border:1px solid var(--border);border-radius:8px;background:var(--bg);font-size:10px;color:var(--muted2)}.ct4-readonly b{color:var(--text)}
      .ct4-history{display:grid;gap:8px}.ct4-history-row{display:grid;grid-template-columns:90px 130px 1fr;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:var(--bg);font-size:9px;color:var(--muted2)}.ct4-history-row b{color:var(--text)}
      @media(max-width:850px){.ct4-kpis{grid-template-columns:1fr 1fr}.ct4-select-panel{grid-template-columns:1fr}.ct4-table th:nth-child(2),.ct4-table td:nth-child(2){display:none}}
      @media(max-width:600px){.ct4-head,.ct4-draft{display:grid}.ct4-kpis,.ct4-grid,.ct4-grid.three{grid-template-columns:1fr}.ct4-history-row{grid-template-columns:1fr}.ct4-actions{justify-content:flex-start}}
    </style>`);
  }

  function ensureModals() {
    if (!document.getElementById('modal-ct4-version')) {
      document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-ct4-version"><div class="modal-box ct4-dialog"><div class="modal-head"><span class="modal-head-title">Crear nueva vigencia</span><button class="modal-close" type="button" data-ct4-close="modal-ct4-version">×</button></div><div class="modal-body"><div class="ct4-grid"><label class="ct4-field ct4-full"><span>Vigente desde *</span><input class="form-input" type="date" id="ct4-version-from"></label><div class="ct4-readonly ct4-full"><b>No se pisa el tarifario vigente.</b> AuxiliOS crea una versión borrador basada en el tarifario publicado. Podés editar varios valores y publicarlos juntos.</div></div><div class="modal-error" id="ct4-version-error" style="display:none"></div></div><div class="modal-footer"><button class="btn btn-ghost" type="button" data-ct4-close="modal-ct4-version">Cancelar</button><button class="btn btn-primary" id="ct4-version-save" type="button">Crear borrador</button></div></div></div>`);
    }
    if (!document.getElementById('modal-ct4-rate')) {
      document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-ct4-rate"><div class="modal-box ct4-dialog"><div class="modal-head"><div><span class="modal-head-title" id="ct4-rate-title">Editar tarifa</span><div id="ct4-rate-sub" style="font-size:9px;color:var(--muted2);margin-top:3px"></div></div><button class="modal-close" type="button" data-ct4-close="modal-ct4-rate">×</button></div><div class="modal-body" id="ct4-rate-body"></div><div class="modal-footer"><button class="btn btn-ghost" type="button" data-ct4-close="modal-ct4-rate">Cancelar</button><button class="btn btn-primary" id="ct4-rate-save" type="button">Guardar tarifa</button></div></div></div>`);
    }
    if (!document.getElementById('modal-ct4-history')) {
      document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-ct4-history"><div class="modal-box ct4-dialog wide"><div class="modal-head"><div><span class="modal-head-title" id="ct4-history-title">Historial</span><div style="font-size:9px;color:var(--muted2);margin-top:3px">Versiones publicadas y excepciones por base.</div></div><button class="modal-close" type="button" data-ct4-close="modal-ct4-history">×</button></div><div class="modal-body" id="ct4-history-body"></div><div class="modal-footer"><button class="btn btn-ghost" type="button" data-ct4-close="modal-ct4-history">Cerrar</button></div></div></div>`);
    }
    document.querySelectorAll('[data-ct4-close]').forEach(button => {
      if (button.dataset.boundCt4) return;
      button.dataset.boundCt4 = '1';
      button.addEventListener('click', () => close(button.dataset.ct4Close));
    });
    const versionSave = document.getElementById('ct4-version-save');
    if (versionSave && !versionSave.dataset.boundCt4) { versionSave.dataset.boundCt4 = '1'; versionSave.addEventListener('click', createDraft); }
    const rateSave = document.getElementById('ct4-rate-save');
    if (rateSave && !rateSave.dataset.boundCt4) { rateSave.dataset.boundCt4 = '1'; rateSave.addEventListener('click', saveRate); }
  }

  const open = id => typeof openModal === 'function' ? openModal(id) : document.getElementById(id)?.classList.add('open');
  const close = id => typeof closeModal === 'function' ? closeModal(id) : document.getElementById(id)?.classList.remove('open');
  function showError(id, message = '') { const el = document.getElementById(id); if (!el) return; el.textContent = message; el.style.display = message ? 'block' : 'none'; }

  function renderShell() {
    const root = document.getElementById('screen-config-tariff-matrix');
    if (!root) return false;
    const nav = document.querySelector('#nav-config-tariff-matrix .nav-label');
    if (nav) nav.textContent = 'Tarifas';
    root.innerHTML = `<div class="ct4"><div class="ct4-head"><div><h2>Tarifas</h2><p>Definí los valores de los servicios habilitados para cada prestadora. La tarifa general aplica a todas las bases; agregá excepciones únicamente cuando exista una diferencia contractual.</p></div></div><section class="ct4-select-panel"><label class="ct4-field"><span>Prestadora</span><select class="form-input" id="ct4-company"><option value="">Seleccionar prestadora</option></select></label><div class="ct4-context" id="ct4-context">Seleccioná una prestadora para consultar sus servicios habilitados y tarifario vigente.</div></section><div id="ct4-error"></div><div id="ct4-content"><div class="ct4-empty">Seleccioná una prestadora.</div></div></div>`;
    const company = document.getElementById('ct4-company');
    company?.addEventListener('change', async event => { S.companyId = event.target.value; await loadCompany(); });
    return true;
  }

  async function loadCompanies() {
    if (!canRead()) return;
    const result = await _db.from('companies').select('company_id,trade_name,legal_name,status').eq('status', 'active').order('trade_name');
    if (result.error) throw result.error;
    S.companies = result.data || [];
    const select = document.getElementById('ct4-company');
    if (!select) return;
    select.innerHTML = '<option value="">Seleccionar prestadora</option>' + S.companies.map(company => `<option value="${esc(company.company_id)}">${esc(company.trade_name || company.legal_name || 'Prestadora')}</option>`).join('');
    if (S.companyId) select.value = S.companyId;
  }

  async function loadCompany() {
    const box = document.getElementById('ct4-content');
    const errorBox = document.getElementById('ct4-error');
    if (errorBox) errorBox.innerHTML = '';
    if (!S.companyId) { S.data = null; if (box) box.innerHTML = '<div class="ct4-empty">Seleccioná una prestadora.</div>'; updateContext(); return; }
    if (S.loading) return;
    S.loading = true;
    if (box) box.innerHTML = '<div class="ct4-empty">Cargando tarifas…</div>';
    try {
      const result = await _db.rpc('get_company_tariffs_v4', { p_company_id: S.companyId });
      if (result.error) throw result.error;
      S.data = result.data || null;
      renderContent();
      updateContext();
    } catch (error) {
      if (errorBox) errorBox.innerHTML = `<div class="ct4-error">${esc(error?.message || 'No se pudieron cargar las tarifas.')}</div>`;
      if (box) box.innerHTML = '';
    } finally { S.loading = false; }
  }

  function updateContext() {
    const el = document.getElementById('ct4-context');
    if (!el) return;
    if (!S.data?.company) { el.textContent = 'Seleccioná una prestadora para consultar sus servicios habilitados y tarifario vigente.'; return; }
    const active = S.data.active_card;
    const draft = S.data.draft_card;
    el.innerHTML = `<b>${esc(S.data.company.name)}</b> · ${draft ? `Borrador v${esc(draft.version)} desde ${esc(draft.valid_from)}` : active ? `Tarifario vigente v${esc(active.version)} desde ${esc(active.valid_from)}` : 'Sin tarifario publicado'}`;
  }

  function formatRate(service, rate) {
    if (!rate) return '<span class="ct4-chip pending">Sin tarifa</span>';
    if (service.distance_chargeable) return `<div class="ct4-price"><div class="ct4-price-main">${money(rate.primary_price ?? rate.base_price, currency())} de movida</div><div class="ct4-price-km">${Number(rate.included_km || 0)} km incluidos · ${money(rate.extra_km_price, currency())}/km excedente</div></div>`;
    const value = service.category === 'primary' ? (rate.primary_price ?? rate.base_price) : (rate.secondary_price ?? rate.base_price);
    return `<div class="ct4-price"><div class="ct4-price-main">${money(value, currency())}</div><div class="ct4-price-km">${esc(unitLabel(rate.pricing_unit || service.pricing_unit))}</div></div>`;
  }

  function exceptionRows(service) {
    const rows = service.base_exceptions || [];
    if (!rows.length) return '';
    return `<div class="ct4-exceptions">${rows.map(rate => `<div class="ct4-exception"><div><span>${esc(rate.base_name || 'Base')}</span><b>${service.distance_chargeable ? `${money(rate.primary_price ?? rate.base_price, currency())} + ${money(rate.extra_km_price, currency())}/km` : money(service.category === 'primary' ? (rate.primary_price ?? rate.base_price) : (rate.secondary_price ?? rate.base_price), currency())}</b></div><div class="ct4-actions">${canWrite() ? `<button type="button" class="ct4-action" data-ct4-edit="${esc(service.concept_id)}" data-ct4-base="${esc(rate.base_id)}">Editar</button><button type="button" class="ct4-action danger" data-ct4-delete="${esc(service.concept_id)}" data-ct4-base="${esc(rate.base_id)}">Quitar</button>` : ''}</div></div>`).join('')}</div>`;
  }

  function renderContent() {
    const box = document.getElementById('ct4-content');
    if (!box || !S.data) return;
    const active = S.data.active_card;
    const draft = S.data.draft_card;
    const services = S.data.services || [];
    const status = draft
      ? `<div class="ct4-draft"><div><b>Borrador v${esc(draft.version)} · vigente desde ${esc(draft.valid_from)}</b><span>Los cambios todavía no afectan a Operaciones. Publicalos cuando el tarifario esté completo.</span></div>${canWrite() ? '<button class="btn btn-primary" id="ct4-publish" type="button">Publicar tarifario</button>' : ''}</div>`
      : `<div class="ct4-draft published"><div><b>${active ? `Tarifario publicado v${esc(active.version)}` : 'Todavía no hay un tarifario publicado'}</b><span>${active ? `Vigente desde ${esc(active.valid_from)}. Para cambiar valores creá una nueva vigencia.` : 'Creá una vigencia para comenzar a cargar valores.'}</span></div>${canWrite() ? '<button class="btn btn-primary" id="ct4-new-version" type="button">Crear nueva vigencia</button>' : ''}</div>`;

    box.innerHTML = `<div class="ct4-kpis"><article class="ct4-kpi"><small>Servicios habilitados</small><b>${Number(S.data.enabled_count || 0)}</b><em>Configurados para esta prestadora</em></article><article class="ct4-kpi"><small>Tarifados</small><b>${Number(S.data.tariffed_count || 0)}</b><em>Con tarifa general</em></article><article class="ct4-kpi"><small>Pendientes</small><b>${Number(S.data.pending_count || 0)}</b><em>Requieren valor antes de publicar</em></article><article class="ct4-kpi"><small>Versión</small><b>${draft ? `v${esc(draft.version)}` : active ? `v${esc(active.version)}` : '—'}</b><em>${draft ? 'Borrador' : active ? 'Publicada' : 'Sin tarifario'}</em></article></div>${status}<section class="ct4-panel"><div class="ct4-panel-head"><div><h3>Servicios habilitados</h3><p>La tabla se alimenta exclusivamente de Prestadora → Servicios habilitados.</p></div></div>${services.length ? `<div class="ct4-table-wrap"><table class="ct4-table"><thead><tr><th>Servicio</th><th>Carácter</th><th>Modalidad</th><th>Tarifa general</th><th>Alcance / excepciones</th><th style="text-align:right">Acciones</th></tr></thead><tbody>${services.map(service => `<tr data-ct4-service="${esc(service.concept_id)}"><td><strong>${esc(service.name)}</strong><small>${esc(service.description || '')}</small></td><td><span class="ct4-chip">${esc(categoryLabel(service.category))}</span></td><td><strong>${service.distance_chargeable ? 'Movida + KM' : esc(unitLabel(service.pricing_unit))}</strong><small>${service.distance_chargeable ? 'Campos definidos por el Tipo de Servicio' : 'Unidad definida en el catálogo maestro'}</small></td><td>${formatRate(service, service.general_rate)}</td><td><span class="ct4-chip good">Todas las bases</span>${exceptionRows(service)}</td><td><div class="ct4-actions">${canWrite() ? `<button type="button" class="ct4-action primary" data-ct4-edit="${esc(service.concept_id)}">${service.general_rate ? 'Editar tarifa' : 'Cargar tarifa'}</button>${service.general_rate ? `<button type="button" class="ct4-action" data-ct4-add-base="${esc(service.concept_id)}">+ Excepción por base</button>` : ''}` : ''}<button type="button" class="ct4-action" data-ct4-history="${esc(service.concept_id)}">Historial</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="ct4-empty">Esta prestadora no tiene servicios habilitados. Habilitalos primero desde Prestadoras → Servicios habilitados.</div>'}</section>`;

    document.getElementById('ct4-new-version')?.addEventListener('click', () => askVersion());
    document.getElementById('ct4-publish')?.addEventListener('click', publish);
    box.querySelectorAll('[data-ct4-edit]').forEach(button => button.addEventListener('click', () => requestEdit(button.dataset.ct4Edit, button.dataset.ct4Base || null)));
    box.querySelectorAll('[data-ct4-add-base]').forEach(button => button.addEventListener('click', () => requestBaseException(button.dataset.ct4AddBase)));
    box.querySelectorAll('[data-ct4-delete]').forEach(button => button.addEventListener('click', () => removeException(button.dataset.ct4Delete, button.dataset.ct4Base)));
    box.querySelectorAll('[data-ct4-history]').forEach(button => button.addEventListener('click', () => openHistory(button.dataset.ct4History)));
  }

  function serviceById(id) { return (S.data?.services || []).find(service => String(service.concept_id) === String(id)) || null; }
  function baseById(id) { return (S.data?.bases || []).find(base => String(base.base_id) === String(id)) || null; }

  function askVersion(after = null) {
    if (!canWrite()) return;
    S.pendingAction = after;
    const input = document.getElementById('ct4-version-from');
    if (input) input.value = today();
    showError('ct4-version-error', '');
    open('modal-ct4-version');
  }

  async function createDraft() {
    if (!S.companyId || S.saving) return;
    const validFrom = document.getElementById('ct4-version-from')?.value;
    if (!validFrom) return showError('ct4-version-error', 'Indicá desde cuándo tendrá vigencia el nuevo tarifario.');
    const button = document.getElementById('ct4-version-save');
    S.saving = true; if (button) { button.disabled = true; button.textContent = 'Creando…'; }
    try {
      const result = await _db.rpc('ensure_company_tariff_draft_v4', { p_company_id: S.companyId, p_valid_from: validFrom });
      if (result.error) throw result.error;
      close('modal-ct4-version');
      await loadCompany();
      const action = S.pendingAction; S.pendingAction = null;
      if (action?.type === 'edit') openEditor(action.conceptId, action.baseId || null);
      if (action?.type === 'base') openBasePicker(action.conceptId);
      notify('Nueva vigencia creada en borrador', 'success');
    } catch (error) { showError('ct4-version-error', error?.message || 'No se pudo crear la nueva vigencia.'); }
    finally { S.saving = false; if (button) { button.disabled = false; button.textContent = 'Crear borrador'; } }
  }

  function requestEdit(conceptId, baseId = null) {
    if (!canWrite()) return;
    if (!hasDraft()) return askVersion({ type: 'edit', conceptId, baseId });
    openEditor(conceptId, baseId);
  }

  function requestBaseException(conceptId) {
    if (!canWrite()) return;
    if (!hasDraft()) return askVersion({ type: 'base', conceptId });
    openBasePicker(conceptId);
  }

  function openBasePicker(conceptId) {
    const service = serviceById(conceptId);
    if (!service?.general_rate) return notify('Primero cargá la tarifa general del servicio', 'warning');
    const used = new Set((service.base_exceptions || []).map(item => String(item.base_id)));
    const available = (S.data?.bases || []).filter(base => !used.has(String(base.base_id)));
    if (!available.length) return notify('Todas las bases globales ya tienen una excepción para este servicio', 'info');
    S.editing = { conceptId, baseId: available[0].base_id, pickingBase: true };
    renderEditor(service, available[0].base_id, available);
  }

  function openEditor(conceptId, baseId = null) {
    const service = serviceById(conceptId);
    if (!service) return;
    S.editing = { conceptId, baseId, pickingBase: false };
    renderEditor(service, baseId, null);
  }

  function renderEditor(service, baseId, selectableBases) {
    const existing = baseId ? (service.base_exceptions || []).find(rate => String(rate.base_id) === String(baseId)) : service.general_rate;
    const base = baseId ? baseById(baseId) : null;
    const title = document.getElementById('ct4-rate-title');
    const sub = document.getElementById('ct4-rate-sub');
    const body = document.getElementById('ct4-rate-body');
    if (title) title.textContent = `${existing ? 'Editar' : 'Cargar'} tarifa · ${service.name}`;
    if (sub) sub.textContent = base ? `Excepción para ${base.name}` : 'Tarifa general · Todas las bases';
    const scope = selectableBases
      ? `<label class="ct4-field ct4-full"><span>Base de la excepción *</span><select class="form-input" id="ct4-rate-base-select">${selectableBases.map(item => `<option value="${esc(item.base_id)}">${esc(item.name || item.base_code)}</option>`).join('')}</select></label>`
      : `<div class="ct4-readonly ct4-full"><b>Alcance:</b> ${base ? `Excepción · ${esc(base.name)}` : 'Todas las bases'}</div>`;
    const fields = service.distance_chargeable
      ? `<label class="ct4-field"><span>Valor base / movida *</span><input class="form-input" id="ct4-base-price" type="number" min="0" step="0.01" value="${esc(existing?.primary_price ?? existing?.base_price ?? '')}"></label><label class="ct4-field"><span>KM incluidos</span><input class="form-input" id="ct4-included-km" type="number" min="0" step="0.1" value="${esc(existing?.included_km ?? 0)}"></label><label class="ct4-field ct4-full"><span>Valor KM excedente *</span><input class="form-input" id="ct4-extra-km" type="number" min="0" step="0.01" value="${esc(existing?.extra_km_price ?? '')}"></label>`
      : `<label class="ct4-field"><span>Valor *</span><input class="form-input" id="ct4-unit-price" type="number" min="0" step="0.01" value="${esc(service.category === 'primary' ? (existing?.primary_price ?? existing?.base_price ?? '') : (existing?.secondary_price ?? existing?.base_price ?? ''))}"></label><div class="ct4-readonly"><b>Unidad:</b> ${esc(unitLabel(service.pricing_unit))}<br><span>La unidad se define en Tipos de Servicio y no se modifica desde Tarifas.</span></div>`;
    if (body) body.innerHTML = `<div class="ct4-grid">${scope}${fields}<label class="ct4-field ct4-full"><span>Nota interna</span><input class="form-input" id="ct4-rate-notes" value="${esc(existing?.notes || '')}" placeholder="Opcional"></label></div><div class="modal-error" id="ct4-rate-error" style="display:none"></div>`;
    open('modal-ct4-rate');
  }

  async function saveRate() {
    if (!canWrite() || S.saving || !S.editing || !hasDraft()) return;
    const service = serviceById(S.editing.conceptId);
    if (!service) return;
    const selectedBase = document.getElementById('ct4-rate-base-select')?.value || S.editing.baseId || null;
    const payload = {
      rate_card_id: S.data.draft_card.rate_card_id,
      company_id: S.companyId,
      concept_id: service.concept_id,
      billing_base_id: selectedBase,
      notes: document.getElementById('ct4-rate-notes')?.value?.trim() || null,
    };
    if (service.distance_chargeable) {
      payload.base_price = document.getElementById('ct4-base-price')?.value;
      payload.included_km = document.getElementById('ct4-included-km')?.value || 0;
      payload.extra_km_price = document.getElementById('ct4-extra-km')?.value;
      if (payload.base_price === '' || payload.extra_km_price === '') return showError('ct4-rate-error', 'Completá el valor de movida y el valor por KM excedente.');
    } else {
      payload.unit_price = document.getElementById('ct4-unit-price')?.value;
      if (payload.unit_price === '') return showError('ct4-rate-error', 'Completá el valor de la tarifa.');
    }
    const button = document.getElementById('ct4-rate-save');
    S.saving = true; showError('ct4-rate-error', ''); if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
    try {
      const result = await _db.rpc('save_company_tariff_item_v4', { p_payload: payload });
      if (result.error) throw result.error;
      close('modal-ct4-rate'); S.editing = null;
      await loadCompany();
      notify('Tarifa guardada en el borrador', 'success');
    } catch (error) { showError('ct4-rate-error', error?.message || 'No se pudo guardar la tarifa.'); }
    finally { S.saving = false; if (button) { button.disabled = false; button.textContent = 'Guardar tarifa'; } }
  }

  async function removeException(conceptId, baseId) {
    if (!canWrite()) return;
    if (!hasDraft()) return askVersion({ type: 'delete', conceptId, baseId });
    const service = serviceById(conceptId); const base = baseById(baseId);
    if (!service || !base) return;
    if (!window.confirm(`¿Quitar la excepción de ${base.name} para ${service.name}?\n\nLa base volverá a usar la tarifa general.`)) return;
    try {
      const result = await _db.rpc('delete_company_tariff_exception_v4', { p_rate_card_id: S.data.draft_card.rate_card_id, p_company_id: S.companyId, p_concept_id: conceptId, p_base_id: baseId });
      if (result.error) throw result.error;
      await loadCompany(); notify('Excepción eliminada; la base vuelve a usar la tarifa general', 'success');
    } catch (error) { notify(error?.message || 'No se pudo quitar la excepción', 'error'); }
  }

  async function publish() {
    if (!canWrite() || !hasDraft() || S.saving) return;
    if (Number(S.data.pending_count || 0) > 0) return notify(`Faltan ${S.data.pending_count} servicio(s) habilitado(s) por tarifar`, 'warning');
    if (!window.confirm(`¿Publicar el tarifario v${S.data.draft_card.version}?\n\nDesde ${S.data.draft_card.valid_from} será la versión utilizada por Operaciones. El tarifario anterior conservará su histórico.`)) return;
    S.saving = true;
    try {
      const result = await _db.rpc('publish_company_tariff_draft_v4', { p_rate_card_id: S.data.draft_card.rate_card_id });
      if (result.error) throw result.error;
      S.data = result.data || S.data; renderContent(); updateContext();
      notify('Tarifario publicado. Operaciones ya utiliza esta versión.', 'success');
    } catch (error) { notify(error?.message || 'No se pudo publicar el tarifario', 'error'); }
    finally { S.saving = false; }
  }

  async function openHistory(conceptId) {
    const service = serviceById(conceptId); if (!service) return;
    S.historyService = service;
    const title = document.getElementById('ct4-history-title'); const body = document.getElementById('ct4-history-body');
    if (title) title.textContent = `Historial · ${service.name}`;
    if (body) body.innerHTML = '<div class="ct4-empty">Cargando historial…</div>';
    open('modal-ct4-history');
    try {
      const result = await _db.rpc('get_company_tariff_history_v4', { p_company_id: S.companyId, p_concept_id: conceptId });
      if (result.error) throw result.error;
      const rows = result.data || [];
      if (body) body.innerHTML = rows.length ? `<div class="ct4-history">${rows.map(row => `<div class="ct4-history-row"><div><b>v${esc(row.version)}</b><br>${esc(row.status)}</div><div><b>${esc(row.valid_from || '—')}</b>${row.valid_until ? `<br>hasta ${esc(row.valid_until)}` : '<br>sin fecha fin'}</div><div><span>${row.billing_base_id ? `Excepción · ${esc(row.base_name || 'Base')}` : 'Todas las bases'}</span><b style="display:block;margin-top:3px">${service.distance_chargeable ? `${money(row.primary_price ?? row.base_price, row.currency)} + ${money(row.extra_km_price, row.currency)}/km · ${Number(row.included_km || 0)} km incluidos` : `${money(service.category === 'primary' ? (row.primary_price ?? row.base_price) : (row.secondary_price ?? row.base_price), row.currency)} ${unitLabel(row.pricing_unit)}`}</b></div></div>`).join('')}</div>` : '<div class="ct4-empty">Todavía no hay historial para este servicio.</div>';
    } catch (error) { if (body) body.innerHTML = `<div class="ct4-error">${esc(error?.message || 'No se pudo cargar el historial.')}</div>`; }
  }

  async function reload() { if (S.companyId) await loadCompany(); }

  async function init() {
    injectStyles(); ensureModals();
    if (!renderShell()) return;
    if (!canRead()) { const box = document.getElementById('ct4-content'); if (box) box.innerHTML = '<div class="ct4-error">Tu rol no tiene acceso a Tarifas.</div>'; return; }
    try { await loadCompanies(); } catch (error) { notify(error?.message || 'No se pudieron cargar las prestadoras', 'error'); }
  }

  window.AuxiliosCompanyTariffsV4 = { reload, loadCompany, state: S };
  window.addEventListener('auxilios:profile-ready', () => init());
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();
/* AuxiliOS · Tarifas v4 · única pantalla administrativa de precios */
(() => {
  'use strict';

  const S = {
    companies: [], companyId: '', data: null, loading: false, saving: false,
    pendingAction: null, editing: null, historyService: null,
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
  const draftId = () => S.data?.draft_card?.rate_card_id || null;

  function injectStyles() {
    if (document.getElementById('company-tariffs-v4-css')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="company-tariffs-v4-css">
      .ct4{display:grid;gap:14px}.ct4-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.ct4-head h2{margin:0}.ct4-head p{margin:5px 0 0;max-width:780px;font-size:11px;line-height:1.5;color:var(--muted2)}
      .ct4-select-panel{display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:12px;align-items:end;padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:var(--panel)}.ct4-field{display:grid;gap:6px}.ct4-field>span{font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted2)}
      .ct4-context{padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:var(--bg);font-size:10px;line-height:1.45;color:var(--muted2)}.ct4-context b{color:var(--text)}
      .ct4-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.ct4-kpi{padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--panel)}.ct4-kpi small{display:block;font-size:8px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.ct4-kpi b{display:block;margin-top:5px;font-size:19px;color:var(--text)}
      .ct4-version{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--panel)}.ct4-version.draft{border-color:rgba(245,166,35,.35);background:rgba(245,166,35,.05)}.ct4-version b{display:block;font-size:11px;color:var(--text)}.ct4-version span{display:block;margin-top:3px;font-size:9px;color:var(--muted2)}
      .ct4-panel{border:1px solid var(--border);border-radius:12px;background:var(--panel);overflow:hidden}.ct4-panel-head{padding:13px 15px;border-bottom:1px solid var(--border)}.ct4-panel-head h3{margin:0;font-size:12px}.ct4-panel-head p{margin:3px 0 0;font-size:9px;color:var(--muted2)}
      .ct4-table-wrap{overflow:auto}.ct4-table{width:100%;border-collapse:collapse}.ct4-table th,.ct4-table td{padding:11px 12px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top;font-size:10px}.ct4-table th{font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.ct4-table strong{display:block;color:var(--text);font-size:11px}.ct4-table small{display:block;margin-top:3px;color:var(--muted2);font-size:9px;line-height:1.35}.ct4-table tr:last-child td{border-bottom:0}
      .ct4-chip{display:inline-flex;align-items:center;padding:3px 7px;border:1px solid var(--border2);border-radius:999px;font-size:8px;color:var(--muted2);white-space:nowrap}.ct4-chip.good{color:var(--green);border-color:rgba(39,196,122,.3)}.ct4-chip.pending{color:var(--amber);border-color:rgba(245,166,35,.3)}
      .ct4-price-main{font-weight:850;color:var(--text)}.ct4-price-km{margin-top:3px;font-size:9px;color:var(--muted2)}.ct4-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.ct4-action{border:1px solid var(--border2);background:var(--bg);color:var(--text);border-radius:7px;padding:6px 8px;font-size:9px;cursor:pointer}.ct4-action.primary{border-color:rgba(79,142,247,.35);color:var(--primary)}.ct4-action.danger{border-color:rgba(226,80,74,.3);color:var(--red)}
      .ct4-exceptions{display:grid;gap:5px}.ct4-exception{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 8px;border:1px solid var(--border);border-radius:7px;background:var(--bg)}.ct4-exception span{font-size:8px;color:var(--muted2)}.ct4-exception b{font-size:9px;color:var(--text)}
      .ct4-empty{padding:28px;text-align:center;color:var(--muted2);font-size:11px}.ct4-error{padding:13px 15px;border:1px solid rgba(226,80,74,.3);border-radius:9px;background:rgba(226,80,74,.06);color:var(--red);font-size:10px}.ct4-dialog{width:min(680px,calc(100vw - 24px));max-width:680px}.ct4-dialog.wide{width:min(850px,calc(100vw - 24px));max-width:850px}.ct4-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.ct4-full{grid-column:1/-1}.ct4-readonly{padding:9px 11px;border:1px solid var(--border);border-radius:8px;background:var(--bg);font-size:10px;color:var(--muted2)}.ct4-readonly b{color:var(--text)}
      .ct4-history{display:grid;gap:8px}.ct4-history-row{display:grid;grid-template-columns:90px 130px 1fr;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:var(--bg);font-size:9px;color:var(--muted2)}.ct4-history-row b{color:var(--text)}
      @media(max-width:850px){.ct4-select-panel{grid-template-columns:1fr}.ct4-kpis{grid-template-columns:1fr 1fr 1fr}.ct4-table th:nth-child(2),.ct4-table td:nth-child(2){display:none}}
      @media(max-width:600px){.ct4-head,.ct4-version{display:grid}.ct4-kpis,.ct4-grid{grid-template-columns:1fr}.ct4-history-row{grid-template-columns:1fr}.ct4-actions{justify-content:flex-start}}
    </style>`);
  }

  function ensureModals() {
    if (!document.getElementById('modal-ct4-version')) document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-ct4-version"><div class="modal-box ct4-dialog"><div class="modal-head"><span class="modal-head-title">Crear nueva vigencia</span><button class="modal-close" type="button" data-ct4-close="modal-ct4-version">×</button></div><div class="modal-body"><label class="ct4-field"><span>Vigente desde *</span><input class="form-input" type="date" id="ct4-version-from"></label><div class="modal-error" id="ct4-version-error" style="display:none"></div></div><div class="modal-footer"><button class="btn btn-ghost" type="button" data-ct4-close="modal-ct4-version">Cancelar</button><button class="btn btn-primary" id="ct4-version-save" type="button">Crear borrador</button></div></div></div>`);
    if (!document.getElementById('modal-ct4-rate')) document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-ct4-rate"><div class="modal-box ct4-dialog"><div class="modal-head"><div><span class="modal-head-title" id="ct4-rate-title">Editar tarifa</span><div id="ct4-rate-sub" style="font-size:9px;color:var(--muted2);margin-top:3px"></div></div><button class="modal-close" type="button" data-ct4-close="modal-ct4-rate">×</button></div><div class="modal-body" id="ct4-rate-body"></div><div class="modal-footer"><button class="btn btn-ghost" type="button" data-ct4-close="modal-ct4-rate">Cancelar</button><button class="btn btn-primary" id="ct4-rate-save" type="button">Guardar tarifa</button></div></div></div>`);
    if (!document.getElementById('modal-ct4-history')) document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-ct4-history"><div class="modal-box ct4-dialog wide"><div class="modal-head"><span class="modal-head-title" id="ct4-history-title">Historial de precios</span><button class="modal-close" type="button" data-ct4-close="modal-ct4-history">×</button></div><div class="modal-body" id="ct4-history-body"></div><div class="modal-footer"><button class="btn btn-ghost" type="button" data-ct4-close="modal-ct4-history">Cerrar</button></div></div></div>`);
    document.querySelectorAll('[data-ct4-close]').forEach(button => { if (button.dataset.boundCt4) return; button.dataset.boundCt4 = '1'; button.addEventListener('click', () => close(button.dataset.ct4Close)); });
    const v = document.getElementById('ct4-version-save'); if (v && !v.dataset.boundCt4) { v.dataset.boundCt4 = '1'; v.addEventListener('click', createDraft); }
    const r = document.getElementById('ct4-rate-save'); if (r && !r.dataset.boundCt4) { r.dataset.boundCt4 = '1'; r.addEventListener('click', saveRate); }
  }

  const open = id => typeof openModal === 'function' ? openModal(id) : document.getElementById(id)?.classList.add('open');
  const close = id => typeof closeModal === 'function' ? closeModal(id) : document.getElementById(id)?.classList.remove('open');
  function showError(id, message = '') { const el = document.getElementById(id); if (!el) return; el.textContent = message; el.style.display = message ? 'block' : 'none'; }

  function renderShell() {
    const root = document.getElementById('screen-config-tariff-matrix');
    if (!root) return false;
    const nav = document.querySelector('#nav-config-tariff-matrix .nav-label'); if (nav) nav.textContent = 'Tarifas';
    root.innerHTML = `<div class="ct4"><div class="ct4-head"><div><h2>Tarifas</h2><p>Acá se cargan únicamente los precios de cada servicio. Las reglas de kilometraje, radio cubierto, peajes y recargos pertenecen a la configuración de la prestadora.</p></div></div><section class="ct4-select-panel"><label class="ct4-field"><span>Prestadora</span><select class="form-input" id="ct4-company"><option value="">Seleccionar prestadora</option></select></label><div class="ct4-context" id="ct4-context">Seleccioná una prestadora para consultar sus precios.</div></section><div id="ct4-error"></div><div id="ct4-content"><div class="ct4-empty">Seleccioná una prestadora.</div></div></div>`;
    document.getElementById('ct4-company')?.addEventListener('change', async event => { S.companyId = event.target.value; await loadCompany(); });
    return true;
  }

  async function loadCompanies() {
    if (!canRead()) return;
    const result = await _db.from('companies').select('company_id,trade_name,legal_name,status').eq('status', 'active').order('trade_name');
    if (result.error) throw result.error;
    S.companies = result.data || [];
    const select = document.getElementById('ct4-company'); if (!select) return;
    select.innerHTML = '<option value="">Seleccionar prestadora</option>' + S.companies.map(c => `<option value="${esc(c.company_id)}">${esc(c.trade_name || c.legal_name || 'Prestadora')}</option>`).join('');
    if (S.companyId) select.value = S.companyId;
  }

  function updateContext() {
    const el = document.getElementById('ct4-context'); if (!el) return;
    if (!S.data?.company) { el.textContent = 'Seleccioná una prestadora para consultar sus precios.'; return; }
    const d = S.data.draft_card, a = S.data.active_card;
    el.innerHTML = `<b>${esc(S.data.company.name)}</b> · ${d ? `Borrador v${esc(d.version)} desde ${esc(d.valid_from)}` : a ? `Tarifario vigente v${esc(a.version)} desde ${esc(a.valid_from)}` : 'Sin tarifario publicado'}`;
  }

  function formatRate(service, rate) {
    if (!rate) return '<span class="ct4-chip pending">Sin precio</span>';
    if (service.distance_chargeable) return `<div><div class="ct4-price-main">${money(rate.primary_price ?? rate.base_price, currency())} movida</div><div class="ct4-price-km">${money(rate.km_price, currency())} por KM</div></div>`;
    const value = service.category === 'primary' ? (rate.primary_price ?? rate.base_price) : service.category === 'secondary' ? (rate.secondary_price ?? rate.base_price) : (rate.base_price ?? rate.primary_price ?? rate.secondary_price);
    return `<div><div class="ct4-price-main">${money(value, currency())}</div><div class="ct4-price-km">${esc(unitLabel(rate.pricing_unit || service.pricing_unit))}</div></div>`;
  }

  function exceptionHtml(service) {
    const rows = service.base_exceptions || [];
    if (!rows.length) return '<span class="ct4-chip">Sin excepciones</span>';
    return `<div class="ct4-exceptions">${rows.map(row => `<div class="ct4-exception"><div><span>${esc(row.base_name || row.base_code || 'Base')}</span><b>${formatRate(service, row)}</b></div>${canWrite() ? `<div class="ct4-actions"><button class="ct4-action" data-ct4-edit="${esc(service.concept_id)}" data-base="${esc(row.base_id)}">Editar</button><button class="ct4-action danger" data-ct4-delete="${esc(service.concept_id)}" data-base="${esc(row.base_id)}">Quitar</button></div>` : ''}</div>`).join('')}</div>`;
  }

  function renderContent() {
    const box = document.getElementById('ct4-content'); if (!box) return;
    if (!S.data) { box.innerHTML = '<div class="ct4-empty">Seleccioná una prestadora.</div>'; return; }
    const d = S.data.draft_card, a = S.data.active_card;
    const version = d
      ? `<div class="ct4-version draft"><div><b>Borrador v${esc(d.version)}</b><span>Vigente desde ${esc(d.valid_from)}. Editá todos los precios necesarios y publicalos juntos.</span></div>${canWrite() ? '<button class="btn btn-primary" id="ct4-publish">Publicar tarifario</button>' : ''}</div>`
      : `<div class="ct4-version"><div><b>${a ? `Tarifario vigente v${esc(a.version)}` : 'Sin tarifario publicado'}</b><span>${a ? `Vigente desde ${esc(a.valid_from)}` : 'Creá la primera vigencia para comenzar a cargar precios.'}</span></div>${canWrite() ? '<button class="btn btn-primary" id="ct4-new-version">Nueva vigencia</button>' : ''}</div>`;
    const services = S.data.services || [];
    box.innerHTML = `<div class="ct4-kpis"><div class="ct4-kpi"><small>Servicios habilitados</small><b>${Number(S.data.enabled_count || services.length)}</b></div><div class="ct4-kpi"><small>Con precio</small><b>${Number(S.data.tariffed_count || 0)}</b></div><div class="ct4-kpi"><small>Pendientes</small><b>${Number(S.data.pending_count || 0)}</b></div></div>${version}<section class="ct4-panel"><div class="ct4-panel-head"><h3>Precios por servicio</h3><p>El tarifario define importes. Las reglas contractuales de recorrido se configuran en la prestadora.</p></div><div class="ct4-table-wrap"><table class="ct4-table"><thead><tr><th>Servicio</th><th>Carácter</th><th>Precio general</th><th>Excepciones por base</th><th></th></tr></thead><tbody>${services.length ? services.map(service => `<tr><td><strong>${esc(service.name)}</strong><small>${esc(service.description || (service.distance_chargeable ? 'Movida + valor por KM' : unitLabel(service.pricing_unit)))}</small></td><td><span class="ct4-chip">${esc(categoryLabel(service.category))}</span></td><td>${formatRate(service, service.general_rate)}</td><td>${exceptionHtml(service)}</td><td><div class="ct4-actions">${canWrite() ? `<button class="ct4-action primary" data-ct4-edit="${esc(service.concept_id)}">${service.general_rate ? 'Editar precio' : 'Cargar precio'}</button><button class="ct4-action" data-ct4-add-base="${esc(service.concept_id)}">Excepción por base</button>` : ''}<button class="ct4-action" data-ct4-history="${esc(service.concept_id)}">Historial</button></div></td></tr>`).join('') : '<tr><td colspan="5"><div class="ct4-empty">La prestadora no tiene servicios habilitados.</div></td></tr>'}</tbody></table></div></section>`;
    bindContent();
  }

  function bindContent() {
    document.getElementById('ct4-new-version')?.addEventListener('click', () => requestDraft(null));
    document.getElementById('ct4-publish')?.addEventListener('click', publishDraft);
    document.querySelectorAll('[data-ct4-edit]').forEach(button => button.addEventListener('click', () => editRate(button.dataset.ct4Edit, button.dataset.base || null)));
    document.querySelectorAll('[data-ct4-add-base]').forEach(button => button.addEventListener('click', () => addBaseException(button.dataset.ct4AddBase)));
    document.querySelectorAll('[data-ct4-delete]').forEach(button => button.addEventListener('click', () => removeBaseException(button.dataset.ct4Delete, button.dataset.base)));
    document.querySelectorAll('[data-ct4-history]').forEach(button => button.addEventListener('click', () => openHistory(button.dataset.ct4History)));
  }

  async function loadCompany() {
    const box = document.getElementById('ct4-content');
    if (!S.companyId) { S.data = null; updateContext(); renderContent(); return; }
    if (S.loading) return; S.loading = true;
    if (box) box.innerHTML = '<div class="ct4-empty">Cargando precios…</div>';
    try {
      const result = await _db.rpc('get_company_tariffs_v4', { p_company_id: S.companyId });
      if (result.error) throw result.error;
      S.data = result.data || null; updateContext(); renderContent();
    } catch (error) {
      if (box) box.innerHTML = `<div class="ct4-error">${esc(error?.message || 'No se pudieron cargar las tarifas.')}</div>`;
    } finally { S.loading = false; }
  }

  function serviceById(id) { return (S.data?.services || []).find(item => String(item.concept_id) === String(id)); }
  function baseById(id) { return (S.data?.bases || []).find(item => String(item.base_id) === String(id)); }

  function requestDraft(action) {
    S.pendingAction = action;
    const input = document.getElementById('ct4-version-from'); if (input) input.value = today();
    showError('ct4-version-error', ''); open('modal-ct4-version');
  }

  async function withDraft(action) {
    if (draftId()) return action();
    requestDraft(action);
  }

  async function createDraft() {
    if (S.saving || !S.companyId) return;
    const validFrom = document.getElementById('ct4-version-from')?.value;
    if (!validFrom) return showError('ct4-version-error', 'Seleccioná la fecha de vigencia.');
    S.saving = true; showError('ct4-version-error', '');
    try {
      const result = await _db.rpc('ensure_company_tariff_draft_v4', { p_company_id: S.companyId, p_valid_from: validFrom });
      if (result.error) throw result.error;
      close('modal-ct4-version'); await loadCompany();
      const action = S.pendingAction; S.pendingAction = null; if (typeof action === 'function') action();
    } catch (error) { showError('ct4-version-error', error?.message || 'No se pudo crear el borrador.'); }
    finally { S.saving = false; }
  }

  function rateFor(service, baseId) {
    if (!baseId) return service.general_rate || null;
    return (service.base_exceptions || []).find(row => String(row.base_id) === String(baseId)) || null;
  }

  async function editRate(conceptId, baseId = null) {
    if (!canWrite()) return;
    await withDraft(() => openRate(conceptId, baseId, false));
  }

  async function addBaseException(conceptId) {
    if (!canWrite()) return;
    await withDraft(() => openRate(conceptId, null, true));
  }

  function openRate(conceptId, baseId = null, chooseBase = false) {
    const service = serviceById(conceptId); if (!service) return;
    const used = new Set((service.base_exceptions || []).map(row => String(row.base_id)));
    const available = (S.data?.bases || []).filter(base => !used.has(String(base.base_id)));
    if (chooseBase && !available.length) return notify('No quedan bases disponibles para agregar una excepción', 'warning');
    const existing = chooseBase ? null : rateFor(service, baseId);
    S.editing = { conceptId, baseId, chooseBase };
    document.getElementById('ct4-rate-title').textContent = `${existing ? 'Editar' : 'Cargar'} tarifa · ${service.name}`;
    document.getElementById('ct4-rate-sub').textContent = chooseBase ? 'Nueva excepción por base' : baseId ? `Excepción · ${baseById(baseId)?.name || 'Base'}` : 'Tarifa general · Todas las bases';
    const scope = chooseBase
      ? `<label class="ct4-field ct4-full"><span>Base de la excepción *</span><select class="form-input" id="ct4-rate-base-select">${available.map(base => `<option value="${esc(base.base_id)}">${esc(base.name || base.base_code)}</option>`).join('')}</select></label>`
      : `<div class="ct4-readonly ct4-full"><b>Alcance:</b> ${baseId ? `Excepción · ${esc(baseById(baseId)?.name || 'Base')}` : 'Todas las bases'}</div>`;
    const fields = service.distance_chargeable
      ? `<label class="ct4-field"><span>Valor movida *</span><input class="form-input" id="ct4-movement-price" type="number" min="0" step="0.01" value="${esc(existing?.primary_price ?? existing?.base_price ?? '')}"></label><label class="ct4-field"><span>Valor por KM *</span><input class="form-input" id="ct4-km-price" type="number" min="0" step="0.01" value="${esc(existing?.km_price ?? '')}"></label>`
      : `<label class="ct4-field ct4-full"><span>Valor *</span><input class="form-input" id="ct4-unit-price" type="number" min="0" step="0.01" value="${esc(service.category === 'primary' ? (existing?.primary_price ?? existing?.base_price ?? '') : service.category === 'secondary' ? (existing?.secondary_price ?? existing?.base_price ?? '') : (existing?.base_price ?? existing?.primary_price ?? existing?.secondary_price ?? ''))}"></label>`;
    document.getElementById('ct4-rate-body').innerHTML = `<div class="ct4-grid">${scope}${fields}</div><div class="modal-error" id="ct4-rate-error" style="display:none"></div>`;
    open('modal-ct4-rate');
  }

  async function saveRate() {
    if (!canWrite() || S.saving || !S.editing || !draftId()) return;
    const service = serviceById(S.editing.conceptId); if (!service) return;
    const selectedBase = S.editing.chooseBase ? document.getElementById('ct4-rate-base-select')?.value : S.editing.baseId;
    const payload = { rate_card_id: draftId(), company_id: S.companyId, concept_id: service.concept_id, billing_base_id: selectedBase || null };
    if (service.distance_chargeable) {
      payload.base_price = document.getElementById('ct4-movement-price')?.value;
      payload.km_price = document.getElementById('ct4-km-price')?.value;
      if (payload.base_price === '' || payload.km_price === '') return showError('ct4-rate-error', 'Completá el valor de movida y el valor por KM.');
    } else {
      payload.unit_price = document.getElementById('ct4-unit-price')?.value;
      if (payload.unit_price === '') return showError('ct4-rate-error', 'Completá el valor de la tarifa.');
    }
    S.saving = true; showError('ct4-rate-error', '');
    try {
      const result = await _db.rpc('save_company_tariff_item_v4', { p_payload: payload });
      if (result.error) throw result.error;
      close('modal-ct4-rate'); S.editing = null; await loadCompany(); notify('Precio guardado', 'success');
    } catch (error) { showError('ct4-rate-error', error?.message || 'No se pudo guardar el precio.'); }
    finally { S.saving = false; }
  }

  async function removeBaseException(conceptId, baseId) {
    if (!canWrite() || !window.confirm('¿Quitar esta excepción de precio por base?')) return;
    await withDraft(async () => {
      const result = await _db.rpc('delete_company_tariff_exception_v4', { p_rate_card_id: draftId(), p_company_id: S.companyId, p_concept_id: conceptId, p_base_id: baseId });
      if (result.error) return notify(result.error.message, 'error');
      await loadCompany(); notify('Excepción eliminada', 'success');
    });
  }

  async function publishDraft() {
    if (!canWrite() || !draftId() || S.saving) return;
    if (Number(S.data?.pending_count || 0) > 0) return notify('Completá los precios generales pendientes antes de publicar', 'warning');
    if (!window.confirm('¿Publicar este tarifario? La versión anterior quedará en el historial.')) return;
    S.saving = true;
    try {
      const result = await _db.rpc('publish_company_tariff_draft_v4', { p_rate_card_id: draftId() });
      if (result.error) throw result.error;
      await loadCompany(); notify('Tarifario publicado', 'success');
    } catch (error) { notify(error?.message || 'No se pudo publicar el tarifario', 'error'); }
    finally { S.saving = false; }
  }

  async function openHistory(conceptId) {
    const service = serviceById(conceptId); if (!service) return;
    S.historyService = service;
    document.getElementById('ct4-history-title').textContent = `Historial de precios · ${service.name}`;
    const body = document.getElementById('ct4-history-body'); body.innerHTML = '<div class="ct4-empty">Cargando historial…</div>'; open('modal-ct4-history');
    const result = await _db.rpc('get_company_tariff_history_v4', { p_company_id: S.companyId, p_concept_id: conceptId });
    if (result.error) { body.innerHTML = `<div class="ct4-error">${esc(result.error.message)}</div>`; return; }
    const rows = result.data || [];
    body.innerHTML = rows.length ? `<div class="ct4-history">${rows.map(row => `<div class="ct4-history-row"><div><b>v${esc(row.version)}</b><br>${esc(row.status)}</div><div><b>${esc(row.valid_from || '—')}</b>${row.valid_until ? `<br>hasta ${esc(row.valid_until)}` : '<br>sin fecha fin'}</div><div><span>${row.billing_base_id ? `Excepción · ${esc(row.base_name || 'Base')}` : 'Todas las bases'}</span><b style="display:block;margin-top:3px">${service.distance_chargeable ? `${money(row.primary_price ?? row.base_price, row.currency)} movida · ${money(row.km_price, row.currency)} por KM` : `${money(service.category === 'primary' ? (row.primary_price ?? row.base_price) : service.category === 'secondary' ? (row.secondary_price ?? row.base_price) : row.base_price, row.currency)} ${unitLabel(row.pricing_unit)}`}</b></div></div>`).join('')}</div>` : '<div class="ct4-empty">Todavía no hay historial de precios para este servicio.</div>';
  }

  async function init() {
    injectStyles(); ensureModals();
    if (!renderShell()) return;
    if (!canRead()) { document.getElementById('ct4-content').innerHTML = '<div class="ct4-error">Tu rol no está habilitado para consultar Tarifas.</div>'; return; }
    try { await loadCompanies(); if (S.companyId) await loadCompany(); } catch (error) { document.getElementById('ct4-error').innerHTML = `<div class="ct4-error">${esc(error?.message || 'No se pudo iniciar Tarifas.')}</div>`; }
  }

  window.AuxiliosCompanyTariffsV4 = { state: S, loadCompany, reload: loadCompany, init };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();

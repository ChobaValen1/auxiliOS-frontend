/* AuxiliOS · Tarifas · precios actuales por prestadora · implementación canónica */
(() => {
  'use strict';

  const instances = new Map();
  let activeEditor = null;
  let activeHistory = null;

  const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const profile = () => typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : (window.PERFIL_USUARIO || {});
  const role = () => norm(profile()?.roles?.name || profile()?.role?.name || profile()?.role || profile()?.role_name || '');
  const canRead = () => ['administracion', 'facturacion', 'supervision'].includes(role());
  const canWrite = () => role() === 'administracion';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const notify = (message, type = 'info') => typeof toast === 'function' ? toast(message, type) : console[type === 'error' ? 'error' : 'log'](message);
  const money = (value, currency = 'ARS') => new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency || 'ARS', maximumFractionDigits: 2 }).format(Number(value) || 0);
  const unitLabel = value => ({ service: 'por servicio', hour: 'por hora', km: 'por km', unit: 'por unidad', day: 'por día', fixed: 'monto fijo' }[value] || value || 'por servicio');
  const categoryLabel = value => ({ primary: 'Primario', secondary: 'Secundario', mixed: 'Mixto' }[value] || value || '—');
  const open = id => typeof openModal === 'function' ? openModal(id) : document.getElementById(id)?.classList.add('open');
  const close = id => typeof closeModal === 'function' ? closeModal(id) : document.getElementById(id)?.classList.remove('open');

  function injectStyles() {
    if (document.getElementById('company-tariffs-v4-css')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="company-tariffs-v4-css">
      .ct4{display:grid;gap:14px}.ct4-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.ct4-head h2{margin:0}.ct4-head p{margin:5px 0 0;max-width:780px;font-size:11px;line-height:1.5;color:var(--muted2)}
      .ct4-select-panel{display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:12px;align-items:end;padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:var(--panel)}.ct4-field{display:grid;gap:6px}.ct4-field>span{font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted2)}
      .ct4-context{padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:var(--bg);font-size:10px;line-height:1.45;color:var(--muted2)}.ct4-context b{color:var(--text)}
      .ct4-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.ct4-kpi{padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--panel)}.ct4-kpi small{display:block;font-size:8px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.ct4-kpi b{display:block;margin-top:5px;font-size:19px;color:var(--text)}
      .ct4-panel{border:1px solid var(--border);border-radius:12px;background:var(--panel);overflow:hidden}.ct4-panel-head{padding:13px 15px;border-bottom:1px solid var(--border)}.ct4-panel-head h3{margin:0;font-size:12px}.ct4-panel-head p{margin:3px 0 0;font-size:9px;color:var(--muted2)}
      .ct4-table-wrap{overflow:auto}.ct4-table{width:100%;border-collapse:collapse}.ct4-table th,.ct4-table td{padding:11px 12px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top;font-size:10px}.ct4-table th{font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.ct4-table strong{display:block;color:var(--text);font-size:11px}.ct4-table small{display:block;margin-top:3px;color:var(--muted2);font-size:9px;line-height:1.35}.ct4-table tr:last-child td{border-bottom:0}
      .ct4-chip{display:inline-flex;align-items:center;padding:3px 7px;border:1px solid var(--border2);border-radius:999px;font-size:8px;color:var(--muted2);white-space:nowrap}.ct4-chip.good{color:var(--green);border-color:rgba(39,196,122,.3)}.ct4-chip.pending{color:var(--amber);border-color:rgba(245,166,35,.3)}
      .ct4-price-main{font-weight:850;color:var(--text)}.ct4-price-km{margin-top:3px;font-size:9px;color:var(--muted2)}.ct4-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.ct4-action{border:1px solid var(--border2);background:var(--bg);color:var(--text);border-radius:7px;padding:6px 8px;font-size:9px;cursor:pointer}.ct4-action.primary{border-color:rgba(79,142,247,.35);color:var(--primary)}.ct4-action.danger{border-color:rgba(226,80,74,.3);color:var(--red)}
      .ct4-exceptions{display:grid;gap:5px}.ct4-exception{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 8px;border:1px solid var(--border);border-radius:7px;background:var(--bg)}.ct4-exception span{font-size:8px;color:var(--muted2)}.ct4-exception b{font-size:9px;color:var(--text)}
      .ct4-empty{padding:28px;text-align:center;color:var(--muted2);font-size:11px}.ct4-error{padding:13px 15px;border:1px solid rgba(226,80,74,.3);border-radius:9px;background:rgba(226,80,74,.06);color:var(--red);font-size:10px}.ct4-dialog{width:min(680px,calc(100vw - 24px));max-width:680px}.ct4-dialog.wide{width:min(850px,calc(100vw - 24px));max-width:850px}.ct4-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.ct4-full{grid-column:1/-1}.ct4-history{display:grid;gap:8px}.ct4-history-row{display:grid;grid-template-columns:145px 145px 1fr;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:var(--bg);font-size:9px;color:var(--muted2)}.ct4-history-row b{color:var(--text)}
      .ct4-embedded>.ct4-head{display:none}.ct4-embedded .ct4-select-panel{display:none}
      @media(max-width:850px){.ct4-select-panel{grid-template-columns:1fr}.ct4-kpis{grid-template-columns:1fr 1fr 1fr}.ct4-table th:nth-child(2),.ct4-table td:nth-child(2){display:none}}
      @media(max-width:600px){.ct4-head{display:grid}.ct4-kpis,.ct4-grid{grid-template-columns:1fr}.ct4-history-row{grid-template-columns:1fr}.ct4-actions{justify-content:flex-start}}
    </style>`);
  }

  function ensureModals() {
    if (!document.getElementById('modal-ct4-rate')) document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-ct4-rate"><div class="modal-box ct4-dialog"><div class="modal-head"><div><span class="modal-head-title" id="ct4-rate-title">Editar precio</span><div id="ct4-rate-sub" style="font-size:9px;color:var(--muted2);margin-top:3px"></div></div><button class="modal-close" type="button" data-ct4-close="modal-ct4-rate">×</button></div><div class="modal-body" id="ct4-rate-body"></div><div class="modal-error" id="ct4-rate-error" style="display:none;margin:0 18px 14px"></div><div class="modal-footer"><button class="btn btn-ghost" type="button" data-ct4-close="modal-ct4-rate">Cancelar</button><button class="btn btn-primary" id="ct4-rate-save" type="button">Guardar precio</button></div></div></div>`);
    if (!document.getElementById('modal-ct4-history')) document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-ct4-history"><div class="modal-box ct4-dialog wide"><div class="modal-head"><span class="modal-head-title" id="ct4-history-title">Historial de precio</span><button class="modal-close" type="button" data-ct4-close="modal-ct4-history">×</button></div><div class="modal-body" id="ct4-history-body"></div><div class="modal-footer"><button class="btn btn-ghost" type="button" data-ct4-close="modal-ct4-history">Cerrar</button></div></div></div>`);
    document.querySelectorAll('[data-ct4-close]').forEach(button => { if (button.dataset.boundCt4) return; button.dataset.boundCt4 = '1'; button.addEventListener('click', () => close(button.dataset.ct4Close)); });
    const save = document.getElementById('ct4-rate-save'); if (save && !save.dataset.boundCt4) { save.dataset.boundCt4 = '1'; save.addEventListener('click', savePrice); }
  }

  function showModalError(message = '') {
    const el = document.getElementById('ct4-rate-error'); if (!el) return;
    el.textContent = message; el.style.display = message ? 'block' : 'none';
  }

  function shell(instance) {
    const embedded = instance.mode === 'embedded';
    instance.root.innerHTML = `<div class="ct4 ${embedded ? 'ct4-embedded' : ''}">
      <div class="ct4-head"><div><h2>Tarifas</h2><p>Precios actuales de los servicios habilitados. Las reglas de recorrido, radio, peajes y recargos pertenecen a la configuración de la prestadora.</p></div></div>
      <section class="ct4-select-panel"><label class="ct4-field"><span>Prestadora</span><select class="form-input" data-ct4-company><option value="">Seleccionar prestadora</option></select></label><div class="ct4-context" data-ct4-context>Seleccioná una prestadora para consultar sus precios.</div></section>
      <div data-ct4-error></div><div data-ct4-content><div class="ct4-empty">${embedded ? 'Cargando precios…' : 'Seleccioná una prestadora.'}</div></div>
    </div>`;
    instance.root.querySelector('[data-ct4-company]')?.addEventListener('change', async event => { instance.companyId = event.target.value; await loadInstance(instance); });
  }

  async function loadCompanies(instance) {
    if (instance.mode !== 'standalone' || !canRead()) return;
    const result = await _db.from('companies').select('company_id,trade_name,legal_name,status').eq('status','active').order('trade_name');
    if (result.error) throw result.error;
    instance.companies = result.data || [];
    const select = instance.root.querySelector('[data-ct4-company]'); if (!select) return;
    select.innerHTML = '<option value="">Seleccionar prestadora</option>' + instance.companies.map(c => `<option value="${esc(c.company_id)}">${esc(c.trade_name || c.legal_name || 'Prestadora')}</option>`).join('');
    select.value = instance.companyId || '';
  }

  function formatPrice(instance, service, price) {
    if (!price) return '<span class="ct4-chip pending">Sin precio</span>';
    const currency = instance.data?.currency || 'ARS';
    if (service.distance_chargeable) return `<div><div class="ct4-price-main">${money(price.movement_price,currency)} movida</div><div class="ct4-price-km">${money(price.km_price,currency)} por KM</div></div>`;
    return `<div><div class="ct4-price-main">${money(price.unit_price,currency)}</div><div class="ct4-price-km">${esc(unitLabel(price.pricing_unit || service.pricing_unit))}</div></div>`;
  }

  function exceptionsHtml(instance, service) {
    const rows = service.base_exceptions || [];
    if (!rows.length) return '<span class="ct4-chip">Sin excepciones</span>';
    return `<div class="ct4-exceptions">${rows.map(row => `<div class="ct4-exception"><div><span>${esc(row.base_name || 'Base')}</span><b>${formatPrice(instance,service,row)}</b></div><div class="ct4-actions"><button class="ct4-action" type="button" data-ct4-edit="${esc(service.concept_id)}" data-ct4-base="${esc(row.base_id)}">Editar</button>${canWrite()?`<button class="ct4-action danger" type="button" data-ct4-delete="${esc(service.concept_id)}" data-ct4-base="${esc(row.base_id)}">Eliminar</button>`:''}</div></div>`).join('')}</div>`;
  }

  function renderInstance(instance) {
    const context = instance.root.querySelector('[data-ct4-context]');
    const content = instance.root.querySelector('[data-ct4-content]');
    const error = instance.root.querySelector('[data-ct4-error]');
    if (!content) return;
    if (error) error.innerHTML = '';
    if (!instance.companyId) { if (context) context.textContent = 'Seleccioná una prestadora para consultar sus precios.'; content.innerHTML = '<div class="ct4-empty">Seleccioná una prestadora.</div>'; return; }
    if (!instance.data) { content.innerHTML = '<div class="ct4-empty">Cargando precios…</div>'; return; }
    const d = instance.data;
    const enabled = Number(d.enabled_count || 0), priced = Number(d.priced_count || 0), pending = Math.max(enabled - priced, 0);
    if (context) context.innerHTML = `<b>${esc(d.company?.name || 'Prestadora')}</b> · Los cambios se aplican al precio actual y quedan registrados en Historial.`;
    const services = Array.isArray(d.services) ? d.services : [];
    content.innerHTML = `<div class="ct4-kpis"><div class="ct4-kpi"><small>Servicios habilitados</small><b>${enabled}</b></div><div class="ct4-kpi"><small>Con precio</small><b>${priced}</b></div><div class="ct4-kpi"><small>Sin precio</small><b>${pending}</b></div></div>
      <section class="ct4-panel"><div class="ct4-panel-head"><h3>Precios actuales</h3><p>El precio general aplica a todas las bases habilitadas salvo que exista una excepción específica.</p></div>
      <div class="ct4-table-wrap"><table class="ct4-table"><thead><tr><th>Servicio</th><th>Tipo</th><th>Precio general</th><th>Excepciones por base</th><th></th></tr></thead><tbody>${services.length ? services.map(service => `<tr><td><strong>${esc(service.name)}</strong><small>${service.distance_chargeable ? 'Movida + valor por KM' : esc(unitLabel(service.pricing_unit))}</small></td><td><span class="ct4-chip">${esc(categoryLabel(service.category))}</span></td><td>${formatPrice(instance,service,service.general_price)}</td><td>${exceptionsHtml(instance,service)}</td><td><div class="ct4-actions">${canWrite()?`<button class="ct4-action primary" type="button" data-ct4-edit="${esc(service.concept_id)}">${service.general_price?'Editar':'Cargar precio'}</button>${(d.bases||[]).length?`<button class="ct4-action" type="button" data-ct4-add-exception="${esc(service.concept_id)}">Excepción por base</button>`:''}`:''}<button class="ct4-action" type="button" data-ct4-history="${esc(service.concept_id)}">Historial</button></div></td></tr>`).join('') : '<tr><td colspan="5"><div class="ct4-empty">No hay servicios habilitados para esta prestadora.</div></td></tr>'}</tbody></table></div></section>`;
    bindInstance(instance);
  }

  function bindInstance(instance) {
    instance.root.querySelectorAll('[data-ct4-edit]').forEach(button => button.addEventListener('click', () => openPriceEditor(instance, button.dataset.ct4Edit, button.dataset.ct4Base || null, false)));
    instance.root.querySelectorAll('[data-ct4-add-exception]').forEach(button => button.addEventListener('click', () => openPriceEditor(instance, button.dataset.ct4AddException, null, true)));
    instance.root.querySelectorAll('[data-ct4-delete]').forEach(button => button.addEventListener('click', () => deleteException(instance, button.dataset.ct4Delete, button.dataset.ct4Base)));
    instance.root.querySelectorAll('[data-ct4-history]').forEach(button => button.addEventListener('click', () => openHistory(instance, button.dataset.ct4History)));
  }

  async function loadInstance(instance) {
    if (!canRead()) { const c = instance.root.querySelector('[data-ct4-content]'); if (c) c.innerHTML = '<div class="ct4-error">Tu rol no está habilitado para consultar Tarifas.</div>'; return; }
    if (!instance.companyId) { instance.data = null; renderInstance(instance); return; }
    instance.loading = true; renderInstance(instance);
    const result = await _db.rpc('get_company_service_prices_v1',{ p_company_id: instance.companyId });
    instance.loading = false;
    if (result.error) { const e = instance.root.querySelector('[data-ct4-error]'); if (e) e.innerHTML = `<div class="ct4-error">${esc(result.error.message || 'No se pudieron cargar los precios.')}</div>`; return; }
    instance.data = result.data || { services: [], bases: [] };
    renderInstance(instance);
  }

  function serviceFor(instance, conceptId) { return (instance.data?.services || []).find(s => String(s.concept_id) === String(conceptId)); }

  function openPriceEditor(instance, conceptId, baseId = null, selectingBase = false) {
    if (!canWrite()) return notify('Solo Administración puede editar precios','error');
    const service = serviceFor(instance, conceptId); if (!service) return;
    const existing = baseId ? (service.base_exceptions || []).find(x => String(x.base_id) === String(baseId)) : service.general_price;
    activeEditor = { instanceId: instance.id, conceptId, baseId, selectingBase, service };
    document.getElementById('ct4-rate-title').textContent = selectingBase ? 'Agregar excepción por base' : existing ? 'Editar precio' : 'Cargar precio';
    document.getElementById('ct4-rate-sub').textContent = `${service.name} · ${instance.data?.company?.name || 'Prestadora'}`;
    const bases = instance.data?.bases || [];
    const baseField = selectingBase ? `<label class="ct4-field ct4-full"><span>Base *</span><select class="form-input" id="ct4-rate-base"><option value="">Seleccionar base</option>${bases.filter(base => !(service.base_exceptions||[]).some(row => String(row.base_id)===String(base.base_id))).map(base => `<option value="${esc(base.base_id)}">${esc(base.name)}</option>`).join('')}</select></label>` : baseId ? `<div class="ct4-field ct4-full"><span>Base</span><div class="ct4-context">${esc(existing?.base_name || bases.find(b=>String(b.base_id)===String(baseId))?.name || 'Base')}</div></div>` : '';
    const priceFields = service.distance_chargeable
      ? `<label class="ct4-field"><span>Valor movida</span><input class="form-input" type="number" min="0" step="0.01" id="ct4-movement" value="${esc(existing?.movement_price ?? '')}"></label><label class="ct4-field"><span>Valor por KM</span><input class="form-input" type="number" min="0" step="0.01" id="ct4-km" value="${esc(existing?.km_price ?? '')}"></label>`
      : `<label class="ct4-field ct4-full"><span>Valor · ${esc(unitLabel(service.pricing_unit))}</span><input class="form-input" type="number" min="0" step="0.01" id="ct4-unit" value="${esc(existing?.unit_price ?? '')}"></label>`;
    document.getElementById('ct4-rate-body').innerHTML = `<div class="ct4-grid">${baseField}${priceFields}</div>`;
    showModalError(''); open('modal-ct4-rate');
  }

  async function savePrice() {
    const editor = activeEditor; if (!editor || !canWrite()) return;
    const instance = instances.get(editor.instanceId); if (!instance) return;
    const baseId = editor.selectingBase ? document.getElementById('ct4-rate-base')?.value || null : editor.baseId;
    if (editor.selectingBase && !baseId) return showModalError('Seleccioná una base.');
    const payload = { company_id: instance.companyId, concept_id: editor.conceptId, billing_base_id: baseId };
    if (editor.service.distance_chargeable) {
      const movement = Number(document.getElementById('ct4-movement')?.value), km = Number(document.getElementById('ct4-km')?.value);
      if (!Number.isFinite(movement) || movement < 0 || !Number.isFinite(km) || km < 0) return showModalError('Completá valores válidos para movida y kilómetro.');
      payload.movement_price = movement; payload.km_price = km;
    } else {
      const value = Number(document.getElementById('ct4-unit')?.value);
      if (!Number.isFinite(value) || value < 0) return showModalError('Ingresá un valor válido.');
      payload.unit_price = value;
    }
    const button = document.getElementById('ct4-rate-save'); if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
    const result = await _db.rpc('save_company_service_price_v1',{ p_payload: payload });
    if (button) { button.disabled = false; button.textContent = 'Guardar precio'; }
    if (result.error) return showModalError(result.error.message || 'No se pudo guardar el precio.');
    close('modal-ct4-rate'); activeEditor = null; notify('Precio actualizado','success'); await reloadCompany(instance.companyId);
  }

  async function deleteException(instance, conceptId, baseId) {
    if (!canWrite() || !window.confirm('¿Eliminar esta excepción? Se volverá a usar el precio general.')) return;
    const result = await _db.rpc('delete_company_service_price_exception_v1',{ p_company_id: instance.companyId, p_concept_id: conceptId, p_base_id: baseId });
    if (result.error) return notify(result.error.message || 'No se pudo eliminar la excepción','error');
    notify('Excepción eliminada','success'); await reloadCompany(instance.companyId);
  }

  function historyValue(instance, service, row) {
    if (!row) return '—';
    if (service.distance_chargeable) return `${money(row.movement_price,instance.data?.currency)} movida · ${money(row.km_price,instance.data?.currency)}/km`;
    return money(row.unit_price,instance.data?.currency);
  }

  async function openHistory(instance, conceptId) {
    const service = serviceFor(instance, conceptId); if (!service) return;
    activeHistory = { instanceId: instance.id, conceptId };
    document.getElementById('ct4-history-title').textContent = `Historial · ${service.name}`;
    document.getElementById('ct4-history-body').innerHTML = '<div class="ct4-empty">Cargando historial…</div>'; open('modal-ct4-history');
    const result = await _db.rpc('get_company_service_price_history_v1',{ p_company_id: instance.companyId, p_concept_id: conceptId });
    if (result.error) { document.getElementById('ct4-history-body').innerHTML = `<div class="ct4-error">${esc(result.error.message || 'No se pudo cargar el historial.')}</div>`; return; }
    const rows = Array.isArray(result.data) ? result.data : [];
    document.getElementById('ct4-history-body').innerHTML = rows.length ? `<div class="ct4-history">${rows.map(row => `<div class="ct4-history-row"><div><b>${esc(row.actor_name || 'Usuario')}</b><span>${row.occurred_at ? new Date(row.occurred_at).toLocaleString('es-AR') : '—'}</span></div><div><b>${esc(row.base_name || 'Precio general')}</b><span>${esc(row.operation === 'INSERT' ? 'CREACIÓN' : row.operation === 'DELETE' ? 'ELIMINACIÓN' : 'MODIFICACIÓN')}</span></div><div><b>${historyValue(instance,service,row.before)} → ${historyValue(instance,service,row.after)}</b><span>Cambio registrado automáticamente.</span></div></div>`).join('')}</div>` : '<div class="ct4-empty">Todavía no hay cambios registrados para este precio.</div>';
  }

  async function reloadCompany(companyId) {
    const targets = [...instances.values()].filter(i => String(i.companyId) === String(companyId));
    await Promise.all(targets.map(loadInstance));
    window.AuxiliosEmpresasV2?.refresh?.(companyId);
  }

  async function mount(root, { mode = 'embedded', companyId = '', id = null } = {}) {
    if (!root) return null;
    injectStyles(); ensureModals();
    const instanceId = id || root.id || `ct4-${Math.random().toString(36).slice(2)}`;
    const instance = { id: instanceId, root, mode, companyId: companyId || '', companies: [], data: null, loading: false };
    instances.set(instanceId, instance); shell(instance);
    if (mode === 'standalone') await loadCompanies(instance);
    if (instance.companyId) await loadInstance(instance); else renderInstance(instance);
    return instance;
  }

  async function mountEmbedded(root, companyId) { return mount(root,{ mode:'embedded', companyId, id:`embedded-${companyId}-${root.id||'prices'}` }); }

  async function openForCompany(companyId) {
    const standalone = instances.get('standalone');
    if (!standalone) return;
    standalone.companyId = companyId || '';
    const select = standalone.root.querySelector('[data-ct4-company]'); if (select) select.value = standalone.companyId;
    await loadInstance(standalone);
  }

  async function init() {
    const screen = document.getElementById('screen-config-tariff-matrix'); if (!screen) return;
    const nav = document.querySelector('#nav-config-tariff-matrix .nav-label'); if (nav) nav.textContent = 'Tarifas';
    await mount(screen,{ mode:'standalone', id:'standalone' });
  }

  window.AuxiliosCompanyTariffsV4 = {
    instances,
    mount,
    mountEmbedded,
    openForCompany,
    reload: reloadCompany,
    loadCompany: async () => {
      const legacyId = window.AuxiliosCompanyTariffsV4?.state?.companyId;
      if (legacyId) return openForCompany(legacyId);
      const standalone = instances.get('standalone'); if (standalone) return loadInstance(standalone);
    },
    state: {
      get companyId() { return instances.get('standalone')?.companyId || ''; },
      set companyId(value) { const instance = instances.get('standalone'); if (instance) instance.companyId = value || ''; }
    },
    init,
  };

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once:true }) : init();
})();

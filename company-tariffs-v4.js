/* AuxiliOS · Tarifas · precio vigente + vigencias programadas */
(() => {
  'use strict';

  const instances = new Map();
  let activeEditor = null;

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
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const nextMonth = () => { const [y, m] = today().split('-').map(Number); const d = new Date(Date.UTC(y, m, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`; };
  const dateLabel = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('es-AR') : '—';

  function injectStyles() {
    if (document.getElementById('company-tariffs-v4-css')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="company-tariffs-v4-css">
      .ct4{display:grid;gap:7px;min-height:0}.ct4-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.ct4-head h2{margin:0;font-size:15px}.ct4-head p{margin:2px 0 0;font-size:8.5px;color:var(--muted2)}
      .ct4-toolbar{display:flex;align-items:end;gap:7px;flex-wrap:wrap;padding:6px 9px;border:1px solid var(--border);border-radius:9px;background:var(--panel)}.ct4-field{display:grid;gap:4px}.ct4-field>span{font-size:7.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted2)}.ct4-company-field{width:min(320px,100%)}
      .ct4-stats{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-left:auto}.ct4-stat{display:inline-flex;gap:4px;align-items:center;padding:3px 7px;border:1px solid var(--border);border-radius:999px;background:var(--bg);font-size:7.5px;color:var(--muted2)}.ct4-stat b{font-size:9px;color:var(--text)}.ct4-stat.pending{color:var(--amber);border-color:rgba(245,166,35,.28)}
      .ct4-panel{border:1px solid var(--border);border-radius:9px;background:var(--panel);overflow:hidden;min-height:0}.ct4-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px;border-bottom:1px solid var(--border)}.ct4-panel-head h3{margin:0;font-size:10.5px}.ct4-panel-head p{margin:0;font-size:7.5px;color:var(--muted2)}
      .ct4-table-wrap{overflow:auto;max-height:calc(100vh - 220px)}.ct4-table{width:100%;border-collapse:collapse}.ct4-table th,.ct4-table td{padding:8px 9px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top;font-size:8.5px}.ct4-table th{position:sticky;top:0;z-index:1;background:var(--panel);font-size:7px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.ct4-table strong{display:block;font-size:9.5px;color:var(--text)}.ct4-table small{display:block;margin-top:2px;font-size:7.5px;line-height:1.35;color:var(--muted2)}.ct4-table tr:last-child td{border-bottom:0}
      .ct4-chip{display:inline-flex;align-items:center;padding:3px 6px;border:1px solid var(--border2);border-radius:999px;font-size:7.5px;color:var(--muted2);white-space:nowrap}.ct4-chip.pending{color:var(--amber);border-color:rgba(245,166,35,.3)}
      .ct4-price-main{font-weight:850;color:var(--text);white-space:nowrap}.ct4-price-km{margin-top:2px;font-size:7.5px;color:var(--muted2)}
      .ct4-next{display:grid;gap:3px;min-width:145px}.ct4-next-row{padding:5px 7px;border:1px solid rgba(79,142,247,.22);border-radius:7px;background:rgba(79,142,247,.04)}.ct4-next-row>b{font-size:7.5px;color:var(--primary)}.ct4-next-value{margin-top:3px}
      .ct4-actions{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}.ct4-action{border:1px solid var(--border2);background:var(--bg);color:var(--text);border-radius:6px;padding:4px 6px;font-size:7.5px;cursor:pointer}.ct4-action.primary{border-color:rgba(79,142,247,.35);color:var(--primary)}.ct4-action.danger{border-color:rgba(226,80,74,.3);color:var(--red)}.ct4-icon-action{border:0;background:transparent;color:var(--red);padding:1px 3px;cursor:pointer;font-size:11px;line-height:1}
      .ct4-exceptions{display:grid;gap:4px;min-width:150px}.ct4-exception{display:grid;grid-template-columns:minmax(65px,1fr) minmax(80px,1.15fr) auto;gap:5px;align-items:center}.ct4-exception-name{font-size:7.5px;color:var(--muted2);overflow:hidden;text-overflow:ellipsis}.ct4-exception-price{min-width:0}.ct4-exception-price .ct4-price-main{font-size:8px}.ct4-exception-price .ct4-price-km{font-size:7px}
      .ct4-empty{padding:22px;text-align:center;color:var(--muted2);font-size:9.5px}.ct4-error{padding:9px 11px;border:1px solid rgba(226,80,74,.3);border-radius:8px;background:rgba(226,80,74,.06);color:var(--red);font-size:8.5px}
      .ct4-dialog{width:min(650px,calc(100vw - 24px));max-width:650px}.ct4-dialog.wide{width:min(850px,calc(100vw - 24px));max-width:850px}.ct4-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ct4-full{grid-column:1/-1}.ct4-note{padding:8px 10px;border:1px solid var(--border);border-radius:7px;background:var(--bg);font-size:8px;line-height:1.4;color:var(--muted2)}
      .ct4-history{display:grid;gap:6px}.ct4-history-row{display:grid;grid-template-columns:135px 135px 1fr;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);font-size:8px;color:var(--muted2)}.ct4-history-row b{display:block;color:var(--text)}
      .ct4-schedule-list{display:grid;gap:6px}.ct4-schedule-item{display:grid;grid-template-columns:120px 1fr auto;gap:10px;align-items:center;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg)}.ct4-schedule-item small{font-size:7.5px;color:var(--muted2)}
      .ct4-embedded>.ct4-head,.ct4-embedded .ct4-company-field{display:none}.ct4-embedded .ct4-toolbar{padding:3px 0;border:0;background:transparent}.ct4-embedded .ct4-stats{margin-left:0}
      @media(max-width:900px){.ct4-table th:nth-child(2),.ct4-table td:nth-child(2){display:none}.ct4-table-wrap{max-height:none}}
      @media(max-width:650px){.ct4-grid,.ct4-history-row,.ct4-schedule-item{grid-template-columns:1fr}.ct4-stats{margin-left:0}.ct4-actions{justify-content:flex-start}.ct4-table{min-width:790px}}
    </style>`);
  }

  function ensureModals() {
    if (!document.getElementById('modal-ct4-rate')) document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-ct4-rate"><div class="modal-box ct4-dialog"><div class="modal-head"><div><span class="modal-head-title" id="ct4-rate-title">Editar precio</span><div id="ct4-rate-sub" style="font-size:8px;color:var(--muted2);margin-top:3px"></div></div><button class="modal-close" type="button" data-ct4-close="modal-ct4-rate">×</button></div><div class="modal-body" id="ct4-rate-body"></div><div class="modal-error" id="ct4-rate-error" style="display:none;margin:0 18px 12px"></div><div class="modal-footer"><button class="btn btn-ghost" type="button" data-ct4-close="modal-ct4-rate">Cancelar</button><button class="btn btn-primary" id="ct4-rate-save" type="button">Guardar precio</button></div></div></div>`);
    if (!document.getElementById('modal-ct4-history')) document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-ct4-history"><div class="modal-box ct4-dialog wide"><div class="modal-head"><span class="modal-head-title" id="ct4-history-title">Historial</span><button class="modal-close" type="button" data-ct4-close="modal-ct4-history">×</button></div><div class="modal-body" id="ct4-history-body"></div><div class="modal-footer"><button class="btn btn-ghost" type="button" data-ct4-close="modal-ct4-history">Cerrar</button></div></div></div>`);
    document.querySelectorAll('[data-ct4-close]').forEach(button => { if (button.dataset.boundCt4) return; button.dataset.boundCt4 = '1'; button.addEventListener('click', () => close(button.dataset.ct4Close)); });
    const save = document.getElementById('ct4-rate-save');
    if (save && !save.dataset.boundCt4) { save.dataset.boundCt4 = '1'; save.addEventListener('click', savePrice); }
  }

  function showModalError(message = '') { const el = document.getElementById('ct4-rate-error'); if (!el) return; el.textContent = message; el.style.display = message ? 'block' : 'none'; }

  function shell(instance) {
    const embedded = instance.mode === 'embedded';
    instance.root.innerHTML = `<div class="ct4 ${embedded ? 'ct4-embedded' : ''}">
      <div class="ct4-head"><div><h2>Tarifas</h2><p>Precio vigente y cambios futuros por servicio, sin flujo de borrador/publicación.</p></div></div>
      <section class="ct4-toolbar"><label class="ct4-field ct4-company-field"><span>Prestadora</span><select class="form-input" data-ct4-company><option value="">Seleccionar prestadora</option></select></label><div class="ct4-stats" data-ct4-stats></div></section>
      <div data-ct4-error></div><div data-ct4-content><div class="ct4-empty">${embedded ? 'Cargando precios…' : 'Seleccioná una prestadora.'}</div></div>
    </div>`;
    instance.root.querySelector('[data-ct4-company]')?.addEventListener('change', async e => { instance.companyId = e.target.value; await loadInstance(instance); });
  }

  async function loadCompanies(instance) {
    if (instance.mode !== 'standalone' || !canRead()) return;
    const result = await _db.from('companies').select('company_id,trade_name,legal_name,status').eq('status', 'active').order('trade_name');
    if (result.error) throw result.error;
    instance.companies = result.data || [];
    const select = instance.root.querySelector('[data-ct4-company]'); if (!select) return;
    select.innerHTML = '<option value="">Seleccionar prestadora</option>' + instance.companies.map(c => `<option value="${esc(c.company_id)}">${esc(c.trade_name || c.legal_name || 'Prestadora')}</option>`).join('');
    select.value = instance.companyId || '';
  }

  function formatPrice(instance, service, price) {
    if (!price) return '<span class="ct4-chip pending">Sin precio</span>';
    const currency = instance.data?.currency || 'ARS';
    if (service.distance_chargeable) return `<div><div class="ct4-price-main">${money(price.movement_price, currency)} movida</div><div class="ct4-price-km">${money(price.km_price, currency)} / KM</div></div>`;
    return `<div><div class="ct4-price-main">${money(price.unit_price, currency)}</div><div class="ct4-price-km">${esc(unitLabel(price.pricing_unit || service.pricing_unit))}</div></div>`;
  }

  function samePrice(service, a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (service.distance_chargeable) return Number(a.movement_price || 0) === Number(b.movement_price || 0) && Number(a.km_price || 0) === Number(b.km_price || 0);
    return Number(a.unit_price || 0) === Number(b.unit_price || 0);
  }

  function scheduleRows(instance, service, baseId = null) {
    return (instance.schedule || []).filter(row => String(row.concept_id) === String(service.concept_id) && String(row.billing_base_id || '') === String(baseId || '')).sort((a, b) => String(a.valid_from).localeCompare(String(b.valid_from)));
  }

  function currentForBase(service, baseId) { return baseId ? (service.base_exceptions || []).find(x => String(x.base_id) === String(baseId)) || null : service.general_price || null; }

  function priceChanges(instance, service, baseId = null) {
    let previous = currentForBase(service, baseId);
    const changes = [];
    for (const row of scheduleRows(instance, service, baseId)) { if (!samePrice(service, previous, row)) changes.push(row); previous = row; }
    return changes;
  }

  function allScheduleChanges(instance, service) {
    const keys = new Set(['']);
    for (const row of instance.schedule || []) if (String(row.concept_id) === String(service.concept_id)) keys.add(String(row.billing_base_id || ''));
    const rows = [];
    for (const key of keys) rows.push(...priceChanges(instance, service, key || null));
    return rows.sort((a, b) => String(a.valid_from).localeCompare(String(b.valid_from)));
  }

  function nextPriceHtml(instance, service) {
    const changes = priceChanges(instance, service, null);
    if (!changes.length) return '<span class="ct4-chip">Sin cambios programados</span>';
    const next = changes[0];
    return `<div class="ct4-next"><div class="ct4-next-row"><b>Desde ${dateLabel(next.valid_from)}</b><div class="ct4-next-value">${formatPrice(instance, service, next)}</div></div>${changes.length > 1 ? `<button class="ct4-action" type="button" data-ct4-schedules="${esc(service.concept_id)}">Ver ${changes.length} vigencias</button>` : ''}</div>`;
  }

  function exceptionsHtml(instance, service) {
    const current = service.base_exceptions || [];
    const scheduled = allScheduleChanges(instance, service).filter(x => x.billing_base_id);
    if (!current.length && !scheduled.length) return '<span class="ct4-chip">Sin excepciones</span>';
    return `<div class="ct4-exceptions">${current.slice(0, 2).map(row => `<div class="ct4-exception"><span class="ct4-exception-name" title="${esc(row.base_name || 'Base')}">${esc(row.base_name || 'Base')}</span><div class="ct4-exception-price">${formatPrice(instance, service, row)}</div>${canWrite() ? `<button class="ct4-icon-action" type="button" title="Eliminar excepción" data-ct4-delete-base="${esc(service.concept_id)}" data-base="${esc(row.base_id)}">×</button>` : '<span></span>'}</div>`).join('')}${current.length > 2 ? `<span class="ct4-chip">+${current.length - 2} bases</span>` : ''}${scheduled.length ? `<button class="ct4-action" type="button" data-ct4-schedules="${esc(service.concept_id)}">${scheduled.length} cambio${scheduled.length === 1 ? '' : 's'} por base programado${scheduled.length === 1 ? '' : 's'}</button>` : ''}</div>`;
  }

  function renderInstance(instance) {
    const content = instance.root.querySelector('[data-ct4-content]');
    const error = instance.root.querySelector('[data-ct4-error]');
    const stats = instance.root.querySelector('[data-ct4-stats]');
    if (!content) return;
    if (error) error.innerHTML = '';
    if (!instance.companyId) { if (stats) stats.innerHTML = ''; content.innerHTML = '<div class="ct4-empty">Seleccioná una prestadora.</div>'; return; }
    if (instance.loading) { content.innerHTML = '<div class="ct4-empty">Cargando precios…</div>'; return; }
    if (!instance.data) { content.innerHTML = '<div class="ct4-empty">No hay información disponible.</div>'; return; }

    const d = instance.data;
    const services = Array.isArray(d.services) ? d.services : [];
    const enabled = Number(d.enabled_count || 0);
    const priced = Number(d.priced_count || 0);
    const pending = Math.max(enabled - priced, 0);
    const scheduledServices = services.filter(service => allScheduleChanges(instance, service).length > 0).length;
    if (stats) stats.innerHTML = `<span class="ct4-stat"><b>${enabled}</b> servicios</span><span class="ct4-stat"><b>${priced}</b> con precio</span>${pending ? `<span class="ct4-stat pending"><b>${pending}</b> sin precio</span>` : ''}${scheduledServices ? `<span class="ct4-stat"><b>${scheduledServices}</b> con cambio futuro</span>` : ''}`;

    content.innerHTML = `<section class="ct4-panel"><div class="ct4-panel-head"><h3>Servicios</h3><p>Precio efectivo hoy · ${dateLabel(today())}</p></div><div class="ct4-table-wrap"><table class="ct4-table"><thead><tr><th>Servicio</th><th>Tipo</th><th>Precio vigente</th><th>Próxima vigencia</th><th>Excepciones por base</th><th></th></tr></thead><tbody>${services.length ? services.map(service => `<tr><td><strong>${esc(service.name)}</strong><small>${service.distance_chargeable ? 'Movida + valor por KM' : esc(unitLabel(service.pricing_unit))}</small></td><td><span class="ct4-chip">${esc(categoryLabel(service.category))}</span></td><td>${formatPrice(instance, service, service.general_price)}</td><td>${nextPriceHtml(instance, service)}</td><td>${exceptionsHtml(instance, service)}</td><td><div class="ct4-actions">${canWrite() ? `<button class="ct4-action primary" type="button" data-ct4-edit="${esc(service.concept_id)}">${service.general_price ? 'Editar' : 'Cargar precio'}</button><button class="ct4-action" type="button" data-ct4-program="${esc(service.concept_id)}">Programar</button>${(d.bases || []).length ? `<button class="ct4-action" type="button" data-ct4-base-price="${esc(service.concept_id)}">Precio por base</button>` : ''}` : ''}<button class="ct4-action" type="button" data-ct4-history="${esc(service.concept_id)}">Historial</button></div></td></tr>`).join('') : '<tr><td colspan="6"><div class="ct4-empty">No hay servicios habilitados para esta prestadora.</div></td></tr>'}</tbody></table></div></section>`;
    bindInstance(instance);
  }

  function bindInstance(instance) {
    instance.root.querySelectorAll('[data-ct4-edit]').forEach(b => b.addEventListener('click', () => openPriceEditor(instance, b.dataset.ct4Edit, { validFrom: today() })));
    instance.root.querySelectorAll('[data-ct4-program]').forEach(b => b.addEventListener('click', () => openPriceEditor(instance, b.dataset.ct4Program, { validFrom: nextMonth(), programming: true })));
    instance.root.querySelectorAll('[data-ct4-base-price]').forEach(b => b.addEventListener('click', () => openPriceEditor(instance, b.dataset.ct4BasePrice, { validFrom: today(), selectingBase: true })));
    instance.root.querySelectorAll('[data-ct4-history]').forEach(b => b.addEventListener('click', () => openHistory(instance, b.dataset.ct4History)));
    instance.root.querySelectorAll('[data-ct4-schedules]').forEach(b => b.addEventListener('click', () => openSchedules(instance, b.dataset.ct4Schedules)));
    instance.root.querySelectorAll('[data-ct4-delete-base]').forEach(b => b.addEventListener('click', () => deleteBaseException(instance, b.dataset.ct4DeleteBase, b.dataset.base)));
  }

  async function loadInstance(instance) {
    if (!canRead()) { const c = instance.root.querySelector('[data-ct4-content]'); if (c) c.innerHTML = '<div class="ct4-error">Tu rol no está habilitado para consultar Tarifas.</div>'; return; }
    if (!instance.companyId) { instance.data = null; instance.schedule = []; renderInstance(instance); return; }
    instance.loading = true;
    renderInstance(instance);
    const [prices, schedule] = await Promise.all([
      _db.rpc('get_company_service_prices_v1', { p_company_id: instance.companyId }),
      _db.rpc('get_company_service_price_schedule_v1', { p_company_id: instance.companyId })
    ]);
    instance.loading = false;
    if (prices.error || schedule.error) { const e = instance.root.querySelector('[data-ct4-error]'); if (e) e.innerHTML = `<div class="ct4-error">${esc(prices.error?.message || schedule.error?.message || 'No se pudieron cargar las tarifas.')}</div>`; return; }
    instance.data = prices.data || { services: [], bases: [] };
    instance.schedule = Array.isArray(schedule.data) ? schedule.data : [];
    renderInstance(instance);
  }

  function serviceFor(instance, conceptId) { return (instance.data?.services || []).find(s => String(s.concept_id) === String(conceptId)); }
  function scheduledFor(instance, service, validFrom, baseId) { return scheduleRows(instance, service, baseId).find(x => String(x.valid_from) === String(validFrom)) || null; }

  function openPriceEditor(instance, conceptId, { baseId = null, selectingBase = false, validFrom = today(), programming = false, scheduled = false } = {}) {
    if (!canWrite()) return notify('Solo Administración puede editar precios', 'error');
    const service = serviceFor(instance, conceptId); if (!service) return;
    const existing = scheduled ? scheduledFor(instance, service, validFrom, baseId) : currentForBase(service, baseId);
    activeEditor = { instanceId: instance.id, conceptId, baseId, selectingBase, validFrom, programming, scheduled, service };
    document.getElementById('ct4-rate-title').textContent = scheduled ? 'Editar precio programado' : programming ? 'Programar nuevo precio' : selectingBase ? 'Precio por base' : existing ? 'Editar precio vigente' : 'Cargar precio';
    document.getElementById('ct4-rate-sub').textContent = `${service.name} · ${instance.data?.company?.name || 'Prestadora'}`;
    const bases = instance.data?.bases || [];
    const baseField = selectingBase ? `<label class="ct4-field ct4-full"><span>Base *</span><select class="form-input" id="ct4-rate-base"><option value="">Seleccionar base</option>${bases.map(base => `<option value="${esc(base.base_id)}">${esc(base.name)}</option>`).join('')}</select></label>` : baseId ? `<div class="ct4-field ct4-full"><span>Base</span><div class="ct4-note">${esc(existing?.base_name || bases.find(b => String(b.base_id) === String(baseId))?.name || 'Base')}</div></div>` : '';
    const dateField = `<label class="ct4-field ct4-full"><span>Vigente desde *</span><input class="form-input" type="date" id="ct4-valid-from" min="${today()}" value="${esc(validFrom)}" ${scheduled ? 'disabled' : ''}></label><div class="ct4-note ct4-full">${scheduled ? 'Esta vigencia ya está programada. Para cambiar la fecha, cancelala y creá una nueva.' : 'Hoy aplica inmediatamente. Una fecha futura queda programada y se usa automáticamente según la fecha del servicio.'}</div>`;
    const priceFields = service.distance_chargeable ? `<label class="ct4-field"><span>Valor movida</span><input class="form-input" type="number" min="0" step="0.01" id="ct4-movement" value="${esc(existing?.movement_price ?? '')}"></label><label class="ct4-field"><span>Valor por KM</span><input class="form-input" type="number" min="0" step="0.01" id="ct4-km" value="${esc(existing?.km_price ?? '')}"></label>` : `<label class="ct4-field ct4-full"><span>Valor · ${esc(unitLabel(service.pricing_unit))}</span><input class="form-input" type="number" min="0" step="0.01" id="ct4-unit" value="${esc(existing?.unit_price ?? '')}"></label>`;
    document.getElementById('ct4-rate-body').innerHTML = `<div class="ct4-grid">${baseField}${dateField}${priceFields}</div>`;
    const save = document.getElementById('ct4-rate-save'); if (save) save.textContent = validFrom > today() ? 'Programar precio' : 'Guardar precio';
    document.getElementById('ct4-valid-from')?.addEventListener('change', e => { if (save) save.textContent = e.target.value > today() ? 'Programar precio' : 'Guardar precio'; });
    showModalError('');
    open('modal-ct4-rate');
  }

  async function savePrice() {
    const editor = activeEditor; if (!editor || !canWrite()) return;
    const instance = instances.get(editor.instanceId); if (!instance) return;
    const validFrom = document.getElementById('ct4-valid-from')?.value || today();
    if (validFrom < today()) return showModalError('La vigencia no puede comenzar en una fecha pasada.');
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
    const future = validFrom > today();
    if (future) payload.valid_from = validFrom;
    const button = document.getElementById('ct4-rate-save');
    if (button) { button.disabled = true; button.textContent = future ? 'Programando…' : 'Guardando…'; }
    const result = future ? await _db.rpc('save_company_service_price_schedule_v1', { p_payload: payload }) : await _db.rpc('save_company_service_price_v1', { p_payload: payload });
    if (button) { button.disabled = false; button.textContent = future ? 'Programar precio' : 'Guardar precio'; }
    if (result.error) return showModalError(result.error.message || 'No se pudo guardar el precio.');
    close('modal-ct4-rate');
    activeEditor = null;
    notify(future ? `Precio programado desde ${dateLabel(validFrom)}` : 'Precio actualizado', 'success');
    await reloadCompany(instance.companyId);
  }

  async function deleteBaseException(instance, conceptId, baseId) {
    if (!canWrite()) return;
    const service = serviceFor(instance, conceptId);
    const base = (instance.data?.bases || []).find(x => String(x.base_id) === String(baseId));
    if (!window.confirm(`¿Eliminar la excepción de ${base?.name || 'esta base'} para ${service?.name || 'este servicio'}?`)) return;
    const result = await _db.rpc('delete_company_service_price_exception_v1', { p_company_id: instance.companyId, p_concept_id: conceptId, p_base_id: baseId });
    if (result.error) return notify(result.error.message || 'No se pudo eliminar la excepción', 'error');
    notify('Excepción por base eliminada', 'success');
    await reloadCompany(instance.companyId);
  }

  async function cancelSchedule(instance, service, row) {
    if (!canWrite() || !window.confirm(`¿Cancelar el cambio programado para el ${dateLabel(row.valid_from)}?`)) return;
    const result = await _db.rpc('cancel_company_service_price_schedule_v1', { p_company_id: instance.companyId, p_concept_id: service.concept_id, p_valid_from: row.valid_from, p_base_id: row.billing_base_id || null });
    if (result.error) return notify(result.error.message || 'No se pudo cancelar la vigencia', 'error');
    close('modal-ct4-history');
    notify('Vigencia programada cancelada', 'success');
    await reloadCompany(instance.companyId);
  }

  function scheduleItemHtml(instance, service, row) {
    const scope = row.billing_base_id ? row.base_name || 'Base' : 'Precio general';
    return `<div class="ct4-schedule-item"><div><b>${dateLabel(row.valid_from)}</b><small>${esc(scope)}</small></div><div>${formatPrice(instance, service, row)}</div><div class="ct4-actions">${canWrite() ? `<button class="ct4-action primary" type="button" data-ct4-edit-schedule data-date="${esc(row.valid_from)}" data-base="${esc(row.billing_base_id || '')}">Editar</button><button class="ct4-action danger" type="button" data-ct4-cancel-schedule data-date="${esc(row.valid_from)}" data-base="${esc(row.billing_base_id || '')}">Cancelar</button>` : ''}</div></div>`;
  }

  function openSchedules(instance, conceptId) {
    const service = serviceFor(instance, conceptId); if (!service) return;
    const changes = allScheduleChanges(instance, service);
    document.getElementById('ct4-history-title').textContent = `Vigencias programadas · ${service.name}`;
    const body = document.getElementById('ct4-history-body');
    body.innerHTML = changes.length ? `<div class="ct4-schedule-list">${changes.map(row => scheduleItemHtml(instance, service, row)).join('')}</div>` : '<div class="ct4-empty">No hay cambios futuros programados.</div>';
    body.querySelectorAll('[data-ct4-edit-schedule]').forEach(b => b.addEventListener('click', () => { close('modal-ct4-history'); openPriceEditor(instance, conceptId, { baseId: b.dataset.base || null, validFrom: b.dataset.date, scheduled: true }); }));
    body.querySelectorAll('[data-ct4-cancel-schedule]').forEach(b => b.addEventListener('click', () => cancelSchedule(instance, service, { valid_from: b.dataset.date, billing_base_id: b.dataset.base || null })));
    open('modal-ct4-history');
  }

  function historyValue(instance, service, row) {
    if (!row) return '—';
    if (service.distance_chargeable) return `${money(row.movement_price, instance.data?.currency)} movida · ${money(row.km_price, instance.data?.currency)}/km`;
    return money(row.unit_price, instance.data?.currency);
  }

  async function openHistory(instance, conceptId) {
    const service = serviceFor(instance, conceptId); if (!service) return;
    document.getElementById('ct4-history-title').textContent = `Historial · ${service.name}`;
    document.getElementById('ct4-history-body').innerHTML = '<div class="ct4-empty">Cargando historial…</div>';
    open('modal-ct4-history');
    const result = await _db.rpc('get_company_service_price_history_v1', { p_company_id: instance.companyId, p_concept_id: conceptId });
    if (result.error) { document.getElementById('ct4-history-body').innerHTML = `<div class="ct4-error">${esc(result.error.message || 'No se pudo cargar el historial.')}</div>`; return; }
    const rows = Array.isArray(result.data) ? result.data : [];
    document.getElementById('ct4-history-body').innerHTML = rows.length ? `<div class="ct4-history">${rows.map(row => `<div class="ct4-history-row"><div><b>${esc(row.actor_name || 'Usuario')}</b><span>${row.occurred_at ? new Date(row.occurred_at).toLocaleString('es-AR') : '—'}</span></div><div><b>${esc(row.base_name || 'Precio general')}</b><span>${esc(row.operation === 'INSERT' ? 'CREACIÓN' : row.operation === 'DELETE' ? 'ELIMINACIÓN' : 'MODIFICACIÓN')}</span></div><div><b>${historyValue(instance, service, row.before)} → ${historyValue(instance, service, row.after)}</b><span>Cambio registrado automáticamente.</span></div></div>`).join('')}</div>` : '<div class="ct4-empty">Todavía no hay cambios registrados para este precio.</div>';
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
    const instance = { id: instanceId, root, mode, companyId: companyId || '', companies: [], data: null, schedule: [], loading: false };
    instances.set(instanceId, instance);
    shell(instance);
    if (mode === 'standalone') await loadCompanies(instance);
    if (instance.companyId) await loadInstance(instance); else renderInstance(instance);
    return instance;
  }

  async function mountEmbedded(root, companyId) { return mount(root, { mode: 'embedded', companyId, id: `embedded-${companyId}-${root.id || 'prices'}` }); }
  async function openForCompany(companyId) { const standalone = instances.get('standalone'); if (!standalone) return; standalone.companyId = companyId || ''; const select = standalone.root.querySelector('[data-ct4-company]'); if (select) select.value = standalone.companyId; await loadInstance(standalone); }
  async function init() { const screen = document.getElementById('screen-config-tariff-matrix'); if (!screen) return; const nav = document.querySelector('#nav-config-tariff-matrix .nav-label'); if (nav) nav.textContent = 'Tarifas'; await mount(screen, { mode: 'standalone', id: 'standalone' }); }

  window.AuxiliosCompanyTariffsV4 = { instances, mount, mountEmbedded, openForCompany, reload: reloadCompany, loadCompany: async () => { const legacyId = window.AuxiliosCompanyTariffsV4?.state?.companyId; if (legacyId) return openForCompany(legacyId); const standalone = instances.get('standalone'); if (standalone) return loadInstance(standalone); }, state: { get companyId() { return instances.get('standalone')?.companyId || ''; }, set companyId(value) { const instance = instances.get('standalone'); if (instance) instance.companyId = value || ''; } }, init };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();

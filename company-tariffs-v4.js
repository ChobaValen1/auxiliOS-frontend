/* AuxiliOS · Tarifas · precios, vigencias y edición masiva canónica */
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
  const shortDate = value => { const [y, m, d] = String(value || '').slice(0, 10).split('-'); return y && m && d ? `${d}/${m}/${y.slice(2)}` : '—'; };
  const amount = (value, currency = 'ARS') => { const n = Number(value) || 0; return new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency || 'ARS', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n); };
  const icon = name => `<svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#${name}"/></svg>`;
  async function askConfirm({ title, html, confirmLabel = 'Confirmar', danger = false, fallback = '' }) {
    const dialog = window.AuxiliosBillingParametersV4?.confirm;
    if (typeof dialog === 'function') return dialog({ title, html, confirmLabel, danger });
    return window.confirm(fallback || title);
  }
  const KM_FIELDS = [['movement_price', 'Movida'], ['asphalt_km_price', 'KM asfalto'], ['gravel_km_price', 'KM ripio']];
  const fieldValue = (price, field) => { if (!price) return null; const value = field === 'asphalt_km_price' ? (price.asphalt_km_price ?? price.km_price) : field === 'gravel_km_price' ? (price.gravel_km_price ?? price.km_price) : price[field]; return value === null || value === undefined ? null : Number(value); };

  function injectStyles() {
    if (document.getElementById('company-tariffs-v4-css')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="company-tariffs-v4-css">
      .ct4{display:grid;gap:7px;min-height:0}.ct4-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.ct4-head h2{margin:0;font-size:15px}.ct4-head p{margin:2px 0 0;font-size:8.5px;color:var(--muted2)}
      .ct4-toolbar{display:flex;align-items:end;gap:7px;flex-wrap:wrap;padding:6px 9px;border:1px solid var(--border);border-radius:9px;background:var(--panel)}.ct4-field{display:grid;gap:4px}.ct4-field>span{font-size:7.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted2)}.ct4-company-field{width:min(320px,100%)}
      .ct4-stats{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-left:auto}.ct4-stat{display:inline-flex;gap:4px;align-items:center;padding:3px 7px;border:1px solid var(--border);border-radius:999px;background:var(--bg);font-size:7.5px;color:var(--muted2)}.ct4-stat b{font-size:9px;color:var(--text)}.ct4-stat.pending{color:var(--amber);border-color:rgba(245,166,35,.28)}
      .ct4-panel{border:1px solid var(--border);border-radius:9px;background:var(--panel);overflow:hidden;min-height:0}.ct4-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px;border-bottom:1px solid var(--border)}.ct4-panel-head h3{margin:0;font-size:10.5px}.ct4-panel-head p{margin:0;font-size:7.5px;color:var(--muted2)}.ct4-panel-head-main{display:flex;align-items:center;gap:10px}.ct4-panel-head-actions{display:flex;align-items:center;gap:6px;margin-left:auto}
      .ct4-table-wrap{overflow:auto;max-height:calc(100vh - 220px)}.ct4-table{width:100%;border-collapse:collapse}.ct4-table th,.ct4-table td{padding:8px 9px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top;font-size:8.5px}.ct4-table th{position:sticky;top:0;z-index:1;background:var(--panel);font-size:7px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.ct4-table strong{display:block;font-size:9.5px;color:var(--text)}.ct4-table small{display:block;margin-top:2px;font-size:7.5px;line-height:1.35;color:var(--muted2)}.ct4-table tr:last-child td{border-bottom:0}
      .ct4-chip{display:inline-flex;align-items:center;padding:3px 6px;border:1px solid var(--border2);border-radius:999px;font-size:7.5px;color:var(--muted2);white-space:nowrap}.ct4-chip.pending{color:var(--amber);border-color:rgba(245,166,35,.3)}
      .ct4-price-main{font-weight:850;color:var(--text);white-space:nowrap}.ct4-price-km{margin-top:2px;font-size:7.5px;color:var(--muted2)}
      .ct4-next{display:grid;gap:3px;min-width:145px}.ct4-next-row{padding:5px 7px;border:1px solid rgba(79,142,247,.22);border-radius:7px;background:rgba(79,142,247,.04)}.ct4-next-row>b{font-size:7.5px;color:var(--primary)}.ct4-next-value{margin-top:3px}
      .ct4-actions{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}.ct4-action{border:1px solid var(--border2);background:var(--bg);color:var(--text);border-radius:6px;padding:4px 6px;font-size:7.5px;cursor:pointer}.ct4-action.primary{border-color:rgba(79,142,247,.35);color:var(--primary)}.ct4-action.danger{border-color:rgba(226,80,74,.3);color:var(--red)}.ct4-action:disabled{opacity:.45;cursor:not-allowed}.ct4-icon-action{border:0;background:transparent;color:var(--red);padding:1px 3px;cursor:pointer;font-size:11px;line-height:1}
      .ct4-exceptions{display:grid;gap:4px;min-width:150px}.ct4-exception{display:grid;grid-template-columns:minmax(65px,1fr) minmax(80px,1.15fr) auto;gap:5px;align-items:center}.ct4-exception-name{font-size:7.5px;color:var(--muted2);overflow:hidden;text-overflow:ellipsis}.ct4-exception-price{min-width:0}.ct4-exception-price .ct4-price-main{font-size:8px}.ct4-exception-price .ct4-price-km{font-size:7px}
      .ct4-empty{padding:22px;text-align:center;color:var(--muted2);font-size:9.5px}.ct4-error{padding:9px 11px;border:1px solid rgba(226,80,74,.3);border-radius:8px;background:rgba(226,80,74,.06);color:var(--red);font-size:8.5px}
      .ct4-dialog{width:min(650px,calc(100vw - 24px));max-width:650px}.ct4-dialog.wide{width:min(850px,calc(100vw - 24px));max-width:850px}.ct4-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ct4-full{grid-column:1/-1}.ct4-note{padding:8px 10px;border:1px solid var(--border);border-radius:7px;background:var(--bg);font-size:8px;line-height:1.4;color:var(--muted2)}
      .ct4-history{display:grid;gap:6px}.ct4-history-row{display:grid;grid-template-columns:135px 135px 1fr;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);font-size:8px;color:var(--muted2)}.ct4-history-row b{display:block;color:var(--text)}
      .ct4-schedule-list{display:grid;gap:6px}.ct4-schedule-item{display:grid;grid-template-columns:120px 1fr auto;gap:10px;align-items:center;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg)}.ct4-schedule-item small{font-size:7.5px;color:var(--muted2)}
      .ct4-bulk-grid{display:grid;grid-template-columns:repeat(3,minmax(72px,1fr));gap:5px;min-width:240px}.ct4-bulk-grid.single{grid-template-columns:minmax(100px,155px);min-width:120px}.ct4-bulk-field{display:grid;gap:3px;min-width:0}.ct4-bulk-field span{font-size:6.8px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}.ct4-bulk-field input{width:100%;height:27px;box-sizing:border-box;padding:0 6px;border:1px solid var(--border2);border-radius:6px;background:var(--bg);color:var(--text);font:inherit;font-size:8.5px;outline:none}.ct4-bulk-field input:focus{border-color:var(--primary);box-shadow:0 0 0 2px rgba(79,142,247,.12)}.ct4-bulk-field input.dirty{border-color:var(--amber);background:var(--amber-lo)}
      .ct4-bulk-savebar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 10px;border-top:1px solid var(--border);background:var(--bg)}.ct4-bulk-savebar>div:first-child{display:grid;gap:2px}.ct4-bulk-savebar b{font-size:9px}.ct4-bulk-savebar small{font-size:7.5px;color:var(--muted2)}.ct4-bulk-savebar-actions{display:flex;align-items:center;gap:6px}.ct4-bulk-savebar .btn{font-size:8.5px;padding:0 10px;min-height:28px}
      .ct4-embedded>.ct4-head,.ct4-embedded .ct4-company-field{display:none}.ct4-embedded .ct4-toolbar{padding:3px 0;border:0;background:transparent}.ct4-embedded .ct4-stats{margin-left:0}
      @media(max-width:900px){.ct4-table th:nth-child(2),.ct4-table td:nth-child(2){display:none}.ct4-table-wrap{max-height:none}}
      @media(max-width:780px){.ct4-bulk-grid{grid-template-columns:1fr}.ct4-bulk-savebar{align-items:stretch;flex-direction:column}.ct4-bulk-savebar-actions{justify-content:flex-end}}
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

  function emptyBulkState() { return { editing: false, values: new Map(), dirtyKeys: new Set(), saving: false }; }
  function resetBulk(instance) { instance.bulk = emptyBulkState(); }

  function shell(instance) {
    const embedded = instance.mode === 'embedded';
    instance.root.innerHTML = `<div class="ct4 ${embedded ? 'ct4-embedded' : ''}">
      <div class="ct4-head"><div><h2>Tarifas</h2><p>Precio vigente y cambios futuros por servicio.</p></div></div>
      <section class="ct4-toolbar"><label class="ct4-field ct4-company-field"><span>Prestadora</span><select class="form-input" data-ct4-company><option value="">Seleccionar prestadora</option></select></label><label class="ct4-search">${icon('search')}<input type="search" placeholder="Buscar servicio" aria-label="Buscar servicio" autocomplete="off" data-ct4-search></label><div class="ct4-stats" data-ct4-stats></div></section>
      <div data-ct4-error></div><div data-ct4-content><div class="ct4-empty">${embedded ? 'Cargando precios…' : 'Seleccioná una prestadora.'}</div></div>
    </div>`;
    instance.root.querySelector('[data-ct4-company]')?.addEventListener('change', async e => {
      instance.companyId = e.target.value;
      instance.expanded = new Set();
      resetBulk(instance);
      await loadInstance(instance);
    });
    instance.root.querySelector('[data-ct4-search]')?.addEventListener('input', e => { instance.query = e.target.value; renderInstance(instance); });
  }

  async function loadCompanies(instance) {
    if (instance.mode !== 'standalone' || !canRead()) return;
    const result = await _db.from('companies').select('company_id,trade_name,legal_name,status,client_kind').eq('status', 'active').order('trade_name');
    if (result.error) throw result.error;
    instance.companies = (result.data || []).filter(c => !(c && (c.client_kind === 'particular' || /^particulares$/i.test(String(c.trade_name || c.legal_name || '').trim()))));   // "Particulares" no es una prestadora
    const select = instance.root.querySelector('[data-ct4-company]'); if (!select) return;
    select.innerHTML = '<option value="">Seleccionar prestadora</option>' + instance.companies.map(c => `<option value="${esc(c.company_id)}">${esc(c.trade_name || c.legal_name || 'Prestadora')}</option>`).join('');
    select.value = instance.companyId || '';
  }

  function priceStack(instance, service, price) {
    if (!price) return '<span class="ct4-none">Sin precio</span>';
    const currency = instance.data?.currency || 'ARS';
    if (service.distance_chargeable) return `<div class="ct4-stack">${KM_FIELDS.map(([field, label]) => `<span><small>${label}</small><b>${amount(fieldValue(price, field), currency)}</b></span>`).join('')}</div>`;
    return `<div class="ct4-stack"><span><small>${esc(unitLabel(price.pricing_unit || service.pricing_unit))}</small><b>${amount(price.unit_price, currency)}</b></span></div>`;
  }

  function samePrice(service, a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (service.distance_chargeable) return Number(a.movement_price || 0) === Number(b.movement_price || 0)
      && Number(a.asphalt_km_price ?? a.km_price ?? 0) === Number(b.asphalt_km_price ?? b.km_price ?? 0)
      && Number(a.gravel_km_price ?? a.km_price ?? 0) === Number(b.gravel_km_price ?? b.km_price ?? 0);
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

  function originalBulkValue(service, field) {
    const price = service?.general_price;
    if (!price) return '';
    const value = field === 'movement_price' ? price.movement_price
      : field === 'asphalt_km_price' ? (price.asphalt_km_price ?? price.km_price)
      : field === 'gravel_km_price' ? (price.gravel_km_price ?? price.km_price)
      : price.unit_price;
    return value === null || value === undefined ? '' : String(Number(value));
  }

  function normalizeBulkValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, '') : raw;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : raw;
  }

  const bulkKey = (conceptId, field) => `${conceptId}:${field}`;
  function bulkInputValue(instance, service, field) {
    const key = bulkKey(service.concept_id, field);
    return instance.bulk.values.has(key) ? instance.bulk.values.get(key) : originalBulkValue(service, field);
  }
  function bulkChanged(service, field, value) { return normalizeBulkValue(value) !== normalizeBulkValue(originalBulkValue(service, field)); }

  function bulkCell(instance, service, field, label) {
    const key = bulkKey(service.concept_id, field);
    const dirty = instance.bulk.dirtyKeys.has(key);
    return `<input type="text" inputmode="decimal" class="ct4-cell-input ${dirty ? 'dirty' : ''}" value="${esc(bulkInputValue(instance, service, field))}" placeholder="—" aria-label="${esc(service.name)} · ${esc(label)}" data-ct4-bulk-input data-concept="${esc(service.concept_id)}" data-field="${field}">`;
  }

  function bulkSavebar(instance) {
    const count = instance.bulk.dirtyKeys.size;
    return `<div class="ct4-bulk-savebar"><div><b>Edición masiva de precios vigentes</b><small>${count} celda${count === 1 ? '' : 's'} modificada${count === 1 ? '' : 's'}</small></div><div class="ct4-bulk-savebar-actions"><button class="btn btn-ghost" type="button" data-ct4-bulk-discard ${instance.bulk.saving ? 'disabled' : ''}>Descartar</button><button class="btn btn-primary" type="button" data-ct4-bulk-save ${count === 0 || instance.bulk.saving ? 'disabled' : ''}>${instance.bulk.saving ? 'Actualizando…' : `Actualizar (${count})`}</button></div></div>`;
  }

  const FILTERS = [
    ['all', 'servicios', () => true],
    ['priced', 'con precio', service => Boolean(service.general_price)],
    ['pending', 'sin precio', service => !service.general_price],
    ['scheduled', 'con cambio programado', (service, instance) => allScheduleChanges(instance, service).length > 0],
    ['bases', 'con precio por base', service => (service.base_exceptions || []).length > 0]
  ];

  function newsHtml(instance, service, bases, expanded, bulk) {
    const id = esc(service.concept_id), tags = [];
    const general = priceChanges(instance, service, null), all = allScheduleChanges(instance, service);
    if (all.length) {
      const first = general[0] || all[0];
      const label = general.length ? `Cambia el ${shortDate(first.valid_from)}` : `Cambia en una base el ${shortDate(first.valid_from)}`;
      tags.push(`<button type="button" class="ct4-tag info" data-ct4-schedules="${id}" title="Ver cambios programados">${icon('calendar-clock')}<span>${label}</span>${all.length > 1 ? `<em>+${all.length - 1}</em>` : ''}</button>`);
    }
    if (bases.length) {
      const text = `${bases.length} base${bases.length === 1 ? '' : 's'} con precio propio`;
      tags.push(bulk ? `<span class="ct4-tag">${icon('map-pin')}<span>${text}</span></span>` : `<button type="button" class="ct4-tag ${expanded ? 'on' : ''}" data-ct4-toggle-bases="${id}" aria-expanded="${expanded ? 'true' : 'false'}">${icon('map-pin')}<span>${text}</span>${icon('chevron-down')}</button>`);
    }
    return tags.length ? `<div class="ct4-tags">${tags.join('')}</div>` : '<span class="ct4-muted">—</span>';
  }

  function actionsHtml(instance, service) {
    const id = esc(service.concept_id);
    const main = canWrite() ? `<button type="button" class="ct4-btn ${service.general_price ? '' : 'primary'}" data-ct4-edit="${id}">${service.general_price ? 'Editar' : 'Cargar precio'}</button>` : '';
    return `<div class="ct4-row-actions">${main}<button type="button" class="ct4-icon" data-ct4-menu="${id}" aria-haspopup="menu" aria-expanded="false" aria-label="Más opciones: ${esc(service.name)}" title="Más opciones">${icon('ellipsis')}</button></div>`;
  }

  function baseRowsHtml(instance, service, km) {
    const currency = instance.data?.currency || 'ARS', general = service.general_price, id = esc(service.concept_id);
    const cell = (row, field, label) => { const value = fieldValue(row, field), base = fieldValue(general, field); return `<td class="num" data-label="${label}"><span class="${base !== null && value !== base ? 'ct4-diff' : ''}">${value === null ? '—' : amount(value, currency)}</span></td>`; };
    const head = `<tr class="ct4-subhead"><td colspan="${km ? 6 : 5}">Excepciones por base · en estas bases se cobra este precio en lugar del general</td></tr>`;
    return head + (service.base_exceptions || []).map(row => `<tr class="ct4-subrow"><td class="ct4-c-name"><div class="ct4-name ct4-base-name">${icon('map-pin')}<b>${esc(row.base_name || 'Base')}</b></div></td>${km ? KM_FIELDS.map(([field, label]) => cell(row, field, label)).join('') : `${cell(row, 'unit_price', 'Precio')}<td class="ct4-c-unit" data-label="Se cobra">${esc(unitLabel(row.pricing_unit || service.pricing_unit))}</td>`}<td class="ct4-c-news"></td><td class="ct4-c-act">${canWrite() ? `<div class="ct4-row-actions"><button type="button" class="ct4-btn sm" data-ct4-edit-base="${id}" data-base="${esc(row.base_id)}">Editar</button><button type="button" class="ct4-icon danger" data-ct4-delete-base="${id}" data-base="${esc(row.base_id)}" title="Quitar el precio de esta base" aria-label="Quitar el precio de ${esc(row.base_name || 'la base')}">${icon('trash-2')}</button></div>` : ''}</td></tr>`).join('');
  }

  function rowHtml(instance, service, km, bulk) {
    const price = service.general_price, currency = instance.data?.currency || 'ARS', bases = service.base_exceptions || [];
    const expanded = !bulk && bases.length > 0 && instance.expanded.has(String(service.concept_id));
    let cells;
    if (km) cells = bulk ? KM_FIELDS.map(([field, label]) => `<td class="num" data-label="${label}">${bulkCell(instance, service, field, label)}</td>`).join('')
      : price ? KM_FIELDS.map(([field, label]) => `<td class="num" data-label="${label}">${amount(fieldValue(price, field), currency)}</td>`).join('')
      : `<td class="ct4-c-none" colspan="3" data-label="Precio"><span class="ct4-none">${icon('circle-alert')}Sin precio cargado</span></td>`;
    else cells = `${bulk ? `<td class="num" data-label="Precio">${bulkCell(instance, service, 'unit_price', 'Precio')}</td>` : price ? `<td class="num" data-label="Precio">${amount(price.unit_price, currency)}</td>` : `<td class="ct4-c-none" data-label="Precio"><span class="ct4-none">${icon('circle-alert')}Sin precio</span></td>`}<td class="ct4-c-unit" data-label="Se cobra">${esc(unitLabel(price?.pricing_unit || service.pricing_unit))}</td>`;
    return `<tr class="ct4-row ${price ? '' : 'is-pending'} ${expanded ? 'is-open' : ''}"><td class="ct4-c-name"><div class="ct4-name"><b>${esc(service.name)}</b><small>${esc(categoryLabel(service.category))}</small></div></td>${cells}<td class="ct4-c-news" data-label="Novedades">${newsHtml(instance, service, bases, expanded, bulk)}</td><td class="ct4-c-act">${bulk ? '' : actionsHtml(instance, service)}</td></tr>${expanded ? baseRowsHtml(instance, service, km) : ''}`;
  }

  function groupHtml(instance, group, bulk) {
    const km = group.key === 'km';
    const cols = km ? '<col class="c-name"><col class="c-num"><col class="c-num"><col class="c-num"><col class="c-news"><col class="c-act">' : '<col class="c-name"><col class="c-num"><col class="c-unit"><col class="c-news"><col class="c-act">';
    const head = km ? '<th>Servicio</th><th class="num">Movida</th><th class="num">KM asfalto</th><th class="num">KM ripio</th><th>Novedades</th><th><span class="ct4-sr">Acciones</span></th>' : '<th>Servicio</th><th class="num">Precio</th><th>Se cobra</th><th>Novedades</th><th><span class="ct4-sr">Acciones</span></th>';
    return `<section class="ct4-group"><div class="ct4-group-head"><h4>${group.title}<span class="ct4-count">${group.rows.length}</span></h4><p>${group.sub}</p></div><div class="ct4-table-wrap"><table class="ct4-ptable ${km ? 'is-km' : 'is-unit'}"><colgroup>${cols}</colgroup><thead><tr>${head}</tr></thead><tbody>${group.rows.map(service => rowHtml(instance, service, km, bulk)).join('')}</tbody></table></div></section>`;
  }

  function renderInstance(instance) {
    closeRowMenu();
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
    let filter = FILTERS.find(([key]) => key === instance.filter) || FILTERS[0];
    if (filter[0] !== 'all' && !services.some(service => filter[2](service, instance))) { instance.filter = 'all'; filter = FILTERS[0]; }
    if (stats) stats.innerHTML = FILTERS.map(([key, label, test]) => {
      const count = services.filter(service => test(service, instance)).length;
      if (!['all', 'priced'].includes(key) && !count) return '';
      const on = filter[0] === key;
      return `<button type="button" class="ct4-stat ${key === 'pending' ? 'pending' : ''} ${on ? 'on' : ''}" data-ct4-filter="${key}" aria-pressed="${on ? 'true' : 'false'}"><b>${count}</b> ${label}</button>`;
    }).join('');

    const query = norm(instance.query);
    const visible = services.filter(service => filter[2](service, instance) && (!query || norm(service.name).includes(query)));
    const bulk = canWrite() && instance.bulk.editing;
    const groups = [
      { key: 'km', title: 'Con kilómetros', sub: 'Se cobra Movida + KM Asfalto + KM Ripio.', rows: visible.filter(service => service.distance_chargeable) },
      { key: 'unit', title: 'Precio por unidad', sub: 'Se cobra un valor por servicio, hora, día, km o unidad.', rows: visible.filter(service => !service.distance_chargeable) }
    ];
    const head = `<div class="ct4-panel-head"><div class="ct4-panel-head-main"><h3>Precios vigentes</h3><p>Hoy, ${dateLabel(today())}. Los cambios programados se aplican solos en su fecha.</p></div>${canWrite() ? `<div class="ct4-panel-head-actions"><button class="ct4-btn ${bulk ? '' : 'primary'}" type="button" data-ct4-bulk-toggle ${instance.bulk.saving ? 'disabled' : ''}>${icon(bulk ? 'x' : 'pencil')}${bulk ? 'Salir de edición' : 'Editar en lote'}</button></div>` : ''}</div>`;
    let body;
    if (!services.length) body = '<div class="ct4-empty">No hay servicios habilitados para esta prestadora.</div>';
    else if (!visible.length) body = '<div class="ct4-empty">Ningún servicio coincide con la búsqueda o el filtro. <button type="button" class="ct4-link" data-ct4-filter="all" data-ct4-clear>Ver todos</button></div>';
    else body = groups.filter(group => group.rows.length).map(group => groupHtml(instance, group, bulk)).join('');
    content.innerHTML = `<section class="ct4-panel ${bulk ? 'is-bulk' : ''}">${head}${bulk ? '<div class="ct4-bulk-hint">Cambiá los importes directamente en la tabla. Las celdas modificadas quedan marcadas y se guardan todas juntas con «Actualizar».</div>' : ''}${body}${bulk ? bulkSavebar(instance) : ''}</section>`;
    bindInstance(instance);
  }

  function bindInstance(instance) {
    instance.root.querySelectorAll('[data-ct4-edit]').forEach(b => b.addEventListener('click', () => openPriceEditor(instance, b.dataset.ct4Edit, { validFrom: today() })));
    instance.root.querySelectorAll('[data-ct4-edit-base]').forEach(b => b.addEventListener('click', () => openPriceEditor(instance, b.dataset.ct4EditBase, { baseId: b.dataset.base, validFrom: today() })));
    instance.root.querySelectorAll('[data-ct4-schedules]').forEach(b => b.addEventListener('click', () => openSchedules(instance, b.dataset.ct4Schedules)));
    instance.root.querySelectorAll('[data-ct4-delete-base]').forEach(b => b.addEventListener('click', () => deleteBaseException(instance, b.dataset.ct4DeleteBase, b.dataset.base)));
    instance.root.querySelectorAll('[data-ct4-toggle-bases]').forEach(b => b.addEventListener('click', () => { const key = String(b.dataset.ct4ToggleBases); if (instance.expanded.has(key)) instance.expanded.delete(key); else instance.expanded.add(key); renderInstance(instance); }));
    instance.root.querySelectorAll('[data-ct4-menu]').forEach(b => b.addEventListener('click', () => openRowMenu(instance, b.dataset.ct4Menu, b)));
    instance.root.querySelectorAll('[data-ct4-filter]').forEach(b => b.addEventListener('click', () => {
      instance.filter = b.dataset.ct4Filter;
      if (b.hasAttribute('data-ct4-clear')) { instance.query = ''; const search = instance.root.querySelector('[data-ct4-search]'); if (search) search.value = ''; }
      renderInstance(instance);
    }));
    instance.root.querySelector('[data-ct4-bulk-toggle]')?.addEventListener('click', () => toggleBulk(instance));
    instance.root.querySelectorAll('[data-ct4-bulk-input]').forEach(input => input.addEventListener('input', () => onBulkInput(instance, input)));
    instance.root.querySelector('[data-ct4-bulk-discard]')?.addEventListener('click', () => discardBulk(instance));
    instance.root.querySelector('[data-ct4-bulk-save]')?.addEventListener('click', () => saveBulk(instance));
  }

  let rowMenu = null;
  function closeRowMenu() { if (!rowMenu) return; rowMenu.el.remove(); rowMenu.anchor?.setAttribute('aria-expanded', 'false'); rowMenu = null; }
  function openRowMenu(instance, conceptId, anchor) {
    const same = rowMenu && rowMenu.anchor === anchor;
    closeRowMenu();
    if (same) return;
    const service = serviceFor(instance, conceptId); if (!service) return;
    const changes = allScheduleChanges(instance, service), items = [];
    if (canWrite()) items.push(['program', 'calendar-clock', 'Programar cambio de precio', 'Elegís desde qué fecha rige el precio nuevo']);
    if (canWrite() && (instance.data?.bases || []).length) items.push(['base', 'map-pin', 'Precio para una base', 'Un precio distinto solo para esa base']);
    if (changes.length) items.push(['schedules', 'calendar', `Ver cambios programados (${changes.length})`, '']);
    items.push(['history', 'history', 'Historial de cambios', 'Quién cambió el precio y cuándo']);
    const el = document.createElement('div');
    el.id = 'ct4-row-menu';
    el.setAttribute('role', 'menu');
    el.innerHTML = items.map(([action, name, label, hint]) => `<button type="button" role="menuitem" data-ct4-menu-action="${action}">${icon(name)}<span><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</span></button>`).join('');
    document.body.appendChild(el);
    const rect = anchor.getBoundingClientRect(), width = el.offsetWidth, height = el.offsetHeight;
    el.style.left = `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`;
    el.style.top = `${rect.bottom + 6 + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : rect.bottom + 6}px`;
    anchor.setAttribute('aria-expanded', 'true');
    rowMenu = { el, anchor };
    el.addEventListener('click', event => {
      const button = event.target.closest('[data-ct4-menu-action]'); if (!button) return;
      const action = button.dataset.ct4MenuAction;
      closeRowMenu();
      if (action === 'program') openPriceEditor(instance, conceptId, { validFrom: nextMonth(), programming: true });
      else if (action === 'base') openPriceEditor(instance, conceptId, { validFrom: today(), selectingBase: true });
      else if (action === 'schedules') openSchedules(instance, conceptId);
      else if (action === 'history') openHistory(instance, conceptId);
    });
    el.querySelector('button')?.focus({ preventScroll: true });
  }
  document.addEventListener('click', event => { if (rowMenu && !rowMenu.el.contains(event.target) && !rowMenu.anchor.contains(event.target)) closeRowMenu(); }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && rowMenu) { event.stopPropagation(); const anchor = rowMenu.anchor; closeRowMenu(); anchor?.focus(); } }, true);
  window.addEventListener('resize', closeRowMenu);
  window.addEventListener('scroll', event => { if (rowMenu && !rowMenu.el.contains(event.target)) closeRowMenu(); }, true);

  function onBulkInput(instance, input) {
    const service = serviceFor(instance, input.dataset.concept);
    if (!service) return;
    const key = bulkKey(service.concept_id, input.dataset.field);
    instance.bulk.values.set(key, input.value);
    if (bulkChanged(service, input.dataset.field, input.value)) instance.bulk.dirtyKeys.add(key);
    else { instance.bulk.dirtyKeys.delete(key); instance.bulk.values.delete(key); }
    input.classList.toggle('dirty', instance.bulk.dirtyKeys.has(key));
    const bar = instance.root.querySelector('.ct4-bulk-savebar');
    if (bar) { bar.outerHTML = bulkSavebar(instance); instance.root.querySelector('[data-ct4-bulk-save]')?.addEventListener('click', () => saveBulk(instance)); instance.root.querySelector('[data-ct4-bulk-discard]')?.addEventListener('click', () => discardBulk(instance)); }
  }

  function toggleBulk(instance) {
    if (!canWrite() || instance.bulk.saving) return;
    if (instance.bulk.editing) return discardBulk(instance);
    instance.bulk.editing = true;
    instance.bulk.values.clear();
    instance.bulk.dirtyKeys.clear();
    renderInstance(instance);
  }

  async function discardBulk(instance) {
    if (instance.bulk.saving) return;
    const count = instance.bulk.dirtyKeys.size;
    if (count && !(await askConfirm({ title: '¿Descartar los cambios?', html: `<p class="bp4-confirm-text">Tenés <b>${count} importe${count === 1 ? '' : 's'} modificado${count === 1 ? '' : 's'}</b> sin guardar. Si salís de la edición, se pierden.</p>`, confirmLabel: 'Sí, descartar', danger: true, fallback: '¿Descartar los cambios de tarifas sin guardar?' }))) return;
    resetBulk(instance);
    renderInstance(instance);
  }

  function bulkPayloadForService(instance, service) {
    const payload = { concept_id: service.concept_id, billing_base_id: null };
    if (service.distance_chargeable) {
      const movement = normalizeBulkValue(bulkInputValue(instance, service, 'movement_price'));
      const asphalt = normalizeBulkValue(bulkInputValue(instance, service, 'asphalt_km_price'));
      const gravel = normalizeBulkValue(bulkInputValue(instance, service, 'gravel_km_price'));
      if (!Number.isFinite(movement) || movement < 0 || !Number.isFinite(asphalt) || asphalt < 0 || !Number.isFinite(gravel) || gravel < 0) throw new Error(`${service.name}: completá movida, KM asfalto y KM ripio con importes válidos.`);
      payload.movement_price = movement;
      payload.asphalt_km_price = asphalt;
      payload.gravel_km_price = gravel;
    } else {
      const value = normalizeBulkValue(bulkInputValue(instance, service, 'unit_price'));
      if (!Number.isFinite(value) || value < 0) throw new Error(`${service.name}: ingresá un importe válido.`);
      payload.unit_price = value;
    }
    return payload;
  }

  async function saveBulk(instance) {
    if (!canWrite() || instance.bulk.saving || !instance.bulk.dirtyKeys.size) return;
    const conceptIds = [...new Set([...instance.bulk.dirtyKeys].map(key => key.split(':')[0]))];
    let prices;
    try {
      prices = conceptIds.map(conceptId => {
        const service = serviceFor(instance, conceptId);
        if (!service) throw new Error('Una tarifa modificada ya no está disponible.');
        return bulkPayloadForService(instance, service);
      });
    } catch (error) {
      return notify(error.message || 'Revisá los importes modificados.', 'error');
    }
    const currency = instance.data?.currency || 'ARS';
    const fieldLabel = field => ({ movement_price: 'Movida', asphalt_km_price: 'KM asfalto', gravel_km_price: 'KM ripio', unit_price: 'Precio' }[field] || field);
    const rows = [...instance.bulk.dirtyKeys].map(key => { const [conceptId, field] = key.split(':'); const service = serviceFor(instance, conceptId); const before = originalBulkValue(service, field); const after = normalizeBulkValue(bulkInputValue(instance, service, field)); return `<div class="bp4-diff-row"><b>${esc(service?.name || 'Servicio')} · ${esc(fieldLabel(field))}</b><span class="was">${before === '' ? 'Sin precio' : esc(amount(before, currency))}</span><i>→</i><span class="now">${esc(amount(after, currency))}</span></div>`; });
    const confirmed = await askConfirm({ title: `Actualizar ${prices.length} precio${prices.length === 1 ? '' : 's'}`, html: `<p class="bp4-confirm-text">Los precios nuevos rigen desde hoy para los servicios que se carguen de ahora en más. El cambio queda en el historial.</p><div class="bp4-diff">${rows.join('')}</div>`, confirmLabel: 'Sí, actualizar', fallback: `¿Actualizar ${prices.length} precio(s)?` });
    if (!confirmed) return;
    instance.bulk.saving = true;
    renderInstance(instance);
    const result = await _db.rpc('bulk_save_company_service_prices_v1', { p_payload: { company_id: instance.companyId, prices } });
    instance.bulk.saving = false;
    if (result.error) { renderInstance(instance); return notify(result.error.message || 'No se pudieron actualizar las tarifas.', 'error'); }
    const count = Number(result.data?.count || prices.length);
    resetBulk(instance);
    notify(`${count} tarifa${count === 1 ? '' : 's'} actualizada${count === 1 ? '' : 's'} en una sola operación`, 'success');
    await reloadCompany(instance.companyId);
  }

  async function loadInstance(instance) {
    if (!canRead()) { const c = instance.root.querySelector('[data-ct4-content]'); if (c) c.innerHTML = '<div class="ct4-error">Tu rol no está habilitado para consultar Tarifas.</div>'; return; }
    if (!instance.companyId) { instance.data = null; instance.schedule = []; resetBulk(instance); renderInstance(instance); return; }
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
    const priceFields = service.distance_chargeable ? `<label class="ct4-field"><span>Valor movida</span><input class="form-input" type="number" min="0" step="0.01" id="ct4-movement" value="${esc(existing?.movement_price ?? '')}"></label><label class="ct4-field"><span>KM Asfalto</span><input class="form-input" type="number" min="0" step="0.01" id="ct4-asphalt" value="${esc(existing?.asphalt_km_price ?? existing?.km_price ?? '')}"></label><label class="ct4-field"><span>KM Ripio</span><input class="form-input" type="number" min="0" step="0.01" id="ct4-gravel" value="${esc(existing?.gravel_km_price ?? existing?.km_price ?? '')}"></label><div class="ct4-note">El radio cubierto consume primero KM de asfalto y luego KM de ripio.</div>` : `<label class="ct4-field ct4-full"><span>Valor · ${esc(unitLabel(service.pricing_unit))}</span><input class="form-input" type="number" min="0" step="0.01" id="ct4-unit" value="${esc(existing?.unit_price ?? '')}"></label>`;
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
      const movement = Number(document.getElementById('ct4-movement')?.value);
      const asphalt = Number(document.getElementById('ct4-asphalt')?.value);
      const gravel = Number(document.getElementById('ct4-gravel')?.value);
      if (!Number.isFinite(movement) || movement < 0 || !Number.isFinite(asphalt) || asphalt < 0 || !Number.isFinite(gravel) || gravel < 0) return showModalError('Completá valores válidos para movida, KM asfalto y KM ripio.');
      payload.movement_price = movement;
      payload.asphalt_km_price = asphalt;
      payload.gravel_km_price = gravel;
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
    if (!(await askConfirm({ title: 'Quitar el precio de la base', html: `<p class="bp4-confirm-text">En <b>${esc(base?.name || 'esta base')}</b> se va a cobrar el precio general de <b>${esc(service?.name || 'este servicio')}</b>. El cambio queda en el historial.</p>`, confirmLabel: 'Sí, quitar', danger: true, fallback: `¿Eliminar la excepción de ${base?.name || 'esta base'} para ${service?.name || 'este servicio'}?` }))) return;
    const result = await _db.rpc('delete_company_service_price_exception_v1', { p_company_id: instance.companyId, p_concept_id: conceptId, p_base_id: baseId });
    if (result.error) return notify(result.error.message || 'No se pudo eliminar la excepción', 'error');
    notify('Excepción por base eliminada', 'success');
    await reloadCompany(instance.companyId);
  }

  async function cancelSchedule(instance, service, row) {
    if (!canWrite()) return;
    if (!(await askConfirm({ title: 'Cancelar el cambio programado', html: `<p class="bp4-confirm-text">El precio programado para el <b>${esc(dateLabel(row.valid_from))}</b> no se va a aplicar. Sigue rigiendo el precio actual.</p>`, confirmLabel: 'Sí, cancelar el cambio', danger: true, fallback: `¿Cancelar el cambio programado para el ${dateLabel(row.valid_from)}?` }))) return;
    const result = await _db.rpc('cancel_company_service_price_schedule_v1', { p_company_id: instance.companyId, p_concept_id: service.concept_id, p_valid_from: row.valid_from, p_base_id: row.billing_base_id || null });
    if (result.error) return notify(result.error.message || 'No se pudo cancelar la vigencia', 'error');
    close('modal-ct4-history');
    notify('Vigencia programada cancelada', 'success');
    await reloadCompany(instance.companyId);
  }

  function openSchedules(instance, conceptId) {
    const service = serviceFor(instance, conceptId); if (!service) return;
    const changes = allScheduleChanges(instance, service);
    document.getElementById('ct4-history-title').textContent = `Cambios programados · ${service.name}`;
    const body = document.getElementById('ct4-history-body');
    body.innerHTML = changes.length ? `<p class="ct4-modal-lead">Cada precio empieza a regir solo, en la fecha indicada.</p><div class="ct4-mtable-wrap"><table class="ct4-mtable"><thead><tr><th>Desde</th><th>Dónde</th><th>Precio nuevo</th><th><span class="ct4-sr">Acciones</span></th></tr></thead><tbody>${changes.map(row => `<tr><td data-label="Desde"><b>${shortDate(row.valid_from)}</b></td><td data-label="Dónde">${esc(row.billing_base_id ? row.base_name || 'Base' : 'Precio general')}</td><td data-label="Precio nuevo">${priceStack(instance, service, row)}</td><td class="act">${canWrite() ? `<div class="ct4-row-actions"><button class="ct4-btn sm" type="button" data-ct4-edit-schedule data-date="${esc(row.valid_from)}" data-base="${esc(row.billing_base_id || '')}">Editar</button><button class="ct4-btn sm danger" type="button" data-ct4-cancel-schedule data-date="${esc(row.valid_from)}" data-base="${esc(row.billing_base_id || '')}">Cancelar</button></div>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="ct4-empty">No hay cambios futuros programados.</div>';
    body.querySelectorAll('[data-ct4-edit-schedule]').forEach(b => b.addEventListener('click', () => { close('modal-ct4-history'); openPriceEditor(instance, conceptId, { baseId: b.dataset.base || null, validFrom: b.dataset.date, scheduled: true }); }));
    body.querySelectorAll('[data-ct4-cancel-schedule]').forEach(b => b.addEventListener('click', () => cancelSchedule(instance, service, { valid_from: b.dataset.date, billing_base_id: b.dataset.base || null })));
    open('modal-ct4-history');
  }

  function historyValue(instance, service, row) {
    return row ? priceStack(instance, service, row) : '<span class="ct4-muted">—</span>';
  }

  async function openHistory(instance, conceptId) {
    const service = serviceFor(instance, conceptId); if (!service) return;
    document.getElementById('ct4-history-title').textContent = `Historial de cambios · ${service.name}`;
    document.getElementById('ct4-history-body').innerHTML = '<div class="ct4-empty">Cargando historial…</div>';
    open('modal-ct4-history');
    const result = await _db.rpc('get_company_service_price_history_v1', { p_company_id: instance.companyId, p_concept_id: conceptId });
    if (result.error) { document.getElementById('ct4-history-body').innerHTML = `<div class="ct4-error">${esc(result.error.message || 'No se pudo cargar el historial.')}</div>`; return; }
    const rows = Array.isArray(result.data) ? result.data : [];
    const operation = value => value === 'INSERT' ? ['add', 'Creación'] : value === 'DELETE' ? ['del', 'Eliminación'] : ['upd', 'Modificación'];
    const when = value => value ? new Date(value).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    document.getElementById('ct4-history-body').innerHTML = rows.length ? `<p class="ct4-modal-lead">Cada cambio queda registrado automáticamente.</p><div class="ct4-mtable-wrap"><table class="ct4-mtable"><thead><tr><th>Fecha</th><th>Quién</th><th>Dónde</th><th>Qué pasó</th><th>Antes</th><th>Después</th></tr></thead><tbody>${rows.map(row => { const [kind, label] = operation(row.operation); return `<tr><td data-label="Fecha">${esc(when(row.occurred_at))}</td><td data-label="Quién">${esc(row.actor_name || 'Usuario')}</td><td data-label="Dónde">${esc(row.base_name || 'Precio general')}</td><td data-label="Qué pasó"><span class="ct4-op ${kind}">${label}</span></td><td data-label="Antes">${historyValue(instance, service, row.before)}</td><td data-label="Después">${historyValue(instance, service, row.after)}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="ct4-empty">Todavía no hay cambios registrados para este precio.</div>';
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
    const instance = { id: instanceId, root, mode, companyId: companyId || '', companies: [], data: null, schedule: [], loading: false, bulk: emptyBulkState(), expanded: new Set(), filter: 'all', query: '' };
    instances.set(instanceId, instance);
    shell(instance);
    if (mode === 'standalone') await loadCompanies(instance);
    if (instance.companyId) await loadInstance(instance); else renderInstance(instance);
    return instance;
  }

  async function mountEmbedded(root, companyId) { return mount(root, { mode: 'embedded', companyId, id: `embedded-${companyId}-${root.id || 'prices'}` }); }
  async function openForCompany(companyId) {
    const standalone = instances.get('standalone'); if (!standalone) return;
    standalone.companyId = companyId || '';
    standalone.expanded = new Set();
    resetBulk(standalone);
    const select = standalone.root.querySelector('[data-ct4-company]'); if (select) select.value = standalone.companyId;
    await loadInstance(standalone);
  }
  async function init() {
    const screen = document.getElementById('screen-config-tariff-matrix'); if (!screen) return;
    const nav = document.querySelector('#nav-config-tariff-matrix .nav-label'); if (nav) nav.textContent = 'Tarifas';
    await mount(screen, { mode: 'standalone', id: 'standalone' });
  }

  window.AuxiliosCompanyTariffsV4 = {
    instances, mount, mountEmbedded, openForCompany, reload: reloadCompany,
    loadCompany: async () => {
      const legacyId = window.AuxiliosCompanyTariffsV4?.state?.companyId;
      if (legacyId) return openForCompany(legacyId);
      const standalone = instances.get('standalone');
      if (standalone) return loadInstance(standalone);
    },
    state: {
      get companyId() { return instances.get('standalone')?.companyId || ''; },
      set companyId(value) { const instance = instances.get('standalone'); if (instance) { instance.companyId = value || ''; resetBulk(instance); } }
    },
    init
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();
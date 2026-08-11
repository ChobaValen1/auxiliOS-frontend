/* AuxiliOS · Parámetros de facturación v3 · única implementación canónica */
(() => {
  'use strict';

  const S = {
    companyId: null,
    billing: null,
    companyConfig: null,
    contracts: [],
    cards: [],
    rateCard: null,
    rules: [],
    exceptions: [],
    contextKey: '',
    busy: false,
    patching: false,
    timer: null,
    bypassNewRate: false,
  };

  const role = () => String(typeof PERFIL_USUARIO === 'undefined'
    ? ''
    : (PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role || '')).toLowerCase();
  const canWrite = () => role() === 'administracion';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const notify = (message, type = 'info') => typeof toast === 'function'
    ? toast(message, type)
    : console[type === 'error' ? 'error' : 'log'](message);
  const today = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const timeValue = value => value ? String(value).slice(0, 5) : '';
  const num = value => Number(value ?? 0) || 0;
  const routeLabel = value => ({
    base_origin_destination_base: 'Base → Origen → Destino → Base',
    base_origin: 'Base → Origen',
    origin_destination: 'Origen → Destino',
    manual: 'Kilometraje manual',
  }[value] || 'Base → Origen → Destino → Base');
  const tollLabel = value => ({
    route_estimate: 'Estimación automática por ruta',
    manual: 'Carga real / comprobante',
    not_applicable: 'No corresponde',
  }[value] || 'Según configuración');

  function resolveCompanyId(explicit = null) {
    return explicit || S.companyId || window.__auxCompanySelected || window.TariffMatrixV3?.state?.companyId || document.getElementById('tmv3-company')?.value || null;
  }

  function inject() {
    if (!document.getElementById('company-billing-parameters-v3-css')) {
      document.head.insertAdjacentHTML('beforeend', `<style id="company-billing-parameters-v3-css">
        .bp3-shell{display:grid;gap:14px}.bp3-section{border:1px solid var(--border);border-radius:12px;background:var(--panel);overflow:hidden}.bp3-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border);background:rgba(255,255,255,.012)}
        .bp3-section-head h4{margin:0;font-size:13px;color:var(--text)}.bp3-section-head p{margin:4px 0 0;font-size:10px;line-height:1.45;color:var(--muted2)}.bp3-section-body{padding:14px 16px}
        .bp3-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.bp3-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.bp3-field{display:grid;gap:6px}.bp3-field>span,.bp3-field>label{font-size:9px;font-weight:750;letter-spacing:.04em;text-transform:uppercase;color:var(--muted2)}.bp3-field.full{grid-column:1/-1}
        .bp3-help{padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:var(--bg);font-size:10px;line-height:1.5;color:var(--muted2)}.bp3-help b{display:block;margin-bottom:2px;color:var(--text)}.bp3-help.route{border-color:rgba(46,196,214,.30)}.bp3-help.manual{border-color:rgba(245,166,35,.30)}.bp3-help.off{border-color:rgba(90,98,120,.40)}
        .bp3-rule-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.bp3-rule{padding:14px;border:1px solid var(--border);border-radius:11px;background:var(--bg)}.bp3-rule.active{border-color:rgba(245,166,35,.34)}
        .bp3-rule-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.bp3-rule-head h5{margin:0;font-size:12px;color:var(--text)}.bp3-rule-head p{margin:3px 0 0;font-size:9px;line-height:1.4;color:var(--muted2)}
        .bp3-switch{position:relative;display:inline-flex;align-items:center;width:38px;height:22px;flex:0 0 auto}.bp3-switch input{position:absolute;opacity:0;pointer-events:none}.bp3-switch i{width:38px;height:22px;border-radius:999px;background:var(--border2);position:relative;transition:.18s}.bp3-switch i:after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:var(--muted2);transition:.18s}.bp3-switch input:checked+i{background:rgba(245,166,35,.26);box-shadow:inset 0 0 0 1px rgba(245,166,35,.45)}.bp3-switch input:checked+i:after{left:19px;background:var(--amber)}
        .bp3-rule-fields{display:grid;gap:10px}.bp3-rule-fields.disabled{opacity:.42}.bp3-subtitle{margin:3px 0 7px;font-size:9px;font-weight:800;color:var(--muted2);text-transform:uppercase;letter-spacing:.06em}.bp3-exceptions{margin-top:11px;padding-top:11px;border-top:1px solid var(--border)}
        .bp3-exception-list{display:flex;gap:6px;flex-wrap:wrap}.bp3-exception{display:inline-flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid var(--border2);border-radius:8px;font-size:9px;color:var(--muted2);cursor:pointer}.bp3-exception:has(input:checked){border-color:rgba(226,80,74,.38);background:rgba(226,80,74,.07);color:var(--text)}.bp3-exception input{accent-color:var(--red)}
        .bp3-version{margin-top:10px;padding:9px 11px;border-radius:8px;border:1px solid var(--border);background:rgba(79,142,247,.05);font-size:9px;line-height:1.45;color:var(--muted2)}.bp3-version b{color:var(--text)}
        .bp3-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.bp3-summary article{padding:13px;border:1px solid var(--border);border-radius:10px;background:var(--bg)}.bp3-summary small{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.bp3-summary b{display:block;margin-top:5px;font-size:11px;line-height:1.4;color:var(--text)}.bp3-summary em{display:block;margin-top:4px;font-size:9px;font-style:normal;color:var(--muted2)}
        .bp3-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.bp3-detail-head h3{margin:0}.bp3-detail-head p{margin:4px 0 0;color:var(--muted2);font-size:10px}
        .bp3-dialog{width:min(980px,calc(100vw - 24px));max-width:980px}.bp3-dialog .modal-body{max-height:min(76vh,760px);overflow:auto}
        .bp3-selector{display:grid;gap:12px}.bp3-selector .bp3-help{margin-top:2px}
        @media(max-width:900px){.bp3-rule-grid,.bp3-summary{grid-template-columns:1fr 1fr}.bp3-grid.three{grid-template-columns:1fr 1fr}}@media(max-width:650px){.bp3-grid,.bp3-grid.three,.bp3-rule-grid,.bp3-summary{grid-template-columns:1fr}}
      </style>`);
    }
    if (!document.getElementById('modal-company-billing-v3')) {
      document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-company-billing-v3"><div class="modal-box bp3-dialog"><div class="modal-head"><span class="modal-head-title">Parámetros de facturación</span><button class="modal-close" onclick="closeModal('modal-company-billing-v3')">×</button></div><div class="modal-body" id="bp3-modal-body"></div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal('modal-company-billing-v3')">Cancelar</button><button class="btn btn-primary" id="bp3-save">Guardar parámetros</button></div></div></div>`);
      document.getElementById('bp3-save')?.addEventListener('click', saveParameters);
    }
    if (!document.getElementById('modal-new-rate-scope-v3')) {
      document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-new-rate-scope-v3"><div class="modal-box" style="width:min(560px,calc(100vw - 24px));max-width:560px"><div class="modal-head"><div><span class="modal-head-title">Nueva tarifa</span><div style="font-size:10px;color:var(--muted2);margin-top:3px">Definí el alcance antes de cargar el valor</div></div><button class="modal-close" onclick="closeModal('modal-new-rate-scope-v3')">×</button></div><div class="modal-body"><div class="bp3-selector"><label class="bp3-field"><span>Prestadora</span><select class="form-input" id="bp3-rate-company"></select></label><label class="bp3-field"><span>Base global</span><select class="form-input" id="bp3-rate-base"></select></label><div class="bp3-help">La base pertenece al catálogo global de AuxiliOS. La tarifa queda identificada por Prestadora + Base + Categoría + Servicio + Vigencia.</div><div class="modal-error" id="bp3-rate-scope-error" style="display:none"></div></div></div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal('modal-new-rate-scope-v3')">Cancelar</button><button class="btn btn-primary" id="bp3-rate-continue">Continuar</button></div></div></div>`);
      document.getElementById('bp3-rate-company')?.addEventListener('change', loadSelectorBases);
      document.getElementById('bp3-rate-continue')?.addEventListener('click', continueNewRate);
    }
  }

  async function globalBases() {
    const result = await _db.from('billing_bases').select('base_id,base_code,name,address,city,province,is_active').eq('is_active', true).order('name');
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function loadRateContext(companyId) {
    const contracts = await _db.from('company_contracts').select('*').eq('company_id', companyId).order('is_primary', { ascending: false }).order('valid_from', { ascending: false });
    if (contracts.error) return { contracts: [], cards: [], card: null, rules: [], exceptions: [] };
    const contractRows = contracts.data || [];
    const ids = contractRows.map(row => row.contract_id);
    let cards = [];
    if (ids.length) {
      const result = await _db.from('company_rate_cards').select('*').in('contract_id', ids).order('version', { ascending: false }).order('created_at', { ascending: false });
      if (!result.error) cards = result.data || [];
    }
    const card = cards.find(row => row.status === 'draft') || cards.find(row => row.status === 'active') || cards[0] || null;
    if (!card) return { contracts: contractRows, cards, card: null, rules: [], exceptions: [] };
    const [rules, exceptions] = await Promise.all([
      _db.from('company_rate_rules').select('*').eq('rate_card_id', card.rate_card_id),
      _db.from('company_rate_rule_exceptions').select('*').eq('rate_card_id', card.rate_card_id),
    ]);
    return { contracts: contractRows, cards, card, rules: rules.error ? [] : (rules.data || []), exceptions: exceptions.error ? [] : (exceptions.data || []) };
  }

  async function loadContext(companyId = null, force = false) {
    const id = resolveCompanyId(companyId);
    if (!id) throw new Error('Seleccioná una prestadora.');
    if (!force && S.contextKey === String(id) && S.billing && S.companyConfig) return S;
    const [billing, companyConfig, rate] = await Promise.all([
      _db.rpc('get_company_billing_configuration', { p_company_id: id, p_scheduled_for: new Date().toISOString() }),
      _db.rpc('get_company_configuration_v2', { p_company_id: id }),
      loadRateContext(id),
    ]);
    if (billing.error) throw billing.error;
    if (companyConfig.error) throw companyConfig.error;
    S.companyId = id;
    S.billing = billing.data || { setting: null };
    S.companyConfig = companyConfig.data || { services: [] };
    S.contracts = rate.contracts; S.cards = rate.cards; S.rateCard = rate.card; S.rules = rate.rules; S.exceptions = rate.exceptions;
    S.contextKey = String(id);
    return S;
  }

  function rule(type) {
    return S.rules.find(item => item.rule_type === type) || {
      rule_id: null, rule_type: type, enabled: false, calculation_mode: 'percentage', amount: 20,
      start_time: type === 'night' ? '22:00' : null, end_time: type === 'night' ? '06:00' : null,
      saturday_start: type === 'weekend_holiday' ? '00:00' : null, saturday_end: type === 'weekend_holiday' ? '23:59' : null,
      sunday_holiday_start: type === 'weekend_holiday' ? '00:00' : null, sunday_holiday_end: type === 'weekend_holiday' ? '23:59' : null,
    };
  }

  const enabledServices = () => (S.companyConfig?.services || []).filter(item => item.is_enabled === true);
  const exceptionSet = ruleId => new Set(ruleId ? S.exceptions.filter(item => item.rule_id === ruleId).map(item => String(item.concept_id)) : []);

  function exceptionHtml(type, selected) {
    const services = enabledServices();
    if (!services.length) return '<div class="bp3-help off">No hay servicios habilitados para configurar excepciones.</div>';
    return `<div class="bp3-exception-list">${services.map(service => `<label class="bp3-exception"><input type="checkbox" data-bp3-exception="${esc(type)}" value="${esc(service.concept_id)}" ${selected.has(String(service.concept_id)) ? 'checked' : ''}><span>${esc(service.name)}</span></label>`).join('')}</div>`;
  }

  function modalHtml() {
    const setting = S.billing?.setting || {};
    const night = rule('night');
    const weekend = rule('weekend_holiday');
    const versionText = !S.rateCard
      ? '<b>Sin tarifario versionado.</b> Los recargos necesitan un contrato/tarifario para guardar su historial.'
      : S.rateCard.status === 'draft'
        ? `<b>Versión editable:</b> ${esc(S.rateCard.name)} · v${esc(S.rateCard.version)}.`
        : `<b>Histórico protegido:</b> los cambios de recargos generan una nueva versión a partir de ${esc(S.rateCard.name)} · v${esc(S.rateCard.version)}.`;
    return `<div class="bp3-shell">
      <section class="bp3-section"><div class="bp3-section-head"><div><h4>Cómo factura el servicio</h4><p>Recorrido y tratamiento de peajes para esta prestadora.</p></div></div><div class="bp3-section-body"><div class="bp3-grid"><label class="bp3-field"><span>Modo de kilometraje</span><select class="form-input" id="bp3-route"><option value="base_origin_destination_base">Base → Origen → Destino → Base</option><option value="base_origin">Base → Origen</option><option value="origin_destination">Origen → Destino</option><option value="manual">Kilometraje manual</option></select></label><label class="bp3-field"><span>Peajes</span><select class="form-input" id="bp3-tolls"><option value="route_estimate">Estimación de la ruta</option><option value="manual">Carga manual / comprobante</option><option value="not_applicable">No corresponde</option></select></label><div class="bp3-help full" id="bp3-toll-help"></div></div></div></section>
      <section class="bp3-section"><div class="bp3-section-head"><div><h4>Recargos</h4><p>Activación, horarios, cálculo y servicios exceptuados.</p></div></div><div class="bp3-section-body"><div class="bp3-rule-grid">
        <article class="bp3-rule ${night.enabled ? 'active' : ''}" id="bp3-night-card"><div class="bp3-rule-head"><div><h5>Turno noche</h5><p>Recargo dentro del rango nocturno.</p></div><label class="bp3-switch"><input type="checkbox" id="bp3-night-enabled" ${night.enabled ? 'checked' : ''}><i></i></label></div><div class="bp3-rule-fields ${night.enabled ? '' : 'disabled'}" id="bp3-night-fields"><div class="bp3-grid"><label class="bp3-field"><span>Desde</span><input class="form-input" type="time" id="bp3-night-start" value="${esc(timeValue(night.start_time) || '22:00')}"></label><label class="bp3-field"><span>Hasta</span><input class="form-input" type="time" id="bp3-night-end" value="${esc(timeValue(night.end_time) || '06:00')}"></label></div><div class="bp3-grid"><label class="bp3-field"><span>Tipo de recargo</span><select class="form-input" id="bp3-night-mode"><option value="percentage" ${night.calculation_mode !== 'fixed' ? 'selected' : ''}>Porcentaje</option><option value="fixed" ${night.calculation_mode === 'fixed' ? 'selected' : ''}>Monto fijo</option></select></label><label class="bp3-field"><span id="bp3-night-label">Valor</span><input class="form-input" type="number" min="0" step="0.01" id="bp3-night-amount" value="${esc(num(night.amount))}"></label></div><div class="bp3-exceptions"><div class="bp3-subtitle">Servicios que NO aplican</div>${exceptionHtml('night', exceptionSet(night.rule_id))}</div></div></article>
        <article class="bp3-rule ${weekend.enabled ? 'active' : ''}" id="bp3-weekend-card"><div class="bp3-rule-head"><div><h5>Fin de semana y feriados</h5><p>Rangos para sábado y domingo/feriado.</p></div><label class="bp3-switch"><input type="checkbox" id="bp3-weekend-enabled" ${weekend.enabled ? 'checked' : ''}><i></i></label></div><div class="bp3-rule-fields ${weekend.enabled ? '' : 'disabled'}" id="bp3-weekend-fields"><div class="bp3-subtitle">Sábado</div><div class="bp3-grid"><label class="bp3-field"><span>Desde</span><input class="form-input" type="time" id="bp3-saturday-start" value="${esc(timeValue(weekend.saturday_start) || '00:00')}"></label><label class="bp3-field"><span>Hasta</span><input class="form-input" type="time" id="bp3-saturday-end" value="${esc(timeValue(weekend.saturday_end) || '23:59')}"></label></div><div class="bp3-subtitle">Domingo / feriado</div><div class="bp3-grid"><label class="bp3-field"><span>Desde</span><input class="form-input" type="time" id="bp3-sunday-start" value="${esc(timeValue(weekend.sunday_holiday_start) || '00:00')}"></label><label class="bp3-field"><span>Hasta</span><input class="form-input" type="time" id="bp3-sunday-end" value="${esc(timeValue(weekend.sunday_holiday_end) || '23:59')}"></label></div><div class="bp3-grid"><label class="bp3-field"><span>Tipo de recargo</span><select class="form-input" id="bp3-weekend-mode"><option value="percentage" ${weekend.calculation_mode !== 'fixed' ? 'selected' : ''}>Porcentaje</option><option value="fixed" ${weekend.calculation_mode === 'fixed' ? 'selected' : ''}>Monto fijo</option></select></label><label class="bp3-field"><span id="bp3-weekend-label">Valor</span><input class="form-input" type="number" min="0" step="0.01" id="bp3-weekend-amount" value="${esc(num(weekend.amount))}"></label></div><div class="bp3-exceptions"><div class="bp3-subtitle">Servicios que NO aplican</div>${exceptionHtml('weekend_holiday', exceptionSet(weekend.rule_id))}</div></div></article>
      </div><div class="bp3-version">${versionText}</div></div></section>
      <section class="bp3-section"><div class="bp3-section-head"><div><h4>Vigencia</h4><p>Período de aplicación de estos parámetros.</p></div></div><div class="bp3-section-body"><div class="bp3-grid three"><label class="bp3-field"><span>Vigente desde</span><input class="form-input" type="date" id="bp3-from" value="${esc(setting.valid_from || today())}"></label><label class="bp3-field"><span>Vigente hasta</span><input class="form-input" type="date" id="bp3-until" value="${esc(setting.valid_until || '')}"></label><label class="bp3-field" style="align-content:end"><span>Estado</span><label class="cb-check"><input type="checkbox" id="bp3-active" ${setting.is_active !== false ? 'checked' : ''}> Configuración activa</label></label><label class="bp3-field full"><span>Observaciones</span><textarea class="form-input" id="bp3-notes" rows="3">${esc(setting.notes || '')}</textarea></label></div></div></section>
      <div class="modal-error" id="bp3-error" style="display:none"></div>
    </div>`;
  }

  function renderTollHelp() {
    const mode = document.getElementById('bp3-tolls')?.value;
    const panel = document.getElementById('bp3-toll-help');
    if (!panel) return;
    if (mode === 'manual') { panel.className = 'bp3-help full manual'; panel.innerHTML = '<b>Carga real / comprobante</b>El peaje se carga durante el servicio con el importe real.'; }
    else if (mode === 'not_applicable') { panel.className = 'bp3-help full off'; panel.innerHTML = '<b>No corresponde</b>AuxiliOS no incorpora peajes en la liquidación.'; }
    else { panel.className = 'bp3-help full route'; panel.innerHTML = '<b>Estimación automática por ruta</b>El recorrido calculado se usa como referencia para estimar peajes.'; }
  }

  function syncRule(prefix) {
    const enabled = Boolean(document.getElementById(`bp3-${prefix}-enabled`)?.checked);
    document.getElementById(`bp3-${prefix}-card`)?.classList.toggle('active', enabled);
    document.getElementById(`bp3-${prefix}-fields`)?.classList.toggle('disabled', !enabled);
    document.querySelectorAll(`#bp3-${prefix}-fields input,#bp3-${prefix}-fields select`).forEach(input => { input.disabled = !enabled; });
  }

  function updateAmountLabel(prefix) {
    const mode = document.getElementById(`bp3-${prefix}-mode`)?.value;
    const label = document.getElementById(`bp3-${prefix}-label`);
    if (label) label.textContent = mode === 'fixed' ? 'Monto fijo' : 'Porcentaje (%)';
  }

  function bindModal() {
    document.getElementById('bp3-tolls')?.addEventListener('change', renderTollHelp);
    ['night','weekend'].forEach(prefix => {
      document.getElementById(`bp3-${prefix}-enabled`)?.addEventListener('change', () => syncRule(prefix));
      document.getElementById(`bp3-${prefix}-mode`)?.addEventListener('change', () => updateAmountLabel(prefix));
      syncRule(prefix); updateAmountLabel(prefix);
    });
    renderTollHelp();
  }

  async function openParameters(companyId = null) {
    if (!canWrite()) return notify('Solo Administración puede modificar parámetros de facturación', 'error');
    inject();
    const id = resolveCompanyId(companyId);
    if (!id) return notify('Seleccioná una prestadora', 'warning');
    S.companyId = id;
    document.getElementById('bp3-modal-body').innerHTML = '<div class="bp3-help">Cargando parámetros…</div>';
    if (typeof openModal === 'function') openModal('modal-company-billing-v3');
    try {
      await loadContext(id, true);
      document.getElementById('bp3-modal-body').innerHTML = modalHtml();
      const setting = S.billing?.setting || {};
      document.getElementById('bp3-route').value = setting.route_mode || 'base_origin_destination_base';
      document.getElementById('bp3-tolls').value = setting.toll_calculation_mode || 'route_estimate';
      bindModal();
    } catch (error) {
      document.getElementById('bp3-modal-body').innerHTML = `<div class="modal-error" style="display:block">${esc(error?.message || 'No se pudieron cargar los parámetros.')}</div>`;
    }
  }

  function setError(message = '') {
    const el = document.getElementById('bp3-error');
    if (!el) return;
    el.textContent = message; el.style.display = message ? 'block' : 'none';
  }

  function collectRule(type) {
    const weekend = type === 'weekend_holiday';
    const prefix = weekend ? 'weekend' : 'night';
    return {
      type,
      enabled: Boolean(document.getElementById(`bp3-${prefix}-enabled`)?.checked),
      calculation_mode: document.getElementById(`bp3-${prefix}-mode`)?.value || 'percentage',
      amount: Math.max(0, Number(document.getElementById(`bp3-${prefix}-amount`)?.value || 0)),
      start_time: weekend ? null : (document.getElementById('bp3-night-start')?.value || null),
      end_time: weekend ? null : (document.getElementById('bp3-night-end')?.value || null),
      saturday_start: weekend ? (document.getElementById('bp3-saturday-start')?.value || null) : null,
      saturday_end: weekend ? (document.getElementById('bp3-saturday-end')?.value || null) : null,
      sunday_holiday_start: weekend ? (document.getElementById('bp3-sunday-start')?.value || null) : null,
      sunday_holiday_end: weekend ? (document.getElementById('bp3-sunday-end')?.value || null) : null,
      exceptions: [...document.querySelectorAll(`[data-bp3-exception="${type}"]:checked`)].map(input => input.value),
    };
  }

  function validateRules(rules) {
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (!Number.isFinite(rule.amount) || rule.amount < 0) return 'El valor del recargo debe ser válido.';
      if (rule.type === 'night' && (!rule.start_time || !rule.end_time)) return 'Completá el rango horario del turno noche.';
      if (rule.type === 'weekend_holiday' && (!rule.saturday_start || !rule.saturday_end || !rule.sunday_holiday_start || !rule.sunday_holiday_end)) return 'Completá los rangos de fin de semana y feriados.';
    }
    return '';
  }

  const strip = (row, keys) => Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));

  async function duplicateActiveCard(source) {
    const sourceId = source.rate_card_id;
    const [items, rules, exceptions, links, billing, codes] = await Promise.all([
      _db.from('company_rate_items').select('*').eq('rate_card_id', sourceId),
      _db.from('company_rate_rules').select('*').eq('rate_card_id', sourceId),
      _db.from('company_rate_rule_exceptions').select('*').eq('rate_card_id', sourceId),
      _db.from('company_rate_service_links').select('*').eq('rate_card_id', sourceId),
      _db.from('company_rate_billing_settings').select('*').eq('rate_card_id', sourceId).maybeSingle(),
      _db.from('company_rate_codes').select('*').eq('rate_card_id', sourceId),
    ]);
    if ([items,rules,exceptions,links,billing,codes].some(result => result.error)) throw new Error('No se pudo versionar el tarifario actual.');
    const created = await _db.from('company_rate_cards').insert({ contract_id: source.contract_id, name: source.name, status: 'draft', currency: source.currency, valid_from: today(), valid_until: null, notes: `Actualización de parámetros basada en versión ${source.version}` }).select().single();
    if (created.error) throw created.error;
    const card = created.data;
    try {
      if (items.data?.length) { const result = await _db.from('company_rate_items').insert(items.data.map(row => ({ ...strip(row, ['rate_item_id','rate_card_id','created_at','updated_at','created_by','updated_by']), rate_card_id: card.rate_card_id }))); if (result.error) throw result.error; }
      await _db.from('company_rate_rules').delete().eq('rate_card_id', card.rate_card_id);
      const ruleRows = (rules.data || []).map(row => ({ ...strip(row, ['rule_id','rate_card_id','created_at','updated_at','created_by','updated_by']), rate_card_id: card.rate_card_id }));
      let newRules = [];
      if (ruleRows.length) { const result = await _db.from('company_rate_rules').insert(ruleRows).select(); if (result.error) throw result.error; newRules = result.data || []; }
      if (links.data?.length) { const result = await _db.from('company_rate_service_links').insert(links.data.map(row => ({ ...strip(row, ['link_id','rate_card_id','created_at','updated_at','created_by','updated_by']), rate_card_id: card.rate_card_id }))); if (result.error) throw result.error; }
      if (exceptions.data?.length) {
        const oldType = new Map((rules.data || []).map(row => [String(row.rule_id), row.rule_type]));
        const newId = new Map(newRules.map(row => [row.rule_type, row.rule_id]));
        const rows = exceptions.data.map(row => ({ rate_card_id: card.rate_card_id, rule_id: newId.get(oldType.get(String(row.rule_id))), concept_id: row.concept_id })).filter(row => row.rule_id);
        if (rows.length) { const result = await _db.from('company_rate_rule_exceptions').insert(rows); if (result.error) throw result.error; }
      }
      if (billing.data) { const result = await _db.from('company_rate_billing_settings').update(strip(billing.data, ['rate_card_id','created_at','updated_at','created_by','updated_by'])).eq('rate_card_id', card.rate_card_id); if (result.error) throw result.error; }
      if (codes.data?.length) { const result = await _db.from('company_rate_codes').upsert(codes.data.map(row => ({ rate_card_id: card.rate_card_id, code_key: row.code_key, enabled: row.enabled })), { onConflict: 'rate_card_id,code_key' }); if (result.error) throw result.error; }
      return card;
    } catch (error) {
      await _db.from('company_rate_cards').delete().eq('rate_card_id', card.rate_card_id);
      throw error;
    }
  }

  async function editableRateCard() {
    if (S.rateCard?.status === 'draft') return { card: S.rateCard, publishAfter: false };
    if (S.rateCard?.status === 'active') return { card: await duplicateActiveCard(S.rateCard), publishAfter: true };
    const contract = S.contracts.find(row => row.status === 'active') || S.contracts[0];
    if (!contract) throw new Error('La prestadora no tiene un contrato/tarifario versionado para guardar recargos.');
    const created = await _db.from('company_rate_cards').insert({ contract_id: contract.contract_id, name: 'Tarifario general', status: 'draft', currency: contract.currency || 'ARS', valid_from: today(), notes: 'Creado desde Parámetros de facturación' }).select().single();
    if (created.error) throw created.error;
    return { card: created.data, publishAfter: false };
  }

  async function saveRule(cardId, model) {
    const current = await _db.from('company_rate_rules').select('*').eq('rate_card_id', cardId).eq('rule_type', model.type).maybeSingle();
    if (current.error) throw current.error;
    const patch = { enabled: model.enabled, calculation_mode: model.calculation_mode, amount: model.amount, start_time: model.start_time, end_time: model.end_time, saturday_start: model.saturday_start, saturday_end: model.saturday_end, sunday_holiday_start: model.sunday_holiday_start, sunday_holiday_end: model.sunday_holiday_end };
    const saved = current.data
      ? await _db.from('company_rate_rules').update(patch).eq('rule_id', current.data.rule_id).select().single()
      : await _db.from('company_rate_rules').insert({ rate_card_id: cardId, rule_type: model.type, ...patch }).select().single();
    if (saved.error) throw saved.error;
    const removed = await _db.from('company_rate_rule_exceptions').delete().eq('rule_id', saved.data.rule_id); if (removed.error) throw removed.error;
    if (model.exceptions.length) { const inserted = await _db.from('company_rate_rule_exceptions').insert(model.exceptions.map(conceptId => ({ rate_card_id: cardId, rule_id: saved.data.rule_id, concept_id: conceptId }))); if (inserted.error) throw inserted.error; }
  }

  async function saveParameters() {
    if (!canWrite() || S.busy) return;
    const from = document.getElementById('bp3-from')?.value || today();
    const until = document.getElementById('bp3-until')?.value || null;
    if (until && until < from) return setError('La fecha hasta no puede ser anterior a la fecha desde.');
    const models = [collectRule('night'), collectRule('weekend_holiday')];
    const validation = validateRules(models); if (validation) return setError(validation);
    const button = document.getElementById('bp3-save');
    S.busy = true; setError(''); if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
    try {
      await loadContext(S.companyId, true);
      const bases = await globalBases();
      if (!bases.length) throw new Error('No existen bases globales activas en AuxiliOS.');
      const payload = {
        billing_setting_id: S.billing?.setting?.billing_setting_id || null,
        company_id: S.companyId,
        contract_id: null,
        route_mode: document.getElementById('bp3-route')?.value || 'base_origin_destination_base',
        toll_calculation_mode: document.getElementById('bp3-tolls')?.value || 'route_estimate',
        valid_from: from,
        valid_until: until,
        requires_verified_base: false,
        is_active: Boolean(document.getElementById('bp3-active')?.checked),
        notes: String(document.getElementById('bp3-notes')?.value || '').trim() || null,
        // Compatibilidad del RPC actual: no se expone como configuración de prestadora.
        bases: bases.map(base => ({ base_id: base.base_id, is_active: true })),
      };
      const billing = await _db.rpc('save_company_billing_configuration', { p_payload: payload }); if (billing.error) throw billing.error;
      const rate = await editableRateCard();
      for (const model of models) await saveRule(rate.card.rate_card_id, model);
      if (rate.publishAfter) { const activated = await _db.from('company_rate_cards').update({ status: 'active' }).eq('rate_card_id', rate.card.rate_card_id).select().single(); if (activated.error) throw activated.error; }
      S.contextKey = '';
      if (typeof closeModal === 'function') closeModal('modal-company-billing-v3');
      notify('Parámetros de facturación guardados', 'success');
      if (typeof window.cargarEmpresasV2 === 'function') await window.cargarEmpresasV2();
      if (typeof window.seleccionarEmpresaV2 === 'function') await window.seleccionarEmpresaV2(S.companyId);
      schedulePatch();
    } catch (error) {
      setError(error?.message || 'No se pudieron guardar los parámetros.');
    } finally {
      S.busy = false; if (button) { button.disabled = false; button.textContent = 'Guardar parámetros'; }
    }
  }

  function cleanCompanyView(root) {
    if (!root) return;
    root.querySelectorAll('.empv2-hero-stat').forEach(stat => {
      const label = stat.querySelector('small')?.textContent.trim() || '';
      if (/Base principal|Bases habilitadas|Bases operativas/i.test(label)) stat.remove();
    });
    root.querySelectorAll('.empv2-alert-item').forEach(item => { if (/base/i.test(item.querySelector('b')?.textContent || '')) item.remove(); });
    root.querySelectorAll('.empv2-tabs button').forEach(button => {
      const text = button.textContent.trim();
      if (text === 'Reglas y parámetros') button.remove();
      if (text === 'Bases y facturación') button.textContent = 'Parámetros de facturación';
    });
    root.querySelectorAll('.empv2-feature-card').forEach(card => {
      const title = card.querySelector('h3'); if (!title) return;
      const text = title.textContent.trim();
      if (text === 'Reglas y parámetros') return card.remove();
      if (text === 'Bases y facturación' || text === 'Parámetros de facturación') {
        title.textContent = 'Parámetros de facturación';
        const p = card.querySelector('p'); if (p) p.textContent = 'Recorrido, peajes, recargos y vigencia comercial.';
      }
    });
    root.querySelectorAll('.empv2-section-card').forEach(section => {
      const title = section.querySelector('h3');
      if (title?.textContent.trim() === 'Bases y facturación') title.textContent = 'Parámetros de facturación';
    });
    root.querySelectorAll('.empv2-rule-grid').forEach(grid => grid.closest('.empv2-section-card')?.remove());
  }

  async function renderParametersDetail(root) {
    if (!root || !S.companyId) return;
    const section = [...root.querySelectorAll('.empv2-section-card')].find(item => item.querySelector('h3')?.textContent.trim() === 'Parámetros de facturación');
    if (!section) return;
    try {
      await loadContext(S.companyId);
      if (!document.body.contains(section)) return;
      const setting = S.billing?.setting || {};
      const night = rule('night'); const weekend = rule('weekend_holiday');
      const version = S.rateCard ? `${S.rateCard.name} · v${S.rateCard.version} · ${S.rateCard.status === 'draft' ? 'Borrador' : 'Vigente'}` : 'Sin tarifario versionado';
      const signature = [setting.route_mode,setting.toll_calculation_mode,setting.valid_from,night.enabled,night.amount,weekend.enabled,weekend.amount,version].join('|');
      if (section.dataset.bp3Signature === signature) return;
      section.innerHTML = `<div class="bp3-detail-head"><div><h3>Parámetros de facturación</h3><p>Configuración de recorrido, peajes, recargos y vigencia.</p></div>${canWrite() ? '<button class="btn btn-primary" onclick="abrirConfiguracionFacturacionEmpresa()">Editar parámetros</button>' : ''}</div><div class="bp3-summary"><article><small>Recorrido</small><b>${esc(routeLabel(setting.route_mode))}</b><em>${setting.is_active === false ? 'Configuración inactiva' : 'Activo'}</em></article><article><small>Peajes</small><b>${esc(tollLabel(setting.toll_calculation_mode))}</b><em>Según modalidad configurada</em></article><article><small>Turno noche</small><b>${night.enabled ? `${night.calculation_mode === 'fixed' ? '$' : ''}${esc(num(night.amount))}${night.calculation_mode === 'percentage' ? '%' : ''}` : 'No aplica'}</b><em>${night.enabled ? `${esc(timeValue(night.start_time))} → ${esc(timeValue(night.end_time))}` : 'Desactivado'}</em></article><article><small>Fin de semana / feriados</small><b>${weekend.enabled ? `${weekend.calculation_mode === 'fixed' ? '$' : ''}${esc(num(weekend.amount))}${weekend.calculation_mode === 'percentage' ? '%' : ''}` : 'No aplica'}</b><em>${weekend.enabled ? 'Con horarios y excepciones' : 'Desactivado'}</em></article></div><div class="bp3-version"><b>Vigencia:</b> ${esc(setting.valid_from || 'Sin definir')}${setting.valid_until ? ` → ${esc(setting.valid_until)}` : ' → vigente'} · <b>Reglas:</b> ${esc(version)}</div>`;
      section.dataset.bp3Signature = signature;
    } catch (error) {
      console.warn('[parámetros facturación v3]', error);
    }
  }

  async function selectTariffCompanyGlobal(companyId) {
    const api = window.TariffMatrixV3; const state = api?.state;
    if (!api || !state) return;
    state.companyId = companyId || ''; state.baseId = ''; state.matrix = null; state.bases = [];
    const base = document.getElementById('tmv3-base');
    if (base) { base.disabled = true; base.innerHTML = '<option value="">Seleccionar base global</option>'; }
    if (!companyId) return api.loadMatrix();
    try {
      const bases = await globalBases(); state.bases = bases;
      if (base) { base.innerHTML = '<option value="">Seleccionar base global</option>' + bases.map(item => `<option value="${esc(item.base_id)}">${esc(item.name || item.base_code || 'Base')}</option>`).join(''); base.disabled = !bases.length; }
      if (bases.length === 1) { state.baseId = String(bases[0].base_id); if (base) base.value = state.baseId; }
      await api.loadMatrix(); await enforceTariffServiceScope();
    } catch (error) { notify(error?.message || 'No se pudieron cargar las bases globales', 'error'); }
  }

  async function enforceTariffServiceScope() {
    const state = window.TariffMatrixV3?.state;
    if (!state?.companyId || !state.matrix) return;
    const cfg = await _db.rpc('get_company_configuration_v2', { p_company_id: state.companyId });
    if (cfg.error) return;
    const enabled = new Set((cfg.data?.services || []).filter(item => item.is_enabled === true).map(item => String(item.concept_id)));
    state.matrix.concepts = (state.matrix.concepts || []).map(item => ({ ...item, is_enabled: item.is_enabled === true && enabled.has(String(item.concept_id)) }));
    document.querySelectorAll('.tmv3-rate-table tbody tr[data-concept-id]').forEach(row => { if (!enabled.has(String(row.dataset.conceptId))) row.remove(); });
  }

  function patchTariffUI() {
    document.querySelector('[data-tmv3="provider-settings"]')?.remove();
    const description = document.querySelector('.tmv3-rates-head p');
    if (description) description.textContent = 'Administrá valores únicamente para los servicios habilitados de la prestadora.';
    const label = document.getElementById('tmv3-base')?.closest('label')?.querySelector('span'); if (label) label.textContent = 'Base global';
    document.querySelectorAll('[data-tmv3="edit-rate"]').forEach(button => {
      const hasValue = Boolean(button.closest('tr')?.querySelector('.tmv3-price'));
      button.textContent = hasValue ? 'Editar valor' : 'Cargar valor';
    });
    const title = document.getElementById('tmv3-rate-title'); if (title?.textContent === 'Nueva vigencia') title.textContent = 'Editar valor';
    const save = document.querySelector('#tmv3-rate-modal [data-tmv3="save-rate"]'); if (save?.textContent.trim() === 'Crear vigencia') save.textContent = 'Guardar nuevo valor';
  }

  function selectorError(message = '') {
    const el = document.getElementById('bp3-rate-scope-error'); if (!el) return;
    el.textContent = message; el.style.display = message ? 'block' : 'none';
  }

  async function openNewRateSelector() {
    inject(); selectorError('');
    const state = window.TariffMatrixV3?.state || {};
    const companies = state.companies || [];
    const company = document.getElementById('bp3-rate-company');
    company.innerHTML = '<option value="">Seleccionar prestadora</option>' + companies.map(item => `<option value="${esc(item.company_id)}">${esc(item.trade_name || item.legal_name || item.name || 'Prestadora')}</option>`).join('');
    company.value = state.companyId || '';
    await loadSelectorBases();
    if (typeof openModal === 'function') openModal('modal-new-rate-scope-v3');
  }

  async function loadSelectorBases() {
    const select = document.getElementById('bp3-rate-base'); if (!select) return;
    select.disabled = true; select.innerHTML = '<option value="">Cargando bases…</option>';
    try {
      const bases = await globalBases();
      select.innerHTML = '<option value="">Seleccionar base global</option>' + bases.map(item => `<option value="${esc(item.base_id)}">${esc(item.name || item.base_code || 'Base')}</option>`).join('');
      select.disabled = !bases.length;
      const state = window.TariffMatrixV3?.state; if (state?.baseId && bases.some(item => String(item.base_id) === String(state.baseId))) select.value = state.baseId;
    } catch (error) { select.innerHTML = '<option value="">No se pudieron cargar las bases</option>'; }
  }

  async function continueNewRate() {
    selectorError('');
    const companyId = document.getElementById('bp3-rate-company')?.value;
    const baseId = document.getElementById('bp3-rate-base')?.value;
    if (!companyId || !baseId) return selectorError('Seleccioná prestadora y base global.');
    const api = window.TariffMatrixV3; const state = api?.state; if (!api || !state) return;
    state.companyId = companyId; state.baseId = baseId; state.bases = await globalBases();
    const company = document.getElementById('tmv3-company'); if (company) company.value = companyId;
    const base = document.getElementById('tmv3-base');
    if (base) { base.innerHTML = '<option value="">Seleccionar base global</option>' + state.bases.map(item => `<option value="${esc(item.base_id)}">${esc(item.name || item.base_code || 'Base')}</option>`).join(''); base.disabled = false; base.value = baseId; }
    await api.loadMatrix(); await enforceTariffServiceScope();
    const categories = (state.matrix?.categories || []).filter(item => item.is_enabled);
    const concepts = (state.matrix?.concepts || []).filter(item => item.is_enabled);
    if (!categories.length || !concepts.length) return selectorError('La prestadora no tiene servicios/categorías habilitados para cargar tarifas.');
    if (typeof closeModal === 'function') closeModal('modal-new-rate-scope-v3');
    S.bypassNewRate = true;
    document.querySelector('[data-tmv3="new-rate"]')?.click();
    S.bypassNewRate = false;
  }

  function installTariffCapture() {
    if (document.documentElement.dataset.bp3TariffCapture) return;
    document.documentElement.dataset.bp3TariffCapture = '1';
    document.addEventListener('change', event => {
      if (event.target?.id === 'tmv3-company') {
        event.stopImmediatePropagation();
        selectTariffCompanyGlobal(event.target.value);
      }
    }, true);
    document.addEventListener('click', event => {
      const button = event.target?.closest?.('[data-tmv3="new-rate"]');
      if (!button || S.bypassNewRate) return;
      const state = window.TariffMatrixV3?.state;
      if (state?.companyId && state?.baseId && state?.matrix) return;
      event.preventDefault(); event.stopImmediatePropagation();
      openNewRateSelector();
    }, true);
  }

  async function refreshTariffs() {
    const state = window.TariffMatrixV3?.state;
    if (!state?.companyId || !state?.baseId) return;
    await window.TariffMatrixV3.loadMatrix();
    await enforceTariffServiceScope();
    patchTariffUI();
  }

  function installCompanyWrappers() {
    const selection = window.seleccionarEmpresaV2;
    if (typeof selection === 'function' && !selection.__bp3Wrapped) {
      const wrapped = async function(companyId, ...args) {
        if (companyId) { S.companyId = companyId; S.contextKey = ''; }
        const result = await selection.apply(this, [companyId, ...args]);
        schedulePatch(); return result;
      };
      wrapped.__bp3Wrapped = true; window.seleccionarEmpresaV2 = wrapped;
      if (window.seleccionarEmpresa === selection) window.seleccionarEmpresa = wrapped;
    }
    const tab = window.abrirTabEmpresaV2;
    if (typeof tab === 'function' && !tab.__bp3Wrapped) {
      const wrapped = function(name, ...args) {
        const result = tab.apply(this, [name === 'rules' ? 'bases' : name, ...args]);
        schedulePatch(); return result;
      };
      wrapped.__bp3Wrapped = true; window.abrirTabEmpresaV2 = wrapped;
    }
  }

  async function patchAll() {
    if (S.patching) return;
    S.patching = true;
    try {
      inject(); installCompanyWrappers(); installTariffCapture(); patchTariffUI();
      const root = document.getElementById('empv2-root');
      if (root) { cleanCompanyView(root); await renderParametersDetail(root); }
      if (document.getElementById('tmv3-matrix')) await enforceTariffServiceScope();
    } finally { S.patching = false; }
  }

  function schedulePatch() { clearTimeout(S.timer); S.timer = setTimeout(patchAll, 70); }

  function init() {
    inject();
    let attempts = 0;
    const timer = setInterval(() => {
      installCompanyWrappers(); installTariffCapture(); patchAll();
      if (++attempts > 80 || (window.seleccionarEmpresaV2 && window.TariffMatrixV3)) clearInterval(timer);
    }, 200);
    new MutationObserver(schedulePatch).observe(document.body, { childList: true, subtree: true });
  }

  Object.assign(window, {
    abrirConfiguracionFacturacionEmpresa: companyId => openParameters(companyId || S.companyId),
    guardarConfiguracionFacturacionEmpresa: saveParameters,
  });
  window.AuxiliosBillingParametersV3 = { open: openParameters, save: saveParameters, loadContext, refreshTariffs, selectTariffCompanyGlobal };

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();
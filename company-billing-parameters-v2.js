/* AuxiliOS · Parámetros de facturación v2 · módulo configurativo */
(() => {
  'use strict';

  const S = {
    companyId: null,
    billing: null,
    companyConfig: null,
    rateCard: null,
    contracts: [],
    cards: [],
    rules: [],
    exceptions: [],
    busy: false,
    patching: false,
    timer: null,
    contextKey: '',
    serviceEditId: null,
    tariffTypeEditId: null,
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
  const moneyValue = value => Number(value ?? 0) || 0;
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
  const categoryLabel = value => ({ primary: 'Primario', secondary: 'Secundario', mixed: 'Mixto' }[value] || value || '—');

  function resolveCompanyId(explicit = null) {
    return explicit
      || S.companyId
      || window.__auxCompanySelected
      || window.TariffMatrixV3?.state?.companyId
      || document.getElementById('cr-matrix-company')?.value
      || document.getElementById('tmv3-company')?.value
      || null;
  }

  function injectStyles() {
    if (document.getElementById('billing-parameters-v2-css')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="billing-parameters-v2-css">
      .bp2-shell{display:grid;gap:14px}.bp2-section{border:1px solid var(--border);border-radius:12px;background:var(--panel);overflow:hidden}
      .bp2-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border);background:rgba(255,255,255,.012)}
      .bp2-section-head h4{margin:0;font-size:13px;color:var(--text)}.bp2-section-head p{margin:4px 0 0;font-size:10px;line-height:1.45;color:var(--muted2)}
      .bp2-section-body{padding:14px 16px}.bp2-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.bp2-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
      .bp2-field{display:grid;gap:6px}.bp2-field>span,.bp2-field>label{font-size:9px;font-weight:750;letter-spacing:.04em;text-transform:uppercase;color:var(--muted2)}
      .bp2-field.full{grid-column:1/-1}.bp2-helper{padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:var(--bg);font-size:10px;line-height:1.5;color:var(--muted2)}
      .bp2-helper b{display:block;margin-bottom:2px;color:var(--text)}.bp2-helper.route{border-color:rgba(46,196,214,.30)}.bp2-helper.manual{border-color:rgba(245,166,35,.30)}.bp2-helper.off{border-color:rgba(90,98,120,.40)}
      .bp2-rule-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.bp2-rule{padding:14px;border:1px solid var(--border);border-radius:11px;background:var(--bg)}
      .bp2-rule.active{border-color:rgba(245,166,35,.34);box-shadow:inset 0 0 0 1px rgba(245,166,35,.05)}.bp2-rule-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
      .bp2-rule-head h5{margin:0;font-size:12px;color:var(--text)}.bp2-rule-head p{margin:3px 0 0;font-size:9px;line-height:1.4;color:var(--muted2)}
      .bp2-switch{position:relative;display:inline-flex;align-items:center;width:38px;height:22px;flex:0 0 auto}.bp2-switch input{position:absolute;opacity:0;pointer-events:none}.bp2-switch i{width:38px;height:22px;border-radius:999px;background:var(--border2);position:relative;transition:.18s}
      .bp2-switch i:after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:var(--muted2);transition:.18s}.bp2-switch input:checked+i{background:rgba(245,166,35,.26);box-shadow:inset 0 0 0 1px rgba(245,166,35,.45)}.bp2-switch input:checked+i:after{left:19px;background:var(--amber)}
      .bp2-rule-fields{display:grid;gap:10px;transition:.18s}.bp2-rule-fields.disabled{opacity:.42}.bp2-subtitle{margin:3px 0 7px;font-size:9px;font-weight:800;color:var(--muted2);text-transform:uppercase;letter-spacing:.06em}
      .bp2-exceptions{margin-top:11px;padding-top:11px;border-top:1px solid var(--border)}.bp2-exceptions-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}.bp2-exceptions-head b{font-size:10px;color:var(--text)}.bp2-exceptions-head span{font-size:9px;color:var(--muted2)}
      .bp2-exception-list{display:flex;gap:6px;flex-wrap:wrap}.bp2-exception{display:inline-flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid var(--border2);border-radius:8px;font-size:9px;color:var(--muted2);cursor:pointer}.bp2-exception:has(input:checked){border-color:rgba(226,80,74,.38);background:rgba(226,80,74,.07);color:var(--text)}.bp2-exception input{accent-color:var(--red)}
      .bp2-version{margin-top:10px;padding:9px 11px;border-radius:8px;border:1px solid var(--border);background:rgba(79,142,247,.05);font-size:9px;line-height:1.45;color:var(--muted2)}.bp2-version b{color:var(--text)}
      .bp2-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.bp2-summary article{padding:13px;border:1px solid var(--border);border-radius:10px;background:var(--bg)}.bp2-summary small{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.bp2-summary b{display:block;margin-top:5px;font-size:11px;line-height:1.4;color:var(--text)}.bp2-summary em{display:block;margin-top:4px;font-size:9px;font-style:normal;color:var(--muted2)}
      .bp2-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.bp2-detail-head h3{margin:0}.bp2-detail-head p{margin:4px 0 0;color:var(--muted2);font-size:10px}.bp2-no-bases{display:none!important}
      .tmv3-actions [data-tmv3="provider-settings"]{display:none!important}
      @media(max-width:900px){.bp2-rule-grid,.bp2-summary{grid-template-columns:1fr 1fr}.bp2-grid.three{grid-template-columns:1fr 1fr}}
      @media(max-width:650px){.bp2-grid,.bp2-grid.three,.bp2-rule-grid,.bp2-summary{grid-template-columns:1fr}}
    </style>`);
  }

  async function loadRateContext(companyId) {
    const contracts = await _db.from('company_contracts')
      .select('*').eq('company_id', companyId)
      .order('is_primary', { ascending: false }).order('valid_from', { ascending: false });
    if (contracts.error) return { contracts: [], cards: [], card: null, rules: [], exceptions: [] };
    const contractRows = contracts.data || [];
    const ids = contractRows.map(row => row.contract_id);
    let cards = [];
    if (ids.length) {
      const result = await _db.from('company_rate_cards').select('*').in('contract_id', ids)
        .order('version', { ascending: false }).order('created_at', { ascending: false });
      if (!result.error) cards = result.data || [];
    }
    const card = cards.find(row => row.status === 'draft') || cards.find(row => row.status === 'active') || cards[0] || null;
    if (!card) return { contracts: contractRows, cards, card: null, rules: [], exceptions: [] };
    const [rules, exceptions] = await Promise.all([
      _db.from('company_rate_rules').select('*').eq('rate_card_id', card.rate_card_id),
      _db.from('company_rate_rule_exceptions').select('*').eq('rate_card_id', card.rate_card_id),
    ]);
    return {
      contracts: contractRows,
      cards,
      card,
      rules: rules.error ? [] : (rules.data || []),
      exceptions: exceptions.error ? [] : (exceptions.data || []),
    };
  }

  async function loadContext(companyId = null, force = false) {
    const id = resolveCompanyId(companyId);
    if (!id) throw new Error('Seleccioná una prestadora.');
    const key = String(id);
    if (!force && S.contextKey === key && S.billing && S.companyConfig) return S;
    const [billing, companyConfig, rate] = await Promise.all([
      _db.rpc('get_company_billing_configuration', { p_company_id: id, p_scheduled_for: new Date().toISOString() }),
      _db.rpc('get_company_configuration_v2', { p_company_id: id }),
      loadRateContext(id),
    ]);
    if (billing.error) throw billing.error;
    if (companyConfig.error) throw companyConfig.error;
    S.companyId = id;
    S.billing = billing.data || { setting: null, available_bases: [] };
    S.companyConfig = companyConfig.data || { services: [] };
    S.contracts = rate.contracts;
    S.cards = rate.cards;
    S.rateCard = rate.card;
    S.rules = rate.rules;
    S.exceptions = rate.exceptions;
    S.contextKey = key;
    return S;
  }

  function rule(type) {
    return S.rules.find(item => item.rule_type === type) || {
      rule_id: null,
      rule_type: type,
      enabled: false,
      calculation_mode: 'percentage',
      amount: 20,
      start_time: type === 'night' ? '22:00' : null,
      end_time: type === 'night' ? '06:00' : null,
      saturday_start: type === 'weekend_holiday' ? '00:00' : null,
      saturday_end: type === 'weekend_holiday' ? '23:59' : null,
      sunday_holiday_start: type === 'weekend_holiday' ? '00:00' : null,
      sunday_holiday_end: type === 'weekend_holiday' ? '23:59' : null,
    };
  }

  function enabledServices() {
    return (S.companyConfig?.services || []).filter(item => item.is_enabled === true);
  }

  function exceptionSet(ruleId) {
    if (!ruleId) return new Set();
    return new Set(S.exceptions.filter(item => item.rule_id === ruleId).map(item => String(item.concept_id)));
  }

  function exceptionHtml(type, selected) {
    const services = enabledServices();
    if (!services.length) return '<div class="bp2-helper off">No hay servicios habilitados. Las excepciones se configuran después de habilitar servicios para esta prestadora.</div>';
    return `<div class="bp2-exception-list">${services.map(service => `<label class="bp2-exception"><input type="checkbox" data-bp2-exception="${esc(type)}" value="${esc(service.concept_id)}" ${selected.has(String(service.concept_id)) ? 'checked' : ''}><span>${esc(service.name)}</span></label>`).join('')}</div>`;
  }

  function billingModalHtml() {
    const night = rule('night');
    const weekend = rule('weekend_holiday');
    const setting = S.billing?.setting || {};
    const versionText = !S.rateCard
      ? '<b>Sin tarifario versionado.</b> Podés guardar recorrido, peajes y vigencia. Los recargos necesitan un tarifario/contrato para quedar versionados.'
      : S.rateCard.status === 'draft'
        ? `<b>Versión editable:</b> ${esc(S.rateCard.name)} · v${esc(S.rateCard.version)} (borrador).`
        : `<b>Histórico protegido:</b> los recargos actuales pertenecen a ${esc(S.rateCard.name)} · v${esc(S.rateCard.version)}. Al guardar un cambio se genera una nueva versión antes de modificar las reglas.`;
    return `<div class="bp2-shell">
      <section class="bp2-section">
        <div class="bp2-section-head"><div><h4>Cómo factura el servicio</h4><p>Parámetros generales de recorrido y tratamiento de peajes para esta prestadora.</p></div></div>
        <div class="bp2-section-body"><div class="bp2-grid">
          <label class="bp2-field"><span>Modo de kilometraje</span><select class="form-input" id="cb-route"><option value="base_origin_destination_base">Base → Origen → Destino → Base</option><option value="base_origin">Base → Origen</option><option value="origin_destination">Origen → Destino</option><option value="manual">Kilometraje manual</option></select></label>
          <label class="bp2-field"><span>Peajes</span><select class="form-input" id="cb-tolls"><option value="route_estimate">Estimación de la ruta</option><option value="manual">Carga manual / comprobante</option><option value="not_applicable">No corresponde</option></select></label>
          <div class="bp2-helper full" id="cc-toll-mode-panel"></div>
        </div></div>
      </section>

      <section class="bp2-section">
        <div class="bp2-section-head"><div><h4>Recargos</h4><p>Activá cada regla, definí horarios y elegí si el ajuste es porcentual o un monto fijo.</p></div></div>
        <div class="bp2-section-body"><div class="bp2-rule-grid">
          <article class="bp2-rule ${night.enabled ? 'active' : ''}" id="bp2-night-card">
            <div class="bp2-rule-head"><div><h5>Turno noche</h5><p>Recargo para servicios realizados dentro del rango nocturno.</p></div><label class="bp2-switch" title="Activar turno noche"><input type="checkbox" id="bp2-night-enabled" ${night.enabled ? 'checked' : ''}><i></i></label></div>
            <div class="bp2-rule-fields ${night.enabled ? '' : 'disabled'}" id="bp2-night-fields">
              <div class="bp2-grid"><label class="bp2-field"><span>Desde</span><input class="form-input" type="time" id="bp2-night-start" value="${esc(timeValue(night.start_time) || '22:00')}"></label><label class="bp2-field"><span>Hasta</span><input class="form-input" type="time" id="bp2-night-end" value="${esc(timeValue(night.end_time) || '06:00')}"></label></div>
              <div class="bp2-grid"><label class="bp2-field"><span>Tipo de recargo</span><select class="form-input" id="bp2-night-mode"><option value="percentage" ${night.calculation_mode !== 'fixed' ? 'selected' : ''}>Porcentaje</option><option value="fixed" ${night.calculation_mode === 'fixed' ? 'selected' : ''}>Monto fijo</option></select></label><label class="bp2-field"><span id="bp2-night-value-label">Valor</span><input class="form-input" type="number" min="0" step="0.01" id="bp2-night-amount" value="${esc(moneyValue(night.amount))}"></label></div>
              <div class="bp2-exceptions"><div class="bp2-exceptions-head"><div><b>Excepciones</b><span>Marcá los servicios donde NO debe aplicarse.</span></div></div>${exceptionHtml('night', exceptionSet(night.rule_id))}</div>
            </div>
          </article>

          <article class="bp2-rule ${weekend.enabled ? 'active' : ''}" id="bp2-weekend-card">
            <div class="bp2-rule-head"><div><h5>Fin de semana y feriados</h5><p>Una regla para sábado y otra franja para domingo/feriado, con el mismo recargo.</p></div><label class="bp2-switch" title="Activar fin de semana y feriados"><input type="checkbox" id="bp2-weekend-enabled" ${weekend.enabled ? 'checked' : ''}><i></i></label></div>
            <div class="bp2-rule-fields ${weekend.enabled ? '' : 'disabled'}" id="bp2-weekend-fields">
              <div class="bp2-subtitle">Sábado</div><div class="bp2-grid"><label class="bp2-field"><span>Desde</span><input class="form-input" type="time" id="bp2-saturday-start" value="${esc(timeValue(weekend.saturday_start) || '00:00')}"></label><label class="bp2-field"><span>Hasta</span><input class="form-input" type="time" id="bp2-saturday-end" value="${esc(timeValue(weekend.saturday_end) || '23:59')}"></label></div>
              <div class="bp2-subtitle">Domingo / feriado</div><div class="bp2-grid"><label class="bp2-field"><span>Desde</span><input class="form-input" type="time" id="bp2-sunday-start" value="${esc(timeValue(weekend.sunday_holiday_start) || '00:00')}"></label><label class="bp2-field"><span>Hasta</span><input class="form-input" type="time" id="bp2-sunday-end" value="${esc(timeValue(weekend.sunday_holiday_end) || '23:59')}"></label></div>
              <div class="bp2-grid"><label class="bp2-field"><span>Tipo de recargo</span><select class="form-input" id="bp2-weekend-mode"><option value="percentage" ${weekend.calculation_mode !== 'fixed' ? 'selected' : ''}>Porcentaje</option><option value="fixed" ${weekend.calculation_mode === 'fixed' ? 'selected' : ''}>Monto fijo</option></select></label><label class="bp2-field"><span id="bp2-weekend-value-label">Valor</span><input class="form-input" type="number" min="0" step="0.01" id="bp2-weekend-amount" value="${esc(moneyValue(weekend.amount))}"></label></div>
              <div class="bp2-exceptions"><div class="bp2-exceptions-head"><div><b>Excepciones</b><span>Marcá los servicios donde NO debe aplicarse.</span></div></div>${exceptionHtml('weekend_holiday', exceptionSet(weekend.rule_id))}</div>
            </div>
          </article>
        </div><div class="bp2-version">${versionText}</div></div>
      </section>

      <section class="bp2-section">
        <div class="bp2-section-head"><div><h4>Vigencia</h4><p>Período de aplicación de estos parámetros generales.</p></div></div>
        <div class="bp2-section-body"><div class="bp2-grid three">
          <label class="bp2-field"><span>Vigente desde</span><input class="form-input" type="date" id="cb-from" value="${esc(setting.valid_from || today())}"></label>
          <label class="bp2-field"><span>Vigente hasta</span><input class="form-input" type="date" id="cb-until" value="${esc(setting.valid_until || '')}"></label>
          <label class="bp2-field" style="align-content:end"><span>Estado</span><label class="cb-check"><input type="checkbox" id="cb-active" ${setting.is_active !== false ? 'checked' : ''}> Configuración activa</label></label>
          <label class="bp2-field full"><span>Observaciones</span><textarea class="form-input" id="cb-notes" rows="3">${esc(setting.notes || '')}</textarea></label>
        </div><input type="checkbox" id="cb-require-verified" hidden></div>
      </section>
      <div class="modal-error" id="cb-error" style="display:none"></div>
    </div>`;
  }

  function renderTollMode() {
    const select = document.getElementById('cb-tolls');
    const panel = document.getElementById('cc-toll-mode-panel');
    if (!select || !panel) return;
    if (select.value === 'manual') {
      panel.className = 'bp2-helper full manual';
      panel.innerHTML = '<b>Carga real / comprobante</b>El peaje se carga durante el servicio con el importe real. No se toma una estimación automática.';
    } else if (select.value === 'not_applicable') {
      panel.className = 'bp2-helper full off';
      panel.innerHTML = '<b>No corresponde</b>AuxiliOS no incorpora peajes en la liquidación de esta prestadora.';
    } else {
      panel.className = 'bp2-helper full route';
      panel.innerHTML = '<b>Estimación automática por ruta</b>El sistema usa el recorrido calculado como referencia para estimar el peaje.';
    }
  }

  function syncRuleVisual(type) {
    const enabled = Boolean(document.getElementById(`bp2-${type}-enabled`)?.checked);
    document.getElementById(`bp2-${type}-card`)?.classList.toggle('active', enabled);
    document.getElementById(`bp2-${type}-fields`)?.classList.toggle('disabled', !enabled);
    document.querySelectorAll(`#bp2-${type}-fields input,#bp2-${type}-fields select`).forEach(input => {
      if (input.matches('[data-bp2-exception]')) return;
      input.disabled = !enabled;
    });
  }

  function updateAmountLabel(type) {
    const mode = document.getElementById(`bp2-${type}-mode`)?.value;
    const label = document.getElementById(`bp2-${type}-value-label`);
    if (label) label.textContent = mode === 'fixed' ? 'Monto fijo' : 'Porcentaje (%)';
  }

  function bindModalDynamics() {
    document.getElementById('cb-tolls')?.addEventListener('change', renderTollMode);
    ['night', 'weekend'].forEach(type => {
      document.getElementById(`bp2-${type}-enabled`)?.addEventListener('change', () => syncRuleVisual(type));
      document.getElementById(`bp2-${type}-mode`)?.addEventListener('change', () => updateAmountLabel(type));
      syncRuleVisual(type);
      updateAmountLabel(type);
    });
    renderTollMode();
  }

  function patchModalShell() {
    const modal = document.getElementById('modal-company-billing');
    if (!modal) return false;
    modal.querySelector('.modal-head-title').textContent = 'Parámetros de facturación';
    const box = modal.querySelector('.modal-box');
    if (box) { box.style.width = 'min(980px,calc(100vw - 24px))'; box.style.maxWidth = '980px'; }
    const body = modal.querySelector('.modal-body');
    if (!body) return false;
    body.innerHTML = '<div class="bp2-helper">Cargando parámetros…</div>';
    const save = modal.querySelector('#cb-save');
    if (save) { save.textContent = 'Guardar parámetros'; save.onclick = () => saveParameters(); }
    return true;
  }

  async function openParameters(companyId = null) {
    if (!canWrite()) return notify('Solo Administración puede modificar parámetros de facturación', 'error');
    injectStyles();
    const id = resolveCompanyId(companyId);
    if (!id) return notify('Seleccioná una prestadora', 'warning');
    S.companyId = id;
    if (!patchModalShell()) return notify('El formulario de parámetros todavía no terminó de cargar', 'error');
    if (typeof openModal === 'function') openModal('modal-company-billing');
    else document.getElementById('modal-company-billing')?.classList.add('open');
    try {
      await loadContext(id, true);
      const body = document.querySelector('#modal-company-billing .modal-body');
      if (!body) return;
      body.innerHTML = billingModalHtml();
      const setting = S.billing?.setting || {};
      document.getElementById('cb-route').value = setting.route_mode || 'base_origin_destination_base';
      document.getElementById('cb-tolls').value = setting.toll_calculation_mode || 'route_estimate';
      bindModalDynamics();
    } catch (error) {
      const body = document.querySelector('#modal-company-billing .modal-body');
      if (body) body.innerHTML = `<div class="modal-error" style="display:block">${esc(error?.message || 'No se pudieron cargar los parámetros.')}</div>`;
    }
  }

  function formError(message = '') {
    const el = document.getElementById('cb-error');
    if (!el) return;
    el.textContent = message;
    el.style.display = message ? 'block' : 'none';
  }

  function collectRule(type) {
    const isWeekend = type === 'weekend_holiday';
    const prefix = isWeekend ? 'weekend' : 'night';
    const selected = [...document.querySelectorAll(`[data-bp2-exception="${type}"]:checked`)].map(input => input.value);
    return {
      type,
      enabled: Boolean(document.getElementById(`bp2-${prefix}-enabled`)?.checked),
      calculation_mode: document.getElementById(`bp2-${prefix}-mode`)?.value || 'percentage',
      amount: Math.max(0, Number(document.getElementById(`bp2-${prefix}-amount`)?.value || 0)),
      start_time: isWeekend ? null : (document.getElementById('bp2-night-start')?.value || null),
      end_time: isWeekend ? null : (document.getElementById('bp2-night-end')?.value || null),
      saturday_start: isWeekend ? (document.getElementById('bp2-saturday-start')?.value || null) : null,
      saturday_end: isWeekend ? (document.getElementById('bp2-saturday-end')?.value || null) : null,
      sunday_holiday_start: isWeekend ? (document.getElementById('bp2-sunday-start')?.value || null) : null,
      sunday_holiday_end: isWeekend ? (document.getElementById('bp2-sunday-end')?.value || null) : null,
      exceptions: selected,
    };
  }

  function validateRules(rules) {
    for (const r of rules) {
      if (!r.enabled) continue;
      if (!Number.isFinite(r.amount) || r.amount < 0) return 'El valor del recargo debe ser válido.';
      if (r.type === 'night' && (!r.start_time || !r.end_time)) return 'Completá el rango horario del turno noche.';
      if (r.type === 'weekend_holiday' && (!r.saturday_start || !r.saturday_end || !r.sunday_holiday_start || !r.sunday_holiday_end)) return 'Completá los rangos horarios de fin de semana y feriados.';
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
    if ([items, rules, exceptions, links, billing, codes].some(result => result.error)) throw new Error('No se pudo versionar el tarifario actual.');

    const created = await _db.from('company_rate_cards').insert({
      contract_id: source.contract_id,
      name: source.name,
      status: 'draft',
      currency: source.currency,
      valid_from: today(),
      valid_until: null,
      notes: `Actualización de parámetros basada en versión ${source.version}`,
    }).select().single();
    if (created.error) throw created.error;
    const card = created.data;
    try {
      if (items.data?.length) {
        const rows = items.data.map(row => ({ ...strip(row, ['rate_item_id', 'rate_card_id', 'created_at', 'updated_at', 'created_by', 'updated_by']), rate_card_id: card.rate_card_id }));
        const result = await _db.from('company_rate_items').insert(rows); if (result.error) throw result.error;
      }
      await _db.from('company_rate_rules').delete().eq('rate_card_id', card.rate_card_id);
      const ruleRows = (rules.data || []).map(row => ({ ...strip(row, ['rule_id', 'rate_card_id', 'created_at', 'updated_at', 'created_by', 'updated_by']), rate_card_id: card.rate_card_id }));
      let newRules = [];
      if (ruleRows.length) {
        const result = await _db.from('company_rate_rules').insert(ruleRows).select(); if (result.error) throw result.error;
        newRules = result.data || [];
      }
      if (links.data?.length) {
        const rows = links.data.map(row => ({ ...strip(row, ['link_id', 'rate_card_id', 'created_at', 'updated_at', 'created_by', 'updated_by']), rate_card_id: card.rate_card_id }));
        const result = await _db.from('company_rate_service_links').insert(rows); if (result.error) throw result.error;
      }
      if (exceptions.data?.length) {
        const oldType = new Map((rules.data || []).map(row => [String(row.rule_id), row.rule_type]));
        const newId = new Map(newRules.map(row => [row.rule_type, row.rule_id]));
        const rows = exceptions.data.map(row => ({ rate_card_id: card.rate_card_id, rule_id: newId.get(oldType.get(String(row.rule_id))), concept_id: row.concept_id })).filter(row => row.rule_id);
        if (rows.length) { const result = await _db.from('company_rate_rule_exceptions').insert(rows); if (result.error) throw result.error; }
      }
      if (billing.data) {
        const payload = strip(billing.data, ['rate_card_id', 'created_at', 'updated_at', 'created_by', 'updated_by']);
        const result = await _db.from('company_rate_billing_settings').update(payload).eq('rate_card_id', card.rate_card_id); if (result.error) throw result.error;
      }
      if (codes.data?.length) {
        const rows = codes.data.map(row => ({ rate_card_id: card.rate_card_id, code_key: row.code_key, enabled: row.enabled }));
        const result = await _db.from('company_rate_codes').upsert(rows, { onConflict: 'rate_card_id,code_key' }); if (result.error) throw result.error;
      }
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
    const patch = {
      enabled: model.enabled,
      calculation_mode: model.calculation_mode,
      amount: model.amount,
      start_time: model.start_time,
      end_time: model.end_time,
      saturday_start: model.saturday_start,
      saturday_end: model.saturday_end,
      sunday_holiday_start: model.sunday_holiday_start,
      sunday_holiday_end: model.sunday_holiday_end,
    };
    let saved;
    if (current.data) saved = await _db.from('company_rate_rules').update(patch).eq('rule_id', current.data.rule_id).select().single();
    else saved = await _db.from('company_rate_rules').insert({ rate_card_id: cardId, rule_type: model.type, ...patch }).select().single();
    if (saved.error) throw saved.error;
    const ruleId = saved.data.rule_id;
    const removed = await _db.from('company_rate_rule_exceptions').delete().eq('rule_id', ruleId);
    if (removed.error) throw removed.error;
    if (model.exceptions.length) {
      const rows = model.exceptions.map(conceptId => ({ rate_card_id: cardId, rule_id: ruleId, concept_id: conceptId }));
      const inserted = await _db.from('company_rate_rule_exceptions').insert(rows); if (inserted.error) throw inserted.error;
    }
  }

  async function saveParameters() {
    if (!canWrite() || S.busy) return;
    const id = resolveCompanyId();
    if (!id) return formError('Seleccioná una prestadora.');
    const from = document.getElementById('cb-from')?.value || today();
    const until = document.getElementById('cb-until')?.value || null;
    if (until && until < from) return formError('La fecha hasta no puede ser anterior a la fecha desde.');
    const surchargeModels = [collectRule('night'), collectRule('weekend_holiday')];
    const validation = validateRules(surchargeModels);
    if (validation) return formError(validation);
    const button = document.getElementById('cb-save');
    S.busy = true; formError('');
    if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
    try {
      await loadContext(id, true);
      const allGlobalBases = (S.billing?.available_bases || []).filter(base => base.is_active !== false).map(base => ({ base_id: base.base_id, is_active: true }));
      if (!allGlobalBases.length) throw new Error('No existen bases globales activas en AuxiliOS.');
      const billingPayload = {
        billing_setting_id: S.billing?.setting?.billing_setting_id || null,
        company_id: id,
        contract_id: null,
        route_mode: document.getElementById('cb-route')?.value || 'base_origin_destination_base',
        toll_calculation_mode: document.getElementById('cb-tolls')?.value || 'route_estimate',
        valid_from: from,
        valid_until: until,
        requires_verified_base: false,
        is_active: Boolean(document.getElementById('cb-active')?.checked),
        notes: String(document.getElementById('cb-notes')?.value || '').trim() || null,
        // Compatibilidad técnica: las bases son globales en UX; el RPC actual todavía requiere links.
        bases: allGlobalBases,
      };
      const billingSave = await _db.rpc('save_company_billing_configuration', { p_payload: billingPayload });
      if (billingSave.error) throw billingSave.error;

      const rate = await editableRateCard();
      for (const model of surchargeModels) await saveRule(rate.card.rate_card_id, model);
      if (rate.publishAfter) {
        const activated = await _db.from('company_rate_cards').update({ status: 'active' }).eq('rate_card_id', rate.card.rate_card_id).select().single();
        if (activated.error) throw activated.error;
      }

      S.contextKey = '';
      await loadContext(id, true);
      if (typeof closeModal === 'function') closeModal('modal-company-billing');
      notify(rate.publishAfter ? 'Parámetros guardados y nueva versión tarifaria activada' : 'Parámetros guardados', 'success');
      if (typeof window.cargarEmpresasV2 === 'function') await window.cargarEmpresasV2();
      if (typeof window.seleccionarEmpresaV2 === 'function') await window.seleccionarEmpresaV2(id);
      schedulePatch();
    } catch (error) {
      formError(error?.message || 'No se pudieron guardar los parámetros.');
    } finally {
      S.busy = false;
      if (button) { button.disabled = false; button.textContent = 'Guardar parámetros'; }
    }
  }

  async function renderParametersDetail(root) {
    if (!root || !S.companyId) return;
    const section = [...root.querySelectorAll('.empv2-section-card')].find(item => item.querySelector('h3')?.textContent.trim() === 'Parámetros de facturación');
    if (!section) return;
    try {
      await loadContext(S.companyId);
      if (!document.body.contains(section)) return;
      const setting = S.billing?.setting || {};
      const night = rule('night');
      const weekend = rule('weekend_holiday');
      const version = S.rateCard ? `${S.rateCard.name} · v${S.rateCard.version} · ${S.rateCard.status === 'draft' ? 'Borrador' : 'Vigente'}` : 'Sin tarifario versionado';
      const signature = [setting.route_mode, setting.toll_calculation_mode, setting.valid_from, night.enabled, night.calculation_mode, night.amount, weekend.enabled, weekend.amount, version].join('|');
      if (section.dataset.bp2Signature === signature) return;
      section.innerHTML = `<div class="bp2-detail-head"><div><h3>Parámetros de facturación</h3><p>Configuración de recorrido, peajes, recargos y vigencia. Las bases son globales y no se administran desde una prestadora.</p></div>${canWrite() ? '<button class="btn btn-primary" onclick="abrirConfiguracionFacturacionEmpresa()">Editar parámetros</button>' : ''}</div>
        <div class="bp2-summary">
          <article><small>Recorrido</small><b>${esc(routeLabel(setting.route_mode))}</b><em>${setting.is_active === false ? 'Configuración inactiva' : 'Activo'}</em></article>
          <article><small>Peajes</small><b>${esc(tollLabel(setting.toll_calculation_mode))}</b><em>Respuesta operativa según modalidad</em></article>
          <article><small>Turno noche</small><b>${night.enabled ? `${night.calculation_mode === 'fixed' ? '$' : ''}${esc(moneyValue(night.amount))}${night.calculation_mode === 'percentage' ? '%' : ''}` : 'No aplica'}</b><em>${night.enabled ? `${esc(timeValue(night.start_time))} → ${esc(timeValue(night.end_time))}` : 'Desactivado'}</em></article>
          <article><small>Fin de semana / feriados</small><b>${weekend.enabled ? `${weekend.calculation_mode === 'fixed' ? '$' : ''}${esc(moneyValue(weekend.amount))}${weekend.calculation_mode === 'percentage' ? '%' : ''}` : 'No aplica'}</b><em>${weekend.enabled ? 'Con horarios y excepciones configurables' : 'Desactivado'}</em></article>
        </div><div class="bp2-version"><b>Vigencia:</b> ${esc(setting.valid_from || 'Sin definir')}${setting.valid_until ? ` → ${esc(setting.valid_until)}` : ' → vigente'} · <b>Reglas:</b> ${esc(version)}</div>`;
      section.dataset.bp2Signature = signature;
    } catch (error) {
      console.warn('[parámetros facturación v2] detalle:', error);
    }
  }

  function removeBaseNoise(root) {
    if (!root) return;
    root.querySelectorAll('.empv2-hero-stat').forEach(stat => {
      const label = stat.querySelector('small')?.textContent.trim() || '';
      if (/Base principal|Bases habilitadas|Bases operativas/i.test(label)) stat.remove();
    });
    root.querySelectorAll('.empv2-alert-item').forEach(item => {
      if (/base/i.test(item.querySelector('b')?.textContent || '')) item.remove();
    });
    root.querySelectorAll('.empv2-feature-card').forEach(card => {
      const title = card.querySelector('h3')?.textContent.trim();
      if (title === 'Parámetros de facturación') {
        const p = card.querySelector('p');
        if (p) p.textContent = 'Recorrido, peajes, recargos y vigencia comercial.';
      }
    });
  }

  async function globalBases() {
    const result = await _db.from('billing_bases').select('base_id,base_code,name,address,city,province,is_active').eq('is_active', true).order('name');
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function selectTariffCompanyGlobal(companyId, selectElement = null) {
    const api = window.TariffMatrixV3;
    const state = api?.state;
    if (!api || !state) return;
    state.companyId = companyId || '';
    state.baseId = '';
    state.matrix = null;
    state.bases = [];
    const base = document.getElementById('tmv3-base');
    if (base) { base.disabled = true; base.innerHTML = '<option value="">Seleccionar base global</option>'; }
    if (!companyId) { await api.loadMatrix(); return; }
    try {
      const bases = await globalBases();
      state.bases = bases;
      if (base) {
        base.innerHTML = '<option value="">Seleccionar base global</option>' + bases.map(item => `<option value="${esc(item.base_id)}">${esc(item.name || item.base_code || 'Base')}</option>`).join('');
        base.disabled = !bases.length;
      }
      if (bases.length === 1) { state.baseId = String(bases[0].base_id); if (base) base.value = state.baseId; }
      await api.loadMatrix();
      await enforceTariffServiceScope();
    } catch (error) {
      notify(error?.message || 'No se pudieron cargar las bases globales', 'error');
    }
  }

  async function enforceTariffServiceScope() {
    const state = window.TariffMatrixV3?.state;
    if (!state?.companyId || !state.matrix) return;
    const cfg = await _db.rpc('get_company_configuration_v2', { p_company_id: state.companyId });
    if (cfg.error) return;
    const enabled = new Set((cfg.data?.services || []).filter(item => item.is_enabled === true).map(item => String(item.concept_id)));
    state.matrix.concepts = (state.matrix.concepts || []).map(item => ({ ...item, is_enabled: item.is_enabled === true && enabled.has(String(item.concept_id)) }));
    document.querySelectorAll('.tmv3-rate-table tbody tr[data-concept-id]').forEach(row => {
      if (!enabled.has(String(row.dataset.conceptId))) row.remove();
    });
    patchTariffUI();
  }

  function patchTariffUI() {
    const provider = document.querySelector('[data-tmv3="provider-settings"]');
    provider?.remove();
    const head = document.querySelector('.tmv3-rates-head p');
    if (head) head.textContent = 'Administrá valores únicamente para los servicios habilitados de la prestadora. Las bases disponibles pertenecen al catálogo global de AuxiliOS.';
    const baseLabel = document.getElementById('tmv3-base')?.closest('label')?.querySelector('span');
    if (baseLabel) baseLabel.textContent = 'Base global';
    document.querySelectorAll('[data-tmv3="edit-rate"]').forEach(button => {
      const row = button.closest('tr');
      const hasValue = Boolean(row?.querySelector('.tmv3-price'));
      button.textContent = hasValue ? 'Editar valor' : 'Cargar valor';
    });
    const rateTitle = document.getElementById('tmv3-rate-title');
    if (rateTitle?.textContent === 'Nueva vigencia') rateTitle.textContent = 'Editar valor';
    const save = document.querySelector('#tmv3-rate-modal [data-tmv3="save-rate"]');
    if (save && save.textContent.trim() === 'Crear vigencia') save.textContent = 'Guardar nuevo valor';
  }

  async function patchNewRateGlobalBase(companyId) {
    const select = document.getElementById('tmv3-new-rate-base');
    if (!select || !companyId) return;
    select.disabled = true;
    select.innerHTML = '<option value="">Cargando bases globales…</option>';
    try {
      const bases = await globalBases();
      select.innerHTML = '<option value="">Seleccionar base global</option>' + bases.map(item => `<option value="${esc(item.base_id)}">${esc(item.name || item.base_code || 'Base')}</option>`).join('');
      select.disabled = !bases.length;
      const state = window.TariffMatrixV3?.state;
      if (state?.baseId && bases.some(item => String(item.base_id) === String(state.baseId))) select.value = state.baseId;
      else if (bases.length === 1) select.value = bases[0].base_id;
      const help = document.getElementById('tmv3-new-rate-scope-help');
      if (help) help.innerHTML = '<b>Base global.</b> Elegí la base operativa sobre la que aplica este valor; no es una configuración propia de la prestadora.';
    } catch (error) {
      select.innerHTML = '<option value="">No se pudieron cargar las bases</option>';
    }
  }

  function repairEditableForms() {
    if (!canWrite()) return;
    ['crs-name', 'crs-code', 'crs-icon', 'crs-description', 'crs-category', 'crs-tariff-type', 'crs-unit', 'crs-active'].forEach(id => {
      const element = document.getElementById(id); if (element) element.disabled = false;
    });
    ['crt-name', 'crt-code', 'crt-description', 'crt-order', 'crt-adds-km', 'crt-active'].forEach(id => {
      const element = document.getElementById(id); if (element) element.disabled = false;
    });
  }

  function showLegacyFormError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
  }

  function installFormWrappers() {
    const openService = window.abrirTipoServicioConfig;
    if (typeof openService === 'function' && !openService.__bp2Wrapped) {
      const wrapped = function(id = null, ...args) {
        S.serviceEditId = id || null;
        const result = openService.apply(this, [id, ...args]);
        setTimeout(repairEditableForms, 0);
        return result;
      };
      wrapped.__bp2Wrapped = true;
      window.abrirTipoServicioConfig = wrapped;
    }
    const saveService = window.guardarTipoServicioConfig;
    if (typeof saveService === 'function' && !saveService.__bp2Wrapped) {
      const wrapped = async function(...args) {
        if (S.serviceEditId) {
          const code = String(document.getElementById('crs-code')?.value || '').trim().toLowerCase();
          if (!code) return showLegacyFormError('crs-error', 'Completá el código interno.');
          const update = await _db.from('service_concepts').update({ code }).eq('concept_id', S.serviceEditId);
          if (update.error) return showLegacyFormError('crs-error', update.error.message);
        }
        const result = await saveService.apply(this, args);
        S.serviceEditId = null;
        return result;
      };
      wrapped.__bp2Wrapped = true;
      window.guardarTipoServicioConfig = wrapped;
    }
    const openTariffType = window.abrirTipoTarifaConfig;
    if (typeof openTariffType === 'function' && !openTariffType.__bp2Wrapped) {
      const wrapped = function(id = null, ...args) {
        S.tariffTypeEditId = id || null;
        const result = openTariffType.apply(this, [id, ...args]);
        setTimeout(repairEditableForms, 0);
        return result;
      };
      wrapped.__bp2Wrapped = true;
      window.abrirTipoTarifaConfig = wrapped;
    }
    const saveTariffType = window.guardarTipoTarifaConfig;
    if (typeof saveTariffType === 'function' && !saveTariffType.__bp2Wrapped) {
      const wrapped = async function(...args) {
        if (S.tariffTypeEditId) {
          const code = String(document.getElementById('crt-code')?.value || '').trim().toLowerCase();
          if (!code) return showLegacyFormError('crt-error', 'Completá el código.');
          const update = await _db.from('tariff_types').update({ code }).eq('tariff_type_id', S.tariffTypeEditId);
          if (update.error) return showLegacyFormError('crt-error', update.error.message);
        }
        const result = await saveTariffType.apply(this, args);
        S.tariffTypeEditId = null;
        return result;
      };
      wrapped.__bp2Wrapped = true;
      window.guardarTipoTarifaConfig = wrapped;
    }
  }

  function installNavigationWrappers() {
    const selectCompany = window.seleccionarEmpresaV2;
    if (typeof selectCompany === 'function' && !selectCompany.__bp2Wrapped) {
      const wrapped = async function(companyId, ...args) {
        if (companyId) { S.companyId = companyId; S.contextKey = ''; }
        const result = await selectCompany.apply(this, [companyId, ...args]);
        schedulePatch();
        return result;
      };
      wrapped.__bp2Wrapped = true;
      window.seleccionarEmpresaV2 = wrapped;
      if (window.seleccionarEmpresa === selectCompany) window.seleccionarEmpresa = wrapped;
    }
    window.abrirConfiguracionFacturacionEmpresa = companyId => openParameters(companyId || S.companyId);
    window.guardarConfiguracionFacturacionEmpresa = saveParameters;
  }

  function installTariffCapture() {
    if (document.documentElement.dataset.bp2TariffCapture) return;
    document.documentElement.dataset.bp2TariffCapture = '1';
    document.addEventListener('change', event => {
      const target = event.target;
      if (target?.id === 'tmv3-company') {
        event.stopImmediatePropagation();
        selectTariffCompanyGlobal(target.value, target);
      } else if (target?.id === 'tmv3-new-rate-company') {
        event.stopImmediatePropagation();
        patchNewRateGlobalBase(target.value);
      }
    }, true);
  }

  async function patchAll() {
    if (S.patching) return;
    S.patching = true;
    try {
      injectStyles();
      installNavigationWrappers();
      installFormWrappers();
      installTariffCapture();
      repairEditableForms();
      patchTariffUI();
      const root = document.getElementById('empv2-root');
      if (root) {
        removeBaseNoise(root);
        await renderParametersDetail(root);
      }
    } finally {
      S.patching = false;
    }
  }

  function schedulePatch() {
    clearTimeout(S.timer);
    S.timer = setTimeout(patchAll, 80);
  }

  function init() {
    injectStyles();
    let attempts = 0;
    const timer = setInterval(() => {
      installNavigationWrappers();
      installFormWrappers();
      installTariffCapture();
      patchAll();
      if (++attempts > 80 || (window.seleccionarEmpresaV2 && window.abrirTipoServicioConfig && window.TariffMatrixV3)) clearInterval(timer);
    }, 200);
    new MutationObserver(schedulePatch).observe(document.body, { childList: true, subtree: true });
  }

  window.AuxiliosBillingParametersV2 = {
    open: openParameters,
    save: saveParameters,
    loadContext,
    selectTariffCompanyGlobal,
  };

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();
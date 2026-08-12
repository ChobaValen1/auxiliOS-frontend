/* AuxiliOS · Parámetros de facturación v4 · configuración canónica por prestadora */
(() => {
  'use strict';

  const S = {
    companyId: null, billing: null, companyConfig: null,
    activeCard: null, draftCard: null, rateCard: null,
    rules: [], exceptions: [], busy: false,
  };

  const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const profile = () => typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : (window.PERFIL_USUARIO || {});
  const role = () => norm(profile()?.roles?.name || profile()?.role?.name || profile()?.role || profile()?.role_name || '');
  const canWrite = () => role() === 'administracion';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const notify = (message, type = 'info') => typeof toast === 'function' ? toast(message, type) : console[type === 'error' ? 'error' : 'log'](message);
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const timeValue = value => value ? String(value).slice(0, 5) : '';
  const num = value => Number(value ?? 0) || 0;
  const resolveCompanyId = explicit => explicit || S.companyId || window.__auxCompanySelected || null;
  const optionalNumber = id => { const raw = String(document.getElementById(id)?.value ?? '').trim(); return raw === '' ? null : Number(raw); };

  function inject() {
    if (!document.getElementById('company-billing-parameters-v4-css')) document.head.insertAdjacentHTML('beforeend', `<style id="company-billing-parameters-v4-css">
      .bp4-shell{display:grid;gap:14px}.bp4-section{border:1px solid var(--border);border-radius:12px;background:var(--panel);overflow:hidden}.bp4-section-head{padding:14px 16px;border-bottom:1px solid var(--border);background:rgba(255,255,255,.012)}.bp4-section-head h4{margin:0;font-size:13px;color:var(--text)}.bp4-section-head p{margin:4px 0 0;font-size:10px;line-height:1.45;color:var(--muted2)}.bp4-section-body{padding:14px 16px}
      .bp4-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.bp4-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.bp4-field{display:grid;gap:6px}.bp4-field>span,.bp4-label{font-size:9px;font-weight:750;letter-spacing:.04em;text-transform:uppercase;color:var(--muted2)}.bp4-field.full{grid-column:1/-1}.bp4-label-line{display:flex;align-items:center;gap:6px}
      .bp4-info{display:inline-grid;place-items:center;width:17px;height:17px;border:1px solid var(--border2);border-radius:50%;font-size:9px;font-weight:900;color:var(--cyan);cursor:help;text-transform:none;letter-spacing:0}.bp4-optional{font-size:8px;font-weight:500;color:var(--muted);text-transform:none;letter-spacing:0}
      .bp4-help{padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:var(--bg);font-size:10px;line-height:1.5;color:var(--muted2)}.bp4-help b{display:block;margin-bottom:2px;color:var(--text)}.bp4-help.route{border-color:rgba(46,196,214,.30)}.bp4-help.manual{border-color:rgba(245,166,35,.30)}.bp4-help.off{border-color:rgba(90,98,120,.40)}
      .bp4-base-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.bp4-base{display:flex;align-items:flex-start;gap:9px;padding:10px 11px;border:1px solid var(--border);border-radius:9px;background:var(--bg);cursor:pointer}.bp4-base:has(input:checked){border-color:rgba(46,196,214,.38);background:rgba(46,196,214,.06)}.bp4-base input{margin-top:2px;accent-color:var(--cyan)}.bp4-base b{display:block;font-size:10px;color:var(--text)}.bp4-base small{display:block;margin-top:3px;font-size:9px;line-height:1.35;color:var(--muted2)}
      .bp4-rule-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.bp4-rule{padding:14px;border:1px solid var(--border);border-radius:11px;background:var(--bg)}.bp4-rule.active{border-color:rgba(245,166,35,.34)}.bp4-rule-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.bp4-rule-head h5{margin:0;font-size:12px;color:var(--text)}.bp4-rule-head p{margin:3px 0 0;font-size:9px;line-height:1.4;color:var(--muted2)}
      .bp4-switch{position:relative;display:inline-flex;align-items:center;width:38px;height:22px;flex:0 0 auto}.bp4-switch input{position:absolute;opacity:0;pointer-events:none}.bp4-switch i{width:38px;height:22px;border-radius:999px;background:var(--border2);position:relative}.bp4-switch i:after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:var(--muted2);transition:.18s}.bp4-switch input:checked+i{background:rgba(245,166,35,.26);box-shadow:inset 0 0 0 1px rgba(245,166,35,.45)}.bp4-switch input:checked+i:after{left:19px;background:var(--amber)}
      .bp4-rule-fields{display:grid;gap:10px}.bp4-rule-fields.disabled{opacity:.42}.bp4-subtitle{margin:3px 0 7px;font-size:9px;font-weight:800;color:var(--muted2);text-transform:uppercase;letter-spacing:.06em}.bp4-exceptions{margin-top:11px;padding-top:11px;border-top:1px solid var(--border)}.bp4-exception-list{display:flex;gap:6px;flex-wrap:wrap}.bp4-exception{display:inline-flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid var(--border2);border-radius:8px;font-size:9px;color:var(--muted2);cursor:pointer}.bp4-exception:has(input:checked){border-color:rgba(226,80,74,.38);background:rgba(226,80,74,.07);color:var(--text)}.bp4-exception input{accent-color:var(--red)}
      .bp4-version{margin-top:10px;padding:9px 11px;border-radius:8px;border:1px solid var(--border);background:rgba(79,142,247,.05);font-size:9px;line-height:1.45;color:var(--muted2)}.bp4-version b{color:var(--text)}.bp4-dialog{width:min(980px,calc(100vw - 24px));max-width:980px}.bp4-dialog .modal-body{max-height:min(76vh,760px);overflow:auto}
      @media(max-width:760px){.bp4-grid,.bp4-grid.three,.bp4-rule-grid,.bp4-base-list{grid-template-columns:1fr}}
    </style>`);
    if (document.getElementById('modal-company-billing-v4')) return;
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-company-billing-v4"><div class="modal-box bp4-dialog"><div class="modal-head"><span class="modal-head-title">Parámetros de facturación</span><button class="modal-close" type="button" data-bp4-close>×</button></div><div class="modal-body" id="bp4-modal-body"></div><div class="modal-footer"><button class="btn btn-ghost" type="button" data-bp4-close>Cancelar</button><button class="btn btn-primary" id="bp4-save" type="button">Guardar parámetros</button></div></div></div>`);
    document.querySelectorAll('[data-bp4-close]').forEach(button => button.addEventListener('click', close));
    document.getElementById('bp4-save')?.addEventListener('click', saveParameters);
  }

  function close() { typeof closeModal === 'function' ? closeModal('modal-company-billing-v4') : document.getElementById('modal-company-billing-v4')?.classList.remove('open'); }
  function setError(message = '') { const el = document.getElementById('bp4-error'); if (!el) return; el.textContent = message; el.style.display = message ? 'block' : 'none'; }

  async function loadRateContext(companyId) {
    const contracts = await _db.from('company_contracts').select('contract_id,status,is_primary,valid_from').eq('company_id', companyId).order('is_primary', { ascending: false }).order('valid_from', { ascending: false });
    if (contracts.error) throw contracts.error;
    const contract = (contracts.data || []).find(row => row.status === 'active') || null;
    if (!contract) return { active: null, draft: null, card: null, rules: [], exceptions: [] };
    const cards = await _db.from('company_rate_cards').select('*').eq('contract_id', contract.contract_id).order('version', { ascending: false }).order('created_at', { ascending: false });
    if (cards.error) throw cards.error;
    const rows = cards.data || [], active = rows.find(row => row.status === 'active') || null;
    const draft = rows.find(row => row.status === 'draft' && (!active || Number(row.version) > Number(active.version))) || null;
    const card = draft || active;
    if (!card) return { active, draft, card: null, rules: [], exceptions: [] };
    const [rules, exceptions] = await Promise.all([
      _db.from('company_rate_rules').select('*').eq('rate_card_id', card.rate_card_id),
      _db.from('company_rate_rule_exceptions').select('*').eq('rate_card_id', card.rate_card_id),
    ]);
    if (rules.error) throw rules.error; if (exceptions.error) throw exceptions.error;
    return { active, draft, card, rules: rules.data || [], exceptions: exceptions.data || [] };
  }

  async function loadContext(companyId = null) {
    const id = resolveCompanyId(companyId); if (!id) throw new Error('Seleccioná una prestadora.');
    const [billing, companyConfig, rate] = await Promise.all([
      _db.rpc('get_company_billing_configuration', { p_company_id: id, p_scheduled_for: new Date().toISOString() }),
      _db.rpc('get_company_configuration_v2', { p_company_id: id }),
      loadRateContext(id),
    ]);
    if (billing.error) throw billing.error; if (companyConfig.error) throw companyConfig.error;
    S.companyId = id; S.billing = billing.data || { setting: null, links: [], available_bases: [] }; S.companyConfig = companyConfig.data || { services: [] };
    S.activeCard = rate.active; S.draftCard = rate.draft; S.rateCard = rate.card; S.rules = rate.rules; S.exceptions = rate.exceptions;
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
  const linkedBaseIds = () => new Set((S.billing?.links || []).filter(link => link.is_active !== false && link.base_active !== false).map(link => String(link.base_id)));

  function exceptionHtml(type, selected) {
    const services = enabledServices();
    if (!services.length) return '<div class="bp4-help off">No hay servicios habilitados para configurar excepciones.</div>';
    return `<div class="bp4-exception-list">${services.map(service => `<label class="bp4-exception"><input type="checkbox" data-bp4-exception="${esc(type)}" value="${esc(service.concept_id)}" ${selected.has(String(service.concept_id)) ? 'checked' : ''}><span>${esc(service.name)}</span></label>`).join('')}</div>`;
  }

  function baseSelectorHtml() {
    const linked = linkedBaseIds();
    const bases = (S.billing?.available_bases || []).filter(base => base.is_active !== false);
    if (!bases.length) return '<div class="bp4-help off">No hay bases geográficas activas en el catálogo. Crealas primero desde Configuración → Bases geográficas.</div>';
    return `<div class="bp4-base-list">${bases.map(base => `<label class="bp4-base"><input type="checkbox" data-bp4-base value="${esc(base.base_id)}" ${linked.has(String(base.base_id)) ? 'checked' : ''}><span><b>${esc(base.name || base.base_name || 'Base')}</b><small>${esc(base.address || base.formatted_address || base.city || 'Sin dirección cargada')}</small></span></label>`).join('')}</div>`;
  }

  function modalHtml() {
    const setting = S.billing?.setting || {}, night = rule('night'), weekend = rule('weekend_holiday');
    const versionText = !S.rateCard ? '<b>Sin tarifario publicado.</b> Los parámetros generales se guardan igual; los recargos tarifarios necesitan una versión para quedar activos.' : S.draftCard ? `<b>Borrador v${esc(S.draftCard.version)}.</b> Los cambios de recargos quedan dentro de esa misma versión pendiente.` : `<b>Tarifario publicado v${esc(S.activeCard?.version)}.</b> Si cambiás recargos, AuxiliOS conserva el histórico.`;
    const radiusHelp = 'Distancia hasta la cual se factura únicamente la movida. Si se deja vacío, la prestadora no tiene radio cubierto y los kilómetros se facturan desde el inicio.';
    const movementHelp = 'Distancia máxima hasta la cual se factura la movida. Si se deja vacío, la movida no tiene límite.';
    return `<div class="bp4-shell">
      <section class="bp4-section"><div class="bp4-section-head"><h4>Bases habilitadas para esta prestadora</h4><p>Solo estas bases forman parte de la configuración de la empresa. Todas tienen la misma jerarquía.</p></div><div class="bp4-section-body">${baseSelectorHtml()}</div></section>
      <section class="bp4-section"><div class="bp4-section-head"><h4>Cómo factura el recorrido</h4><p>Reglas contractuales de kilometraje de esta prestadora. Los importes se cargan exclusivamente en Tarifas.</p></div><div class="bp4-section-body"><div class="bp4-grid">
        <label class="bp4-field"><span>Modo de kilometraje</span><select class="form-input" id="bp4-route"><option value="base_origin_destination_base">Base → Origen → Destino → Base</option><option value="base_origin">Base → Origen</option><option value="origin_destination">Origen → Destino</option><option value="manual">Kilometraje manual</option></select></label>
        <label class="bp4-field"><span>Peajes</span><select class="form-input" id="bp4-tolls"><option value="route_estimate">Estimación automática por ruta</option><option value="manual">Carga real / comprobante</option><option value="not_applicable">No corresponde</option></select></label>
        <label class="bp4-field"><span class="bp4-label-line"><span class="bp4-label">Radio cubierto (km)</span><span class="bp4-info" title="${esc(radiusHelp)}">?</span><span class="bp4-optional">Opcional</span></span><input class="form-input" id="bp4-covered-radius" type="number" min="0" step="0.1" value="${esc(setting.covered_radius_km ?? '')}" placeholder="Sin radio cubierto"></label>
        <label class="bp4-field"><span class="bp4-label-line"><span class="bp4-label">Cobrar movida hasta (km)</span><span class="bp4-info" title="${esc(movementHelp)}">?</span><span class="bp4-optional">Opcional</span></span><input class="form-input" id="bp4-movement-until" type="number" min="0" step="0.1" value="${esc(setting.movement_charge_until_km ?? '')}" placeholder="Sin límite"></label>
        <div class="bp4-help full"><b>Cómo se interpreta</b>Dentro del radio cubierto se cobra solo la movida. Al superar el radio se cobran la movida + todos los kilómetros recorridos. Si se supera “Cobrar movida hasta”, se cobran únicamente los kilómetros. Los campos vacíos significan que esa restricción no existe.</div>
        <div class="bp4-help full" id="bp4-toll-help"></div>
      </div></div></section>
      <section class="bp4-section"><div class="bp4-section-head"><h4>Recargos</h4><p>Horarios, forma de cálculo y servicios exceptuados.</p></div><div class="bp4-section-body"><div class="bp4-rule-grid">
        <article class="bp4-rule ${night.enabled ? 'active' : ''}" id="bp4-night-card"><div class="bp4-rule-head"><div><h5>Turno noche</h5><p>Recargo dentro del rango nocturno.</p></div><label class="bp4-switch"><input type="checkbox" id="bp4-night-enabled" ${night.enabled ? 'checked' : ''}><i></i></label></div><div class="bp4-rule-fields ${night.enabled ? '' : 'disabled'}" id="bp4-night-fields"><div class="bp4-grid"><label class="bp4-field"><span>Desde</span><input class="form-input" type="time" id="bp4-night-start" value="${esc(timeValue(night.start_time) || '22:00')}"></label><label class="bp4-field"><span>Hasta</span><input class="form-input" type="time" id="bp4-night-end" value="${esc(timeValue(night.end_time) || '06:00')}"></label></div><div class="bp4-grid"><label class="bp4-field"><span>Tipo de recargo</span><select class="form-input" id="bp4-night-mode"><option value="percentage" ${night.calculation_mode !== 'fixed' ? 'selected' : ''}>Porcentaje</option><option value="fixed" ${night.calculation_mode === 'fixed' ? 'selected' : ''}>Monto fijo</option></select></label><label class="bp4-field"><span id="bp4-night-label">Valor</span><input class="form-input" type="number" min="0" step="0.01" id="bp4-night-amount" value="${esc(num(night.amount))}"></label></div><div class="bp4-exceptions"><div class="bp4-subtitle">Servicios que NO aplican</div>${exceptionHtml('night', exceptionSet(night.rule_id))}</div></div></article>
        <article class="bp4-rule ${weekend.enabled ? 'active' : ''}" id="bp4-weekend-card"><div class="bp4-rule-head"><div><h5>Fin de semana y feriados</h5><p>Rangos para sábado y domingo/feriado.</p></div><label class="bp4-switch"><input type="checkbox" id="bp4-weekend-enabled" ${weekend.enabled ? 'checked' : ''}><i></i></label></div><div class="bp4-rule-fields ${weekend.enabled ? '' : 'disabled'}" id="bp4-weekend-fields"><div class="bp4-subtitle">Sábado</div><div class="bp4-grid"><label class="bp4-field"><span>Desde</span><input class="form-input" type="time" id="bp4-saturday-start" value="${esc(timeValue(weekend.saturday_start) || '00:00')}"></label><label class="bp4-field"><span>Hasta</span><input class="form-input" type="time" id="bp4-saturday-end" value="${esc(timeValue(weekend.saturday_end) || '23:59')}"></label></div><div class="bp4-subtitle">Domingo / feriado</div><div class="bp4-grid"><label class="bp4-field"><span>Desde</span><input class="form-input" type="time" id="bp4-sunday-start" value="${esc(timeValue(weekend.sunday_holiday_start) || '00:00')}"></label><label class="bp4-field"><span>Hasta</span><input class="form-input" type="time" id="bp4-sunday-end" value="${esc(timeValue(weekend.sunday_holiday_end) || '23:59')}"></label></div><div class="bp4-grid"><label class="bp4-field"><span>Tipo de recargo</span><select class="form-input" id="bp4-weekend-mode"><option value="percentage" ${weekend.calculation_mode !== 'fixed' ? 'selected' : ''}>Porcentaje</option><option value="fixed" ${weekend.calculation_mode === 'fixed' ? 'selected' : ''}>Monto fijo</option></select></label><label class="bp4-field"><span id="bp4-weekend-label">Valor</span><input class="form-input" type="number" min="0" step="0.01" id="bp4-weekend-amount" value="${esc(num(weekend.amount))}"></label></div><div class="bp4-exceptions"><div class="bp4-subtitle">Servicios que NO aplican</div>${exceptionHtml('weekend_holiday', exceptionSet(weekend.rule_id))}</div></div></article>
      </div><div class="bp4-version">${versionText}</div></div></section>
      <section class="bp4-section"><div class="bp4-section-head"><h4>Vigencia</h4><p>Período de aplicación de la configuración.</p></div><div class="bp4-section-body"><div class="bp4-grid three"><label class="bp4-field"><span>Vigente desde</span><input class="form-input" type="date" id="bp4-from" value="${esc(setting.valid_from || today())}"></label><label class="bp4-field"><span>Vigente hasta</span><input class="form-input" type="date" id="bp4-until" value="${esc(setting.valid_until || '')}"></label><label class="bp4-field" style="align-content:end"><span>Estado</span><label style="display:flex;align-items:center;gap:8px;font-size:10px;color:var(--text)"><input type="checkbox" id="bp4-active" ${setting.is_active !== false ? 'checked' : ''}> Configuración activa</label></label><label class="bp4-field full"><span>Observaciones</span><textarea class="form-input" id="bp4-notes" rows="3">${esc(setting.notes || '')}</textarea></label></div></div></section>
      <div class="modal-error" id="bp4-error" style="display:none"></div>
    </div>`;
  }

  function renderTollHelp() {
    const box = document.getElementById('bp4-toll-help'), value = document.getElementById('bp4-tolls')?.value; if (!box) return;
    if (value === 'route_estimate') { box.className = 'bp4-help full route'; box.innerHTML = '<b>Estimación automática por ruta</b>AuxiliOS toma el peaje estimado por la ruta calculada.'; }
    else if (value === 'manual') { box.className = 'bp4-help full manual'; box.innerHTML = '<b>Carga real / comprobante</b>El importe de peajes se informa manualmente según lo ocurrido en el servicio.'; }
    else { box.className = 'bp4-help full off'; box.innerHTML = '<b>No corresponde</b>Esta prestadora no factura peajes.'; }
  }

  function updateAmountLabel(prefix) {
    const mode = document.getElementById(`bp4-${prefix}-mode`)?.value;
    const label = document.getElementById(`bp4-${prefix}-label`); if (label) label.textContent = mode === 'fixed' ? 'Monto fijo' : 'Porcentaje';
  }

  function toggleRule(prefix) {
    const enabled = Boolean(document.getElementById(`bp4-${prefix}-enabled`)?.checked);
    document.getElementById(`bp4-${prefix}-fields`)?.classList.toggle('disabled', !enabled);
    document.getElementById(`bp4-${prefix}-card`)?.classList.toggle('active', enabled);
  }

  function bindModal() {
    document.getElementById('bp4-tolls')?.addEventListener('change', renderTollHelp);
    for (const prefix of ['night', 'weekend']) {
      document.getElementById(`bp4-${prefix}-enabled`)?.addEventListener('change', () => toggleRule(prefix));
      document.getElementById(`bp4-${prefix}-mode`)?.addEventListener('change', () => updateAmountLabel(prefix));
      updateAmountLabel(prefix);
    }
    renderTollHelp();
  }

  async function openParameters(companyId = null) {
    if (!canWrite()) return notify('Solo Administración puede modificar parámetros de facturación', 'error');
    inject(); const id = resolveCompanyId(companyId); if (!id) return notify('Seleccioná una prestadora', 'warning');
    S.companyId = id; const body = document.getElementById('bp4-modal-body'); if (body) body.innerHTML = '<div class="bp4-help">Cargando parámetros…</div>';
    typeof openModal === 'function' ? openModal('modal-company-billing-v4') : document.getElementById('modal-company-billing-v4')?.classList.add('open');
    try {
      await loadContext(id); if (!body) return; body.innerHTML = modalHtml();
      const setting = S.billing?.setting || {};
      document.getElementById('bp4-route').value = setting.route_mode || 'base_origin_destination_base';
      document.getElementById('bp4-tolls').value = setting.toll_calculation_mode || 'route_estimate';
      bindModal();
    } catch (error) { if (body) body.innerHTML = `<div class="bp4-help off">${esc(error?.message || 'No se pudieron cargar los parámetros.')}</div>`; }
  }

  function ruleModel(type) {
    const weekend = type === 'weekend_holiday', prefix = weekend ? 'weekend' : 'night';
    return {
      type, enabled: Boolean(document.getElementById(`bp4-${prefix}-enabled`)?.checked),
      calculation_mode: document.getElementById(`bp4-${prefix}-mode`)?.value || 'percentage',
      amount: Number(document.getElementById(`bp4-${prefix}-amount`)?.value || 0),
      start_time: weekend ? null : (document.getElementById('bp4-night-start')?.value || null),
      end_time: weekend ? null : (document.getElementById('bp4-night-end')?.value || null),
      saturday_start: weekend ? (document.getElementById('bp4-saturday-start')?.value || null) : null,
      saturday_end: weekend ? (document.getElementById('bp4-saturday-end')?.value || null) : null,
      sunday_holiday_start: weekend ? (document.getElementById('bp4-sunday-start')?.value || null) : null,
      sunday_holiday_end: weekend ? (document.getElementById('bp4-sunday-end')?.value || null) : null,
      exceptions: [...document.querySelectorAll(`[data-bp4-exception="${type}"]:checked`)].map(input => input.value),
    };
  }

  function validateRules(rules) {
    for (const item of rules) {
      if (!item.enabled) continue;
      if (!Number.isFinite(item.amount) || item.amount < 0) return 'El valor del recargo debe ser válido.';
      if (item.type === 'night' && (!item.start_time || !item.end_time)) return 'Completá el rango horario del turno noche.';
      if (item.type === 'weekend_holiday' && (!item.saturday_start || !item.saturday_end || !item.sunday_holiday_start || !item.sunday_holiday_end)) return 'Completá los rangos de fin de semana y feriados.';
    }
    return '';
  }

  async function saveRule(cardId, model) {
    const current = await _db.from('company_rate_rules').select('*').eq('rate_card_id', cardId).eq('rule_type', model.type).maybeSingle(); if (current.error) throw current.error;
    const patch = { enabled: model.enabled, calculation_mode: model.calculation_mode, amount: model.amount, start_time: model.start_time, end_time: model.end_time, saturday_start: model.saturday_start, saturday_end: model.saturday_end, sunday_holiday_start: model.sunday_holiday_start, sunday_holiday_end: model.sunday_holiday_end };
    const saved = current.data ? await _db.from('company_rate_rules').update(patch).eq('rule_id', current.data.rule_id).select().single() : await _db.from('company_rate_rules').insert({ rate_card_id: cardId, rule_type: model.type, ...patch }).select().single();
    if (saved.error) throw saved.error;
    const ruleId = saved.data.rule_id;
    const removed = await _db.from('company_rate_rule_exceptions').delete().eq('rule_id', ruleId); if (removed.error) throw removed.error;
    if (model.exceptions.length) {
      const inserted = await _db.from('company_rate_rule_exceptions').insert(model.exceptions.map(conceptId => ({ rate_card_id: cardId, rule_id: ruleId, concept_id: conceptId }))); if (inserted.error) throw inserted.error;
    }
  }

  async function saveParameters() {
    if (!canWrite() || S.busy || !S.companyId) return;
    const from = document.getElementById('bp4-from')?.value || today(), until = document.getElementById('bp4-until')?.value || null;
    const active = Boolean(document.getElementById('bp4-active')?.checked);
    const selectedBases = [...document.querySelectorAll('[data-bp4-base]:checked')].map(input => input.value);
    const radius = optionalNumber('bp4-covered-radius'), movementUntil = optionalNumber('bp4-movement-until');
    if (until && until < from) return setError('La fecha hasta no puede ser anterior a la fecha desde.');
    if (active && !selectedBases.length) return setError('Seleccioná al menos una base habilitada para esta prestadora.');
    if (radius !== null && (!Number.isFinite(radius) || radius < 0)) return setError('El radio cubierto debe ser un número mayor o igual a cero.');
    if (movementUntil !== null && (!Number.isFinite(movementUntil) || movementUntil < 0)) return setError('Cobrar movida hasta debe ser un número mayor o igual a cero.');
    if (radius !== null && movementUntil !== null && movementUntil < radius) return setError('Cobrar movida hasta debe ser igual o mayor que el radio cubierto.');
    const models = [ruleModel('night'), ruleModel('weekend_holiday')], ruleError = validateRules(models); if (ruleError) return setError(ruleError);
    const button = document.getElementById('bp4-save'); S.busy = true; setError(''); if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
    try {
      const setting = S.billing?.setting || {};
      const billingPayload = {
        billing_setting_id: setting.billing_setting_id || null, company_id: S.companyId, contract_id: setting.contract_id || null,
        route_mode: document.getElementById('bp4-route')?.value || 'base_origin_destination_base', toll_calculation_mode: document.getElementById('bp4-tolls')?.value || 'route_estimate',
        covered_radius_km: radius, movement_charge_until_km: movementUntil,
        valid_from: from, valid_until: until, requires_verified_base: Boolean(setting.requires_verified_base), is_active: active,
        notes: String(document.getElementById('bp4-notes')?.value || '').trim() || null,
        bases: selectedBases.map(baseId => ({ base_id: baseId, is_active: true })),
      };
      const billing = await _db.rpc('save_company_billing_configuration', { p_payload: billingPayload }); if (billing.error) throw billing.error;

      const hasConfiguredRule = models.some(model => model.enabled) || S.rules.some(existing => ['night', 'weekend_holiday'].includes(existing.rule_type));
      if (hasConfiguredRule || S.rateCard) {
        const hadDraft = Boolean(S.draftCard?.rate_card_id);
        const draft = await _db.rpc('ensure_company_tariff_draft_v4', { p_company_id: S.companyId, p_valid_from: S.draftCard?.valid_from || today() }); if (draft.error) throw draft.error;
        const id = draft.data?.rate_card_id; if (!id) throw new Error('No se pudo preparar la versión tarifaria para los recargos.');
        for (const model of models) await saveRule(id, model);
        if (!hadDraft && S.activeCard?.rate_card_id) { const published = await _db.rpc('publish_company_tariff_draft_v4', { p_rate_card_id: id }); if (published.error) throw published.error; }
      }
      notify('Parámetros de facturación guardados', 'success'); close();
      await loadContext(S.companyId);
      window.AuxiliosEmpresasV2?.reload?.();
    } catch (error) { setError(error?.message || 'No se pudieron guardar los parámetros.'); }
    finally { S.busy = false; if (button) { button.disabled = false; button.textContent = 'Guardar parámetros'; } }
  }

  Object.assign(window, { abrirConfiguracionFacturacionEmpresa: companyId => openParameters(companyId), guardarConfiguracionFacturacionEmpresa: saveParameters });
  window.AuxiliosBillingParametersV4 = { open: openParameters, save: saveParameters, loadContext, state: S };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', inject, { once: true }) : inject();
})();

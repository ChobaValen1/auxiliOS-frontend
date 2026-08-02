/* AuxiliOS · Composición tarifaria: Movida + KM + variables + peajes */
(() => {
  'use strict';

  const T = window.TariffEngine;
  if (!T) return;
  const S = T.S;
  const {
    esc, num, money, unitLabel, concept, itemFor, editable, notify,
    setForm, input, checked, formError, close, renderStep, rule
  } = T;

  const PRIMARY_CODES = new Set(['urban_tow', 'semi_heavy_assistance', 'uml']);
  const SYSTEM_CODES = new Set(['toll', 'extra_km']);

  const familyOf = c => {
    if (!c) return 'variable';
    if (c.billing_family) return c.billing_family;
    if (PRIMARY_CODES.has(c.code)) return 'primary';
    if (SYSTEM_CODES.has(c.code)) return 'system';
    if (String(c.code || '').startsWith('battery_')) return 'sale';
    return 'variable';
  };

  const vehicleLabel = c => ({
    light: 'Liviano',
    semi_heavy: 'Semipesado',
    uml: 'UML',
  }[c?.vehicle_class] || null);

  const visibleCatalog = () => S.catalog.filter(c => familyOf(c) !== 'system');
  const configuredItems = () => S.items.filter(i => i.is_active && i.branch_id == null && i.billing_base_id == null);
  const primaryConfigured = () => configuredItems().filter(i => familyOf(concept(i.concept_id)) === 'primary');
  const secondaryConfigured = () => configuredItems().filter(i => ['variable', 'sale'].includes(familyOf(concept(i.concept_id))));
  const variableConfigured = () => secondaryConfigured().filter(i => familyOf(concept(i.concept_id)) === 'variable');
  const saleConfigured = () => secondaryConfigured().filter(i => familyOf(concept(i.concept_id)) === 'sale');

  function injectStyles() {
    if (document.getElementById('tariff-composition-css')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="tariff-composition-css">
      .tc-formula{margin-top:13px;padding:11px 13px;border:1px solid rgba(91,124,255,.28);border-left:3px solid #5b7cff;border-radius:10px;background:rgba(91,124,255,.06);font-size:10px;line-height:1.5;color:var(--muted2)}
      .tc-formula b{color:var(--text)}
      .tc-family-title{grid-column:1/-1;margin:5px 0 0;padding:9px 2px 3px;border-bottom:1px solid var(--border);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
      .tc-price-hint{margin-top:7px;padding:7px 8px;border-radius:8px;background:var(--panel);font-size:8px;line-height:1.4;color:var(--muted)}
      .tc-badge.variable{color:var(--green)}.tc-badge.sale{color:var(--amber)}
      .tc-sim-variable-row{display:grid;grid-template-columns:minmax(0,1fr) 92px;gap:8px;align-items:center;padding:8px;border:1px solid var(--border);border-radius:9px;background:var(--panel)}
      .tc-sim-variable-row .tc-check{min-width:0}.tc-sim-variable-row input[type=number]{width:100%;font-size:9px}
      .tc-total-row.subtle{color:var(--muted)}
      @media(max-width:560px){.tc-sim-variable-row{grid-template-columns:1fr}}
    </style>`);
  }

  function familyMeta(c) {
    const family = familyOf(c);
    if (family === 'primary') return { label: 'Servicio principal', cls: 'primary', description: 'Suma movida y kilómetros facturables.' };
    if (family === 'sale') return { label: 'Venta', cls: 'sale', description: 'Importe por unidad. No suma kilómetros.' };
    return { label: 'Concepto variable', cls: 'variable', description: 'Importe fijo o por cantidad. No suma kilómetros.' };
  }

  function baseItemPayload(c) {
    const family = familyOf(c);
    const isPrimary = family === 'primary';
    return {
      rate_card_id: S.card.rate_card_id,
      branch_id: null,
      billing_base_id: null,
      concept_id: c.concept_id,
      service_code: c.code,
      service_name: c.name,
      can_be_primary: isPrimary,
      can_be_secondary: !isPrimary,
      pricing_unit: isPrimary ? 'service' : (c.default_pricing_unit === 'km' ? 'service' : c.default_pricing_unit),
      primary_price: 0,
      secondary_price: 0,
      base_price: 0,
      included_km: 0,
      extra_km_price: 0,
      km_calculation_method: 'one_way',
      included_wait_minutes: 0,
      wait_price_per_hour: 0,
      tolls_mode: 'not_applicable',
      tolls_fixed_amount: 0,
      extraction_fee: 0,
      cancellation_fee: 0,
      second_unit_fee: 0,
      minimum_charge: 0,
      night_surcharge_pct: 0,
      weekend_surcharge_pct: 0,
      holiday_surcharge_pct: 0,
      is_active: true,
    };
  }

  function serviceCard(c) {
    const item = itemFor(c.concept_id);
    const enabled = Boolean(item?.is_active);
    const family = familyOf(c);
    const meta = familyMeta(c);
    const character = vehicleLabel(c);

    let pricing = '';
    if (enabled && family === 'primary') {
      pricing = `<div class="tc-price-grid">
        <div class="tc-field"><label>Precio de movida</label><input class="form-input" type="number" min="0" step="0.01" value="${num(item.primary_price)}" ${editable() ? '' : 'disabled'} onchange="actualizarComponenteTarifa('${c.concept_id}','movement',this.value)"></div>
        <div class="tc-field"><label>Precio por km</label><input class="form-input" type="number" min="0" step="0.01" value="${num(item.extra_km_price)}" ${editable() ? '' : 'disabled'} onchange="actualizarComponenteTarifa('${c.concept_id}','km',this.value)"></div>
      </div>
      <div class="tc-price-grid one"><div class="tc-field"><label>KM incluidos en la movida</label><input class="form-input" type="number" min="0" step="0.01" value="${num(item.included_km)}" ${editable() ? '' : 'disabled'} onchange="actualizarComponenteTarifa('${c.concept_id}','included_km',this.value)"></div></div>
      <div class="tc-price-hint">Cálculo: <b>movida + (km facturables × precio por km)</b>. Los KM facturables son la distancia total menos los KM incluidos.</div>`;
    }

    if (enabled && family !== 'primary') {
      const units = ['service', 'hour', 'unit', 'day', 'fixed'];
      pricing = `<div class="tc-price-grid">
        <div class="tc-field"><label>Importe</label><input class="form-input" type="number" min="0" step="0.01" value="${num(item.secondary_price)}" ${editable() ? '' : 'disabled'} onchange="actualizarComponenteTarifa('${c.concept_id}','fixed',this.value)"></div>
        <div class="tc-field"><label>Unidad de cobro</label><select class="form-input" ${editable() ? '' : 'disabled'} onchange="actualizarUnidadConcepto('${c.concept_id}',this.value)">${units.map(v => `<option value="${v}" ${item.pricing_unit === v ? 'selected' : ''}>${unitLabel(v)}</option>`).join('')}</select></div>
      </div>
      <div class="tc-price-hint">Este concepto se agrega al servicio por su importe y cantidad. <b>No utiliza ni multiplica los kilómetros del recorrido.</b></div>`;
    }

    return `<article class="tc-service ${enabled ? 'enabled' : ''}">
      <div class="tc-card-head"><div class="tc-row"><div class="tc-icon">${esc(c.icon)}</div><div><div class="tc-service-name">${esc(c.name)}</div><div class="tc-badges"><span class="tc-badge ${meta.cls}">${meta.label}</span>${character ? `<span class="tc-badge">${esc(character)}</span>` : ''}</div></div></div>
        <label class="tc-switch"><input type="checkbox" ${enabled ? 'checked' : ''} ${editable() ? '' : 'disabled'} onchange="alternarConceptoComposicion('${c.concept_id}',this.checked)"><i></i></label>
      </div>
      <div class="tc-muted" style="margin-top:8px">${esc(c.description || meta.description)}</div>
      ${pricing}
    </article>`;
  }

  function renderServices(el) {
    injectStyles();
    const q = String(S.search || '').toLowerCase().trim();
    const catalog = visibleCatalog();
    const list = catalog.filter(c => (S.filter === 'all' || familyOf(c) === S.filter)
      && (!q || `${c.name} ${c.description || ''} ${vehicleLabel(c) || ''}`.toLowerCase().includes(q)));

    const grouped = ['primary', 'variable', 'sale'].map(family => ({
      family,
      rows: list.filter(c => familyOf(c) === family),
      title: family === 'primary' ? 'Servicios principales' : family === 'variable' ? 'Conceptos variables' : 'Ventas',
    })).filter(group => group.rows.length);

    el.innerHTML = `<div class="tc-step-title">Composición del servicio</div>
      <div class="tc-step-sub">Configurá por separado la movida, el valor por kilómetro y los conceptos que pueden sumarse al servicio.</div>
      <div class="tc-formula"><b>Fórmula de facturación:</b> Movida + KM facturables + conceptos variables + peajes, cuando correspondan. Solamente Liviano, Semipesado y UML suman kilómetros.</div>
      <div class="tc-kpis"><div class="tc-kpi"><small>Principales activos</small><b>${primaryConfigured().length}</b></div><div class="tc-kpi"><small>Variables activos</small><b>${variableConfigured().length}</b></div><div class="tc-kpi"><small>Ventas activas</small><b>${saleConfigured().length}</b></div><div class="tc-kpi"><small>Total configurado</small><b>${configuredItems().filter(i => familyOf(concept(i.concept_id)) !== 'system').length}</b></div></div>
      <div class="tc-toolbar"><input class="form-input" placeholder="Buscar servicio o concepto…" value="${esc(S.search || '')}" oninput="buscarConceptoTarifa(this.value)">
        <div class="tc-filter">${[['all', 'Todos'], ['primary', 'Principales'], ['variable', 'Variables'], ['sale', 'Ventas']].map(([v, l]) => `<button class="${S.filter === v ? 'active' : ''}" onclick="filtrarConceptoTarifa('${v}')">${l}</button>`).join('')}</div>
        ${editable() ? '<button class="btn btn-ghost" onclick="abrirConceptoPersonalizado()">＋ Concepto variable</button>' : ''}
      </div>
      <div class="tc-service-grid">${grouped.map(group => `<div class="tc-family-title">${group.title}</div>${group.rows.map(serviceCard).join('')}`).join('') || '<div class="tc-empty">No hay resultados.</div>'}</div>`;
  }

  function searchConcept(value) { S.search = value; renderStep(); }
  function filterConcept(value) { S.filter = value; renderStep(); }

  async function toggleConcept(id, on) {
    if (!editable()) return;
    const c = concept(id);
    if (!c || familyOf(c) === 'system') return;
    if (on) {
      const result = await _db.from('company_rate_items').insert(baseItemPayload(c)).select().single();
      if (result.error) return notify(result.error.message, 'error');
      S.items.push(result.data);
    } else {
      const rows = S.items.filter(x => x.concept_id === id);
      await Promise.all([
        _db.from('company_rate_service_links').delete().eq('rate_card_id', S.card.rate_card_id).or(`primary_concept_id.eq.${id},secondary_concept_id.eq.${id}`),
        _db.from('company_rate_rule_exceptions').delete().eq('rate_card_id', S.card.rate_card_id).eq('concept_id', id),
      ]);
      if (rows.length) {
        const result = await _db.from('company_rate_items').delete().in('rate_item_id', rows.map(x => x.rate_item_id));
        if (result.error) return notify(result.error.message, 'error');
      }
      S.items = S.items.filter(x => x.concept_id !== id);
      S.links = S.links.filter(x => x.primary_concept_id !== id && x.secondary_concept_id !== id);
      S.exceptions = S.exceptions.filter(x => x.concept_id !== id);
    }
    renderStep();
    notify(on ? 'Componente activado' : 'Componente desactivado', 'success');
  }

  async function updateItem(id, patch) {
    if (!editable()) return;
    const item = itemFor(id);
    if (!item) return;
    const c = concept(id);
    const family = familyOf(c);
    const merged = { ...item, ...patch };
    const payload = { ...patch };
    if (family === 'primary') {
      payload.can_be_primary = true;
      payload.can_be_secondary = false;
      payload.pricing_unit = 'service';
      payload.base_price = num(merged.primary_price);
    } else {
      payload.can_be_primary = false;
      payload.can_be_secondary = true;
      payload.primary_price = 0;
      payload.included_km = 0;
      payload.extra_km_price = 0;
      payload.base_price = num(merged.secondary_price);
    }
    const result = await _db.from('company_rate_items').update(payload).eq('rate_item_id', item.rate_item_id).select().single();
    if (result.error) return notify(result.error.message, 'error');
    S.items = S.items.map(x => x.rate_item_id === result.data.rate_item_id ? result.data : x);
    renderStep();
  }

  function updateComponent(id, kind, value) {
    const amount = num(value);
    if (kind === 'movement') return updateItem(id, { primary_price: amount });
    if (kind === 'km') return updateItem(id, { extra_km_price: amount });
    if (kind === 'included_km') return updateItem(id, { included_km: amount });
    return updateItem(id, { secondary_price: amount });
  }

  function updateUnit(id, value) {
    const safe = value === 'km' ? 'service' : value;
    updateItem(id, { pricing_unit: safe });
  }

  function customConcept() {
    if (!editable()) return;
    setForm('Nuevo concepto variable', 'concept', {}, `
      <div class="form-grid-2"><div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="tf-name"></div><div class="form-group"><label class="form-label">Ícono</label><input class="form-input" id="tf-icon" value="⚙" maxlength="4"></div></div>
      <div class="form-group"><label class="form-label">Descripción</label><input class="form-input" id="tf-description"></div>
      <div class="form-grid-2"><div class="form-group"><label class="form-label">Familia</label><select class="form-input" id="tf-family"><option value="variable">Concepto variable</option><option value="sale">Venta</option></select></div><div class="form-group"><label class="form-label">Unidad predeterminada</label><select class="form-input" id="tf-unit">${['service', 'hour', 'unit', 'day', 'fixed'].map(v => `<option value="${v}">${unitLabel(v)}</option>`).join('')}</select></div></div>
      <div class="tc-formula"><b>Importante:</b> los conceptos personalizados se agregan como secundarios y nunca suman kilómetros.</div>
      <div class="modal-error" id="tc-form-error" style="display:none"></div>`);
  }

  async function saveCustomConcept() {
    const name = input('tf-name').trim();
    if (!name) return formError('Ingresá el nombre.');
    const family = input('tf-family') === 'sale' ? 'sale' : 'variable';
    const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
    const result = await _db.from('service_concepts').insert({
      code: `custom_${slug || Date.now()}`,
      name,
      description: input('tf-description').trim() || null,
      billing_family: family,
      vehicle_class: null,
      distance_chargeable: false,
      default_can_be_primary: false,
      default_can_be_secondary: true,
      default_pricing_unit: input('tf-unit'),
      icon: input('tf-icon').trim() || '⚙',
      sort_order: 400,
    }).select().single();
    if (result.error) return formError(result.error.message);
    S.catalog.push(result.data);
    S.catalog.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    close('tariff-small-modal');
    renderStep();
    notify('Concepto creado', 'success');
  }

  function timeInside(value, start, end) {
    if (!value || !start || !end) return false;
    const v = value.slice(0, 5), s = start.slice(0, 5), e = end.slice(0, 5);
    return s <= e ? (v >= s && v <= e) : (v >= s || v <= e);
  }

  function validationRows() {
    const primaries = primaryConfigured();
    const expected = new Set(PRIMARY_CODES);
    const activeCodes = new Set(primaries.map(i => concept(i.concept_id)?.code));
    const missing = [...expected].filter(code => !activeCodes.has(code));
    return [
      { ok: missing.length === 0, text: missing.length ? `Faltan ${missing.length} servicios principales por configurar` : 'Liviano, Semipesado y UML configurados' },
      { ok: primaries.every(i => num(i.primary_price) >= 0 && num(i.extra_km_price) >= 0), text: 'Movidas y valores por KM validados' },
      { ok: secondaryConfigured().every(i => i.pricing_unit !== 'km'), text: 'Los conceptos secundarios no suman kilómetros' },
      { ok: true, text: `${S.billing?.toll_enabled ? 'Peajes habilitados' : 'Peajes no aplicables'}` },
    ];
  }

  const simMap = () => {
    if (!(window.__tcSimVariableQty instanceof Map)) window.__tcSimVariableQty = new Map();
    return window.__tcSimVariableQty;
  };

  function renderSummary(el) {
    injectStyles();
    const primaries = primaryConfigured();
    const secondaries = secondaryConfigured();
    let selected = window.__tcSimPrimary;
    if (!primaries.some(i => i.concept_id === selected)) selected = primaries[0]?.concept_id;
    window.__tcSimPrimary = selected;
    const quantities = simMap();
    const now = new Date();
    const iso = now.toISOString().slice(0, 10);
    const hh = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    el.innerHTML = `<div class="tc-step-title">Resumen y simulador</div><div class="tc-step-sub">Probá la fórmula completa antes de publicar el tarifario.</div>
      <div class="tc-formula"><b>Resultado esperado:</b> Movida + kilómetros facturables + variables seleccionados + peajes. Los secundarios jamás toman la distancia del recorrido.</div>
      <div class="tc-summary-grid"><div>
        <article class="tc-panel"><h4>Estado de la versión</h4><div class="tc-validation" style="margin-top:10px">${validationRows().map(x => `<div class="${x.ok ? 'ok' : 'warn'}">${x.ok ? '✓' : '⚠'} ${x.text}</div>`).join('')}</div></article>
        <article class="tc-panel" style="margin-top:12px"><h4>Configuración</h4><div class="tc-total">
          <div class="tc-total-row"><span>Servicios principales</span><b>${primaries.length}</b></div><div class="tc-total-row"><span>Conceptos variables</span><b>${variableConfigured().length}</b></div><div class="tc-total-row"><span>Ventas</span><b>${saleConfigured().length}</b></div><div class="tc-total-row"><span>Reglas automáticas</span><b>${S.rules.filter(r => r.enabled).length}</b></div>
        </div></article></div>
        <article class="tc-panel"><div class="tc-card-head"><div><h4>Simulador de servicio</h4><div class="tc-muted">La distancia se aplica únicamente al servicio principal.</div></div><span class="tc-pill">Vista previa</span></div>
          ${primaries.length ? `<div class="tc-sim-fields"><div class="tc-field"><label>Servicio principal</label><select class="form-input" id="ts-primary" onchange="seleccionarPrincipalSimulador(this.value)">${primaries.map(i => `<option value="${i.concept_id}" ${selected === i.concept_id ? 'selected' : ''}>${esc(concept(i.concept_id)?.name || i.service_name)}</option>`).join('')}</select></div>
          <div class="tc-field"><label>Fecha</label><input class="form-input" id="ts-date" type="date" value="${iso}"></div><div class="tc-field"><label>Hora</label><input class="form-input" id="ts-time" type="time" value="${hh}"></div><div class="tc-field"><label>Distancia facturable (km)</label><input class="form-input" id="ts-distance" type="number" min="0" step="0.01" value="0"></div><div class="tc-field"><label>Peajes reales</label><input class="form-input" id="ts-toll" type="number" min="0" step="0.01" value="0"></div><label class="tc-check" style="align-self:end;padding-bottom:8px"><input type="checkbox" id="ts-holiday"><span>Es feriado</span></label></div>
          <div class="tc-form-section">Conceptos variables y ventas</div><div class="tc-sim-secondary">${secondaries.filter(i => i.concept_id !== selected).map(i => {
            const qty = quantities.get(i.concept_id) || 0;
            return `<div class="tc-sim-variable-row"><label class="tc-check"><input type="checkbox" ${qty > 0 ? 'checked' : ''} onchange="alternarSecundarioSimulador('${i.concept_id}',this.checked)"><span>${esc(concept(i.concept_id)?.name || i.service_name)}</span></label><input class="form-input" type="number" min="0" step="${i.pricing_unit === 'hour' ? '0.5' : '1'}" value="${qty > 0 ? qty : 1}" ${qty > 0 ? '' : 'disabled'} onchange="cambiarCantidadSecundarioSimulador('${i.concept_id}',this.value)"></div>`;
          }).join('') || '<div class="tc-muted">No hay conceptos secundarios activos.</div>'}</div>
          <div class="tc-actions" style="margin-top:12px"><button class="btn btn-primary" onclick="calcularSimulacionTarifa()">Calcular estimado</button></div><div id="tc-sim-result"></div>` : '<div class="tc-empty" style="margin-top:12px">Configurá los tres servicios principales para simular.</div>'}
        </article></div>`;
  }

  function simPrimary(id) {
    window.__tcSimPrimary = id;
    window.__tcSimVariableQty = new Map();
    renderStep();
  }

  function simSecondary(id, on) {
    const quantities = simMap();
    if (on) quantities.set(id, Math.max(quantities.get(id) || 1, 1));
    else quantities.delete(id);
    renderStep();
  }

  function simQuantity(id, value) {
    const quantities = simMap();
    quantities.set(id, Math.max(num(value), 0.01));
  }

  function ruleCharge(r, components) {
    if (!r?.enabled) return 0;
    const excluded = new Set(S.exceptions.filter(x => x.rule_id === r.rule_id).map(x => x.concept_id));
    const eligible = components.filter(x => !excluded.has(x.conceptId)).reduce((sum, x) => sum + x.value, 0);
    if (!eligible) return 0;
    return r.calculation_mode === 'fixed' ? num(r.amount) : eligible * num(r.amount) / 100;
  }

  function simulate() {
    const primaryId = document.getElementById('ts-primary')?.value;
    if (!primaryId) return;
    const primary = itemFor(primaryId);
    if (!primary) return;
    const date = document.getElementById('ts-date')?.value;
    const time = document.getElementById('ts-time')?.value;
    const distance = num(document.getElementById('ts-distance')?.value);
    const tollInput = num(document.getElementById('ts-toll')?.value);
    const holiday = checked('ts-holiday');
    const primaryName = concept(primaryId)?.name || primary.service_name;
    const billableKm = Math.max(distance - num(primary.included_km), 0);
    const movementValue = num(primary.primary_price);
    const kmValue = billableKm * num(primary.extra_km_price);
    const components = [
      { conceptId: primaryId, name: `${primaryName} · Movida`, value: movementValue, quantity: 1, unit: 'service' },
      { conceptId: primaryId, name: `${primaryName} · Kilómetros`, value: kmValue, quantity: billableKm, unit: 'km' },
    ];

    for (const [id, qty] of simMap()) {
      const item = itemFor(id);
      if (!item) continue;
      const link = S.links.find(x => x.primary_concept_id === primaryId && x.secondary_concept_id === id);
      const unitPrice = link?.price_override != null ? num(link.price_override) : num(item.secondary_price);
      components.push({ conceptId: id, name: concept(id)?.name || item.service_name, value: unitPrice * qty, quantity: qty, unit: item.pricing_unit });
    }

    const charges = [];
    const night = rule('night');
    if (night?.enabled && timeInside(time, night.start_time, night.end_time)) charges.push({ name: 'Recargo nocturno', value: ruleCharge(night, components) });
    const weekend = rule('weekend_holiday');
    const day = new Date(`${date}T12:00:00`).getDay();
    if (weekend?.enabled) {
      const applies = day === 6 ? timeInside(time, weekend.saturday_start, weekend.saturday_end)
        : (day === 0 || holiday) ? timeInside(time, weekend.sunday_holiday_start, weekend.sunday_holiday_end) : false;
      if (applies) charges.push({ name: holiday ? 'Recargo feriado' : 'Recargo fin de semana', value: ruleCharge(weekend, components) });
    }
    const wide = rule('wide_coverage');
    if (wide?.enabled && distance >= num(wide.distance_threshold_km)) charges.push({ name: 'Recargo cobertura amplia', value: ruleCharge(wide, components) });

    let toll = 0;
    if (S.billing?.toll_enabled && S.billing?.toll_invoice_enabled) {
      if (S.billing.toll_mode === 'fixed') toll = num(S.billing.toll_fixed_amount);
      if (S.billing.toll_mode === 'at_cost') toll = tollInput;
    }
    const subtotal = components.reduce((sum, x) => sum + x.value, 0);
    const surcharges = charges.reduce((sum, x) => sum + x.value, 0);
    const total = subtotal + surcharges + toll;
    const copay = S.billing?.copay_enabled ? Math.min(total, S.billing.copay_mode === 'percentage' ? total * num(S.billing.copay_value) / 100 : num(S.billing.copay_value)) : 0;
    const companyTotal = total - copay;
    const out = document.getElementById('tc-sim-result');
    if (!out) return;
    out.innerHTML = `<div class="tc-total">${components.map(x => `<div class="tc-total-row ${x.unit === 'km' && x.value === 0 ? 'subtle' : ''}"><span>${esc(x.name)}${x.quantity !== 1 ? ` × ${num(x.quantity)}` : ''}</span><b>${money(x.value)}</b></div>`).join('')}
      ${charges.filter(x => x.value).map(x => `<div class="tc-total-row"><span>${esc(x.name)}</span><b>${money(x.value)}</b></div>`).join('')}${toll ? `<div class="tc-total-row"><span>Peajes</span><b>${money(toll)}</b></div>` : ''}${copay ? `<div class="tc-total-row"><span>Copago del cliente</span><b>− ${money(copay)}</b></div>` : ''}<div class="tc-total-row final"><span>Total empresa</span><b>${money(companyTotal)}</b></div>${copay ? `<div class="tc-total-row"><span>Total general del servicio</span><b>${money(total)}</b></div>` : ''}</div>`;
  }

  injectStyles();
  Object.assign(T, { renderServices, renderSummary, saveCustomConcept });
  Object.assign(window, {
    buscarConceptoTarifa: searchConcept,
    filtrarConceptoTarifa: filterConcept,
    alternarConceptoComposicion: toggleConcept,
    actualizarComponenteTarifa: updateComponent,
    actualizarUnidadConcepto: updateUnit,
    abrirConceptoPersonalizado: customConcept,
    seleccionarPrincipalSimulador: simPrimary,
    alternarSecundarioSimulador: simSecondary,
    cambiarCantidadSecundarioSimulador: simQuantity,
    calcularSimulacionTarifa: simulate,
  });
})();

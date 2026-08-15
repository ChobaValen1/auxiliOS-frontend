/* AuxiliOS · Tarifas · edición masiva de precios vigentes v1 */
(() => {
  'use strict';

  const states = new Map();
  let observer = null;
  let enhancementQueued = false;

  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const role = () => norm(
    typeof PERFIL_USUARIO === 'undefined'
      ? ''
      : (PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role?.name || PERFIL_USUARIO?.role || PERFIL_USUARIO?.role_name || '')
  );
  const canWrite = () => role() === 'administracion';
  const notify = (message, type = 'info') => typeof toast === 'function'
    ? toast(message, type)
    : console[type === 'error' ? 'error' : 'log'](message);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function injectStyles() {
    if (document.getElementById('company-tariffs-bulk-v1-css')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="company-tariffs-bulk-v1-css">
      .ctb-head-actions{display:flex;align-items:center;gap:6px;margin-left:auto}.ctb-toggle{white-space:nowrap}
      .ctb-editing [data-ct4-edit]{display:none!important}
      .ctb-price-grid{display:grid;grid-template-columns:repeat(2,minmax(76px,1fr));gap:5px;min-width:165px}
      .ctb-price-grid.single{grid-template-columns:minmax(100px,155px);min-width:120px}
      .ctb-field{display:grid;gap:3px;min-width:0}.ctb-field span{font-size:6.8px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
      .ctb-field input{width:100%;height:27px;box-sizing:border-box;padding:0 6px;border:1px solid var(--border2);border-radius:6px;background:var(--bg);color:var(--text);font:inherit;font-size:8.5px;outline:none}
      .ctb-field input:focus{border-color:var(--primary);box-shadow:0 0 0 2px rgba(79,142,247,.12)}
      .ctb-field input.ctb-dirty{border-color:var(--amber);background:var(--amber-lo)}
      .ctb-savebar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 10px;border-top:1px solid var(--border);background:var(--bg)}
      .ctb-savebar>div:first-child{display:grid;gap:2px}.ctb-savebar b{font-size:9px}.ctb-savebar small{font-size:7.5px;color:var(--muted2)}
      .ctb-savebar-actions{display:flex;align-items:center;gap:6px}.ctb-savebar .btn{font-size:8.5px;padding:0 10px;min-height:28px}
      @media(max-width:780px){.ctb-price-grid{grid-template-columns:1fr}.ctb-savebar{align-items:stretch;flex-direction:column}.ctb-savebar-actions{justify-content:flex-end}}
    </style>`);
  }

  function stateFor(instance) {
    let state = states.get(instance.id);
    if (!state || String(state.companyId) !== String(instance.companyId)) {
      state = { companyId: instance.companyId, editing: false, values: new Map(), dirtyKeys: new Set(), saving: false };
      states.set(instance.id, state);
    }
    return state;
  }

  function serviceFor(instance, conceptId) {
    return (instance.data?.services || []).find(service => String(service.concept_id) === String(conceptId));
  }

  function originalValue(service, field) {
    const price = service?.general_price;
    if (!price) return '';
    const value = field === 'movement_price'
      ? price.movement_price
      : field === 'km_price'
        ? price.km_price
        : price.unit_price;
    return value === null || value === undefined ? '' : String(Number(value));
  }

  function normalizedValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const number = Number(raw);
    return Number.isFinite(number) ? number : raw;
  }

  function inputKey(conceptId, field) {
    return `${conceptId}:${field}`;
  }

  function isChanged(service, field, value) {
    return normalizedValue(value) !== normalizedValue(originalValue(service, field));
  }

  function currentInputValue(state, service, field) {
    const key = inputKey(service.concept_id, field);
    return state.values.has(key) ? state.values.get(key) : originalValue(service, field);
  }

  function priceInput(service, field, label, state) {
    const key = inputKey(service.concept_id, field);
    const value = currentInputValue(state, service, field);
    const dirty = state.dirtyKeys.has(key);
    return `<label class="ctb-field"><span>${esc(label)}</span><input type="number" min="0" step="0.01" value="${esc(value)}" class="${dirty ? 'ctb-dirty' : ''}" data-ctb-input data-concept="${esc(service.concept_id)}" data-field="${field}"></label>`;
  }

  function priceEditor(service, state) {
    if (service.distance_chargeable) {
      return `<div class="ctb-price-grid">${priceInput(service, 'movement_price', 'Movida', state)}${priceInput(service, 'km_price', 'KM', state)}</div>`;
    }
    return `<div class="ctb-price-grid single">${priceInput(service, 'unit_price', 'Valor', state)}</div>`;
  }

  function updateSaveBar(instance, state) {
    const bar = instance.root.querySelector('[data-ctb-savebar]');
    if (!bar) return;
    const count = state.dirtyKeys.size;
    const counter = bar.querySelector('[data-ctb-count]');
    const save = bar.querySelector('[data-ctb-save]');
    if (counter) counter.textContent = `${count} celda${count === 1 ? '' : 's'} modificada${count === 1 ? '' : 's'}`;
    if (save) {
      save.disabled = count === 0 || state.saving;
      save.textContent = state.saving ? 'Actualizando…' : `Actualizar (${count})`;
    }
  }

  function onPriceInput(instance, state, input) {
    const conceptId = input.dataset.concept;
    const field = input.dataset.field;
    const service = serviceFor(instance, conceptId);
    if (!service) return;
    const key = inputKey(conceptId, field);
    state.values.set(key, input.value);
    if (isChanged(service, field, input.value)) {
      state.dirtyKeys.add(key);
      input.classList.add('ctb-dirty');
    } else {
      state.dirtyKeys.delete(key);
      state.values.delete(key);
      input.classList.remove('ctb-dirty');
    }
    updateSaveBar(instance, state);
  }

  function renderBulkInputs(instance, state) {
    const table = instance.root.querySelector('.ct4-table');
    if (!table) return;
    instance.root.classList.add('ctb-editing');
    const rows = table.tBodies?.[0]?.rows || [];
    for (const row of rows) {
      const conceptId = row.querySelector('[data-ct4-edit]')?.dataset?.ct4Edit;
      if (!conceptId || !row.cells?.[2]) continue;
      const service = serviceFor(instance, conceptId);
      if (!service) continue;
      row.cells[2].innerHTML = priceEditor(service, state);
    }
    instance.root.querySelectorAll('[data-ctb-input]').forEach(input => {
      input.addEventListener('input', () => onPriceInput(instance, state, input));
    });

    const panel = instance.root.querySelector('.ct4-panel');
    if (panel && !panel.querySelector('[data-ctb-savebar]')) {
      panel.insertAdjacentHTML('beforeend', `<div class="ctb-savebar" data-ctb-savebar><div><b>Edición masiva de precios vigentes</b><small data-ctb-count>0 celdas modificadas</small></div><div class="ctb-savebar-actions"><button class="btn btn-ghost" type="button" data-ctb-discard>Descartar</button><button class="btn btn-primary" type="button" data-ctb-save disabled>Actualizar (0)</button></div></div>`);
      panel.querySelector('[data-ctb-discard]')?.addEventListener('click', () => discard(instance, state));
      panel.querySelector('[data-ctb-save]')?.addEventListener('click', () => saveBulk(instance, state));
    }
    updateSaveBar(instance, state);
  }

  async function discard(instance, state) {
    if (state.saving) return;
    if (state.dirtyKeys.size && !window.confirm('¿Descartar los cambios de tarifas sin guardar?')) return;
    state.editing = false;
    state.values.clear();
    state.dirtyKeys.clear();
    instance.root.classList.remove('ctb-editing');
    await window.AuxiliosCompanyTariffsV4?.reload?.(instance.companyId);
  }

  function payloadForService(instance, state, service) {
    const base = { concept_id: service.concept_id, billing_base_id: null };
    if (service.distance_chargeable) {
      const movement = Number(currentInputValue(state, service, 'movement_price'));
      const km = Number(currentInputValue(state, service, 'km_price'));
      if (!Number.isFinite(movement) || movement < 0 || !Number.isFinite(km) || km < 0) throw new Error(`${service.name}: completá movida y valor por KM con importes válidos.`);
      return { ...base, movement_price: movement, km_price: km };
    }
    const unit = Number(currentInputValue(state, service, 'unit_price'));
    if (!Number.isFinite(unit) || unit < 0) throw new Error(`${service.name}: ingresá un importe válido.`);
    return { ...base, unit_price: unit };
  }

  async function saveBulk(instance, state) {
    if (state.saving || !state.dirtyKeys.size) return;
    const conceptIds = [...new Set([...state.dirtyKeys].map(key => key.split(':')[0]))];
    let prices;
    try {
      prices = conceptIds.map(conceptId => {
        const service = serviceFor(instance, conceptId);
        if (!service) throw new Error('Una tarifa modificada ya no está disponible.');
        return payloadForService(instance, state, service);
      });
    } catch (error) {
      notify(error.message || 'Revisá los importes modificados.', 'error');
      return;
    }

    state.saving = true;
    updateSaveBar(instance, state);
    const result = await _db.rpc('bulk_save_company_service_prices_v1', {
      p_payload: { company_id: instance.companyId, prices }
    });
    state.saving = false;
    if (result.error) {
      updateSaveBar(instance, state);
      notify(result.error.message || 'No se pudieron actualizar las tarifas.', 'error');
      return;
    }

    const count = Number(result.data?.count || prices.length);
    state.editing = false;
    state.values.clear();
    state.dirtyKeys.clear();
    notify(`${count} tarifa${count === 1 ? '' : 's'} actualizada${count === 1 ? '' : 's'} en una sola operación`, 'success');
    await window.AuxiliosCompanyTariffsV4?.reload?.(instance.companyId);
  }

  function toggleEditing(instance, state) {
    if (state.saving) return;
    if (state.editing) return discard(instance, state);
    state.editing = true;
    state.values.clear();
    state.dirtyKeys.clear();
    renderBulkInputs(instance, state);
    enhanceInstance(instance);
  }

  function enhanceInstance(instance) {
    if (!canWrite() || !instance?.root?.isConnected || !instance.companyId || instance.loading || !instance.data) return;
    const panelHead = instance.root.querySelector('.ct4-panel-head');
    const table = instance.root.querySelector('.ct4-table');
    if (!panelHead || !table) return;
    const state = stateFor(instance);

    if (!panelHead.querySelector('[data-ctb-toggle]')) {
      const holder = document.createElement('div');
      holder.className = 'ctb-head-actions';
      holder.innerHTML = '<button class="ct4-action primary ctb-toggle" type="button" data-ctb-toggle>Editar en lote</button>';
      panelHead.appendChild(holder);
      holder.querySelector('[data-ctb-toggle]')?.addEventListener('click', () => toggleEditing(instance, state));
    }

    const toggle = panelHead.querySelector('[data-ctb-toggle]');
    if (toggle) toggle.textContent = state.editing ? 'Salir de edición' : 'Editar en lote';
    if (state.editing && !instance.root.querySelector('[data-ctb-input]')) renderBulkInputs(instance, state);
  }

  function enhanceAll() {
    const module = window.AuxiliosCompanyTariffsV4;
    if (!module?.instances) return;
    for (const instance of module.instances.values()) enhanceInstance(instance);
  }

  function queueEnhancement() {
    if (enhancementQueued) return;
    enhancementQueued = true;
    requestAnimationFrame(() => {
      enhancementQueued = false;
      enhanceAll();
    });
  }

  function init() {
    injectStyles();
    enhanceAll();
    if (!observer) {
      observer = new MutationObserver(queueEnhancement);
      observer.observe(document.body, { childList: true, subtree: true });
    }
    let attempts = 0;
    const retry = setInterval(() => {
      enhanceAll();
      if (window.AuxiliosCompanyTariffsV4?.instances) clearInterval(retry);
      else if (++attempts > 80) clearInterval(retry);
    }, 100);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();

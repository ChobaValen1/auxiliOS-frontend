/* AuxiliOS · Servicios por prestadora v2 · única implementación canónica */
(() => {
  'use strict';

  const S = {
    companyId: null,
    companyConfig: null,
    catalog: [],
    tariffTypes: [],
    busy: false,
    timer: null,
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
  const categoryLabel = value => ({ primary: 'Primario', secondary: 'Secundario', mixed: 'Mixto' }[value] || value || '—');
  const unitLabel = value => ({ service: 'Por servicio', hour: 'Por hora', unit: 'Por unidad', day: 'Por día', fixed: 'Monto fijo', km: 'Por km' }[value] || value || '—');

  function inject() {
    if (!document.getElementById('company-services-configuration-v2-css')) {
      document.head.insertAdjacentHTML('beforeend', `<style id="company-services-configuration-v2-css">
        .csv2-note{padding:10px 12px;border:1px solid rgba(74,144,226,.28);background:rgba(74,144,226,.08);border-radius:9px;font-size:11px;line-height:1.5;color:var(--muted2);margin-bottom:12px}.csv2-note b{color:var(--text)}
        .csv2-list{display:grid;gap:8px}.csv2-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 12px;border:1px solid var(--border);border-radius:9px;background:var(--bg)}
        .csv2-row:hover{border-color:var(--border2)}.csv2-row input{width:17px;height:17px;accent-color:var(--amber)}.csv2-name{font-size:12px;font-weight:700;color:var(--text)}
        .csv2-meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}.csv2-chip{display:inline-flex;align-items:center;padding:3px 7px;border:1px solid var(--border2);border-radius:999px;font-size:9px;color:var(--muted2)}
        .csv2-chip.km{border-color:rgba(46,196,214,.35);color:var(--cyan)}.csv2-chip.kind{border-color:rgba(155,109,255,.32);color:var(--purple)}
        .csv2-state{font-size:9px;color:var(--muted2);white-space:nowrap}.csv2-state.on{color:var(--green)}.csv2-empty{padding:20px;text-align:center;border:1px dashed var(--border2);border-radius:9px;color:var(--muted2);font-size:11px}
        .csv2-km-preview{margin-top:7px;padding:7px 9px;border-radius:7px;border:1px solid var(--border);background:var(--bg);font-size:10px;color:var(--muted2)}.csv2-km-preview strong{color:var(--text)}
        @media(max-width:700px){.csv2-row{grid-template-columns:26px minmax(0,1fr)}.csv2-state{grid-column:2}}
      </style>`);
    }
    if (document.getElementById('modal-company-enabled-services-v2')) return;
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-company-enabled-services-v2">
      <div class="modal-box" style="width:min(760px,calc(100vw - 24px));max-width:760px">
        <div class="modal-head"><div><span class="modal-head-title">Servicios habilitados</span><div style="font-size:10px;color:var(--muted2);margin-top:3px">Selección por prestadora</div></div><button class="modal-close" onclick="closeModal('modal-company-enabled-services-v2')">×</button></div>
        <div class="modal-body" style="max-height:min(70vh,680px);overflow:auto">
          <div class="csv2-note"><b>Acá no se crean servicios.</b> El catálogo maestro se administra en <strong>Configuración → Tipos de servicio</strong>. Acá únicamente definís cuáles usa esta prestadora.</div>
          <div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button class="btn btn-ghost" type="button" id="csv2-go-types">Abrir Tipos de servicio</button></div>
          <div id="csv2-list" class="csv2-list"><div class="csv2-empty">Cargando servicios…</div></div>
          <div class="modal-error" id="csv2-error" style="display:none"></div>
        </div>
        <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal('modal-company-enabled-services-v2')">Cancelar</button><button class="btn btn-primary" id="csv2-save">Guardar servicios habilitados</button></div>
      </div>
    </div>`);
    document.getElementById('csv2-go-types')?.addEventListener('click', () => {
      if (typeof closeModal === 'function') closeModal('modal-company-enabled-services-v2');
      if (typeof goTo === 'function') goTo('config-service-types');
    });
    document.getElementById('csv2-save')?.addEventListener('click', saveEnabledServices);
  }

  function resolveCompanyId(explicit = null) {
    return explicit || S.companyId || window.__auxCompanySelected || document.getElementById('tmv3-company')?.value || null;
  }

  async function load(companyId = null) {
    const id = resolveCompanyId(companyId);
    if (!id) throw new Error('Seleccioná una prestadora.');
    const [configuration, services, types] = await Promise.all([
      _db.rpc('get_company_configuration_v2', { p_company_id: id }),
      _db.rpc('list_service_types_config', { p_include_inactive: true }),
      _db.rpc('list_tariff_types_config'),
    ]);
    if (configuration.error) throw configuration.error;
    if (services.error) throw services.error;
    if (types.error) throw types.error;
    S.companyId = id;
    S.companyConfig = configuration.data || { services: [] };
    S.catalog = Array.isArray(services.data) ? services.data : [];
    S.tariffTypes = Array.isArray(types.data) ? types.data : [];
    return S;
  }

  const companyServiceMap = () => new Map((S.companyConfig?.services || []).map(item => [String(item.concept_id), item]));

  function renderPicker() {
    const box = document.getElementById('csv2-list');
    if (!box) return;
    const settings = companyServiceMap();
    const active = S.catalog.filter(item => item.is_active !== false);
    box.innerHTML = active.length ? active.map(service => {
      const current = settings.get(String(service.concept_id)) || {};
      const enabled = current.is_enabled === true;
      const typeNames = (service.tariff_types || []).map(item => item.name).filter(Boolean).join(' · ');
      return `<label class="csv2-row" data-service-id="${esc(service.concept_id)}">
        <input type="checkbox" data-csv2-enabled="${esc(service.concept_id)}" ${enabled ? 'checked' : ''}>
        <span><span class="csv2-name">${esc(service.name)}</span><span class="csv2-meta"><span class="csv2-chip kind">${esc(categoryLabel(service.category))}</span>${typeNames ? `<span class="csv2-chip">${esc(typeNames)}</span>` : ''}<span class="csv2-chip">${esc(unitLabel(service.pricing_unit))}</span><span class="csv2-chip ${service.distance_chargeable ? 'km' : ''}">${service.distance_chargeable ? 'Suma KM' : 'No suma KM'}</span></span></span>
        <span class="csv2-state ${enabled ? 'on' : ''}">${enabled ? 'Habilitado' : 'No habilitado'}</span>
      </label>`;
    }).join('') : '<div class="csv2-empty">No existen Tipos de servicio activos.</div>';
  }

  function setError(message = '') {
    const el = document.getElementById('csv2-error');
    if (!el) return;
    el.textContent = message;
    el.style.display = message ? 'block' : 'none';
  }

  async function open(companyId = null) {
    if (!canWrite()) return notify('Solo Administración puede modificar los servicios habilitados', 'error');
    inject();
    setError('');
    document.getElementById('csv2-list').innerHTML = '<div class="csv2-empty">Cargando servicios…</div>';
    if (typeof openModal === 'function') openModal('modal-company-enabled-services-v2');
    try {
      await load(companyId);
      renderPicker();
    } catch (error) {
      setError(error?.message || 'No se pudieron cargar los servicios.');
    }
  }

  async function saveEnabledServices() {
    if (!canWrite() || !S.companyId || S.busy) return;
    const button = document.getElementById('csv2-save');
    const settings = companyServiceMap();
    const active = S.catalog.filter(item => item.is_active !== false);
    S.busy = true;
    setError('');
    if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
    try {
      for (const service of active) {
        const current = settings.get(String(service.concept_id)) || {};
        const enabled = Boolean(document.querySelector(`[data-csv2-enabled="${CSS.escape(String(service.concept_id))}"]`)?.checked);
        const { error } = await _db.rpc('save_company_service_setting_v2', { p_payload: {
          company_id: S.companyId,
          concept_id: service.concept_id,
          is_enabled: enabled,
          external_code: current.external_code || null,
          code_mode: current.code_mode || 'fixed',
          notes: current.notes || null,
        }});
        if (error) throw error;
      }
      if (typeof closeModal === 'function') closeModal('modal-company-enabled-services-v2');
      notify('Servicios habilitados actualizados', 'success');
      S.companyConfig = null;
      if (typeof window.cargarEmpresasV2 === 'function') await window.cargarEmpresasV2();
      if (S.companyId && typeof window.seleccionarEmpresaV2 === 'function') await window.seleccionarEmpresaV2(S.companyId);
      window.AuxiliosBillingParametersV3?.refreshTariffs?.();
      schedulePatch();
    } catch (error) {
      setError(error?.message || 'No se pudieron guardar los servicios.');
    } finally {
      S.busy = false;
      if (button) { button.disabled = false; button.textContent = 'Guardar servicios habilitados'; }
    }
  }

  async function patchServicesTab(root) {
    const section = [...root.querySelectorAll('.empv2-section-card')].find(item => item.querySelector('h3')?.textContent.trim() === 'Servicios habilitados');
    if (!section) return;
    const grid = section.querySelector('.empv2-service-grid');
    if (!grid || !S.companyId) return;
    try {
      if (!S.companyConfig || !S.catalog.length) await load(S.companyId);
      const settings = companyServiceMap();
      const enabled = S.catalog.filter(service => service.is_active !== false && settings.get(String(service.concept_id))?.is_enabled === true);
      const signature = enabled.map(item => `${item.concept_id}:${item.distance_chargeable}`).join('|');
      if (grid.dataset.csv2Signature === signature) return;
      const desc = section.querySelector('.empv2-section-head p');
      if (desc) desc.textContent = 'Servicios del catálogo maestro habilitados para esta prestadora. Las tarifas se administran después.';
      const action = section.querySelector('.empv2-section-head button');
      if (action) { action.textContent = 'Seleccionar servicios'; action.onclick = () => open(S.companyId); }
      grid.innerHTML = enabled.length ? enabled.map(service => `<article><span>⚙</span><div><b>${esc(service.name)}</b><small>${esc(categoryLabel(service.category))} · ${service.distance_chargeable ? 'Suma KM' : 'No suma KM'}</small></div><em class="ok">Habilitado</em></article>`).join('') : '<div class="empv2-empty">No hay servicios habilitados para esta prestadora.</div>';
      grid.dataset.csv2Signature = signature;
    } catch (error) {
      console.warn('[servicios prestadora v2]', error);
    }
  }

  async function patchServiceTypeEditor() {
    const category = document.getElementById('crs-category');
    const tariff = document.getElementById('crs-tariff-type');
    if (!category || !tariff) return;
    ['crs-name','crs-code','crs-icon','crs-description','crs-category','crs-tariff-type','crs-unit','crs-active'].forEach(id => {
      const el = document.getElementById(id); if (el && canWrite()) el.disabled = false;
    });
    const label = category.closest('.form-group')?.querySelector('.form-label');
    if (label) label.textContent = 'Carácter del servicio';
    if (!document.getElementById('csv2-km-preview')) {
      const preview = document.createElement('div');
      preview.id = 'csv2-km-preview'; preview.className = 'csv2-km-preview';
      tariff.closest('.form-group')?.appendChild(preview);
    }
    if (!tariff.dataset.csv2Reactive) {
      tariff.dataset.csv2Reactive = '1';
      tariff.addEventListener('change', updateKmPreview);
    }
    if (!S.tariffTypes.length) {
      const types = await _db.rpc('list_tariff_types_config');
      if (!types.error) S.tariffTypes = Array.isArray(types.data) ? types.data : [];
    }
    updateKmPreview();
  }

  function updateKmPreview() {
    const tariff = document.getElementById('crs-tariff-type');
    const preview = document.getElementById('csv2-km-preview');
    if (!tariff || !preview) return;
    const type = S.tariffTypes.find(item => String(item.tariff_type_id) === String(tariff.value));
    preview.innerHTML = type?.adds_km
      ? '<strong>Suma KM: Sí.</strong> Este servicio habilita componentes de kilometraje.'
      : '<strong>Suma KM: No.</strong> Este servicio no agrega kilometraje.';
  }

  function installEditorWrappers() {
    const openService = window.abrirTipoServicioConfig;
    if (typeof openService === 'function' && !openService.__csv2Wrapped) {
      const wrapped = function(id = null, ...args) {
        S.serviceEditId = id || null;
        const result = openService.apply(this, [id, ...args]);
        setTimeout(patchServiceTypeEditor, 0);
        return result;
      };
      wrapped.__csv2Wrapped = true;
      window.abrirTipoServicioConfig = wrapped;
    }
    const saveService = window.guardarTipoServicioConfig;
    if (typeof saveService === 'function' && !saveService.__csv2Wrapped) {
      const wrapped = async function(...args) {
        if (S.serviceEditId) {
          const code = String(document.getElementById('crs-code')?.value || '').trim().toLowerCase();
          if (!code) return;
          const update = await _db.from('service_concepts').update({ code }).eq('concept_id', S.serviceEditId);
          if (update.error) return notify(update.error.message, 'error');
        }
        const result = await saveService.apply(this, args);
        S.serviceEditId = null;
        return result;
      };
      wrapped.__csv2Wrapped = true;
      window.guardarTipoServicioConfig = wrapped;
    }
    const openTariff = window.abrirTipoTarifaConfig;
    if (typeof openTariff === 'function' && !openTariff.__csv2Wrapped) {
      const wrapped = function(id = null, ...args) {
        S.tariffTypeEditId = id || null;
        const result = openTariff.apply(this, [id, ...args]);
        setTimeout(() => {
          ['crt-name','crt-code','crt-description','crt-order','crt-adds-km','crt-active'].forEach(id => {
            const el = document.getElementById(id); if (el && canWrite()) el.disabled = false;
          });
        }, 0);
        return result;
      };
      wrapped.__csv2Wrapped = true;
      window.abrirTipoTarifaConfig = wrapped;
    }
    const saveTariff = window.guardarTipoTarifaConfig;
    if (typeof saveTariff === 'function' && !saveTariff.__csv2Wrapped) {
      const wrapped = async function(...args) {
        if (S.tariffTypeEditId) {
          const code = String(document.getElementById('crt-code')?.value || '').trim().toLowerCase();
          if (!code) return;
          const update = await _db.from('tariff_types').update({ code }).eq('tariff_type_id', S.tariffTypeEditId);
          if (update.error) return notify(update.error.message, 'error');
        }
        const result = await saveTariff.apply(this, args);
        S.tariffTypeEditId = null;
        return result;
      };
      wrapped.__csv2Wrapped = true;
      window.guardarTipoTarifaConfig = wrapped;
    }
  }

  function patch() {
    inject();
    installEditorWrappers();
    patchServiceTypeEditor();
    const root = document.getElementById('empv2-root');
    if (root) patchServicesTab(root);
  }

  function schedulePatch() {
    clearTimeout(S.timer);
    S.timer = setTimeout(patch, 60);
  }

  function installCompanyHook() {
    const selection = window.seleccionarEmpresaV2;
    if (typeof selection !== 'function' || selection.__csv2Wrapped) return;
    const wrapped = async function(companyId, ...args) {
      if (companyId) { S.companyId = companyId; S.companyConfig = null; S.catalog = []; }
      const result = await selection.apply(this, [companyId, ...args]);
      schedulePatch();
      return result;
    };
    wrapped.__csv2Wrapped = true;
    window.seleccionarEmpresaV2 = wrapped;
    if (window.seleccionarEmpresa === selection) window.seleccionarEmpresa = wrapped;
  }

  function init() {
    inject();
    let attempts = 0;
    const timer = setInterval(() => {
      installCompanyHook();
      installEditorWrappers();
      patch();
      if (++attempts > 70 || (window.seleccionarEmpresaV2 && window.abrirTipoServicioConfig)) clearInterval(timer);
    }, 200);
    new MutationObserver(schedulePatch).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('change', event => {
      if (!event.target?.matches?.('[data-csv2-enabled]')) return;
      const state = event.target.closest('.csv2-row')?.querySelector('.csv2-state');
      if (state) { state.textContent = event.target.checked ? 'Habilitado' : 'No habilitado'; state.classList.toggle('on', event.target.checked); }
    });
  }

  Object.assign(window, {
    abrirServiciosEmpresaV2: companyId => open(companyId || S.companyId),
    abrirServiciosPrestadoraConfig: companyId => open(companyId || S.companyId),
  });
  window.AuxiliosCompanyServicesV2 = { open, load };

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();
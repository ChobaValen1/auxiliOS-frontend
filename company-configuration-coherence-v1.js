/* AuxiliOS · Coherencia de configuración de prestadoras v1 */
(() => {
  'use strict';

  const S = {
    companyId: null,
    companyConfig: null,
    serviceCatalog: [],
    tariffTypes: [],
    busy: false,
    patching: false,
    timer: null,
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
    if (!document.getElementById('company-configuration-coherence-css')) {
      document.head.insertAdjacentHTML('beforeend', `<style id="company-configuration-coherence-css">
        .cc-note{padding:10px 12px;border:1px solid rgba(74,144,226,.28);background:rgba(74,144,226,.08);border-radius:9px;font-size:11px;line-height:1.5;color:var(--muted2);margin-bottom:12px}.cc-note b{color:var(--text)}
        .cc-service-list{display:grid;gap:8px}.cc-service-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 12px;border:1px solid var(--border);border-radius:9px;background:var(--bg)}
        .cc-service-row:hover{border-color:var(--border2)}.cc-service-row input{width:17px;height:17px;accent-color:var(--amber)}.cc-service-name{font-size:12px;font-weight:700;color:var(--text)}
        .cc-service-meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}.cc-chip{display:inline-flex;align-items:center;padding:3px 7px;border:1px solid var(--border2);border-radius:999px;font-size:9px;color:var(--muted2)}
        .cc-chip.km{border-color:rgba(46,196,214,.35);color:var(--cyan)}.cc-chip.kind{border-color:rgba(155,109,255,.32);color:var(--purple)}
        .cc-service-state{font-size:9px;color:var(--muted2);white-space:nowrap}.cc-service-state.on{color:var(--green)}
        .cc-toll-panel{grid-column:1/-1;margin-top:-2px;padding:9px 11px;border:1px solid var(--border);border-radius:8px;background:var(--bg);font-size:10px;line-height:1.45;color:var(--muted2)}
        .cc-toll-panel b{display:block;color:var(--text);font-size:10px;margin-bottom:2px}.cc-toll-panel.route{border-color:rgba(46,196,214,.3)}.cc-toll-panel.manual{border-color:rgba(245,166,35,.3)}.cc-toll-panel.off{border-color:rgba(90,98,120,.35)}
        .cc-service-km-preview{margin-top:7px;padding:7px 9px;border-radius:7px;border:1px solid var(--border);background:var(--bg);font-size:10px;color:var(--muted2)}.cc-service-km-preview strong{color:var(--text)}
        .cc-provider-empty{padding:20px;text-align:center;border:1px dashed var(--border2);border-radius:9px;color:var(--muted2);font-size:11px}
        @media(max-width:700px){.cc-service-row{grid-template-columns:26px minmax(0,1fr)}.cc-service-state{grid-column:2}}
      </style>`);
    }

    if (!document.getElementById('modal-company-enabled-services-v1')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-backdrop" id="modal-company-enabled-services-v1">
          <div class="modal-box" style="width:min(760px,calc(100vw - 24px));max-width:760px">
            <div class="modal-head"><div><span class="modal-head-title">Servicios habilitados</span><div style="font-size:10px;color:var(--muted2);margin-top:3px">Selección por prestadora</div></div><button class="modal-close" onclick="closeModal('modal-company-enabled-services-v1')">×</button></div>
            <div class="modal-body" style="max-height:min(70vh,680px);overflow:auto">
              <div class="cc-note"><b>Acá no se crean servicios.</b> Los servicios se crean y definen en <strong>Configuración → Tipos de servicio</strong>. En esta pantalla solo elegís cuáles son válidos para la prestadora seleccionada. La tarifa se carga después.</div>
              <div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button class="btn btn-ghost" type="button" id="cc-go-service-types">Abrir Tipos de servicio</button></div>
              <div id="cc-provider-services" class="cc-service-list"><div class="cc-provider-empty">Cargando servicios…</div></div>
              <div class="modal-error" id="cc-provider-services-error" style="display:none"></div>
            </div>
            <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal('modal-company-enabled-services-v1')">Cancelar</button><button class="btn btn-primary" id="cc-provider-services-save">Guardar servicios habilitados</button></div>
          </div>
        </div>`);
      document.getElementById('cc-go-service-types')?.addEventListener('click', () => {
        if (typeof closeModal === 'function') closeModal('modal-company-enabled-services-v1');
        if (typeof goTo === 'function') goTo('config-service-types');
      });
      document.getElementById('cc-provider-services-save')?.addEventListener('click', saveEnabledServices);
    }
  }

  function resolveCompanyId(explicit = null) {
    return explicit
      || S.companyId
      || document.getElementById('cr-matrix-company')?.value
      || window.TariffMatrixV3?.state?.companyId
      || null;
  }

  async function loadCompanyContext(companyId) {
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
    S.companyConfig = configuration.data || { services: [], bases: [] };
    S.serviceCatalog = Array.isArray(services.data) ? services.data : [];
    S.tariffTypes = Array.isArray(types.data) ? types.data : [];
    return S.companyConfig;
  }

  function companyServiceMap() {
    return new Map((S.companyConfig?.services || []).map(item => [String(item.concept_id), item]));
  }

  function renderEnabledServicesPicker() {
    const box = document.getElementById('cc-provider-services');
    if (!box) return;
    const settings = companyServiceMap();
    const catalog = S.serviceCatalog.filter(item => item.is_active !== false);
    box.innerHTML = catalog.length ? catalog.map(service => {
      const current = settings.get(String(service.concept_id)) || {};
      const enabled = current.is_enabled === true;
      const typeNames = (service.tariff_types || []).map(item => item.name).filter(Boolean).join(' · ');
      return `<label class="cc-service-row" data-service-id="${esc(service.concept_id)}">
        <input type="checkbox" data-cc-service-enabled="${esc(service.concept_id)}" ${enabled ? 'checked' : ''}>
        <span><span class="cc-service-name">${esc(service.name)}</span><span class="cc-service-meta"><span class="cc-chip kind">${esc(categoryLabel(service.category))}</span>${typeNames ? `<span class="cc-chip">${esc(typeNames)}</span>` : ''}<span class="cc-chip">${esc(unitLabel(service.pricing_unit))}</span><span class="cc-chip ${service.distance_chargeable ? 'km' : ''}">${service.distance_chargeable ? 'Suma KM' : 'No suma KM'}</span></span></span>
        <span class="cc-service-state ${enabled ? 'on' : ''}">${enabled ? 'Habilitado' : 'No habilitado'}</span>
      </label>`;
    }).join('') : '<div class="cc-provider-empty">No existen Tipos de servicio activos. Crealos primero desde Configuración → Tipos de servicio.</div>';
  }

  function setProviderError(message = '') {
    const el = document.getElementById('cc-provider-services-error');
    if (!el) return;
    el.textContent = message;
    el.style.display = message ? 'block' : 'none';
  }

  async function openEnabledServices(companyId = null) {
    if (!canWrite()) return notify('Solo Administración puede modificar los servicios habilitados', 'error');
    inject();
    setProviderError('');
    document.getElementById('cc-provider-services').innerHTML = '<div class="cc-provider-empty">Cargando servicios…</div>';
    try {
      await loadCompanyContext(companyId);
      renderEnabledServicesPicker();
      if (typeof openModal === 'function') openModal('modal-company-enabled-services-v1');
      else document.getElementById('modal-company-enabled-services-v1')?.classList.add('open');
    } catch (error) {
      setProviderError(error?.message || 'No se pudieron cargar los servicios.');
      if (typeof openModal === 'function') openModal('modal-company-enabled-services-v1');
    }
  }

  async function saveEnabledServices() {
    if (!canWrite() || !S.companyId || S.busy) return;
    const button = document.getElementById('cc-provider-services-save');
    const settings = companyServiceMap();
    const active = S.serviceCatalog.filter(item => item.is_active !== false);
    S.busy = true;
    setProviderError('');
    if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
    try {
      for (const service of active) {
        const current = settings.get(String(service.concept_id)) || {};
        const enabled = Boolean(document.querySelector(`[data-cc-service-enabled="${CSS.escape(String(service.concept_id))}"]`)?.checked);
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
      if (typeof closeModal === 'function') closeModal('modal-company-enabled-services-v1');
      notify('Servicios habilitados actualizados', 'success');
      await refreshCompanyViews();
    } catch (error) {
      setProviderError(error?.message || 'No se pudieron guardar los servicios.');
    } finally {
      S.busy = false;
      if (button) { button.disabled = false; button.textContent = 'Guardar servicios habilitados'; }
    }
  }

  async function refreshCompanyViews() {
    const id = S.companyId;
    if (typeof window.cambiarEmpresaTarifasConfig === 'function' && document.getElementById('cr-matrix-company')) {
      const selected = document.getElementById('cr-matrix-company')?.value;
      if (String(selected || '') === String(id || '')) await window.cambiarEmpresaTarifasConfig(id);
    }
    if (typeof window.cargarEmpresasV2 === 'function') await window.cargarEmpresasV2();
    if (id && typeof window.seleccionarEmpresaV2 === 'function') await window.seleccionarEmpresaV2(id);
    schedulePatch();
  }

  function patchCompanyNavigation(root) {
    if (!root) return;
    root.querySelectorAll('.empv2-tabs button').forEach(button => {
      const text = button.textContent.trim();
      if (text === 'Reglas y parámetros') button.remove();
      if (text === 'Bases y facturación') button.textContent = 'Parámetros de facturación';
    });
    root.querySelectorAll('.empv2-feature-card').forEach(card => {
      const title = card.querySelector('h3');
      if (!title) return;
      if (title.textContent.trim() === 'Reglas y parámetros') { card.remove(); return; }
      if (title.textContent.trim() === 'Bases y facturación') {
        title.textContent = 'Parámetros de facturación';
        const p = card.querySelector('p');
        if (p) p.textContent = 'Bases habilitadas, recorrido, peajes y vigencia comercial.';
      }
    });
    root.querySelectorAll('.empv2-section-card').forEach(section => {
      const title = section.querySelector('h3');
      if (title?.textContent.trim() === 'Bases y facturación') title.textContent = 'Parámetros de facturación';
    });
    root.querySelectorAll('.empv2-rule-grid').forEach(grid => grid.closest('.empv2-section-card')?.remove());
  }

  async function patchServicesTab(root) {
    const section = [...root.querySelectorAll('.empv2-section-card')]
      .find(item => item.querySelector('h3')?.textContent.trim() === 'Servicios habilitados');
    if (!section || !S.companyId) return;
    const grid = section.querySelector('.empv2-service-grid');
    if (!grid) return;
    try {
      if (!S.companyConfig || !S.serviceCatalog.length) await loadCompanyContext(S.companyId);
      const settings = companyServiceMap();
      const enabled = S.serviceCatalog.filter(service => service.is_active !== false && settings.get(String(service.concept_id))?.is_enabled === true);
      const signature = enabled.map(item => `${item.concept_id}:${item.distance_chargeable}`).join('|');
      if (grid.dataset.ccSignature === signature) return;
      const desc = section.querySelector('.empv2-section-head p');
      if (desc) desc.textContent = 'Servicios creados en Tipos de servicio que esta prestadora tiene habilitados. Las tarifas se asignan después.';
      const action = section.querySelector('.empv2-section-head button');
      if (action) action.textContent = 'Seleccionar servicios';
      grid.innerHTML = enabled.length ? enabled.map(service => `<article><span>⚙</span><div><b>${esc(service.name)}</b><small>${esc(categoryLabel(service.category))} · ${service.distance_chargeable ? 'Suma KM' : 'No suma KM'}</small></div><em class="ok">Habilitado</em></article>`).join('') : '<div class="empv2-empty">No hay servicios habilitados para esta prestadora. Seleccionalos desde este módulo; si falta uno, primero crealo en Tipos de servicio.</div>';
      grid.dataset.ccSignature = signature;
    } catch (error) {
      console.warn('[coherencia config] servicios:', error);
    }
  }

  function patchBillingModal() {
    const modal = document.getElementById('modal-company-billing');
    if (!modal) return;
    const title = modal.querySelector('.modal-head-title');
    if (title && title.textContent !== 'Parámetros de facturación') title.textContent = 'Parámetros de facturación';
    modal.querySelectorAll('.cb-title').forEach(el => {
      if (el.textContent.trim() === 'Regla de la empresa') el.textContent = 'Recorrido y peajes';
      if (el.textContent.trim() === 'Bases habilitadas') el.textContent = 'Bases habilitadas para esta prestadora';
    });
    const toll = document.getElementById('cb-tolls');
    if (toll && !toll.dataset.ccReactive) {
      toll.dataset.ccReactive = '1';
      toll.addEventListener('change', renderTollMode);
    }
    renderTollMode();
  }

  function renderTollMode() {
    const select = document.getElementById('cb-tolls');
    if (!select) return;
    let panel = document.getElementById('cc-toll-mode-panel');
    const group = select.closest('.form-group');
    if (!panel && group) {
      panel = document.createElement('div');
      panel.id = 'cc-toll-mode-panel';
      panel.className = 'cc-toll-panel';
      group.parentElement?.insertAdjacentElement('afterend', panel);
    }
    if (!panel) return;
    const mode = select.value;
    if (mode === 'manual') {
      panel.className = 'cc-toll-panel manual';
      panel.innerHTML = '<b>Carga real / comprobante</b>El peaje se registra durante el servicio con el importe real. No se utiliza una estimación automática de ruta.';
    } else if (mode === 'not_applicable') {
      panel.className = 'cc-toll-panel off';
      panel.innerHTML = '<b>No corresponde</b>AuxiliOS no debe solicitar ni incorporar peajes para los servicios de esta prestadora.';
    } else {
      panel.className = 'cc-toll-panel route';
      panel.innerHTML = '<b>Estimación automática por ruta</b>AuxiliOS toma el recorrido calculado como referencia para peajes. El operador no tiene que definir un importe estimado en esta configuración.';
    }
  }

  async function loadTariffTypesForPreview() {
    if (S.tariffTypes.length) return S.tariffTypes;
    const result = await _db.rpc('list_tariff_types_config');
    if (!result.error) S.tariffTypes = Array.isArray(result.data) ? result.data : [];
    return S.tariffTypes;
  }

  async function patchServiceTypeEditor() {
    const category = document.getElementById('crs-category');
    const tariff = document.getElementById('crs-tariff-type');
    if (!category || !tariff) return;
    const categoryLabelNode = category.closest('.form-group')?.querySelector('.form-label');
    if (categoryLabelNode && categoryLabelNode.textContent.trim() === 'Categoría') categoryLabelNode.textContent = 'Carácter del servicio';
    if (!document.getElementById('cc-service-km-preview')) {
      const preview = document.createElement('div');
      preview.id = 'cc-service-km-preview';
      preview.className = 'cc-service-km-preview';
      tariff.closest('.form-group')?.appendChild(preview);
    }
    if (!tariff.dataset.ccReactive) {
      tariff.dataset.ccReactive = '1';
      tariff.addEventListener('change', updateServiceKmPreview);
    }
    await loadTariffTypesForPreview();
    updateServiceKmPreview();
  }

  function updateServiceKmPreview() {
    const tariff = document.getElementById('crs-tariff-type');
    const preview = document.getElementById('cc-service-km-preview');
    if (!tariff || !preview) return;
    const type = S.tariffTypes.find(item => String(item.tariff_type_id) === String(tariff.value));
    preview.innerHTML = type?.adds_km
      ? '<strong>Suma KM: Sí.</strong> Este tipo de servicio habilita componentes de kilometraje.'
      : '<strong>Suma KM: No.</strong> Este tipo de servicio se factura sin agregar kilometraje.';
  }

  function patchLegacyTariffScreen() {
    const base = document.getElementById('cr-matrix-base');
    if (base) {
      const blank = [...base.options].find(option => option.value === '');
      if (blank) { blank.textContent = 'Seleccionar base'; blank.disabled = true; }
    }
    document.querySelectorAll('#cr-matrix-body tr.disabled').forEach(row => row.remove());
    const providerButton = document.querySelector('#screen-config-tariff-matrix .cr-head button[onclick*="abrirServiciosPrestadoraConfig"]');
    if (providerButton) providerButton.textContent = '⚙ Servicios habilitados';
  }

  function removeLegacyCommercialDuplicate() {
    document.querySelectorAll('#emp-detail .emp-detail').forEach(detail => {
      [...detail.querySelectorAll('section,div')].forEach(node => {
        const heading = node.querySelector?.(':scope > .tc-embedded-head, :scope > .tc-head');
        const text = heading?.textContent || '';
        if (/Motor tarifario|reglas de facturación/i.test(text) && !node.classList.contains('empv2-section-card')) node.remove();
      });
    });
  }

  function patchAll() {
    if (S.patching) return;
    S.patching = true;
    try {
      inject();
      const root = document.getElementById('empv2-root');
      if (root) {
        patchCompanyNavigation(root);
        patchServicesTab(root);
      }
      patchBillingModal();
      patchServiceTypeEditor();
      patchLegacyTariffScreen();
      removeLegacyCommercialDuplicate();
    } finally {
      S.patching = false;
    }
  }

  function schedulePatch() {
    clearTimeout(S.timer);
    S.timer = setTimeout(patchAll, 50);
  }

  function installWrappers() {
    const selection = window.seleccionarEmpresaV2;
    if (typeof selection === 'function' && !selection.__ccWrapped) {
      const wrapped = async function(companyId, ...args) {
        if (companyId) { S.companyId = companyId; S.companyConfig = null; S.serviceCatalog = []; }
        const result = await selection.apply(this, [companyId, ...args]);
        schedulePatch();
        return result;
      };
      wrapped.__ccWrapped = true;
      window.seleccionarEmpresaV2 = wrapped;
      if (window.seleccionarEmpresa === selection) window.seleccionarEmpresa = wrapped;
    }

    const tab = window.abrirTabEmpresaV2;
    if (typeof tab === 'function' && !tab.__ccWrapped) {
      const wrapped = function(name, ...args) {
        const target = name === 'rules' ? 'bases' : name;
        const result = tab.apply(this, [target, ...args]);
        schedulePatch();
        return result;
      };
      wrapped.__ccWrapped = true;
      window.abrirTabEmpresaV2 = wrapped;
    }

    window.abrirServiciosEmpresaV2 = companyId => openEnabledServices(companyId || S.companyId);
    window.abrirServiciosPrestadoraConfig = companyId => openEnabledServices(companyId || document.getElementById('cr-matrix-company')?.value || S.companyId);
  }

  function init() {
    inject();
    let attempts = 0;
    const installTimer = setInterval(() => {
      installWrappers();
      patchAll();
      if (++attempts > 60 || (window.seleccionarEmpresaV2 && window.abrirTabEmpresaV2 && document.getElementById('modal-company-billing'))) clearInterval(installTimer);
    }, 200);
    const observer = new MutationObserver(schedulePatch);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('change', event => {
      if (event.target?.matches?.('[data-cc-service-enabled]')) {
        const row = event.target.closest('.cc-service-row');
        const state = row?.querySelector('.cc-service-state');
        if (state) { state.textContent = event.target.checked ? 'Habilitado' : 'No habilitado'; state.classList.toggle('on', event.target.checked); }
      }
    });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();
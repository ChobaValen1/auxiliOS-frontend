/* AuxiliOS · Servicios habilitados por prestadora v3 · solo allowlist */
(() => {
  'use strict';

  const S = {
    companyId: null,
    companyConfig: null,
    catalog: [],
    busy: false,
    timer: null,
  };

  const normalizeRole = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const profile = () => (typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : (window.PERFIL_USUARIO || {}));
  const role = () => normalizeRole(profile()?.roles?.name || profile()?.role?.name || profile()?.role || profile()?.role_name || '');
  const canWrite = () => role() === 'administracion';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const notify = (message, type = 'info') => typeof toast === 'function' ? toast(message, type) : console[type === 'error' ? 'error' : 'log'](message);
  const categoryLabel = value => ({ primary: 'Primario', secondary: 'Secundario', mixed: 'Mixto' }[value] || value || '—');
  const unitLabel = value => ({ service: 'Por servicio', hour: 'Por hora', unit: 'Por unidad', day: 'Por día', fixed: 'Monto fijo', km: 'Por km' }[value] || value || '—');

  function inject() {
    if (!document.getElementById('company-services-configuration-v3-css')) {
      document.head.insertAdjacentHTML('beforeend', `<style id="company-services-configuration-v3-css">
        .csv3-note{padding:10px 12px;border:1px solid rgba(74,144,226,.28);background:rgba(74,144,226,.08);border-radius:9px;font-size:11px;line-height:1.5;color:var(--muted2);margin-bottom:12px}.csv3-note b{color:var(--text)}
        .csv3-list{display:grid;gap:8px}.csv3-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 12px;border:1px solid var(--border);border-radius:9px;background:var(--bg)}.csv3-row:hover{border-color:var(--border2)}.csv3-row input{width:17px;height:17px;accent-color:var(--amber)}
        .csv3-name{font-size:12px;font-weight:700;color:var(--text)}.csv3-meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}.csv3-chip{display:inline-flex;align-items:center;padding:3px 7px;border:1px solid var(--border2);border-radius:999px;font-size:9px;color:var(--muted2)}.csv3-chip.km{border-color:rgba(46,196,214,.35);color:var(--cyan)}.csv3-chip.kind{border-color:rgba(155,109,255,.32);color:var(--purple)}
        .csv3-state{font-size:9px;color:var(--muted2);white-space:nowrap}.csv3-state.on{color:var(--green)}.csv3-empty{padding:20px;text-align:center;border:1px dashed var(--border2);border-radius:9px;color:var(--muted2);font-size:11px}
        @media(max-width:700px){.csv3-row{grid-template-columns:26px minmax(0,1fr)}.csv3-state{grid-column:2}}
      </style>`);
    }
    document.getElementById('modal-company-enabled-services-v2')?.remove();
    if (document.getElementById('modal-company-enabled-services-v3')) return;
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-company-enabled-services-v3">
      <div class="modal-box" style="width:min(760px,calc(100vw - 24px));max-width:760px">
        <div class="modal-head"><div><span class="modal-head-title">Servicios habilitados</span><div style="font-size:10px;color:var(--muted2);margin-top:3px">Selección por prestadora</div></div><button class="modal-close" type="button" data-csv3-close>×</button></div>
        <div class="modal-body" style="max-height:min(70vh,680px);overflow:auto">
          <div class="csv3-note"><b>Acá no se crean servicios.</b> El catálogo maestro se administra en <strong>Configuración → Tipos de servicio</strong>. Acá únicamente definís cuáles usa esta prestadora.</div>
          <div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button class="btn btn-ghost" type="button" id="csv3-go-types">Abrir Tipos de servicio</button></div>
          <div id="csv3-list" class="csv3-list"><div class="csv3-empty">Cargando servicios…</div></div>
          <div class="modal-error" id="csv3-error" style="display:none"></div>
        </div>
        <div class="modal-footer"><button class="btn btn-ghost" type="button" data-csv3-close>Cancelar</button><button class="btn btn-primary" id="csv3-save" type="button">Guardar servicios habilitados</button></div>
      </div>
    </div>`);
    document.querySelectorAll('[data-csv3-close]').forEach(button => button.addEventListener('click', close));
    document.getElementById('csv3-go-types')?.addEventListener('click', () => {
      close();
      if (typeof goTo === 'function') goTo('config-service-types');
      window.AuxiliosServiceTypesCatalogV1?.load?.(true);
    });
    document.getElementById('csv3-save')?.addEventListener('click', saveEnabledServices);
  }

  function resolveCompanyId(explicit = null) {
    return explicit || S.companyId || window.__auxCompanySelected || document.getElementById('tmv3-company')?.value || null;
  }

  async function load(companyId = null) {
    const id = resolveCompanyId(companyId);
    if (!id) throw new Error('Seleccioná una prestadora.');
    const [configuration, services] = await Promise.all([
      _db.rpc('get_company_configuration_v2', { p_company_id: id }),
      _db.rpc('list_service_types_config', { p_include_inactive: true }),
    ]);
    if (configuration.error) throw configuration.error;
    if (services.error) throw services.error;
    S.companyId = id;
    S.companyConfig = configuration.data || { services: [] };
    S.catalog = Array.isArray(services.data) ? services.data : [];
    return S;
  }

  const companyServiceMap = () => new Map((S.companyConfig?.services || []).map(item => [String(item.concept_id), item]));

  function renderPicker() {
    const box = document.getElementById('csv3-list');
    if (!box) return;
    const settings = companyServiceMap();
    const active = S.catalog.filter(item => item.is_active !== false);
    box.innerHTML = active.length ? active.map(service => {
      const current = settings.get(String(service.concept_id)) || {};
      const enabled = current.is_enabled === true;
      const typeNames = (service.tariff_types || []).map(item => item.name).filter(Boolean).join(' · ');
      return `<label class="csv3-row" data-service-id="${esc(service.concept_id)}"><input type="checkbox" data-csv3-enabled="${esc(service.concept_id)}" ${enabled ? 'checked' : ''}><span><span class="csv3-name">${esc(service.name)}</span><span class="csv3-meta"><span class="csv3-chip kind">${esc(categoryLabel(service.category))}</span>${typeNames ? `<span class="csv3-chip">${esc(typeNames)}</span>` : ''}<span class="csv3-chip">${esc(unitLabel(service.pricing_unit))}</span><span class="csv3-chip ${service.distance_chargeable ? 'km' : ''}">${service.distance_chargeable ? 'Suma KM' : 'No suma KM'}</span></span></span><span class="csv3-state ${enabled ? 'on' : ''}">${enabled ? 'Habilitado' : 'No habilitado'}</span></label>`;
    }).join('') : '<div class="csv3-empty">No existen Tipos de Servicio activos.</div>';
  }

  function setError(message = '') {
    const el = document.getElementById('csv3-error');
    if (!el) return;
    el.textContent = message;
    el.style.display = message ? 'block' : 'none';
  }

  async function open(companyId = null) {
    if (!canWrite()) return notify('Solo Administración puede modificar los servicios habilitados', 'error');
    inject();
    setError('');
    const box = document.getElementById('csv3-list'); if (box) box.innerHTML = '<div class="csv3-empty">Cargando servicios…</div>';
    if (typeof openModal === 'function') openModal('modal-company-enabled-services-v3');
    else document.getElementById('modal-company-enabled-services-v3')?.classList.add('open');
    try { await load(companyId); renderPicker(); }
    catch (error) { setError(error?.message || 'No se pudieron cargar los servicios.'); }
  }

  function close() {
    if (typeof closeModal === 'function') closeModal('modal-company-enabled-services-v3');
    else document.getElementById('modal-company-enabled-services-v3')?.classList.remove('open');
  }

  async function saveEnabledServices() {
    if (!canWrite() || !S.companyId || S.busy) return;
    const button = document.getElementById('csv3-save');
    const settings = companyServiceMap();
    const active = S.catalog.filter(item => item.is_active !== false);
    S.busy = true; setError('');
    if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
    try {
      for (const service of active) {
        const current = settings.get(String(service.concept_id)) || {};
        const enabled = Boolean(document.querySelector(`[data-csv3-enabled="${CSS.escape(String(service.concept_id))}"]`)?.checked);
        const result = await _db.rpc('save_company_service_setting_v2', { p_payload: {
          company_id: S.companyId,
          concept_id: service.concept_id,
          is_enabled: enabled,
          external_code: current.external_code || null,
          code_mode: current.code_mode || 'fixed',
          notes: current.notes || null,
        }});
        if (result.error) throw result.error;
      }
      close();
      notify('Servicios habilitados actualizados', 'success');
      invalidate();
      if (typeof window.cargarEmpresasV2 === 'function') await window.cargarEmpresasV2();
      if (S.companyId && typeof window.seleccionarEmpresaV2 === 'function') await window.seleccionarEmpresaV2(S.companyId);
      window.AuxiliosBillingParametersV3?.refreshTariffs?.();
      schedulePatch();
    } catch (error) { setError(error?.message || 'No se pudieron guardar los servicios.'); }
    finally { S.busy = false; if (button) { button.disabled = false; button.textContent = 'Guardar servicios habilitados'; } }
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
      if (grid.dataset.csv3Signature === signature) return;
      const desc = section.querySelector('.empv2-section-head p');
      if (desc) desc.textContent = 'Servicios del catálogo maestro habilitados para esta prestadora. Las tarifas se administran después.';
      const action = section.querySelector('.empv2-section-head button');
      if (action) { action.textContent = 'Seleccionar servicios'; action.onclick = () => open(S.companyId); }
      grid.innerHTML = enabled.length ? enabled.map(service => `<article><span>⚙</span><div><b>${esc(service.name)}</b><small>${esc(categoryLabel(service.category))} · ${service.distance_chargeable ? 'Suma KM' : 'No suma KM'}</small></div><em class="ok">Habilitado</em></article>`).join('') : '<div class="empv2-empty">No hay servicios habilitados para esta prestadora.</div>';
      grid.dataset.csv3Signature = signature;
    } catch (error) { console.warn('[servicios prestadora v3]', error); }
  }

  function invalidate() {
    S.companyConfig = null;
    S.catalog = [];
  }

  function patch() {
    inject();
    const root = document.getElementById('empv2-root');
    if (root) patchServicesTab(root);
  }

  function schedulePatch() { clearTimeout(S.timer); S.timer = setTimeout(patch, 60); }

  function installCompanyHook() {
    const selection = window.seleccionarEmpresaV2;
    if (typeof selection !== 'function' || selection.__csv3Wrapped) return;
    const wrapped = async function(companyId, ...args) {
      if (companyId) { S.companyId = companyId; invalidate(); }
      const result = await selection.apply(this, [companyId, ...args]);
      schedulePatch();
      return result;
    };
    wrapped.__csv3Wrapped = true;
    window.seleccionarEmpresaV2 = wrapped;
    if (window.seleccionarEmpresa === selection) window.seleccionarEmpresa = wrapped;
  }

  function init() {
    inject(); installCompanyHook(); patch();
    let attempts = 0;
    const timer = setInterval(() => {
      installCompanyHook(); patch();
      if (++attempts > 70 || window.seleccionarEmpresaV2) clearInterval(timer);
    }, 200);
    new MutationObserver(schedulePatch).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('change', event => {
      if (!event.target?.matches?.('[data-csv3-enabled]')) return;
      const state = event.target.closest('.csv3-row')?.querySelector('.csv3-state');
      if (state) { state.textContent = event.target.checked ? 'Habilitado' : 'No habilitado'; state.classList.toggle('on', event.target.checked); }
    });
  }

  Object.assign(window, {
    abrirServiciosEmpresaV2: companyId => open(companyId || S.companyId),
    abrirServiciosPrestadoraConfig: companyId => open(companyId || S.companyId),
  });
  window.AuxiliosCompanyServicesV3 = { open, load, invalidate };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();
/* AuxiliOS · Servicios habilitados por prestadora v4 · allowlist canónica */
(() => {
  'use strict';

  const S = { companyId: null, companyConfig: null, catalog: [], busy: false };
  const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const profile = () => typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : (window.PERFIL_USUARIO || {});
  const role = () => norm(profile()?.roles?.name || profile()?.role?.name || profile()?.role || profile()?.role_name || '');
  const canWrite = () => role() === 'administracion';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const notify = (message, type = 'info') => typeof toast === 'function' ? toast(message, type) : console[type === 'error' ? 'error' : 'log'](message);
  const categoryLabel = value => ({ primary: 'Primario', secondary: 'Secundario', mixed: 'Mixto' }[value] || value || '—');
  const unitLabel = value => ({ service: 'Por servicio', hour: 'Por hora', unit: 'Por unidad', day: 'Por día', fixed: 'Monto fijo', km: 'Por km' }[value] || value || '—');

  function inject() {
    if (!document.getElementById('company-services-configuration-v4-css')) {
      document.head.insertAdjacentHTML('beforeend', `<style id="company-services-configuration-v4-css">
        .cs4-note{padding:10px 12px;border:1px solid rgba(74,144,226,.28);background:rgba(74,144,226,.08);border-radius:9px;font-size:11px;line-height:1.5;color:var(--muted2);margin-bottom:12px}.cs4-note b{color:var(--text)}
        .cs4-list{display:grid;gap:8px}.cs4-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 12px;border:1px solid var(--border);border-radius:9px;background:var(--bg)}.cs4-row input{width:17px;height:17px;accent-color:var(--amber)}
        .cs4-name{font-size:12px;font-weight:700;color:var(--text)}.cs4-meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}.cs4-chip{display:inline-flex;align-items:center;padding:3px 7px;border:1px solid var(--border2);border-radius:999px;font-size:9px;color:var(--muted2)}.cs4-chip.km{color:var(--cyan);border-color:rgba(46,196,214,.35)}.cs4-state{font-size:9px;color:var(--muted2)}.cs4-state.on{color:var(--green)}.cs4-empty{padding:20px;text-align:center;border:1px dashed var(--border2);border-radius:9px;color:var(--muted2);font-size:11px}
      </style>`);
    }
    document.getElementById('modal-company-enabled-services-v2')?.remove();
    document.getElementById('modal-company-enabled-services-v3')?.remove();
    if (document.getElementById('modal-company-enabled-services-v4')) return;
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-company-enabled-services-v4"><div class="modal-box" style="width:min(760px,calc(100vw - 24px));max-width:760px"><div class="modal-head"><div><span class="modal-head-title">Servicios habilitados</span><div style="font-size:10px;color:var(--muted2);margin-top:3px">Selección por prestadora</div></div><button class="modal-close" data-cs4-close type="button">×</button></div><div class="modal-body" style="max-height:min(70vh,680px);overflow:auto"><div class="cs4-note"><b>Acá no se crean servicios.</b> El catálogo maestro se administra en <strong>Configuración → Tipos de servicio</strong>. Acá únicamente definís cuáles puede utilizar esta prestadora.</div><div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button class="btn btn-ghost" id="cs4-go-types" type="button">Abrir Tipos de servicio</button></div><div id="cs4-list" class="cs4-list"><div class="cs4-empty">Cargando servicios…</div></div><div class="modal-error" id="cs4-error" style="display:none"></div></div><div class="modal-footer"><button class="btn btn-ghost" data-cs4-close type="button">Cancelar</button><button class="btn btn-primary" id="cs4-save" type="button">Guardar servicios habilitados</button></div></div></div>`);
    document.querySelectorAll('[data-cs4-close]').forEach(button => button.addEventListener('click', close));
    document.getElementById('cs4-go-types')?.addEventListener('click', () => { close(); if (typeof goTo === 'function') goTo('config-service-types'); });
    document.getElementById('cs4-save')?.addEventListener('click', save);
  }

  const resolveCompanyId = explicit => explicit || S.companyId || window.__auxCompanySelected || null;

  async function load(companyId = null) {
    const id = resolveCompanyId(companyId);
    if (!id) throw new Error('Seleccioná una prestadora.');
    const [configuration, catalog] = await Promise.all([
      _db.rpc('get_company_configuration_v2', { p_company_id: id }),
      _db.rpc('list_service_types_config', { p_include_inactive: true }),
    ]);
    if (configuration.error) throw configuration.error;
    if (catalog.error) throw catalog.error;
    S.companyId = id;
    S.companyConfig = configuration.data || { services: [] };
    S.catalog = Array.isArray(catalog.data) ? catalog.data : [];
    return S;
  }

  const settingsMap = () => new Map((S.companyConfig?.services || []).map(row => [String(row.concept_id), row]));

  function render() {
    const box = document.getElementById('cs4-list');
    if (!box) return;
    const settings = settingsMap();
    const active = S.catalog.filter(service => service.is_active !== false);
    box.innerHTML = active.length ? active.map(service => {
      const current = settings.get(String(service.concept_id)) || {};
      const enabled = current.is_enabled === true;
      const tariffTypes = (service.tariff_types || []).map(type => type.name).filter(Boolean).join(' · ');
      return `<label class="cs4-row"><input type="checkbox" data-cs4-enabled="${esc(service.concept_id)}" ${enabled ? 'checked' : ''}><span><span class="cs4-name">${esc(service.name)}</span><span class="cs4-meta"><span class="cs4-chip">${esc(categoryLabel(service.category))}</span>${tariffTypes ? `<span class="cs4-chip">${esc(tariffTypes)}</span>` : ''}<span class="cs4-chip">${esc(unitLabel(service.pricing_unit))}</span><span class="cs4-chip ${service.distance_chargeable ? 'km' : ''}">${service.distance_chargeable ? 'Suma KM' : 'No suma KM'}</span></span></span><span class="cs4-state ${enabled ? 'on' : ''}">${enabled ? 'Habilitado' : 'No habilitado'}</span></label>`;
    }).join('') : '<div class="cs4-empty">No existen Tipos de Servicio activos.</div>';
    box.querySelectorAll('[data-cs4-enabled]').forEach(input => input.addEventListener('change', () => {
      const state = input.closest('.cs4-row')?.querySelector('.cs4-state');
      if (!state) return;
      state.textContent = input.checked ? 'Habilitado' : 'No habilitado';
      state.classList.toggle('on', input.checked);
    }));
  }

  function setError(message = '') {
    const el = document.getElementById('cs4-error');
    if (!el) return;
    el.textContent = message;
    el.style.display = message ? 'block' : 'none';
  }

  async function open(companyId = null) {
    if (!canWrite()) return notify('Solo Administración puede modificar los servicios habilitados', 'error');
    inject();
    const id = resolveCompanyId(companyId);
    if (!id) return notify('Seleccioná una prestadora', 'warning');
    S.companyId = id;
    const box = document.getElementById('cs4-list');
    if (box) box.innerHTML = '<div class="cs4-empty">Cargando servicios…</div>';
    setError('');
    typeof openModal === 'function' ? openModal('modal-company-enabled-services-v4') : document.getElementById('modal-company-enabled-services-v4')?.classList.add('open');
    try { await load(id); render(); }
    catch (error) { setError(error?.message || 'No se pudieron cargar los servicios.'); }
  }

  function close() {
    typeof closeModal === 'function' ? closeModal('modal-company-enabled-services-v4') : document.getElementById('modal-company-enabled-services-v4')?.classList.remove('open');
  }

  async function save() {
    if (!canWrite() || !S.companyId || S.busy) return;
    const settings = settingsMap();
    const active = S.catalog.filter(service => service.is_active !== false);
    const button = document.getElementById('cs4-save');
    S.busy = true; setError('');
    if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
    try {
      for (const service of active) {
        const current = settings.get(String(service.concept_id)) || {};
        const enabled = Boolean(document.querySelector(`[data-cs4-enabled="${CSS.escape(String(service.concept_id))}"]`)?.checked);
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
      S.companyConfig = null; S.catalog = [];
      window.AuxiliosCompanyTariffsV4?.reload?.();
      if (typeof window.cargarEmpresasV2 === 'function') await window.cargarEmpresasV2({ preserveSelection: true });
    } catch (error) { setError(error?.message || 'No se pudieron guardar los servicios.'); }
    finally { S.busy = false; if (button) { button.disabled = false; button.textContent = 'Guardar servicios habilitados'; } }
  }

  Object.assign(window, {
    abrirServiciosEmpresaV2: companyId => open(companyId),
    abrirServiciosPrestadoraConfig: companyId => open(companyId),
  });
  window.AuxiliosCompanyServicesV4 = { open, load, state: S };

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', inject, { once: true }) : inject();
})();
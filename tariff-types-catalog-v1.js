/* AuxiliOS · Tipos de Tarifa v1 · catálogo canónico */
(() => {
  'use strict';

  const S = { types: [], services: [], editingId: null, loading: false, saving: false };
  const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const profile = () => typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : (window.PERFIL_USUARIO || {});
  const role = () => norm(profile()?.roles?.name || profile()?.role?.name || profile()?.role || profile()?.role_name || '');
  const canRead = () => ['administracion', 'facturacion', 'supervision'].includes(role());
  const canWrite = () => role() === 'administracion';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const notify = (message, type = 'info') => typeof toast === 'function' ? toast(message, type) : console[type === 'error' ? 'error' : 'log'](message);

  function injectStyles() {
    if (document.getElementById('tariff-types-catalog-v1-css')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="tariff-types-catalog-v1-css">
      .tt1{display:grid;gap:14px}.tt1-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.tt1-head h2{margin:0}.tt1-head p{margin:5px 0 0;max-width:760px;color:var(--muted2);font-size:11px;line-height:1.45}
      .tt1-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.tt1-card{padding:15px;border:1px solid var(--border);border-radius:12px;background:var(--panel)}.tt1-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.tt1-card h3{margin:0;font-size:13px;color:var(--text)}.tt1-code{margin-top:4px;font-family:'DM Mono',monospace;font-size:9px;color:var(--muted2)}.tt1-desc{margin:10px 0;font-size:10px;line-height:1.5;color:var(--muted2)}
      .tt1-chip{display:inline-flex;align-items:center;padding:3px 7px;border:1px solid var(--border2);border-radius:999px;font-size:8px;color:var(--muted2)}.tt1-chip.km{border-color:rgba(46,196,214,.35);color:var(--cyan)}.tt1-chip.off{border-color:rgba(226,80,74,.28);color:var(--red)}.tt1-services{display:flex;gap:5px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)}.tt1-services small{width:100%;font-size:8px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
      .tt1-actions{display:flex;justify-content:flex-end;margin-top:12px}.tt1-action{border:1px solid var(--border2);background:var(--bg);color:var(--text);border-radius:7px;padding:6px 9px;font-size:9px;cursor:pointer}.tt1-empty,.tt1-error{padding:28px;text-align:center;border:1px dashed var(--border2);border-radius:12px;color:var(--muted2);font-size:11px}.tt1-error{color:var(--red)}
      .tt1-modal{width:min(760px,calc(100vw - 24px));max-width:760px}.tt1-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.tt1-field{display:grid;gap:6px}.tt1-field.full{grid-column:1/-1}.tt1-field>span{font-size:9px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--muted2)}.tt1-checks{display:flex;gap:18px;flex-wrap:wrap;margin-top:12px}.tt1-check{display:flex;align-items:center;gap:8px;font-size:10px;color:var(--text)}.tt1-check input{accent-color:var(--amber)}.tt1-service-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:8px}.tt1-service-check{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);font-size:10px;color:var(--text)}.tt1-service-check input{accent-color:var(--amber)}
      @media(max-width:900px){.tt1-grid{grid-template-columns:1fr 1fr}}@media(max-width:620px){.tt1-grid,.tt1-form-grid,.tt1-service-checks{grid-template-columns:1fr}.tt1-head{display:grid}}
    </style>`);
  }

  function ensureModal() {
    document.getElementById('modal-config-tariff-type')?.remove();
    if (document.getElementById('modal-tariff-type-catalog-v1')) return;
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-tariff-type-catalog-v1"><div class="modal-box tt1-modal">
      <div class="modal-head"><span class="modal-head-title" id="tt1-modal-title">Tipo de tarifa</span><button class="modal-close" type="button" data-tt1-close>×</button></div>
      <div class="modal-body"><div class="tt1-form-grid">
        <label class="tt1-field"><span>Nombre *</span><input class="form-input" id="tt1-name"></label>
        <label class="tt1-field"><span>Código *</span><input class="form-input" id="tt1-code"></label>
        <label class="tt1-field full"><span>Descripción</span><input class="form-input" id="tt1-description"></label>
        <label class="tt1-field"><span>Orden</span><input class="form-input" type="number" min="0" id="tt1-order"></label>
      </div>
      <div class="tt1-checks"><label class="tt1-check"><input type="checkbox" id="tt1-adds-km"><span>Suma kilómetros</span></label><label class="tt1-check"><input type="checkbox" id="tt1-active" checked><span>Activo</span></label></div>
      <div style="margin-top:16px"><div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted2)">Tipos de servicio asociados</div><div class="tt1-service-checks" id="tt1-services"></div></div>
      <div class="modal-error" id="tt1-error" style="display:none"></div></div>
      <div class="modal-footer"><button class="btn btn-ghost" type="button" data-tt1-close>Cancelar</button><button class="btn btn-primary" id="tt1-save" type="button">Guardar tipo de tarifa</button></div>
    </div></div>`);
    document.querySelectorAll('[data-tt1-close]').forEach(button => button.addEventListener('click', closeEditor));
    document.getElementById('tt1-save')?.addEventListener('click', save);
  }

  function renderShell() {
    const screen = document.getElementById('screen-config-tariff-types');
    if (!screen) return false;
    screen.innerHTML = `<div class="tt1"><div class="tt1-head"><div><h2>Tipos de tarifa</h2><p>Catálogo maestro de formas de cálculo. Define cómo se cobra una familia de servicios y si el importe incorpora kilómetros.</p></div>${canWrite() ? '<button class="btn btn-primary" id="tt1-new" type="button">＋ Nuevo tipo</button>' : ''}</div>${canRead() && !canWrite() ? '<div class="tt1-card" style="font-size:10px;color:var(--muted2)">Acceso de consulta. Solo Administración puede modificar Tipos de Tarifa.</div>' : ''}<div class="tt1-grid" id="tt1-grid"><div class="tt1-empty">Cargando tipos de tarifa…</div></div></div>`;
    document.getElementById('tt1-new')?.addEventListener('click', () => openEditor());
    return true;
  }

  function serviceIds(type) {
    const raw = type?.service_ids || type?.services || type?.service_concepts || [];
    return new Set((Array.isArray(raw) ? raw : []).map(item => String(item?.concept_id || item?.service_id || item)));
  }

  function render() {
    const grid = document.getElementById('tt1-grid');
    if (!grid) return;
    if (!canRead()) { grid.innerHTML = '<div class="tt1-error">Sin permiso para consultar Tipos de Tarifa.</div>'; return; }
    grid.innerHTML = S.types.length ? S.types.map(type => {
      const selected = serviceIds(type);
      const services = S.services.filter(service => selected.has(String(service.concept_id)));
      const usage = Number(type.service_count ?? type.usage_count ?? services.length ?? 0);
      return `<article class="tt1-card"><div class="tt1-card-head"><div><h3>${esc(type.name)}</h3><div class="tt1-code">${esc(type.code || '—')}</div></div><span class="tt1-chip ${type.is_active === false ? 'off' : type.adds_km ? 'km' : ''}">${type.is_active === false ? 'Inactivo' : type.adds_km ? 'Suma KM' : 'Monto / cantidad'}</span></div><div class="tt1-desc">${esc(type.description || 'Sin descripción.')}</div><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="tt1-chip">${usage} servicio${usage === 1 ? '' : 's'}</span><span class="tt1-chip">Orden ${esc(type.sort_order ?? 0)}</span></div><div class="tt1-services"><small>Servicios asociados</small>${services.length ? services.map(service => `<span class="tt1-chip">${esc(service.name)}</span>`).join('') : '<span class="tt1-chip">Sin asociaciones</span>'}</div>${canWrite() ? `<div class="tt1-actions"><button class="tt1-action" type="button" data-tt1-edit="${esc(type.tariff_type_id)}">Editar</button></div>` : ''}</article>`;
    }).join('') : '<div class="tt1-empty">No hay Tipos de Tarifa configurados.</div>';
    grid.querySelectorAll('[data-tt1-edit]').forEach(button => button.addEventListener('click', () => openEditor(button.dataset.tt1Edit)));
  }

  async function load(force = false) {
    if (!canRead() || (S.loading && !force)) return;
    S.loading = true;
    try {
      const [types, services] = await Promise.all([_db.rpc('list_tariff_types_config'), _db.rpc('list_service_types_config', { p_include_inactive: true })]);
      if (types.error) throw types.error;
      if (services.error) throw services.error;
      S.types = Array.isArray(types.data) ? types.data : [];
      S.services = Array.isArray(services.data) ? services.data : [];
      render();
    } catch (error) {
      const grid = document.getElementById('tt1-grid');
      if (grid) grid.innerHTML = `<div class="tt1-error">${esc(error?.message || 'No se pudieron cargar los Tipos de Tarifa.')}</div>`;
      notify(error?.message || 'No se pudieron cargar los Tipos de Tarifa', 'error');
    } finally { S.loading = false; }
  }

  function setError(message = '') {
    const el = document.getElementById('tt1-error');
    if (!el) return;
    el.textContent = message;
    el.style.display = message ? 'block' : 'none';
  }

  function fillServiceChecks(selected) {
    const box = document.getElementById('tt1-services');
    if (!box) return;
    box.innerHTML = S.services.filter(service => service.is_active !== false).map(service => `<label class="tt1-service-check"><input type="checkbox" value="${esc(service.concept_id)}" data-tt1-service ${selected.has(String(service.concept_id)) ? 'checked' : ''}><span>${esc(service.name)}</span></label>`).join('') || '<div class="tt1-empty">No hay Tipos de Servicio activos.</div>';
  }

  function openEditor(id = null) {
    if (!canWrite()) return notify('Solo Administración puede modificar Tipos de Tarifa', 'error');
    ensureModal();
    const type = S.types.find(row => String(row.tariff_type_id) === String(id)) || null;
    S.editingId = type?.tariff_type_id || null;
    document.getElementById('tt1-modal-title').textContent = type ? 'Editar tipo de tarifa' : 'Nuevo tipo de tarifa';
    document.getElementById('tt1-name').value = type?.name || '';
    document.getElementById('tt1-code').value = type?.code || '';
    document.getElementById('tt1-description').value = type?.description || '';
    document.getElementById('tt1-order').value = type?.sort_order ?? 0;
    document.getElementById('tt1-adds-km').checked = Boolean(type?.adds_km);
    document.getElementById('tt1-active').checked = type?.is_active !== false;
    fillServiceChecks(serviceIds(type));
    setError('');
    typeof openModal === 'function' ? openModal('modal-tariff-type-catalog-v1') : document.getElementById('modal-tariff-type-catalog-v1')?.classList.add('open');
  }

  function closeEditor() {
    S.editingId = null;
    typeof closeModal === 'function' ? closeModal('modal-tariff-type-catalog-v1') : document.getElementById('modal-tariff-type-catalog-v1')?.classList.remove('open');
  }

  async function save() {
    if (!canWrite() || S.saving) return;
    const name = String(document.getElementById('tt1-name')?.value || '').trim();
    const code = String(document.getElementById('tt1-code')?.value || '').trim();
    if (!name || !code) return setError('Completá nombre y código.');
    const serviceIds = [...document.querySelectorAll('[data-tt1-service]:checked')].map(input => input.value);
    const payload = {
      tariff_type_id: S.editingId,
      name,
      code,
      description: String(document.getElementById('tt1-description')?.value || '').trim() || null,
      adds_km: Boolean(document.getElementById('tt1-adds-km')?.checked),
      sort_order: Math.max(0, Number(document.getElementById('tt1-order')?.value || 0)),
      is_active: Boolean(document.getElementById('tt1-active')?.checked),
      service_ids: serviceIds,
    };
    const button = document.getElementById('tt1-save');
    S.saving = true; setError('');
    if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
    try {
      const result = await _db.rpc('save_tariff_type_config', { p_payload: payload });
      if (result.error) throw result.error;
      closeEditor();
      notify(S.editingId ? 'Tipo de Tarifa actualizado' : 'Tipo de Tarifa creado', 'success');
      await load(true);
      window.AuxiliosServiceTypesCatalogV2?.load?.(true);
    } catch (error) { setError(error?.message || 'No se pudo guardar el Tipo de Tarifa.'); }
    finally { S.saving = false; if (button) { button.disabled = false; button.textContent = 'Guardar tipo de tarifa'; } }
  }

  function init() {
    injectStyles();
    if (!renderShell()) return;
    ensureModal();
    if (canRead()) load(true);
  }

  window.AuxiliosTariffTypesCatalogV1 = { load, openEditor, state: S };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();
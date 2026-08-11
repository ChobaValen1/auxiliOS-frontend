/* AuxiliOS · Tipos de Servicio · CRUD canónico */
(() => {
  'use strict';

  const S = {
    services: [],
    tariffTypes: [],
    editingId: null,
    loading: false,
    saving: false,
    initialized: false,
  };

  const normalizeRole = value => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const profile = () => (typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : (window.PERFIL_USUARIO || {}));
  const role = () => normalizeRole(profile()?.roles?.name || profile()?.role?.name || profile()?.role || profile()?.role_name || '');
  const canRead = () => ['administracion', 'facturacion', 'supervision'].includes(role());
  const canWrite = () => role() === 'administracion';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const notify = (message, type = 'info') => typeof toast === 'function'
    ? toast(message, type)
    : console[type === 'error' ? 'error' : 'log'](message);
  const categoryLabel = value => ({ primary: 'Primario', secondary: 'Secundario', mixed: 'Mixto' }[value] || value || '—');
  const unitLabel = value => ({ service: 'Por servicio', hour: 'Por hora', unit: 'Por unidad', day: 'Por día', fixed: 'Monto fijo', km: 'Por km' }[value] || value || '—');
  const input = id => document.getElementById(id)?.value ?? '';
  const checked = id => Boolean(document.getElementById(id)?.checked);

  function injectStyles() {
    if (document.getElementById('service-types-catalog-v1-css')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="service-types-catalog-v1-css">
      .stc-shell{display:grid;gap:14px}.stc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.stc-head h2{margin:0}.stc-head p{margin:5px 0 0;color:var(--muted2);font-size:11px;line-height:1.45;max-width:760px}
      .stc-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 180px auto;gap:9px}.stc-panel{border:1px solid var(--border);border-radius:12px;background:var(--panel);overflow:hidden}.stc-table-wrap{overflow:auto}.stc-table{width:100%;border-collapse:collapse}.stc-table th,.stc-table td{padding:11px 12px;border-bottom:1px solid var(--border);text-align:left;vertical-align:middle;font-size:10px}.stc-table th{font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.stc-table tr:last-child td{border-bottom:0}.stc-table strong{display:block;font-size:11px;color:var(--text)}.stc-table small{display:block;margin-top:3px;color:var(--muted2);font-size:9px;line-height:1.35}
      .stc-chip{display:inline-flex;align-items:center;padding:3px 7px;border:1px solid var(--border2);border-radius:999px;font-size:9px;color:var(--muted2);white-space:nowrap}.stc-chip.ok{border-color:rgba(39,196,122,.32);color:var(--green)}.stc-chip.off{border-color:rgba(226,80,74,.30);color:var(--red)}.stc-chip.kind{border-color:rgba(155,109,255,.32);color:var(--purple)}.stc-chip.km{border-color:rgba(46,196,214,.35);color:var(--cyan)}
      .stc-actions{display:flex;gap:6px;justify-content:flex-end}.stc-action{border:1px solid var(--border2);background:var(--bg);color:var(--text);border-radius:7px;padding:6px 8px;font-size:9px;cursor:pointer}.stc-action:hover{border-color:var(--muted)}.stc-action.danger{color:var(--red);border-color:rgba(226,80,74,.28)}
      .stc-empty,.stc-error{padding:22px;text-align:center;color:var(--muted2);font-size:11px}.stc-error{color:var(--red)}.stc-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.stc-kpi{padding:11px 12px;border:1px solid var(--border);border-radius:9px;background:var(--panel)}.stc-kpi small{display:block;font-size:8px;text-transform:uppercase;color:var(--muted)}.stc-kpi b{display:block;margin-top:4px;font-size:17px;color:var(--text)}
      .stc-modal{width:min(820px,calc(100vw - 24px));max-width:820px}.stc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.stc-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.stc-field{display:grid;gap:6px}.stc-field.full{grid-column:1/-1}.stc-field>span{font-size:9px;font-weight:750;letter-spacing:.04em;text-transform:uppercase;color:var(--muted2)}.stc-check{display:flex;align-items:center;gap:8px;font-size:10px;color:var(--text)}.stc-check input{accent-color:var(--amber)}.stc-help{margin-top:10px;padding:9px 11px;border:1px solid var(--border);border-radius:8px;background:var(--bg);font-size:9px;line-height:1.45;color:var(--muted2)}
      .stc-readonly{padding:10px 12px;border:1px solid rgba(245,166,35,.28);border-radius:9px;background:rgba(245,166,35,.06);color:var(--muted2);font-size:10px}
      @media(max-width:760px){.stc-toolbar,.stc-grid,.stc-grid.three,.stc-kpis{grid-template-columns:1fr}.stc-head{display:grid}}
    </style>`);
  }

  function ensureModal() {
    document.getElementById('modal-config-service-type')?.remove();
    if (document.getElementById('modal-service-type-crud-v1')) return;
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-service-type-crud-v1">
      <div class="modal-box stc-modal">
        <div class="modal-head"><span class="modal-head-title" id="stc-modal-title">Nuevo tipo de servicio</span><button class="modal-close" type="button" data-stc-close>×</button></div>
        <div class="modal-body">
          <div class="stc-grid three">
            <label class="stc-field"><span>Nombre *</span><input class="form-input" id="stc-name"></label>
            <label class="stc-field"><span>Código interno *</span><input class="form-input" id="stc-code"></label>
            <label class="stc-field"><span>Ícono</span><input class="form-input" id="stc-icon" maxlength="4"></label>
            <label class="stc-field full"><span>Descripción operativa</span><input class="form-input" id="stc-description"></label>
            <label class="stc-field"><span>Carácter</span><select class="form-input" id="stc-category"><option value="primary">Primario</option><option value="secondary">Secundario</option><option value="mixed">Mixto</option></select></label>
            <label class="stc-field"><span>Tipo de tarifa</span><select class="form-input" id="stc-tariff-type"></select></label>
            <label class="stc-field"><span>Unidad predeterminada</span><select class="form-input" id="stc-unit"><option value="service">Por servicio</option><option value="hour">Por hora</option><option value="unit">Por unidad</option><option value="day">Por día</option><option value="fixed">Monto fijo</option><option value="km">Por km</option></select></label>
          </div>
          <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:14px"><label class="stc-check"><input type="checkbox" id="stc-adds-km"><span>Suma kilómetros</span></label><label class="stc-check"><input type="checkbox" id="stc-active" checked><span>Servicio activo</span></label></div>
          <div class="stc-help">El carácter y “Suma kilómetros” pertenecen al Tipo de Servicio. La asociación con Tipo de tarifa define la familia comercial, pero no bloquea la edición de estos datos.</div>
          <div class="modal-error" id="stc-form-error" style="display:none"></div>
        </div>
        <div class="modal-footer"><button class="btn btn-ghost" type="button" data-stc-close>Cancelar</button><button class="btn btn-primary" id="stc-save" type="button">Guardar tipo de servicio</button></div>
      </div>
    </div>`);
    document.querySelectorAll('[data-stc-close]').forEach(button => button.addEventListener('click', closeModalCrud));
    document.getElementById('stc-save')?.addEventListener('click', save);
  }

  function renderShell() {
    const screen = document.getElementById('screen-config-service-types');
    if (!screen) return false;
    screen.innerHTML = `<div class="stc-shell">
      <div class="stc-head"><div><h2>Tipos de servicio</h2><p>Catálogo maestro global. Acá se crean, consultan, modifican y eliminan los servicios que después pueden habilitarse para cada prestadora.</p></div>${canWrite() ? '<button class="btn btn-primary" id="stc-new" type="button">＋ Nuevo servicio</button>' : ''}</div>
      ${canRead() && !canWrite() ? '<div class="stc-readonly">Acceso de consulta. Solo Administración puede crear, modificar o eliminar servicios.</div>' : ''}
      <div class="stc-kpis" id="stc-kpis"></div>
      <div class="stc-toolbar"><input class="form-input" id="stc-search" placeholder="Buscar por nombre, código o descripción"><select class="form-input" id="stc-filter"><option value="active">Activos</option><option value="all">Todos</option><option value="primary">Primarios</option><option value="secondary">Secundarios</option><option value="mixed">Mixtos</option><option value="inactive">Inactivos</option></select><button class="btn btn-ghost" id="stc-refresh" type="button">↻ Actualizar</button></div>
      <div class="stc-panel"><div class="stc-table-wrap"><table class="stc-table"><thead><tr><th>Servicio</th><th>Código</th><th>Carácter</th><th>Tipo de tarifa</th><th>Unidad</th><th>KM</th><th>Estado</th><th style="text-align:right">Acciones</th></tr></thead><tbody id="stc-body"><tr><td colspan="8"><div class="stc-empty">Cargando servicios…</div></td></tr></tbody></table></div></div>
    </div>`;
    document.getElementById('stc-new')?.addEventListener('click', () => openEditor());
    document.getElementById('stc-refresh')?.addEventListener('click', () => load(true));
    document.getElementById('stc-search')?.addEventListener('input', renderRows);
    document.getElementById('stc-filter')?.addEventListener('change', renderRows);
    return true;
  }

  function setFormError(message = '') {
    const el = document.getElementById('stc-form-error');
    if (!el) return;
    el.textContent = message ? `⚠ ${message}` : '';
    el.style.display = message ? 'block' : 'none';
  }

  async function load(force = false) {
    if (!canRead()) {
      const body = document.getElementById('stc-body');
      if (body) body.innerHTML = '<tr><td colspan="8"><div class="stc-error">Sin permiso para consultar Tipos de Servicio.</div></td></tr>';
      return;
    }
    if (S.loading && !force) return;
    S.loading = true;
    const body = document.getElementById('stc-body');
    if (body) body.innerHTML = '<tr><td colspan="8"><div class="stc-empty">Cargando servicios…</div></td></tr>';
    try {
      const [services, tariffTypes] = await Promise.all([
        _db.rpc('list_service_types_config', { p_include_inactive: true }),
        _db.rpc('list_tariff_types_config'),
      ]);
      if (services.error) throw services.error;
      if (tariffTypes.error) throw tariffTypes.error;
      S.services = Array.isArray(services.data) ? services.data : [];
      S.tariffTypes = Array.isArray(tariffTypes.data) ? tariffTypes.data : [];
      renderRows();
    } catch (error) {
      if (body) body.innerHTML = `<tr><td colspan="8"><div class="stc-error">${esc(error?.message || 'No se pudieron leer los Tipos de Servicio.')}</div></td></tr>`;
      notify(error?.message || 'No se pudieron leer los Tipos de Servicio', 'error');
    } finally {
      S.loading = false;
    }
  }

  function renderRows() {
    const body = document.getElementById('stc-body');
    if (!body) return;
    const query = String(document.getElementById('stc-search')?.value || '').trim().toLowerCase();
    const filter = document.getElementById('stc-filter')?.value || 'active';
    const filtered = S.services.filter(service => {
      if (filter === 'active' && service.is_active === false) return false;
      if (filter === 'inactive' && service.is_active !== false) return false;
      if (['primary','secondary','mixed'].includes(filter) && service.category !== filter) return false;
      if (query && !`${service.name} ${service.code} ${service.description || ''}`.toLowerCase().includes(query)) return false;
      return true;
    });
    const counts = {
      total: S.services.length,
      active: S.services.filter(s => s.is_active !== false).length,
      primary: S.services.filter(s => s.is_active !== false && s.category === 'primary').length,
      secondary: S.services.filter(s => s.is_active !== false && s.category === 'secondary').length,
    };
    const kpis = document.getElementById('stc-kpis');
    if (kpis) kpis.innerHTML = `<div class="stc-kpi"><small>Total</small><b>${counts.total}</b></div><div class="stc-kpi"><small>Activos</small><b>${counts.active}</b></div><div class="stc-kpi"><small>Primarios</small><b>${counts.primary}</b></div><div class="stc-kpi"><small>Secundarios</small><b>${counts.secondary}</b></div>`;
    body.innerHTML = filtered.length ? filtered.map(service => {
      const tariff = (service.tariff_types || [])[0];
      return `<tr data-stc-id="${esc(service.concept_id)}"><td><strong>${esc(service.name)}</strong><small>${esc(service.description || '')}</small></td><td>${esc(service.code)}</td><td><span class="stc-chip kind">${esc(categoryLabel(service.category))}</span></td><td>${tariff ? `<span class="stc-chip">${esc(tariff.name)}</span>` : '<span class="stc-chip">Sin asociar</span>'}</td><td>${esc(unitLabel(service.pricing_unit))}</td><td><span class="stc-chip ${service.distance_chargeable ? 'km' : ''}">${service.distance_chargeable ? 'Suma KM' : 'No suma'}</span></td><td><span class="stc-chip ${service.is_active !== false ? 'ok' : 'off'}">${service.is_active !== false ? 'Activo' : 'Inactivo'}</span></td><td><div class="stc-actions">${canWrite() ? `<button class="stc-action" type="button" data-stc-edit="${esc(service.concept_id)}">Editar</button><button class="stc-action danger" type="button" data-stc-delete="${esc(service.concept_id)}">Eliminar</button>` : '—'}</div></td></tr>`;
    }).join('') : '<tr><td colspan="8"><div class="stc-empty">No hay servicios para mostrar.</div></td></tr>';
    body.querySelectorAll('[data-stc-edit]').forEach(button => button.addEventListener('click', () => openEditor(button.dataset.stcEdit)));
    body.querySelectorAll('[data-stc-delete]').forEach(button => button.addEventListener('click', () => removeService(button.dataset.stcDelete)));
  }

  function fillTariffTypes(selectedId = '') {
    const select = document.getElementById('stc-tariff-type');
    if (!select) return;
    const rows = S.tariffTypes.filter(type => type.is_active !== false || String(type.tariff_type_id) === String(selectedId));
    select.innerHTML = '<option value="">Sin tipo de tarifa</option>' + rows.map(type => `<option value="${esc(type.tariff_type_id)}" ${String(type.tariff_type_id) === String(selectedId) ? 'selected' : ''}>${esc(type.name)}</option>`).join('');
  }

  function openEditor(id = null) {
    if (!canWrite()) return notify('Solo Administración puede modificar Tipos de Servicio', 'error');
    ensureModal();
    const row = id ? S.services.find(service => String(service.concept_id) === String(id)) : null;
    S.editingId = row?.concept_id || null;
    document.getElementById('stc-modal-title').textContent = row ? 'Editar tipo de servicio' : 'Nuevo tipo de servicio';
    document.getElementById('stc-name').value = row?.name || '';
    document.getElementById('stc-code').value = row?.code || '';
    document.getElementById('stc-code').disabled = false;
    document.getElementById('stc-icon').value = row?.icon || '⚙';
    document.getElementById('stc-description').value = row?.description || '';
    document.getElementById('stc-category').value = row?.category || 'secondary';
    document.getElementById('stc-unit').value = row?.pricing_unit || 'service';
    document.getElementById('stc-adds-km').checked = Boolean(row?.distance_chargeable);
    document.getElementById('stc-active').checked = row?.is_active !== false;
    fillTariffTypes(row?.tariff_types?.[0]?.tariff_type_id || '');
    setFormError('');
    if (typeof openModal === 'function') openModal('modal-service-type-crud-v1');
    else document.getElementById('modal-service-type-crud-v1')?.classList.add('open');
  }

  function closeModalCrud() {
    if (typeof closeModal === 'function') closeModal('modal-service-type-crud-v1');
    else document.getElementById('modal-service-type-crud-v1')?.classList.remove('open');
    S.editingId = null;
  }

  async function ensureUniqueCode(code, currentId = null) {
    let query = _db.from('service_concepts').select('concept_id').eq('code', code).limit(1);
    if (currentId) query = query.neq('concept_id', currentId);
    const result = await query;
    if (result.error) throw result.error;
    if ((result.data || []).length) throw new Error('Ya existe otro Tipo de Servicio con ese código interno.');
  }

  async function syncTariffLink(conceptId, selectedTypeId) {
    const nonSelected = S.tariffTypes.filter(type => String(type.tariff_type_id) !== String(selectedTypeId));
    for (const type of nonSelected) {
      const ids = new Set((type.services || []).map(item => String(item.concept_id)));
      if (!ids.delete(String(conceptId))) continue;
      const update = await _db.rpc('save_tariff_type_config', { p_payload: {
        tariff_type_id: type.tariff_type_id,
        name: type.name,
        description: type.description || null,
        adds_km: Boolean(type.adds_km),
        is_active: type.is_active !== false,
        sort_order: type.sort_order || 100,
        service_ids: [...ids],
      }});
      if (update.error) throw update.error;
    }
    if (!selectedTypeId) return;
    const type = S.tariffTypes.find(item => String(item.tariff_type_id) === String(selectedTypeId));
    if (!type) throw new Error('El Tipo de tarifa seleccionado ya no existe.');
    const ids = new Set((type.services || []).map(item => String(item.concept_id)));
    ids.add(String(conceptId));
    const update = await _db.rpc('save_tariff_type_config', { p_payload: {
      tariff_type_id: type.tariff_type_id,
      name: type.name,
      description: type.description || null,
      adds_km: Boolean(type.adds_km),
      is_active: type.is_active !== false,
      sort_order: type.sort_order || 100,
      service_ids: [...ids],
    }});
    if (update.error) throw update.error;
  }

  async function save() {
    if (!canWrite() || S.saving) return;
    const name = input('stc-name').trim();
    const code = input('stc-code').trim().toLowerCase();
    if (!name || !code) return setFormError('Completá Nombre y Código interno.');
    const selectedTypeId = input('stc-tariff-type') || null;
    const selectedType = S.tariffTypes.find(item => String(item.tariff_type_id) === String(selectedTypeId));
    const addsKm = checked('stc-adds-km');
    const billingFamily = selectedType?.code === 'movement' ? 'primary' : selectedType?.code === 'sale' ? 'sale' : 'variable';
    const payload = {
      concept_id: S.editingId,
      name,
      code,
      description: input('stc-description').trim() || null,
      icon: input('stc-icon').trim() || '⚙',
      category: input('stc-category') || 'secondary',
      pricing_unit: input('stc-unit') || 'service',
      is_active: checked('stc-active'),
      billing_family: billingFamily,
      distance_chargeable: addsKm,
      vehicle_class: S.services.find(item => String(item.concept_id) === String(S.editingId))?.vehicle_class || null,
      sort_order: S.services.find(item => String(item.concept_id) === String(S.editingId))?.sort_order || 300,
    };
    const button = document.getElementById('stc-save');
    S.saving = true; setFormError('');
    if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
    try {
      await ensureUniqueCode(code, S.editingId);
      const result = await _db.rpc('save_service_type_config', { p_payload: payload });
      if (result.error) throw result.error;
      const conceptId = result.data?.concept_id || S.editingId;
      if (!conceptId) throw new Error('Supabase no devolvió el identificador del servicio.');
      // El RPC legado no actualiza `code` cuando se edita; el CRUD canónico sí debe hacerlo.
      if (S.editingId) {
        const codeUpdate = await _db.from('service_concepts').update({ code }).eq('concept_id', conceptId);
        if (codeUpdate.error) throw codeUpdate.error;
      }
      await syncTariffLink(conceptId, selectedTypeId);
      // save_tariff_type_config puede derivar distance_chargeable por familia; respetamos la decisión explícita del Tipo de Servicio.
      const finalUpdate = await _db.from('service_concepts').update({ distance_chargeable: addsKm }).eq('concept_id', conceptId);
      if (finalUpdate.error) throw finalUpdate.error;
      closeModalCrud();
      notify(S.editingId ? 'Tipo de Servicio actualizado' : 'Tipo de Servicio creado', 'success');
      await load(true);
      window.AuxiliosCompanyServicesV3?.invalidate?.();
    } catch (error) {
      setFormError(error?.message || 'No se pudo guardar el Tipo de Servicio.');
    } finally {
      S.saving = false;
      if (button) { button.disabled = false; button.textContent = 'Guardar tipo de servicio'; }
    }
  }

  async function removeService(id) {
    if (!canWrite()) return notify('Solo Administración puede eliminar Tipos de Servicio', 'error');
    const row = S.services.find(service => String(service.concept_id) === String(id));
    if (!row) return notify('El Tipo de Servicio ya no existe', 'error');
    if (!window.confirm(`¿Eliminar “${row.name}”?\n\nSi ya fue utilizado en servicios o tarifas históricas, AuxiliOS lo desactivará para preservar el historial.`)) return;
    try {
      const deletion = await _db.from('service_concepts').delete().eq('concept_id', id).select('concept_id');
      if (deletion.error) {
        const fkBlocked = deletion.error.code === '23503' || /foreign key|violates|referenced/i.test(deletion.error.message || '');
        if (!fkBlocked) throw deletion.error;
        const payload = {
          concept_id: row.concept_id,
          name: row.name,
          code: row.code,
          description: row.description || null,
          icon: row.icon || '⚙',
          category: row.category || 'secondary',
          pricing_unit: row.pricing_unit || 'service',
          is_active: false,
          billing_family: row.billing_family || 'variable',
          distance_chargeable: Boolean(row.distance_chargeable),
          vehicle_class: row.vehicle_class || null,
          sort_order: row.sort_order || 300,
        };
        const archived = await _db.rpc('save_service_type_config', { p_payload: payload });
        if (archived.error) throw archived.error;
        notify('El servicio tiene historial asociado: se desactivó en lugar de borrarse', 'warning');
      } else {
        notify('Tipo de Servicio eliminado', 'success');
      }
      await load(true);
      window.AuxiliosCompanyServicesV3?.invalidate?.();
    } catch (error) {
      notify(error?.message || 'No se pudo eliminar el Tipo de Servicio', 'error');
    }
  }

  function activateScreenWatcher() {
    const screen = document.getElementById('screen-config-service-types');
    if (!screen || screen.dataset.stcWatcher) return;
    screen.dataset.stcWatcher = '1';
    new MutationObserver(() => {
      if (screen.classList.contains('active')) load(true);
    }).observe(screen, { attributes: true, attributeFilter: ['class'] });
  }

  function init() {
    injectStyles();
    if (!renderShell()) return;
    ensureModal();
    activateScreenWatcher();
    S.initialized = true;
    if (document.getElementById('screen-config-service-types')?.classList.contains('active')) load(true);
    else if (canRead()) load(true);
  }

  window.addEventListener('auxilios:profile-ready', () => {
    renderShell(); ensureModal(); activateScreenWatcher(); load(true);
  });

  window.AuxiliosServiceTypesCatalogV1 = { load, openEditor, removeService, state: S };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();
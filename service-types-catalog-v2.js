/* AuxiliOS · Tipos de Servicio v2 · CRUD canónico */
(() => {
  'use strict';

  const S = { services: [], tariffTypes: [], editingId: null, loading: false, saving: false };
  const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const profile = () => typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : (window.PERFIL_USUARIO || {});
  const role = () => norm(profile()?.roles?.name || profile()?.role?.name || profile()?.role || profile()?.role_name || '');
  const canRead = () => ['administracion','facturacion','supervision'].includes(role());
  const canWrite = () => role() === 'administracion';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const notify = (m,t='info') => typeof toast === 'function' ? toast(m,t) : console[t === 'error' ? 'error' : 'log'](m);
  const value = id => document.getElementById(id)?.value ?? '';
  const checked = id => Boolean(document.getElementById(id)?.checked);
  const categoryLabel = v => ({primary:'Primario',secondary:'Secundario',mixed:'Mixto'}[v] || v || '—');
  const unitLabel = v => ({service:'Por servicio',hour:'Por hora',unit:'Por unidad',day:'Por día',fixed:'Monto fijo',km:'Por km'}[v] || v || '—');

  function injectCss() {
    if (document.getElementById('service-types-catalog-v2-css')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="service-types-catalog-v2-css">
      .st2-shell{display:grid;gap:14px}.st2-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.st2-head h2{margin:0}.st2-head p{margin:5px 0 0;color:var(--muted2);font-size:11px;line-height:1.45;max-width:760px}
      .st2-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 180px auto;gap:9px}.st2-panel{border:1px solid var(--border);border-radius:12px;background:var(--panel);overflow:hidden}.st2-table-wrap{overflow:auto}.st2-table{width:100%;border-collapse:collapse}.st2-table th,.st2-table td{padding:11px 12px;border-bottom:1px solid var(--border);text-align:left;vertical-align:middle;font-size:10px}.st2-table th{font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.st2-table strong{display:block;font-size:11px;color:var(--text)}.st2-table small{display:block;margin-top:3px;color:var(--muted2);font-size:9px}
      .st2-chip{display:inline-flex;align-items:center;padding:3px 7px;border:1px solid var(--border2);border-radius:999px;font-size:9px;color:var(--muted2);white-space:nowrap}.st2-chip.ok{border-color:rgba(39,196,122,.32);color:var(--green)}.st2-chip.off{border-color:rgba(226,80,74,.30);color:var(--red)}.st2-chip.kind{border-color:rgba(155,109,255,.32);color:var(--purple)}.st2-chip.km{border-color:rgba(46,196,214,.35);color:var(--cyan)}
      .st2-actions{display:flex;gap:6px;justify-content:flex-end}.st2-action{border:1px solid var(--border2);background:var(--bg);color:var(--text);border-radius:7px;padding:6px 8px;font-size:9px;cursor:pointer}.st2-action.danger{color:var(--red);border-color:rgba(226,80,74,.28)}.st2-empty,.st2-error{padding:22px;text-align:center;color:var(--muted2);font-size:11px}.st2-error{color:var(--red)}
      .st2-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.st2-kpi{padding:11px 12px;border:1px solid var(--border);border-radius:9px;background:var(--panel)}.st2-kpi small{display:block;font-size:8px;text-transform:uppercase;color:var(--muted)}.st2-kpi b{display:block;margin-top:4px;font-size:17px;color:var(--text)}
      .st2-modal{width:min(820px,calc(100vw - 24px));max-width:820px}.st2-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.st2-field{display:grid;gap:6px}.st2-field.full{grid-column:1/-1}.st2-field>span{font-size:9px;font-weight:750;letter-spacing:.04em;text-transform:uppercase;color:var(--muted2)}.st2-check{display:flex;align-items:center;gap:8px;font-size:10px;color:var(--text)}.st2-check input{accent-color:var(--amber)}.st2-help{margin-top:10px;padding:9px 11px;border:1px solid var(--border);border-radius:8px;background:var(--bg);font-size:9px;line-height:1.45;color:var(--muted2)}.st2-readonly{padding:10px 12px;border:1px solid rgba(245,166,35,.28);border-radius:9px;background:rgba(245,166,35,.06);color:var(--muted2);font-size:10px}
      @media(max-width:760px){.st2-toolbar,.st2-grid,.st2-kpis{grid-template-columns:1fr}.st2-head{display:grid}}
    </style>`);
  }

  function ensureModal() {
    document.getElementById('modal-config-service-type')?.remove();
    document.getElementById('modal-service-type-crud-v1')?.remove();
    if (document.getElementById('modal-service-type-crud-v2')) return;
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-service-type-crud-v2"><div class="modal-box st2-modal">
      <div class="modal-head"><span class="modal-head-title" id="st2-modal-title">Nuevo tipo de servicio</span><button class="modal-close" type="button" data-st2-close>×</button></div>
      <div class="modal-body"><div class="st2-grid">
        <label class="st2-field"><span>Nombre *</span><input class="form-input" id="st2-name"></label>
        <label class="st2-field"><span>Código interno *</span><input class="form-input" id="st2-code"></label>
        <label class="st2-field"><span>Ícono</span><input class="form-input" id="st2-icon" maxlength="4"></label>
        <label class="st2-field full"><span>Descripción operativa</span><input class="form-input" id="st2-description"></label>
        <label class="st2-field"><span>Carácter</span><select class="form-input" id="st2-category"><option value="primary">Primario</option><option value="secondary">Secundario</option><option value="mixed">Mixto</option></select></label>
        <label class="st2-field"><span>Tipo de tarifa</span><select class="form-input" id="st2-tariff-type"></select></label>
        <label class="st2-field"><span>Unidad predeterminada</span><select class="form-input" id="st2-unit"><option value="service">Por servicio</option><option value="hour">Por hora</option><option value="unit">Por unidad</option><option value="day">Por día</option><option value="fixed">Monto fijo</option><option value="km">Por km</option></select></label>
      </div><div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:14px"><label class="st2-check"><input type="checkbox" id="st2-adds-km"><span>Suma kilómetros</span></label><label class="st2-check"><input type="checkbox" id="st2-active" checked><span>Servicio activo</span></label></div>
      <div class="st2-help">El Tipo de Servicio define su carácter, unidad y si suma kilómetros. Después, cada prestadora decide si lo habilita y recién entonces se tarifa.</div><div class="modal-error" id="st2-error" style="display:none"></div></div>
      <div class="modal-footer"><button class="btn btn-ghost" type="button" data-st2-close>Cancelar</button><button class="btn btn-primary" id="st2-save" type="button">Guardar tipo de servicio</button></div>
    </div></div>`);
    document.querySelectorAll('[data-st2-close]').forEach(b => b.addEventListener('click', closeEditor));
    document.getElementById('st2-save')?.addEventListener('click', save);
  }

  function renderScreen() {
    const screen = document.getElementById('screen-config-service-types');
    if (!screen) return false;
    screen.innerHTML = `<div class="st2-shell"><div class="st2-head"><div><h2>Tipos de servicio</h2><p>Catálogo maestro global. Desde acá podés leer, crear, modificar y eliminar tipos de servicio.</p></div>${canWrite() ? '<button class="btn btn-primary" id="st2-new" type="button">＋ Nuevo servicio</button>' : ''}</div>${canRead() && !canWrite() ? '<div class="st2-readonly">Acceso de consulta. Solo Administración puede modificar el catálogo.</div>' : ''}<div class="st2-kpis" id="st2-kpis"></div><div class="st2-toolbar"><input class="form-input" id="st2-search" placeholder="Buscar por nombre, código o descripción"><select class="form-input" id="st2-filter"><option value="active">Activos</option><option value="all">Todos</option><option value="primary">Primarios</option><option value="secondary">Secundarios</option><option value="mixed">Mixtos</option><option value="inactive">Inactivos</option></select><button class="btn btn-ghost" id="st2-refresh" type="button">↻ Actualizar</button></div><div class="st2-panel"><div class="st2-table-wrap"><table class="st2-table"><thead><tr><th>Servicio</th><th>Código</th><th>Carácter</th><th>Tipo de tarifa</th><th>Unidad</th><th>KM</th><th>Estado</th><th style="text-align:right">Acciones</th></tr></thead><tbody id="st2-body"><tr><td colspan="8"><div class="st2-empty">Cargando servicios…</div></td></tr></tbody></table></div></div></div>`;
    document.getElementById('st2-new')?.addEventListener('click', () => openEditor());
    document.getElementById('st2-refresh')?.addEventListener('click', () => load(true));
    document.getElementById('st2-search')?.addEventListener('input', renderRows);
    document.getElementById('st2-filter')?.addEventListener('change', renderRows);
    return true;
  }

  function setError(message='') { const el=document.getElementById('st2-error'); if(el){el.textContent=message?`⚠ ${message}`:'';el.style.display=message?'block':'none';} }

  async function load(force=false) {
    if (!canRead()) {
      const body=document.getElementById('st2-body'); if(body) body.innerHTML='<tr><td colspan="8"><div class="st2-error">Sin permiso para consultar Tipos de Servicio.</div></td></tr>';
      return;
    }
    if (S.loading && !force) return;
    S.loading=true;
    try {
      const [services,types]=await Promise.all([_db.rpc('list_service_types_config',{p_include_inactive:true}),_db.rpc('list_tariff_types_config')]);
      if(services.error) throw services.error; if(types.error) throw types.error;
      S.services=Array.isArray(services.data)?services.data:[]; S.tariffTypes=Array.isArray(types.data)?types.data:[]; renderRows();
    } catch(error) {
      const body=document.getElementById('st2-body'); if(body) body.innerHTML=`<tr><td colspan="8"><div class="st2-error">${esc(error?.message||'No se pudieron leer los Tipos de Servicio.')}</div></td></tr>`;
      notify(error?.message||'No se pudieron leer los Tipos de Servicio','error');
    } finally { S.loading=false; }
  }

  function renderRows() {
    const body=document.getElementById('st2-body'); if(!body)return;
    const q=String(document.getElementById('st2-search')?.value||'').trim().toLowerCase(); const f=document.getElementById('st2-filter')?.value||'active';
    const rows=S.services.filter(s=>{if(f==='active'&&s.is_active===false)return false;if(f==='inactive'&&s.is_active!==false)return false;if(['primary','secondary','mixed'].includes(f)&&s.category!==f)return false;return !q||`${s.name} ${s.code} ${s.description||''}`.toLowerCase().includes(q);});
    const k=document.getElementById('st2-kpis'); if(k)k.innerHTML=`<div class="st2-kpi"><small>Total</small><b>${S.services.length}</b></div><div class="st2-kpi"><small>Activos</small><b>${S.services.filter(s=>s.is_active!==false).length}</b></div><div class="st2-kpi"><small>Primarios</small><b>${S.services.filter(s=>s.is_active!==false&&s.category==='primary').length}</b></div><div class="st2-kpi"><small>Secundarios</small><b>${S.services.filter(s=>s.is_active!==false&&s.category==='secondary').length}</b></div>`;
    body.innerHTML=rows.length?rows.map(s=>{const t=(s.tariff_types||[])[0];return `<tr><td><strong>${esc(s.name)}</strong><small>${esc(s.description||'')}</small></td><td>${esc(s.code)}</td><td><span class="st2-chip kind">${esc(categoryLabel(s.category))}</span></td><td>${t?`<span class="st2-chip">${esc(t.name)}</span>`:'<span class="st2-chip">Sin asociar</span>'}</td><td>${esc(unitLabel(s.pricing_unit))}</td><td><span class="st2-chip ${s.distance_chargeable?'km':''}">${s.distance_chargeable?'Suma KM':'No suma'}</span></td><td><span class="st2-chip ${s.is_active!==false?'ok':'off'}">${s.is_active!==false?'Activo':'Inactivo'}</span></td><td><div class="st2-actions">${canWrite()?`<button class="st2-action" data-st2-edit="${esc(s.concept_id)}" type="button">Editar</button><button class="st2-action danger" data-st2-delete="${esc(s.concept_id)}" type="button">Eliminar</button>`:'—'}</div></td></tr>`}).join(''):'<tr><td colspan="8"><div class="st2-empty">No hay servicios para mostrar.</div></td></tr>';
    body.querySelectorAll('[data-st2-edit]').forEach(b=>b.addEventListener('click',()=>openEditor(b.dataset.st2Edit)));
    body.querySelectorAll('[data-st2-delete]').forEach(b=>b.addEventListener('click',()=>removeService(b.dataset.st2Delete)));
  }

  function fillTypes(selected='') { const el=document.getElementById('st2-tariff-type'); if(el)el.innerHTML='<option value="">Sin tipo de tarifa</option>'+S.tariffTypes.filter(t=>t.is_active!==false||String(t.tariff_type_id)===String(selected)).map(t=>`<option value="${esc(t.tariff_type_id)}" ${String(t.tariff_type_id)===String(selected)?'selected':''}>${esc(t.name)}</option>`).join(''); }

  function openEditor(id=null) {
    if(!canWrite())return notify('Solo Administración puede modificar Tipos de Servicio','error'); ensureModal();
    const row=id?S.services.find(s=>String(s.concept_id)===String(id)):null; S.editingId=row?.concept_id||null;
    document.getElementById('st2-modal-title').textContent=row?'Editar tipo de servicio':'Nuevo tipo de servicio';
    document.getElementById('st2-name').value=row?.name||'';document.getElementById('st2-code').value=row?.code||'';document.getElementById('st2-code').disabled=false;document.getElementById('st2-icon').value=row?.icon||'⚙';document.getElementById('st2-description').value=row?.description||'';document.getElementById('st2-category').value=row?.category||'secondary';document.getElementById('st2-unit').value=row?.pricing_unit||'service';document.getElementById('st2-adds-km').checked=Boolean(row?.distance_chargeable);document.getElementById('st2-active').checked=row?.is_active!==false;fillTypes(row?.tariff_types?.[0]?.tariff_type_id||'');setError('');
    typeof openModal==='function'?openModal('modal-service-type-crud-v2'):document.getElementById('modal-service-type-crud-v2')?.classList.add('open');
  }

  function closeEditor(){typeof closeModal==='function'?closeModal('modal-service-type-crud-v2'):document.getElementById('modal-service-type-crud-v2')?.classList.remove('open');S.editingId=null;}

  async function syncTariffLink(conceptId,selectedId){
    for(const t of S.tariffTypes.filter(t=>String(t.tariff_type_id)!==String(selectedId))){const ids=new Set((t.services||[]).map(x=>String(x.concept_id)));if(!ids.delete(String(conceptId)))continue;const r=await _db.rpc('save_tariff_type_config',{p_payload:{tariff_type_id:t.tariff_type_id,name:t.name,description:t.description||null,adds_km:Boolean(t.adds_km),is_active:t.is_active!==false,sort_order:t.sort_order||100,service_ids:[...ids]}});if(r.error)throw r.error;}
    if(!selectedId)return;const t=S.tariffTypes.find(x=>String(x.tariff_type_id)===String(selectedId));if(!t)throw new Error('El Tipo de tarifa seleccionado ya no existe.');const ids=new Set((t.services||[]).map(x=>String(x.concept_id)));ids.add(String(conceptId));const r=await _db.rpc('save_tariff_type_config',{p_payload:{tariff_type_id:t.tariff_type_id,name:t.name,description:t.description||null,adds_km:Boolean(t.adds_km),is_active:t.is_active!==false,sort_order:t.sort_order||100,service_ids:[...ids]}});if(r.error)throw r.error;
  }

  async function save(){
    if(!canWrite()||S.saving)return;const name=value('st2-name').trim(),code=value('st2-code').trim().toLowerCase();if(!name||!code)return setError('Completá Nombre y Código interno.');
    const selectedId=value('st2-tariff-type')||null,selected=S.tariffTypes.find(t=>String(t.tariff_type_id)===String(selectedId)),addsKm=checked('st2-adds-km'),current=S.services.find(s=>String(s.concept_id)===String(S.editingId));
    const payload={concept_id:S.editingId,name,code,description:value('st2-description').trim()||null,icon:value('st2-icon').trim()||'⚙',category:value('st2-category')||'secondary',pricing_unit:value('st2-unit')||'service',is_active:checked('st2-active'),billing_family:selected?.code==='movement'?'primary':selected?.code==='sale'?'sale':'variable',distance_chargeable:addsKm,vehicle_class:current?.vehicle_class||null,sort_order:current?.sort_order||300};
    const button=document.getElementById('st2-save');S.saving=true;setError('');if(button){button.disabled=true;button.textContent='Guardando…';}
    try{
      const saved=await _db.rpc('save_service_type_config',{p_payload:payload});if(saved.error)throw saved.error;const id=saved.data?.concept_id||S.editingId;if(!id)throw new Error('Supabase no devolvió el identificador del servicio.');
      await syncTariffLink(id,selectedId);
      // La asociación tarifaria puede derivar atributos; una segunda escritura deja como fuente final al Tipo de Servicio.
      const final=await _db.rpc('save_service_type_config',{p_payload:{...payload,concept_id:id}});if(final.error)throw final.error;
      const wasEdit=Boolean(S.editingId);closeEditor();notify(wasEdit?'Tipo de Servicio actualizado':'Tipo de Servicio creado','success');await load(true);window.AuxiliosCompanyServicesV3?.invalidate?.();
    }catch(error){const msg=error?.code==='23505'?'Ya existe un Tipo de Servicio con ese código interno.':(error?.message||'No se pudo guardar el Tipo de Servicio.');setError(msg);}finally{S.saving=false;if(button){button.disabled=false;button.textContent='Guardar tipo de servicio';}}
  }

  async function removeService(id){
    if(!canWrite())return notify('Solo Administración puede eliminar Tipos de Servicio','error');const row=S.services.find(s=>String(s.concept_id)===String(id));if(!row)return notify('El Tipo de Servicio ya no existe','error');
    if(!window.confirm(`¿Eliminar “${row.name}”?\n\nSi ya tiene uso histórico, AuxiliOS lo desactivará automáticamente para preservar trazabilidad.`))return;
    try{const result=await _db.rpc('delete_service_type_config',{p_concept_id:id});if(result.error)throw result.error;if(result.data?.archived)notify('El servicio tiene historial: se desactivó y dejó de estar disponible para nuevas configuraciones','warning');else notify('Tipo de Servicio eliminado','success');await load(true);window.AuxiliosCompanyServicesV3?.invalidate?.();}catch(error){notify(error?.message||'No se pudo eliminar el Tipo de Servicio','error');}
  }

  function watch(){const screen=document.getElementById('screen-config-service-types');if(!screen||screen.dataset.st2Watcher)return;screen.dataset.st2Watcher='1';new MutationObserver(()=>{if(screen.classList.contains('active'))load(true);}).observe(screen,{attributes:true,attributeFilter:['class']});}
  function init(){injectCss();if(!renderScreen())return;ensureModal();watch();if(canRead())load(true);}
  window.addEventListener('auxilios:profile-ready',()=>{renderScreen();ensureModal();watch();load(true);});
  window.AuxiliosServiceTypesCatalogV2={load,openEditor,removeService,state:S};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();
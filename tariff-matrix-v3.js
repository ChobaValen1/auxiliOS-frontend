/* AuxiliOS · Configuración Tarifario V3 · Categoría × Concepto */
(()=>{'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(v,c='ARS')=>new Intl.NumberFormat('es-AR',{style:'currency',currency:c||'ARS',maximumFractionDigits:2}).format(Number(v)||0);
const role=()=>String(typeof PERFIL_USUARIO==='undefined'?'':(PERFIL_USUARIO?.roles?.name||PERFIL_USUARIO?.role||'')).toLowerCase();
const canRead=()=>['administracion','facturacion','supervision'].includes(role());
const canWrite=()=>role()==='administracion';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const S={categories:[],concepts:[],types:[],companies:[],matrix:null,companyId:'',baseId:'',asOf:today(),bases:[],editCategory:null,editConcept:null,editRate:null,busy:false};
const unitLabel=u=>({service:'servicio',fixed:'servicio',unit:'unidad',km:'km',hour:'hora',day:'día'})[u]||u||'unidad';
const sourceLabel=s=>({manual:'Cantidad manual',one:'1 unidad',asphalt_km:'KM Asfalto',gravel_km:'KM Ripio'})[s]||s;
const notify=(m,t='info')=>typeof toast==='function'?toast(m,t):console.log(m);
function open(id){document.getElementById(id)?.classList.add('open')}
function close(id){document.getElementById(id)?.classList.remove('open')}
function setErr(id,msg=''){const e=document.getElementById(id);if(e){e.textContent=msg;e.hidden=!msg}}

function catalogScreen(){return`<div class="tmv3">
 <div class="tmv3-head"><div><h2>Categorías y conceptos</h2><p>Se crean una vez y se reutilizan en todas las prestadoras.</p></div></div>
 <div id="tmv3-catalog-error" class="tmv3-error" hidden></div>
 <div class="tmv3-grid2">
  <section class="tmv3-card"><div class="tmv3-card-head"><h3>Categorías</h3><button type="button" data-tmv3="new-category" ${canWrite()?'':'disabled'}>＋ Categoría</button></div><div id="tmv3-categories"></div></section>
  <section class="tmv3-card"><div class="tmv3-card-head"><h3>Conceptos tarifarios</h3><button type="button" data-tmv3="new-concept" ${canWrite()?'':'disabled'}>＋ Concepto</button></div><div id="tmv3-concepts"></div></section>
 </div>
</div>`}
function matrixScreen(){return`<div class="tmv3">
 <div class="tmv3-head"><div><h2>Tarifarios por prestadora</h2><p>Cada celda combina Categoría + Concepto. La tarifa se versiona por vigencia.</p></div></div>
 <div id="tmv3-matrix-error" class="tmv3-error" hidden></div>
 <div class="tmv3-toolbar">
  <label><span>Prestadora</span><select id="tmv3-company"><option value="">Seleccionar prestadora</option></select></label>
  <label><span>Base</span><select id="tmv3-base"><option value="">Tarifa general</option></select></label>
  <label><span>Vigencia a consultar</span><input id="tmv3-asof" type="date" value="${esc(S.asOf)}"></label>
  <button type="button" data-tmv3="provider-settings" ${canWrite()?'':'disabled'}>Configurar prestadora</button>
 </div>
 <div id="tmv3-matrix"><div class="tmv3-empty">Seleccioná una prestadora.</div></div>
</div>`}
function modals(){return`
<div class="tmv3-modal" id="tmv3-category-modal"><div class="tmv3-dialog"><h3 id="tmv3-category-title">Categoría</h3><p>Ej.: Liviano, Semipesado, UML o Pesado.</p><div id="tmv3-category-error" class="tmv3-error" hidden></div><div class="tmv3-form-grid">
 <label><span>Nombre *</span><input id="tmv3-category-name"></label><label><span>Orden</span><input id="tmv3-category-order" type="number" min="0" step="1"></label>
 <label class="full"><span>Descripción</span><textarea id="tmv3-category-desc" rows="2"></textarea></label><label class="tmv3-check full"><input id="tmv3-category-active" type="checkbox" checked><span>Activa</span></label>
</div><div class="tmv3-modal-actions"><button type="button" data-tmv3-close="tmv3-category-modal">Cancelar</button><button type="button" class="primary" data-tmv3="save-category">Guardar</button></div></div></div>
<div class="tmv3-modal" id="tmv3-concept-modal"><div class="tmv3-dialog"><h3 id="tmv3-concept-title">Concepto</h3><p>Todos los conceptos se calculan como cantidad × precio unitario.</p><div id="tmv3-concept-error" class="tmv3-error" hidden></div><div class="tmv3-form-grid">
 <label><span>Nombre *</span><input id="tmv3-concept-name"></label><label><span>Grupo *</span><select id="tmv3-concept-type"></select></label>
 <label><span>Unidad por defecto</span><select id="tmv3-concept-unit"><option value="unit">Unidad</option><option value="service">Servicio</option><option value="hour">Hora</option><option value="km">KM</option><option value="day">Día</option><option value="fixed">Fijo</option></select></label>
 <label><span>Origen de cantidad</span><select id="tmv3-concept-source"><option value="manual">Cantidad manual</option><option value="one">1 unidad</option><option value="asphalt_km">KM Asfalto</option><option value="gravel_km">KM Ripio</option></select></label>
 <label class="tmv3-check"><input id="tmv3-concept-auto" type="checkbox"><span>Agregar automáticamente al servicio</span></label><label class="tmv3-check"><input id="tmv3-concept-active" type="checkbox" checked><span>Activo</span></label>
 <label class="full"><span>Descripción</span><textarea id="tmv3-concept-desc" rows="2"></textarea></label><div class="tmv3-help full">Para conceptos normales como Extracción o Espera, dejá “Cantidad manual”. Movida/KM pueden tomar su cantidad automáticamente.</div>
</div><div class="tmv3-modal-actions"><button type="button" data-tmv3-close="tmv3-concept-modal">Cancelar</button><button type="button" class="primary" data-tmv3="save-concept">Guardar</button></div></div></div>
<div class="tmv3-modal" id="tmv3-provider-modal"><div class="tmv3-dialog wide"><h3>Configurar prestadora</h3><p>Definí qué categorías y conceptos usa esta empresa. El código propio se define por prestadora + concepto.</p><div id="tmv3-provider-error" class="tmv3-error" hidden></div><div id="tmv3-provider-body"></div><div class="tmv3-modal-actions"><button type="button" data-tmv3-close="tmv3-provider-modal">Cancelar</button><button type="button" class="primary" data-tmv3="save-provider">Guardar configuración</button></div></div></div>
<div class="tmv3-modal" id="tmv3-rate-modal"><div class="tmv3-dialog"><h3 id="tmv3-rate-title">Tarifa</h3><p id="tmv3-rate-subtitle"></p><div id="tmv3-rate-error" class="tmv3-error" hidden></div><div class="tmv3-form-grid">
 <label><span>Precio unitario *</span><input id="tmv3-rate-price" type="number" min="0" step="0.01"></label><label><span>Unidad *</span><select id="tmv3-rate-unit"><option value="unit">Unidad</option><option value="service">Servicio</option><option value="hour">Hora</option><option value="km">KM</option><option value="day">Día</option><option value="fixed">Fijo</option></select></label>
 <label><span>Vigencia desde *</span><input id="tmv3-rate-from" type="date"></label><label><span>Vigencia hasta</span><input id="tmv3-rate-until" type="date"></label>
 <label class="full"><span>Motivo / referencia *</span><input id="tmv3-rate-reason" placeholder="Ej.: Nuevo tarifario agosto 2026"></label><div class="tmv3-help full">Si no indicás fecha final, se mantiene vigente hasta que una nueva tarifa la reemplace.</div>
</div><div class="tmv3-modal-actions"><button type="button" data-tmv3="rate-history">Ver historial</button><button type="button" data-tmv3-close="tmv3-rate-modal">Cancelar</button><button type="button" class="primary" data-tmv3="save-rate">Crear versión</button></div></div></div>
<div class="tmv3-modal" id="tmv3-history-modal"><div class="tmv3-dialog wide"><h3 id="tmv3-history-title">Historial de tarifa</h3><p>Las versiones históricas no se reescriben.</p><div id="tmv3-history-body"></div><div class="tmv3-modal-actions"><button type="button" data-tmv3-close="tmv3-history-modal">Cerrar</button></div></div></div>`}

function inject(){
 const service=document.getElementById('screen-config-service-types'),matrix=document.getElementById('screen-config-tariff-matrix');if(!service||!matrix)return false;
 if(document.getElementById('tmv3-company'))return true;
 const nav=document.querySelector('#nav-config-service-types .nav-label');if(nav)nav.textContent='Categorías y conceptos';
 const tnav=document.querySelector('#nav-config-tariff-matrix .nav-label');if(tnav)tnav.textContent='Tarifarios';
 service.innerHTML=catalogScreen();matrix.innerHTML=matrixScreen();
 if(!document.getElementById('tmv3-category-modal'))document.body.insertAdjacentHTML('beforeend',modals());
 bind();loadCatalog();return true;
}
function bind(){
 document.addEventListener('click',async e=>{
  const closeId=e.target?.dataset?.tmv3Close;if(closeId){close(closeId);return;}
  const a=e.target?.closest?.('[data-tmv3]')?.dataset?.tmv3;if(!a)return;
  if(a==='new-category')return editCategory();if(a==='edit-category')return editCategory(e.target.closest('[data-category-id]')?.dataset.categoryId);
  if(a==='save-category')return saveCategory();if(a==='new-concept')return editConcept();if(a==='edit-concept')return editConcept(e.target.closest('[data-concept-id]')?.dataset.conceptId);
  if(a==='save-concept')return saveConcept();if(a==='provider-settings')return openProvider();if(a==='save-provider')return saveProvider();
  if(a==='edit-rate'){const b=e.target.closest('[data-category-id][data-concept-id]');return editRate(b?.dataset.categoryId,b?.dataset.conceptId);}
  if(a==='save-rate')return saveRate();if(a==='rate-history')return openHistory();
 });
 document.getElementById('tmv3-company')?.addEventListener('change',e=>selectCompany(e.target.value));
 document.getElementById('tmv3-base')?.addEventListener('change',e=>{S.baseId=e.target.value;loadMatrix()});
 document.getElementById('tmv3-asof')?.addEventListener('change',e=>{S.asOf=e.target.value||today();loadMatrix()});
}
async function loadCatalog(){
 if(!canRead())return;
 setErr('tmv3-catalog-error','');
 const [cats,concepts,types,companies]=await Promise.all([
  _db.rpc('list_service_categories_v3',{p_include_inactive:true}),_db.rpc('list_tariff_concepts_v3',{p_include_inactive:true}),
  _db.rpc('list_tariff_types_config'),_db.from('companies').select('company_id,trade_name,legal_name,status').eq('status','active').order('trade_name')
 ]);
 if(cats.error||concepts.error||types.error||companies.error){setErr('tmv3-catalog-error',(cats.error||concepts.error||types.error||companies.error)?.message||'No se pudo cargar la configuración.');return;}
 S.categories=cats.data||[];S.concepts=concepts.data||[];S.types=types.data||[];S.companies=companies.data||[];renderCatalog();renderCompanyOptions();
}
function renderCatalog(){
 const cbox=document.getElementById('tmv3-categories'),xbox=document.getElementById('tmv3-concepts');if(!cbox||!xbox)return;
 cbox.innerHTML=S.categories.length?`<table class="tmv3-table"><thead><tr><th>Categoría</th><th>Estado</th><th></th></tr></thead><tbody>${S.categories.map(c=>`<tr data-category-id="${esc(c.category_id)}"><td><strong>${esc(c.name)}</strong>${c.description?`<div class="tmv3-muted">${esc(c.description)}</div>`:''}</td><td><span class="tmv3-badge ${c.is_active?'on':''}">${c.is_active?'Activa':'Inactiva'}</span></td><td><button type="button" data-tmv3="edit-category" ${canWrite()?'':'disabled'}>Editar</button></td></tr>`).join('')}</tbody></table>`:'<div class="tmv3-empty">No hay categorías.</div>';
 xbox.innerHTML=S.concepts.length?`<table class="tmv3-table"><thead><tr><th>Concepto</th><th>Grupo</th><th>Unidad</th><th>Cantidad</th><th></th></tr></thead><tbody>${S.concepts.map(c=>`<tr data-concept-id="${esc(c.concept_id)}"><td><strong>${esc(c.name)}</strong>${c.description?`<div class="tmv3-muted">${esc(c.description)}</div>`:''}</td><td><span class="tmv3-badge">${esc(c.tariff_type_name||'—')}</span></td><td>${esc(unitLabel(c.pricing_unit))}</td><td>${esc(sourceLabel(c.quantity_source))}${c.auto_apply?' · auto':''}</td><td><button type="button" data-tmv3="edit-concept" ${canWrite()?'':'disabled'}>Editar</button></td></tr>`).join('')}</tbody></table>`:'<div class="tmv3-empty">No hay conceptos.</div>';
}
function renderCompanyOptions(){const e=document.getElementById('tmv3-company');if(!e)return;e.innerHTML='<option value="">Seleccionar prestadora</option>'+S.companies.map(c=>`<option value="${esc(c.company_id)}">${esc(c.trade_name||c.legal_name||'Prestadora')}</option>`).join('');e.value=S.companyId||'';}

function editCategory(id=''){
 S.editCategory=S.categories.find(x=>String(x.category_id)===String(id))||null;setErr('tmv3-category-error','');
 document.getElementById('tmv3-category-title').textContent=S.editCategory?'Editar categoría':'Nueva categoría';document.getElementById('tmv3-category-name').value=S.editCategory?.name||'';document.getElementById('tmv3-category-desc').value=S.editCategory?.description||'';document.getElementById('tmv3-category-order').value=S.editCategory?.sort_order??100;document.getElementById('tmv3-category-active').checked=S.editCategory?.is_active!==false;open('tmv3-category-modal');
}
async function saveCategory(){
 const name=document.getElementById('tmv3-category-name').value.trim();if(!name)return setErr('tmv3-category-error','Ingresá el nombre.');
 const {error}=await _db.rpc('save_service_category_v3',{p_payload:{category_id:S.editCategory?.category_id||'',code:S.editCategory?.code||'',name,description:document.getElementById('tmv3-category-desc').value.trim(),sort_order:Number(document.getElementById('tmv3-category-order').value||100),is_active:document.getElementById('tmv3-category-active').checked}});
 if(error)return setErr('tmv3-category-error',error.message);close('tmv3-category-modal');notify('Categoría guardada','success');await loadCatalog();if(S.companyId)await loadMatrix();
}
function editConcept(id=''){
 S.editConcept=S.concepts.find(x=>String(x.concept_id)===String(id))||null;setErr('tmv3-concept-error','');document.getElementById('tmv3-concept-title').textContent=S.editConcept?'Editar concepto':'Nuevo concepto';
 document.getElementById('tmv3-concept-name').value=S.editConcept?.name||'';document.getElementById('tmv3-concept-desc').value=S.editConcept?.description||'';document.getElementById('tmv3-concept-unit').value=S.editConcept?.pricing_unit||'unit';document.getElementById('tmv3-concept-source').value=S.editConcept?.quantity_source||'manual';document.getElementById('tmv3-concept-auto').checked=!!S.editConcept?.auto_apply;document.getElementById('tmv3-concept-active').checked=S.editConcept?.is_active!==false;
 const type=document.getElementById('tmv3-concept-type');type.innerHTML='<option value="">Seleccionar grupo</option>'+S.types.map(t=>`<option value="${esc(t.tariff_type_id)}">${esc(t.name)}</option>`).join('');type.value=S.editConcept?.tariff_type_id||'';open('tmv3-concept-modal');
}
async function saveConcept(){
 const name=document.getElementById('tmv3-concept-name').value.trim(),type=document.getElementById('tmv3-concept-type').value;if(!name||!type)return setErr('tmv3-concept-error','Completá nombre y grupo.');
 const {error}=await _db.rpc('save_tariff_concept_v3',{p_payload:{concept_id:S.editConcept?.concept_id||'',code:S.editConcept?.code||'',name,description:document.getElementById('tmv3-concept-desc').value.trim(),tariff_type_id:type,pricing_unit:document.getElementById('tmv3-concept-unit').value,quantity_source:document.getElementById('tmv3-concept-source').value,auto_apply:document.getElementById('tmv3-concept-auto').checked,is_active:document.getElementById('tmv3-concept-active').checked}});
 if(error)return setErr('tmv3-concept-error',error.message);close('tmv3-concept-modal');notify('Concepto guardado','success');await loadCatalog();if(S.companyId)await loadMatrix();
}

async function selectCompany(id){S.companyId=id;S.baseId='';S.matrix=null;renderMatrix();const base=document.getElementById('tmv3-base');if(base)base.innerHTML='<option value="">Tarifa general</option>';if(!id)return;
 const cfg=await _db.rpc('get_company_configuration_v2',{p_company_id:id});if(!cfg.error){S.bases=cfg.data?.bases||[];if(base)base.innerHTML='<option value="">Tarifa general</option>'+S.bases.map(b=>`<option value="${esc(b.base_id)}">${esc(b.name||b.base_code||'Base')}</option>`).join('');}
 await loadMatrix();}
async function loadMatrix(){if(!S.companyId)return renderMatrix();setErr('tmv3-matrix-error','');const {data,error}=await _db.rpc('get_company_tariff_matrix_v3',{p_company_id:S.companyId,p_base_id:S.baseId||null,p_as_of:S.asOf});if(error){S.matrix=null;setErr('tmv3-matrix-error',error.message);return renderMatrix();}S.matrix=data;renderMatrix();}
function rateMap(){return new Map((S.matrix?.rates||[]).map(r=>[`${r.category_id}|${r.concept_id}`,r]))}
function renderMatrix(){const box=document.getElementById('tmv3-matrix');if(!box)return;if(!S.companyId){box.innerHTML='<div class="tmv3-empty">Seleccioná una prestadora.</div>';return;}if(!S.matrix){box.innerHTML='<div class="tmv3-empty">Cargando matriz…</div>';return;}
 const cats=S.matrix.categories||[],concepts=S.matrix.concepts||[],rates=rateMap();if(!cats.length||!concepts.length){box.innerHTML='<div class="tmv3-empty">No hay categorías o conceptos activos en el catálogo.</div>';return;}
 box.innerHTML=`<div class="tmv3-matrix-wrap"><table class="tmv3-matrix"><thead><tr><th>Categoría</th>${concepts.map(c=>`<th><strong>${esc(c.name)}</strong><div><span class="tmv3-badge">${esc(c.tariff_type_name||'—')}</span>${c.requires_own_code?'<span class="tmv3-badge key">Código propio</span>':''}</div></th>`).join('')}</tr></thead><tbody>${cats.map(cat=>`<tr><td><strong>${esc(cat.name)}</strong><div><span class="tmv3-badge ${cat.is_enabled?'on':''}">${cat.is_enabled?'Habilitada':'Deshabilitada'}</span></div></td>${concepts.map(c=>{const r=rates.get(`${cat.category_id}|${c.concept_id}`),ok=cat.is_enabled&&c.is_enabled;return`<td data-category-id="${esc(cat.category_id)}" data-concept-id="${esc(c.concept_id)}">${r?`<div class="tmv3-cell ${ok&&canWrite()?'editable':''}" ${ok&&canWrite()?'data-tmv3="edit-rate"':''}><strong>${money(r.unit_price,r.currency)}</strong><small>por ${esc(unitLabel(r.pricing_unit))}</small><small>${esc(r.valid_from)}${r.valid_until?` → ${esc(r.valid_until)}`:' → vigente'}</small></div>`:`<div class="tmv3-cell ${ok&&canWrite()?'editable':'disabled'}" ${ok&&canWrite()?'data-tmv3="edit-rate"':''}>${ok?'<span class="add">＋ Tarifa</span>':'—'}</div>`}</td>`}).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function openProvider(){if(!S.matrix)return notify('Seleccioná una prestadora','warning');setErr('tmv3-provider-error','');const body=document.getElementById('tmv3-provider-body');body.innerHTML=`<div class="tmv3-provider-list"><section class="tmv3-provider-block"><h4>Categorías</h4>${(S.matrix.categories||[]).map(c=>`<label class="tmv3-provider-row"><span>${esc(c.name)}</span><input type="checkbox" data-provider-category="${esc(c.category_id)}" ${c.is_enabled?'checked':''}></label>`).join('')}</section><section class="tmv3-provider-block"><h4>Conceptos</h4>${(S.matrix.concepts||[]).map(c=>`<div class="tmv3-provider-row"><span>${esc(c.name)}</span><label class="tmv3-check"><input type="checkbox" data-provider-concept="${esc(c.concept_id)}" ${c.is_enabled?'checked':''}><span>Usa</span></label><label class="tmv3-check"><input type="checkbox" data-provider-code="${esc(c.concept_id)}" ${c.requires_own_code?'checked':''}><span>Código propio</span></label></div>`).join('')}</section></div>`;open('tmv3-provider-modal');}
async function saveProvider(){if(!S.companyId)return;setErr('tmv3-provider-error','');const catOps=[...document.querySelectorAll('[data-provider-category]')],conceptOps=[...document.querySelectorAll('[data-provider-concept]')];for(const el of catOps){const {error}=await _db.rpc('save_company_category_setting_v3',{p_payload:{company_id:S.companyId,category_id:el.dataset.providerCategory,is_enabled:el.checked}});if(error)return setErr('tmv3-provider-error',error.message);}for(const el of conceptOps){const code=document.querySelector(`[data-provider-code="${CSS.escape(el.dataset.providerConcept)}"]`);const {error}=await _db.rpc('save_company_concept_setting_v3',{p_payload:{company_id:S.companyId,concept_id:el.dataset.providerConcept,is_enabled:el.checked,requires_own_code:!!code?.checked}});if(error)return setErr('tmv3-provider-error',error.message);}close('tmv3-provider-modal');notify('Configuración de prestadora guardada','success');await loadMatrix();}

function editRate(categoryId,conceptId){if(!S.matrix)return;const cat=S.matrix.categories.find(x=>String(x.category_id)===String(categoryId)),concept=S.matrix.concepts.find(x=>String(x.concept_id)===String(conceptId)),rate=rateMap().get(`${categoryId}|${conceptId}`)||null;if(!cat||!concept)return;S.editRate={categoryId,conceptId,cat,concept,rate};setErr('tmv3-rate-error','');document.getElementById('tmv3-rate-title').textContent=`${cat.name} · ${concept.name}`;document.getElementById('tmv3-rate-subtitle').textContent=rate?'Creá una nueva versión; la vigente queda en el historial.':'Primera tarifa para esta combinación.';document.getElementById('tmv3-rate-price').value=rate?.unit_price??'';document.getElementById('tmv3-rate-unit').value=rate?.pricing_unit||concept.pricing_unit||'unit';document.getElementById('tmv3-rate-from').value=S.asOf||today();document.getElementById('tmv3-rate-until').value='';document.getElementById('tmv3-rate-reason').value='';open('tmv3-rate-modal');}
async function saveRate(){const x=S.editRate;if(!x)return;const price=document.getElementById('tmv3-rate-price').value,from=document.getElementById('tmv3-rate-from').value,reason=document.getElementById('tmv3-rate-reason').value.trim();if(price===''||!from||reason.length<3)return setErr('tmv3-rate-error','Completá precio, vigencia y motivo.');const {error}=await _db.rpc('save_company_tariff_rate_v3',{p_payload:{company_id:S.companyId,billing_base_id:S.baseId||null,category_id:x.categoryId,concept_id:x.conceptId,unit_price:price,pricing_unit:document.getElementById('tmv3-rate-unit').value,valid_from:from,valid_until:document.getElementById('tmv3-rate-until').value||null,currency:x.rate?.currency||'ARS',change_reason:reason}});if(error)return setErr('tmv3-rate-error',error.message);close('tmv3-rate-modal');notify('Nueva versión de tarifa creada','success');await loadMatrix();}
async function openHistory(){const x=S.editRate;if(!x)return;const body=document.getElementById('tmv3-history-body');body.innerHTML='<div class="tmv3-empty">Cargando historial…</div>';document.getElementById('tmv3-history-title').textContent=`Historial · ${x.cat.name} · ${x.concept.name}`;open('tmv3-history-modal');const {data,error}=await _db.rpc('get_company_tariff_rate_history_v3',{p_company_id:S.companyId,p_base_id:S.baseId||null,p_category_id:x.categoryId,p_concept_id:x.conceptId});if(error){body.innerHTML=`<div class="tmv3-error">${esc(error.message)}</div>`;return;}const rows=data||[];body.innerHTML=rows.length?`<table class="tmv3-history"><thead><tr><th>Vigencia</th><th>Precio</th><th>Unidad</th><th>Rev.</th><th>Estado</th><th>Motivo</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.valid_from)}${r.valid_until?` → ${esc(r.valid_until)}`:' → abierta'}</td><td>${money(r.unit_price,r.currency)}</td><td>${esc(unitLabel(r.pricing_unit))}</td><td>${esc(r.revision)}</td><td>${r.is_current?'Vigente en su tramo':'Reemplazada'}</td><td>${esc(r.change_reason||'—')}</td></tr>`).join('')}</tbody></table>`:'<div class="tmv3-empty">Sin historial.</div>';}

function ready(){if(inject())return;setTimeout(ready,250)}
window.addEventListener('auxilios:profile-ready',()=>{if(inject())loadCatalog();});
ready();
window.TariffMatrixV3={loadCatalog,loadMatrix,state:S};
})();

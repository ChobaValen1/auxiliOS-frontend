/* AuxiliOS · Configuración Tarifario V3 · UX operativa sobre Categoría × Concepto */
(()=>{'use strict';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(v,c='ARS')=>new Intl.NumberFormat('es-AR',{style:'currency',currency:c||'ARS',maximumFractionDigits:2}).format(Number(v)||0);
const role=()=>String(typeof PERFIL_USUARIO==='undefined'?'':(PERFIL_USUARIO?.roles?.name||PERFIL_USUARIO?.role||'')).toLowerCase();
const canRead=()=>['administracion','facturacion','supervision'].includes(role());
const canWrite=()=>role()==='administracion';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const S={
  categories:[],concepts:[],types:[],companies:[],matrix:null,
  companyId:'',baseId:'',asOf:today(),bases:[],
  group:'all',category:'all',query:'',view:'list',
  editCategory:null,editConcept:null,editRate:null,busy:false,
  importRows:[],importHeaders:[]
};
const unitLabel=u=>({service:'servicio',fixed:'servicio',unit:'unidad',km:'km',hour:'hora',day:'día'})[u]||u||'unidad';
const sourceLabel=s=>({manual:'Cantidad manual',one:'1 unidad',asphalt_km:'KM Asfalto',gravel_km:'KM Ripio'})[s]||s;
const notify=(m,t='info')=>typeof toast==='function'?toast(m,t):console.log(m);
const open=id=>document.getElementById(id)?.classList.add('open');
const close=id=>document.getElementById(id)?.classList.remove('open');
function setErr(id,msg=''){const e=document.getElementById(id);if(e){e.textContent=msg;e.hidden=!msg}}
function groupKey(c){
  const code=norm(c?.tariff_type_code),name=norm(c?.tariff_type_name);
  if(code.includes('sale')||name.includes('venta'))return'venta';
  if(code.includes('mov')||code.includes('distance')||name.includes('movida')||name.includes('movimiento'))return'movida';
  return'trabajo';
}
const groupLabel=c=>({movida:'MOVIDA',trabajo:'TRABAJO',venta:'VENTA'})[groupKey(c)];
const groupClass=c=>`g-${groupKey(c)}`;
const selectedCompany=()=>S.companies.find(c=>String(c.company_id)===String(S.companyId));
const selectedBase=()=>S.bases.find(b=>String(b.base_id)===String(S.baseId));

function catalogScreen(){return`<div class="tmv3">
 <div class="tmv3-head"><div><span class="tmv3-eyebrow">Configuración</span><h2>Categorías y conceptos</h2><p>Catálogo reutilizable del Tarifario V3. Las prestadoras habilitan solo lo que necesitan.</p></div></div>
 <div id="tmv3-catalog-error" class="tmv3-error" hidden></div>
 <div class="tmv3-grid2">
  <section class="tmv3-card"><div class="tmv3-card-head"><div><h3>Categorías</h3><p>Tipo de unidad o servicio: Liviano, Semipesado, UML, Pesado.</p></div><button type="button" class="secondary" data-tmv3="new-category" ${canWrite()?'':'disabled'}>＋ Categoría</button></div><div id="tmv3-categories"></div></section>
  <section class="tmv3-card"><div class="tmv3-card-head"><div><h3>Conceptos tarifarios</h3><p>Movida, kilómetros, espera, extracción, venta y demás conceptos facturables.</p></div><button type="button" class="secondary" data-tmv3="new-concept" ${canWrite()?'':'disabled'}>＋ Concepto</button></div><div id="tmv3-concepts"></div></section>
 </div>
</div>`}

function matrixScreen(){return`<div class="tmv3 tmv3-rates">
 <div class="tmv3-head tmv3-rates-head">
  <div><span class="tmv3-eyebrow">Configuración · Facturación</span><h2>Tarifas</h2><p>Administrá valores por prestadora, base y vigencia sin modificar el histórico.</p></div>
  <div class="tmv3-actions">
   <button type="button" class="secondary" data-tmv3="import" ${canWrite()?'':'disabled'}>⇧ Importar Excel</button>
   <button type="button" class="secondary" data-tmv3="provider-settings" ${canWrite()?'':'disabled'}>⚙ Configurar prestadora</button>
   <button type="button" class="primary" data-tmv3="new-rate" ${canWrite()?'':'disabled'}>＋ Nueva tarifa</button>
  </div>
 </div>
 <div id="tmv3-matrix-error" class="tmv3-error" hidden></div>
 <section class="tmv3-filter-card">
  <div class="tmv3-filters">
   <label><span>Prestadora</span><select id="tmv3-company"><option value="">Seleccionar prestadora</option></select></label>
   <label><span>Base</span><select id="tmv3-base" disabled><option value="">Seleccionar base</option></select></label>
   <label><span>Grupo</span><select id="tmv3-group"><option value="all">Todos</option><option value="movida">MOVIDA</option><option value="trabajo">TRABAJO</option><option value="venta">VENTA</option></select></label>
   <label><span>Categoría</span><select id="tmv3-category-filter"><option value="all">Todas</option></select></label>
   <label><span>Vigencia</span><input id="tmv3-asof" type="date" value="${esc(S.asOf)}"></label>
   <label class="tmv3-search"><span>Buscar</span><input id="tmv3-query" type="search" placeholder="Concepto o categoría"></label>
  </div>
  <div class="tmv3-context" id="tmv3-context"><span class="dot"></span>Elegí prestadora y base para consultar el tarifario.</div>
 </section>
 <div id="tmv3-overview"></div>
 <div id="tmv3-matrix"><div class="tmv3-empty"><div class="tmv3-empty-icon">＄</div><strong>Seleccioná una prestadora y una base</strong><span>Las bases tienen el mismo peso: el tarifario se consulta siempre sobre una base explícita.</span></div></div>
</div>`}

function modals(){return`
<div class="tmv3-modal" id="tmv3-category-modal"><div class="tmv3-dialog"><div class="tmv3-dialog-head"><div><span class="tmv3-eyebrow">Catálogo</span><h3 id="tmv3-category-title">Categoría</h3><p>Ej.: Liviano, Semipesado, UML o Pesado.</p></div><button class="icon" data-tmv3-close="tmv3-category-modal">×</button></div><div id="tmv3-category-error" class="tmv3-error" hidden></div><div class="tmv3-form-grid">
 <label><span>Nombre *</span><input id="tmv3-category-name"></label><label><span>Orden</span><input id="tmv3-category-order" type="number" min="0" step="1"></label>
 <label class="full"><span>Descripción</span><textarea id="tmv3-category-desc" rows="2"></textarea></label><label class="tmv3-check full"><input id="tmv3-category-active" type="checkbox" checked><span>Activa</span></label>
</div><div class="tmv3-modal-actions"><button type="button" class="secondary" data-tmv3-close="tmv3-category-modal">Cancelar</button><button type="button" class="primary" data-tmv3="save-category">Guardar</button></div></div></div>

<div class="tmv3-modal" id="tmv3-concept-modal"><div class="tmv3-dialog"><div class="tmv3-dialog-head"><div><span class="tmv3-eyebrow">Catálogo</span><h3 id="tmv3-concept-title">Concepto</h3><p>Todos los conceptos se calculan como cantidad × precio unitario.</p></div><button class="icon" data-tmv3-close="tmv3-concept-modal">×</button></div><div id="tmv3-concept-error" class="tmv3-error" hidden></div><div class="tmv3-form-grid">
 <label><span>Nombre *</span><input id="tmv3-concept-name"></label><label><span>Grupo *</span><select id="tmv3-concept-type"></select></label>
 <label><span>Unidad por defecto</span><select id="tmv3-concept-unit"><option value="unit">Unidad</option><option value="service">Servicio</option><option value="hour">Hora</option><option value="km">KM</option><option value="day">Día</option><option value="fixed">Fijo</option></select></label>
 <label><span>Origen de cantidad</span><select id="tmv3-concept-source"><option value="manual">Cantidad manual</option><option value="one">1 unidad</option><option value="asphalt_km">KM Asfalto</option><option value="gravel_km">KM Ripio</option></select></label>
 <label class="tmv3-check"><input id="tmv3-concept-auto" type="checkbox"><span>Agregar automáticamente al servicio</span></label><label class="tmv3-check"><input id="tmv3-concept-active" type="checkbox" checked><span>Activo</span></label>
 <label class="full"><span>Descripción</span><textarea id="tmv3-concept-desc" rows="2"></textarea></label><div class="tmv3-help full">Movida, KM Asfalto y KM Ripio pueden tomar la cantidad del servicio automáticamente. El resto queda manual.</div>
</div><div class="tmv3-modal-actions"><button type="button" class="secondary" data-tmv3-close="tmv3-concept-modal">Cancelar</button><button type="button" class="primary" data-tmv3="save-concept">Guardar</button></div></div></div>

<div class="tmv3-modal" id="tmv3-provider-modal"><div class="tmv3-dialog wide"><div class="tmv3-dialog-head"><div><span class="tmv3-eyebrow">Prestadora</span><h3>Configurar prestadora</h3><p>Definí qué categorías y conceptos usa. El código propio se decide por prestadora + concepto.</p></div><button class="icon" data-tmv3-close="tmv3-provider-modal">×</button></div><div id="tmv3-provider-error" class="tmv3-error" hidden></div><div id="tmv3-provider-body"></div><div class="tmv3-modal-actions"><button type="button" class="secondary" data-tmv3-close="tmv3-provider-modal">Cancelar</button><button type="button" class="primary" data-tmv3="save-provider">Guardar configuración</button></div></div></div>

<div class="tmv3-modal drawer-modal" id="tmv3-rate-modal"><div class="tmv3-dialog drawer"><div class="tmv3-dialog-head"><div><span class="tmv3-eyebrow">Tarifario</span><h3 id="tmv3-rate-title">Nueva tarifa</h3><p id="tmv3-rate-subtitle">Creá una vigencia sin pisar la anterior.</p></div><button class="icon" data-tmv3-close="tmv3-rate-modal">×</button></div>
 <div class="tmv3-scope-summary" id="tmv3-rate-scope"></div><div id="tmv3-rate-error" class="tmv3-error" hidden></div>
 <div class="tmv3-form-stack">
  <label><span>Categoría *</span><select id="tmv3-rate-category"></select></label>
  <label><span>Concepto *</span><select id="tmv3-rate-concept"></select></label>
  <div id="tmv3-rate-group-hint" class="tmv3-group-hint"></div>
  <div class="tmv3-form-grid"><label><span>Precio unitario *</span><div class="tmv3-money-input"><span>$</span><input id="tmv3-rate-price" type="number" min="0" step="0.01"></div></label><label><span>Unidad *</span><select id="tmv3-rate-unit"><option value="unit">Unidad</option><option value="service">Servicio</option><option value="hour">Hora</option><option value="km">KM</option><option value="day">Día</option><option value="fixed">Fijo</option></select></label></div>
  <div class="tmv3-form-grid"><label><span>Vigencia desde *</span><input id="tmv3-rate-from" type="date"></label><label><span>Vigencia hasta</span><input id="tmv3-rate-until" type="date"></label></div>
  <label><span>Motivo / referencia *</span><input id="tmv3-rate-reason" placeholder="Ej.: Tarifario septiembre 2026"></label>
  <div class="tmv3-info"><b>Histórico protegido.</b> Al crear una nueva vigencia, AuxiliOS conserva las versiones anteriores para remitos y auditoría.</div>
 </div>
 <div class="tmv3-modal-actions sticky"><button type="button" class="secondary history-action" data-tmv3="rate-history" hidden>Ver historial</button><span class="spacer"></span><button type="button" class="secondary" data-tmv3-close="tmv3-rate-modal">Cancelar</button><button type="button" class="primary" data-tmv3="save-rate">Crear vigencia</button></div>
</div></div>

<div class="tmv3-modal" id="tmv3-history-modal"><div class="tmv3-dialog wide"><div class="tmv3-dialog-head"><div><span class="tmv3-eyebrow">Auditoría</span><h3 id="tmv3-history-title">Historial de tarifa</h3><p>Las versiones históricas no se reescriben.</p></div><button class="icon" data-tmv3-close="tmv3-history-modal">×</button></div><div id="tmv3-history-body"></div><div class="tmv3-modal-actions"><button type="button" class="secondary" data-tmv3-close="tmv3-history-modal">Cerrar</button></div></div></div>

<div class="tmv3-modal" id="tmv3-bulk-modal"><div class="tmv3-dialog wide"><div class="tmv3-dialog-head"><div><span class="tmv3-eyebrow">Actualización masiva</span><h3>Actualizar tarifas</h3><p>Generá nuevas vigencias para el conjunto filtrado. Ningún valor histórico se pisa.</p></div><button class="icon" data-tmv3-close="tmv3-bulk-modal">×</button></div><div id="tmv3-bulk-error" class="tmv3-error" hidden></div>
 <div class="tmv3-form-grid"><label><span>Aumento porcentual *</span><div class="tmv3-money-input"><input id="tmv3-bulk-percent" type="number" step="0.01" value="10"><span>%</span></div></label><label><span>Nueva vigencia desde *</span><input id="tmv3-bulk-from" type="date"></label><label class="full"><span>Motivo / referencia *</span><input id="tmv3-bulk-reason" placeholder="Ej.: Actualización septiembre 2026"></label></div>
 <div class="tmv3-info" id="tmv3-bulk-scope"></div><div id="tmv3-bulk-preview"></div>
 <div class="tmv3-modal-actions"><button type="button" class="secondary" data-tmv3-close="tmv3-bulk-modal">Cancelar</button><button type="button" class="primary" data-tmv3="apply-bulk">Crear nuevas vigencias</button></div>
</div></div>

<div class="tmv3-modal" id="tmv3-import-modal"><div class="tmv3-dialog wide"><div class="tmv3-dialog-head"><div><span class="tmv3-eyebrow">Importación</span><h3>Importar desde Excel</h3><p>Copiá y pegá filas desde Excel o cargá un CSV. Primero se valida y muestra una vista previa.</p></div><button class="icon" data-tmv3-close="tmv3-import-modal">×</button></div><div id="tmv3-import-error" class="tmv3-error" hidden></div>
 <div class="tmv3-form-grid"><label><span>Nueva vigencia desde *</span><input id="tmv3-import-from" type="date"></label><label><span>Motivo / referencia *</span><input id="tmv3-import-reason" placeholder="Ej.: Tarifario recibido 01/09/2026"></label></div>
 <label class="tmv3-file-drop"><input id="tmv3-import-file" type="file" accept=".csv,.tsv,.txt"><b>Cargar CSV / TSV</b><span>También podés pegar directamente desde Excel en el campo inferior.</span></label>
 <label class="tmv3-import-text-label"><span>Datos pegados</span><textarea id="tmv3-import-text" rows="7" placeholder="Categoría	Concepto	Precio	Unidad&#10;Liviano	Movida	35000	servicio"></textarea></label>
 <div class="tmv3-modal-actions compact"><button type="button" class="secondary" data-tmv3="prepare-import">Preparar vista previa</button></div>
 <div id="tmv3-import-mapping"></div><div id="tmv3-import-preview"></div>
 <div class="tmv3-modal-actions"><button type="button" class="secondary" data-tmv3-close="tmv3-import-modal">Cancelar</button><button type="button" class="primary" data-tmv3="apply-import" disabled>Importar tarifas</button></div>
</div></div>`}

function inject(){
 const service=document.getElementById('screen-config-service-types'),matrix=document.getElementById('screen-config-tariff-matrix');
 if(!service||!matrix)return false;
 if(document.getElementById('tmv3-company'))return true;
 const nav=document.querySelector('#nav-config-service-types .nav-label');if(nav)nav.textContent='Categorías y conceptos';
 const tnav=document.querySelector('#nav-config-tariff-matrix .nav-label');if(tnav)tnav.textContent='Tarifas';
 service.innerHTML=catalogScreen();matrix.innerHTML=matrixScreen();
 if(!document.getElementById('tmv3-category-modal'))document.body.insertAdjacentHTML('beforeend',modals());
 bind();loadCatalog();return true;
}

function bind(){
 document.addEventListener('click',async e=>{
  const closeId=e.target?.closest?.('[data-tmv3-close]')?.dataset?.tmv3Close;if(closeId){close(closeId);return;}
  const trigger=e.target?.closest?.('[data-tmv3]');const a=trigger?.dataset?.tmv3;if(!a)return;
  if(a==='new-category')return editCategory();
  if(a==='edit-category')return editCategory(trigger.closest('[data-category-id]')?.dataset.categoryId);
  if(a==='save-category')return saveCategory();
  if(a==='new-concept')return editConcept();
  if(a==='edit-concept')return editConcept(trigger.closest('[data-concept-id]')?.dataset.conceptId);
  if(a==='save-concept')return saveConcept();
  if(a==='provider-settings')return openProvider();
  if(a==='save-provider')return saveProvider();
  if(a==='new-rate')return newRate();
  if(a==='edit-rate'){const b=trigger.closest('[data-category-id][data-concept-id]');return editRate(b?.dataset.categoryId,b?.dataset.conceptId);}
  if(a==='save-rate')return saveRate();
  if(a==='rate-history')return openHistory();
  if(a==='open-history'){const b=trigger.closest('[data-category-id][data-concept-id]');editRate(b?.dataset.categoryId,b?.dataset.conceptId,false);return openHistory();}
  if(a==='view-list'){S.view='list';return renderRates();}
  if(a==='view-matrix'){S.view='matrix';return renderRates();}
  if(a==='bulk')return openBulk();
  if(a==='apply-bulk')return applyBulk();
  if(a==='import')return openImport();
  if(a==='prepare-import')return prepareImport();
  if(a==='apply-import')return applyImport();
 });
 document.getElementById('tmv3-company')?.addEventListener('change',e=>selectCompany(e.target.value));
 document.getElementById('tmv3-base')?.addEventListener('change',e=>{S.baseId=e.target.value;loadMatrix()});
 document.getElementById('tmv3-asof')?.addEventListener('change',e=>{S.asOf=e.target.value||today();loadMatrix()});
 document.getElementById('tmv3-group')?.addEventListener('change',e=>{S.group=e.target.value;renderRates()});
 document.getElementById('tmv3-category-filter')?.addEventListener('change',e=>{S.category=e.target.value;renderRates()});
 document.getElementById('tmv3-query')?.addEventListener('input',e=>{S.query=e.target.value;renderRates()});
 document.getElementById('tmv3-rate-concept')?.addEventListener('change',refreshRateConcept);
 document.getElementById('tmv3-bulk-percent')?.addEventListener('input',renderBulkPreview);
 document.getElementById('tmv3-import-file')?.addEventListener('change',readImportFile);
}

async function loadCatalog(){
 if(!canRead())return;
 setErr('tmv3-catalog-error','');
 const [cats,concepts,types,companies]=await Promise.all([
  _db.rpc('list_service_categories_v3',{p_include_inactive:true}),
  _db.rpc('list_tariff_concepts_v3',{p_include_inactive:true}),
  _db.rpc('list_tariff_types_config'),
  _db.from('companies').select('company_id,trade_name,legal_name,status').eq('status','active').order('trade_name')
 ]);
 const err=cats.error||concepts.error||types.error||companies.error;
 if(err){setErr('tmv3-catalog-error',err.message||'No se pudo cargar la configuración.');setErr('tmv3-matrix-error',err.message||'No se pudo cargar la configuración.');return;}
 S.categories=cats.data||[];S.concepts=concepts.data||[];S.types=types.data||[];S.companies=companies.data||[];
 renderCatalog();renderCompanyOptions();renderCategoryFilter();
}

function renderCatalog(){
 const cbox=document.getElementById('tmv3-categories'),xbox=document.getElementById('tmv3-concepts');if(!cbox||!xbox)return;
 cbox.innerHTML=S.categories.length?`<div class="tmv3-table-wrap"><table class="tmv3-table"><thead><tr><th>Categoría</th><th>Estado</th><th></th></tr></thead><tbody>${S.categories.map(c=>`<tr data-category-id="${esc(c.category_id)}"><td><strong>${esc(c.name)}</strong>${c.description?`<div class="tmv3-muted">${esc(c.description)}</div>`:''}</td><td><span class="tmv3-status-badge ${c.is_active?'active':'inactive'}">${c.is_active?'Activa':'Inactiva'}</span></td><td class="right"><button type="button" class="link" data-tmv3="edit-category" ${canWrite()?'':'disabled'}>Editar</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="tmv3-empty">No hay categorías.</div>';
 xbox.innerHTML=S.concepts.length?`<div class="tmv3-table-wrap"><table class="tmv3-table"><thead><tr><th>Concepto</th><th>Grupo</th><th>Unidad</th><th>Cantidad</th><th></th></tr></thead><tbody>${S.concepts.map(c=>`<tr data-concept-id="${esc(c.concept_id)}"><td><strong>${esc(c.name)}</strong>${c.description?`<div class="tmv3-muted">${esc(c.description)}</div>`:''}</td><td><span class="tmv3-group-badge ${groupClass(c)}">${groupLabel(c)}</span></td><td>${esc(unitLabel(c.pricing_unit))}</td><td>${esc(sourceLabel(c.quantity_source))}${c.auto_apply?' · auto':''}</td><td class="right"><button type="button" class="link" data-tmv3="edit-concept" ${canWrite()?'':'disabled'}>Editar</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="tmv3-empty">No hay conceptos.</div>';
}

function renderCompanyOptions(){
 const e=document.getElementById('tmv3-company');if(!e)return;
 e.innerHTML='<option value="">Seleccionar prestadora</option>'+S.companies.map(c=>`<option value="${esc(c.company_id)}">${esc(c.trade_name||c.legal_name||'Prestadora')}</option>`).join('');
 e.value=S.companyId||'';
}
function renderCategoryFilter(){
 const e=document.getElementById('tmv3-category-filter');if(!e)return;
 e.innerHTML='<option value="all">Todas</option>'+S.categories.filter(c=>c.is_active).map(c=>`<option value="${esc(c.category_id)}">${esc(c.name)}</option>`).join('');
 e.value=S.category;
}

function editCategory(id=''){
 S.editCategory=S.categories.find(x=>String(x.category_id)===String(id))||null;setErr('tmv3-category-error','');
 document.getElementById('tmv3-category-title').textContent=S.editCategory?'Editar categoría':'Nueva categoría';
 document.getElementById('tmv3-category-name').value=S.editCategory?.name||'';
 document.getElementById('tmv3-category-desc').value=S.editCategory?.description||'';
 document.getElementById('tmv3-category-order').value=S.editCategory?.sort_order??100;
 document.getElementById('tmv3-category-active').checked=S.editCategory?.is_active!==false;open('tmv3-category-modal');
}
async function saveCategory(){
 const name=document.getElementById('tmv3-category-name').value.trim();if(!name)return setErr('tmv3-category-error','Ingresá el nombre.');
 const {error}=await _db.rpc('save_service_category_v3',{p_payload:{category_id:S.editCategory?.category_id||'',code:S.editCategory?.code||'',name,description:document.getElementById('tmv3-category-desc').value.trim(),sort_order:Number(document.getElementById('tmv3-category-order').value||100),is_active:document.getElementById('tmv3-category-active').checked}});
 if(error)return setErr('tmv3-category-error',error.message);close('tmv3-category-modal');notify('Categoría guardada','success');await loadCatalog();if(S.companyId&&S.baseId)await loadMatrix();
}
function editConcept(id=''){
 S.editConcept=S.concepts.find(x=>String(x.concept_id)===String(id))||null;setErr('tmv3-concept-error','');
 document.getElementById('tmv3-concept-title').textContent=S.editConcept?'Editar concepto':'Nuevo concepto';
 document.getElementById('tmv3-concept-name').value=S.editConcept?.name||'';
 document.getElementById('tmv3-concept-desc').value=S.editConcept?.description||'';
 document.getElementById('tmv3-concept-unit').value=S.editConcept?.pricing_unit||'unit';
 document.getElementById('tmv3-concept-source').value=S.editConcept?.quantity_source||'manual';
 document.getElementById('tmv3-concept-auto').checked=!!S.editConcept?.auto_apply;
 document.getElementById('tmv3-concept-active').checked=S.editConcept?.is_active!==false;
 const type=document.getElementById('tmv3-concept-type');type.innerHTML='<option value="">Seleccionar grupo</option>'+S.types.map(t=>`<option value="${esc(t.tariff_type_id)}">${esc(t.name)}</option>`).join('');type.value=S.editConcept?.tariff_type_id||'';open('tmv3-concept-modal');
}
async function saveConcept(){
 const name=document.getElementById('tmv3-concept-name').value.trim(),type=document.getElementById('tmv3-concept-type').value;
 if(!name||!type)return setErr('tmv3-concept-error','Completá nombre y grupo.');
 const {error}=await _db.rpc('save_tariff_concept_v3',{p_payload:{concept_id:S.editConcept?.concept_id||'',code:S.editConcept?.code||'',name,description:document.getElementById('tmv3-concept-desc').value.trim(),tariff_type_id:type,pricing_unit:document.getElementById('tmv3-concept-unit').value,quantity_source:document.getElementById('tmv3-concept-source').value,auto_apply:document.getElementById('tmv3-concept-auto').checked,is_active:document.getElementById('tmv3-concept-active').checked}});
 if(error)return setErr('tmv3-concept-error',error.message);close('tmv3-concept-modal');notify('Concepto guardado','success');await loadCatalog();if(S.companyId&&S.baseId)await loadMatrix();
}

async function selectCompany(id){
 S.companyId=id;S.baseId='';S.matrix=null;S.bases=[];renderRates();
 const base=document.getElementById('tmv3-base');if(base){base.disabled=true;base.innerHTML='<option value="">Seleccionar base</option>';}
 updateContext();
 if(!id)return;
 const cfg=await _db.rpc('get_company_configuration_v2',{p_company_id:id});
 if(cfg.error){setErr('tmv3-matrix-error',cfg.error.message);return;}
 S.bases=(cfg.data?.bases||[]).filter(b=>b.is_active!==false);
 if(base){base.innerHTML='<option value="">Seleccionar base</option>'+S.bases.map(b=>`<option value="${esc(b.base_id)}">${esc(b.name||b.base_code||'Base')}</option>`).join('');base.disabled=!S.bases.length;}
 if(S.bases.length===1){S.baseId=String(S.bases[0].base_id);base.value=S.baseId;await loadMatrix();}
 else renderRates();
}

async function loadMatrix(){
 if(!S.companyId||!S.baseId){S.matrix=null;renderRates();return;}
 setErr('tmv3-matrix-error','');
 const {data,error}=await _db.rpc('get_company_tariff_matrix_v3',{p_company_id:S.companyId,p_base_id:S.baseId,p_as_of:S.asOf});
 if(error){S.matrix=null;setErr('tmv3-matrix-error',error.message);renderRates();return;}
 S.matrix=data;renderRates();
}

function rateMap(){return new Map((S.matrix?.rates||[]).map(r=>[`${r.category_id}|${r.concept_id}`,r]))}
function allRows(){
 if(!S.matrix)return[];
 const rates=rateMap(),rows=[];
 for(const cat of S.matrix.categories||[]){
  for(const concept of S.matrix.concepts||[]){
   if(!cat.is_enabled||!concept.is_enabled)continue;
   rows.push({cat,concept,rate:rates.get(`${cat.category_id}|${concept.concept_id}`)||null});
  }
 }
 return rows;
}
function filteredRows(){
 const q=norm(S.query);
 return allRows().filter(x=>
  (S.group==='all'||groupKey(x.concept)===S.group)&&
  (S.category==='all'||String(x.cat.category_id)===String(S.category))&&
  (!q||norm(`${x.cat.name} ${x.concept.name} ${x.concept.tariff_type_name}`).includes(q))
 );
}
function updateContext(){
 const e=document.getElementById('tmv3-context');if(!e)return;
 const c=selectedCompany(),b=selectedBase();
 if(!c||!b){e.innerHTML='<span class="dot"></span>Elegí prestadora y base para consultar el tarifario.';return;}
 e.innerHTML=`<span class="dot active"></span><b>${esc(c.trade_name||c.legal_name)}</b><span>·</span><b>${esc(b.name||b.base_code||'Base')}</b><span>· Vigencia ${esc(S.asOf)}</span>`;
}

function renderRates(){
 updateContext();
 const overview=document.getElementById('tmv3-overview'),box=document.getElementById('tmv3-matrix');if(!overview||!box)return;
 if(!S.companyId||!S.baseId){
  overview.innerHTML='';
  box.innerHTML='<div class="tmv3-empty tmv3-empty-main"><div class="tmv3-empty-icon">＄</div><strong>Seleccioná una prestadora y una base</strong><span>Las bases tienen el mismo peso. No existe una base principal: elegí explícitamente sobre cuál querés trabajar.</span></div>';return;
 }
 if(!S.matrix){overview.innerHTML='';box.innerHTML='<div class="tmv3-empty"><span class="tmv3-spinner"></span><strong>Cargando tarifario…</strong></div>';return;}
 const rows=allRows(),configured=rows.filter(x=>x.rate),count=g=>rows.filter(x=>groupKey(x.concept)===g&&x.rate).length;
 overview.innerHTML=`<div class="tmv3-kpis">
  <article><span class="kpi-icon total">＄</span><div><small>Tarifas vigentes</small><strong>${configured.length}</strong></div></article>
  <article><span class="kpi-icon movida">↔</span><div><small>MOVIDA</small><strong>${count('movida')}</strong></div></article>
  <article><span class="kpi-icon trabajo">⌁</span><div><small>TRABAJO</small><strong>${count('trabajo')}</strong></div></article>
  <article><span class="kpi-icon venta">◇</span><div><small>VENTA</small><strong>${count('venta')}</strong></div></article>
 </div>`;
 const visible=filteredRows();
 const header=`<div class="tmv3-list-head"><div><h3>Tarifario vigente</h3><p>${visible.length} combinaciones visibles · cada cambio crea una nueva vigencia.</p></div><div class="tmv3-list-actions"><button class="secondary" data-tmv3="bulk" ${canWrite()&&visible.some(x=>x.rate)?'':'disabled'}>↻ Actualizar tarifas</button><div class="tmv3-view-toggle"><button class="${S.view==='list'?'active':''}" data-tmv3="view-list">Listado</button><button class="${S.view==='matrix'?'active':''}" data-tmv3="view-matrix">Matriz</button></div></div></div>`;
 box.innerHTML=`<section class="tmv3-card tmv3-rates-card">${header}${S.view==='matrix'?renderAdvancedMatrix(visible):renderList(visible)}</section>`;
}

function renderList(rows){
 if(!rows.length)return'<div class="tmv3-empty"><strong>No hay tarifas para estos filtros.</strong><span>Probá con otro grupo, categoría o búsqueda.</span></div>';
 return`<div class="tmv3-table-wrap"><table class="tmv3-table tmv3-rate-table"><thead><tr><th>Categoría</th><th>Concepto</th><th>Grupo</th><th>Valor</th><th>Unidad</th><th>Vigencia</th><th>Origen</th><th class="right">Acciones</th></tr></thead><tbody>${rows.map(({cat,concept,rate})=>`<tr data-category-id="${esc(cat.category_id)}" data-concept-id="${esc(concept.concept_id)}">
  <td><strong>${esc(cat.name)}</strong></td><td><strong>${esc(concept.name)}</strong><div class="tmv3-muted">${concept.auto_apply?'Automático · ':''}${esc(sourceLabel(concept.quantity_source))}</div></td>
  <td><span class="tmv3-group-badge ${groupClass(concept)}">${groupLabel(concept)}</span></td>
  <td>${rate?`<strong class="tmv3-price">${money(rate.unit_price,rate.currency)}</strong>`:'<span class="tmv3-missing">Sin tarifa</span>'}</td>
  <td>${rate?esc(unitLabel(rate.pricing_unit)):esc(unitLabel(concept.pricing_unit))}</td>
  <td>${rate?`<span>${esc(rate.valid_from)}</span>${rate.valid_until?`<div class="tmv3-muted">hasta ${esc(rate.valid_until)}</div>`:'<div class="tmv3-status-badge active">Vigente</div>'}`:'—'}</td>
  <td>${rate?.scope==='general'?'<span class="tmv3-scope-badge inherited">Tarifa común</span>':'<span class="tmv3-scope-badge">Esta base</span>'}</td>
  <td class="right"><div class="tmv3-row-actions"><button class="link" data-tmv3="edit-rate" ${canWrite()?'':'disabled'}>${rate?'Nueva vigencia':'Cargar tarifa'}</button>${rate?`<button class="link muted" data-tmv3="open-history">Historial</button>`:''}</div></td>
 </tr>`).join('')}</tbody></table></div>`;
}
function renderAdvancedMatrix(rows){
 const cats=[...new Map(rows.map(x=>[x.cat.category_id,x.cat])).values()];
 const concepts=[...new Map(rows.map(x=>[x.concept.concept_id,x.concept])).values()];
 const by=new Map(rows.map(x=>[`${x.cat.category_id}|${x.concept.concept_id}`,x]));
 if(!cats.length||!concepts.length)return'<div class="tmv3-empty">Sin datos para mostrar.</div>';
 return`<div class="tmv3-matrix-note"><b>Vista avanzada.</b> Cada celda representa Categoría + Concepto. Hacé clic para crear una nueva vigencia.</div><div class="tmv3-matrix-wrap"><table class="tmv3-matrix"><thead><tr><th>Categoría</th>${concepts.map(c=>`<th><strong>${esc(c.name)}</strong><div><span class="tmv3-group-badge ${groupClass(c)}">${groupLabel(c)}</span></div></th>`).join('')}</tr></thead><tbody>${cats.map(cat=>`<tr><td><strong>${esc(cat.name)}</strong></td>${concepts.map(c=>{const x=by.get(`${cat.category_id}|${c.concept_id}`);if(!x)return'<td class="not-applicable">—</td>';const r=x.rate;return`<td data-category-id="${esc(cat.category_id)}" data-concept-id="${esc(c.concept_id)}"><div class="tmv3-cell ${canWrite()?'editable':''}" ${canWrite()?'data-tmv3="edit-rate"':''}>${r?`<strong>${money(r.unit_price,r.currency)}</strong><small>por ${esc(unitLabel(r.pricing_unit))}</small><small>${esc(r.valid_from)}${r.valid_until?` → ${esc(r.valid_until)}`:' → vigente'}</small>`:'<span class="add">＋ Cargar</span>'}</div></td>`}).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function openProvider(){
 if(!S.companyId||!S.baseId||!S.matrix)return notify('Seleccioná una prestadora y una base','warning');
 setErr('tmv3-provider-error','');const body=document.getElementById('tmv3-provider-body');
 body.innerHTML=`<div class="tmv3-provider-list"><section class="tmv3-provider-block"><div class="tmv3-block-title"><h4>Categorías</h4><span>Qué tipos de servicio utiliza</span></div>${(S.matrix.categories||[]).map(c=>`<label class="tmv3-provider-row"><span>${esc(c.name)}</span><input type="checkbox" data-provider-category="${esc(c.category_id)}" ${c.is_enabled?'checked':''}></label>`).join('')}</section><section class="tmv3-provider-block"><div class="tmv3-block-title"><h4>Conceptos</h4><span>Qué conceptos factura</span></div>${(S.matrix.concepts||[]).map(c=>`<div class="tmv3-provider-row"><span><b>${esc(c.name)}</b><small>${groupLabel(c)}</small></span><label class="tmv3-check"><input type="checkbox" data-provider-concept="${esc(c.concept_id)}" ${c.is_enabled?'checked':''}><span>Usa</span></label><label class="tmv3-check"><input type="checkbox" data-provider-code="${esc(c.concept_id)}" ${c.requires_own_code?'checked':''}><span>Código propio</span></label></div>`).join('')}</section></div>`;open('tmv3-provider-modal');
}
async function saveProvider(){
 if(!S.companyId)return;setErr('tmv3-provider-error','');
 const catOps=[...document.querySelectorAll('[data-provider-category]')],conceptOps=[...document.querySelectorAll('[data-provider-concept]')];
 for(const el of catOps){const {error}=await _db.rpc('save_company_category_setting_v3',{p_payload:{company_id:S.companyId,category_id:el.dataset.providerCategory,is_enabled:el.checked}});if(error)return setErr('tmv3-provider-error',error.message);}
 for(const el of conceptOps){const code=document.querySelector(`[data-provider-code="${CSS.escape(el.dataset.providerConcept)}"]`);const {error}=await _db.rpc('save_company_concept_setting_v3',{p_payload:{company_id:S.companyId,concept_id:el.dataset.providerConcept,is_enabled:el.checked,requires_own_code:!!code?.checked}});if(error)return setErr('tmv3-provider-error',error.message);}
 close('tmv3-provider-modal');notify('Configuración de prestadora guardada','success');await loadMatrix();
}

function rateOptions(){
 const cats=(S.matrix?.categories||[]).filter(x=>x.is_enabled),concepts=(S.matrix?.concepts||[]).filter(x=>x.is_enabled);
 const ce=document.getElementById('tmv3-rate-category'),xe=document.getElementById('tmv3-rate-concept');
 ce.innerHTML='<option value="">Seleccionar categoría</option>'+cats.map(c=>`<option value="${esc(c.category_id)}">${esc(c.name)}</option>`).join('');
 xe.innerHTML='<option value="">Seleccionar concepto</option>'+concepts.map(c=>`<option value="${esc(c.concept_id)}">${esc(c.name)} · ${groupLabel(c)}</option>`).join('');
}
function newRate(){
 if(!S.companyId||!S.baseId||!S.matrix)return notify('Seleccioná una prestadora y una base','warning');
 S.editRate=null;setErr('tmv3-rate-error','');rateOptions();
 document.getElementById('tmv3-rate-title').textContent='Nueva tarifa';
 document.getElementById('tmv3-rate-subtitle').textContent='Elegí categoría y concepto. La vigencia queda asociada a la prestadora y base seleccionadas.';
 document.getElementById('tmv3-rate-category').disabled=false;document.getElementById('tmv3-rate-concept').disabled=false;
 document.getElementById('tmv3-rate-category').value='';document.getElementById('tmv3-rate-concept').value='';
 document.getElementById('tmv3-rate-price').value='';document.getElementById('tmv3-rate-unit').value='unit';
 document.getElementById('tmv3-rate-from').value=S.asOf||today();document.getElementById('tmv3-rate-until').value='';document.getElementById('tmv3-rate-reason').value='';
 document.querySelector('#tmv3-rate-modal .history-action').hidden=true;renderRateScope();refreshRateConcept();open('tmv3-rate-modal');
}
function editRate(categoryId,conceptId,show=true){
 if(!S.matrix)return;
 const cat=S.matrix.categories.find(x=>String(x.category_id)===String(categoryId)),concept=S.matrix.concepts.find(x=>String(x.concept_id)===String(conceptId)),rate=rateMap().get(`${categoryId}|${conceptId}`)||null;
 if(!cat||!concept)return;
 S.editRate={categoryId,conceptId,cat,concept,rate};setErr('tmv3-rate-error','');rateOptions();
 document.getElementById('tmv3-rate-title').textContent=rate?'Nueva vigencia':'Cargar tarifa';
 document.getElementById('tmv3-rate-subtitle').textContent=rate?'La tarifa vigente queda guardada en el historial.':'Primera tarifa para esta combinación.';
 document.getElementById('tmv3-rate-category').value=categoryId;document.getElementById('tmv3-rate-concept').value=conceptId;
 document.getElementById('tmv3-rate-category').disabled=true;document.getElementById('tmv3-rate-concept').disabled=true;
 document.getElementById('tmv3-rate-price').value=rate?.unit_price??'';document.getElementById('tmv3-rate-unit').value=rate?.pricing_unit||concept.pricing_unit||'unit';
 document.getElementById('tmv3-rate-from').value=S.asOf||today();document.getElementById('tmv3-rate-until').value='';document.getElementById('tmv3-rate-reason').value='';
 document.querySelector('#tmv3-rate-modal .history-action').hidden=!rate;renderRateScope();refreshRateConcept();if(show)open('tmv3-rate-modal');
}
function renderRateScope(){
 const e=document.getElementById('tmv3-rate-scope'),c=selectedCompany(),b=selectedBase();if(!e)return;
 e.innerHTML=`<div><small>Prestadora</small><b>${esc(c?.trade_name||c?.legal_name||'—')}</b></div><div><small>Base</small><b>${esc(b?.name||b?.base_code||'—')}</b></div><div><small>Vigencia consultada</small><b>${esc(S.asOf)}</b></div>`;
}
function refreshRateConcept(){
 const id=document.getElementById('tmv3-rate-concept')?.value;
 const c=(S.matrix?.concepts||[]).find(x=>String(x.concept_id)===String(id));
 const hint=document.getElementById('tmv3-rate-group-hint');if(!hint)return;
 if(!c){hint.innerHTML='';return;}
 const g=groupKey(c);hint.className=`tmv3-group-hint ${groupClass(c)}`;
 const auto=c.auto_apply?` AuxiliOS toma automáticamente ${sourceLabel(c.quantity_source)} del servicio.`:' La cantidad se carga en el servicio.';
 hint.innerHTML=`<span class="tmv3-group-badge ${groupClass(c)}">${groupLabel(c)}</span><div><b>${esc(c.name)}</b><span>${g==='movida'?'Solo el grupo MOVIDA utiliza cantidades de movimiento/kilómetros cuando corresponde.':''}${auto}</span></div>`;
 if(!S.editRate)document.getElementById('tmv3-rate-unit').value=c.pricing_unit||'unit';
}
async function saveRate(){
 const categoryId=document.getElementById('tmv3-rate-category').value,conceptId=document.getElementById('tmv3-rate-concept').value;
 const concept=(S.matrix?.concepts||[]).find(x=>String(x.concept_id)===String(conceptId));
 const price=document.getElementById('tmv3-rate-price').value,from=document.getElementById('tmv3-rate-from').value,reason=document.getElementById('tmv3-rate-reason').value.trim();
 if(!categoryId||!conceptId||price===''||!from||reason.length<3)return setErr('tmv3-rate-error','Completá categoría, concepto, precio, vigencia y motivo.');
 const payload={company_id:S.companyId,billing_base_id:S.baseId,category_id:categoryId,concept_id:conceptId,unit_price:price,pricing_unit:document.getElementById('tmv3-rate-unit').value||concept?.pricing_unit||'unit',valid_from:from,valid_until:document.getElementById('tmv3-rate-until').value||null,currency:S.editRate?.rate?.currency||'ARS',change_reason:reason};
 const {error}=await _db.rpc('save_company_tariff_rate_v3',{p_payload:payload});
 if(error)return setErr('tmv3-rate-error',error.message);
 close('tmv3-rate-modal');notify('Nueva vigencia creada','success');S.asOf=from;document.getElementById('tmv3-asof').value=from;await loadMatrix();
}
async function openHistory(){
 const x=S.editRate;if(!x?.rate)return;
 const body=document.getElementById('tmv3-history-body');body.innerHTML='<div class="tmv3-empty"><span class="tmv3-spinner"></span><strong>Cargando historial…</strong></div>';
 document.getElementById('tmv3-history-title').textContent=`Historial · ${x.cat.name} · ${x.concept.name}`;open('tmv3-history-modal');
 const {data,error}=await _db.rpc('get_company_tariff_rate_history_v3',{p_company_id:S.companyId,p_base_id:S.baseId,p_category_id:x.categoryId,p_concept_id:x.conceptId});
 if(error){body.innerHTML=`<div class="tmv3-error">${esc(error.message)}</div>`;return;}
 const rows=data||[];
 body.innerHTML=rows.length?`<div class="tmv3-history-context">${esc(selectedCompany()?.trade_name||selectedCompany()?.legal_name||'')} · ${esc(selectedBase()?.name||selectedBase()?.base_code||'')}</div><div class="tmv3-table-wrap"><table class="tmv3-history"><thead><tr><th>Vigencia</th><th>Precio</th><th>Unidad</th><th>Rev.</th><th>Estado</th><th>Motivo</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.valid_from)}${r.valid_until?` → ${esc(r.valid_until)}`:' → abierta'}</td><td><strong>${money(r.unit_price,r.currency)}</strong></td><td>${esc(unitLabel(r.pricing_unit))}</td><td>${esc(r.revision)}</td><td><span class="tmv3-status-badge ${r.is_current?'active':'inactive'}">${r.is_current?'Versión activa':'Reemplazada'}</span></td><td>${esc(r.change_reason||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="tmv3-empty">Sin historial.</div>';
}

function openBulk(){
 const rows=filteredRows().filter(x=>x.rate);if(!rows.length)return notify('No hay tarifas vigentes en el filtro actual','warning');
 setErr('tmv3-bulk-error','');document.getElementById('tmv3-bulk-percent').value='10';document.getElementById('tmv3-bulk-from').value=S.asOf||today();document.getElementById('tmv3-bulk-reason').value='';
 document.getElementById('tmv3-bulk-scope').innerHTML=`Se actualizarán <b>${rows.length} tarifas</b> de <b>${esc(selectedCompany()?.trade_name||selectedCompany()?.legal_name)}</b> · <b>${esc(selectedBase()?.name||selectedBase()?.base_code)}</b>${S.group!=='all'?` · ${S.group.toUpperCase()}`:''}.`;
 renderBulkPreview();open('tmv3-bulk-modal');
}
function renderBulkPreview(){
 const e=document.getElementById('tmv3-bulk-preview');if(!e)return;
 const pct=Number(document.getElementById('tmv3-bulk-percent')?.value||0),rows=filteredRows().filter(x=>x.rate);
 e.innerHTML=`<div class="tmv3-table-wrap tmv3-preview"><table class="tmv3-table"><thead><tr><th>Categoría</th><th>Concepto</th><th>Actual</th><th>Nuevo</th></tr></thead><tbody>${rows.slice(0,30).map(x=>`<tr><td>${esc(x.cat.name)}</td><td>${esc(x.concept.name)}</td><td>${money(x.rate.unit_price,x.rate.currency)}</td><td><strong>${money(Number(x.rate.unit_price)*(1+pct/100),x.rate.currency)}</strong></td></tr>`).join('')}</tbody></table>${rows.length>30?`<div class="tmv3-preview-more">+ ${rows.length-30} tarifas adicionales</div>`:''}</div>`;
}
async function bulkSave(payloads){
 const bulk=await _db.rpc('bulk_save_company_tariff_rates_v3',{p_payload:{rates:payloads}});
 if(!bulk.error)return bulk;
 if(!/function|schema cache|bulk_save_company_tariff_rates_v3/i.test(bulk.error.message||''))return bulk;
 for(const p of payloads){const r=await _db.rpc('save_company_tariff_rate_v3',{p_payload:p});if(r.error)return r;}
 return{data:{count:payloads.length},error:null};
}
async function applyBulk(){
 const pct=Number(document.getElementById('tmv3-bulk-percent').value),from=document.getElementById('tmv3-bulk-from').value,reason=document.getElementById('tmv3-bulk-reason').value.trim(),rows=filteredRows().filter(x=>x.rate);
 if(!Number.isFinite(pct)||pct<=-100||!from||reason.length<3)return setErr('tmv3-bulk-error','Completá un porcentaje válido, la nueva vigencia y el motivo.');
 if(!rows.length)return setErr('tmv3-bulk-error','No hay tarifas para actualizar.');
 const payloads=rows.map(x=>({company_id:S.companyId,billing_base_id:S.baseId,category_id:x.cat.category_id,concept_id:x.concept.concept_id,unit_price:Number(x.rate.unit_price)*(1+pct/100),pricing_unit:x.rate.pricing_unit||x.concept.pricing_unit,currency:x.rate.currency||'ARS',valid_from:from,valid_until:null,change_reason:reason,metadata:{bulk_update:true,percentage:pct}}));
 const btn=document.querySelector('[data-tmv3="apply-bulk"]');if(btn)btn.disabled=true;
 const {error}=await bulkSave(payloads);if(btn)btn.disabled=false;
 if(error)return setErr('tmv3-bulk-error',error.message);
 close('tmv3-bulk-modal');notify(`${payloads.length} tarifas actualizadas con nueva vigencia`,'success');S.asOf=from;document.getElementById('tmv3-asof').value=from;await loadMatrix();
}

function openImport(){
 if(!S.companyId||!S.baseId||!S.matrix)return notify('Seleccioná una prestadora y una base','warning');
 setErr('tmv3-import-error','');S.importRows=[];S.importHeaders=[];
 document.getElementById('tmv3-import-from').value=S.asOf||today();document.getElementById('tmv3-import-reason').value='';document.getElementById('tmv3-import-text').value='';document.getElementById('tmv3-import-file').value='';
 document.getElementById('tmv3-import-mapping').innerHTML='';document.getElementById('tmv3-import-preview').innerHTML='';document.querySelector('[data-tmv3="apply-import"]').disabled=true;open('tmv3-import-modal');
}
async function readImportFile(e){
 const file=e.target.files?.[0];if(!file)return;
 if(!/\.(csv|tsv|txt)$/i.test(file.name)){setErr('tmv3-import-error','Para archivo usá CSV/TSV. También podés copiar y pegar directamente desde Excel.');return;}
 document.getElementById('tmv3-import-text').value=await file.text();prepareImport();
}
function splitLine(line,delimiter){
 const out=[];let value='',quoted=false;
 for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(ch===delimiter&&!quoted){out.push(value.trim());value='';}else value+=ch;}out.push(value.trim());return out;
}
function parseTabular(text){
 const lines=String(text||'').replace(/\r/g,'').split('\n').filter(x=>x.trim());if(lines.length<2)return{headers:[],rows:[]};
 const first=lines[0],delimiter=first.includes('\t')?'\t':(first.split(';').length>first.split(',').length?';':',');
 const headers=splitLine(first,delimiter).map(x=>x.trim());
 const rows=lines.slice(1).map(line=>{const cells=splitLine(line,delimiter),o={};headers.forEach((h,i)=>o[h]=cells[i]??'');return o;});
 return{headers,rows};
}
function guessHeader(headers,kind){
 const tests={category:['categoria','category','tipo','unidad'],concept:['concepto','concept','servicio','item'],price:['precio','valor','tarifa','importe'],unit:['unidad','unit','u.m.','um']};
 return headers.find(h=>tests[kind].some(t=>norm(h)===t||norm(h).includes(t)))||'';
}
function prepareImport(){
 setErr('tmv3-import-error','');const parsed=parseTabular(document.getElementById('tmv3-import-text').value);
 if(!parsed.headers.length||!parsed.rows.length)return setErr('tmv3-import-error','Pegá una tabla con encabezados y al menos una fila.');
 S.importHeaders=parsed.headers;S.importRows=parsed.rows;
 const opts=(sel='')=>'<option value="">Seleccionar columna</option>'+parsed.headers.map(h=>`<option value="${esc(h)}" ${h===sel?'selected':''}>${esc(h)}</option>`).join('');
 document.getElementById('tmv3-import-mapping').innerHTML=`<div class="tmv3-mapping"><div class="tmv3-block-title"><h4>Mapeo de columnas</h4><span>Indicá qué columna corresponde a cada dato.</span></div><div class="tmv3-form-grid"><label><span>Categoría *</span><select id="tmv3-map-category">${opts(guessHeader(parsed.headers,'category'))}</select></label><label><span>Concepto *</span><select id="tmv3-map-concept">${opts(guessHeader(parsed.headers,'concept'))}</select></label><label><span>Precio *</span><select id="tmv3-map-price">${opts(guessHeader(parsed.headers,'price'))}</select></label><label><span>Unidad</span><select id="tmv3-map-unit">${opts(guessHeader(parsed.headers,'unit'))}</select></label></div><button class="secondary" type="button" data-tmv3="prepare-import-preview">Validar mapeo</button></div>`;
 const b=document.querySelector('[data-tmv3="prepare-import-preview"]');b?.addEventListener('click',renderImportPreview,{once:false});
 renderImportPreview();
}
function importPayloads(){
 const mc=document.getElementById('tmv3-map-category')?.value,mx=document.getElementById('tmv3-map-concept')?.value,mp=document.getElementById('tmv3-map-price')?.value,mu=document.getElementById('tmv3-map-unit')?.value;
 if(!mc||!mx||!mp)return{payloads:[],errors:['Mapeá Categoría, Concepto y Precio.']};
 const cats=(S.matrix?.categories||[]).filter(x=>x.is_enabled),concepts=(S.matrix?.concepts||[]).filter(x=>x.is_enabled),errors=[],payloads=[];
 S.importRows.forEach((r,i)=>{
  const cat=cats.find(x=>norm(x.name)===norm(r[mc])),concept=concepts.find(x=>norm(x.name)===norm(r[mx]));
  const raw=String(r[mp]??'').replace(/\$/g,'').replace(/\s/g,'').replace(/\./g,'').replace(',','.'),price=Number(raw);
  if(!cat||!concept||!Number.isFinite(price)||price<0){errors.push(`Fila ${i+2}: ${!cat?'categoría no encontrada; ':''}${!concept?'concepto no encontrado; ':''}${!Number.isFinite(price)?'precio inválido':''}`);return;}
  const unitRaw=norm(mu?r[mu]:'');const unitMap={servicio:'service',service:'service',unidad:'unit',unit:'unit',km:'km',hora:'hour',hour:'hour',dia:'day',day:'day',fijo:'fixed',fixed:'fixed'};
  payloads.push({cat,concept,price,unit:unitMap[unitRaw]||concept.pricing_unit||'unit'});
 });
 return{payloads,errors};
}
function renderImportPreview(){
 const box=document.getElementById('tmv3-import-preview'),btn=document.querySelector('[data-tmv3="apply-import"]');if(!box||!btn)return;
 const {payloads,errors}=importPayloads();btn.disabled=!payloads.length||errors.length>0;
 box.innerHTML=`${errors.length?`<div class="tmv3-import-errors"><b>Revisá ${errors.length} fila(s)</b>${errors.slice(0,8).map(x=>`<span>${esc(x)}</span>`).join('')}${errors.length>8?`<span>+ ${errors.length-8} errores</span>`:''}</div>`:''}${payloads.length?`<div class="tmv3-table-wrap tmv3-preview"><table class="tmv3-table"><thead><tr><th>Categoría</th><th>Concepto</th><th>Grupo</th><th>Precio</th><th>Unidad</th></tr></thead><tbody>${payloads.slice(0,30).map(x=>`<tr><td>${esc(x.cat.name)}</td><td>${esc(x.concept.name)}</td><td><span class="tmv3-group-badge ${groupClass(x.concept)}">${groupLabel(x.concept)}</span></td><td><strong>${money(x.price)}</strong></td><td>${esc(unitLabel(x.unit))}</td></tr>`).join('')}</tbody></table></div>`:''}`;
}
async function applyImport(){
 const from=document.getElementById('tmv3-import-from').value,reason=document.getElementById('tmv3-import-reason').value.trim(),{payloads,errors}=importPayloads();
 if(!from||reason.length<3)return setErr('tmv3-import-error','Completá la vigencia y el motivo.');
 if(errors.length||!payloads.length)return setErr('tmv3-import-error','Corregí la vista previa antes de importar.');
 const rates=payloads.map(x=>({company_id:S.companyId,billing_base_id:S.baseId,category_id:x.cat.category_id,concept_id:x.concept.concept_id,unit_price:x.price,pricing_unit:x.unit,currency:'ARS',valid_from:from,valid_until:null,change_reason:reason,metadata:{imported:true,source:'excel_paste'}}));
 const btn=document.querySelector('[data-tmv3="apply-import"]');btn.disabled=true;const {error}=await bulkSave(rates);btn.disabled=false;
 if(error)return setErr('tmv3-import-error',error.message);
 close('tmv3-import-modal');notify(`${rates.length} tarifas importadas`,'success');S.asOf=from;document.getElementById('tmv3-asof').value=from;await loadMatrix();
}

/* Compatibilidad conceptual: Tarifarios por prestadora · cada celda conserva Categoría + Concepto. */
function ready(){if(inject())return;setTimeout(ready,250)}
window.addEventListener('auxilios:profile-ready',()=>{if(inject())loadCatalog();});
ready();
window.TariffMatrixV3={loadCatalog,loadMatrix,state:S};
})();
/* AuxiliOS · Motor tarifario · servicios */
(()=>{'use strict';
const T=window.TariffEngine,S=T.S;
const {esc,num,money,unitLabel,concept,itemFor,enabledItems,primaryItems,secondaryItems,mixedItems,editable,notify,setForm,input,checked,formError,close,renderStep}=T;
function categoryOf(c){
 if(c.default_can_be_primary&&c.default_can_be_secondary)return'mixed';
 if(c.default_can_be_primary)return'primary';return'secondary';
}
function serviceCard(c){
 const item=itemFor(c.concept_id),branches=S.items.filter(x=>x.concept_id===c.concept_id&&x.branch_id!=null);
 const enabled=!!item,cat=categoryOf(c);
 const roles=item?{p:item.can_be_primary,s:item.can_be_secondary}:{p:c.default_can_be_primary,s:c.default_can_be_secondary};
 const priceFields=enabled?`<div class="tc-price-grid ${roles.p&&roles.s?'':'one'}">
  ${roles.p?`<div class="tc-field"><label>Precio como principal</label><input class="form-input" type="number" min="0" value="${num(item.primary_price)}" ${editable()?'':'disabled'} onchange="actualizarPrecioConcepto('${c.concept_id}','primary',this.value)"></div>`:''}
  ${roles.s?`<div class="tc-field"><label>Precio como adicional</label><input class="form-input" type="number" min="0" value="${num(item.secondary_price)}" ${editable()?'':'disabled'} onchange="actualizarPrecioConcepto('${c.concept_id}','secondary',this.value)"></div>`:''}
 </div>
 <div class="tc-price-grid one"><div class="tc-field"><label>Unidad de cobro</label><select class="form-input" ${editable()?'':'disabled'} onchange="actualizarUnidadConcepto('${c.concept_id}',this.value)">${['service','hour','km','unit','day','fixed'].map(v=>`<option value="${v}" ${item.pricing_unit===v?'selected':''}>${unitLabel(v)}</option>`).join('')}</select></div></div>`:'';
 return `<article class="tc-service ${enabled?'enabled':''}">
  <div class="tc-card-head"><div class="tc-row"><div class="tc-icon">${esc(c.icon)}</div><div><div class="tc-service-name">${esc(c.name)}</div><div class="tc-badges">${cat==='mixed'?'<span class="tc-badge mixed">Mixto</span>':cat==='primary'?'<span class="tc-badge primary">Principal</span>':'<span class="tc-badge secondary">Secundario</span>'}</div></div></div>
   <label class="tc-switch"><input type="checkbox" ${enabled?'checked':''} ${editable()?'':'disabled'} onchange="alternarConcepto('${c.concept_id}',this.checked)"><i></i></label>
  </div>
  <div class="tc-muted" style="margin-top:8px">${esc(c.description||'')}</div>
  ${enabled&&cat==='mixed'?`<div class="tc-role-options">
   <label><input type="checkbox" ${roles.p?'checked':''} ${editable()?'':'disabled'} onchange="actualizarRolConcepto('${c.concept_id}','primary',this.checked)"> Principal</label>
   <label><input type="checkbox" ${roles.s?'checked':''} ${editable()?'':'disabled'} onchange="actualizarRolConcepto('${c.concept_id}','secondary',this.checked)"> Secundario</label>
  </div>`:''}
  ${priceFields}
  ${enabled&&S.branches.length?`<div class="tc-branch-note"><span>${branches.length?`${branches.length} variante${branches.length===1?'':'s'} por sucursal`:'Mismo valor para todas las sucursales'}</span>${editable()?`<button class="btn btn-ghost" onclick="gestionarSucursalesConcepto('${c.concept_id}')">Sucursales</button>`:''}</div>`:''}
 </article>`;
}
function renderServices(el){
 const q=S.search.toLowerCase(),list=S.catalog.filter(c=>(S.filter==='all'||categoryOf(c)===S.filter)&&(!q||`${c.name} ${c.description||''}`.toLowerCase().includes(q)));
 el.innerHTML=`<div class="tc-step-title">Conceptos del servicio</div><div class="tc-step-sub">Activá qué puede solicitar la empresa y definí su precio como principal o adicional.</div>
 <div class="tc-kpis"><div class="tc-kpi"><small>Seleccionados</small><b>${enabledItems().length}</b></div><div class="tc-kpi"><small>Principales</small><b>${primaryItems().length}</b></div><div class="tc-kpi"><small>Secundarios</small><b>${secondaryItems().length}</b></div><div class="tc-kpi"><small>Mixtos</small><b>${mixedItems().length}</b></div></div>
 <div class="tc-toolbar"><input class="form-input" placeholder="Buscar concepto…" value="${esc(S.search)}" oninput="buscarConceptoTarifa(this.value)">
  <div class="tc-filter">${[['all','Todos'],['primary','Principales'],['secondary','Secundarios'],['mixed','Mixtos']].map(([v,l])=>`<button class="${S.filter===v?'active':''}" onclick="filtrarConceptoTarifa('${v}')">${l}</button>`).join('')}</div>
  ${editable()?'<button class="btn btn-ghost" onclick="abrirConceptoPersonalizado()">＋ Concepto</button>':''}
 </div>
 <div class="tc-service-grid">${list.map(serviceCard).join('')||'<div class="tc-empty">No hay resultados.</div>'}</div>`;
}
function searchConcept(v){S.search=v;renderStep()}
function filterConcept(v){S.filter=v;renderStep()}

function baseItemPayload(c,branchId=null){
 return {rate_card_id:S.card.rate_card_id,branch_id:branchId,concept_id:c.concept_id,service_code:c.code,service_name:c.name,
  can_be_primary:c.default_can_be_primary,can_be_secondary:c.default_can_be_secondary,pricing_unit:c.default_pricing_unit,
  primary_price:0,secondary_price:0,base_price:0,included_km:0,extra_km_price:0,km_calculation_method:'one_way',
  included_wait_minutes:0,wait_price_per_hour:0,tolls_mode:'not_applicable',tolls_fixed_amount:0,extraction_fee:0,
  cancellation_fee:0,second_unit_fee:0,minimum_charge:0,night_surcharge_pct:0,weekend_surcharge_pct:0,holiday_surcharge_pct:0,is_active:true};
}
async function toggleConcept(id,on){
 if(!editable())return;const c=concept(id);if(!c)return;
 if(on){
  const r=await _db.from('company_rate_items').insert(baseItemPayload(c)).select().single();
  if(r.error)return notify(r.error.message,'error');S.items.push(r.data);
 }else{
  const rows=S.items.filter(x=>x.concept_id===id);
  await Promise.all([
   _db.from('company_rate_service_links').delete().eq('rate_card_id',S.card.rate_card_id).or(`primary_concept_id.eq.${id},secondary_concept_id.eq.${id}`),
   _db.from('company_rate_rule_exceptions').delete().eq('rate_card_id',S.card.rate_card_id).eq('concept_id',id)
  ]);
  if(rows.length){const r=await _db.from('company_rate_items').delete().in('rate_item_id',rows.map(x=>x.rate_item_id));if(r.error)return notify(r.error.message,'error')}
  S.items=S.items.filter(x=>x.concept_id!==id);S.links=S.links.filter(x=>x.primary_concept_id!==id&&x.secondary_concept_id!==id);S.exceptions=S.exceptions.filter(x=>x.concept_id!==id);
 }
 renderStep();notify(on?'Concepto activado':'Concepto desactivado','success');
}
async function updateItem(id,patch,branchId=null){
 if(!editable())return;const item=itemFor(id,branchId);if(!item)return;
 const merged={...item,...patch};
 if(!merged.can_be_primary&&!merged.can_be_secondary)return notify('El concepto debe mantener al menos un rol','warning');
 const payload={...patch,base_price:merged.can_be_primary?num(merged.primary_price):num(merged.secondary_price)};
 const r=await _db.from('company_rate_items').update(payload).eq('rate_item_id',item.rate_item_id).select().single();
 if(r.error)return notify(r.error.message,'error');
 S.items=S.items.map(x=>x.rate_item_id===r.data.rate_item_id?r.data:x);renderStep();
}
function updatePrice(id,kind,value){updateItem(id,{[kind==='primary'?'primary_price':'secondary_price']:num(value)})}
function updateUnit(id,value){updateItem(id,{pricing_unit:value})}
function updateRole(id,kind,on){updateItem(id,{[kind==='primary'?'can_be_primary':'can_be_secondary']:on})}

function customConcept(){
 if(!editable())return;
 setForm('Nuevo concepto','concept',{},`
  <div class="form-grid-2"><div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="tf-name"></div>
  <div class="form-group"><label class="form-label">Ícono</label><input class="form-input" id="tf-icon" value="⚙" maxlength="4"></div></div>
  <div class="form-group"><label class="form-label">Descripción</label><input class="form-input" id="tf-description"></div>
  <div class="form-grid-2"><label class="emp-check"><input type="checkbox" id="tf-primary"> Puede ser principal</label><label class="emp-check"><input type="checkbox" id="tf-secondary" checked> Puede ser secundario</label></div>
  <div class="form-group"><label class="form-label">Unidad predeterminada</label><select class="form-input" id="tf-unit">${['service','hour','km','unit','day','fixed'].map(v=>`<option value="${v}">${unitLabel(v)}</option>`).join('')}</select></div>
  <div class="modal-error" id="tc-form-error" style="display:none"></div>`);
}
async function saveCustomConcept(){
 const name=input('tf-name').trim(),p=checked('tf-primary'),s=checked('tf-secondary');
 if(!name)return formError('Ingresá el nombre.');if(!p&&!s)return formError('Elegí al menos un rol.');
 const slug=name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,50);
 const r=await _db.from('service_concepts').insert({code:`custom_${slug||Date.now()}`,name,description:input('tf-description').trim()||null,
  default_can_be_primary:p,default_can_be_secondary:s,default_pricing_unit:input('tf-unit'),icon:input('tf-icon').trim()||'⚙',sort_order:400}).select().single();
 if(r.error)return formError(r.error.message);S.catalog.push(r.data);S.catalog.sort((a,b)=>a.sort_order-b.sort_order||a.name.localeCompare(b.name));
 close('tariff-small-modal');renderStep();notify('Concepto creado','success');
}

function branchManager(conceptId){
 if(!editable())return;const c=concept(conceptId),rows=S.items.filter(x=>x.concept_id===conceptId&&x.branch_id);
 setForm(`Valores por sucursal · ${c.name}`,'branch_item',{conceptId},`
  <div class="tc-muted">Agregá una variante solo cuando una sucursal tenga un precio distinto. El valor general seguirá aplicando al resto.</div>
  <div class="tc-form-section">Variantes existentes</div>
  <div class="tc-rate-list">${rows.length?rows.map(x=>{const b=S.branches.find(v=>v.branch_id===x.branch_id);return`<div class="tc-rate"><div><b>${esc(b?.name||'Sucursal')}</b><small>${x.can_be_primary?money(x.primary_price):''}${x.can_be_primary&&x.can_be_secondary?' · ':''}${x.can_be_secondary?money(x.secondary_price):''}</small></div><button class="btn btn-ghost" onclick="eliminarVarianteSucursal('${x.rate_item_id}','${conceptId}')">Eliminar</button></div>`}).join(''):'<div class="tc-empty">Sin variantes.</div>'}</div>
  <div class="tc-form-section">Nueva variante</div>
  <div class="form-group"><label class="form-label">Sucursal</label><select class="form-input" id="tf-branch"><option value="">Seleccionar…</option>${S.branches.filter(b=>!rows.some(x=>x.branch_id===b.branch_id)).map(b=>`<option value="${b.branch_id}">${esc(b.name)}</option>`).join('')}</select></div>
  <div class="form-grid-2"><div class="form-group"><label class="form-label">Precio principal</label><input class="form-input" type="number" min="0" id="tf-primary-price" value="0"></div><div class="form-group"><label class="form-label">Precio adicional</label><input class="form-input" type="number" min="0" id="tf-secondary-price" value="0"></div></div>
  <div class="modal-error" id="tc-form-error" style="display:none"></div>`);
}
async function saveBranchItem(){
 const branchId=input('tf-branch');if(!branchId)return formError('Seleccioná una sucursal.');
 const c=concept(S.form.conceptId),general=itemFor(c.concept_id),payload={...baseItemPayload(c,branchId),
  can_be_primary:general.can_be_primary,can_be_secondary:general.can_be_secondary,pricing_unit:general.pricing_unit,
  primary_price:num(input('tf-primary-price')),secondary_price:num(input('tf-secondary-price'))};
 payload.base_price=payload.can_be_primary?payload.primary_price:payload.secondary_price;
 const r=await _db.from('company_rate_items').insert(payload).select().single();if(r.error)return formError(r.error.message);
 S.items.push(r.data);close('tariff-small-modal');renderStep();notify('Variante agregada','success');
}
async function deleteBranchItem(id,conceptId){
 if(!confirm('¿Eliminar esta variante?'))return;const r=await _db.from('company_rate_items').delete().eq('rate_item_id',id);if(r.error)return notify(r.error.message,'error');
 S.items=S.items.filter(x=>x.rate_item_id!==id);branchManager(conceptId);
}


Object.assign(T,{renderServices,saveBranchItem,saveCustomConcept});
Object.assign(window,{buscarConceptoTarifa:searchConcept,filtrarConceptoTarifa:filterConcept,alternarConcepto:toggleConcept,
 actualizarPrecioConcepto:updatePrice,actualizarUnidadConcepto:updateUnit,actualizarRolConcepto:updateRole,
 abrirConceptoPersonalizado:customConcept,gestionarSucursalesConcepto:branchManager,eliminarVarianteSucursal:deleteBranchItem});
})();

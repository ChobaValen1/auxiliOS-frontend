/* AuxiliOS · Motor tarifario · reglas */
(()=>{'use strict';
const T=window.TariffEngine,S=T.S;
const {esc,num,money,concept,itemFor,enabledItems,primaryItems,secondaryItems,editable,notify,renderStep,rule,ruleMeta,codeLabels}=T;
function timeInput(v){return v?String(v).slice(0,5):''}
function calcOptions(r){return `<select class="form-input" ${editable()?'':'disabled'} onchange="actualizarRegla('${r.rule_type}',{calculation_mode:this.value})"><option value="percentage" ${r.calculation_mode==='percentage'?'selected':''}>Porcentaje</option><option value="fixed" ${r.calculation_mode==='fixed'?'selected':''}>Valor fijo</option></select>`}
function exceptionGrid(r){
 const selected=new Set(S.exceptions.filter(x=>x.rule_id===r.rule_id).map(x=>x.concept_id));
 return `<div class="tc-exceptions"><strong>Excepciones — sin aplicar este recargo</strong><div class="tc-muted">Marcá los conceptos que deben quedar fuera de la regla.</div>
 <div class="tc-check-grid">${enabledItems().map(i=>{const c=concept(i.concept_id);return`<label class="tc-check"><input type="checkbox" ${selected.has(i.concept_id)?'checked':''} ${editable()?'':'disabled'} onchange="alternarExcepcionRegla('${r.rule_id}','${i.concept_id}',this.checked)"><span>${esc(c?.name||i.service_name)}</span></label>`}).join('')||'<div class="tc-muted">Primero activá conceptos.</div>'}</div></div>`;
}
function ruleCard(r){
 const m=ruleMeta[r.rule_type];
 let fields='';
 if(r.rule_type==='night')fields=`<div class="tc-rule-fields">
  <div class="tc-field"><label>Desde</label><input class="form-input" type="time" value="${timeInput(r.start_time)}" ${editable()?'':'disabled'} onchange="actualizarRegla('night',{start_time:this.value||null})"></div>
  <div class="tc-field"><label>Hasta</label><input class="form-input" type="time" value="${timeInput(r.end_time)}" ${editable()?'':'disabled'} onchange="actualizarRegla('night',{end_time:this.value||null})"></div>
  <div class="tc-field"><label>Tipo de recargo</label>${calcOptions(r)}</div>
  <div class="tc-field"><label>Valor ${r.calculation_mode==='percentage'?'%':''}</label><input class="form-input" type="number" min="0" value="${num(r.amount)}" ${editable()?'':'disabled'} onchange="actualizarRegla('night',{amount:Number(this.value)||0})"></div>
 </div>`;
 if(r.rule_type==='weekend_holiday')fields=`<div class="tc-form-section">Sábado</div><div class="tc-rule-fields">
  <div class="tc-field"><label>Desde</label><input class="form-input" type="time" value="${timeInput(r.saturday_start)}" ${editable()?'':'disabled'} onchange="actualizarRegla('weekend_holiday',{saturday_start:this.value||null})"></div>
  <div class="tc-field"><label>Hasta</label><input class="form-input" type="time" value="${timeInput(r.saturday_end)}" ${editable()?'':'disabled'} onchange="actualizarRegla('weekend_holiday',{saturday_end:this.value||null})"></div>
  <div class="tc-field"><label>Tipo de recargo</label>${calcOptions(r)}</div>
  <div class="tc-field"><label>Valor ${r.calculation_mode==='percentage'?'%':''}</label><input class="form-input" type="number" min="0" value="${num(r.amount)}" ${editable()?'':'disabled'} onchange="actualizarRegla('weekend_holiday',{amount:Number(this.value)||0})"></div>
 </div><div class="tc-form-section">Domingo / feriado</div><div class="tc-rule-fields">
  <div class="tc-field"><label>Desde</label><input class="form-input" type="time" value="${timeInput(r.sunday_holiday_start)}" ${editable()?'':'disabled'} onchange="actualizarRegla('weekend_holiday',{sunday_holiday_start:this.value||null})"></div>
  <div class="tc-field"><label>Hasta</label><input class="form-input" type="time" value="${timeInput(r.sunday_holiday_end)}" ${editable()?'':'disabled'} onchange="actualizarRegla('weekend_holiday',{sunday_holiday_end:this.value||null})"></div>
 </div>`;
 if(r.rule_type==='wide_coverage')fields=`<div class="tc-rule-fields">
  <div class="tc-field"><label>Distancia mínima (km)</label><input class="form-input" type="number" min="0" value="${num(r.distance_threshold_km)}" ${editable()?'':'disabled'} onchange="actualizarRegla('wide_coverage',{distance_threshold_km:Number(this.value)||0})"></div>
  <div class="tc-field"><label>Tipo de recargo</label>${calcOptions(r)}</div>
  <div class="tc-field"><label>Valor ${r.calculation_mode==='percentage'?'%':''}</label><input class="form-input" type="number" min="0" value="${num(r.amount)}" ${editable()?'':'disabled'} onchange="actualizarRegla('wide_coverage',{amount:Number(this.value)||0})"></div>
 </div>`;
 return `<article class="tc-rule ${m.tone}"><div class="tc-switch-row"><div class="tc-row"><div class="tc-rule-icon">${m.icon}</div><div><div class="tc-service-name">${m.title}</div><div class="tc-muted">${m.sub}</div></div></div>
  <label class="tc-switch"><input type="checkbox" ${r.enabled?'checked':''} ${editable()?'':'disabled'} onchange="actualizarRegla('${r.rule_type}',{enabled:this.checked})"><i></i></label></div>
  <div style="${r.enabled?'':'opacity:.55'}">${fields}${exceptionGrid(r)}</div></article>`;
}
function renderRules(el){
 el.innerHTML=`<div class="tc-step-title">Recargos automáticos</div><div class="tc-step-sub">Definí cuándo se aplica cada regla y qué conceptos quedan exceptuados.</div>
 <div class="tc-rule-list">${['night','weekend_holiday','wide_coverage'].map(t=>rule(t)).filter(Boolean).map(ruleCard).join('')}</div>`;
}
async function updateRule(type,patch){
 if(!editable())return;const r=rule(type);if(!r)return;
 const res=await _db.from('company_rate_rules').update(patch).eq('rule_id',r.rule_id).select().single();
 if(res.error)return notify(res.error.message,'error');S.rules=S.rules.map(x=>x.rule_id===r.rule_id?res.data:x);renderStep();
}
async function toggleException(ruleId,conceptId,on){
 if(!editable())return;
 if(on){
  const r=await _db.from('company_rate_rule_exceptions').insert({rate_card_id:S.card.rate_card_id,rule_id:ruleId,concept_id:conceptId}).select().single();
  if(r.error)return notify(r.error.message,'error');S.exceptions.push(r.data);
 }else{
  const r=await _db.from('company_rate_rule_exceptions').delete().eq('rule_id',ruleId).eq('concept_id',conceptId);
  if(r.error)return notify(r.error.message,'error');S.exceptions=S.exceptions.filter(x=>!(x.rule_id===ruleId&&x.concept_id===conceptId));
 }
}

function renderLinks(el){
 const prim=primaryItems(),sec=secondaryItems(),selected=window.__tcPrimary||prim[0]?.concept_id;window.__tcPrimary=selected;
 const pItem=prim.find(x=>x.concept_id===selected),links=S.links.filter(x=>x.primary_concept_id===selected);
 el.innerHTML=`<div class="tc-step-title">Tarifas diferenciadas</div><div class="tc-step-sub">Usá esta sección solo cuando un adicional cambia de precio según el servicio principal.</div>
 ${!prim.length||!sec.length?'<div class="tc-empty" style="margin-top:15px">Necesitás al menos un concepto principal y uno secundario.</div>':`<div class="tc-link-builder">
  <div class="tc-primary-list"><div class="tc-eyebrow">Servicio principal</div><div class="tc-muted" style="margin:5px 0 10px">Elegí el servicio que condiciona el precio.</div>
   ${prim.map(i=>{const c=concept(i.concept_id);return`<div class="tc-primary-option ${selected===i.concept_id?'active':''}" onclick="seleccionarPrincipalTarifa('${i.concept_id}')">${esc(c?.icon||'')} ${esc(c?.name||i.service_name)}</div>`}).join('')}
  </div>
  <div class="tc-secondary-panel"><div class="tc-card-head"><div><div class="tc-eyebrow">Adicionales vinculados</div><div class="tc-title">${esc(concept(pItem?.concept_id)?.name||'Servicio')}</div></div><span class="tc-pill">${links.length} reglas</span></div>
   <div class="tc-muted" style="margin-top:5px">Al activar una regla podés fijar un precio especial. Sin precio especial se usa el valor secundario general.</div>
   <div class="tc-secondary-grid">${sec.filter(i=>i.concept_id!==selected).map(i=>linkRow(selected,i)).join('')}</div>
  </div>
 </div>`}`;
}
function linkRow(primaryId,item){
 const c=concept(item.concept_id),link=S.links.find(x=>x.primary_concept_id===primaryId&&x.secondary_concept_id===item.concept_id);
 return `<div class="tc-link-row"><div class="tc-row"><label class="tc-check"><input type="checkbox" ${link?'checked':''} ${editable()?'':'disabled'} onchange="alternarVinculoTarifa('${primaryId}','${item.concept_id}',this.checked)"><span>${esc(c?.name||item.service_name)}</span></label><span class="tc-badge secondary">${money(item.secondary_price)}</span></div>
 ${link?`<div class="tc-field"><label>Precio especial opcional</label><input class="form-input" type="number" min="0" placeholder="${num(item.secondary_price)}" value="${link.price_override??''}" ${editable()?'':'disabled'} onchange="actualizarPrecioVinculo('${link.link_id}',this.value)"></div>`:''}</div>`;
}
function selectPrimary(id){window.__tcPrimary=id;renderStep()}
async function toggleLink(primaryId,secondaryId,on){
 if(!editable())return;
 if(on){
  const r=await _db.from('company_rate_service_links').insert({rate_card_id:S.card.rate_card_id,primary_concept_id:primaryId,secondary_concept_id:secondaryId,is_enabled:true}).select().single();
  if(r.error)return notify(r.error.message,'error');S.links.push(r.data);
 }else{
  const link=S.links.find(x=>x.primary_concept_id===primaryId&&x.secondary_concept_id===secondaryId);if(!link)return;
  const r=await _db.from('company_rate_service_links').delete().eq('link_id',link.link_id);if(r.error)return notify(r.error.message,'error');
  S.links=S.links.filter(x=>x.link_id!==link.link_id);
 }
 renderStep();
}
async function updateLinkPrice(id,value){
 if(!editable())return;const v=String(value).trim()===''?null:num(value);
 const r=await _db.from('company_rate_service_links').update({price_override:v}).eq('link_id',id).select().single();
 if(r.error)return notify(r.error.message,'error');S.links=S.links.map(x=>x.link_id===id?r.data:x);
}

function renderBilling(el){
 const b=S.billing||{},codeMap=new Map(S.codes.map(x=>[x.code_key,x]));
 el.innerHTML=`<div class="tc-step-title">Cobros, peajes y códigos</div><div class="tc-step-sub">Separá lo que paga la empresa, lo que abona el cliente y los códigos que usa la prestación.</div>
 <div class="tc-billing-grid">
  <article class="tc-panel"><div class="tc-switch-row"><div><h4>Copago</h4><div class="tc-muted">El cliente final paga una parte del servicio.</div></div><label class="tc-switch"><input type="checkbox" ${b.copay_enabled?'checked':''} ${editable()?'':'disabled'} onchange="actualizarCobroTarifa({copay_enabled:this.checked})"><i></i></label></div>
   <div class="tc-panel-fields" style="${b.copay_enabled?'':'opacity:.5'}"><div class="tc-field"><label>Modalidad</label><select class="form-input" ${editable()?'':'disabled'} onchange="actualizarCobroTarifa({copay_mode:this.value})"><option value="fixed" ${b.copay_mode==='fixed'?'selected':''}>Valor fijo</option><option value="percentage" ${b.copay_mode==='percentage'?'selected':''}>Porcentaje</option></select></div>
    <div class="tc-field"><label>Valor ${b.copay_mode==='percentage'?'%':''}</label><input class="form-input" type="number" min="0" value="${num(b.copay_value)}" ${editable()?'':'disabled'} onchange="actualizarCobroTarifa({copay_value:Number(this.value)||0})"></div></div>
  </article>
  <article class="tc-panel"><div class="tc-switch-row"><div><h4>Peajes</h4><div class="tc-muted">Define si la prestadora usa y factura peajes.</div></div><label class="tc-switch"><input type="checkbox" ${b.toll_enabled?'checked':''} ${editable()?'':'disabled'} onchange="actualizarCobroTarifa({toll_enabled:this.checked})"><i></i></label></div>
   <div style="${b.toll_enabled?'':'opacity:.5'}"><label class="emp-check"><input type="checkbox" ${b.toll_invoice_enabled?'checked':''} ${editable()?'':'disabled'} onchange="actualizarCobroTarifa({toll_invoice_enabled:this.checked})"> Incluir peaje en la factura</label>
    <label class="emp-check"><input type="checkbox" ${b.require_toll_receipt?'checked':''} ${editable()?'':'disabled'} onchange="actualizarCobroTarifa({require_toll_receipt:this.checked})"> Requerir comprobante</label>
    <div class="tc-panel-fields"><div class="tc-field"><label>Modalidad</label><select class="form-input" ${editable()?'':'disabled'} onchange="actualizarCobroTarifa({toll_mode:this.value})"><option value="at_cost" ${b.toll_mode==='at_cost'?'selected':''}>Al costo</option><option value="fixed" ${b.toll_mode==='fixed'?'selected':''}>Monto fijo</option><option value="included" ${b.toll_mode==='included'?'selected':''}>Incluido</option></select></div>
     <div class="tc-field"><label>Monto fijo</label><input class="form-input" type="number" min="0" value="${num(b.toll_fixed_amount)}" ${editable()?'':'disabled'} onchange="actualizarCobroTarifa({toll_fixed_amount:Number(this.value)||0})"></div></div>
   </div>
  </article>
 </div>
 <article class="tc-panel" style="margin-top:12px"><h4>Códigos de servicio</h4><div class="tc-muted">Activá los códigos adicionales que utiliza este contrato.</div>
  <div class="tc-codes">${Object.entries(codeLabels).map(([k,l])=>{const row=codeMap.get(k);return`<div class="tc-code"><span>${l}</span><label class="tc-switch"><input type="checkbox" ${row?.enabled?'checked':''} ${editable()?'':'disabled'} onchange="actualizarCodigoTarifa('${k}',this.checked)"><i></i></label></div>`}).join('')}</div>
 </article>`;
}
async function updateBilling(patch){
 if(!editable())return;
 const r=await _db.from('company_rate_billing_settings').update(patch).eq('rate_card_id',S.card.rate_card_id).select().single();
 if(r.error)return notify(r.error.message,'error');S.billing=r.data;renderStep();
}
async function updateCode(key,on){
 if(!editable())return;let row=S.codes.find(x=>x.code_key===key),r;
 if(row)r=await _db.from('company_rate_codes').update({enabled:on}).eq('code_id',row.code_id).select().single();
 else r=await _db.from('company_rate_codes').insert({rate_card_id:S.card.rate_card_id,code_key:key,enabled:on}).select().single();
 if(r.error)return notify(r.error.message,'error');
 S.codes=row?S.codes.map(x=>x.code_id===r.data.code_id?r.data:x):[...S.codes,r.data];
}


Object.assign(T,{renderRules,renderLinks,renderBilling});
Object.assign(window,{actualizarRegla:updateRule,alternarExcepcionRegla:toggleException,seleccionarPrincipalTarifa:selectPrimary,
 alternarVinculoTarifa:toggleLink,actualizarPrecioVinculo:updateLinkPrice,actualizarCobroTarifa:updateBilling,
 actualizarCodigoTarifa:updateCode});
})();

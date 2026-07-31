/* AuxiliOS · Motor tarifario · resumen */
(()=>{'use strict';
const T=window.TariffEngine,S=T.S;
const {esc,num,money,concept,itemFor,enabledItems,primaryItems,secondaryItems,editable,notify,rule,checked,canWrite,load,closeWizard,openWizard,inject,renderEmbedded,renderStep}=T;
function timeInside(value,start,end){
 if(!value||!start||!end)return false;
 const v=value.slice(0,5),s=start.slice(0,5),e=end.slice(0,5);
 return s<=e?(v>=s&&v<=e):(v>=s||v<=e);
}
function validationRows(){
 const rows=[];
 rows.push({ok:primaryItems().length>0,text:primaryItems().length?`${primaryItems().length} concepto${primaryItems().length===1?'':'s'} principal${primaryItems().length===1?'':'es'}`:'Falta al menos un concepto principal'});
 rows.push({ok:enabledItems().every(i=>(!i.can_be_primary||num(i.primary_price)>=0)&&(!i.can_be_secondary||num(i.secondary_price)>=0)),text:'Precios validados'});
 rows.push({ok:true,text:`${S.rules.filter(r=>r.enabled).length} regla${S.rules.filter(r=>r.enabled).length===1?'':'s'} automática${S.rules.filter(r=>r.enabled).length===1?'':'s'}`});
 rows.push({ok:true,text:`${S.links.length} tarifa${S.links.length===1?'':'s'} diferenciada${S.links.length===1?'':'s'}`});
 return rows;
}
function renderSummary(el){
 const prim=primaryItems(),sec=secondaryItems(),selected=window.__tcSimPrimary||prim[0]?.concept_id;window.__tcSimPrimary=selected;
 const selectedSec=window.__tcSimSecondaries||new Set();window.__tcSimSecondaries=selectedSec;
 const today=new Date(),iso=today.toISOString().slice(0,10),hh=String(today.getHours()).padStart(2,'0')+':'+String(today.getMinutes()).padStart(2,'0');
 el.innerHTML=`<div class="tc-step-title">Resumen y simulador</div><div class="tc-step-sub">Revisá la configuración y probá un caso real antes de publicar.</div>
 <div class="tc-summary-grid">
  <div>
   <article class="tc-panel"><h4>Estado de la versión</h4><div class="tc-validation" style="margin-top:10px">${validationRows().map(x=>`<div class="${x.ok?'ok':'warn'}">${x.ok?'✓':'⚠'} ${x.text}</div>`).join('')}</div></article>
   <article class="tc-panel" style="margin-top:12px"><h4>Configuración</h4><div class="tc-total">
    <div class="tc-total-row"><span>Conceptos activos</span><b>${enabledItems().length}</b></div>
    <div class="tc-total-row"><span>Principales</span><b>${primaryItems().length}</b></div>
    <div class="tc-total-row"><span>Secundarios</span><b>${secondaryItems().length}</b></div>
    <div class="tc-total-row"><span>Excepciones</span><b>${S.exceptions.length}</b></div>
    <div class="tc-total-row"><span>Códigos habilitados</span><b>${S.codes.filter(x=>x.enabled).length}</b></div>
   </div></article>
  </div>
  <article class="tc-panel"><div class="tc-card-head"><div><h4>Simulador de servicio</h4><div class="tc-muted">El cálculo es orientativo y usa las reglas de esta versión.</div></div><span class="tc-pill">Vista previa</span></div>
   ${prim.length?`<div class="tc-sim-fields"><div class="tc-field"><label>Servicio principal</label><select class="form-input" id="ts-primary" onchange="seleccionarPrincipalSimulador(this.value)">${prim.map(i=>`<option value="${i.concept_id}" ${selected===i.concept_id?'selected':''}>${esc(concept(i.concept_id)?.name||i.service_name)}</option>`).join('')}</select></div>
    <div class="tc-field"><label>Fecha</label><input class="form-input" id="ts-date" type="date" value="${iso}"></div>
    <div class="tc-field"><label>Hora</label><input class="form-input" id="ts-time" type="time" value="${hh}"></div>
    <div class="tc-field"><label>Distancia total (km)</label><input class="form-input" id="ts-distance" type="number" min="0" value="0"></div>
    <div class="tc-field"><label>Peajes reales</label><input class="form-input" id="ts-toll" type="number" min="0" value="0"></div>
    <label class="tc-check" style="align-self:end;padding-bottom:8px"><input type="checkbox" id="ts-holiday"><span>Es feriado</span></label></div>
    <div class="tc-form-section">Adicionales</div><div class="tc-sim-secondary">${sec.filter(i=>i.concept_id!==selected).map(i=>`<label class="tc-check"><input type="checkbox" ${selectedSec.has(i.concept_id)?'checked':''} onchange="alternarSecundarioSimulador('${i.concept_id}',this.checked)"><span>${esc(concept(i.concept_id)?.name||i.service_name)}</span></label>`).join('')||'<div class="tc-muted">No hay adicionales activos.</div>'}</div>
    <div class="tc-actions" style="margin-top:12px"><button class="btn btn-primary" onclick="calcularSimulacionTarifa()">Calcular estimado</button></div>
    <div id="tc-sim-result"></div>`:'<div class="tc-empty" style="margin-top:12px">Activá un concepto principal para simular.</div>'}
  </article>
 </div>`;
}
function simPrimary(id){window.__tcSimPrimary=id;window.__tcSimSecondaries=new Set();renderStep()}
function simSecondary(id,on){const s=window.__tcSimSecondaries||new Set();on?s.add(id):s.delete(id);window.__tcSimSecondaries=s}
function ruleCharge(r,components){
 if(!r?.enabled)return 0;const excluded=new Set(S.exceptions.filter(x=>x.rule_id===r.rule_id).map(x=>x.concept_id));
 const eligible=components.filter(x=>!excluded.has(x.conceptId)).reduce((a,x)=>a+x.value,0);
 if(!eligible)return 0;return r.calculation_mode==='fixed'?num(r.amount):eligible*num(r.amount)/100;
}
function simulate(){
 const primaryId=document.getElementById('ts-primary')?.value;if(!primaryId)return;
 const p=itemFor(primaryId),date=document.getElementById('ts-date').value,time=document.getElementById('ts-time').value;
 const distance=num(document.getElementById('ts-distance').value),tollInput=num(document.getElementById('ts-toll').value),holiday=checked('ts-holiday');
 const components=[{conceptId:p.concept_id,name:concept(p.concept_id)?.name||p.service_name,value:num(p.primary_price)}];
 for(const id of(window.__tcSimSecondaries||new Set())){
  const i=itemFor(id);if(!i)continue;const link=S.links.find(x=>x.primary_concept_id===primaryId&&x.secondary_concept_id===id);
  components.push({conceptId:id,name:concept(id)?.name||i.service_name,value:link?.price_override!=null?num(link.price_override):num(i.secondary_price)});
 }
 const charges=[];const night=rule('night');
 if(night?.enabled&&timeInside(time,night.start_time,night.end_time))charges.push({name:'Recargo nocturno',value:ruleCharge(night,components)});
 const weekend=rule('weekend_holiday'),day=new Date(date+'T12:00:00').getDay();
 if(weekend?.enabled){
  const applies=day===6?timeInside(time,weekend.saturday_start,weekend.saturday_end):(day===0||holiday)?timeInside(time,weekend.sunday_holiday_start,weekend.sunday_holiday_end):false;
  if(applies)charges.push({name:holiday?'Recargo feriado':'Recargo fin de semana',value:ruleCharge(weekend,components)});
 }
 const wide=rule('wide_coverage');
 if(wide?.enabled&&distance>=num(wide.distance_threshold_km))charges.push({name:'Recargo cobertura amplia',value:ruleCharge(wide,components)});
 let toll=0;
 if(S.billing?.toll_enabled&&S.billing?.toll_invoice_enabled){
  if(S.billing.toll_mode==='fixed')toll=num(S.billing.toll_fixed_amount);
  if(S.billing.toll_mode==='at_cost')toll=tollInput;
 }
 const subtotal=components.reduce((a,x)=>a+x.value,0),surcharges=charges.reduce((a,x)=>a+x.value,0),total=subtotal+surcharges+toll;
 const copay=S.billing?.copay_enabled?Math.min(total,S.billing.copay_mode==='percentage'?total*num(S.billing.copay_value)/100:num(S.billing.copay_value)):0;
 const companyTotal=total-copay,out=document.getElementById('tc-sim-result');
 out.innerHTML=`<div class="tc-total">${components.map(x=>`<div class="tc-total-row"><span>${esc(x.name)}</span><b>${money(x.value)}</b></div>`).join('')}
  ${charges.filter(x=>x.value).map(x=>`<div class="tc-total-row"><span>${esc(x.name)}</span><b>${money(x.value)}</b></div>`).join('')}
  ${toll?`<div class="tc-total-row"><span>Peajes</span><b>${money(toll)}</b></div>`:''}
  ${copay?`<div class="tc-total-row"><span>Copago del cliente</span><b>− ${money(copay)}</b></div>`:''}
  <div class="tc-total-row final"><span>Total empresa</span><b>${money(companyTotal)}</b></div>
  ${copay?`<div class="tc-total-row"><span>Total general del servicio</span><b>${money(total)}</b></div>`:''}</div>`;
}

async function publishCard(id){
 if(!canWrite()||!confirm('¿Publicar este tarifario? Quedará histórico y no podrá editarse.'))return;
 const r=await _db.from('company_rate_cards').update({status:'active'}).eq('rate_card_id',id).select().single();
 if(r.error)return notify(r.error.message,'error');S.card=r.data;notify('Tarifario publicado','success');await load(S.company);closeWizard();
}
async function duplicateCard(sourceId){
 if(!canWrite()||S.busy)return;S.busy=true;let created=null;
 try{
  const src=S.cards.find(x=>x.rate_card_id===sourceId)||S.card;if(!src)throw new Error('Tarifario inexistente.');
  const [items,rules,exceptions,links,billing,codes]=await Promise.all([
   _db.from('company_rate_items').select('*').eq('rate_card_id',sourceId),
   _db.from('company_rate_rules').select('*').eq('rate_card_id',sourceId),
   _db.from('company_rate_rule_exceptions').select('*').eq('rate_card_id',sourceId),
   _db.from('company_rate_service_links').select('*').eq('rate_card_id',sourceId),
   _db.from('company_rate_billing_settings').select('*').eq('rate_card_id',sourceId).maybeSingle(),
   _db.from('company_rate_codes').select('*').eq('rate_card_id',sourceId)
  ]);
  if([items,rules,exceptions,links,billing,codes].some(x=>x.error))throw new Error('No se pudo leer la versión de origen.');
  const cr=await _db.from('company_rate_cards').insert({contract_id:src.contract_id,name:src.name,status:'draft',currency:src.currency,valid_from:new Date().toISOString().slice(0,10),notes:`Basado en versión ${src.version}`}).select().single();
  if(cr.error)throw cr.error;created=cr.data;
  const strip=(row,keys)=>Object.fromEntries(Object.entries(row).filter(([k])=>!keys.includes(k)));
  if(items.data?.length){
   const rows=items.data.map(x=>({...strip(x,['rate_item_id','rate_card_id','created_at','updated_at','created_by','updated_by']),rate_card_id:created.rate_card_id}));
   const z=await _db.from('company_rate_items').insert(rows);if(z.error)throw z.error;
  }
  await _db.from('company_rate_rules').delete().eq('rate_card_id',created.rate_card_id);
  const ruleRows=(rules.data||[]).map(x=>({...strip(x,['rule_id','rate_card_id','created_at','updated_at','created_by','updated_by']),rate_card_id:created.rate_card_id}));
  let newRules=[];
  if(ruleRows.length){const z=await _db.from('company_rate_rules').insert(ruleRows).select();if(z.error)throw z.error;newRules=z.data||[]}
  if(links.data?.length){
   const rows=links.data.map(x=>({...strip(x,['link_id','rate_card_id','created_at','updated_at','created_by','updated_by']),rate_card_id:created.rate_card_id}));
   const z=await _db.from('company_rate_service_links').insert(rows);if(z.error)throw z.error;
  }
  if(exceptions.data?.length){
   const oldType=new Map((rules.data||[]).map(x=>[x.rule_id,x.rule_type])),newId=new Map(newRules.map(x=>[x.rule_type,x.rule_id]));
   const rows=exceptions.data.map(x=>({rate_card_id:created.rate_card_id,rule_id:newId.get(oldType.get(x.rule_id)),concept_id:x.concept_id})).filter(x=>x.rule_id);
   if(rows.length){const z=await _db.from('company_rate_rule_exceptions').insert(rows);if(z.error)throw z.error}
  }
  if(billing.data){
   const payload=strip(billing.data,['rate_card_id','created_at','updated_at','created_by','updated_by']);
   const z=await _db.from('company_rate_billing_settings').update(payload).eq('rate_card_id',created.rate_card_id);if(z.error)throw z.error;
  }
  if(codes.data?.length){
   const rows=codes.data.map(x=>({rate_card_id:created.rate_card_id,code_key:x.code_key,enabled:x.enabled}));
   const z=await _db.from('company_rate_codes').upsert(rows,{onConflict:'rate_card_id,code_key'});if(z.error)throw z.error;
  }
  await load(S.company);notify('Nueva versión creada','success');openWizard(created.rate_card_id);
 }catch(err){
  if(created)await _db.from('company_rate_cards').delete().eq('rate_card_id',created.rate_card_id);
  notify(err.message||'No se pudo duplicar','error');
 }finally{S.busy=false}
}

function hook(){
 if(window.__tariffHook||typeof window.seleccionarEmpresa!=='function')return false;
 const base=window.seleccionarEmpresa;
 window.seleccionarEmpresa=async(id,...args)=>{const r=await base(id,...args);await load(id);return r};
 window.__tariffHook=true;return true;
}
function observe(){
 const h=document.getElementById('emp-detail');if(!h||S.observer)return;
 S.observer=new MutationObserver(()=>{if(S.company&&!document.getElementById('tc-embedded'))queueMicrotask(renderEmbedded)});
 S.observer.observe(h,{childList:true,subtree:true});
}
function init(){
 inject();let i=0;const timer=setInterval(()=>{hook();observe();if((window.__tariffHook&&document.getElementById('emp-detail'))||++i>50)clearInterval(timer)},250);
}


Object.assign(T,{renderSummary});
Object.assign(window,{seleccionarPrincipalSimulador:simPrimary,alternarSecundarioSimulador:simSecondary,
 calcularSimulacionTarifa:simulate,publicarMotorTarifario:publishCard,duplicarMotorTarifario:duplicateCard});
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();

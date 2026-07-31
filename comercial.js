/* AuxiliOS · Motor tarifario visual */
(()=>{'use strict';
const T=window.TariffEngine=window.TariffEngine||{};
const S=T.S={
 company:null,contracts:[],cards:[],branches:[],catalog:[],
 card:null,items:[],rules:[],exceptions:[],links:[],billing:null,codes:[],
 step:'services',search:'',filter:'all',observer:null,form:null,busy:false
};
const role=()=>typeof PERFIL_USUARIO==='undefined'?'':(PERFIL_USUARIO?.roles?.name||PERFIL_USUARIO?.role||'');
const canRead=()=>['administracion','supervision'].includes(role());
const canWrite=()=>role()==='administracion';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number(String(v??'').replace(',','.'))||0;
const money=(v,c='ARS')=>new Intl.NumberFormat('es-AR',{style:'currency',currency:c,maximumFractionDigits:2}).format(num(v));
const dateFmt=v=>v?new Date(v+'T12:00:00').toLocaleDateString('es-AR'):'Sin vencimiento';
const notify=(m,t='info')=>typeof toast==='function'?toast(m,t):console.log(m);
const open=id=>typeof openModal==='function'?openModal(id):document.getElementById(id)?.classList.add('open');
const close=id=>typeof closeModal==='function'?closeModal(id):document.getElementById(id)?.classList.remove('open');
const statusLabel=v=>({draft:'Borrador',active:'Vigente',suspended:'Suspendido',expired:'Vencido',closed:'Cerrado',archived:'Archivado'}[v]||v);
const unitLabel=v=>({service:'Por servicio',hour:'Por hora',km:'Por km',unit:'Por unidad',day:'Por día',fixed:'Monto fijo'}[v]||v);
const ruleMeta={
 night:{title:'Horario nocturno',sub:'Recargo automático dentro de un rango horario.',icon:'☾',tone:'blue'},
 weekend_holiday:{title:'Fines de semana y feriados',sub:'Reglas especiales para sábados, domingos y feriados.',icon:'▣',tone:'green'},
 wide_coverage:{title:'Cobertura amplia',sub:'Recargo cuando el servicio supera una distancia.',icon:'⌖',tone:'amber'}
};
const codeLabels={traveler:'Código Viajero',work:'Código Trabajo',toll:'Código Peaje',wait:'Código Espera',osa:'Código OSA',extraction:'Código Extracción',storage:'Código Guarda',excess:'Código Excedente',special:'Código Especial'};
const currentCompany=()=>window.__auxCompanySelected||S.company;
const cardCurrency=()=>S.card?.currency||'ARS';
const itemFor=(conceptId,branchId=null)=>S.items.find(x=>x.concept_id===conceptId&&(x.branch_id||null)===(branchId||null));
const concept=id=>S.catalog.find(x=>x.concept_id===id);
const rule=type=>S.rules.find(x=>x.rule_type===type);
const enabledItems=()=>S.items.filter(x=>x.is_active&&x.branch_id==null);
const primaryItems=()=>enabledItems().filter(x=>x.can_be_primary);
const secondaryItems=()=>enabledItems().filter(x=>x.can_be_secondary);
const mixedItems=()=>enabledItems().filter(x=>x.can_be_primary&&x.can_be_secondary);
const isDraft=()=>S.card?.status==='draft';
const editable=()=>canWrite()&&isDraft();

function inject(){
 if(document.getElementById('tariff-engine-css'))return;
 const css=document.createElement('link');css.id='tariff-engine-css';css.rel='stylesheet';css.href='/comercial.css';document.head.appendChild(css);
 document.body.insertAdjacentHTML('beforeend',`
 <div class="modal-backdrop tc-modal" id="tariff-wizard"><div class="tc-shell">
  <div id="tc-wizard-content"></div>
 </div></div>
 <div class="modal-backdrop" id="tariff-small-modal"><div class="modal-box tc-small-modal">
  <div class="modal-head"><span class="modal-head-title" id="tc-form-title">Configuración</span><button class="modal-close" onclick="closeModal('tariff-small-modal')">×</button></div>
  <div class="modal-body" id="tc-form-body"></div>
  <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal('tariff-small-modal')">Cancelar</button><button class="btn btn-primary" onclick="guardarFormularioTarifa()">Guardar</button></div>
 </div></div>`);
}

async function load(companyId=S.company){
 if(!canRead()||!companyId)return;
 S.company=companyId;window.__auxCompanySelected=companyId;
 const [contracts,branches,catalog]=await Promise.all([
  _db.from('company_contracts').select('*').eq('company_id',companyId).order('is_primary',{ascending:false}).order('valid_from',{ascending:false}),
  _db.from('company_branches').select('branch_id,name,branch_code,is_primary').eq('company_id',companyId).eq('is_active',true).order('is_primary',{ascending:false}).order('name'),
  _db.from('service_concepts').select('*').eq('is_active',true).order('sort_order').order('name')
 ]);
 if(contracts.error||catalog.error)return notify('No se pudo cargar la configuración comercial','error');
 S.contracts=contracts.data||[];S.branches=branches.data||[];S.catalog=catalog.data||[];
 const ids=S.contracts.map(x=>x.contract_id);
 if(ids.length){
  const cards=await _db.from('company_rate_cards').select('*').in('contract_id',ids).order('version',{ascending:false});
  S.cards=cards.data||[];
 }else S.cards=[];
 renderEmbedded();
}

function renderEmbedded(){
 const host=document.querySelector('#emp-detail .emp-detail');if(!host||!S.company)return;
 document.getElementById('tc-embedded')?.remove();
 const active=S.cards.filter(x=>x.status==='active').length,drafts=S.cards.filter(x=>x.status==='draft').length;
 host.insertAdjacentHTML('beforeend',`<section class="tc-embedded" id="tc-embedded">
  <div class="tc-head"><div><div class="tc-eyebrow">Motor tarifario</div><div class="tc-title">Contratos, servicios y reglas de facturación</div><div class="tc-muted">Configuración versionada para aplicar automáticamente en el flujo del operador.</div></div>
   ${canWrite()?'<button class="btn btn-primary" onclick="abrirContratoTarifa()">＋ Nuevo contrato</button>':''}
  </div>
  <div class="tc-kpis">
   <div class="tc-kpi"><small>Contratos</small><b>${S.contracts.length}</b></div>
   <div class="tc-kpi"><small>Tarifarios</small><b>${S.cards.length}</b></div>
   <div class="tc-kpi"><small>Vigentes</small><b>${active}</b></div>
   <div class="tc-kpi"><small>Borradores</small><b>${drafts}</b></div>
  </div>
  ${!canWrite()?'<div class="tc-readonly" style="margin-top:10px">Supervisión puede consultar, simular y revisar. Las modificaciones corresponden a Administración.</div>':''}
  <div class="tc-contracts">${S.contracts.length?S.contracts.map(contractHTML).join(''):'<div class="tc-empty">Todavía no hay contratos. Creá el primero para comenzar.</div>'}</div>
 </section>`);
}

function contractHTML(x){
 const cards=S.cards.filter(c=>c.contract_id===x.contract_id);
 return `<article class="tc-contract ${x.is_primary?'primary':''}">
  <div class="tc-card-head"><div><div class="tc-contract-name">${esc(x.name)}</div><div class="tc-muted">${esc(x.contract_number||'Sin número')} · ${dateFmt(x.valid_from)} a ${dateFmt(x.valid_until)} · ${esc(x.currency)}</div></div>
   <span class="tc-pill ${x.status}">${statusLabel(x.status)}</span>
  </div>
  <div class="tc-actions" style="margin-top:8px;flex-wrap:wrap">
   ${canWrite()?`<button class="btn btn-ghost" onclick="abrirContratoTarifa('${x.contract_id}')">Editar contrato</button><button class="btn btn-ghost" onclick="abrirTarifarioTarifa('${x.contract_id}')">＋ Nueva versión</button>`:''}
  </div>
  <div class="tc-rate-list">${cards.length?cards.map(rateHTML).join(''):'<div class="tc-empty">Sin tarifarios.</div>'}</div>
 </article>`;
}
function rateHTML(x){
 return `<div class="tc-rate"><div><b>${esc(x.name)} · versión ${x.version}</b><small>${dateFmt(x.valid_from)} a ${dateFmt(x.valid_until)} · ${statusLabel(x.status)}</small></div>
  <div class="tc-actions">
   <button class="btn btn-ghost" onclick="abrirMotorTarifario('${x.rate_card_id}')">${x.status==='draft'&&canWrite()?'Configurar':'Ver'}</button>
   ${x.status!=='draft'&&canWrite()?`<button class="btn btn-ghost" onclick="duplicarMotorTarifario('${x.rate_card_id}')">Duplicar</button>`:''}
  </div>
 </div>`;
}

function setForm(title,type,data,html){
 S.form={type,...data};document.getElementById('tc-form-title').textContent=title;
 document.getElementById('tc-form-body').innerHTML=html;open('tariff-small-modal');
}
function input(id){return document.getElementById(id)?.value??''}
function checked(id){return!!document.getElementById(id)?.checked}
function formError(msg){let e=document.getElementById('tc-form-error');if(e){e.textContent='⚠ '+msg;e.style.display='block'}}

function openContract(id=null){
 if(!canWrite())return;const x=S.contracts.find(i=>i.contract_id===id);
 setForm(x?'Editar contrato':'Nuevo contrato','contract',{id},`
  <div class="form-grid-2"><div class="form-group"><label class="form-label">Nombre del acuerdo *</label><input class="form-input" id="tf-name" value="${esc(x?.name||'Convenio principal')}"></div>
  <div class="form-group"><label class="form-label">Número de contrato</label><input class="form-input" id="tf-number" value="${esc(x?.contract_number||'')}"></div></div>
  <div class="form-grid-2"><div class="form-group"><label class="form-label">Estado</label><select class="form-input" id="tf-status">${['draft','active','suspended','expired','closed'].map(v=>`<option value="${v}" ${x?.status===v?'selected':''}>${statusLabel(v)}</option>`).join('')}</select></div>
  <div class="form-group"><label class="form-label">Moneda</label><select class="form-input" id="tf-currency"><option ${x?.currency!=='USD'?'selected':''}>ARS</option><option ${x?.currency==='USD'?'selected':''}>USD</option></select></div></div>
  <div class="form-grid-2"><div class="form-group"><label class="form-label">Vigencia desde *</label><input class="form-input" type="date" id="tf-from" value="${x?.valid_from||new Date().toISOString().slice(0,10)}"></div>
  <div class="form-group"><label class="form-label">Vigencia hasta</label><input class="form-input" type="date" id="tf-until" value="${x?.valid_until||''}"></div></div>
  <div class="form-grid-2"><div class="form-group"><label class="form-label">Frecuencia de facturación</label><select class="form-input" id="tf-billing">${[['per_service','Por servicio'],['weekly','Semanal'],['biweekly','Quincenal'],['monthly','Mensual']].map(([v,l])=>`<option value="${v}" ${x?.billing_frequency===v?'selected':''}>${l}</option>`).join('')}</select></div>
  <div class="form-group"><label class="form-label">Condición de pago (días)</label><input class="form-input" type="number" min="0" max="365" id="tf-days" value="${x?.payment_terms_days??30}"></div></div>
  <label class="emp-check"><input type="checkbox" id="tf-primary" ${x?.is_primary?'checked':''}> Contrato principal</label>
  <label class="emp-check"><input type="checkbox" id="tf-service" ${x?.requires_service_order!==false?'checked':''}> Requiere número de servicio</label>
  <label class="emp-check"><input type="checkbox" id="tf-po" ${x?.requires_purchase_order?'checked':''}> Requiere orden de compra</label>
  <div class="form-group"><label class="form-label">Observaciones</label><textarea class="form-input" id="tf-notes">${esc(x?.notes||'')}</textarea></div>
  <div class="modal-error" id="tc-form-error" style="display:none"></div>`);
}
function openRateCard(contractId,id=null){
 if(!canWrite())return;const x=S.cards.find(i=>i.rate_card_id===id),ct=S.contracts.find(i=>i.contract_id===contractId);
 setForm(x?'Editar tarifario':'Nueva versión de tarifario','rate_card',{id,contractId},`
  <div class="form-grid-2"><div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="tf-name" value="${esc(x?.name||'Tarifario general')}"></div>
  <div class="form-group"><label class="form-label">Moneda</label><select class="form-input" id="tf-currency"><option ${(x?.currency||ct?.currency)!=='USD'?'selected':''}>ARS</option><option ${(x?.currency||ct?.currency)==='USD'?'selected':''}>USD</option></select></div></div>
  <div class="form-grid-2"><div class="form-group"><label class="form-label">Vigencia desde *</label><input class="form-input" type="date" id="tf-from" value="${x?.valid_from||new Date().toISOString().slice(0,10)}"></div>
  <div class="form-group"><label class="form-label">Vigencia hasta</label><input class="form-input" type="date" id="tf-until" value="${x?.valid_until||''}"></div></div>
  <div class="form-group"><label class="form-label">Observaciones</label><textarea class="form-input" id="tf-notes">${esc(x?.notes||'')}</textarea></div>
  <div class="modal-error" id="tc-form-error" style="display:none"></div>`);
}

async function saveForm(){
 if(!S.form||S.busy)return;S.busy=true;
 try{
  if(S.form.type==='contract'){
   const name=input('tf-name').trim(),from=input('tf-from'),until=input('tf-until')||null,days=Number(input('tf-days')||0);
   if(!name||!from)return formError('Completá el nombre y la fecha de inicio.');
   if(until&&until<from)return formError('La fecha final no puede ser anterior.');
   if(days<0||days>365)return formError('La condición de pago no es válida.');
   const payload={company_id:S.company,name,contract_number:input('tf-number').trim()||null,status:input('tf-status'),currency:input('tf-currency'),
    valid_from:from,valid_until:until,billing_frequency:input('tf-billing'),payment_terms_days:days,is_primary:checked('tf-primary'),
    requires_service_order:checked('tf-service'),requires_purchase_order:checked('tf-po'),notes:input('tf-notes').trim()||null};
   const r=S.form.id?await _db.from('company_contracts').update(payload).eq('contract_id',S.form.id):await _db.from('company_contracts').insert(payload);
   if(r.error)return formError(r.error.message);
  }else if(S.form.type==='rate_card'){
   const name=input('tf-name').trim(),from=input('tf-from'),until=input('tf-until')||null;
   if(!name||!from)return formError('Completá el nombre y la fecha de inicio.');
   if(until&&until<from)return formError('La fecha final no puede ser anterior.');
   const payload={contract_id:S.form.contractId,name,status:'draft',currency:input('tf-currency'),valid_from:from,valid_until:until,notes:input('tf-notes').trim()||null};
   let r;
   if(S.form.id)r=await _db.from('company_rate_cards').update(payload).eq('rate_card_id',S.form.id).select().single();
   else r=await _db.from('company_rate_cards').insert(payload).select().single();
   if(r.error)return formError(r.error.message);
   close('tariff-small-modal');await load();
   if(!S.form.id&&r.data)return openWizard(r.data.rate_card_id);
   notify('Tarifario creado','success');return;
  }else if(S.form.type==='branch_item'){
   await T.saveBranchItem();return;
  }else if(S.form.type==='concept'){
   await T.saveCustomConcept();return;
  }
  close('tariff-small-modal');await load();notify('Configuración guardada','success');
 }finally{S.busy=false}
}

async function loadEngine(cardId){
 const [items,rules,exceptions,links,billing,codes]=await Promise.all([
  _db.from('company_rate_items').select('*').eq('rate_card_id',cardId).eq('is_active',true).order('service_name'),
  _db.from('company_rate_rules').select('*').eq('rate_card_id',cardId),
  _db.from('company_rate_rule_exceptions').select('*').eq('rate_card_id',cardId),
  _db.from('company_rate_service_links').select('*').eq('rate_card_id',cardId).eq('is_enabled',true),
  _db.from('company_rate_billing_settings').select('*').eq('rate_card_id',cardId).maybeSingle(),
  _db.from('company_rate_codes').select('*').eq('rate_card_id',cardId)
 ]);
 if([items,rules,exceptions,links,billing,codes].some(x=>x.error))throw new Error('No se pudo cargar el motor tarifario.');
 S.items=items.data||[];S.rules=rules.data||[];S.exceptions=exceptions.data||[];S.links=links.data||[];
 S.billing=billing.data||{rate_card_id:cardId,copay_enabled:false,copay_mode:'fixed',copay_value:0,toll_enabled:false,toll_invoice_enabled:false,toll_mode:'at_cost',toll_fixed_amount:0,require_toll_receipt:true};
 S.codes=codes.data||[];
}
async function openWizard(cardId){
 const c=S.cards.find(x=>x.rate_card_id===cardId);if(!c)return;
 S.card=c;S.step='services';
 try{await loadEngine(cardId);renderWizard();open('tariff-wizard')}
 catch(err){notify(err.message,'error')}
}
function closeWizard(){close('tariff-wizard');S.card=null;load(S.company)}

function renderWizard(){
 const root=document.getElementById('tc-wizard-content');if(!root||!S.card)return;
 const ct=S.contracts.find(x=>x.contract_id===S.card.contract_id);
 const tabs=[['services','1','Servicios'],['rules','2','Recargos'],['links','3','Tarifas diferenciadas'],['billing','4','Cobros y códigos'],['summary','5','Resumen']];
 root.innerHTML=`<div class="tc-wizard-head"><div><div class="tc-eyebrow">${esc(ct?.name||'Contrato')}</div><div class="tc-wizard-title">${esc(S.card.name)} · versión ${S.card.version}</div><div class="tc-wizard-meta">${statusLabel(S.card.status)} · ${dateFmt(S.card.valid_from)} a ${dateFmt(S.card.valid_until)} · ${esc(S.card.currency)}</div></div>
  <div class="tc-actions">${S.card.status!=='draft'&&canWrite()?`<button class="btn btn-ghost" onclick="duplicarMotorTarifario('${S.card.rate_card_id}')">Duplicar versión</button>`:''}<button class="btn btn-ghost" onclick="cerrarMotorTarifario()">Cerrar</button></div></div>
  <div class="tc-tabs">${tabs.map(([v,n,l])=>`<button class="tc-tab ${S.step===v?'active':''}" onclick="irPasoTarifa('${v}')"><span>${n}</span>${l}</button>`).join('')}</div>
  <div class="tc-body">${!editable()?'<div class="tc-readonly" style="margin-bottom:12px">Esta versión es histórica o tu perfil es de consulta. Podés revisar y simular, pero no modificar.</div>':''}<div id="tc-step"></div></div>
  <div class="tc-footer"><div class="tc-muted">Los cambios se guardan automáticamente.</div><div class="tc-actions">${S.step!=='services'?'<button class="btn btn-ghost" onclick="pasoTarifaAnterior()">← Anterior</button>':''}${S.step!=='summary'?'<button class="btn btn-primary" onclick="pasoTarifaSiguiente()">Siguiente →</button>':editable()?`<button class="btn btn-primary" onclick="publicarMotorTarifario('${S.card.rate_card_id}')">Publicar tarifario</button>`:''}</div></div>`;
 renderStep();
}
function goStep(step){S.step=step;renderWizard()}
function stepNext(){const a=['services','rules','links','billing','summary'],i=a.indexOf(S.step);if(i<a.length-1)goStep(a[i+1])}
function stepPrev(){const a=['services','rules','links','billing','summary'],i=a.indexOf(S.step);if(i>0)goStep(a[i-1])}
function renderStep(){
 const el=document.getElementById('tc-step');if(!el)return;
 if(S.step==='services')T.renderServices(el);
 if(S.step==='rules')T.renderRules(el);
 if(S.step==='links')T.renderLinks(el);
 if(S.step==='billing')T.renderBilling(el);
 if(S.step==='summary')T.renderSummary(el);
}

Object.assign(T,{role,canRead,canWrite,esc,num,money,dateFmt,notify,open,close,statusLabel,unitLabel,ruleMeta,codeLabels,
 currentCompany,cardCurrency,itemFor,concept,rule,enabledItems,primaryItems,secondaryItems,mixedItems,isDraft,editable,
 inject,load,renderEmbedded,setForm,input,checked,formError,loadEngine,openWizard,closeWizard,renderWizard,goStep,stepNext,stepPrev,renderStep});
Object.assign(window,{cargarComercialEmpresa:load,abrirContratoTarifa:openContract,abrirTarifarioTarifa:openRateCard,
 guardarFormularioTarifa:saveForm,abrirMotorTarifario:openWizard,cerrarMotorTarifario:closeWizard,
 irPasoTarifa:goStep,pasoTarifaSiguiente:stepNext,pasoTarifaAnterior:stepPrev});
})();

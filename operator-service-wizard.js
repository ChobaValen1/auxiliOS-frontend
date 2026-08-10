/* AuxiliOS · Nuevo Servicio · controlador canónico · Tarifario V3 */
(()=>{'use strict';
const O=window.OperatorServices,S=O.S;
const {num,canManage,loadServices}=O;
const notify=(m,t='info')=>typeof toast==='function'?toast(m,t):console.log(m);
const open=id=>typeof openModal==='function'?openModal(id):document.getElementById(id)?.classList.add('open');
const close=id=>typeof closeModal==='function'?closeModal(id):document.getElementById(id)?.classList.remove('open');
const DRAFT_KEY='auxilios.operator-service-draft.v2';
const quoteFields=new Set(['company_id','branch_id','billing_base_id','scheduled_for','category_id','estimated_asphalt_km','estimated_gravel_km','toll_estimate','is_holiday']);

function nowInBuenosAires(){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
 const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return`${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
const baseData=()=>({
 company_id:'',branch_id:'',billing_base_id:'',service_order_number:'',purchase_order_number:'',
 scheduled_for:nowInBuenosAires(),priority:'normal',category_id:'',primary_concept_id:'',secondary_items:{},item_codes:{},
 estimated_distance_km:0,estimated_asphalt_km:0,estimated_gravel_km:0,toll_estimate:0,is_holiday:false,
 customer_name:'',customer_phone:'',customer_email:'',vehicle_plate:'',vehicle_make_model:'',vehicle_make:'',vehicle_model:'',
 origin:'',destination:'',origin_lat:'',origin_lng:'',destination_lat:'',destination_lng:'',origin_place_id:'',destination_place_id:'',
 origin_formatted_address:'',destination_formatted_address:'',operator_notes:'',driver_instructions:'',assigned_driver_id:'',assigned_truck_id:'',
 estimated_arrival_at:'',estimated_finish_at:'',granted_delay_minutes:0,logistics_type:'own',route_distance_meters:'',route_duration_seconds:'',
 route_toll_estimate:'',route_toll_currency:'',route_provider:'',route_calculated_at:'',route_legs:[]
});
function fresh(){return{data:baseData(),contract:null,card:null,categories:[],catalogConcepts:[],items:[],links:[],quote:null,error:null,busy:false,loadingCatalog:false,dirty:false,draftSavedAt:null,catalogKey:'',codeWarning:null,itemCodeWarnings:{}};}
function storage(){try{return window.localStorage||null}catch{return null}}
function clearDraft(){try{storage()?.removeItem(DRAFT_KEY)}catch{}}
function render(){
 if(!S.wizard)return;
 const renderer=window.OperatorServiceWorkspaceV2?.render;
 if(typeof renderer==='function')return renderer();
 const root=document.getElementById('os-wizard-shell');if(root)root.innerHTML='<div class="osv2-bootstrap-state">Cargando formulario de Nuevo Servicio…</div>';
}
function markDirty(){if(S.wizard)S.wizard.dirty=true;}
function invalidateQuote(){if(S.wizard)S.wizard.quote=null;}
function setVal(k,v){
 const w=S.wizard;if(!w)return;
 if(['estimated_distance_km','toll_estimate','estimated_asphalt_km','estimated_gravel_km','granted_delay_minutes'].includes(k))v=Math.max(0,num(v));
 w.data[k]=v;if(quoteFields.has(k))invalidateQuote();
 if(k==='service_order_number')w.codeWarning=null;
 markDirty();
}
function catalogDate(w=S.wizard){return String(w?.data?.scheduled_for||nowInBuenosAires()).slice(0,10)}
function catalogKey(w=S.wizard){return w?`${w.data.company_id}|${w.data.branch_id||''}|${w.data.category_id||''}|${catalogDate(w)}`:''}
function rebuildItems(){
 const w=S.wizard;if(!w)return;
 const categories=(w.categories||[]).map(c=>({
  concept_id:c.category_id,service_name:c.name,name:c.name,service_code:c.code,is_active:true,can_be_primary:true,can_be_secondary:false,
  pricing_unit:'service',code_mode:'fixed',is_category:true
 }));
 const concepts=(w.catalogConcepts||[]).filter(c=>!c.auto_apply).map(c=>({
  ...c,is_active:true,can_be_primary:false,can_be_secondary:true,
  code_mode:c.requires_own_code?'manual':'shared',service_code:c.requires_own_code?'': 'Usa código principal',
  unit_price:c.unit_price==null?null:num(c.unit_price),secondary_price:c.unit_price==null?null:num(c.unit_price)
 }));
 w.items=[...categories,...concepts];w.links=[];
}
function resolvedItems(){return S.wizard?.items||[]}
function primaryItems(){return resolvedItems().filter(x=>x.is_active&&x.can_be_primary)}
function secondaryItems(){return resolvedItems().filter(x=>x.is_active&&x.can_be_secondary)}
function sanitizeConcepts(){
 const w=S.wizard;if(!w)return;
 const cats=new Set((w.categories||[]).map(x=>String(x.category_id)));
 if(w.data.category_id&&!cats.has(String(w.data.category_id))){w.data.category_id='';w.data.primary_concept_id='';w.data.secondary_items={};w.data.item_codes={};}
 const allowed=new Set((w.catalogConcepts||[]).filter(x=>!x.auto_apply).map(x=>String(x.concept_id)));
 for(const id of Object.keys(w.data.secondary_items||{}))if(!allowed.has(String(id))){delete w.data.secondary_items[id];delete w.data.item_codes?.[id];}
 invalidateQuote();rebuildItems();
}

async function openWizard(){
 if(!canManage())return;
 clearDraft();S.wizard=fresh();
 const shell=document.getElementById('os-wizard-shell');if(shell){shell.innerHTML='';shell.className='os-wizard-shell';}
 window.OperatorServiceWorkspaceReviewV3?.prepareOpen?.();render();open('modal-operador-wizard');
}
function closeWizard(force=false){
 const w=S.wizard;if(!w)return;
 if(!force&&w.dirty&&typeof confirm==='function'&&!confirm('Hay cambios sin guardar. ¿Cerrar el alta?'))return;
 close('modal-operador-wizard');const shell=document.getElementById('os-wizard-shell');if(shell)shell.innerHTML='';S.wizard=null;
}
function saveDraft(){
 const w=S.wizard;if(!w)return;
 try{const savedAt=new Date().toISOString();storage()?.setItem(DRAFT_KEY,JSON.stringify({data:w.data,savedAt}));w.dirty=false;w.draftSavedAt=savedAt;notify('Borrador guardado en este dispositivo','success');render();}
 catch{notify('No se pudo guardar el borrador','error');}
}

async function loadCatalog({preserve=true,silent=false}={}){
 const w=S.wizard;if(!w?.data.company_id)return false;
 const d=w.data,category=d.category_id||null;
 if(!silent){w.loadingCatalog=true;render();}
 const {data,error}=await _db.rpc('get_operator_category_tariff_v3',{
  p_company_id:d.company_id,p_base_id:d.branch_id||null,p_category_id:category,p_as_of:catalogDate(w)
 });
 w.loadingCatalog=false;
 if(error){w.error=error.message;w.catalogConcepts=[];rebuildItems();render();return false;}
 w.contract={contract_id:data.contract_id};w.card={rate_card_id:data.rate_card_id,currency:data.currency};
 w.categories=Array.isArray(data.categories)?data.categories:[];w.catalogConcepts=Array.isArray(data.concepts)?data.concepts:[];w.catalogKey=catalogKey(w);w.error=null;
 if(!preserve){w.data.secondary_items={};w.data.item_codes={};}
 sanitizeConcepts();render();return true;
}
async function selectCompany(id,preserve=false){
 const w=S.wizard;if(!w)return;
 const prev=preserve?{branch_id:w.data.branch_id,category_id:w.data.category_id,secondary_items:{...w.data.secondary_items},item_codes:{...w.data.item_codes}}:null;
 w.data.company_id=id;w.contract=w.card=null;w.categories=[];w.catalogConcepts=[];w.items=[];w.links=[];w.quote=null;w.error=null;w.catalogKey='';w.codeWarning=null;w.itemCodeWarnings={};
 if(!preserve){w.data.branch_id='';w.data.billing_base_id='';w.data.category_id='';w.data.primary_concept_id='';w.data.secondary_items={};w.data.item_codes={};markDirty();}
 if(!id)return render();
 if(prev){w.data.branch_id=prev.branch_id;w.data.billing_base_id=prev.branch_id;w.data.category_id=prev.category_id;w.data.primary_concept_id=prev.category_id;w.data.secondary_items=prev.secondary_items;w.data.item_codes=prev.item_codes;}
 await loadCatalog({preserve:true});
}
async function changeBranch(v){
 const w=S.wizard;if(!w)return;setVal('branch_id',v);w.data.billing_base_id=v||'';w.catalogKey='';
 if(w.data.category_id)await loadCatalog({preserve:true});else render();
}
async function selectPrimary(id){
 const w=S.wizard;if(!w)return;w.data.category_id=id;w.data.primary_concept_id=id;w.data.secondary_items={};w.data.item_codes={};w.quote=null;w.catalogConcepts=[];w.catalogKey='';markDirty();
 if(id)await loadCatalog({preserve:false});else{rebuildItems();render();}
}
function addSecondary(id){if(!id||!S.wizard)return;S.wizard.data.secondary_items[id]=1;S.wizard.quote=null;markDirty();render();}
function removeSecondary(id){if(!S.wizard)return;delete S.wizard.data.secondary_items[id];delete S.wizard.data.item_codes?.[id];delete S.wizard.itemCodeWarnings?.[id];S.wizard.quote=null;markDirty();render();}
function secondaryQty(id,v){if(!S.wizard)return;S.wizard.data.secondary_items[id]=Math.max(num(v),.01);S.wizard.quote=null;markDirty();render();}
function secondaryPayload(){return Object.entries(S.wizard?.data?.secondary_items||{}).map(([concept_id,quantity])=>({concept_id,quantity:num(quantity)}))}
async function ensureFreshCatalog(){const w=S.wizard;if(!w?.data.company_id||!w.data.category_id)return false;if(w.catalogKey===catalogKey(w))return true;return loadCatalog({preserve:true,silent:true});}

async function calculate(){
 const w=S.wizard;if(!w?.card||!w.data.category_id)return;
 const scheduled=new Date(w.data.scheduled_for);if(Number.isNaN(scheduled.getTime())){w.error='Ingresá una fecha y hora válidas.';return render();}
 if(!await ensureFreshCatalog())return;
 w.busy=true;w.error=null;render();const d=w.data;
 const {data,error}=await _db.rpc('calculate_operator_service_quote_v3',{
  p_company_id:d.company_id,p_base_id:d.branch_id||null,p_scheduled_for:scheduled.toISOString(),p_category_id:d.category_id,
  p_items:secondaryPayload(),p_asphalt_km:num(d.estimated_asphalt_km),p_gravel_km:num(d.estimated_gravel_km),
  p_toll_amount:num(d.toll_estimate),p_is_holiday:!!d.is_holiday
 });
 w.busy=false;if(error){w.error=error.message;w.quote=null}else{w.quote=data;w.error=null}render();
}
function validationErrors(){
 const w=S.wizard,d=w?.data,errors=[];if(!w)return['No hay un servicio en edición.'];
 if(!d.company_id||!w.card)errors.push('Seleccioná una empresa con tarifario publicado y vigente.');
 if(!d.category_id)errors.push('Elegí la categoría del servicio.');
 if(!String(d.service_order_number||'').trim())errors.push('Completá el código de prestadora.');
 if(!String(d.customer_phone||'').trim())errors.push('Completá el teléfono del cliente.');
 if(!String(d.origin||'').trim()||!String(d.destination||'').trim())errors.push('Completá origen y destino.');
 for(const [id] of Object.entries(d.secondary_items||{})){
  const item=(w.catalogConcepts||[]).find(x=>String(x.concept_id)===String(id));
  if(item?.requires_own_code&&!String(d.item_codes?.[id]||'').trim())errors.push(`${item.name||item.service_name} requiere código propio de prestadora.`);
 }
 if((d.assigned_driver_id&&!d.assigned_truck_id)||(!d.assigned_driver_id&&d.assigned_truck_id))errors.push('Chofer y móvil deben asignarse juntos.');
 return errors;
}
async function create(){
 const w=S.wizard;if(!w||w.busy)return;
 const errors=validationErrors();if(errors.length){w.error=errors.join(' ');return render();}
 if(!w.quote){await calculate();if(!w.quote)return;}
 w.busy=true;w.error=null;render();const d=w.data,payload={...d,
  scheduled_for:new Date(d.scheduled_for).toISOString(),estimated_arrival_at:d.estimated_arrival_at?new Date(d.estimated_arrival_at).toISOString():'',
  estimated_finish_at:d.estimated_finish_at?new Date(d.estimated_finish_at).toISOString():'',items:secondaryPayload(),item_codes:d.item_codes||{},
  estimated_asphalt_km:num(d.estimated_asphalt_km),estimated_gravel_km:num(d.estimated_gravel_km),estimated_distance_km:num(d.estimated_asphalt_km)+num(d.estimated_gravel_km),
  toll_estimate:num(d.toll_estimate),is_holiday:!!d.is_holiday
 };
 const {data,error}=await _db.rpc('create_operator_service_v3',{p_payload:payload});
 w.busy=false;if(error){w.error=error.message;return render();}
 clearDraft();w.dirty=false;notify(`Servicio ${data.service_number} creado`,'success');closeWizard(true);await loadServices();if(data.service_id)window.abrirDetalleServicio(data.service_id);
}

async function checkCode(value,conceptId=null){
 const w=S.wizard;if(!w?.data.company_id)return null;
 const current=conceptId?w.data.item_codes?.[conceptId]:w.data.service_order_number;
 const code=String((value??current)||'').trim();
 if(!code){if(conceptId)delete w.itemCodeWarnings[conceptId];else w.codeWarning=null;render();return null;}
 const {data,error}=await _db.rpc('check_recent_provider_code_v3',{p_company_id:w.data.company_id,p_code:code,p_exclude_service_id:null});
 if(error)return null;
 if(conceptId)w.itemCodeWarnings[conceptId]=data?.duplicate?data:null;else w.codeWarning=data?.duplicate?data:null;
 render();return data;
}
async function checkPrimaryCode(){return checkCode(null,null)}
async function checkItemCode(conceptId,value){return checkCode(value,conceptId)}

Object.assign(O,{openWizard,closeWizard,renderWizard:render,calculateQuote:calculate,loadTariffMatrixV3:loadCatalog});
Object.assign(window,{
 abrirNuevoServicio:openWizard,cerrarNuevoServicio:closeWizard,guardarBorradorServicio:saveDraft,osSetServicio:setVal,
 seleccionarEmpresaServicio:selectCompany,cambiarSucursalServicio:changeBranch,seleccionarPrincipalServicio:selectPrimary,seleccionarCategoriaServicio:selectPrimary,
 agregarSecundarioServicio:addSecondary,quitarSecundarioServicio:removeSecondary,alternarSecundarioServicio:(id,on)=>on?addSecondary(id):removeSecondary(id),
 cantidadSecundarioServicio:secondaryQty,calcularNuevoServicio:calculate,crearNuevoServicio:create,
 validarCodigoPrestadoraServicio:checkPrimaryCode,validarCodigoConceptoServicio:checkItemCode,
 pasoSiguienteNuevoServicio:()=>{},pasoAnteriorNuevoServicio:()=>{},irPasoNuevoServicio:()=>{}
});
})();

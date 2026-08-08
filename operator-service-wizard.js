/* AuxiliOS · Nuevo Servicio · controlador canónico sin renderer propio */
(()=>{'use strict';
const O=window.OperatorServices,S=O.S;
const {num,canManage,loadServices}=O;
const notify=(m,t='info')=>typeof toast==='function'?toast(m,t):console.log(m);
const open=id=>typeof openModal==='function'?openModal(id):document.getElementById(id)?.classList.add('open');
const close=id=>typeof closeModal==='function'?closeModal(id):document.getElementById(id)?.classList.remove('open');
const DRAFT_KEY='auxilios.operator-service-draft.v1';
const quoteFields=new Set(['company_id','branch_id','scheduled_for','primary_concept_id','estimated_distance_km','toll_estimate','is_holiday']);

function nowInBuenosAires(){
 const parts=new Intl.DateTimeFormat('en-CA',{
  timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 }).formatToParts(new Date());
 const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return`${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

const baseData=()=>({
 company_id:'',branch_id:'',billing_base_id:'',service_order_number:'',purchase_order_number:'',
 scheduled_for:nowInBuenosAires(),priority:'normal',primary_concept_id:'',secondary_items:{},
 estimated_distance_km:0,estimated_asphalt_km:0,estimated_gravel_km:0,toll_estimate:0,is_holiday:false,
 customer_name:'',customer_phone:'',customer_email:'',vehicle_plate:'',vehicle_make_model:'',
 vehicle_make:'',vehicle_model:'',origin:'',destination:'',origin_lat:'',origin_lng:'',destination_lat:'',destination_lng:'',
 origin_place_id:'',destination_place_id:'',origin_formatted_address:'',destination_formatted_address:'',
 operator_notes:'',driver_instructions:'',assigned_driver_id:'',assigned_truck_id:'',estimated_arrival_at:'',
 estimated_finish_at:'',granted_delay_minutes:0,logistics_type:'own',route_distance_meters:'',route_duration_seconds:'',
 route_toll_estimate:'',route_toll_currency:'',route_provider:'',route_calculated_at:'',route_legs:[]
});

function fresh(){return{data:baseData(),contract:null,card:null,items:[],links:[],quote:null,error:null,busy:false,loadingCatalog:false,dirty:false,draftSavedAt:null};}
function storage(){try{return window.localStorage||null}catch{return null}}
function clearDraft(){try{storage()?.removeItem(DRAFT_KEY)}catch{}}

function render(){
 if(!S.wizard)return;
 const renderer=window.OperatorServiceWorkspaceV2?.render;
 if(typeof renderer==='function')return renderer();
 const root=document.getElementById('os-wizard-shell');
 if(root)root.innerHTML='<div class="osv2-bootstrap-state">Cargando formulario de Nuevo Servicio…</div>';
}

function markDirty(){const w=S.wizard;if(w)w.dirty=true;}
function invalidateQuote(){const w=S.wizard;if(w)w.quote=null;}
function setVal(k,v){
 const w=S.wizard;if(!w)return;
 if(['estimated_distance_km','toll_estimate','estimated_asphalt_km','estimated_gravel_km','granted_delay_minutes'].includes(k))v=Math.max(0,num(v));
 w.data[k]=v;
 if(quoteFields.has(k))invalidateQuote();
 markDirty();
}
function changeBranch(v){setVal('branch_id',v);S.wizard.data.billing_base_id=v||'';sanitizeConcepts();render();}

function resolvedItems(){
 const w=S.wizard,b=w?.data?.branch_id,map=new Map();if(!w)return[];
 for(const i of w.items){
  const itemBranch=i.billing_base_id||i.branch_id||'';
  if(itemBranch&&b&&String(itemBranch)!==String(b))continue;
  const old=map.get(String(i.concept_id));
  if(!old||(!(old.billing_base_id||old.branch_id)&&itemBranch))map.set(String(i.concept_id),i);
 }
 return[...map.values()];
}
function primaryItems(){return resolvedItems().filter(x=>x.is_active&&x.can_be_primary)}
function secondaryItems(){
 const w=S.wizard;if(!w)return[];
 const all=resolvedItems().filter(x=>x.is_active&&x.can_be_secondary&&String(x.concept_id)!==String(w.data.primary_concept_id));
 const links=w.links.filter(x=>String(x.primary_concept_id)===String(w.data.primary_concept_id)&&x.is_enabled!==false);
 return links.length?all.filter(x=>links.some(l=>String(l.secondary_concept_id)===String(x.concept_id))):all;
}
function sanitizeConcepts(){
 const w=S.wizard;if(!w)return;
 const primaries=new Set(primaryItems().map(x=>String(x.concept_id)));
 if(w.data.primary_concept_id&&!primaries.has(String(w.data.primary_concept_id))){w.data.primary_concept_id='';w.data.secondary_items={};}
 const allowed=new Set(secondaryItems().map(x=>String(x.concept_id)));
 for(const id of Object.keys(w.data.secondary_items))if(!allowed.has(String(id)))delete w.data.secondary_items[id];
 invalidateQuote();
}

async function openWizard(){
 if(!canManage())return;
 clearDraft();
 S.wizard=fresh();
 const shell=document.getElementById('os-wizard-shell');
 if(shell){shell.innerHTML='';shell.className='os-wizard-shell';}
 window.OperatorServiceWorkspaceReviewV3?.prepareOpen?.();
 render();
 open('modal-operador-wizard');
}
function closeWizard(force=false){
 const w=S.wizard;if(!w)return;
 if(!force&&w.dirty&&typeof confirm==='function'&&!confirm('Hay cambios sin guardar. ¿Cerrar el alta?'))return;
 close('modal-operador-wizard');
 const shell=document.getElementById('os-wizard-shell');if(shell)shell.innerHTML='';
 S.wizard=null;
}
function saveDraft(){
 const w=S.wizard;if(!w)return;
 try{
  const savedAt=new Date().toISOString();
  storage()?.setItem(DRAFT_KEY,JSON.stringify({data:w.data,savedAt}));
  w.dirty=false;w.draftSavedAt=savedAt;
  notify('Borrador guardado en este dispositivo','success');render();
 }catch{notify('No se pudo guardar el borrador','error');}
}

async function selectCompany(id,preserve=false){
 const w=S.wizard;if(!w)return;
 const previous=preserve?{branch_id:w.data.branch_id,primary_concept_id:w.data.primary_concept_id,secondary_items:{...w.data.secondary_items}}:null;
 w.data.company_id=id;w.contract=w.card=null;w.items=[];w.links=[];w.quote=null;w.error=null;
 if(!preserve){w.data.branch_id='';w.data.billing_base_id='';w.data.primary_concept_id='';w.data.secondary_items={};markDirty();}
 if(!id){w.loadingCatalog=false;return render();}
 w.loadingCatalog=true;render();
 const date=(w.data.scheduled_for||nowInBuenosAires()).slice(0,10);
 const contracts=await _db.from('company_contracts').select('*').eq('company_id',id).eq('status','active').lte('valid_from',date).or(`valid_until.is.null,valid_until.gte.${date}`).order('is_primary',{ascending:false}).order('valid_from',{ascending:false}).limit(1);
 if(contracts.error||!contracts.data?.length){w.loadingCatalog=false;w.error='La empresa no tiene un contrato vigente.';return render();}
 w.contract=contracts.data[0];
 const cards=await _db.from('company_rate_cards').select('*').eq('contract_id',w.contract.contract_id).eq('status','active').lte('valid_from',date).or(`valid_until.is.null,valid_until.gte.${date}`).order('version',{ascending:false}).limit(1);
 if(cards.error||!cards.data?.length){w.loadingCatalog=false;w.error='El contrato no tiene un tarifario publicado y vigente.';return render();}
 w.card=cards.data[0];
 const [items,links]=await Promise.all([
  _db.from('company_rate_items').select('*').eq('rate_card_id',w.card.rate_card_id).eq('is_active',true),
  _db.from('company_rate_service_links').select('*').eq('rate_card_id',w.card.rate_card_id).eq('is_enabled',true)
 ]);
 w.loadingCatalog=false;
 if(items.error||links.error)w.error='No se pudo cargar el tarifario.';
 else{
  w.items=items.data||[];w.links=links.data||[];w.error=null;
  if(previous){w.data.branch_id=previous.branch_id;w.data.billing_base_id=previous.branch_id;w.data.primary_concept_id=previous.primary_concept_id;w.data.secondary_items=previous.secondary_items;sanitizeConcepts();}
 }
 render();
}
function selectPrimary(id){const w=S.wizard;if(!w)return;w.data.primary_concept_id=id;w.data.secondary_items={};w.quote=null;markDirty();render();}
function addSecondary(id){if(!id||!S.wizard)return;S.wizard.data.secondary_items[id]=1;S.wizard.quote=null;markDirty();render();}
function removeSecondary(id){if(!S.wizard)return;delete S.wizard.data.secondary_items[id];S.wizard.quote=null;markDirty();render();}
function secondaryQty(id,v){if(!S.wizard)return;S.wizard.data.secondary_items[id]=Math.max(num(v),.01);S.wizard.quote=null;markDirty();render();}
function secondaryPayload(){return Object.entries(S.wizard.data.secondary_items).map(([concept_id,quantity])=>({concept_id,quantity:num(quantity)}))}

async function calculate(){
 const w=S.wizard;if(!w?.card||!w.data.primary_concept_id)return;
 const scheduled=new Date(w.data.scheduled_for);
 if(Number.isNaN(scheduled.getTime())){w.error='Ingresá una fecha y hora válidas.';return render();}
 w.busy=true;w.error=null;render();
 const d=w.data,{data,error}=await _db.rpc('calculate_operator_service_quote',{
  p_company_id:d.company_id,p_branch_id:d.branch_id||null,p_scheduled_for:scheduled.toISOString(),
  p_primary_concept_id:d.primary_concept_id,p_secondary_items:secondaryPayload(),p_distance_km:num(d.estimated_distance_km),
  p_toll_amount:num(d.toll_estimate),p_is_holiday:!!d.is_holiday
 });
 w.busy=false;
 if(error){w.error=error.message;w.quote=null}else{w.quote=data;w.error=null}
 render();
}
function validationErrors(){
 const w=S.wizard,d=w?.data,errors=[];if(!w)return['No hay un servicio en edición.'];
 if(!d.company_id||!w.card)errors.push('Seleccioná una empresa con tarifario publicado y vigente.');
 if(!d.primary_concept_id)errors.push('Elegí el concepto principal.');
 if(!String(d.customer_phone||'').trim())errors.push('Completá el teléfono del cliente.');
 if(!String(d.origin||'').trim()||!String(d.destination||'').trim())errors.push('Completá origen y destino.');
 if(w.contract?.requires_service_order&&!String(d.service_order_number||'').trim())errors.push('El contrato exige número de prestación.');
 if((d.assigned_driver_id&&!d.assigned_truck_id)||(!d.assigned_driver_id&&d.assigned_truck_id))errors.push('Chofer y móvil deben asignarse juntos.');
 return errors;
}
async function create(){
 const w=S.wizard;if(!w||w.busy)return;
 const errors=validationErrors();if(errors.length){w.error=errors.join(' ');return render();}
 if(!w.quote){await calculate();if(!w.quote)return;}
 w.busy=true;w.error=null;render();
 const d=w.data,payload={...d,scheduled_for:new Date(d.scheduled_for).toISOString(),estimated_arrival_at:d.estimated_arrival_at?new Date(d.estimated_arrival_at).toISOString():'',estimated_finish_at:d.estimated_finish_at?new Date(d.estimated_finish_at).toISOString():'',secondary_items:secondaryPayload(),estimated_distance_km:num(d.estimated_distance_km),toll_estimate:num(d.toll_estimate),is_holiday:!!d.is_holiday};
 const {data,error}=await _db.rpc('create_operator_service',{p_payload:payload});
 w.busy=false;if(error){w.error=error.message;return render();}
 clearDraft();w.dirty=false;notify(`Servicio ${data.service_number} creado`,'success');closeWizard(true);await loadServices();if(data.service_id)window.abrirDetalleServicio(data.service_id);
}

Object.assign(O,{openWizard,closeWizard,renderWizard:render,calculateQuote:calculate});
Object.assign(window,{
 abrirNuevoServicio:openWizard,cerrarNuevoServicio:closeWizard,guardarBorradorServicio:saveDraft,osSetServicio:setVal,
 seleccionarEmpresaServicio:selectCompany,cambiarSucursalServicio:changeBranch,seleccionarPrincipalServicio:selectPrimary,
 agregarSecundarioServicio:addSecondary,quitarSecundarioServicio:removeSecondary,alternarSecundarioServicio:(id,on)=>on?addSecondary(id):removeSecondary(id),
 cantidadSecundarioServicio:secondaryQty,calcularNuevoServicio:calculate,crearNuevoServicio:create,pasoSiguienteNuevoServicio:()=>{},pasoAnteriorNuevoServicio:()=>{},irPasoNuevoServicio:()=>{}
});
})();
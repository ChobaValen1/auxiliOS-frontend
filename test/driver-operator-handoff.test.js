const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function moduleContext(file,exports,extra={}){
  const elements=new Map();
  const document={readyState:'loading',addEventListener(){},getElementById(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',className:'',innerHTML:'',hidden:true,classList:{remove(){}}});return elements.get(id)}};
  const context={window:{addEventListener(){}},document,setTimeout(){},clearTimeout(){},crypto:require('node:crypto').webcrypto,console,...extra};
  const source=fs.readFileSync(file,'utf8').replace(/\}\)\(\);\s*$/,`window.testApi={${exports}};})();`);
  vm.runInNewContext(source,context);
  return {...context,api:context.window.testApi,elements};
}

test('el firmado pendiente permanece en Activos incluso si un cierre previo lo marcó completed',()=>{
  const {api}=moduleContext('operator-services.js','S,activeServices,historyServices,statusCell');
  const pending={service_id:'pending',remito_id:1,remito_status:'firmado',document_status:'submitted',status:'completed'};
  const assigned={...pending,service_id:'assigned',status:'assigned'};
  const approved={...pending,service_id:'approved',document_status:'approved'};
  api.S.services=[pending,assigned,approved];
  assert.deepEqual(Array.from(api.activeServices(),s=>s.service_id),['pending','assigned']);
  assert.deepEqual(Array.from(api.historyServices(),s=>s.service_id),['approved']);
  assert.match(api.statusCell(pending),/Remito firmado · Revisar/);
  pending.document_status='approved';
  assert.equal(api.activeServices().length,1);
});

test('los cargos informados no quedan tapados por un importe planificado ni se suman dos veces',()=>{
  const {api}=moduleContext('operator-services.js','amountDueCell');
  const html=api.amountDueCell({customer_amount_due:100,customer_payment_methods:['card'],remito_toll_count:1,remito_toll_total:200,remito_toll_payment_methods:['cash'],remito_excess_count:1,remito_excess_total:300,remito_excess_payment_methods:['not_collected']});
  for(const text of ['100','200','300','Peajes','Excedentes','Efectivo','No cobrado','Informado por chofer'])assert.ok(html.includes(text),text);
  assert.ok(!html.includes('600'));
  assert.match(api.amountDueCell({remito_toll_count:1,remito_toll_total:200}),/Peajes/);
});

test('el servicio muestra conceptos, importes y medios del remito sin editar el original',()=>{
  const {api}=moduleContext('operator-service-commercial-addons-v1.js','reportedCharges');
  const addons={tolls:[{toll_name:'Peaje de prueba',quantity:2,total_amount:2400,customer_payment_method:'cash'}],excesses:[{concept_name:'Espera',quantity:1,total_amount:1000,customer_payment_method:'not_collected'}]};
  const original=JSON.stringify(addons),html=api.reportedCharges(addons);
  for(const text of ['Peaje de prueba','2.400','Efectivo','Espera','1.000','No cobrado'])assert.ok(html.includes(text),text);
  assert.equal(JSON.stringify(addons),original);
});

test('nuevo remito limpia confirmaciones Maps, distancia y resultados tardíos del anterior',async()=>{
  let resolvePlace;
  const {api,document}=moduleContext('remito-mobile-flow-v3.js','mapLocations,restoreMapLocations,resetMapLocations,getMapLocations,selectMapLocation',{_db:{functions:{invoke:()=>new Promise(resolve=>{resolvePlace=resolve})}}});
  api.restoreMapLocations({origin_place_id:'old-o',origin_formatted_address:'Origen anterior',destination_place_id:'old-d',destination_formatted_address:'Destino anterior',km:35});
  assert.match(document.getElementById('rmv-origin-status').textContent,/verificada/);
  api.mapLocations.origin.suggestions=[{placeId:'late',text:'Respuesta anterior'}];
  const selecting=api.selectMapLocation('origin',0);
  api.resetMapLocations();
  resolvePlace({data:{placeId:'late',formattedAddress:'Respuesta anterior',location:{latitude:1,longitude:2}},error:null});
  await selecting;
  assert.equal(api.getMapLocations(),null);
  assert.equal(document.getElementById('rmv-origin-status').textContent,'Seleccioná una sugerencia de Google Maps');
  assert.equal(document.getElementById('rmv-destination-status').textContent,'Seleccioná una sugerencia de Google Maps');
  assert.equal(document.getElementById('rem-km').value,'');
  assert.equal(document.getElementById('rmv-route-status').textContent,'Se calcula al elegir origen y destino');
  assert.equal(document.getElementById('rmv-origin-suggestions').hidden,true);
  assert.notEqual(document.getElementById('rem-origen').value,'Respuesta anterior');
});

function wizardContext(rpc=async()=>({data:{},error:null})){
  return moduleContext('operator-service-wizard.js','fresh,fillFromIntake,fillFromContext,loadCommercial,createPayload,editPayload,selectCompany,selectPrimary,changeBase,requiredErrors,locked,setVal',{
    _db:{rpc},window:{addEventListener(){},OperatorServices:{S:{moduleConfig:{field_modes:{}},drivers:[],trucks:[]},num:v=>Number(v)||0,canManage:()=>true,canRead:()=>true,loadServices:async()=>{}}}
  });
}

test('intake preloads all signed fields and keeps reported charges apart through provider/base/type changes',async()=>{
  const {api,window}=wizardContext(async name=>({data:name==='get_operator_service_context_v1'?{bases:[{base_id:'base'}],services:[{concept_id:'type',name:'Remolque',category:'primary',available:true,has_price:true}]}:[],error:null}));
  const w=window.OperatorServices.S.wizard=api.fresh();
  api.fillFromIntake(w,{intake_id:'intake',status:'pending_admin',document_status:'submitted',
    service:{service_order_number:'EXT-008',customer_name:'Socio',customer_document:'20111222333',customer_phone:'1155554444',
      vehicle_make_model:'Ford Fiesta',origin:'Origen Maps',destination:'Destino Maps',origin_place_id:'map-o',origin_lat:-34.6,origin_lng:-58.4,
      destination_place_id:'map-d',destination_lat:-34.7,destination_lng:-58.5,assigned_driver_id:'driver',assigned_truck_id:3},
    remito:{remito_id:99,status:'firmado',km_reales:28},
    addons:{tolls:[{toll_name:'Peaje',quantity:2,total_amount:5000,customer_payment_method:'cash'}],
      excesses:[{concept_name:'Espera',quantity:1,total_amount:8000,customer_payment_method:'not_collected'}]}
  });
  const reported=JSON.stringify(w.reportedAddons);
  await api.selectCompany('provider');await api.changeBase('base');await api.selectPrimary('type');
  assert.equal(w.data.service_order_number,'EXT-008');assert.equal(w.data.customer_document,'20111222333');assert.equal(w.data.customer_phone,'1155554444');
  assert.equal(w.data.origin_place_id,'map-o');assert.equal(w.data.destination_place_id,'map-d');assert.equal(w.reportedDistanceKm,28);
  assert.equal(JSON.stringify(w.reportedAddons),reported);
  const payload=api.createPayload();assert.equal(payload.commercial_addons.tolls.length,0);assert.equal(payload.commercial_addons.excess_charges.length,0);
  for(const key of ['customer_name','customer_document','customer_phone','origin','destination','origin_place_id','assigned_driver_id'])assert.equal(api.locked(key),true,key);
  api.setVal('customer_document','changed');assert.equal(w.data.customer_document,'20111222333');
  assert.equal(api.locked('company_id'),false);assert.equal(api.locked('billing_base_id'),false);
});

test('service details read current remito and charges without consulting a stale desk row',async()=>{
  const {api,window}=wizardContext();
  window.OperatorServices.service=()=>{throw Error('stale table read');};
  const w=window.OperatorServices.S.wizard=api.fresh('view','service');
  const ctx={service:{service_id:'service',remito_id:44,remito_status:'firmado',customer_document:'20333444555',reported_distance_km:15},
    commercial_addons:{tolls:[],excess_charges:[]},reported_addons:{tolls:[{total_amount:3500}],excesses:[]}};
  api.fillFromContext(w,ctx);await api.loadCommercial('service',ctx);
  assert.equal(w.remitoId,44);assert.equal(w.data.customer_document,'20333444555');assert.equal(w.reportedAddons.tolls[0].total_amount,3500);
});

test('customer document participates in general required modes and edit payload',()=>{
  const {api,window}=wizardContext();const s=window.OperatorServices.S,w=s.wizard=api.fresh('edit','service');
  s.moduleConfig.field_modes.customer_document='required';
  assert.ok(api.requiredErrors(w.data).some(e=>e.includes('DNI / CUIT')));
  w.original=JSON.parse(JSON.stringify(w.data));w.data.customer_document='20123456789';
  assert.equal(api.editPayload().customer_document,'20123456789');
  s.moduleConfig.field_modes.customer_document='hidden';
  assert.equal(api.requiredErrors(w.data).some(e=>e.includes('DNI / CUIT')),false);
});

test('Maps status never treats empty or null coordinates as verified zero',()=>{
  const {api}=moduleContext('operator-service-workspace-reactive-v1.js','hasCoordinate');
  for(const value of [null,undefined,'',' ','abc'])assert.equal(api.hasCoordinate(value),false);
  for(const value of [0,'0',-34.6])assert.equal(api.hasCoordinate(value),true);
});

test('link preview shows conflicts while missing administrative fields remain fillable',()=>{
  const {api}=moduleContext('operator-services.js','intakeDifferences');
  const result=api.intakeDifferences({customer_name:'Nombre Operaciones',customer_phone:'',origin:'Origen Operaciones'},{customer_name:'Nombre firmado',customer_phone:'1155555555',origin:'Origen firmado'});
  assert.deepEqual(Array.from(result,row=>row.key),['customer_name','origin']);
  assert.equal(result[0].administrative,'Nombre Operaciones');assert.equal(result[0].reported,'Nombre firmado');
});

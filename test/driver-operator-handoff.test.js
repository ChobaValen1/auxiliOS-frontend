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

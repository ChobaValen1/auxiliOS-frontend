const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=file=>fs.readFileSync(file,'utf8');
function policy(manage){const source=read('operator-services.js').match(/^function canEditHistoryService\(s\).*$/m)[0];return new Function('canManage',source+';return canEditHistoryService;')(()=>manage)}

test('Historial permite editar finalizados no facturados sólo a quienes pueden gestionar',()=>{
  const can=policy(true),no=policy(false);
  for(const billing_status of ['not_ready','pending','reviewed',undefined])assert.equal(can({status:'completed',billing_status}),true);
  for(const status of ['pending','assigned','at_origin','cancelled'])assert.equal(can({status,billing_status:'pending'}),false);
  assert.equal(can({status:'completed',billing_status:'invoiced'}),false);
  assert.equal(can({status:'completed',billing_status:'excluded'}),false);
  assert.equal(no({status:'completed',billing_status:'pending'}),false);
});

test('Ver servicio ofrece la corrección histórica aun cuando el contexto operativo es de sólo lectura',()=>{
  const source=read('operator-service-workspace-reactive-v1.js').match(/^function canEditFromView\(w\).*$/m)[0];
  const O={canManage:()=>true,canEditHistoryService:policy(true)};
  const can=new Function('O',source+';return canEditFromView;')(()=>O);
  const w={mode:'view',serviceStatus:'completed',serviceSnapshot:{billing_status:'pending'},locks:{can_edit:false}};
  assert.equal(can(w),true);
  assert.equal(can({...w,busy:true}),false);
  assert.equal(can({...w,mode:'edit'}),false);
  assert.equal(can({...w,serviceStatus:'cancelled'}),false);
  assert.equal(can({...w,serviceSnapshot:{billing_status:'invoiced'}}),false);
  assert.equal(can({...w,serviceStatus:'assigned'}),false);
  assert.equal(can({...w,serviceStatus:'assigned',locks:{can_edit:true}}),true);
  O.canManage=()=>false;assert.equal(can(w),false);
});

test('particulares muestran Editar en finalizados pendientes, sin habilitar consulta a otros perfiles',()=>{
  const window={OperatorServices:{canManage:()=>true,canEditHistoryService:policy(true)},editarServicioOperador(){}};
  vm.runInNewContext(read('private-view-v1.js'),{window,document:{addEventListener(){}},setInterval:()=>0});
  const can=window.AuxiliosVistaParticular._test.canEdit;
  assert.equal(can({status:'completed',billing_status:'pending'}),true);
  assert.equal(can({status:'completed',billing_status:'invoiced'}),false);
  assert.equal(can({status:'cancelled',billing_status:'pending'}),false);
  window.OperatorServices.canManage=()=>false;assert.equal(can({status:'completed',billing_status:'pending'}),false);
});

test('la edición histórica reutiliza el editor canónico y no introduce mutaciones ni nuevas RPC',()=>{
  const source=read('operator-service-workspace-reactive-v1.js');
  assert.match(source,/w\.serviceStatus==='completed'\?window\.editarServicioFacturacion:window\.editarServicioOperador/);
  assert.match(read('private-service-v1.js'),/if \(!st\.edit\.cerrado\) await guardarInterruptores\(eid\)/);
  assert.match(read('private-service-v1.js'),/estos datos se conservan/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=f=>fs.readFileSync(f,'utf8');
/* Disponibilidad como la devuelve get_operator_resource_availability: trae a
   todos, también al chofer y a los móviles dados de baja. */
const availability={
 drivers:[
  {user_id:'d1',full_name:'Activo',is_active:true,resource_state:'available',active_log_id:1,active_truck_id:3},
  {user_id:'d2',full_name:'Ocupado',is_active:true,resource_state:'busy',active_service_number:'SRV-9'},
  {user_id:'d3',full_name:'De baja',is_active:false,resource_state:'inactive'}
 ],
 trucks:[
  {truck_id:3,numero_interno:'03',status:'active',resource_state:'available',active_log_id:1,active_driver_id:'d1'},
  {truck_id:4,numero_interno:'04',status:'inactive',resource_state:'inactive'},
  {truck_id:5,numero_interno:'05',status:'sold',resource_state:'inactive'},
  {truck_id:6,numero_interno:'06',status:'active',resource_state:'workshop',in_workshop:true}
 ]
};
function runtime(){
 const O={S:{drivers:[{user_id:'d1',full_name:'Activo'},{user_id:'d2',full_name:'Ocupado'}],trucks:[{truck_id:3,numero_interno:'03'},{truck_id:6,numero_interno:'06'}],moduleConfig:{field_modes:{}}},num:Number,canManage:()=>true,canRead:()=>true,loadServices:async()=>{}};
 const window={OperatorServices:O,OperatorServiceWorkspaceV2:{render(){}},dispatchEvent(){},addEventListener(){}};
 const rpc=async name=>({data:name==='get_operator_resource_availability'?availability:{}});
 vm.runInNewContext(read('operator-service-wizard.js'),{window,document:{getElementById:()=>null},_db:{rpc},console,toast(){},setTimeout(){},clearTimeout(){},CustomEvent:function(){},crypto:require('node:crypto').webcrypto});
 return {O,window};
}
test('chofer y móviles dados de baja no quedan en las listas para asignar',async()=>{
 const {O}=runtime();assert.equal(await O.loadResourceAvailability(),true);
 assert.deepEqual([...O.S.drivers.map(x=>x.user_id)],['d1','d2']);
 assert.deepEqual([...O.S.trucks.map(x=>x.truck_id)],[3,6]);
 // Los datos de referencia (sin status) siguen siendo elegibles.
 assert.equal(O.isSelectableResource({truck_id:9,numero_interno:'09'}),true);
 assert.equal(O.isSelectableResource({user_id:'x',full_name:'X'}),true);
});
test('avisa por qué un recurso no se puede asignar, sin contar el propio servicio',async()=>{
 const {O}=runtime();await O.loadResourceAvailability();
 assert.equal(O.resourceBlocker('driver','d1'),'');
 assert.match(O.resourceBlocker('driver','d2'),/ocupado en el servicio SRV-9/);
 assert.equal(O.resourceBlocker('driver','d2','SRV-9'),'','reasignar el mismo servicio no es ocupación');
 assert.match(O.resourceBlocker('truck',6),/en taller/);
 assert.match(O.resourceBlocker('driver','d3'),/inactivo/);
});
test('el modal de asignación muestra errores adentro y la tarjeta de edición queda en Guardando…',()=>{
 const js=read('operator-service-lifecycle.js');
 assert.match(js,/id="osl-assignment-error" role="alert"/);
 assert.match(js,/catch\(err\)\{showAssignmentError\(m,err\.message/);
 assert.doesNotMatch(js,/notify\(err\.message\|\|'No se pudo guardar la asignación','error'\)/);
 assert.match(js,/confirm\.textContent='Guardando…'/);
 assert.match(js,/settleAssignmentConfirmation,close\}/);
 const wizard=read('operator-service-wizard.js');
 assert.match(wizard,/settleAssignment\(w\.error\);render\(\);return false;/);
});
test('Total peajes del Panel usa solo peajes facturables, sin exigir factura',()=>{
 const sql=read('migrations/20260925151000_dashboard_peajes_facturables_v1.sql').split('\n').filter(l=>!l.trim().startsWith('--')).join('\n');
 assert.match(sql,/t\.payer_agent = 'provider'/);
 assert.match(sql,/toll_calculation_mode <> 'not_applicable'/);
 assert.match(sql,/then t\.source = 'actual'\s+else t\.source in \('planned', 'manual'\)/);
 assert.doesNotMatch(sql,/operator_invoice_tolls/);
 assert.doesNotMatch(sql,/toll_billing_mode\s*=\s*'separate'/);
 assert.match(sql,/raise exception 'No se encontró la expresión de peajes esperada/);
});

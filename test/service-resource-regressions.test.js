const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const read=f=>fs.readFileSync(f,'utf8');
function runtime(){
 const calls=[];
 const availability={drivers:[{user_id:'d1',full_name:'Chofer',active_log_id:14,active_truck_id:3}],trucks:[{truck_id:3,numero_interno:'03',active_log_id:14,active_driver_id:'d1'}]};
 const O={S:{drivers:[],trucks:[],moduleConfig:{field_modes:{}}},num:Number,canManage:()=>true,canRead:()=>true,loadServices:async()=>{}};
 const document={getElementById:()=>null};
 const window={OperatorServices:O,OperatorServiceWorkspaceV2:{render(){}},dispatchEvent(){},addEventListener(){}};
 const rpc=async(name,args)=>{calls.push({name,args});return {data:name==='get_operator_resource_availability'?availability:name==='get_driver_service_intake_context_v1'?{intake_id:'i1',status:'pending_admin',driver_activated:true,service:{assigned_driver_id:'d1',assigned_truck_id:3,scheduled_for:new Date().toISOString()},remito:{status:'anulado'},addons:{tolls:[],excesses:[]}}:{}};};
 vm.runInNewContext(read('operator-service-wizard.js'),{window,document,_db:{rpc},console,toast(){},setTimeout(){},clearTimeout(){},CustomEvent:function(){},crypto:require('node:crypto').webcrypto});
 return {O,window,calls};
}
test('el refresco de referencias no borra la pareja de jornada en ninguna dirección',async()=>{
 const {O,window}=runtime();await window.abrirNuevoServicio();
 // loadReferences replaces these arrays every 30 seconds while the form remains open.
 O.S.drivers=[{user_id:'d1',full_name:'Chofer'}];O.S.trucks=[{truck_id:3,numero_interno:'03'}];
 O.setServiceAssignment('driver','d1');assert.equal(O.S.wizard.data.assigned_truck_id,'3');
 O.setServiceAssignment('driver','');O.setServiceAssignment('truck','3');assert.equal(O.S.wizard.data.assigned_driver_id,'d1');
 assert.equal(O.resourceHint('driver','d1'),'Disponible');
});
test('ingreso activado permite editar, agregar cargos y enviarlos completos al crear y finalizar',async()=>{
 const {O,window,calls}=runtime();await window.abrirNuevoServicio('i1');const w=O.S.wizard;
 assert.equal(w.administrativeEdit,false);assert.equal(O.isServiceFieldLocked('company_id'),false);assert.equal(O.isServiceFieldLocked('vehicle_plate'),false);assert.equal(O.isServiceFieldLocked('assigned_driver_id'),true);
 window.osSetServicio('vehicle_plate','ab123cd');assert.equal(w.data.vehicle_plate,'ab123cd');
 Object.assign(w.data,{company_id:'company',billing_base_id:'base',primary_concept_id:'primary',service_order_number:'QA',origin:'Origen',destination:'Destino'});
 w.context={};w.contextKey='company|'+w.data.scheduled_for.slice(0,10);w.items=[{concept_id:'primary',has_price:true},{concept_id:'extra',can_be_secondary:true,available:true,has_price:true}];
 w.tollCatalog=[{toll_id:'t1',rates:[{toll_rate_id:'r1',is_current:true,is_active:true,amount:1500}]}];
 O.setCommercialCoverage('customer_roundtrip');O.addCommercialToll();O.updateCommercialToll(0,'toll_id','t1');O.updateCommercialToll(0,'customer_payment_method','cash');
 O.addCommercialExcess();for(const [k,v] of Object.entries({concept_id:'extra',quantity:1,unit_amount:2500,collector_agent:'company',customer_payment_method:'transfer'}))O.updateCommercialExcess(0,k,v);
 w.activationBilling='billable';w.quote={};await window.guardarServicioWorkspace();
 const saved=calls.find(x=>x.name==='create_finalize_activated_intake_v1');assert.ok(saved,'Se invoca el cierre con los cargos');
 assert.equal(saved.args.p_payload.commercial_addons.tolls.length,1);assert.equal(saved.args.p_payload.commercial_addons.excess_charges[0].unit_amount,2500);assert.equal(saved.args.p_payload.administrative_commercial,undefined);
});
test('Postgres: finalizar libera recursos y consulta el último responsable, sin reasignar',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec(read('test/fixtures/driver-handoff-schema.sql'));
 await db.exec('alter table operator_services add column activation_driver_id uuid,add column activation_truck_id integer;create table operator_service_assignments(service_id uuid,assignment_sequence integer,driver_id uuid,truck_id integer);');
 const fn=read('supabase/migrations/20260924163151_service_responsibles_and_intake_edit_v1.sql').match(/create or replace function app_private.service_responsibles_v1[\s\S]*?\$\$;/)[0];await db.exec(fn);
 const sid='20000000-0000-4000-8000-000000000001',d1='10000000-0000-4000-8000-000000000001',d2='10000000-0000-4000-8000-000000000002';
 await db.query("insert into operator_services(service_id,status) values($1,'completed')",[sid]);
 await db.query('insert into operator_service_assignments values($1,1,$2,1),($1,2,$3,2)',[sid,d1,d2]);
 const result=(await db.query('select s.status,s.assigned_driver_id,s.assigned_truck_id,c.* from operator_services s cross join lateral app_private.service_responsibles_v1(s) c')).rows[0];
 assert.equal(result.status,'completed');assert.equal(result.driver_id,d2);assert.equal(result.truck_id,2);assert.equal(result.assigned_driver_id,null);assert.equal(result.assigned_truck_id,null);
 await db.query("update operator_services set status='pending'");assert.equal((await db.query('select c.* from operator_services s cross join lateral app_private.service_responsibles_v1(s) c')).rows[0].driver_id,null);
});

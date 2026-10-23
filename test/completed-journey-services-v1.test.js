const {test,before,after,beforeEach}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const driver='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';let db;
before(async()=>{db=new PGlite();await db.exec(fs.readFileSync('test/fixtures/completed-payroll-v2.sql','utf8'));
 await db.exec(`alter table operator_services add trip_id integer,add service_order_number text,add service_number text,add vehicle_plate text,add origin text,add destination text,add estimated_distance_km numeric,add arrived_at timestamptz;
 alter table operator_service_assignments add trip_id integer;
 create table trips(trip_id integer primary key,log_id integer,driver_id uuid,fecha_hora_inicio timestamptz);
 alter table payroll_liquidaciones add servicios integer,add valor_servicio_snapshot numeric;`);
 for(const file of ['20261023180907_driver_history_completed_payroll_v2.sql','20261023182440_driver_cash_receiver_scope_v2.sql','20261023214209_completed_journey_services_v1.sql','20261023215420_completed_journey_driver_scope_v1.sql'])await db.exec(fs.readFileSync('migrations/'+file,'utf8'));
});
after(async()=>db?.close());
beforeEach(async()=>{await db.exec('truncate operator_services,operator_service_assignments,remitos,trips,daily_logs,payroll_liquidaciones,service_payments,operator_service_tolls,payroll_cash_months;');await db.query("select set_config('test.uid',$1,false),set_config('test.role','administracion',false)",[driver]);});
async function val(sql,args=[]){return(await db.query(sql,args)).rows[0].v;}
async function service(extra={}){const s={service_id:crypto.randomUUID(),status:'completed',logistics_type:'own',completed_at:'2026-10-22T22:41Z',assigned_driver_id:driver,document_status:'exception_approved',service_order_number:'QA-EXCEPTION',...extra};const k=Object.keys(s);await db.query(`insert into operator_services(${k.join(',')}) values(${k.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(s));return s.service_id;}
const list=(ids=[1],d=null,p=null)=>val('select get_completed_journey_services_v1($1,$2,$3) v',[ids,d,p]);
test('finalizado sin remito usa viaje real incluso al liberar asignación y cruzar medianoche',async()=>{
 const id=await service({assigned_driver_id:null,trip_id:1});await db.query("insert into operator_service_assignments(service_id,driver_id,assigned_at,trip_id) values($1,$2,'2026-10-22',1)",[id,driver]);
 await db.query("insert into trips values(1,1,$1,'2026-10-22T21:04Z')",[driver]);await db.query("insert into daily_logs values(1,$1,'2026-10-22')",[driver]);const rows=await list();assert.equal(rows.length,1);assert.equal(rows[0].log_id,1);assert.equal(rows[0].no_remito,true);assert.equal(rows[0].remito_id,undefined);assert.equal(rows[0].document_status,'exception_approved');
 await db.query("update operator_services set completed_at='2026-10-23T04:00Z'");assert.equal((await list())[0].log_id,1);
});
test('sin jornada no se inventa una por fecha; se devuelve en el mes del chofer',async()=>{await service();assert.equal((await list()).length,0);const rows=await list([],driver,202610);assert.equal(rows.length,1);assert.equal(rows[0].log_id,null);assert.equal((await list([],other,202610)).length,0);});
test('excluye anulados, tercerizados, Movida y remitos existentes; reaparece si el único remito fue anulado',async()=>{
 for(const e of [{status:'cancelled'},{logistics_type:'third_party'},{driver_activated:true,activation_kind:'movement'}])await service(e);
 const id=await service();await db.query("insert into remitos(remito_id,operator_service_id,driver_id,status) values(1,$1,$2,'firmado')",[id,driver]);assert.equal((await list([],driver,202610)).length,0);
 await db.exec("update remitos set status='anulado'");assert.equal((await list([],driver,202610)).length,1);
});
test('efectivo confirmado, no previsto; respeta receptor, pagos mixtos y gastos reales',async()=>{
 const id=await service({customer_payment_primary:'transfer',customer_payment_secondary:'cash',customer_payment_secondary_amount:3000});
 await db.query("insert into service_payments(service_id,method,amount,received_by) values($1,'cash',1000,$2),($1,'cash',9999,$3),($1,'transfer',8888,$2)",[id,driver,other]);
 await db.query("insert into operator_service_tolls(service_id,source,unit_amount,total_amount,payer_agent,payment_method) values($1,'actual',5000,5000,'customer','cash'),($1,'planned',9999,9999,'customer','cash')",[id]);const row=(await list([],driver,202610))[0];assert.equal(row.cash_expected,4000);assert.equal(row.toll_cash_expense,5000);
});
test('permisos explícitos: chofer sólo sus datos, no operador ni anónimo; límites validados',async()=>{
 for(const role of ['operador','facturacion','']){await db.query("select set_config('test.role',$1,false)",[role]);await assert.rejects(list(),/Sin permiso/);}
 await db.exec("select set_config('test.role','chofer',false)");await assert.rejects(list([],other,202610),/Sin permiso/);await assert.rejects(list([999]),/Sin permiso/);await service();assert.equal((await list([],driver,202610)).length,1);
 await db.exec("select set_config('test.role','administracion',false)");await assert.rejects(list(Array(501).fill(1)),/500/);await assert.rejects(list([],driver,202613),/Período/);
 assert.equal(await val("select has_function_privilege('anon','public.get_completed_journey_services_v1(integer[],uuid,integer)','execute') v"),false);
 assert.equal(await val("select has_function_privilege('authenticated','app_private.repair_pending_completed_payroll_v1()','execute') v"),false);
});
test('repara todas las pendientes, preserva tarifas, esquema fijo, aprobadas/pagadas y deja auditoría idempotente',async()=>{
 await service();await db.query("insert into payroll_liquidaciones(driver_id,periodo_yyyymm,estado,servicios,valor_servicio_snapshot,adic_serv,sueldo_basico,compensation_snapshot,total) values($1,202610,'pendiente',0,4070,0,10000,'{\"pay_services\":true}',10000),($2,202610,'aprobada',99,1,99,123,'{}',222),($2,202609,'pagada',8,1,8,55,'{}',63)",[driver,other]);
 const frozen=await val("select jsonb_agg(to_jsonb(p)) v from payroll_liquidaciones p where estado<>'pendiente'");await val('select app_private.repair_pending_completed_payroll_v1() v');
 const row=await val("select to_jsonb(p) v from payroll_liquidaciones p where estado='pendiente'");assert.equal(row.servicios,1);assert.equal(row.adic_serv,4070);assert.equal(row.total,14070);assert.equal(row.valor_servicio_snapshot,4070);assert.equal(row.compensation_snapshot.completed_services_repair_v1.previous_services,0);
 assert.deepEqual(await val("select jsonb_agg(to_jsonb(p)) v from payroll_liquidaciones p where estado<>'pendiente'"),frozen);assert.equal((await val('select app_private.repair_pending_completed_payroll_v1() v')).length,0);
 await db.exec("update payroll_liquidaciones set compensation_snapshot=' {\"pay_services\":false}',servicios=0,adic_serv=0 where estado='pendiente'");await val('select app_private.repair_pending_completed_payroll_v1() v');assert.equal(Number(await val("select adic_serv v from payroll_liquidaciones where estado='pendiente'")),0);
});
test('UI: deduplica, no fabrica remito, y muestra sin jornada con enlace a servicio',()=>{
 const c={window:{},console};vm.runInNewContext(fs.readFileSync('ui/completed-journey-services-v1.js','utf8'),c);const H=c.window.CompletedJourneyServices;
 const rows=H.merge([{operator_service_id:'same',remito_id:1}],[{operator_service_id:'same'},{operator_service_id:'new',no_remito:true,nro_servicio:'QA',cash_expected:1200}]);assert.equal(rows.length,2);assert.equal(H.trip(rows[1]).trip_id,null);
 vm.runInNewContext(fs.readFileSync('payroll-matrix.js','utf8'),c);c.PayrollMatrix=c.window.PayrollMatrix;vm.runInNewContext(fs.readFileSync('payroll-view.js','utf8'),c);const V=c.window.PayrollView,s=V.serviceData(rows[1],{}, {compensation_snapshot:{commission_details:[{record_details:[{service_id:'other',total:999}]}]}});
 assert.equal(s.cash,1200);assert.equal(s.commission,0);assert.match(V.serviceRow(s),/data-service="new"/);assert.doesNotMatch(V.serviceRow(s),/data-remito/);assert.match(V.unlinkedServices([], [s]),/Servicios sin jornada/);
});

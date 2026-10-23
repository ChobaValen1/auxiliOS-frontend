const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync('migrations/20261023180907_driver_history_completed_payroll_v2.sql','utf8');
const driver='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
let db;
before(async()=>{db=new PGlite();await db.exec(fs.readFileSync('test/fixtures/completed-payroll-v2.sql','utf8'));await db.exec(migration);await db.exec(fs.readFileSync('migrations/20261023182440_driver_cash_receiver_scope_v2.sql','utf8'));await db.exec(fs.readFileSync('migrations/20261023183304_all_service_history_tolls_v1.sql','utf8'));await db.exec(fs.readFileSync('migrations/20261023195803_history_list_tolls_v1.sql','utf8'));});
after(async()=>db?.close());
beforeEach(async()=>{
  await db.exec("truncate operator_services,operator_service_assignments,remitos,operator_service_tolls,operator_service_excess_charges,service_payments,service_collection_reports,daily_logs,remito_toll_reports,remito_excess_reports,journey_cash_expenses,rendicion_cierre,payroll_cash_months,payroll_liquidaciones,companies,service_concepts,service_toggle_marks;");
  await db.query("select set_config('test.uid',$1,false),set_config('test.role','administracion',false)",[driver]);
});
async function service(extra={}){
  const id=extra.service_id||crypto.randomUUID();
  const row={service_id:id,status:'completed',logistics_type:'own',completed_at:'2026-10-23T15:00:00Z',assigned_driver_id:driver,...extra};
  const keys=Object.keys(row);await db.query(`insert into operator_services(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row));return id;
}
async function value(sql,args=[]){return (await db.query(sql,args)).rows[0].v;}
const count=(id=driver,month=202610)=>value('select public.get_payroll_service_count_v2($1,$2) v',[id,month]);
const cash=(id=driver)=>value('select public.get_payroll_monthly_cash_v2($1,202610) v',[id]);
async function remito(id,sid,extra={}){
  const row={remito_id:id,operator_service_id:sid,driver_id:driver,status:'firmado',firmado_at:'2026-10-23T15:00:00Z',created_at_device:'2026-10-23T15:00:00Z',...extra};
  const keys=Object.keys(row);await db.query(`insert into remitos(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row));
}
async function payment(sid,amount,method='cash',receiver=driver,voided=null){await db.query("insert into service_payments values($1,'saldo',$2,$3,'2026-10-23T15:00:00Z',$4,$5)",[sid,amount,method,receiver,voided]);}

test('cuenta finalizados sin remito y resuelve última asignación anterior al cierre',async()=>{
  await service();const id=await service({assigned_driver_id:null});
  await db.query("insert into operator_service_assignments(service_id,driver_id,assigned_at,assignment_sequence) values($1,$2,'2026-10-22',1),($1,$3,'2026-10-23T14:00Z',2),($1,$2,'2026-10-24',3)",[id,other,driver]);
  await service({assigned_driver_id:null,driver_activated:true,activation_kind:'origin',activation_driver_id:driver});
  assert.equal(Number(await count()),3);assert.equal(Number(await count(other)),0);
});
test('un remito tardío o duplicado no duplica ni mueve el servicio a otro mes',async()=>{
  const id=await service();await remito(1,id);await remito(2,id,{firmado_at:'2026-11-02',created_at_device:'2026-11-02'});
  assert.equal(Number(await count()),1);assert.equal(Number(await count(driver,202611)),0);
  await remito(3,null);assert.equal(Number(await count()),2);
});
test('no paga anulados, tercerizados, pendientes ni Activado Movida; respeta mes argentino',async()=>{
  for(const x of [{status:'cancelled'},{status:'assigned'},{logistics_type:'outsourced'},{driver_activated:true,activation_kind:'movement'},{assigned_driver_id:null}])await service(x);
  await service({completed_at:'2026-11-01T02:59:59Z'});await service({completed_at:'2026-11-01T03:00:00Z'});
  assert.equal(Number(await count()),1);assert.equal(Number(await count(driver,202611)),1);
  await assert.rejects(count(driver,202613),/Período inválido/);
});
test('efectivo real del chofer sin remito entra; Administración, transferencias y anulaciones no',async()=>{
  const id=await service();await payment(id,10000);await payment(id,7000,'cash',other);await payment(id,9000,'transfer');await payment(id,5000,'cash',driver,'2026-10-23');
  await db.query('insert into payroll_cash_months(driver_id,periodo_yyyymm,presented) values($1,202610,2000)',[driver]);
  const c=await cash();assert.equal(c.expected,10000);assert.equal(c.discount,8000);assert.equal(c.days.length,1);
});
test('la custodia de efectivo sigue al receptor aunque otro chofer hiciera el servicio',async()=>{
  const id=await service({assigned_driver_id:other});await payment(id,1234);
  assert.equal((await cash()).expected,1234);assert.equal((await cash(other)).expected,0);
  assert.equal(Number(await count()),0);assert.equal(Number(await count(other)),1);
});
test('peajes estimados no son efectivo; confirmados descuentan gastos y contemplan pago mixto',async()=>{
  const id=await service({customer_payment_primary:'transfer',customer_payment_secondary:'cash',customer_payment_secondary_amount:3000});
  await db.query("insert into operator_service_tolls(service_id,source,unit_amount,total_amount,payer_agent,payment_method,customer_payment_method) values($1,'planned',50000,50000,'customer','cash','cash'),($1,'actual',10000,10000,'customer','cash','transfer'),($1,'actual',12000,12000,'provider','any',null)",[id]);
  const c=await cash();assert.equal(c.expected,3000);assert.equal(c.expenses,10000);assert.equal(c.due,-7000);assert.equal(c.discount,0);
});
test('el cobro aprobado por remito y su service_payment se computan una sola vez',async()=>{
  const id=await service();await remito(1,id,{log_id:1});await payment(id,10000);
  await db.query("insert into daily_logs values(1,$1,'2026-10-23')",[driver]);
  await db.query('insert into payroll_cash_months(driver_id,periodo_yyyymm,presented) values($1,202610,0)',[driver]);
  await db.query(`insert into service_collection_reports values($1,1,$2,'[{"method":"cash","amount":10000}]','approved','2026-10-23T15:00:00Z')`,[id,driver]);
  const c=await cash();assert.equal(c.expected,10000);assert.equal(c.discount,10000);
});
test('particular sin remito incluye comisión y toggles y no duplica la fuente al firmarse',async()=>{
  const co=crypto.randomUUID(),concept=crypto.randomUUID();
  await db.query("insert into companies values($1,'particular');",[co]);
  const id=await service({company_id:co,quoted_total:50000,primary_concept_id:concept});
  await db.query("insert into service_concepts values($1,'toggle')",[concept]);
  await db.query("insert into service_toggle_marks values($1,$2,'operator',true)",[id,concept]);
  let data=await value("select public.get_payroll_matrix_sources_v2($1,'2026-10-01','2026-11-01') v",[driver]);
  assert.equal(data.invoices.length,1);assert.equal(data.invoices[0].amount,50000);assert.equal(data.extras.length,1);
  await remito(1,id);data=await value("select public.get_payroll_matrix_sources_v2($1,'2026-10-01','2026-11-01') v",[driver]);
  assert.equal(data.invoices.length,1);
  await db.query("update remitos set firmado_at='2026-11-02' where remito_id=1");
  const next=await value("select public.get_payroll_matrix_sources_v2($1,'2026-11-01','2026-12-01') v",[driver]);assert.equal(next.invoices.length,0);
});
test('Historial usa sólo peajes reales aprobados, no suma también los planificados',async()=>{
  const id=await service({document_status:'approved'});await remito(1,id,{addons_review_status:'approved',accepted_imp_peaje:22200});
  for(const source of ['actual','planned'])await db.query("insert into operator_service_tolls(service_id,source,toll_name_snapshot,unit_amount,total_amount,payer_agent) values($1,$2,'Alberti',11200,11200,'provider'),($1,$2,'Dellepiane Norte',11000,11000,'provider')",[id,source]);
  const d=await value('select public.get_driver_remito_history_v3(1) v');
  assert.equal(d.approved_tolls.length,2);assert.equal(d.approved_tolls.reduce((n,t)=>n+t.total_amount,0),22200);assert.equal(d.tolls.length,0);
  assert.equal(d.history_tolls.length,2);assert.equal(d.history_tolls.reduce((n,t)=>n+t.total_amount,0),22200);
});
test('todos los servicios: previstos sin remito y remitos antiguos/pending también tienen peajes',async()=>{
  for(const state of [{document_status:'exception_approved'},{document_status:'submitted',status:'at_origin'},{document_status:'approved'}]){
    const id=await service(state);await db.query("insert into operator_service_tolls(service_id,source,toll_name_snapshot,total_amount,payer_agent) values($1,'planned','Otro peaje',5000,'provider')",[id]);
    const rows=await value('select app_private.service_history_tolls_v1($1) v',[id]);assert.equal(rows.length,1);
    if(state.document_status!=='exception_approved'){
      const n=state.status?1:2;await remito(n,id,{addons_version:1,addons_review_status:'pending'});
      const d=await value('select public.get_driver_remito_history_v3($1) v',[n]);assert.equal(d.history_tolls.length,1);assert.equal(d.history_tolls[0].display_status,'planned');assert.equal(d.service_tolls_approved,false);
    }
  }
});
test('la lista recibe peajes por lote, también de servicios sin remito',async()=>{
  const id=await service({document_status:'exception_approved'});await db.query("insert into operator_service_tolls(service_id,source,toll_name_snapshot,total_amount,payer_agent) values($1,'planned','Peaje del servicio sin remito',4500,'provider')",[id]);
  const list=await value('select public.get_history_list_tolls_v1($1,array[]::integer[]) v',[[id]]);assert.equal(list.services.length,1);assert.equal(list.services[0].history_tolls[0].total_amount,4500);
  await remito(1,id);const remitos=await value('select public.get_history_list_tolls_v1(array[]::uuid[],$1) v',[[1]]);assert.equal(remitos.remitos[0].history_tolls.length,1);
});
test('lote: chofer sólo puede leer sus remitos y no pedir servicios o más de cien registros',async()=>{
  await remito(1,null);await remito(2,null,{driver_id:other});
  await db.query("select set_config('test.role','chofer',false)");
  const own=await value('select public.get_history_list_tolls_v1(array[]::uuid[],$1) v',[[1]]);assert.equal(own.remitos.length,1);
  await assert.rejects(value('select public.get_history_list_tolls_v1(array[]::uuid[],$1) v',[[2]]),/Sin permiso/);
  await assert.rejects(value('select public.get_history_list_tolls_v1($1,array[]::integer[]) v',[[crypto.randomUUID()]]),/Sin permiso/);
  await assert.rejects(value('select public.get_history_list_tolls_v1(array[]::uuid[],$1) v',[Array.from({length:101},(_,i)=>i+1)]),/100 registros/);
  assert.equal(await value("select has_function_privilege('anon','public.get_history_list_tolls_v1(uuid[],integer[])','EXECUTE') v"),false);
});
test('confirma sólo su propia copia prevista; conserva otros peajes y todas las pasadas informadas',async()=>{
  const op=[{toll_name:'Peaje A',payer_agent:'provider',source:'planned'},{toll_name:'Peaje A',payer_agent:'provider',source:'actual',total_amount:1000},{toll_name:'Peaje B',payer_agent:'customer',source:'planned',total_amount:2000}];
  const reports=[{toll_name:'Peaje C',payer_agent:'customer',total_amount:300},{toll_name:'Peaje C',payer_agent:'customer',total_amount:300}];
  const rows=await value('select app_private.merge_history_tolls_v1($1,$2,true) v',[JSON.stringify(op),JSON.stringify(reports)]);
  assert.equal(rows.length,4);assert.equal(rows.filter(t=>t.toll_name==='Peaje A').length,1);assert.equal(rows.find(t=>t.toll_name==='Peaje B').display_status,'planned');assert.equal(rows.filter(t=>t.toll_name==='Peaje C').length,2);
});
test('endpoints v2 exigen sesión y respetan propiedad/roles; privados y anon sin EXECUTE',async()=>{
  await remito(1,null,{driver_id:other});
  await db.query("select set_config('test.role','chofer',false)");
  await assert.rejects(value('select public.get_driver_remito_history_v3(1) v'),/Sin permiso/);
  await assert.rejects(value('select public.get_driver_payroll_estimate_v2(202610,$1) v',[other]),/Sin permiso/);
  await assert.rejects(count(),/No autorizado/);
  await db.query("select set_config('test.uid','',false)");
  await assert.rejects(value('select public.get_driver_remito_history_v3(1) v'),/Sin permiso/);
  const a=await db.query("select has_function_privilege('anon','public.get_driver_remito_history_v3(integer)','EXECUTE') a,has_function_privilege('authenticated','app_private.completed_driver_services_v2()','EXECUTE') b");
  assert.equal(a.rows[0].a,false);assert.equal(a.rows[0].b,false);
});
test('estimado y generación usan el mismo conteo y descuento; aprobadas/pagadas conservan montos',async()=>{
  const id=await service();await payment(id,10000);
  await db.query('insert into payroll_cash_months(driver_id,periodo_yyyymm,presented) values($1,202610,0)',[driver]);
  const e=await value('select public.get_driver_payroll_estimate_v2(202610,$1) v',[driver]);assert.equal(e.servicios,1);assert.equal(e.descuento_rendicion,10000);
  for(const estado of ['pendiente','aprobada','pagada']){
    await db.query(`insert into payroll_liquidaciones(driver_id,periodo_yyyymm,estado,compensation_snapshot,sueldo_basico,total,ajuste_rendiciones) values($1,202610,$2,'{"completed_services_v2":true}',50000,123,321)`,[driver,estado]);
  }
  const rows=(await db.query('select estado,total,ajuste_rendiciones from payroll_liquidaciones order by estado')).rows;
  assert.equal(Number(rows.find(r=>r.estado==='pendiente').total),40000);
  for(const row of rows.filter(r=>r.estado!=='pendiente')){assert.equal(Number(row.total),123);assert.equal(Number(row.ajuste_rendiciones),321);}
  await db.query("insert into payroll_liquidaciones(driver_id,periodo_yyyymm,estado,compensation_snapshot,sueldo_basico) values($1,202610,'pendiente','{}',50000)",[driver]);
  assert.equal(Number((await db.query("select total from payroll_liquidaciones where compensation_snapshot='{}'::jsonb")).rows[0].total),50000);
});

test('Historial muestra peajes de prestadora aunque no haya líneas informadas por el chofer',async()=>{
  const host={innerHTML:''},calls=[];
  const context={window:{},document:{readyState:'loading',addEventListener(){}},console,_db:{rpc:async(name)=>{calls.push(name);return{data:{service_tolls_approved:true,review_status:'approved',service_id:'s',approved_tolls:[{toll_name:'Alberti',total_amount:11200,payer_agent:'provider'},{toll_name:'Dellepiane Norte',total_amount:11000,payer_agent:'provider'}],tolls:[],excesses:[]}};}}};
  vm.runInNewContext(fs.readFileSync('remito-addons-v2.js','utf8'),context);
  await context.window.AuxiliosRemitoAddonsV2.renderHistory(1,host);
  assert.deepEqual(calls,['get_driver_remito_history_v3']);assert.match(host.innerHTML,/Alberti/);assert.match(host.innerHTML,/Dellepiane Norte/);assert.match(host.innerHTML,/A cargo de la prestadora/);assert.doesNotMatch(host.innerHTML,/confirmó que no hubo/);
});
test('Historial de Administración muestra peajes aprobados aparte del cobro firmado',()=>{
  const context={window:{},document:{addEventListener(){}},console};
  const source=fs.readFileSync('remitos-admin-panel-v1.js','utf8').replace('window.RemitoPanel={','window.qaPeajes=renderPeajesServicio;window.RemitoPanel={');
  vm.runInNewContext(source,context);
  const html=context.window.qaPeajes({operator_service_id:'s'},{service_tolls_approved:true,approved_tolls:[{toll_name:'Alberti',total_amount:11200,payer_agent:'provider'},{toll_name:'Dellepiane Norte',total_amount:11000,payer_agent:'provider'}]});
  assert.match(html,/22.200/);assert.match(html,/Alberti/);assert.match(html,/prestadora/);assert.match(html,/No equivale al efectivo cobrado/);
  const pending=context.window.qaPeajes({operator_service_id:'s'},{service_tolls_approved:false,history_tolls:[{toll_name:'Otro peaje previsto',total_amount:5000,payer_agent:'provider',display_status:'planned'}]});
  assert.match(pending,/Otro peaje previsto/);assert.match(pending,/Previsto/);assert.doesNotMatch(pending,/Total aprobado/);
});
test('Historial sin remito abre el servicio con sus peajes, no un visor de remito inexistente',async()=>{
  const calls=[],context={service:()=>({status:'completed',remito_id:null}),viewService:id=>calls.push(id),window:{}};
  const source=fs.readFileSync('operator-services.js','utf8').match(/async function openSignedRemito\(id\)\{[\s\S]*?\n\}/)[0];vm.runInNewContext(source,context);
  await context.openSignedRemito('service-without-remito');assert.deepEqual(calls,['service-without-remito']);
});

async function generatePayroll(state=null,race=false){
  const writes=[],calls=[],settings={sueldo_basico:10000,valor_servicio:500,compensation_matrix:{pay_services:true,pay_km:false,pay_presentismo:false}};
  const context={window:{},console,PERFIL_USUARIO:{user_id:driver},_payrollRangoMes:()=>({desde:'2026-10-01',hastaExclusive:'2026-11-01',desdeTs:'2026-10-01T03:00:00Z',hastaTsExclusive:'2026-11-01T03:00:00Z'}),cargarPayrollSettingsFlota:async()=>[{user_id:driver,settings}]};
  context._db={rpc:async(name)=>{calls.push(name);return{data:name==='get_payroll_service_count_v2'?2:{discount:1000}};},from:table=>{
    let payload=null;const filters={};const chain={select(){return this},eq(k,v){filters[k]=v;return this},gte(){return this},lt(){return this},neq(){return this},update(p){payload=p;return this},
      insert:async p=>{writes.push(p);return{error:null}},
      maybeSingle:async()=>{if(payload){if(race)return{data:null};assert.equal(filters.estado,'pendiente');writes.push(payload);return{data:{liquidacion_id:1}};}return{data:state?{liquidacion_id:1,estado:state}:null};},
      then(resolve){assert.notEqual(table,'remitos','generation must not count remitos');return Promise.resolve({data:[]}).then(resolve);}};return chain;
  }};
  vm.runInNewContext(fs.readFileSync('payroll-matrix.js','utf8'),context);context.PayrollMatrix=context.window.PayrollMatrix;
  const source=fs.readFileSync('supabase.js','utf8').match(/async function generarLiquidacionesMes\(yyyymm\) \{[\s\S]*?\n\}/)[0];
  vm.runInNewContext(source,context);
  return{result:await context.generarLiquidacionesMes(202610),writes,calls};
}
test('generación real de frontend usa servicios v2 y descuento v2 en el nuevo recibo',async()=>{
  const {result,writes,calls}=await generatePayroll();assert.equal(result.creadas,1);assert.equal(writes[0].servicios,2);assert.equal(writes[0].adic_serv,1000);assert.equal(writes[0].ajuste_rendiciones,1000);assert.equal(writes[0].total,10000);assert.equal(writes[0].compensation_snapshot.completed_services_v2,true);
  assert.ok(calls.includes('get_payroll_service_count_v2'));assert.ok(calls.includes('get_payroll_monthly_cash_v2'));
});
test('generador no modifica aprobadas/pagadas ni si se aprueba durante el cálculo',async()=>{
  for(const state of ['aprobada','pagada']){const r=await generatePayroll(state);assert.equal(r.writes.length,0);assert.equal(r.result.saltadas,1);}
  const r=await generatePayroll('pendiente',true);assert.equal(r.writes.length,0);assert.equal(r.result.saltadas,1);
});

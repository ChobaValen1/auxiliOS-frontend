const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const driver='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',battery='33333333-3333-4333-8333-333333333333';
const sql=fs.readFileSync('supabase/migrations/20261026125228_operator_sales_commissions_v3.sql','utf8');
let db,matrix;
before(async()=>{
 db=new PGlite();await db.exec(fs.readFileSync('test/fixtures/completed-payroll-v2.sql','utf8'));
 await db.exec(`alter table operator_services add column administrative_commercial jsonb,add column currency text default 'ARS';
 alter table remito_excess_reports add column excess_report_id uuid default gen_random_uuid(),add column concept_id uuid,add column quantity numeric,add column currency text default 'ARS';
 alter table service_toggle_marks add column remito_id integer;
 create table operator_service_items(service_id uuid,concept_id uuid,item_role text,quantity numeric,subtotal numeric);
 alter table service_concepts add column name text,add column code text,add column default_pricing_unit text,add column sort_order integer default 0,add column is_active boolean default true,add column billing_family text default 'variable',add column service_category text default 'secondary';
 create table company_service_settings(company_id uuid,concept_id uuid,is_enabled boolean);
 create table payroll_commission_rules(commission_id uuid,concept_id uuid,active boolean,source text);
 create table payroll_commission_assignments(commission_id uuid,driver_id uuid);
 create function get_operator_service_context_v1(uuid,timestamptz) returns jsonb language sql as $$select '{"services":[]}'::jsonb$$;

 `);
 await db.exec(fs.readFileSync('migrations/20261023180907_driver_history_completed_payroll_v2.sql','utf8'));
 await db.exec(sql);
 const ctx={window:{}};vm.runInNewContext(fs.readFileSync('payroll-matrix.js','utf8'),ctx);matrix=ctx.window.PayrollMatrix;
});
after(async()=>db?.close());
beforeEach(async()=>{await db.exec('truncate operator_services,operator_service_assignments,operator_service_items,remitos,remito_excess_reports,operator_service_excess_charges,service_toggle_marks,service_concepts,company_service_settings,payroll_commission_rules,payroll_commission_assignments;');await db.query("select set_config('test.uid',$1,false),set_config('test.role','administracion',false)",[driver]);});
async function service(extra={}){const row={service_id:crypto.randomUUID(),status:'completed',completed_at:'2026-10-24T15:00Z',assigned_driver_id:driver,...extra};const keys=Object.keys(row);await db.query(`insert into operator_services(${keys}) values(${keys.map((_,i)=>'$'+(i+1))})`,Object.values(row));return row.service_id;}
async function report(sid,amount=100000){await db.query("insert into remitos(remito_id,operator_service_id,driver_id,status,firmado_at) values(1,$1,$2,'firmado','2026-10-24T15:00Z')",[sid,driver]);await db.query("insert into remito_excess_reports(remito_id,concept_id,quantity,total_amount,customer_payment_method) values(1,$1,1,$2,'cash')",[battery,amount]);}
async function excess(sid,{source='actual',amount=100000,method='cash',collector='company'}={}){await db.query("insert into operator_service_excess_charges(service_id,source,concept_id,quantity,total_amount,currency,payer_agent,collector_agent,customer_payment_method) values($1,$2,$3,1,$4,'ARS','customer',$5,$6)",[sid,source,battery,amount,collector,method]);}
async function item(sid,amount=100000){await db.query("insert into operator_service_items values($1,$2,'secondary',1,$3)",[sid,battery,amount]);}
async function sources(id=driver,from='2026-10-01',until='2026-11-01'){return (await db.query('select get_payroll_matrix_sources_v3($1,$2,$3) as d',[id,from,until])).rows[0].d;}
function commission(data){return matrix.calculate({commissions:[{concept_id:battery,source:'extras',mode:'percent',value:10}]},data,0).commission;}
test('venta agregada como servicio adicional paga al chofer responsable aunque la cargue el operador',async()=>{const sid=await service();await item(sid);const s=await sources();assert.equal(commission(s),10000);assert.equal(s.extras[0].driver_id,driver);assert.equal(commission(await sources(other)),0);});
test('con remito firmado usa la corrección administrativa, no el importe original ni el duplicado tarifado',async()=>{const sid=await service();await report(sid);await item(sid);await excess(sid);await db.query("update operator_services set administrative_commercial=$2 where service_id=$1",[sid,JSON.stringify({customer_payment:{primary:'cash'},excess_charges:[{concept_id:battery,quantity:1,total_amount:150000,payer_agent:'customer'}]})]);const s=await sources();assert.equal(s.extras.length,1);assert.equal(commission(s),15000);});
test('excluir todos los cargos del remito no vuelve a comisionarlos desde los items',async()=>{const sid=await service({administrative_commercial:{excess_charges:[]}});await report(sid);await item(sid);assert.equal(commission(await sources()),0);});
test('aprobados reales prevalecen sobre lo informado; un rechazo no resucita desde el remito',async()=>{const sid=await service({document_status:'approved'});await report(sid);assert.equal(commission(await sources()),0);await excess(sid,{amount:80000});assert.equal(commission(await sources()),8000);});
test('operador sin remito y ventas aún no cobradas: solo se comisionan las cobradas',async()=>{const sid=await service();await excess(sid,{source:'planned',method:'not_collected'});assert.equal(commission(await sources()),0);await db.exec("update operator_service_excess_charges set customer_payment_method='transfer'");assert.equal(commission(await sources()),10000);});
test('venta en remito e item se paga una vez; un remito tardío no paga de nuevo otro mes',async()=>{const sid=await service();await report(sid);await item(sid);const current=await sources();assert.equal(current.extras.length,1);assert.equal(commission(current),10000);await db.exec("update remitos set firmado_at='2026-11-02'");assert.equal(commission(await sources()),10000);assert.equal(commission(await sources(driver,'2026-11-01','2026-12-01')),0);});
test('cantidades reales de varias ventas del mismo concepto se suman sin duplicar el item',async()=>{const sid=await service();await excess(sid);await excess(sid);await item(sid);const s=await sources();assert.equal(s.extras.length,1);assert.equal(s.extras[0].quantity,2);assert.equal(commission(s),20000);});
test('anulados, tercerizados, sin chofer y servicios pendientes no generan comisión nueva',async()=>{for(const x of [{status:'cancelled'},{status:'assigned'},{logistics_type:'third_party'},{assigned_driver_id:null}])await item(await service(x));assert.equal(commission(await sources()),0);});
test('chofer firmante prevalece sobre una asignación vieja; la última asignación resuelve servicios sin remito',async()=>{const sid=await service({assigned_driver_id:other});await report(sid);await item(sid);assert.equal(commission(await sources()),10000);assert.equal(commission(await sources(other)),0);const next=await service({assigned_driver_id:null});await db.query("insert into operator_service_assignments(service_id,driver_id,assigned_at) values($1,$2,'2026-10-23')",[next,driver]);await item(next);assert.equal(commission(await sources()),20000);});
test('RPC de sueldos y resumen conservan permisos y validan período',async()=>{await db.exec("select set_config('test.role','operador',false)");await assert.rejects(sources(),/No autorizado/);await db.exec("select set_config('test.role','chofer',false)");await assert.rejects(db.query('select get_driver_payroll_estimate_v3(202610,$1)',[other]),/Sin permiso/);await db.exec("select set_config('test.role','administracion',false)");await assert.rejects(sources(driver,'2026-10-01','2027-01-01'),/Período inválido/);const r=(await db.query("select has_function_privilege('anon','get_payroll_matrix_sources_v3(uuid,date,date)','execute') p")).rows[0];assert.equal(r.p,false);});

test('catálogo incluye excedentes fijos y ventas habilitadas sin exigir tarifa; no expone valores salariales',async()=>{
 const company=crypto.randomUUID(),rule=crypto.randomUUID();
 await db.query("insert into service_concepts(concept_id,name,code,input_mode,default_pricing_unit) values($1,'Venta batería','battery_1250','quantity','unit'),($2,'Hora Espera','excess_wait_hour','quantity','hour')",[battery,crypto.randomUUID()]);
 await db.query('insert into company_service_settings values($1,$2,true)',[company,battery]);
 await db.query("insert into payroll_commission_rules values($1,$2,true,'extras')",[rule,battery]);
 await db.query('insert into payroll_commission_assignments values($1,$2)',[rule,driver]);
 await db.exec("select set_config('test.role','operador',false)");
 const result=(await db.query("select get_operator_service_form_context_v2($1,now()) d",[company])).rows[0].d;
 assert.equal(result.excess_concepts.length,2);assert.equal(result.commission_assignments[0].driver_id,driver);assert.deepEqual(Object.keys(result.commission_assignments[0]).sort(),['concept_id','driver_id']);
 await db.exec("select set_config('test.uid','',false)");await assert.rejects(db.query('select get_operator_service_form_context_v2($1,now())',[company]),/No autorizado/);
});

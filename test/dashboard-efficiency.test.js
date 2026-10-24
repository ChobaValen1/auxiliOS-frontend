const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
let db,model;
before(async()=>{
 const context={console,setTimeout,clearTimeout,queueMicrotask,performance};vm.runInNewContext(fs.readFileSync('ui/motion/efficiency-v1.js','utf8'),context);model=context.AuxEfficiency;
 db=new PGlite();
 await db.exec(`create schema app_private;create schema auth;create role anon;create role authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function app_private.current_auxilios_role() returns text language sql as $$select current_setting('test.role',true)$$;
 create table trucks(truck_id int primary key,is_test boolean);
 create table daily_logs(log_date date,truck_id int,status text,km_inicio int,km_final int,driver_id uuid);
 create table operator_services(service_id uuid,status text,is_test boolean,logistics_type text,scheduled_for timestamptz,
 estimated_asphalt_km numeric,estimated_gravel_km numeric,estimated_distance_km numeric,company_id uuid,billing_base_id uuid,primary_concept_id uuid,remito_id int);
 create table remitos(remito_id int,status text,created_at_device timestamptz,driver_id uuid);`);
 await db.exec(fs.readFileSync('migrations/20261023232645_dashboard_efficiency_v1.sql','utf8'));
 await db.exec(fs.readFileSync('migrations/20261023233958_dashboard_efficiency_role_schema_fix.sql','utf8'));
});
after(()=>db?.close());
beforeEach(async()=>{
 await db.exec(`truncate trucks,daily_logs,operator_services,remitos;
 insert into trucks values(1,false),(2,true);
 insert into daily_logs values('2026-10-22',1,'closed',100,200,null),('2026-10-21',1,'closed',0,100,null),('2026-10-22',2,'closed',0,9999,null);
 insert into operator_services(status,is_test,logistics_type,scheduled_for,estimated_distance_km) values
 ('completed',false,'own','2026-10-22 15:00Z',150),('completed',false,'own','2026-10-21 15:00Z',100),
 ('completed',false,'third_party','2026-10-22 15:00Z',500),('assigned',false,'own','2026-10-22 15:00Z',900),('completed',true,'own','2026-10-22 15:00Z',900);`);
});
async function data(extra='null,null,null',end='2026-10-22'){
 return (await db.query(`select app_private.dashboard_efficiency_core_v1('2026-10-22','${end}',${extra},'2026-10-22') v`)).rows[0].v;
}
test('own fleet only; no cap at 100; equal-length previous period; no future zeroes',async()=>{
 const d=await data(undefined,'2026-10-31');assert.equal(d.actual.facturados,150);assert.equal(d.actual.odometro,100);assert.equal(d.actual.filas.length,1);assert.equal(d.anterior.facturados,100);assert.equal(model.ratio(d,d.actual),150);assert.equal(model.ratio(d,d.anterior),100);
});
test('open/invalid closures are null not zero; cumulative never bridges missing data',async()=>{
 await db.exec("insert into daily_logs values('2026-10-22',1,'open',200,null,null)");
 const d=await data();assert.equal(d.actual.odometro,null);assert.equal(d.actual.cierres_faltantes,1);assert.equal(model.ratio(d,d.actual),null);
 const rows=[{dia:'1',facturados:1,odometro:2},{dia:'2',facturados:2,odometro:null},{dia:'3',facturados:3,odometro:4}];
 assert.deepEqual(Array.from(model.series(rows,true),r=>r.odometro),[2,null,null]);assert.deepEqual(Array.from(model.series(rows,false),r=>r.odometro),[2,null,4]);
 assert.equal(model.path(rows,'odometro',i=>i,v=>v),'M0.00,2.00  M2.00,4.00');
});
test('filtered billed scope never divides by whole-fleet odometer',async()=>{
 const d=await data("array['11111111-1111-4111-8111-111111111111']::uuid[],null,null");
 assert.equal(d.filtrado,true);assert.equal(d.actual.odometro,100);assert.equal(model.ratio(d,d.actual),null);assert.match(model.reason(d,d.actual),/toda la flota/);
});
test('missing billing km and unlinked signed remitos invalidate comparison',async()=>{
 await db.exec("update operator_services set estimated_distance_km=null where logistics_type='own' and not is_test and status='completed'");
 let d=await data();assert.equal(d.actual.facturados,null);assert.equal(model.ratio(d,d.actual),null);
 await db.exec("insert into remitos values(1,'firmado','2026-10-21 15:00Z',null)");d=await data();assert.equal(d.anterior.remitos_sin_servicio,1);assert.equal(model.ratio(d,d.anterior),null);
});
test('zero is valid numerator; zero denominator is unavailable; scales include both series',()=>{
 const p={filas:[{}],facturados:0,odometro:100,cierres_faltantes:0,servicios_sin_km:0,remitos_sin_servicio:0};const d={filtrado:false};assert.equal(model.ratio(d,p),0);assert.equal(model.ratio(d,{...p,odometro:0}),null);assert.ok(model.scaleTop([{facturados:150,odometro:900}])>=900);
});
test('smooth curves and cursor share bounded geometry and never bridge missing values',()=>{
 const rows=[{facturados:10},{facturados:90},{facturados:null},{facturados:20}];
 assert.equal(model.curveValue(rows,'facturados',.5),50);
 for(let p=0;p<=1;p+=.01)assert.ok(model.curveValue(rows,'facturados',p)>=10&&model.curveValue(rows,'facturados',p)<=90);
 assert.equal(model.curveValue(rows,'facturados',1.5),null);
 const p=model.curvePath(rows,'facturados',i=>i*30,v=>v);
 assert.match(p,/C/);assert.equal((p.match(/M/g)||[]).length,2);
});
test('percentage follows day/cumulative selection and returns to full-period ratio',()=>{
 const row=(f,o,extra={})=>({facturados:f,odometro:o,cierres_faltantes:0,servicios_sin_km:0,jornadas:1,...extra});
 const data={filtrado:false,actual:{filas:[row(50,100),row(150,100)],facturados:200,odometro:200,cierres_faltantes:0,servicios_sin_km:0,remitos_sin_servicio:0}};
 assert.equal(model.selectionRatio(data,null,false),100);
 assert.equal(model.selectionRatio(data,0,false),50);
 assert.equal(model.selectionRatio(data,1,false),150);
 assert.equal(model.selectionRatio(data,1,true),100);
 assert.equal(model.selectionRatio({...data,filtrado:true},1,false),null);
 data.actual.filas[0]=row(50,null,{cierres_faltantes:1});
 assert.equal(model.selectionRatio(data,0,false),null);
 assert.equal(model.selectionRatio(data,1,true),null);
 assert.equal(model.selectionRatio(data,1,false),150);
 data.actual.filas[1]=row(150,100,{remitos_sin_servicio:1});assert.equal(model.selectionRatio(data,1,false),null);
});
test('operational ratio uses matched closed days and labels unlinked remitos as partial',()=>{
 const day=(f,o,extra={})=>({dia:'2026-10-01',facturados:f,odometro:o,jornadas:1,cierres_faltantes:0,servicios_sin_km:0,remitos_sin_servicio:0,...extra});
 const d={filtrado:false,actual:{filas:[day(100,200,{remitos_sin_servicio:5}),day(9000,null,{cierres_faltantes:1})],facturados:9100,odometro:null,remitos_sin_servicio:5}};
 const s=model.efficiencySummary(d,null,false);
 assert.equal(s.facturados,100);assert.equal(s.odometro,200);assert.equal(s.porcentaje,50);assert.equal(s.excluded,1);assert.equal(s.partial,true);
 assert.equal(model.efficiencySummary(d,0,false).porcentaje,50);
 assert.equal(model.efficiencySummary(d,1,false).porcentaje,null);
 assert.equal(model.efficiencySummary(d,1,true).porcentaje,50);
 assert.equal(model.efficiencySummary({...d,filtrado:true},null,false).porcentaje,null);
 d.actual.filas.push(day(200,100));const series=model.comparableSeries(d.actual.filas,true);
 assert.deepEqual(Array.from(series,r=>r.facturados),[100,null,300]);assert.deepEqual(Array.from(series,r=>r.odometro),[200,null,300]);
 assert.equal(model.efficiencySummary(d,2,true).porcentaje,100);
 d.actual.filas=[day(0,200)];assert.equal(model.efficiencySummary(d,null,false).porcentaje,0);
 d.actual.filas=[day(100,0)];assert.equal(model.efficiencySummary(d,null,false).porcentaje,null);
 d.actual.filas=[day(100,null)];assert.equal(model.efficiencySummary(d,null,false).odometro,null);
});
test('public API requires login and permitted role; bounded ranges; no write statements',async()=>{
 assert.equal((await db.query("select to_regprocedure('public.current_auxilios_role()') absent")).rows[0].absent,null);
 await assert.rejects(db.query('select public.dashboard_efficiency_v1()'),/No autorizado/);
 await db.exec("select set_config('test.uid','11111111-1111-4111-8111-111111111111',false),set_config('test.role','chofer',false)");await assert.rejects(db.query('select public.dashboard_efficiency_v1()'),/No autorizado/);
 await db.exec("select set_config('test.role','administracion',false)");assert.ok((await db.query("select public.dashboard_efficiency_v1('2026-10-22','2026-10-22') v")).rows[0].v);
 await assert.rejects(db.query("select app_private.dashboard_efficiency_core_v1('2020-01-01','2026-10-22',null,null,null,'2026-10-22')"),/731 días/);
 assert.doesNotMatch(fs.readFileSync('migrations/20261023232645_dashboard_efficiency_v1.sql','utf8'),/\b(insert into|update public|delete from)\b/i);
});

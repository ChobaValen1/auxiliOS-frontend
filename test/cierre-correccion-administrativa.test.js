const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync('migrations/20261117120000_cierre_toma_correccion_administrativa_v1.sql','utf8');
const helper=sql.slice(0,sql.indexOf('-- v6 llama a v5'));

/* Servicio 20261116304638: el chofer informó 2 pasadas por Hudson y la corrección las agrupó en «Peaje ×2».
   El cierre exige una decisión por pasada: el payload armado en el servidor tiene que cubrirlas a las dos. */
test('cierre: arma una decisión por pasada desde la corrección administrativa',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create schema app_private;
 create table operator_services(service_id uuid primary key,remito_id integer,administrative_commercial jsonb);
 create table remito_toll_reports(toll_report_id uuid,remito_id integer,quantity numeric,payment_method text);
 create table remito_excess_reports(excess_report_id uuid,remito_id integer);
 ${helper}
 insert into remito_toll_reports values('aaaaaaaa-0000-4000-8000-000000000001',1,1,'manual'),('aaaaaaaa-0000-4000-8000-000000000002',1,1,'manual'),('aaaaaaaa-0000-4000-8000-000000000003',1,1,'cash');
 insert into remito_excess_reports values('bbbbbbbb-0000-4000-8000-000000000001',1);
 insert into operator_services values('11111111-1111-4111-8111-111111111111',1,'{"tolls":[
   {"toll_report_id":"aaaaaaaa-0000-4000-8000-000000000001","extra_report_ids":["aaaaaaaa-0000-4000-8000-000000000002"],"toll_id":"cccccccc-0000-4000-8000-000000000001","toll_name":"Peaje Hudson","quantity":2,"unit_amount":19600,"payer_agent":"customer","customer_payment_method":"transfer"},
   {"review_line_client_id":"dddddddd-0000-4000-8000-000000000001","toll_name":"Manual","quantity":1,"unit_amount":500,"payer_agent":"customer","customer_payment_method":"transfer"}],
  "excess_charges":[]}'),('22222222-2222-4222-8222-222222222222',1,null);`);
 const payload=(await db.query("select app_private.operator_service_review_payload_from_admin_v1('11111111-1111-4111-8111-111111111111') p")).rows[0].p;
 const byReport=id=>payload.tolls.find(r=>r.toll_report_id===id);
 const a=byReport('aaaaaaaa-0000-4000-8000-000000000001'),b=byReport('aaaaaaaa-0000-4000-8000-000000000002');
 assert.equal(a.decision,'accepted');assert.equal(b.decision,'accepted');
 assert.equal(a.quantity+b.quantity,2,'el total de pasadas es el de la fila ×2');
 assert.equal(a.unit_amount,19600);assert.equal(b.payer_agent,'customer');assert.equal(b.customer_payment_method,'transfer');
 const manual=payload.tolls.find(r=>r.review_line_client_id==='dddddddd-0000-4000-8000-000000000001');
 assert.equal(manual.decision,'adjusted');
 const excluded=byReport('aaaaaaaa-0000-4000-8000-000000000003');
 assert.equal(excluded.decision,'rejected');assert.ok(excluded.reason);
 assert.equal(payload.excesses.length,1);assert.equal(payload.excesses[0].decision,'rejected');assert.ok(payload.excesses[0].review_reason);
 const none=(await db.query("select app_private.operator_service_review_payload_from_admin_v1('22222222-2222-4222-8222-222222222222') p")).rows[0].p;
 assert.equal(none,null,'sin corrección administrativa se usa lo que manda la pantalla');
});

test('cierre: v6 usa el payload del servidor y conserva la revisión de la pantalla',()=>{
 assert.match(sql,/coalesce\(\s*app_private\.operator_service_review_payload_from_admin_v1\(p_service_id\)\s*\|\| jsonb_build_object\('administrative_revision',p_payload->'administrative_revision'\),\s*p_payload\)/);
 assert.match(sql,/if n <> 1 then raise exception 'review v6: llamada a v5 no encontrada'/);
});

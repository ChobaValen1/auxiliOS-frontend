const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync('migrations/20260908125223_administrative_service_corrections_v1.sql','utf8');
test('administrative RPC: protects signed customer, keeps original, rejects stale edits and never finalizes',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(fs.readFileSync('test/fixtures/driver-handoff-schema.sql','utf8'));
 await db.exec(fs.readFileSync('test/fixtures/driver-handoff-dependencies.sql','utf8'));
 await db.exec("set check_function_bodies=false;"+sql);
 // The pricing engine is outside this contract test; live rollback fixtures cover its real implementation.
 await db.exec(`create or replace function app_private.update_operator_service_administrative_core_v1(p_service_id uuid,p_payload jsonb,p_reason text default null) returns jsonb language plpgsql as $$
 begin update public.operator_services set service_order_number=coalesce(p_payload->>'service_order_number',service_order_number),origin=coalesce(p_payload->>'origin',origin) where service_id=p_service_id;return jsonb_build_object('service_id',p_service_id);end; $$;
 create table operator_service_changes(change_id uuid default gen_random_uuid(),service_id uuid,service_status text,trip_id integer,remito_id integer,changed_fields text[],before_values jsonb,after_values jsonb,changed_by uuid,is_test boolean,changed_at timestamptz default now());
 create table toll_locations(toll_id uuid,name text,is_active boolean);
 create table remito_toll_reports(toll_report_id uuid,remito_id integer,toll_id uuid,customer_payment_method text,total_amount numeric);
 create table remito_excess_reports(excess_report_id uuid,remito_id integer,customer_payment_method text,total_amount numeric);
 create table service_concepts(concept_id uuid,name text,is_active boolean,service_category text,billing_family text);
 create table company_service_settings(company_id uuid,concept_id uuid,is_enabled boolean);
 insert into remitos(remito_id,nro_servicio,status,razon_social,firma_imagen_url,firmado_at) values(1,'ORIGINAL','firmado','Socio','original.png',now());
 insert into operator_services(service_id,remito_id,status,document_status,service_order_number) values('11111111-1111-4111-8111-111111111111',1,'at_origin','submitted','ORIGINAL');
 insert into toll_locations values('22222222-2222-4222-8222-222222222222','Peaje QA',true);
 insert into remito_toll_reports values('33333333-3333-4333-8333-333333333333',1,'22222222-2222-4222-8222-222222222222','cash',3000);
 select set_config('test.uid','44444444-4444-4444-8444-444444444444',false),set_config('test.role','operador',false);`);
 const save=p=>db.query("select update_operator_service_v4('11111111-1111-4111-8111-111111111111',$1::jsonb)",[JSON.stringify(p)]);
 const commercial={toll_coverage_mode:'provider_roundtrip',tolls:[{toll_report_id:'33333333-3333-4333-8333-333333333333',toll_id:'22222222-2222-4222-8222-222222222222',quantity:2,unit_amount:4000,payer_agent:'provider',customer_payment_method:'card'}],excess_charges:[]};
 await assert.rejects(save({administrative_revision:0,customer_name:'Changed'}),/Campo protegido/);
 await assert.rejects(save({administrative_revision:0,service_order_number:'BAD',administrative_commercial:{...commercial,tolls:[{...commercial.tolls[0],unit_amount:-1}]}}),/positivos/);
 await save({administrative_revision:0,service_order_number:'CORREGIDO',administrative_commercial:commercial});
 const service=(await db.query('select * from operator_services')).rows[0],r=(await db.query('select * from remitos')).rows[0];
 assert.equal(service.service_order_number,'CORREGIDO');assert.equal(service.status,'at_origin');assert.equal(service.document_status,'submitted');assert.equal(service.administrative_revision,1);
 assert.equal(service.administrative_commercial.tolls[0].customer_payment_method,'cash');
 assert.equal(service.administrative_commercial.tolls[0].reported_total_amount,3000);
 assert.equal(service.administrative_commercial.tolls[0].total_amount,8000);
 assert.equal(r.nro_servicio,'ORIGINAL');assert.equal(r.razon_social,'Socio');assert.equal(r.firma_imagen_url,'original.png');
 assert.equal((await db.query('select count(*)::int n from operator_service_changes')).rows[0].n,1);
 await assert.rejects(save({administrative_revision:0,service_order_number:'STALE'}),/cambió/);
 await db.exec("select set_config('test.role','chofer',false)");
 await assert.rejects(save({administrative_revision:1,service_order_number:'ATTACK'}),/Sin permiso/);
});
test('administrative pricing core never rewrites a signed remito',()=>{
 const core=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION app_private.update_operator_service_administrative_core_v1'),sql.indexOf('revoke all on function app_private.update_operator_service_administrative_core_v1'));
 assert.match(core,/v_remito_locked:=coalesce\(v_remito_status in/);
 assert.match(core,/if v_service.remito_id is not null and not v_remito_locked then update public.remitos/);
 assert.doesNotMatch(core,/if v_remito_locked and v_structural_changed then/);
});

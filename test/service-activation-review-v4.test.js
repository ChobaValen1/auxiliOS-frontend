const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync('supabase/migrations/20260923155544_service_activation_review_v4.sql','utf8');
const driver='10000000-0000-4000-8000-000000000001',operator='10000000-0000-4000-8000-000000000002',service='20000000-0000-4000-8000-000000000001';
const functions=[...migration.matchAll(/create or replace function[\s\S]*?\bas (\$[a-z_]*\$)[\s\S]*?\1\s*;/gi)].map(m=>m[0]);
async function setup(t){
 const db=new PGlite();t.after(()=>db.close());await db.exec(fs.readFileSync('test/fixtures/driver-handoff-schema.sql','utf8'));
 await db.exec(`alter table operator_services add primary key(service_id),add column driver_activated boolean default false,add column activation_driver_id uuid,add column activation_truck_id integer,add column activated_at timestamptz,add column activated_by uuid,add column activation_billing text,add column activation_billing_reason text,add column activation_reviewed_by uuid,add column activation_reviewed_at timestamptz;
 create table operator_service_assignments(service_id uuid,assignment_sequence integer,driver_id uuid,truck_id integer,assigned_by uuid,assigned_at timestamptz,trip_id integer,started_at timestamptz,status text,is_test boolean,released_at timestamptz,released_by uuid,release_reason_code text,release_notes text,updated_at timestamptz);
 create table users(user_id uuid,is_test boolean default false);create table trucks(truck_id integer,is_test boolean default false);
 insert into service_module_settings(settings_key,field_modes) values('default','{"assigned_resources":"required"}');`);
 for(const name of ['app_private.operator_services_before_update','app_private.operator_service_missing_required_v2','public.transition_operator_service_v2','public.mark_operator_service_activated_v4','public.mark_driver_operator_service_activated_v3','public.finalize_activated_service_v1']){const found=functions.find(s=>s.toLowerCase().startsWith('create or replace function '+name.toLowerCase()+'('));assert.ok(found,name);await db.exec(found);}
 await db.exec(fs.readFileSync('test/fixtures/service-activation-dependencies.sql','utf8'));
 await db.exec('create trigger lifecycle before update on operator_services for each row execute function app_private.operator_services_before_update();create trigger assignment after insert or update on operator_services for each row execute function app_private.sync_operator_service_assignment();');
 await db.query("select set_config('test.uid',$1,false),set_config('test.role','operador',false)",[operator]);
 await db.query("insert into trips(trip_id,driver_id,fecha_hora_inicio) values(1,$1,now())",[driver]);
 await db.query("insert into operator_services(service_id,status,assigned_driver_id,assigned_truck_id,trip_id,company_id,billing_base_id,primary_concept_id,service_order_number,origin,destination,operator_notes) values($1,'assigned',$2,1,1,$1,$1,$1,'TEST','Origen','Destino','Cierre verificado')",[service,driver]);
 await db.exec(fs.readFileSync('test/fixtures/document-billing-guard.sql','utf8'));
 return db;
}
const activate=db=>db.query("select mark_operator_service_activated_v4($1,'provider',null) as result",[service]);
test('vinculación del activado rechaza otro chofer, otro documento o un documento firmado',async t=>{
 const db=await setup(t);await activate(db);
 await db.query('update operator_services set remito_id=77 where service_id=$1',[service]);
 await db.exec(fs.readFileSync('supabase/migrations/20260925021039_activated_intake_remito_link_fix.sql','utf8'));
 await db.exec('create trigger remito_link before insert or update on remitos for each row execute function app_private.normalize_operator_service_remito_v3();');
 const link=(id,who,status)=>db.query('insert into remitos(remito_id,operator_service_id,driver_id,status) values($1,$2,$3,$4)',[id,service,who,status]);
 await assert.rejects(link(77,operator,'anulado'),/no corresponde a la salida activada/);
 await assert.rejects(link(78,driver,'anulado'),/no corresponde a la salida activada/);
 await assert.rejects(link(77,driver,'firmado'),/no corresponde a la salida activada/);
 await link(77,driver,'anulado');
});
test('activar libera los recursos y el viaje, preserva responsables y es idempotente',async t=>{
 const db=await setup(t);await db.query("select set_config('test.uid',$1,false),set_config('test.role','chofer',false)",[driver]);await activate(db);await activate(db);
 const s=(await db.query('select * from operator_services')).rows[0];assert.equal(s.status,'at_origin');assert.equal(s.assigned_driver_id,null);assert.equal(s.assigned_truck_id,null);assert.equal(s.activation_driver_id,driver);assert.equal(s.activation_truck_id,1);assert.equal(s.activation_billing,null);
 assert.ok((await db.query('select fecha_hora_fin from trips')).rows[0].fecha_hora_fin);assert.equal((await db.query('select status from operator_service_assignments')).rows[0].status,'released');assert.equal((await db.query("select count(*)::int n from operator_service_events where event_type='service_activated'")).rows[0].n,1);
});
test('solo Operador o Administración cierra, con decisión explícita y motivo al no facturar',async t=>{
 const db=await setup(t);await activate(db);await assert.rejects(db.query('select finalize_activated_service_v1($1,null,null)',[service]),/Elegí Facturable/);await assert.rejects(db.query('select finalize_activated_service_v1($1,false,null)',[service]),/motivo/);
 await db.exec("select set_config('test.role','chofer',false)");await assert.rejects(db.query("select finalize_activated_service_v1($1,true,null)",[service]),/Solo Operador/);await db.exec("select set_config('test.role','operador',false)");
 await db.query("select finalize_activated_service_v1($1,false,'Convenio sin cargo')",[service]);const s=(await db.query('select * from operator_services')).rows[0];assert.equal(s.status,'completed');assert.equal(s.billing_status,'excluded');assert.equal(s.activation_driver_id,driver);assert.equal(s.activation_billing,'non_billable');assert.equal(s.activation_billing_reason,'Convenio sin cargo');
});
test('un activado facturable finaliza y habilita Facturación sin remito firmado',async t=>{
 const db=await setup(t);await activate(db);await db.query('select finalize_activated_service_v1($1,true,null)',[service]);const s=(await db.query('select * from operator_services')).rows[0];assert.equal(s.status,'completed');assert.equal(s.billing_status,'pending');assert.equal(s.document_status,'exception_approved');assert.equal(s.activation_driver_id,driver);
});
test('los caminos de cierre anteriores no eluden la decisión de facturación',async t=>{
 const db=await setup(t);await activate(db);await assert.rejects(db.query("select transition_operator_service_v2($1,'finalize',null,null)",[service]),/Elegí si el activado/);assert.equal((await db.query('select status from operator_services')).rows[0].status,'at_origin');
});
test('desarribar conserva la pareja y un remito firmado bloquea reversión y activación',async t=>{
 const db=await setup(t);await db.query("select transition_operator_service_v2($1,'arrive_manual','operator_provider_confirmed',null)",[service]);await db.query("select transition_operator_service_v2($1,'unarrive',null,null)",[service]);let s=(await db.query('select * from operator_services')).rows[0];assert.equal(s.status,'assigned');assert.equal(s.assigned_driver_id,driver);assert.equal(s.arrived_at,null);
 await db.query("insert into remitos(remito_id,operator_service_id,status,firmado_at) values(1,$1,'firmado',now())",[service]);await db.exec('update operator_services set remito_id=1');await assert.rejects(activate(db),/remito firmado/);await assert.rejects(db.query("select transition_operator_service_v2($1,'unassign',null,null)",[service]),/remito firmado/);
});
test('un activado sin servicio queda visible y se crea y finaliza una sola vez, conservando chofer y móvil',async t=>{
 const db=await setup(t),intake='30000000-0000-4000-8000-000000000001';
 await db.exec("alter table driver_service_intakes add column driver_activated boolean default false,add column activation_reason_code text,add column activation_reason_detail text;");
 for(const name of ['public.mark_driver_ad_hoc_draft_activated_v1','public.create_finalize_activated_intake_v1'])await db.exec(functions.find(s=>s.toLowerCase().startsWith('create or replace function '+name+'(')));
 // Pricing is outside this contract test; service creation still participates in the same transaction.
 await db.exec(`create function app_private.driver_intake_service_seed_v1(i jsonb,r jsonb) returns jsonb language sql as $$select jsonb_build_object('origin',i->>'origin','destination',i->>'destination','assigned_driver_id',i->>'driver_id','assigned_truck_id',i->'truck_id')$$;
 create function public.create_operator_service_v4(p jsonb) returns jsonb language plpgsql as $$declare sid uuid;begin insert into public.operator_services(company_id,billing_base_id,primary_concept_id,service_order_number,origin,destination) values((p->>'company_id')::uuid,(p->>'billing_base_id')::uuid,(p->>'primary_concept_id')::uuid,p->>'service_order_number',p->>'origin',p->>'destination') returning service_id into sid;return jsonb_build_object('service_id',sid);end$$;`);
 await db.query("insert into driver_service_intakes(intake_id,driver_id,truck_id,trip_id,remito_id,origin,destination) values($1,$2,1,1,2,'Origen','Destino')",[intake,driver]);
 await db.query("insert into remitos(remito_id,driver_id,driver_intake_id,status,document_source) values(2,$1,$2,'pendiente','driver_ad_hoc')",[driver,intake]);
 await db.query("select set_config('test.uid',$1,false),set_config('test.role','chofer',false)",[driver]);
 await db.exec("select mark_driver_ad_hoc_draft_activated_v1(2,'provider',null)");
 let i=(await db.query('select * from driver_service_intakes')).rows[0];assert.equal(i.status,'pending_admin');assert.equal(i.driver_activated,true);
 await db.query("select set_config('test.uid',$1,false),set_config('test.role','operador',false)",[operator]);
 const payload={company_id:service,billing_base_id:service,primary_concept_id:service,service_order_number:'ADHOC'};
 const create=()=>db.query('select create_finalize_activated_intake_v1($1,$2,true,null) as result',[intake,JSON.stringify(payload)]);
 await db.exec(fs.readFileSync('test/fixtures/remito-link-trigger-before-activation-fix.sql','utf8'));
 await db.exec('create trigger remito_link before insert or update on remitos for each row execute function app_private.normalize_operator_service_remito_v3();');
 await assert.rejects(create(),/El remito no pertenece al chofer asignado/);
 assert.equal((await db.query('select linked_service_id from driver_service_intakes')).rows[0].linked_service_id,null);
 await db.exec(fs.readFileSync('supabase/migrations/20260925021039_activated_intake_remito_link_fix.sql','utf8'));
 const first=(await create()).rows[0].result,again=(await create()).rows[0].result;assert.equal(first.service_id,again.service_id);assert.equal(again.idempotent,true);
 const s=(await db.query('select * from operator_services where service_id=$1',[first.service_id])).rows[0];assert.equal(s.status,'completed');assert.equal(s.billing_status,'pending');assert.equal(s.activation_driver_id,driver);assert.equal(s.activation_truck_id,1);assert.equal(s.assigned_driver_id,null);assert.equal((await db.query('select status from remitos where remito_id=2')).rows[0].status,'anulado');
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync('migrations/20260906225703_driver_operator_complete_handoff_v1.sql','utf8');
const uid='10000000-0000-4000-8000-000000000001';
const operation='20000000-0000-4000-8000-000000000001';
const company='30000000-0000-4000-8000-000000000001';

async function setup(t){
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(fs.readFileSync('test/fixtures/driver-handoff-schema.sql','utf8'));
  await db.exec(fs.readFileSync('test/fixtures/driver-handoff-dependencies.sql','utf8'));
  await db.exec(migration);
  await db.exec("create trigger test_maps after update of linked_service_id on driver_service_intakes for each row execute function app_private.sync_driver_intake_maps_to_service();");
  await db.query("select set_config('test.uid',$1,false),set_config('test.role','chofer',false)",[uid]);
  await db.query('insert into daily_logs(driver_id,truck_id) values($1,1)',[uid]);
  await db.exec("insert into service_module_settings(settings_key,field_modes) values('default','{}')");
  return db;
}
const draft=()=>({nro_remito:'QA-REMITO-1',nro_servicio:'EXT-001',patente:'TEST123',tipo_servicio:'Remolque',
  razon_social:'Socio de prueba',cuit:'20123456789',telefono:'1155551111',status:'pendiente',maps_version:1,
  origen:'Origen verificado',destino:'Destino verificado',origin_formatted_address:'Origen verificado',
  destination_formatted_address:'Destino verificado',origin_place_id:'place-o',destination_place_id:'place-d',
  origin_lat:-34.6,origin_lng:-58.4,destination_lat:-34.7,destination_lng:-58.5,km_reales:18,
  tolls:[{toll_name:'Peaje QA',quantity:2,total_amount:5000,customer_payment_method:'cash'}],
  excesses:[{concept_name:'Espera',quantity:1,total_amount:8000,customer_payment_method:'not_collected'}],
  evidence:[]});
async function save(db,payload){
  return (await db.query('select public.save_driver_ad_hoc_remito_v3($1::jsonb,$2::uuid) as result',[JSON.stringify(payload),operation])).rows[0].result;
}
async function asOperator(db){await db.exec("select set_config('test.role','operador',false)");}

test('Postgres: draft number, phone, document and Maps survive save/reopen/sign/retry',async t=>{
  const db=await setup(t),p=draft();
  const first=await save(db,p);
  p.nro_servicio='EXT-002';await save(db,p);
  const {rows:[stored]}=await db.query('select r.nro_servicio,i.service_reference,t.nro_servicio as trip_reference,r.cuit,r.telefono,r.origin_place_id from remitos r join driver_service_intakes i on i.remito_id=r.remito_id join trips t on t.trip_id=i.trip_id');
  assert.equal(stored.nro_servicio,'EXT-002');assert.equal(stored.service_reference,'EXT-002');assert.equal(stored.trip_reference,'EXT-002');
  assert.equal(stored.cuit,p.cuit);assert.equal(stored.telefono,p.telefono);assert.equal(stored.origin_place_id,'place-o');
  await db.exec("update service_module_settings set field_modes='{\"customer_document\":\"hidden\",\"customer_phone\":\"hidden\"}'");
  delete p.cuit;delete p.telefono;p.status='firmado';p.firma_imagen_url='private/qa/signature.png';p.firmado_at=new Date().toISOString();
  await save(db,p);
  const replay=await save(db,{...p,origin_place_id:'tampered',origin_formatted_address:'Changed',nro_servicio:'Changed'});
  assert.equal(replay.idempotent,true);
  await asOperator(db);
  const ctx=(await db.query('select get_driver_service_intake_context_v1($1) as ctx',[first.intake_id])).rows[0].ctx;
  assert.equal(ctx.service.service_order_number,'EXT-002');assert.equal(ctx.service.origin_place_id,'place-o');
  assert.equal(ctx.service.customer_document,'20123456789');assert.equal(ctx.service.customer_phone,'1155551111');
  assert.equal(ctx.addons.tolls[0].quantity,2);assert.equal(ctx.addons.excesses[0].customer_payment_method,'not_collected');
});

test('Postgres: required fields block signature, not a partial draft',async t=>{
  const db=await setup(t),p=draft();delete p.cuit;delete p.telefono;
  await db.exec("update service_module_settings set field_modes='{\"customer_document\":\"required\",\"customer_phone\":\"required\"}'");
  await save(db,p);
  await assert.rejects(save(db,{...p,status:'firmado',firma_imagen_url:'private/qa.png',firmado_at:new Date().toISOString()}),/DNI\/CUIT/);
  assert.equal((await db.query('select status from remitos')).rows[0].status,'pendiente');
});

test('Postgres: create/link rolls back completely, retries once and uses signed authoritative data',async t=>{
  const db=await setup(t),p={...draft(),status:'firmado',firma_imagen_url:'private/qa.png',firmado_at:new Date().toISOString()};
  const saved=await save(db,p);await asOperator(db);
  const payload={company_id:company,customer_name:'Tampered',customer_document:'Tampered',origin_place_id:'Tampered',estimated_distance_km:42,
    commercial_addons:{tolls:[{toll_id:'reported-cannot-be-planned'}],excess_charges:[{concept_id:'reported-cannot-be-planned'}]}};
  const create=()=>db.query('select create_and_link_driver_service_intake_v1($1,$2) as result',[saved.intake_id,JSON.stringify(payload)]);
  await db.exec("select set_config('test.fail_link','on',false)");
  await assert.rejects(create(),/Simulated last-stage link failure/);
  assert.equal((await db.query('select count(*)::int as n from operator_services')).rows[0].n,0);
  assert.equal((await db.query('select status from driver_service_intakes')).rows[0].status,'pending_admin');
  assert.equal((await db.query('select operator_service_id from remitos')).rows[0].operator_service_id,null);
  await db.exec("select set_config('test.fail_link','off',false)");
  const result=(await create()).rows[0].result,replay=(await create()).rows[0].result;
  assert.equal(result.service_id,replay.service_id);assert.equal(replay.idempotent,true);
  const s=(await db.query('select * from operator_services')).rows[0];
  assert.equal(s.customer_name,p.razon_social);assert.equal(s.customer_document,p.cuit);assert.equal(s.origin_place_id,'place-o');
  assert.equal(Number(s.estimated_distance_km),42);assert.equal(s.document_status,'submitted');assert.equal(s.administrative_review_status,'pending');
  const ctx=(await db.query('select get_operator_service_handoff_context_v1($1) as ctx',[s.service_id])).rows[0].ctx;
  assert.equal(ctx.service.remito_id,saved.remito_id);assert.equal(ctx.service.reported_distance_km,18);
  assert.equal(ctx.reported_addons.tolls[0].total_amount,5000);assert.deepEqual(ctx.commercial_addons.tolls,[]);
  await assert.rejects(db.query('select update_operator_service_v3($1,$2)',[s.service_id,JSON.stringify({customer_document:'changed'})]),/no se pueden modificar/);
  assert.equal((await db.query('select count(*)::int as n from driver_service_intake_events where event_type=\'linked\'')).rows[0].n,1);
});

test('Postgres: missing role denied and public RPC privileges are not anonymous',async t=>{
  const db=await setup(t);
  await db.exec("select set_config('test.role','',false)");
  await assert.rejects(db.query('select get_driver_service_intake_context_v1($1)',[operation]),/Sin permiso/);
  await assert.rejects(db.query('select create_and_link_driver_service_intake_v1($1,$2)',[operation,'{}']),/Sólo/);
  const rows=(await db.query("select has_function_privilege('anon','public.create_and_link_driver_service_intake_v1(uuid,jsonb)','execute') as anon,has_function_privilege('authenticated','public.create_and_link_driver_service_intake_v1(uuid,jsonb)','execute') as auth")).rows;
  assert.equal(rows[0].anon,false);assert.equal(rows[0].auth,true);
});

test('Postgres: link keeps administrative conflicts, fills missing data and never replaces verified Maps',async t=>{
  const db=await setup(t),p={...draft(),status:'firmado',firma_imagen_url:'private/qa.png',firmado_at:new Date().toISOString()};
  const saved=await save(db,p);await asOperator(db);
  const existing=(await db.query("insert into operator_services(service_order_number,status,assigned_driver_id,assigned_truck_id,customer_name,customer_phone,origin,origin_place_id,origin_lat,origin_lng,destination,estimated_distance_km) values('ADMIN-1','assigned',$1,1,'Dato Operaciones','','Otra dirección','admin-map',-35,-59,'Destino verificado',75) returning service_id",[uid])).rows[0].service_id;
  await db.query('select link_driver_service_intake_v1($1,$2)',[saved.intake_id,existing]);
  const s=(await db.query('select * from operator_services')).rows[0];
  assert.equal(s.service_order_number,'ADMIN-1');assert.equal(s.customer_name,'Dato Operaciones');
  assert.equal(s.customer_phone,p.telefono);assert.equal(s.customer_document,p.cuit);
  assert.equal(s.origin,'Otra dirección');assert.equal(s.origin_place_id,'admin-map');
  assert.equal(s.destination_place_id,'place-d');assert.equal(Number(s.estimated_distance_km),75);
  const r=(await db.query('select * from remitos')).rows[0];
  assert.equal(r.razon_social,p.razon_social);assert.equal(r.origin_place_id,'place-o');assert.equal(r.nro_servicio,'EXT-001');
});

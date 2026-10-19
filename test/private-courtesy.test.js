const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
let db;
const migration=fs.readFileSync('migrations/20261017235104_particulares_sin_costo_v1.sql','utf8');
before(async()=>{
  db=new PGlite();
  const fixture=fs.readFileSync('test/fixtures/toll-times-schema.sql','utf8');
  await db.exec(fixture.split('\n').filter(l=>l.startsWith('create table public.operator_services ')||l.startsWith('create table public.remitos ')).join('\n'));
  await db.exec(`
    create schema auth; create schema app_private;
    create function auth.uid() returns uuid language sql as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
    create function app_private.current_auxilios_role() returns text language sql as $$ select coalesce(current_setting('test.role',true),'operador') $$;
    create function app_private.private_company_id_v1() returns uuid language sql as $$ select '22222222-2222-4222-8222-222222222222'::uuid $$;
    create function app_private.validate_private_customer_v1(jsonb) returns void language plpgsql as $$begin if coalesce($1->>'customer_name','')='' then raise exception 'Falta cliente'; end if; end$$;
    create sequence public.private_service_number_seq;
    create table public.roles(role_id uuid,name text); create table public.users(user_id uuid,role_id uuid);
    create table public.service_payments(service_id uuid,kind text,amount numeric,method text,received_by uuid,note text,voided_at timestamptz);
    create table public.driver_service_intakes(intake_id uuid,driver_activated boolean,remito_id integer,driver_id uuid);
    create table public.service_collection_reports(service_id uuid,remito_id integer,driver_id uuid,lines jsonb,collected_total numeric,not_collected boolean,reason text,status text,review_note text,reviewed_by uuid,reviewed_at timestamptz);
    create function public.create_operator_service_v4(jsonb) returns jsonb language plpgsql as $$declare id uuid:=gen_random_uuid(); begin insert into public.operator_services(service_id,status,billing_status,customer_name,customer_phone,pricing_snapshot) values(id,'assigned','pending',$1->>'customer_name','', '{}'); return jsonb_build_object('service_id',id); end$$;
    create function app_private.service_balance_v1(uuid) returns jsonb language sql as $$select jsonb_build_object('quoted_total',s.quoted_total,'paid',coalesce((select sum(amount) from public.service_payments where service_id=$1 and voided_at is null),0),'balance',greatest(s.quoted_total-coalesce((select sum(amount) from public.service_payments where service_id=$1 and voided_at is null),0),0)) from public.operator_services s where s.service_id=$1$$;
    create function public.create_and_link_driver_service_intake_v2(uuid,jsonb) returns jsonb language sql as $$select public.create_operator_service_v4($2)$$;
    create function public.get_operator_service_remito_review_v3(uuid) returns jsonb language sql as $$select '{"reported":{"tolls":[],"excesses":[]}}'::jsonb$$;
    create function public.resolve_operator_service_document_v6(uuid,text,jsonb) returns jsonb language plpgsql as $$begin update public.operator_services set status='completed' where service_id=$1; return '{}'::jsonb; end$$;
  `);
  await db.exec(migration);
});
after(async()=>db?.close());
const payload={customer_name:'Cliente de prueba',no_charge:true};
async function create(total=0,p=payload,deposit=null){return (await db.query('select public.create_private_service_v1($1::jsonb,$2::numeric,$3::jsonb) as result',[JSON.stringify(p),total,deposit&&JSON.stringify(deposit)])).rows[0].result;}
test('Sin costo requiere marca explícita y guarda total/saldo cero sin crear pagos',async()=>{
  const r=await create(); assert.equal(Number(r.balance),0); assert.equal(Number(r.quoted_total),0);
  const row=(await db.query('select pricing_snapshot from public.operator_services where service_id=$1',[r.service_id])).rows[0];
  assert.equal(row.pricing_snapshot.mode,'courtesy'); assert.equal(row.pricing_snapshot.no_charge,true);
  assert.equal((await db.query('select count(*)::int n from public.service_payments where service_id=$1',[r.service_id])).rows[0].n,0);
  const edit=(await db.query('select public.get_private_service_edit_v1($1) r',[r.service_id])).rows[0].r;
  assert.equal(edit.no_charge,true);
});
test('rechaza cero sin marca, negativos, no finitos, cortesía con importe o con depósito',async()=>{
  for(const [n,p,d] of [[0,{customer_name:'Normal'},null],[-1,payload,null],['NaN',payload,null],['Infinity',payload,null],[500,payload,null],[0,payload,{amount:10,method:'cash'}]]) await assert.rejects(create(n,p,d));
});
test('particular normal conserva precio, anticipo y saldo; no puede volverse gratis con cobros',async()=>{
  const r=await create(100000,{customer_name:'Normal',no_charge:false},{amount:20000,method:'transfer'});
  assert.equal(Number(r.balance),80000);
  await assert.rejects(db.query('select public.update_private_service_quote_v1($1,0,$2::jsonb)',[r.service_id,JSON.stringify({no_charge:true})]),/menor a lo ya cobrado/);
  assert.equal(Number((await db.query('select quoted_total from public.operator_services where service_id=$1',[r.service_id])).rows[0].quoted_total),100000);
});
test('sin cobros permite pasar a cortesía y volver a presupuesto, sin permitir facturados',async()=>{
  const r=await create(25000,{customer_name:'Normal'});
  await db.query('select public.update_private_service_quote_v1($1,0,$2::jsonb)',[r.service_id,JSON.stringify({no_charge:true})]);
  await db.query('select public.update_private_service_quote_v1($1,35000,$2::jsonb)',[r.service_id,JSON.stringify({no_charge:false})]);
  const row=(await db.query('select quoted_total,pricing_snapshot from public.operator_services where service_id=$1',[r.service_id])).rows[0];
  assert.equal(Number(row.quoted_total),35000); assert.equal(row.pricing_snapshot.no_charge,false);
  await db.query("update public.operator_services set billing_status='invoiced' where service_id=$1",[r.service_id]);
  await assert.rejects(db.query('select public.update_private_service_quote_v1($1,0,$2::jsonb)',[r.service_id,JSON.stringify({no_charge:true})]),/facturado/);
});
test('desde ingreso permite total cero sin simular cobro y rechaza cobros positivos',async()=>{
  const id='33333333-3333-4333-8333-333333333333';
  await db.query('insert into public.driver_service_intakes values($1,false,1,auth.uid())',[id]);
  const r=(await db.query('select public.create_private_service_from_intake_v1($1,$2::jsonb,0,$3::jsonb) r',[id,JSON.stringify(payload),JSON.stringify({lines:[]})])).rows[0].r;
  assert.equal(r.finalized,true); assert.equal(Number(r.balance),0);
  await assert.rejects(db.query('select public.create_private_service_from_intake_v1($1,$2::jsonb,0,$3::jsonb)',[id,JSON.stringify(payload),JSON.stringify({lines:[{method:'cash',amount:1}]})]),/superar/);
});
test('se conservan los límites por rol en altas y correcciones',async()=>{
  await db.exec("set test.role='supervision'");
  try {await assert.rejects(create(),/Sin permiso/);} finally {await db.exec("set test.role='operador'");}
});
test('frontend sólo exceptúa el importe con Sin costo explícito, y no construye un depósito',()=>{
  const win={};const doc={addEventListener(){},getElementById(){return null},querySelector(){return null}};
  vm.runInNewContext(fs.readFileSync('private-service-v1.js','utf8'),{window:win,document:doc,setInterval(){},clearInterval(){},console});
  const T=win.AuxiliosParticulares._test,s=T.estadoInicial();
  s.ctx={services:[{concept_id:'c',name:'Tipo',category:'primary'}]};
  Object.assign(s.d,{customer_name:'Cliente',primary_concept_id:'c',origin:'Origen',destination:'Destino',presupuesto:'0',sin_costo:true});
  assert.equal(T.errores(s).length,0); assert.equal(T.saldo(s),0); assert.equal(T.deposito(s),null); assert.equal(T.payload(s).no_charge,true);
  s.d.sin_costo=false; assert.match(T.errores(s).join(' '),/presupuesto/);
  s.d.sin_costo=true; s.edit={pagado:100}; assert.match(T.errores(s).join(' '),/cobros registrados/);
});

const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
const id=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let db;
before(async()=>{
 db=new PGlite();
 await db.exec(`create role authenticated;create role anon;create schema auth;create schema app_private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function app_private.current_auxilios_role() returns text language sql as $$select current_setting('test.role',true)$$;
 create table operator_services(service_id uuid primary key,service_order_number text,service_number text,status text default 'completed',logistics_type text default 'own',driver_activated boolean default false,activation_driver_id uuid,assigned_driver_id uuid,activation_truck_id integer,assigned_truck_id integer,activation_kind text,cancellation_reason_code text,cancellation_reason_detail text,customer_name text,vehicle_plate text,vehicle_make_model text,origin text,destination text,scheduled_for timestamptz,completed_at timestamptz default '2026-10-28T12:00:00Z',cancelled_at timestamptz,activated_at timestamptz,updated_at timestamptz default now(),created_at timestamptz default now(),remito_id integer,primary_concept_id uuid,document_status text);
 create table operator_service_assignments(assignment_id uuid primary key,service_id uuid,driver_id uuid,truck_id integer,assigned_at timestamptz default '2026-10-27T12:00:00Z',assignment_sequence integer,released_at timestamptz);
 create table remitos(remito_id integer primary key,driver_id uuid,operator_service_id uuid,driver_intake_id uuid,document_source text,status text default 'firmado',firmado_at timestamptz,created_at_device timestamptz default '2026-10-28T12:00:00Z',created_at timestamptz default now(),nro_remito text,nro_servicio text,razon_social text,patente text,origen text,destino text,tipo_servicio text,pago_1_metodo text,pago_2_metodo text);
 create table driver_service_intakes(intake_id uuid primary key,driver_id uuid,driver_activated boolean,activation_reason_code text,activation_reason_detail text);
 create table service_concepts(concept_id uuid primary key,name text);
 create table trucks(truck_id integer primary key,numero_interno text);
 create function public.get_driver_remito_history_v3(integer) returns jsonb language plpgsql as $$begin if not exists(select from public.remitos where remito_id=$1 and driver_id=auth.uid()) then raise exception 'Sin permiso';end if;return '{"history_tolls":[]}'::jsonb;end$$;
 create function app_private.service_history_tolls_v1(uuid) returns jsonb language sql as $$select '[]'::jsonb$$;
 create function app_private.merge_history_tolls_v1(jsonb,jsonb,boolean) returns jsonb language sql as $$select $1$$;`);
 await db.exec(fs.readFileSync('migrations/20261029124346_driver_service_history_v1.sql','utf8'));
});
after(()=>db.close());
beforeEach(async()=>{
 await db.exec('truncate operator_services,operator_service_assignments,remitos,driver_service_intakes');
 await db.query("select set_config('test.uid',$1,false),set_config('test.role','chofer',false)",[A]);
});
async function service(n,attrs={}){const row={service_id:id(n),service_order_number:'SV-'+n,...attrs};const keys=Object.keys(row);await db.query(`insert into operator_services(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row));}
async function assign(n,who=A,seq=1,date='2026-10-27T12:00:00Z'){await db.query('insert into operator_service_assignments(assignment_id,service_id,driver_id,assignment_sequence,assigned_at,released_at) values($1,$2,$3,$4,$5,$6)',[id(n*100+seq),id(n),who,seq,date,'2026-10-28T12:00:00Z']);}
async function receipt(n,sid=null,who=A,status='firmado'){await db.query('insert into remitos(remito_id,operator_service_id,driver_id,status) values($1,$2,$3,$4)',[n,sid,who,status]);}
async function history(filters={},page=1,size=50){return (await db.query('select list_driver_service_history_v1($1,$2,$3) data',[page,size,filters])).rows[0].data;}
test('driver/operator activations, including movement, survive released assignments and need no remito',async()=>{
 await service(1,{driver_activated:true,activation_driver_id:A,activation_kind:'origin'});
 await service(2,{driver_activated:true,activation_kind:'movement'});await assign(2);
 await service(3,{driver_activated:true,activation_driver_id:A,status:'at_origin',completed_at:null,activated_at:'2026-10-28T13:00:00Z'});
 const h=await history();assert.equal(h.total,3);assert.ok(h.items.every(x=>x.history_state==='activado'&&x.remito===null));
 assert.equal((await history({estado:'activado'})).total,3);
});
test('completed and cancelled services are visible after both current assignment fields are cleared',async()=>{
 await service(1);await assign(1);await service(2,{status:'cancelled',completed_at:null,cancelled_at:'2026-10-28T13:00:00Z'});await assign(2);
 const h=await history();assert.deepEqual(h.items.map(x=>x.history_state),['anulado','finalizado']);
 assert.equal((await history({estado:'anulado'})).total,1);assert.equal((await history({estado:'finalizado'})).total,1);
});
test('only the latest responsible driver sees a closure; future assignments and arbitrary driver filters do not grant access',async()=>{
 await service(1);await assign(1,A);await assign(1,B,2,'2026-10-27T14:00:00Z');
 await service(2);await assign(2,A);await assign(2,B,2,'2026-10-29T14:00:00Z');
 await service(3,{activation_driver_id:B,driver_activated:true});await assign(3,A);
 await service(4);await service(5,{logistics_type:'third_party',assigned_driver_id:A});
 const h=await history({driverId:B});assert.deepEqual(h.items.map(x=>x.service.service_id),[id(2)]);
 await db.query("select set_config('test.uid',$1,false)",[B]);assert.equal((await history()).total,2);
});
test('a service and multiple linked receipts produce one entry, preserving the actual remito identity',async()=>{
 await service(1,{remito_id:10});await assign(1);await receipt(10,id(1));await receipt(11,id(1));
 const h=await history();assert.equal(h.total,1);assert.equal(h.items[0].service.service_id,id(1));assert.equal(h.items[0].remito.remito_id,11);
 await service(2,{remito_id:12});await receipt(12,null);assert.equal((await history()).total,2);
});
test('active services are not duplicated into history; old signed and annulled receipts remain visible',async()=>{
 await service(1,{status:'assigned',completed_at:null,assigned_driver_id:A});await receipt(1,id(1));
 await receipt(2,null,A,'anulado');await receipt(3,null,B);const h=await history();assert.equal(h.total,2);assert.deepEqual(new Set(h.items.map(x=>x.history_state)),new Set(['firmado','anulado']));
});
test('ad-hoc activation is labelled Activado, pending drafts remain independent from history filters and pages',async()=>{
 await db.query('insert into driver_service_intakes values($1,$2,true,$3,null)',[id(70),A,'provider']);
 await receipt(1,null,A,'anulado');await db.query('update remitos set driver_intake_id=$1 where remito_id=1',[id(70)]);
 await receipt(2,null,A,'pendiente');await db.exec("update remitos set document_source='driver_ad_hoc' where remito_id=2");
 const h=await history();assert.equal(h.total,1);assert.equal(h.items[0].history_state,'activado');assert.equal(h.drafts.length,1);
 const filtered=await history({buscar:'no-match'},99,1);assert.equal(filtered.total,0);assert.equal(filtered.drafts.length,1);assert.equal(filtered.page,1);
});
test('pagination counts the whole filtered history and has a stable order for equal timestamps',async()=>{
 for(let n=1;n<=53;n++)await service(n,{assigned_driver_id:A});
 const a=await history(),b=await history({},2),beyond=await history({},9);assert.equal(a.total,53);assert.equal(a.items.length,50);assert.equal(b.items.length,3);assert.equal(beyond.page,2);assert.equal(new Set([...a.items,...b.items].map(x=>x.key)).size,53);
 assert.equal((await history({buscar:'SV-53'})).total,1);
});
test('day filters use Argentine dates and closure timestamps, not original creation dates',async()=>{
 await service(1,{assigned_driver_id:A,completed_at:'2026-10-29T02:59:59Z'});await service(2,{assigned_driver_id:A,completed_at:'2026-10-29T03:00:00Z'});
 const h=await history({periodo:'dia',diaEspecifico:'2026-10-28'});assert.equal(h.total,1);assert.equal(h.items[0].service.service_id,id(1));
});
test('anonymous, non-driver roles and ungranted execute cannot read the ledger',async()=>{
 await db.exec("select set_config('test.uid','',false)");await assert.rejects(history(),/Sin permiso/);
 await db.query("select set_config('test.uid',$1,false),set_config('test.role','operador',false)",[A]);await assert.rejects(history(),/Sin permiso/);
 const r=await db.query("select has_function_privilege('anon','public.list_driver_service_history_v1(integer,integer,jsonb)','execute') anon,has_function_privilege('authenticated','public.list_driver_service_history_v1(integer,integer,jsonb)','execute') authenticated");assert.equal(r.rows[0].anon,false);assert.equal(r.rows[0].authenticated,true);
});
test('frontend keeps receipt actions separate, and labels service status independently from document status',()=>{
 const window={};vm.runInNewContext(fs.readFileSync('driver-service-history-v1.js','utf8'),{window});
 const api=window.DriverServiceHistory,map=r=>({id:r.remito_id,estado:'pendiente'}),date=v=>v;
 const without=api.mapEntry({key:'s:1',history_state:'activado',service:{service_id:'1',activation_kind:'movement'},occurred_at:'today',remito:null},map,date);
 assert.equal(without.id,null);assert.equal(without.historyRemito,null);assert.match(api.stateHTML(without),/Activado · Movida/);
 const withDoc=api.mapEntry({history_state:'finalizado',service:{service_id:'1'},remito:{remito_id:44}},map,date);assert.equal(withDoc.id,44);assert.equal(withDoc.historyRemito.historyEntry,undefined);assert.match(api.stateHTML(withDoc),/Finalizado/);
});

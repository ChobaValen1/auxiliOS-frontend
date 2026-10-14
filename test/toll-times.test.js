const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync('supabase/migrations/20261002141621_driver_toll_payer_and_service_times.sql','utf8');
const uid='10000000-0000-4000-8000-000000000001', sid='20000000-0000-4000-8000-000000000001', tid='30000000-0000-4000-8000-000000000001';
async function setup(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create schema auth;create schema app_private;create role anon;create role authenticated;
 create function auth.uid() returns uuid language sql as $$select '${uid}'::uuid$$;
 create function app_private.current_auxilios_role() returns text language sql as $$select coalesce(nullif(current_setting('test.role',true),''),'operador')$$;
 create function app_private.operator_service_missing_required_v2(uuid,jsonb) returns text[] language sql as $$select '{}'::text[]$$;`);
 await db.exec(fs.readFileSync('test/fixtures/toll-times-schema.sql','utf8'));
 await db.exec(migration);
 await db.exec(fs.readFileSync('migrations/20260930210000_hora_de_fin_editable_v1.sql','utf8'));
 await db.exec(`create function public.transition_operator_service_v2(p_id uuid,p_action text,p_reason text,p_detail text) returns jsonb language plpgsql as $$begin update public.operator_services set status='completed',completed_at=now() where service_id=p_id;return jsonb_build_object('status','completed');end$$;
 insert into operator_services(service_id,status,remito_id,toll_coverage_mode,arrived_at,arrival_source) values('${sid}','at_origin',1,'provider_roundtrip',now()-interval '1 hour','manual_operator');
 insert into remitos(remito_id,operator_service_id,driver_id,status,firma_imagen_url,firmado_at,created_at_device,imp_otros) values(1,'${sid}','${uid}','firmado','signature',now()-interval '5 minutes',now(),0);
 insert into toll_locations(toll_id,name,is_active) values('${tid}','Peaje de prueba',true);`);
 return db;
}
test('database derives toll payer from coverage, excludes provider tolls from customer totals',async t=>{
 const db=await setup(t);
 const payload={tolls:[{client_line_id:tid,toll_id:tid,unit_amount:1200,customer_payment_method:'cash',payer_agent:'customer'}]};
 await db.query('select app_private.persist_driver_remito_addons_v3(1,$1,$2)',[payload,uid]);
 let row=(await db.query('select payer_agent,customer_payment_method,total_amount from remito_toll_reports')).rows[0];
 assert.equal(row.payer_agent,'provider');assert.equal(row.customer_payment_method,null);assert.equal(Number(row.total_amount),1200);
 assert.equal(Number((await db.query('select imp_peaje from remitos')).rows[0].imp_peaje),0);
 for(const mode of ['customer_roundtrip','mixed_manual']){
  await db.query('update operator_services set toll_coverage_mode=$1',[mode]);
  await db.query('select app_private.persist_driver_remito_addons_v3(1,$1,$2)',[payload,uid]);
  row=(await db.query('select payer_agent,customer_payment_method from remito_toll_reports')).rows[0];
  assert.equal(row.payer_agent,'customer');assert.equal(row.customer_payment_method,'cash');
  assert.equal(Number((await db.query('select imp_peaje from remitos')).rows[0].imp_peaje),1200);
 }
 payload.tolls[0].customer_payment_method=null;
 await assert.rejects(db.query('select app_private.persist_driver_remito_addons_v3(1,$1,$2)',[payload,uid]),/cómo pagó/);
});
test('signature replaces manual arrival and is idempotent on retries',async t=>{
 const db=await setup(t);
 await db.query('select app_private.mark_operator_service_arrived_signature_v2($1,1)',[sid]);
 let row=(await db.query('select s.arrived_at=r.firmado_at as matches,s.arrival_source from operator_services s join remitos r on r.remito_id=s.remito_id')).rows[0];
 assert.equal(row.matches,true);assert.equal(row.arrival_source,'signature');
 await db.exec("update remitos set firmado_at=now();");
 await db.query('select app_private.mark_operator_service_arrived_signature_v2($1,1)',[sid]);
 assert.equal((await db.query('select arrived_at<now()-interval \'1 minute\' as unchanged from operator_services')).rows[0].unchanged,true);
});
test('atomic close persists chosen time, rejects pre-arrival time and blocks drivers',async t=>{
 const db=await setup(t);
 await assert.rejects(db.query("select finalize_operator_service_at_v1($1,now()-interval '2 hours','transition')",[sid]),/anterior al arribo/);
 assert.equal((await db.query('select status from operator_services')).rows[0].status,'at_origin');
 const date=new Date(Date.now()-600000).toISOString();
 await db.query("select finalize_operator_service_at_v1($1,$2,'transition')",[sid,date]);
 assert.equal(new Date((await db.query('select completed_at from operator_services')).rows[0].completed_at).toISOString(),date);
 await db.query("select finalize_operator_service_at_v1($1,now(),'transition')",[sid]);
 assert.equal(new Date((await db.query('select completed_at from operator_services')).rows[0].completed_at).toISOString(),date);
 await db.exec("set test.role='chofer'");
 await assert.rejects(db.query("select finalize_operator_service_at_v1($1,now(),'transition')",[sid]),/Sin permiso/);
});
test('driver UI assigns provider tolls without requesting customer payment; mixed requires it',()=>{
 const nodes=new Map(),document={readyState:'loading',addEventListener(){},querySelector:s=>nodes.get(s)||null,querySelectorAll:()=>[]};
 const context={window:{},document,sessionStorage:{getItem:()=>sid},console};
 let source=fs.readFileSync('remito-addons-v2.js','utf8').replace(/\}\)\(\);\s*$/, 'window.api={state,collectLines,detailsMarkup,recalculate,validate,hasCustomerCollection};})();');
 vm.runInNewContext(source,context);const api=context.window.api;
 api.state.reference.toll_coverage_mode='provider_roundtrip';api.state.lines.toll=[{toll_id:tid,unit_amount:1200,customer_payment_method:'cash'}];
 api.state.draft={kind:'toll',lines:api.state.lines.toll};
 assert.equal(api.collectLines().tolls[0].payer_agent,'provider');assert.equal(api.collectLines().tolls[0].customer_payment_method,null);
 assert.doesNotMatch(api.detailsMarkup(),/id="rem-picker-common-payment"/);assert.equal(api.hasCustomerCollection(),false);
 api.state.reference.toll_coverage_mode='mixed_manual';api.state.lines.toll[0].customer_payment_method='';
 assert.equal(api.collectLines().tolls[0].payer_agent,'customer');assert.equal(api.validate().ok,false);
 assert.match(api.detailsMarkup(),/id="rem-picker-common-payment"/);
});
test('finish dialog uses current time if unchanged and sends selected time in one RPC',async()=>{
 let request;const window={toast(){}};const context={window,_db:{rpc:async(name,args)=>{request={name,args};return {data:{status:'completed'},error:null}}},Date,setTimeout};
 vm.runInNewContext(fs.readFileSync('finish-time-v1.js','utf8'),context);
 const api=window.AuxiliosFinishTime,old='2020-01-01T12:00:00';
 assert.ok(Math.abs(api.read({querySelector:()=>({value:old,dataset:{defaultValue:old}})}).getTime()-Date.now())<1000);
 const selected=new Date(Date.now()-600000);await api.finalize(sid,selected,'transition',{});
 assert.equal(request.name,'finalize_operator_service_at_v1');assert.equal(request.args.p_finished_at,selected.toISOString());
});
test('a failure saving finish time rolls back the service close',async t=>{
 const db=await setup(t);
 await db.exec(`create or replace function public.set_service_finish_time_v1(p_service_id uuid,p_finished_at timestamptz) returns jsonb language plpgsql as $$begin raise exception 'Simulated timestamp failure';end$$;`);
 await assert.rejects(db.query("select finalize_operator_service_at_v1($1,now(),'transition')",[sid]),/Simulated timestamp failure/);
 assert.equal((await db.query('select status from operator_services')).rows[0].status,'at_origin');
});

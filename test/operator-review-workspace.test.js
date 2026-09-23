const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const serviceId='11111111-1111-4111-8111-111111111111';
const reportId='22222222-2222-4222-8222-222222222222';
const detail={
  service:{service_id:serviceId},remito:{remito_id:42},can_resolve:true,administrative_revision:0,
  planned:{tolls:[],excesses:[]},
  reported:{tolls:[{toll_report_id:reportId,toll_name:'Peaje',quantity:1,unit_amount:18000,customer_payment_method:'cash'}],excesses:[]}
};

function setup(draft={decisions:{},note:''},reviewDetail=detail){
  const calls=[],alerts=[],host={innerHTML:'',querySelector:()=>null};
  const document={getElementById:id=>id==='osv4-review-slot'?host:null,querySelector:()=>null,querySelectorAll:()=>[]};
  const window={OperatorServices:{S:{wizard:{dirty:false}},loadServices:async()=>{}},toast:()=>{},alert:message=>alerts.push(message),cerrarNuevoServicio:()=>{}};
  const db={rpc:async(name,args)=>{calls.push({name,args});if(name==='get_operator_service_remito_review_v3')return{data:reviewDetail};if(name==='get_operator_service_review_draft_v1')return{data:draft};return{data:{}}}};
  const context={document,window,PERFIL_USUARIO:{role:'operador'},_db:db,setInterval:()=>0,clearInterval:()=>{},setTimeout:()=>0,console,Intl,Number,String,Math,Map,Set,JSON};
  vm.runInNewContext(fs.readFileSync('operator-remito-review-v2.js','utf8'),context);
  return{review:window.AuxiliosRemitoReviewV2,calls,alerts,host,window};
}

test('finalizar con una diferencia pendiente muestra el aviso y no guarda ni cierra',async()=>{
  const app=setup();await app.review.embed(serviceId);
  await app.review.finalizeEmbedded();
  assert.match(app.alerts[0],/Debés aprobar o rechazar todas las diferencias/);
  assert.equal(app.calls.filter(call=>call.name==='resolve_operator_service_document_v6').length,0);
  app.review.decideEmbedded('toll',reportId,'accepted');
  await app.review.finalizeEmbedded();
  assert.equal(app.calls.filter(call=>call.name==='resolve_operator_service_document_v6').length,1);
});

test('las decisiones pendientes se recuperan y exigen motivo al rechazar',async()=>{
  const key=`toll:${reportId}`;
  const app=setup({decisions:{[key]:{value:'rejected',reason:'Duplicado'}},note:'Consultar peaje'});
  await app.review.embed(serviceId);
  assert.match(app.host.innerHTML,/Consultar peaje/);
  assert.match(app.host.innerHTML,/Duplicado/);
  await app.review.finalizeEmbedded();
  const call=app.calls.find(entry=>entry.name==='resolve_operator_service_document_v6');
  assert.equal(call.args.p_payload.tolls[0].decision,'rejected');
  assert.equal(call.args.p_payload.tolls[0].reason,'Duplicado');
});

test('la diferencia muestra el importe realmente planificado',async()=>{
  const planned={...detail,planned:{tolls:[{toll_name:'Peaje',quantity:1,unit_amount:15000}],excesses:[]}};
  const app=setup(undefined,planned);await app.review.embed(serviceId);
  assert.match(app.host.innerHTML,/Servicio: \$&nbsp;15\.000|Servicio: \$\s*15\.000/);
});

test('dejar pendiente guarda la nota y las decisiones individuales',async()=>{
  const app=setup();await app.review.embed(serviceId);
  app.review.decideEmbedded('toll',reportId,'rejected');
  app.review.reasonEmbedded('toll',reportId,'Comprobante duplicado');
  app.review.noteEmbedded('Consultar al chofer');
  await app.review.leavePending();
  const call=app.calls.find(entry=>entry.name==='save_operator_service_review_draft_v1');
  assert.equal(call.args.p_note,'Consultar al chofer');
  assert.equal(call.args.p_decisions[`toll:${reportId}`].reason,'Comprobante duplicado');
});

test('una corrección administrativa no exige aprobar una línea que no vino del chofer',async()=>{
  const corrected={...detail,reported:{...detail.reported,tolls:[
    {...detail.reported.tolls[0],administratively_excluded:true},
    {review_line_client_id:'33333333-3333-4333-8333-333333333333',toll_name:'Peaje corregido',quantity:1,unit_amount:18000,customer_payment_method:'cash'}
  ]}};
  const app=setup(undefined,corrected);await app.review.embed(serviceId);
  assert.match(app.host.innerHTML,/Peajes y excedentes coinciden/);
  await app.review.finalizeEmbedded();
  const tolls=app.calls.find(entry=>entry.name==='resolve_operator_service_document_v6').args.p_payload.tolls;
  assert.equal(tolls[0].decision,'rejected');
  assert.equal(tolls[1].decision,'adjusted');
});

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
  const window={OperatorServices:{S:{wizard:{dirty:false,serviceId}},loadServices:async()=>{}},toast:()=>{},alert:message=>alerts.push(message),cerrarNuevoServicio:()=>{}};
  const db={rpc:async(name,args)=>{calls.push({name,args});if(name==='get_operator_service_remito_review_v3')return{data:reviewDetail};if(name==='get_operator_service_charge_review_report_v1')return{data:draft};return{data:{status:'completed'}}}};
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
  assert.match(app.review.reviewReport(),/Duplicado/);assert.doesNotMatch(app.host.innerHTML,/os-embedded-difference/);
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
  app.review.reasonEmbedded('toll',reportId,'Comprobante duplicado');app.review.confirmRejection('toll',reportId);
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
  assert.match(app.host.innerHTML,/No quedan diferencias pendientes/);
  await app.review.finalizeEmbedded();
  const tolls=app.calls.find(entry=>entry.name==='resolve_operator_service_document_v6').args.p_payload.tolls;
  assert.equal(tolls[0].decision,'rejected');
  assert.equal(tolls[1].decision,'adjusted');
});

test('aprobar reemplaza el peaje en la misma fila, con Cliente, importe y pago; repetir no duplica',async()=>{
 const item={...detail.reported.tolls[0],toll_id:'peaje-1',quantity:1,unit_amount:1500};const data={...detail,reported:{tolls:[item],excesses:[]}};const app=setup(undefined,data);const wizard=app.window.OperatorServices.S.wizard;Object.assign(wizard,{mode:'edit',administrativeEdit:true,serviceId,data:{commercial_addons:{toll_coverage_mode:'provider_roundtrip',tolls:[{...item,unit_amount:1000,payer_agent:'provider'}],excess_charges:[]}}});await app.review.embed(serviceId);app.review.decideEmbedded('toll',reportId,'accepted');app.review.decideEmbedded('toll',reportId,'accepted');const rows=wizard.data.commercial_addons.tolls;assert.equal(rows.length,1);assert.equal(rows[0].unit_amount,1500);assert.equal(rows[0].payer_agent,'customer');assert.equal(rows[0].customer_payment_method,'cash');assert.equal(wizard.dirty,true);
});
test('rechazar quita el cargo administrativo y exige motivo antes de guardar pendiente',async()=>{
 const app=setup();const wizard=app.window.OperatorServices.S.wizard;Object.assign(wizard,{mode:'edit',administrativeEdit:true,serviceId,data:{commercial_addons:{tolls:[{...detail.reported.tolls[0]}],excess_charges:[]}}});await app.review.embed(serviceId);app.review.decideEmbedded('toll',reportId,'rejected');assert.equal(wizard.data.commercial_addons.tolls.length,1);app.review.noteEmbedded('Pendiente de control');await app.review.leavePending();assert.equal(app.calls.filter(c=>c.name==='save_operator_service_review_draft_v1').length,0);app.review.reasonEmbedded('toll',reportId,'Duplicado');app.review.confirmRejection('toll',reportId);assert.equal(wizard.data.commercial_addons.tolls.length,0);assert.equal(app.review.getSaveState(serviceId).decisions['toll:'+reportId].reason,'Duplicado');
});
test('finalizar con formulario modificado guarda antes de cerrar y se detiene si guardar falla',async()=>{
 const app=setup();await app.review.embed(serviceId);app.review.decideEmbedded('toll',reportId,'accepted');app.window.OperatorServices.S.wizard.dirty=true;let saves=0;app.window.guardarServicioWorkspace=async()=>{saves++;return false};await app.review.finalizeEmbedded();assert.equal(saves,1);assert.equal(app.calls.filter(c=>c.name==='resolve_operator_service_document_v6').length,0);
});

test('aprobar quita el aviso y muestra Aprobado sin guardar en el informe del original',async()=>{
 const app=setup();await app.review.embed(serviceId);app.review.decideEmbedded('toll',reportId,'accepted');
 assert.doesNotMatch(app.host.innerHTML,/class="os-embedded-difference"/);assert.match(app.review.reviewReport(),/Aprobado/);assert.match(app.review.reviewReport(),/Sin guardar/);assert.match(app.review.reviewReport(),/18.000/);
});
test('el rechazo no se completa sin motivo y al confirmarlo pasa al informe',async()=>{
 const app=setup();await app.review.embed(serviceId);app.review.decideEmbedded('toll',reportId,'rejected');app.review.confirmRejection('toll',reportId);
 assert.match(app.host.innerHTML,/Confirmar rechazo/);await app.review.finalizeEmbedded();assert.equal(app.calls.filter(c=>c.name==='resolve_operator_service_document_v6').length,0);
 app.review.reasonEmbedded('toll',reportId,'<No autorizado>');app.review.confirmRejection('toll',reportId);
 assert.doesNotMatch(app.host.innerHTML,/class="os-embedded-difference"/);assert.match(app.review.reviewReport(),/Rechazado/);assert.match(app.review.reviewReport(),/&lt;No autorizado&gt;/);
});
test('Ver servicio carga decisiones guardadas y no permite mutarlas ni finalizar',async()=>{
 const app=setup({decisions:{['toll:'+reportId]:{value:'rejected',reason:'Duplicado',saved:true}}});
 app.window.OperatorServices.S.wizard.mode='view';await app.review.embed(serviceId);
 assert.equal(app.host.innerHTML,'');assert.match(app.review.reviewReport(),/Decisión guardada/);app.review.decideEmbedded('toll',reportId,'accepted');await app.review.finalizeEmbedded();
 assert.match(app.review.reviewReport(),/Rechazado/);assert.equal(app.calls.filter(c=>c.name==='resolve_operator_service_document_v6').length,0);
});
test('el estado de rechazo guardado no depende de que el cargo siga en la matriz administrativa',async()=>{
 const original=detail.reported.tolls[0],data={...detail,original_reported:detail.reported,reported:{tolls:[{...original,administratively_excluded:true}],excesses:[]}};
 const app=setup({decisions:{['toll:'+reportId]:{value:'rejected',reason:'Duplicado',saved:true}}},data);await app.review.embed(serviceId);
 assert.doesNotMatch(app.host.innerHTML,/class="os-embedded-difference"/);assert.match(app.review.reviewReport(),/Rechazado/);assert.match(app.review.reviewReport(),/Duplicado/);
});

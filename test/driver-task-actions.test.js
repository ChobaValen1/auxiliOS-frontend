const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('operator-service-bridge.js','utf8'),fn=src.slice(src.indexOf('function driverCardAction('),src.indexOf('window.accionTarjetaServicioChofer='));
function run(s,{driver=true,q=null,programmed=false}={}){const calls=[],ctx={findService:()=>s,isDriver:()=>driver,queueState:()=>q,isProgrammed:()=>programmed,openPreview:()=>calls.push('preview'),markArrived:()=>calls.push('arrive'),window:{abrirRemitoServicio:()=>calls.push('remito')}};vm.runInNewContext(fn+';driverCardAction("qa",{});',ctx);return calls;}
test('driver card action keeps role, queue, scheduled and signed-remito guards',()=>{const s={can_complete_remito:true,status:'assigned'};assert.deepEqual(run(s,{driver:false}),[]);assert.deepEqual(run(s,{q:{started:false,waiting:true}}),['preview']);assert.deepEqual(run(s,{q:{started:false,next:true}}),['preview']);assert.deepEqual(run(s,{programmed:true}),['preview']);assert.deepEqual(run({...s,can_edit_remito:true}),['preview']);assert.deepEqual(run(s),['arrive']);assert.deepEqual(run({...s,status:'at_origin'}),['remito']);assert.deepEqual(run({status:'assigned'}),['preview']);});
test('queued cards have one Ver servicio button, with waiting position as text',()=>{
 const card=src.slice(src.indexOf('function activeCard(s)'),src.indexOf('function activeAdHocCard('));
 for(const q of [{started:false,next:true,pos:1},{started:false,waiting:true,pos:2,blockerPos:1}]){
  const ctx={STATUS:{assigned:{tone:'blue',label:'Asignado'}},esc:String,ico:()=>'<svg></svg>',queueState:()=>q,driverCardLabel:()=>'',driverQuickLinks:()=>'',draftState:()=>'',serviceFacts:()=>'',s:{service_id:'qa',status:'assigned',origin:'Origen'}};
  vm.runInNewContext(card+';result=activeCard(s);',ctx);const footer=ctx.result.match(/<footer[\s\S]*?<\/footer>/)[0];assert.equal((footer.match(/<button/g)||[]).length,1);assert.match(footer,/Ver servicio/);assert.doesNotMatch(footer,/Empezar este servicio/);if(q.waiting)assert.match(footer,/Se habilita después del 1º/);
 }
});

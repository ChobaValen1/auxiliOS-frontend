const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('operator-service-bridge.js','utf8');
const helper=source.slice(source.indexOf('function refreshDriverServices(){'),source.indexOf('window.recargarServiciosChofer='));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
function setup(){
 const queue=deferred(),remitos=deferred(),minimum=deferred(),busy=[],calls=[],errors=[];
 const ctx={P3:{},isDriver:()=>true,db:()=>({}),setRefreshBusy:v=>busy.push(v),setTimeout:fn=>{minimum.promise.then(fn)},loadQueue:opts=>{calls.push(opts);return queue.promise},window:{cargarRemitos:()=>remitos.promise},notify:m=>errors.push(m)};
 vm.runInNewContext(helper+';window.refresh=refreshDriverServices;',ctx);
 return {ctx,queue,remitos,minimum,busy,calls,errors,refresh:ctx.window.refresh};
}
test('loading begins immediately, duplicate clicks share the pending request',async()=>{
 const s=setup(),first=s.refresh(),second=s.refresh();assert.equal(first,second);assert.deepEqual(s.busy,[true]);
 await Promise.resolve();assert.equal(s.calls.length,1);assert.equal(s.calls[0].force,true);
 s.queue.resolve(true);s.minimum.resolve();await Promise.resolve();assert.deepEqual(s.busy,[true]);
 s.remitos.resolve();assert.equal(await first,true);assert.deepEqual(s.busy,[true,false]);assert.equal(s.ctx.P3.manualRefreshPromise,null);
});
test('errors wait for other reads and always release the button for retry',async()=>{
 const s=setup(),first=s.refresh();s.remitos.reject(new Error('offline'));s.minimum.resolve();await Promise.resolve();await Promise.resolve();
 assert.deepEqual(s.busy,[true]);s.queue.resolve(false);assert.equal(await first,false);
 assert.deepEqual(s.busy,[true,false]);assert.equal(s.errors.length,1);assert.equal(s.ctx.P3.manualRefreshPromise,null);
});
test('quick requests still have a perceptible state; timers cannot end slow requests',async()=>{
 const s=setup(),first=s.refresh();s.queue.resolve(true);s.remitos.resolve();await Promise.resolve();await Promise.resolve();
 assert.deepEqual(s.busy,[true]);s.minimum.resolve();await first;assert.deepEqual(s.busy,[true,false]);
});
test('only the driver manual button uses feedback, background polling remains silent',()=>{
 assert.match(source,/onclick="recargarServiciosChofer\(\)"/);
 assert.match(source,/actualizarServiciosAsignados:\(\)=>loadQueue\(\{force:true\}\)/);
 const css=fs.readFileSync('chofer-servicios-ax-v1.css','utf8');
 assert.match(css,/prefers-reduced-motion:reduce/);assert.match(source,/button.disabled=busy/);assert.match(source,/aria-busy/);
});

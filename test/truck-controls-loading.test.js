const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('sigma.js','utf8');
function fn(name){const p=source.indexOf('function '+name+'(');assert.ok(p>=0);return (source.slice(p-6,p)==='async '?'async ':'')+source.slice(p,source.indexOf('\n}',p)+2);}
test('control save blocks duplicates and releases button after failure',async()=>{
 let reject,calls=0,error='';const button={style:{},setAttribute(){},removeAttribute(){}};
 const c=vm.createContext({document:{getElementById:()=>button},console:{error(){}},_modalError:(_,s)=>error=s,_guardarNeumaticos:()=>{calls++;return new Promise((_,r)=>reject=r)}});
 vm.runInContext('let _guardandoNeumaticos=false;'+fn('guardarNeumaticos'),c);
 const pending=c.guardarNeumaticos();await c.guardarNeumaticos();assert.equal(calls,1);assert.equal(button.disabled,true);
 reject(Error('network'));await pending;assert.equal(button.disabled,false);assert.match(error,/Reintentá/);
});
test('loading indicator persists across overlapping requests and clears on errors',async()=>{
 const status={hidden:true},pending=[];const c=vm.createContext({document:{getElementById:()=>status},_cargarViewRendimientoDatos:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))});
 vm.runInContext('let _metricsLoadingCount=0;'+fn('_cargarViewRendimiento'),c);
 const first=c._cargarViewRendimiento(),second=c._cargarViewRendimiento();assert.equal(status.hidden,false);
 pending[0].resolve();await first;assert.equal(status.hidden,false);pending[1].reject(Error('network'));await assert.rejects(second);assert.equal(status.hidden,true);
});
test('condition cards retain independent canonical values',()=>{
 const inputs={'neu-cond':{},'neu-frenos':{}};const buttons=['bueno','regular','malo'].map(value=>({dataset:{value},setAttribute(k,v){this[k]=v}}));
 const c=vm.createContext({document:{getElementById:id=>inputs[id],querySelectorAll:()=>buttons}});vm.runInContext(fn('seleccionarCondicion'),c);
 c.seleccionarCondicion('neu-cond','regular');c.seleccionarCondicion('neu-frenos','bueno');assert.equal(inputs['neu-cond'].value,'regular');assert.equal(inputs['neu-frenos'].value,'bueno');assert.deepEqual(buttons.map(b=>b['aria-pressed']),['true','false','false']);
});

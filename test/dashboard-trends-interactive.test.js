const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ts=require('../motion-ui/node_modules/typescript');
const text=fs.readFileSync('motion-ui/src/trends-model.ts','utf8');
const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const context={exports:{},Intl,Date,Map,Number,Math};vm.runInNewContext(js,context);const api=context.exports;
const fixture={desde:'2026-10-01',hasta:'2026-10-03',actual:{servicios:[2,4,1]},empresas:[
 {id:'a',nombre:'A',facturado:[100,0,20],servicios:[1,0,1]},
 {id:'b',nombre:'B',facturado:[0,150,0],servicios:[1,4,0]}]};
test('frames accumulate real values without changing company identities',()=>{
 const f=api.frames(fixture,'facturado');assert.equal(f.length,3);
 assert.equal(f[0].data[0].value,100);assert.equal(f[2].data[0].value,120);assert.equal(f[2].data[1].value,150);
 assert.equal(f[0].data[0].id,f[2].data[0].id);assert.equal(f[0].data[0].color,f[2].data[0].color);
});
test('services is independent of billing and heatmap agrees with daily RPC',()=>{
 assert.equal(api.frames(fixture,'servicios')[2].data[1].value,5);
 assert.deepEqual(JSON.parse(JSON.stringify(api.activity(fixture))),[{date:'2026-10-01',count:2},{date:'2026-10-02',count:4},{date:'2026-10-03',count:1}]);
});
test('empty and invalid ranges do not create sample activity',()=>{
 assert.equal(api.dates({...fixture,desde:null}).length,0);
 assert.equal(api.dates({...fixture,desde:'2026-10-10'}).length,0);
 assert.equal(api.frames({...fixture,empresas:[]})[0].data.length,0);
 assert.equal(api.amount(Infinity),0);assert.equal(api.amount(-5),0);
 assert.equal(api.dates({...fixture,desde:'2099-01-01',hasta:'2099-01-31'}).length,0);
});
test('interactive assets are lazy, no fake generation or global Tailwind reset',()=>{
 const source=fs.readFileSync('motion-ui/src/contribution-skyline.tsx','utf8');
 assert.doesNotMatch(source,/generateContributions\(/);
 const index=fs.readFileSync('Index.html','utf8');
 assert.doesNotMatch(index,/<script src="ui\/motion\/trends-v1.js/);
});
test('tendencia ya no carga el ranking animado ni el skyline: el mes a mes los reemplaza',()=>{
 const index=fs.readFileSync('Index.html','utf8');
 assert.doesNotMatch(index,/tnd-interactive-charts|trends-loader-v1/);
});

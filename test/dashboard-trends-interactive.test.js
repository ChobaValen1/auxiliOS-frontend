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
test('tendencia preserves every company instead of racing an Otras aggregate',()=>{
 const registered=[];const window={AuxDash:{registrarSeccion:s=>registered.push(s)}};
 vm.runInNewContext(fs.readFileSync('dashboard-tendencia-v1.js','utf8'),{window,document:{getElementById:()=>null,addEventListener(){}}});
 const companies=Array.from({length:12},(_,i)=>({id:String(i),nombre:'Empresa '+i,facturado:[i],servicios:[1]}));
 const d=window.AuxDashTendencia.normalizar({por_empresa:companies},null);
 assert.equal(d.ranking.length,12);assert.equal(new Set(d.ranking.map(e=>e.id)).size,12);
 assert.equal(d.empresas.length,8);assert.equal(d.empresas[7].nombre,'Otras');
});
test('interactive assets are lazy, no fake generation or global Tailwind reset',()=>{
 const source=fs.readFileSync('motion-ui/src/contribution-skyline.tsx','utf8');
 assert.doesNotMatch(source,/generateContributions\(/);
 const index=fs.readFileSync('Index.html','utf8');
 assert.match(index,/id="tnd-interactive-charts"/);assert.match(index,/ui\/trends-loader-v1.js/);
 assert.doesNotMatch(index,/<script src="ui\/motion\/trends-v1.js/);
});
test('an older filter response cannot replace newer charts',async()=>{
 const registered=[],renders=[],waiting=[];
 const window={AuxDash:{registrarSeccion:s=>registered.push(s)},AuxTrendsLoader:{render:(_node,d)=>renders.push(d)}};
 const document={getElementById:()=>null,addEventListener(){}};
 const _db={rpc:()=>new Promise(resolve=>waiting.push(resolve))};
 vm.runInNewContext(fs.readFileSync('dashboard-tendencia-v1.js','utf8'),{window,document,_db});
 const first=registered[0].cargar({desde:'2026-10-01',hasta:'2026-10-03'});
 const second=registered[0].cargar({desde:'2026-10-04',hasta:'2026-10-06'});
 waiting[2]({data:{desde:'2026-10-04',hasta:'2026-10-06',actual:{servicios:[1,2,3]}}});waiting[3]({data:{}});
 await second;
 waiting[0]({data:{desde:'2026-10-01',hasta:'2026-10-03',actual:{servicios:[9,9,9]}}});waiting[1]({data:{}});
 await first;
 assert.equal(renders.filter(Boolean).length,1);assert.equal(renders.filter(Boolean)[0].desde,'2026-10-04');
});

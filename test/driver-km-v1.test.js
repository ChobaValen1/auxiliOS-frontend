const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../driver-km-v1.js'),'utf8');
function api(){const c={window:{},document:{readyState:'loading',addEventListener(){}},Intl,Date,console};vm.createContext(c);vm.runInContext(source,c);return c.window.AuxiliosDriverKm;}
test('Km suma actividad del chofer entre camiones y excluye anulados, pendientes y otros choferes',()=>{
 const a=api(),rows=[
 {truck_id:'a',status:'closed',km_inicio:100,km_final:180,remitos:[{driver_id:'yo',status:'firmado'},{driver_id:'yo',status:'pendiente'},{driver_id:'otro',status:'firmado'}]},
 {truck_id:'b',status:'closed',km_inicio:2000,km_final:2120,remitos:[{driver_id:'yo',status:'firmado'},{driver_id:'yo',status:'anulado'}]},
 {truck_id:'a',status:'open',km_inicio:180,km_final:999,remitos:[{driver_id:'yo',status:'firmado'}]},
 {truck_id:'b',status:'void',km_inicio:0,km_final:9000,remitos:[{driver_id:'yo',status:'firmado'}]}];
 const t=a.summarize(rows,'yo');assert.equal(t.km,200);assert.equal(t.closed,2);assert.equal(t.services,3);assert.equal(t.average,100);
});
test('Km no inventa distancias ni promedios cuando faltan odómetros o son inválidos',()=>{
 const a=api();for(const [start,end]of [[null,100],[100,null],[100,90],['',100],['x',100]])assert.equal(a.distance({status:'closed',km_inicio:start,km_final:end}),null);
 const t=a.summarize([{status:'closed',km_inicio:100,km_final:null}], 'yo');assert.equal(t.missing,1);assert.equal(t.average,null);assert.equal(t.km,null);
 assert.equal(a.distance({status:'closed',km_inicio:0,km_final:0}),0);
});
test('períodos de Km cruzan meses y años sin desfase de fecha',()=>{
 const a=api();assert.equal(a.shift('2026-01-01',-1),'2025-12-31');assert.equal(a.shift('2026-03-01',-1),'2026-02-28');
});
test('lectura acotada al chofer, paginada, sin filtro por camión ni escrituras',()=>{
 assert.match(source,/eq\('driver_id',uid\)/);assert.match(source,/range\(offset,offset\+size-1\)/);
 assert.doesNotMatch(source,/\.eq\('truck_id'|\.insert\(|\.update\(|\.delete\(|service_role/);
 assert.match(source,/if\(error\)throw error/);assert.match(source,/identity\(\)!==uid/);
});

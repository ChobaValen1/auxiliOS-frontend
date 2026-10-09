const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function detail(role='administracion') {
  const window = {}, document = {getElementById:()=>null,querySelector:()=>null,addEventListener(){}};
  vm.runInNewContext(fs.readFileSync('fleet-truck-detail-v1.js','utf8'), {window,document,PERFIL_USUARIO:{roles:{name:role}},setInterval:()=>0,console});
  return window.AuxiliosDetalleCamion._test;
}
test('promedio ponderado y totales excluyen todas las variantes de anulación',()=>{
  const D=detail();
  const rows=[{liters:10,total_cost:100},{liters:30,total_cost:600},{liters:200,total_cost:9999,status:'voided'},{liters:100,total_cost:123,voided_at:'2026-10-09'},{liters:100,total_cost:123,status:'anulado'}];
  const t=D.fuelTotales(rows);
  assert.equal(t.cargas,2);assert.equal(t.litros,40);assert.equal(t.total,700);assert.equal(t.precioPromedio,17.5);
  assert.equal(D.fuelTotales([]).precioPromedio,null);
});
test('paginación mantiene totales de todo el historial y vista anulada sin edición',()=>{
  const D=detail();
  const fuel=Array.from({length:61},(_,i)=>({fuel_id:i+1,fuel_date:'2026-10-09',liters:10,total_cost:100,price_per_liter:10}));
  const voided={fuel_id:90,status:'voided',void_reason:'Duplicada',liters:999,total_cost:999};
  D.set({fuel,fuelAll:[...fuel,voided],fuelPage:2});
  const html=D.combustible();
  assert.equal((html.match(/data-ftd-carga=/g)||[]).length,25);
  assert.match(html,/Página 2 de 3/);assert.match(html,/610 L/);assert.match(html,/6.100/);
  assert.match(html,/Precio por litro/);assert.match(html,/Precio promedio por litro/);
  assert.doesNotMatch(html,/ftd-resumen/);
  D.set({fuelView:'voided',fuelPage:1});
  const deleted=D.combustible();assert.match(deleted,/restaurar-carga/);assert.doesNotMatch(deleted,/editar-carga|anular-carga/);assert.match(deleted,/610 L/);
});
test('supervisión consulta totales sin acciones de escritura',()=>{
  const D=detail('supervision');const f={fuel_id:1,liters:10,total_cost:100};D.set({fuel:[f],fuelAll:[f]});
  assert.doesNotMatch(D.combustible(),/editar-carga|anular-carga|restaurar-carga|Registrar carga/);
});
test('carga completa recupera lotes estables y propaga error sin devolver totales parciales',async()=>{
  const source=fs.readFileSync('supabase.js','utf8');
  const code=source.slice(source.indexOf('async function cargarCombustible('),source.indexOf('async function registrarCombustible('));
  const ranges=[];let fail=false;
  const query={select(){return this},eq(){return this},order(){return this},async range(a,b){ranges.push([a,b]);return fail&&a>0?{error:Error('sin conexión')}:{data:Array.from({length:a===0?500:37},(_,i)=>({fuel_id:a+i}))};}};
  const c={_db:{from:()=>query},console};vm.runInNewContext(code,c);
  assert.equal((await c.cargarCombustible(2,{completo:true})).length,537);assert.deepEqual(ranges,[[0,499],[500,999]]);
  fail=true;await assert.rejects(c.cargarCombustible(2,{completo:true}),/sin conexión/);
});

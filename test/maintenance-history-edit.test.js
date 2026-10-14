const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('supabase.js', 'utf8');
const fn = source.slice(source.indexOf('async function modificarServiceRealizado('));
function setup(response) {
  const calls = [];
  const q = {};
  for (const name of ['update', 'delete', 'eq', 'select']) q[name] = (...args) => { calls.push([name, ...args]); return q; };
  q.single = async () => response;
  const ctx = { _db: { from: table => { calls.push(['from', table]); return q; } } };
  vm.runInNewContext(fn, ctx);
  return { run: ctx.modificarServiceRealizado, calls };
}
test('editar limita por service y móvil y confirma la fila modificada', async () => {
  const { run, calls } = setup({data:{maintenance_id:3}});
  assert.equal((await run(3, 9, {hours_at_service:250})).ok, true);
  assert.deepEqual(calls.slice(2,4), [['eq','maintenance_id',3], ['eq','truck_id',9]]);
  assert.equal(calls[1][0], 'update');
});
test('eliminar usa los dos identificadores', async () => {
  const {run,calls} = setup({data:{maintenance_id:3}});
  assert.equal((await run(3,9)).ok,true);
  assert.equal(calls[1][0],'delete');
  assert.deepEqual(calls.slice(2,4), [['eq','maintenance_id',3], ['eq','truck_id',9]]);
});
test('denegación de permisos y fila inexistente no se informan como éxito', async () => {
  for (const response of [{error:{message:'denied'}},{data:null}]) {
    const {run}=setup(response);
    assert.equal((await run(3,9)).ok,false);
  }
});
test('identificador inválido no toca la base', async () => {
  const {run,calls}=setup({});
  assert.equal((await run(null,9)).ok,false);
  assert.equal(calls.length,0);
});

function form(edit = false, result = {ok:true}) {
  const sigma = fs.readFileSync('sigma.js', 'utf8');
  const body = sigma.slice(sigma.indexOf('async function guardarServiceLog()'), sigma.indexOf('// ── GUARDAR — DOCUMENTO'));
  const values = {'sl-plan':'2','sl-km':'1000','sl-horas':'250','sl-fecha':'2026-10-09','sl-costo':'0','sl-taller':'Taller','sl-notas':'Nota'};
  const elements = Object.fromEntries(Object.entries(values).map(([key,value]) => [key,{value}]));
  elements['sl-plan'].options = [{dataset:{intervalKm:'500',intervalHours:'100'}}];
  elements['sl-plan'].selectedIndex = 0;
  elements['btn-guardar-service'] = {style:{}};
  const calls = [];
  const ctx = {_serviceSaving:false, _serviceEditId:edit ? 3 : null, _truckActual:{truck_id:9}, document:{getElementById:id=>elements[id]},
    _slNeeds:()=>({needsKm:true,needsHrs:true}), _modalError:(...a)=>{if(a[1]) calls.push(['error',...a]);},
    toast:()=>{},validateServiceForm:()=>{},closeModal:()=>calls.push(['close']),_refrescarPlanesCamion:async()=>calls.push(['refresh']),
    registrarServiceOptimizado:async data=>{calls.push(['create',data]);return result;},
    modificarServiceRealizado:async (id,truck,data)=>{calls.push(['edit',id,truck,data]);return result;}};
  vm.runInNewContext(body,ctx);
  return {ctx,calls,elements};
}
test('alta y edición guardan lecturas y próximos vencimientos y recargan el detalle', async () => {
  for (const edit of [false,true]) {
    const {ctx,calls}=form(edit);
    await ctx.guardarServiceLog();
    const saved=calls[0].at(-1);
    assert.equal(calls[0][0],edit?'edit':'create');
    assert.equal(saved.hours_at_service,250);
    assert.equal(saved.next_due_hours,350);
    assert.equal(saved.next_due_km,1500);
    assert.equal(saved.cost,0);
    assert.equal(calls.at(-1)[0],'refresh');
    assert.equal(ctx._serviceSaving,false);
  }
});
test('error al guardar conserva formulario y no recarga; falta de fecha no guarda', async () => {
  const failed=form(true,{ok:false,errorMsg:'denied'});
  await failed.ctx.guardarServiceLog();
  assert.equal(failed.calls.length,1);
  assert.equal(failed.ctx._serviceSaving,false);
  const invalid=form();invalid.elements['sl-fecha'].value='';
  await invalid.ctx.guardarServiceLog();
  assert.equal(invalid.calls[0][0],'error');
});

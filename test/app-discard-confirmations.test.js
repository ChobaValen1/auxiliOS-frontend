const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=file=>fs.readFileSync(file,'utf8');

function privateClose(ask){
  const current={d:{customer_name:'Cliente',presupuesto:'1000',origin:'Origen'}};
  const ctx={st:current,global:{AuxiliosServiceImprovements:{confirmDiscard:ask}},notify(){},closed:0,cerrar(){ctx.closed++}};
  const code=read('private-service-v1.js').split('  async function cerrarForm(force)')[1].split('  /* ── Eventos')[0];
  vm.runInNewContext('async function cerrarForm(force)'+code,ctx);
  return ctx;
}

test('cancelar conserva el particular; aceptar cierra sin guardar',async()=>{
  const cancel=privateClose(async()=>false),before=cancel.st;
  assert.equal(await cancel.cerrarForm(false),false);assert.equal(cancel.st,before);assert.equal(cancel.closed,0);
  const accept=privateClose(async()=>true);
  assert.equal(await accept.cerrarForm(false),true);assert.equal(accept.st,null);assert.equal(accept.closed,1);
});

test('confirmación de salida vieja no cierra un formulario distinto y no se duplica',async()=>{
  let finish,calls=0;const ctx=privateClose(()=>{calls++;return new Promise(resolve=>finish=resolve)});
  const pending=ctx.cerrarForm(false);
  assert.equal(await ctx.cerrarForm(false),false);assert.equal(calls,1);
  const fresh={d:{customer_name:'Otro'}};ctx.st=fresh;finish(true);
  assert.equal(await pending,false);assert.equal(ctx.st,fresh);assert.equal(ctx.closed,0);
});

test('cerrar sin confirmador falla de forma segura y un guardado en curso no se descarta',async()=>{
  const missing=privateClose(undefined);assert.equal(await missing.cerrarForm(false),false);assert.equal(missing.closed,0);
  const busy=privateClose(()=>{throw Error('No debe preguntar')});busy.st.busy=true;
  assert.equal(await busy.cerrarForm(false),false);assert.equal(busy.closed,0);
  assert.equal(await busy.cerrarForm(true),true);assert.equal(busy.closed,1,'el cierre interno tras guardar sigue permitido');
});

test('helper sin UI disponible cancela; nunca usa confirmación nativa como fallback',async()=>{
  const window={};vm.runInNewContext(read('ui/service-improvements-v1.js'),{window});
  assert.equal(await window.AuxiliosServiceImprovements.confirmDiscard(),false);
  for(const file of ['private-service-v1.js','remitos-admin-panel-v1.js','company-tariffs-v4.js','ui/service-improvements-v1.js'])assert.doesNotMatch(read(file),/\b(?:window\.|global\.)?confirm\s*\(/,file);
});

test('se mantiene la protección del navegador al recargar o cerrar pestaña con cambios',()=>{
  assert.match(read('operator-service-wizard.js'),/addEventListener\('beforeunload',e=>\{if\(S\.wizard\?\.dirty\)\{e\.preventDefault\(\);e\.returnValue='';/);
});

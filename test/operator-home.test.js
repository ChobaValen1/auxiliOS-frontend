const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=f=>fs.readFileSync(f,'utf8');
const sql=read('supabase/migrations/20261126180000_operator_home_v1.sql');
const js=read('dashboard-operador-v1.js');

test('el Inicio del Operador no devuelve importes ni facturación',()=>{
  const body=sql.replace(/--.*$/gm,'');
  for(const w of ['quoted_total','company_estimated_total','total_amount','amount','price','precio','billing','invoice'])assert.doesNotMatch(body,new RegExp('\\b'+w+'\\b','i'),w);
  assert.doesNotMatch(js,/money|currency|factur/i);
});

test('la RPC del Operador valida el rol en la base y anon no la ejecuta',()=>{
  assert.match(sql,/create or replace function public\.dashboard_operator_home_v1\(p_days integer default 14\)/);
  assert.match(sql,/security definer/);
  assert.match(sql,/'administracion', 'operador', 'supervision'/);
  assert.match(sql,/revoke all on function public\.dashboard_operator_home_v1\(integer\) from public, anon;/);
  assert.match(sql,/revoke all on function app_private\.operator_home_v1\(timestamptz, integer\) from public, anon, authenticated;/);
});

test('cada tarea tiene un botón que la resuelve y cae en un filtro',()=>{
  const ctx={window:{},document:{addEventListener(){}},matchMedia:()=>({matches:false})};ctx.window=ctx;
  new Function('window','document',js)(ctx,ctx.document);
  const {KIND,FILTERS,age}=ctx.AuxOperatorHome._test,filters=new Set(FILTERS.map(f=>f[0]));
  for(const kind of ['late_arrival','late_origin','unassigned','relay','intake','remito_review','remito_draft','no_remito']){
    assert.ok(KIND[kind],kind);assert.ok(filters.has(KIND[kind].f),kind);
    const t={kind,driver:'Ana',driver_phone:'+54 11',since:new Date().toISOString()};assert.ok(KIND[kind].pri(t),kind);assert.ok(KIND[kind].ttl(t),kind);
  }
  assert.equal(age(new Date(Date.now()-75*60000).toISOString()),'1 h 15');
  assert.equal(age(new Date(Date.now()-5*60000).toISOString()),'5 min');
});

test('el operador entra al Inicio y no a Servicios',()=>{
  const sigma=read('sigma.js'),index=read('Index.html');
  assert.match(sigma,/roles\?\.name === 'operador'\) \{[\s\S]{0,120}dashCambiarVista\('operador'\)/);
  assert.match(index,/id="dash-view-operador"/);
  assert.match(index,/dashboard-operador-v1\.js\?v=/);
  assert.match(read('sw.js'),/'\/dashboard-operador-v1\.js','\/dashboard-operador-v1\.css'/);
});

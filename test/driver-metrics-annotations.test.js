const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ui=fs.readFileSync('sigma.js','utf8');
const data=fs.readFileSync('supabase.js','utf8');
function fn(source,name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,name+' exists');
  return (source.slice(start-6,start)==='async '?'async ':'')+source.slice(start,source.indexOf('\n}',start)+2);
}
function context(extra={}){
  const c=vm.createContext({Intl,Date,console,...extra});
  vm.runInContext("let _rendMes='2024-02';"+['_rendFechaLocal','_rendRangoMes','_periodoAnterior','_buildChartBuckets','_cashCollectionLines','_jhistFecha'].map(n=>fn(ui,n)).join('\n'),c);
  return c;
}
test('monthly metrics respect leap years, previous year and Argentina midnight',()=>{
  const c=context();
  assert.equal(c._rendRangoMes().hasta,'2024-02-29');
  vm.runInContext("_rendMes='2026-01'",c);
  assert.equal(c._periodoAnterior('mes').desde,'2025-12-01');
  assert.equal(c._periodoAnterior('mes').hasta,'2025-12-31');
  assert.equal(c._rendFechaLocal('2026-02-01T02:30:00Z'),'2026-01-31');
  const buckets=c._buildChartBuckets('mes',[{log_date:'2026-01-31',km_inicio:10,km_final:35}],[{created_at_device:'2026-02-01T02:30:00Z'},{created_at_device:'2026-02-01T03:30:00Z'}]);
  assert.equal(buckets.length,31); assert.equal(buckets[30].km,25); assert.equal(buckets[30].srvs,1);
});
test('cash details split only cash lines and preserve totals without guessing mixed historical payments',()=>{
  const c=context();
  const r={pago_1_metodo:'efectivo',pago_1_monto:130,pago_2_metodo:'transferencia',pago_2_monto:50};
  const lines=c._cashCollectionLines(r,{tolls:[{customer_payment_method:'cash',total_amount:30},{customer_payment_method:'transfer',total_amount:50}],excesses:[{customer_payment_method:'cash',total_amount:100}]});
  assert.equal(JSON.stringify(lines),JSON.stringify([{type:'Peaje',amount:30},{type:'Excedente',amount:100}]));
  const historical=c._cashCollectionLines({...r,imp_peaje:100,imp_excedente:80},{tolls:[],excesses:[]});
  assert.equal(historical.length,1); assert.equal(historical[0].amount,130); assert.equal(historical[0].type,'Sin desglose histórico');
});
test('cash modal uses the journey truck and leaves pending-rendition modal intact',async()=>{
  const elements={'cash-collection-rows':{innerHTML:''}};
  const c=context({document:{getElementById:id=>elements[id]},_db:{rpc:async()=>({data:{tolls:[{customer_payment_method:'cash',total_amount:80}],excesses:[]}})}});
  vm.runInContext('let _cashDetailRequest=0; const _AR=n=>String(n);'+fn(ui,'_loadCashCollectionRows'),c);
  await c._loadCashCollectionRows([{remito_id:1,created_at_device:'2026-09-12T10:00:00-03:00',daily_logs:{trucks:{plate:'PHG898'}},patente:'SOCIO99',pago_1_metodo:'efectivo',pago_1_monto:80}]);
  assert.match(elements['cash-collection-rows'].innerHTML,/12-09-2026.*PHG898.*Peaje.*80/);
  assert.doesNotMatch(elements['cash-collection-rows'].innerHTML,/SOCIO99/);
  assert.match(fn(ui,'abrirModalPendienteRendir'),/rowsRend/);
  assert.match(fn(ui,'abrirModalDesgloseEfectivo'),/_loadCashCollectionRows/);
});
test('monthly queries have upper bounds on every metric source and propagate errors',async()=>{
  const calls=[];
  const db={from(table){const q=new Proxy({}, {get(_,method){if(method==='then')return resolve=>resolve({data:[],error:null});return (...args)=>{calls.push([table,method,...args]);return q;};}});return q;}};
  const c=context({_db:db,_nextDay:()=> '2026-09-01'});
  vm.runInContext(fn(data,'cargarDatosChofer'),c);
  await c.cargarDatosChofer('driver','2026-08-01',null,'2026-08-31');
  for(const [table,column] of [['daily_logs','log_date'],['fuel_records','fuel_date'],['rendicion_cierre','fecha']])assert.ok(calls.some(x=>x[0]===table&&x[1]==='lte'&&x[2]===column&&x[3]==='2026-08-31'));
  assert.ok(calls.some(x=>x[0]==='remitos'&&x[1]==='lt'&&x[3]==='2026-09-01T00:00:00-03:00'));
});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sup=fs.readFileSync('supabase.js','utf8');
function pagoApi(){const start=sup.indexOf('const MEDIOS_PAGO_LABEL'),end=sup.indexOf('window.AuxMedioPago');const ctx={capitalizar:s=>s?s[0].toUpperCase()+s.slice(1):'—'};vm.runInNewContext(sup.slice(start,end)+';api={medioPagoLabel,_remitoMediosPago,_remitoPagoTexto};',ctx);return ctx.api;}
test('el remito nuevo muestra el medio de pago guardado en customer_payment_*',()=>{
  const {_remitoPagoTexto,_remitoMediosPago}=pagoApi();
  assert.equal(_remitoPagoTexto({customer_payment_primary:'mercado_pago',imp_total_extras:10800}),'Mercado Pago');
  assert.equal(_remitoPagoTexto({customer_payment_primary:'cash',customer_payment_secondary:'transfer',customer_payment_secondary_amount:3000,imp_total_extras:10000}),'Efectivo+Transferencia');
  assert.equal(_remitoMediosPago({customer_payment_primary:'cash',customer_payment_secondary:'transfer',customer_payment_secondary_amount:3000,imp_total_extras:10000}).map(m=>m.amount).join(','),'7000,3000');
  assert.equal(_remitoPagoTexto({pago_1_metodo:'efectivo',customer_payment_primary:'transfer'}),'Efectivo','los remitos viejos siguen usando pago_1');
  assert.equal(_remitoPagoTexto({}),'—');
});
test('cada peaje del historial dice quién paga y con qué medio',()=>{
  const ctx={window:{}};vm.runInNewContext(fs.readFileSync('ui/history-tolls-list-v1.js','utf8'),ctx);const r=ctx.window.AuxiliosHistoryTolls.render;
  const data={history_tolls:[{toll_name:'Riccheri',total_amount:5400,payer_agent:'customer',customer_payment_method:'cash',display_status:'approved'},{toll_name:'Illia',total_amount:4800,payer_agent:'provider',display_status:'planned'},{toll_name:'Sin medio',total_amount:100,payer_agent:'customer',display_status:'reported'}]};
  const h=r(data);assert.match(h,/Cliente · Efectivo · Aprobado/);assert.match(h,/Prestadora · Previsto/);assert.match(h,/Cliente · medio sin informar/);
  assert.match(r(data,{compact:true}),/Efectivo/);
});
test('la capa del celular se carga antes de la pantalla fija y queda en el caché',()=>{
  const index=fs.readFileSync('Index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
  assert.match(index,/driver-mobile-v2\.css\?v=[^"]+">\n<link id="auxilios-driver-fit-v1-css"/);
  assert.match(index,/driver-mobile-v2\.js\?v=[^"]+" defer/);
  assert.match(sw,/'\/driver-mobile-v2\.js','\/driver-mobile-v2\.css'/);
  const css=fs.readFileSync('driver-mobile-v2.css','utf8');
  assert.match(css,/env\(safe-area-inset-top/);assert.match(css,/\.dm-more/);assert.match(css,/prefers-reduced-motion/);
});

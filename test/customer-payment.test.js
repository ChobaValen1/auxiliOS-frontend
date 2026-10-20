const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=f=>fs.readFileSync(f,'utf8');
const migration=read('migrations/20261020140000_customer_payment_split.sql');
const component=read('ui/customer-payment-v1.js');
const css=read('ui/customer-payment-v1.css');
const lazy=read('ui/react-lazy-v1.js');
const wizard=read('operator-service-wizard.js');
const commercial=read('operator-service-commercial-addons-v1.js');
const config=read('config.js');
const sw=read('sw.js');

function load(){const window={};vm.runInNewContext(component,{window,Intl,Number,Math,String,console,requestAnimationFrame:()=>{},document:{}});return window.AuxiliosCustomerPayment;}

test('Cobro al cliente: lee importes en formato argentino',()=>{
  const cp=load();
  assert.equal(cp.parseAmount('4.000'),4000);
  assert.equal(cp.parseAmount('4000,5'),4000.5);
  assert.equal(cp.parseAmount('$ 1.250,75'),1250.75);
  assert.equal(cp.parseAmount('4000.5'),4000.5);
  assert.ok(Number.isNaN(cp.parseAmount('')));
});

test('Cobro al cliente: medio principal obligatorio, segundo medio distinto y menor al total',()=>{
  const cp=load();
  assert.deepEqual(Object.keys(cp.validate({},0)),[]);
  assert.ok(cp.validate({},10000).primary);
  assert.deepEqual(Object.keys(cp.validate({primary:'cash'},10000)),[]);
  assert.ok(cp.validate({primary:'cash',secondary:'cash',secondary_amount:100},10000).secondary);
  assert.ok(cp.validate({primary:'cash',secondary:'transfer',secondary_amount:0},10000).amount);
  assert.ok(cp.validate({primary:'cash',secondary:'transfer',secondary_amount:10000},10000).amount);
  assert.deepEqual(Object.keys(cp.validate({primary:'cash',secondary:'transfer',secondary_amount:4000},10000)),[]);
  // "A definir" sólo para el operador.
  assert.deepEqual(Object.keys(cp.validate({primary:'to_define'},10000,{allowToDefine:true})),[]);
  assert.ok(cp.validate({primary:'to_define'},10000).primary);
});

test('Cobro al cliente: componente React accesible y con movimiento que respeta reducir movimiento',()=>{
  assert.match(component,/role="radiogroup"/);
  assert.match(component,/role="switch" aria-checked=\$\{two\}/);
  assert.match(component,/ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1/);
  assert.match(component,/aria-live="polite"/);
  assert.match(component,/inputMode="decimal"/);
  assert.match(component,/role="alert"/);
  assert.match(css,/\.axcp-collapse\[data-open="true"\]\{grid-template-rows:1fr;opacity:1\}/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
  assert.match(lazy,/\/vendor\/react-18\.3\.1\.production\.min\.js/);
  for(const f of ['vendor/react-18.3.1.production.min.js','vendor/react-dom-18.3.1.production.min.js','vendor/htm-3.1.1.umd.js'])assert.ok(fs.existsSync(f),f);
  assert.match(config,/loadAuxiliosModule\('auxilios-customer-payment-v1', '\/ui\/customer-payment-v1\.js'\)/);
  assert.match(sw,/'\/vendor\/react-18\.3\.1\.production\.min\.js'/);
});

test('Operador: un solo cobro para peajes del cliente y excedentes de la Empresa',()=>{
  assert.match(wizard,/customer_payment:customerPaymentPayload\(c\)/);
  assert.match(wizard,/customer_payment_method:r\.payer_agent==='customer'\?\(c\.customer_payment\.primary\|\|null\):null/);
  assert.match(wizard,/const customerPaymentTotal=/);
  assert.match(wizard,/errors\.push\(\.\.\.customerPaymentErrors\(c\)\)/);
  assert.doesNotMatch(wizard,/Cuando paga el cliente, el medio de pago es obligatorio\./);
  assert.doesNotMatch(commercial,/mainPaymentBar|tollMainPayment|_ownMethod/);
  assert.match(commercial,/AuxiliosCustomerPayment\.render\(slot,customerPaymentProps\(\)\)/);
  assert.match(commercial,/allowToDefine:true/);
  assert.match(commercial,/Cobro al cliente<\/span>/);
});

test('Base: columnas del cobro, "A definir" y validación del segundo medio',()=>{
  assert.match(migration,/add column if not exists customer_payment_primary text/);
  assert.match(migration,/add column if not exists customer_payment_secondary_amount numeric\(14,2\)/);
  assert.match(migration,/operator_services_customer_payment_chk/);
  assert.match(migration,/remitos_customer_payment_chk/);
  assert.match(migration,/'other','to_define'\)\)/);
  assert.match(migration,/El segundo medio tiene que ser distinto del principal/);
  assert.match(migration,/tiene que ser menor al total a cobrar/);
  assert.match(migration,/if p_normalized \? 'customer_payment' then/);
  assert.match(migration,/'customer_payment',jsonb_build_object\('primary',v_service\.customer_payment_primary/);
  assert.doesNotMatch(migration,/\bdelete\s+from\b/i);
});

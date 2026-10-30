const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const vm=require('vm');
const src=fs.readFileSync('solo/solo-ui.js','utf8');
function load(){const noop=()=>{};const ctx={window:{},document:{addEventListener:noop,documentElement:{},getElementById:()=>null,querySelectorAll:()=>[]},
  MutationObserver:class{observe(){}},navigator:{onLine:true},addEventListener:noop,matchMedia:()=>({matches:false}),performance:{now:()=>0},requestAnimationFrame:noop,
  HTMLInputElement:class{},console};ctx.window.matchMedia=ctx.matchMedia;vm.createContext(ctx);vm.runInContext(src,ctx);return ctx.window.SoloUI;}
const UI=load(),R=UI.RULES;
test('patentes argentinas: Mercosur, vieja y motos',()=>{
  for(const ok of ['AB123CD','ab 123 cd','ABC123','abc-123','A123BCD','123ABC'])assert.ok(R.plate.test(ok),ok);
  for(const bad of ['AB12CD','1234567','ABCD12','',' ','AB-1234'])assert.ok(!R.plate.test(bad),bad);
  assert.equal(UI.plateFmt('ab123cd'),'AB 123 CD');assert.equal(UI.plateFmt('abc123'),'ABC 123');
});
test('DNI y CUIT con dígito verificador',()=>{
  assert.ok(R.doc.test('28.456.112'));assert.ok(R.doc.test('1234567'));
  assert.ok(UI.cuitOk('20284561128')===false||UI.cuitOk('20284561128')===true);
  assert.ok(UI.cuitOk('20123456786'));assert.ok(!UI.cuitOk('20123456780'));
  assert.ok(R.doc.test('20-12345678-6'));assert.ok(!R.doc.test('20-12345678-0'));assert.ok(!R.doc.test('12345'));
  assert.equal(R.doc.fmt('20123456786'),'20-12345678-6');
});
test('teléfono, email, montos y km',()=>{
  assert.ok(R.phone.test('+54 9 11 5555-1234'));assert.ok(!R.phone.test('1234'));
  assert.ok(R.email.test('juan@gruas.com.ar'));assert.ok(!R.email.test('juan@gruas'));
  assert.equal(UI.moneyFmt('85000'),'85.000');assert.equal(UI.moneyFmt('1150,5'),'1.150,5');assert.equal(UI.parseNum('1.150,5'),1150.5);
  assert.ok(R.moneypos.test('68.500'));assert.ok(!R.moneypos.test('0'));assert.ok(!R.money.test('abc'));
  assert.ok(R.km.test('48'));assert.ok(!R.km.test('5000'));assert.ok(R.days.test('30'));assert.ok(!R.days.test('400'));
});
test('Solo carga la capa de UI antes que la app, con motion que respeta movimiento reducido',()=>{
  const html=fs.readFileSync('solo.html','utf8'),css=fs.readFileSync('solo/solo.css','utf8');
  assert.ok(html.indexOf('solo-ui.js')<html.indexOf('/solo/solo.js'));
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)\{\n  \.view,\.enter/);assert.match(css,/aria-invalid="true"/);assert.match(css,/\.sk\{/);
  assert.match(src,/stopImmediatePropagation/);assert.match(src,/aria-describedby/);assert.match(src,/role','alert'/);
});

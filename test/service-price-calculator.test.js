const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={};vm.runInNewContext(fs.readFileSync('ui/service-price-calculator-v1.js','utf8'),{window});
const C=window.AuxiliosPriceCalculator;
const plain=x=>JSON.parse(JSON.stringify(x));

test('movida, asfalto, ripio, peajes y adicionales tienen desglose sin impuestos automáticos',()=>{
  const draft={mode:'distance',movement:'15.000',asphalt_km:'20',asphalt_rate:'1.000',gravel_km:'3',gravel_rate:'2.000',items:[
    {kind:'toll',name:'Peaje',quantity:'2',unit_price:'1.500'},
    {kind:'extra',name:'Maniobra',quantity:'1',unit_price:'500'}
  ]};
  const before=JSON.stringify(draft),result=C.calculate(draft);
  assert.equal(result.total,44500);assert.equal(result.budget,44500);
  assert.deepEqual(plain(result.lines.map(l=>l.subtotal)),[15000,20000,6000,3000,500]);
  assert.equal(JSON.stringify(draft),before,'calcular no modifica datos de entrada');
});

test('monto fijo reemplaza km y movida; precio por servicio multiplica cantidad y suma adicionales',()=>{
  const draft={movement:50000,asphalt_km:100,asphalt_rate:1000,fixed_amount:'20.000',service_quantity:'2',service_rate:'8.000',items:[{kind:'toll',quantity:1,unit_price:1000}]};
  assert.equal(C.calculate({...draft,mode:'fixed'}).total,21000);
  assert.equal(C.calculate({...draft,mode:'service'}).total,17000);
});

test('decimales argentinos e importes tipados son equivalentes; centavos se redondean por línea',()=>{
  const arg=C.calculate({movement:'1.234,56',asphalt_km:'1,5',asphalt_rate:'10,25'});
  const typed=C.calculate({movement:1234.56,asphalt_km:1.5,asphalt_rate:10.25});
  assert.equal(arg.total,1249.94);assert.equal(arg.total,typed.total);assert.equal(arg.budget,1250);
  assert.equal(C.calculate({asphalt_km:0.125,asphalt_rate:0.04}).total,0.01);
  assert.equal(C.calculate({fixed_amount:'0,49',mode:'fixed'}).budget,0);
});

test('valores negativos, no numéricos, infinitos y precisiones inválidas no generan presupuestos',()=>{
  for(const movement of ['-1','10 pesos','1e5',Infinity,NaN,'1,005'])assert.throws(()=>C.calculate({movement}));
  assert.throws(()=>C.calculate({mode:'otro'}),/modalidad/);
  assert.throws(()=>C.calculate({asphalt_km:0.0001,asphalt_rate:100}),/tres decimales/);
  assert.throws(()=>C.calculate({items:[{kind:'no',quantity:1,unit_price:1}]}),/Tipo de adicional/);
  assert.throws(()=>C.calculate({movement:1e20}));
});

test('ruta con cero km de asfalto no duplica los de ripio',()=>{
  const draft=C.initial({estimated_asphalt_km:0,estimated_gravel_km:10,estimated_distance_km:10});
  assert.equal(draft.asphalt_km,0);assert.equal(draft.gravel_km,10);
  assert.equal(C.initial({estimated_distance_km:25}).asphalt_km,25);
});

test('calculadora escapa textos y no integra automáticamente sus detalles en el payload',()=>{
  const html=C.render({...C.initial(),items:[{kind:'toll',name:'<img onerror="boom">',quantity:1,unit_price:1}]});
  assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));
  assert.match(html,/el desglose de este borrador no se guarda/);
  const privateCode=fs.readFileSync('private-service-v1.js','utf8');
  const payload=privateCode.split('function payload()')[1].split('function lineasCobro')[0];
  assert.doesNotMatch(payload,/calculatorDraft|calculatorOpen/);
});

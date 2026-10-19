const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function load(file,extra={}){
  const window={localStorage:{getItem:()=>null},...extra};
  const document={readyState:'loading',addEventListener(){},getElementById:()=>null,querySelector:()=>null};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{window,document,PERFIL_USUARIO:{roles:{name:'administracion'}},setInterval:()=>0,console});
  return window;
}
const plain=v=>JSON.parse(JSON.stringify(v));

test('combustible combina fechas inclusivas, medio, texto sin acentos y estado',()=>{
  const D=load('fleet-truck-detail-v1.js').AuxiliosDetalleCamion._test;
  const rows=[
    {fuel_id:1,fuel_date:'2026-10-01',gas_station:'Estación Norte',payment_method:'efectivo'},
    {fuel_id:2,fuel_date:'2026-10-02',gas_station:'Centro',payment_method:'app',payment_app:'Mercado Pago'},
    {fuel_id:3,fuel_date:'2026-10-03',gas_station:'Estación Norte',payment_method:'efectivo'},
    {fuel_id:4,fuel_date:'2026-10-02',status:'voided',gas_station:'Estación Norte',payment_method:'efectivo'}
  ];
  const ids=(view,filters)=>Array.from(D.fuelFiltradas(rows,view,filters),x=>x.fuel_id);
  assert.deepEqual(ids('active',{from:'2026-10-01',to:'2026-10-02',payment:'efectivo',query:'estacion'}),[1]);
  assert.deepEqual(ids('active',{query:'mercado'}),[2]);
  assert.deepEqual(ids('voided',{query:'norte'}),[4]);
  assert.deepEqual(ids('active',{query:'3'}),[3]);
  assert.deepEqual(ids('active',{from:'2027-01-01'}),[]);
});

test('combustible exporta todas las páginas filtradas, sin cambiar los totales del historial',()=>{
  let result;
  const D=load('fleet-truck-detail-v1.js',{AuxiliosExcelExport:{download:o=>result=o}}).AuxiliosDetalleCamion._test;
  const rows=Array.from({length:61},(_,i)=>({fuel_id:i+1,fuel_date:'2026-10-01',liters:10,total_cost:100,payment_method:i<30?'app':'efectivo'}));
  D.set({id:1,t:{plate:'QA001'},fuelAll:rows,fuel:rows,fuelPage:2,fuelFilters:{payment:'app'}});
  const html=D.combustible();
  assert.match(html,/30 cargas activas encontradas · 300 L/);
  assert.match(html,/Historial activo · 61 cargas/);
  assert.equal((html.match(/data-ftd-carga=/g)||[]).length,5);
  D.exportFuel('xlsx');
  assert.equal(result.sheets[0].rows.length,30);
  assert.equal(result.sheets[0].columns.find(c=>c.header==='Litros').type,'number');
});

test('CSV es UTF-8, usa coma decimal, escapa saltos, comillas y fórmulas sin alterar números',()=>{
  const E=load('excel-export.js').AuxiliosExcelExport;
  const out=E.csv([{header:'Descripción',key:'name'},{header:'Importe',key:'n',type:'number'}],[
    {name:'Peaje; "Norte"\nBuenos Aires',n:1234.5},
    {name:'=HYPERLINK("peligro")',n:-12},
    {name:'  @SUM(A1)',n:null},
    {name:'\ttexto',n:'no es número'}
  ]);
  assert.ok(out.startsWith('\ufeff"Descripción";"Importe"\r\n'));
  assert.ok(out.includes('"Peaje; ""Norte""\nBuenos Aires";1234,5'));
  assert.ok(out.includes('"\'=HYPERLINK(""peligro"")";-12'));
  assert.ok(out.includes('"\'  @SUM(A1)";\r\n'));
  assert.ok(out.includes('"\'\ttexto";\r\n'));
});

test('Excel conserva orden guardado, reconcilia columnas nuevas y omite nombres de peajes por defecto',()=>{
  const prefs={current:{service:['total_price','order'],serviceOrder:['total_price','order','desconocida']}};
  const E=load('operator-billing-export.js',{localStorage:{getItem:()=>JSON.stringify(prefs)}}).OperatorBillingExcel;
  const sel=E.restoreColumnSelection('current','service');
  assert.deepEqual(plain([...sel].slice(0,2)),['total_price','order']);
  assert.ok(!sel.has('driver')&&!sel.has('plate'),'una columna que ya existía y no estaba elegida no se agrega');
  const order=plain(E.restoreColumnOrder('current','service'));
  assert.deepEqual(order.slice(0,2),['total_price','order']);
  assert.ok(!order.includes('desconocida'));
  assert.equal(new Set(order).size,order.length);
  assert.ok(!E.restoreColumnSelection('all','service').has('toll_names'));
});

test('Excel: una columna nueva (que nunca estuvo en el orden guardado) entra marcada; las que se destildaron siguen destildadas',()=>{
  const base=load('operator-billing-export.js').OperatorBillingExcel,all=base.serviceColumns.map(c=>c.id);
  const prefs={current:{service:['total_price','order'],serviceOrder:all.filter(id=>id!=='arrival')}};
  const E=load('operator-billing-export.js',{localStorage:{getItem:()=>JSON.stringify(prefs)}}).OperatorBillingExcel;
  assert.deepEqual(plain([...E.restoreColumnSelection('current','service')]),['total_price','order','arrival']);
});

test('Excel: movida y km que no corresponden por la regla de la prestadora se explican en la columna',()=>{
  const E=load('operator-billing-export.js').OperatorBillingExcel,col=id=>E.serviceColumns.find(c=>c.id===id);
  const far={quote:{movement_applied:false,distance_applied:true,movement_charge_until_km:200,covered_radius_km:10,distance_km:215.5,billable_distance_km:205.5,components:[{role:'distance_asphalt',component_type:'distance',terrain:'asphalt',subtotal:1000}]}};
  const near={quote:{movement_applied:true,distance_applied:false,movement_charge_until_km:200,covered_radius_km:10,distance_km:9.7,billable_distance_km:0,components:[{role:'movement',subtotal:50000}]}};
  assert.equal(col('movement_amount').value(far),'No corresponde: el recorrido supera 200 km (cobra movida hasta 200 km)');
  assert.equal(col('km_amount').value(far),1000);
  assert.equal(col('km_amount').value(near),'No corresponde: dentro del radio cubierto de 10 km');
  assert.equal(col('movement_amount').value(near),50000);
  assert.equal(col('billing_rule').value(far),'Sin movida: supera 200 km · Radio cubierto: se descuentan 10 km');
  assert.equal(col('billing_rule').value(near),'Sin km: dentro del radio de 10 km');
  const X=load('excel-export.js').AuxiliosExcelExport;
  assert.ok(X.worksheet);
});

test('Excel: adicionales en hoja aparte (una fila por concepto) o integrados (cantidad e importe por concepto)',()=>{
  const E=load('operator-billing-export.js').OperatorBillingExcel;
  const rows=[{service_id:'a',quote:{components:[{role:'secondary',concept_id:'x',service_name:'Extracción',quantity:1,unit_price:20000,subtotal:20000,pricing_unit:'service'},{role:'secondary',concept_id:'y',service_name:'Uso de Carros',quantity:2,unit_price:5000,subtotal:10000}]}},{service_id:'b',quote:{components:[{role:'movement',subtotal:1}]}}];
  const sheet=E.extrasSheetRows(rows);
  assert.equal(sheet.length,2);
  assert.equal(E.extrasSheetColumns.find(c=>c.id==='concept').value(sheet[1]),'Uso de Carros');
  assert.equal(E.extrasSheetColumns.find(c=>c.id==='unit').value(sheet[0]),'Servicio');
  const cols=E.withInlineExtras(E.serviceColumns.filter(c=>['order','extras_total','total_price'].includes(c.id)),rows);
  assert.deepEqual(plain(cols.map(c=>c.header)),['N° Orden','Adicionales $','Extracción · Cant.','Extracción · $','Uso de Carros · Cant.','Uso de Carros · $','Precio Total (sin peajes)']);
  assert.equal(cols[5].value(rows[0]),10000);
  assert.equal(cols[5].value(rows[1]),'');
  assert.equal(E.serviceColumns.find(c=>c.id==='extras_total').value(rows[0]),30000);
});

test('nombres de peajes siguen fuente canónica y pagador sin duplicar planeado con real',()=>{
  const E=load('operator-billing-export.js').OperatorBillingExcel;
  const tolls=[
    {service_id:'s1',source:'planned',payer_agent:'provider',toll_name_snapshot:'Planeado',quantity:1},
    {service_id:'s1',source:'actual',payer_agent:'provider',toll_name_snapshot:'Hudson',quantity:1},
    {service_id:'s1',source:'actual',payer_agent:'both',toll_name_snapshot:'Hudson',quantity:2},
    {service_id:'s1',source:'actual',payer_agent:'customer',toll_name_snapshot:'Particular',quantity:1},
    {service_id:'s2',source:'actual',payer_agent:'provider',toll_name_snapshot:'Otro servicio',quantity:1}
  ];
  assert.equal(E.tollNamesFor({service_id:'s1',quote:{toll_source:'actual'}},tolls),'Hudson ×3');
  assert.equal(E.tollNamesFor({service_id:'s1',quote:{toll_source:'planned'}},tolls),'Planeado');
  assert.throws(()=>E.tollNamesFor({service_id:'s1',quote:{}},tolls),/origen de los peajes/);
});

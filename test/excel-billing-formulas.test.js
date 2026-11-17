/* Excel de Facturación: KM Total, importes de km y totales salen como fórmulas reales de Excel.
   La fórmula sólo se escribe cuando reproduce el importe cotizado; si no (p. ej. el radio viejo
   que descontaba km), la celda queda con el número cotizado para que el Excel cierre con lo facturado. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const address=require('../address-parts-v1.js');
const kmRounding=require('../km-rounding-v1.js');

function loadExport(){
  kmRounding._setRules([]);
  const el=()=>({id:'',textContent:'',appendChild(){},remove(){}});
  const window={AuxiliosAddress:address,AuxiliosKmRounding:kmRounding,localStorage:{getItem:()=>null,setItem(){}}};
  const document={readyState:'complete',getElementById:()=>null,createElement:el,head:{appendChild(){}},body:{appendChild(){}},querySelector:()=>null,addEventListener(){}};
  vm.runInNewContext(read('operator-billing-export.js'),{window,document,console,Intl,Date,Math,Number,String,Set,Map,JSON,Object,encodeURIComponent});
  return window.OperatorBillingExcel;
}
/* Mini SheetJS: lo justo para worksheet() (celdas A1, sin estilos). */
function fakeXlsx(){
  const letter=c=>{let s='';c++;while(c>0){const m=(c-1)%26;s=String.fromCharCode(65+m)+s;c=Math.floor((c-1)/26)}return s};
  const encode_cell=({r,c})=>letter(c)+(r+1);
  return{utils:{encode_cell,encode_range:({s,e})=>encode_cell(s)+':'+encode_cell(e),aoa_to_sheet(aoa){const ws={};aoa.forEach((row,r)=>row.forEach((v,c)=>{if(v==null)return;ws[encode_cell({r,c})]={v,t:typeof v==='number'?'n':'s'}}));return ws}}};
}
function loadExcel(){
  const window={XLSX:fakeXlsx()};
  vm.runInNewContext(read('excel-export.js'),{window,document:{},console,Number,String,Math,URL:{},Blob:function(){}});
  return window.AuxiliosExcelExport;
}
const E=loadExport(),X=loadExcel(),col=new Map(E.serviceColumns.map(c=>[c.id,c]));
const IDS=['asphalt_km','gravel_km','total_km','billing_rule','asphalt_rate','gravel_rate','movement_amount','asphalt_amount','gravel_amount','km_amount','extras_total','extra_pct','surcharge_amount','total_price','tolls','total_with_tolls'];
const sheetOf=(rows,ids=IDS)=>{const cols=ids.map(id=>col.get(id));const ws=X.worksheet(cols,rows);return{ws,at:(id,row=0)=>ws[String.fromCharCode(65+ids.indexOf(id))+(row+2)]}};
/* Servicio cotizado con la regla vigente: 16,2 km de asfalto que se facturan como 16 (km enteros), recargo nocturno 20 %. */
const current={company_id:'a',scheduled_for:'2026-11-13T15:00:00Z',asphalt_km:16.2,gravel_km:0,total_km:16.2,asphalt_km_unit_price:1000,gravel_km_unit_price:1500,
  quote:{km_rounding_mode:'nearest_integer',covered_radius_km:10,covered_radius_consumption_order:'threshold_all_km',distance_km:16.2,billable_distance_km:16,distance_applied:true,movement_applied:true,
    components:[{role:'movement',component_type:'service',subtotal:40000},{role:'distance_asphalt',component_type:'distance',terrain:'asphalt',subtotal:16000},{role:'secondary',component_type:'service',subtotal:5000}],
    surcharges:[{calculation_mode:'percentage',configured_value:20,eligible_base:56000,amount:11200}],surcharge_total:11200,current_company_amount:72200,toll_total:1800,company_amount_with_tolls:74000}};

test('ya no están las columnas KM activado ni KM Facturables',()=>{
  assert.equal(col.has('activation_km'),false);
  assert.equal(col.has('billable_km'),false);
  const src=read('operator-billing-export.js');
  assert.doesNotMatch(src,/'KM activado'|'KM Facturables'/);
});

test('Tarifa KM Ripio viene marcada por defecto: Importe KM Ripio la necesita',()=>{
  assert.notEqual(col.get('gravel_rate').optional,true);
});

test('KM Total, importes de km y totales son fórmulas de Excel con el valor ya calculado',()=>{
  const {at}=sheetOf([current]);
  assert.deepEqual([at('total_km').f,at('total_km').v],['A2+B2',16]);
  assert.deepEqual([at('asphalt_amount').f,at('asphalt_amount').v],['ROUND(E2*A2,2)',16000]);
  assert.deepEqual([at('gravel_amount').f,at('gravel_amount').v],['ROUND(F2*B2,2)',0]);
  assert.deepEqual([at('km_amount').f,at('km_amount').v],['H2+I2',16000]);
  assert.deepEqual([at('surcharge_amount').f,at('surcharge_amount').v],['ROUND((G2+J2)*L2/100,2)',11200]);
  assert.deepEqual([at('total_price').f,at('total_price').v],['G2+J2+K2+M2',72200]);
  assert.deepEqual([at('total_with_tolls').f,at('total_with_tolls').v],['N2+O2',74000]);
  // Datos de origen: números, sin fórmula.
  for(const id of ['asphalt_km','asphalt_rate','movement_amount','extras_total','tolls'])assert.equal(at(id).f,undefined,id);
});

test('las fórmulas apuntan a la columna real aunque la persona reordene',()=>{
  const ids=['asphalt_amount','asphalt_rate','order','asphalt_km'];
  const {at}=sheetOf([current],[...ids,'order'].slice(0,4));
  assert.equal(at('asphalt_amount').f,'ROUND(B2*D2,2)');
  const two=sheetOf([current,current],ids);
  assert.equal(two.at('asphalt_amount',1).f,'ROUND(B3*D3,2)');
});

test('si falta una columna que la fórmula necesita, queda el número (nunca una referencia rota)',()=>{
  const {at}=sheetOf([current],['asphalt_km','asphalt_amount','km_amount','total_price']);
  assert.deepEqual([at('asphalt_amount').f,at('asphalt_amount').v],[undefined,16000]);
  assert.deepEqual([at('km_amount').f,at('km_amount').v],[undefined,16000]);
  assert.deepEqual([at('total_price').f,at('total_price').v],[undefined,72200]);
});

test('radio de 10 km: importes de km en 0 numérico, la explicación queda en Regla de cobro',()=>{
  const r={...current,asphalt_km:8,total_km:8,quote:{...current.quote,distance_km:8,billable_distance_km:0,distance_applied:false,components:current.quote.components.filter(c=>c.component_type!=='distance'),surcharges:[],surcharge_total:0,current_company_amount:45000,company_amount_with_tolls:46800}};
  const {at}=sheetOf([r]);
  for(const id of ['asphalt_amount','gravel_amount'])assert.deepEqual([at(id).v,at(id).t,at(id).f],[0,'n',undefined],id);
  assert.deepEqual([at('km_amount').v,at('km_amount').f],[0,'H2+I2']);
  assert.match(at('billing_rule').v,/dentro del radio de 10 km/);
  assert.deepEqual([at('total_price').f,at('total_price').v],['G2+J2+K2+M2',45000]);
});

test('movida que supera los 200 km: Importe Movida en 0 numérico',()=>{
  const r={...current,quote:{...current.quote,movement_applied:false,movement_charge_until_km:200,components:current.quote.components.filter(c=>c.role!=='movement'),surcharges:[{calculation_mode:'percentage',configured_value:20,amount:3200}],surcharge_total:3200,current_company_amount:24200,company_amount_with_tolls:26000}};
  const {at}=sheetOf([r]);
  assert.deepEqual([at('movement_amount').v,at('movement_amount').t],[0,'n']);
  assert.match(at('billing_rule').v,/Sin movida: supera 200 km/);
  assert.equal(at('total_price').f,'G2+J2+K2+M2');
  assert.equal(at('surcharge_amount').f,'ROUND((G2+J2)*L2/100,2)');
});

test('radio viejo (antes del 12/11) que descontaba km: queda el importe cotizado, sin fórmula',()=>{
  // 79,5 km de asfalto; el radio viejo descontó 10 y se cotizaron 69,5 × 1000.
  const r={...current,asphalt_km:79.5,total_km:79.5,quote:{...current.quote,km_rounding_mode:'decimal',covered_radius_consumption_order:'asphalt_then_gravel',distance_km:79.5,billable_distance_km:69.5,
    components:[{role:'movement',component_type:'service',subtotal:40000},{role:'distance_asphalt',component_type:'distance',terrain:'asphalt',subtotal:69500}],surcharges:[],surcharge_total:0,current_company_amount:109500,toll_total:0,company_amount_with_tolls:109500}};
  const {at}=sheetOf([r]);
  assert.deepEqual([at('asphalt_amount').f,at('asphalt_amount').v],[undefined,69500]);
  assert.equal(at('km_amount').f,'H2+I2');
  assert.equal(at('total_price').f,'G2+J2+K2+M2');
  assert.match(at('billing_rule').v,/Radio cubierto: se descuentan 10 km/);
});

test('recargos que no son un único porcentaje sobre Movida + KM quedan como número',()=>{
  const r={...current,quote:{...current.quote,surcharges:[{calculation_mode:'fixed',configured_value:5000,amount:5000}],surcharge_total:5000,current_company_amount:66000,company_amount_with_tolls:67800}};
  const {at}=sheetOf([r]);
  assert.deepEqual([at('surcharge_amount').f,at('surcharge_amount').v],[undefined,5000]);
  assert.equal(at('total_price').f,'G2+J2+K2+M2');
});

test('el CSV sigue con números: no lleva fórmulas',()=>{
  const cols=['asphalt_km','asphalt_rate','asphalt_amount'].map(id=>col.get(id));
  const out=X.csv(cols,[current]);
  assert.match(out,/"?16"?;"?1000"?;"?16000"?/);
  assert.doesNotMatch(out,/ROUND/);
});

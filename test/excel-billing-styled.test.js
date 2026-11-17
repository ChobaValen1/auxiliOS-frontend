/* Excel de Facturación con formato (ExcelJS): mismo estilo que el de Sueldos. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ExcelJS=require('../vendor/exceljs-4.4.0.min.js');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const address=require('../address-parts-v1.js');
const kmRounding=require('../km-rounding-v1.js');
kmRounding._setRules([]);
const el=()=>({appendChild(){},remove(){}});
const window={ExcelJS,AuxiliosAddress:address,AuxiliosKmRounding:kmRounding,localStorage:{getItem:()=>null,setItem(){}}};
const document={readyState:'complete',getElementById:()=>null,createElement:el,head:{appendChild(){}},body:{appendChild(){}},querySelector:()=>null,addEventListener(){}};
const ctx={window,document,console,Intl,Date,Math,Number,String,Set,Map,JSON,Object,encodeURIComponent,URL:{},Blob:function(){}};
vm.runInNewContext(read('excel-export.js'),ctx);vm.runInNewContext(read('operator-billing-export.js'),ctx);
const X=window.AuxiliosExcelExport,E=window.OperatorBillingExcel,col=id=>E.serviceColumns.find(c=>c.id===id);
const row=(o,q)=>({service_order_number:'A-1',asphalt_km:16,gravel_km:4,total_km:20,asphalt_km_unit_price:1000,gravel_km_unit_price:1500,...o,
  quote:{covered_radius_km:10,covered_radius_consumption_order:'threshold_all_km',distance_km:20,billable_distance_km:20,distance_applied:true,movement_applied:true,
    components:[{role:'movement',subtotal:40000},{component_type:'distance',terrain:'asphalt',subtotal:16000},{component_type:'distance',terrain:'gravel',subtotal:6000}],surcharges:[],surcharge_total:0,current_company_amount:62000,toll_total:1000,company_amount_with_tolls:63000,...q}});
const ids=['order','asphalt_km','gravel_km','total_km','billing_rule','asphalt_rate','gravel_rate','movement_amount','asphalt_amount','gravel_amount','km_amount','extras_total','extra_pct','surcharge_amount','total_price','tolls','total_with_tolls','notes'];
async function build(rows){
  const sheets=E.styledSheets([{name:'Servicios',columns:ids.map(col),rows}],'17/11/2026 11:30');
  const wb=X.styledWorkbook(ExcelJS,{title:'Facturación · ACME · 2026-11',sheets});
  const back=new ExcelJS.Workbook();await back.xlsx.load(await wb.xlsx.writeBuffer());return back.getWorksheet('Servicios');
}
const L=id=>String.fromCharCode(65+ids.indexOf(id));

test('título, subtítulo, franja de grupos y encabezado ámbar fijo',async()=>{
  const ws=await build([row(),row({service_order_number:'A-2'})]);
  assert.equal(ws.getCell('A1').value,'Facturación · ACME · 2026-11');
  assert.equal(ws.getCell('A2').value,'Servicios · 2 servicios · generado 17/11/2026 11:30');
  assert.equal(ws.getCell('A3').value,'Servicio');
  assert.equal(ws.getCell(L('asphalt_km')+'3').value,'Kilómetros');
  assert.equal(ws.getCell(L('billing_rule')+'3').value,'Importes');
  assert.equal(ws.getCell(L('notes')+'3').value,'Otros');
  assert.equal(ws.getCell('A4').value,'N° Orden');
  assert.equal(ws.getCell('A4').fill.fgColor.argb,'FFF5A623');
  assert.equal(ws.getCell('A4').font.bold,true);
  assert.equal(ws.views[0].state,'frozen');assert.equal(ws.views[0].ySplit,4);assert.equal(ws.views[0].xSplit,1);
  assert.equal(String(ws.autoFilter),`A4:${L('notes')}6`,'filtros desde el encabezado hasta la última fila (sin el total)');
});

test('formatos: pesos, km y porcentaje; Precio Total en negrita y Regla de cobro en gris',async()=>{
  const ws=await build([row({},{surcharges:[{calculation_mode:'percentage',configured_value:20}],surcharge_total:12400,current_company_amount:74400,company_amount_with_tolls:75400})]);
  assert.match(ws.getCell(L('total_price')+'5').numFmt,/"\$" #,##0\.00/);
  assert.match(ws.getCell(L('asphalt_rate')+'5').numFmt,/"\$"/);
  assert.equal(ws.getCell(L('total_km')+'5').numFmt,'#,##0.0');
  assert.equal(ws.getCell(L('extra_pct')+'5').numFmt,'0.##" %"');
  assert.equal(ws.getCell(L('total_price')+'5').font.bold,true);
  assert.equal(ws.getCell(L('billing_rule')+'5').font.italic,true);
});

test('las fórmulas siguen siendo fórmulas, con el resultado ya calculado',async()=>{
  const ws=await build([row()]);
  const c=ws.getCell(L('asphalt_amount')+'5').value;
  assert.equal(c.formula,`ROUND(${L('asphalt_rate')}5*${L('asphalt_km')}5,2)`);assert.equal(c.result,16000);
  assert.equal(ws.getCell(L('total_with_tolls')+'5').value.formula,`${L('total_price')}5+${L('tolls')}5`);
});

test('fila TOTAL con SUBTOTAL (suma lo filtrado), sin sumar tarifas ni porcentajes',async()=>{
  const ws=await build([row(),row({service_order_number:'A-2'})]);
  assert.equal(ws.getCell('A7').value,'TOTAL · 2 servicios');
  const t=ws.getCell(L('total_price')+'7').value;
  assert.equal(t.formula,`SUBTOTAL(109,${L('total_price')}5:${L('total_price')}6)`);assert.equal(t.result,124000);
  assert.equal(ws.getCell(L('total_km')+'7').value.formula,`SUBTOTAL(109,${L('total_km')}5:${L('total_km')}6)`);
  for(const id of ['asphalt_rate','gravel_rate','extra_pct'])assert.equal(ws.getCell(L(id)+'7').value,null,id);
});

test('Facturación descarga con formato y carga ExcelJS recién al exportar',()=>{
  const src=read('operator-billing-export.js'),xs=read('excel-export.js');
  assert.match(src,/await excel\(\)\.downloadStyled\(\{filename:fileBase\(picker\.S,picker\.label\)/);
  assert.match(src,/await excel\(\)\.downloadStyled\(\{filename:fileBase\(S,label\)/);
  assert.match(xs,/\/vendor\/exceljs-4\.4\.0\.min\.js/);
  assert.match(xs,/fullCalcOnLoad=true/);
});

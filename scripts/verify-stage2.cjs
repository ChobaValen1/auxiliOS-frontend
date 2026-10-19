/* Browser QA with isolated data. No credentials, production reads or writes. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../output/etapa-2');
const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/sigma.css"><link rel="stylesheet" href="/ui/tokens.css"><link rel="stylesheet" href="/ui/components.css"><link rel="stylesheet" href="/fleet-truck-detail-v1.css">
<style>body{display:block;overflow:auto;padding:16px}main{max-width:1400px;margin:auto}</style>
<main><h1>Combustible · móvil QA001</h1><button id="export" onclick="OperatorBillingExcel.exportCurrent()">Excel de facturación</button><div id="camion-cards-container"></div></main>
<script>
window.PERFIL_USUARIO={roles:{name:'administracion'}};window.messages=[];window.downloads=[];window.calls=[];
window.toast=(message,type)=>messages.push({message,type});window.confirmarDescarga=()=>{};
window.fuel=Array.from({length:61},(_,i)=>({fuel_id:i+1,truck_id:1,log_id:101,fuel_date:i<30?'2026-10-01':'2026-10-02',gas_station:i<30?'Estación Norte':'Centro',payment_method:i<30?'app':'efectivo',payment_app:i<30?'Mercado Pago':null,liters:10,price_per_liter:100,total_cost:1000,km_at_load:200000-i*80,status:'active'}));
fuel.push({fuel_id:90,truck_id:1,fuel_date:'2026-10-02',gas_station:'Duplicada',payment_method:'efectivo',liters:20,total_cost:2000,status:'voided'});
window.services=[{service_id:'s1',service_order_number:'QA001',scheduled_for:'2026-10-01T15:00:00Z',company_name:'Prestadora de prueba',quote:{toll_total:450,toll_source:'actual',current_company_amount:12345.67}},{service_id:'s2',service_order_number:'QA002',scheduled_for:'2026-10-02T16:00:00Z',quote:{toll_total:100,toll_source:'planned',current_company_amount:999}}];
window.tolls=[{service_toll_id:'t1',service_id:'s1',toll_name_snapshot:'Hudson',payer_agent:'provider',source:'actual',quantity:2},{service_toll_id:'t2',service_id:'s1',toll_name_snapshot:'Ignorar planeado',payer_agent:'provider',source:'planned',quantity:1},{service_toll_id:'t3',service_id:'s2',toll_name_snapshot:'Samborombón',payer_agent:'provider',source:'planned',quantity:1}];
window.OperatorBilling={S:{rows:services,tollRows:[],selected:new Set(['s1']),tab:'services',period:'2026-10',loading:false}};
window._db={rpc:async(name,args)=>{calls.push({name,args});if(window.holdRpc)await new Promise(resolve=>window.releaseRpc=resolve);if(window.rpcFail)return{error:{message:'Sin conexión de prueba'}};return{data:{rows:services.filter((r,i)=>args.p_service_ids.includes(r.service_id)&&!(window.omitRow&&i===1))}}},from:()=>{let ids;return{select(){return this},in(key,values){ids=values;return this},order(){return this},range:async(a,b)=>({data:tolls.filter(t=>ids.includes(t.service_id)).slice(a,b+1)})}}};
window.XLSX={utils:{aoa_to_sheet:aoa=>({data:aoa}),encode_cell:({r,c})=>r+':'+c,encode_range:()=>'',book_new:()=>({SheetNames:[],Sheets:{}}),book_append_sheet:(wb,ws,name)=>{wb.SheetNames.push(name);wb.Sheets[name]=ws}},writeFile:(wb,filename)=>downloads.push({wb,filename})};
</script><script src="/excel-export.js"></script><script src="/fleet-truck-detail-v1.js"></script><script src="/operator-billing-export.js"></script>
<script>
window.D=AuxiliosDetalleCamion._test;
D.set({id:1,t:{truck_id:1,plate:'QA001',current_km:200000},tab:'combustible',fuelAll:fuel,fuel:fuel.filter(f=>!D.fuelAnulado(f))});
document.getElementById('camion-cards-container').innerHTML=D.combustible();
</script></html>`;
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/__qa'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html)}
  const file=path.resolve(root,'.'+decodeURIComponent(pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end()}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/javascript');res.end(fs.readFileSync(file));
});
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/__qa');
  await page.locator('[data-ftd-fuel-form] [name=from]').fill('2026-10-01');await page.locator('[data-ftd-fuel-form] [name=to]').fill('2026-10-01');
  await page.locator('[data-ftd-fuel-form] [name=payment]').selectOption('app');await page.locator('[data-ftd-fuel-form] [name=query]').fill('estacion');
  await page.locator('[data-ftd-fuel-form] [type=submit]').click();
  assert.match(await page.locator('.ftd-fuel-results').innerText(),/30 cargas activas encontradas/);
  assert.match(await page.locator('tfoot').innerText(),/610 L/);
  await page.locator('[data-ftd=fuel-next]').click();assert.equal(await page.locator('[data-ftd-carga]').count(),5);
  await page.locator('[data-ftd=fuel-excel]').click();assert.equal(await page.evaluate(()=>downloads.at(-1).wb.Sheets.Combustible.data.length),31);
  const csvDownload=page.waitForEvent('download');await page.locator('[data-ftd=fuel-csv]').click();const csv=await csvDownload;
  await csv.saveAs(path.join(out,'combustible-filtrado.csv'));assert.ok(fs.readFileSync(path.join(out,'combustible-filtrado.csv'),'utf8').startsWith('\ufeff'));
  assert.equal(fs.readFileSync(path.join(out,'combustible-filtrado.csv'),'utf8').split('\r\n').length,32);
  await page.locator('[data-ftd-fuel-form] [name=from]').fill('2026-10-03');await page.locator('[data-ftd-fuel-form] [type=submit]').click();
  assert.match(await page.locator('.ftd-fuel-error').innerText(),/posterior/);assert.equal(await page.locator('[data-ftd-carga]').count(),5);
  await page.locator('[data-ftd=fuel-reset]').click();assert.match(await page.locator('.ftd-fuel-results').innerText(),/61 cargas/);
  await page.screenshot({path:path.join(out,'combustible-desktop.png'),fullPage:true});
  await page.locator('#export').click();
  await page.locator('[data-obx-deselect-all=service]').click();
  for(const id of ['order','date','toll_names','tolls'])await page.locator('[data-obx-col="'+id+'"]').check();
  await page.locator('[data-obx-key=date][data-obx-move="-1"]').click();
  await page.locator('[data-obx-picker-export]').click();await page.waitForFunction(()=>!document.getElementById('obx-picker-backdrop'));
  assert.deepEqual(await page.evaluate(()=>downloads.at(-1).wb.Sheets.Servicios.data[0]),['Fecha','N° Orden','Peajes','Nombres de peajes (prestadora)']);
  assert.deepEqual(await page.evaluate(()=>downloads.at(-1).wb.Sheets.Servicios.data[1]),['01/10/2026','QA001',450,'Hudson ×2']);
  await page.locator('#export').click();assert.equal(await page.locator('[data-obx-col]').first().getAttribute('data-obx-col'),'date');
  assert.equal(await page.locator('[data-obx-col=toll_names]').isChecked(),true);
  const body=page.locator('.obx-picker-body');await body.evaluate(el=>el.scrollTop=el.scrollHeight);
  const scroll=await body.evaluate(el=>el.scrollTop);await page.locator('[data-obx-col=toll_names]').uncheck();assert.equal(await body.evaluate(el=>el.scrollTop),scroll);
  await page.evaluate(()=>window.rpcFail=true);await page.locator('[data-obx-picker-export]').click();
  await page.waitForFunction(()=>messages.some(m=>m.message==='Sin conexión de prueba'));
  assert.equal(await page.locator('[data-obx-col=toll_names]').isChecked(),false);
  await page.evaluate(()=>{window.rpcFail=false;window.omitRow=true});const count=await page.evaluate(()=>downloads.length);
  await page.locator('[data-obx-picker-export]').click();await page.waitForFunction(()=>messages.some(m=>m.message.includes('archivo parcial')));assert.equal(await page.evaluate(()=>downloads.length),count);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#obx-picker-backdrop').count(),0);
  await page.evaluate(()=>{window.omitRow=false;window.holdRpc=true});await page.locator('#export').click();await page.locator('[data-obx-picker-export]').click();
  await page.waitForFunction(()=>typeof releaseRpc==='function');await page.keyboard.press('Escape');await page.evaluate(()=>{holdRpc=false;releaseRpc()});
  await page.waitForFunction(()=>!document.getElementById('obx-picker-backdrop'));assert.equal(await page.evaluate(()=>downloads.length),count);
  await page.locator('#export').click();await page.screenshot({path:path.join(out,'columnas-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'columnas-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const footer=await page.locator('.obx-picker>footer').boundingBox();assert.ok(footer.y+footer.height<=844);
  await page.keyboard.press('Escape');await page.screenshot({path:path.join(out,'combustible-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>{PERFIL_USUARIO.roles.name='supervision';document.getElementById('camion-cards-container').innerHTML=D.combustible()});
  assert.equal(await page.locator('[data-ftd=editar-carga],[data-ftd=anular-carga],[data-ftd=carga]').count(),0);
  await page.locator('[data-ftd=fuel-excel]').click();assert.equal(await page.evaluate(()=>downloads.at(-1).wb.Sheets.Combustible.data.length),62);
  await page.locator('[data-ftd-fuel-form] [name=query]').fill('Sin coincidencia de prueba');await page.locator('[data-ftd-fuel-form] [type=submit]').click();
  assert.equal(await page.locator('[data-ftd=fuel-excel]').isDisabled(),true);assert.equal(await page.locator('[data-ftd=fuel-csv]').isDisabled(),true);
  assert.deepEqual(errors,[]);console.log('Stage 2 QA OK: filtros, páginas, exportación completa, CSV, orden persistido, peajes canónicos, error/reintento, cancelación, permisos de lectura y móvil. '+out);
 }finally{await browser?.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});

/* Actual Historial list renderers, with read-only fixture responses and no writes. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{html:base}=require('./verify-service-list.cjs');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../output/history-list-v563');
const renderer=fs.readFileSync(path.join(root,'sigma.js'),'utf8').match(/function renderTablaRemitos\(data\) \{[\s\S]*?\n\}/)[0];
const fixture=`
window.qaTolls=[{toll_name:'Alberti',total_amount:11200,quantity:1,payer_agent:'provider',display_status:'approved'},{toll_name:'Dellepiane Norte',total_amount:11000,quantity:1,payer_agent:'provider',display_status:'approved'}];
const originalRpc=_db.rpc;_db.rpc=async(name,args)=>{if(name!=='get_history_list_tolls_v1')return originalRpc(name,args);calls.push(name);return{data:{services:(args.p_service_ids||[]).map(id=>({service_id:id,history_tolls:id==='H0'?qaTolls:id==='H1'?[{toll_name:'Peaje previsto sin remito',total_amount:4000,quantity:1,payer_agent:'provider',display_status:'planned'}]:[]})),remitos:(args.p_remito_ids||[]).map(id=>({remito_id:id,history_tolls:qaTolls}))}};};
window._rmxSeleccion=()=>new Map();window._rmxEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window._rmxEstadoHTML=()=>'<span>Aprobado</span>';window._rmxSyncSeleccionUI=()=>{};window.USUARIO_ACTUAL={id:'driver'};
${renderer}
window.showDriverHistory=async()=>{const root=document.getElementById('qa-driver');root.hidden=false;document.body.replaceChildren(root);document.body.className='';document.body.style.display='block';PERFIL_USUARIO.roles.name='chofer';const remitos=[{id:1,nro:'REM-QA',srvOrden:'4389703-1',fecha:'23/10/26 13:00',cliente:'Cliente de prueba',patente:'AA 123 BB',estado:'firmado',peaje:'0',excedente:'0',otros:'0',pago:'—',addonsVersion:2}];await AuxiliosHistoryTolls.enrichRemitos(remitos,_db);renderTablaRemitos(remitos);};
`;
const driver=`<main id="qa-driver" class="main" style="margin:0;width:100%;padding:16px" hidden><section id="screen-remitos" class="screen active"><h2>Servicios · Historial</h2><div class="card desktop-only rmx-table-card" style="overflow-x:auto"><table class="data-table rmx-table" id="tabla-remitos"><thead><tr>${['','N° servicio','Fecha','Cliente','Vehículo','Tipo de servicio','Peajes','Cobrado en el lugar','Medio de pago','Estado','Acciones'].map(t=>'<th>'+t+'</th>').join('')}</tr></thead><tbody id="tbody-remitos"></tbody></table></div><div class="remitos-container-mobile" id="mobile-remitos-list"></div></section></main>`;
const html=base.replace('</script><script src="/ui/theme-v1.js">',fixture+'</script><script src="/ui/history-tolls-list-v1.js"></script><script src="/ui/theme-v1.js">').replace('</body>',driver+'</body>');
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html);}const f=path.resolve(root,'.'+pathname);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.statusCode=404;return res.end();}res.setHeader('Content-Type',f.endsWith('.css')?'text/css':f.endsWith('.svg')?'image/svg+xml':'text/javascript');res.end(fs.readFileSync(f));});
(async()=>{fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('#nav-operaciones').click();await page.mouse.move(1000,120);await page.locator('#os-view-history').focus();await page.locator('#os-view-history').press('Enter');
  const row=page.locator('#os-table-body tr[data-service-id="H0"]');await row.locator('.col-history_tolls').getByText('Alberti',{exact:true}).waitFor();
  assert.match(await row.locator('.col-history_tolls').innerText(),/22.200/);assert.match(await row.locator('.col-history_tolls').innerText(),/Dellepiane Norte/);
  assert.match(await page.locator('#os-table-body tr[data-service-id="H1"] .col-history_tolls').innerText(),/Previsto/);
  assert.equal(await page.evaluate(()=>qaViewed),null,'no detail was opened');await row.locator('.col-history_tolls').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(out,'operator-history-desktop.png'),fullPage:true});
  await page.evaluate(()=>showDriverHistory());
  await page.locator('#screen-remitos').evaluate(e=>e.style.setProperty('display','block','important'));
  await page.locator('#tbody-remitos .rmx-col-tolls').getByText('Alberti',{exact:true}).waitFor({timeout:3000});
  assert.match(await page.locator('#tbody-remitos .rmx-col-tolls').innerText(),/22.200/);assert.equal(await page.locator('#tbody-remitos .rmx-money').innerText(),'—','provider tolls do not become customer cash');
  await page.screenshot({path:path.join(out,'driver-history-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#mobile-remitos-list .hlt').isVisible(),true);assert.match(await page.locator('#mobile-remitos-list').innerText(),/Alberti/);assert.match(await page.locator('#mobile-remitos-list').innerText(),/Dellepiane Norte/);assert.ok(await page.evaluate(()=>document.body.scrollWidth<=innerWidth+1),'mobile has no horizontal overflow');
  await page.screenshot({path:path.join(out,'driver-history-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,operatorList:true,driverTable:true,driverCards:true,consoleErrors:errors,output:out}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});

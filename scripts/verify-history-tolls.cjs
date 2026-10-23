/* Real history renderers; read-only API fixtures. Never creates payments or services. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../output/history-tolls-v561');
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/sigma.css"><link rel="stylesheet" href="/remitos-admin-panel-v1.css"><link rel="stylesheet" href="/remito-addons-v2.css"><link rel="stylesheet" href="/ui/theme-light-v1.css">
<style>body{display:block;padding:16px;margin:0}#driver-detail{max-width:560px;padding:12px;background:var(--panel);border:1px solid var(--border);border-radius:12px}</style>
<button id="open-admin" onclick="RemitoPanel.open(1)">Ver remito</button><section id="driver-detail" hidden></section>
<script>
window.PERFIL_USUARIO={roles:{name:'administracion'}};window.calls=[];
window.historyData={service_id:'s',service_tolls_approved:true,review_status:'approved',toll_coverage_mode:'provider_roundtrip',accepted_toll_total:22200,tolls:[],excesses:[],approved_tolls:[{toll_name:'Peaje 25 de Mayo - Alberti',total_amount:11200,quantity:1,payer_agent:'provider'},{toll_name:'Peaje Dellepiane Norte (CABA a BSAS)',total_amount:11000,quantity:1,payer_agent:'provider'}]};
window.obtenerRemitoCompleto=async()=>({remito_id:1,operator_service_id:'s',nro_remito:'REMITO DE PRUEBA',nro_servicio:'4389703-1',status:'firmado',addons_version:2,addons_review_status:'approved',imp_peaje:0,imp_excedente:0,imp_total_extras:0,accepted_imp_peaje:22200,accepted_imp_total_extras:22200,razon_social:'Cliente de prueba',patente:'AA 123 BB',origen:'Origen',destino:'Destino',foto_urls:[]});
window._db={rpc:async(name,args)=>{calls.push(name);if(name==='get_driver_remito_history_v3')return{data:historyData};if(name==='get_remitos_service_info_v1')return{data:[{service_id:'s',service_order_number:'4389703-1'}]};if(name==='get_service_collection_v1')return{data:null};throw Error('Unexpected RPC: '+name);},from:name=>{if(!['remito_surveys','remito_public_links'].includes(name))throw Error('Unexpected table');return{select(){return this},eq(){return this},maybeSingle:async()=>({data:null})}}};
</script><script src="/remitos-admin-panel-v1.js"></script><script src="/remito-addons-v2.js"></script>`;
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html);}const f=path.resolve(root,'.'+u.pathname);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.statusCode=404;return res.end();}res.setHeader('Content-Type',f.endsWith('.css')?'text/css':f.endsWith('.svg')?'image/svg+xml':'text/javascript');res.end(fs.readFileSync(f));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));fs.mkdirSync(out,{recursive:true});let browser;
try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('http://127.0.0.1:'+server.address().port);
  for(const theme of ['dark','light'])for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:900});await page.evaluate(t=>{document.documentElement.dataset.theme=t;document.getElementById('driver-detail').hidden=true;},theme);
    await page.locator('#open-admin').click();const panel=page.locator('#rmp-panel');await panel.getByText('Total aprobado',{exact:true}).waitFor();
    await panel.evaluate(async e=>{await Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{})));});
    assert.match(await panel.innerText(),/22\.200/);assert.match(await panel.innerText(),/Alberti/);assert.match(await panel.innerText(),/Dellepiane Norte/);
    assert.match(await panel.innerText(),/A cargo de la prestadora/);assert.match(await panel.innerText(),/Peajes cobrados al cliente/);
    assert.ok(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'admin has no horizontal overflow');
    if(width===390)await page.screenshot({path:path.join(out,'admin-'+theme+'.png'),fullPage:true});
    await panel.getByRole('button',{name:'Cerrar',exact:true}).click();await panel.waitFor({state:'hidden'});
    await page.evaluate(async()=>{const host=document.getElementById('driver-detail');host.hidden=false;await AuxiliosRemitoAddonsV2.renderHistory(1,host);});
    const driver=page.locator('#driver-detail');assert.match(await driver.innerText(),/Alberti/);assert.match(await driver.innerText(),/Dellepiane Norte/);assert.doesNotMatch(await driver.innerText(),/no hubo peajes/);
    assert.ok(await driver.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'driver has no horizontal overflow');
    if(width===390)await page.screenshot({path:path.join(out,'driver-'+theme+'.png'),fullPage:true});
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,viewports:3,themes:2,views:['admin','driver'],consoleErrors:errors,output:out}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});

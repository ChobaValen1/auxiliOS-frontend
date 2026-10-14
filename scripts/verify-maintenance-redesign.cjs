/* Browser verification with isolated fixtures; never writes production data. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const out = path.resolve(root, '../output/maintenance-redesign');
const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/sigma.css"><link rel="stylesheet" href="/ui/tokens.css"><link rel="stylesheet" href="/ui/components.css"><link rel="stylesheet" href="/fleet-truck-detail-v1.css">
<style>body{display:block;overflow:auto;padding:24px}main{max-width:1450px;margin:auto}.qa-records{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0}.qa-records article{padding:12px;border:1px solid var(--border)}button{cursor:pointer}</style>
<main><h1>Control de camión · QA 01</h1><div id="camion-cards-container"></div>
<section class="qa-records"><article class="empv2-plain-card"><h2>Contacto</h2><div class="empv2-card-actions"><button onclick="window.iconClicks++">Editar</button><button>Desactivar</button></div></article><article class="cfg-card"><h2>Configuración</h2><button>Eliminar</button><button>Crear</button></article><div class="empv2-actions-menu"><button>Modificar</button><button>Deshabilitar</button></div></section></main>
<script>
window.PERFIL_USUARIO={roles:{name:'administracion'}}; window.iconClicks=0;window.calls=[];window.refreshes=0;
window.closeModal=id=>document.getElementById(id).classList.remove('open');window.cargarScreenCamion=async()=>{};window.toast=()=>{};
window.fuel=Array.from({length:61},(_,i)=>({fuel_id:i+1,truck_id:1,fuel_date:'2026-10-09',liters:10,price_per_liter:1234.56,total_cost:12345.6,km_at_load:200000-i*70,payment_method:'efectivo',gas_station:'Estación de prueba',status:'active'}));
window.fuel.push({fuel_id:90,truck_id:1,fuel_date:'2026-10-08',liters:25,total_cost:99999,price_per_liter:3999.96,status:'voided',void_reason:'Registro duplicado'});
window._db={from(){let id;return {select(){return this},eq(key,v){if(key==='fuel_id')id=v;return this},single:async()=>({data:window.fuel.find(f=>f.fuel_id===id)})}},rpc:async(name,args)=>{window.calls.push({name,args});if(window.rpcFail)return {error:{message:'Error de prueba'}};let r=window.fuel.find(f=>f.fuel_id===args.p_fuel_id);if(name==='void_fuel_record'){r.status='voided';r.void_reason=args.p_reason;}if(name==='restore_fuel_record'){r.status='active';r.voided_at=null;}if(name==='update_fuel_record')Object.assign(r,args.p_payload,{total_cost:args.p_payload.liters*args.p_payload.price_per_liter});return {data:{}};}};
</script><script src="/fleet-truck-detail-v1.js"></script><script src="/fuel-admin-editor.js"></script>
<script>
window.D=AuxiliosDetalleCamion._test;
window.draw=function(tab='mantenimiento'){D.set({id:1,t:{truck_id:1,plate:'QA 001',brand:'Iveco',current_km:200000},tab,fuelAll:window.fuel,fuel:window.fuel.filter(f=>!D.fuelAnulado(f)),planes:[{plan_id:1,name:'Motor y filtros',interval_km:20000,next_due_km:215000,km_restantes:15000,plan_estado:'al_dia'},{plan_id:2,name:'Equipo hidráulico',interval_hours:500,next_due_hours:3000,horas_restantes:100,manda:'horas',plan_estado:'proximo'}],services:[{maintenance_id:1,performed_at:'2026-10-05',km_at_service:195000,cost:125000,workshop_name:'Taller central',notes:'Cambio de filtros y aceite',master_service_plans:{name:'Motor y filtros'}},{maintenance_id:2,performed_at:'2026-09-25',hours_at_service:2500,cost:150000,workshop_name:'Taller hidráulico',master_service_plans:{name:'Equipo hidráulico'}}]});document.getElementById('camion-cards-container').innerHTML=tab==='mantenimiento'?D.mantenimiento():D.combustible();};
AuxiliosDetalleCamion.recargar=async()=>{window.refreshes++;draw('combustible');};draw();
</script></html>`;
const server = http.createServer((req,res)=>{
  const pathname = new URL(req.url,'http://localhost').pathname;
  if(pathname==='/__qa'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
  const file=path.resolve(root,'.'+decodeURIComponent(pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/javascript');res.end(fs.readFileSync(file));
});
(async()=>{
  fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,channel:process.env.QA_BROWSER_CHANNEL || 'msedge'});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/__qa`);
    const columns=await page.locator('.ftd-maintenance-grid > section').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));
    assert.ok(Math.abs(columns[0]/columns[1]-2/3)<.02,'40/60 layout');
    assert.equal(await page.locator('[data-ftd="editar-service"]').first().innerText(),'Editar');
    assert.equal(await page.locator('.empv2-actions-menu button').first().innerText(),'Modificar');
    assert.equal(await page.locator('.cfg-card button:has-text("Crear").aux-record-action').count(),0);
    await page.locator('.empv2-card-actions button').first().click();assert.equal(await page.evaluate(()=>iconClicks),1);
    await page.screenshot({path:path.join(out,'maintenance-desktop.png'),fullPage:true});
    await page.evaluate(()=>draw('combustible'));
    assert.equal(await page.locator('[data-ftd-carga]').count(),25);
    const totals=await page.locator('tfoot').innerText();assert.match(totals,/610 L/);assert.match(totals,/1.234,56/);
    await page.locator('[data-ftd="fuel-next"]').click();assert.match(await page.locator('.ftd-fuel-pages').innerText(),/Página 2 de 3/);
    assert.equal(await page.locator('tfoot').innerText(),totals);
    await page.locator('[data-ftd="fuel-voided"]').click();assert.equal(await page.locator('[data-ftd-carga]').count(),1);assert.equal(await page.locator('[data-ftd="editar-carga"]').count(),0);
    await page.locator('[data-ftd="restaurar-carga"]').click();await page.locator('#fuel-state-admin textarea').fill('Carga válida de prueba');await page.locator('#fuel-state-admin [type="submit"]').click();
    assert.equal(await page.evaluate(()=>calls.at(-1).name),'restore_fuel_record');assert.equal(await page.evaluate(()=>refreshes),1);
    await page.locator('[data-ftd="fuel-active"]').click();
    await page.locator('[data-ftd="anular-carga"]').first().click();await page.locator('#fuel-state-admin textarea').fill('  ab ');
    await page.locator('#fuel-state-admin [type="submit"]').click();assert.equal(await page.evaluate(()=>calls.length),1);
    await page.locator('#fuel-state-admin textarea').fill('Registro de prueba duplicado');await page.evaluate(()=>window.rpcFail=true);
    await page.locator('#fuel-state-admin [type="submit"]').click();assert.match(await page.locator('#fuel-state-admin [role="alert"]').innerText(),/Error de prueba/);
    assert.equal(await page.locator('#fuel-state-admin textarea').inputValue(),'Registro de prueba duplicado');
    await page.evaluate(()=>window.rpcFail=false);await page.locator('#fuel-state-admin [type="submit"]').click();assert.equal(await page.evaluate(()=>calls.at(-1).name),'void_fuel_record');
    await page.locator('[data-ftd="editar-carga"]').first().click();await page.locator('#fuel-edit-admin [name="liters"]').fill('12,5');await page.locator('#fuel-edit-admin [name="reason"]').fill('Corregir litros de prueba');await page.locator('#fuel-edit-admin [type="submit"]').click();
    assert.equal(await page.evaluate(()=>calls.at(-1).args.p_payload.liters),12.5);
    await page.screenshot({path:path.join(out,'fuel-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>draw());
    const rects=await page.locator('.ftd-maintenance-grid > section').evaluateAll(ns=>ns.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));
    assert.equal(rects[0].x,rects[1].x);assert.ok(rects[1].y>rects[0].y);
    assert.equal(await page.locator('.ftd-services th').nth(3).isVisible(),true);
    await page.screenshot({path:path.join(out,'maintenance-mobile.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.evaluate(()=>draw('combustible'));await page.screenshot({path:path.join(out,'fuel-mobile.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.evaluate(()=>{PERFIL_USUARIO.roles.name='supervision';draw('combustible');});assert.equal(await page.locator('[data-ftd="editar-carga"], [data-ftd="anular-carga"]').count(),0);
    const before=await page.evaluate(()=>calls.length);await page.evaluate(()=>cambiarEstadoCargaCombustibleAdmin(2,false,1));assert.equal(await page.evaluate(()=>calls.length),before);
    assert.deepEqual(errors,[]);console.log('Browser QA OK: layout, responsive, original actions, menus, pagination, totals, editing, void/restore, errors and permissions. Screenshots: '+out);
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

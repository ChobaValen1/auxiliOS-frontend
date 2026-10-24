// Browser QA with simulated queue only. No real service actions or writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=process.cwd(),out=fs.mkdtempSync(path.join(os.tmpdir(),'auxilios-card-gesture-'));
const row={service_id:'qa-1',service_order_number:'PRUEBA-100',company_name:'Prestadora de prueba',status:'assigned',vehicle_plate:'AB123CD',vehicle_make_model:'Ford Fiesta',origin:'Origen de prueba',destination:'Destino de prueba',customer_name:'Cliente de prueba',customer_phone:'1155551234',can_complete_remito:true};
const html='<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui/tokens.css"><link rel="stylesheet" href="/ui/components.css"><link rel="stylesheet" href="/operator-service-bridge.css"><link rel="stylesheet" href="/chofer-servicios-ax-v1.css"><style>body{background:#101622;color:#edf1f7;font-family:Arial;margin:20px}main{max-width:500px;margin:auto}</style><main><section id="screen-remitos"></section></main><script>window.PERFIL_USUARIO={roles:{name:"chofer"}};window.toast=()=>{};window._db={rpc:async()=>({data:['+JSON.stringify(row)+']})};</script><script src="/operator-service-bridge.js"></script></html>';
const app=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('content-type','text/html');res.end(html);return}
 const file=path.resolve(root,'.'+req.url.split('?')[0]);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return}
 res.setHeader('content-type',file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/javascript');res.end(fs.readFileSync(file))});
(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
try{for(const reduced of [false,true]){
 const page=await browser.newPage({viewport:{width:390,height:740},hasTouch:true,reducedMotion:reduced?'reduce':'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+app.address().port);
 const card=page.locator('.p3-driver-task').first(),modal=page.locator('#p3-service-preview'),sheet=modal.locator(':scope > section');
 await card.waitFor();await card.locator('.p3-task-vehicle').click();assert.equal(await modal.isVisible(),true);
 await page.getByRole('dialog').getByRole('button',{name:'Cerrar',exact:true}).click();assert.equal(await modal.isVisible(),false);
 assert.equal(await card.evaluate(el=>el.contains(document.activeElement)),true);
 // Clicking a nested quick link must never open the service preview.
 await page.evaluate(()=>document.addEventListener('click',ev=>{if(ev.target.closest('a'))ev.preventDefault()},true));
 const link=card.locator('a').first();if(await link.count()){await link.click();assert.equal(await modal.isVisible(),false)}
 await card.locator('.p3-task-secondary').focus();await page.keyboard.press('Enter');assert.equal(await modal.isVisible(),true);
 await page.waitForTimeout(350);
 const cdp=await page.context().newCDPSession(page);
 async function swipe(dx,dy){
   const box=await sheet.boundingBox(),x=box.x+box.width*.5,y=box.y+15;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/8,y:y+dy*i/8}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }
 await swipe(0,20);await page.waitForTimeout(220);assert.equal(await modal.isVisible(),true);
 await swipe(90,12);await page.waitForTimeout(220);assert.equal(await modal.isVisible(),true);
 await swipe(0,130);await page.waitForFunction(()=>document.getElementById('p3-service-preview').hidden);
 assert.equal(await card.evaluate(el=>el.contains(document.activeElement)),true);
 await card.locator('.p3-task-vehicle').click();await page.waitForTimeout(350);
 await sheet.evaluate(el=>{el.scrollTop=90});assert.ok(await sheet.evaluate(el=>el.scrollTop)>0);
 // Starting below the top must scroll, not dismiss.
 const box=await sheet.boundingBox(),x=box.x+box.width*.8,y=box.y+120;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+65}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.equal(await modal.isVisible(),true);
 await sheet.evaluate(el=>el.scrollTop=0);await swipe(0,130);await page.waitForFunction(()=>document.getElementById('p3-service-preview').hidden);
 // Same preview behavior for a saved unassigned service.
 await page.evaluate(()=>actualizarRemitosActivosChofer([{id:999,estado:'pendiente',documentSource:'driver_ad_hoc',nroSrv:'QA-SIN-ASIGNAR',patente:'TEST123',origen:'Origen',destino:'Destino'}]));
 const draft=page.locator('[data-remito-id="999"]');await draft.locator('.p3-task-vehicle').click();assert.equal(await modal.isVisible(),true);
 await page.waitForTimeout(350);await swipe(0,130);await page.waitForFunction(()=>document.getElementById('p3-service-preview').hidden);
 await card.locator('.p3-task-vehicle').click();await page.waitForTimeout(350);
 await page.screenshot({path:path.join(out,reduced?'reduced.png':'preview.png'),fullPage:true});
 await page.keyboard.press('Escape');assert.equal(await modal.isVisible(),false);
 assert.deepEqual(errors,[]);await cdp.detach();await page.close();
 }console.log(JSON.stringify({ok:true,fullCard:true,nestedLinks:true,touchSwipe:true,shortDragReset:true,scrollPreserved:true,unassigned:true,reducedMotion:true,screenshots:out}));
 }finally{await browser.close();app.close()}
})().catch(e=>{console.error(e);app.close();process.exitCode=1});

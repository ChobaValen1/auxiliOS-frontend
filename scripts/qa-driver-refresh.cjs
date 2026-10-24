const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=process.cwd(),out=fs.mkdtempSync(path.join(os.tmpdir(),'auxilios-refresh-'));
const html='<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui/tokens.css"><link rel="stylesheet" href="/operator-service-bridge.css"><link rel="stylesheet" href="/chofer-servicios-ax-v1.css"><link rel="stylesheet" href="/ui/components.css"><style>body{background:#101622;color:#edf1f7;font-family:Arial;margin:20px}main{max-width:500px;margin:auto}</style><main><section id="screen-remitos"></section></main><script>window.PERFIL_USUARIO={roles:{name:"chofer"}};window.toast=()=>{};window._db={rpc:async()=>({data:[]})};</script><script src="/operator-service-bridge.js"></script></html>';
const app=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('content-type','text/html');res.end(html);return}
 const file=path.resolve(root,'.'+req.url.split('?')[0]);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return}
 res.setHeader('content-type',file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/javascript');res.end(fs.readFileSync(file))});
(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
try{for(const reduced of [false,true]){
 const page=await browser.newPage({viewport:{width:390,height:800},reducedMotion:reduced?'reduce':'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+app.address().port);const button=page.getByRole('button',{name:'Actualizar',exact:true});await button.waitFor();
 await page.waitForFunction(()=>!AuxiliosPhase3.loading);
 await page.evaluate(()=>{window.count=0;window._db.rpc=()=>{count++;return new Promise(resolve=>window.finishQueue=resolve)};window.cargarRemitos=()=>new Promise(resolve=>window.finishRemitos=resolve)});
 await button.click();const busy=page.getByRole('button',{name:'Actualizando servicios…',exact:true});
 assert.equal(await busy.isDisabled(),true);assert.equal(await busy.getAttribute('aria-busy'),'true');
 await page.getByRole('status').getByText('Actualizando servicios…').waitFor();
 assert.equal(await page.locator('#phase3-driver-services-list').getAttribute('aria-busy'),'true');
 assert.match(await page.locator('#phase3-driver-services-list').innerText(),/No tenés servicios asignados/);
 await page.waitForFunction(()=>typeof finishQueue==='function'&&typeof finishRemitos==='function');
 await page.evaluate(()=>{void recargarServiciosChofer()});
 assert.equal(await page.evaluate(()=>count),1);
 assert.equal(await busy.locator('svg').evaluate(el=>getComputedStyle(el).animationName),reduced?'none':'p3-refresh-turn');
 await page.screenshot({path:path.join(out,reduced?'reduced.png':'loading.png'),fullPage:true});
 await page.evaluate(()=>finishQueue({data:[]}));await page.waitForTimeout(400);
 assert.equal(await busy.isDisabled(),true);
 await page.evaluate(()=>finishRemitos());await button.waitFor();assert.equal(await button.isEnabled(),true);
 assert.equal(await page.locator('#phase3-driver-services-list').getAttribute('aria-busy'),'false');
 await page.evaluate(()=>{window._db.rpc=async()=>({error:new Error('offline')});window.cargarRemitos=async()=>{throw Error('offline')}});
 await button.click();await button.waitFor();assert.equal(await button.isEnabled(),true);
 assert.equal(await page.locator('.p3-is-refreshing').count(),0);assert.deepEqual(errors,[]);await page.close();
 } console.log(JSON.stringify({ok:true,motion:true,reducedMotion:true,duplicateClicks:true,errorRecovery:true,screenshots:out}));
 }finally{await browser.close();app.close()}
})().catch(e=>{console.error(e);app.close();process.exitCode=1});

// Actual compiled React/Motion island, canonical data shape, simulated actions only.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=process.cwd(),out=fs.mkdtempSync(path.join(os.tmpdir(),'auxilios-truck-'));
const model={identity:'driver:log:truck',truck:{truck_id:1,numero_interno:114,brand:'Ford',model:'Cargo',plate:'AB 123 CD',current_km:184250},logDate:'2026-10-24',control:null,fuel:[{fuel_date:'2026-10-24',liters:65}],plans:[{name:'Cambio de aceite',plan_estado:'proximo',urgencia:.085,interval_km:10000,km_restantes:850}]};
const html='<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui/tokens.css"><link rel="stylesheet" href="/ui/components.css"><link rel="stylesheet" href="/ui/motion/motion-v1.css"><style>body{margin:0;padding:16px;background:var(--ax-bg);color:var(--ax-text);font-family:Arial}#screen-camion{max-width:1150px;margin:auto}</style><section id="screen-camion" class="active"><div id="camion-main-view"><header class="sec-header">Control anterior</header><div id="camion-hero-card">Hero anterior</div><div id="camion-incidente-quick">Reporte anterior</div><div id="camion-cards-container"></div></div></section><script>window.PERFIL_USUARIO={roles:{name:"chofer"}};window.calls=[];for(const fn of ["openFuelModal","openNeumaticosModal","openServiceModal","abrirModalIncidente","_abrirSubCamion"])window[fn]=(...args)=>calls.push([fn,...args]);window.fixture='+JSON.stringify(model)+';fixture.loadReports=async()=>[{incident_id:1,type:"averia",description:"Luz trasera derecha",created_at_device:"2026-10-24T10:25:00-03:00"}];window.cargarScreenCamion=async()=>{calls.push(["refresh"]);await new Promise(resolve=>setTimeout(resolve,450))};</script><script src="/ui/motion/motion-v1.js"></script>';
const app=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('content-type','text/html');res.end(html);return}
 const file=path.resolve(root,'.'+req.url.split('?')[0]);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return}
 res.setHeader('content-type',file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/javascript');res.end(fs.readFileSync(file))});
(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
try{for(const width of [1440,768,390,320]){
 const page=await browser.newPage({viewport:{width,height:1100},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+app.address().port);
 await page.waitForFunction(()=>!!window.AuxiliosTruckUI);await page.evaluate(()=>AuxiliosTruckUI.render(document.getElementById('camion-cards-container'),fixture));await page.locator('.dtr').waitFor();
 assert.equal(await page.locator('.dtr-card').count(),3);assert.match(await page.locator('.dtr-odometer').innerText(),/184.250/);
 assert.equal(await page.locator('#camion-hero-card').isVisible(),false);
 await page.getByRole('button',{name:'Registrar control',exact:true}).click();await page.getByRole('button',{name:'Registrar mantenimiento',exact:true}).click();
 await page.getByRole('button',{name:'Cargar combustible',exact:true}).first().click();
 assert.deepEqual(await page.evaluate(()=>calls.slice(0,3).map(c=>c[0])),['openNeumaticosModal','openServiceModal','openFuelModal']);
 await page.getByRole('button',{name:'Ver historial de Mantenimiento',exact:true}).click();assert.deepEqual(await page.evaluate(()=>calls.at(-1)),['_abrirSubCamion','camion-sub-mantenimiento']);
 await page.getByRole('button',{name:/Novedades de la jornada/}).click();await page.getByRole('dialog').waitFor();await page.getByText('Luz trasera derecha',{exact:true}).waitFor();
 assert.equal(await page.getByText('Reporte registrado',{exact:true}).count(),1);
 await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').count(),0);
 assert.equal(await page.getByRole('button',{name:/Novedades de la jornada/}).evaluate(el=>el===document.activeElement),true);
 await page.getByRole('button',{name:'Actualizar camión',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Actualizando camión…',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'Actualizar camión',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'truck-'+width+'.png'),fullPage:true});
 await page.evaluate(()=>{fixture.loadReports=async()=>{throw Error('offline')};AuxiliosTruckUI.render(document.getElementById('camion-cards-container'),{...fixture})});
 await page.getByRole('button',{name:/Novedades de la jornada/}).click();await page.getByRole('alert').waitFor();await page.getByRole('button',{name:'Cerrar novedades'}).click();
 await page.evaluate(()=>{AuxiliosTruckUI.clear();document.getElementById('camion-cards-container').innerHTML='<p>Sin jornada</p>'});assert.equal(await page.locator('.dtr').count(),0);assert.equal(await page.locator('#camion-hero-card').isVisible(),true);assert.deepEqual(errors,[]);await page.close();
 }
 const page=await browser.newPage({viewport:{width:390,height:900},hasTouch:true,reducedMotion:'no-preference'});await page.goto('http://127.0.0.1:'+app.address().port);await page.waitForFunction(()=>!!window.AuxiliosTruckUI);await page.evaluate(()=>AuxiliosTruckUI.render(document.getElementById('camion-cards-container'),fixture));await page.getByRole('button',{name:/Novedades de la jornada/}).click();await page.getByText('Luz trasera derecha',{exact:true}).waitFor();
 await page.waitForTimeout(500);const grip=await page.locator('.dtr-handle-zone').boundingBox(),cdp=await page.context().newCDPSession(page);const x=grip.x+grip.width/2,y=grip.y+5;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+i*18}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>!document.querySelector('dialog'));
 console.log(JSON.stringify({ok:true,viewports:[1440,768,390,320],actions:true,reports:true,swipe:true,reducedMotion:true,screenshots:out}));
}finally{await browser.close();app.close()}})().catch(e=>{console.error(e);app.close();process.exitCode=1});

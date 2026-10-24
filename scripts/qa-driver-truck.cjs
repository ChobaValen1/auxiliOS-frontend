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
 await page.waitForFunction(()=>!!window.AuxiliosTruckUI);await page.evaluate(()=>{const nav=document.createElement('nav');nav.className='sidenav';nav.style.cssText='position:fixed;bottom:8px;left:8px;right:8px;height:64px';document.body.append(nav);AuxiliosTruckUI.render(document.getElementById('camion-cards-container'),fixture)});await page.locator('.dtr').waitFor();
 assert.equal(await page.locator('.dtr-card').count(),3);assert.match(await page.locator('.dtr-odometer').innerText(),/184.250/);
 assert.equal(await page.locator('#camion-hero-card').isVisible(),false);
 assert.equal(await page.locator('.dtr-card-actions').count(),0);
 assert.equal(await page.locator('.dtr-fab').count(),1);
 await page.setViewportSize({width,height:740});
 await page.waitForFunction(()=>document.querySelector('.dtr-fab').getBoundingClientRect().bottom<=document.querySelector('.sidenav').getBoundingClientRect().top-8);
 if(width<800)assert.ok(await page.locator('.dtr-hero').evaluate(el=>el.getBoundingClientRect().height)<150,'truck identity is compact');
 assert.equal(await page.locator('.dtr-status-warning').count(),2);assert.equal(await page.locator('.dtr-status-success').count(),0);
 for(const [label,action] of [['Registrar chequeo','openNeumaticosModal'],['Cargar combustible','openFuelModal'],['Registrar mantenimiento','openServiceModal']]){
   await page.getByRole('button',{name:'Acciones rápidas',exact:true}).click();
   const quick=page.getByRole('dialog',{name:'Acciones rápidas',exact:true});await quick.waitFor();
   await quick.getByRole('button',{name:label,exact:true}).click();await page.waitForFunction(fn=>calls.at(-1)?.[0]===fn,action);
   assert.equal(await page.locator('dialog').count(),0);
 }
 await page.getByRole('button',{name:'Acciones rápidas',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').count(),0);
 assert.equal(await page.getByRole('button',{name:'Acciones rápidas',exact:true}).evaluate(el=>el===document.activeElement),true);
 await page.getByRole('button',{name:'Ver historial de Mantenimiento',exact:true}).click();assert.deepEqual(await page.evaluate(()=>calls.at(-1)),['_abrirSubCamion','camion-sub-mantenimiento']);
 await page.evaluate(()=>document.getElementById('camion-main-view').style.display='none');await page.waitForFunction(()=>!document.querySelector('.dtr-fab'));
 await page.evaluate(()=>document.getElementById('camion-main-view').style.display='');await page.locator('.dtr-fab').waitFor();
 await page.evaluate(()=>document.getElementById('screen-camion').classList.remove('active'));await page.waitForFunction(()=>!document.querySelector('.dtr-fab'));
 await page.evaluate(()=>document.getElementById('screen-camion').classList.add('active'));await page.locator('.dtr-fab').waitFor();
 await page.evaluate(()=>{const extra=document.createElement('div');extra.id='scroll-test';extra.style.height='1200px';document.getElementById('camion-main-view').append(extra);window.scrollTo(0,800)});
 assert.ok(await page.evaluate(()=>scrollY>0),'scroll remains available');
 await page.evaluate(()=>{document.getElementById('scroll-test').remove();window.scrollTo(0,0)});
 await page.getByRole('button',{name:/Novedades de la jornada/}).click();await page.getByRole('dialog').waitFor();await page.getByText('Luz trasera derecha',{exact:true}).waitFor();
 assert.equal(await page.getByText('Reporte registrado',{exact:true}).count(),1);
 await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').count(),0);
 assert.equal(await page.getByRole('button',{name:/Novedades de la jornada/}).evaluate(el=>el===document.activeElement),true);
 await page.getByRole('button',{name:'Actualizar camión',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Actualizando camión…',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'Actualizar camión',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'truck-'+width+'.png'),fullPage:true});
 await page.evaluate(()=>AuxiliosTruckUI.render(document.getElementById('camion-cards-container'),{...fixture,control:{tire_condition:'bueno',brake_condition:'bueno'},plans:[{name:'Aceite',plan_estado:'al_dia',interval_km:10000,km_restantes:8000}]}));await page.waitForFunction(()=>document.querySelectorAll('.dtr-status-success').length===2);
 await page.evaluate(()=>AuxiliosTruckUI.render(document.getElementById('camion-cards-container'),{...fixture,control:{tire_condition:'bueno',brake_condition:'malo'},plans:[{name:'Aceite',plan_estado:'vencido',interval_km:10000,km_restantes:-50}]}));await page.waitForFunction(()=>document.querySelectorAll('.dtr-status-danger').length===2);
 await page.evaluate(()=>{fixture.loadReports=async()=>{throw Error('offline')};AuxiliosTruckUI.render(document.getElementById('camion-cards-container'),{...fixture})});
 await page.getByRole('button',{name:/Novedades de la jornada/}).click();await page.getByRole('alert').waitFor();await page.getByRole('button',{name:'Cerrar novedades'}).click();
 await page.evaluate(()=>{AuxiliosTruckUI.clear();document.getElementById('camion-cards-container').innerHTML='<p>Sin jornada</p>'});assert.equal(await page.locator('.dtr').count(),0);assert.equal(await page.locator('#camion-hero-card').isVisible(),true);assert.deepEqual(errors,[]);await page.close();
 }
 const page=await browser.newPage({viewport:{width:390,height:900},hasTouch:true,reducedMotion:'no-preference'});await page.goto('http://127.0.0.1:'+app.address().port);await page.waitForFunction(()=>!!window.AuxiliosTruckUI);await page.evaluate(()=>AuxiliosTruckUI.render(document.getElementById('camion-cards-container'),fixture));await page.getByRole('button',{name:/Novedades de la jornada/}).click();await page.getByText('Luz trasera derecha',{exact:true}).waitFor();
 await page.waitForTimeout(500);const grip=await page.locator('.dtr-handle-zone').boundingBox(),cdp=await page.context().newCDPSession(page);const x=grip.x+grip.width/2,y=grip.y+5;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+i*18}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>!document.querySelector('dialog'));
 console.log(JSON.stringify({ok:true,viewports:[1440,768,390,320],actions:true,reports:true,swipe:true,reducedMotion:true,screenshots:out}));
}finally{await browser.close();app.close()}})().catch(e=>{console.error(e);app.close();process.exitCode=1});

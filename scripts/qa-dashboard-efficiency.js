// Read-only fixture QA of the production bundle. No login, real service or financial writes.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=process.cwd(),out=fs.mkdtempSync(path.join(os.tmpdir(),'auxilios-efficiency-'));
const rows=Array.from({length:22},(_,i)=>({dia:`2026-10-${String(i+1).padStart(2,'0')}`,facturados:Math.round(170+Math.sin(i*1.3)*60+i*2),odometro:Math.round(270+Math.cos(i*.8)*80+i*3),jornadas:4,cierres_faltantes:0,servicios_sin_km:0}));
const period={filas:rows,facturados:rows.reduce((s,r)=>s+r.facturados,0),odometro:rows.reduce((s,r)=>s+r.odometro,0),jornadas:88,cierres_faltantes:0,servicios_sin_km:0,remitos_sin_servicio:0};
const fixture={desde:'2026-10-01',hasta:'2026-10-22',hasta_solicitado:'2026-10-31',anterior_desde:'2026-09-09',anterior_hasta:'2026-09-30',actualizado:'2026-10-23T12:00:00Z',filtrado:false,actual:period,anterior:{...period,facturados:period.facturados*.9}};
const live=process.env.EFFICIENCY_QA_LIVE?JSON.parse(fs.readFileSync(process.env.EFFICIENCY_QA_LIVE,'utf8')):null;
const html=`<!doctype html><html data-theme="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui/motion/efficiency-v1.css"><style>body{margin:0;background:#101622;color:#edf1f7;font-family:Arial,sans-serif;padding:24px}main{max-width:1100px;margin:auto;padding:26px;background:#191e28;border:1px solid #2b3546;border-radius:16px}html[data-theme=light] body{background:#eef1f6}html[data-theme=light] main{background:white}html[data-theme=light] .ax-eff-dialog{--bg-card:white}@media(max-width:600px){body{padding:10px}main{padding:16px}}</style><main id="chart"></main><script src="/ui/motion/efficiency-v1.js"></script><script>window.fixture=${JSON.stringify(fixture)};AuxEfficiency.render(document.getElementById('chart'),fixture)</script></html>`;
const server=http.createServer((req,res)=>{
 if(req.url==='/'||(req.url==='/live'&&live)){res.setHeader('content-type','text/html');res.end(req.url==='/live'?html.replace(JSON.stringify(fixture),JSON.stringify(live)):html);return;}
 const file=path.resolve(root,'.'+req.url.split('?')[0]);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('content-type',file.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 for(const width of [1440,768,390,320]){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce',hasTouch:width<600});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.ax-eff-plot').waitFor();
  assert.equal(await page.locator('.ax-eff-switch [aria-pressed=true]').innerText(),'Diario');
  assert.ok(await page.locator('.ax-eff-billed').count());assert.ok(await page.locator('.ax-eff-odo').count());
  assert.match(await page.locator('[data-metric=porcentaje]').innerText(),/%/);
  assert.ok(await page.locator('.ax-eff-plot').evaluate(e=>e.getBoundingClientRect().height)<=196);
  await page.getByRole('button',{name:'Diario',exact:true}).click();assert.equal(await page.locator('.ax-eff-switch [aria-pressed=true]').innerText(),'Diario');
  await page.locator('.ax-eff-plot').focus();await page.keyboard.press('Home');assert.match(await page.locator('.ax-eff-inspect').innerText(),/1 oct/);await page.keyboard.press('ArrowRight');assert.match(await page.locator('.ax-eff-inspect').innerText(),/2 oct/);
  const box=await page.locator('.ax-eff-plot').boundingBox();
  await page.locator('h3').first().click();
  await page.mouse.move(box.x+box.width*.3,box.y+100);await page.mouse.down();
  await page.mouse.move(box.x+box.width-16,box.y+100,{steps:12});
  assert.match(await page.locator('.ax-eff-inspect').innerText(),/22 oct/);
  assert.equal(await page.locator('[data-metric=facturados]').innerText(),rows[21].facturados+'km');
  assert.equal(await page.locator('[data-metric=porcentaje]').innerText(),new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(rows[21].facturados/rows[21].odometro*100)+'%');
  assert.equal(await page.locator('.ax-eff-glow').count(),2);
  await page.mouse.move(box.x+box.width*.54,box.y+100,{steps:6});
  await page.screenshot({path:path.join(out,`scrub-${width}.png`),fullPage:true});
  await page.mouse.up();assert.match(await page.locator('.ax-eff-inspect').innerText(),/totales registrados/);
  if(width<600){
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.4,y:box.y+120}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*.65,y:box.y+120}]});
    assert.match(await page.locator('.ax-eff-inspect').innerText(),/valores del día/);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.match(await page.locator('.ax-eff-inspect').innerText(),/totales registrados/);
    await cdp.detach();
  }
  await page.getByRole('button',{name:/Ver desglose/}).click();assert.ok(await page.locator('dialog').evaluate(d=>d.open));assert.equal(await page.locator('tbody tr').count(),22);await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').evaluate(d=>d.open),false);assert.equal(await page.getByRole('button',{name:/Ver desglose/}).evaluate(e=>e===document.activeElement),true);
  await page.getByRole('button',{name:'Acumulado',exact:true}).click();assert.equal(await page.locator('.ax-eff-switch [aria-pressed=true]').innerText(),'Acumulado');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(out,`desktop-${width}.png`),fullPage:true});
  await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.screenshot({path:path.join(out,`light-${width}.png`),fullPage:true});
  await page.evaluate(()=>AuxEfficiency.render(document.getElementById('chart'),{...fixture,actual:{...fixture.actual,filas:fixture.actual.filas.map(r=>({...r,facturados:192293.4/22,odometro:337522.8/22})),facturados:192293.4,odometro:337522.8}}));
  await page.waitForFunction(()=>document.querySelector('[data-metric=facturados]').textContent.includes('192.293'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.evaluate(()=>{fixture.actual.cierres_faltantes=1;fixture.actual.odometro=null;fixture.actual.filas[6].odometro=null;AuxEfficiency.render(document.getElementById('chart'),{...fixture});});
  await page.getByRole('button',{name:/Datos incompletos/}).click();await page.locator('.ax-eff-quality-detail').waitFor();
  assert.match(await page.locator('.ax-eff-percent small').innerText(),/Parcial/);
  assert.equal(await page.locator('[data-metric=porcentaje]').innerText(),new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format((period.facturados-rows[6].facturados)/(period.odometro-rows[6].odometro)*100)+'%');
  await page.evaluate(()=>AuxEfficiency.render(document.getElementById('chart'),{...fixture,actual:{...fixture.actual,filas:fixture.actual.filas.map(r=>({...r,odometro:null,cierres_faltantes:1}))}}));
  await page.waitForFunction(()=>document.querySelector('[data-metric=porcentaje]').textContent==='—%');
  await page.evaluate(()=>AuxEfficiency.render(document.getElementById('chart'),null,'Error de conexión. Reintentá desde Resumen.'));await page.getByRole('alert').waitFor();
  assert.deepEqual(errors,[]);await page.close();
 }
 const motionPage=await browser.newPage({viewport:{width:900,height:900},reducedMotion:'no-preference'});
 await motionPage.goto('http://127.0.0.1:'+server.address().port);await motionPage.locator('.ax-eff-plot').waitFor();
 const motionBox=await motionPage.locator('.ax-eff-plot').boundingBox();
 await motionPage.mouse.move(motionBox.x+20,motionBox.y+80);await motionPage.mouse.move(motionBox.x+motionBox.width-16,motionBox.y+80,{steps:6});
 await motionPage.waitForFunction(()=>{const dots=[...document.querySelectorAll('.ax-eff-dot')],line=document.querySelector('.ax-eff-cursor');return dots.length===2&&line&&dots.every(d=>Math.abs(Number(d.getAttribute('cx'))-Number(line.getAttribute('x1')))<.1)&&Math.abs(Number(line.getAttribute('x1'))-(document.querySelector('.ax-eff-plot').getBoundingClientRect().width-16))<.2;});
 await motionPage.close();
 if(live){
  const actual=await browser.newPage({viewport:{width:700,height:750},reducedMotion:'reduce'});
  await actual.goto('http://127.0.0.1:'+server.address().port+'/live');await actual.locator('[data-metric=porcentaje]').waitFor();
  const valid=live.actual.filas.filter(r=>r.facturados!=null&&r.odometro!=null&&r.cierres_faltantes===0&&r.servicios_sin_km===0&&(r.jornadas>0||r.facturados===0));
  const facturados=valid.reduce((s,r)=>s+r.facturados,0),odometro=valid.reduce((s,r)=>s+r.odometro,0),expected=new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(facturados/odometro*100)+'%';
  assert.equal(await actual.locator('[data-metric=porcentaje]').innerText(),expected);assert.match(await actual.locator('.ax-eff-percent small').innerText(),/Parcial/);
  await actual.screenshot({path:path.join(out,'live-rpc.png'),fullPage:true});
  console.log(JSON.stringify({liveRpcRendered:true,facturados,odometro,percentage:expected,closedDays:valid.length,screenshot:path.join(out,'live-rpc.png')}));await actual.close();
 }
 console.log(JSON.stringify({passed:true,widths:[1440,768,390,320],modes:true,percentage:true,compact:true,keyboard:true,touch:true,dialog:true,error:true,reducedMotion:true,springCursorAlignment:true,screenshots:out}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

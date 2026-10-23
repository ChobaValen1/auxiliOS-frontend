// Read-only fixture QA of the production bundle. No login, real service or financial writes.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=process.cwd(),out=fs.mkdtempSync(path.join(os.tmpdir(),'auxilios-efficiency-'));
const rows=Array.from({length:22},(_,i)=>({dia:`2026-10-${String(i+1).padStart(2,'0')}`,facturados:100+i*8,odometro:180+i*5,jornadas:4,cierres_faltantes:0,servicios_sin_km:0}));
const period={filas:rows,facturados:rows.reduce((s,r)=>s+r.facturados,0),odometro:rows.reduce((s,r)=>s+r.odometro,0),jornadas:88,cierres_faltantes:0,servicios_sin_km:0,remitos_sin_servicio:0};
const fixture={desde:'2026-10-01',hasta:'2026-10-22',hasta_solicitado:'2026-10-31',anterior_desde:'2026-09-09',anterior_hasta:'2026-09-30',actualizado:'2026-10-23T12:00:00Z',filtrado:false,actual:period,anterior:{...period,facturados:period.facturados*.9}};
const html=`<!doctype html><html data-theme="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui/motion/efficiency-v1.css"><style>body{margin:0;background:#101622;color:#edf1f7;font-family:Arial,sans-serif;padding:24px}main{max-width:1100px;margin:auto;padding:26px;background:#191e28;border:1px solid #2b3546;border-radius:16px}html[data-theme=light] body{background:#eef1f6}html[data-theme=light] main{background:white}html[data-theme=light] .ax-eff-dialog{--bg-card:white}@media(max-width:600px){body{padding:10px}main{padding:16px}}</style><main id="chart"></main><script src="/ui/motion/efficiency-v1.js"></script><script>window.fixture=${JSON.stringify(fixture)};AuxEfficiency.render(document.getElementById('chart'),fixture)</script></html>`;
const server=http.createServer((req,res)=>{
 if(req.url==='/'){res.setHeader('content-type','text/html');res.end(html);return;}
 const file=path.resolve(root,'.'+req.url.split('?')[0]);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('content-type',file.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 for(const width of [1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce',hasTouch:width<600});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.ax-eff-plot').waitFor();
  assert.equal(await page.locator('.ax-eff-switch [aria-pressed=true]').innerText(),'Acumulado');
  assert.ok(await page.locator('.ax-eff-billed').count());assert.ok(await page.locator('.ax-eff-odo').count());
  await page.getByRole('button',{name:'Diario',exact:true}).click();assert.equal(await page.locator('.ax-eff-switch [aria-pressed=true]').innerText(),'Diario');
  await page.locator('.ax-eff-plot').focus();await page.keyboard.press('Home');assert.match(await page.locator('.ax-eff-inspect').innerText(),/1 oct/);await page.keyboard.press('ArrowRight');assert.match(await page.locator('.ax-eff-inspect').innerText(),/2 oct/);
  const box=await page.locator('.ax-eff-plot').boundingBox();await page.locator('.ax-eff-plot').dispatchEvent('pointerdown',{clientX:box.x+box.width-20,clientY:box.y+80,pointerType:'touch'});assert.match(await page.locator('.ax-eff-inspect').innerText(),/22 oct/);
  await page.getByRole('button',{name:/Ver desglose/}).click();assert.ok(await page.locator('dialog').evaluate(d=>d.open));assert.equal(await page.locator('tbody tr').count(),22);await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').evaluate(d=>d.open),false);assert.equal(await page.getByRole('button',{name:/Ver desglose/}).evaluate(e=>e===document.activeElement),true);
  await page.getByRole('button',{name:'Acumulado',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(out,`desktop-${width}.png`),fullPage:true});
  await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.screenshot({path:path.join(out,`light-${width}.png`),fullPage:true});
  await page.evaluate(()=>{fixture.actual.cierres_faltantes=1;fixture.actual.odometro=null;fixture.actual.filas[6].odometro=null;AuxEfficiency.render(document.getElementById('chart'),{...fixture});});await page.getByText(/jornadas sin cierre/).waitFor();assert.equal(await page.locator('.ax-eff-primary>strong').innerText(),'—');
  await page.evaluate(()=>AuxEfficiency.render(document.getElementById('chart'),null,'Error de conexión. Reintentá desde Resumen.'));await page.getByRole('alert').waitFor();
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log(JSON.stringify({passed:true,widths:[1440,390,320],modes:true,keyboard:true,touch:true,dialog:true,error:true,reducedMotion:true,screenshots:out}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

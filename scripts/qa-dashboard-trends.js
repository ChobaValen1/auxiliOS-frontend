// Production bundles against deterministic RPC-shaped data; no real business writes.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=process.cwd(),out=fs.mkdtempSync(path.join(os.tmpdir(),'auxilios-trends-'));
const data={desde:'2026-10-01',hasta:'2026-10-22',actual:{servicios:Array.from({length:22},(_,i)=>i%5+2)},
 empresas:Array.from({length:9},(_,j)=>({id:'c'+j,nombre:j===2?'Prestadora con nombre extenso':'Prestadora '+(j+1),
 facturado:Array.from({length:22},(_,i)=>(i+j)%4*(j+1)*9500),
 servicios:Array.from({length:22},(_,i)=>(i+j)%3)}))};
const html='<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui/motion/trends-v1.css"><style>body{margin:0;padding:16px;background:#101622;color:#edf1f7;font-family:Arial}main{max-width:1240px;margin:auto}</style><main id="charts"></main><script src="/ui/motion/trends-v1.js"></script><script>window.fixture='+JSON.stringify(data)+';AuxTrends.render(document.getElementById("charts"),fixture)</script></html>';
const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('content-type','text/html');res.end(html);return}
 const file=path.resolve(root,'.'+req.url.split('?')[0]);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return}
 res.setHeader('content-type',file.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(file));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 for(const width of [1440,768,390,320]){
   const page=await browser.newPage({viewport:{width,height:1100},hasTouch:width<600,reducedMotion:'reduce'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.ax-sky canvas').waitFor();
   await page.waitForFunction(()=>document.querySelector('canvas').width>0);
   assert.equal(await page.locator('[data-visible=true]').count(),6);
   assert.match(await page.locator('.ax-ranking p').innerText(),/22 oct/);
   await page.getByRole('button',{name:'Primer día',exact:true}).click();
   assert.match(await page.locator('.ax-ranking p').innerText(),/1 oct/);
   await page.getByRole('button',{name:'Servicios',exact:true}).click();
   await page.getByRole('button',{name:'Primer día',exact:true}).click();
   await page.getByRole('button',{name:'Último día',exact:true}).click();
   await page.getByText('Ver ranking completo',{exact:true}).click();
   assert.equal(await page.locator('.ax-ranking details tbody tr').count(),9);
   await page.locator('.ax-sky canvas').focus();await page.keyboard.press('Home');
   await page.waitForFunction(()=>document.querySelector('[role=tooltip]').getAttribute('aria-hidden')==='false');
   assert.match(await page.locator('[role=tooltip]').innerText(),/1 de octubre/);
   await page.keyboard.press('ArrowDown');assert.match(await page.locator('[role=tooltip]').innerText(),/2 de octubre/);
   await page.keyboard.press('Escape');assert.equal(await page.locator('[role=tooltip]').getAttribute('aria-hidden'),'true');
   await page.getByRole('button',{name:'3D',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('.ax-sky-stage').getBoundingClientRect().height>100);
   await page.getByText('Ver datos diarios',{exact:true}).click();
   assert.equal(await page.locator('.ax-sky tbody tr').count(),22);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.ok(await page.locator('canvas').evaluate(c=>{const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return pixels.some((v,i)=>i%4===3&&v>0)}));
   await page.screenshot({path:path.join(out,'charts-'+width+'.png'),fullPage:true});
   await page.getByRole('button',{name:'2D',exact:true}).click();
   if(width<600){const box=await page.locator('canvas').boundingBox();await page.touchscreen.tap(box.x+box.width*.5,box.y+70);}
   await page.evaluate(()=>AuxTrends.render(document.getElementById('charts'),{...fixture,empresas:[],actual:{servicios:fixture.actual.servicios.map(()=>0)}}));
   await page.getByText('Sin datos para esta métrica.',{exact:true}).waitFor();
   await page.evaluate(()=>AuxTrends.render(document.getElementById('charts'),undefined,'Error de consulta. Actualizá Tendencia.'));
   await page.getByRole('alert').waitFor();assert.deepEqual(errors,[]);
   await page.close();
 }
 const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'no-preference'});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.ax-race').waitFor();
 await page.getByRole('button',{name:'Reproducir evolución',exact:true}).click();
 await page.waitForFunction(()=>Number(document.querySelector('input[type=range]').value)>=1);
 await page.getByRole('button',{name:'Pausar evolución',exact:true}).click();
 const pos=await page.locator('input[type=range]').inputValue();await page.waitForTimeout(800);assert.equal(await page.locator('input[type=range]').inputValue(),pos);
 await page.getByRole('button',{name:'3D',exact:true}).click();await page.waitForTimeout(1500);
 await page.screenshot({path:path.join(out,'motion-desktop.png'),fullPage:true});
 await page.evaluate(()=>AuxTrends.unmount(document.getElementById('charts')));assert.equal(await page.locator('canvas').count(),0);
 console.log(JSON.stringify({ok:true,viewports:[1440,768,390,320],screenshots:out}));
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});

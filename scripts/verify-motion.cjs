/* Isolated browser QA: real shell/styles/AxUI/theme; no auth, API, credentials or real writes. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'Index.html'), 'utf8');
const links = [...index.slice(0, index.indexOf('</head>')).matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(m=>m[0]).filter(x=>!x.includes('https://')).join('\n');
const shell = index.slice(index.indexOf('<nav class="sidenav">'), index.indexOf('<div class="content">'));
assert.ok(shell.includes('tb-theme') && shell.includes('ax-brand-full'));
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${links}
<script src="/ui/theme-v1.js"></script><style>.qa-actions{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}.qa-label{color:var(--ax-text-3);margin:16px 0}.rsm-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}.rsm-kpi{background:var(--ax-surface-2);border:1px solid var(--ax-border);padding:20px}.rsm-kpi-value{font-size:32px;font-weight:600;margin-top:10px}.qa-table{width:100%;border-collapse:collapse}.qa-table td{padding:18px;border-bottom:1px solid var(--ax-border)}.rsm-card{padding:20px;background:var(--ax-surface-2);border:1px solid var(--ax-border)}.os-status-tabs{display:flex;gap:8px;margin:20px 0}.os-status-tabs button{padding:8px 14px;color:var(--ax-text);background:transparent;border:1px solid var(--ax-border);border-radius:999px;font:inherit;cursor:pointer}</style></head><body>${shell}
<div class="content"><section class="screen active" id="screen-dashboard"><p class="qa-label">Verificación local · datos simulados · sin conexión a la base</p><div class="rsm-kpis">${[['Servicios','28'],['En curso','9'],['Finalizados','19'],['Flota disponible','6']].map(([label,value])=>`<article class="rsm-kpi"><div>${label}</div><div class="rsm-kpi-value">${value}</div></article>`).join('')}</div>
<div class="qa-actions"><button id="qa-save" class="ax-btn ax-btn-primary">Guardar prueba</button><button id="qa-open" class="ax-btn">Revisar cambios</button><button id="qa-notices" class="ax-btn">Mostrar avisos</button></div>
<article class="rsm-card"><h2>Servicios · muestra local</h2><div class="os-status-tabs"><button class="active">Todos</button><button>En curso</button><button>Finalizados</button></div><table class="qa-table"><tbody><tr><td>AX-001</td><td>En curso</td><td>Palermo</td></tr><tr><td>AX-002</td><td>Finalizado</td><td>Belgrano</td></tr></tbody></table></article></section>
${['registro','camion','documentos','remitos'].map(id=>`<section class="screen" id="screen-${id}"><h1>${id}</h1><p>Se conserva la navegación del sistema.</p></section>`).join('')}</div></div>
<div class="ax-backdrop" id="qa-modal" hidden><section class="ax-modal" role="dialog" aria-modal="true" aria-labelledby="qa-title"><header><h2 id="qa-title">Revisar cambios</h2></header><div class="ax-modal-body"><label>Referencia<input class="ax-input" value="Sólo prueba"></label><p>No se guardarán datos reales.</p></div><footer><button class="ax-btn" id="qa-cancel">Cancelar</button><button class="ax-btn ax-btn-primary" id="qa-confirm">Confirmar</button></footer></section></div>
<script>window.PERFIL_USUARIO={roles:{name:'administracion'}};window.qaCalls=0;window.goTo=function(id){document.querySelectorAll('.screen').forEach(e=>e.classList.toggle('active',e.id==='screen-'+id));document.querySelectorAll('.nav-item').forEach(e=>e.classList.toggle('active',e.id==='nav-'+id));};window.toggleSidenav=function(){document.body.classList.toggle('nav-collapsed');localStorage.setItem('auxilios.sidenav.collapsed',document.body.classList.contains('nav-collapsed')?'1':'0');};</script>
<script src="/ui/ax.js"></script><script src="/ui/app-v1.js"></script><script src="/ui/motion/motion-v1.js"></script>
<script>document.querySelector('#qa-save').onclick=e=>AxUI.busy(e.currentTarget,async()=>{qaCalls++;await new Promise(r=>setTimeout(r,500));return 17;}).then(()=>AxUI.toast({title:'Prueba guardada',text:'Sin escritura en la base de datos'}));document.querySelector('#qa-open').onclick=()=>AxUI.openModal(document.querySelector('#qa-modal'));['qa-cancel','qa-confirm'].forEach(id=>document.getElementById(id).onclick=()=>AxUI.closeModal(document.querySelector('#qa-modal')));document.querySelector('#qa-notices').onclick=()=>{for(let i=1;i<=3;i++)AxUI.toast({title:'Aviso '+i,text:'Datos de prueba. La operación real conserva su resultado.',timeout:0});};document.querySelectorAll('.os-status-tabs button').forEach(btn=>btn.onclick=()=>{btn.parentNode.querySelectorAll('button').forEach(e=>e.classList.toggle('active',e===btn));});</script></body></html>`;
const mime = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
function server() { return http.createServer((req,res)=>{
  const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if (pathname === '/__qa' || pathname === '/') {res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
  const file = path.resolve(root, '.'+pathname), type = mime[path.extname(file)];
  if (!file.startsWith(root+path.sep) || !type || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',type); res.end(fs.readFileSync(file));
}); }
if (process.argv.includes('--serve')) {
  server().listen(4875,'127.0.0.1',()=>console.log('QA aislada: http://127.0.0.1:4875/__qa'));
} else (async()=>{
  const app=server(); await new Promise(r=>app.listen(0,'127.0.0.1',r));
  let browser;
  const out=path.resolve(root,'../output/motion-preview-v517'); fs.mkdirSync(out,{recursive:true});
  try {
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:900}}), errors=[], external=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1'){external.push(u.origin);return route.abort();}return route.continue();});
    const url='http://127.0.0.1:'+app.address().port+'/__qa';
    await page.goto(url); await page.waitForSelector('body.ax-motion'); await page.waitForTimeout(600);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--ax-accent').trim()),'#f5a623');
    assert.equal(await page.locator('.nav-logo img').first().evaluate(el=>el.complete&&el.naturalWidth===1077),true);
    await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
    await page.locator('#nav-registro').click(); await page.waitForTimeout(600);
    assert.equal(await page.locator('#nav-registro').getAttribute('aria-current'),'page');
    const active=await page.locator('#nav-registro').boundingBox(),pill=await page.locator('.ax-motion-nav-pill').boundingBox();
    assert.ok(Math.abs(active.y-pill.y)<2);
    await page.locator('.nav-collapse').click(); await page.mouse.move(800,400); await page.waitForTimeout(400);
    assert.ok((await page.locator('.sidenav').boundingBox()).width<80);
    await page.locator('#nav-camion').hover(); await page.waitForTimeout(400);
    assert.ok((await page.locator('.sidenav').boundingBox()).width>210);
    assert.equal(await page.evaluate(()=>localStorage.getItem('auxilios.sidenav.collapsed')),'1');
    await page.mouse.move(800,400); await page.locator('#nav-dashboard').focus(); await page.waitForTimeout(400);
    assert.ok((await page.locator('.sidenav').boundingBox()).width>210,'keyboard peek');
    await page.keyboard.press('Enter'); await page.locator('#qa-open').focus();
    // Dynamic role visibility stays under application control.
    await page.locator('#nav-documentos').evaluate(el=>el.style.display='none');
    assert.equal(await page.locator('#nav-documentos').isVisible(),false);
    await page.locator('#qa-open').click(); await page.locator('#qa-modal input').waitFor();
    await page.waitForTimeout(600);
    assert.equal(await page.locator('.ax-motion-panel').last().evaluate(el=>getComputedStyle(el).transform),'none');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    assert.equal(await page.locator('#qa-open').evaluate(el=>el===document.activeElement),true);
    await page.locator('#qa-save').click(); assert.equal(await page.locator('#qa-save').getAttribute('aria-busy'),'true');
    await page.waitForFunction(()=>document.querySelector('#qa-save').dataset.state==='done');
    assert.equal(await page.evaluate(()=>qaCalls),1);
    await page.waitForTimeout(1100);
    assert.equal(await page.locator('#qa-save').innerText(),'Guardar prueba');
    assert.equal(await page.evaluate(async()=>{
      const b=document.querySelector('#qa-save'),original=b.firstChild;let release,calls=0;
      const pending=new Promise(r=>release=r);
      const a=AxUI.busy(b,()=>{calls++;return pending});const c=AxUI.busy(b,()=>{calls++});
      if(a!==c) return false;release(8);if(await a!==8)return false;
      await new Promise(r=>setTimeout(r,1100));
      if(b.firstChild!==original||calls!==1)return false;
      try{await AxUI.busy(b,()=>Promise.reject(new Error('QA')))}catch{}
      const retry=!b.disabled&&b.dataset.state==='error';await AxUI.busy(b,()=>Promise.resolve());return retry;
    }),true);
    await page.reload(); await page.locator('#qa-notices').click(); await page.waitForTimeout(600);
    assert.equal(await page.locator('.ax-toast[inert]').count(),2);
    await page.locator('.ax-motion-toast-toggle').click(); await page.waitForTimeout(600);
    assert.equal(await page.locator('.ax-toast[inert]').count(),0);
    const notices=await page.locator('.ax-toast').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}));
    assert.ok(notices[1].bottom<notices[0].top && notices[2].bottom<notices[1].top);
    await page.screenshot({path:path.join(out,'notificaciones.png')});
    await page.reload();
    await page.evaluate(()=>{for(let i=1;i<=4;i++)AxUI.toast({title:'Error '+i,tone:'danger'});});
    await page.waitForTimeout(400);assert.equal(await page.locator('.ax-toast').count(),3);assert.equal(await page.locator('.ax-toast[inert]').count(),0);
    await page.locator('.ax-toast-close').first().click();await page.getByText('Error 4',{exact:true}).waitFor();assert.equal(await page.locator('.ax-toast').count(),3);
    await page.reload();
    await page.locator('#tb-theme').focus();await page.keyboard.press('Enter');
    await page.locator('[data-theme-pick="light"]').click();await page.waitForTimeout(700);
    assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    assert.equal(await page.evaluate(()=>localStorage.getItem('auxilios.theme')),'light');
    assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('ax-theme-reveal')),false);
    await page.screenshot({path:path.join(out,'claro.png')});
    await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    await page.evaluate(()=>AuxTheme.set('dark'));
    await page.emulateMedia({reducedMotion:'reduce'});
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});await page.waitForTimeout(400);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow at '+width);
      await page.locator('#qa-open').click();await page.waitForTimeout(60);assert.equal(await page.locator('#qa-modal').isVisible(),true);await page.keyboard.press('Escape');
      await page.locator('#qa-notices').click();await page.waitForTimeout(120);await page.locator('.ax-motion-toast-toggle').click();await page.waitForTimeout(120);
      const boxes=await page.locator('.ax-toast').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,right:r.right,top:r.top,bottom:r.bottom};}));
      assert.ok(boxes.every(b=>b.x>=0&&b.right<=width&&b.top>=0&&b.bottom<760));
      await page.screenshot({path:path.join(out,'mobile-'+width+'.png'),fullPage:true});
      await page.reload();
    }
    // Hidden messages do not expire before becoming readable.
    await page.evaluate(()=>{AxUI.toast({title:'Primero',timeout:150});AxUI.toast({title:'Segundo',timeout:250});});
    await page.waitForTimeout(200);assert.equal(await page.getByText('Segundo',{exact:true}).isVisible(),true);
    await page.waitForTimeout(350);assert.equal(await page.locator('.ax-toast').count(),0);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log('PASS: real shell/brand, navigation/pill/peek/roles, modal focus/Escape, busy success/error/retry/dedup, stack/queue/timers, theme/keyboard/persistence, 390/320px, reduced motion. No external requests. Screenshots: '+out);
  } finally {if(browser)await browser.close();app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

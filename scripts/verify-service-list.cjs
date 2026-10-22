/* Real Servicios module + real styles. RPC reads are simulated; all other RPCs fail. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../output/servicios-v520');
const index=fs.readFileSync(path.join(root,'Index.html'),'utf8');
const links=[...index.slice(0,index.indexOf('</head>')).matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(m=>m[0]).filter(s=>!s.includes('https://')).join('\n');
const shell=index.slice(index.indexOf('<nav class="sidenav">'),index.indexOf('<div class="content">'));
const sample=(id,overrides={})=>({service_id:id,service_order_number:'QA-'+id,service_number:'AX-'+id,status:'assigned',company_id:'a',company_name:'Cardinal',customer_name:'María López',vehicle_plate:'AA123BB',vehicle_make_model:'Ford Focus',origin:'Av. José Bonifacio 100',destination:'La Plata',scheduled_for:new Date().toISOString(),assigned_driver_id:'d1',assigned_truck_id:'t1',document_status:'not_started',...overrides});
const rows=[sample('1'),sample('2',{company_id:'b',company_name:'SOS',customer_name:'Pedro García',vehicle_plate:'CC456DD',assigned_driver_id:'d2',assigned_truck_id:'t2',status:'at_origin'}),sample('3',{customer_name:'Ana Sánchez',vehicle_plate:'EE789FF',assigned_driver_id:'d2',assigned_truck_id:'t2'}),...Array.from({length:52},(_,i)=>sample('H'+i,{status:'completed'}))];
const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/auxilios-filters-v1.css">${links}</head><body class="nav-collapsed">${shell}<div class="content"><div class="screen active" id="screen-dashboard"></div></div></div>
<script>window.PERFIL_USUARIO={roles:{name:'administracion'}};window.SCREENS={};window.calls=[];window.rows=${JSON.stringify(rows)};
window.goTo=name=>{document.querySelectorAll('.screen').forEach(e=>e.classList.toggle('active',e.id==='screen-'+name));document.querySelector('.topbar-title').textContent='Servicios';};window.toggleSidenav=()=>{};
window._db={rpc:async name=>{calls.push(name);if(name==='get_operator_service_reference_data')return{data:{companies:[{company_id:'a',trade_name:'Cardinal'},{company_id:'b',trade_name:'SOS'}],drivers:[{user_id:'d1',full_name:'José Pérez'},{user_id:'d2',full_name:'Lucía Gómez'}],trucks:[{truck_id:'t1',numero_interno:'Móvil 122',plate:'TR122AA'},{truck_id:'t2',numero_interno:'Móvil 116',plate:'TR116AA'}],concepts:[]}};if(name==='list_operator_services')return{data:rows};if(['list_operator_service_document_connections_v2','list_driver_service_intakes_v2','list_driver_activated_services_v1'].includes(name))return{data:[]};throw new Error('RPC fuera del alcance de lectura: '+name);}};
</script><script src="/ui/theme-v1.js"></script><script src="/ui/ax.js"></script><script src="/auxilios-filters-v1.js"></script><script src="/operator-services.js"></script><script src="/ui/motion/motion-v1.js"></script></body></html>`;
const app=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
(async()=>{
  fs.mkdirSync(out,{recursive:true});await new Promise(r=>app.listen(0,'127.0.0.1',r));let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>{if(new URL(r.request().url()).hostname!=='127.0.0.1'){external.push(r.request().url());return r.abort();}return r.continue();});
    await page.goto('http://127.0.0.1:'+app.address().port+'/');
    await page.locator('#nav-operaciones').waitFor({state:'visible'});await page.locator('#nav-operaciones').click();
    await page.waitForFunction(()=>document.querySelectorAll('#os-table-body > tr').length===3);
    const query=page.locator('#os-q');
    assert.equal(await page.locator('.os-results-count').innerText(),'3 servicios en Activos');
    for(const [text,count] of [['maria lopez',1],['JOSE PEREZ',1],['movil 116',2],['lucia cardinal',1],['AA123BB',1],['jose bonifacio',3]]){
      await query.fill(text);assert.equal(await page.locator('#os-table-body > tr').count(),count,'search: '+text);
      assert.match(await page.locator('.os-results-count').innerText(),new RegExp('^'+count+' servicio'));
    }
    // Combine a real filter option and search, then remove only the search chip.
    await query.fill('ana');await page.locator('[data-auxf="driver"] [data-auxf-open]').click();
    await page.getByRole('option',{name:'Lucía Gómez',exact:true}).click();
    assert.equal(await page.locator('.os-filter-chip').count(),2);
    await page.locator('[data-os-remove-filter="query"]').click();
    assert.equal(await query.inputValue(),'');assert.equal(await page.locator('#os-table-body > tr').count(),2);
    assert.equal(await page.locator('.ax-search-clear').isVisible(),false,'programmatic clear updates the enhancement');
    assert.match(await page.locator('.os-filter-chips').innerText(),/Lucía Gómez/);
    await query.fill('sin coincidencias');assert.equal(await page.locator('#os-table-body > tr').count(),0);
    assert.equal(await page.getByRole('heading',{name:'No encontramos servicios con estos filtros'}).isVisible(),true);
    await page.locator('#os-empty [data-os-empty-reset]').click();
    assert.equal(await page.locator('#os-table-body > tr').count(),3);assert.equal(await query.inputValue(),'');
    assert.equal(await page.locator('.os-filter-chip').count(),0);
    assert.equal(await query.evaluate(e=>e===document.activeElement),true);
    // State tabs participate in the result summary and can be cleared independently.
    await page.locator('[data-os-tab="at_origin"]').click();assert.equal(await page.locator('#os-table-body > tr').count(),1);
    assert.match(await page.locator('.os-filter-chips').innerText(),/Estado: Arribado/);
    await page.locator('[data-os-remove-filter="status"]').click();assert.equal(await page.locator('#os-table-body > tr').count(),3);
    await page.locator('#os-view-history').click();
    assert.equal(await page.locator('#os-table-body > tr').count(),25);
    assert.match(await page.locator('.os-results-count').innerText(),/^1–25 de 52 resultados/);
    await page.locator('#os-history-pager').getByRole('button',{name:'Página siguiente',exact:true}).click();
    assert.match(await page.locator('.os-results-count').innerText(),/^26–50 de 52 resultados/);
    await query.fill('H51');assert.equal(await page.locator('#os-table-body > tr').count(),1);
    assert.equal(await page.locator('#os-history-pager').isVisible(),false);
    await page.locator('[data-os-remove-filter="query"]').click();
    assert.match(await page.locator('.os-results-count').innerText(),/^1–25 de 52 resultados/);
    await page.locator('#os-view-active').click();
    // CSS cascade, text geometry, overflow and themes at the widths that previously overlapped.
    for(const width of [1440,1060,768,720,390,320]){
      await page.setViewportSize({width,height:1000});
      for(const theme of ['light','dark']){
        await page.evaluate(t=>AuxTheme.set(t),theme);
        await page.waitForTimeout(80);
        const geometry=await page.evaluate(()=>{
          const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width};};
          const controls=['.os-view-switch','#os-active-count','.os-icon-btn:not(#os-refresh)','#os-refresh','.os-manage'].map(s=>({selector:s,...rect(s)}));
          return {header:rect('.topbar'),bar:rect('.os-commandbar'),view:rect('.os-view-switch'),filters:rect('.os-filters'),controls,overflow:document.documentElement.scrollWidth-innerWidth};
        });
        assert.ok(geometry.bar.y>=geometry.header.bottom+8,'header clearance at '+width+': '+JSON.stringify(geometry));
        assert.ok(geometry.filters.y>=geometry.view.bottom+8,'filters below view controls at '+width);
        assert.ok(geometry.overflow<=1,'page overflow at '+width);
        for(let i=0;i<geometry.controls.length;i++)for(let j=i+1;j<geometry.controls.length;j++){
          const a=geometry.controls[i],b=geometry.controls[j],intersects=Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1;
          assert.equal(intersects,false,'overlapping controls at '+width+': '+a.selector+' / '+b.selector);
        }
        if([1060,390,320].includes(width))await page.screenshot({path:path.join(out,theme+'-'+width+'.png'),fullPage:true});
      }
    }
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log('PASS: real Servicios module, expanded/accent-insensitive multi-term search, individual/combined filter removal, empty recovery, state counts, history pagination; header spacing and non-overlapping controls at 1440/1060/768/720/390/320 in light and dark. RPC reads mocked; no external requests.');
  }finally{if(browser)await browser.close();app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

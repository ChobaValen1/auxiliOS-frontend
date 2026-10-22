/* Real Servicios module + real styles. RPC reads are simulated; all other RPCs fail. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../output/servicios-v525');
const index=fs.readFileSync(path.join(root,'Index.html'),'utf8');
const links=[...index.slice(0,index.indexOf('</head>')).matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(m=>m[0]).filter(s=>!s.includes('https://')).join('\n');
const shell=index.slice(index.indexOf('<nav class="sidenav">'),index.indexOf('<div class="content">'));
const sample=(id,overrides={})=>({service_id:id,service_order_number:'QA-'+id,service_number:'AX-'+id,status:'assigned',company_id:'a',company_name:'Cardinal',customer_name:'María López',vehicle_plate:'AA123BB',vehicle_make_model:'Ford Focus',origin:'Av. José Bonifacio 100, Mar del Plata, Buenos Aires, Argentina',destination:'Av. 7 y calle 50, La Plata, Buenos Aires, Argentina',scheduled_for:new Date().toISOString(),assigned_driver_id:'d1',assigned_truck_id:'t1',document_status:'not_started',...overrides});
const rows=[sample('1'),sample('2',{company_id:'b',company_name:'SOS',customer_name:'Pedro García',vehicle_plate:'CC456DD',assigned_driver_id:'d2',assigned_truck_id:'t2',status:'at_origin'}),sample('3',{customer_name:'Ana Sánchez',vehicle_plate:'EE789FF',assigned_driver_id:'d2',assigned_truck_id:'t2'}),...Array.from({length:52},(_,i)=>sample('H'+i,{status:'completed'}))];
const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/auxilios-filters-v1.css">${links}</head><body class="nav-collapsed">${shell}<div class="content"><div class="screen active" id="screen-dashboard"></div></div></div>
<script>window.PERFIL_USUARIO={roles:{name:'administracion'}};window.SCREENS={};window.calls=[];window.rows=${JSON.stringify(rows)};
window.goTo=name=>{document.querySelectorAll('.screen').forEach(e=>e.classList.toggle('active',e.id==='screen-'+name));document.querySelector('.topbar-title').textContent='Servicios';};window.toggleSidenav=()=>{};window.qaViewed=null;window.qaNotices=[];window.toast=m=>qaNotices.push(m);window.verServicioWorkspace=id=>{qaViewed=id};
window._db={rpc:async name=>{calls.push(name);if(name==='get_operator_service_reference_data')return{data:{companies:[{company_id:'a',trade_name:'Cardinal'},{company_id:'b',trade_name:'SOS'}],drivers:[{user_id:'d1',full_name:'José Pérez'},{user_id:'d2',full_name:'Lucía Gómez'}],trucks:[{truck_id:'t1',numero_interno:'Móvil 122',plate:'TR122AA'},{truck_id:'t2',numero_interno:'Móvil 116',plate:'TR116AA'}],concepts:[]}};if(name==='list_operator_services')return{data:rows};if(['list_operator_service_document_connections_v2','list_driver_service_intakes_v2','list_driver_activated_services_v1'].includes(name))return{data:[]};throw new Error('RPC fuera del alcance de lectura: '+name);}};
</script><script src="/ui/theme-v1.js"></script><script src="/ui/ax.js"></script><script src="/auxilios-filters-v1.js"></script><script src="/operator-services.js"></script><script src="/operator-service-lifecycle.js"></script><script>OperatorServices.loadResourceAvailability=async()=>true;</script><script src="/ui/motion/motion-v1.js"></script></body></html>`;
const app=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
if(process.argv.includes('--serve'))app.listen(4876,'127.0.0.1',()=>console.log('Servicios aislados: http://127.0.0.1:4876/'));
else (async()=>{
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
    const first=page.locator('#os-table-body > tr[data-service-id="1"]');
    assert.equal(await first.locator('[data-os-primary]').getAttribute('data-os-primary'),'arrive');
    await first.locator('.os-route-details summary').click();
    assert.equal(await first.locator('.os-route-details').getAttribute('open'),'');
    assert.match(await first.locator('.os-route-details dd').first().innerText(),/Mar del Plata, Buenos Aires, Argentina/);
    assert.equal(await page.evaluate(()=>qaViewed),null,'route disclosure does not open the service');
    await first.locator('.os-route-details summary').press('Enter');
    assert.equal(await first.locator('.os-route-details').getAttribute('open'),null,'keyboard toggles route');
    await first.locator('[data-os-primary="arrive"]').click();
    assert.equal(await page.getByRole('heading',{name:'Marcar servicio como ARRIBADO',exact:true}).isVisible(),true);
    assert.equal(await page.locator('#os-lifecycle-modal input[name="arrival_reason"]').count(),3);
    await page.locator('#os-lifecycle-modal').getByRole('button',{name:'Cancelar',exact:true}).click();
    assert.equal(await page.evaluate(()=>qaViewed),null,'primary action does not bubble to the row');
    await page.evaluate(()=>{const s=OperatorServices.S.services.find(s=>s.service_id==='3');Object.assign(s,{status:'pending',assigned_driver_id:null,assigned_truck_id:null});OperatorServices.renderServices();});
    const pending=page.locator('#os-table-body > tr[data-service-id="3"]');
    assert.match(await pending.locator('.col-crew').innerText(),/Sin chofer\s+Sin móvil/);
    await pending.locator('[data-os-primary="assign"]').click();
    assert.equal(await page.getByRole('heading',{name:'Asignar servicio',exact:true}).isVisible(),true);
    assert.equal(await page.locator('#osl-quick-driver').isVisible(),true);
    await page.locator('#os-lifecycle-modal').getByRole('button',{name:'Cancelar',exact:true}).click();
    // Never expose a state transition to read-only roles. Existing secondary permissions stay intact.
    for(const role of ['operador','supervision','facturacion']){
      await page.evaluate(role=>{PERFIL_USUARIO.roles.name=role;OperatorServices.renderServices();},role);
      assert.equal(await pending.locator('[data-os-primary]').getAttribute('data-os-primary'),role==='operador'?'assign':'view');
      await pending.locator('.os-more').click();
      assert.equal(await page.locator('#os-row-menu button').first().evaluate(e=>e===document.activeElement),true,'menu receives keyboard focus');
      if(role!=='operador')assert.equal(await page.locator('#os-row-menu button').count(),1);
      await page.keyboard.press('Escape');
      assert.equal(await pending.locator('.os-more').evaluate(e=>e===document.activeElement),true,'Escape restores menu opener focus');
    }
    await page.evaluate(()=>{PERFIL_USUARIO.roles.name='administracion';OperatorServices.renderServices();});
    const actionCases=[
      [{status:'pending'},'assign'],[{status:'pending',logistics_type:'third_party'},'assign'],
      [{status:'assigned'},'arrive'],[{status:'at_origin'},'view'],[{status:'en_route'},'view'],
      [{status:'assigned',remito_id:12,document_status:'submitted',remito_status:'firmado'},'view'],
      [{status:'assigned',driver_activated:true},'view'],[{status:'assigned',logistics_type:'third_party'},'view']
    ];
    for(const [fields,expected] of actionCases){
      await page.evaluate(fields=>{OperatorServices.S.services=structuredClone(rows);Object.assign(OperatorServices.S.services[0],fields);OperatorServices.renderServices();},fields);
      assert.equal(await first.locator('[data-os-primary]').getAttribute('data-os-primary'),expected,'canonical action for '+JSON.stringify(fields));
    }
    await page.evaluate(()=>{OperatorServices.S.services=structuredClone(rows);OperatorServices.renderServices();});
    // A stale visible action is revalidated against the refreshed row before opening a dialog.
    await page.evaluate(()=>{OperatorServices.S.services.find(s=>s.service_id==='1').status='cancelled';});
    await first.locator('[data-os-primary="arrive"]').click();
    assert.equal(await page.locator('#os-lifecycle-modal').isVisible(),false);
    assert.match(await page.evaluate(()=>qaNotices.at(-1)),/El servicio cambió/);
    await page.evaluate(()=>{OperatorServices.S.services=structuredClone(rows);OperatorServices.renderServices();});
    // Respect individually hidden data inside compact groups and address preferences.
    await page.evaluate(()=>{OperatorServices.S.moduleConfig.column_visibility.mobile=false;OperatorServices.S.moduleConfig.location_detail.address=false;OperatorServices.renderServices();});
    assert.equal(await first.locator('.os-crew-mobile').count(),0);
    assert.equal(await first.locator('.os-route-details').count(),0);
    assert.doesNotMatch(await first.locator('.col-route').innerText(),/Bonifacio/);
    await page.evaluate(()=>{OperatorServices.S.moduleConfig.column_visibility.mobile=true;OperatorServices.S.moduleConfig.location_detail.address=true;OperatorServices.renderServices();});
    await page.locator('#os-view-history').click();
    assert.equal(await page.locator('#os-table-body > tr').count(),25);
    assert.match(await page.locator('.os-results-count').innerText(),/^1–25 de 52 resultados/);
    await page.locator('#os-history-pager').getByRole('button',{name:'Página siguiente',exact:true}).click();
    assert.match(await page.locator('.os-results-count').innerText(),/^26–50 de 52 resultados/);
    const wrap=page.locator('#screen-operaciones .os-table-wrap');
    await page.locator('#os-table-body tr').nth(2).locator('[data-os-primary="view"]').click();
    assert.match(await page.evaluate(()=>qaViewed),/^H/);
    // Measure after clicking: browser focus/scroll-into-view can legitimately move a row.
    await wrap.evaluate(el=>{el.scrollTop=160;el.scrollLeft=100;});
    const scroll=await wrap.evaluate(el=>({top:el.scrollTop,left:el.scrollLeft}));
    const returnTrace=await page.evaluate(()=>{const t=document.querySelector('#screen-operaciones .os-table-wrap'),trace={before:t.scrollTop,hook:window.__osNavHook};goTo('dashboard');trace.hidden=t.scrollTop;goTo('operaciones');trace.returned=t.scrollTop;return trace;});
    assert.match(await page.locator('.os-results-count').innerText(),/^26–50 de 52 resultados/,'return keeps history and page');
    assert.deepEqual(await wrap.evaluate(el=>({top:el.scrollTop,left:el.scrollLeft})),scroll,'return preserves table position: '+JSON.stringify(returnTrace));
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
        const firstRow=page.locator('#os-table-body > tr').first();
        assert.equal(await firstRow.locator('.os-primary-action').isVisible(),true,'primary action visible at '+width);
        const overlap=await firstRow.evaluate(row=>{const a=row.querySelector('.actions').getBoundingClientRect(),b=row.querySelector('.col-code').getBoundingClientRect();return Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;});
        assert.equal(overlap,false,'actions do not overlap service code at '+width);
        assert.equal(await page.locator('.os-table th.actions').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>0),true,'actions heading is not suppressed at '+width);
        for(let i=0;i<geometry.controls.length;i++)for(let j=i+1;j<geometry.controls.length;j++){
          const a=geometry.controls[i],b=geometry.controls[j],intersects=Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1;
          assert.equal(intersects,false,'overlapping controls at '+width+': '+a.selector+' / '+b.selector);
        }
        if([1440,1060,390,320].includes(width))await page.screenshot({path:path.join(out,theme+'-'+width+'.png'),fullPage:true});
      }
    }
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log('PASS: real Servicios + lifecycle dialogs; route disclosure mouse/keyboard, explicit missing crew, canonical primary actions, stale-state protection, read-only roles, secondary menu/Escape, hidden fields, history/page/scroll retained, search/filters/pagination, 6 widths in both themes. RPC reads mocked; no external requests or data writes.');
  }finally{if(browser)await browser.close();app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

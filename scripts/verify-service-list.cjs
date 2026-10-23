/* Real Servicios module + real styles. RPC reads are simulated; all other RPCs fail. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../output/servicios-v532');
const index=fs.readFileSync(path.join(root,'Index.html'),'utf8');
const links=[...index.slice(0,index.indexOf('</head>')).matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(m=>m[0]).filter(s=>!s.includes('https://')).join('\n');
const shell=index.slice(index.indexOf('<nav class="sidenav">'),index.indexOf('<div class="content">'));
const sample=(id,overrides={})=>({service_id:id,service_order_number:'QA-'+id,service_number:'AX-'+id,status:'assigned',company_id:'a',company_name:'Cardinal',billing_base_id:'base2',customer_name:'María López',vehicle_plate:'AA123BB',vehicle_make_model:'Ford Focus',origin:'Av. José Bonifacio 100, Mar del Plata, Buenos Aires, Argentina',destination:'Av. 7 y calle 50, La Plata, Buenos Aires, Argentina',scheduled_for:new Date().toISOString(),assigned_driver_id:'d1',assigned_truck_id:'t1',document_status:'not_started',...overrides});
const rows=[sample('1'),sample('2',{company_id:'b',company_name:'SOS',customer_name:'Pedro García',vehicle_plate:'CC456DD',assigned_driver_id:'d2',assigned_truck_id:'t2',status:'at_origin'}),sample('3',{customer_name:'Ana Sánchez',vehicle_plate:'EE789FF',assigned_driver_id:'d2',assigned_truck_id:'t2'}),...Array.from({length:52},(_,i)=>sample('H'+i,{status:'completed'}))];
const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/auxilios-filters-v1.css">${links}</head><body class="nav-collapsed">${shell}<div class="content"><div class="screen active" id="screen-dashboard"></div></div></div>
<script>window.PERFIL_USUARIO={roles:{name:'administracion'}};window.SCREENS={};window.calls=[];window.rows=${JSON.stringify(rows)};window.routeModes={a:'base_origin_destination_base',b:'origin_destination'};window.failRouteContext=false;
window.goTo=name=>{document.querySelectorAll('.screen').forEach(e=>e.classList.toggle('active',e.id==='screen-'+name));document.querySelector('.topbar-title').textContent='Servicios';};window.toggleSidenav=()=>{};window.qaViewed=null;window.qaNotices=[];window.toast=m=>qaNotices.push(m);window.verServicioWorkspace=id=>{qaViewed=id};
window._db={rpc:async(name,args)=>{calls.push(name);if(name==='get_operator_service_context_v1'){await new Promise(r=>setTimeout(r,20));if(failRouteContext)return{error:{message:'offline'}};return{data:{billing:{route_mode:routeModes[args.p_company_id]},bases:[{base_id:'base1',latitude:-34,longitude:-58},{base_id:'base2',latitude:-35,longitude:-57}],services:[]}};}if(name==='get_operator_service_reference_data')return{data:{companies:[{company_id:'a',trade_name:'Cardinal'},{company_id:'b',trade_name:'SOS'}],drivers:[{user_id:'d1',full_name:'José Pérez'},{user_id:'d2',full_name:'Lucía Gómez'}],trucks:[{truck_id:'t1',numero_interno:'Móvil 122',plate:'TR122AA'},{truck_id:'t2',numero_interno:'Móvil 116',plate:'TR116AA'}],concepts:[]}};if(name==='list_operator_services')return{data:rows};if(['list_operator_service_document_connections_v2','list_driver_service_intakes_v2','list_driver_activated_services_v1'].includes(name))return{data:[]};throw new Error('RPC fuera del alcance de lectura: '+name);}};
</script><script src="/ui/theme-v1.js"></script><script src="/ui/ax.js"></script><script src="/ui/service-improvements-v1.js"></script><script src="/auxilios-filters-v1.js"></script><script src="/operator-services.js"></script><script src="/operator-service-lifecycle.js"></script><script>OperatorServices.loadResourceAvailability=async()=>true;</script><script src="/ui/motion/motion-v1.js"></script></body></html>`;
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
    await page.evaluate(()=>{delete OperatorServices.S.services[0].document_status;OperatorServices.renderServices();});
    assert.match(await first.locator('.col-status').innerText(),/Remito pend…/,'operator projection without document_status uses the completed document-inbox read');
    assert.equal(await first.locator('.os-document-state').getAttribute('title'),'Remito pendiente');
    await page.evaluate(()=>{OperatorServices.S.services=structuredClone(rows);OperatorServices.renderServices();});
    assert.equal(await first.locator('[data-os-primary],.os-route-details,.os-route-label').count(),0,'no redundant disclosure or row primary action');
    await first.getByRole('link',{name:'Ver recorrido',exact:true}).waitFor({state:'visible'});
    const originUrl=new URL(await first.getByRole('link',{name:'Ver recorrido',exact:true}).getAttribute('href'));
    assert.equal(originUrl.origin,'https://www.google.com');assert.equal(originUrl.pathname,'/maps/dir/');assert.equal(originUrl.searchParams.get('api'),'1');
    assert.equal(originUrl.searchParams.get('origin'),'-35,-57');assert.equal(originUrl.searchParams.get('destination'),'-35,-57');
    assert.match(originUrl.searchParams.get('waypoints'),/Bonifacio.*\|.*La Plata/);
    assert.equal(await first.locator('.os-map-link').count(),1,'compact has one complete-route map');
    const secondRoute=new URL(await page.locator('tr[data-service-id="2"] a.os-map-link').getAttribute('href'));
    assert.match(secondRoute.searchParams.get('origin'),/Bonifacio/);assert.match(secondRoute.searchParams.get('destination'),/La Plata/);assert.equal(secondRoute.searchParams.has('waypoints'),false);
    assert.equal(await first.locator('.os-map-link').first().getAttribute('target'),'_blank');
    assert.match(await first.locator('.os-map-link').first().getAttribute('rel'),/noopener/);
    const selector=first.locator('.os-status');
    assert.equal(await selector.getAttribute('aria-haspopup'),'menu');
    assert.equal(await selector.getAttribute('aria-controls'),'osl-quick-status-menu');
    const idleSelector=await selector.evaluate(el=>{const s=getComputedStyle(el),a=getComputedStyle(el,'::after');return{background:s.backgroundColor,radius:s.borderRadius,arrow:a.content,arrowWidth:a.width};});
    assert.equal(idleSelector.radius,'9px');assert.equal(idleSelector.arrow,'""');assert.equal(idleSelector.arrowWidth,'6px');
    await selector.hover();
    assert.notEqual(await selector.evaluate(el=>getComputedStyle(el).backgroundColor),idleSelector.background,'rounded hover is visible without moving or recoloring state');
    await page.screenshot({path:path.join(out,'estado-hover-1440.png'),fullPage:true});
    await selector.click();
    assert.equal(await selector.getAttribute('aria-expanded'),'true');
    const statusMenu=page.locator('#osl-quick-status-menu');
    assert.equal(await statusMenu.locator('[data-osl-suggested],.is-next').count(),0,'no automatic status highlight');
    await statusMenu.locator('[data-osl-quick-action="arrive"]').click();
    assert.equal(await page.getByRole('heading',{name:'Marcar servicio como ARRIBADO',exact:true}).isVisible(),true);
    assert.equal(await page.locator('#os-lifecycle-modal input[name="arrival_reason"]').count(),3);
    await page.locator('#os-lifecycle-modal').getByRole('button',{name:'Cancelar',exact:true}).click();
    assert.equal(await page.evaluate(()=>qaViewed),null,'status action does not bubble to the row');
    await page.evaluate(()=>{const s=OperatorServices.S.services.find(s=>s.service_id==='3');Object.assign(s,{status:'pending',assigned_driver_id:null,assigned_truck_id:null});OperatorServices.renderServices();});
    const pending=page.locator('#os-table-body > tr[data-service-id="3"]');
    assert.match(await pending.locator('.col-crew').innerText(),/Sin chofer\s+Sin móvil/);
    await pending.locator('.os-status').press('Enter');
    assert.equal(await statusMenu.locator('[data-osl-suggested],.is-next').count(),0);
    await statusMenu.locator('[data-osl-quick-action="assign"]').click();
    assert.equal(await page.getByRole('heading',{name:'Asignar servicio',exact:true}).isVisible(),true);
    assert.equal(await page.locator('#osl-quick-driver').isVisible(),true);
    await page.locator('#os-lifecycle-modal').getByRole('button',{name:'Cancelar',exact:true}).click();
    // Never expose a state transition to read-only roles. Existing secondary permissions stay intact.
    for(const role of ['operador','supervision','facturacion']){
      await page.evaluate(role=>{PERFIL_USUARIO.roles.name=role;OperatorServices.renderServices();},role);
      await pending.locator('.os-status').click();
      assert.equal(await statusMenu.locator('[data-osl-suggested]').count(),0);
      await page.keyboard.press('Escape');
      assert.equal(await pending.locator('.os-status').evaluate(e=>e===document.activeElement),true,'status menu Escape returns focus');
      await pending.locator('.os-more').click();
      assert.equal(await page.locator('#os-row-menu button').first().evaluate(e=>e===document.activeElement),true,'menu receives keyboard focus');
      if(role!=='operador')assert.equal(await page.locator('#os-row-menu button').count(),1);
      const maps=page.locator('#os-row-menu a');await maps.waitFor({state:'visible'});
      assert.equal(await maps.count(),1);
      const route=new URL(await maps.getAttribute('href'));
      assert.equal(route.pathname,'/maps/dir/');assert.equal(route.searchParams.get('origin'),'-35,-57');assert.equal(route.searchParams.get('destination'),'-35,-57');
      assert.equal(await maps.innerText(),'Ver recorrido');
      if(role==='operador')assert.equal(await page.locator('#os-row-menu').evaluate(menu=>{const items=[...menu.querySelectorAll('[role="menuitem"]')];return items.findIndex(el=>el.textContent.trim()==='Ver recorrido')+1===items.findIndex(el=>el.textContent.trim()==='Anular');}),true,'route is immediately above Anular');
      await page.keyboard.press('End');
      if(role==='operador')await page.keyboard.press('ArrowUp');
      assert.equal(await maps.evaluate(e=>e===document.activeElement),true,'map action participates in menu keyboard navigation');
      await page.keyboard.press('Escape');
      assert.equal(await pending.locator('.os-more').evaluate(e=>e===document.activeElement),true,'Escape restores menu opener focus');
    }
    await page.evaluate(()=>{PERFIL_USUARIO.roles.name='administracion';OperatorServices.renderServices();});
    // Persisted remito states are labels, not evidence that a driver has a form open.
    for(const [fields,label] of [
      [{document_status:'not_started'},'Remito pend…'],
      [{document_status:'draft',remito_status:'borrador'},''],
      [{document_status:'submitted',remito_status:'firmado',remito_id:12},'Remito en revisión'],
      [{document_status:'approved',remito_status:'firmado',remito_id:12},'Remito aprobado'],
      [{document_status:'observed',remito_status:'firmado',remito_id:12},'Remito requiere correcciones']
    ]){
      await page.evaluate(fields=>{OperatorServices.S.services=structuredClone(rows);Object.assign(OperatorServices.S.services[0],fields);OperatorServices.renderServices();},fields);
      assert.match(await first.locator('.col-status').innerText(),new RegExp(label));
      if(fields.document_status==='draft'){
        assert.equal(await first.locator('.os-document-state,.ax-remito-preparing').count(),0,'draft notice is removed, not relabeled');
        assert.equal(await page.evaluate(()=>AuxiliosServiceImprovements.remitoNotice(OperatorServices.S.services[0])), '','detail uses the same empty notice');
      }
      assert.doesNotMatch(await first.locator('.col-status').innerText(),/Creando remito|Remito firmado · Revisar|Remito recibido|Remito en preparación|Remito incompleto|Carga iniciada/);
      if(fields.remito_id)assert.equal(await first.locator('button.os-document-state').innerText(),label,'signed document action is still available');
    }
    await page.evaluate(()=>{OperatorServices.S.services=structuredClone(rows);OperatorServices.renderServices();});
    const actionCases=[
      [{status:'pending'},'assign'],[{status:'pending',logistics_type:'third_party'},'assign'],
      [{status:'assigned'},'arrive'],[{status:'at_origin'},'finalize'],[{status:'en_route'},null],
      [{status:'assigned',remito_id:12,document_status:'submitted',remito_status:'firmado'},'finalize'],
      [{status:'assigned',driver_activated:true},'finalize'],[{status:'assigned',logistics_type:'third_party'},'finalize']
    ];
    for(const [fields,expected] of actionCases){
      await page.evaluate(fields=>{OperatorServices.S.services=structuredClone(rows);Object.assign(OperatorServices.S.services[0],fields);OperatorServices.renderServices();},fields);
      if(expected===null){assert.equal(await first.locator('.os-status').getAttribute('role'),null);assert.equal(await first.locator('.os-status').evaluate(el=>getComputedStyle(el,'::after').content),'none','no dropdown arrow without actions');continue;}
      await first.locator('.os-status').click();
      assert.equal(await statusMenu.locator('[data-osl-suggested],.is-next').count(),0,'no highlighted action for '+JSON.stringify(fields));
      assert.equal(await statusMenu.locator('[data-osl-quick-action="annul"].is-next').count(),0,'destructive action is never primary');
      await page.keyboard.press('Escape');
    }
    await page.evaluate(()=>{OperatorServices.S.services=structuredClone(rows);OperatorServices.renderServices();});
    await page.evaluate(()=>{OperatorServices.S.services[0].truck_label='MOVIL 110';OperatorServices.renderServices();});
    assert.equal(await first.locator('.os-crew-mobile').innerText(),'MOVIL 110','existing mobile prefix is not duplicated');
    await page.evaluate(()=>{OperatorServices.S.services=structuredClone(rows);OperatorServices.renderServices();});
    // A stale visible action is revalidated against the refreshed row before opening a dialog.
    await first.locator('.os-status').click();
    await page.evaluate(()=>{OperatorServices.S.services.find(s=>s.service_id==='1').status='cancelled';});
    await statusMenu.locator('[data-osl-quick-action="arrive"]').click();
    assert.equal(await page.locator('#os-lifecycle-modal').isVisible(),false);
    assert.match(await page.evaluate(()=>qaNotices.at(-1)),/El servicio cambió/);
    await page.evaluate(()=>{OperatorServices.S.services=structuredClone(rows);OperatorServices.renderServices();});
    // Respect individually hidden data inside compact groups and address preferences.
    await page.evaluate(()=>{OperatorServices.S.moduleConfig.column_visibility.mobile=false;OperatorServices.S.moduleConfig.location_detail.address=false;OperatorServices.renderServices();});
    assert.equal(await first.locator('.os-crew-mobile').count(),0);
    assert.equal(await first.locator('.os-map-link').count(),1,'map is an independent billing-route control, not a hidden address preview');
    assert.doesNotMatch(await first.locator('.col-route').innerText(),/Bonifacio/);
    await page.evaluate(()=>{OperatorServices.S.moduleConfig.column_visibility.mobile=true;OperatorServices.S.moduleConfig.location_detail.address=true;OperatorServices.renderServices();});
    await page.evaluate(()=>{const s=OperatorServices.S;s.personalPreference={column_order:s.moduleConfig.column_order.slice(),column_visibility:{...s.moduleConfig.column_visibility},location_detail:{...s.moduleConfig.location_detail},density:'wide'};OperatorServices.renderServices();});
    assert.equal(await first.locator('.col-maps .os-map-link').count(),1,'wide has a separate route-map column');
    assert.equal(await first.locator('.col-origin .os-map-link,.col-destination .os-map-link').count(),0,'no individual place maps in wide view');
    assert.equal(await page.locator('#os-table-head').evaluate(row=>{const keys=[...row.children].map(el=>el.className);return keys.findIndex(k=>k.includes('col-maps'))+1===keys.findIndex(k=>k.includes('col-actions'));}),true,'route-map column sits beside Actions');
    await page.locator('#screen-operaciones .os-table-wrap').evaluate(el=>{el.scrollLeft=el.scrollWidth;});
    await page.screenshot({path:path.join(out,'wide-1440.png'),fullPage:true});
    await page.evaluate(()=>{OperatorServices.S.personalPreference=null;OperatorServices.renderServices();});
    await page.evaluate(()=>{failRouteContext=true;});await page.locator('#os-refresh').click();
    await page.waitForFunction(()=>document.querySelectorAll('#os-table-body a.os-map-link').length===0&&document.querySelector('#os-table-body .os-map-link')?.title.includes('No se pudo'));
    await page.evaluate(()=>{failRouteContext=false;});await page.locator('#os-refresh').click();
    await first.locator('a.os-map-link').waitFor({state:'visible'});
    await page.locator('#os-view-history').click();
    assert.equal(await page.locator('#os-table-body > tr').count(),25);
    assert.match(await page.locator('.os-results-count').innerText(),/^1–25 de 52 resultados/);
    await page.locator('#os-history-pager').getByRole('button',{name:'Página siguiente',exact:true}).click();
    assert.match(await page.locator('.os-results-count').innerText(),/^26–50 de 52 resultados/);
    const wrap=page.locator('#screen-operaciones .os-table-wrap');
    await page.locator('#os-table-body tr').nth(2).locator('.os-service-code').click();
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
    await page.evaluate(()=>{for(const [index,document_status] of ['submitted','approved','observed'].entries())Object.assign(OperatorServices.S.services[index],{document_status,remito_id:12+index,remito_status:'firmado'});OperatorServices.renderServices();});
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
        assert.equal(await firstRow.locator('.os-primary-action').count(),0,'no primary button in row at '+width);
        assert.equal(await firstRow.locator('.os-map-link').first().isVisible(),true,'map shortcut visible at '+width);
        assert.equal(await firstRow.locator('.os-document-state').innerText(),'Remito en revisión');
        const documentGeometry=await page.locator('#os-table-body .os-document-state.is-action').evaluateAll(els=>els.map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,whiteSpace:getComputedStyle(el).whiteSpace,overflow:getComputedStyle(el).overflow,textOverflow:getComputedStyle(el).textOverflow,title:el.title})));
        for(const rect of documentGeometry){assert.equal(rect.width,documentGeometry[0].width,'same badge width at '+width);assert.equal(rect.height,26,'one fixed row at '+width);assert.equal(rect.whiteSpace,'nowrap');assert.equal(rect.overflow,'hidden');assert.equal(rect.textOverflow,'ellipsis');assert.ok(rect.title.includes('Remito'));}
        const overlap=await firstRow.evaluate(row=>{const a=row.querySelector('.actions').getBoundingClientRect(),range=document.createRange();range.selectNodeContents(row.querySelector('.col-code b'));const b=range.getBoundingClientRect();return Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;});
        assert.equal(overlap,false,'actions do not overlap service code at '+width);
        // Mobile uses cards and intentionally hides the entire table header.
        if(width>=721)assert.equal(await page.locator('.os-table th.actions').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>0),true,'desktop actions heading is not suppressed at '+width);
        for(let i=0;i<geometry.controls.length;i++)for(let j=i+1;j<geometry.controls.length;j++){
          const a=geometry.controls[i],b=geometry.controls[j],intersects=Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1;
          assert.equal(intersects,false,'overlapping controls at '+width+': '+a.selector+' / '+b.selector);
        }
        if([1440,1060,390,320].includes(width))await page.screenshot({path:path.join(out,theme+'-'+width+'.png'),fullPage:true});
        if([1440,390].includes(width)){
          await firstRow.locator('.os-status').click();
          await page.screenshot({path:path.join(out,theme+'-estado-'+width+'.png'),fullPage:true});
          await page.keyboard.press('Escape');
        }
      }
    }
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log('PASS: rounded state hover, visible dropdown arrow and expanded state, no false affordance without actions; no suggested state highlight; billing routes/columns/menu order, keyboard/dialogs/roles, history/page/scroll/search/filters, 6 widths and both themes. No external requests or data writes.');
  }finally{if(browser)await browser.close();app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

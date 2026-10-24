const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ts=require('../motion-ui/node_modules/typescript');
const source=fs.readFileSync('motion-ui/src/driver-truck-model.ts','utf8');
const ctx={exports:{}};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,ctx);const api=ctx.exports;
test('odometer and maintenance never invent zeroes for unknown readings',()=>{
 assert.equal(api.number(null),'—');assert.equal(api.number(undefined),'—');assert.equal(api.number(''),'—');assert.equal(api.number(-1),'—');assert.equal(api.number(0),'0');
 const p=api.maintenance([{name:'Aceite',plan_estado:'sin_odometro',interval_km:10000,km_restantes:null}]);assert.equal(p.progress,null);assert.equal(p.detail,'Falta odómetro');
});
test('maintenance follows most urgent plan, clamps real interval and preserves hours',()=>{
 const p=api.maintenance([{name:'Menos urgente',plan_estado:'al_dia',urgencia:.9},{name:'Aceite',plan_estado:'proximo',urgencia:.08,interval_km:10000,km_restantes:850}]);
 assert.equal(p.title,'Aceite');assert.equal(p.detail,'En 850 km');assert.equal(p.progress,91.5);assert.equal(p.tone,'warning');
 const hours=api.maintenance([{name:'Motor',plan_estado:'vencido',manda:'horas',interval_hours:300,horas_restantes:-10}]);assert.equal(hours.progress,100);assert.equal(hours.detail,'Vencido hace 10 h');
});
test('missing controls are pending rather than bad; both tyres and brakes affect severity',()=>{
 assert.equal(api.controlSummary(null).label,'Control pendiente');assert.equal(api.controlSummary({tire_condition:'bueno',brake_condition:'malo'}).tone,'danger');
 assert.equal(api.controlSummary({tire_condition:'regular',brake_condition:'bueno'}).tone,'warning');
});
test('fuel ordering is immutable; empty fuel remains empty',()=>{
 const rows=[{fuel_date:'2026-10-20',liters:10},{fuel_date:'2026-10-24',liters:65}];assert.equal(api.latestFuel(rows).liters,65);assert.equal(rows[0].liters,10);assert.equal(api.latestFuel([]),null);
});
test('green requires confirmed healthy data and an unknown plan cannot hide behind a healthy one',()=>{
 assert.equal(api.controlSummary({tire_condition:'bueno',brake_condition:'bueno'}).status,'En orden');
 assert.equal(api.controlSummary({tire_condition:'bueno'}).tone,'warning');
 assert.equal(api.controlSummary({tire_condition:'bueno',brake_condition:'malo'}).status,'Requiere atención');
 const healthy={name:'Aceite',plan_estado:'al_dia',urgencia:.8,km_restantes:8000,interval_km:10000};
 assert.equal(api.maintenance([healthy]).status,'En orden');
 const missing=api.maintenance([healthy,{name:'Frenos',plan_estado:'sin_odometro'}]);assert.equal(missing.status,'Sin datos');assert.notEqual(missing.tone,'success');
 assert.equal(api.maintenance([]).status,'Sin planes');assert.notEqual(api.maintenance([]).tone,'success');
 const overdue=api.maintenance([healthy,{name:'Frenos',plan_estado:'vencido',km_restantes:-5}]);assert.equal(overdue.tone,'danger');assert.equal(overdue.status,'Vencido');
});
test('canonical UI is driver-only, existing forms and admin fallback are preserved',()=>{
 const s=fs.readFileSync('sigma.js','utf8'),ui=fs.readFileSync('motion-ui/src/driver-truck.tsx','utf8');
 assert.match(s,/PERFIL_USUARIO\?\.roles\?\.name === 'chofer' && _truckActual\?\.truck_id && window.AuxiliosTruckUI/);
 assert.match(ui,/app.openFuelModal/);assert.match(ui,/app.openNeumaticosModal/);assert.match(ui,/app.openServiceModal/);assert.match(ui,/app\._abrirSubCamion/);
 assert.match(s,/eq\('driver_id',driverId\)\.eq\('log_id',logId\)/);
 assert.match(s,/window\.AuxiliosTruckUI\?\.clear\(\)/);
 assert.doesNotMatch(ui,/En revisión|Resuelta|Operaciones recibió|nivel del tanque/i);
});
test('canonical adapter scopes report reads by authenticated driver and current journey',async()=>{
 const all=fs.readFileSync('sigma.js','utf8'),start=all.indexOf('function _renderCamionCards()'),end=all.indexOf('const _CAMION_SUBS',start),calls=[];
 const chain={select:v=>{calls.push(['select',v]);return chain},eq:(k,v)=>{calls.push([k,v]);return chain},order:()=>chain,limit:async()=>({data:[]})};
 let presented;const context={window:{AuxiliosTruckUI:{render:(_node,model)=>{presented=model}}},document:{getElementById:()=>({})},PERFIL_USUARIO:{roles:{name:'chofer'}},USUARIO_ACTUAL:{id:'driver'},_truckActual:{truck_id:11,current_km:100},_jornadasAbiertasCache:[{truck_id:11,log_id:22}],_camionLogDate:'2026-10-24',_camionNeumaticos:null,_camionCombustible:[],_camionPlanes:[],_db:{from:()=>chain}};
 vm.runInNewContext(all.slice(start,end)+';_renderCamionCards();',context);
 assert.equal(presented.identity,'driver:22:11');await presented.loadReports();
 assert.ok(calls.some(([k,v])=>k==='driver_id'&&v==='driver'));assert.ok(calls.some(([k,v])=>k==='log_id'&&v===22));
 context._jornadasAbiertasCache[0].log_id='TMP-offline';vm.runInNewContext('_renderCamionCards()',context);calls.length=0;await presented.loadReports();assert.equal(calls.length,0);
});

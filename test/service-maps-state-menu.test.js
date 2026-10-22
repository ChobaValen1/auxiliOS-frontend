const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const services=fs.readFileSync('operator-services.js','utf8'),lifecycle=fs.readFileSync('operator-service-lifecycle.js','utf8');
const routeSource=services.slice(services.indexOf('function routeCoordinate('),services.indexOf('function routeControl('));
const build=new Function('locationParts',routeSource+';return billingRoute;')((s,k)=>({raw:s[k]||'',address:s[k]||'—'}));
const route={origin:'Av. José Bonifacio 100 & 2, Mar del Plata',destination:'Calle 50 #400, La Plata',billing_base_id:'b2',primary_concept_id:'c1'};
const context=(mode='base_origin_destination_base')=>({billing:{route_mode:mode},bases:[{base_id:'b1',latitude:-34,longitude:-58},{base_id:'b2',latitude:-35,longitude:-57}],services:[]});
test('full billing circuit uses the selected base at both ends and origin/destination as ordered waypoints',()=>{
  const url=new URL(build(route,context()).href);
  assert.equal(url.origin,'https://www.google.com');assert.equal(url.pathname,'/maps/dir/');assert.equal(url.searchParams.get('api'),'1');
  assert.equal(url.searchParams.get('origin'),'-35,-57');assert.equal(url.searchParams.get('destination'),'-35,-57');
  assert.equal(url.searchParams.get('waypoints'),route.origin+'|'+route.destination);assert.equal(url.searchParams.get('travelmode'),'driving');
});
test('origin to destination does not invent a base leg, even if a base exists',()=>{
  const url=new URL(build(route,context('origin_destination')).href);
  assert.equal(url.searchParams.get('origin'),route.origin);assert.equal(url.searchParams.get('destination'),route.destination);assert.equal(url.searchParams.has('waypoints'),false);
});
test('base to origin ignores destination; manual, unknown and incomplete routes do not fall back to a shorter circuit',()=>{
  const url=new URL(build({...route,destination:''},context('base_origin')).href);assert.equal(url.searchParams.get('origin'),'-35,-57');assert.equal(url.searchParams.get('destination'),route.origin);
  assert.equal(build(route,context('manual')).href,undefined);assert.equal(build(route,context('unknown')).href,undefined);
  assert.equal(build({...route,billing_base_id:'missing'},context()).href,undefined);
  assert.equal(build({...route,origin:''},context()).href,undefined);
  assert.equal(build({...route,destination:''},context()).href,undefined);
});
test('single-address concept and address-only bases follow the editor route',()=>{
  const c=context();c.services=[{concept_id:'c1',single_address:true}];c.bases[1]={base_id:'b2',address:'Base Etcheverry, Buenos Aires'};
  const url=new URL(build({...route,destination:''},c).href);assert.equal(url.searchParams.get('origin'),'Base Etcheverry, Buenos Aires');assert.equal(url.searchParams.get('waypoints'),route.origin+'|'+route.origin);
});
test('coordinates accept zero without inventing empty coordinates; URLs remain fixed-host and length-limited',()=>{
  const zero=new URL(build({...route,origin_lat:0,origin_lng:0},context()).href);assert.equal(zero.searchParams.get('waypoints'),'0,0|'+route.destination);
  const blank=new URL(build({...route,origin_lat:'',origin_lng:''},context()).href);assert.match(blank.searchParams.get('waypoints'),/Bonifacio/);
  assert.equal(new URL(build({...route,origin:'javascript:alert(1)'},context()).href).protocol,'https:');
  assert.equal(build({...route,origin:'x'.repeat(3000)},context()).href,undefined);
});
test('status menu has no suggested highlight, only normal accessible focus',()=>{
  assert.doesNotMatch(lifecycle,/suggestedQuickAction|data-osl-suggested|class="is-next"/);
  assert.doesNotMatch(fs.readFileSync('operator-service-lifecycle.css','utf8'),/data-osl-suggested/);
});
test('wide route map is derived adjacent to Actions without changing the persisted configuration schema',()=>{
  const source=services.slice(services.indexOf('function columns('),services.indexOf('function groupShows('));
  const fn=new Function('baseColumns','effectiveColumns','HISTORY_GROUP_OF',source+';return columns;');
  const order=['code','origin','destination','driver','actions'];
  assert.deepEqual(fn(()=>order.slice(),()=>({density:'wide'}),{})(),['code','origin','destination','driver','maps','actions']);
  assert.deepEqual(fn(()=>order.slice(),()=>({density:'compact'}),{origin:'route',destination:'route'})(),['code','route','driver','actions']);
});
test('routing context cache is scoped to user, company and Buenos Aires operating date',()=>{
  const source=services.slice(services.indexOf('function routeContextKey('),services.indexOf('function prepareRouteContext('));
  const key=new Function('currentUserId','role',source+';return routeContextKey;')(()=> 'u1',()=> 'operador');
  assert.equal(key({company_id:'a',scheduled_for:null}),'');
  assert.equal(key({company_id:'a',scheduled_for:'invalid'}),'');
  assert.equal(key({company_id:'a',scheduled_for:'2026-10-22T15:00:00Z'}),key({company_id:'a',scheduled_for:'2026-10-22T20:00:00Z'}));
  assert.notEqual(key({company_id:'a',scheduled_for:'2026-10-22T02:30:00Z'}),key({company_id:'a',scheduled_for:'2026-10-22T03:30:00Z'}));
  assert.notEqual(key({company_id:'a',scheduled_for:'2026-10-22T15:00:00Z'}),key({company_id:'b',scheduled_for:'2026-10-22T15:00:00Z'}));
});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const services=fs.readFileSync('operator-services.js','utf8'),lifecycle=fs.readFileSync('operator-service-lifecycle.js','utf8');
function maps({hidden=[],address=true}={}){
  const source=services.slice(services.indexOf('function mapsPlace('),services.indexOf('function locationMapLink('));
  return new Function('groupShows','effectiveColumns','locationParts',source+';return mapsHref;')(
    kind=>!hidden.includes(kind),()=>({location_detail:{address}}),(s,kind)=>({raw:s[kind]||'',address:s[kind]||'—'})
  );
}
const route={origin:'Av. José Bonifacio 100 & 2, Mar del Plata',destination:'Calle 50 #400, La Plata'};
test('Maps links encode each address and use a fixed Google HTTPS host',()=>{
  const href=maps(),origin=new URL(href(route,'origin')),destination=new URL(href(route,'destination')),directions=new URL(href(route));
  assert.equal(origin.origin,'https://www.google.com');assert.equal(origin.pathname,'/maps/search/');assert.equal(origin.searchParams.get('api'),'1');
  assert.equal(origin.searchParams.get('query'),route.origin);assert.equal(destination.searchParams.get('query'),route.destination);
  assert.equal(directions.pathname,'/maps/dir/');assert.equal(directions.searchParams.get('origin'),route.origin);assert.equal(directions.searchParams.get('destination'),route.destination);
  assert.equal(directions.searchParams.get('travelmode'),'driving');
});
test('missing or hidden locations cannot silently become directions from the current device',()=>{
  assert.equal(maps()({},'origin'),'');assert.equal(maps()({},''),'');
  assert.equal(maps()({destination:'La Plata'},'origin'),'');
  const single=new URL(maps()({origin:'Mar del Plata'}));assert.equal(single.pathname,'/maps/search/');
  assert.equal(maps({address:false})(route),'');assert.equal(maps({hidden:['origin']})(route,'origin'),'');
  const visible=new URL(maps({hidden:['origin']})(route));assert.equal(visible.searchParams.get('query'),route.destination);assert.equal(visible.searchParams.has('origin'),false);
});
test('address text cannot change the Maps host and overlong links are not emitted',()=>{
  assert.equal(new URL(maps()({origin:'javascript:alert(1)'})).protocol,'https:');
  assert.equal(new URL(maps()({origin:'https://example.org/'})).hostname,'www.google.com');
  assert.equal(maps()({origin:'x'.repeat(3000)}),'');
});
function suggested(manage=true){
  const source=lifecycle.slice(lifecycle.indexOf('function suggestedQuickAction('),lifecycle.indexOf('function openQuickStatusMenu('));
  return new Function('canTransition','normalizedStatus',source+';return suggestedQuickAction;')(()=>manage,s=>s.status);
}
test('only the next eligible forward action is highlighted, never reversals or cancellation',()=>{
  const next=suggested();
  assert.equal(next({status:'pending'},[['annul'],['assign']]),'assign');
  assert.equal(next({status:'pending'},[['assign_outsourced'],['finalize']]),'assign_outsourced');
  assert.equal(next({status:'assigned'},[['reassign'],['arrive'],['finalize']]),'arrive');
  assert.equal(next({status:'assigned'},[['finalize']]),'finalize');
  assert.equal(next({status:'at_origin'},[['unarrive'],['finalize']]),'finalize');
  assert.equal(next({status:'assigned',driver_activated:true},[['revert_activation'],['finalize']]),'finalize');
  for(const status of ['completed','cancelled','en_route'])assert.equal(next({status},[['annul'],['revert_activation']]),'');
  assert.equal(next({status:'pending'},[['annul']]),'');
  assert.equal(suggested(false)({status:'pending'},[['assign']]),'');
});

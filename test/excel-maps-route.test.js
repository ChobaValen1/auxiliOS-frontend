const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const address=require('../address-parts-v1.js');

/* Carga el exportador real en un navegador mínimo. */
function loadExport(){
  const el=()=>({id:'',textContent:'',appendChild(){},remove(){}});
  const window={AuxiliosAddress:address,localStorage:{getItem:()=>null,setItem(){}}};
  const document={readyState:'complete',getElementById:()=>null,createElement:el,head:{appendChild(){}},body:{appendChild(){}},querySelector:()=>null,addEventListener(){}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'operator-billing-export.js'),'utf8'),{window,document,console,Intl,Date,Math,Number,String,Set,Map,JSON,encodeURIComponent});
  const E=window.OperatorBillingExcel;
  return {mapsRoute:E.mapsRoute,originStreet:E.originStreet,cols:new Map(E.serviceColumns.map(c=>[c.id,c]))};
}

test('Excel de servicios ofrece el recorrido de Google Maps como columna',()=>{
  const source=fs.readFileSync(path.join(root,'operator-billing-export.js'),'utf8');
  assert.match(source,/serviceColumn\('maps_route','Recorrido Google Maps'/);
  assert.match(source,/www\.google\.com\/maps\/dir\/\?api=1/);
  assert.match(source,/waypoints=/);
});

test('el exportador convierte columnas url en hipervínculos de Excel',()=>{
  const source=fs.readFileSync(path.join(root,'excel-export.js'),'utf8');
  assert.match(source,/column\.type!==['"]url['"]/);
  assert.match(source,/cell\.l=\{Target:String\(cell\.v\)/);
});

test('el recorrido de Google Maps del Excel es el facturado: Base → Origen → Destino → Base',()=>{
  const source=fs.readFileSync(path.join(root,'operator-billing-export.js'),'utf8');
  const {mapsRoute}=loadExport();
  const base={billing_base_latitude:'-34.67',billing_base_longitude:'-58.39',origin_formatted_address:'Av. A 100, Avellaneda',destination_formatted_address:'Calle B 200, Lanús'};
  const completo=new URL(mapsRoute({...base,billing_route_mode:'base_origin_destination_base'}));
  assert.equal(completo.searchParams.get('origin'),'-34.67,-58.39');
  assert.equal(completo.searchParams.get('waypoints'),'Av. A 100, Avellaneda|Calle B 200, Lanús');
  assert.equal(completo.searchParams.get('destination'),'-34.67,-58.39');
  const soloIda=new URL(mapsRoute({...base,billing_route_mode:'base_origin'}));
  assert.equal(soloIda.searchParams.get('origin'),'-34.67,-58.39');
  assert.equal(soloIda.searchParams.get('destination'),'Av. A 100, Avellaneda');
  assert.equal(soloIda.searchParams.get('waypoints'),null);
  const directo=new URL(mapsRoute({...base,billing_route_mode:'origin_destination'}));
  assert.equal(directo.searchParams.get('origin'),'Av. A 100, Avellaneda');
  assert.equal(directo.searchParams.get('destination'),'Calle B 200, Lanús');
  // Origen igual al destino: Base → Origen → Base. Sin base cargada: cae a Origen → Destino.
  const mismo=new URL(mapsRoute({...base,destination_formatted_address:'Av. A 100, Avellaneda',billing_route_mode:'base_origin_destination_base'}));
  assert.equal(mismo.searchParams.get('waypoints'),'Av. A 100, Avellaneda');
  const sinBase=new URL(mapsRoute({origin_formatted_address:'Av. A 100',destination_formatted_address:'Calle B 200',billing_route_mode:'base_origin_destination_base'}));
  assert.equal(sinBase.searchParams.get('origin'),'Av. A 100');
  assert.equal(mapsRoute({billing_route_mode:'origin_destination'}),'');
});

test('Activado Origen: el recorrido de Maps es sólo Base → Origen, aunque el servicio esté enganchado',()=>{
  const {mapsRoute}=loadExport();
  const r={billing_base_latitude:'-34.67',billing_base_longitude:'-58.39',origin_formatted_address:'Av. A 100, Avellaneda',destination_formatted_address:'Calle B 200, Lanús',billing_route_mode:'base_origin_destination_base',driver_activated:true,activation_kind:'origin'};
  for(const extra of [{},{chain_route_mode:'base_origin_destination'},{chain_route_mode:'origin_destination'}]){
    const url=new URL(mapsRoute({...r,...extra}));
    assert.equal(url.searchParams.get('origin'),'-34.67,-58.39');
    assert.equal(url.searchParams.get('destination'),'Av. A 100, Avellaneda');
    assert.equal(url.searchParams.get('waypoints'),null);
  }
  // Sin base cargada: sólo la dirección del origen, nunca el destino.
  const sinBase=new URL(mapsRoute({...r,billing_base_latitude:null,billing_base_longitude:null}));
  assert.equal(sinBase.searchParams.get('origin'),null);
  assert.equal(sinBase.searchParams.get('destination'),'Av. A 100, Avellaneda');
  // Activado Movida sigue el recorrido normal.
  const movida=new URL(mapsRoute({...r,activation_kind:'movement'}));
  assert.equal(movida.searchParams.get('waypoints'),'Av. A 100, Avellaneda|Calle B 200, Lanús');
});

test('origen cargado por coordenadas: la celda Calle Origen muestra dirección y coordenadas, y el mapa va al punto exacto',()=>{
  const {mapsRoute,cols}=loadExport();
  const street=r=>cols.get('origin_street').value(r);
  const pegado={origin_formatted_address:'RP11, Provincia de Buenos Aires, Argentina',origin_place_id:'coord:-37.39033,-57.1298144',destination_formatted_address:'Calle B 200, Lanús'};
  assert.equal(street(pegado),'RP11 (-37.39033, -57.1298144)');
  assert.equal(new URL(mapsRoute(pegado)).searchParams.get('origin'),'-37.39033,-57.1298144');
  // Google no dio dirección: el texto ya son las coordenadas y no se repiten.
  assert.equal(street({origin_formatted_address:'-37.666917, -57.434222',origin_place_id:'coord:-37.6669167,-57.4342222'}),'-37.666917, -57.434222');
  // Dirección sin calle (sólo localidad): quedan las coordenadas solas en la celda de la calle.
  assert.equal(street({origin_formatted_address:'B7167 Cariló, Provincia de Buenos Aires',origin_place_id:'coord:-37.16,-56.9'}),'-37.16, -56.9');
  // Dirección elegida de Google (sin coordenadas pegadas): sin cambios.
  const normal={origin_formatted_address:'Av. A 100, B1870 Avellaneda, Provincia de Buenos Aires',origin_place_id:'ChIJabc',destination_formatted_address:'Calle B 200, Lanús'};
  assert.equal(street(normal),'Av. A 100');
  assert.equal(new URL(mapsRoute(normal)).searchParams.get('origin'),normal.origin_formatted_address);
});

test('las pantallas de servicio guardan «coord:lat,lng» cuando el origen se pegó como coordenadas',()=>{
  const ws=fs.readFileSync(path.join(root,'operator-service-workspace-reactive-v1.js'),'utf8');
  const priv=fs.readFileSync(path.join(root,'private-service-v1.js'),'utf8');
  assert.match(ws,/String\(s\.placeId\|\|''\)\.startsWith\('coord:'\)\?s\.placeId:data\?\.placeId\|\|s\.placeId/);
  assert.match(priv,/String\(s\.placeId \|\| ''\)\.startsWith\('coord:'\) \? s\.placeId : p\.placeId \|\| s\.placeId/);
  const exp=fs.readFileSync(path.join(root,'operator-billing-export.js'),'utf8');
  assert.match(exp,/from\('operator_services'\)\.select\('service_id,origin_place_id,origin_lat,origin_lng,destination_lat,destination_lng'\)/);
});

test('columna opcional Coordenadas Origen: el punto exacto de todos los servicios, también los viejos',()=>{
  const {cols}=loadExport();
  const c=cols.get('origin_coords');
  assert.ok(c&&c.optional,'opcional: no entra marcada por defecto');
  assert.equal(c.header,'Coordenadas Origen');
  // Servicio viejo con dirección de Google: sale el punto guardado.
  assert.equal(c.value({origin_place_id:'ChIJabc',origin_lat:'-37.3903300',origin_lng:'-57.1298144'}),'-37.39033, -57.1298144');
  // Cargado por coordenadas: el punto pegado.
  assert.equal(c.value({origin_place_id:'coord:-37.16,-56.9',origin_lat:'-37.1600000',origin_lng:'-56.9000000'}),'-37.16, -56.9');
  // Sin punto guardado: vacía.
  assert.equal(c.value({origin_place_id:'ChIJabc',origin_lat:null,origin_lng:null}),'');
  // Va en el grupo Recorrido, después de Provincia Origen.
  const ids=[...cols.keys()];
  assert.equal(ids[ids.indexOf('origin_province')+1],'origin_coords');
});

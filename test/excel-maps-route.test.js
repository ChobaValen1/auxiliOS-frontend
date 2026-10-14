const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');

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
  const start=source.indexOf('function mapsRoute(r){'),end=source.indexOf('function vehicleParts');
  const text=v=>String(v??'').trim();
  const mapsRoute=new Function('text',`${source.slice(start,end)};return mapsRoute;`)(text);
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

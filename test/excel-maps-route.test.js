const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');

test('Excel de servicios ofrece el recorrido de Google Maps como columna',()=>{
  const source=fs.readFileSync(path.join(root,'operator-billing-export.js'),'utf8');
  assert.match(source,/serviceColumn\('maps_route','Recorrido Google Maps'/);
  assert.match(source,/www\.google\.com\/maps\/dir\/\?api=1/);
  assert.match(source,/encodeURIComponent\(origin\)/);
  assert.match(source,/encodeURIComponent\(destination\)/);
});

test('el exportador convierte columnas url en hipervínculos de Excel',()=>{
  const source=fs.readFileSync(path.join(root,'excel-export.js'),'utf8');
  assert.match(source,/column\.type!==['"]url['"]/);
  assert.match(source,/cell\.l=\{Target:String\(cell\.v\)/);
});

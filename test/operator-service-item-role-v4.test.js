const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const pricing=fs.readFileSync('migrations/20260811224500_operator_rate_items_pricing_v4.sql','utf8');
const terrainQuote=fs.readFileSync('migrations/20260818104500_terrain_km_quote_v1.sql','utf8');
const roles=fs.readFileSync('migrations/20260819130000_operator_service_item_terrain_roles_v5.sql','utf8');

test('operator_service_items admite todos los roles emitidos por los motores vigentes',()=>{
  assert.match(pricing,/'role', 'movement'/);
  assert.match(pricing,/'role', 'distance'/);
  assert.match(terrainQuote,/'role','movement'/);
  assert.match(terrainQuote,/'role','distance_asphalt'/);
  assert.match(terrainQuote,/'role','distance_gravel'/);
  assert.match(terrainQuote,/'role','secondary'/);
  assert.match(roles,/item_role IN \([\s\S]*'primary'[\s\S]*'secondary'[\s\S]*'movement'[\s\S]*'distance'[\s\S]*'distance_asphalt'[\s\S]*'distance_gravel'/);
});

test('asfalto y ripio conservan roles distintos porque pueden coexistir para el mismo concepto',()=>{
  assert.match(terrainQuote,/'terrain','asphalt'/);
  assert.match(terrainQuote,/'terrain','gravel'/);
  assert.notEqual('distance_asphalt','distance_gravel');
});

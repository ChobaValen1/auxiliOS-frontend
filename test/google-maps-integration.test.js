const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const maps=fs.readFileSync('supabase/functions/maps-proxy/index.ts','utf8');
const bases=fs.readFileSync('billing-bases.js','utf8');
const tolls=fs.readFileSync('toll-management.js','utf8');
const workspace=fs.readFileSync('operator-service-workspace-reactive-v1.js','utf8');
const migration=fs.readFileSync('migrations/20260814141500_google_maps_locations_v1.sql','utf8');

test('Maps permanece server-side y usa Places New con sesiones',()=>{
  assert.match(maps,/Deno\.env\.get\("GOOGLE_MAPS_API_KEY"\)/);
  assert.match(maps,/places:autocomplete/);
  assert.match(maps,/sessionToken/);
  assert.match(maps,/params\.set\("sessionToken"/);
  assert.match(maps,/regionCode: "ar"/);
  assert.match(maps,/includedRegionCodes: \["ar"\]/);
  assert.match(maps,/\[maps-proxy:google\]/);
  assert.doesNotMatch(maps,/AIza[0-9A-Za-z_-]+/);
});

test('Routes calcula geometría facturable sin mezclar peajes ni tráfico premium',()=>{
  assert.match(maps,/directions\/v2:computeRoutes/);
  assert.match(maps,/routingPreference: "TRAFFIC_UNAWARE"/);
  assert.match(maps,/calculation: "billing_distance"/);
  assert.doesNotMatch(maps,/extraComputations/);
  assert.doesNotMatch(maps,/AR_TELEPASE|TOLLS/);
});

test('Bases guardan una ubicación Google verificable y reutilizable',()=>{
  assert.match(bases,/functions\.invoke\('maps-proxy'/);
  assert.match(bases,/google_place_id/);
  assert.match(bases,/address_verified/);
  assert.match(bases,/place_details/);
  assert.match(bases,/latitude/);
  assert.match(bases,/longitude/);
});

test('Peajes usan el mismo proxy y persisten el contrato geográfico',()=>{
  assert.match(tolls,/functions\.invoke\('maps-proxy'/);
  assert.match(tolls,/action:'autocomplete'/);
  assert.match(tolls,/action:'place'/);
  assert.match(tolls,/google_place_id/);
  assert.match(tolls,/address_verified/);
  assert.match(tolls,/place_details/);
  assert.match(migration,/add column if not exists google_place_id text/);
  assert.match(migration,/address_verified boolean not null default false/);
  assert.match(migration,/create or replace function public\.save_simple_toll/);
});

test('Servicio usa Google sólo para dirección y recorrido y conserva route_mode contractual',()=>{
  assert.match(workspace,/action:'autocomplete'/);
  assert.match(workspace,/action:'place'/);
  assert.match(workspace,/action:'route'/);
  assert.match(workspace,/routeMode:rm/);
  assert.match(workspace,/estimated_asphalt_km:km/);
  assert.match(workspace,/estimated_gravel_km:0/);
});

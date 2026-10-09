const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');

test('Servicios muestra Arribo y Fin por defecto',()=>{
  const js=fs.readFileSync(path.join(root,'operator-services.js'),'utf8');
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  assert.match(js,/arrival:true,finish:true/);
  assert.match(js,/s\.arrived_at\|\|s\.estimated_arrival_at/);
  assert.match(js,/s\.completed_at\|\|s\.estimated_finish_at/);
  assert.match(sw,/CACHE_NAME='auxilios-billing-phase2-v\d+/);
});

test('la migracion expone arrived_at y habilita ambas columnas existentes',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase','migrations','20261002152443_service_actual_arrival_finish_visibility_v1.sql'),'utf8');
  assert.match(sql,/"arrival":true,"finish":true/);
  assert.match(sql,/user_view_preferences/);
  assert.match(sql,/''arrived_at'',s\.arrived_at/);
});

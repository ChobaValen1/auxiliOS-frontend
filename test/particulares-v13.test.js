const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const lifecycle = fs.readFileSync('operator-service-lifecycle.js', 'utf8');
const sql = fs.readFileSync('migrations/20260929120000_particulares_sin_patente_ni_activado_v13.sql', 'utf8');

test('un particular no ofrece Activado en el menú ⋯', () => {
  assert.match(lifecycle, /function isPrivateService\(s\)\{return !!s&&\(s\.quoted_total!=null\|\|s\.client_kind==='particular'\)\}/);
  assert.match(lifecycle, /function quickActions\(s\)\{const list=serviceQuickActions\(s\);return isPrivateService\(s\)\?list\.filter\(\(\[k\]\)=>k!=='activate'\):list\}/);
});

test('la base: sin patente obligatoria para arribar o finalizar un particular, y sin Activado', () => {
  assert.match(sql, /'vehicle_plate','optional'\)='required' and not v_particular;/);
  assert.match(sql, /raise exception 'Un servicio particular no puede quedar Activado: finalizalo o anulalo'/);
  // Corre antes que los demás triggers (van por nombre).
  assert.match(sql, /create trigger operator_services_a_block_private_activation_v1\s+before update of driver_activated/);
});

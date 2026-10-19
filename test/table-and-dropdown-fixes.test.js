'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const ax = fs.readFileSync('ui/ax.js', 'utf8'), os = fs.readFileSync('operator-services.js', 'utf8');

test('lista desplegable: hacer scroll dentro de la lista no la cierra (lista de peajes)', () => {
  assert.match(ax, /addEventListener\('scroll', function \(ev\) \{\s*if \(menuAbierto && ev\.target && ev\.target\.nodeType === 1 && menuAbierto\.menu\.contains\(ev\.target\)\) return;\s*cerrarMenu\(\);/);
  // Al abrir, el foco no mueve la pantalla (si no, el scroll la cerraba sola en el celular).
  assert.match(ax, /items\[0\]\.focus\(\{ preventScroll: true \}\)/);
  assert.match(ax, /elegido\.focus\(\{ preventScroll: true \}\)/);
});

test('tabla de servicios: lo editado en el servicio manda sobre lo del remito', () => {
  assert.match(os, /const svcFirst=/);
  assert.match(os, /plate=svcFirst\(s\.vehicle_plate,s\.remito_vehicle_plate\)/);
  assert.match(os, /model=svcFirst\(s\.vehicle_make_model,s\.remito_vehicle_make_model\)/);
  assert.match(os, /phone=svcFirst\(s\.customer_phone,s\.remito_customer_phone\)/);
  assert.match(os, /raw=String\(svcFirst\(s\[`\$\{kind\}_formatted_address`\],s\[kind\],remitoKey&&s\[remitoKey\]\)\)/);
  assert.doesNotMatch(os, /s\.remito_vehicle_plate\|\|s\.vehicle_plate/);
  assert.doesNotMatch(os, /s\.remito_km_reales\|\|s\.estimated_distance_km/);
  const m = fs.readFileSync('migrations/20261019090000_list_services_customer_contact.sql', 'utf8');
  assert.match(m, /'customer_phone',s\.customer_phone,'customer_document',s\.customer_document/);
});

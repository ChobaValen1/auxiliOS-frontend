'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const wizard=fs.readFileSync('operator-service-wizard.js','utf8');

test('Nuevo Servicio usa los obligatorios configurados y marca lo que falta en cada campo',()=>{
  assert.match(wizard,/S\.moduleConfig\?\.field_modes\?\.\[k\]==='required'/);
  // Sin la franja roja de arriba: lo que falta se marca en el campo, con el texto debajo.
  assert.doesNotMatch(wizard,/showTransientError/);
  assert.match(wizard,/const missing=markMissingFields\(\);/);
  assert.match(wizard,/if\(!missing\)notify\(errors\.join\(' '\),'warning'\);return false;/);
  // El formato de cobro de peajes es obligatorio aunque no haya peajes, y al guardar se abre la solapa Peajes.
  assert.match(wizard,/if\(!addonLocked\(\)&&!COVERAGE\.has\(c\.toll_coverage_mode\)\)errors\.push\('Seleccioná el formato de cobro de peajes/);
  assert.doesNotMatch(wizard,/if\(c\.tolls\.length&&!COVERAGE\.has\(c\.toll_coverage_mode\)\)errors/);
  assert.match(wizard,/OperatorServiceCommercialAddonsV1\?\.show\?\.\('toll'\)/);
  assert.match(wizard,/msg\.className='osv4-field-msg'/);
  assert.match(wizard,/el\.setAttribute\('aria-invalid','false'\);msg\.remove\(\)/);
});

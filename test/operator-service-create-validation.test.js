'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const wizard=fs.readFileSync('operator-service-wizard.js','utf8');

test('Nuevo Servicio usa los obligatorios configurados y marca lo que falta en cada campo',()=>{
  assert.match(wizard,/S\.moduleConfig\?\.field_modes\?\.\[k\]==='required'/);
  // Sin la franja roja de arriba: lo que falta se marca en el campo, con el texto debajo.
  assert.doesNotMatch(wizard,/showTransientError/);
  assert.match(wizard,/if\(!markMissingFields\(\)\)notify\(errors\.join\(' '\),'warning'\);return false;/);
  assert.match(wizard,/msg\.className='osv4-field-msg'/);
  assert.match(wizard,/el\.setAttribute\('aria-invalid','false'\);msg\.remove\(\)/);
});

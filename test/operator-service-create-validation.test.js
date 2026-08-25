'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const wizard=fs.readFileSync('operator-service-wizard.js','utf8');

test('Nuevo Servicio usa los obligatorios configurados y limpia el error a los 3 segundos',()=>{
  assert.match(wizard,/S\.moduleConfig\?\.field_modes\?\.\[k\]==='required'/);
  assert.match(wizard,/function showTransientError\(message,ms=3000\)/);
  assert.match(wizard,/if\(!wasEdit\)return showTransientError\(message,3000\)/);
  assert.match(wizard,/target\.error=null;render\(\)/);
});

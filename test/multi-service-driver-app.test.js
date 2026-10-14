'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const js = fs.readFileSync(path.join(__dirname, '..', 'operator-service-bridge.js'), 'utf8');

test('Mis servicios: cola en orden solo para choferes con el interruptor', () => {
  assert.match(js, /function queueMode\(\)\{return P3\.queue\.some\(x=>x\.multi_service\)\}/);
  assert.match(js, /'Empezar este servicio'/);
  assert.match(js, /Se habilita después del \$\{q\.blockerPos\}º/);
  assert.match(js, /list\.innerHTML=queueBanner\(\)\+assigned\.map\(activeCard\)/);
  assert.match(js, /queueMode\(\)\?'Servicio en el camino':'Sin asignación'/);
});

test('un servicio en espera no se puede empezar y el en camino no se frena', () => {
  assert.match(js, /if\(qs\?\.waiting\)\{actions\.innerHTML=`<small>Este servicio está/);
  assert.match(js, /const assigned=queueMode\(\)\?null:P3\.queue\.find/);
  assert.match(js, /JORNADA_REQUERIDA\|VIAJE_EN_CURSO\|COLA_EN_ORDEN/);
});

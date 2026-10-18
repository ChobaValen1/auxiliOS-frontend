'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const src = fs.readFileSync('operator-service-bridge.js', 'utf8'), css = fs.readFileSync('chofer-servicios-ax-v1.css', 'utf8');

test('programados: los servicios para más de 2 h van aparte, ordenados por fecha', () => {
  assert.match(src, /const SCHEDULE_AHEAD_MS=2\*60\*60\*1000;/);
  assert.match(src, /later=assigned\.filter\(x=>isProgrammed\(x,now\)\)\.sort\(\(a,b\)=>scheduledAt\(a\)-scheduledAt\(b\)\)/);
  assert.match(src, /programmedSection\(later\)/);
  assert.match(src, /<span>Programados<\/span>/);
});

test('programados: un servicio empezado, con borrador o con remito firmado no se considera programado', () => {
  assert.match(src, /!\(queueStarted\(s\)\|\|s\.remito_status==='pendiente'\|\|s\.remito_action==='edit'\|\|s\.can_edit_remito\)/);
});

test('programados: empezar antes no se bloquea, se confirma y queda recordado', () => {
  assert.match(src, /onclick="confirmarEmpezarAntes\(this\.dataset\.id\)">Empezar ahora<\/button>/);
  assert.match(src, /¿Empezás este servicio ahora\?/);
  assert.match(src, /onclick="empezarServicioAntes\(this\.dataset\.id\)">Sí, lo empiezo ahora<\/button>/);
  assert.match(src, /P3\.earlyStart\.add\(String\(id\)\)/);
  assert.match(src, /sessionStorage\.setItem\(k,JSON\.stringify/);
  assert.match(src, /confirmarEmpezarAntes:confirmEarlyStart,empezarServicioAntes:startEarly/);
});

test('programados: en la cola, un programado no frena a los de ahora', () => {
  assert.match(src, /firstWaiting=P3\.queue\.findIndex\(x=>!queueStarted\(x\)&&!isProgrammed\(x\)\)/);
});

test('programados: fecha en hora de Argentina y estilos con tokens', () => {
  assert.match(src, /timeZone:'America\/Argentina\/Buenos_Aires'/);
  assert.match(src, /return`Mañana \$\{hm\}`/);
  assert.doesNotMatch(css.slice(css.indexOf('/* Programados')), /#[0-9a-f]{3,8}\b/i);
});

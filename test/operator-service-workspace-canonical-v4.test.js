const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const canonical = fs.readFileSync('operator-service-workspace-canonical-v4.js', 'utf8');
const stability = fs.readFileSync('operator-services-stability-v1.js', 'utf8');
const config = fs.readFileSync('config.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const workspace = fs.readFileSync('operator-service-workspace-v2.js', 'utf8');

test('Nuevo Servicio mantiene un único renderer de tres columnas', () => {
  assert.match(workspace, /OperatorServiceWorkspaceV2/);
  assert.match(workspace, /osv2-grid/);
  assert.match(canonical, /repeat\(3, minmax\(0, 1fr\)\)/);
});

test('el guard recursivo v4 queda fuera del runtime productivo', () => {
  assert.doesNotMatch(config, /operator-service-workspace-canonical-v4\.js/);
  assert.doesNotMatch(sw, /'\/operator-service-workspace-canonical-v4\.js'/);
  assert.match(canonical, /attributeFilter:\['class','style','hidden','aria-hidden'\]/);
});

test('Servicios desactiva el observer global de Bloque A', () => {
  assert.match(stability, /OperatorServicesBlockA\?\.state/);
  assert.match(stability, /state\.observer\.disconnect\(\)/);
  assert.match(stability, /state\.observer=null/);
  assert.match(config, /operator-services-stability-v1\.js/);
  assert.match(sw, /'\/operator-services-stability-v1\.js'/);
});

test('la PWA invalida la versión con loops de DOM', () => {
  const match = sw.match(/auxilios-v(\d+)/);
  assert.ok(match);
  assert.ok(Number(match[1]) >= 139);
});

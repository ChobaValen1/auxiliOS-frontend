const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const config = read('config.js');
const sw = read('sw.js');

test('el arranque usa únicamente el workspace canónico', () => {
  assert.match(config, /operator-service-workspace-reactive-v1\.css/);
  assert.match(config, /operator-service-workspace-reactive-v1\.js/);
  assert.doesNotMatch(config, /operator-service-workspace-v2\.css/);
  assert.doesNotMatch(config, /feature-flags\.js/);
});

test('Facturación carga mesa, exportación y facturas', () => {
  assert.match(config, /operator-billing\.css/);
  assert.match(config, /operator-billing\.js/);
  assert.match(config, /operator-billing-export\.js/);
  assert.match(config, /operator-invoices\.css/);
  assert.match(config, /operator-invoices\.js/);
});

test('el service worker no congela una versión vieja del HTML', () => {
  assert.match(sw, /event\.request\.mode==='navigate'/);
  assert.match(sw, /fetch\(event\.request\)/);
  const precacheBlock = sw.match(/const PRECACHE_ASSETS=\[([\s\S]*?)\];/)?.[1] || '';
  assert.doesNotMatch(precacheBlock, /['"]\/['"]/);
  assert.doesNotMatch(precacheBlock, /['"]\/Index\.html['"]/);
  assert.doesNotMatch(precacheBlock, /operator-service-workspace-v2\.css/);
  assert.doesNotMatch(precacheBlock, /feature-flags\.js/);
  assert.match(precacheBlock, /operator-invoices\.js/);
});

test('el preview tiene un identificador de build inequívoco', () => {
  assert.match(config, /AUXILIOS_BUILD_ID\s*=\s*'driver-signature-layout-v20-20260829'/);
  assert.match(config, /versionedAuxiliosAsset/);
});

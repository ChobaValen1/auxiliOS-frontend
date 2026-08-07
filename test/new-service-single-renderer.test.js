const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = fs.readFileSync('config.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');
const workspace = fs.readFileSync('operator-service-workspace-v2.css', 'utf8');

test('Nuevo Servicio tiene un único renderer canónico', () => {
  assert.equal(fs.existsSync('operator-service-creation-redesign.js'), false);
  assert.equal(fs.existsSync('operator-service-creation-redesign.css'), false);
  assert.doesNotMatch(config, /operator-service-creation-redesign/);
  assert.doesNotMatch(sw, /operator-service-creation-redesign/);
  assert.doesNotMatch(pkg, /operator-service-creation-redesign/);
});

test('el único formato de Nuevo Servicio es 3 columnas iguales', () => {
  assert.match(workspace, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(config, /operator-service-workspace-canonical-v4\.js/);
});

test('la PWA invalida cualquier copia anterior del alta legacy', () => {
  const match = sw.match(/auxilios-v(\d+)/);
  assert.ok(match);
  assert.ok(Number(match[1]) >= 138);
});

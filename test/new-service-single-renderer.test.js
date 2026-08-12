const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = fs.readFileSync('config.js', 'utf8');
const flags = fs.readFileSync('feature-flags.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');
const controller = fs.readFileSync('operator-service-wizard.js', 'utf8');
const workspaceCss = fs.readFileSync('operator-service-workspace-v2.css', 'utf8');
const reactive = fs.readFileSync('operator-service-workspace-reactive-v1.js', 'utf8');

test('Nuevo Servicio tiene un único renderer canónico en runtime', () => {
  assert.equal(fs.existsSync('operator-service-creation-redesign.js'), false);
  assert.equal(fs.existsSync('operator-service-creation-redesign.css'), false);
  assert.equal(fs.existsSync('operator-service-desktop.css'), false);
  assert.equal(fs.existsSync('operator-service-workspace-canonical-v4.js'), false);
  assert.doesNotMatch(controller, /os-service-desktop|function shell\(|Alta operativa/);
  for (const source of [config, flags, sw]) {
    assert.doesNotMatch(source, /operator-service-creation-redesign|operator-service-workspace-canonical-v4/);
    assert.doesNotMatch(source, /operator-service-workspace-v2\.js|operator-service-workspace-review-v3\.js/);
  }
  assert.match(config, /operator-service-workspace-reactive-v1\.js/);
  assert.doesNotMatch(flags, /operator-service-workspace-reactive-v1\.js/);
  assert.match(sw, /operator-service-workspace-reactive-v1\.js/);
  assert.match(pkg, /operator-service-workspace-reactive-v1\.js/);
});

test('el único formato de Nuevo Servicio sigue siendo 3 columnas iguales', () => {
  assert.match(workspaceCss, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(reactive, /data-workspace=\\?"three-columns/);
  assert.match(reactive, /osv2-grid/);
});

test('el renderer reactivo no usa MutationObserver ni repinta el shell en cada cambio', () => {
  assert.doesNotMatch(reactive, /MutationObserver/);
  const innerHtmlWrites = reactive.match(/shell\.innerHTML/g) || [];
  assert.equal(innerHtmlWrites.length, 1);
  assert.match(reactive, /function sync\(/);
});

test('la PWA invalida cualquier copia anterior del alta', () => {
  const match = sw.match(/auxilios-v(\d+)/);
  assert.ok(match);
  assert.ok(Number(match[1]) >= 165);
});

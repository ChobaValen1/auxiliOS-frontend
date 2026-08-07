const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const js = fs.readFileSync('operator-service-workspace-canonical-v4.js', 'utf8');
const config = fs.readFileSync('config.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

test('Workspace V2 queda como único owner de Nuevo Servicio', () => {
  assert.match(js, /service_workspace_v2/);
  assert.match(js, /disableLegacyCreationCss/);
  assert.match(js, /operator-service-creation-redesign\.css/);
  assert.match(js, /link\.disabled=true/);
  assert.match(js, /restoreV2IfLegacyPainted/);
  assert.match(js, /\.p3b-create-grid/);
  assert.match(js, /OperatorServiceWorkspaceV2/);
  assert.match(js, /v2\(\)\?\.render\?\.\(\)/);
});

test('el layout canónico se fuerza en 3 columnas 33-33-33', () => {
  assert.match(js, /grid-template-columns','repeat\(3, minmax\(0, 1fr\)\)'/);
  assert.match(js, /grid-template-rows','54px minmax\(0, 1fr\) 62px'/);
  assert.match(js, /setProperty\('display','grid','important'\)/);
  assert.match(js, /data\.canonicalGrid='three-columns'/);
  assert.match(js, /columns\.length===3/);
});

test('el guard se carga desde config network-first y queda en CI/PWA', () => {
  const featureFlags = config.indexOf("'/feature-flags.js'");
  const canonical = config.indexOf("'/operator-service-workspace-canonical-v4.js'");
  assert.ok(featureFlags >= 0);
  assert.ok(canonical > featureFlags);
  assert.match(pkg, /node --check operator-service-workspace-canonical-v4\.js/);
  assert.match(sw, /'\/operator-service-workspace-canonical-v4\.js'/);
  const match = sw.match(/auxilios-v(\d+)/);
  assert.ok(match);
  assert.ok(Number(match[1]) >= 137);
});

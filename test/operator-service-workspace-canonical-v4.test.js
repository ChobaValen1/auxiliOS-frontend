const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const controller = fs.readFileSync('operator-service-wizard.js', 'utf8');
const workspaceJs = fs.readFileSync('operator-service-workspace-reactive-v1.js', 'utf8');
const workspaceCss = fs.readFileSync('operator-service-workspace-v2.css', 'utf8');
const config = fs.readFileSync('config.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const flags = fs.readFileSync('feature-flags.js', 'utf8');

test('Nuevo Servicio tiene un único renderer reactivo de tres columnas', () => {
  assert.match(workspaceJs, /OperatorServiceWorkspaceV2/);
  assert.match(workspaceJs, /osv2-grid/);
  assert.doesNotMatch(workspaceJs, /MutationObserver/);
  assert.match(workspaceCss, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.equal(fs.existsSync('operator-service-workspace-canonical-v4.js'), false);
  assert.equal(fs.existsSync('operator-service-desktop.css'), false);
});

test('operator-service-wizard queda como controlador y no puede pintar otra UI', () => {
  assert.match(controller, /OperatorServiceWorkspaceV2\?\.render/);
  assert.doesNotMatch(controller, /function shell\(/);
  assert.doesNotMatch(controller, /os-service-desktop/);
  assert.doesNotMatch(controller, /Alta operativa/);
});

test('el workspace reactivo se carga directamente desde bootstrap', () => {
  const wizard = config.indexOf("'/operator-service-wizard.js'");
  const workspace = config.indexOf("'/operator-service-workspace-reactive-v1.js'");
  assert.ok(wizard >= 0);
  assert.ok(workspace > wizard);
  assert.doesNotMatch(config, /operator-service-workspace-v2\.js|operator-service-workspace-review-v3\.js/);
  assert.match(config, /service_workspace_v2\s*=\s*true/);
  assert.match(flags, /flags\.service_workspace_v2=true/);
});

test('la PWA elimina los renderers anteriores', () => {
  assert.doesNotMatch(sw, /operator-service-desktop\.css/);
  assert.doesNotMatch(sw, /operator-service-workspace-canonical-v4\.js/);
  assert.doesNotMatch(sw, /operator-service-workspace-v2\.js|operator-service-workspace-review-v3\.js/);
  assert.match(sw, /operator-service-workspace-reactive-v1\.js/);
  const match = sw.match(/auxilios-v(\d+)/);
  assert.ok(match);
  assert.ok(Number(match[1]) >= 141);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const lifecycle=fs.readFileSync('operator-service-lifecycle.js','utf8');
const workspace=fs.readFileSync('operator-service-workspace-reactive-v1.js','utf8');
const config=fs.readFileSync('config.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const pkg=fs.readFileSync('package.json','utf8');

test('lifecycle conserva cierres reasignación y revisión',()=>{
  assert.match(lifecycle,/close_operator_service_exception/);
  assert.match(lifecycle,/reassign_operator_service/);
  assert.match(lifecycle,/review_operator_service_closure/);
  assert.match(lifecycle,/reportarIncidenteServicio/);
});

test('trazabilidad se integra al workspace Ver Editar y no a un detalle viejo',()=>{
  assert.match(workspace,/osv4-lifecycle-slot/);
  assert.match(lifecycle,/auxilios:service-workspace-opened/);
  assert.match(lifecycle,/renderWorkspaceTrace/);
  assert.match(lifecycle,/osv4-lifecycle-slot/);
  assert.doesNotMatch(lifecycle,/os-detail-shell|detailObserver/);
});

test('chofer sigue describiendo cierres por excepción',()=>{
  assert.match(lifecycle,/No se pudo completar/);
  assert.match(lifecycle,/Antes de salir/);
  assert.match(lifecycle,/Camino al origen/);
  assert.match(lifecycle,/En el origen/);
  assert.match(lifecycle,/Falla del camión/);
});

test('runtime conserva solo lifecycle canónico',()=>{
  assert.match(config,/operator-service-lifecycle\.js/);
  assert.match(pkg,/node --check operator-service-lifecycle\.js/);
  assert.match(sw,/operator-service-lifecycle\.css/);
  assert.doesNotMatch(config,/phase3b-modal-visibility-guard|operator-service-creation-redesign/);
});

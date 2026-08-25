const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const billing=fs.readFileSync('operator-billing.js','utf8');
const css=fs.readFileSync('operator-billing.css','utf8');

test('grilla reemplaza Ver por menu horizontal de tres puntos',()=>{
  const row=billing.split('function rowMarkup(row)')[1].split('function tollTableMarkup()')[0];
  assert.match(row,/data-ob-row-menu/);
  assert.match(row,/aria-label="Acciones del servicio"/);
  assert.match(row,/⋯/);
  assert.doesNotMatch(row,/>Ver<\/button>/);
});

test('menu de fila reúne Visualizar Modificar Revertir y Anular con permisos actuales',()=>{
  const menu=billing.split('function rowActionMenuMarkup(id)')[1].split('function toggleRowActionMenu')[0];
  for(const label of ['Visualizar','Modificar','Revertir','Anular'])assert.match(menu,new RegExp(label));
  assert.match(menu,/canCorrect\(\).*Modificar/s);
  assert.match(menu,/canRevert\(\).*Revertir/s);
  assert.match(menu,/canCorrect\(\).*Anular/s);
});

test('acciones de fila reutilizan flujos canonicos sin duplicar logica de backend',()=>{
  assert.match(billing,/if\s*\(action\s*===\s*'view'\)\s*return openDetail\(id\)/);
  assert.match(billing,/if\s*\(action\s*===\s*'edit'\)\s*return editServiceById\(id\)/);
  assert.match(billing,/if\s*\(action\s*===\s*'revert'\)\s*return openDetailAction\(id,\s*'revert'\)/);
  assert.match(billing,/if\s*\(action\s*===\s*'annul'\)\s*return openDetailAction\(id,\s*'annul'\)/);
  assert.match(billing,/window\.editarServicioOperador\(id\)/);
  assert.match(billing,/get_operator_billing_service_detail_v3/);
  assert.match(billing,/revert_operator_billing_service_v2/);
  assert.match(billing,/annul_operator_billing_service_v2/);
});

test('detalle ya no duplica bloque visible de acciones administrativas',()=>{
  const detail=billing.split('function detailMarkup()')[1].split('function reviewMarkup')[0];
  assert.doesNotMatch(detail,/ob-admin-actions/);
  assert.match(detail,/actionConfirmMarkup\(\)/);
});

test('menu flotante está fuera de la tabla y siempre por encima de las filas',()=>{
  assert.match(billing,/document\.body\.appendChild\(menu\)/);
  assert.match(billing,/getBoundingClientRect\(\)/);
  assert.match(css,/\.ob-row-menu-trigger\{position:relative;z-index:3/);
  assert.match(css,/\.ob-row-action-menu\{[^}]*position:fixed;z-index:2147483000;isolation:isolate;pointer-events:auto/s);
  assert.match(css,/--ob-menu-card:var\(--card,#191d27\)/);
  assert.match(css,/background:var\(--ob-menu-card\)/);
  assert.match(css,/\.ob-row-action-menu button\{[^}]*pointer-events:auto/s);
  assert.match(css,/\.ob-row-action-menu button\.danger\{color:var\(--ob-menu-red\)\}/);
});

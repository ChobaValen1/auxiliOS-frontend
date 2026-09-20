const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const billing=fs.readFileSync('operator-billing.js','utf8');
const css=fs.readFileSync('operator-billing.css','utf8');

test('grilla reemplaza Ver por menu horizontal de tres puntos',()=>{
  const row=billing.split('function rowMarkup(row)')[1].split('function tollTableMarkup()')[0];
  assert.match(row,/data-ob-row-menu/);
  assert.match(row,/title="Acciones del servicio"/);
  assert.match(row,/aria-haspopup="menu"/);
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
  assert.match(billing,/if\s*\(action\s*===\s*'revert'\)\s*return openRowAction\(id,\s*'revert'\)/);
  assert.match(billing,/if\s*\(action\s*===\s*'annul'\)\s*return openRowAction\(id,\s*'annul'\)/);
  assert.match(billing,/window\.editarServicioFacturacion\(id\)/);
  assert.match(billing,/get_operator_billing_service_detail_v3/);
  assert.match(billing,/revert_operator_billing_service_v2/);
  assert.match(billing,/annul_operator_billing_service_v2/);
});

test('detalle ya no duplica bloque visible de acciones administrativas',()=>{
  const detail=billing.split('function detailMarkup()')[1].split('function render()')[0];
  assert.doesNotMatch(detail,/ob-admin-actions/);
  // El confirmar salió del detalle: se resuelve desde la fila.
  assert.doesNotMatch(detail,/confirmActionMarkup\(\)/);
});

test('revertir y anular no obligan a entrar al servicio',()=>{
  const open=billing.split('function openRowAction(id, type)')[1].split('function closeDetail()')[0];
  // La acción se arma con la fila que ya está en pantalla: ni openDetail ni su RPC.
  assert.doesNotMatch(open,/openDetail\(|get_operator_billing_service_detail_v3/);
  assert.match(open,/S\.rowAction\s*=\s*\{/);
  const confirmar=billing.split('function confirmActionMarkup()')[1].split('function detailMarkup()')[0];
  assert.match(confirmar,/role="dialog" aria-modal="true"/);
  assert.match(confirmar,/rowById\(id\)/);
  // Identifica la fila que se está por tocar, para no anular el servicio equivocado.
  for(const campo of ['Servicio','Fecha','Prestadora','Base','Cliente','Importe'])assert.match(confirmar,new RegExp(`<small>${campo}</small>`));
  assert.match(css,/\.ob-confirm-modal\{/);
  assert.match(css,/\.ob-detail-backdrop\.ob-invoice-backdrop,\.ob-detail-backdrop\.ob-confirm-backdrop\{/);
});

test('confirmado se queda en Facturación en vez de saltar a Operaciones',()=>{
  const fn=billing.split('async function confirmAdminAction()')[1].split('function editServiceById')[0];
  assert.doesNotMatch(fn,/goTo\('operaciones'\)|cambiarVistaServicios/);
  assert.match(fn,/await load\(\)/);
  assert.match(fn,/confirmar\(/);
  // Doble click en Confirmar no dispara dos veces la RPC.
  assert.match(fn,/S\.rowAction\.busy\s*=\s*true/);
  assert.match(billing,/if \(!S\.rowAction \|\| S\.rowAction\.busy\) return;/);
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

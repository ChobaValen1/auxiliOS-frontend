const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const services = fs.readFileSync('operator-services.js','utf8');
const workspace = fs.readFileSync('operator-service-workspace-reactive-v1.js','utf8');
const migration = fs.readFileSync('migrations/20260812222500_canonical_service_edit_workspace_v1.sql','utf8');

test('Chofer no puede leer ni gestionar la mesa administrativa de Servicios', () => {
  assert.match(services, /canRead=\(\)=>\['administracion','operador','supervision','facturacion'\]\.includes\(role\(\)\)/);
  assert.match(services, /canManage=\(\)=>\['administracion','operador'\]\.includes\(role\(\)\)/);
  assert.doesNotMatch(services, /'chofer'.*canRead|canRead.*'chofer'/);
});

test('Operador y Supervisión no tienen renderer monetario', () => {
  assert.match(services, /canSeeCommercial=\(\)=>\['administracion','facturacion'\]\.includes\(role\(\)\)/);
  assert.match(services, /if\(canSeeCommercial\(\)\)/);
  assert.doesNotMatch(workspace, /money\(|Intl\.NumberFormat|company_estimated_total|estimated_total|base_subtotal|surcharge_total|copay_total/);
  assert.match(workspace, /No visible para Operaciones/);
});

test('el contexto de edición no devuelve importes ni pricing snapshot', () => {
  const part = migration.split(/create or replace function public\.get_operator_service_edit_context/i)[1].split(/create or replace function public\.update_operator_service/i)[0];
  assert.doesNotMatch(part, /pricing_snapshot|company_estimated_total|estimated_total|base_subtotal|surcharge_total|toll_total|copay_total|currency/);
  assert.match(part, /v_role not in \('administracion','operador','supervision','facturacion'\)/);
});

test('la actualización canónica requiere identidad y limita escritura a Administración u Operador', () => {
  const part = migration.split(/create or replace function public\.update_operator_service/i)[1];
  assert.match(part, /v_uid is null or v_role not in \('administracion','operador'\)/);
  assert.match(part, /Sin permiso para editar servicios/);
});

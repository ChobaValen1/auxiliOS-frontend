const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const services = fs.readFileSync('operator-services.js','utf8');
const workspace = fs.readFileSync('operator-service-workspace-reactive-v1.js','utf8');
const effective = fs.readFileSync('migrations/20260812225500_operator_service_update_split_v1.sql','utf8');
const amountDueMigration = fs.readFileSync('migrations/20260815110500_operator_service_amount_due_excess_only_v1.sql','utf8');

test('Chofer no puede leer ni gestionar la mesa administrativa de Servicios', () => {
  assert.match(services, /canRead=\(\)=>\['administracion','operador','supervision','facturacion'\]\.includes\(role\(\)\)/);
  assert.match(services, /canManage=\(\)=>\['administracion','operador'\]\.includes\(role\(\)\)/);
  assert.doesNotMatch(services, /'chofer'.*canRead|canRead.*'chofer'/);
});

test('Operaciones ve Por Cobrar sólo desde Excedentes y no pricing de la Prestadora', () => {
  assert.match(services, /customer_amount_due/);
  assert.match(services, /customer_payment_methods/);
  assert.match(services, /Por Cobrar/);
  assert.match(amountDueMigration, /operator_service_excess_charges/);
  assert.doesNotMatch(amountDueMigration, /from public\.operator_service_tolls/);
  assert.doesNotMatch(services, /canSeeCommercial|company_estimated_total|estimated_total|base_subtotal|surcharge_total|copay_total|pricing_snapshot|provider_toll_total/);
  assert.doesNotMatch(workspace, /money\(|Intl\.NumberFormat|company_estimated_total|estimated_total|base_subtotal|surcharge_total|copay_total|pricing_snapshot/);
  assert.doesNotMatch(workspace, /osv2-summary-card|Validar servicio|Facturación|No visible para Operaciones/);
});

test('Chofer no recibe Por Cobrar ni medios de pago desde el listado', () => {
  const driverBranch = amountDueMigration.split("elsif v_role='chofer' then")[1].split("else\n    raise exception 'Sin permiso para consultar servicios'")[0];
  assert.ok(driverBranch);
  assert.doesNotMatch(driverBranch, /customer_amount_due|customer_payment_methods|operator_service_excess_charges/);
});

test('el contexto efectivo de edición no devuelve pricing del servicio', () => {
  const context = effective.split(/create or replace function public\.get_operator_service_edit_context/i)[1];
  assert.ok(context);
  assert.doesNotMatch(context, /pricing_snapshot|company_estimated_total|estimated_total|base_subtotal|surcharge_total|copay_total|toll_estimate|route_toll_estimate/);
  assert.match(context, /v_tolls jsonb := '\[\]'::jsonb/);
  assert.match(context, /if v_role='administracion' then/);
  assert.match(context, /'tolls',v_tolls/);
});

test('compatibilidad de peajes legacy es exclusiva de Administración', () => {
  assert.match(effective, /if v_role='operador' then v_payload := v_payload - 'tolls'/);
  assert.match(effective, /if v_role='administracion' and v_payload \? 'tolls' then/);
  const context = effective.split(/create or replace function public\.get_operator_service_edit_context/i)[1];
  assert.match(context, /if v_role='administracion' then[\s\S]*unit_amount[\s\S]*total_amount/);
});

test('la actualización pública requiere identidad y limita escritura a Administración u Operador', () => {
  const publicUpdate = effective.split(/create or replace function public\.update_operator_service/i)[1].split(/create or replace function public\.get_operator_service_edit_context/i)[0];
  assert.match(publicUpdate, /v_uid is null or v_role not in \('administracion','operador'\)/);
  assert.match(publicUpdate, /Sin permiso para editar servicios/);
  assert.match(publicUpdate, /return app_private\.update_operator_service_full/);
});

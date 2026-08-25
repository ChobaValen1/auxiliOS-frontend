'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const billing = fs.readFileSync('company-billing-parameters-v4.js','utf8');
const services = fs.readFileSync('company-services-configuration-v4.js','utf8');
const serviceCatalog = fs.readFileSync('service-types-catalog-v2.js','utf8');
const tariffs = fs.readFileSync('company-tariffs-v4.js','utf8');
const companies = fs.readFileSync('empresas-v2.js','utf8');
const wizard = fs.readFileSync('operator-service-wizard.js','utf8');
const workspace = fs.readFileSync('operator-service-workspace-reactive-v1.js','utf8');
const operatorServices = fs.readFileSync('operator-services.js','utf8');
const config = fs.readFileSync('config.js','utf8');
const sw = fs.readFileSync('sw.js','utf8');
const pkg = fs.readFileSync('package.json','utf8');
const contractRules = fs.readFileSync('migrations/20260815121000_operator_quote_contract_rules_v2.sql','utf8');
const terrainTariffs = fs.readFileSync('migrations/20260818104000_terrain_km_tariffs_v1.sql','utf8');
const terrainQuote = fs.readFileSync('migrations/20260818104500_terrain_km_quote_v1.sql','utf8');
const validity = fs.readFileSync('migrations/20260812201500_scheduled_service_price_validity_v1.sql','utf8');
const timeline = fs.readFileSync('migrations/20260812211000_price_timeline_cascade_v1.sql','utf8');
const edit = fs.readFileSync('migrations/20260812222500_canonical_service_edit_workspace_v1.sql','utf8');
const effectiveEdit = fs.readFileSync('migrations/20260812225500_operator_service_update_split_v1.sql','utf8');

const canonical = ['empresas-v2.js','service-types-catalog-v2.js','company-services-configuration-v4.js','company-billing-parameters-v4.js','company-tariffs-v4.js','operator-services.js','operator-service-wizard.js','operator-service-workspace-reactive-v1.js'];
const precachedCanonical = canonical.filter(name => name !== 'operator-service-wizard.js');
const removed = ['empresas.js','configuration-reference.js','billing-base-operator-adapter.js','comercial.js','tariff-composition.js','tariff-matrix-v3.js','tariff-new-rate-flow-v1.js','operator-active-desk-clean-v1.js','operator-services-canonical-view-v1.js','operator-services-stability-v1.js','operator-services-block-a-v1.js','operator-reference-loader.js','operator-service-edit.js','operator-service-code-warnings-v1.js','operator-service-workspace-behavior-v1.js','operator-service-reajuste-v3.js','operator-service-v2.js','phase3b-modal-visibility-guard.js'];

test('runtime, CI y PWA contienen solo los módulos canónicos',()=>{
  for(const name of canonical){assert.ok(config.includes(name),`${name} debe cargar`);if(name.endsWith('.js'))assert.ok(pkg.includes(name),`${name} debe pasar syntax check`);}
  for(const name of precachedCanonical)assert.ok(sw.includes(name),`${name} debe precachearse`);
  assert.equal(sw.includes('operator-service-wizard.js'),false,'wizard usa red primero y no forma parte del precache phase2');
  for(const name of removed){assert.equal(config.includes(name),false,`${name} no debe cargar`);assert.equal(sw.includes(name),false,`${name} no debe precachearse`);assert.equal(pkg.includes(name),false,`${name} no debe estar en CI`);}
});

test('Tipos de Servicio es el único catálogo creador y Prestadora mantiene una allowlist',()=>{
  assert.match(serviceCatalog,/save_service_type_config/);
  assert.match(serviceCatalog,/delete_service_type_config/);
  assert.match(serviceCatalog,/distance_chargeable/);
  assert.match(services,/save_company_service_setting_v2/);
  assert.match(services,/Acá no se crean servicios/);
  assert.doesNotMatch(services,/save_service_type_config/);
});

test('Parámetros de facturación posee Bases y reglas contractuales, no Tarifas',()=>{
  assert.match(billing,/get_company_billing_configuration/);
  assert.match(billing,/Bases habilitadas para esta prestadora/);
  assert.match(billing,/Radio cubierto \(km\)/);
  assert.match(billing,/Cobrar movida hasta \(km\)/);
  assert.match(billing,/covered_radius_km/);
  assert.match(billing,/movement_charge_until_km/);
  assert.doesNotMatch(billing,/ensure_company_tariff_draft_v4|publish_company_tariff_draft_v4/);
});

test('Tarifas maneja precio actual, vigencia futura y excepción por Base sin draft/publish',()=>{
  assert.match(tariffs,/get_company_service_prices_v1/);
  assert.match(tariffs,/save_company_service_price_v1/);
  assert.match(tariffs,/get_company_service_price_schedule_v1/);
  assert.match(tariffs,/save_company_service_price_schedule_v1/);
  assert.match(tariffs,/cancel_company_service_price_schedule_v1/);
  assert.match(tariffs,/Vigente desde/);
  assert.match(tariffs,/Programar/);
  assert.match(tariffs,/Excepciones por base/);
  assert.doesNotMatch(tariffs,/ensure_company_tariff_draft_v4|publish_company_tariff_draft_v4|get_company_tariffs_v4/);
});

test('Tarifas separa Movida, KM Asfalto y KM Ripio en lectura y edición',()=>{
  assert.match(terrainTariffs,/ADD COLUMN IF NOT EXISTS asphalt_km_price/);
  assert.match(terrainTariffs,/ADD COLUMN IF NOT EXISTS gravel_km_price/);
  assert.match(terrainTariffs,/'asphalt_km_price'/);
  assert.match(terrainTariffs,/'gravel_km_price'/);
  assert.match(tariffs,/Movida \+ KM Asfalto \+ KM Ripio/);
  assert.match(tariffs,/asphalt_km_price/);
  assert.match(tariffs,/KM Asfalto/);
  assert.match(tariffs,/gravel_km_price/);
  assert.match(tariffs,/KM Ripio/);
  assert.match(tariffs,/payload\.asphalt_km_price = asphalt/);
  assert.match(tariffs,/payload\.gravel_km_price = gravel/);
  assert.match(tariffs,/id="ct4-asphalt"/);
  assert.match(tariffs,/id="ct4-gravel"/);
});

test('Prestadoras embebe la misma implementación de precios y no contiene Sucursales',()=>{
  assert.match(companies,/get_company_service_prices_v1/);
  assert.match(companies,/mountEmbedded/);
  assert.doesNotMatch(companies,/company_branches|abrirSucursal|guardarSucursal|desactivarSucursal|Nueva sucursal|Sucursales/);
});

test('vigencias se resuelven por fecha del servicio y propagan herencia hasta un cambio explícito',()=>{
  assert.match(validity,/price_card_for_company_date/);
  assert.match(validity,/valid_from/);
  assert.match(validity,/status='scheduled'/);
  assert.match(timeline,/cascade_company_service_price_v1/);
  assert.match(timeline,/IF NOT v_same_as_before THEN EXIT/);
  assert.doesNotMatch(validity,/publish_company_tariff_draft_v4/);
});

test('Nuevo/Ver/Editar Servicio consumen Base real y el mismo workspace',()=>{
  assert.match(wizard,/get_operator_service_context_v1/);
  assert.match(wizard,/get_operator_service_edit_context/);
  assert.match(wizard,/billing_base_id/);
  assert.match(wizard,/openCreate/);
  assert.match(wizard,/openView/);
  assert.match(wizard,/openEdit/);
  assert.match(workspace,/data-mode="\$\{w\.mode\}"/);
  assert.doesNotMatch(wizard,/branch_id|cambiarSucursalServicio|get_operator_category_tariff_v3/);
  assert.doesNotMatch(workspace,/Sucursal|Base Operativa/);
});

test('Servicios es tabla compacta única y no contiene renderer monetario ni resumen fantasma',()=>{
  assert.match(operatorServices,/os-commandbar/);
  assert.match(operatorServices,/os-table-body/);
  assert.doesNotMatch(operatorServices,/os-kpis|os-board|renderKpis|canSeeCommercial|money\(|company_estimated_total|estimated_total|pricing_snapshot/);
  assert.doesNotMatch(workspace,/money\(|Intl\.NumberFormat|company_estimated_total|estimated_total|base_subtotal|surcharge_total|copay_total/);
  assert.doesNotMatch(workspace,/osv2-summary-card|Validar servicio|Facturación|No visible para Operaciones/);
  assert.equal(fs.existsSync('feature-flags.js'),false,'feature-flags.js legacy debe permanecer eliminado');
  assert.doesNotMatch(config,/feature-flags\.js/);
  assert.doesNotMatch(sw,/feature-flags\.js/);
});

test('edición pública separa correcciones operativas de cambios que recotizan',()=>{
  assert.match(effectiveEdit,/alter function public\.update_operator_service\(uuid,jsonb,text\) set schema app_private/);
  assert.match(effectiveEdit,/v_requires_reprice/);
  assert.match(effectiveEdit,/return app_private\.update_operator_service_full/);
  assert.match(effectiveEdit,/Correcciones operativas que no alteran la cotización/);
  assert.match(edit,/calculate_operator_service_quote_v4_full/);
  assert.match(edit,/branch_id=null/);
});

test('contexto efectivo no expone pricing del servicio y protege peajes por rol',()=>{
  const context=effectiveEdit.split(/create or replace function public\.get_operator_service_edit_context/i)[1];
  assert.doesNotMatch(context,/pricing_snapshot|company_estimated_total|estimated_total|base_subtotal|surcharge_total|copay_total|toll_estimate|route_toll_estimate/);
  assert.match(context,/v_tolls jsonb := '\[\]'::jsonb/);
  assert.match(context,/if v_role='administracion' then/);
  assert.match(effectiveEdit,/if v_role='operador' then v_payload := v_payload - 'tolls'/);
});

test('Radio cobra sólo KM excedentes y Cobrar movida hasta corta la movida después del límite',()=>{
  assert.match(contractRules,/v_billable_distance:=greatest\(v_distance-coalesce\(v_radius,0\),0\)/);
  assert.match(contractRules,/v_distance_applies:=v_billable_distance>0/);
  assert.match(contractRules,/v_movement_applies:=v_movement_until is null or v_distance<=v_movement_until/);
  assert.match(contractRules,/v_subtotal:=round\(v_billable_distance\*coalesce\(v_rate\.extra_km_price,0\),2\)/);
  assert.match(contractRules,/'billable_distance_km',v_billable_distance/);
  assert.doesNotMatch(contractRules,/round\(v_distance\*coalesce\(v_rate\.extra_km_price/);
});

test('Radio cubierto consume Asfalto primero y luego Ripio',()=>{
  assert.match(terrainQuote,/v_billable_asphalt:=greatest\(coalesce\(p_asphalt_km,0\)-coalesce\(v_radius,0\),0\)/);
  assert.match(terrainQuote,/coalesce\(p_gravel_km,0\)-greatest\(coalesce\(v_radius,0\)-coalesce\(p_asphalt_km,0\),0\)/);
  assert.match(terrainQuote,/'covered_radius_consumption_order','asphalt_then_gravel'/);
  assert.doesNotMatch(terrainQuote,/v_billable_distance\*coalesce\(p_asphalt_km,0\)\/v_distance/);
  assert.doesNotMatch(terrainQuote,/distribuye proporcionalmente/);
});

test('Recargos contractuales no se acumulan y se evalúan del mayor valor al menor',()=>{
  assert.match(contractRules,/order by amount desc,rule_type,rule_id/);
  assert.match(contractRules,/v_surcharge_total:=v_charge/);
  assert.match(contractRules,/v_surcharges:=jsonb_build_array/);
  assert.match(contractRules,/exit;/);
  assert.doesNotMatch(contractRules,/v_surcharge_total:=v_surcharge_total\+v_charge/);
});

test('configuración inválida no admite Cobrar movida hasta menor que Radio',()=>{
  assert.match(contractRules,/v_movement_until<v_radius/);
  assert.match(contractRules,/no puede ser menor que el radio cubierto/);
});

test('PWA invalida el cache del runtime consolidado',()=>{
  const version=Number(sw.match(/auxilios(?:-billing-phase2)?-v(\d+)/)?.[1]||0);
  assert.ok(version>=171,`Expected cache version 171 or newer, received ${version}`);
});

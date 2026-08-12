'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const billing = fs.readFileSync('company-billing-parameters-v4.js','utf8');
const services = fs.readFileSync('company-services-configuration-v4.js','utf8');
const serviceCatalog = fs.readFileSync('service-types-catalog-v2.js','utf8');
const tariffTypes = fs.readFileSync('tariff-types-catalog-v1.js','utf8');
const tariffs = fs.readFileSync('company-tariffs-v4.js','utf8');
const companies = fs.readFileSync('empresas-v2.js','utf8');
const operatorWizard = fs.readFileSync('operator-service-wizard.js','utf8');
const operatorWorkspace = fs.readFileSync('operator-service-workspace-reactive-v1.js','utf8');
const operatorServices = fs.readFileSync('operator-services.js','utf8');
const config = fs.readFileSync('config.js','utf8');
const sw = fs.readFileSync('sw.js','utf8');
const pkg = fs.readFileSync('package.json','utf8');
const operatorMigration = fs.readFileSync('migrations/20260811224500_operator_rate_items_pricing_v4.sql','utf8');
const distanceRulesMigration = fs.readFileSync('migrations/20260812123000_company_distance_billing_rules_v1.sql','utf8');
const currentPricesMigration = fs.readFileSync('migrations/20260812190000_current_service_prices_and_operator_context_v1.sql','utf8');
const surchargeMigration = fs.readFileSync('migrations/20260812193000_current_billing_surcharges_v1.sql','utf8');

const canonical = [
  'empresas-v2.js','service-types-catalog-v2.js','tariff-types-catalog-v1.js',
  'company-services-configuration-v4.js','company-billing-parameters-v4.js',
  'company-tariffs-v4.js','configuration-center.js','operator-service-code-warnings-v1.js',
];
const removedRuntime = [
  'empresas.js','configuration-reference.js','configuration-reference.css','billing-base-operator-adapter.js',
  'frequent-navigation.js','comercial.js','comercial-services.js','comercial-code-strategy.js','comercial-rules.js',
  'comercial-summary.js','tariff-composition.js','comercial.css','company-billing-settings.js','equal-billing-bases.js',
  'company-configuration-coherence-v1.js','tariff-new-rate-flow-v1.js','tariff-matrix-v3.js',
  'operator-service-tariff-v3-ui.js','operator-service-tariff-v3.css',
];

test('runtime keeps only canonical commercial modules and code warnings',()=>{
  for(const name of canonical){
    assert.ok(config.includes(name),`${name} must load at runtime`);
    assert.ok(sw.includes(name),`${name} must be precached`);
    if(name.endsWith('.js'))assert.ok(pkg.includes(name),`${name} must be checked by CI`);
  }
  for(const name of removedRuntime){
    assert.equal(config.includes(name),false,`${name} must not load at runtime`);
    assert.equal(sw.includes(name),false,`${name} must not be precached`);
    assert.equal(pkg.includes(name),false,`${name} must not be checked by CI`);
  }
});

test('Tipos de Servicio is the only service creation catalog',()=>{
  assert.match(serviceCatalog,/screen-config-service-types/);
  assert.match(serviceCatalog,/Nuevo servicio/);
  assert.match(serviceCatalog,/save_service_type_config/);
  assert.match(serviceCatalog,/delete_service_type_config/);
  assert.match(serviceCatalog,/distance_chargeable/);
  assert.doesNotMatch(services,/save_service_type_config/);
});

test('Tipos de Tarifa remains an independent service classification catalog',()=>{
  assert.match(tariffTypes,/list_tariff_types_config/);
  assert.match(tariffTypes,/save_tariff_type_config/);
  assert.match(tariffTypes,/adds_km/);
  assert.match(tariffTypes,/service_ids/);
  assert.doesNotMatch(config,/configuration-reference/);
});

test('provider services is a pure allowlist',()=>{
  assert.match(services,/get_company_configuration_v2/);
  assert.match(services,/list_service_types_config/);
  assert.match(services,/save_company_service_setting_v2/);
  assert.match(services,/Acá no se crean servicios/);
  assert.doesNotMatch(services,/MutationObserver/);
});

test('billing parameters owns provider bases and current contractual rules without tariff drafts',()=>{
  assert.match(billing,/get_company_billing_configuration/);
  assert.match(billing,/available_bases/);
  assert.match(billing,/data-bp4-base/);
  assert.match(billing,/selectedBases/);
  assert.match(billing,/Bases habilitadas para esta prestadora/);
  assert.match(billing,/bases:selectedBases\.map|bases: selectedBases\.map/);
  assert.match(billing,/Radio cubierto \(km\)/);
  assert.match(billing,/Cobrar movida hasta \(km\)/);
  assert.match(billing,/covered_radius_km:radius|covered_radius_km: radius/);
  assert.match(billing,/movement_charge_until_km:movementUntil|movement_charge_until_km: movementUntil/);
  assert.match(billing,/get_company_billing_surcharges_v1/);
  assert.match(billing,/save_company_billing_surcharges_v1/);
  assert.doesNotMatch(billing,/ensure_company_tariff_draft_v4/);
  assert.doesNotMatch(billing,/publish_company_tariff_draft_v4/);
  assert.doesNotMatch(billing,/draftCard|rateCard|activeCard/);
  assert.doesNotMatch(billing,/function globalBases/);
});

test('Prestadoras uses current prices and embeds the canonical price screen',()=>{
  assert.match(companies,/get_company_configuration_v2/);
  assert.match(companies,/get_company_billing_configuration/);
  assert.match(companies,/get_company_service_prices_v1/);
  assert.match(companies,/mountEmbedded/);
  assert.match(companies,/Precios/);
  assert.match(companies,/Sin precio/);
  assert.doesNotMatch(companies,/get_company_tariffs_v4/);
  assert.doesNotMatch(companies,/active_card|draft_card|Tarifario v|Sin tarifario publicado/);
  assert.doesNotMatch(companies,/company_branches|abrirSucursal|guardarSucursal|desactivarSucursal|Nueva sucursal|Sucursales/);
});

test('Tarifas is one current-price implementation with optional base exceptions and audit history',()=>{
  assert.match(tariffs,/get_company_service_prices_v1/);
  assert.match(tariffs,/save_company_service_price_v1/);
  assert.match(tariffs,/delete_company_service_price_exception_v1/);
  assert.match(tariffs,/get_company_service_price_history_v1/);
  assert.match(tariffs,/mountEmbedded/);
  assert.match(tariffs,/Valor movida/);
  assert.match(tariffs,/Valor por KM/);
  assert.match(tariffs,/Excepción por base/);
  assert.doesNotMatch(tariffs,/ensure_company_tariff_draft_v4|publish_company_tariff_draft_v4|get_company_tariffs_v4/);
  assert.doesNotMatch(tariffs,/Crear nueva vigencia|Borrador v|Tarifario publicado|draft_card|active_card/i);
  assert.doesNotMatch(tariffs,/KM incluidos|KM excedente|included_km|Nota interna|ct4-rate-notes/i);
  assert.doesNotMatch(tariffs,/covered_radius_km|movement_charge_until_km/);
});

test('current-price backend uses audited items as technical storage without branch semantics',()=>{
  assert.match(currentPricesMigration,/get_company_service_prices_v1/);
  assert.match(currentPricesMigration,/save_company_service_price_v1/);
  assert.match(currentPricesMigration,/get_company_service_price_history_v1/);
  assert.match(currentPricesMigration,/get_operator_service_context_v1/);
  assert.match(currentPricesMigration,/v_card,\s*NULL,\s*v_base/);
  assert.match(currentPricesMigration,/i\.branch_id\s+IS\s+NULL/i);
  assert.match(currentPricesMigration,/new\.included_km:=0/);
  assert.match(currentPricesMigration,/has_price/);
  assert.match(currentPricesMigration,/blocking_issues/);
  assert.match(currentPricesMigration,/warnings/);
});

test('billing surcharges use current provider configuration instead of draft/publish workflow',()=>{
  assert.match(surchargeMigration,/get_company_billing_surcharges_v1/);
  assert.match(surchargeMigration,/save_company_billing_surcharges_v1/);
  assert.doesNotMatch(surchargeMigration,/ensure_company_tariff_draft_v4|publish_company_tariff_draft_v4/);
});

test('Nuevo Servicio uses only billing bases, provider context and availability warnings',()=>{
  assert.match(operatorWizard,/get_operator_service_context_v1/);
  assert.match(operatorWizard,/billing_base_id/);
  assert.match(operatorWizard,/cambiarBaseServicio/);
  assert.match(operatorWizard,/blocking_issues/);
  assert.match(operatorWizard,/has_price/);
  assert.doesNotMatch(operatorWizard,/branch_id|cambiarSucursalServicio|get_operator_category_tariff_v3/);
  const baseDataBody=operatorWizard.match(/const baseData=\(\)=>\(\{([\s\S]*?)\}\);/)?.[1]||'';
  assert.doesNotMatch(baseDataBody,/category_id/);
});

test('Nuevo Servicio UI shows warnings and never renders commercial prices',()=>{
  assert.match(operatorWorkspace,/osv4-base/);
  assert.match(operatorWorkspace,/osv4-context-status/);
  assert.match(operatorWorkspace,/Sin precio/);
  assert.match(operatorWorkspace,/Disponible/);
  assert.match(operatorWorkspace,/Validar servicio/);
  assert.doesNotMatch(operatorWorkspace,/osv4-branch|cambiarSucursalServicio|secondaryPrice/);
  assert.doesNotMatch(operatorWorkspace,/\$\s*\{|money\(/);
});

test('Servicios operational module has no company branch dependency and gates commercial display',()=>{
  assert.doesNotMatch(operatorServices,/company_branches|S\.branches|const branch=|branch\(/);
  assert.match(operatorServices,/canSeeCommercial/);
  assert.match(operatorServices,/<small>Base<\/small>/);
  assert.match(operatorServices,/billing_base_name/);
});

test('distance rules charge all km after the covered radius',()=>{
  assert.match(distanceRulesMigration,/covered_radius_km/);
  assert.match(distanceRulesMigration,/movement_charge_until_km/);
  assert.match(distanceRulesMigration,/v_distance_applies := v_distance > 0 AND \(v_radius IS NULL OR v_distance > v_radius\)/);
  assert.match(distanceRulesMigration,/v_movement_applies := v_movement_until IS NULL OR v_distance <= v_movement_until/);
  assert.match(distanceRulesMigration,/v_distance \* coalesce\(v_rate\.extra_km_price, 0\)/i);
  assert.doesNotMatch(distanceRulesMigration,/v_distance\s*-\s*coalesce\(v_rate\.included_km/i);
});

test('operator pricing still delegates to v4 rate items and not the legacy matrix',()=>{
  assert.match(operatorMigration,/company_rate_items/);
  assert.match(operatorMigration,/calculate_operator_service_quote_v4_full/);
  assert.match(operatorMigration,/rate_card_v4/);
  assert.doesNotMatch(operatorMigration,/(?:FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?company_tariff_matrix_rates/i);
});

test('PWA invalidates caches after the current-price and service-context refactor',()=>{
  const version=Number(sw.match(/auxilios-v(\d+)/)?.[1]||0);
  assert.ok(version>=165,`Expected cache version 165 or newer, received ${version}`);
  assert.match(sw,/operator-service-code-warnings-v1\.js/);
  assert.doesNotMatch(sw,/operator-service-tariff-v3-ui\.js|operator-service-tariff-v3\.css/);
});

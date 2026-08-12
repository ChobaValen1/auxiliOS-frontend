'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const billing = fs.readFileSync('company-billing-parameters-v4.js', 'utf8');
const services = fs.readFileSync('company-services-configuration-v4.js', 'utf8');
const serviceCatalog = fs.readFileSync('service-types-catalog-v2.js', 'utf8');
const tariffTypes = fs.readFileSync('tariff-types-catalog-v1.js', 'utf8');
const tariffs = fs.readFileSync('company-tariffs-v4.js', 'utf8');
const companies = fs.readFileSync('empresas-v2.js', 'utf8');
const config = fs.readFileSync('config.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');
const tariffMigration = fs.readFileSync('migrations/20260811223000_company_tariffs_v4.sql', 'utf8');
const operatorMigration = fs.readFileSync('migrations/20260811224500_operator_rate_items_pricing_v4.sql', 'utf8');

const canonical = [
  'empresas-v2.js',
  'service-types-catalog-v2.js',
  'tariff-types-catalog-v1.js',
  'company-services-configuration-v4.js',
  'company-billing-parameters-v4.js',
  'company-tariffs-v4.js',
  'configuration-center.js',
];

const removedRuntime = [
  'empresas.js',
  'configuration-reference.js',
  'configuration-reference.css',
  'billing-base-operator-adapter.js',
  'frequent-navigation.js',
  'comercial.js',
  'comercial-services.js',
  'comercial-code-strategy.js',
  'comercial-rules.js',
  'comercial-summary.js',
  'tariff-composition.js',
  'comercial.css',
  'company-billing-settings.js',
  'equal-billing-bases.js',
  'company-configuration-coherence-v1.js',
  'tariff-new-rate-flow-v1.js',
  'tariff-matrix-v3.js',
];

test('runtime keeps only the canonical commercial configuration modules', () => {
  for (const name of canonical) {
    assert.ok(config.includes(name), `${name} must load at runtime`);
    assert.ok(sw.includes(name), `${name} must be precached`);
    if (name.endsWith('.js')) assert.ok(pkg.includes(name), `${name} must be checked by CI`);
  }
  for (const name of removedRuntime) {
    assert.equal(config.includes(name), false, `${name} must not load at runtime`);
    assert.equal(sw.includes(name), false, `${name} must not be precached`);
    assert.equal(pkg.includes(name), false, `${name} must not be checked by CI`);
  }
});

test('Tipos de Servicio is the only service creation catalog', () => {
  assert.match(serviceCatalog, /screen-config-service-types/);
  assert.match(serviceCatalog, /Nuevo servicio/);
  assert.match(serviceCatalog, /save_service_type_config/);
  assert.match(serviceCatalog, /delete_service_type_config/);
  assert.match(serviceCatalog, /distance_chargeable/);
  assert.doesNotMatch(services, /save_service_type_config/);
});

test('Tipos de Tarifa is independent from the removed configuration matrix', () => {
  assert.match(tariffTypes, /list_tariff_types_config/);
  assert.match(tariffTypes, /save_tariff_type_config/);
  assert.match(tariffTypes, /adds_km/);
  assert.match(tariffTypes, /service_ids/);
  assert.doesNotMatch(config, /configuration-reference/);
});

test('provider services is a pure allowlist without DOM compatibility patches', () => {
  assert.match(services, /get_company_configuration_v2/);
  assert.match(services, /list_service_types_config/);
  assert.match(services, /save_company_service_setting_v2/);
  assert.match(services, /Acá no se crean servicios/);
  assert.match(services, /external_code: current\.external_code/);
  assert.match(services, /code_mode: current\.code_mode/);
  assert.doesNotMatch(services, /MutationObserver/);
  assert.doesNotMatch(services, /configuration-reference/);
});

test('billing parameters selects company bases explicitly instead of linking every global base', () => {
  assert.match(billing, /get_company_billing_configuration/);
  assert.match(billing, /available_bases/);
  assert.match(billing, /data-bp4-base/);
  assert.match(billing, /selectedBases/);
  assert.match(billing, /Bases habilitadas para esta prestadora/);
  assert.match(billing, /bases: selectedBases\.map/);
  assert.doesNotMatch(billing, /function globalBases/);
  assert.doesNotMatch(billing, /_db\.from\('billing_bases'\).*eq\('is_active', true\)/s);
});

test('billing parameters owns route tolls surcharge exceptions and vigencia', () => {
  assert.match(billing, /Modo de kilometraje/);
  assert.match(billing, /bp4-tolls/);
  assert.match(billing, /Estimación automática por ruta/);
  assert.match(billing, /Carga real \/ comprobante/);
  assert.match(billing, /No corresponde/);
  assert.match(billing, /bp4-night-enabled/);
  assert.match(billing, /bp4-weekend-enabled/);
  assert.match(billing, /ensure_company_tariff_draft_v4/);
});

test('Prestadoras V2 uses only company linked bases and Tarifas V4', () => {
  assert.match(companies, /get_company_configuration_v2/);
  assert.match(companies, /get_company_billing_configuration/);
  assert.match(companies, /get_company_tariffs_v4/);
  assert.match(companies, /billing\.links/);
  assert.match(companies, /is_enabled === true/);
  assert.match(companies, /No existe una base principal/);
  assert.doesNotMatch(companies, /list_company_tariff_matrix_v2/);
  assert.doesNotMatch(companies, /primaryBase/);
  assert.doesNotMatch(companies, /Reglas y parámetros/);
});

test('Tarifas v4 is the only provider price screen and uses enabled services', () => {
  assert.match(tariffs, /Prestadora/);
  assert.match(tariffs, /get_company_tariffs_v4/);
  assert.match(tariffs, /S\.data\.services/);
  assert.match(tariffs, /Excepción por base/);
  assert.match(tariffs, /delete_company_tariff_exception_v4/);
  assert.doesNotMatch(tariffs, /Categoría × Concepto/);
  assert.match(tariffMigration, /billing_base_id IS NULL/);
});

test('tariff history uses draft then publish rather than overwriting published prices', () => {
  assert.match(tariffs, /Crear nueva vigencia/);
  assert.match(tariffs, /ensure_company_tariff_draft_v4/);
  assert.match(tariffs, /publish_company_tariff_draft_v4/);
  assert.match(tariffs, /get_company_tariff_history_v4/);
  assert.match(tariffMigration, /status = 'draft'/);
});

test('operator pricing uses published rate items and never queries the legacy matrix table', () => {
  assert.match(operatorMigration, /company_rate_items/);
  assert.match(operatorMigration, /calculate_operator_service_quote_v4_full/);
  assert.match(operatorMigration, /rate_card_v4/);
  assert.doesNotMatch(operatorMigration, /(?:FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?company_tariff_matrix_rates/i);
});

test('PWA invalidates every cached copy from before the cleanup', () => {
  const version = Number(sw.match(/auxilios-v(\d+)/)?.[1] || 0);
  assert.ok(version >= 162, `Expected cache version 162 or newer, received ${version}`);
});

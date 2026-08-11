'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const billing = fs.readFileSync('company-billing-parameters-v4.js', 'utf8');
const services = fs.readFileSync('company-services-configuration-v4.js', 'utf8');
const serviceCatalog = fs.readFileSync('service-types-catalog-v2.js', 'utf8');
const tariffs = fs.readFileSync('company-tariffs-v4.js', 'utf8');
const config = fs.readFileSync('config.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');
const tariffMigration = fs.readFileSync('migrations/20260811223000_company_tariffs_v4.sql', 'utf8');
const operatorMigration = fs.readFileSync('migrations/20260811224500_operator_rate_items_pricing_v4.sql', 'utf8');

const obsolete = [
  'company-billing-settings.js',
  'equal-billing-bases.js',
  'company-configuration-coherence-v1.js',
  'company-billing-parameters-v2.js',
  'company-billing-parameters-v3.js',
  'company-billing-parameters-view-v2.js',
  'tariff-new-rate-flow-v1.js',
  'tariff-matrix-v3.js',
  'tariff-matrix-v3.css',
  'company-services-configuration-v2.js',
  'company-services-configuration-v3.js',
  'configuration-service-unit-v1.js',
  'service-types-catalog-v1.js',
];

test('runtime has one catalog, one provider allowlist, one billing parameters module and one tariff UI', () => {
  for (const name of ['service-types-catalog-v2.js','company-services-configuration-v4.js','company-billing-parameters-v4.js','company-tariffs-v4.js']) {
    assert.ok(config.includes(name), `${name} must load at runtime`);
    assert.ok(sw.includes(name), `${name} must be precached`);
    assert.ok(pkg.includes(name), `${name} must be checked by CI`);
  }
  for (const name of obsolete) {
    assert.equal(config.includes(name), false, `${name} must not load at runtime`);
    assert.equal(sw.includes(name), false, `${name} must not be precached`);
    assert.equal(pkg.includes(name), false, `${name} must not be checked by CI`);
  }
});

test('Tipos de Servicio owns its CRUD route without a tariff matrix taking over the screen', () => {
  assert.match(serviceCatalog, /screen-config-service-types/);
  assert.match(serviceCatalog, /Nuevo servicio/);
  assert.match(serviceCatalog, /Editar/);
  assert.match(serviceCatalog, /Eliminar/);
  assert.match(serviceCatalog, /save_service_type_config/);
  assert.match(serviceCatalog, /delete_service_type_config/);
  assert.doesNotMatch(config, /auxilios-tariff-matrix-v3/);
});

test('provider services is only an allowlist and refreshes canonical tariffs', () => {
  assert.match(services, /list_service_types_config/);
  assert.match(services, /save_company_service_setting_v2/);
  assert.match(services, /Acá no se crean servicios/);
  assert.match(services, /Configuración → Tipos de servicio/);
  assert.match(services, /AuxiliosCompanyTariffsV4\?\.reload/);
  assert.doesNotMatch(services, /tmv3-company/);
});

test('billing parameters remains its own module with route, tolls and surcharge exceptions', () => {
  assert.match(billing, /modal-company-billing-v4/);
  assert.match(billing, /Cómo factura el servicio/);
  assert.match(billing, /Recargos/);
  assert.match(billing, /Vigencia/);
  assert.match(billing, /bp4-night-enabled/);
  assert.match(billing, /bp4-night-start/);
  assert.match(billing, /bp4-weekend-enabled/);
  assert.match(billing, /exceptionHtml\('night'/);
  assert.match(billing, /exceptionHtml\('weekend_holiday'/);
  assert.match(billing, /ensure_company_tariff_draft_v4/);
  assert.doesNotMatch(billing, /TariffMatrixV3/);
  assert.doesNotMatch(billing, /tmv3-/);
});

test('Tarifas v4 begins with provider and renders only enabled service rows returned by the canonical RPC', () => {
  assert.match(tariffs, /Prestadora/);
  assert.match(tariffs, /get_company_tariffs_v4/);
  assert.match(tariffs, /Servicios habilitados/);
  assert.match(tariffs, /S\.data\.services/);
  assert.doesNotMatch(tariffs, /Código interno/);
  assert.doesNotMatch(tariffs, /Categoría × Concepto/);
});

test('Tarifas v4 adapts pricing fields to the service type', () => {
  assert.match(tariffs, /service\.distance_chargeable/);
  assert.match(tariffs, /ct4-base-price/);
  assert.match(tariffs, /ct4-included-km/);
  assert.match(tariffs, /ct4-extra-km/);
  assert.match(tariffs, /ct4-unit-price/);
  assert.match(tariffs, /La unidad se define en Tipos de Servicio/);
});

test('general tariff applies to all bases and base differences are optional exceptions', () => {
  assert.match(tariffs, /Todas las bases/);
  assert.match(tariffs, /Excepción por base/);
  assert.match(tariffs, /delete_company_tariff_exception_v4/);
  assert.match(tariffMigration, /billing_base_id IS NULL/);
  assert.match(tariffMigration, /company_rate_items_billing_base_concept_uq/);
});

test('tariff history uses draft then publish rather than overwriting published prices', () => {
  assert.match(tariffs, /Crear nueva vigencia/);
  assert.match(tariffs, /ensure_company_tariff_draft_v4/);
  assert.match(tariffs, /publish_company_tariff_draft_v4/);
  assert.match(tariffs, /get_company_tariff_history_v4/);
  assert.match(tariffMigration, /status = 'draft'/);
});

test('operator pricing consumes the published rate card source, not the old matrix rates', () => {
  assert.match(operatorMigration, /company_rate_items/);
  assert.match(operatorMigration, /calculate_operator_service_quote_v4_full/);
  assert.match(operatorMigration, /pricing_model', 'rate_card_v4/);
  assert.doesNotMatch(operatorMigration, /company_tariff_matrix_rates/);
});

test('PWA cache invalidates previews after the tariff replacement', () => {
  const version = Number(sw.match(/auxilios-v(\d+)/)?.[1] || 0);
  assert.ok(version >= 161, `Expected cache version 161 or newer, received ${version}`);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const billing = fs.readFileSync('company-billing-parameters-v3.js', 'utf8');
const services = fs.readFileSync('company-services-configuration-v4.js', 'utf8');
const serviceCatalog = fs.readFileSync('service-types-catalog-v2.js', 'utf8');
const config = fs.readFileSync('config.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

const obsolete = [
  'company-billing-settings.js',
  'equal-billing-bases.js',
  'company-configuration-coherence-v1.js',
  'company-billing-parameters-v2.js',
  'company-billing-parameters-view-v2.js',
  'tariff-new-rate-flow-v1.js',
  'company-services-configuration-v2.js',
  'company-services-configuration-v3.js',
  'configuration-service-unit-v1.js',
  'service-types-catalog-v1.js',
];

test('runtime has one service catalog, one provider allowlist and one billing parameters module', () => {
  assert.match(config, /service-types-catalog-v2\.js/);
  assert.match(config, /company-services-configuration-v4\.js/);
  assert.match(config, /company-billing-parameters-v3\.js/);
  assert.match(sw, /service-types-catalog-v2\.js/);
  assert.match(sw, /company-services-configuration-v4\.js/);
  assert.match(pkg, /service-types-catalog-v2\.js/);
  assert.match(pkg, /company-services-configuration-v4\.js/);
  for (const name of obsolete) {
    assert.equal(config.includes(name), false, `${name} must not load at runtime`);
    assert.equal(sw.includes(name), false, `${name} must not be precached`);
    assert.equal(pkg.includes(name), false, `${name} must not be checked by CI`);
  }
});

test('service types screen implements read create update and delete', () => {
  assert.match(serviceCatalog, /list_service_types_config/);
  assert.match(serviceCatalog, /Nuevo servicio/);
  assert.match(serviceCatalog, /Editar/);
  assert.match(serviceCatalog, /Eliminar/);
  assert.match(serviceCatalog, /save_service_type_config/);
  assert.match(serviceCatalog, /delete_service_type_config/);
  assert.match(serviceCatalog, /load\(true\)/);
});

test('service type editing exposes the requested operational attributes', () => {
  assert.match(serviceCatalog, /st2-category/);
  assert.match(serviceCatalog, /Primario/);
  assert.match(serviceCatalog, /Secundario/);
  assert.match(serviceCatalog, /Mixto/);
  assert.match(serviceCatalog, /st2-adds-km/);
  assert.match(serviceCatalog, /Suma kilómetros/);
  assert.match(serviceCatalog, /st2-tariff-type/);
  assert.match(serviceCatalog, /st2-unit/);
  assert.match(serviceCatalog, /document\.getElementById\('st2-code'\)\.disabled=false/);
});

test('service type mutations use admin RPCs instead of direct table writes', () => {
  assert.match(serviceCatalog, /rpc\('save_service_type_config'/);
  assert.match(serviceCatalog, /rpc\('delete_service_type_config'/);
  assert.doesNotMatch(serviceCatalog, /from\('service_concepts'\)\.update/);
  assert.doesNotMatch(serviceCatalog, /from\('service_concepts'\)\.delete/);
  assert.match(serviceCatalog, /result\.data\?\.archived/);
});

test('provider services module is only an allowlist over the master service catalog', () => {
  assert.match(services, /list_service_types_config/);
  assert.match(services, /save_company_service_setting_v2/);
  assert.match(services, /Acá no se crean servicios/);
  assert.match(services, /Configuración → Tipos de servicio/);
  assert.match(services, /Servicios del catálogo maestro habilitados para esta prestadora/);
  assert.doesNotMatch(services, /abrirTipoServicioConfig/);
  assert.doesNotMatch(services, /guardarTipoServicioConfig/);
  assert.doesNotMatch(services, /crs-code/);
});

test('billing parameters owns its modal and does not depend on the deleted legacy form', () => {
  assert.match(billing, /modal-company-billing-v3/);
  assert.match(billing, /Cómo factura el servicio/);
  assert.match(billing, /Recargos/);
  assert.match(billing, /Vigencia/);
  assert.doesNotMatch(billing, /cb-base-list/);
});

test('night surcharge supports checkbox time range percentage or fixed value and service exceptions', () => {
  assert.match(billing, /bp3-night-enabled/);
  assert.match(billing, /bp3-night-start/);
  assert.match(billing, /bp3-night-end/);
  assert.match(billing, /percentage/);
  assert.match(billing, /fixed/);
  assert.match(billing, /exceptionHtml\('night'/);
});

test('weekend and holiday surcharge supports ranges and exceptions', () => {
  assert.match(billing, /bp3-weekend-enabled/);
  assert.match(billing, /bp3-saturday-start/);
  assert.match(billing, /bp3-sunday-start/);
  assert.match(billing, /exceptionHtml\('weekend_holiday'/);
});

test('surcharge changes remain versioned', () => {
  assert.match(billing, /company_rate_rules/);
  assert.match(billing, /company_rate_rule_exceptions/);
  assert.match(billing, /duplicateActiveCard/);
});

test('tariffs use global bases and only enabled company services', () => {
  assert.match(billing, /from\('billing_bases'\)/);
  assert.match(billing, /Base global/);
  assert.match(billing, /filter\(item => item\.is_enabled === true\)/);
  assert.match(billing, /enforceTariffServiceScope/);
});

test('PWA cache is bumped after replacing service type runtime code', () => {
  const version = Number(sw.match(/auxilios-v(\d+)/)?.[1] || 0);
  assert.ok(version >= 159, `Expected cache version 159 or newer, received ${version}`);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const billing = fs.readFileSync('company-billing-parameters-v3.js', 'utf8');
const services = fs.readFileSync('company-services-configuration-v2.js', 'utf8');
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
];

test('runtime has one canonical provider services module and one billing parameters module', () => {
  assert.match(config, /company-services-configuration-v2\.js/);
  assert.match(config, /company-billing-parameters-v3\.js/);
  assert.match(sw, /company-services-configuration-v2\.js/);
  assert.match(sw, /company-billing-parameters-v3\.js/);
  assert.match(pkg, /company-services-configuration-v2\.js/);
  assert.match(pkg, /company-billing-parameters-v3\.js/);
  for (const name of obsolete) {
    assert.equal(config.includes(name), false, `${name} must not load at runtime`);
    assert.equal(sw.includes(name), false, `${name} must not be precached`);
    assert.equal(pkg.includes(name), false, `${name} must not be checked by CI`);
  }
});

test('billing parameters owns its modal and does not depend on the deleted legacy form', () => {
  assert.match(billing, /modal-company-billing-v3/);
  assert.match(billing, /Cómo factura el servicio/);
  assert.match(billing, /Recargos/);
  assert.match(billing, /Vigencia/);
  assert.doesNotMatch(billing, /cb-base-list/);
  assert.doesNotMatch(billing, /Bases habilitadas para esta prestadora/);
});

test('night surcharge supports checkbox, time range, percentage or fixed value and service exceptions', () => {
  assert.match(billing, /bp3-night-enabled/);
  assert.match(billing, /bp3-night-start/);
  assert.match(billing, /bp3-night-end/);
  assert.match(billing, /percentage/);
  assert.match(billing, /fixed/);
  assert.match(billing, /exceptionHtml\('night'/);
  assert.match(billing, /data-bp3-exception/);
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
  assert.match(billing, /Histórico protegido/);
});

test('tariffs use global bases and only enabled company services', () => {
  assert.match(billing, /from\('billing_bases'\)/);
  assert.match(billing, /Base global/);
  assert.match(billing, /filter\(item => item\.is_enabled === true\)/);
  assert.match(billing, /enforceTariffServiceScope/);
  assert.match(billing, /Editar valor/);
  assert.match(billing, /Cargar valor/);
  assert.match(billing, /provider-settings/);
});

test('guided new tariff flow is integrated in the canonical billing module', () => {
  assert.match(billing, /modal-new-rate-scope-v3/);
  assert.match(billing, /openNewRateSelector/);
  assert.match(billing, /continueNewRate/);
  assert.match(billing, /Prestadora \+ Base \+ Categoría \+ Servicio \+ Vigencia/);
});

test('provider services module is an allowlist over the master service catalog', () => {
  assert.match(services, /list_service_types_config/);
  assert.match(services, /save_company_service_setting_v2/);
  assert.match(services, /Acá no se crean servicios/);
  assert.match(services, /Configuración → Tipos de servicio/);
  assert.match(services, /Servicios del catálogo maestro habilitados para esta prestadora/);
});

test('service type and tariff type forms remain editable', () => {
  assert.match(services, /crs-code/);
  assert.match(services, /crt-code/);
  assert.match(services, /el\.disabled = false/);
  assert.match(services, /from\('service_concepts'\)\.update\(\{ code \}\)/);
  assert.match(services, /from\('tariff_types'\)\.update\(\{ code \}\)/);
});

test('PWA cache is bumped after removing obsolete runtime code', () => {
  const version = Number(sw.match(/auxilios-v(\d+)/)?.[1] || 0);
  assert.ok(version >= 156, `Expected cache version 156 or newer, received ${version}`);
});

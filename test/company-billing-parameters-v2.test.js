const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('company-billing-parameters-v2.js', 'utf8');
const config = fs.readFileSync('config.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

test('loads the dedicated billing parameters module', () => {
  assert.match(config, /company-billing-parameters-v2\.js/);
  assert.match(sw, /company-billing-parameters-v2\.js/);
  assert.match(sw, /auxilios-v154/);
});

test('billing parameters is a configuration module without a company base selector', () => {
  assert.match(source, /Cómo factura el servicio/);
  assert.match(source, /Recargos/);
  assert.match(source, /Vigencia/);
  assert.doesNotMatch(source, /id="cb-base-list"/);
  assert.doesNotMatch(source, /Bases habilitadas para esta prestadora/);
});

test('night surcharge supports enablement, time window, percentage or fixed amount and exceptions', () => {
  assert.match(source, /bp2-night-enabled/);
  assert.match(source, /bp2-night-start/);
  assert.match(source, /bp2-night-end/);
  assert.match(source, /percentage/);
  assert.match(source, /fixed/);
  assert.match(source, /data-bp2-exception="night"/);
});

test('weekend and holiday surcharge supports separate ranges and exceptions', () => {
  assert.match(source, /bp2-weekend-enabled/);
  assert.match(source, /bp2-saturday-start/);
  assert.match(source, /bp2-saturday-end/);
  assert.match(source, /bp2-sunday-start/);
  assert.match(source, /bp2-sunday-end/);
  assert.match(source, /data-bp2-exception="weekend_holiday"/);
});

test('surcharges reuse versioned rate rules instead of storing values in notes', () => {
  assert.match(source, /company_rate_rules/);
  assert.match(source, /company_rate_rule_exceptions/);
  assert.match(source, /duplicateActiveCard/);
  assert.match(source, /Histórico protegido/);
});

test('tariffs use global bases and remove duplicated provider configuration', () => {
  assert.match(source, /from\('billing_bases'\)/);
  assert.match(source, /Base global/);
  assert.match(source, /provider-settings/);
  assert.match(source, /provider\?\.remove\(\)/);
});

test('tariff rows are constrained to company enabled services and values are editable', () => {
  assert.match(source, /filter\(item => item\.is_enabled === true\)/);
  assert.match(source, /enforceTariffServiceScope/);
  assert.match(source, /Editar valor/);
  assert.match(source, /Cargar valor/);
});

test('service type and tariff type forms are repaired for real editing', () => {
  assert.match(source, /crs-code/);
  assert.match(source, /crt-code/);
  assert.match(source, /element\.disabled = false/);
  assert.match(source, /from\('service_concepts'\)\.update\(\{ code \}\)/);
  assert.match(source, /from\('tariff_types'\)\.update\(\{ code \}\)/);
});
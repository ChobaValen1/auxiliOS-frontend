'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('provider configuration keeps bases scoped to the selected company', () => {
  const bases = read('equal-billing-bases.js');
  const tariff = read('tariff-new-rate-flow-v1.js');

  assert.match(bases, /billingResult\.data\?\.links/);
  assert.doesNotMatch(bases, /available_bases[^\n]*filter\(base => base\.is_active/);
  assert.match(tariff, /get_company_configuration_v2/);
  assert.match(tariff, /Esta prestadora todavía no tiene una base activa vinculada/);
  assert.doesNotMatch(tariff, /Todas las bases · Tarifa general/);
});

test('service types are created globally and provider screen is only an allowlist', () => {
  const reference = read('configuration-reference.js');
  const coherence = read('company-configuration-coherence-v1.js');

  assert.match(reference, /Tipos de servicio/);
  assert.match(reference, /save_service_type_config/);
  assert.match(reference, /category: input\('crs-category'\)/);
  assert.match(reference, /distance_chargeable: Boolean\(selected\?\.adds_km\)/);

  assert.match(coherence, /Acá no se crean servicios/);
  assert.match(coherence, /Configuración → Tipos de servicio/);
  assert.match(coherence, /solo elegís cuáles son válidos para la prestadora seleccionada/);
  assert.match(coherence, /save_company_service_setting_v2/);
  assert.match(coherence, /external_code: current\.external_code \|\| null/);
  assert.match(coherence, /code_mode: current\.code_mode \|\| 'fixed'/);
  assert.doesNotMatch(coherence, /class="form-input cr-provider-code"/);
});

test('provider billing rules are unified and toll mode is reactive', () => {
  const coherence = read('company-configuration-coherence-v1.js');

  assert.match(coherence, /name === 'rules' \? 'bases' : name/);
  assert.match(coherence, /Reglas y parámetros/);
  assert.match(coherence, /Parámetros de facturación/);
  assert.match(coherence, /toll\.addEventListener\('change', renderTollMode\)/);
  assert.match(coherence, /Estimación automática por ruta/);
  assert.match(coherence, /Carga real \/ comprobante/);
  assert.match(coherence, /AuxiliOS no debe solicitar ni incorporar peajes/);
});

test('company services view shows enabled catalog metadata and tariffs remain downstream', () => {
  const coherence = read('company-configuration-coherence-v1.js');

  assert.match(coherence, /Servicios creados en Tipos de servicio que esta prestadora tiene habilitados\. Las tarifas se asignan después/);
  assert.match(coherence, /settings\.get\(String\(service\.concept_id\)\)\?\.is_enabled === true/);
  assert.match(coherence, /Suma KM/);
  assert.match(coherence, /No suma KM/);
  assert.match(coherence, /document\.querySelectorAll\('#cr-matrix-body tr\.disabled'\)\.forEach\(row => row\.remove\(\)\)/);
});

test('coherence module is loaded and PWA cache invalidates old previews', () => {
  const config = read('config.js');
  const sw = read('sw.js');
  const version = Number(sw.match(/auxilios-v(\d+)/)?.[1] || 0);

  assert.match(config, /auxilios-company-configuration-coherence-v1/);
  assert.match(config, /company-configuration-coherence-v1\.js/);
  assert.match(sw, /company-configuration-coherence-v1\.js/);
  assert.ok(version >= 153, `Expected cache version 153 or newer, received ${version}`);
});

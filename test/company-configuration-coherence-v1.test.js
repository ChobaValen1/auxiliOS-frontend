'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('bases are global and stay outside provider billing parameters', () => {
  const billing = read('company-billing-parameters-v2.js');
  const view = read('company-billing-parameters-view-v2.js');

  assert.match(billing, /from\('billing_bases'\)/);
  assert.match(billing, /Seleccionar base global/);
  assert.doesNotMatch(billing, /id="cb-base-list"/);
  assert.doesNotMatch(billing, /<th>Prioridad<\/th>/);
  assert.doesNotMatch(billing, /<small>Base principal<\/small>/);
  assert.match(view, /Configuración de recorrido, peajes, recargos y vigencia\./);
  assert.match(view, /Reglas y parámetros/);
  assert.match(view, /button\.remove\(\)/);
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
  const billing = read('company-billing-parameters-v2.js');
  const view = read('company-billing-parameters-view-v2.js');

  assert.match(coherence, /name === 'rules' \? 'bases' : name/);
  assert.match(coherence, /Reglas y parámetros/);
  assert.match(billing, /Parámetros de facturación/);
  assert.match(billing, /addEventListener\('change', renderTollMode\)/);
  assert.match(billing, /Estimación automática por ruta/);
  assert.match(billing, /Carga real \/ comprobante/);
  assert.match(billing, /AuxiliOS no incorpora peajes/);
  assert.match(view, /dataset\.ccReactive = '1'/);
});

test('company services view shows enabled catalog metadata and tariffs remain downstream', () => {
  const coherence = read('company-configuration-coherence-v1.js');
  const billing = read('company-billing-parameters-v2.js');

  assert.match(coherence, /Servicios creados en Tipos de servicio que esta prestadora tiene habilitados\. Las tarifas se asignan después/);
  assert.match(coherence, /settings\.get\(String\(service\.concept_id\)\)\?\.is_enabled === true/);
  assert.match(coherence, /Suma KM/);
  assert.match(coherence, /No suma KM/);
  assert.match(billing, /enforceTariffServiceScope/);
});

test('configuration modules are loaded and PWA cache invalidates old previews', () => {
  const config = read('config.js');
  const sw = read('sw.js');
  const version = Number(sw.match(/auxilios-v(\d+)/)?.[1] || 0);

  assert.match(config, /auxilios-company-configuration-coherence-v1/);
  assert.match(config, /company-configuration-coherence-v1\.js/);
  assert.match(config, /company-billing-parameters-v2\.js/);
  assert.match(config, /company-billing-parameters-view-v2\.js/);
  assert.match(sw, /company-billing-parameters-v2\.js/);
  assert.match(sw, /company-billing-parameters-view-v2\.js/);
  assert.ok(version >= 155, `Expected cache version 155 or newer, received ${version}`);
});

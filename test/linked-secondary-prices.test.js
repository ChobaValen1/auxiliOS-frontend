'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const js = read('company-tariffs-v4.js');
const sql = read('migrations/20261015140000_linked_secondary_prices_v1.sql');

test('Tarifas: un adicional puede tomar la Movida o el Km asfalto del principal', () => {
  assert.match(js, /primary_movement: \['= Movida del principal', 'movement_price'\]/);
  assert.match(js, /primary_asphalt_km: \['= Km asfalto del principal', 'asphalt_km_price'\]/);
  assert.match(js, /const canLink = service => service\?\.category === 'secondary' && !service\.distance_chargeable/);
  assert.match(js, /'Tomar precio del principal'/);
  assert.match(js, /_db\.rpc\('set_company_service_price_link_v1', \{ p_company_id: instance\.companyId, p_concept_id: service\.concept_id, p_link: value \|\| null \}\)/);
});

test('Tarifas: el adicional vinculado muestra el valor de cada principal y no pide precio', () => {
  assert.match(js, /else if \(isLinked\(service\)\) cells = `<td class="num" data-label="Precio">\$\{linkedHtml\(instance, service\)\}/);
  assert.match(js, /\$\{price \|\| isLinked\(service\) \? '' : 'is-pending'\}/);
  assert.match(js, /isLinked\(service\) \? `<button type="button" class="ct4-btn" data-ct4-link=/);
});

test('Base: el cálculo usa el precio del principal y el remito del chofer lo sugiere', () => {
  assert.match(sql, /add column if not exists price_link text/);
  assert.match(sql, /v_unit:=CASE v_concept\.price_link WHEN ''primary_movement'' THEN v_primary_movement_price ELSE v_asphalt_unit_price END/);
  assert.match(sql, /linked_primary/);
  assert.match(sql, /app_private\.linked_secondary_price_v1\(v_company_id,v_billing_base_id,v_primary_id,v_date,css\.price_link\)/);
  assert.match(sql, /if app_private\.current_auxilios_role\(\)<>'administracion' then raise exception 'Solo Administración puede editar precios'/);
});

test('el ícono de vínculo existe en el set de íconos', () => {
  assert.match(read('ui/icons.svg'), /<symbol id="link" viewBox="0 0 24 24">/);
});

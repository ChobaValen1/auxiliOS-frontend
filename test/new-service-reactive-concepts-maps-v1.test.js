const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const ui = fs.readFileSync('operator-service-workspace-reactive-v1.js','utf8');
const css = fs.readFileSync('operator-service-workspace-reactive-v1.css','utf8');
const serviceCatalog = fs.readFileSync('service-types-catalog-v2.js','utf8');
const migration = fs.readFileSync('migrations/20260808093500_secondary_concepts_allow_km.sql','utf8');

test('Agregar concepto crea filas independientes y muestra disponibilidad sin importes', () => {
  assert.match(ui, /ui\.rows\.push\(\{id:uid\(\),conceptId:''\}\)/);
  assert.match(ui, /osv4-concept-row/);
  assert.match(ui, /Código Prestadora/);
  assert.match(ui, /Cantidad/);
  assert.match(ui, /Estado/);
  assert.match(ui, /Disponible/);
  assert.match(ui, /Sin precio/);
  assert.doesNotMatch(ui, /conceptPickerOpen|osv2-concept-picker-table/);
  assert.doesNotMatch(ui, />Importe</);
});

test('las unidades del concepto controlan cantidad y el catálogo canónico permite KM', () => {
  assert.match(ui, /km:\{label:'km',step:\.1,locked:false\}/);
  assert.match(ui, /service:\{label:'servicio',step:1,locked:true\}/);
  assert.match(serviceCatalog, /<option value="km">Por km<\/option>/);
  assert.match(migration, /secundarios por KM permitidos/);
});

test('Maps usa dropdown flotante y cancela búsquedas al perder foco', () => {
  assert.match(css, /\.osv4-suggestions\{position:absolute/);
  assert.match(ui, /function closeSuggestions\(kind,cancel=false\)/);
  assert.match(ui, /if\(cancel\)a\.seq\+\+/);
  assert.match(ui, /setTimeout\(\(\)=>searchAddress\(kind,q,seq\),550\)/);
  assert.match(ui, /action:'autocomplete'/);
  assert.match(ui, /action:'place'/);
  assert.match(ui, /action:'route'/);
});

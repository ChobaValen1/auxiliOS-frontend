const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const wizard = read('operator-service-wizard.js');
const addons = read('operator-service-commercial-addons-v1.js');
const migration = read('migrations/20261014100000_operator_excess_fixed_concepts_v1.sql');

test('excedentes del operador: lista fija en este orden, con Otro de nombre libre', () => {
  const names = [...wizard.match(/const EXCESS_CONCEPTS=\[(.*?)\];/)[1].matchAll(/'([^']+)'\]/g)].map(m => m[1]);
  assert.deepEqual(names, ['Kms excedentes', 'Extracción', 'Hora Trabajo', 'Hora Espera', 'Viajero', 'Otro…']);
  assert.match(addons, /O\(\)\?\.excessConcepts\?\.\(\)/);
  assert.match(addons, /placeholder="¿Qué es\?"/);
  assert.match(wizard, /Describí el excedente/);
  assert.match(wizard, /concept_name:String\(r\.concept_name\|\|''\)\.trim\(\)\|\|null/);
});

test('el importe del excedente lo escribe el operador (no se completa desde el tarifario)', () => {
  assert.match(wizard, /commercialState\(\)\.excess_charges\.push\(\{_id:uid\(\),concept_id:'',quantity:1,unit_amount:''/);
  assert.match(migration, /El importe del excedente debe ser mayor a cero/);
});

test('la base acepta la lista fija sin depender de la prestadora y guarda el nombre de Otro', () => {
  assert.match(migration, /sc\.code in \('excess_km','extraction','excess_work_hour','excess_wait_hour','excess_traveler','excess_other'\)/);
  assert.match(migration, /if v_concept_code='excess_other' then/);
  assert.match(migration, /'concept_name',e\.concept_name_snapshot,'quantity'/);
});

test('Servicios en notebook: menú contraído solo y Base, KM y Por cobrar ocultas si no hay vista propia', () => {
  const sigma = read('sigma.js');
  const services = read('operator-services.js');
  const css = read('operaciones-ax-v1.css');
  assert.match(sigma, /function _menuAutomaticoServicios\(name\)/);
  assert.match(sigma, /setSidenavCollapsed\(true, \{ persist: false \}\)/);
  assert.match(sigma, /function toggleSidenav\(\) \{ _navAutoCollapsed = false;/);
  assert.match(services, /const NOTEBOOK_HIDDEN_COLUMNS=\['base','km','amount_due'\]/);
  assert.match(services, /if\(!p&&isNotebookWidth\(\)\)/);
  assert.match(css, /#screen-operaciones \.os-table \{ table-layout: auto; width: max-content; min-width: 100%; \}/);
});

test('remito del chofer: misma lista fija primero, sin quitar los excedentes de la prestadora; Otro con nombre', () => {
  const addons = read('remito-addons-v2.js');
  const driverMigration = read('migrations/20261014110000_driver_excess_fixed_concepts_v1.sql');
  assert.match(addons, /function withFixedExcess\(rows=\[\]\)/);
  assert.match(addons, /\.\.\.rows\.filter\(row=>!ids\.has\(String\(row\.concept_id\)\)\)/);
  assert.match(addons, /state\.reference\.excess_concepts=withFixedExcess\(/);
  assert.match(addons, /data-draft-field="concept_name"/);
  assert.match(driverMigration, /c\.code in \('excess_km','extraction','excess_work_hour','excess_wait_hour','excess_traveler','excess_other'\)/);
  assert.match(driverMigration, /if v_concept\.code='excess_other' then/);
});

test('formulario de nuevo servicio compacto en escritorio', () => {
  const css = read('servicio-form-ax-v1.css');
  assert.match(css, /@media \(min-width: 1101px\) \{\n  #modal-operador-wizard \.osv4-reactive \{ --ax-h: 32px;/);
  assert.match(css, /\.client-row \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
});

test('revisión administrativa acepta la lista fija de excedentes y el nombre de Otro', () => {
  const m = read('migrations/20261014120000_admin_review_excess_fixed_concepts_v1.sql');
  assert.match(m, /validate_administrative_commercial_v1/);
  assert.match(m, /when c\.code='excess_other' then left\(nullif\(btrim\(coalesce\(x->>'concept_name',''\)\),''\),80\)/);
});

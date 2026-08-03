'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('company billing settings do not expose or submit base hierarchy', () => {
  const source = read('company-billing-settings.js');

  assert.doesNotMatch(source, /Base principal/i);
  assert.doesNotMatch(source, /base predeterminada/i);
  assert.doesNotMatch(source, />Prioridad</i);
  assert.doesNotMatch(source, />Principal</i);
  assert.doesNotMatch(source, /marcarBasePrincipalEmpresa/);
  assert.doesNotMatch(source, /cambiarPrioridadBaseEmpresa/);
  assert.doesNotMatch(source, /is_primary/);
  assert.doesNotMatch(source, /priority/);

  assert.match(source, /Todas tienen la misma jerarquía/);
  assert.match(source, /map\(item => \(\{ base_id: item\.base_id, is_active: true \}\)\)/);
});

test('company views evaluate and display tariffs for every enabled base', () => {
  const source = read('equal-billing-bases.js');

  assert.match(source, /Promise\.all\(bases\.map/);
  assert.match(source, /p_base_id: base\.base_id/);
  assert.match(source, /completeTariffs: bases\.length > 0 && coveredBases === bases\.length/);
  assert.match(source, /Todas las bases habilitadas están disponibles con la misma jerarquía/);
  assert.match(source, /<th>Base<\/th>/);
  assert.match(source, /removeColumnsByHeader\(section\.querySelector\('table'\), \['Prioridad', 'Principal'\]\)/);
});

test('equal-base module is loaded and precached', () => {
  const config = read('config.js');
  const serviceWorker = read('sw.js');

  assert.match(config, /auxilios-equal-billing-bases/);
  assert.match(config, /\/equal-billing-bases\.js/);
  assert.match(serviceWorker, /auxilios-v108/);
  assert.match(serviceWorker, /'\/equal-billing-bases\.js'/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const tm = read('toll-management.js');
const map = read('toll-map-v1.js');
const css = read('toll-map-v1.css');

function load(rows) {
  const ctx = { window: { AuxiliosTolls: { state: { rows } } }, document: { getElementById: () => null, addEventListener() {}, documentElement: { dataset: {} } }, console };
  vm.runInNewContext(map, ctx);
  return ctx.window.AuxiliosTollMap._test;
}

test('Peajes tiene la pestaña Mapa al lado y el módulo se carga y precachea', () => {
  assert.match(tm, /data-tm-section="tolls">Peajes<\/button><button type="button" data-tm-section="map">Mapa <small id="tm-map-count"><\/small><\/button>/);
  assert.match(tm, /<section id="tm-section-map" class="tm-section" hidden><\/section>/);
  assert.match(tm, /if\(STATE\.section==='map'\)window\.AuxiliosTollMap\?\.refresh\?\.\(\);/);
  assert.match(read('config.js'), /loadAuxiliosModule\('auxilios-toll-map-v1', '\/toll-map-v1\.js'\)/);
  assert.match(read('sw.js'), /'\/toll-map-v1\.css','\/toll-map-v1\.js'/);
});

test('mapa: un punto por ubicación; los peajes en el mismo lugar se juntan; los archivados se pueden ocultar', () => {
  const rows = [
    { toll_id: 1, name: 'A', is_active: true, latitude: -34.6479, longitude: -58.4779 },
    { toll_id: 2, name: 'B', is_active: true, latitude: -34.6479, longitude: -58.4779 },
    { toll_id: 3, name: 'C', is_active: false, latitude: -34.77, longitude: -58.16 },
    { toll_id: 4, name: 'Sin ubicación', is_active: true, latitude: null, longitude: null },
  ];
  const t = load(rows);
  const g = t.groups();
  assert.equal(g.length, 2);
  assert.equal(g.find(x => x.items.length === 2).active, true);
  assert.equal(g.find(x => x.items[0].name === 'C').active, false);
  t.S.showArchived = false;
  assert.equal(t.groups().length, 1);
  // Mercator: Greenwich y el ecuador caen en el centro del mundo.
  const w = t.world(0, 0);
  assert.equal(Math.round(w[0] * 1000) / 1000, 0.5);
  assert.equal(Math.round(w[1] * 1000) / 1000, 0.5);
});

test('lista: Activo en verde, Archivado distinto, filtro por estado y "Archivar" en lugar de "Eliminar"', () => {
  assert.match(tm, /<span class="tm-badge \$\{row\.is_active\?'is-active':'is-archived'\}">\$\{row\.is_active\?'Activo':'Archivado'\}<\/span>/);
  assert.match(tm, /data-tm-filter="all">Todos <small id="tm-n-all"><\/small><\/button><button type="button" data-tm-filter="active">Activos/);
  assert.match(tm, /f==='all'\|\|\(f==='active'\?row\.is_active:!row\.is_active\)/);
  assert.match(tm, /Archivados · \$\{archived\}<small>No se ofrecen al cargar servicios ni remitos\.<\/small>/);
  assert.match(tm, /\$\{row\.is_active\?'Archivar':'Reactivar'\}<\/button>/);
  assert.doesNotMatch(tm, /'Eliminar'/);
  assert.match(css, /#screen-peajes \.tm-badge\.is-active \{ background: var\(--ax-ok-soft\); color: var\(--ax-ok\); \}/);
  assert.match(css, /#tm-section-map \.tmm-pin\.is-archived \{[^}]*border: 2px dashed/);
});

test('peajes: al editar, la ubicación guardada no se vuelve a pedir', () => {
  assert.match(tm, /const hasCoords=row\.latitude!=null&&row\.longitude!=null;/);
  assert.match(tm, /STATE\.addressVerified=Boolean\(row\.address_verified\|\|hasCoords\);/);
  assert.match(tm, /✓ Ubicación guardada\. Elegí otra dirección solo si querés cambiarla\./);
});

test('peajes: el importe nuevo rige desde la fecha de Argentina, no la del servidor', () => {
  const sql = read('migrations/20261013030000_toll_rates_fecha_argentina_v1.sql');
  assert.match(sql, /v_hoy date := \(now\(\) at time zone 'America\/Argentina\/Buenos_Aires'\)::date;/);
  assert.doesNotMatch(sql.slice(sql.indexOf('as $function$')), /current_date/);
  assert.match(tm, /const today=\(\)=>new Date\(\)\.toLocaleDateString\('en-CA',\{timeZone:'America\/Argentina\/Buenos_Aires'\}\);/);
});

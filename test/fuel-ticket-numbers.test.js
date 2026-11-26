'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const N = require('../fuel-numbers-v1.js');

test('litros: comas y puntos como en los tickets argentinos', () => {
  assert.equal(N.decimal('45,32', 'litros'), 45.32);
  assert.equal(N.decimal('45,320', 'litros'), 45.32);
  assert.equal(N.decimal('45.320', 'litros'), 45.32);
  assert.equal(N.decimal('45.32', 'litros'), 45.32);
  assert.equal(N.decimal('120', 'litros'), 120);
  assert.equal(N.decimal('1.234,567 L', 'litros'), 1234.567);
  assert.equal(N.decimal(' 80,5 lts ', 'litros'), 80.5);
  assert.equal(N.decimal(62.18, 'litros'), 62.18);
});

test('importes: puntos de miles y coma decimal', () => {
  assert.equal(N.decimal('$ 1.234,50', 'importe'), 1234.5);
  assert.equal(N.decimal('1.850', 'importe'), 1850);
  assert.equal(N.decimal('1850,9', 'importe'), 1850.9);
  assert.equal(N.decimal('1850.90', 'importe'), 1850.9);
  assert.equal(N.decimal('55.950,00', 'importe'), 55950);
  assert.equal(N.decimal('1.055.950', 'importe'), 1055950);
  assert.equal(N.decimal('1,234.50', 'importe'), 1234.5, 'formato yanqui');
  assert.equal(N.decimal('1,055,950', 'importe'), 1055950);
  assert.ok(Number.isNaN(N.decimal('', 'importe')));
  assert.ok(Number.isNaN(N.decimal('abc', 'importe')));
});

test('odómetro: siempre entero, sin perder los miles', () => {
  assert.equal(N.km('123.456'), 123456);
  assert.equal(N.km('123,456'), 123456);
  assert.equal(N.km('123456'), 123456);
  assert.equal(N.km('123456,7'), 123456);
  assert.equal(N.km('123.456,7 km'), 123456);
  assert.equal(N.km('KM: 1.234.567'), 1234567);
  assert.equal(N.km(123456), 123456);
  assert.equal(N.km(123.456), 123456, 'la lectura devolvía 123.456 y se guardaba 123');
  assert.equal(N.km(98.5), 98500);
  assert.equal(N.km(123456.7), 123456);
  assert.equal(N.km(''), null);
  assert.equal(N.km(null), null);
});

test('conciliar: litros × precio = total, y corrige un separador mal leído', () => {
  // Ticket YPF: 62,180 L × $1.249,90 = $77.718,78
  assert.deepEqual(N.conciliar({ litros: '62,180', precio: '1.249,90', total: '77.718,78' }),
    { litros: 62.18, precio: 1249.9, total: 77718.78, consistente: true, corregidos: [] });
  // La lectura devolvió el precio como 1.2499 (punto de miles tomado como decimal)
  const r = N.conciliar({ litros: 62.18, precio: 1.2499, total: 77718.78 });
  assert.equal(r.precio, 1249.9); assert.deepEqual(r.corregidos, ['precio']); assert.equal(r.consistente, true);
  // Litros leídos como 62180 (coma de decimales perdida)
  const l = N.conciliar({ litros: 62180, precio: 1249.9, total: 77718.78 });
  assert.equal(l.litros, 62.18); assert.deepEqual(l.corregidos, ['litros']);
  // Total y litros, sin precio: se calcula
  const p = N.conciliar({ litros: '80', total: '100.000' });
  assert.equal(p.precio, 1250); assert.deepEqual(p.corregidos, ['precio']);
  // No cierra: se avisa, no se inventa
  const x = N.conciliar({ litros: '80', precio: '1250', total: '50.000' });
  assert.equal(x.consistente, false); assert.equal(x.litros, 80); assert.equal(x.precio, 1250);
});

test('odómetro contra el último registrado del camión', () => {
  assert.deepEqual(N.revisarOdometro(null, 120000), {});
  assert.deepEqual(N.revisarOdometro(120350, 120000), {});
  assert.match(N.revisarOdometro(120, 120000).aviso, /Quisiste poner 120\.000 km/);
  assert.equal(N.revisarOdometro(120, 120000).sugerido, 120000);
  assert.match(N.revisarOdometro(110000, 120000).aviso, /menor que el último/);
  assert.match(N.revisarOdometro(190000, 120000).aviso, /por encima/);
  assert.match(N.revisarOdometro(5000000, 120000).error, /mal leído/);
  assert.deepEqual(N.revisarOdometro(120350, null), {});
});

test('texto en formato argentino para mostrar lo leído', () => {
  assert.equal(N.texto(1234.5), '1.234,5');
  assert.equal(N.texto(62.18, 3), '62,18');
  assert.equal(N.texto(77718.78), '77.718,78');
  assert.equal(N.texto(1249.9, 2, true), '1.249,90');
  assert.equal(N.miles(123456), '123.456');
});

test('modal de combustible: usa el lector nuevo, pide ticket y lo encola sin señal', () => {
  const sigma = fs.readFileSync('sigma.js', 'utf8'), index = fs.readFileSync('Index.html', 'utf8'), sw = fs.readFileSync('sw.js', 'utf8'), pkg = fs.readFileSync('package.json', 'utf8');
  const guardar = sigma.slice(sigma.indexOf('async function guardarCombustible'), sigma.indexOf('// ── NEUMÁTICOS'));
  assert.doesNotMatch(guardar, /parseFloat|parseInt/, 'parseFloat("1.234,5") da 1.234');
  assert.match(guardar, /const N = window\.AuxFuelNumbers;/);
  assert.match(guardar, /N\.decimal\(document\.getElementById\('cb-litros'\)\?\.value, 'litros'\)/);
  assert.match(guardar, /N\.km\(kmTexto\)/);
  assert.match(guardar, /Sacale una foto al ticket/);
  assert.match(guardar, /blobs: \{ ticket:/);
  assert.match(sigma, /obRegistrarHandler\('fuel', async \(payload, blobs\)/);
  assert.match(index, /<script src="\/fuel-numbers-v1\.js/);
  assert.match(index, /Sin ticket no se puede guardar/);
  assert.match(sw, /'\/fuel-numbers-v1\.js'/);
  assert.match(pkg, /node --check fuel-numbers-v1\.js/);
});

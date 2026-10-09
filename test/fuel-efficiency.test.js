const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../fuel-efficiency-v1.js');

const carga = (fuel_id, fuel_date, km_at_load, liters, extra = {}) => ({ fuel_id, fuel_date, km_at_load, liters, ...extra });

test('una carga rinde: km desde la anterior sobre los litros de la nueva', () => {
  const m = E.porCarga([carga(1, '2026-10-01', 1000, 50), carga(2, '2026-10-03', 1400, 40)]);
  assert.deepEqual(m[2], { kml: 10, km: 400, litros: 40 });
  assert.equal(m[1].razon, 'sin_anterior');
});

test('cada caso sin dato dice por qué en vez de inventar un número', () => {
  const m = E.porCarga([
    carga(1, '2026-10-01', 1000, 50),
    carga(2, '2026-10-02', null, 30),                  // sin odómetro
    carga(3, '2026-10-03', 1600, 40),                  // hay una carga sin odómetro en el medio
    carga(4, '2026-10-04', 1500, 40),                  // el odómetro baja
    carga(5, '2026-10-05', 6000, 40),                  // salta más de 3.000 km
    carga(6, '2026-10-06', 6300, 0),                   // sin litros
  ]);
  assert.equal(m[2].razon, 'sin_odometro');
  assert.equal(m[3].razon, 'intermedia');
  assert.equal(m[4].razon, 'inconsistente');
  assert.equal(m[5].razon, 'inconsistente');
  assert.equal(m[6].razon, 'sin_litros');
});

test('las cargas anuladas no cuentan y el orden es por fecha, no por el orden en que llegan', () => {
  const m = E.porCarga([carga(3, '2026-10-03', 1400, 40), carga(1, '2026-10-01', 1000, 50), carga(2, '2026-10-02', 1200, 20, { voided_at: '2026-10-02T10:00:00Z' })]);
  assert.equal(m[2], undefined);
  assert.equal(m[3].kml, 10);
});

test('el promedio del móvil necesita al menos tres cargas válidas', () => {
  const dos = E.porCarga([carga(1, '2026-10-01', 1000, 50), carga(2, '2026-10-02', 1300, 30), carga(3, '2026-10-03', 1600, 30)]);
  assert.equal(E.promedio(dos), null);
  const cuatro = E.porCarga([carga(1, '2026-10-01', 1000, 50), carga(2, '2026-10-02', 1300, 30), carga(3, '2026-10-03', 1600, 30), carga(4, '2026-10-04', 1800, 40)]);
  assert.equal(E.promedio(cuatro), 8.3);   // (10 + 10 + 5) / 3
});

test('una jornada suma km y litros de sus cargas válidas y marca el consumo alto', () => {
  const todas = [carga(1, '2026-10-01', 1000, 50), carga(2, '2026-10-02', 1300, 30), carga(3, '2026-10-03', 1600, 30), carga(4, '2026-10-04', 1800, 40), carga(5, '2026-10-05', 1900, 50)];
  const m = E.porCarga(todas), prom = E.promedio(m);
  const dia = E.deJornada([todas[4]], m, prom);
  assert.equal(dia.estado, 'ok');
  assert.equal(dia.kml, 2);
  assert.equal(dia.bajo, true);
  assert.equal(E.deJornada([todas[1]], m, prom).bajo, false);
  // dos cargas el mismo día: km y litros se suman (no se promedian los km/l)
  const dos = E.deJornada([todas[1], todas[2]], m, prom);
  assert.equal(dos.kml, 10);
  assert.equal(dos.cargas, 2);
  assert.equal(dos.parcial, false);
});

test('jornada sin carga, con cargas sin dato o con una carga válida y otra no', () => {
  assert.equal(E.deJornada([], {}, null).estado, 'sin_carga');
  const m = E.porCarga([carga(1, '2026-10-01', 1000, 50), carga(2, '2026-10-02', null, 30)]);
  const sin = E.deJornada([carga(2, '2026-10-02', null, 30)], m, null);
  assert.equal(sin.estado, 'sin_dato');
  assert.equal(sin.razon, 'sin_odometro');
  assert.match(sin.mensaje, /odómetro/);
  const m2 = E.porCarga([carga(1, '2026-10-01', 1000, 50), carga(2, '2026-10-02', 1300, 30), carga(3, '2026-10-02', null, 10)]);
  const parcial = E.deJornada([carga(2, '2026-10-02', 1300, 30), carga(3, '2026-10-02', null, 10)], m2, null);
  assert.equal(parcial.estado, 'ok');
  assert.equal(parcial.parcial, true);
  assert.equal(parcial.validas, 1);
});

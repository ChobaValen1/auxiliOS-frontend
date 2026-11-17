const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../operator-intake-match-v1.js');

test('N.º de servicio: el comienzo anotado por el chofer cuenta como coincidencia', () => {
  assert.equal(m.matchNumber('4332221', '4332221-1'), 'partial');
  assert.equal(m.matchNumber('4332221-1', '4332221'), 'partial');
  assert.equal(m.matchNumber(' 4332221-1 ', '4332221-1'), 'exact');
  assert.equal(m.matchNumber('433222', '4332221'), null, 'no corta un número a la mitad');
  assert.equal(m.matchNumber('4409921-2', '4416411'), null);
  assert.equal(m.matchNumber('', '4332221'), null);
  assert.equal(m.matchNumber('123', '123-4'), null, 'muy corto para fiarse');
});

test('patente: ignora espacios y guiones y tolera un error de tipeo', () => {
  assert.equal(m.matchPlate('agx xxv', 'AGX-XXV'), 'exact');
  assert.equal(m.matchPlate('AGXXXV', 'AGXXXVU'), 'partial');
  assert.equal(m.matchPlate('DPA186', 'AGXXXVU'), null);
});

test('DNI: sin puntos es exacto y el CUIT contiene al DNI', () => {
  assert.equal(m.matchDocument('30.123.456', '30123456'), 'exact');
  assert.equal(m.matchDocument('30123456', '20-30123456-3'), 'partial');
  assert.equal(m.matchDocument('30123457', '30123456'), 'partial');
  assert.equal(m.matchDocument('1234', '1234'), null);
});

test('origen y destino: una localidad dentro de la dirección completa coincide, pero tienen que coincidir los dos', () => {
  const full = 'Coronel Francisco Uzal 3661, B1636DQK Olivos, Provincia de Buenos Aires';
  assert.equal(m.matchPlace('Olivos', full), 'partial');
  assert.equal(m.matchPlace('Abasto, Provincia de Buenos Aires', 'Abasto'), 'exact');
  assert.equal(m.matchPlace('Claypole', 'Av. 44 2017, B1908FMF San Carlos, Provincia de Buenos Aires'), null);
  assert.equal(m.matchRoute('Olivos', 'San Carlos', full, 'Av. 44 2017, B1908FMF San Carlos'), 'partial');
  assert.equal(m.matchRoute('Olivos', 'Claypole', full, 'Av. 44 2017, B1908FMF San Carlos'), null);
});

test('se recomienda asociar sólo con 2 o más coincidencias', () => {
  const intake = { service_code: '4332221', vehicle_plate: 'AGXXXVU', customer_document: '30.123.456', origin: 'Olivos', destination: 'San Carlos' };
  const service = { service_order_number: '4332221-1', vehicle_plate: 'AGXXXVU', customer_document: '30123456' };
  const strong = m.score(intake, service);
  assert.equal(strong.recommended, true);
  assert.deepEqual(strong.matches.map(x => x.key), ['number', 'plate', 'document']);
  assert.equal(m.describe(strong.matches), 'N.º de servicio, patente y DNI del cliente');

  const one = m.score(intake, { service_order_number: '4332221-1', vehicle_plate: 'OTRA123' });
  assert.equal(one.score, 1);
  assert.equal(one.recommended, false);

  // El caso de la captura: nada coincide, no se recomienda.
  const none = m.score({ service_code: '4416411', vehicle_plate: 'DPA186', origin: 'Abasto', destination: 'Claypole' },
    { service_order_number: '4409921-2', vehicle_plate: 'AGXXXVU', origin_formatted_address: 'Coronel Francisco Uzal 3661, B1636DQK Olivos, Provincia de Buenos Aires', destination_formatted_address: 'Av. 44 2017, B1908FMF San Carlos, Provincia de Buenos Aires' });
  assert.equal(none.score, 0);
  assert.equal(none.recommended, false);
});

test('rank: primero los que más coinciden y los empates conservan el orden', () => {
  const intake = { service_code: '77777', vehicle_plate: 'AAA111' };
  const list = [{ service_id: 'a' }, { service_id: 'b', service_order_number: '77777', vehicle_plate: 'AAA111' }, { service_id: 'c', vehicle_plate: 'AAA111' }, { service_id: 'd' }];
  assert.deepEqual(m.rank(intake, list).map(r => r.service.service_id), ['b', 'c', 'a', 'd']);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const BD = require('../billing-breakdown-v1.js');

const quote = {
  currency: 'ARS', toll_billing_mode: 'with_service', toll_total: 3200, surcharge_total: 5000, copay_total: 0,
  components: [
    { service_name: 'Bajada de bandera', quantity: 1, unit_price: 20000, subtotal: 20000, pricing_unit: 'fixed' },
    { service_name: 'Km excedente', quantity: 44, unit_price: 700, subtotal: 30800, pricing_unit: 'km' }
  ],
  surcharges: [{ rule_type: 'holiday', calculation_mode: 'percentage', configured_value: 10, eligible_base: 50800, amount: 5000 }],
  current_company_amount: 59000
};

test('el desglose suma exactamente el total que se factura', () => {
  const d = BD.filas(quote);
  const suma = d.filas.reduce((t, f) => t + f.importe, 0);
  assert.equal(Math.round(suma * 100) / 100, 59000);
  assert.equal(d.sinDesglosar, 0);
  assert.deepEqual(d.filas.map(f => f.tipo), ['concepto', 'concepto', 'recargo', 'peaje']);
  assert.match(d.filas[2].etiqueta, /feriado/);
  assert.match(d.filas[2].detalle, /10 % sobre/);
});

test('el copago se resta y los peajes por separado no entran en la suma', () => {
  const d = BD.filas({ ...quote, toll_billing_mode: 'separate', copay_total: 1000, current_company_amount: 54800 });
  assert.ok(d.filas.some(f => f.tipo === 'copago' && f.importe === -1000));
  assert.ok(d.filas.some(f => f.tipo === 'peaje-aparte'));
  assert.equal(d.sinDesglosar, 0);
});

test('lo que la cotización no explica se muestra como diferencia, no se esconde', () => {
  const d = BD.filas({ ...quote, current_company_amount: 60000 });
  assert.equal(d.sinDesglosar, 1000);
  assert.equal(d.filas[d.filas.length - 1].tipo, 'ajuste');
  assert.match(BD.tabla({ ...quote, current_company_amount: 60000 }), /Diferencia sin desglosar/);
});

test('la tabla escapa el texto y usa el total pedido para una línea congelada', () => {
  const html = BD.tabla({ ...quote, components: [{ service_name: '<b>x</b>', quantity: 1, unit_price: 1, subtotal: 1 }], surcharges: [], toll_total: 0, surcharge_total: 0 }, { total: 1, totalLabel: 'Importe congelado' });
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.match(html, /Importe congelado/);
});

test('kilometros usa la cotización y, si falta, lo estimado del servicio', () => {
  assert.deepEqual(BD.kilometros({ asphalt_km: 30, gravel_km: 10, covered_radius_km: 20, billable_distance_km: 20 }, {}),
    { total: 40, asfalto: 30, ripio: 10, radio: 20, facturable: 20 });
  const k = BD.kilometros({}, { estimated_asphalt_km: 5, estimated_distance_km: 5 });
  assert.equal(k.asfalto, 5);
  assert.equal(k.radio, null);
});

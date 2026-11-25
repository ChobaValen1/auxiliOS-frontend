const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

// Servicio enganchado: los candidatos son todos los servicios de la misma prestadora del mismo día.
const user = '10000000-0000-4000-8000-000000000001';
const sos = '20000000-0000-4000-8000-000000000001', ike = '20000000-0000-4000-8000-000000000002';
const base = '30000000-0000-4000-8000-000000000001';
const S = n => `40000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
let db;
const one = async (sql, p = []) => Object.values((await db.query(sql, p)).rows[0])[0];
const list = (at, id = null) => one("select public.list_operator_service_chain_candidates_v1($1,$2,-34.88,-58.02,$3) r", [sos, at, id]);

before(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync('test/fixtures/service-chain-schema.sql', 'utf8'));
  await db.exec(fs.readFileSync('migrations/20261112160000_servicios_enganchados_v1.sql', 'utf8'));
  await db.exec(fs.readFileSync('migrations/20261125120000_enganche_servicios_del_dia_v1.sql', 'utf8'));
});
after(async () => db?.close());
beforeEach(async () => {
  await db.exec('truncate operator_services, operator_service_events, company_billing_settings, billing_bases');
  await db.query("insert into billing_bases values($1,'Base La Plata',-34.92,-57.95)", [base]);
  await db.query("insert into company_billing_settings(company_id,route_mode) values($1,'base_origin_destination_base'),($2,'base_origin_destination_base')", [sos, ike]);
  // 12 servicios de SOS el 12/11 (00:30 a 23:30), uno de IKE el mismo día, uno de SOS el 11/11 a las 23:00 y otro el 13/11 a las 00:30.
  const rows = [];
  for (let i = 1; i <= 12; i++) rows.push([i, sos, `2026-11-12T${String(i * 2 - 1).padStart(2, '0')}:30:00-03:00`]);
  rows.push([13, ike, '2026-11-12T10:00:00-03:00'], [14, sos, '2026-11-11T23:00:00-03:00'], [15, sos, '2026-11-13T00:30:00-03:00']);
  for (const [n, c, at] of rows)
    await db.query(`insert into operator_services(service_id,company_id,service_number,service_order_number,scheduled_for,origin_lat,origin_lng,destination_lat,destination_lng,billing_base_id,estimated_asphalt_km,estimated_gravel_km,estimated_distance_km,status)
      values($1,$2,$3,$4,$5,-34.92,-57.95,-34.88,-58.02,$6,60,0,60,'completed')`, [S(n), c, `SRV-${n}`, `ORD-${n}`, at, base]);
  await db.query("select set_config('test.uid',$1,false), set_config('test.role','operador',false)", [user]);
});

test('trae todos los servicios del día de la misma prestadora, también los de más tarde y más de 10', async () => {
  const ids = (await list('2026-11-12T08:00:00-03:00')).map(x => x.service_id).sort();
  assert.deepEqual(ids, Array.from({ length: 12 }, (_, i) => S(i + 1)).sort());
});

test('no trae el día anterior, el siguiente, otra prestadora ni el mismo servicio', async () => {
  const ids = (await list('2026-11-12T23:30:00-03:00', S(12))).map(x => x.service_id);
  for (const n of [12, 13, 14, 15]) assert.ok(!ids.includes(S(n)), `SRV-${n} no aparece`);
  assert.equal(ids.length, 11);
});

test('el que ya tiene otro enganchado viene marcado; el que viene de éste no aparece', async () => {
  await one('select public.set_operator_service_chain_v1($1,$2,null,null)', [S(3), S(2)]); // SRV-3 sigue a SRV-2
  const fromNew = await list('2026-11-12T12:00:00-03:00');
  assert.equal(fromNew.find(x => x.service_id === S(2)).taken, true, 'SRV-2 ya tiene a SRV-3');
  assert.equal(fromNew.find(x => x.service_id === S(1)).taken, false);
  const fromThree = await list('2026-11-12T05:30:00-03:00', S(3));
  assert.equal(fromThree.find(x => x.service_id === S(2)).taken, false, 'para SRV-3, SRV-2 es su propio anterior');
  const fromTwo = await list('2026-11-12T03:30:00-03:00', S(2));
  assert.ok(!fromTwo.some(x => x.service_id === S(3)), 'SRV-3 viene de SRV-2: armaría un círculo');
});

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

const MIGRATION = 'migrations/20261112160000_servicios_enganchados_v1.sql';
const user = '10000000-0000-4000-8000-000000000001';
const sos = '20000000-0000-4000-8000-000000000001', ike = '20000000-0000-4000-8000-000000000002', lomas = '20000000-0000-4000-8000-000000000003';
const base = '30000000-0000-4000-8000-000000000001';
const S = n => `40000000-0000-4000-8000-00000000000${n}`;
let db;
const one = async (sql, p = []) => Object.values((await db.query(sql, p)).rows[0])[0];
const row = async id => (await db.query('select * from operator_services where service_id=$1', [id])).rows[0];
const link = (b, a, prevKm = null, relKm = null) => one('select public.set_operator_service_chain_v1($1,$2,$3,$4) r', [b, a, prevKm && JSON.stringify(prevKm), relKm && JSON.stringify(relKm)]);
async function as(role) { await db.query("select set_config('test.uid',$1,false), set_config('test.role',$2,false)", [user, role]); }

before(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync('test/fixtures/service-chain-schema.sql', 'utf8'));
  await db.exec(fs.readFileSync(MIGRATION, 'utf8'));
});
after(async () => db?.close());
beforeEach(async () => {
  await db.exec('truncate operator_services, operator_service_events, company_billing_settings, billing_bases');
  await db.query("insert into billing_bases values($1,'Base La Plata',-34.92,-57.95)", [base]);
  await db.query("insert into company_billing_settings(company_id,route_mode) values($1,'base_origin_destination_base'),($2,'base_origin_destination_base'),($3,'origin_destination')", [sos, ike, lomas]);
  // A: La Plata → Gonnet (10:00) · B: Gonnet → Remedios de Escalada (11:30) · C: otro de la misma prestadora · D: otra prestadora · E: prestadora Origen → Destino
  const svc = [[1, sos, '10:00', -34.92, -57.95, -34.88, -58.02], [2, sos, '11:30', -34.88, -58.02, -34.73, -58.39], [3, sos, '12:30', -34.73, -58.39, -34.70, -58.40],
    [4, ike, '11:00', -34.90, -58.00, -34.88, -58.02], [5, lomas, '11:00', -34.90, -58.00, -34.88, -58.03]];
  for (const [n, c, t, ol, og, dl, dg] of svc)
    await db.query(`insert into operator_services(service_id,company_id,service_number,service_order_number,scheduled_for,origin_lat,origin_lng,destination_lat,destination_lng,billing_base_id,estimated_asphalt_km,estimated_gravel_km,estimated_distance_km,status)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,60,0,60,'completed')`, [S(n), c, `SRV-${n}`, `ORD-${n}`, `2026-11-12T${t}:00-03:00`, ol, og, dl, dg, base]);
  await as('operador');
});

test('recorrido según el lugar en la cadena', async () => {
  const mode = (p, n) => one('select app_private.chain_route_mode_v1($1,$2,$3)', ['base_origin_destination_base', p, n]);
  assert.equal(await mode(false, false), 'base_origin_destination_base');
  assert.equal(await mode(false, true), 'base_origin_destination');
  assert.equal(await mode(true, true), 'origin_destination');
  assert.equal(await mode(true, false), 'origin_destination_base');
  assert.equal(await one('select app_private.chain_route_mode_v1($1,true,true)', ['origin_destination']), 'origin_destination');
});

test('candidatos: misma prestadora, primero el que termina más cerca, sin otras prestadoras', async () => {
  const list = await one("select public.list_operator_service_chain_candidates_v1($1,'2026-11-12T11:30:00-03:00',-34.88,-58.02,$2)", [sos, S(2)]);
  assert.equal(list[0].service_id, S(1), 'A termina en Gonnet, donde empieza B');
  assert.equal(list[0].gap_km, 0);
  assert.ok(!list.some(x => x.service_id === S(4)), 'otra prestadora no aparece');
  assert.ok(!list.some(x => x.service_id === S(2)), 'el mismo servicio no aparece');
  assert.deepEqual(await one("select public.list_operator_service_chain_candidates_v1($1,'2026-11-12T11:00:00-03:00',-34.9,-58,null)", [lomas]), [], 'prestadora Origen → Destino no engancha');
});

test('enganchar guarda el enlace y los km sin vuelta del anterior', async () => {
  const r = await link(S(2), S(1), { distance_km: 41.3, distance_meters: 41300, duration_seconds: 3000, legs: [{ index: 0 }, { index: 1 }] });
  assert.equal(r.changed, true);
  assert.equal((await row(S(2))).chained_to_service_id, S(1));
  const a = await row(S(1));
  assert.equal(Number(a.estimated_asphalt_km), 41.3);
  assert.equal(Number(a.estimated_distance_km), 41.3);
  assert.equal(a.route_distance_meters, 41300);
  const chain = await one('select public.get_operator_service_chain_v1($1)', [S(2)]);
  assert.equal(chain.previous.service_id, S(1));
  assert.equal(chain.service.route_mode, 'origin_destination_base');
  assert.equal(chain.previous.route_mode, 'base_origin_destination');
  const ev = (await db.query("select event_type from operator_service_events order by event_id")).rows.map(x => x.event_type);
  assert.deepEqual(ev, ['chain_linked', 'chain_next_linked']);
});

test('cadena de tres: el del medio va Origen → Destino', async () => {
  await link(S(2), S(1)); await link(S(3), S(2));
  const mid = await one('select public.get_operator_service_chain_v1($1)', [S(2)]);
  assert.equal(mid.service.route_mode, 'origin_destination');
  assert.equal(mid.next.service_id, S(3));
});

test('desenganchar restaura los km del que queda libre', async () => {
  await link(S(2), S(1), { distance_km: 41.3 });
  await link(S(2), null, null, { distance_km: 82.6 });
  assert.equal((await row(S(2))).chained_to_service_id, null);
  assert.equal(Number((await row(S(1))).estimated_distance_km), 82.6);
});

test('el ripio cargado a mano se conserva al recalcular', async () => {
  await db.query('update operator_services set estimated_gravel_km=8, estimated_asphalt_km=52 where service_id=$1', [S(1)]);
  await link(S(2), S(1), { distance_km: 41.3 });
  const a = await row(S(1));
  assert.equal(Number(a.estimated_gravel_km), 8);
  assert.equal(Number(a.estimated_asphalt_km), 33.3);
});

test('rechaza lo que no corresponde', async () => {
  await assert.rejects(link(S(4), S(1)), /misma prestadora/);
  await assert.rejects(link(S(1), S(1)), /círculo|chain_not_self/);
  await link(S(2), S(1));
  await assert.rejects(link(S(3), S(1)), /ya tiene otro servicio enganchado/);
  await assert.rejects(link(S(1), S(2)), /círculo/);
  await db.query("update operator_services set billing_status='invoiced' where service_id=$1", [S(3)]);
  await assert.rejects(link(S(3), S(2)), /ya está facturado/);
  await db.query("update operator_services set billing_status='pending' where service_id=$1", [S(3)]);
  await db.query("update operator_services set billing_status='invoiced' where service_id=$1", [S(1)]);
  await assert.rejects(link(S(2), null), /ya está facturado: no se puede soltar/);
  await as('chofer');
  await assert.rejects(link(S(3), S(2)), /Sin permiso/);
});

test('un servicio enganchado no se anula sin desenganchar', async () => {
  await link(S(2), S(1));
  await assert.rejects(db.query("update operator_services set status='cancelled' where service_id=$1", [S(1)]), /desenganchalo antes de anularlo/);
  await assert.rejects(db.query("update operator_services set status='cancelled' where service_id=$1", [S(2)]), /desenganchalo antes de anularlo/);
  await db.query("update operator_services set status='cancelled' where service_id=$1", [S(3)]);
});

test('modos de recorrido para el Excel: sólo los enganchados', async () => {
  await link(S(2), S(1));
  await as('facturacion');
  const modes = await one('select public.list_operator_service_chain_route_modes_v1($1::uuid[])', [[S(1), S(2), S(3)]]);
  assert.deepEqual(modes, { [S(1)]: 'base_origin_destination', [S(2)]: 'origin_destination_base' });
});

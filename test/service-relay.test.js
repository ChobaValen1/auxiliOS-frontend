const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

const MIGRATION = 'migrations/20261113120000_servicio_con_relevo_v1.sql';
// v2: el remito lo hace el 1º chofer y el 2º marca la entrega en destino.
const MIGRATION_V2 = 'migrations/20261113200000_relevo_remito_primer_chofer_v2.sql';
const U = n => `10000000-0000-4000-8000-00000000000${n}`;
const op = U(1), d1 = U(2), d2 = U(3), other = U(4), sup = U(5);
const S = n => `40000000-0000-4000-8000-00000000000${n}`;
let db;

async function as(role, uid) {
  await db.query("select set_config('test.uid',$1,false), set_config('test.role',$2,false)", [uid, role]);
}
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const rpc = async (sql, params = []) => Object.values(await one(sql, params))[0];
const setRelay = (service = S(1), { address = 'Estación de servicio, Gonnet', lat = -34.87, lng = -58.02, driver = d2 } = {}) =>
  rpc('select public.set_operator_service_relay_v1($1,$2,$3,$4,$5,$6) r', [service, address, lat, lng, 'place-b', driver]);
// Jornada activa de un chofer con un móvil (de ahí sale el móvil que recibe el vehículo).
const jornada = (driver, truck) => db.query('insert into daily_logs(driver_id, truck_id) values ($1, $2)', [driver, truck]);
const handover = (service = S(1)) => rpc('select public.mark_operator_service_relay_handover_v1($1) r', [service]);
// El 1º chofer hace el remito con el cliente al retirar el vehículo (queda en curso, con viaje y remito).
const conRemito = async (service = S(1), driver = d1, id = 900, firmado = true) => {
  await db.query('insert into remitos values ($1, $2, $3, $4, now())', [id, service, driver, firmado ? 'firmado' : 'pendiente']);
  await db.query("update operator_services set trip_id=$2, remito_id=$2, status='at_origin' where service_id=$1", [service, id]);
};
const delivered = (service = S(1)) => rpc('select public.mark_operator_service_relay_delivered_v1($1) r', [service]);
const completed = async () => (await db.query('select service_id, driver_id, remito_id from app_private.completed_driver_services_v2() order by service_id, driver_id')).rows;

before(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync('test/fixtures/service-relay-schema.sql', 'utf8'));
  await db.exec(fs.readFileSync(MIGRATION, 'utf8'));
  await db.exec(fs.readFileSync(MIGRATION_V2, 'utf8'));
});
after(async () => db?.close());
beforeEach(async () => {
  await db.exec('truncate operator_service_relays, operator_service_assignments, operator_service_events, remitos, daily_logs, operator_services, trucks, users, roles cascade');
  await db.exec("insert into roles values (1,'chofer'),(2,'operador'),(3,'administracion')");
  for (const [id, name, role] of [[op, 'Operador', 2], [d1, 'Martín R.', 1], [d2, 'Lucas P.', 1], [other, 'Diego F.', 1], [sup, 'Supervisión', 2]]) {
    await db.query('insert into users(user_id, full_name, role_id) values ($1,$2,$3)', [id, name, role]);
  }
  await db.exec("insert into trucks values (12,'AB123CD','12','active'),(7,'AC456DE','7','active'),(3,'AD789FG','3','active'),(9,'AE000AA','9','inactive')");
  await db.query(`insert into operator_services(service_id, service_number, service_order_number, status, assigned_driver_id, assigned_truck_id,
    vehicle_plate, vehicle_make_model, destination, destination_lat, destination_lng) values ($1,'SRV-1','ORD-1','assigned',$2,12,'AA111BB','Fiat Cronos','Remedios de Escalada',-34.72,-58.4)`, [S(1), d1]);
  await db.query("insert into operator_services(service_id, service_number, status, assigned_driver_id, assigned_truck_id) values ($1,'SRV-2','assigned',$2,3)", [S(2), other]);
  await as('operador', op);
});

test('Operaciones carga el relevo con el punto B ubicado y el chofer y móvil que reciben', async () => {
  const r = await setRelay();
  assert.equal(r.to_driver_name, 'Lucas P.');
  assert.equal(r.from_driver_name, 'Martín R.', 'antes de entregar, el 1º es el chofer asignado');
  assert.equal(r.handed_over, false);
  assert.equal(r.to_has_active_jornada, false, 'sin jornada todavía: no hay móvil');
  assert.equal(r.to_truck_id, null);
  assert.equal(Number(r.exchange_lat), -34.87);
  assert.equal((await one("select count(*)::int n from operator_service_events where event_type='relay_set'")).n, 1);
});

test('rechaza lo que no corresponde cargar', async () => {
  await assert.rejects(setRelay(S(1), { driver: d1 }), /distinto del que lo retira/);
  await assert.rejects(setRelay(S(1), { driver: sup }), /Chofer inválido o inactivo/);
  await assert.rejects(setRelay(S(1), { driver: null }), /Seleccioná el chofer/);
  await assert.rejects(setRelay(S(1), { lat: null, lng: null }), /buscador/);
  await assert.rejects(setRelay(S(1), { address: '  ' }), /dirección/);
  await jornada(d2, 12); // la jornada del 2º chofer usa el mismo móvil que el 1º
  await assert.rejects(setRelay(S(1)), /mismo que el del primer tramo/);
  await as('chofer', d1);
  await assert.rejects(setRelay(), /Sin permiso/);
  await as('operador', op);
  await db.query("update operator_services set status='completed', completed_at=now() where service_id=$1", [S(1)]);
  await assert.rejects(setRelay(), /ya está cerrado/);
});

test('el móvil que recibe es el de la jornada activa del 2º chofer', async () => {
  await jornada(d2, 7);
  const r = await setRelay();
  assert.equal(r.to_has_active_jornada, true);
  assert.equal(r.to_truck_id, 7);
  assert.equal(r.to_truck_label, '7');
  const info = await rpc('select public.get_relay_receiver_truck_v1($1) r', [d2]);
  assert.deepEqual({ has: info.has_active_jornada, truck: info.truck_id, plate: info.truck_plate }, { has: true, truck: 7, plate: 'AC456DE' });
  assert.match(String(info.since), /^\d{2}:\d{2}:\d{2}/, 'la hora de inicio de la jornada es una hora (time), como en producción');
  assert.equal((await rpc('select public.get_relay_receiver_truck_v1($1) r', [other])).has_active_jornada, false);
  await as('chofer', d1);
  await assert.rejects(rpc('select public.get_relay_receiver_truck_v1($1) r', [d2]), /Sin permiso/);
});

test('el 2º chofer ve el servicio antes de que se lo entreguen, con el punto B y el vehículo', async () => {
  await setRelay();
  await as('chofer', d2);
  const st = await rpc('select public.get_driver_relay_state_v1() r');
  assert.equal(st.incoming.length, 1);
  assert.equal(st.outgoing.length, 0);
  assert.equal(st.received.length, 0);
  const x = st.incoming[0];
  assert.equal(x.label, 'ORD-1');
  assert.equal(x.exchange_address, 'Estación de servicio, Gonnet');
  assert.equal(Number(x.exchange_lat), -34.87);
  assert.equal(x.vehicle_plate, 'AA111BB');
  assert.equal(x.from_driver_name, 'Martín R.');
  assert.equal(Number(x.destination_lat), -34.72);
  assert.equal(x.to_has_active_jornada, false, 'la app le avisa que inicie su jornada');
  await as('chofer', other);
  const none = await rpc('select public.get_driver_relay_state_v1() r');
  assert.deepEqual([none.incoming.length, none.outgoing.length, none.received.length], [0, 0, 0], 'otro chofer no lo ve');
  await as('chofer', d1);
  const mine = await rpc('select public.get_driver_relay_state_v1() r');
  assert.deepEqual([mine.incoming.length, mine.outgoing.length, mine.received.length], [0, 1, 0], 'el 1º lo ve para entregar');
  assert.equal(mine.outgoing[0].to_driver_name, 'Lucas P.');
  await as('operador', op);
  await assert.rejects(rpc('select public.get_driver_relay_state_v1() r'), /Sólo choferes/);
});

test('después de entregar, el servicio le queda al 2º como recibido y el 1º ya no lo ve', async () => {
  await jornada(d2, 7);
  await setRelay();
  await as('chofer', d2);
  assert.equal((await rpc('select public.get_driver_relay_state_v1() r')).incoming[0].to_has_active_jornada, true);
  await conRemito();
  await as('chofer', d1);
  await handover();
  const mine = await rpc('select public.get_driver_relay_state_v1() r');
  assert.deepEqual([mine.incoming.length, mine.outgoing.length, mine.received.length], [0, 0, 0]);
  await as('chofer', d2);
  const st = await rpc('select public.get_driver_relay_state_v1() r');
  assert.deepEqual([st.incoming.length, st.outgoing.length, st.received.length], [0, 0, 1]);
  assert.equal(st.received[0].from_driver_name, 'Martín R.');
  assert.equal(st.received[0].handed_over, true);
  assert.equal(st.received[0].to_truck_id, 7);
  assert.equal(st.received[0].has_remito, true, 'el remito ya lo hizo el 1º');
  assert.equal(st.received[0].delivered, false);
});

test('el 1º chofer hace el remito antes de entregar; sin remito no puede entregar (Operaciones sí)', async () => {
  await jornada(d2, 7);
  await setRelay();
  await as('chofer', d1);
  await assert.rejects(handover(), /RELEVO_SIN_REMITO: primero hacé el remito/);
  assert.equal((await one('select assigned_driver_id from operator_services where service_id=$1', [S(1)])).assigned_driver_id, d1, 'no se movió nada');
  await conRemito(); // ya no hay bloqueo: el 1º crea viaje y remito
  assert.deepEqual({ ...(await one('select trip_id, remito_id from operator_services where service_id=$1', [S(1)])) }, { trip_id: 900, remito_id: 900 });
  assert.equal((await handover()).has_remito, true);
  // Operaciones puede marcar la entrega aunque el chofer no haya hecho el remito.
  await as('operador', op);
  await db.query("insert into operator_services(service_id, service_number, status, assigned_driver_id, assigned_truck_id) values ($1,'SRV-3','assigned',$2,12)", [S(3), other]);
  await setRelay(S(3));
  assert.equal((await handover(S(3))).handover_source, 'operator');
});

test('la entrega pasa el servicio al 2º chofer, con el móvil de su jornada activa, y deja al 1º en el historial', async () => {
  await jornada(d2, 7);
  await setRelay();
  await conRemito();
  await as('chofer', d1);
  const r = await handover();
  assert.equal(r.handed_over, true);
  assert.equal(r.handover_source, 'driver');
  const s = await one('select assigned_driver_id, assigned_truck_id, status, remito_id from operator_services where service_id=$1', [S(1)]);
  assert.deepEqual({ ...s }, { assigned_driver_id: d2, assigned_truck_id: 7, status: 'at_origin', remito_id: 900 }, 'sigue en curso con el remito del 1º');
  const hist = (await db.query('select driver_id, truck_id, status, release_reason_code from operator_service_assignments where service_id=$1 order by assignment_sequence', [S(1)])).rows;
  assert.equal(hist.length, 2);
  assert.deepEqual({ ...hist[0] }, { driver_id: d1, truck_id: 12, status: 'released', release_reason_code: 'relay_handover' });
  assert.deepEqual({ ...hist[1] }, { driver_id: d2, truck_id: 7, status: 'active', release_reason_code: null });
  await assert.rejects(handover(), /no está asignado a este chofer/, 'el 1º ya no tiene el servicio');
  // El 2º deja de verlo como pendiente de recibir.
  await as('chofer', d2);
  assert.equal((await rpc('select public.get_driver_relay_state_v1() r')).incoming.length, 0);
});

test('la entrega necesita que el 2º chofer haya iniciado su jornada con un móvil', async () => {
  await setRelay();
  await conRemito();
  await as('chofer', d1);
  await assert.rejects(handover(), /RELEVO_SIN_JORNADA: Lucas P\. todavía no inició su jornada/);
  assert.equal((await one('select assigned_driver_id from operator_services where service_id=$1', [S(1)])).assigned_driver_id, d1, 'no se movió nada');
  await jornada(d2, 12);
  await assert.rejects(handover(), /mismo que el del primer tramo/);
  // Cambia de móvil: vale la jornada abierta más reciente.
  await db.query("update daily_logs set status='closed', hora_fin=now() where driver_id=$1", [d2]);
  await jornada(d2, 3);
  const r = await handover();
  assert.equal(r.to_truck_id, 3);
  assert.equal((await one('select assigned_truck_id from operator_services where service_id=$1', [S(1)])).assigned_truck_id, 3);
});

test('quién puede entregar y cuándo', async () => {
  await assert.rejects(handover(S(2)), /no tiene relevo/);
  await jornada(d2, 7);
  await setRelay();
  await as('chofer', other);
  await assert.rejects(handover(), /no está asignado a este chofer/);
  await as('supervision', sup);
  await assert.rejects(handover(), /Sin permiso/);
  await as('operador', op);
  await db.query('update operator_services set remito_id=null, trip_id=null where service_id=$1', [S(1)]);
  await db.query("update operator_services set status='pending' where service_id=$1", [S(1)]);
  await assert.rejects(handover(), /no está en curso/);
  await db.query("update operator_services set status='at_origin' where service_id=$1", [S(1)]);
  const r = await handover();
  assert.equal(r.handover_source, 'operator', 'Operaciones puede marcarla si el chofer no puede');
  await assert.rejects(handover(), /ya se entregó/);
  await assert.rejects(setRelay(), /ya se entregó/);
  await assert.rejects(rpc('select public.remove_operator_service_relay_v1($1) r', [S(1)]), /ya se entregó/);
});

test('el 2º chofer marca la entrega en destino; el servicio sigue en curso hasta que lo finalice Operaciones', async () => {
  await jornada(d2, 7);
  await setRelay();
  await conRemito();
  await as('chofer', d2);
  await assert.rejects(delivered(), /RELEVO_SIN_RECIBIR/, 'no puede antes de recibirlo');
  await as('chofer', d1);
  await handover();
  await assert.rejects(delivered(), /no está asignado a este chofer/, 'el 1º no marca el destino');
  await as('chofer', other);
  await assert.rejects(delivered(), /no está asignado a este chofer/);
  await as('supervision', sup);
  await assert.rejects(delivered(), /Sin permiso/);
  await as('chofer', d2);
  const r = await delivered();
  assert.equal(r.delivered, true);
  assert.equal(r.delivery_source, 'driver');
  assert.equal((await one('select status from operator_services where service_id=$1', [S(1)])).status, 'at_origin');
  assert.equal((await one("select count(*)::int n from operator_service_events where event_type='relay_delivered'")).n, 1);
  await assert.rejects(delivered(), /ya está marcada/);
  const st = await rpc('select public.get_driver_relay_state_v1() r');
  assert.equal(st.received[0].delivered, true, 'sigue en su lista, marcado como entregado');
  // Operaciones también puede marcarla.
  await as('operador', op);
  await db.query('update operator_service_relays set delivered_at=null, delivered_by=null, delivery_source=null');
  assert.equal((await delivered()).delivery_source, 'operator');
});

test('sueldos: si el 2º hizo el remito (el 1º no pudo), igual cuentan los dos', async () => {
  await jornada(d2, 7);
  await setRelay();
  await as('operador', op);
  await handover();
  await conRemito(S(1), d2, 901);
  await db.query("update operator_services set status='completed', completed_at=now(), assigned_driver_id=null, assigned_truck_id=null where service_id=$1", [S(1)]);
  assert.deepEqual((await completed()).filter(r => r.service_id === S(1)).map(r => r.driver_id).sort(), [d1, d2].sort());
});

test('el relevo se puede quitar mientras no se entregó', async () => {
  await setRelay();
  assert.equal((await rpc('select public.remove_operator_service_relay_v1($1) r', [S(1)])).removed, true);
  assert.equal(await rpc('select public.get_operator_service_relay_v1($1) r', [S(1)]), null);
  await db.query('update operator_services set remito_id=5 where service_id=$1', [S(1)]);
});

test('sueldos: el servicio completado cuenta para los dos choferes; los demás no cambian', async () => {
  await jornada(d2, 7);
  await setRelay();
  await conRemito();
  await as('chofer', d1);
  await handover();
  await db.query("update operator_services set status='completed', completed_at=now(), assigned_driver_id=null, assigned_truck_id=null where service_id=$1", [S(1)]);
  await db.query("update operator_services set status='completed', completed_at=now() where service_id=$1", [S(2)]);
  const rows = await completed();
  const relay = rows.filter(r => r.service_id === S(1)).map(r => r.driver_id).sort();
  assert.deepEqual(relay, [d1, d2].sort(), 'los dos cuentan el servicio');
  assert.equal(rows.filter(r => r.service_id === S(1) && r.remito_id === 900).length, 2, 'un solo remito, compartido');
  assert.deepEqual(rows.filter(r => r.service_id === S(2)).map(r => r.driver_id), [other], 'sin relevo: uno solo, como siempre');
  assert.equal(rows.length, 3);
});

test('sueldos: un relevo que no se entregó no suma al 1º chofer', async () => {
  await setRelay();
  await db.query("update operator_services set status='completed', completed_at=now() where service_id=$1", [S(1)]);
  assert.deepEqual((await completed()).filter(r => r.service_id === S(1)).map(r => r.driver_id), [d1]);
});

test('consultas: Operaciones ve todo; un chofer sólo lo suyo', async () => {
  await setRelay();
  const list = await rpc('select public.list_operator_service_relays_v1($1::uuid[]) r', [[S(1), S(2)]]);
  assert.deepEqual(Object.keys(list), [S(1)]);
  await as('supervision', sup);
  assert.equal((await rpc('select public.get_operator_service_relay_v1($1) r', [S(1)])).to_driver_name, 'Lucas P.');
  await as('chofer', d2);
  assert.equal((await rpc('select public.get_operator_service_relay_v1($1) r', [S(1)])).exchange_address, 'Estación de servicio, Gonnet');
  await as('chofer', other);
  await assert.rejects(rpc('select public.get_operator_service_relay_v1($1) r', [S(1)]), /Sin permiso/);
  await assert.rejects(rpc('select public.list_operator_service_relays_v1($1::uuid[]) r', [[S(1)]]), /Sin permiso/);
});

test('permisos y exposición de las funciones', async () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8'), v2 = fs.readFileSync(MIGRATION_V2, 'utf8');
  assert.match(sql, /revoke all on public\.operator_service_relays from public, anon, authenticated;/);
  assert.match(v2, /grant execute on function public\.mark_operator_service_relay_delivered_v1\(uuid\) to authenticated;/);
  assert.match(v2, /revoke all on function public\.mark_operator_service_relay_delivered_v1\(uuid\) from public, anon;/);
  assert.match(v2, /drop trigger if exists operator_services_relay_remito_guard_v1/);
  for (const fn of ['set_operator_service_relay_v1\\(uuid, text, numeric, numeric, text, uuid\\)', 'get_relay_receiver_truck_v1\\(uuid\\)', 'remove_operator_service_relay_v1\\(uuid\\)',
    'get_operator_service_relay_v1\\(uuid\\)', 'list_operator_service_relays_v1\\(uuid\\[\\]\\)', 'get_driver_relay_state_v1\\(\\)', 'mark_operator_service_relay_handover_v1\\(uuid\\)']) {
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn} to authenticated;`));
  }
  assert.match(sql, /revoke all on function app_private\.completed_driver_services_v2\(\) from public,anon,authenticated;/);
});

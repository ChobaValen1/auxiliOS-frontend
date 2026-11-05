const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

const MIGRATION = 'migrations/20261104120000_facturacion_excedentes_prestadora_v1.sql';
const admin = '10000000-0000-4000-8000-000000000001';
const acme = '20000000-0000-4000-8000-000000000001';
const other = '20000000-0000-4000-8000-000000000002';
const battery = '30000000-0000-4000-8000-000000000001';
const waiting = '30000000-0000-4000-8000-000000000002';
const S = n => `40000000-0000-4000-8000-00000000000${n}`;
let db;

async function as(role = 'administracion', uid = admin) {
  await db.query("select set_config('test.uid',$1,false), set_config('test.role',$2,false)", [uid, role]);
}
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const rpc = async (sql, params = []) => Object.values(await one(sql, params))[0];
async function excess(service, { collector = 'provider', source = 'actual', qty = 1, unit = 10000, concept = waiting, method = null } = {}) {
  await db.query(`insert into operator_service_excess_charges(service_id,concept_id,concept_name_snapshot,quantity,unit_amount,payer_agent,collector_agent,customer_payment_method,source)
    values($1,$2,(select name from service_concepts where concept_id=$2),$3,$4,$5,$6,$7,$8)`,
  [service, concept, qty, unit, collector === 'provider' ? 'provider' : 'customer', collector, collector === 'provider' ? null : (method || 'cash'), source]);
}
const invoice = (services, excesses, number, type = 'FA') => rpc(
  "select public.create_operator_invoice_v5_km_v1($1::uuid[],'{}'::uuid[],$2::uuid[],$3,'0004',$4,'2026-11-04',null) r",
  [services, excesses, type, number]);
const extras = async () => rpc('select public.list_operator_billing_extras_v2(null,null,null,null) r');

before(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync('test/fixtures/invoice-excess-schema.sql', 'utf8'));
  await db.exec(fs.readFileSync(MIGRATION, 'utf8'));
});
after(async () => db?.close());
beforeEach(async () => {
  await db.exec(`truncate operator_invoice_excesses, operator_invoice_services, operator_invoice_tolls, operator_invoice_credit_notes,
    operator_invoices, operator_service_events, operator_service_billing_revisions, operator_service_excess_charges,
    operator_service_tolls, operator_services, service_concepts, billing_bases, companies, users cascade`);
  await db.query("insert into users values($1,'Admin')", [admin]);
  await db.query("insert into companies values($1,'Acme Asistencias',null,'company'),($2,'Otra',null,'company')", [acme, other]);
  await db.query("insert into service_concepts values($1,'Venta batería'),($2,'Hora de espera')", [battery, waiting]);
  for (const [n, company] of [[1, acme], [2, acme], [3, acme], [4, other]]) {
    await db.query("insert into operator_services(service_id,company_id,service_number,service_order_number,company_estimated_total) values($1,$2,$3,$4,50000)",
      [S(n), company, `SRV-${n}`, `ORD-${n}`]);
  }
  await as();
});

test('Adicionales no duplica: lo real del remito reemplaza a lo planificado', async () => {
  await excess(S(1), { collector: 'company', source: 'planned', concept: battery, unit: 180000 });
  await excess(S(1), { collector: 'company', source: 'actual', concept: battery, unit: 180000 });
  const rows = (await extras()).filter(r => r.service_id === S(1));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].origin, 'actual');
  assert.equal(rows[0].collector_agent, 'company');
  assert.equal(rows[0].customer_payment_method, 'cash');
  assert.equal(rows[0].invoiceable, false, 'lo que cobra la Empresa no se factura a la Prestadora');
});

test('sin remito real, manda lo planificado', async () => {
  await excess(S(1), { source: 'planned', unit: 7000 });
  const rows = (await extras()).filter(r => r.service_id === S(1));
  assert.deepEqual(rows.map(r => [r.origin, r.collector_agent, Number(r.total_amount), r.invoiceable]), [['planned', 'provider', 7000, true]]);
});

test('la corrección administrativa manda; si paga la Prestadora, cobra la Prestadora', async () => {
  await excess(S(1), { source: 'actual', collector: 'company', unit: 5000 });
  await db.query(`update operator_services set administrative_commercial=$2 where service_id=$1`, [S(1), JSON.stringify({
    excess_charges: [{ concept_id: waiting, concept_name: 'Hora de espera', quantity: 2, unit_amount: 12000, total_amount: 24000, payer_agent: 'provider', currency: 'ARS' }],
    customer_payment: { primary: 'transfer' }
  })]);
  const rows = (await extras()).filter(r => r.service_id === S(1));
  assert.deepEqual(rows.map(r => [r.origin, r.collector_agent, Number(r.total_amount), r.customer_payment_method]), [['administrative', 'provider', 24000, null]]);
});

test('se factura sólo lo que cobra la Prestadora y queda congelado', async () => {
  await excess(S(1), { qty: 2, unit: 15000 });
  await excess(S(1), { collector: 'company', concept: battery, unit: 180000 });
  const inv = await invoice([], [S(1)], '00000001');
  assert.equal(inv.invoice_number, 'Factura A 0004-00000001');
  assert.equal(inv.excess_count, 1);
  assert.equal(Number(inv.excess_total), 30000);
  assert.equal(Number(inv.total_amount), 30000);
  const row = await one('select service_count,toll_count,excess_count,total_amount from operator_invoices where invoice_id=$1', [inv.invoice_id]);
  assert.deepEqual({ ...row, total_amount: Number(row.total_amount) }, { service_count: 0, toll_count: 0, excess_count: 1, total_amount: 30000 });
  const line = await one('select amount,line_count,excess_snapshot from operator_invoice_excesses where invoice_id=$1', [inv.invoice_id]);
  assert.equal(Number(line.amount), 30000);
  assert.equal(line.line_count, 1);
  assert.equal(line.excess_snapshot[0].concept_name, 'Hora de espera');
  const rows = (await extras()).filter(r => r.service_id === S(1));
  assert.equal(rows.find(r => r.collector_agent === 'provider').invoice_number, 'Factura A 0004-00000001');
  assert.equal(rows.find(r => r.collector_agent === 'company').invoice_number, null);
  const ev = await one("select details from operator_service_events where event_type='billing_excess_invoiced'");
  assert.equal(Number(ev.details.amount), 30000);
});

test('servicio y sus excedentes en la misma factura', async () => {
  await excess(S(1), { unit: 8000 });
  const inv = await invoice([S(1)], [S(1)], '00000002');
  assert.equal(inv.service_count, 1);
  assert.equal(inv.excess_count, 1);
  assert.equal(Number(inv.total_amount), 58000);
  const row = await one('select total_amount,excess_count,service_count from operator_invoices where invoice_id=$1', [inv.invoice_id]);
  assert.equal(Number(row.total_amount), 58000);
  assert.equal(row.excess_count, 1);
});

test('rechaza lo que no corresponde facturar', async () => {
  await excess(S(1), { collector: 'company', unit: 9000 });
  await assert.rejects(invoice([], [S(1)], '00000003'), /no tiene excedentes que cobre la Prestadora/);
  await excess(S(2), { unit: 9000 });
  await excess(S(4), { unit: 9000 });
  await assert.rejects(invoice([], [S(2), S(4)], '00000003'), /diferentes prestadoras/);
  await assert.rejects(invoice([], [S(2), S(2)], '00000003'), /excedentes duplicados/);
  await invoice([], [S(2)], '00000003');
  await assert.rejects(invoice([], [S(2)], '00000004'), /ya fueron facturados/);
  await excess(S(3), { unit: 9000 });
  await assert.rejects(invoice([], [S(3)], '00000003'), /Ya existe la Factura A 0004-00000003/);
  await db.query("update operator_services set billing_status='excluded' where service_id=$1", [S(3)]);
  await assert.rejects(invoice([], [S(3)], '00000005'), /ya no están disponibles/);
  await assert.rejects(invoice([], [], '00000005'), /al menos un servicio o peaje/);
  await as('supervision');
  await assert.rejects(invoice([], [S(3)], '00000006'), /Sin permiso para facturar/);
});

test('lo facturado no se puede cambiar sin anular la factura', async () => {
  await excess(S(1), { qty: 2, unit: 15000 });
  await excess(S(1), { collector: 'company', concept: battery, unit: 180000 });
  await invoice([], [S(1)], '00000010');
  await assert.rejects(db.exec(`update operator_service_excess_charges set quantity=3 where service_id='${S(1)}' and collector_agent='provider'`),
    /ya están facturados en Factura A 0004-00000010/);
  // Borrar e insertar lo mismo (como hacen las correcciones) se permite.
  await db.exec(`begin; delete from operator_service_excess_charges where service_id='${S(1)}' and collector_agent='provider';
    insert into operator_service_excess_charges(service_id,concept_id,concept_name_snapshot,quantity,unit_amount,payer_agent,collector_agent,source)
    values('${S(1)}','${waiting}','Hora de espera',2,15000,'provider','provider','actual'); commit;`);
  // Lo que cobra la Empresa no está facturado a la Prestadora: se puede corregir.
  await db.exec(`update operator_service_excess_charges set quantity=2 where service_id='${S(1)}' and collector_agent='company'`);
  await assert.rejects(db.exec(`update operator_services set administrative_commercial='{"excess_charges":[]}' where service_id='${S(1)}'`), /Anulá esa factura/);
  await assert.rejects(db.exec(`update operator_services set status='cancelled' where service_id='${S(1)}'`), /antes de anular el servicio/);
});

test('anular la factura libera los excedentes y los vuelve a dejar disponibles', async () => {
  await excess(S(1), { unit: 15000 });
  const inv = await invoice([], [S(1)], '00000020');
  const detail = await rpc('select public.get_operator_invoice_detail_v2($1) r', [inv.invoice_id]);
  assert.equal(detail.invoice.excess_count, 1);
  assert.equal(detail.excess_lines.length, 1);
  assert.equal(Number(detail.excess_lines[0].amount), 15000);
  const list = await rpc("select public.list_operator_invoices_v2('hora de espera',null,null,null) r");
  assert.equal(list.rows.length, 1, 'la búsqueda encuentra el excedente');
  assert.equal(list.rows[0].excess_count, 1);
  const res = await rpc("select public.annul_operator_invoice_v2($1,'número equivocado') r", [inv.invoice_id]);
  assert.equal(res.released_excess_count, 1);
  const rows = (await extras()).filter(r => r.service_id === S(1));
  assert.equal(rows[0].invoiceable, true);
  assert.equal(rows[0].invoice_number, null);
  await db.exec(`update operator_service_excess_charges set quantity=4 where service_id='${S(1)}'`);
  const again = await invoice([], [S(1)], '00000021');
  assert.equal(Number(again.total_amount), 60000);
});

test('sin excedentes en la selección se comporta como la factura de siempre', async () => {
  const inv = await invoice([S(1)], [], '00000030');
  assert.equal(inv.service_count, 1);
  assert.equal(inv.excess_count, undefined);
  assert.equal(Number(inv.total_amount), 50000);
});

test('permisos y exposición', async () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  assert.match(sql, /revoke all on public\.operator_invoice_excesses from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.create_operator_invoice_v5_km_v1\(uuid\[\], uuid\[\], uuid\[\], text, text, text, date, text\) to authenticated;/);
  assert.match(sql, /grant execute on function public\.list_operator_billing_extras_v2\(text, uuid, date, date\) to authenticated;/);
  assert.match(sql, /revoke all on function app_private\.service_billing_excess_lines_v1\(uuid\) from public, anon, authenticated;/);
  await as('chofer');
  await assert.rejects(extras(), /Sin permiso/);
});

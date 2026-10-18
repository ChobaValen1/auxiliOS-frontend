'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const read = f => fs.readFileSync(f, 'utf8');
const src = read('fuel-tickets-v1.js'), css = read('fuel-tickets-v1.css'), sigma = read('sigma.js'), truck = read('fleet-truck-detail-v1.js');
const index = read('Index.html'), sw = read('sw.js'), pkg = read('package.json'), sql = read('migrations/20261018120000_fuel_admin_and_tickets_v1.sql');

function load(roleName, calls) {
  const db = {
    storage: { from: b => ({ upload: async (path, file, o) => { calls.push(['upload', b, path, o.contentType]); return { error: null }; } }) },
    rpc: async (fn, args) => { calls.push(['rpc', fn, args]); return { data: {}, error: null }; }
  };
  const window = {};
  const ctx = { window, document: { addEventListener() {} }, console, Intl, Date, _db: db,
    PERFIL_USUARIO: { roles: { name: roleName } }, USUARIO_ACTUAL: { id: 'u-1' } };
  vm.runInNewContext(src, ctx);
  return window.AuxFuelTickets;
}

test('combustible: el ticket se sube a la carpeta del usuario y se vincula a la carga', async () => {
  const calls = [], t = load('chofer', calls);
  const path = await t.attach(42, { name: 'ticket.JPG', type: 'image/jpeg', size: 1000 });
  assert.match(path, /^u-1\/fuel-42-\d+\.jpg$/);
  assert.deepEqual(calls[0].slice(0, 2), ['upload', 'fuel-tickets']);
  assert.equal(calls[1][1], 'set_fuel_record_ticket_v1');
  assert.equal(JSON.stringify(calls[1][2]), JSON.stringify({ p_fuel_id: 42, p_path: path, p_mime: 'image/jpeg' }));
});

test('combustible: rechaza archivos que no son foto o PDF, o de más de 10 MB', async () => {
  const t = load('administracion', []);
  await assert.rejects(t.attach(1, { name: 'a.exe', type: 'application/x-msdownload', size: 10 }), /foto/);
  await assert.rejects(t.attach(1, { name: 'a.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 }), /10 MB/);
  assert.equal(await t.attachDriverScan(1, { name: 'a.exe', type: 'x', size: 1 }), false, 'el chofer no queda frenado si falla el ticket');
});

test('combustible: botón Ticket para todos, Adjuntar sólo para Administración', () => {
  const admin = load('administracion', []), sup = load('supervision', []);
  assert.match(admin.buttonHtml({ fuel_id: 5 }, { logId: 9 }), /data-fuelt-pick[^>]*data-fuel-id="5" data-log-id="9"/);
  assert.equal(sup.buttonHtml({ fuel_id: 5 }), '');
  assert.match(sup.buttonHtml({ fuel_id: 5, ticket_path: 'u/x.pdf', ticket_mime: 'application/pdf' }), /data-fuelt-view="u\/x.pdf" data-fuelt-mime="application\/pdf"/);
});

test('combustible: la carga desde Administración usa la función protegida de la base', () => {
  assert.match(src, /rpc\('admin_create_fuel_record_v1', \{ p_log_id: Number\(logId\), p_payload: payload \}\)/);
  assert.match(src, /createSignedUrl\(path, 300\)/);
  assert.match(sql, /if v_role <> 'administracion' then raise exception/);
  assert.match(sql, /split_part\(v_path, '\/', 1\) <> v_uid::text/);
  assert.match(sql, /'fuel-tickets', false, 10485760/);
});

test('combustible: conectado en la jornada, el camión y el escaneo del chofer', () => {
  assert.match(sigma, /AuxFuelTickets\.openNew\(\$\{Number\(log\.log_id\)\}/);
  assert.match(sigma, /AuxFuelTickets\.buttonHtml\(f, \{ logId: log\.log_id, truckId: log\.truck_id \}\)/);
  assert.match(sigma, /window\._fuelTicketFile = file;/);
  assert.match(sigma, /AuxFuelTickets\.attachDriverScan\(resultado\.data\.fuel_id, ticketFile\)/);
  assert.match(truck, /global\.AuxFuelTickets\.buttonHtml\(f, \{ truckId: st\.id \}\)/);
  assert.match(index, /<script src="\/fuel-tickets-v1\.js\?v=/);
  assert.match(index, /<link rel="stylesheet" href="\/fuel-tickets-v1\.css\?v=/);
  assert.match(sw, /'\/fuel-tickets-v1\.js','\/fuel-tickets-v1\.css'/);
  assert.match(pkg, /node --check fuel-tickets-v1\.js/);
});

test('combustible: los importes aceptan el formato argentino', () => {
  const d = load('administracion', [])._decimal;
  assert.equal(d('1.500'), 1500); assert.equal(d('1.500,50'), 1500.5); assert.equal(d('$ 61.000'), 61000);
  assert.equal(d('40.5'), 40.5); assert.equal(d('40,5'), 40.5); assert.ok(Number.isNaN(d('')));
});

test('combustible: el formulario sigue el orden del ticket y avisa qué falta', () => {
  const order = ['¿Cuánto se cargó?', '¿Cómo se pagó?', '¿Por qué la carga Administración?', 'Adjuntar ticket', 'Más datos'].map(t => src.indexOf(t));
  assert.ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), 'pasos en orden');
  assert.match(src, /E\.price_per_liter\.value = numText\(round2\(v\.t \/ v\.l\)\)/, 'el total calcula el precio por litro');
  assert.match(src, /'Falta: <b>'/);
  assert.match(src, /data-fuelt-seg="pay"/);
});

test('combustible: estilos con los tokens del sistema, sin colores fijos', () => {
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.match(css, /var\(--ax-accent\)/);
});

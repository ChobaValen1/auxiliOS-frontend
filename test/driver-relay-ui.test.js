const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const src = fs.readFileSync('driver-relay-v1.js', 'utf8');
function load() {
  const window = { toast() {} };
  vm.runInNewContext(src, { window, document: {}, console, Date, Number, String, JSON, Math, encodeURIComponent });
  return window.AuxRelevoChofer;
}
const R = load();
const x = { service_id: 's1', label: 'SRV-123', exchange_address: 'Estación de servicio, Gonnet', exchange_lat: -34.87, exchange_lng: -58.02,
  from_driver_name: 'Martín R.', from_truck_label: '12', from_truck_plate: 'AB123CD', to_driver_name: 'Lucas P.', to_truck_label: '7', to_truck_plate: 'AC456DE',
  to_has_active_jornada: false, vehicle_plate: 'AA111BB', vehicle_make_model: 'Fiat Cronos', destination: 'Remedios de Escalada', destination_lat: -34.72, destination_lng: -58.4 };

test('Maps abre la ruta directa al punto de intercambio (y avisa si no tiene ubicación)', () => {
  assert.equal(R._mapsUrl(-34.87, -58.02), 'https://www.google.com/maps/dir/?api=1&destination=-34.87%2C-58.02&travelmode=driving');
  assert.equal(R._mapsUrl(null, -58), '');
  assert.equal(R._mapsUrl('', ''), '');
  assert.doesNotMatch(R._incomingHtml([{ ...x, exchange_lat: null, exchange_lng: null }]), /destination=-34.87/);
});

test('el 2º chofer ve el servicio antes: punto B, vehículo, quién se lo trae, destino y Maps', () => {
  const html = R._incomingHtml([x]);
  for (const t of ['Vas a recibir', 'Tramo 2 de 2', 'Esperando la entrega', 'Estación de servicio, Gonnet', 'Martín R.', 'Móvil 12', 'Remedios de Escalada', 'AA111BB', 'Fiat Cronos', 'Retirás en (punto de encuentro)', 'Lo llevás a', 'target="_blank"']) assert.ok(html.includes(t), t);
  assert.doesNotMatch(html, /drl-maps|Ir al punto de intercambio en Maps/);
  assert.match(html, /Iniciá tu jornada con tu móvil para poder recibir el vehículo/);
  assert.doesNotMatch(R._incomingHtml([{ ...x, to_has_active_jornada: true }]), /Iniciá tu jornada/);
  assert.equal(R._incomingHtml([]), '');
});

test('el 1º chofer: primero el remito; con el remito hecho entrega en B con doble toque', () => {
  const sinRemito = R._outgoingBox(x, '', '');
  assert.doesNotMatch(sinRemito, /data-drl-handover/, 'sin remito no aparece el botón de entrega');
  assert.match(sinRemito, /Primero hacé el remito con el cliente<\/b> y cobrá como siempre/);
  const y = { ...x, has_remito: true };
  const idle = R._outgoingBox(y, '', '');
  assert.doesNotMatch(idle, /Ir al punto de intercambio en Maps|drl-maps/);
  assert.match(idle, /data-drl-handover="s1"[^>]*>\s*Entregué el vehículo a Lucas P\./);
  assert.match(idle, /Remito hecho\. Llevá el vehículo al punto de encuentro/);
  const sure = R._outgoingBox(y, 's1', '');
  assert.match(sure, /Tocá de nuevo para confirmar la entrega/);
  assert.match(sure, /pasa a Lucas P\. para que lo lleve al destino/);
  assert.match(R._outgoingBox(y, '', 's1'), /disabled aria-busy="true"/);
});

test('el 2º chofer, ya con el servicio: de quién lo recibió, sin remito y «Entregué el vehículo en destino»', () => {
  const r = { ...x, handed_over: true, handed_over_at: '2026-11-13T14:42:00Z', has_remito: true };
  const html = R._receivedBox(r, '', '');
  assert.match(html, /Recibiste el vehículo de <b>Martín R\.<\/b>/);
  assert.doesNotMatch(html, /drl-maps|Ir al destino en Maps/);
  assert.match(html, /data-drl-delivered="s1"[^>]*>\s*Entregué el vehículo en destino/);
  assert.match(html, /No hacés remito: lo hizo Martín R\. con el cliente/);
  assert.match(R._receivedBox(r, 'd:s1', ''), /Tocá de nuevo para confirmar/);
  assert.match(R._receivedBox(r, '', 'd:s1'), /disabled aria-busy="true"/);
  const done = R._receivedBox({ ...r, delivered: true, delivered_at: '2026-11-13T16:10:00Z' }, '', '');
  assert.doesNotMatch(done, /data-drl-delivered/);
  assert.match(done, /Entregado en destino/);
  assert.match(src, /mark_operator_service_relay_delivered_v1/);
});

test('el motivo del rechazo se muestra sin el código técnico', () => {
  assert.equal(R._friendlyError({ message: 'RELEVO_SIN_JORNADA: Lucas P. todavía no inició su jornada con un móvil' }), 'Lucas P. todavía no inició su jornada con un móvil');
  assert.equal(R._friendlyError({ message: 'El vehículo ya se entregó' }), 'El vehículo ya se entregó');
});

test('el módulo usa la consulta del chofer, la entrega y queda registrado en la app', () => {
  assert.match(src, /get_driver_relay_state_v1/);
  assert.match(src, /mark_operator_service_relay_handover_v1/);
  assert.match(src, /auxilios:driver-queue-updated/);
  assert.match(src, /MutationObserver/);
  for (const f of ['Index.html', 'sw.js', 'package.json']) assert.match(fs.readFileSync(f, 'utf8'), /driver-relay-v1/);
  assert.match(fs.readFileSync('ui/icons.svg', 'utf8'), /<symbol id="repeat"/);
  assert.match(fs.readFileSync('driver-relay-v1.css', 'utf8'), /\.p3-driver-task\.drl-out \.p3-task-primary \{ display: none; \}/);
});

test('«Vas a recibir» se toca como un servicio normal y abre su detalle en la misma hoja de la app', () => {
  const html = R._incomingHtml([x]);
  assert.match(html, /class="drl-card is-actionable"[^>]*role="button" tabindex="0"/);
  assert.match(html, /aria-label="Ver servicio SRV-123 con relevo"/);
  assert.match(html, /Ver detalle/);
  const sheet = R._incomingSheet({ ...x, scheduled_for: '2026-11-13T14:30:00Z' });
  for (const t of ['Esperando que Martín R. entregue el vehículo', 'Retirás en (punto de encuentro)', 'Fiat Cronos', 'Móvil 12', 'Remedios de Escalada', 'Horario del servicio', 'No hacés remito', 'Entregué el vehículo en destino']) assert.ok(sheet.includes(t), t);
  assert.match(src, /openCustomPreview/);
  assert.match(src, /\.drl-card\[data-drl-service\]/);
  assert.match(src, /e\.key !== 'Enter' && e\.key !== ' '/);
  const bridge = fs.readFileSync('operator-service-bridge.js', 'utf8');
  assert.match(bridge, /P3\.openCustomPreview=function/);
  assert.match(bridge, /window\.AuxRelevoChofer\?\.decoratePreview\?\.\(id\)/);
  assert.match(fs.readFileSync('driver-relay-v1.css', 'utf8'), /\.drl-card\.is-actionable/);
});

test('en la ventana de un servicio normal: el 1º chofer hace el remito, el 2º sin remito ni «Llegué al origen»', () => {
  for (const frag of ['abrirRemitoServicio', '.p3-other-actions', '.p3-arrive-btn', 'Tocalo al llegar', "[onclick*=\"abrirRemitoServicio\"]"]) assert.ok(src.includes(frag), frag);
  assert.match(src, /window\.cerrarPreviewServicio\?\.\(\)/, 'al entregar se cierra la ventana');
});

test('detalle del 1º chofer: el botón de entrega aparece con el remito hecho y sin botón azul de Maps', () => {
  const before = R._sheetBox(x, '', ''), after = R._sheetBox({ ...x, has_remito: true }, '', '');
  assert.doesNotMatch(before, /data-drl-handover/);
  assert.match(before, /Primero hacé el remito/);
  assert.match(after, /data-drl-handover="s1"[^>]*>\s*Entregué el vehículo a Lucas P\./);
  assert.doesNotMatch(before + after, /drl-maps/);
  assert.match(R._sheetBox({ ...x, has_remito: true }, 's1', ''), /Tocá de nuevo para confirmar la entrega/);
});

test('pantalla de remito del 1º chofer: banner de relevo con a quién y dónde entrega el vehículo', () => {
  const html = R._remitoBanner(x);
  assert.match(html, /Con relevo · Tramo 1 de 2/);
  assert.match(html, /Hacé el remito con el cliente y cobrá como siempre/);
  assert.match(html, /Estación de servicio, Gonnet<\/b> y se lo entregás a <b>Lucas P\.<\/b>/);
  assert.match(html, /el otro chofer no hace remito/);
  assert.doesNotMatch(html, /drl-chip-side/);
  assert.match(src, /S\.outgoing\.find\(x => String\(x\.service_id\) === String\(serviceId\)\)/);
  assert.match(fs.readFileSync('operator-service-bridge.js', 'utf8'), /AuxRelevoChofer\?\.decorateRemito\?\.\(s\.service_id\)/);
});

test('aviso al 2º chofer cuando le entregan el vehículo: detecta lo que pasó de «por recibir» a recibido y consulta cada 15 s mientras espera', () => {
  const prev = [{ service_id: 'a' }, { service_id: 'b' }];
  assert.deepEqual(R._newlyReceived(prev, [{ service_id: 'b' }, { service_id: 'z' }]).map(x => x.service_id), ['b']);
  assert.deepEqual(R._newlyReceived([], [{ service_id: 'b' }]), []);
  assert.deepEqual(R._newlyReceived(prev, []), []);
  assert.match(src, /te entregó el vehículo/);
  assert.match(src, /S\.incoming\.length\) void refresh\(\{ force: true \}\), 15000|S\.incoming\.length\) void refresh\(\{ force: true \}\); \}, 15000/);
  assert.match(src, /recargarServiciosChofer/);
});

test('tarjetas del chofer: mismo orden visual en todos los servicios (patente, cliente chico, sin teléfono ni Llamar)', () => {
  const js = fs.readFileSync('operator-service-bridge.js', 'utf8'), css = fs.readFileSync('operator-service-bridge.css', 'utf8');
  const body = js.slice(js.indexOf('function previewBody(s){'), js.indexOf('function slidePreview'));
  assert.ok(body.indexOf('p3-sheet-vehicle') < body.indexOf('p3-sheet-client'), 'primero patente y vehículo, después el cliente');
  assert.doesNotMatch(body, /tel:|customer_phone|Llamar|CLIENTE/);
  const quick = js.slice(js.indexOf('function driverQuickLinks'), js.indexOf('function driverQuickLinks') + 700);
  assert.doesNotMatch(quick, /tel:|Llamar|customer_phone/);
  assert.match(css, /\.p3-sheet-client\{padding:0 2px 14px;border:0;background:none\}/);
});

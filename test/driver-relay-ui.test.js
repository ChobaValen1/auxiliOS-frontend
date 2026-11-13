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

test('el 1º chofer: va a B con Maps, entrega con doble toque y no crea remito', () => {
  const idle = R._outgoingBox(x, '', '');
  assert.doesNotMatch(idle, /Ir al punto de intercambio en Maps|drl-maps/);
  assert.match(idle, /data-drl-handover="s1"[^>]*>\s*Entregué el vehículo en B/);
  assert.match(idle, /No hace falta crear remito/);
  const sure = R._outgoingBox(x, 's1', '');
  assert.match(sure, /Tocá de nuevo para confirmar la entrega/);
  assert.match(sure, /pasa a Lucas P\. y no vas a poder crear el remito/);
  assert.match(R._outgoingBox(x, '', 's1'), /disabled aria-busy="true"/);
});

test('el 2º chofer, ya con el servicio: de quién lo recibió y Maps al destino', () => {
  const html = R._receivedBox({ ...x, handed_over: true, handed_over_at: '2026-11-13T14:42:00Z' });
  assert.match(html, /Recibiste el vehículo de <b>Martín R\.<\/b>/);
  assert.doesNotMatch(html, /drl-maps|Ir al destino en Maps/);
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
  for (const t of ['Esperando que Martín R. entregue el vehículo', 'Retirás en (punto de encuentro)', 'Fiat Cronos', 'Móvil 12', 'Remedios de Escalada', 'Horario del servicio', 'completás el remito con el cliente']) assert.ok(sheet.includes(t), t);
  assert.match(src, /openCustomPreview/);
  assert.match(src, /\.drl-card\[data-drl-service\]/);
  assert.match(src, /e\.key !== 'Enter' && e\.key !== ' '/);
  const bridge = fs.readFileSync('operator-service-bridge.js', 'utf8');
  assert.match(bridge, /P3\.openCustomPreview=function/);
  assert.match(bridge, /window\.AuxRelevoChofer\?\.decoratePreview\?\.\(id\)/);
  assert.match(fs.readFileSync('driver-relay-v1.css', 'utf8'), /\.drl-card\.is-actionable/);
});

test('en la ventana de un servicio normal: el 1º chofer sin remito, el 2º sin «Llegué al origen»', () => {
  for (const frag of ['abrirRemitoServicio', '.p3-other-actions', '.p3-arrive-btn', 'Tocalo al llegar', "[onclick*=\"abrirRemitoServicio\"]"]) assert.ok(src.includes(frag), frag);
  assert.match(src, /window\.cerrarPreviewServicio\?\.\(\)/, 'al entregar se cierra la ventana');
});

test('detalle del 1º chofer: un solo botón principal (aparece al llegar) y sin botón azul de Maps', () => {
  const before = R._sheetBox(x, '', '', false), after = R._sheetBox(x, '', '', true);
  assert.doesNotMatch(before, /data-drl-handover/);
  assert.match(after, /data-drl-handover="s1"[^>]*>\s*Entregué el vehículo en B/);
  assert.doesNotMatch(before + after, /drl-maps/);
  assert.match(after, /No hace falta crear remito/);
  assert.match(R._sheetBox(x, 's1', '', true), /Tocá de nuevo para confirmar la entrega/);
});

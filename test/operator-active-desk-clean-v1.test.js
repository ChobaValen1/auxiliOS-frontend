const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('operator-active-desk-clean-v1.js', 'utf8');
const styles = fs.readFileSync('operator-active-desk-clean-v1.css', 'utf8');
const migration = fs.readFileSync('migrations/20260805155000_operator_active_desk_quick_actions.sql', 'utf8');
const flags = fs.readFileSync('feature-flags.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

test('la Mesa activa muestra solo estados operativos abiertos', () => {
  for (const status of ['pending', 'assigned', 'en_route', 'at_origin', 'loaded', 'at_destination']) {
    assert.match(source, new RegExp(`'${status}'`));
  }
  assert.match(source, /ACTIVE_STATUSES\.has\(service\.status\)/);
  assert.doesNotMatch(source.match(/const ACTIVE_STATUSES[\s\S]*?\);/)?.[0] || '', /completed|cancelled/);
  assert.match(source, /Finalizar servicio/);
  assert.match(source, /Ya se encuentra en Historial/);
});

test('estados, asignación y edición se resuelven desde la fila', () => {
  assert.match(source, /data-oad-status-menu/);
  assert.match(source, /data-oad-more-menu/);
  assert.match(source, /transition_operator_service_from_desk/);
  assert.match(source, /reassign_operator_service/);
  assert.match(source, /void_operator_service_from_desk/);
  assert.match(source, /cerrarServicioSinCompletar/);
  assert.match(source, /editarServicioOperador/);
  assert.match(source, /O\.openDetail/);
});

test('cada operador puede ordenar, ocultar y dimensionar columnas', () => {
  assert.match(source, /VIEW_KEY = 'operator_active_desk_v1'/);
  assert.match(source, /user_view_preferences/);
  assert.match(source, /\.upsert\(/);
  assert.match(source, /draggable="true"/);
  assert.match(source, /data-oad-column-move/);
  assert.match(source, /data-oad-column-width/);
  assert.match(source, /density: 'compact'/);
  assert.match(source, /comfortable/);
  assert.match(source, /required: true/);
});

test('la clean UI utiliza la paleta de AuxiliOS y mantiene la tabla legible', () => {
  assert.match(styles, /--oad-primary:\s*var\(--primary,\s*#4f8ef7\)/i);
  assert.match(styles, /--oad-amber:\s*var\(--amber,\s*#f5a623\)/i);
  assert.match(styles, /--oad-green:\s*var\(--green,\s*#27c47a\)/i);
  assert.match(styles, /--oad-red:\s*var\(--red,\s*#e2504a\)/i);
  assert.match(styles, /\.oad-table thead th[\s\S]*position:\s*sticky/i);
  assert.match(styles, /\.oad-popover/);
  assert.match(styles, /\.oad-status\.blue/);
  assert.match(styles, /#ocv2-root/);
  assert.doesNotMatch(styles, /backdrop-filter/i);
});

test('las transiciones rápidas preservan jornada, viaje, remito e historial', () => {
  assert.match(migration, /current_auxilios_role\(\)/i);
  assert.match(migration, /'administracion','operador','supervision'/i);
  assert.match(migration, /daily_logs/i);
  assert.match(migration, /insert into public\.trips/i);
  assert.match(migration, /REMITO_REQUERIDO/i);
  assert.match(migration, /status[^\n]*not in \('firmado','cerrado_admin'\)/i);
  assert.match(migration, /fecha_hora_fin = coalesce\(fecha_hora_fin, now\(\)\)/i);
  assert.match(migration, /operator_service_events/i);
  assert.match(migration, /desk_status_correction/i);
  assert.match(migration, /ANULADO:/i);
  assert.match(migration, /revoke all on function public\.transition_operator_service_from_desk/i);
  assert.match(migration, /grant execute on function public\.transition_operator_service_from_desk/i);
});

test('la Mesa activa es la única vista cargada y forma parte de CI y PWA', () => {
  assert.doesNotMatch(flags, /loadScript\([^\n]*operator-console-v2/);
  assert.doesNotMatch(flags, /loadStyle\([^\n]*operator-console-v2/);
  assert.match(flags, /operator-active-desk-clean-v1\.css/);
  assert.match(flags, /operator-active-desk-clean-v1\.js/);
  assert.match(flags, /operator-services-canonical-view-v1\.js/);
  assert.match(pkg, /node --check operator-active-desk-clean-v1\.js/);
  assert.match(pkg, /node --check operator-services-canonical-view-v1\.js/);
  assert.doesNotMatch(sw, /'\/operator-console-v2\.(?:css|js)'/);
  assert.match(sw, /'\/operator-active-desk-clean-v1\.css'/);
  assert.match(sw, /'\/operator-active-desk-clean-v1\.js'/);
  assert.match(sw, /'\/operator-services-canonical-view-v1\.js'/);
  const match = sw.match(/auxilios-v(\d+)/);
  assert.ok(match);
  assert.ok(Number(match[1]) >= 135);
});

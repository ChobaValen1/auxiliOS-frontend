const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = f => fs.readFileSync(f, 'utf8');

test('Historial: no se registran cobros en un servicio finalizado o anulado', () => {
  const pagos = read('private-payments-v1.js'), vista = read('private-view-v1.js');
  const sql = read('migrations/20260930120000_cobro_bloqueado_en_historial_v1.sql');
  assert.match(pagos, /function cerrado\(s\) \{ return !!s && \['completed', 'cancelled'\]\.indexOf\(s\.status\) >= 0; \}/);
  assert.match(pagos, /esParticular\(sv\) && !cerrado\(sv\)/);                  // el menú ⋯ no lo ofrece
  assert.match(pagos, /if \(cerrado\(servicio\(id\)\)\) \{/);                     // y abrirlo directo tampoco
  assert.match(vista, /p && saldo > 0 && !cerrado \?/);
  assert.match(sql, /if v_s\.status in \('completed', 'cancelled'\) then/);         // la base lo rechaza
  assert.match(sql, /if v_new = v_def then raise exception/);
});

test('Servicios: Activos/Historial se desliza, sin caja de fondo y Personalizar con interruptores', () => {
  const js = read('operator-services.js'), css = read('operaciones-ax-v1.css');
  assert.match(js, /classList\.toggle\('is-history',S\.view==='history'\)/);
  assert.match(js, /el\.classList\.add\('os-view-enter'\)/);
  assert.match(css, /\.os-view-switch\.is-history::before \{ transform: translateX\(calc\(100% \+ 2px\)\); \}/);
  assert.match(css, /\.os-commandbar \{ position: static;[^}]*border: 0;[^}]*background: none; \}/);
  assert.match(js, /<label class="ax-switch" aria-label="Mostrar/);
  assert.match(js, /class="os-move os-move-up"/);
  assert.doesNotMatch(js, /\)">↑<\/button>|\)">↓<\/button>/);
});

test('Formulario de prestadora: marca en chofer/móvil, direcciones y km; sin franja roja', () => {
  const ws = read('operator-service-workspace-reactive-v1.js'), wiz = read('operator-service-wizard.js');
  assert.match(ws, /function statusLine\(el,key,state,text,\{animate=false,pending='Verificando…'\}=\{\}\)/);
  assert.match(ws, /statusLine\(hint,\[selected,blocker,text,historical\]\.join\('\|'\)/);   // en lugar de "Disponible" suelto
  assert.match(ws, /pending:'Validando…'/);
  assert.match(ws, /routeStatus\('running','Calculando el recorrido…'\)/);
  assert.match(ws, /window\.AxUI\.flash\(card\)/);
  assert.doesNotMatch(ws, /<span>⌕<\/span>|⛔|⚠ \$\{/);
  assert.doesNotMatch(wiz, /showTransientError/);
  assert.match(wiz, /window\.AuxiliosUI\?\.resaltarServicio\?\.\(data\?\.service_id\|\|w\.serviceId,w\.data\.service_order_number\)/);
});

test('Formulario de particular: errores debajo de cada campo y confirmación de móvil y chofer', () => {
  const js = read('private-service-v1.js');
  assert.match(js, /function erroresPorCampo\(\)/);
  assert.match(js, /'Completá el origen\.': 'origin'/);
  assert.match(js, /<small class="psv-field-error" role="alert">/);
  assert.doesNotMatch(js, /if \(e\.length\) \{ st\.error = e\.join\(' '\); pintar\(\); return; \}/);   // el recuadro rojo con todo junto
  assert.match(js, /function pintarRecursos\(animar\)/);
  assert.match(js, /' · jornada del móvil'/);
  assert.match(js, /global\.OperatorServices\.loadResourceAvailability\(\)/);
  assert.match(js, /global\.AuxiliosUI\.resaltarServicio\(res\.service_id, numero\)/);
  // errores() sigue devolviendo sólo los textos (lo usan otras partes).
  assert.match(js, /function errores\(\) \{ return erroresPorCampo\(\)\.map\(function \(x\) \{ return x\.m; \}\); \}/);
});

test('Cambio de estado: menú con íconos, modales oscuros y la fila que cambió se marca', () => {
  const js = read('operator-service-lifecycle.js'), css = read('estado-servicio-ax-v1.css');
  assert.match(js, /const QUICK_ICON=\{assign:'user'/);
  assert.match(js, /<div class="osl-quick-head">Cambiar estado<\/div>/);
  assert.match(js, /data-osl-close aria-label="Cerrar">\$\{ico\('x'\)\}/);
  assert.match(js, /window\.AuxiliosUI\?\.resaltarServicio\?\.\(id\)/);
  assert.match(js, /resourceStatus\(hint,el\.value,blocker,/);
  assert.match(css, /#os-lifecycle-modal \.osl-modal \{[^}]*background: var\(--ax-surface-2\)/);
});

test('Aviso de servicio creado: en la oficina no tapa la pantalla; al chofer se le muestra en el centro', () => {
  const calls = [];
  const el = () => ({ setAttribute() {}, addEventListener() {}, querySelector: () => ({}), remove() {}, isConnected: true });
  const doc = { getElementById: () => null, createElement: el, body: { appendChild() {} } };
  const run = role => {
    const win = { document: doc, AxUI: { toast: o => { calls.push(['toast', o.tone, o.title]); return {}; }, mark() {} }, toast() {} };
    vm.runInNewContext(read('ui/app-v1.js'), { window: win, PERFIL_USUARIO: { roles: { name: role } }, setTimeout: () => 0 });
    return win;
  };
  const oficina = run('administracion');
  oficina.operationFeedback('Servicio creado', 'Quedó cargado con el N° 1.', 'success');
  oficina.operationFeedback('Revisá los datos', 'Falta el km.', 'error');
  assert.deepEqual(calls, [['toast', 'ok', 'Servicio creado'], ['toast', 'warn', 'Revisá los datos']]);
  calls.length = 0;
  const chofer = run('chofer');
  const r = chofer.operationFeedback('Servicio activado', 'Ya estás disponible.', 'success');
  assert.deepEqual(calls, []);
  assert.equal(typeof r.close, 'function');
  assert.equal(typeof chofer.AuxiliosUI.resaltarServicio, 'function');
});

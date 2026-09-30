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

test('Particular: interruptores, segmentados que se deslizan y listas del sistema', () => {
  const js = read('private-service-v1.js'), ax = read('ui/ax.js');
  assert.match(js, /<label class="psv-check ax-switch"><input type="checkbox" data-psv-k="factura"/);
  assert.match(js, /<label class="psv-check ax-switch"><input type="checkbox" data-psv-k="captado"/);
  assert.match(js, /data-ax-seg="' \+ k \+ '"/);
  assert.match(js, /global\.AxUI\.select\(x\)/);
  assert.match(js, /global\.AxUI\.seg\(x\)/);
  assert.match(ax, /function seg\(box, clave\)/);
  assert.match(ax, /function select\(sel\)/);
  assert.match(ax, /if \(clave === ultimo\) return;/);   // no se repinta solo (el observador no entra en bucle)
  const win = { addEventListener() {}, matchMedia: () => ({ matches: false }) };
  const doc = { addEventListener() {}, documentElement: {}, querySelector: () => null };
  win.document = doc;
  vm.runInNewContext(ax, { window: win, document: doc, setTimeout, clearTimeout, Promise });
  assert.equal(typeof win.AxUI.seg, 'function');
  assert.equal(typeof win.AxUI.select, 'function');
});

test('Particular: si ya está pago no se ofrece Registrar cobro; al editar se cambia cómo se pagó', () => {
  const pagos = read('private-payments-v1.js'), js = read('private-service-v1.js');
  const sql = read('migrations/20260930150000_cambiar_medio_de_cobro_v1.sql');
  assert.match(pagos, /if \(r\.error \|\| !r\.data \|\| num\(r\.data\.balance\) <= 0\) return;/);
  assert.doesNotMatch(pagos, /b\.textContent = 'Registrar cobro';/);
  assert.match(js, /function comoSePago\(\)/);
  assert.match(js, /rpc\('update_service_payment_method_v1', \{ p_payment_id: cambios\[ci\]\.payment_id/);
  assert.match(sql, /if v_role not in \('operador', 'administracion'\) then/);
  assert.match(sql, /if v_status in \('completed', 'cancelled'\) then/);
  assert.match(sql, /revoke all on function public\.update_service_payment_method_v1\(uuid, text\) from public, anon;/);
});

test('Prestadora: sugerencias por encima de Destino y duplicar peajes', () => {
  const css = read('servicio-form-ax-v1.css'), addons = read('operator-service-commercial-addons-v1.js'), wiz = read('operator-service-wizard.js');
  assert.match(css, /\.osv2-location:has\(\.osv4-suggestions:not\(\[hidden\]\)\) \{ position: relative; z-index: 40; \}/);
  // Sólo "Duplicar para la vuelta": duplicar una fila igual rompería la regla de sumar la cantidad.
  assert.doesNotMatch(addons, /data-ca="duplicate-toll"/);
  assert.doesNotMatch(addons, /data-aa-dup="/);
  assert.match(addons, /data-ca="duplicate-tolls"/);
  assert.match(addons, /data-aa-dup-all="\$\{kind\}"/);
  assert.doesNotMatch(wiz, /function duplicateCommercialToll\(index\)/);
  assert.match(wiz, /function duplicateCommercialTolls\(\)/);
  // La copia lleva el peaje y la cantidad; quién paga (si el formato no lo fija) y el medio van vacíos.
  assert.match(wiz, /payer_agent:payer,customer_payment_method:''\};const k=tollKey\(copy\)/);
  assert.match(addons, /payer_agent:payer,customer_payment_method:''\};copy\.total_amount/);
  assert.match(addons, /vueltas\.has\(row\)&&sumarSiRepetido\(commercial\(\)\.tolls,row\)/);
});

test('Remito del chofer: sistema visual en todos los pasos sin tocar la lógica de sigma.js', () => {
  const js = read('remito-chofer-ax-v1.js'), css = read('remito-chofer-ax-v1.css'), flow = read('remito-mobile-flow-v3.js');
  assert.match(js, /envolver\('_remWizardActualizar', decorar\)/);
  assert.match(js, /envolver\('updateSigStatus', firma\)/);
  assert.match(js, /\/\/ El estilo en línea lo maneja sigma\.js/);            // no rompe mostrar/ocultar "Guardar y seguir después"
  assert.match(js, /n > ultimoPaso \? 'rmx-enter-next' : 'rmx-enter-prev'/);
  assert.match(css, /@keyframes rmx-enter-next/);
  assert.match(css, /#remitos-nuevo \.form-input, #remitos-nuevo \.rmv-input, #remitos-nuevo textarea \{[^}]*font-size: 16px;/);   // sin zoom en el teléfono
  assert.match(css, /#remitos-nuevo \.toggle\.on::after/);
  assert.doesNotMatch(flow, /📷 Vehículo|🔢 Odómetro|＋ Agregar evidencia/);
  const win = { setInterval: () => 0, clearInterval() {} };
  const doc = { querySelector: () => null, getElementById: () => null };
  win.document = doc;
  const sigma = { calls: 0 };
  win._remWizardActualizar = function () { sigma.calls++; };
  vm.runInNewContext(js, { window: win, setInterval: () => 0, clearInterval() {} });
  win._remWizardActualizar();
  assert.equal(sigma.calls, 1);                                            // la original se sigue llamando
  assert.equal(win._remWizardActualizar.__rmx, true);
});

test('Remito sin asignación a medio completar: se avisa antes de empezar otro servicio, sin códigos', () => {
  const bridge = read('operator-service-bridge.js'), sb = read('supabase.js');
  const sql = read('migrations/20260930160000_viaje_en_curso_dice_cual_v1.sql');
  assert.match(bridge, /const pendiente=!s\.trip_id&&\(P3\.adHocDrafts\|\|\[\]\)\.find\(r=>r&&r\.id\);if\(pendiente\)/);
  assert.match(bridge, /return openAdHocPreview\(pendiente\.id\)/);
  assert.match(sb, /'No se pudo guardar el remito\. ' \+ String\(error\.message \|\| ''\)\.replace\(\/\^\[A-Z_\]\{4,\}:\\s\*\/, ''\)/);
  assert.match(sql, /VIAJE_EN_CURSO: tenés el servicio % sin terminar/);
});

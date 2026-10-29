const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const services = read('operator-services.js');
const wizard = read('operator-service-wizard.js');
const workspace = read('operator-service-workspace-reactive-v1.js');
const privateForm = read('private-service-v1.js');
const css = read('operaciones-ax-v1.css');
const supa = read('supabase.js');
const sprite = read('ui/icons.svg');

test('inicio de sesión: el ojo de la contraseña usa el ícono del sistema visual', () => {
  assert.doesNotMatch(supa, /👁|🙈/);
  assert.match(supa, /id="login-pass-toggle" aria-label="Mostrar contraseña" aria-pressed="false"/);
  assert.match(supa, /setAttribute\('href', '\/ui\/icons\.svg#' \+ \(show \? 'eye-off' : 'eye'\)\)/);
  assert.match(sprite, /<symbol id="eye-off" viewBox="0 0 24 24">/);
});

test('ingresos sin servicio: una fila legible con recorrido, cargos y estado', () => {
  assert.match(services, /<span>Servicio<\/span><span>Recorrido<\/span><span>Cliente y vehículo<\/span><span>Chofer<\/span><span>Cargos<\/span><span>Estado<\/span>/);
  assert.match(services, /function intakeState\(i\)\{if\(i\.driver_activated\)return\{kind:'Activado',label:'Activado sin servicio'/);
  assert.match(services, /<small class="osi-wait">El chofer todavía no firmó<\/small>/);
  assert.match(css, /#screen-operaciones \.osi-head, #screen-operaciones \.osi-row \{ display: grid; grid-template-columns: 128px minmax\(0, 2fr\)/);
  // En pantallas angostas, tarjetas.
  assert.match(css, /grid-template-areas: "id state" "route route" "client driver" "charges action";/);
});

test('crear servicio desde ingreso: sin un servicio compatible va directo al alta', () => {
  assert.match(services, /if\(!candidates\.length\)return createServiceFromIntake\(\);/);
  assert.match(services, /<b>¿Ya existe este servicio\?<\/b>/);
  assert.match(services, /onclick="confirmarVinculoIngresoChofer\(\)">Asociar a este servicio<\/button>/);
  // Lo que marcó el chofer (Prestadora o Particular) abre ese formulario, sin volver a preguntar.
  assert.match(privateForm, /if \(info && info\.client_kind === 'prestadora'\) \{ ocultarCuentaEnPrestadoras\(\); return abrirPrestadora\(intake\); \}/);
});

test('crear servicio desde ingreso: llegan los km y quién pagó cada peaje', () => {
  assert.match(wizard, /if\(reportedKm>0&&!\(Number\(w\.data\.estimated_asphalt_km\)>0\)&&!\(Number\(w\.data\.estimated_gravel_km\)>0\)\)\{[^}]*w\.data\.estimated_asphalt_km=reportedKm;/);
  assert.match(workspace, /ya cargados como KM Asfalto, separá el ripio si corresponde/);
  // Desde 6b74406 el ingreso usa la misma tabla que la corrección administrativa: cada peaje conserva quién pagó según el chofer.
  assert.match(wizard, /w\.data\.commercial_addons=administrativeState\(\{toll_coverage_mode:ctx\.addons\?\.toll_coverage_mode\|\|'',tolls:ctx\.addons\?\.tolls\|\|\[\],excess_charges:ctx\.addons\?\.excesses\|\|\[\]\},ctx\.addons\)/);
  assert.match(wizard, /const row=\{\.\.\.r,_id:uid\(\),quantity:qty/);
});

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
  assert.match(css, /#screen-operaciones \.osi-head, #screen-operaciones \.osi-row \{ display: grid; grid-template-columns: minmax\(112px, \.8fr\) minmax\(0, 1\.5fr\)/);
  // En pantallas angostas, tarjetas; en el celular el botón va abajo a todo el ancho.
  assert.match(css, /grid-template-areas: "id state" "route route" "client driver" "match match" "charges action";/);
  assert.match(css, /grid-template-areas: "id state" "route route" "client driver" "match match" "charges charges" "action action";/);
});

test('ingresos sin servicio: cola por antigüedad, servicio posible y espera', () => {
  // Primero los que se pueden resolver, del que más espera al más nuevo; abajo los que esperan firma.
  assert.match(services, /const ready=intakes\.filter\(i=>intakeState\(i\)\.ready\)\.sort\(byAge\),waiting=intakes\.filter\(i=>!intakeState\(i\)\.ready\)\.sort\(byAge\)/);
  assert.match(services, /Esperando la firma del chofer · \$\{waiting\.length\}/);
  // La fila y la ventana usan los mismos candidatos y el mismo criterio de recomendación.
  assert.match(services, /const \{assigned,pending,candidates\}=intakeCandidates\(intake\);/);
  assert.match(services, /function intakeBestMatch\(intake\)\{.*AuxiliosIntakeMatch\.rank\(intake,candidates\)\.find\(r=>r\.recommended\)/);
  assert.match(services, /\$\{ico\('link'\)\}Asociar<\/button>/);
  // Más de 24 h esperando se marca como demorado.
  assert.match(services, /const INTAKE_LATE_MS=24\*60\*60\*1000;/);
  assert.match(css, /\.osi-row\[data-late="true"\]\[data-state="ready"\]::before/);
  // Abierto si hay algo para resolver, salvo que la persona lo haya tocado.
  assert.match(services, /if\(!S\.intakesTouched\)panel\.open=ready\.length>0;/);
});

test('ingresos sin servicio: edad relativa y recorrido por localidad', () => {
  const vm = require('node:vm');
  const src = services.match(/const INTAKE_LATE_MS=[^\n]*\nfunction intakeAge[^\n]*/)[0];
  const ctx = {}; vm.createContext(ctx); vm.runInContext(src + ';this.intakeAge=intakeAge;', ctx);
  const now = Date.parse('2026-11-19T12:00:00Z'), at = h => ({ created_at: new Date(now - h * 3600e3).toISOString() });
  assert.equal(ctx.intakeAge(at(0.2), now).label, 'hace 12 min');
  assert.equal(ctx.intakeAge(at(5), now).label, 'hace 5 h');
  assert.deepEqual([ctx.intakeAge(at(26), now).label, ctx.intakeAge(at(26), now).late], ['hace 1 d 2 h', true]);
  assert.equal(ctx.intakeAge(at(23.9), now).late, false);
});

test('crear servicio desde ingreso: sin un servicio compatible va directo al alta', () => {
  assert.match(services, /if\(!candidates\.length\)return createServiceFromIntake\(\);/);
  assert.match(services, /<b>Remito sin servicio asignado<\/b>/);
  assert.match(services, /id="os-intake-link-primary" onclick="confirmarModalIngresoChofer\(\)">Asociar remito<\/button>/);
  assert.match(services, /Crear un servicio nuevo con los datos del remito/);
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

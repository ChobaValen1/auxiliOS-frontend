const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const tools = read('jornadas-admin-tools-v1.js');
const sigma = read('sigma.js');
const supa = read('supabase.js');
const index = read('Index.html');
const css = read('registro-ax-v1.css');
const sql = read('migrations/20261008140000_jornada_admin_horas_v1.sql');

const linea = (ini) => { const i = tools.indexOf(ini); return tools.slice(i, tools.indexOf('\n', i)); };
const bloque = (ini, fin) => tools.slice(tools.indexOf(ini), tools.indexOf(fin));
const helpers = new Function([
  linea('const nz = '), linea('const fmtKm = '),
  bloque('  const parseHs = ', '  const hsVal = '),
  linea('const validTime = '), linea('const minutesOf = '),
  bloque('  function tripSummary', '  const quickReasons'),
  'return { parseHs, tripSummary };',
].join('\n'))();

test('las horas de motor aceptan coma o punto y avisan si no son un número', () => {
  assert.equal(helpers.parseHs('5511,2'), 5511.2);
  assert.equal(helpers.parseHs('5.511,2'), 5511.2);
  assert.equal(helpers.parseHs('5511.2'), 5511.2);
  assert.equal(helpers.parseHs(''), null);
  assert.ok(Number.isNaN(helpers.parseHs('mil')));
  assert.ok(Number.isNaN(helpers.parseHs('-3')));
});

test('el renglón Recorrido suma las horas de motor y marca lo que no cierra', () => {
  const ok = helpers.tripSummary('183800', '183974', '08:00', '16:30', false, 5504, 5511.2);
  assert.equal(ok.text, '174 km · 8 h 30 min · 7,2 h de motor');
  assert.equal(ok.problems.length, 0);
  const menor = helpers.tripSummary('183800', '183974', '08:00', '16:30', false, 5504, 5500);
  assert.ok(menor.problems.includes('Las horas de motor finales son menores a las iniciales.'));
  const sinHoras = helpers.tripSummary('183800', '183974', '08:00', '16:30', false);
  assert.equal(sinHoras.text, '174 km · 8 h 30 min');
});

test('Corregir jornada edita las horas de motor', () => {
  assert.match(tools, /const conHoras=log\.horas_inicio!=null\|\|log\.horas_final!=null\|\|!!log\.truck\?\.registra_horas;/);
  assert.match(tools, /hsField\('Horas al inicio','horas_inicio',hsVal\(log\.horas_inicio\)\)\}\$\{isOpen\?'':hsField\('Horas al final','horas_final'/);
  assert.match(tools, /if\(conHoras\)\{patch\.horas_inicio=parseHs\(fd\.get\('horas_inicio'\)\);if\(!isOpen\)patch\.horas_final=parseHs\(fd\.get\('horas_final'\)\);\}/);
  // Lo que no cierra bloquea el botón Guardar.
  assert.match(tools, /!hp\.bloquea\.length&&v\.km_inicio!==''/);
  assert.match(tools, /horas_inicio:'Horas de motor al inicio',horas_final:'Horas de motor al final'/);
  assert.match(supa, /truck:trucks!truck_id\(truck_id, plate, numero_interno, brand, model, registra_horas\)/);
});

test('Cerrar jornada desde Administración acepta las horas finales (opcionales)', () => {
  assert.match(tools, /const conHoras=log\.horas_inicio!=null;/);
  assert.match(tools, /if\(conHoras\)\{const hs=parseHs\(fd\.get\('horas_final'\)\);if\(hs!=null\)payload\.horas_final=hs;\}/);
  assert.match(tools, /Si no las sabés, dejalas vacías/);
});

test('la base valida las horas que corrige Administración y actualiza el camión', () => {
  assert.match(sql, /'km_excepcion','horas_inicio','horas_final'\]\)/);
  assert.match(sql, /JORNADA_HORAS_INVALIDAS: las horas finales no pueden ser menores a las iniciales/);
  assert.match(sql, /JORNADA_HORAS_INVALIDAS: cargá también las horas de motor iniciales/);
  assert.match(sql, /las horas de motor finales solo se cargan mediante Cerrar jornada/);
  // Sólo lo que cambia queda como cargado a mano.
  assert.match(sql, /horas_inicio_origen=case when v_horas_inicio is distinct from v_old\.horas_inicio then 'manual_editado'/);
  // La última jornada con horas del camión manda, también si la corrección es para abajo.
  assert.match(sql, /if v_ultima=v_log\.log_id then\s+update public\.trucks set current_hours=floor\(v_log\.horas_final\)::int/);
  assert.match(sql, /horas_final=case when v_horas_final is not null then v_horas_final else horas_final end/);
  assert.doesNotMatch(sql, /drop (function|trigger)/i);
});

test('las horas de motor aparecen en los resúmenes', () => {
  // Números de arriba de Jornadas (administración).
  assert.match(supa, /select\('log_id, km_recorridos, hora_inicio, hora_fin, horas_inicio, horas_final, in_workshop'\)/);
  assert.match(supa, /horasMotorPeriodo: Math\.round\(horasMotorTotal \* 10\) \/ 10/);
  assert.match(sigma, /Number\(k\.horasMotorPeriodo\) > 0 \? `<br>\$\{_escHtml\(`\$\{_fmtHoras\(k\.horasMotorPeriodo\)\} h de motor`\)\}`/);
  // Resumen del mes del chofer: un cuarto número que sólo aparece si hubo horas.
  assert.match(index, /<div class="reg-kpi" id="kpi-horas-mes-box" hidden><div class="reg-kpi-value" id="kpi-horas-mes">—<\/div><div class="reg-kpi-label">Horas de motor<\/div><\/div>/);
  assert.match(supa, /agg\.total_horas_motor = Math\.round\(horasMotor \* 10\) \/ 10/);
  assert.match(sigma, /if \(boxHs\) boxHs\.hidden = !\(Number\(data\.total_horas_motor\) > 0\)/);
  assert.match(css, /#screen-registro \.reg-kpi\[hidden\] \{ display: none; \}/);
});

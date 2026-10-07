const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sigma = read('sigma.js');
const supa = read('supabase.js');
const index = read('Index.html');
const sql = read('migrations/20261007200000_truck_engine_hours_v1.sql');
const fn = read('supabase/functions/procesar-odometro/index.ts');

test('cada camión tiene su interruptor de horas, apagado por defecto', () => {
  assert.match(sql, /add column if not exists registra_horas boolean not null default false/);
  assert.match(index, /id="nv-registra-horas"/);
  assert.match(sigma, /registra_horas: registraHoras/);
  // El chofer no puede prenderlo ni apagarlo.
  assert.match(sql, /or new\.registra_horas is distinct from old\.registra_horas then\s+raise exception 'TRUCK_FIELDS_IMMUTABLE'/);
});

test('la base exige horas sólo donde corresponde', () => {
  assert.match(sql, /coalesce\(v_registra_horas, false\) and new\.horas_inicio is null/);
  // Una jornada abierta antes de prender el interruptor se cierra como siempre.
  assert.match(sql, /if old\.horas_inicio is not null and new\.horas_final is null then/);
  assert.match(sql, /new\.horas_final < old\.horas_inicio/);
  assert.match(sql, /or new\.horas_inicio is distinct from old\.horas_inicio/);
  // Al cerrar, el camión queda con las horas (entero hacia abajo).
  assert.match(sql, /set current_hours = floor\(new\.horas_final\)::int/);
  assert.match(sql, /'registra_horas', t\.registra_horas/);
  assert.doesNotMatch(sql, /drop trigger/);
});

test('la IA lee km y horas de la misma foto, y sin horas responde como antes', () => {
  assert.match(fn, /const conHoras = leer_horas === true/);
  assert.match(fn, /conHoras \? promptKmYHoras\(km_referencia, horas_referencia\) : promptKm\(km_referencia\)/);
  assert.match(fn, /if \(conHoras\) \{[\s\S]*salida\.horas_extraidas/);
  assert.match(sigma, /leer_horas: true, horas_referencia: horas\.horasReferencia/);
  assert.match(sigma, /if \(leerHoras && resultadoIA\.success\) _horasDesdeIA\(prefix, resultadoIA\.horas_extraidas\)/);
});

test('abrir y cerrar piden horas, con carga a mano si la IA no las ve', () => {
  ['nj', 'cj'].forEach(p => {
    assert.match(index, new RegExp(`id="${p}-horas-area" class="jh-horas" hidden`));
    assert.match(index, new RegExp(`id="${p}-horas" placeholder="Ej: 1234,5" oninput="onHorasInput\\('${p}'\\)"`));
  });
  assert.match(sigma, /const horasIni = _horasValidar\('nj', 'nj-error'\);\n  if \(!horasIni\.ok\) return;/);
  assert.match(sigma, /const horasFin = _horasValidar\('cj', 'cj-error'\);\n  if \(!horasFin\.ok\) return;/);
  assert.match(sigma, /La IA no encontró las horas en la foto: escribilas a mano/);
  // También sin señal: van en la cola del teléfono.
  assert.equal((sigma.match(/horasInicio:\s+horasIni\.horas/g) || []).length, 2);
  assert.equal((sigma.match(/horasFinal:\s+horasFin\.horas/g) || []).length, 2);
  assert.match(supa, /horas_inicio:\s+datos\.horasInicio \?\? null/);
  assert.match(supa, /horas_final:\s+datos\.horasFinal \?\? null/);
});

test('las horas aceptan coma o punto decimal', () => {
  const src = sigma.slice(sigma.indexOf('function _parseHoras'), sigma.indexOf('function _fmtHoras'));
  const parse = new Function(src + '; return _parseHoras;')();
  assert.equal(parse('1234,5'), 1234.5);
  assert.equal(parse('1.234,5'), 1234.5);
  assert.equal(parse('1234.5'), 1234.5);
  assert.equal(parse(' 980 '), 980);
  assert.ok(Number.isNaN(parse('')));
  assert.ok(Number.isNaN(parse('abc')));
  assert.ok(Number.isNaN(parse('-3')));
});

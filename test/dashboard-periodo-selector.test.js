const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const shell = read('dashboard-shell-v1.js');
const css = read('dashboard-v1.css');
const index = read('Index.html');
const sigma = read('sigma.js');

test('el período dejó de ser seis pestañas fijas en el HTML', () => {
  const caja = index.match(/<div class="dashx-periodos" id="dashx-periodos">([\s\S]*?)<\/div>/);
  assert.ok(caja, 'falta el contenedor del selector de período');
  assert.equal(caja[1].trim(), '', 'el contenedor lo llena el shell, no el HTML');
  // Los meses del desplegable dependen de la fecha de hoy: no pueden ser markup fijo.
  assert.doesNotMatch(index, /dashxPeriodo\(/);
  assert.doesNotMatch(sigma, /function dashxPeriodo/);
});

test('hay tres formas de elegir período, no sólo ventanas móviles', () => {
  assert.match(shell, /function setPeriodo\(p\)/);
  assert.match(shell, /function setMes\(ym\)/);
  assert.match(shell, /function setRango\(desde, hasta\)/);
  for (const api of ['setMes: setMes', 'setRango: setRango', 'descripcionPeriodo: descripcionPeriodo']) {
    assert.ok(shell.includes(api), `falta ${api} en la API del shell`);
  }
});

test('un mes es el mes calendario completo, no treinta días móviles', () => {
  const fn = shell.split('function rangoDeMes(ym)')[1].split('var MES_CORTO')[0];
  // Día 0 del mes siguiente = último día de éste, sin tabla de días ni bisiestos.
  assert.match(fn, /new Date\(y, m, 0\)/);
  assert.match(fn, /new Date\(y, m - 1, 1\)/);
});

test('el botón publica el rango resuelto para que ninguna etiqueta mienta', () => {
  const fn = shell.split('function descripcionPeriodo()')[1].split('function rangoActual()')[0];
  assert.match(fn, /rangoTexto\(r\.desde, r\.hasta\)/);
  assert.match(shell, /function botonPeriodo\(\)[\s\S]*?d\.rango/);
});

test('un rango al revés no se aplica', () => {
  const fn = shell.split('function setRango(desde, hasta)')[1].split('function botonPeriodo()')[0];
  assert.match(fn, /if \(!desde \|\| !hasta \|\| desde > hasta\) return false;/);
  assert.match(shell, /La fecha "desde" tiene que ser anterior/);
});

test('un solo listener delegado aunque el control se repinte', () => {
  // pintarPeriodo() reescribe el innerHTML en cada cambio: enganchar por nodo
  // dejaría un listener nuevo por repintada.
  assert.match(shell, /if \(caja\.dataset\.perEnganchado === '1'\) return;/);
  assert.match(shell, /caja\.dataset\.perEnganchado = '1';/);
});

test('el desplegable se achica en pantalla chica y la media query va después', () => {
  const base = css.indexOf('#screen-dashboard .dashx-per-pop {');
  const chica = css.indexOf('#screen-dashboard .dashx-per-pop {', base + 1);
  assert.ok(base > -1, 'falta la regla base del desplegable');
  assert.ok(chica > base, 'la media query tiene que ir después: con igual especificidad gana la última');
  assert.match(css.slice(base, chica), /position: absolute/);
  assert.match(css.slice(chica), /flex-direction: column/);
});

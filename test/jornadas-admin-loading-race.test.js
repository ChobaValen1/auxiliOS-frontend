const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g,'\n');

const html = read('Index.html');
const ui = read('sigma.js');

test('un pedido de recarga en vuelo no descarta el filtro que llega mientras espera', () => {
  // Antes: `if (_jadminState.loading) return;` cortaba en seco cualquier
  // cambio de filtro que llegara mientras había un fetch en curso. El
  // estado quedaba actualizado (el picker, el select, el chip activo), pero
  // ese estado nunca se llegaba a pedir al backend: se perdía en silencio
  // hasta que algo más disparara otra recarga.
  assert.match(ui, /let _jadminReloadPending = false;/);

  const reloadFn = ui.split('async function _jadminReload()')[1].split(/\nfunction |\nasync function /)[0];
  assert.match(reloadFn, /_jadminReloadPending = true;\s*\n\s*return;/);

  // Al terminar, si quedó un pedido encolado se encadena uno más con el
  // estado más reciente, en vez de dejarlo perdido.
  assert.match(reloadFn, /if \(_jadminReloadPending\) \{[\s\S]*?_jadminReloadPending = false;\s*\n\s*_jadminReload\(\);/);

  // El spinner no se apaga en el medio de ese encadenamiento: solo se
  // apaga cuando ya no queda nada pendiente, para no mostrar un parpadeo
  // con datos que ya quedaron viejos.
  assert.match(reloadFn, /\} else \{\s*\n\s*_jadminSetCargando\(false\);/);
});

test('el círculo de carga cubre solo el espacio de los datos, nunca los filtros', () => {
  assert.match(ui, /function _jadminSetCargando\(on\) \{/);
  assert.match(ui, /_jadminSetCargando\(true\);/);

  // Dos overlays: uno sobre las tarjetas de KPI, otro sobre las filas de
  // la tabla. Ninguno vive dentro de `.filtros` ni de la fila de chips.
  assert.match(html, /id="jadmin-kpis-loading"/);
  assert.match(html, /id="jadmin-table-loading"/);

  const kpiBlock = html.match(/<div class="jadmin-kpis" id="jadmin-kpis">([\s\S]*?)\n {2}<\/div>\n\n {2}<!-- FILTROS -->/)?.[1] || '';
  assert.match(kpiBlock, /id="jadmin-kpis-loading"/);

  const filtrosBlock = html.match(/<!-- FILTROS -->([\s\S]*?)<!-- TABLA -->/)?.[1] || '';
  assert.doesNotMatch(filtrosBlock, /jadmin-loading-overlay/);

  const tableBlock = html.match(/<!-- TABLA -->([\s\S]*?)<\/div><!-- \/screen-jornadas-admin -->/)?.[1] || '';
  assert.match(tableBlock, /id="jadmin-table-loading"/);

  // El overlay de la tabla vive fuera del contenedor que scrollea, para
  // que el spinner quede fijo en pantalla y no viaje con las filas.
  assert.match(html, /#screen-jornadas-admin \.table-scroll-wrap \{/);
  const scrollWrapBlock = html.match(/<div class="table-scroll-wrap">([\s\S]*?)<div class="table-foot">/)?.[1] || '';
  const scrollInnerEnd = scrollWrapBlock.indexOf('</div>\n    </div>');
  assert.ok(scrollInnerEnd > -1);
});

test('el overlay de carga tiene su propio estilo, sin depender de --accent', () => {
  assert.match(html, /#screen-jornadas-admin \.jadmin-loading-overlay \{/);
  assert.match(html, /#screen-jornadas-admin \.jadmin-loading-overlay\.show \{/);
  assert.match(html, /#screen-jornadas-admin \.jadmin-spinner \{/);
  assert.match(html, /border-top-color: var\(--jadmin-accent\);/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\) \{\s*\n\s*#screen-jornadas-admin \.jadmin-spinner/);
});

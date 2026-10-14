const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const js = fs.readFileSync('dashboard-zoom-v1.js', 'utf8').replace(/\r\n/g, '\n');
const index = fs.readFileSync('Index.html', 'utf8').replace(/\r\n/g, '\n');
const tend = fs.readFileSync('dashboard-tendencia-v1.js', 'utf8').replace(/\r\n/g, '\n');
const res = fs.readFileSync('dashboard-resumen-v1.js', 'utf8').replace(/\r\n/g, '\n');
const sql = fs.readFileSync('migrations/20261007170000_dashboard_historia_v1.sql', 'utf8').replace(/\r\n/g, '\n');

// Los arreglos vienen de otro contexto (vm): se comparan por contenido.
const eq = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);

function cargar(db) {
  const win = {};
  vm.runInNewContext(js, { window: win, _db: db, document: {}, console, Date, Math, Promise, setTimeout });
  return win.AuxZoom;
}

test('el zoom se carga antes que Resumen y Tendencia, y Tendencia suma la escala por mes', () => {
  const i = s => index.indexOf(s);
  assert.ok(i('dashboard-zoom-v1.js') > 0);
  assert.ok(i('dashboard-zoom-v1.js') < i('dashboard-resumen-v1.js'));
  assert.ok(i('dashboard-zoom-v1.js') < i('dashboard-tendencia-v1.js'));
  assert.match(index, /data-tnd-escala="mes"/);
  // Arrastrar en la evolución de Resumen no tiene que abrir Tendencia: sólo el botón.
  assert.doesNotMatch(index, /id="rsm-evol-card"[^>]*onclick/);
  assert.match(index, /<button type="button" class="rsm-link" onclick="dashxIrATendencia\(\)">/);
});

test('las semanas van de lunes a domingo y los meses son calendario', () => {
  const Z = cargar();
  // 1/9/2026 es martes: la primera semana es 1–6 (mar a dom).
  const sem = Z.cubos('2026-09-01', 30, 'semana');
  eq([sem[0].a, sem[0].b], [0, 5]);
  eq([sem[1].a, sem[1].b], [6, 12]);
  assert.equal(sem[1].tit, 'Semana del 7/9 al 13/9/2026');
  const mes = Z.cubos('2026-08-30', 40, 'mes');
  assert.equal(mes.length, 3);
  assert.equal(mes[1].et, 'sep 26');
  eq([mes[1].a, mes[1].b], [2, 31]);
  assert.equal(Z.sumar(mes, Array(40).fill(1)).reduce((a, b) => a + b, 0), 40, 'agrupar no pierde ni duplica días');
  assert.match(Z.cubos('2026-10-01', 31, 'mes', 6)[0].tit, /en curso$/);
});

test('acercar deja quieto el punto del puntero y no sale de la historia', () => {
  const Z = cargar();
  // Ventana 100–199 de 400 puntos, acercar a la mitad con el puntero en el borde derecho.
  eq(Z.zoom(100, 199, 400, 0.5, 1, 3), [150, 199]);
  // En el centro, recorta de los dos lados.
  eq(Z.zoom(100, 199, 400, 0.5, 0.5, 3), [125, 174]);
  // Alejar de más se queda con toda la historia.
  eq(Z.zoom(100, 199, 400, 10, 0.5, 3), [0, 399]);
  // Nunca menos que el mínimo.
  eq(Z.zoom(10, 12, 400, 0.1, 0.5, 3), [10, 12]);
  // Mover respeta los bordes.
  eq(Z.mover(10, 19, 400, -50), [0, 9]);
  eq(Z.mover(10, 19, 400, 1000), [390, 399]);
});

test('los rangos terminan donde termina el período y Todo arranca en el primer dato', () => {
  const Z = cargar();
  const cs = Z.cubos('2025-10-08', 730, 'dia');
  const per = [699, 729];
  const hist = { primer: 150 };
  eq(Z.ventanaRango('periodo', cs, per, hist), [699, 729]);
  eq(Z.ventanaRango('d90', cs, per, hist), [639, 729]);
  eq(Z.ventanaRango('todo', cs, per, hist), [150, 729]);
  // Sin historia suficiente, el botón queda deshabilitado.
  assert.equal(Z.ventanaRango('d365', cs, [20, 50], hist), null);
  assert.equal(Z.textoVentana(cs, 699, 729), '7/9/2027 – 7/10/2027 · 31 días');
});

test('la historia se pide una vez, con dos años y el período anterior entero', async () => {
  const pedidos = [];
  const Z = cargar({ rpc: async (n, a) => { pedidos.push([n, a]); return { data: { desde: a.p_desde, primer_dato: null, facturado: [1, 2, 3], servicios: [0, 1, 0], km_reales: [0, 0, 5] }, error: null }; } });
  const f = { desde: '2026-09-01', hasta: '2026-09-30', empresas: ['e1'], bases: [] };
  const r = Z.rangoHistoria(f);
  assert.ok(r.hDesde <= Z.sumarDias('2026-09-01', -30));
  assert.ok(Z.diasEntre(r.hDesde, r.hHasta) >= 729);
  const h1 = await Z.historia(f);
  const h2 = await Z.historia(f);
  assert.equal(pedidos.length, 1, 'Resumen y Tendencia comparten el pedido');
  assert.equal(pedidos[0][0], 'dashboard_historia_v1');
  eq(pedidos[0][1].p_empresas, ['e1']);
  assert.equal(pedidos[0][1].p_bases, null);
  assert.equal(h1.n, 3);
  assert.equal(h1, h2);
});

test('sin la función nueva, el zoom usa el período y su anterior pegados', async () => {
  const Z = cargar({ rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }) });
  assert.equal(await Z.historia({ desde: '2026-09-01', hasta: '2026-09-03' }), null);
  const h = Z.historiaDePeriodo('2026-09-01', { facturado: [1, 2, 3] }, { facturado: [4, 5, 6] });
  assert.equal(h.desde, '2026-08-29');
  eq(h.facturado, [1, 2, 3, 4, 5, 6]);
  eq(h.servicios, [0, 0, 0, 0, 0, 0]);
});

test('Resumen y Tendencia piden la historia y redibujan sin animar al hacer zoom', () => {
  for (const [nombre, src] of [['tendencia', tend], ['resumen', res]]) {
    assert.match(src, /Z \? Z\.historia\(f\) : null/, nombre);
    assert.match(src, /Z\.historiaDePeriodo\(/, nombre);
    assert.match(src, /\.update\('none'\)/, nombre);
    assert.match(src, /cs\[k\]\.a > L\.hoy \? null : v/, nombre + ': la línea termina hoy');
  }
  assert.match(tend, /navegador: true/);
  assert.match(res, /rangos: \['periodo', 'd90', 'd180', 'd365', 'todo'\]/);
});

test('la función de historia es de solo lectura, con los mismos permisos que Tendencia', () => {
  assert.match(sql, /create or replace function public\.dashboard_historia_v1/);
  assert.match(sql, /stable\s+security definer\s+set search_path to ''/);
  assert.match(sql, /v_role not in \('administracion', 'facturacion', 'supervision'\)/);
  assert.match(sql, /s\.is_test = false/);
  assert.match(sql, /s\.status = 'completed'/);
  assert.match(sql, /group by dia/);
  assert.match(sql, /revoke all on function public\.dashboard_historia_v1\(date, date, uuid\[\], uuid\[\]\) from public, anon/);
  assert.doesNotMatch(sql, /\b(insert|update|delete)\b/i);
});

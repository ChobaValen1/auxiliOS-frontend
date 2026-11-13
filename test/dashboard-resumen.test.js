const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const js = fs.readFileSync('dashboard-resumen-v1.js', 'utf8').replace(/\r\n/g, '\n');
const css = fs.readFileSync('dashboard-resumen-v1.css', 'utf8').replace(/\r\n/g, '\n');
const index = fs.readFileSync('Index.html', 'utf8').replace(/\r\n/g, '\n');
const sql = fs.readFileSync('migrations/20260927100000_dashboard_resumen_v1.sql', 'utf8').replace(/\r\n/g, '\n');

function cargarModulo() {
  const registradas = [];
  const win = {
    AuxDash: { registrarSeccion: s => registradas.push(s), setFiltro() {} },
    AuxDashCharts: { PALETA: ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777'] }
  };
  const ctx = { window: win, document: { getElementById: () => null, addEventListener() {} }, console };
  vm.runInNewContext(js, ctx);
  return { api: win.AuxDashResumen, registradas };
}

test('se registra como la sección facturacion del shell, con sus filtros', () => {
  const { registradas } = cargarModulo();
  assert.equal(registradas.length, 1);
  assert.equal(registradas[0].id, 'facturacion');
  assert.equal(registradas[0].filtros, 'dashx-fact-filtros');
  assert.equal(typeof registradas[0].cargar, 'function');
  assert.equal(typeof registradas[0].alError, 'function');
});

test('una respuesta nula no rompe la normalización ni inventa datos', () => {
  const { api } = cargarModulo();
  const d = api.normalizar(null, null);
  assert.equal(d.hayDatos, false);
  assert.equal(d.empresas.length, 0);
  assert.equal(d.puntos.length, 0);
  assert.equal(d.porClase.length, 0);
});

test('la cobertura depende del radio elegido y la hace el navegador', () => {
  const { api } = cargarModulo();
  const d = { puntos: [[0, 0, 'a', 'b', 5], [0, 0, 'a', 'b', 25], [0, 0, 'a', 'b', null]] };
  const c20 = api.cobertura(d, 20);
  assert.equal(c20.evaluados, 2);
  assert.equal(c20.dentro, 1);
  assert.equal(c20.fuera, 1);
  assert.equal(c20.pct, 50);
  assert.equal(c20.media, 15);
  assert.equal(api.cobertura(d, 30).dentro, 2);
});

test('el Resumen ya no muestra km reales de servicios ni el ratio f/r, y el ranking es una torta con leyenda', () => {
  const html = fs.readFileSync('Index.html', 'utf8'), src = fs.readFileSync('dashboard-resumen-v1.js', 'utf8');
  assert.doesNotMatch(src, /Km reales de servicios|Ratio f\/r|realesSobreFacturados|claseRatio/);
  assert.match(src, /Ticket promedio/);
  assert.match(src, /<th class="rsm-num">Km facturados<\/th>/);
  assert.match(src, /\/vendor\/d3-shape-3\.2\.1\.min\.js/);
  assert.match(src, /rsm-pie-legend/);
  assert.match(src, /estado\.rankSel===nom\?null:nom/);
  assert.ok(fs.existsSync('vendor/d3-shape-3.2.1.min.js') && fs.existsSync('vendor/LICENSE-d3.txt'));
  assert.match(fs.readFileSync('sw.js', 'utf8'), /\/vendor\/d3-shape-3\.2\.1\.min\.js/);
  assert.ok(html.includes('id="rsm-ranking"'));
});

test('los tipos de vehículo salen de vehicle_class, con Otros para lo que no tiene', () => {
  const { api } = cargarModulo();
  const d = api.normalizar({}, { por_clase: [{ clase: 'light', servicios: 1 }, { clase: 'otros', servicios: 1 }, { clase: 'raro', servicios: 1 }] });
  assert.deepEqual(d.porClase.map(k => k.nombre), ['Liviano', 'Otros', 'Otros']);
  assert.match(sql, /coalesce\(vehicle_class, 'otros'\)/);
});

test('los nombres de la base se escapan antes de ir al DOM', () => {
  assert.match(js, /esc\(e\.nombre\)/);
  assert.match(js, /esc\(b\.nombre\)/);
  assert.match(js, /esc\(k\.nombre\)/);
});

test('la RPC nueva sigue las convenciones del repo', () => {
  assert.match(sql, /create or replace function public\.dashboard_resumen_v1\(/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path to ''/);
  assert.match(sql, /revoke all on function public\.dashboard_resumen_v1\(date, date, uuid\[\], uuid\[\]\) from public, anon/);
  assert.match(sql, /'administracion', 'facturacion', 'supervision'/);
  assert.match(sql, /s\.is_test = false/);
  assert.match(sql, /s\.status = 'completed'/);
});

test('el período anterior del gráfico dura lo mismo y se alinea día por día', () => {
  assert.match(sql, /v_prev_desde := v_desde - v_dias/);
  assert.match(sql, /generate_series\(0, v_dias - 1\)/);
});

test('el markup trae todo lo que pinta el módulo', () => {
  ['dashx-fact-kpis', 'dashx-fact-mapa', 'rsm-mapa-stats', 'rsm-mapa-leyenda', 'rsm-radio',
   'rsm-circulos', 'rsm-lineas', 'rsm-ranking', 'rsm-tipos-lista', 'rsm-evol-canvas',
   'rsm-eficiencia', 'dashx-fact-empresas', 'dashx-titulo', 'dashx-subtitulo']
    .forEach(id => assert.ok(index.includes(`id="${id}"`), `falta #${id}`));
  assert.match(index, /dashboard-resumen-v1\.js/);
  assert.match(index, /dashboard-resumen-v1\.css/);
  assert.doesNotMatch(index, /dashboard-facturacion-v1\.js|dashboard-mapa-v1\.js/);
});

test('los interruptores del mapa son accesibles', () => {
  assert.match(index, /id="rsm-circulos" role="switch" aria-checked="true"/);
  assert.match(index, /id="rsm-lineas" role="switch" aria-checked="false"/);
  assert.match(js, /setAttribute\('aria-checked'/);
});

test('el CSS del resumen está scopeado al dashboard', () => {
  const selectores = css.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}').map(b => b.split('{').slice(-2)[0].trim())
    .filter(s => s && !s.startsWith('@'));
  selectores.forEach(s => s.split(',').forEach(sel =>
    assert.match(sel.trim(), /^#screen-dashboard\b/, `selector sin scope: ${sel.trim()}`)));
});

test('la variación se lee sin depender del color', () => {
  assert.match(js, /\(sube \? '\+' : '−'\)/);
  assert.match(js, /sin comparación/);
});

test('rendimiento de la flota: sólo cuando casi todo el trabajo está cargado como servicio', () => {
  const { api } = cargarModulo();
  const t = { km: 30000 };
  const completo = api.normalizarFlota({ actual: { km: 40000 }, remitos: { firmados: 100, con_servicio: 95 } }, false);
  const parcial = api.normalizarFlota({ actual: { km: 40000 }, remitos: { firmados: 281, con_servicio: 8 } }, false);
  const filtrado = api.normalizarFlota({ actual: { km: 40000 }, remitos: { firmados: 100, con_servicio: 100 } }, true);
  assert.ok(Math.abs(api.rendimientoFlota(t, completo) + 100/3) < 1e-10);
  assert.equal(api.rendimientoFlota({ km: 100 }, { ...completo, km: 80 }), 20);
  assert.equal(api.rendimientoFlota({ km: 100 }, { ...completo, km: 120 }), -20);
  assert.equal(api.rendimientoFlota(t, parcial), null);
  assert.equal(api.rendimientoFlota(t, filtrado), null);
  assert.equal(api.rendimientoFlota(t, null), null);
});

test('ranking prioritizes amount and groups the tail without changing totals or input order',()=>{
 const {api}=cargarModulo();const empresas=Array.from({length:8},(_,i)=>({nombre:'P'+i,monto:(i+1)*100,servicios:i+1}));const original=JSON.stringify(empresas),rows=api.rankingRows({empresas});
 assert.equal(rows.length,6);assert.equal(rows[0].nombre,'P7');assert.equal(rows.at(-1).nombre,'Otras 3 prestadoras');assert.equal(rows.reduce((n,r)=>n+r.monto,0),3600);assert.ok(Math.abs(rows.reduce((n,r)=>n+r.share,0)-100)<1e-8);assert.equal(JSON.stringify(empresas),original);
});
test('zero revenue does not manufacture percentages',()=>{const {api}=cargarModulo();assert.equal(api.rankingRows({empresas:[{nombre:'Prueba',monto:0,servicios:2}]})[0].share,null);assert.equal(api.rankingRows({empresas:[]}).length,0);});
test('summary puts evolution before geography, keeps exact-value access and avoids repeated efficiency KPI',()=>{
 const section=index.slice(index.indexOf('id="dashx-sec-facturacion"'),index.indexOf('<!-- SECCIÓN 1b'));
 assert.ok(section.indexOf('id="rsm-evol-card"')<section.indexOf('id="rsm-geography"'));assert.ok(section.includes('id="rsm-evol-data"'));assert.match(section,/<section class="rsm-card rsm-mapa-card rsm-pinned" id="rsm-geography"/);assert.doesNotMatch(section,/rsm-disclosure/);assert.match(section,/id="rsm-provider-detail"/);assert.ok(section.indexOf('id="rsm-eficiencia"')<section.indexOf('id="rsm-tipos-lista"')&&section.indexOf('id="rsm-tipos-lista"')<section.indexOf('id="rsm-geography"'),'eficiencia y tipo en la misma fila, antes del mapa');assert.match(js,/ServiceRouteMap\.loadSdk/);assert.doesNotMatch(js,/maplibre/);assert.doesNotMatch(js,/tile\('Eficiencia de km'/);assert.doesNotMatch(js,/rpc\(RPC_FLOTA/);assert.doesNotMatch(js,/type: 'doughnut'/);
});
test('con exactamente 6 prestadoras se muestran todas (no «Otras 1 prestadoras»)', () => {
  const { api } = cargarModulo();
  const rows = api.rankingRows({ empresas: Array.from({ length: 6 }, (_, i) => ({ id: i, nombre: 'P' + i, monto: (i + 1) * 100, servicios: 1 })) });
  assert.equal(rows.length, 6);
  assert.ok(rows.every(r => !/^Otras/.test(r.nombre)));
});
test('evolución: pestañas Diario, Acumulado (con proyección) y Por prestadora (una consulta por prestadora)', () => {
  const html = fs.readFileSync('Index.html', 'utf8'), src = fs.readFileSync('dashboard-resumen-v1.js', 'utf8');
  for (const v of ['diario', 'acum', 'prest']) assert.match(html, new RegExp('data-evol-vista="' + v + '"'));
  assert.match(html, /id="rsm-evol-alt"/);
  assert.match(src, /function pintarAcumulado/);
  assert.match(src, /Al ritmo actual cerraría en/);
  assert.match(src, /rpc\(RPC_RES, Object\.assign\(\{ p_empresas: \[id\] \}, base\)\)/);
  assert.match(src, /setFiltro\('empresas', ya \? \[\] : \[id\]\)/);
  assert.match(src, /Diferencia: /);
});

test('facturación por tipo: % facturado contra % de servicios y lectura sólo si un tipo rinde más', () => {
  const { api } = cargarModulo();
  const d = api.normalizar({}, { por_clase: [
    { clase: 'light', servicios: 512, km: 1, monto: 24800000 },
    { clase: 'semi_heavy', servicios: 148, km: 1, monto: 9400000 },
    { clase: 'heavy', servicios: 64, km: 1, monto: 7100000 },
    { clase: 'uml', servicios: 0, km: 0, monto: 0 }
  ] });
  const t = api.filasTipos(d);
  assert.equal(t.filas.length, 3, 'sin los tipos sin servicios');
  assert.equal(t.filas[0].nombre, 'Liviano');
  assert.equal(Math.round(t.filas[2].pm), 17);
  assert.equal(Math.round(t.filas[2].ps), 9);
  assert.equal(Math.round(t.filas[2].porServ), 110938);
  assert.match(api.lecturaTipos(t), /Los <b>pesados<\/b> son el 9% de los servicios pero dejan el <b>17%<\/b>/);
  const parejo = api.filasTipos(api.normalizar({}, { por_clase: [
    { clase: 'light', servicios: 10, monto: 1000 }, { clase: 'heavy', servicios: 10, monto: 1000 }] }));
  assert.equal(api.lecturaTipos(parejo), '');
  assert.match(index, /<p>¿Qué tipo deja más por servicio\?<\/p>/);
  assert.match(css, /\.rsm-tv-row \{ display: grid/);
});

test('mapa: agrupa por celda de pantalla y deja sueltos los grupos chicos', () => {
  const { api } = cargarModulo();
  const items = [
    { x: 10, y: 10, i: 0 }, { x: 20, y: 30, i: 1 }, { x: 40, y: 50, i: 2 }, { x: 50, y: 12, i: 3 },
    { x: 300, y: 300, i: 4 }, { x: 310, y: 305, i: 5 }
  ];
  const g = api.agrupar(items, 56, 4);
  assert.equal(g.grupos.length, 1);
  assert.deepEqual(Array.from(g.grupos[0].idx), [0, 1, 2, 3]);
  assert.equal(g.grupos[0].x, 30);
  assert.deepEqual(Array.from(g.sueltos), [4, 5]);
});

test('mapa: fuera de radio por base, con lo facturado si el punto lo trae', () => {
  const { api } = cargarModulo();
  const d = api.normalizar({}, {
    bases: [{ id: 'b1', nombre: 'CABA', lat: -34.6, lng: -58.4 }, { id: 'b2', nombre: 'La Plata', lat: -34.9, lng: -57.9 }],
    puntos: [[-58.4, -34.6, 'e1', 'b1', 5, 1000], [-58.5, -34.7, 'e1', 'b1', 31, 2500], [-58.6, -34.8, 'e2', 'b1', 40, 500],
             [-57.9, -34.9, 'e2', 'b2', 25, 4000], [-57.8, -34.9, 'e2', 'b2', null, 100]]
  });
  const f20 = api.fueraDeRadio(d, 20);
  assert.equal(f20.servicios, 3);
  assert.equal(f20.monto, 7000);
  assert.equal(f20.montoTotal, 8100);
  assert.equal(f20.conMonto, true);
  assert.equal(JSON.stringify(f20.filas.map(x => [x.base, x.servicios, x.monto])), JSON.stringify([['CABA', 2, 3000], ['La Plata', 1, 4000]]));
  assert.equal(api.fueraDeRadio(d, 35).servicios, 1);
  const viejo = api.normalizar({}, { bases: [], puntos: [[-58.4, -34.6, 'e1', 'b1', 50]] });
  assert.equal(api.fueraDeRadio(viejo, 20).conMonto, false, 'sin el sexto elemento no inventa montos');
  assert.match(api.iconoGrupo(12, '#7c8cff', 3).url, /^data:image\/svg\+xml/);
});

test('mapa: vista Puntos/Calor, solo fuera de radio y migración con el monto por punto', () => {
  const mig = fs.readFileSync('migrations/20261113190000_dashboard_resumen_monto_por_punto_v1.sql', 'utf8');
  assert.match(mig, /round\(u\.km::numeric, 1\), round\(u\.monto::numeric, 0\)\)\)/);
  assert.match(mig, /cer\.base_id, cer\.km, a\.monto/);
  assert.match(index, /data-mapa-vista="puntos" aria-pressed="true">Puntos<\/button><button type="button" data-mapa-vista="calor"/);
  assert.match(index, /id="rsm-solo-fuera" role="switch" aria-checked="false"/);
  assert.match(index, /id="rsm-mapa-fuera" hidden/);
  assert.match(js, /new maps\.OverlayView\(\)/);
  assert.doesNotMatch(js, /HeatmapLayer|visualization/);
});

test('mapa: dos grupos con centros cercanos se funden para que las burbujas no se pisen', () => {
  const { api } = cargarModulo();
  const a = [70, 80, 90, 99].map((x, i) => ({ x, y: 100, i }));
  const b = [101, 102, 103, 104].map((x, i) => ({ x, y: 100, i: i + 4 }));
  const g = api.agrupar(a.concat(b), 30, 4);
  assert.equal(g.grupos.length, 1);
  assert.equal(g.grupos[0].idx.length, 8);
});

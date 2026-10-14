/* Panel · pestaña TENDENCIA.
   Cómo viene el período día a día (o semana a semana) y contra el anterior.
   Comparte con Resumen el período y los filtros de prestadora y base (la misma
   barra: el shell la muestra si alguna de las dos está a la vista).

   Pide dos RPC en paralelo:
   · dashboard_tendencia_v1: series diarias de facturado, servicios y km
     reales, del período, del anterior y por prestadora.
   · dashboard_facturacion_v1: los totales de la comparación de períodos, los
     mismos que muestra Resumen.

   Agrupar por semana suma días de una serie que ya viene hecha: no hay
   agregado de filas de la base en el navegador. */
(function (global) {
  'use strict';

  var RPC_TEND = 'dashboard_tendencia_v1';
  var RPC_FACT = 'dashboard_facturacion_v1';
  var GUION = '—';
  var MAX_PRESTADORAS = 7;
  var COLOR_OTROS = '#5a6278';

  var METRICAS = {
    facturado: { nombre: 'Facturado', barras: 'Facturación por prestadora' },
    servicios: { nombre: 'Servicios', barras: 'Servicios por prestadora' },
    km_reales: { nombre: 'Km reales', barras: 'Km reales por prestadora' }
  };

  /* hist: serie diaria larga para el zoom (dashboard-zoom-v1.js); per: días
     del período dentro de esa serie; vista: días que se están mirando, para
     no perder el zoom al cambiar de métrica o de escala. */
  var estado = { metrica: 'facturado', escala: 'dia', datos: null, hist: null, per: null, vista: null, linea: null };
  var chartLinea = null;
  var chartBarras = null;
  var zoomLinea = null;

  function el(id) { return document.getElementById(id); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function lista(v) { return Array.isArray(v) ? v : []; }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function miles(v, dec) {
    return num(v).toLocaleString('es-AR', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  }
  function pesos(v) { return '$ ' + miles(Math.round(num(v))); }
  function pesosCorto(v) {
    var n = num(v), a = Math.abs(n);
    if (a >= 1e6) return '$' + miles(n / 1e6, 1) + 'M';
    if (a >= 1e3) return '$' + miles(Math.round(n / 1e3)) + 'K';
    return '$' + miles(Math.round(n));
  }
  function fecha(iso) {
    var p = String(iso || '').slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '';
  }

  function formato(metrica, v, corto) {
    if (metrica === 'facturado') return corto ? pesosCorto(v) : pesos(v);
    if (metrica === 'km_reales') return miles(v) + (corto ? '' : ' km');
    return miles(v);
  }

  /* ── normalización ────────────────────────────────────────────────────── */

  function serie(o, k) { return lista(o && o[k]).map(num); }

  function normalizar(tend, fact) {
    var t = tend && typeof tend === 'object' ? tend : {};
    var f = fact && typeof fact === 'object' ? fact : {};
    var tot = f.totales || {}, ant = f.anterior || {}, re = f.reales || {};
    var pal = (global.AuxDashCharts && global.AuxDashCharts.PALETA) ||
      ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'];
    var empresas = lista(t.por_empresa).map(function (e, i) {
      return {
        id: e.id || null,
        nombre: String(e.nombre || 'Sin prestadora'),
        color: i < MAX_PRESTADORAS ? pal[i % pal.length] : COLOR_OTROS,
        facturado: serie(e, 'facturado'), servicios: serie(e, 'servicios'), km_reales: serie(e, 'km_reales')
      };
    });
    /* Más de siete prestadoras: la cola se suma en una sola barra "Otras",
       con el gris de siempre. La paleta validada no se cicla. */
    if (empresas.length > MAX_PRESTADORAS) {
      var cola = empresas.slice(MAX_PRESTADORAS);
      var otras = { id: null, nombre: 'Otras', color: COLOR_OTROS, facturado: [], servicios: [], km_reales: [] };
      ['facturado', 'servicios', 'km_reales'].forEach(function (k) {
        otras[k] = cola[0][k].map(function (_, i) {
          return cola.reduce(function (s, e) { return s + num(e[k][i]); }, 0);
        });
      });
      empresas = empresas.slice(0, MAX_PRESTADORAS).concat([otras]);
    }
    return {
      desde: t.desde || f.desde || null,
      hasta: t.hasta || f.hasta || null,
      actual: { facturado: serie(t.actual, 'facturado'), servicios: serie(t.actual, 'servicios'), km_reales: serie(t.actual, 'km_reales') },
      anterior: { facturado: serie(t.anterior, 'facturado'), servicios: serie(t.anterior, 'servicios'), km_reales: serie(t.anterior, 'km_reales') },
      empresas: empresas,
      comparacion: {
        facturado: [num(tot.facturado), num(ant.facturado)],
        servicios: [num(tot.servicios), num(ant.servicios)],
        km_reales: [num(re.km_reales), num(ant.km_reales)],
        peajes: [num(tot.peajes), num(ant.peajes)],
        ticket: [num(tot.servicios) ? num(tot.facturado) / num(tot.servicios) : null,
                 num(ant.servicios) ? num(ant.facturado) / num(ant.servicios) : null]
      },
      rangoAnterior: f.comparativo && f.comparativo.desde
        ? fecha(f.comparativo.desde) + ' al ' + fecha(f.comparativo.hasta) : ''
    };
  }

  /* ── días y semanas ───────────────────────────────────────────────────── */

  function fechaDe(d, i) {
    var base = d.desde ? new Date(String(d.desde).slice(0, 10) + 'T12:00:00') : null;
    return base ? new Date(base.getTime() + i * 86400000) : null;
  }

  /* Cortes de semana: lunes a domingo, recortados al período. Devuelve, por
     semana, el índice del primer y del último día. */
  function semanas(d, n) {
    var cortes = [], ini = 0;
    for (var i = 0; i < n; i++) {
      var f = fechaDe(d, i);
      var finDeSemana = f ? f.getDay() === 0 : (i - ini) === 6;
      if (finDeSemana || i === n - 1) { cortes.push([ini, i]); ini = i + 1; }
    }
    return cortes;
  }

  function etiquetaDia(d, i) {
    var f = fechaDe(d, i);
    return f ? f.getDate() + '/' + (f.getMonth() + 1) : String(i + 1);
  }

  function escalar(d, valores, n) {
    if (estado.escala === 'dia') return valores.slice(0, n);
    return semanas(d, n).map(function (c) {
      var s = 0;
      for (var i = c[0]; i <= c[1]; i++) s += num(valores[i]);
      return s;
    });
  }

  function etiquetas(d, n) {
    if (estado.escala === 'dia') {
      var out = [];
      for (var i = 0; i < n; i++) out.push(etiquetaDia(d, i));
      return out;
    }
    return semanas(d, n).map(function (c) {
      return c[0] === c[1] ? etiquetaDia(d, c[0]) : etiquetaDia(d, c[0]) + '–' + etiquetaDia(d, c[1]);
    });
  }

  /* ── pintado ──────────────────────────────────────────────────────────── */

  function ejes(metrica) {
    return {
      x: { grid: { display: false }, border: { display: false },
           ticks: { color: '#8590ab', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 16 } },
      y: { beginAtZero: true, border: { display: false },
           grid: { color: 'rgba(37,42,56,0.9)' },
           ticks: { color: '#8590ab', font: { size: 10 }, maxTicksLimit: 5, precision: 0,
                    callback: function (v) { return formato(metrica, v, true); } } }
    };
  }

  var UNIDAD = { dia: ['día', 'días'], semana: ['semana', 'semanas'], mes: ['mes', 'meses'] };

  /* La ventana [i0, i1] de la serie larga: etiquetas, valores y, para la
     línea punteada, la ventana del mismo largo justo antes. */
  function datosVentana(L, i0, i1) {
    var span = i1 - i0 + 1;
    var cs = L.cs.slice(i0, i1 + 1);
    var conAnio = cs.length && cs[0].ini.getFullYear() !== cs[cs.length - 1].fin.getFullYear() && estado.escala !== 'mes';
    var ant = [];
    for (var k = 0; k < span; k++) { var j = i0 + k - span; ant.push(j >= 0 ? L.vals[j] : null); }
    return {
      span: span,
      labels: cs.map(function (c) { return conAnio ? c.et + '/' + String(c.ini.getFullYear()).slice(2) : c.et; }),
      act: L.vals.slice(i0, i1 + 1).map(function (v, k) { return cs[k].a > L.hoy ? null : v; }),
      ant: ant,
      hayAnt: ant.some(function (v) { return v > 0; })
    };
  }

  function textoSub(w) {
    var u = UNIDAD[estado.escala] || UNIDAD.dia;
    var cuantos = w.span === 1 ? 'el ' + u[0] + ' anterior' : (estado.escala === 'semana' ? 'las ' : 'los ') + w.span + ' ' + u[1] + ' anteriores';
    return (w.hayAnt ? 'Línea punteada: ' + cuantos : 'Sin datos en ' + cuantos + ' para comparar') +
      ' · ' + METRICAS[estado.metrica].nombre + ' por ' + u[0];
  }

  function alCambiarZoom(i0, i1) {
    var L = estado.linea;
    if (!L) return;
    estado.vista = [L.cs[i0].a, L.cs[i1].b];
    L.i0 = i0;
    var w = datosVentana(L, i0, i1);
    var sub = el('tnd-sub');
    if (sub) sub.textContent = textoSub(w);
    if (!chartLinea) return;
    chartLinea.data.labels = w.labels;
    chartLinea.data.datasets[0].data = w.act;
    chartLinea.data.datasets[0].pointRadius = w.span <= 16 ? 3 : 0;
    chartLinea.data.datasets[1].data = w.ant;
    chartLinea.data.datasets[1].hidden = !w.hayAnt;
    chartLinea.update('none');
  }

  function controlZoom() {
    var Z = global.AuxZoom, cv = el('tnd-linea');
    if (zoomLinea || !Z || !cv) return zoomLinea;
    zoomLinea = Z.crear(cv.closest('.rsm-card') || cv.parentNode.parentNode, {
      canvas: cv,
      grafico: function () { return chartLinea; },
      alCambiar: alCambiarZoom,
      navegador: true,
      ventanaDeRango: function (id) {
        return estado.linea ? Z.ventanaRango(id, estado.linea.cs, estado.per, estado.hist) : null;
      },
      texto: function (i0, i1) { return estado.linea ? Z.textoVentana(estado.linea.cs, i0, i1) : ''; }
    });
    return zoomLinea;
  }

  function pintarLinea(d) {
    var Z = global.AuxZoom, h = estado.hist;
    if (!Z || !h || !estado.per) { pintarLineaPeriodo(d); return; }
    var cv = el('tnd-linea');
    if (chartLinea) { chartLinea.destroy(); chartLinea = null; }
    var m = estado.metrica;
    var titulo = el('tnd-titulo');
    var per = global.AuxDash && global.AuxDash.descripcionPeriodo ? global.AuxDash.descripcionPeriodo().titulo : '';
    if (titulo) titulo.textContent = 'Evolución temporal' + (per ? ' · ' + per : '');
    var hoy = Z.diasEntre(h.desde, Z.hoy());
    var cs = Z.cubos(h.desde, h.n, estado.escala, hoy);
    var L = { cs: cs, vals: Z.sumar(cs, h[m]), i0: 0, hoy: hoy };
    estado.linea = L;
    var minimo = estado.escala === 'dia' ? 3 : 2;
    var v = estado.vista ? [Z.cuboDe(cs, estado.vista[0]), Z.cuboDe(cs, estado.vista[1])] : Z.ventanaRango('periodo', cs, estado.per, h);
    v = Z.acotar(v[0], v[1], cs.length, minimo);
    L.i0 = v[0];
    var w = datosVentana(L, v[0], v[1]);
    var sub = el('tnd-sub');
    if (sub) sub.textContent = textoSub(w);
    var ctl = controlZoom();
    if (!cv || typeof global.Chart === 'undefined') { if (ctl) ctl.datos(cs.length, v, L.vals, minimo); return; }
    var grad = cv.getContext('2d').createLinearGradient(0, 0, 0, cv.clientHeight || 240);
    grad.addColorStop(0, 'rgba(245,166,35,0.28)');
    grad.addColorStop(1, 'rgba(245,166,35,0)');
    chartLinea = new global.Chart(cv, {
      type: 'line',
      data: {
        labels: w.labels,
        datasets: [{
          label: 'Actual', data: w.act, borderColor: '#f5a623', backgroundColor: grad,
          fill: true, borderWidth: 2, tension: 0.35, pointRadius: w.span <= 16 ? 3 : 0, pointHoverRadius: 4
        }, {
          label: 'Anterior', data: w.ant, hidden: !w.hayAnt, borderColor: 'rgba(232,234,242,0.55)', borderDash: [4, 4],
          fill: false, borderWidth: 1.5, tension: 0.35, pointRadius: 0, pointHoverRadius: 3, spanGaps: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            title: function (it) { var c = it.length ? L.cs[L.i0 + it[0].dataIndex] : null; return c ? c.tit : ''; },
            label: function (c) {
              if (c.datasetIndex === 0) return ' Actual: ' + formato(m, c.parsed.y);
              var span = c.chart.data.labels.length;
              var prev = L.cs[L.i0 + c.dataIndex - span];
              return ' Anterior' + (prev ? ' (' + prev.et + ')' : '') + ': ' + formato(m, c.parsed.y);
            } } }
        },
        scales: ejes(m)
      }
    });
    if (ctl) ctl.datos(cs.length, v, L.vals, minimo);
  }

  /* Sin el control de zoom: sólo el período y su anterior, como antes. */
  function pintarLineaPeriodo(d) {
    var cv = el('tnd-linea');
    if (chartLinea) { chartLinea.destroy(); chartLinea = null; }
    var m = estado.metrica;
    var n = Math.max(d.actual[m].length, d.anterior[m].length);
    var act = escalar(d, d.actual[m], n), ant = escalar(d, d.anterior[m], n);
    var hayAnt = ant.some(function (v) { return v > 0; });
    var titulo = el('tnd-titulo');
    var per = global.AuxDash && global.AuxDash.descripcionPeriodo ? global.AuxDash.descripcionPeriodo().titulo : '';
    if (titulo) titulo.textContent = 'Evolución temporal' + (per ? ' · ' + per : '');
    var sub = el('tnd-sub');
    if (sub) sub.textContent = (hayAnt ? 'Línea punteada: período anterior' : 'Sin datos del período anterior para comparar') +
      ' · ' + METRICAS[m].nombre + (estado.escala === 'semana' ? ' por semana' : ' por día');
    if (!cv || typeof global.Chart === 'undefined') return;
    var grad = cv.getContext('2d').createLinearGradient(0, 0, 0, cv.clientHeight || 240);
    grad.addColorStop(0, 'rgba(245,166,35,0.28)');
    grad.addColorStop(1, 'rgba(245,166,35,0)');
    var series = [{
      label: 'Período actual', data: act, borderColor: '#f5a623', backgroundColor: grad,
      fill: true, borderWidth: 2, tension: 0.4, pointRadius: estado.escala === 'semana' ? 3 : 0, pointHoverRadius: 4
    }];
    if (hayAnt) series.push({
      label: 'Período anterior', data: ant, borderColor: 'rgba(232,234,242,0.55)', borderDash: [4, 4],
      fill: false, borderWidth: 1.5, tension: 0.4, pointRadius: 0, pointHoverRadius: 3
    });
    chartLinea = new global.Chart(cv, {
      type: 'line',
      data: { labels: etiquetas(d, n), datasets: series },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + formato(m, c.parsed.y); } } }
        },
        scales: ejes(m)
      }
    });
  }

  function pintarBarras(d) {
    var cv = el('tnd-barras');
    if (chartBarras) { chartBarras.destroy(); chartBarras = null; }
    var m = estado.metrica;
    var n = d.actual[m].length;
    var h = el('tnd-barras-titulo');
    if (h) h.textContent = METRICAS[m].barras;
    var sub = el('tnd-barras-sub');
    if (sub) sub.textContent = 'Composición apilada de cada ' + (estado.escala === 'dia' ? 'día' : 'semana') + ' del período';
    var lg = el('tnd-barras-leyenda');
    if (lg) {
      lg.innerHTML = d.empresas.map(function (e) {
        return '<span><i style="background:' + e.color + '"></i>' + esc(e.nombre) + '</span>';
      }).join('');
    }
    var vacio = el('tnd-barras-vacio');
    var hay = d.empresas.some(function (e) { return e[m].some(function (v) { return v > 0; }); });
    if (vacio) vacio.hidden = hay;
    if (!cv || typeof global.Chart === 'undefined') return;
    chartBarras = new global.Chart(cv, {
      type: 'bar',
      data: {
        labels: etiquetas(d, n),
        datasets: d.empresas.map(function (e) {
          return { label: e.nombre, data: escalar(d, e[m], n), backgroundColor: e.color,
                   borderWidth: 0, borderRadius: 2, barPercentage: 0.78, categoryPercentage: 0.9 };
        })
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: function (it) { return num(it.parsed.y) > 0; },
            callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + formato(m, c.parsed.y); } }
          }
        },
        scales: (function () {
          var e = ejes(m);
          e.x.stacked = true; e.y.stacked = true;
          return e;
        })()
      }
    });
  }

  var FLECHA_SUBE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 11l4-4 3 3 5-5M10 5h4v4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var FLECHA_BAJA = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5l4 4 3-3 5 5M10 11h4V7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function delta(a, b) {
    if (a == null || b == null || b <= 0) return '<span class="rsm-delta is-flat">sin comparación</span>';
    var v = (a - b) * 100 / b;
    if (Math.abs(v) < 0.05) return '<span class="rsm-delta is-flat">= anterior</span>';
    var sube = v > 0;
    return '<span class="rsm-delta ' + (sube ? 'is-up' : 'is-down') + '">' + (sube ? FLECHA_SUBE : FLECHA_BAJA) +
      (sube ? '+' : '−') + miles(Math.abs(v), 1) + '%</span>';
  }

  function pintarComparacion(d) {
    var n = el('tnd-comparacion');
    if (!n) return;
    var sub = el('tnd-comp-sub');
    var per = global.AuxDash && global.AuxDash.descripcionPeriodo ? global.AuxDash.descripcionPeriodo().titulo : 'Período actual';
    if (sub) sub.textContent = per + ' vs. período anterior' + (d.rangoAnterior ? ' (' + d.rangoAnterior + ')' : '');
    var c = d.comparacion;
    var filas = [
      ['Facturado', c.facturado, pesos],
      ['Servicios', c.servicios, function (v) { return miles(v); }],
      ['Km reales', c.km_reales, function (v) { return miles(v); }],
      ['Peajes', c.peajes, pesos],
      ['Ticket promedio', c.ticket, pesos]
    ];
    n.innerHTML = filas.map(function (f) {
      var a = f[1][0], b = f[1][1];
      return '<div class="tnd-comp-fila"><div><b>' + f[0] + '</b><span>antes ' + (b == null ? GUION : f[2](b)) + '</span></div>' +
        '<strong>' + (a == null ? GUION : f[2](a)) + '</strong>' + delta(a, b) + '</div>';
    }).join('');
  }

  function pintar() {
    var d = estado.datos;
    if (!d) return;
    pintarLinea(d);
    pintarBarras(d);
    pintarComparacion(d);
  }

  function pintarSegmentos() {
    document.querySelectorAll('#dashx-sec-tendencia [data-tnd-metrica]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-tnd-metrica') === estado.metrica ? 'true' : 'false');
    });
    document.querySelectorAll('#dashx-sec-tendencia [data-tnd-escala]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-tnd-escala') === estado.escala ? 'true' : 'false');
    });
  }

  /* ── carga ────────────────────────────────────────────────────────────── */

  function paramArray(v) { var a = lista(v).filter(Boolean); return a.length ? a : null; }

  async function rpc(nombre, args) {
    var db = (typeof _db !== 'undefined') ? _db : null;
    if (!db || typeof db.rpc !== 'function') throw new Error('Sin conexión con la base de datos');
    var res = await db.rpc(nombre, args);
    if (res && res.error) throw res.error;
    return res ? res.data : null;
  }

  async function cargar(filtros) {
    var f = filtros || {};
    var rango = el('dashx-fact-sub');
    if (rango) rango.textContent = f.desde && f.hasta ? 'del ' + fecha(f.desde) + ' al ' + fecha(f.hasta) : '';
    var base = { p_desde: f.desde || null, p_hasta: f.hasta || null,
                 p_empresas: paramArray(f.empresas), p_bases: paramArray(f.bases) };
    var Z = global.AuxZoom;
    var r = await Promise.all([
      rpc(RPC_TEND, base),
      rpc(RPC_FACT, Object.assign({ p_conceptos: null }, base)),
      Z ? Z.historia(f) : null
    ]);
    var d = normalizar(r[0], r[1]);
    estado.datos = d;
    estado.hist = Z && d.desde ? (r[2] || Z.historiaDePeriodo(d.desde, d.anterior, d.actual)) : null;
    estado.per = estado.hist ? [Z.diasEntre(estado.hist.desde, d.desde), Z.diasEntre(estado.hist.desde, d.hasta || d.desde)] : null;
    estado.vista = null;
    pintar();
  }

  function mensajeError(e) {
    var codigo = e && e.code ? String(e.code) : '';
    var texto = e && e.message ? String(e.message) : '';
    if (codigo === 'PGRST202' || /Could not find the function/i.test(texto)) return 'La tendencia todavía no está disponible en la base.';
    if (/Sin permiso/i.test(texto)) return 'No tenés permiso para ver la tendencia.';
    return 'No se pudo cargar la tendencia.';
  }

  function alError(_c, e) {
    var n = el('tnd-comparacion');
    if (n) n.innerHTML = '<div class="rsm-vacio is-error">' + esc(mensajeError(e)) + '</div>';
  }

  function montar() {
    var sec = el('dashx-sec-tendencia');
    if (!sec || sec.dataset.listo === '1') return;
    sec.dataset.listo = '1';
    sec.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-tnd-metrica],[data-tnd-escala]');
      if (!b) return;
      if (b.hasAttribute('data-tnd-metrica')) estado.metrica = b.getAttribute('data-tnd-metrica');
      else estado.escala = b.getAttribute('data-tnd-escala');
      pintarSegmentos();
      pintar();
    });
    pintarSegmentos();
  }

  function registrar() {
    if (!global.AuxDash) return false;
    global.AuxDash.registrarSeccion({
      id: 'tendencia',
      filtros: 'dashx-fact-filtros',
      montar: montar,
      cargar: cargar,
      alError: alError
    });
    return true;
  }

  if (!registrar()) document.addEventListener('DOMContentLoaded', registrar, { once: true });

  global.AuxDashTendencia = {
    normalizar: normalizar,
    semanas: semanas,
    escalar: function (d, v, n, escala) {
      var prev = estado.escala;
      estado.escala = escala || prev;
      var out = escalar(d, v, n);
      estado.escala = prev;
      return out;
    }
  };
})(window);

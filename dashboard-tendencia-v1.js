/* Panel · pestaña TENDENCIA.
   ¿Estamos creciendo? Los últimos 12 meses, mes a mes, contra el mismo tramo
   del año anterior. No depende del período de arriba: la tendencia necesita
   su propia ventana (el período elegido sigue mandando en Resumen).
   Comparte con Resumen los filtros de prestadora y base.

   Pide una sola RPC, dashboard_tendencia_v1, con un rango propio de 24 meses
   (del 1° del mes de hace 23 meses a hoy): el año actual y el anterior, con
   las series diarias del total y por prestadora. Agrupar por mes suma días de
   una serie que ya viene hecha: no hay agregado de filas de la base en el
   navegador.

   El mes en curso no está completo: no se lo compara contra un mes entero de
   hace un año, sino contra los mismos días de ese mes. */
(function (global) {
  'use strict';

  var RPC_TEND = 'dashboard_tendencia_v1';
  var GUION = '—';
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MAX_FILAS = 8;
  var COLOR_BARRA = '#3987e5';
  var COLOR_MEJOR = '#f5a623';
  var COLOR_ANTERIOR = '#8590ab';

  var METRICAS = {
    facturado: { nombre: 'Facturado', titulo: 'Facturación mes a mes' },
    servicios: { nombre: 'Servicios', titulo: 'Servicios mes a mes' },
    ticket: { nombre: 'Ticket promedio', titulo: 'Ticket promedio mes a mes' }
  };
  var RANGOS = { '6m': 6, '1a': 12, todo: 24 };

  var estado = { metrica: 'facturado', rango: '1a', datos: null };
  var chartMeses = null;

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
    if (a >= 1e6) return '$ ' + miles(n / 1e6, a >= 1e8 ? 0 : 1) + ' M';
    if (a >= 1e3) return '$ ' + miles(Math.round(n / 1e3)) + ' K';
    return '$ ' + miles(Math.round(n));
  }
  function formato(metrica, v, corto) {
    if (v == null) return GUION;
    if (metrica === 'servicios') return miles(v);
    return corto ? pesosCorto(v) : pesos(v);
  }

  /* ── fechas (siempre texto AAAA-MM-DD, sin husos horarios) ────────────── */

  function aUtc(iso) {
    var p = String(iso).slice(0, 10).split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }
  function diasEntre(a, b) { return Math.round((aUtc(b) - aUtc(a)) / 86400000); }
  function aIso(y, m, d) {
    return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function diasDelMes(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
  function partes(iso) { var p = String(iso).slice(0, 10).split('-'); return { y: +p[0], m: +p[1] - 1, d: +p[2] }; }
  /* El mismo día de hace un año; el 29/2 cae en el 28/2. */
  function menosAnio(iso) {
    var p = partes(iso);
    return aIso(p.y - 1, p.m, Math.min(p.d, diasDelMes(p.y - 1, p.m)));
  }
  /* El día `d` del mes que está `n` meses antes que el de `iso` (d recortado). */
  function mesAtras(iso, n, d) {
    var p = partes(iso), t = p.y * 12 + p.m - n, y = Math.floor(t / 12), m = t - y * 12;
    return aIso(y, m, Math.min(d, diasDelMes(y, m)));
  }
  function primeroDeMesAtras(hoy, n) { return mesAtras(hoy, n, 1); }

  function hoyLocal() {
    var f = new Date();
    return aIso(f.getFullYear(), f.getMonth(), f.getDate());
  }

  /* ── modelo ───────────────────────────────────────────────────────────── */

  function serie(o, k) { return lista(o && o[k]).map(num); }

  function suma(arr, a, b) {
    var s = 0;
    for (var i = Math.max(0, a); i <= b && i < arr.length; i++) s += arr[i];
    return s;
  }

  /* Cubos mensuales de la serie diaria. Cada uno sabe su primer y último
     índice; `curso` marca el mes de hoy si todavía no terminó. */
  function mesesDe(desde, n, hoy) {
    var out = [], prev = null, f = partes(desde);
    for (var i = 0; i < n; i++) {
      var t = new Date(Date.UTC(f.y, f.m, f.d + i));
      var clave = t.getUTCFullYear() * 12 + t.getUTCMonth();
      if (clave !== prev) {
        out.push({ y: t.getUTCFullYear(), m: t.getUTCMonth(), a: i, b: i, clave: clave });
        prev = clave;
      } else out[out.length - 1].b = i;
    }
    var h = partes(hoy);
    out.forEach(function (c) {
      c.et = MESES[c.m] + ' ' + String(c.y).slice(2);
      c.nombre = MESES_L[c.m] + ' ' + c.y;
      c.curso = c.y === h.y && c.m === h.m && h.d < diasDelMes(h.y, h.m);
    });
    return out;
  }

  /* El modelo completo a partir de la respuesta de la RPC. `hoy` va por
     parámetro para poder probarlo. Devuelve null si no hay serie. */
  function armar(t, hoy) {
    var o = t && typeof t === 'object' ? t : null;
    if (!o || !o.desde) return null;
    var desde = String(o.desde).slice(0, 10);
    var act = { facturado: serie(o.actual, 'facturado'), servicios: serie(o.actual, 'servicios') };
    var n = act.facturado.length;
    if (!n) return null;
    var meses = mesesDe(desde, n, hoy);
    var hoyIdx = Math.min(n - 1, diasEntre(desde, hoy));

    var ms = meses.map(function (c, i) {
      var tope = Math.min(c.b, hoyIdx);
      var m = { c: c, fact: suma(act.facturado, c.a, tope), serv: suma(act.servicios, c.a, tope) };
      /* El mismo mes del año anterior; el mes en curso, sólo hasta el mismo día. */
      var ant = null;
      for (var j = 0; j < meses.length; j++) if (meses[j].y === c.y - 1 && meses[j].m === c.m) ant = meses[j];
      if (ant) {
        var topeAnt = c.curso ? Math.min(ant.b, ant.a + partes(hoy).d - 1) : ant.b;
        m.antFact = suma(act.facturado, ant.a, topeAnt);
        m.antServ = suma(act.servicios, ant.a, topeAnt);
        m.hayAnt = true;
      } else { m.antFact = null; m.antServ = null; m.hayAnt = false; }
      m.idx = i;
      return m;
    });

    /* Ventana de 12 meses: del 1° de hace 11 meses a hoy, contra las mismas
       fechas un año antes. */
    var ini12 = primeroDeMesAtras(hoy, 11);
    var a12 = diasEntre(desde, ini12), a12p = diasEntre(desde, menosAnio(ini12)), b12p = diasEntre(desde, menosAnio(hoy));
    var claveIni12 = partes(ini12).y * 12 + partes(ini12).m;
    var v12 = ms.filter(function (m) { return m.c.clave >= claveIni12 && m.c.a <= hoyIdx; });
    var cerrados = v12.filter(function (m) { return !m.c.curso; });
    var cerradosAnt = cerrados.filter(function (m) { return m.hayAnt; });
    function prom(arr, k) { return arr.length ? suma(arr.map(function (m) { return m[k]; }), 0, arr.length - 1) / arr.length : null; }
    var tot = {
      fact: suma(act.facturado, a12, hoyIdx), serv: suma(act.servicios, a12, hoyIdx),
      antFact: a12p >= 0 ? suma(act.facturado, a12p, b12p) : null,
      antServ: a12p >= 0 ? suma(act.servicios, a12p, b12p) : null
    };
    tot.ticket = tot.serv > 0 ? tot.fact / tot.serv : null;
    tot.antTicket = tot.antServ > 0 ? tot.antFact / tot.antServ : null;
    tot.promedio = prom(cerrados, 'fact');
    tot.antPromedio = cerradosAnt.length === cerrados.length ? prom(cerradosAnt, 'antFact') : null;
    var mejor = null;
    cerrados.forEach(function (m) { if (!mejor || m.fact > mejor.fact) mejor = m; });
    if (mejor && mejor.fact <= 0) mejor = null;

    /* Prestadoras: 3 meses contra los 3 anteriores, y la curva de 12 meses. */
    var h = partes(hoy);
    var a3 = diasEntre(desde, primeroDeMesAtras(hoy, 2));
    var a3p = diasEntre(desde, primeroDeMesAtras(hoy, 5));
    var b3p = diasEntre(desde, mesAtras(hoy, 3, h.d));
    var empresas = lista(o.por_empresa).map(function (e) {
      var f = serie(e, 'facturado');
      /* La curva sólo con meses cerrados: el que está en curso bajaría de golpe. */
      var curva = cerrados.map(function (m) { return suma(f, m.c.a, m.c.b); });
      return { id: e.id || null, nombre: String(e.nombre || 'Sin prestadora'), diario: f, curva: curva,
               a: suma(f, a3, hoyIdx), b: a3p >= 0 ? suma(f, a3p, b3p) : null, doce: suma(f, a12, hoyIdx) };
    }).filter(function (e) { return e.a > 0 || e.b > 0 || e.doce > 0; });
    empresas.sort(function (x, y) { return y.a - x.a || y.doce - x.doce; });
    if (empresas.length > MAX_FILAS) {
      var cola = empresas.slice(MAX_FILAS - 1);
      var otras = { id: null, nombre: 'Otras ' + cola.length, a: 0, b: 0, doce: 0, curva: cerrados.map(function () { return 0; }) };
      cola.forEach(function (e) {
        otras.a += e.a; otras.b += e.b == null ? 0 : e.b; otras.doce += e.doce;
        e.curva.forEach(function (v, i) { otras.curva[i] += v; });
      });
      empresas = empresas.slice(0, MAX_FILAS - 1).concat([otras]);
    }
    var totalA = 0;
    empresas.forEach(function (e) { totalA += e.a; });

    return { desde: desde, hoy: hoy, meses: ms, v12: v12, total: tot, mejor: mejor, cerrados: cerrados.length,
             enCurso: ms.length && ms[ms.length - 1].c.curso ? ms[ms.length - 1] : null,
             empresas: empresas, totalA: totalA,
             rango12: MESES[partes(ini12).m] + ' ' + partes(ini12).y + ' a ' + MESES[h.m] + ' ' + h.y,
             rango12Ant: MESES[partes(menosAnio(ini12)).m] + ' ' + partes(menosAnio(ini12)).y + ' a ' + MESES[partes(menosAnio(hoy)).m] + ' ' + partes(menosAnio(hoy)).y };
  }

  /* ── valores de la serie mensual según la métrica ─────────────────────── */

  function valorMes(m, metrica, anterior) {
    var f = anterior ? m.antFact : m.fact, s = anterior ? m.antServ : m.serv;
    if (anterior && !m.hayAnt) return null;
    if (metrica === 'servicios') return s;
    if (metrica === 'ticket') return s > 0 ? f / s : null;
    return f;
  }

  function visibles(d) {
    var ms = d.meses.slice();
    if (estado.rango === 'todo') {
      var i = 0;
      while (i < ms.length - 1 && ms[i].fact <= 0 && ms[i].serv <= 0) i++;
      return ms.slice(i);
    }
    return ms.slice(-RANGOS[estado.rango]);
  }

  /* ── delta ────────────────────────────────────────────────────────────── */

  var FLECHA_SUBE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 11l4-4 3 3 5-5M10 5h4v4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var FLECHA_BAJA = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5l4 4 3-3 5 5M10 11h4V7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function variacion(a, b) {
    if (a == null || b == null || b <= 0) return null;
    return (a - b) * 100 / b;
  }

  function delta(a, b, contra, plano) {
    var titulo = contra ? ' data-ax-explica title="' + esc(contra) + '"' : '';
    var v = variacion(a, b);
    if (v == null) return '<span class="rsm-delta is-flat"' + titulo + '>sin comparación</span>';
    if (Math.abs(v) < (plano || 0.05)) return '<span class="rsm-delta is-flat"' + titulo + '>= anterior</span>';
    var sube = v > 0;
    return '<span class="rsm-delta ' + (sube ? 'is-up' : 'is-down') + '"' + titulo + '>' + (sube ? FLECHA_SUBE : FLECHA_BAJA) +
      (sube ? '+' : '−') + miles(Math.abs(v), 1) + '%</span>';
  }

  /* ── frase y cifras ───────────────────────────────────────────────────── */

  function pintarFrase(d) {
    var n = el('tnd-frase'), sub = el('tnd-frase-sub');
    if (!n) return;
    var t = d.total;
    if (!(t.fact > 0) && !(t.serv > 0)) {
      n.textContent = 'Todavía no hay facturación en los últimos 12 meses para mostrar.';
      if (sub) sub.textContent = '';
      return;
    }
    var v = variacion(t.fact, t.antFact);
    var html = 'En los últimos 12 meses facturaste <b>' + esc(pesosCorto(t.fact)) + '</b>';
    if (v == null) html += ', sin un año anterior para comparar';
    else if (Math.abs(v) < 0.5) html += ', lo mismo que los 12 anteriores';
    else html += ', <span class="' + (v > 0 ? 'opx-sube' : 'opx-baja') + '">' + miles(Math.abs(v), v > -10 && v < 10 ? 1 : 0) +
      ' % ' + (v > 0 ? 'más' : 'menos') + '</span> que los 12 anteriores';
    html += '.';
    if (d.mejor) html += ' El mejor mes fue <b>' + esc(MESES_L[d.mejor.c.m]) + ' (' + esc(pesosCorto(d.mejor.fact)) + ')</b>';
    if (d.enCurso) html += (d.mejor ? '; ' : ' ') + esc(MESES_L[d.enCurso.c.m]) + ' todavía está en curso';
    if (d.mejor || d.enCurso) html += '.';
    n.innerHTML = html;
    if (sub) sub.textContent = d.rango12 + ' · comparado con ' + d.rango12Ant + ' · no depende del período de arriba';
  }

  function tile(label, v, deltaHtml, pie, destacado, titulo) {
    return '<div class="rsm-kpi' + (destacado ? ' is-main' : '') + '">' +
      '<div class="rsm-kpi-label">' + esc(label) + '</div>' +
      '<div class="rsm-kpi-value"' + (titulo ? ' title="' + esc(titulo) + '"' : '') + '>' + v + '</div>' +
      '<div class="rsm-kpi-delta">' + deltaHtml + '</div>' +
      '<div class="rsm-kpi-foot">' + pie + '</div></div>';
  }

  function pintarKpis(d) {
    var n = el('tnd-kpis');
    if (!n) return;
    var t = d.total, contra = 'Contra ' + d.rango12Ant;
    var mesesPie = d.cerrados + (d.cerrados === 1 ? ' mes cerrado' : ' meses cerrados');
    n.innerHTML =
      tile('Facturado 12 meses', t.fact > 0 ? pesosCorto(t.fact) : GUION, delta(t.fact, t.antFact, contra), 'Contra los 12 anteriores', true, pesos(t.fact)) +
      tile('Promedio mensual', t.promedio == null ? GUION : pesosCorto(t.promedio), delta(t.promedio, t.antPromedio, 'Contra los mismos meses del año anterior'), mesesPie, false, t.promedio == null ? '' : pesos(t.promedio)) +
      tile('Servicios 12 meses', miles(t.serv), delta(t.serv, t.antServ, contra), 'Finalizados', false) +
      tile('Ticket promedio', t.ticket == null ? GUION : pesos(t.ticket), delta(t.ticket, t.antTicket, contra), 'Facturado por servicio', false);
  }

  /* ── gráfico mes a mes ────────────────────────────────────────────────── */

  function pintarGrafico(d) {
    var cv = el('tnd-meses');
    if (chartMeses) { chartMeses.destroy(); chartMeses = null; }
    var m = estado.metrica;
    var vis = visibles(d);
    var titulo = el('tnd-meses-titulo');
    if (titulo) titulo.textContent = METRICAS[m].titulo;
    var vals = vis.map(function (x) { return valorMes(x, m, false); });
    var ants = vis.map(function (x) { return valorMes(x, m, true); });
    var hayAnt = ants.some(function (v) { return v != null && v > 0; });
    var sub = el('tnd-meses-sub');
    if (sub) sub.textContent = 'Barras: ' + (m === 'ticket' ? 'cada mes' : 'este año') + (hayAnt ? ' · línea punteada: mismo mes del año anterior' : ' · sin datos del año anterior para comparar') +
      (d.enCurso ? ' · el mes en curso va hasta hoy' : '');
    var vacio = el('tnd-meses-vacio');
    var hay = vals.some(function (v) { return v != null && v > 0; });
    if (vacio) vacio.hidden = hay;
    if (!cv || typeof global.Chart === 'undefined') return;
    var mejor = -1;
    vis.forEach(function (x, i) { if (!x.c.curso && vals[i] != null && (mejor < 0 || vals[i] > vals[mejor])) mejor = i; });
    var pal = (global.AuxDashCharts && global.AuxDashCharts.PALETA) || [];
    var azul = pal[0] || COLOR_BARRA;
    chartMeses = new global.Chart(cv, {
      data: {
        labels: vis.map(function (x) { return x.c.et; }),
        datasets: [{
          type: 'bar', label: 'Este año', data: vals, order: 2,
          backgroundColor: vis.map(function (x, i) { return x.c.curso ? 'rgba(245,166,35,0.3)' : (i === mejor ? COLOR_MEJOR : azul); }),
          borderColor: vis.map(function (x) { return x.c.curso ? COLOR_MEJOR : 'transparent'; }),
          borderWidth: vis.map(function (x) { return x.c.curso ? 1.5 : 0; }),
          borderRadius: 4, barPercentage: 0.78, categoryPercentage: 0.9
        }, {
          type: 'line', label: 'Año anterior', data: ants, order: 1, hidden: !hayAnt,
          borderColor: COLOR_ANTERIOR, borderDash: [5, 4], borderWidth: 1.8, fill: false, tension: 0,
          pointRadius: 2.5, pointBackgroundColor: COLOR_ANTERIOR, pointHoverRadius: 4, spanGaps: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function (it) {
                var x = it.length ? vis[it[0].dataIndex] : null;
                return x ? x.c.nombre + (x.c.curso ? ' · en curso, hasta hoy' : '') : '';
              },
              label: function (c) {
                if (c.parsed.y == null) return null;
                return ' ' + c.dataset.label + ': ' + formato(m, c.parsed.y);
              },
              afterBody: function (it) {
                var x = it.length ? vis[it[0].dataIndex] : null;
                if (!x) return '';
                var v = variacion(valorMes(x, m, false), valorMes(x, m, true));
                return v == null ? '' : 'Variación: ' + (v > 0 ? '+' : v < 0 ? '−' : '') + miles(Math.abs(v), 1) + '%';
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, border: { display: false },
               ticks: { color: '#8590ab', font: { size: 10 }, maxRotation: 0, autoSkip: true } },
          y: { beginAtZero: true, border: { display: false }, grid: { color: 'rgba(37,42,56,0.9)' },
               ticks: { color: '#8590ab', font: { size: 10 }, maxTicksLimit: 5, precision: 0,
                        callback: function (v) { return formato(m, v, true); } } }
        }
      }
    });
  }

  /* ── tabla de prestadoras ─────────────────────────────────────────────── */

  function curva(valores, clase) {
    var n = valores.length;
    if (n < 2) return '';
    var mx = 0, mn = Infinity;
    valores.forEach(function (v) { if (v > mx) mx = v; if (v < mn) mn = v; });
    var rango = mx - mn || 1;
    var pts = valores.map(function (v, i) {
      return (i * 90 / (n - 1) + 1).toFixed(1) + ',' + (24 - (v - mn) / rango * 22).toFixed(1);
    }).join(' ');
    return '<svg class="tnd-spark ' + clase + '" viewBox="0 0 92 26" width="92" height="26" aria-hidden="true">' +
      '<polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function pintarTabla(d) {
    var n = el('tnd-prest');
    if (!n) return;
    if (!d.empresas.length) { n.innerHTML = '<div class="rsm-vacio">Sin facturación por prestadora en este tramo.</div>'; return; }
    n.innerHTML = '<div class="rsm-tabla-wrap"><table class="rsm-tabla tnd-tabla">' +
      '<thead><tr><th>Prestadora</th><th>Últimos 3 meses</th><th>Variación</th><th>Participación</th><th>12 meses</th></tr></thead><tbody>' +
      d.empresas.map(function (e) {
        var v = variacion(e.a, e.b);
        var clase = v == null || Math.abs(v) < 2 ? 'is-flat' : (v > 0 ? 'is-up' : 'is-down');
        var part = d.totalA > 0 ? e.a * 100 / d.totalA : 0;
        return '<tr><td class="tnd-td-nombre" data-label="Prestadora"><b>' + esc(e.nombre) + '</b></td>' +
          '<td data-label="Últimos 3 meses">' + esc(pesosCorto(e.a)) + '</td>' +
          '<td data-label="Variación">' + delta(e.a, e.b, 'Contra los 3 meses anteriores, a la misma altura del mes', 2) + '</td>' +
          '<td data-label="Participación">' + miles(part, 0) + ' %</td>' +
          '<td data-label="12 meses">' + curva(e.curva, clase) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function pintar() {
    var d = estado.datos;
    if (!d) return;
    pintarFrase(d);
    pintarKpis(d);
    pintarGrafico(d);
    pintarTabla(d);
  }

  function pintarSegmentos() {
    document.querySelectorAll('#dashx-sec-tendencia [data-tnd-metrica]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-tnd-metrica') === estado.metrica ? 'true' : 'false');
    });
    document.querySelectorAll('#dashx-sec-tendencia [data-tnd-rango]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-tnd-rango') === estado.rango ? 'true' : 'false');
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

  var cargaActual = 0;
  async function cargar(filtros) {
    var carga = ++cargaActual;
    var f = filtros || {};
    var hoy = hoyLocal();
    var r = await rpc(RPC_TEND, {
      p_desde: primeroDeMesAtras(hoy, 23), p_hasta: hoy,
      p_empresas: paramArray(f.empresas), p_bases: paramArray(f.bases)
    });
    if (carga !== cargaActual) return;
    estado.datos = armar(r, hoy);
    var vacio = el('tnd-vacio');
    if (vacio) vacio.hidden = !!estado.datos;
    if (!estado.datos) { limpiar(); return; }
    pintar();
  }

  function limpiar() {
    if (chartMeses) { chartMeses.destroy(); chartMeses = null; }
    ['tnd-frase', 'tnd-frase-sub', 'tnd-kpis', 'tnd-prest'].forEach(function (id) {
      var n = el(id); if (n) n.textContent = '';
    });
  }

  function mensajeError(e) {
    var codigo = e && e.code ? String(e.code) : '';
    var texto = e && e.message ? String(e.message) : '';
    if (codigo === 'PGRST202' || /Could not find the function/i.test(texto)) return 'La tendencia todavía no está disponible en la base.';
    if (/Sin permiso/i.test(texto)) return 'No tenés permiso para ver la tendencia.';
    return 'No se pudo cargar la tendencia.';
  }

  function alError(_c, e) {
    estado.datos = null;
    limpiar();
    var n = el('tnd-frase');
    if (n) n.textContent = mensajeError(e);
  }

  function montar() {
    var sec = el('dashx-sec-tendencia');
    if (!sec || sec.dataset.listo === '1') return;
    sec.dataset.listo = '1';
    sec.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-tnd-metrica],[data-tnd-rango]');
      if (!b) return;
      if (b.hasAttribute('data-tnd-metrica')) estado.metrica = b.getAttribute('data-tnd-metrica');
      else estado.rango = b.getAttribute('data-tnd-rango');
      pintarSegmentos();
      if (estado.datos) pintarGrafico(estado.datos);
    });
    pintarSegmentos();
  }

  function registrar() {
    if (!global.AuxDash) return false;
    global.AuxDash.registrarSeccion({
      id: 'tendencia',
      filtros: 'dashx-fact-filtros',
      periodo: false,
      montar: montar,
      cargar: cargar,
      alError: alError
    });
    return true;
  }

  if (!registrar()) document.addEventListener('DOMContentLoaded', registrar, { once: true });

  global.AuxDashTendencia = { armar: armar, menosAnio: menosAnio, valorMes: valorMes };
})(window);

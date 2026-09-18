/* Motor de gráficos del dashboard.
   Un solo theme y una sola paleta para todos los gráficos de las 3 secciones.
   La paleta categórica está validada (banda de luminosidad, croma, separación CVD,
   piso de visión normal y contraste) contra la superficie #191d27. No cambiar un
   hex sin volver a correr el validador: los pares adyacentes se eligieron para que
   sigan siendo distinguibles en protanopía y tritanopía. */
(function (global) {
  'use strict';

  var SUP = '#191d27';

  // Orden fijo. Nunca se cicla: la serie 8 va a "Otros", no a un hue generado.
  var CATEGORICA = [
    '#3987e5', '#d95926', '#199e70', '#c98500',
    '#d55181', '#008300', '#9085e9'
  ];

  // Reservados para estado. Nunca se usan como serie.
  var ESTADO = {
    ok:      '#27c47a',
    aviso:   '#f5a623',
    critico: '#e2504a'
  };

  var TINTA = {
    principal: '#e8eaf2',
    media:     '#8590ab',
    tenue:     '#5a6278',
    grilla:    '#252a38'
  };

  var FUENTE = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

  var instancias = Object.create(null);

  function hayChart() {
    return typeof global.Chart !== 'undefined';
  }

  function color(i) {
    return CATEGORICA[i % CATEGORICA.length];
  }

  function nfMiles(v) {
    return Number(v || 0).toLocaleString('es-AR');
  }

  function nfPesos(v) {
    return '$' + Math.round(Number(v || 0)).toLocaleString('es-AR');
  }

  function canvasDe(id) {
    var el = typeof id === 'string' ? document.getElementById(id) : id;
    return el && el.tagName === 'CANVAS' ? el : null;
  }

  function destruir(id) {
    var key = typeof id === 'string' ? id : (id && id.id);
    if (key && instancias[key]) {
      instancias[key].destroy();
      delete instancias[key];
    }
  }

  /* El overlay se monta sobre el contenedor del canvas, no sobre el canvas:
     Chart.js reescribe el contenido del canvas y se llevaría puesto el mensaje. */
  function overlay(id, texto, clase) {
    var cv = canvasDe(id);
    if (!cv || !cv.parentElement) return;
    destruir(id);
    var cont = cv.parentElement;
    var prev = cont.querySelector('.auxch-overlay');
    if (prev) prev.remove();
    if (!texto) return;
    var div = document.createElement('div');
    div.className = 'auxch-overlay' + (clase ? ' ' + clase : '');
    div.textContent = texto;
    cont.appendChild(div);
  }

  function limpiarOverlay(id) {
    var cv = canvasDe(id);
    if (!cv || !cv.parentElement) return;
    var prev = cv.parentElement.querySelector('.auxch-overlay');
    if (prev) prev.remove();
  }

  function vacio(id, mensaje) {
    overlay(id, mensaje || 'Sin datos para este período', 'auxch-vacio');
  }

  function cargando(id) {
    overlay(id, 'Cargando…', 'auxch-cargando');
  }

  function error(id, mensaje) {
    overlay(id, mensaje || 'No se pudieron cargar los datos', 'auxch-error');
  }

  function tooltipBase() {
    return {
      backgroundColor: '#13161d',
      borderColor: TINTA.grilla,
      borderWidth: 1,
      titleColor: TINTA.principal,
      bodyColor: TINTA.media,
      padding: 10,
      cornerRadius: 6,
      displayColors: true,
      boxWidth: 10,
      boxHeight: 10,
      boxPadding: 4
    };
  }

  function leyendaBase() {
    return {
      display: true,
      position: 'bottom',
      labels: {
        color: TINTA.media,
        font: { family: FUENTE, size: 11 },
        boxWidth: 10,
        boxHeight: 10,
        usePointStyle: true,
        pointStyle: 'circle',
        padding: 12
      }
    };
  }

  function ejeBase(mostrarGrilla) {
    return {
      grid: {
        color: TINTA.grilla,
        drawBorder: false,
        display: mostrarGrilla !== false
      },
      ticks: {
        color: TINTA.tenue,
        font: { family: FUENTE, size: 10 }
      }
    };
  }

  function montar(id, config) {
    var cv = canvasDe(id);
    if (!cv) return null;
    if (!hayChart()) {
      error(id, 'Gráficos no disponibles sin conexión');
      return null;
    }
    limpiarOverlay(id);
    destruir(id);
    var key = typeof id === 'string' ? id : cv.id;
    var chart = new global.Chart(cv, config);
    if (key) instancias[key] = chart;
    return chart;
  }

  /* Dona. Etiquetas directas en el tooltip + leyenda, nunca color solo. */
  function donut(id, datos) {
    var labels = (datos && datos.labels) || [];
    var values = (datos && datos.values) || [];
    if (!labels.length || !values.some(function (v) { return Number(v) > 0; })) {
      return vacio(id, datos && datos.vacio);
    }
    var fmt = (datos && datos.formato) === 'pesos' ? nfPesos : nfMiles;
    var total = values.reduce(function (a, b) { return a + Number(b || 0); }, 0);
    return montar(id, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: labels.map(function (_, i) { return color(i); }),
          borderColor: SUP,
          borderWidth: 2,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: leyendaBase(),
          tooltip: Object.assign(tooltipBase(), {
            callbacks: {
              label: function (ctx) {
                var v = Number(ctx.parsed || 0);
                var pct = total ? Math.round(v * 1000 / total) / 10 : 0;
                return ' ' + ctx.label + ': ' + fmt(v) + ' (' + pct + '%)';
              }
            }
          })
        }
      }
    });
  }

  /* Barras. Horizontal cuando las etiquetas son nombres (choferes, camiones). */
  function barras(id, datos) {
    var labels = (datos && datos.labels) || [];
    var values = (datos && datos.values) || [];
    if (!labels.length) return vacio(id, datos && datos.vacio);
    var horizontal = !!(datos && datos.horizontal);
    var fmt = (datos && datos.formato) === 'pesos' ? nfPesos : nfMiles;
    var unidad = (datos && datos.unidad) || '';
    return montar(id, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: (datos && datos.color) || CATEGORICA[0],
          borderRadius: 4,
          borderSkipped: false,
          barPercentage: 0.7,
          categoryPercentage: 0.8
        }]
      },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: Object.assign(tooltipBase(), {
            callbacks: {
              label: function (ctx) {
                var v = horizontal ? ctx.parsed.x : ctx.parsed.y;
                return ' ' + fmt(v) + (unidad ? ' ' + unidad : '');
              }
            }
          })
        },
        scales: {
          x: Object.assign(ejeBase(horizontal), { beginAtZero: true }),
          y: Object.assign(ejeBase(!horizontal), { beginAtZero: true })
        }
      }
    });
  }

  /* Línea. Un solo eje: dos magnitudes distintas van en dos gráficos. */
  function linea(id, datos) {
    var labels = (datos && datos.labels) || [];
    var series = (datos && datos.series) || [];
    if (!labels.length || !series.length) return vacio(id, datos && datos.vacio);
    var fmt = (datos && datos.formato) === 'pesos' ? nfPesos : nfMiles;
    return montar(id, {
      type: 'line',
      data: {
        labels: labels,
        datasets: series.map(function (s, i) {
          return {
            label: s.label,
            data: s.values,
            borderColor: color(i),
            backgroundColor: color(i),
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBorderColor: SUP,
            pointBorderWidth: 2,
            tension: 0.3,
            fill: false
          };
        })
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: series.length > 1 ? leyendaBase() : { display: false },
          tooltip: Object.assign(tooltipBase(), {
            callbacks: {
              label: function (ctx) {
                return ' ' + (ctx.dataset.label ? ctx.dataset.label + ': ' : '') + fmt(ctx.parsed.y);
              }
            }
          })
        },
        scales: {
          x: ejeBase(false),
          y: Object.assign(ejeBase(true), { beginAtZero: true })
        }
      }
    });
  }

  /* Treemap: la composición de servicios del sketch (cada caja con % y nombre).
     Requiere chartjs-chart-treemap; si no cargó, cae a barras horizontales en
     vez de dejar el hueco vacío. */
  function treemap(id, datos) {
    var items = (datos && datos.items) || [];
    if (!items.length) return vacio(id, datos && datos.vacio);

    var registrado = hayChart() && global.Chart.registry
      && global.Chart.registry.controllers
      && !!global.Chart.registry.controllers.get
      && (function () {
        try { return !!global.Chart.registry.controllers.get('treemap'); }
        catch (e) { return false; }
      })();

    if (!registrado) {
      return barras(id, {
        labels: items.map(function (x) { return x.label; }),
        values: items.map(function (x) { return x.value; }),
        horizontal: true,
        formato: datos && datos.formato
      });
    }

    var total = items.reduce(function (a, b) { return a + Number(b.value || 0); }, 0);
    return montar(id, {
      type: 'treemap',
      data: {
        datasets: [{
          tree: items,
          key: 'value',
          labels: {
            display: true,
            color: '#ffffff',
            font: { family: FUENTE, size: 11, weight: '600' },
            formatter: function (ctx) {
              var it = ctx.raw && ctx.raw._data;
              if (!it) return '';
              var pct = total ? Math.round(Number(it.value || 0) * 100 / total) : 0;
              return [it.label, pct + '%'];
            }
          },
          backgroundColor: function (ctx) {
            return ctx.type === 'data' ? color(ctx.dataIndex) : 'transparent';
          },
          borderColor: SUP,
          borderWidth: 2,
          spacing: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: Object.assign(tooltipBase(), {
            callbacks: {
              title: function () { return ''; },
              label: function (ctx) {
                var it = ctx.raw && ctx.raw._data;
                if (!it) return '';
                var pct = total ? Math.round(Number(it.value || 0) * 1000 / total) / 10 : 0;
                return ' ' + it.label + ': ' + nfMiles(it.value) + ' (' + pct + '%)';
              }
            }
          })
        }
      }
    });
  }

  /* Agrupa la cola larga en "Otros": la paleta tiene 7 slots y no se cicla. */
  function topN(items, n) {
    var max = n || CATEGORICA.length;
    var orden = items.slice().sort(function (a, b) {
      return Number(b.value || 0) - Number(a.value || 0);
    });
    if (orden.length <= max) return orden;
    var cabeza = orden.slice(0, max - 1);
    var resto = orden.slice(max - 1).reduce(function (a, b) {
      return a + Number(b.value || 0);
    }, 0);
    cabeza.push({ label: 'Otros', value: resto });
    return cabeza;
  }

  global.AuxDashCharts = {
    PALETA: CATEGORICA,
    ESTADO: ESTADO,
    TINTA: TINTA,
    SUPERFICIE: SUP,
    color: color,
    donut: donut,
    barras: barras,
    linea: linea,
    treemap: treemap,
    topN: topN,
    destruir: destruir,
    vacio: vacio,
    cargando: cargando,
    error: error,
    nfMiles: nfMiles,
    nfPesos: nfPesos
  };
})(window);

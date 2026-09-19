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

  function leyendaBase(posicion) {
    return {
      display: true,
      position: posicion || 'bottom',
      // Abajo la leyenda se come alto del gráfico; al costado se come ancho,
      // que en una tarjeta de un tercio sobra y en el alto no.
      labels: {
        color: TINTA.media,
        font: { family: FUENTE, size: 11 },
        boxWidth: 10,
        boxHeight: 10,
        usePointStyle: true,
        pointStyle: 'circle',
        padding: posicion === 'right' ? 9 : 12
      }
    };
  }

  function ejeBase(mostrarGrilla, esValor) {
    var ticks = {
      color: TINTA.tenue,
      font: { family: FUENTE, size: 10 }
    };
    if (esValor) {
      // Sólo en el eje de valores: en el de categorías Chart.js pasa el índice
      // al callback, y formatearlo reemplazaba las etiquetas por 0, 1, 2…
      // Acá sí hace falta, porque por defecto escribe 3,500,000 y no 3.500.000.
      ticks.callback = function (v) {
        return typeof v === 'number' ? v.toLocaleString('es-AR') : v;
      };
    }
    return {
      grid: {
        color: TINTA.grilla,
        drawBorder: false,
        display: mostrarGrilla !== false
      },
      ticks: ticks
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

  /* Dona o torta. Etiquetas directas en el tooltip + leyenda, nunca color solo.
     `tipo: 'torta'` saca el agujero: sirve para distinguir dos gráficos de
     parte-sobre-total que están en la misma pantalla y responden preguntas
     distintas.
     `alFiltrar` recibe las etiquetas que quedaron visibles cuando alguien tacha
     una de la leyenda, para que los números del costado acompañen al gráfico. */
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
        cutout: (datos && datos.tipo) === 'torta' ? 0 : '62%',
        plugins: {
          legend: Object.assign(
            leyendaBase((datos && datos.leyenda) === 'derecha' ? 'right' : 'bottom'),
            (datos && typeof datos.alFiltrar === 'function')
              ? { onClick: alTocarLeyenda(datos.alFiltrar) }
              : {}
          ),
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

  /* Envuelve el toggle propio de Chart.js: hace lo de siempre y después avisa
     qué etiquetas quedaron visibles. Si el callback falla, el gráfico ya se
     actualizó igual: no se lleva puesto el toggle. */
  function alTocarLeyenda(avisar) {
    return function (evento, item, leyenda) {
      var chart = leyenda.chart;
      chart.toggleDataVisibility(item.index);
      chart.update();
      var visibles = chart.data.labels.filter(function (_, i) {
        return chart.getDataVisibility(i);
      });
      try {
        avisar(visibles);
      } catch (e) {
        console.error('[dashboard] falló el callback de la leyenda', e);
      }
    };
  }

  /* Barras. Horizontal cuando las etiquetas son nombres (choferes, camiones). */
  function barras(id, datos) {
    var labels = (datos && datos.labels) || [];
    var values = (datos && datos.values) || [];
    if (!labels.length) return vacio(id, datos && datos.vacio);
    var horizontal = !!(datos && datos.horizontal);
    var fmt = (datos && datos.formato) === 'pesos' ? nfPesos : nfMiles;
    var unidad = (datos && datos.unidad) || '';
    // Mismo eje que las barras: nunca un segundo eje Y.
    var referencia = (datos && datos.referencia) || null;
    return montar(id, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          // Un array de colores pinta barra por barra (fines de semana, outliers).
          backgroundColor: (datos && datos.colores) || (datos && datos.color) || CATEGORICA[0],
          borderRadius: 4,
          borderSkipped: false,
          barPercentage: 0.7,
          categoryPercentage: 0.8,
          order: 2
        }].concat(referencia ? [{
          type: 'line',
          label: referencia.label || 'Promedio',
          data: values.map(function () { return referencia.valor; }),
          borderColor: TINTA.media,
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
          order: 1
        }] : [])
      },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: referencia
            ? Object.assign(leyendaBase(), {
                labels: Object.assign(leyendaBase().labels, {
                  // Como trazo y no como punto: es una línea de referencia, y el
                  // círculo vacío del pointStyle parecía una viñeta suelta.
                  usePointStyle: false,
                  boxWidth: 18,
                  boxHeight: 2,
                  filter: function (it) { return it.datasetIndex === 1; }
                })
              })
            : { display: false },
          tooltip: Object.assign(tooltipBase(), {
            callbacks: {
              label: function (ctx) {
                if (ctx.datasetIndex === 1) {
                  return ' ' + (referencia.label || 'Promedio') + ': ' + fmt(referencia.valor);
                }
                var v = horizontal ? ctx.parsed.x : ctx.parsed.y;
                return ' ' + fmt(v) + (unidad ? ' ' + unidad : '');
              }
            }
          })
        },
        scales: {
          x: Object.assign(ejeBase(horizontal, horizontal), { beginAtZero: true }),
          y: Object.assign(ejeBase(!horizontal, !horizontal), { beginAtZero: true })
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
          x: ejeBase(false, false),
          y: Object.assign(ejeBase(true, true), { beginAtZero: true })
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
            /* Una caja chica no tiene lugar para el nombre: el texto se
               salía por los bordes y se leía "lque pe" en vez de "Remolque
               pesado". Cuando no entra se muestra sólo el porcentaje, y
               cuando tampoco entra eso, nada: el nombre está en el tooltip. */
            formatter: function (ctx) {
              var it = ctx.raw && ctx.raw._data;
              if (!it) return '';
              var pct = total ? Math.round(Number(it.value || 0) * 100 / total) : 0;
              var w = Number(ctx.raw.w || 0);
              var h = Number(ctx.raw.h || 0);
              if (w < 38 || h < 18) return '';
              if (h < 34) return pct + '%';
              // ~6,2 px por carácter a 11px semibold, más el aire del borde.
              var caben = Math.floor((w - 10) / 6.2);
              var txt = String(it.label);
              if (txt.length > caben) {
                // Recortado dice más que nada: "Cambio de r…" ya se reconoce.
                // Por debajo de seis caracteres no se reconoce, y ahí sí se cae
                // al porcentaje solo.
                if (caben < 7) return pct + '%';
                txt = txt.slice(0, caben - 1) + '…';
              }
              return [txt, pct + '%'];
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


  function escapar(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function celda(col, fila, maximo, sinBarra) {
    var v = fila[col.clave];
    var vacia = (v === null || v === undefined || v === '');

    if (col.tipo === 'texto') {
      return '<td class="auxtb-txt">' + escapar(vacia ? '—' : v) + '</td>';
    }

    var txt;
    if (vacia) txt = '—';
    else if (col.tipo === 'pesos') txt = nfPesos(v);
    else if (col.decimales != null) txt = Number(v).toLocaleString('es-AR', {
      minimumFractionDigits: col.decimales, maximumFractionDigits: col.decimales });
    else txt = nfMiles(v);
    if (!vacia && col.unidad) txt += ' ' + col.unidad;

    if (!col.barra || sinBarra) return '<td class="auxtb-num">' + escapar(txt) + '</td>';

    /* Carril propio para la barra, a la izquierda del número. Antes la barra
       iba de fondo y el número encima: con valores altos la barra llegaba justo
       hasta las cifras y parecía que las tocaba. Ahora nunca se cruzan, y el
       carril gris de atrás hace legible el "cuánto le falta" además del cuánto. */
    var pct = (!vacia && maximo > 0) ? Math.max(2, Math.round(Number(v) * 100 / maximo)) : 0;
    return '<td class="auxtb-num auxtb-barra">'
      + '<span class="auxtb-cel">'
      +   '<span class="auxtb-track">'
      +     '<span class="auxtb-fill" style="width:' + pct + '%"></span>'
      +   '</span>'
      +   '<span class="auxtb-val">' + escapar(txt) + '</span>'
      + '</span>'
      + '</td>';
  }

  /* Tabla con la magnitud principal como barra dentro de la celda.
     Para pocas filas y varias medidas se lee mejor que varios gráficos de
     barras separados: se comparan todas las columnas de un vistazo, sin tener
     que cruzar dos gráficos con la vista. */
  function tabla(id, datos) {
    var cont = typeof id === 'string' ? document.getElementById(id) : id;
    if (!cont) return;
    var filas = (datos && datos.filas) || [];
    var cols = (datos && datos.columnas) || [];

    if (!filas.length || !cols.length) {
      cont.innerHTML = '<div class="auxtb-vacio">'
        + escapar((datos && datos.vacio) || 'Sin datos para este período')
        + '</div>';
      return;
    }

    var maximos = {};
    cols.forEach(function (c) {
      if (!c.barra) return;
      maximos[c.clave] = filas.reduce(function (m, f) {
        var n = Number(f[c.clave]);
        return isFinite(n) && n > m ? n : m;
      }, 0);
    });

    var head = '<tr>' + cols.map(function (c) {
      return '<th class="' + (c.tipo === 'texto' ? 'auxtb-txt' : 'auxtb-num') + '">'
        + escapar(c.titulo) + '</th>';
    }).join('') + '</tr>';

    var cuerpo = filas.map(function (f) {
      return '<tr>' + cols.map(function (c) {
        return celda(c, f, maximos[c.clave] || 0);
      }).join('') + '</tr>';
    }).join('');

    cont.innerHTML = '<div class="auxtb-wrap"><table class="auxtb">'
      + '<thead>' + head + '</thead><tbody>' + cuerpo + '</tbody>'
      + pie(cols, filas, datos) + '</table></div>';
  }

  /* Fila de totales. Una columna declara cómo se cierra:
       total: 'suma'                       → suma la columna
       total: { dividir: 'a', por: 'b' }   → razón entre dos sumas
     La razón nunca es el promedio de la columna: promediar km/litro de siete
     camiones le da el mismo peso al que hizo 9.700 km que al que hizo 446. */
  function totalDe(col, filas) {
    if (col.total === 'suma') {
      return filas.reduce(function (a, f) {
        var n = Number(f[col.clave]);
        return a + (isFinite(n) ? n : 0);
      }, 0);
    }
    if (col.total && col.total.dividir) {
      var arriba = 0, abajo = 0;
      filas.forEach(function (f) {
        var a = Number(f[col.total.dividir]);
        var b = Number(f[col.total.por]);
        if (isFinite(a)) arriba += a;
        if (isFinite(b)) abajo += b;
      });
      return abajo > 0 ? arriba / abajo : null;
    }
    return null;
  }

  function pie(cols, filas, datos) {
    if (!cols.some(function (c) { return c.total; })) return '';
    var resumen = {};
    cols.forEach(function (c) { if (c.total) resumen[c.clave] = totalDe(c, filas); });
    var celdas = cols.map(function (c, i) {
      if (i === 0) {
        return '<td class="auxtb-txt">'
          + escapar((datos && datos.totalEtiqueta) || 'Total') + '</td>';
      }
      if (!c.total) return '<td class="auxtb-num"></td>';
      // sinBarra: la fila de totales no compara contra nada.
      return celda(c, resumen, 0, true);
    }).join('');
    return '<tfoot><tr class="auxtb-total">' + celdas + '</tr></tfoot>';
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
    tabla: tabla,
    topN: topN,
    destruir: destruir,
    vacio: vacio,
    cargando: cargando,
    error: error,
    nfMiles: nfMiles,
    nfPesos: nfPesos
  };
})(window);

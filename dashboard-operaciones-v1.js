/* Dashboard rediseñado · sección OPERACIONES.

   Todo lo pesado (filtrar, sumar, promediar, descartar jornadas con el odómetro
   mal cargado) lo hace dashboard_operaciones_v1 en Postgres. Acá no se suma
   nada: se pinta lo que vino. Si mañana cambia una regla de negocio —qué es un
   km "absurdo", cómo se cuentan las jornadas nocturnas— se cambia en la RPC y
   esta sección no se entera.

   El estado, los filtros, el overlay de carga y el coalescing de recargas son
   del shell (AuxDash). Acá sólo se leen los filtros que llegan y se empujan los
   propios con AuxDash.setFiltro(). */
(function (global) {
  'use strict';

  var G = global.AuxDashCharts;

  var CANVAS = {
    comb:       'dashx-ops-comb',
    kmchofer:   'dashx-ops-kmchofer',
    tendencia:  'dashx-ops-tendencia',
    eficiencia: 'dashx-ops-eficiencia',
    horas:      'dashx-ops-horas'
  };

  // Firma del catálogo con el que se pintaron los combos. Reconstruir el <select>
  // en cada recarga le borraría la selección al usuario justo después de elegirla.
  var firmaCatalogo = { camiones: null, choferes: null };

  /* ── helpers de formato ───────────────────────────────────────────────── */

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function decimales(v, d) {
    if (v === null || v === undefined || !isFinite(Number(v))) return '—';
    return Number(v).toLocaleString('es-AR', {
      minimumFractionDigits: d,
      maximumFractionDigits: d
    });
  }

  function pesos(v) {
    if (v === null || v === undefined || !isFinite(Number(v))) return '—';
    return G.nfPesos(v);
  }

  function miles(v) {
    if (v === null || v === undefined || !isFinite(Number(v))) return '—';
    return G.nfMiles(Math.round(Number(v)));
  }

  // 'YYYY-MM-DD' → 'DD/MM'. Sin new Date(): parsear un ISO corto lo interpreta
  // en UTC y en Argentina (UTC-3) devuelve el día anterior.
  function diaMes(iso) {
    var p = String(iso || '').split('-');
    return p.length === 3 ? p[2] + '/' + p[1] : String(iso || '');
  }

  function texto(el, valor) {
    if (el) el.textContent = valor;
  }

  /* ── filtros ──────────────────────────────────────────────────────────── */

  function montarFiltros() {
    var cont = document.getElementById('dashx-ops-filtros');
    if (!cont || cont.dataset.listo === '1') return;
    cont.dataset.listo = '1';
    cont.innerHTML =
      '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">' +
        '<label style="flex:1 1 180px;min-width:0">' +
          '<span class="dashx-metric-label">Camión</span>' +
          '<select id="dashx-ops-f-camion" class="input-field" style="margin-bottom:0"></select>' +
        '</label>' +
        '<label style="flex:1 1 180px;min-width:0">' +
          '<span class="dashx-metric-label">Chofer</span>' +
          '<select id="dashx-ops-f-chofer" class="input-field" style="margin-bottom:0"></select>' +
        '</label>' +
      '</div>';

    var camion = document.getElementById('dashx-ops-f-camion');
    var chofer = document.getElementById('dashx-ops-f-chofer');

    if (camion) {
      camion.addEventListener('change', function () {
        // El shell se ocupa de recargar, del overlay y de coalescer.
        global.AuxDash.setFiltro('camiones', camion.value ? [Number(camion.value)] : []);
      });
    }
    if (chofer) {
      chofer.addEventListener('change', function () {
        global.AuxDash.setFiltro('choferes', chofer.value ? [chofer.value] : []);
      });
    }
  }

  function pintarCombo(id, opciones, etiquetaTodos, seleccionado, clave) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var firma = opciones.map(function (o) { return o.id; }).join('|');
    if (firmaCatalogo[clave] !== firma) {
      firmaCatalogo[clave] = firma;
      // Con createElement/textContent: los nombres vienen de la base y un
      // apellido con "&" o "<" no tiene por qué pasar por el parser de HTML.
      sel.innerHTML = '';
      var todos = document.createElement('option');
      todos.value = '';
      todos.textContent = etiquetaTodos;
      sel.appendChild(todos);
      opciones.forEach(function (o) {
        var op = document.createElement('option');
        op.value = String(o.id);
        op.textContent = String(o.texto == null ? '' : o.texto);
        sel.appendChild(op);
      });
    }
    // Siempre se reafirma el valor: el dueño del filtro es el shell, no el combo.
    // Si el valor ya no existe entre las opciones, el <select> vuelve solo a
    // "Todos", que es lo correcto: ese filtro dejó de aplicar.
    var v = (seleccionado === null || seleccionado === undefined) ? '' : String(seleccionado);
    if (sel.value !== v) sel.value = v;
  }

  function pintarFiltros(datos, filtros) {
    var cat = (datos && datos.catalogo) || {};
    pintarCombo(
      'dashx-ops-f-camion',
      (cat.camiones || []).map(function (c) { return { id: c.id, texto: c.etiqueta }; }),
      'Todos los camiones',
      (filtros.camiones && filtros.camiones.length === 1) ? filtros.camiones[0] : '',
      'camiones'
    );
    pintarCombo(
      'dashx-ops-f-chofer',
      (cat.choferes || []).map(function (c) { return { id: c.id, texto: c.nombre }; }),
      'Todos los choferes',
      (filtros.choferes && filtros.choferes.length === 1) ? filtros.choferes[0] : '',
      'choferes'
    );
  }

  /* ── métricas ─────────────────────────────────────────────────────────── */

  function tarjeta(label, valor) {
    return '<div class="dashx-metric">' +
             '<div class="dashx-metric-label">' + label + '</div>' +
             '<div class="dashx-metric-value">' + valor + '</div>' +
           '</div>';
  }

  function pintarMetricas(datos) {
    var cont = document.getElementById('dashx-ops-metrics');
    if (!cont) return;
    var t = (datos && datos.totales) || {};
    var e = (datos && datos.eficiencia) || {};
    cont.innerHTML =
      tarjeta('Km recorridos',     miles(t.km) + ' km') +
      tarjeta('Combustible',       decimales(t.litros, 0) + ' L') +
      tarjeta('Gasto combustible', pesos(t.costo)) +
      tarjeta('Jornadas',          miles(t.jornadas)) +
      tarjeta('Horas totales',     decimales(t.horas, 0) + ' h') +
      // Las tres salen de una división con guarda en la RPC: sin cargas o sin
      // km vienen null y acá se muestran como guión, nunca como NaN ni 0.
      tarjeta('Km por litro',      decimales(e.km_por_litro, 2)) +
      tarjeta('Costo por km',      pesos(e.costo_por_km)) +
      tarjeta('Horas por jornada', decimales(e.horas_por_jornada, 1) + ' h');
  }

  function pintarSubtitulo(datos) {
    var sub = document.getElementById('dashx-ops-sub');
    if (!sub) return;
    var d = (datos && datos.descartes) || {};
    var partes = [diaMes(datos.desde) + ' – ' + diaMes(datos.hasta)];
    partes.push(datos.granularidad === 'semana' ? 'por semana' : 'por día');
    // Las jornadas descartadas se muestran: un total silenciosamente incompleto
    // es peor que un total con la advertencia al lado.
    var sucias = num(d.jornadas_sin_km) + num(d.jornadas_sin_horas);
    if (sucias > 0) {
      partes.push(num(d.jornadas_sin_km) + ' sin km válido · ' +
                  num(d.jornadas_sin_horas) + ' sin horas válidas');
    }
    texto(sub, partes.join(' · '));
  }

  /* ── gráficos ─────────────────────────────────────────────────────────── */

  function pintarCombustible(datos) {
    var filas = (datos.por_camion || []).filter(function (c) { return num(c.costo) > 0; });
    if (!filas.length) return G.vacio(CANVAS.comb, 'Sin cargas de combustible en el período');
    // topN es legítimo acá: "Otros" es la suma de los gastos que quedaron fuera.
    var top = G.topN(filas.map(function (c) {
      return { label: c.etiqueta, value: num(c.costo) };
    }), 7);
    G.barras(CANVAS.comb, {
      labels: top.map(function (x) { return x.label; }),
      values: top.map(function (x) { return x.value; }),
      horizontal: true,
      formato: 'pesos',
      color: G.PALETA[1]
    });
  }

  function pintarKmChofer(datos) {
    var filas = (datos.por_chofer || []).filter(function (c) { return num(c.km) > 0; });
    if (!filas.length) return G.vacio(CANVAS.kmchofer, 'Sin kilómetros registrados en el período');
    var top = G.topN(filas.map(function (c) {
      return { label: c.nombre, value: num(c.km) };
    }), 7);
    G.barras(CANVAS.kmchofer, {
      labels: top.map(function (x) { return x.label; }),
      values: top.map(function (x) { return x.value; }),
      horizontal: true,
      unidad: 'km',
      color: G.PALETA[0]
    });
  }

  function pintarTendencia(datos) {
    var serie = datos.serie_temporal || [];
    if (!serie.length) return G.vacio(CANVAS.tendencia, 'Sin jornadas en el período');
    var semanal = datos.granularidad === 'semana';
    G.linea(CANVAS.tendencia, {
      labels: serie.map(function (p) {
        return (semanal ? 'sem ' : '') + diaMes(p.fecha);
      }),
      // Una sola serie: km y horas tienen escalas distintas y el doble eje Y
      // hace que cualquier cruce entre las dos líneas parezca significar algo.
      series: [{ label: 'Km recorridos', values: serie.map(function (p) { return num(p.km); }) }]
    });
  }

  function pintarEficiencia(datos) {
    var filas = (datos.por_camion || []).filter(function (c) {
      // km_por_litro llega null cuando el camión no tuvo cargas en el período:
      // la RPC nunca divide por cero, devuelve null y acá el camión se omite.
      return c.km_por_litro !== null && c.km_por_litro !== undefined && num(c.km_por_litro) > 0;
    }).sort(function (a, b) { return num(b.km_por_litro) - num(a.km_por_litro); });
    if (!filas.length) return G.vacio(CANVAS.eficiencia, 'Hace falta km y litros del mismo camión');
    // Sin topN: "Otros" suma valores y km/l es un cociente. Sumar cocientes de
    // camiones distintos no da nada. Se recorta la cola y listo.
    filas = filas.slice(0, 7);
    G.barras(CANVAS.eficiencia, {
      labels: filas.map(function (c) { return c.etiqueta; }),
      values: filas.map(function (c) { return num(c.km_por_litro); }),
      horizontal: true,
      unidad: 'km/L',
      color: G.PALETA[2]
    });
  }

  function pintarHoras(datos) {
    var filas = (datos.por_chofer || []).filter(function (c) {
      return c.horas_por_jornada !== null && c.horas_por_jornada !== undefined &&
             num(c.horas_por_jornada) > 0;
    });
    if (!filas.length) return G.vacio(CANVAS.horas, 'Sin jornadas con horario válido');
    // Se eligen los choferes con más jornadas (los que sostienen la operación) y
    // recién ahí se ordena por promedio. Tampoco lleva topN: es un promedio.
    filas = filas.slice().sort(function (a, b) { return num(b.jornadas) - num(a.jornadas); })
                 .slice(0, 7)
                 .sort(function (a, b) { return num(b.horas_por_jornada) - num(a.horas_por_jornada); });
    G.barras(CANVAS.horas, {
      labels: filas.map(function (c) { return c.nombre; }),
      values: filas.map(function (c) { return num(c.horas_por_jornada); }),
      horizontal: true,
      unidad: 'h',
      color: G.PALETA[6]
    });
  }

  /* ── ciclo de vida ────────────────────────────────────────────────────── */

  function cadaCanvas(fn) {
    Object.keys(CANVAS).forEach(function (k) { fn(CANVAS[k]); });
  }

  async function cargar(filtros) {
    if (!global._db || typeof global._db.rpc !== 'function') {
      throw new Error('Sin conexión con la base de datos');
    }

    var resp = await global._db.rpc('dashboard_operaciones_v1', {
      p_desde:    filtros.desde,
      p_hasta:    filtros.hasta,
      // Arrays vacíos: la RPC los trata igual que null (sin filtro).
      p_camiones: (filtros.camiones || []).map(Number).filter(function (n) { return isFinite(n); }),
      p_choferes: (filtros.choferes || []).map(String)
    });

    if (resp.error) throw resp.error;
    var datos = resp.data || {};

    pintarFiltros(datos, filtros);
    pintarSubtitulo(datos);
    pintarMetricas(datos);
    pintarCombustible(datos);
    pintarKmChofer(datos);
    pintarTendencia(datos);
    pintarEficiencia(datos);
    pintarHoras(datos);
  }

  function alError(contenedor, e) {
    var msg = (e && e.message) ? e.message : 'No se pudieron cargar las métricas';
    cadaCanvas(function (id) { G.error(id, msg); });
    var metrics = document.getElementById('dashx-ops-metrics');
    if (metrics) metrics.innerHTML = tarjeta('Operaciones', '—');
    texto(document.getElementById('dashx-ops-sub'), 'No se pudieron cargar las métricas');
  }

  if (global.AuxDash && typeof global.AuxDash.registrarSeccion === 'function') {
    global.AuxDash.registrarSeccion({
      id: 'operaciones',
      montar: montarFiltros,
      cargar: cargar,
      alError: alError
    });
  }

  // Sólo para los tests de patrón y para depurar desde la consola.
  global.AuxDashOperaciones = {
    cargar: cargar,
    alError: alError,
    CANVAS: CANVAS
  };
})(window);

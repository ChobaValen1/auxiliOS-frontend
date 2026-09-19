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
    tendencia: 'dashx-ops-tendencia',
    anillo:    'dashx-ops-anillo'
  };

  // Por camión y por chofer son varias medidas sobre pocas filas: eso es una
  // tabla, no cuatro gráficos de barras que obligan a cruzarlos con la vista.
  var TABLAS = {
    camiones: 'dashx-ops-tabla-camiones',
    choferes: 'dashx-ops-tabla-choferes'
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

  var MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

  // Cada grano quiere su etiqueta: un "19/08" repetido doce veces en una serie
  // mensual no dice de qué mes se habla.
  function etiquetaEje(iso, grano) {
    var partes = String(iso || '').split('-');
    if (partes.length < 3) return iso || '';
    if (grano === 'mes') return MESES[Number(partes[1]) - 1] + ' ' + partes[0].slice(2);
    if (grano === 'semana') return partes[2] + '/' + partes[1];
    return partes[2] + '/' + partes[1];
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

  function tarjeta(label, valor, clase) {
    return '<div class="dashx-metric' + (clase ? ' ' + clase : '') + '">' +
             '<div class="dashx-metric-label">' + label + '</div>' +
             '<div class="dashx-metric-value">' + valor + '</div>' +
           '</div>';
  }

  /* Dos niveles a propósito: arriba lo que se mira primero (volumen del
     período), abajo las razones, que son lectura de segundo orden y con ocho
     tarjetas iguales quedaban al mismo peso que el titular. */
  function pintarMetricas(datos) {
    var t = (datos && datos.totales) || {};
    var e = (datos && datos.eficiencia) || {};

    var principal = document.getElementById('dashx-ops-metrics');
    if (principal) {
      principal.innerHTML =
        tarjeta('Servicios', miles(t.servicios), 'is-hero') +
        tarjeta('Km recorridos', miles(t.km) + ' km', 'is-hero') +
        tarjeta('Gasto combustible', pesos(t.costo), 'is-hero') +
        tarjeta('Jornadas', miles(t.jornadas), 'is-hero');
    }

    var razones = document.getElementById('dashx-ops-ratios');
    if (razones) {
      // Las tres salen de una división con guarda en la RPC: sin cargas o sin
      // km vienen null y acá se muestran como guión, nunca como NaN ni 0.
      razones.innerHTML =
        tarjeta('Servicios por jornada', decimales(e.servicios_por_jornada, 2)) +
        tarjeta('Km por servicio', decimales(e.km_por_servicio, 1) + ' km') +
        tarjeta('Km por litro', decimales(e.km_por_litro, 2)) +
        tarjeta('Costo por km', pesos(e.costo_por_km)) +
        tarjeta('Horas por jornada', decimales(e.horas_por_jornada, 1) + ' h');
    }
  }

  function pintarSubtitulo(datos) {
    var sub = document.getElementById('dashx-ops-sub');
    if (!sub) return;
    var d = (datos && datos.descartes) || {};
    var partes = [diaMes(datos.desde) + ' – ' + diaMes(datos.hasta)];
    // Tres granos desde la v2: sin el caso 'mes' la vista anual decía "por día".
    partes.push({ dia: 'por día', semana: 'por semana', mes: 'por mes' }[datos.granularidad] || 'por día');
    // Las jornadas descartadas se muestran: un total silenciosamente incompleto
    // es peor que un total con la advertencia al lado.
    // Sólo lo que no es cero: "0 sin km válido" es ruido, no información.
    if (num(d.jornadas_sin_km) > 0) {
      partes.push(num(d.jornadas_sin_km) + ' sin km utilizable');
    }
    if (num(d.jornadas_sin_horas) > 0) {
      partes.push(num(d.jornadas_sin_horas) + ' sin horario utilizable');
    }
    texto(sub, partes.join(' · '));
  }

  /* ── gráficos ─────────────────────────────────────────────────────────── */

  function pintarTablaCamiones(datos) {
    var filas = (datos.por_camion || []).slice()
      .sort(function (a, b) { return num(b.km) - num(a.km); });
    G.tabla(TABLAS.camiones, {
      vacio: 'Sin jornadas ni cargas de camión en el período',
      columnas: [
        { clave: 'etiqueta',     titulo: 'Camión',   tipo: 'texto' },
        { clave: 'km',           titulo: 'Km',       barra: true, unidad: 'km' },
        { clave: 'servicios',    titulo: 'Servicios' },
        { clave: 'jornadas',     titulo: 'Jornadas' },
        { clave: 'litros',       titulo: 'Litros',   decimales: 0 },
        { clave: 'costo',        titulo: 'Gasto',    tipo: 'pesos' },
        // Llega null cuando el camión no tuvo cargas: la RPC no divide por cero
        // y la tabla lo muestra como guión en vez de omitir la fila entera.
        { clave: 'km_por_litro', titulo: 'Km/L',     decimales: 2 }
      ],
      filas: filas
    });
  }

  function pintarTablaChoferes(datos) {
    var filas = (datos.por_chofer || []).slice()
      .sort(function (a, b) { return num(b.km) - num(a.km); });
    G.tabla(TABLAS.choferes, {
      vacio: 'Sin jornadas de chofer en el período',
      columnas: [
        { clave: 'nombre',            titulo: 'Chofer',   tipo: 'texto' },
        { clave: 'km',                titulo: 'Km',       barra: true, unidad: 'km' },
        { clave: 'servicios',         titulo: 'Servicios' },
        { clave: 'jornadas',          titulo: 'Jornadas' },
        { clave: 'horas',             titulo: 'Horas',    decimales: 0, unidad: 'h' },
        { clave: 'horas_por_jornada', titulo: 'H/jornada', decimales: 1 }
      ],
      filas: filas
    });
  }

  /* Barras, no línea: son valores de días sueltos, no una magnitud continua, y
     la línea sugería una transición entre un día y el siguiente que no existe.
     La referencia de promedio es lo que hace legible el zigzag: sin ella no se
     sabe qué día estuvo bien y cuál mal. */
  function pintarTendencia(datos) {
    var serie = datos.serie_temporal || [];
    if (!serie.length) return G.vacio(CANVAS.tendencia, 'Sin jornadas en el período');
    var grano = datos.granularidad || 'dia';
    var kms = serie.map(function (p) { return num(p.km); });
    var conDatos = kms.filter(function (v) { return v > 0; });
    var promedio = conDatos.length
      ? Math.round(conDatos.reduce(function (a, b) { return a + b; }, 0) / conDatos.length)
      : 0;

    // Sábados y domingos en tono más tenue: la operación baja el fin de semana
    // y sin distinguirlos los valles parecen caídas de productividad.
    var colores = serie.map(function (p) {
      var d = new Date(p.fecha + 'T12:00:00');
      var finde = grano === 'dia' && (d.getDay() === 0 || d.getDay() === 6);
      return finde ? 'rgba(57,135,229,0.38)' : G.PALETA[0];
    });

    var nombreGrano = { dia: 'diario', semana: 'semanal', mes: 'mensual' }[grano] || 'diario';

    G.barras(CANVAS.tendencia, {
      labels: serie.map(function (p) { return etiquetaEje(p.fecha, grano); }),
      values: kms,
      colores: colores,
      unidad: 'km',
      referencia: promedio > 0
        ? { valor: promedio, label: 'Promedio ' + nombreGrano }
        : null
    });
  }

  /* Anillo de participación en los km. Es la única pregunta de esta pantalla
     que es parte-sobre-total: qué tan concentrada está la operación en pocos
     móviles. La tabla tiene los valores, pero para sacar el reparto habría que
     sumar siete filas de memoria.
     Acá el topN sí corresponde: "Otros" es una suma real de km, no un promedio. */
  function pintarAnillo(datos) {
    var filas = (datos.por_camion || []).filter(function (c) { return num(c.km) > 0; });
    if (!filas.length) return G.vacio(CANVAS.anillo, 'Sin kilómetros en el período');
    var top = G.topN(filas.map(function (c) {
      return { label: c.etiqueta, value: num(c.km) };
    }), 6);
    G.donut(CANVAS.anillo, {
      labels: top.map(function (x) { return x.label; }),
      values: top.map(function (x) { return x.value; })
    });
  }

  /* ── ciclo de vida ────────────────────────────────────────────────────── */

  function cadaCanvas(fn) {
    Object.keys(CANVAS).forEach(function (k) { fn(CANVAS[k]); });
  }

  async function cargar(filtros) {
    // _db es un const de nivel superior en supabase.js: vive en el scope del
    // script, no en window, así que global._db da undefined.
    var db = (typeof _db !== 'undefined') ? _db : null;
    if (!db || typeof db.rpc !== 'function') {
      throw new Error('Sin conexión con la base de datos');
    }

    var resp = await db.rpc('dashboard_operaciones_v1', {
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
    pintarTablaCamiones(datos);
    pintarTablaChoferes(datos);
    pintarTendencia(datos);
    pintarAnillo(datos);
  }

  function alError(contenedor, e) {
    var msg = (e && e.message) ? e.message : 'No se pudieron cargar las métricas';
    cadaCanvas(function (id) { G.error(id, msg); });
    // Se vacían: dejar las tarjetas de la carga anterior haría pasar números
    // viejos por números del filtro nuevo.
    var metrics = document.getElementById('dashx-ops-metrics');
    if (metrics) metrics.innerHTML = '';
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

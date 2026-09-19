/* Dashboard rediseñado · sección FACTURACIÓN.
   Se registra en el shell (AuxDash) y pinta con el motor único de gráficos
   (AuxDashCharts). Todo el agregado lo hace la RPC dashboard_facturacion_v1:
   acá no se suman filas ni se calculan totales.

   Nota sobre el estado vacío, que es el más importante de esta sección:
   operator_services arranca en producción el 1/10, así que durante las primeras
   semanas la respuesta normal de la RPC es hay_datos=false. Eso NO es un error ni
   un cero: no hay servicios cargados todavía. Por eso nunca se pinta "$0" ni
   "0%" — se pinta un guion y un texto que explica qué va a aparecer ahí. Cuando
   lleguen los datos la sección se enciende sola, sin tocar una línea. */
(function (global) {
  'use strict';

  var RPC = 'dashboard_facturacion_v1';

  var CV_DONUT = 'dashx-fact-donut';
  var CV_CAJAS = 'dashx-fact-cajas';
  var CV_BASES = 'dashx-fact-bases';
  var CV_PART  = 'dashx-fact-part';
  var ID_CONC  = 'dashx-fact-conceptos';
  var ID_KPIS  = 'dashx-fact-kpis';
  var ID_SUB   = 'dashx-fact-sub';
  var ID_FILT  = 'dashx-fact-filtros';

  /* La paleta tiene 7 slots y no se cicla: la cola larga se agrupa en "Otros". */
  var MAX_CATEGORIAS = 7;

  var GUION = '—';

  // Firma del catálogo con el que se pintaron los combos: reconstruirlos en cada
  // recarga le borraría la selección al usuario justo después de elegirla.
  var firmaCatalogo = { empresas: null, bases: null };

  /* Mensajes del estado vacío. Explican que faltan servicios por cargar y qué va
     a mostrar cada gráfico, en vez de dejar un recuadro mudo. */
  var VACIO_DONUT = 'Todavía no hay servicios cargados en este período. Acá va a verse el reparto de servicios por prestadora.';
  var VACIO_CAJAS = 'Todavía no hay servicios cargados en este período. Acá va a verse la composición por concepto.';
  var VACIO_BASES = 'Todavía no hay servicios cargados en este período. Acá va a verse el desglose facturado por base.';
  var VACIO_CONC  = 'Todavía no hay servicios cargados en este período. Acá va a verse cuántos servicios y cuántos km factura cada concepto.';
  var VACIO_KPIS  = 'Todavía no hay servicios cargados en este período.';

  /* ── utilidades ───────────────────────────────────────────────────────── */

  function ch() { return global.AuxDashCharts; }

  function el(id) { return document.getElementById(id); }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function lista(v) { return Array.isArray(v) ? v : []; }

  /* Los nombres salen de la base (razones sociales, conceptos cargados a mano):
     se escapan siempre antes de entrar a innerHTML. */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fecha(iso) {
    var p = String(iso || '').slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '';
  }

  function nfKm(v) {
    return ch().nfMiles(Math.round(num(v))) + ' km';
  }

  function nfPct(v) {
    return Math.abs(num(v)).toLocaleString('es-AR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + '%';
  }

  /* Comparativo contra el período anterior de igual duración.
     Sin período anterior no hay porcentaje: un "+100%" contra cero no informa
     nada. `semantico` es para las magnitudes donde subir es bueno (facturado,
     servicios); peajes y km van en gris, porque más peaje o más km no es de por
     sí ni bueno ni malo y pintarlo de verde o rojo sería mentir. */
  function delta(actual, anterior, semantico, rango) {
    var prev = num(anterior);
    var attr = rango ? ' title="Período anterior: ' + esc(rango) + '"' : '';
    if (prev <= 0) {
      return '<div class="dashx-kpi-delta is-flat"' + attr + '>Sin período anterior para comparar</div>';
    }
    var v = (num(actual) - prev) * 100 / prev;
    if (Math.abs(v) < 0.05) {
      return '<div class="dashx-kpi-delta is-flat"' + attr + '>= igual que el período anterior</div>';
    }
    var sube = v > 0;
    var clase = semantico ? (sube ? 'is-up' : 'is-down') : 'is-flat';
    // Flecha + signo + texto: nunca el color solo.
    return '<div class="dashx-kpi-delta ' + clase + '"' + attr + '>' +
      (sube ? '▲ +' : '▼ -') + nfPct(v) + ' vs. período anterior</div>';
  }

  function kpi(label, valor, amber, extra) {
    return '<div class="dashx-kpi">' +
      '<div class="dashx-kpi-label">' + esc(label) + '</div>' +
      '<div class="dashx-kpi-value' + (amber ? ' is-amber' : '') + '">' + valor + '</div>' +
      (extra || '') +
      '</div>';
  }

  /* KM reales contra KM facturados.

     El margen sale sólo de los servicios que tienen km_reales informado, así que
     la tarjeta dice sobre cuántos está calculado: un margen sobre 3 de 200
     servicios no se lee igual que uno sobre 190, y sin ese número no hay forma
     de saber cuál de los dos se está mirando.

     Positivo = se factura más recorrido del que el chofer informó. Negativo =
     hay kilómetros que se recorren y no se cobran, que es el caso que duele. */
  function kpiReales(d) {
    var x = d.reales;
    if (!x.conDato) {
      return kpi('KM reales', GUION, false,
        '<div class="dashx-kpi-delta is-flat">Ningún remito del período informó kilómetros</div>');
    }
    var pie = '';
    if (x.margen !== null) {
      var clase = x.margen < 0 ? 'is-down' : (x.margen > 0 ? 'is-up' : 'is-flat');
      pie = '<div class="dashx-kpi-delta ' + clase + '">' +
        (x.margen > 0 ? '▲ +' : (x.margen < 0 ? '▼ -' : '= ')) + nfPct(x.margen) +
        ' de margen sobre lo recorrido</div>';
    }
    pie += '<div class="dashx-kpi-delta is-flat">' +
      ch().nfMiles(x.conDato) + ' de ' + ch().nfMiles(x.servicios) +
      (x.servicios === 1 ? ' servicio' : ' servicios') + ' con km informados</div>';
    return kpi('KM reales', nfKm(x.km), false, pie);
  }

  /* ── normalización de la respuesta ───────────────────────────────────────
     Todo lo que sigue asume que la RPC puede devolver null, un objeto a medio
     llenar o arrays vacíos (tabla vacía, migración sin aplicar, filtros que no
     matchean). Nada de esto debe tirar una excepción. */

  function fila(r) {
    var o = r && typeof r === 'object' ? r : {};
    return {
      id: o.id || null,
      nombre: String(o.nombre || 'Sin identificar'),
      monto: num(o.monto),
      servicios: num(o.servicios),
      km: num(o.km),
      kmReal: num(o.km_real),
      kmComparable: num(o.km_comparable)
    };
  }

  function normalizar(d) {
    var o = d && typeof d === 'object' ? d : {};
    var t = o.totales && typeof o.totales === 'object' ? o.totales : {};
    var a = o.anterior && typeof o.anterior === 'object' ? o.anterior : {};
    var c = o.comparativo && typeof o.comparativo === 'object' ? o.comparativo : {};
    return {
      /* La señal primaria es la cantidad de servicios, no el monto: un período
         puede tener servicios por $0 (bonificados), pero cero servicios nunca es
         un dato que se pueda mostrar como total. hay_datos sólo puede reforzar
         el estado vacío, nunca inventar uno lleno. */
      hayDatos: num(t.servicios) > 0 && o.hay_datos !== false,
      totales: {
        facturado: num(t.facturado),
        peajes: num(t.peajes),
        km: num(t.km),
        servicios: num(t.servicios)
      },
      anterior: {
        facturado: num(a.facturado),
        peajes: num(a.peajes),
        km: num(a.km),
        servicios: num(a.servicios)
      },
      rangoAnterior: c.desde && c.hasta ? fecha(c.desde) + ' al ' + fecha(c.hasta) : '',
      reales: (function () {
        var x = o.reales && typeof o.reales === 'object' ? o.reales : {};
        return {
          km: num(x.km_reales),
          kmFacturados: num(x.km_facturados),
          conDato: num(x.servicios_con_dato),
          servicios: num(x.servicios),
          // null es "no se puede calcular", distinto de 0 que sería "clavado".
          margen: (x.margen === null || x.margen === undefined) ? null : num(x.margen)
        };
      })(),
      catalogo: {
        empresas: lista(o.catalogo && o.catalogo.empresas),
        bases: lista(o.catalogo && o.catalogo.bases)
      },
      porEmpresa: lista(o.por_empresa).map(fila),
      porConcepto: lista(o.por_concepto).map(fila),
      porBase: lista(o.por_base).map(fila)
    };
  }

  /* topN() agrupa la cola larga en "Otros" pero sólo sabe de `value`: le
     devolvemos los km y los servicios del resto para que la fila "Otros" no
     quede sin kilómetros. */
  function agrupar(filas, valorDe) {
    var items = filas.map(function (f) {
      return { label: f.nombre, value: num(valorDe(f)), km: f.km, servicios: f.servicios,
               monto: f.monto, kmReal: f.kmReal, kmComparable: f.kmComparable };
    });
    var top = ch().topN(items, MAX_CATEGORIAS) || [];

    /* topN() sólo sabe de `value`: la fila "Otros" sale sin las demás medidas.
       Se las devolvemos restando lo que sí quedó en cabeza, para que "Otros" no
       aparezca con guiones en km, servicios ni margen. */
    var totalKm = 0, totalServicios = 0, totalReal = 0, totalComp = 0;
    items.forEach(function (i) {
      totalKm += i.km; totalServicios += i.servicios;
      totalReal += num(i.kmReal); totalComp += num(i.kmComparable);
    });
    top.forEach(function (i) {
      if (i.km === undefined) {
        var km = totalKm, srv = totalServicios, real = totalReal, comp = totalComp;
        top.forEach(function (o) {
          if (o !== i && o.km !== undefined) {
            km -= o.km; srv -= o.servicios;
            real -= num(o.kmReal); comp -= num(o.kmComparable);
          }
        });
        i.km = km;
        i.servicios = srv;
        i.kmReal = real;
        i.kmComparable = comp;
      }
    });

    // Promedios y margen por fila. Con guarda: sin servicios o sin km reales
    // devuelven null y la tabla muestra guión, nunca una división por cero.
    top.forEach(function (i) {
      i.ticket = i.servicios > 0 ? i.monto / i.servicios : null;
      i.kmServicio = i.servicios > 0 ? i.km / i.servicios : null;
      // km_comparable son los facturados del mismo subconjunto que los reales:
      // dividir el total facturado por los pocos reales daría un margen falso.
      i.margen = (i.kmReal > 0)
        ? (i.kmComparable - i.kmReal) * 100 / i.kmReal
        : null;
    });
    return top;
  }

  /* ── filtros ──────────────────────────────────────────────────────────────
     Prestadora y base son, con la fecha, los filtros principales de la sección.
     Viven en la barra de arriba junto al selector de período, fuera del cuerpo,
     para que el overlay de carga no los tape. El shell los muestra y los esconde
     con la sección. */

  function montarFiltros() {
    var cont = el(ID_FILT);
    if (!cont || cont.dataset.listo === '1') return;
    cont.dataset.listo = '1';
    cont.innerHTML =
      '<select id="dashx-fact-f-empresa" class="input-field" aria-label="Filtrar por prestadora"></select>' +
      '<select id="dashx-fact-f-base" class="input-field" aria-label="Filtrar por base"></select>';

    [['dashx-fact-f-empresa', 'empresas'], ['dashx-fact-f-base', 'bases']].forEach(function (par) {
      var sel = el(par[0]);
      if (!sel) return;
      sel.addEventListener('change', function () {
        // El shell recarga, coalesce y prende el overlay: acá sólo se empuja.
        global.AuxDash.setFiltro(par[1], sel.value ? [sel.value] : []);
      });
    });
  }

  function pintarCombo(id, opciones, etiquetaTodos, seleccionado, clave) {
    var sel = el(id);
    if (!sel) return;
    var firma = opciones.map(function (o) { return o.id; }).join('|');
    if (firmaCatalogo[clave] !== firma) {
      firmaCatalogo[clave] = firma;
      // createElement/textContent: una razón social con "&" o "<" no tiene por
      // qué pasar por el parser de HTML.
      sel.innerHTML = '';
      var todos = document.createElement('option');
      todos.value = '';
      todos.textContent = etiquetaTodos;
      sel.appendChild(todos);
      opciones.forEach(function (o) {
        var op = document.createElement('option');
        op.value = String(o.id);
        op.textContent = String(o.nombre == null ? '' : o.nombre);
        sel.appendChild(op);
      });
    }
    // El dueño del filtro es el shell, no el combo: el valor se reafirma siempre.
    var v = (seleccionado === null || seleccionado === undefined) ? '' : String(seleccionado);
    if (sel.value !== v) sel.value = v;
  }

  function pintarFiltros(d, f) {
    var cat = (d && d.catalogo) || {};
    pintarCombo('dashx-fact-f-empresa', lista(cat.empresas), 'Todas las prestadoras',
      (lista(f.empresas).length === 1) ? f.empresas[0] : '', 'empresas');
    pintarCombo('dashx-fact-f-base', lista(cat.bases), 'Todas las bases',
      (lista(f.bases).length === 1) ? f.bases[0] : '', 'bases');
  }

  /* ── pintado ──────────────────────────────────────────────────────────── */

  function pintarSub(f) {
    var nodo = el(ID_SUB);
    if (!nodo) return;
    var txt = '';
    if (f && f.desde && f.hasta) txt = 'del ' + fecha(f.desde) + ' al ' + fecha(f.hasta);
    if (f && (lista(f.empresas).length || lista(f.bases).length || lista(f.conceptos).length)) {
      txt += (txt ? ' · ' : '') + 'con filtros aplicados';
    }
    nodo.textContent = txt;
  }

  function pintarKpis(d) {
    var nodo = el(ID_KPIS);
    if (!nodo) return;
    var r = d.rangoAnterior;

    if (!d.hayDatos) {
      // Las etiquetas quedan a la vista para que se entienda qué va a mostrar la
      // sección; el valor es un guion, nunca un cero que se lea como un dato.
      nodo.innerHTML =
        kpi('Total facturado', GUION, true) +
        kpi('Total peajes', GUION) +
        kpi('KM facturados', GUION, true) +
        kpi('KM reales', GUION) +
        kpi('Servicios', GUION) +
        '<div class="dashx-kpi-delta is-flat" style="margin-top:12px">' + esc(VACIO_KPIS) + '</div>';
      return;
    }

    nodo.innerHTML =
      kpi('Total facturado', ch().nfPesos(d.totales.facturado), true,
          delta(d.totales.facturado, d.anterior.facturado, true, r)) +
      kpi('Total peajes', ch().nfPesos(d.totales.peajes), false,
          delta(d.totales.peajes, d.anterior.peajes, false, r)) +
      kpi('KM facturados', nfKm(d.totales.km), true,
          delta(d.totales.km, d.anterior.km, false, r)) +
      kpiReales(d) +
      kpi('Servicios', ch().nfMiles(d.totales.servicios), false,
          delta(d.totales.servicios, d.anterior.servicios, true, r));
  }

  /* La tabla que va pegada al treemap. El treemap responde "cuál es el servicio
     más común"; ésta responde "cuántos son y cuántos km facturan", que es la
     misma pregunta con los números al lado. Mismo orden y mismo color que las
     cajas, así que se leen como una sola cosa.

     Sin fila de totales a propósito: los totales de servicios y de km ya están
     en la columna de KPI, y repetirlos acá sería decir lo mismo dos veces en la
     misma pantalla. */
  function pintarConceptos(d, items) {
    ch().tabla(ID_CONC, {
      vacio: VACIO_CONC,
      columnas: [
        { clave: 'label',     titulo: 'Concepto',  tipo: 'texto', swatch: true },
        { clave: 'servicios', titulo: 'Servicios', barra: true },
        { clave: 'km',        titulo: 'Km',        decimales: 0, unidad: 'km' },
        { clave: 'monto',     titulo: 'Facturado', tipo: 'pesos' }
      ],
      filas: d.hayDatos ? (items || []) : []
    });
  }

  function pintarGraficos(d) {
    var g = ch();

    if (!d.hayDatos) {
      g.vacio(CV_DONUT, VACIO_DONUT);
      g.vacio(CV_CAJAS, VACIO_CAJAS);
      g.vacio(CV_PART, VACIO_BASES);
      // Bases dejó de ser un canvas: su vacío lo dibuja la tabla.
      g.tabla(CV_BASES, { vacio: VACIO_BASES, columnas: [], filas: [] });
      return [];
    }

    // Servicios por prestadora: el reparto es de cantidad, no de plata (la plata
    // está en los KPI y en el desglose por base).
    var empresas = agrupar(d.porEmpresa, function (f) { return f.servicios; });
    g.donut(CV_DONUT, {
      labels: empresas.map(function (i) { return i.label; }),
      values: empresas.map(function (i) { return i.value; }),
      // Al costado: abajo la leyenda se comía el alto del anillo.
      leyenda: 'derecha',
      vacio: VACIO_DONUT
    });

    // Composición de servicios por concepto, en cantidad de servicios.
    var conceptos = agrupar(d.porConcepto, function (f) { return f.servicios; });
    g.treemap(CV_CAJAS, { items: conceptos, vacio: VACIO_CAJAS });

    /* Desglose por base: una barra de participación arriba y la tabla abajo.

       La tabla da los absolutos y los promedios; la barra da lo que la tabla no
       muestra de un vistazo —qué porción del facturado se lleva cada base— y
       cuesta 78 px, contra los 200 de un anillo. Además no repite ninguna forma
       que ya esté en pantalla: arriba hay un anillo y al lado un treemap.

       Los promedios son la pregunta real de este cuadro: una base puede
       facturar más porque hace más servicios o porque cobra más caro cada uno,
       y los totales solos no distinguen una cosa de la otra. */
    var bases = agrupar(d.porBase, function (f) { return f.monto; });

    g.barraParticipacion(CV_PART, {
      items: bases,
      formato: 'pesos',
      vacio: VACIO_BASES
    });

    g.tabla(CV_BASES, {
      vacio: VACIO_BASES,
      totalEtiqueta: 'Total',
      columnas: [
        { clave: 'label',     titulo: 'Base',      tipo: 'texto', swatch: true },
        { clave: 'value',     titulo: 'Facturado', tipo: 'pesos', total: 'suma' },
        { clave: 'servicios', titulo: 'Servicios', total: 'suma' },
        { clave: 'km',        titulo: 'Km',        decimales: 0, unidad: 'km', total: 'suma' },
        // Promedios, no sumas: el cierre divide los totales entre sí, que no es
        // lo mismo que promediar la columna.
        { clave: 'ticket',    titulo: '$/servicio', tipo: 'pesos',
          total: { dividir: 'value', por: 'servicios' } },
        { clave: 'kmServicio', titulo: 'Km/serv.', decimales: 1,
          total: { dividir: 'km', por: 'servicios' } },
        // Margen contra los km reales de esa base. Null cuando ningún remito de
        // la base informó kilómetros: guión, no un cero que se lea como empate.
        { clave: 'margen', titulo: 'Margen', decimales: 1, unidad: '%',
          // El cierre no es el promedio de los márgenes: es el margen de los
          // totales. Promediar le daría el mismo peso a una base de 3 servicios
          // que a una de 300.
          total: function (filas) {
            var real = 0, comp = 0;
            filas.forEach(function (f) { real += num(f.kmReal); comp += num(f.kmComparable); });
            return real > 0 ? (comp - real) * 100 / real : null;
          } }
      ],
      filas: bases
    });

    return conceptos;
  }

  function pintar(d) {
    pintarKpis(d);
    pintarConceptos(d, pintarGraficos(d));
  }

  /* ── carga ────────────────────────────────────────────────────────────── */

  function paramArray(v) {
    var a = lista(v).filter(Boolean);
    return a.length ? a : null;
  }

  async function consultar(f) {
    // _db es un const de nivel superior en supabase.js: vive en el scope del
    // script, no en window, así que global._db da undefined.
    var db = (typeof _db !== 'undefined') ? _db : null;
    if (!db || typeof db.rpc !== 'function') {
      throw new Error('Sin conexión con la base de datos');
    }
    var res = await db.rpc(RPC, {
      p_desde: f.desde || null,
      p_hasta: f.hasta || null,
      p_empresas: paramArray(f.empresas),
      p_bases: paramArray(f.bases),
      p_conceptos: paramArray(f.conceptos)
    });
    if (res && res.error) throw res.error;
    return res ? res.data : null;
  }

  function mensajeError(e) {
    var codigo = e && e.code ? String(e.code) : '';
    var texto = e && e.message ? String(e.message) : '';
    // PGRST202: la función todavía no existe en la base (migración sin aplicar).
    if (codigo === 'PGRST202' || /Could not find the function/i.test(texto)) {
      return 'Las métricas de facturación todavía no están disponibles en la base.';
    }
    if (/Sin permiso/i.test(texto)) return 'No tenés permiso para ver las métricas de facturación.';
    if (/Período inválido/i.test(texto)) return 'El período seleccionado es inválido.';
    return 'No se pudieron cargar las métricas de facturación.';
  }

  async function cargar(filtros) {
    var f = filtros || {};
    pintarSub(f);
    var d = normalizar(await consultar(f));
    pintarFiltros(d, f);
    pintar(d);
  }

  /* El shell llama a esto cuando cargar() rompe: él ya loguea y apaga el overlay,
     acá sólo queda dejar la sección en un estado legible. */
  function alError(contenedor, e) {
    var msg = mensajeError(e);
    var g = ch();
    if (g) {
      g.error(CV_DONUT, msg);
      g.error(CV_CAJAS, msg);
      g.error(CV_PART, msg);
      g.tabla(CV_BASES, { vacio: msg, columnas: [], filas: [] });
      g.tabla(ID_CONC, { vacio: msg, columnas: [], filas: [] });
    }
    var nodo = el(ID_KPIS);
    if (nodo) {
      nodo.innerHTML =
        kpi('Total facturado', GUION, true) +
        kpi('Total peajes', GUION) +
        kpi('KM facturados', GUION, true) +
        kpi('KM reales', GUION) +
        kpi('Servicios', GUION) +
        '<div class="dashx-kpi-delta is-down" style="margin-top:12px">' + esc(msg) + '</div>';
    }
  }

  function montar() {
    // Esqueleto antes de la primera respuesta: las etiquetas ya dicen qué va a
    // haber en cada lugar y ningún número inventado.
    montarFiltros();
    pintarKpis(normalizar(null));
  }

  function registrar() {
    if (!global.AuxDash || !global.AuxDashCharts) return false;
    global.AuxDash.registrarSeccion({
      id: 'facturacion',
      // Viven en la barra de herramientas, fuera del cuerpo: el shell los
      // muestra y los esconde junto con la sección.
      filtros: ID_FILT,
      montar: montar,
      cargar: cargar,
      alError: alError
    });
    return true;
  }

  // Con <script defer> el motor y el shell ya corrieron; el listener es el
  // seguro por si alguna vez cambia el orden de carga en Index.html.
  if (!registrar()) {
    document.addEventListener('DOMContentLoaded', registrar, { once: true });
  }
})(window);

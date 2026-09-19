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
  var ID_KPIS  = 'dashx-fact-kpis';
  var ID_SUB   = 'dashx-fact-sub';
  var ID_KM    = 'dashx-fact-km';

  /* La paleta tiene 7 slots y no se cicla: la cola larga se agrupa en "Otros". */
  var MAX_CATEGORIAS = 7;

  var GUION = '—';

  var nodoKm = null;

  /* Mensajes del estado vacío. Explican que faltan servicios por cargar y qué va
     a mostrar cada gráfico, en vez de dejar un recuadro mudo. */
  var VACIO_DONUT = 'Todavía no hay servicios cargados en este período. Acá va a verse el reparto de servicios por prestadora.';
  var VACIO_CAJAS = 'Todavía no hay servicios cargados en este período. Acá va a verse la composición por concepto.';
  var VACIO_BASES = 'Todavía no hay servicios cargados en este período. Acá va a verse el desglose facturado por base.';
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
      km: num(o.km)
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
      return { label: f.nombre, value: num(valorDe(f)), km: f.km, servicios: f.servicios, monto: f.monto };
    });
    var top = ch().topN(items, MAX_CATEGORIAS) || [];
    var totalKm = 0, totalServicios = 0;
    items.forEach(function (i) { totalKm += i.km; totalServicios += i.servicios; });
    top.forEach(function (i) {
      if (i.km === undefined) {
        var km = totalKm, srv = totalServicios;
        top.forEach(function (o) { if (o !== i && o.km !== undefined) { km -= o.km; srv -= o.servicios; } });
        i.km = km;
        i.servicios = srv;
      }
    });
    return top;
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
      kpi('Servicios', ch().nfMiles(d.totales.servicios), false,
          delta(d.totales.servicios, d.anterior.servicios, true, r));
  }

  /* Los km facturados tienen tarjeta propia, al lado de la composición de la
     que salen. Antes colgaban del pie del treemap: es el dato que más se mira
     de esta sección y estaba abajo de todo, y encima dejaba tres columnas de
     la grilla vacías a la derecha. */
  function bloqueKm() {
    if (nodoKm) return nodoKm;
    nodoKm = el(ID_KM);
    return nodoKm;
  }

  function encabezadoKm(valor) {
    return '<div class="dashx-card-title">KM facturados</div>' +
      '<div class="dashx-chart-total">' +
        '<div class="dashx-chart-total-value is-amber">' + valor + '</div>' +
        '<div class="dashx-chart-total-label" id="' + ID_KM + '-pie"></div>' +
      '</div>';
  }

  function pintarKm(d, items) {
    var nodo = bloqueKm();
    if (!nodo) return;

    if (!d.hayDatos) {
      nodo.innerHTML = encabezadoKm(GUION) +
        '<div class="auxtb-vacio">' + esc(VACIO_KPIS) + '</div>';
      return;
    }

    /* Tabla con barras y no chips de colores: en una tarjeta angosta los chips
       se acomodaban en tres renglones desparejos, y acá lo que se compara es
       cuánto aporta cada concepto. Mismo orden y mismos colores que el treemap
       de al lado, que es de dónde salen estos km. */
    nodo.innerHTML = encabezadoKm(nfKm(d.totales.km)) + '<div id="' + ID_KM + '-tabla"></div>';
    var pie = el(ID_KM + '-pie');
    if (pie) pie.textContent = 'en ' + ch().nfMiles(d.totales.servicios) + ' servicios';
    ch().tabla(ID_KM + '-tabla', {
      vacio: VACIO_KPIS,
      columnas: [
        { clave: 'label', titulo: 'Concepto', tipo: 'texto' },
        { clave: 'km',    titulo: 'Km',       barra: true, unidad: 'km' }
      ],
      filas: (items || []).slice().sort(function (a, b) { return num(b.km) - num(a.km); })
    });
  }

  function pintarGraficos(d) {
    var g = ch();

    if (!d.hayDatos) {
      g.vacio(CV_DONUT, VACIO_DONUT);
      g.vacio(CV_CAJAS, VACIO_CAJAS);
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

    /* Desglose por base: tabla con barras y no cuatro barras sueltas. Son
       pocas filas con varias medidas, y así se ve de un vistazo que una base
       factura más pero con menos servicios —que es la pregunta real— en vez de
       cruzar tres gráficos. */
    g.tabla(CV_BASES, {
      vacio: VACIO_BASES,
      totalEtiqueta: 'Total',
      columnas: [
        { clave: 'label',     titulo: 'Base',      tipo: 'texto' },
        { clave: 'value',     titulo: 'Facturado', tipo: 'pesos', barra: true, total: 'suma' },
        { clave: 'servicios', titulo: 'Servicios', total: 'suma' },
        { clave: 'km',        titulo: 'Km',        decimales: 0, unidad: 'km', total: 'suma' }
      ],
      filas: agrupar(d.porBase, function (f) { return f.monto; })
    });

    return conceptos;
  }

  function pintar(d) {
    pintarKpis(d);
    pintarKm(d, pintarGraficos(d));
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
    pintar(normalizar(await consultar(f)));
  }

  /* El shell llama a esto cuando cargar() rompe: él ya loguea y apaga el overlay,
     acá sólo queda dejar la sección en un estado legible. */
  function alError(contenedor, e) {
    var msg = mensajeError(e);
    var g = ch();
    if (g) {
      g.error(CV_DONUT, msg);
      g.error(CV_CAJAS, msg);
      g.tabla(CV_BASES, { vacio: msg, columnas: [], filas: [] });
    }
    var nodo = el(ID_KPIS);
    if (nodo) {
      nodo.innerHTML =
        kpi('Total facturado', GUION, true) +
        kpi('Total peajes', GUION) +
        kpi('KM facturados', GUION, true) +
        kpi('Servicios', GUION) +
        '<div class="dashx-kpi-delta is-down" style="margin-top:12px">' + esc(msg) + '</div>';
    }
    var km = bloqueKm();
    if (km) km.innerHTML = encabezadoKm(GUION) + '<div class="auxtb-vacio">' + esc(msg) + '</div>';
  }

  function montar() {
    // Esqueleto antes de la primera respuesta: las etiquetas ya dicen qué va a
    // haber en cada lugar y ningún número inventado.
    bloqueKm();
    pintarKpis(normalizar(null));
  }

  function registrar() {
    if (!global.AuxDash || !global.AuxDashCharts) return false;
    global.AuxDash.registrarSeccion({
      id: 'facturacion',
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

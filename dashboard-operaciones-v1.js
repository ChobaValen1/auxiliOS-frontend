/* Dashboard rediseñado · sección OPERACIONES.
   Mismo lenguaje que Resumen (facturación): cifras arriba con la comparación
   contra el período anterior, un gráfico de actividad con su reparto al lado,
   dos tarjetas de razones y las tablas de móviles y choferes con su barra de
   participación.

   Todo lo pesado (filtrar, sumar, promediar, descartar jornadas con el odómetro
   mal cargado) lo hace dashboard_operaciones_v1 en Postgres. Acá no se suma
   nada: se pinta lo que vino. Para comparar se pide la misma RPC con el período
   anterior del mismo largo; si esa segunda llamada falla, las cifras se ven
   igual y la comparación dice "sin comparación".

   El estado, los filtros, el overlay de carga y el coalescing de recargas son
   del shell (AuxDash). Acá sólo se leen los filtros que llegan y se empujan los
   propios con AuxDash.setFiltro(). */
(function (global) {
  'use strict';

  var G = global.AuxDashCharts;
  var GUION = '—';

  var CANVAS = {
    tendencia:   'dashx-ops-tendencia',
    combustible: 'dashx-ops-combustible'
  };

  // Varias medidas sobre pocas filas: eso es una tabla, no cuatro gráficos de
  // barras que obligan a cruzarlos con la vista.
  var TABLAS = {
    camiones: 'dashx-ops-tabla-camiones',
    choferes: 'dashx-ops-tabla-choferes'
  };

  // Firma del catálogo con el que se pintaron los combos. Reconstruir el <select>
  // en cada recarga le borraría la selección al usuario justo después de elegirla.
  var firmaCatalogo = { camiones: null, choferes: null };

  // Lo último que vino: cambiar de métrica o de orden redibuja sin ir a la base.
  var estado = {
    datos: null, anterior: null, rangoAnterior: '',
    metrica: 'km',
    orden: { camiones: { clave: 'km', asc: false }, choferes: { clave: 'km', asc: false } }
  };

  /* ── helpers de formato ───────────────────────────────────────────────── */

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  // null de la RPC (división sin denominador) → null, nunca 0.
  function valor(v) {
    return (v === null || v === undefined || v === '' || !isFinite(Number(v))) ? null : Number(v);
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

  /* Los importes por unidad van con centavos. nfPesos redondea, y redondear
     $304,53 a $305 borra justo la diferencia que se quiere comparar entre un
     camión y otro. */
  function pesosFinos(v) {
    if (v === null || v === undefined || !isFinite(Number(v))) return '—';
    return '$' + Number(v).toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function pesosCorto(v) {
    if (v === null || v === undefined || !isFinite(Number(v))) return '—';
    var n = Number(v), a = Math.abs(n);
    if (a >= 1e6) return '$' + decimales(n / 1e6, 1) + 'M';
    if (a >= 1e3) return '$' + decimales(Math.round(n / 1e3), 0) + 'K';
    return '$' + decimales(Math.round(n), 0);
  }

  function miles(v) {
    if (v === null || v === undefined || !isFinite(Number(v))) return '—';
    return G.nfMiles(Math.round(Number(v)));
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 'YYYY-MM-DD' → 'DD/MM'. Sin new Date(): parsear un ISO corto lo interpreta
  // en UTC y en Argentina (UTC-3) devuelve el día anterior.
  function diaMes(iso) {
    var p = String(iso || '').split('-');
    return p.length === 3 ? p[2] + '/' + p[1] : String(iso || '');
  }

  function diaMesAnio(iso) {
    var p = String(iso || '').split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso || '');
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

  function texto(el, v) {
    if (el) el.textContent = v;
  }

  function iniciales(nombre) {
    var p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
    return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
  }

  /* Período anterior del mismo largo, terminando el día antes del actual. Las
     fechas se arman por partes y al mediodía: sin parsear el ISO, el día no
     se corre en ningún huso. */
  function rangoAnterior(desde, hasta) {
    var a = String(desde || '').split('-'), b = String(hasta || '').split('-');
    if (a.length !== 3 || b.length !== 3) return null;
    var fa = new Date(+a[0], +a[1] - 1, +a[2], 12), fb = new Date(+b[0], +b[1] - 1, +b[2], 12);
    var largo = Math.round((fb - fa) / 86400000) + 1;
    if (!(largo > 0)) return null;
    var iso = function (f) {
      return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0');
    };
    return {
      desde: iso(new Date(+a[0], +a[1] - 1, +a[2] - largo, 12)),
      hasta: iso(new Date(+a[0], +a[1] - 1, +a[2] - 1, 12))
    };
  }

  /* El color de la marca, el mismo que la evolución de Resumen. Sale del token
     y no de un hex escrito acá; sin token, el primero de la paleta. */
  function colorAcento(alfa) {
    var c = '';
    try { c = global.getComputedStyle(document.documentElement).getPropertyValue('--ax-accent').trim(); } catch (e) { c = ''; }
    if (!c) c = G.PALETA[0];
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
    if (alfa == null || !m) return c;
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + alfa + ')';
  }

  /* ── comparación con el período anterior ──────────────────────────────── */

  var FLECHA_SUBE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 11l4-4 3 3 5-5M10 5h4v4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var FLECHA_BAJA = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5l4 4 3-3 5 5M10 11h4V7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* `alReves`: para costos y consumos subir es malo, así que el verde va con
     la baja. 'neutro': ni bueno ni malo (horas por jornada, km por servicio),
     va en gris. La flecha siempre dice para dónde se movió el número. */
  function delta(actual, anterior, alReves) {
    var titulo = estado.rangoAnterior ? ' title="Contra ' + esc(estado.rangoAnterior) + '"' : '';
    if (actual == null || anterior == null || anterior <= 0) {
      return '<span class="rsm-delta is-flat"' + titulo + '>sin comparación</span>';
    }
    var v = (actual - anterior) * 100 / anterior;
    if (Math.abs(v) < 0.05) return '<span class="rsm-delta is-flat"' + titulo + '>= anterior</span>';
    var sube = v > 0;
    var bueno = alReves ? !sube : sube;
    var clase = alReves === 'neutro' ? 'is-flat' : (bueno ? 'is-up' : 'is-down');
    return '<span class="rsm-delta ' + clase + '"' + titulo + '>' +
      (sube ? FLECHA_SUBE : FLECHA_BAJA) + (sube ? '+' : '−') + decimales(Math.abs(v), 1) + '%</span>';
  }

  /* ── filtros ──────────────────────────────────────────────────────────── */

  /* Los selects van en la barra de arriba, en la misma fila que el período: son
     tres controles y eran tres renglones. Sin etiqueta encima: la primera opción
     ya dice "Todos los camiones", así que el rótulo repetía el dato y costaba
     una línea de alto. El aria-label queda para quien no ve el combo abierto. */
  function montarFiltros() {
    var cont = document.getElementById('dashx-ops-filtros');
    if (!cont || cont.dataset.listo === '1') return;
    cont.dataset.listo = '1';
    cont.innerHTML =
      '<select id="dashx-ops-f-camion" class="input-field" aria-label="Filtrar por camión"></select>' +
      '<select id="dashx-ops-f-chofer" class="input-field" aria-label="Filtrar por chofer"></select>';

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
    montarControles();
  }

  /* Métrica del gráfico de actividad y orden de las tablas: se resuelven con
     lo que ya vino, sin volver a la base. */
  function montarControles() {
    var sec = document.getElementById('dashx-sec-operaciones');
    if (!sec || sec.dataset.opxListo === '1') return;
    sec.dataset.opxListo = '1';
    sec.addEventListener('click', function (ev) {
      var m = ev.target.closest('[data-opx-metrica]');
      if (m) {
        estado.metrica = m.getAttribute('data-opx-metrica');
        pintarSegmentos();
        if (estado.datos) pintarTendencia(estado.datos);
        return;
      }
      var th = ev.target.closest('[data-opx-orden]');
      if (th) {
        var tabla = th.getAttribute('data-opx-tabla');
        var clave = th.getAttribute('data-opx-orden');
        var o = estado.orden[tabla];
        if (o.clave === clave) o.asc = !o.asc;
        else { o.clave = clave; o.asc = clave === 'etiqueta' || clave === 'nombre'; }
        if (!estado.datos) return;
        if (tabla === 'camiones') pintarTablaCamiones(estado.datos);
        else pintarTablaChoferes(estado.datos);
      }
    });
    pintarSegmentos();
  }

  function pintarSegmentos() {
    document.querySelectorAll('#dashx-sec-operaciones [data-opx-metrica]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-opx-metrica') === estado.metrica ? 'true' : 'false');
    });
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

  /* ── cifras de arriba ─────────────────────────────────────────────────── */

  function tile(label, v, deltaHtml, pie, destacado) {
    return '<div class="rsm-kpi' + (destacado ? ' is-main' : '') + '">' +
      '<div class="rsm-kpi-label">' + esc(label) + '</div>' +
      '<div class="rsm-kpi-value">' + v + '</div>' +
      '<div class="rsm-kpi-delta">' + deltaHtml + '</div>' +
      '<div class="rsm-kpi-foot">' + pie + '</div>' +
      '</div>';
  }

  function pintarKpis(datos) {
    var n = document.getElementById('dashx-ops-kpis');
    if (!n) return;
    var t = datos.totales || {}, e = datos.eficiencia || {}, c = datos.combustible || {};
    var ant = estado.anterior || {};
    var ta = ant.totales || null, ea = ant.eficiencia || null, ca = ant.combustible || null;
    var moviles = (datos.por_camion || []).filter(function (x) { return num(x.km) > 0; }).length;
    n.innerHTML =
      tile('Km recorridos', num(t.km) > 0 ? miles(t.km) + ' km' : GUION,
        delta(valor(t.km), ta && valor(ta.km)),
        'en ' + miles(t.jornadas) + ' jornadas' + (moviles ? ' · ' + moviles + (moviles === 1 ? ' móvil' : ' móviles') : ''), true) +
      tile('Servicios', miles(t.servicios), delta(valor(t.servicios), ta && valor(ta.servicios)),
        decimales(e.servicios_por_jornada, 1) + ' por jornada') +
      tile('Jornadas', miles(t.jornadas), delta(valor(t.jornadas), ta && valor(ta.jornadas)),
        decimales(e.horas_por_jornada, 1) + ' h en promedio') +
      tile('Km por servicio', decimales(e.km_por_servicio, 1) + ' km',
        delta(valor(e.km_por_servicio), ea && valor(ea.km_por_servicio), 'neutro'), 'Promedio del período') +
      tile('Combustible', pesos(c.gasto), delta(valor(c.gasto), ca && valor(ca.gasto), true),
        miles(c.cargas) + ' cargas · ' + miles(c.litros) + ' L') +
      tile('Costo por km', pesosFinos(c.costo_por_km), delta(valor(c.costo_por_km), ca && valor(ca.costo_por_km), true),
        'Combustible sobre los km recorridos');
  }

  function pintarSubtitulo(datos) {
    var sub = document.getElementById('dashx-ops-sub');
    if (!sub) return;
    var d = (datos && datos.descartes) || {};
    var partes = [diaMes(datos.desde) + ' – ' + diaMes(datos.hasta)];
    // Tres granos desde la v2: sin el caso 'mes' la vista anual decía "por día".
    partes.push({ dia: 'por día', semana: 'por semana', mes: 'por mes' }[datos.granularidad] || 'por día');
    if (estado.rangoAnterior) partes.push('comparado con ' + estado.rangoAnterior);
    texto(sub, partes.join(' · '));
  }

  /* Las jornadas descartadas se muestran: un total silenciosamente incompleto
     es peor que un total con la advertencia al lado. Sólo lo que no es cero:
     "0 sin km válido" es ruido, no información. */
  function avisos(datos) {
    var d = (datos && datos.descartes) || {};
    var out = [];
    if (num(d.jornadas_sin_km) > 0) {
      out.push(num(d.jornadas_sin_km) + (num(d.jornadas_sin_km) === 1 ? ' jornada' : ' jornadas') + ' sin km utilizable');
    }
    if (num(d.jornadas_sin_horas) > 0) {
      out.push(num(d.jornadas_sin_horas) + (num(d.jornadas_sin_horas) === 1 ? ' jornada' : ' jornadas') + ' sin horario utilizable');
    }
    // Sin esto, el total de servicios de la tabla por camión no da igual que el
    // de la tabla por chofer y no hay forma de saber por qué.
    if (num(d.servicios_sin_camion) > 0) {
      out.push(num(d.servicios_sin_camion) + (num(d.servicios_sin_camion) === 1 ? ' servicio' : ' servicios') + ' sin camión');
    }
    // Un remito de alguien que no cerró jornada en el rango: cuenta en el total
    // pero no tiene fila propia en la tabla por chofer.
    if (num(d.servicios_sin_chofer) > 0) {
      out.push(num(d.servicios_sin_chofer) + (num(d.servicios_sin_chofer) === 1 ? ' servicio' : ' servicios') + ' sin chofer');
    }
    return out;
  }

  /* ── tarjetas de razones ──────────────────────────────────────────────── */

  function dato(label, v, deltaHtml, pie) {
    return '<div class="rsm-ef-dato opx-dato"><span>' + esc(label) + '</span><b>' + v + '</b>' +
      '<em>' + (deltaHtml || '') + (pie ? '<i>' + pie + '</i>' : '') + '</em></div>';
  }

  function pintarRazonesCombustible(datos) {
    var cont = document.getElementById('dashx-ops-comb-metrics');
    if (!cont) return;
    var c = datos.combustible || {};
    var ca = (estado.anterior && estado.anterior.combustible) || null;
    var antes = function (v, f) { return v == null ? '' : 'antes ' + f(v); };
    if (!num(c.cargas)) {
      cont.innerHTML = '<div class="rsm-vacio">Sin cargas de combustible en el período.</div>';
      return;
    }
    cont.innerHTML = '<div class="rsm-ef-grid opx-grid">' +
      dato('Km por litro', decimales(c.km_por_litro, 2), delta(valor(c.km_por_litro), ca && valor(ca.km_por_litro)),
        antes(ca && valor(ca.km_por_litro), function (v) { return decimales(v, 2); })) +
      dato('Litros cada 100 km', decimales(c.litros_por_100km, 1) + ' L', delta(valor(c.litros_por_100km), ca && valor(ca.litros_por_100km), true),
        antes(ca && valor(ca.litros_por_100km), function (v) { return decimales(v, 1) + ' L'; })) +
      dato('Costo por km', pesosFinos(c.costo_por_km), delta(valor(c.costo_por_km), ca && valor(ca.costo_por_km), true),
        antes(ca && valor(ca.costo_por_km), pesosFinos)) +
      dato('Precio por litro', pesosFinos(c.precio_litro), delta(valor(c.precio_litro), ca && valor(ca.precio_litro), true),
        antes(ca && valor(ca.precio_litro), pesosFinos)) +
      dato('Ticket promedio', pesos(c.ticket_promedio), delta(valor(c.ticket_promedio), ca && valor(ca.ticket_promedio), true),
        'lo que sale una carga') +
      dato('Litros por carga', decimales(c.litros_por_carga, 1) + ' L', '', miles(c.cargas) + ' cargas en el período') +
      '</div>';
  }

  function pintarJornada(datos) {
    var cont = document.getElementById('dashx-ops-ratios');
    if (!cont) return;
    var t = datos.totales || {}, e = datos.eficiencia || {};
    var ea = (estado.anterior && estado.anterior.eficiencia) || null;
    var kmJornada = num(t.jornadas) > 0 ? num(t.km) / num(t.jornadas) : null;
    var at = (estado.anterior && estado.anterior.totales) || null;
    var kmJornadaAnt = at && num(at.jornadas) > 0 ? num(at.km) / num(at.jornadas) : null;
    var notas = avisos(datos);
    cont.innerHTML = '<div class="rsm-ef-grid opx-grid opx-grid-2">' +
      dato('Servicios por jornada', decimales(e.servicios_por_jornada, 2), delta(valor(e.servicios_por_jornada), ea && valor(ea.servicios_por_jornada)), '') +
      dato('Km por servicio', decimales(e.km_por_servicio, 1) + ' km', delta(valor(e.km_por_servicio), ea && valor(ea.km_por_servicio), 'neutro'), '') +
      dato('Horas por jornada', decimales(e.horas_por_jornada, 1) + ' h', delta(valor(e.horas_por_jornada), ea && valor(ea.horas_por_jornada), 'neutro'), 'con horario cargado') +
      dato('Km por jornada', kmJornada == null ? GUION : decimales(kmJornada, 0) + ' km', delta(kmJornada, kmJornadaAnt), '') +
      '</div>' +
      '<div class="opx-notas">' + (notas.length
        ? notas.map(function (x) { return '<span class="opx-nota is-aviso">' + esc(x) + '</span>'; }).join('')
        : '<span class="opx-nota is-ok">Todas las jornadas tienen km y horario utilizables</span>') + '</div>';
  }

  /* ── tablas ───────────────────────────────────────────────────────────── */

  function ordenar(filas, o) {
    var k = o.clave, s = o.asc ? 1 : -1;
    return filas.slice().sort(function (a, b) {
      var va = a[k], vb = b[k];
      if (typeof va === 'string' || typeof vb === 'string') return s * String(va || '').localeCompare(String(vb || ''), 'es');
      var na = valor(va), nb = valor(vb);
      if (na == null && nb == null) return 0;
      if (na == null) return 1;   // sin dato siempre al final
      if (nb == null) return -1;
      return s * (na - nb);
    });
  }

  function th(tabla, clave, titulo, numerica) {
    var o = estado.orden[tabla];
    var activo = o.clave === clave;
    return '<th class="opx-th' + (numerica ? ' rsm-num' : '') + (activo ? ' is-orden' : '') + '"' +
      ' aria-sort="' + (activo ? (o.asc ? 'ascending' : 'descending') : 'none') + '">' +
      '<button type="button" data-opx-tabla="' + tabla + '" data-opx-orden="' + clave + '">' + titulo +
      '<i aria-hidden="true">' + (activo ? (o.asc ? '▲' : '▼') : '') + '</i></button></th>';
  }

  /* Celda numérica con su rótulo en data-label: en el celular cada fila se
     ve como tarjeta y el rótulo va al lado del número. */
  function td(label, html, clase) {
    return '<td class="rsm-num' + (clase ? ' ' + clase : '') + '" data-label="' + esc(label) + '">' + html + '</td>';
  }

  function part(v, total, color) {
    var p = total > 0 ? num(v) * 100 / total : 0;
    return '<td class="opx-td-part"><span class="rsm-part"><span class="rsm-part-track"><i style="width:' + p.toFixed(1) + '%;background:' + color + '"></i></span>' +
      '<em>' + decimales(p, 1) + '%</em></span></td>';
  }

  /* Km por litro contra el de toda la flota: más de 5% arriba rinde mejor, más
     de 5% abajo pide mirar el camión. */
  function claseRendimiento(v, flota) {
    if (v == null || flota == null || flota <= 0) return '';
    if (v >= flota * 1.05) return 'is-good';
    if (v <= flota * 0.95) return 'is-bad';
    return '';
  }

  function pintarTablaCamiones(datos) {
    var n = document.getElementById(TABLAS.camiones);
    if (!n) return;
    var filas = (datos.por_camion || []).map(function (c) {
      return Object.assign({}, c, {
        km_por_servicio: num(c.servicios) > 0 ? num(c.km) / num(c.servicios) : null,
        costo_por_km: num(c.km) > 0 && num(c.costo) > 0 ? num(c.costo) / num(c.km) : null
      });
    });
    if (!filas.length) {
      n.innerHTML = '<div class="rsm-vacio">Sin jornadas ni cargas de camión en el período.</div>';
      return;
    }
    var t = datos.totales || {}, e = datos.eficiencia || {};
    var flota = valor(e.km_por_litro);
    // El color de cada móvil sale del orden por km y no del orden de la tabla:
    // ordenar por otra columna no le cambia el color a nadie.
    var porKm = filas.slice().sort(function (a, b) { return num(b.km) - num(a.km); });
    var colorDe = {};
    porKm.forEach(function (c, i) { colorDe[c.truck_id] = i < G.PALETA.length ? G.PALETA[i] : 'var(--ax-text-3)'; });
    var cuerpo = ordenar(filas, estado.orden.camiones).map(function (c) {
      var color = colorDe[c.truck_id];
      var kml = valor(c.km_por_litro);
      return '<tr>' +
        '<td class="opx-td-nombre"><span class="rsm-emp-nombre"><i style="background:' + color + '"></i><b>' + esc(c.etiqueta) + '</b></span></td>' +
        part(c.km, num(t.km), color) +
        td('Km', num(c.km) > 0 ? miles(c.km) + ' km' : GUION) +
        td('Servicios', miles(c.servicios)) +
        td('Jornadas', miles(c.jornadas)) +
        td('Km/serv.', decimales(c.km_por_servicio, 1), 'rsm-muted') +
        td('Litros', num(c.litros) > 0 ? miles(c.litros) + ' L' : GUION) +
        td('Gasto', num(c.costo) > 0 ? pesos(c.costo) : GUION) +
        td('$/km', pesosFinos(c.costo_por_km), 'rsm-muted') +
        td('Km/L', decimales(kml, 2), 'rsm-ratio ' + claseRendimiento(kml, flota)) +
        '</tr>';
    }).join('');
    var sinCamion = num((datos.descartes || {}).servicios_sin_camion);
    n.innerHTML = '<div class="rsm-tabla-wrap"><table class="rsm-tabla opx-tabla">' +
      '<thead><tr>' + th('camiones', 'etiqueta', 'Móvil') + '<th>Participación</th>' +
        th('camiones', 'km', 'Km', true) + th('camiones', 'servicios', 'Servicios', true) +
        th('camiones', 'jornadas', 'Jornadas', true) + th('camiones', 'km_por_servicio', 'Km/serv.', true) +
        th('camiones', 'litros', 'Litros', true) + th('camiones', 'costo', 'Gasto', true) +
        th('camiones', 'costo_por_km', '$/km', true) + th('camiones', 'km_por_litro', 'Km/L', true) + '</tr></thead>' +
      '<tbody>' + cuerpo + '</tbody>' +
      // El pie sale de los totales de la RPC, no de sumar la columna: las razones
      // son km totales / litros totales, no el promedio de los camiones.
      '<tfoot><tr><td class="opx-td-nombre"><b>Total</b></td><td class="rsm-muted opx-td-part">' + filas.length + (filas.length === 1 ? ' móvil' : ' móviles') + '</td>' +
        td('Km', '<b>' + miles(t.km) + ' km</b>') +
        td('Servicios', '<b>' + miles(t.servicios) + '</b>') +
        td('Jornadas', '<b>' + miles(t.jornadas) + '</b>') +
        td('Km/serv.', decimales(e.km_por_servicio, 1), 'rsm-muted') +
        td('Litros', '<b>' + miles(t.litros) + ' L</b>') +
        td('Gasto', '<b>' + pesos(t.costo) + '</b>') +
        td('$/km', pesosFinos(e.costo_por_km), 'rsm-muted') +
        td('Km/L', '<b>' + decimales(e.km_por_litro, 2) + '</b>') +
      '</tr></tfoot></table></div>' +
      '<p class="rsm-nota">Km/L en verde: rinde más de 5% arriba de la flota (' + decimales(flota, 2) + ' km/L); en rojo, más de 5% abajo. ' +
        'Tocá un título para ordenar.' + (sinCamion > 0 ? ' El total incluye ' + sinCamion + (sinCamion === 1 ? ' servicio' : ' servicios') + ' sin camión.' : '') + '</p>';
  }

  function pintarTablaChoferes(datos) {
    var n = document.getElementById(TABLAS.choferes);
    if (!n) return;
    var filas = (datos.por_chofer || []).map(function (c) {
      return Object.assign({}, c, {
        servicios_por_jornada: num(c.jornadas) > 0 ? num(c.servicios) / num(c.jornadas) : null,
        km_por_servicio: num(c.servicios) > 0 ? num(c.km) / num(c.servicios) : null
      });
    });
    if (!filas.length) {
      n.innerHTML = '<div class="rsm-vacio">Sin jornadas de chofer en el período.</div>';
      return;
    }
    var t = datos.totales || {}, e = datos.eficiencia || {};
    var color = colorAcento();
    var cuerpo = ordenar(filas, estado.orden.choferes).map(function (c) {
      return '<tr>' +
        '<td class="opx-td-nombre"><span class="opx-chofer"><i aria-hidden="true">' + esc(iniciales(c.nombre)) + '</i><b>' + esc(c.nombre) + '</b></span></td>' +
        part(c.km, num(t.km), color) +
        td('Km', num(c.km) > 0 ? miles(c.km) + ' km' : GUION) +
        td('Servicios', miles(c.servicios)) +
        td('Jornadas', miles(c.jornadas)) +
        td('Horas', num(c.horas) > 0 ? miles(c.horas) + ' h' : GUION) +
        td('H/jornada', decimales(c.horas_por_jornada, 1), 'rsm-muted') +
        td('Serv./jornada', decimales(c.servicios_por_jornada, 1), 'rsm-muted') +
        td('Km/serv.', decimales(c.km_por_servicio, 1), 'rsm-muted') +
        '</tr>';
    }).join('');
    var sinChofer = num((datos.descartes || {}).servicios_sin_chofer);
    n.innerHTML = '<div class="rsm-tabla-wrap"><table class="rsm-tabla opx-tabla">' +
      '<thead><tr>' + th('choferes', 'nombre', 'Chofer') + '<th>Participación</th>' +
        th('choferes', 'km', 'Km', true) + th('choferes', 'servicios', 'Servicios', true) +
        th('choferes', 'jornadas', 'Jornadas', true) + th('choferes', 'horas', 'Horas', true) +
        th('choferes', 'horas_por_jornada', 'H/jornada', true) + th('choferes', 'servicios_por_jornada', 'Serv./jornada', true) +
        th('choferes', 'km_por_servicio', 'Km/serv.', true) + '</tr></thead>' +
      '<tbody>' + cuerpo + '</tbody>' +
      '<tfoot><tr><td class="opx-td-nombre"><b>Total</b></td><td class="rsm-muted opx-td-part">' + filas.length + (filas.length === 1 ? ' chofer' : ' choferes') + '</td>' +
        td('Km', '<b>' + miles(t.km) + ' km</b>') +
        td('Servicios', '<b>' + miles(t.servicios) + '</b>') +
        td('Jornadas', '<b>' + miles(t.jornadas) + '</b>') +
        td('Horas', '<b>' + miles(t.horas) + ' h</b>') +
        // Horas sobre las jornadas con horario utilizable, igual que cada fila.
        td('H/jornada', decimales(e.horas_por_jornada, 1), 'rsm-muted') +
        td('Serv./jornada', decimales(e.servicios_por_jornada, 1), 'rsm-muted') +
        td('Km/serv.', decimales(e.km_por_servicio, 1), 'rsm-muted') +
      '</tr></tfoot></table></div>' +
      '<p class="rsm-nota">H/jornada cuenta sólo las jornadas con horario cargado. Tocá un título para ordenar.' +
        (sinChofer > 0 ? ' El total incluye ' + sinChofer + (sinChofer === 1 ? ' servicio' : ' servicios') + ' sin chofer con jornada.' : '') + '</p>';
  }

  /* ── gráficos ─────────────────────────────────────────────────────────── */

  var METRICAS = {
    km:        { nombre: 'Km', unidad: 'km', vacio: 'Sin jornadas en el período' },
    servicios: { nombre: 'Servicios', unidad: 'servicios', vacio: 'Sin servicios en el período' },
    jornadas:  { nombre: 'Jornadas', unidad: 'jornadas', vacio: 'Sin jornadas en el período' }
  };

  /* Barras, no línea: son valores de días sueltos, no una magnitud continua, y
     la línea sugería una transición entre un día y el siguiente que no existe.
     La referencia de promedio es lo que hace legible el zigzag: sin ella no se
     sabe qué día estuvo bien y cuál mal. Una métrica por vez: km, servicios y
     jornadas tienen escalas distintas y no comparten eje. */
  function pintarTendencia(datos) {
    var serie = datos.serie_temporal || [];
    var m = METRICAS[estado.metrica] ? estado.metrica : 'km';
    var grano = datos.granularidad || 'dia';
    var nombreGrano = { dia: 'día', semana: 'semana', mes: 'mes' }[grano] || 'día';
    texto(document.getElementById('dashx-ops-act-sub'),
      METRICAS[m].nombre + ' por ' + nombreGrano + ' · línea punteada: promedio · fines de semana más claros');
    if (!serie.length) return G.vacio(CANVAS.tendencia, METRICAS[m].vacio);
    var vals = serie.map(function (p) { return num(p[m]); });
    var conDatos = vals.filter(function (v) { return v > 0; });
    var promedio = conDatos.length
      ? conDatos.reduce(function (a, b) { return a + b; }, 0) / conDatos.length
      : 0;

    // Sábados y domingos en tono más tenue: la operación baja el fin de semana
    // y sin distinguirlos los valles parecen caídas de productividad.
    var pleno = colorAcento(), tenue = colorAcento(0.4);
    var colores = serie.map(function (p) {
      var d = new Date(p.fecha + 'T12:00:00');
      var finde = grano === 'dia' && (d.getDay() === 0 || d.getDay() === 6);
      return finde ? tenue : pleno;
    });

    G.barras(CANVAS.tendencia, {
      labels: serie.map(function (p) { return etiquetaEje(p.fecha, grano); }),
      values: vals,
      colores: colores,
      unidad: METRICAS[m].unidad,
      maxEtiquetas: 12,
      referencia: promedio > 0
        ? { valor: m === 'km' ? Math.round(promedio) : Math.round(promedio * 10) / 10, label: 'Promedio por ' + nombreGrano }
        : null
    });
  }

  /* ── combustible ──────────────────────────────────────────────────────────
     Es el costo variable más grande de la operación y tiene su propio bloque:
     cómo se paga (el anillo, con el total en el centro) y cada medio con sus
     cargas, litros y parte del gasto, igual que la composición por tipo de
     Resumen.

     La paleta tiene 7 slots y no se cicla, así que la cola larga se agrupa.
     Se agrupa acá, sobre los objetos completos, y no con G.topN: el gráfico y
     la lista tienen que hablar de las mismas filas, y topN devuelve sólo
     {label, value}. */
  function agruparMedios(lista) {
    var orden = (lista || []).filter(function (m) { return num(m.gasto) > 0; })
      .sort(function (a, b) { return num(b.gasto) - num(a.gasto); });
    var max = G.PALETA.length;
    if (orden.length <= max) return orden;
    var otros = orden.slice(max - 1).reduce(function (a, m) {
      a.cargas += num(m.cargas); a.litros += num(m.litros); a.gasto += num(m.gasto);
      return a;
    }, { medio: 'Otros', cargas: 0, litros: 0, gasto: 0 });
    return orden.slice(0, max - 1).concat([otros]);
  }

  function pintarCombustible(datos) {
    var c = (datos && datos.combustible) || {};
    var medios = agruparMedios(c.por_medio);
    var total = num(c.gasto);
    var centro = document.getElementById('dashx-ops-comb-total');
    if (centro) centro.innerHTML = medios.length
      ? '<b>' + pesosCorto(total) + '</b><span>Gasto</span>' : '';
    texto(document.getElementById('dashx-ops-comb-sub'), medios.length
      ? miles(c.cargas) + ' cargas · ' + miles(c.litros) + ' L · ' + pesosFinos(c.precio_litro) + ' por litro'
      : 'Gasto por medio de pago');
    var ls = document.getElementById('dashx-ops-comb-lista');
    if (ls) {
      ls.innerHTML = medios.length ? medios.map(function (m, i) {
        return '<div class="rsm-tipo opx-medio">' +
          '<i style="background:' + G.PALETA[i] + '"></i>' +
          '<b class="rsm-tipo-nombre">' + esc(m.medio) + '</b>' +
          '<span class="rsm-tipo-det">' + miles(m.cargas) + (num(m.cargas) === 1 ? ' carga' : ' cargas') + ' · ' + miles(m.litros) + ' L</span>' +
          '<b class="rsm-tipo-monto">' + pesosCorto(m.gasto) + '</b>' +
          '<span class="rsm-tipo-pct">' + (total > 0 ? decimales(num(m.gasto) * 100 / total, 0) + '%' : GUION) + '</span>' +
          '</div>';
      }).join('') : '<div class="rsm-vacio">Sin cargas en el período.</div>';
    }
    if (!medios.length) return G.vacio(CANVAS.combustible, 'Sin cargas en el período');
    // El reparto es por gasto, no por litros: la pregunta es por dónde se va la
    // plata. Los litros y las cargas quedan en la lista de al lado.
    G.donut(CANVAS.combustible, {
      labels: medios.map(function (m) { return m.medio; }),
      values: medios.map(function (m) { return num(m.gasto); }),
      formato: 'pesos',
      leyenda: 'ninguna'
    });
  }

  /* ── ciclo de vida ────────────────────────────────────────────────────── */

  function cadaCanvas(fn) {
    Object.keys(CANVAS).forEach(function (k) { fn(CANVAS[k]); });
  }

  function pintar(datos, filtros) {
    pintarFiltros(datos, filtros);
    pintarSubtitulo(datos);
    pintarKpis(datos);
    pintarTendencia(datos);
    pintarCombustible(datos);
    pintarRazonesCombustible(datos);
    pintarJornada(datos);
    pintarTablaCamiones(datos);
    pintarTablaChoferes(datos);
  }

  async function cargar(filtros) {
    // _db es un const de nivel superior en supabase.js: vive en el scope del
    // script, no en window, así que global._db da undefined.
    var db = (typeof _db !== 'undefined') ? _db : null;
    if (!db || typeof db.rpc !== 'function') {
      throw new Error('Sin conexión con la base de datos');
    }

    var base = {
      // Arrays vacíos: la RPC los trata igual que null (sin filtro).
      p_camiones: (filtros.camiones || []).map(Number).filter(function (n) { return isFinite(n); }),
      p_choferes: (filtros.choferes || []).map(String)
    };
    var prev = rangoAnterior(filtros.desde, filtros.hasta);
    var pedidos = [
      db.rpc('dashboard_operaciones_v1', Object.assign({ p_desde: filtros.desde, p_hasta: filtros.hasta }, base))
    ];
    // La comparación es un extra: si falla, la sección se ve igual sin ella.
    if (prev) {
      pedidos.push(Promise.resolve(db.rpc('dashboard_operaciones_v1', Object.assign({ p_desde: prev.desde, p_hasta: prev.hasta }, base)))
        .catch(function () { return null; }));
    }
    var r = await Promise.all(pedidos);
    var resp = r[0];
    if (resp.error) throw resp.error;
    var datos = resp.data || {};
    var anterior = r[1] && !r[1].error ? r[1].data : null;

    estado.datos = datos;
    estado.anterior = anterior;
    estado.rangoAnterior = prev && anterior ? diaMesAnio(prev.desde) + ' al ' + diaMesAnio(prev.hasta) : '';
    pintar(datos, filtros);
  }

  function alError(contenedor, e) {
    var msg = (e && e.message) ? e.message : 'No se pudieron cargar las métricas';
    cadaCanvas(function (id) { G.error(id, msg); });
    estado.datos = null;
    // Se vacían: dejar las tarjetas de la carga anterior haría pasar números
    // viejos por números del filtro nuevo.
    ['dashx-ops-kpis', 'dashx-ops-ratios', 'dashx-ops-comb-metrics', 'dashx-ops-comb-lista',
     TABLAS.camiones, TABLAS.choferes].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
    var centro = document.getElementById('dashx-ops-comb-total');
    if (centro) centro.innerHTML = '';
    texto(document.getElementById('dashx-ops-comb-sub'), '');
    texto(document.getElementById('dashx-ops-sub'), 'No se pudieron cargar las métricas');
  }

  if (global.AuxDash && typeof global.AuxDash.registrarSeccion === 'function') {
    global.AuxDash.registrarSeccion({
      id: 'operaciones',
      // Vive en la barra de herramientas, fuera del cuerpo: el shell lo muestra
      // y lo esconde junto con la sección.
      filtros: 'dashx-ops-filtros',
      montar: montarFiltros,
      cargar: cargar,
      alError: alError
    });
  }

  // Sólo para los tests de patrón y para depurar desde la consola.
  global.AuxDashOperaciones = {
    cargar: cargar,
    alError: alError,
    CANVAS: CANVAS,
    rangoAnterior: rangoAnterior,
    agruparMedios: agruparMedios
  };
})(window);

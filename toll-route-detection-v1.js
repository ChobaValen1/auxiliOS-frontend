/* AuxiliOS · Detectar peajes del recorrido (v1)

   Con el trazado que devuelve el cálculo de ruta (Base → Origen → Destino → Base) y la
   ubicación de cada peaje del catálogo, propone los peajes por los que pasa el recorrido:
   · un mapa chico con el trazado, los puntos del recorrido y un número en cada peaje;
   · cuántas veces pasa por cada uno (ida y vuelta suman);
   · el operador elige cuáles agregar. Quién paga y el medio de pago quedan vacíos, y
     un peaje que ya está cargado no se vuelve a agregar.
   Sólo se detectan peajes con ubicación cargada (Configuración › Peajes). */
(function (global) {
  'use strict';

  var RADIO_M = 150;          // a qué distancia del trazado se considera que se pasa por el peaje
  var M_POR_GRADO = 111320;
  var ANCHO = 320, ALTO = 180, MARGEN = 14;

  var state = { detect: null };

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ico(name) { return '<svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#' + name + '"/></svg>'; }
  function notify(m, t) { if (typeof global.toast === 'function') global.toast(m, t || 'info'); }
  function O() { return global.OperatorServices; }
  function W() { var o = O(); return o && o.S ? o.S.wizard : null; }

  /* ── Geometría ────────────────────────────────────────────────────────── */

  // Decodifica el trazado de Google (polilínea codificada, 5 decimales).
  function decode(texto) {
    var s = String(texto || ''), i = 0, lat = 0, lng = 0, out = [];
    while (i < s.length) {
      var b, shift = 0, r = 0;
      do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << shift; shift += 5; } while (b >= 32 && i < s.length + 1);
      lat += (r & 1) ? ~(r >> 1) : (r >> 1);
      shift = 0; r = 0;
      do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << shift; shift += 5; } while (b >= 32 && i < s.length + 1);
      lng += (r & 1) ? ~(r >> 1) : (r >> 1);
      out.push([lat / 1e5, lng / 1e5]);
    }
    return out;
  }

  // Punto más cercano de un segmento a un punto, en un plano local alrededor de éste:
  // devuelve los metros y la fracción (0 a 1) del segmento donde queda.
  function cercanoEnSegmento(p, a, b) {
    var k = Math.cos(p[0] * Math.PI / 180) * M_POR_GRADO;
    var ax = (a[1] - p[1]) * k, ay = (a[0] - p[0]) * M_POR_GRADO;
    var bx = (b[1] - p[1]) * k, by = (b[0] - p[0]) * M_POR_GRADO;
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    var t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    var x = ax + t * dx, y = ay + t * dy;
    return { d: Math.sqrt(x * x + y * y), t: t };
  }
  function distanciaASegmento(p, a, b) { return cercanoEnSegmento(p, a, b).d; }

  function largoSegmento(a, b) {
    var k = Math.cos(a[0] * Math.PI / 180) * M_POR_GRADO;
    var dx = (b[1] - a[1]) * k, dy = (b[0] - a[0]) * M_POR_GRADO;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* Cuántas veces el trazado pasa a menos de RADIO_M de un punto. Se toma, en cada tramo
     cercano, la posición sobre el recorrido donde queda el punto; dos posiciones a menos de
     2 × RADIO_M son la misma pasada, y si el trazado se aleja y vuelve (ida y vuelta) son dos. */
  function pasadas(puntos, acum, punto) {
    var posiciones = [], minimo = Infinity;
    for (var i = 0; i < puntos.length - 1; i++) {
      var c = cercanoEnSegmento(punto, puntos[i], puntos[i + 1]);
      if (c.d < minimo) minimo = c.d;
      if (c.d <= RADIO_M) posiciones.push(acum[i] + c.t * (acum[i + 1] - acum[i]));
    }
    var inicios = posiciones.length ? [posiciones[0]] : [];
    for (var k = 1; k < posiciones.length; k++) if (posiciones[k] - posiciones[k - 1] > 2 * RADIO_M) inicios.push(posiciones[k]);
    return { pasadas: inicios.length, at: inicios, minimo: minimo, orden: inicios.length ? inicios[0] : Infinity };
  }

  /* peajes: [{toll_id, name, latitude, longitude, ...}]. Devuelve los que el trazado cruza,
     en el orden en que se pasa por ellos. */
  function detectar(puntos, peajes) {
    if (!puntos || puntos.length < 2) return [];
    var acum = [0];
    for (var i = 1; i < puntos.length; i++) acum.push(acum[i - 1] + largoSegmento(puntos[i - 1], puntos[i]));
    var hits = [];
    (peajes || []).forEach(function (t) {
      var lat = Number(t.latitude), lng = Number(t.longitude);
      if (t.latitude == null || t.longitude == null || !isFinite(lat) || !isFinite(lng)) return;
      var r = pasadas(puntos, acum, [lat, lng]);
      if (r.pasadas > 0) hits.push({ toll: t, passes: r.pasadas, at: r.at, distance: Math.round(r.minimo), order: r.orden });
    });
    hits.sort(function (a, b) { return a.order - b.order; });
    return hits;
  }

  /* ── Mapa (SVG, sin mosaicos: no depende de ningún servicio) ─────────── */

  function corto(texto, max) {
    var t = String(texto == null ? '' : texto).split(',')[0].trim();
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
  }
  function km(m) { return (Math.round(num(m) / 100) / 10).toLocaleString('es-AR'); }

  // Largo "redondo" de la escala: el mayor que entra en un tercio del ancho del mapa.
  function largoEscala(metrosPorPx, maxPx) {
    var opciones = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000], elegido = opciones[0];
    opciones.forEach(function (m) { if (m / metrosPorPx <= maxPx) elegido = m; });
    return elegido;
  }

  /* Mosaicos de OpenStreetMap detrás del trazado. x0/y0: esquina superior izquierda visible (mundo 0..1); escala: unidades del mapa por mundo.
     Si no hay red, cada imagen se oculta sola y queda el esquema sin fondo. */
  function mosaicos(x0, y0, escala) {
    var zc = Math.log(escala / 256) / Math.LN2, z = Math.max(0, Math.min(18, Math.round(zc) + 1)), n = Math.pow(2, z), t = escala / n, out = '';
    var tx0 = Math.max(0, Math.floor(x0 * n)), tx1 = Math.min(n - 1, Math.floor((x0 + ANCHO / escala) * n));
    var ty0 = Math.max(0, Math.floor(y0 * n)), ty1 = Math.min(n - 1, Math.floor((y0 + ALTO / escala) * n));
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 30) return '';
    for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) {
      out += '<image href="https://tile.openstreetmap.org/' + z + '/' + tx + '/' + ty + '.png" x="' + ((tx / n - x0) * escala).toFixed(2) + '" y="' + ((ty / n - y0) * escala).toFixed(2) + '" width="' + (t + 0.4).toFixed(2) + '" height="' + (t + 0.4).toFixed(2) + '" preserveAspectRatio="none" onerror="this.style.display=\'none\'"/>';
    }
    return '<g class="tdt-tiles">' + out + '</g>';
  }

  function mapa(puntos, waypoints, hits) {
    var todos = puntos.concat(waypoints.map(function (w) { return [w.lat, w.lng]; }));
    hits.forEach(function (h) { todos.push([Number(h.toll.latitude), Number(h.toll.longitude)]); });
    // Proyección Web Mercator (la de los mapas de OpenStreetMap): así los mosaicos de fondo coinciden con el trazado.
    function merc(p) { return [(p[1] + 180) / 360, 0.5 - Math.log(Math.tan(Math.PI / 4 + p[0] * Math.PI / 360)) / (2 * Math.PI)]; }
    var mw = todos.map(merc), minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, latMedia = 0;
    mw.forEach(function (q) { minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); });
    todos.forEach(function (p) { latMedia += p[0] / todos.length; });
    var w = Math.max(maxX - minX, 1e-9), h = Math.max(maxY - minY, 1e-9);
    var margenX = MARGEN + 12, margenY = MARGEN + 10;                 // aire para los marcadores
    var escala = Math.min((ANCHO - 2 * margenX) / w, (ALTO - 2 * margenY) / h, 256 * Math.pow(2, 17));
    var offX = (ANCHO - w * escala) / 2, offY = (ALTO - h * escala) / 2;
    function xy(p) { var q = merc(p); return [offX + (q[0] - minX) * escala, offY + (q[1] - minY) * escala]; }
    var fondo = mosaicos(minX - offX / escala, minY - offY / escala, escala);

    // Trazado y flechas de sentido cada ~70 px.
    var paso = Math.max(1, Math.ceil(puntos.length / 400)), d = '', pts = [];
    for (var i = 0; i < puntos.length; i += paso) pts.push(xy(puntos[i]));
    pts.push(xy(puntos[puntos.length - 1]));
    pts.forEach(function (q, n) { d += (n ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); });
    var flechas = '', desde = 0;
    for (var n = 1; n < pts.length; n++) {
      var ex = pts[n][0] - pts[n - 1][0], ey = pts[n][1] - pts[n - 1][1], largo = Math.sqrt(ex * ex + ey * ey);
      desde += largo;
      if (desde >= 70 && largo > 2) {
        desde = 0;
        var ang = Math.atan2(ey, ex) * 180 / Math.PI;
        var mx = (pts[n][0] + pts[n - 1][0]) / 2, my = (pts[n][1] + pts[n - 1][1]) / 2;     // en medio del tramo, no sobre un vértice
        flechas += '<path class="tdt-arrow" transform="translate(' + mx.toFixed(1) + ' ' + my.toFixed(1) + ') rotate(' + ang.toFixed(0) + ')" d="M-4 -4L3 0L-4 4"/>';
      }
    }

    // Un mismo lugar (la Base al inicio y al final, o un Origen igual al Destino) se dibuja una vez.
    var lugares = [];
    waypoints.forEach(function (wp) {
      var clave = wp.lat.toFixed(4) + '|' + wp.lng.toFixed(4);
      var lugar = lugares.filter(function (l) { return l.clave === clave; })[0];
      if (!lugar) lugares.push({ clave: clave, lat: wp.lat, lng: wp.lng, labels: [wp.label] });
      else if (lugar.labels.indexOf(wp.label) < 0) lugar.labels.push(wp.label);
    });
    var marcas = lugares.map(function (l) {
      var p = xy([l.lat, l.lng]), codigo = l.labels.map(function (x) { return x.charAt(0); }).join('/');
      return '<g class="tdt-wp" data-wp="' + esc(l.labels.join(' · ')) + '"><circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="8.5"/>' +
        '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] + 3).toFixed(1) + '" text-anchor="middle"' + (codigo.length > 1 ? ' class="tdt-wp-multi"' : '') + '>' + esc(codigo) + '</text></g>';
    }).join('');

    var peajes = hits.map(function (hit, idx) {
      var p = xy([Number(hit.toll.latitude), Number(hit.toll.longitude)]);
      return '<g class="tdt-toll"><circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="8"/><text x="' + p[0].toFixed(1) + '" y="' + (p[1] + 3.5).toFixed(1) + '" text-anchor="middle">' + (idx + 1) + '</text></g>';
    }).join('');

    // Escala (abajo a la derecha) y norte (arriba a la derecha). Los nombres van en la tabla de referencias.
    var mPorPx = 40075016.686 * Math.cos(latMedia * Math.PI / 180) / escala, largoM = largoEscala(mPorPx, (ANCHO - 2 * MARGEN) / 3), largoPx = largoM / mPorPx;
    var x1 = ANCHO - MARGEN, y0 = ALTO - 10;
    var escalaSvg = '<g class="tdt-scale"><path d="M' + (x1 - largoPx).toFixed(1) + ' ' + (y0 - 4) + 'V' + y0 + 'H' + x1 + 'V' + (y0 - 4) + '"/><text x="' + x1 + '" y="' + (y0 - 7) + '" text-anchor="end">' + (largoM >= 1000 ? (largoM / 1000) + ' km' : largoM + ' m') + '</text></g>';
    var norte = '<g class="tdt-north" transform="translate(' + (ANCHO - MARGEN) + ' ' + (MARGEN + 4) + ')"><path d="M0 -8L4 4L0 1L-4 4Z"/><text y="16" text-anchor="middle">N</text></g>';

    return '<svg class="tdt-map" viewBox="0 0 ' + ANCHO + ' ' + ALTO + '" role="img" aria-label="Recorrido con ' + hits.length + ' peaje' + (hits.length === 1 ? '' : 's') + '">' +
      fondo + '<path class="tdt-route" d="' + d + '"/>' + flechas + marcas + peajes + escalaSvg + norte + (fondo ? '<text class="tdt-attr" x="' + (ANCHO - 3) + '" y="' + (ALTO - 2) + '" text-anchor="end">© OpenStreetMap</text>' : '') + '</svg>';
  }

  /* ── Panel ────────────────────────────────────────────────────────────── */

  function geometria() { return global.AuxiliosRouteGeometry || null; }

  /* Al editar un servicio el recorrido no está calculado: se pide en el momento. */
  async function detect() {
    var w = W(), R = global.OperatorServiceWorkspaceReactiveV1;
    var g = geometria();
    if (!g || !g.polyline) {
      state.detect = { loading: true };
      repintar();
      var r = R && R.loadRouteGeometry ? await R.loadRouteGeometry() : { error: 'Primero completá origen y destino para calcular el recorrido.' };
      state.detect = null;
      if (!r || !r.geometry) { notify((r && r.error) || 'No se pudo calcular el recorrido.', 'warning'); return false; }
      g = r.geometry;
    }
    var puntos = decode(g.polyline);
    if (puntos.length < 2) { notify('No se pudo leer el trazado del recorrido. Volvé a calcularlo.', 'warning'); return false; }
    var catalogo = (w && w.tollCatalog) || [];
    var activos = catalogo.filter(function (t) { return t.is_active !== false; });
    var sinUbicar = activos.filter(function (t) { return t.latitude == null || t.longitude == null; });
    var conUbicacion = activos.filter(function (t) { return t.latitude != null && t.longitude != null; });
    var hits = detectar(puntos, conUbicacion);
    var sinTarifa = [];
    hits = hits.filter(function (h) { if (h.toll.rates && !h.toll.rates.some(function (r) { return r.is_current && r.is_active; })) { sinTarifa.push(h.toll); return false; } return true; });
    state.detect = { geometry: g, points: puntos, hits: hits, sinUbicar: sinUbicar, sinTarifa: sinTarifa, elegidos: hits.map(function (h) { return String(h.toll.toll_id); }) };
    return true;
  }

  function cargados() {
    var o = O(), c = o && o.commercialState ? o.commercialState() : null;
    return c ? c.tolls.map(function (r) { return String(r.toll_id); }) : [];
  }

  /* Tabla de referencias (abajo a la izquierda del mapa): Base, Origen y Destino con su dirección, y los peajes
     por los que pasa. Las letras y los números son los que lleva cada punto en el dibujo. Con "sel" (elegidos y ya
     cargados) cada peaje se puede tildar y la misma tabla tiene el botón para agregarlos: no hay otra lista aparte. */
  function leyenda(g, hits, sel) {
    var vistos = [], filas = '';
    (g.waypoints || []).forEach(function (wp) {
      if (vistos.indexOf(wp.label) >= 0) return;
      vistos.push(wp.label);
      filas += '<tr><th scope="row"><span class="tdt-code">' + esc(wp.label.charAt(0)) + '</span></th><td><b>' + esc(wp.label) + '</b>' + (wp.name ? '<span>' + esc(wp.name) + '</span>' : '') + '</td></tr>';
    });
    filas += '<tr class="tdt-legend-head"><td colspan="2">Peajes por los que pasa' + (sel && hits.length ? ' <em>tildá los que querés agregar</em>' : '') + '</td></tr>';
    if (!hits.length) filas += '<tr><td colspan="2" class="tdt-legend-none">Ninguno</td></tr>';
    var cantidad = 0;
    hits.forEach(function (h, i) {
      var id = String(h.toll.toll_id), cargado = sel && sel.ya.indexOf(id) >= 0, marcado = sel && !cargado && sel.elegidos.indexOf(id) >= 0;
      if (marcado) cantidad++;
      var numero = '<span class="tdt-num">' + (i + 1) + '</span>';
      var km2 = (h.at || []).length ? ' · ' + (h.at || []).map(function (m) { return 'km ' + km(m); }).join(' y ') : '';
      filas += '<tr class="' + (cargado ? 'is-loaded' : '') + '"><th scope="row">' + (sel ? '<label class="tdt-pick"><input type="checkbox" data-td-pick="' + esc(id) + '"' + (marcado ? ' checked' : '') + (cargado ? ' disabled' : '') + ' aria-label="Agregar ' + esc(h.toll.name) + '">' + numero + '</label>' : numero) + '</th>' +
        '<td><b>' + esc(h.toll.name) + '</b><span>' + h.passes + ' pasada' + (h.passes === 1 ? '' : 's') + km2 + (cargado ? ' · ya está cargado' : '') + '</span></td></tr>';
    });
    if (sel && hits.length) filas += '<tr class="tdt-legend-actions"><td colspan="2"><button type="button" class="tdt-apply" data-td="apply"' + (cantidad ? '' : ' disabled') + '>' + ico('plus') + (cantidad ? 'Agregar ' + cantidad + ' peaje' + (cantidad === 1 ? '' : 's') : 'Nada para agregar') + '</button></td></tr>';
    return '<table class="tdt-legend"><caption class="sr-only">Referencias del mapa</caption><tbody>' + filas + '</tbody></table>';
  }

  function panelHtml() {
    var d = state.detect;
    if (!d) return '';
    if (d.loading) return '<section class="tdt-panel" aria-busy="true"><p class="tdt-empty">Calculando el recorrido…</p></section>';
    if (d.geometry !== geometria()) { state.detect = null; return ''; }     // el recorrido cambió: la propuesta ya no vale
    var g = d.geometry, ya = cargados();
    var notas = '';
    if (d.sinUbicar.length) notas += '<p class="tdt-note">' + ico('map-pin') + '<span>Sin ubicación cargada, no se pueden detectar: <b>' + d.sinUbicar.map(function (t) { return esc(t.name); }).join(', ') + '</b>. Se carga en Configuración › Peajes.</span></p>';
    if (d.sinTarifa.length) notas += '<p class="tdt-note">' + ico('triangle-alert') + '<span>Pasa por peajes sin tarifa vigente: <b>' + d.sinTarifa.map(function (t) { return esc(t.name); }).join(', ') + '</b>.</span></p>';
    return '<section class="tdt-panel" aria-label="Peajes del recorrido">' +
      '<div class="tdt-head"><div><b>Peajes del recorrido</b><small>' + esc(g.label || '') + (g.km ? ' · ' + num(g.km).toLocaleString('es-AR') + ' km' : '') + '</small></div>' +
      '<button type="button" class="tdt-close" data-td="close" aria-label="Cerrar">' + ico('x') + '</button></div>' +
      '<div class="tdt-mapbox">' + mapa(d.points, g.waypoints || [], d.hits) + leyenda(g, d.hits, { elegidos: d.elegidos, ya: ya }) + '</div>' +
      notas +
      '</section>';
  }

  function repintar() { var a = global.OperatorServiceCommercialAddonsV1; if (a && a.render) a.render(); }

  function aplicar() {
    var d = state.detect, o = O();
    if (!d || d.loading || !o) return;
    var c = o.commercialState();
    if (!c.toll_coverage_mode) { notify('Elegí primero el formato de cobro de peajes.', 'warning'); return; }
    var ya = cargados();
    var items = d.hits.filter(function (h) { var id = String(h.toll.toll_id); return ya.indexOf(id) < 0 && d.elegidos.indexOf(id) >= 0; })
      .map(function (h) { return { toll_id: h.toll.toll_id, quantity: h.passes }; });
    if (!items.length) return;
    var w = W(), admin = global.OperatorServiceCommercialAddonsV1;
    var r = w && w.administrativeEdit && admin && admin.addDetectedTollsAdmin ? admin.addDetectedTollsAdmin(items) : o.addDetectedTolls(items);
    state.detect = null;
    repintar();
    if (r && r.added) notify(r.added + ' peaje' + (r.added === 1 ? '' : 's') + ' agregado' + (r.added === 1 ? '' : 's') + '. Completá quién paga y el medio de pago.', 'success');
  }

  global.document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-td]');
    if (!b) return;
    var accion = b.getAttribute('data-td');
    if (accion === 'close') { state.detect = null; repintar(); }
    else if (accion === 'apply') aplicar();
  });
  global.document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (!t || !t.hasAttribute || !t.hasAttribute('data-td-pick') || !state.detect || !state.detect.elegidos) return;
    var id = t.getAttribute('data-td-pick'), i = state.detect.elegidos.indexOf(id);
    if (t.checked && i < 0) state.detect.elegidos.push(id);
    if (!t.checked && i >= 0) state.detect.elegidos.splice(i, 1);
    repintar();
  });
  // Al abrir otro servicio no queda ni el trazado ni la propuesta del anterior.
  global.addEventListener('auxilios:service-workspace-opened', function () { state.detect = null; global.AuxiliosRouteGeometry = null; });

  global.AuxiliosTollDetection = {
    detect: detect, panelHtml: panelHtml,
    _test: { mosaicos: mosaicos, leyenda: leyenda, decode: decode, detectar: detectar, pasadas: pasadas, distanciaASegmento: distanciaASegmento, mapa: mapa, RADIO_M: RADIO_M }
  };
})(window);

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
  var ANCHO = 320, ALTO = 190, MARGEN = 16;

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
    var n = posiciones.length ? 1 : 0;
    for (var k = 1; k < posiciones.length; k++) if (posiciones[k] - posiciones[k - 1] > 2 * RADIO_M) n++;
    return { pasadas: n, minimo: minimo, orden: posiciones.length ? posiciones[0] : Infinity };
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
      if (r.pasadas > 0) hits.push({ toll: t, passes: r.pasadas, distance: Math.round(r.minimo), order: r.orden });
    });
    hits.sort(function (a, b) { return a.order - b.order; });
    return hits;
  }

  /* ── Mapa (SVG, sin mosaicos: no depende de ningún servicio) ─────────── */

  function mapa(puntos, waypoints, hits, sinUbicar) {
    var todos = puntos.concat(waypoints.map(function (w) { return [w.lat, w.lng]; }));
    hits.forEach(function (h) { todos.push([Number(h.toll.latitude), Number(h.toll.longitude)]); });
    var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    todos.forEach(function (p) { minLat = Math.min(minLat, p[0]); maxLat = Math.max(maxLat, p[0]); minLng = Math.min(minLng, p[1]); maxLng = Math.max(maxLng, p[1]); });
    var lat0 = (minLat + maxLat) / 2, k = Math.cos(lat0 * Math.PI / 180);
    var w = Math.max((maxLng - minLng) * k, 1e-5), h = Math.max(maxLat - minLat, 1e-5);
    var escala = Math.min((ANCHO - 2 * MARGEN) / w, (ALTO - 2 * MARGEN) / h);
    var offX = (ANCHO - w * escala) / 2, offY = (ALTO - h * escala) / 2;
    function xy(p) { return [offX + (p[1] - minLng) * k * escala, ALTO - offY - (p[0] - minLat) * escala]; }

    var paso = Math.max(1, Math.ceil(puntos.length / 400));
    var d = '';
    for (var i = 0; i < puntos.length; i += paso) { var q = xy(puntos[i]); d += (d ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }
    var f = xy(puntos[puntos.length - 1]); d += 'L' + f[0].toFixed(1) + ' ' + f[1].toFixed(1);

    // Un mismo lugar (la Base al inicio y al final, o un Origen igual al Destino) se dibuja una vez.
    var lugares = [];
    waypoints.forEach(function (wp) {
      var clave = wp.lat.toFixed(4) + '|' + wp.lng.toFixed(4);
      var lugar = lugares.filter(function (l) { return l.clave === clave; })[0];
      if (!lugar) lugares.push({ clave: clave, lat: wp.lat, lng: wp.lng, labels: [wp.label] });
      else if (lugar.labels.indexOf(wp.label) < 0) lugar.labels.push(wp.label);
    });
    var marcas = lugares.map(function (l) {
      var p = xy([l.lat, l.lng]), texto = l.labels.join(' · ');
      return '<g class="tdt-wp" data-wp="' + esc(texto) + '"><circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="5"/>' +
        '<text x="' + (p[0] + 8).toFixed(1) + '" y="' + (p[1] + 3).toFixed(1) + '">' + esc(texto) + '</text></g>';
    }).join('');
    var peajes = hits.map(function (hit, idx) {
      var p = xy([Number(hit.toll.latitude), Number(hit.toll.longitude)]);
      return '<g class="tdt-toll"><circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="8"/><text x="' + p[0].toFixed(1) + '" y="' + (p[1] + 3.5).toFixed(1) + '" text-anchor="middle">' + (idx + 1) + '</text></g>';
    }).join('');
    return '<svg class="tdt-map" viewBox="0 0 ' + ANCHO + ' ' + ALTO + '" role="img" aria-label="Recorrido con ' + hits.length + ' peaje' + (hits.length === 1 ? '' : 's') + '">' +
      '<path class="tdt-route" d="' + d + '"/>' + marcas + peajes + '</svg>';
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

  function panelHtml() {
    var d = state.detect;
    if (!d) return '';
    if (d.loading) return '<section class="tdt-panel" aria-busy="true"><p class="tdt-empty">Calculando el recorrido…</p></section>';
    if (d.geometry !== geometria()) { state.detect = null; return ''; }     // el recorrido cambió: la propuesta ya no vale
    var ya = cargados();
    var g = d.geometry;
    var lista = d.hits.map(function (h, i) {
      var id = String(h.toll.toll_id), cargado = ya.indexOf(id) >= 0;
      return '<li class="' + (cargado ? 'is-loaded' : '') + '"><label><input type="checkbox" data-td-pick="' + esc(id) + '"' + (!cargado && d.elegidos.indexOf(id) >= 0 ? ' checked' : '') + (cargado ? ' disabled' : '') + '>' +
        '<span class="tdt-num">' + (i + 1) + '</span><span class="tdt-name"><b>' + esc(h.toll.name) + '</b>' +
        '<small>' + h.passes + ' pasada' + (h.passes === 1 ? '' : 's') + (cargado ? ' · ya está cargado' : '') + '</small></span></label></li>';
    }).join('');
    var elegibles = d.hits.filter(function (h) { var id = String(h.toll.toll_id); return ya.indexOf(id) < 0 && d.elegidos.indexOf(id) >= 0; });
    var cantidad = elegibles.length;
    var notas = '';
    if (d.sinUbicar.length) notas += '<p class="tdt-note">' + ico('map-pin') + '<span>Sin ubicación cargada, no se pueden detectar: <b>' + d.sinUbicar.map(function (t) { return esc(t.name); }).join(', ') + '</b>. Se carga en Configuración › Peajes.</span></p>';
    if (d.sinTarifa.length) notas += '<p class="tdt-note">' + ico('triangle-alert') + '<span>Pasa por peajes sin tarifa vigente: <b>' + d.sinTarifa.map(function (t) { return esc(t.name); }).join(', ') + '</b>.</span></p>';
    return '<section class="tdt-panel" aria-label="Peajes del recorrido">' +
      '<div class="tdt-head"><div><b>Peajes del recorrido</b><small>' + esc(g.label || '') + (g.km ? ' · ' + num(g.km).toLocaleString('es-AR') + ' km' : '') + '</small></div>' +
      '<button type="button" class="tdt-close" data-td="close" aria-label="Cerrar">' + ico('x') + '</button></div>' +
      mapa(d.points, g.waypoints || [], d.hits) +
      (d.hits.length ? '<ul class="tdt-list">' + lista + '</ul>' : '<p class="tdt-empty">No se detectaron peajes en este recorrido.</p>') +
      notas +
      (d.hits.length ? '<div class="tdt-actions"><button type="button" class="tdt-apply" data-td="apply"' + (cantidad ? '' : ' disabled') + '>' + ico('plus') + (cantidad ? 'Agregar ' + cantidad + ' peaje' + (cantidad === 1 ? '' : 's') : 'Nada para agregar') + '</button></div>' : '') +
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
    _test: { decode: decode, detectar: detectar, pasadas: pasadas, distanciaASegmento: distanciaASegmento, mapa: mapa, RADIO_M: RADIO_M }
  };
})(window);

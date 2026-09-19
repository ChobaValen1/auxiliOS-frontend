/* Mapa de zonas con zoom y heatmap.
   MapLibre GL JS sobre basemap de CARTO. Google se queda haciendo lo que ya hace
   bien —normalizar las direcciones al guardarlas— y acá sólo se dibuja: así la
   API key de Google sigue siendo server-side, en maps-proxy, y nunca llega al
   browser. Google además removió su HeatmapLayer en Maps JS 3.65 (mayo 2026), y
   MapLibre trae heatmap como tipo de capa nativo.

   La librería se carga recién cuando la sección se muestra: son ~250 KB que no
   tienen por qué pesar en el arranque de la app. */
(function (global) {
  'use strict';

  var LIB_JS  = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4/dist/maplibre-gl.js';
  var LIB_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4/dist/maplibre-gl.css';
  var ESTILO  = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

  var ID_CONT = 'dashx-fact-mapa';

  // Encuadre por defecto: Argentina continental, para cuando no hay datos que
  // encuadrar todavía.
  var VISTA_INICIAL = { center: [-64.0, -38.0], zoom: 3.2 };

  var mapa = null;
  var observador = null;
  var cargandoLib = null;
  var ultimoPayload = null;

  function cont() { return document.getElementById(ID_CONT); }

  function lectura() { return document.getElementById(ID_CONT + '-lectura'); }

  function nf(v) {
    return Number(v || 0).toLocaleString('es-AR');
  }

  /* La lectura del mapa: dos conclusiones sobre lo que se está viendo arriba.

     Los kilómetros son EN LÍNEA RECTA y de ida, así que son un piso: el
     recorrido real por ruta siempre es mayor. Se dice en el texto, porque un
     número de ahorro que después no cierra con la realidad quema la confianza
     en todo el tablero. */
  function pintarLectura(data) {
    var nodo = lectura();
    if (!nodo) return;
    var km = (data && data.kilometros_muertos) || {};
    var cob = (data && data.cobertura) || {};

    if (!Number(km.evaluados) && !Number(cob.evaluados)) {
      nodo.innerHTML = '';
      return;
    }

    var filas = [];

    if (Number(km.evaluados) > 0) {
      filas.push(Number(km.mal_asignados) > 0
        ? '<div class="is-aviso"><b>' + nf(km.mal_asignados) + '</b> de ' + nf(km.evaluados) +
          ' servicios los tomó una base que no era la más cercana: <b>' + nf(km.km_extra) +
          ' km</b> de más, en línea recta.</div>'
        : '<div>Los <b>' + nf(km.evaluados) + '</b> servicios ubicados los tomó la base más cercana.</div>');
    }

    if (Number(cob.evaluados) > 0) {
      var fuera = Number(cob.fuera) || 0;
      filas.push(fuera > 0
        ? '<div class="is-aviso"><b>' + nf(fuera) + '</b> de ' + nf(cob.evaluados) +
          ' servicios caen a más de ' + nf(cob.umbral_km) + ' km de toda base' +
          (cob.km_promedio_a_base ? ' · promedio <b>' + nf(cob.km_promedio_a_base) + ' km</b> a la base' : '') +
          '.</div>'
        : '<div>Todos dentro de ' + nf(cob.umbral_km) + ' km de una base' +
          (cob.km_promedio_a_base ? ' · promedio <b>' + nf(cob.km_promedio_a_base) + ' km</b>' : '') +
          '.</div>');
    }

    nodo.innerHTML = filas.join('');
  }

  function mensaje(texto, esError) {
    var c = cont();
    if (!c) return;
    destruirMapa();
    c.innerHTML = '';
    var div = document.createElement('div');
    div.className = 'auxch-overlay' + (esError ? ' auxch-error' : ' auxch-vacio');
    div.style.position = 'static';
    div.style.height = '100%';
    div.textContent = texto;
    c.appendChild(div);
  }

  function destruirMapa() {
    if (observador) { observador.disconnect(); observador = null; }
    if (mapa) {
      mapa.remove();
      mapa = null;
    }
  }

  /* MapLibre mide su contenedor una sola vez, al crearse, y después no se
     entera si cambia. Con el mapa en una caja flexible al lado de la lectura,
     su ancho depende del ancho de la tarjeta: al agrandar la ventana, o al
     cruzar el breakpoint donde mapa y lectura pasan de estar lado a lado a
     apilarse, el canvas quedaba del tamaño viejo —estirado o con una franja
     muerta— hasta recargar. El observador se desconecta en destruirMapa(), que
     es lo mismo que hace el mapa. */
  function observarTamano(c) {
    if (observador || typeof global.ResizeObserver !== 'function') return;
    observador = new global.ResizeObserver(function () {
      if (mapa) mapa.resize();
    });
    observador.observe(c);
  }

  function cargarLibreria() {
    if (global.maplibregl) return Promise.resolve();
    if (cargandoLib) return cargandoLib;

    cargandoLib = new Promise(function (resolve, reject) {
      if (!document.getElementById('maplibre-css')) {
        var css = document.createElement('link');
        css.id = 'maplibre-css';
        css.rel = 'stylesheet';
        css.href = LIB_CSS;
        document.head.appendChild(css);
      }
      var s = document.createElement('script');
      s.src = LIB_JS;
      s.async = true;
      s.addEventListener('load', function () {
        global.maplibregl ? resolve() : reject(new Error('maplibre no quedó disponible'));
      }, { once: true });
      s.addEventListener('error', function () {
        reject(new Error('No se pudo cargar el mapa'));
      }, { once: true });
      document.body.appendChild(s);
    }).catch(function (e) {
      // Que un fallo de red no deje la promesa cacheada en rechazo para siempre.
      cargandoLib = null;
      throw e;
    });

    return cargandoLib;
  }

  function geojson(puntos) {
    return {
      type: 'FeatureCollection',
      features: puntos.map(function (p) {
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [Number(p[0]), Number(p[1])] },
          properties: { servicios: Number(p[2]) || 0, monto: Number(p[3]) || 0 }
        };
      })
    };
  }

  /* Rampa secuencial de un solo hue (el ámbar de la app), monótona en
     luminosidad: transparente → ámbar apagado → ámbar → casi blanco. Un arcoíris
     acá haría parecer que los colores codifican categorías distintas en vez de
     más o menos densidad. */
  function capaHeatmap(maxServicios) {
    var tope = Math.max(1, maxServicios || 1);
    return {
      id: 'zonas-heat',
      type: 'heatmap',
      source: 'zonas',
      paint: {
        'heatmap-weight': [
          'interpolate', ['linear'], ['get', 'servicios'],
          0, 0,
          tope, 1
        ],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 1, 12, 3],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0,    'rgba(0,0,0,0)',
          0.2,  'rgba(120,74,8,0.55)',
          0.45, 'rgba(191,121,15,0.75)',
          0.7,  'rgba(245,166,35,0.88)',
          1,    'rgba(255,224,170,0.95)'
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 12, 9, 28, 14, 45],
        // Al acercarse, el heatmap se desvanece y aparecen los puntos: a ese zoom
        // interesa el servicio concreto, no la densidad.
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.9, 14, 0.25]
      }
    };
  }

  function capaPuntos() {
    return {
      id: 'zonas-puntos',
      type: 'circle',
      source: 'zonas',
      minzoom: 10,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 9],
        'circle-color': '#f5a623',
        'circle-stroke-color': '#0c0e12',
        'circle-stroke-width': 1.5,
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0, 13, 0.9]
      }
    };
  }

  function encuadrar(m, bbox) {
    if (!bbox) return;
    var min = [Number(bbox.min_lng), Number(bbox.min_lat)];
    var max = [Number(bbox.max_lng), Number(bbox.max_lat)];
    if (!isFinite(min[0]) || !isFinite(max[0])) return;
    // Un único punto no define un área: fitBounds sobre un bbox degenerado deja
    // el zoom al máximo.
    if (min[0] === max[0] && min[1] === max[1]) {
      m.jumpTo({ center: min, zoom: 11 });
      return;
    }
    m.fitBounds([min, max], { padding: 28, duration: 0, maxZoom: 12 });
  }

  function tooltip(m) {
    var popup = new global.maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'dashx-mapa-popup'
    });
    m.on('mouseenter', 'zonas-puntos', function (e) {
      m.getCanvas().style.cursor = 'pointer';
      var f = e.features && e.features[0];
      if (!f) return;
      var n = f.properties.servicios;
      var txt = n + (Number(n) === 1 ? ' servicio' : ' servicios');
      if (global.AuxDashCharts && Number(f.properties.monto) > 0) {
        txt += ' · ' + global.AuxDashCharts.nfPesos(f.properties.monto);
      }
      popup.setLngLat(f.geometry.coordinates).setText(txt).addTo(m);
    });
    m.on('mouseleave', 'zonas-puntos', function () {
      m.getCanvas().style.cursor = '';
      popup.remove();
    });
  }

  function pintar(data) {
    var c = cont();
    if (!c) return;

    pintarLectura(data);

    var puntos = (data && data.puntos) || [];
    if (!puntos.length) {
      mensaje(data && data.hay_datos
        ? 'Los servicios del período no tienen ubicación cargada todavía.'
        : 'Todavía no hay servicios cargados en este período. Acá va a verse dónde se concentra la operación.');
      return;
    }

    return cargarLibreria().then(function () {
      if (!cont()) return;
      var gj = geojson(puntos);

      if (mapa) {
        var src = mapa.getSource('zonas');
        if (src) {
          src.setData(gj);
          if (mapa.getLayer('zonas-heat')) {
            mapa.setPaintProperty('zonas-heat', 'heatmap-weight', [
              'interpolate', ['linear'], ['get', 'servicios'],
              0, 0, Math.max(1, data.max_servicios || 1), 1
            ]);
          }
          encuadrar(mapa, data.bbox);
          return;
        }
        destruirMapa();
      }

      c.innerHTML = '';
      mapa = new global.maplibregl.Map({
        container: c,
        style: ESTILO,
        center: VISTA_INICIAL.center,
        zoom: VISTA_INICIAL.zoom,
        attributionControl: { compact: true },
        // Sin rotación: en un mapa de densidad sólo marea.
        dragRotate: false,
        pitchWithRotate: false
      });
      mapa.addControl(new global.maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      observarTamano(c);
      mapa.on('load', function () {
        mapa.addSource('zonas', { type: 'geojson', data: gj });
        mapa.addLayer(capaHeatmap(data.max_servicios));
        mapa.addLayer(capaPuntos());
        tooltip(mapa);
        encuadrar(mapa, data.bbox);
      });
    }).catch(function (e) {
      mensaje(e.message || 'No se pudo cargar el mapa', true);
    });
  }

  async function cargar(filtros) {
    // Tirar en vez de return: un corte silencioso deja la sección en blanco
    // sin que el shell pueda mostrar el error.
    if (typeof _db === 'undefined') throw new Error('Sin conexión con la base de datos');
    var { data, error } = await _db.rpc('dashboard_zonas_v1', {
      p_desde: filtros.desde,
      p_hasta: filtros.hasta,
      p_empresas: filtros.empresas.length ? filtros.empresas : null,
      p_bases: filtros.bases.length ? filtros.bases : null
    });
    if (error) throw error;
    ultimoPayload = data;
    pintar(data);
  }

  function registrar() {
    if (!global.AuxDash) return false;
    // Se registra como sección propia aunque viva dentro del recuadro de
    // Facturación: así recibe cada recarga con los filtros ya resueltos.
    global.AuxDash.registrarSeccion({
      id: 'mapa',
      // Vive dentro del recuadro de Facturación: se carga con esa pestaña,
      // no como una propia.
      grupo: 'facturacion',
      cargar: cargar,
      alError: function (_c, e) {
        mensaje((e && e.message) || 'No se pudo cargar el mapa de zonas', true);
      }
    });
    return true;
  }

  if (!registrar()) {
    document.addEventListener('DOMContentLoaded', registrar, { once: true });
  }

  global.AuxDashMapa = { cargar: cargar, ultimo: function () { return ultimoPayload; } };
})(window);

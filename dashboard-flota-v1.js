/* Sección 3 del dashboard rediseñado: SALUD DE LA FLOTA.
   Es la única sección que muestra ESTADO (vencido / por vencer / al día), así
   que es la única que usa AuxDashCharts.ESTADO. Dos reglas que no se negocian:

   1. Los colores de estado nunca son color de serie. El donut de estado de
      flota va con la paleta categórica de AuxDashCharts (donut() ya la aplica
      solo): "en mantenimiento" es una categoría, no una alarma.
   2. El color nunca es el único indicador. Cada tarjeta lleva ícono, etiqueta y
      un texto que dice en palabras cómo está la cosa; cada fila de la tabla
      lleva su chip con ícono + texto. Quien no distingue rojo de verde lee lo
      mismo que el resto.

   Los datos salen de una sola RPC sin parámetros de fecha: esto es la foto de
   hoy, no un rango. Los umbrales (ventana de vencimiento, ventana de
   incidentes) los define el SQL y viajan en el payload, así el rótulo de la
   tarjeta y el filtro de la consulta no pueden desincronizarse. */
(function (global) {
  'use strict';

  var ID_ALERTAS = 'dashx-flota-alertas';
  var ID_TABLA   = 'dashx-flota-tabla';
  var ID_SUB     = 'dashx-flota-sub';
  var ID_DONUT   = 'dashx-flota-estado';

  // Ícono por severidad: el ícono, no el color, es lo que distingue una tarjeta
  // crítica de una al día.
  var ICONO = { critico: '⛔', aviso: '⚠', ok: '✓' };

  var ESTADO_CAMION = {
    activo:        'Activo',
    mantenimiento: 'En taller',
    inactivo:      'Inactivo'
  };

  var SERVICE_LABEL = {
    vencido:      'Vencido',
    proximo:      'Próximo',
    al_dia:       'Al día',
    sin_registro: 'Sin registro',
    sin_odometro: 'Sin odómetro'
  };

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function miles(v) {
    return global.AuxDashCharts ? global.AuxDashCharts.nfMiles(v) : String(v == null ? 0 : v);
  }

  function tinta(clave) {
    var t = global.AuxDashCharts && global.AuxDashCharts.TINTA;
    return (t && t[clave]) || '#8590ab';
  }

  /* Color de estado: SOLO para estado. Nunca entra como color de serie. */
  function colorEstado(severidad) {
    var e = global.AuxDashCharts && global.AuxDashCharts.ESTADO;
    if (!e) return 'inherit';
    if (severidad === 'critico') return e.critico;
    if (severidad === 'aviso') return e.aviso;
    return e.ok;
  }

  /* 'YYYY-MM-DD' → '27/06/26'. Sin new Date(): parsear la fecha suelta como UTC
     corre un día para atrás en Argentina. */
  function fechaCorta(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? m[3] + '/' + m[2] + '/' + m[1].slice(2) : '—';
  }

  function horaCorta(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function elem(id) {
    return document.getElementById(id);
  }

  /* ── Tarjetas de alerta ────────────────────────────────────────────────
     Un contador en cero es un dato bueno y real (cero incidentes abiertos es
     una buena noticia), así que se muestra el cero con su tarjeta en verde y el
     texto "Sin pendientes". El "no se pudo cargar" es otra cosa y se pinta
     aparte, en pintarError(). */
  function tarjetas(alertas, umbrales) {
    // Las ventanas las define el SQL y viajan en el payload: acá no se repite
    // ningún umbral, así el rótulo no puede mentir sobre el filtro que corrió.
    var diasDoc = num(umbrales.dias_doc_aviso);
    var diasInc = num(umbrales.dias_incidente_abierto);
    var ventanaDoc = diasDoc ? 'Vencen dentro de ' + diasDoc + ' días' : 'Dentro de la ventana de aviso';
    var ventanaInc = diasInc ? 'Reportados en ' + diasInc + ' días' : 'Reportados hace poco';

    return [
      {
        etiqueta: 'Camiones en taller',
        valor: num(alertas.camiones_mantenimiento),
        severidad: num(alertas.camiones_mantenimiento) > 0 ? 'critico' : 'ok',
        nota: 'Fuera de servicio hoy'
      },
      {
        etiqueta: 'Service vencido',
        valor: num(alertas.services_vencidos),
        severidad: num(alertas.services_vencidos) > 0 ? 'critico' : 'ok',
        nota: 'Pasaron el km del plan'
      },
      {
        etiqueta: 'Service próximo',
        valor: num(alertas.services_proximos),
        severidad: num(alertas.services_proximos) > 0 ? 'aviso' : 'ok',
        nota: 'Dentro del aviso del plan'
      },
      {
        etiqueta: 'Documentos vencidos',
        valor: num(alertas.docs_vencidos),
        severidad: num(alertas.docs_vencidos) > 0 ? 'critico' : 'ok',
        nota: 'Papeles de camión'
      },
      {
        etiqueta: 'Documentos por vencer',
        valor: num(alertas.docs_por_vencer),
        severidad: num(alertas.docs_por_vencer) > 0 ? 'aviso' : 'ok',
        nota: ventanaDoc
      },
      {
        etiqueta: 'Incidentes abiertos',
        valor: num(alertas.incidentes_abiertos),
        severidad: num(alertas.incidentes_graves) > 0
          ? 'critico'
          : (num(alertas.incidentes_abiertos) > 0 ? 'aviso' : 'ok'),
        nota: num(alertas.incidentes_graves) > 0
          ? num(alertas.incidentes_graves) + ' grave' + (num(alertas.incidentes_graves) === 1 ? '' : 's')
            + ' · ' + ventanaInc.toLowerCase()
          : ventanaInc
      },
      {
        etiqueta: 'Licencias por vencer',
        valor: num(alertas.licencias_por_vencer),
        severidad: num(alertas.licencias_vencidas) > 0
          ? 'critico'
          : (num(alertas.licencias_por_vencer) > 0 ? 'aviso' : 'ok'),
        nota: num(alertas.licencias_vencidas) > 0
          ? num(alertas.licencias_vencidas) + ' ya vencida' + (num(alertas.licencias_vencidas) === 1 ? '' : 's')
          : 'Choferes activos'
      }
    ];
  }

  function pintarAlertas(alertas, umbrales) {
    var cont = elem(ID_ALERTAS);
    if (!cont) return;
    cont.innerHTML = tarjetas(alertas || {}, umbrales || {}).map(function (t) {
      var sinPendientes = t.valor === 0;
      return '<div class="dashx-alert is-' + t.severidad + '">'
        + '<div class="dashx-metric-label">'
        +   '<span aria-hidden="true">' + ICONO[t.severidad] + '</span> ' + esc(t.etiqueta)
        + '</div>'
        + '<div class="dashx-alert-value">' + miles(t.valor) + '</div>'
        + '<div style="font-size:10px;color:var(--muted);margin-top:4px">'
        +   esc(sinPendientes ? 'Sin pendientes' : t.nota)
        + '</div>'
        + '</div>';
    }).join('');
  }

  /* ── Donut de estado de flota ──────────────────────────────────────────
     Serie categórica a propósito: "en mantenimiento" acá es una categoría de la
     composición de la flota, no una alarma. Las alarmas están arriba, en las
     tarjetas. */
  function pintarDonut(estado) {
    if (!global.AuxDashCharts) return;
    var e = estado || {};
    global.AuxDashCharts.donut(ID_DONUT, {
      labels: ['Activos', 'En mantenimiento', 'Inactivos'],
      values: [num(e.activos), num(e.mantenimiento), num(e.inactivos)],
      vacio: 'Sin camiones cargados'
    });
  }

  /* ── Tabla de detalle ───────────────────────────────────────────────────
     El chip de situación lleva color + ícono + texto. Y no dice "al día" de un
     camión del que no sabemos nada: sin plan de service ni documentación
     cargada, lo honesto es "sin datos". */
  function chipSituacion(c) {
    var sev = ICONO[c.severidad] ? c.severidad : 'ok';
    if (sev === 'critico' || sev === 'aviso') {
      return '<span style="color:' + colorEstado(sev) + ';font-weight:600;white-space:nowrap">'
        + '<span aria-hidden="true">' + ICONO[sev] + '</span> '
        + (sev === 'critico' ? 'Requiere acción' : 'A revisar') + '</span>';
    }
    if (c.estado === 'inactivo') {
      return '<span style="color:' + tinta('tenue') + ';white-space:nowrap">'
        + '<span aria-hidden="true">○</span> Sin uso</span>';
    }
    var sinService = c.service_estado === 'sin_registro' || c.service_estado === 'sin_odometro';
    if (sinService && num(c.docs_total) === 0) {
      return '<span style="color:' + tinta('tenue') + ';white-space:nowrap">'
        + '<span aria-hidden="true">–</span> Sin datos</span>';
    }
    return '<span style="color:' + colorEstado('ok') + ';font-weight:600;white-space:nowrap">'
      + '<span aria-hidden="true">' + ICONO.ok + '</span> Al día</span>';
  }

  function celdaProximoService(c) {
    var estado = c.service_estado || 'sin_registro';
    if (estado === 'sin_registro' || estado === 'sin_odometro' || c.proximo_service_km == null) {
      return '<span style="color:' + tinta('tenue') + '">' + esc(SERVICE_LABEL[estado] || '—') + '</span>';
    }
    var restantes = num(c.km_restantes);
    var titulo = restantes < 0
      ? 'Excedido ' + miles(Math.abs(restantes)) + ' km'
      : 'Faltan ' + miles(restantes) + ' km';
    var color = estado === 'vencido' ? colorEstado('critico')
      : (estado === 'proximo' ? colorEstado('aviso') : 'inherit');
    return '<div style="color:' + color + '">' + esc(titulo) + '</div>'
      + '<div style="font-size:10px;color:' + tinta('tenue') + '">'
      +   'a los ' + miles(c.proximo_service_km) + ' km'
      + '</div>';
  }

  function celdaUltimoService(c) {
    if (!c.ultimo_service_fecha) {
      return '<span style="color:' + tinta('tenue') + '">Sin registro</span>';
    }
    return '<div>' + fechaCorta(c.ultimo_service_fecha) + '</div>'
      + (c.ultimo_service_km != null
          ? '<div style="font-size:10px;color:' + tinta('tenue') + '">'
            + miles(c.ultimo_service_km) + ' km</div>'
          : '');
  }

  function celdaDocs(c) {
    var vencidos = num(c.docs_vencidos);
    var porVencer = num(c.docs_por_vencer);
    var sinArchivo = num(c.docs_sin_archivo);
    var total = num(c.docs_total);
    if (vencidos > 0) {
      return '<span style="color:' + colorEstado('critico') + '">'
        + '<span aria-hidden="true">⛔</span> ' + miles(vencidos) + ' vencido'
        + (vencidos === 1 ? '' : 's') + '</span>';
    }
    if (porVencer > 0 || sinArchivo > 0) {
      var partes = [];
      if (porVencer > 0) partes.push(miles(porVencer) + ' por vencer');
      if (sinArchivo > 0) partes.push(miles(sinArchivo) + ' sin archivo');
      return '<span style="color:' + colorEstado('aviso') + '">'
        + '<span aria-hidden="true">⚠</span> ' + esc(partes.join(' · ')) + '</span>';
    }
    if (total === 0) {
      return '<span style="color:' + tinta('tenue') + '">Sin documentos</span>';
    }
    return '<span style="color:' + colorEstado('ok') + '">'
      + '<span aria-hidden="true">✓</span> ' + miles(total) + ' al día</span>';
  }

  function pintarTabla(camiones) {
    var cont = elem(ID_TABLA);
    if (!cont) return;
    var filas = Array.isArray(camiones) ? camiones : [];
    if (!filas.length) {
      cont.innerHTML = '<div style="padding:24px;text-align:center;font-size:12px;color:var(--muted)">'
        + 'No hay camiones cargados en la flota</div>';
      return;
    }

    var thBase = 'text-align:left;padding:7px 8px;font-size:10px;text-transform:uppercase;'
      + 'letter-spacing:0.6px;color:var(--muted2);font-weight:600;white-space:nowrap';
    var thNum = thBase.replace('text-align:left', 'text-align:right');
    var tdBase = 'padding:8px;font-size:12px;border-top:1px solid var(--border);vertical-align:top';
    // tabular-nums: sin esto las columnas de km bailan de fila en fila.
    var tdNum = tdBase + ';text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap';

    var head = '<tr>'
      + '<th style="' + thBase + '">Móvil</th>'
      + '<th style="' + thBase + '">Estado</th>'
      + '<th style="' + thNum  + '">KM actual</th>'
      + '<th style="' + thNum  + '">Último service</th>'
      + '<th style="' + thNum  + '">Próximo service</th>'
      + '<th style="' + thBase + '">Documentación</th>'
      + '<th style="' + thBase + '">Situación</th>'
      + '</tr>';

    var cuerpo = filas.map(function (c) {
      var estadoTxt = ESTADO_CAMION[c.estado] || c.estado || '—';
      return '<tr>'
        + '<td style="' + tdBase + '">'
        +   '<div style="font-weight:600">' + esc(c.movil || c.patente || '—') + '</div>'
        +   '<div style="font-size:10px;color:' + tinta('tenue') + ';font-variant-numeric:tabular-nums">'
        +     esc(c.patente || '') + (c.marca_modelo ? ' · ' + esc(c.marca_modelo) : '')
        +   '</div>'
        + '</td>'
        + '<td style="' + tdBase + ';white-space:nowrap;color:'
        +   (c.estado === 'mantenimiento' ? colorEstado('critico') : tinta('media')) + '">'
        +   (c.estado === 'mantenimiento' ? '<span aria-hidden="true">🔧</span> ' : '')
        +   esc(estadoTxt)
        + '</td>'
        + '<td style="' + tdNum + '">' + miles(c.km_actual) + '</td>'
        + '<td style="' + tdNum + '">' + celdaUltimoService(c) + '</td>'
        + '<td style="' + tdNum + '">' + celdaProximoService(c) + '</td>'
        + '<td style="' + tdBase + '">' + celdaDocs(c) + '</td>'
        + '<td style="' + tdBase + '">' + chipSituacion(c) + '</td>'
        + '</tr>';
    }).join('');

    cont.innerHTML = '<div style="overflow-x:auto">'
      + '<table style="width:100%;border-collapse:collapse;min-width:720px">'
      + '<thead>' + head + '</thead><tbody>' + cuerpo + '</tbody></table></div>';
  }

  function pintarSubtitulo(data) {
    var sub = elem(ID_SUB);
    if (!sub) return;
    var camiones = Array.isArray(data.camiones) ? data.camiones : [];
    var conAlerta = camiones.filter(function (c) {
      return c.severidad === 'critico' || c.severidad === 'aviso';
    }).length;
    var total = num((data.estado_flota || {}).total) || camiones.length;
    var hora = horaCorta(data.generado_en);
    sub.textContent = miles(total) + (total === 1 ? ' móvil' : ' móviles')
      + ' · ' + (conAlerta === 0 ? 'sin alertas' : miles(conAlerta) + ' con alertas')
      + (hora ? ' · actualizado ' + hora : '');
  }

  function pintarError(e) {
    var mensaje = (e && (e.message || e.error_description)) || 'No se pudieron cargar los datos';
    var alertas = elem(ID_ALERTAS);
    if (alertas) {
      alertas.innerHTML = '<div class="dashx-alert is-critico" style="grid-column:1/-1">'
        + '<div class="dashx-metric-label">'
        +   '<span aria-hidden="true">⛔</span> No se pudo leer el estado de la flota'
        + '</div>'
        + '<div style="font-size:11px;color:var(--muted);margin-top:4px">' + esc(mensaje) + '</div>'
        + '</div>';
    }
    var tabla = elem(ID_TABLA);
    if (tabla) {
      tabla.innerHTML = '<div style="padding:24px;text-align:center;font-size:12px;color:var(--muted)">'
        + 'Sin detalle: la consulta falló</div>';
    }
    var sub = elem(ID_SUB);
    if (sub) sub.textContent = 'Datos no disponibles';
    if (global.AuxDashCharts) global.AuxDashCharts.error(ID_DONUT);
  }

  async function consultar() {
    var db = global._db;
    if (!db || typeof db.rpc !== 'function') {
      throw new Error('Sin conexión con la base');
    }
    var res = await db.rpc('dashboard_flota_v1');
    if (res && res.error) throw res.error;
    return (res && res.data) || {};
  }

  async function cargar() {
    var data;
    try {
      data = await consultar();
    } catch (e) {
      // Un error de carga NO es "cero alertas": se dice que falló.
      pintarError(e);
      throw e;
    }
    pintarAlertas(data.alertas, data.umbrales);
    pintarDonut(data.estado_flota);
    pintarTabla(data.camiones);
    pintarSubtitulo(data);
  }

  if (global.AuxDash && typeof global.AuxDash.registrarSeccion === 'function') {
    global.AuxDash.registrarSeccion({ id: 'flota', cargar: cargar });
  }

  // Expuesto para poder repintar la sección sin recargar todo el dashboard.
  global.AuxDashFlota = { cargar: cargar };
})(window);

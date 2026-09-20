/* Shell del dashboard rediseñado.
   Es el contrato entre el dashboard y cada sección: una sección se registra con
   un montar() y un cargar(filtros), y el shell se ocupa del estado, los filtros,
   el overlay de carga y los errores. Las secciones no tocan nada de eso. */
(function (global) {
  'use strict';

  var secciones = [];
  var montadas = false;
  // Qué pestaña se está viendo. Sólo se carga y se pinta esa: montar un
  // gráfico en un contenedor oculto lo deja con tamaño cero.
  var activa = 'facturacion';

  var estado = {
    cargando: false,
    // 'mes' es un mes calendario; 'rango' lo que el usuario escribió a mano.
    // Los dos resuelven a desde/hasta, así que las secciones ven siempre lo
    // mismo. Arranca en el mes actual: es la unidad con la que se factura.
    periodo: 'mes',
    mes: null,
    desde: null,
    hasta: null,
    empresas: [],
    bases: [],
    conceptos: [],
    camiones: [],
    choferes: []
  };

  /* Una recarga disparada mientras hay otra en vuelo no se descarta: se agenda
     una sola recarga posterior. Sin esto, tocar dos filtros rápido deja la vista
     mostrando el filtro nuevo con los datos del anterior. */
  var recargaPendiente = false;

  function fechaISO(d) {
    var z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  }

  /* Dos formas de elegir y nada más: un mes calendario o un rango escrito a
     mano. Antes eran seis ventanas móviles que terminaban hoy —"1 mes" iba del
     21 de agosto al 20 de septiembre—, un corte que no coincide con ninguna
     factura ni con ningún cierre. El mes es la unidad con la que se factura;
     todo lo demás es el rango libre. */
  function mesActual() {
    var hoy = new Date();
    return hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0');
  }

  function rangoDeMes(ym) {
    var partes = String(ym || '').split('-');
    var y = Number(partes[0]);
    var m = Number(partes[1]);
    if (!y || !m) return null;
    // Día 0 del mes siguiente = último día de éste, sin tablas de días.
    return { desde: fechaISO(new Date(y, m - 1, 1)), hasta: fechaISO(new Date(y, m, 0)) };
  }

  /* A mano y no con toLocaleDateString: es-AR devuelve "20 de sept de 26",
     que en un botón de 32 px de alto no entra ni se lee. */
  var MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function mayus(txt) { return txt.charAt(0).toUpperCase() + txt.slice(1); }

  function etiquetaMes(ym, largo) {
    var partes = String(ym || '').split('-');
    var y = Number(partes[0]);
    var m = Number(partes[1]) - 1;
    if (!(m >= 0 && m < 12)) return String(ym || '');
    return largo
      ? mayus(MES_LARGO[m]) + ' ' + y
      : mayus(MES_CORTO[m]) + ' ' + String(y).slice(-2);
  }

  function mesesRecientes(cuantos) {
    var hoy = new Date();
    var lista = [];
    for (var i = 0; i < cuantos; i++) {
      var d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      lista.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }
    return lista;
  }

  // "20 ago – 20 sep 2026": el año va una sola vez mientras sea el mismo.
  function rangoTexto(desde, hasta) {
    var a = String(desde || '').split('-');
    var b = String(hasta || '').split('-');
    if (a.length !== 3 || b.length !== 3) return (desde || '') + ' – ' + (hasta || '');
    var dia = function (p) { return Number(p[2]) + ' ' + MES_CORTO[Number(p[1]) - 1]; };
    return a[0] === b[0]
      ? dia(a) + ' – ' + dia(b) + ' ' + a[0]
      : dia(a) + ' ' + a[0].slice(-2) + ' – ' + dia(b) + ' ' + b[0].slice(-2);
  }

  /* El título puede mentir —"Último mes" no es el mes de la factura— así que
     abajo va siempre el rango resuelto. Con las fechas a la vista ninguna
     etiqueta puede confundir. */
  function descripcionPeriodo() {
    var r = rangoActual();
    var titulo = estado.periodo === 'rango'
      ? 'Período personalizado'
      : etiquetaMes(estado.mes || mesActual(), true);
    return { titulo: titulo, rango: rangoTexto(r.desde, r.hasta) };
  }

  function rangoActual() {
    return (estado.desde && estado.hasta)
      ? { desde: estado.desde, hasta: estado.hasta }
      : rangoDeMes(mesActual());
  }

  function filtros() {
    var r = rangoActual();
    return {
      desde: r.desde,
      hasta: r.hasta,
      periodo: estado.periodo,
      empresas: estado.empresas.slice(),
      bases: estado.bases.slice(),
      conceptos: estado.conceptos.slice(),
      camiones: estado.camiones.slice(),
      choferes: estado.choferes.slice()
    };
  }

  // El mapa vive dentro del recuadro de Facturación, así que declara ese grupo
  // en vez de ser una pestaña propia.
  function grupoDe(sec) { return sec.grupo || sec.id; }

  function esVisible(sec) { return grupoDe(sec) === activa; }

  /* Una sección puede declarar `filtros`: el id de un contenedor que vive en la
     barra de arriba, fuera de su cuerpo, para que el overlay de carga no lo
     tape. Se muestra y se esconde con la sección igual que el cuerpo.

     Y puede declarar `periodo: false` cuando el rango de fechas no le dice
     nada. Salud de la Flota es el caso: su cargar() no recibe filtros porque
     mira el estado de hoy —qué vence, qué service toca, qué camión está
     parado—, así que ofrecer elegir un mes es ofrecer un control que no hace
     nada. Un filtro que no filtra es peor que no tenerlo:
     el que lo toca y no ve cambiar nada no sabe si el tablero está roto.

     Si no queda nada visible en la barra, la barra entera se esconde: si no,
     queda una franja vacía arriba de la sección. */
  function aplicarVisibilidad() {
    var algoEnLaBarra = false;
    secciones.forEach(function (s) {
      var visible = esVisible(s);
      var cont = document.getElementById('dashx-sec-' + s.id);
      if (cont) cont.hidden = !visible;
      if (s.filtros) {
        var fil = document.getElementById(s.filtros);
        if (fil) fil.hidden = !visible;
        if (visible) algoEnLaBarra = true;
      }
    });

    var usaPeriodo = secciones.some(function (s) {
      return esVisible(s) && s.periodo !== false;
    });
    var per = document.getElementById('dashx-periodos');
    if (per) per.hidden = !usaPeriodo;
    // Escondido con el desplegable abierto, al volver aparecería desplegado.
    if (!usaPeriodo) abrirPop(false);
    var barra = document.getElementById('dashx-toolbar');
    if (barra) barra.hidden = !(usaPeriodo || algoEnLaBarra);
  }

  function setCargando(on) {
    secciones.filter(esVisible).forEach(function (s) {
      var ov = document.getElementById('dashx-loading-' + s.id);
      if (ov) ov.classList.toggle('show', !!on);
    });
  }

  function registrarSeccion(sec) {
    if (!sec || !sec.id || typeof sec.cargar !== 'function') return;
    if (secciones.some(function (s) { return s.id === sec.id; })) return;
    secciones.push(sec);
    if (montadas) montarSeccion(sec);
  }

  function montarSeccion(sec) {
    var cont = document.getElementById('dashx-sec-' + sec.id);
    if (!cont || sec._montada) return;
    sec._montada = true;
    if (typeof sec.montar === 'function') {
      try {
        sec.montar(cont);
      } catch (e) {
        console.error('[dashboard] falló el montaje de la sección ' + sec.id, e);
      }
    }
  }

  function montarTodas() {
    montadas = true;
    secciones.forEach(montarSeccion);
  }

  async function recargar() {
    if (estado.cargando) {
      recargaPendiente = true;
      return;
    }
    estado.cargando = true;
    setCargando(true);
    var f = filtros();
    try {
      await Promise.all(secciones.filter(esVisible).map(function (s) {
        return Promise.resolve()
          .then(function () { return s.cargar(f); })
          .catch(function (e) {
            console.error('[dashboard] sección ' + s.id + ' falló', e);
            var cont = document.getElementById('dashx-sec-' + s.id);
            if (cont && typeof s.alError === 'function') s.alError(cont, e);
          });
      }));
    } finally {
      estado.cargando = false;
      if (recargaPendiente) {
        recargaPendiente = false;
        // Sin apagar el overlay en el medio: evita el parpadeo entre las dos cargas.
        recargar();
      } else {
        setCargando(false);
      }
    }
  }

  function setMes(ym) {
    var r = rangoDeMes(ym);
    if (!r) return;
    estado.periodo = 'mes';
    estado.mes = ym;
    estado.desde = r.desde;
    estado.hasta = r.hasta;
    pintarPeriodo();
    recargar();
  }

  function setRango(desde, hasta) {
    if (!desde || !hasta || desde > hasta) return false;
    estado.periodo = 'rango';
    estado.mes = null;
    estado.desde = desde;
    estado.hasta = hasta;
    pintarPeriodo();
    recargar();
    return true;
  }

  /* ── Selector de período ───────────────────────────────────────────────
     Antes eran seis pestañas fijas ocupando toda la fila para ofrecer sólo
     ventanas móviles. Ahora es un control solo: muestra qué período está
     puesto y con qué fechas, y despliega los tres modos. */
  function botonPeriodo() {
    var d = descripcionPeriodo();
    return '<button type="button" class="dashx-per-btn" data-per="abrir"'
      + ' aria-haspopup="dialog" aria-expanded="false">'
      + '<span class="dashx-per-ico" aria-hidden="true">🗓</span>'
      + '<span class="dashx-per-txt"><b>' + d.titulo + '</b><small>' + d.rango + '</small></span>'
      + '<span class="dashx-per-caret" aria-hidden="true">▾</span></button>';
  }

  function popPeriodo() {
    var meses = mesesRecientes(12).map(function (ym) {
      var on = estado.periodo === 'mes' && (estado.mes || mesActual()) === ym;
      return '<button type="button" class="dashx-per-mes' + (on ? ' on' : '') + '"'
        + ' data-per="mes" data-v="' + ym + '"' + (on ? ' aria-current="true"' : '') + '>'
        + etiquetaMes(ym) + '</button>';
    }).join('');

    var hoy = fechaISO(new Date());
    var r = rangoActual();
    return '<div class="dashx-per-pop" role="dialog" aria-label="Elegir período" hidden>'
      + '<h4>Mes</h4><div class="dashx-per-meses">' + meses + '</div>'
      + '<h4>Período personalizado</h4><div class="dashx-per-libre">'
      + '<label>Desde<input type="date" data-per-desde max="' + hoy + '" value="' + r.desde + '"></label>'
      + '<label>Hasta<input type="date" data-per-hasta max="' + hoy + '" value="' + r.hasta + '"></label>'
      + '<button type="button" class="dashx-per-aplicar" data-per="rango">Aplicar</button>'
      + '</div><p class="dashx-per-error" role="alert" hidden></p></div>';
  }

  function cajaPeriodo() { return document.getElementById('dashx-periodos'); }

  function popAbierto() {
    var caja = cajaPeriodo();
    var pop = caja && caja.querySelector('.dashx-per-pop');
    return !!pop && !pop.hidden;
  }

  function abrirPop(on) {
    var caja = cajaPeriodo();
    if (!caja) return;
    var pop = caja.querySelector('.dashx-per-pop');
    var btn = caja.querySelector('.dashx-per-btn');
    if (!pop || !btn) return;
    pop.hidden = !on;
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (!on) btn.focus();
  }

  function pintarPeriodo() {
    var caja = cajaPeriodo();
    if (!caja) return;
    var abierto = popAbierto();
    caja.innerHTML = botonPeriodo() + popPeriodo();
    if (abierto) abrirPop(true);
    // Un solo listener delegado: pintarPeriodo() reescribe el innerHTML en cada
    // cambio, así que enganchar por nodo dejaría uno nuevo cada vez.
    if (caja.dataset.perEnganchado === '1') return;
    caja.dataset.perEnganchado = '1';
    caja.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-per]');
      if (!b) return;
      var accion = b.getAttribute('data-per');
      if (accion === 'abrir') return abrirPop(!popAbierto());
      if (accion === 'mes') { abrirPop(false); return setMes(b.getAttribute('data-v')); }
      if (accion !== 'rango') return;
      var desde = caja.querySelector('[data-per-desde]');
      var hasta = caja.querySelector('[data-per-hasta]');
      var error = caja.querySelector('.dashx-per-error');
      var ok = setRango(desde && desde.value, hasta && hasta.value);
      if (ok) return abrirPop(false);
      if (!error) return;
      error.textContent = (desde && desde.value && hasta && hasta.value)
        ? 'La fecha "desde" tiene que ser anterior a la de "hasta".'
        : 'Completá las dos fechas.';
      error.hidden = false;
    });
    document.addEventListener('click', function (ev) {
      var dentro = ev.target && ev.target.closest && ev.target.closest('#dashx-periodos');
      if (popAbierto() && !dentro) abrirPop(false);
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && popAbierto()) abrirPop(false);
    });
  }

  function setFiltro(nombre, valores) {
    if (!(nombre in estado)) return;
    estado[nombre] = Array.isArray(valores) ? valores.slice() : [];
    recargar();
  }

  function mostrarSeccion(id) {
    if (!id || id === activa) return Promise.resolve();
    activa = id;
    aplicarVisibilidad();
    // Se recarga al mostrar: los gráficos se montan con el contenedor ya
    // visible y toman el ancho real.
    return recargar();
  }

  function seccionActiva() { return activa; }

  function init() {
    montarTodas();
    pintarPeriodo();
    // Después de montar: una sección que crea sus filtros en montar() no tiene
    // el contenedor lleno antes de este punto.
    aplicarVisibilidad();
    return recargar();
  }

  global.AuxDash = {
    estado: estado,
    filtros: filtros,
    registrarSeccion: registrarSeccion,
    recargar: recargar,
    setMes: setMes,
    setRango: setRango,
    descripcionPeriodo: descripcionPeriodo,
    mostrarSeccion: mostrarSeccion,
    seccionActiva: seccionActiva,
    setFiltro: setFiltro,
    rangoDeMes: rangoDeMes,
    init: init
  };
})(window);

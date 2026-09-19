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
    periodo: '1m',
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

  function rangoDePeriodo(periodo) {
    var hasta = new Date();
    var desde = new Date();
    switch (periodo) {
      case '7d':  desde.setDate(desde.getDate() - 6); break;
      case '3m':  desde.setMonth(desde.getMonth() - 3); break;
      case '6m':  desde.setMonth(desde.getMonth() - 6); break;
      case '12m': desde.setMonth(desde.getMonth() - 12); break;
      case 'ano': desde = new Date(hasta.getFullYear(), 0, 1); break;
      default:    desde.setMonth(desde.getMonth() - 1); break;
    }
    return { desde: fechaISO(desde), hasta: fechaISO(hasta) };
  }

  function filtros() {
    var r = (estado.desde && estado.hasta)
      ? { desde: estado.desde, hasta: estado.hasta }
      : rangoDePeriodo(estado.periodo);
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
     tape. Se muestra y se esconde con la sección igual que el cuerpo. */
  function aplicarVisibilidad() {
    secciones.forEach(function (s) {
      var visible = esVisible(s);
      var cont = document.getElementById('dashx-sec-' + s.id);
      if (cont) cont.hidden = !visible;
      if (s.filtros) {
        var fil = document.getElementById(s.filtros);
        if (fil) fil.hidden = !visible;
      }
    });
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

  function setPeriodo(p) {
    estado.periodo = p;
    estado.desde = null;
    estado.hasta = null;
    recargar();
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
    setPeriodo: setPeriodo,
    mostrarSeccion: mostrarSeccion,
    seccionActiva: seccionActiva,
    setFiltro: setFiltro,
    rangoDePeriodo: rangoDePeriodo,
    init: init
  };
})(window);

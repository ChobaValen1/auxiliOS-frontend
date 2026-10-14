/* Panel · zoom de los gráficos de evolución, como en un portal de finanzas.
   · Rueda del mouse (o pellizco en el touchpad/celular) acerca y aleja el
     tiempo alrededor del puntero; arrastrar mueve la ventana; doble clic
     vuelve al período elegido arriba.
   · Botones de rango (Período, 7D, 1M, 3M, 6M, 1A, Todo) y de zoom (−, +,
     volver), y un navegador abajo con toda la historia y la ventana visible.
   · La historia sale de dashboard_historia_v1: la serie diaria de hasta dos
     años, con las mismas reglas que Tendencia. Se guarda un minuto para que
     Resumen y Tendencia no la pidan dos veces.

   No conoce los datos: cada gráfico le pasa cuántos puntos hay y redibuja
   cuando la ventana cambia (alCambiar). */
(function (global) {
  'use strict';

  var DIA = 86400000;
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_L = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  var RPC_HIST = 'dashboard_historia_v1';
  var HIST_TTL = 60000;

  var RANGOS = [
    { id: 'periodo', label: 'Período' },
    { id: 'd7', label: '7D', dias: 7 },
    { id: 'd30', label: '1M', dias: 30 },
    { id: 'd90', label: '3M', dias: 91 },
    { id: 'd180', label: '6M', dias: 182 },
    { id: 'd365', label: '1A', dias: 365 },
    { id: 'todo', label: 'Todo' }
  ];

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function lista(v) { return Array.isArray(v) ? v : []; }

  /* ── fechas ───────────────────────────────────────────────────────────── */

  function aFecha(iso) { return new Date(String(iso).slice(0, 10) + 'T12:00:00'); }
  function aIso(f) {
    return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0');
  }
  function sumarDias(iso, n) { return aIso(new Date(aFecha(iso).getTime() + n * DIA)); }
  function diasEntre(a, b) { return Math.round((aFecha(b) - aFecha(a)) / DIA); }
  function hoyIso() { return aIso(new Date()); }
  function dm(f) { return f.getDate() + '/' + (f.getMonth() + 1); }
  function dmy(f) { return dm(f) + '/' + f.getFullYear(); }

  /* Cubos de una serie diaria de n días desde `desde`: por día, por semana
     (lunes a domingo) o por mes. Cada cubo sabe su primer y último día.
     `hoy` (índice del día de hoy en la serie) marca la semana o el mes en
     curso, que todavía no está completo. */
  function cubos(desde, n, escala, hoy) {
    var base = aFecha(desde), out = [], prev = null;
    for (var i = 0; i < n; i++) {
      var f = new Date(base.getTime() + i * DIA);
      var clave = escala === 'mes' ? f.getFullYear() * 12 + f.getMonth()
        : escala === 'semana' ? Math.floor((Date.UTC(f.getFullYear(), f.getMonth(), f.getDate()) / DIA + 3) / 7)
        : i;
      if (clave !== prev) { out.push({ a: i, b: i, ini: f, fin: f }); prev = clave; }
      else { out[out.length - 1].b = i; out[out.length - 1].fin = f; }
    }
    out.forEach(function (c) {
      if (escala === 'mes') {
        c.et = MESES[c.ini.getMonth()] + ' ' + String(c.ini.getFullYear()).slice(2);
        c.tit = MESES_L[c.ini.getMonth()] + ' ' + c.ini.getFullYear();
      } else if (escala === 'semana') {
        c.et = dm(c.ini);
        c.tit = c.a === c.b ? SEMANA[c.ini.getDay()] + ' ' + dmy(c.ini) : 'Semana del ' + dm(c.ini) + ' al ' + dmy(c.fin);
      } else {
        c.et = dm(c.ini);
        c.tit = SEMANA[c.ini.getDay()] + ' ' + dmy(c.ini);
      }
      if (hoy != null && c.a < c.b && c.a <= hoy && hoy < c.b) c.tit += ' · en curso';
    });
    return out;
  }

  function sumar(cs, valores) {
    return cs.map(function (c) {
      var s = 0;
      for (var i = c.a; i <= c.b; i++) s += num(valores[i]);
      return s;
    });
  }

  /* Índice del cubo que contiene el día i de la serie diaria. */
  function cuboDe(cs, i) {
    var lo = 0, hi = cs.length - 1;
    if (hi < 0) return 0;
    if (i <= cs[0].a) return 0;
    if (i >= cs[hi].b) return hi;
    while (lo < hi) {
      var m = (lo + hi) >> 1;
      if (cs[m].b < i) lo = m + 1; else hi = m;
    }
    return lo;
  }

  /* ── cuentas de la ventana (puras, se prueban sin navegador) ──────────── */

  function acotar(i0, i1, n, minimo) {
    var span = Math.max(Math.min(minimo, n), Math.min(n, i1 - i0 + 1));
    var a = Math.max(0, Math.min(n - span, i0));
    return [a, a + span - 1];
  }

  /* Acerca (factor < 1) o aleja (factor > 1) dejando quieto el punto que
     está en `frac` (0 = borde izquierdo, 1 = derecho). */
  function zoom(i0, i1, n, factor, frac, minimo) {
    var span = i1 - i0 + 1;
    var nuevo = Math.round(span * factor);
    if (factor < 1 && nuevo === span) nuevo = span - 1;
    if (factor > 1 && nuevo === span) nuevo = span + 1;
    nuevo = Math.max(Math.min(minimo, n), Math.min(n, nuevo));
    var f = Math.max(0, Math.min(1, frac == null ? 0.5 : frac));
    var ancla = i0 + f * (span - 1);
    var a = Math.round(ancla - f * (nuevo - 1));
    return acotar(a, a + nuevo - 1, n, minimo);
  }

  function mover(i0, i1, n, delta) {
    var span = i1 - i0 + 1;
    var a = Math.max(0, Math.min(n - span, Math.round(i0 + delta)));
    return [a, a + span - 1];
  }

  /* Ventana (en cubos) de cada botón de rango. `per` son los días del
     período en la historia; los rangos fijos terminan donde termina el
     período, como en un portal que mira hacia atrás desde la última fecha. */
  function ventanaRango(id, cs, per, hist) {
    if (!cs.length) return null;
    var fin = cuboDe(cs, per[1]);
    if (id === 'periodo') return [cuboDe(cs, per[0]), fin];
    if (id === 'todo') return [cuboDe(cs, hist && hist.primer != null ? Math.min(hist.primer, per[0]) : 0), cs.length - 1];
    var r = RANGOS.filter(function (x) { return x.id === id; })[0];
    if (!r || !r.dias) return null;
    if (per[1] + 1 < r.dias * 0.8) return null;   // no hay tanta historia
    return [cuboDe(cs, Math.max(0, per[1] - r.dias + 1)), fin];
  }

  function textoVentana(cs, i0, i1) {
    if (!cs.length || !cs[i0] || !cs[i1]) return '';
    var dias = cs[i1].b - cs[i0].a + 1;
    return dmy(cs[i0].ini) + ' – ' + dmy(cs[i1].fin) + ' · ' + dias + (dias === 1 ? ' día' : ' días');
  }

  /* ── historia (compartida entre Resumen y Tendencia) ──────────────────── */

  var cache = {};

  function rpc(nombre, args) {
    var db = (typeof _db !== 'undefined') ? _db : null;
    if (!db || typeof db.rpc !== 'function') return Promise.reject(new Error('Sin conexión con la base de datos'));
    return Promise.resolve(db.rpc(nombre, args)).then(function (res) {
      if (res && res.error) throw res.error;
      return res ? res.data : null;
    });
  }

  /* Rango que se pide: hasta el fin del período o hoy (lo que sea más
     tarde) y desde dos años antes, o desde antes si hace falta para que el
     período tenga su período anterior entero. */
  function rangoHistoria(f) {
    var hoy = hoyIso();
    var hasta = (f && f.hasta) || hoy;
    var desde = (f && f.desde) || sumarDias(hasta, -29);
    var largo = diasEntre(desde, hasta) + 1;
    var hHasta = hasta > hoy ? hasta : hoy;
    var a = sumarDias(desde, -largo), b = sumarDias(hHasta, -729);
    return { desde: desde, hasta: hasta, hDesde: a < b ? a : b, hHasta: hHasta };
  }

  function normalizarHistoria(h) {
    var o = h && typeof h === 'object' ? h : null;
    if (!o || !o.desde) return null;
    var serie = function (k) { return lista(o[k]).map(num); };
    var r = { desde: String(o.desde).slice(0, 10), facturado: serie('facturado'), servicios: serie('servicios'), km_reales: serie('km_reales') };
    r.n = r.facturado.length;
    r.primer = o.primer_dato ? diasEntre(r.desde, o.primer_dato) : null;
    return r.n ? r : null;
  }

  function historia(f) {
    var r = rangoHistoria(f);
    var clave = [r.hDesde, r.hHasta, lista(f && f.empresas).join(','), lista(f && f.bases).join(',')].join('|');
    var c = cache[clave];
    if (c && Date.now() - c.t < HIST_TTL) return c.p;
    var p = rpc(RPC_HIST, {
      p_desde: r.hDesde, p_hasta: r.hHasta,
      p_empresas: lista(f && f.empresas).length ? f.empresas : null,
      p_bases: lista(f && f.bases).length ? f.bases : null
    }).then(normalizarHistoria).catch(function () { delete cache[clave]; return null; });
    cache[clave] = { t: Date.now(), p: p };
    return p;
  }

  /* Sin la función nueva en la base: se arma con el período y su anterior,
     que vienen pegados. Alcanza para acercar dentro del período. */
  function historiaDePeriodo(desde, anterior, actual) {
    var n = Math.max(lista(actual.facturado).length, lista(anterior.facturado).length);
    if (!desde || !n) return null;
    var pegar = function (k) {
      var a = lista(anterior[k]).slice(0, n), b = lista(actual[k]).slice(0, n);
      while (a.length < n) a.push(0);
      while (b.length < n) b.push(0);
      return a.concat(b).map(num);
    };
    return { desde: sumarDias(desde, -n), facturado: pegar('facturado'), servicios: pegar('servicios'), km_reales: pegar('km_reales'), n: 2 * n, primer: null, parcial: true };
  }

  /* ── control visual ───────────────────────────────────────────────────── */

  function icono(nombre) {
    return '<svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#' + nombre + '"/></svg>';
  }

  /* opts:
     · canvas: el lienzo del gráfico (ahí se escuchan rueda, arrastre y pellizco)
     · grafico(): la instancia de Chart.js actual (para saber el área de dibujo)
     · alCambiar(i0, i1): redibujar con la ventana nueva
     · ventanaDeRango(id): [i0, i1] del botón de rango, o null si no aplica
     · rangos: ids de RANGOS a mostrar (por defecto todos)
     · navegador: true para la tira con toda la historia
     · minimo: puntos mínimos visibles (3)
     · texto(i0, i1): leyenda de la ventana ("5/9/2026 – 4/10/2026 · 30 días") */
  function crear(host, opts) {
    var o = opts || {};
    var cv = o.canvas;
    var st = { n: 0, i0: 0, i1: 0, serie: [], minimo: o.minimo || 3, pend: false };
    var ids = o.rangos || RANGOS.map(function (r) { return r.id; });
    var rangos = RANGOS.filter(function (r) { return ids.indexOf(r.id) >= 0; });

    var bar = document.createElement('div');
    bar.className = 'axz-bar';
    bar.innerHTML =
      '<div class="axz-rangos" role="group" aria-label="Rango de fechas">' +
        rangos.map(function (r) {
          return '<button type="button" data-axz-rango="' + r.id + '" aria-pressed="false"' +
            (r.dias ? ' title="Últimos ' + r.dias + ' días hasta el fin del período"' : '') + '>' + r.label + '</button>';
        }).join('') +
      '</div>' +
      '<div class="axz-der">' +
        '<span class="axz-lbl" aria-live="polite"></span>' +
        '<div class="axz-zoom" role="group" aria-label="Zoom">' +
          '<button type="button" data-axz="out" title="Alejar (tecla −)" aria-label="Alejar"><b aria-hidden="true">−</b></button>' +
          '<button type="button" data-axz="in" title="Acercar (tecla +)" aria-label="Acercar">' + icono('plus') + '</button>' +
          '<button type="button" data-axz="reset" title="Volver al período (doble clic)" aria-label="Volver al período">' + icono('rotate-ccw') + '</button>' +
        '</div>' +
      '</div>';

    var wrap = cv.parentNode;
    wrap.parentNode.insertBefore(bar, wrap);
    wrap.classList.add('axz-lienzo');
    wrap.setAttribute('tabindex', '0');
    wrap.setAttribute('aria-label', 'Gráfico con zoom: rueda o + y − para acercar, flechas para moverte');

    var nav = null, navCv = null, navSel = null, tip = null;
    if (o.navegador) {
      nav = document.createElement('div');
      nav.className = 'axz-nav';
      nav.innerHTML = '<canvas aria-hidden="true"></canvas><div class="axz-dim is-izq"></div><div class="axz-dim is-der"></div>' +
        '<div class="axz-sel" title="Arrastrá para moverte · estirá los bordes para cambiar el rango"><i class="axz-h is-izq"></i><i class="axz-h is-der"></i></div>';
      wrap.parentNode.insertBefore(nav, wrap.nextSibling);
      navCv = nav.querySelector('canvas');
      navSel = nav.querySelector('.axz-sel');
    }
    tip = document.createElement('p');
    tip.className = 'axz-tip';
    tip.innerHTML = '<span class="axz-tip-pc">Rueda del mouse para acercar o alejar · arrastrá para moverte · doble clic vuelve al período</span>' +
      '<span class="axz-tip-tactil">Pellizcá para acercar o alejar · deslizá de costado para moverte</span>';
    (nav || wrap).parentNode.insertBefore(tip, (nav || wrap).nextSibling);

    function area() {
      var ch = o.grafico && o.grafico();
      var r = cv.getBoundingClientRect();
      if (ch && ch.chartArea && ch.chartArea.right > ch.chartArea.left) {
        return { left: r.left + ch.chartArea.left, width: ch.chartArea.right - ch.chartArea.left };
      }
      return { left: r.left, width: r.width || 1 };
    }
    function fracDe(clientX) {
      var a = area();
      return Math.max(0, Math.min(1, (clientX - a.left) / a.width));
    }

    function pintarBarra() {
      var activo = null;
      rangos.forEach(function (r) {
        var b = bar.querySelector('[data-axz-rango="' + r.id + '"]');
        var v = o.ventanaDeRango ? o.ventanaDeRango(r.id) : null;
        b.disabled = !v;
        var es = !!v && v[0] === st.i0 && v[1] === st.i1;
        if (es && !activo) activo = r.id;
        b.setAttribute('aria-pressed', es && activo === r.id ? 'true' : 'false');
      });
      var lbl = bar.querySelector('.axz-lbl');
      if (lbl) lbl.textContent = o.texto ? o.texto(st.i0, st.i1) : '';
      var span = st.i1 - st.i0 + 1;
      bar.querySelector('[data-axz="in"]').disabled = span <= Math.min(st.minimo, st.n);
      bar.querySelector('[data-axz="out"]').disabled = span >= st.n;
      var per = o.ventanaDeRango ? o.ventanaDeRango('periodo') : null;
      bar.querySelector('[data-axz="reset"]').disabled = !per || (per[0] === st.i0 && per[1] === st.i1);
      cv.style.cursor = span < st.n ? 'grab' : '';
      if (navSel && st.n) {
        var izq = st.i0 * 100 / st.n, ancho = span * 100 / st.n;
        navSel.style.left = izq + '%';
        navSel.style.width = ancho + '%';
        nav.querySelector('.axz-dim.is-izq').style.width = izq + '%';
        nav.querySelector('.axz-dim.is-der').style.left = (izq + ancho) + '%';
      }
    }

    function pintarNav() {
      if (!navCv) return;
      var w = nav.clientWidth, h = nav.clientHeight;
      if (!w || !h) return;
      var dpr = global.devicePixelRatio || 1;
      navCv.width = Math.round(w * dpr); navCv.height = Math.round(h * dpr);
      navCv.style.width = w + 'px'; navCv.style.height = h + 'px';
      var ctx = navCv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      var s = st.serie, n = s.length;
      if (n < 2) return;
      var max = Math.max.apply(null, s.concat([1]));
      var color = global.getComputedStyle(nav).color || 'rgb(245,166,35)';
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (var i = 0; i < n; i++) ctx.lineTo(i * w / (n - 1), h - 3 - (num(s[i]) / max) * (h - 8));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.globalAlpha = 0.22; ctx.fillStyle = color; ctx.fill();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath();
      for (var j = 0; j < n; j++) {
        var x = j * w / (n - 1), y = h - 3 - (num(s[j]) / max) * (h - 8);
        if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function aplicar(v, inmediato) {
      if (!st.n) return false;
      var w = acotar(v[0], v[1], st.n, st.minimo);
      if (w[0] === st.i0 && w[1] === st.i1) return false;
      st.i0 = w[0]; st.i1 = w[1];
      if (inmediato) { pintarBarra(); if (o.alCambiar) o.alCambiar(st.i0, st.i1); return true; }
      if (!st.pend) {
        st.pend = true;
        (global.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(function () {
          st.pend = false;
          pintarBarra();
          if (o.alCambiar) o.alCambiar(st.i0, st.i1);
        });
      }
      return true;
    }

    function zoomEn(factor, frac) { return aplicar(zoom(st.i0, st.i1, st.n, factor, frac, st.minimo)); }
    function moverPuntos(d) { return aplicar(mover(st.i0, st.i1, st.n, d)); }
    function alPeriodo() { var v = o.ventanaDeRango && o.ventanaDeRango('periodo'); if (v) aplicar(v, true); }

    bar.addEventListener('click', function (ev) {
      var r = ev.target.closest('[data-axz-rango]');
      if (r) { var v = o.ventanaDeRango && o.ventanaDeRango(r.getAttribute('data-axz-rango')); if (v) aplicar(v, true); return; }
      var b = ev.target.closest('[data-axz]');
      if (!b) return;
      var acc = b.getAttribute('data-axz');
      if (acc === 'in') zoomEn(0.6, 0.5);
      else if (acc === 'out') zoomEn(1 / 0.6, 0.5);
      else alPeriodo();
    });

    /* Rueda: vertical acerca/aleja, horizontal (touchpad) mueve. Si ya está
       todo a la vista y se sigue alejando, la página scrollea normal. */
    cv.addEventListener('wheel', function (ev) {
      if (!st.n) return;
      var k = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1;
      var dx = ev.deltaX * k, dy = ev.deltaY * k;
      var span = st.i1 - st.i0 + 1;
      if (Math.abs(dx) > Math.abs(dy)) {
        var a = area();
        if (moverPuntos(dx / a.width * span)) ev.preventDefault();
        return;
      }
      if (!dy) return;
      var factor = Math.exp(dy * (ev.ctrlKey ? 0.01 : 0.0018));
      if (dy > 0 && span >= st.n) return;
      ev.preventDefault();
      zoomEn(factor, fracDe(ev.clientX));
    }, { passive: false });

    /* Arrastre con el mouse o un dedo, pellizco con dos dedos. */
    var punteros = {};
    var gesto = null;
    function cantidad() { return Object.keys(punteros).length; }
    function empezar() {
      var ps = Object.keys(punteros).map(function (k) { return punteros[k]; });
      if (ps.length === 1) gesto = { tipo: 'mover', x: ps[0].x, i0: st.i0, i1: st.i1, movio: false };
      else if (ps.length === 2) {
        gesto = { tipo: 'pellizco', d: Math.abs(ps[0].x - ps[1].x) || 1, i0: st.i0, i1: st.i1,
                  frac: fracDe((ps[0].x + ps[1].x) / 2) };
      } else gesto = null;
    }
    cv.addEventListener('pointerdown', function (ev) {
      if (!st.n || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
      punteros[ev.pointerId] = { x: ev.clientX };
      if (ev.pointerType === 'mouse' && cv.setPointerCapture) { try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* sin captura */ } }
      empezar();
    });
    cv.addEventListener('pointermove', function (ev) {
      if (!punteros[ev.pointerId] || !gesto) return;
      punteros[ev.pointerId].x = ev.clientX;
      var span = gesto.i1 - gesto.i0 + 1;
      if (gesto.tipo === 'mover') {
        var dx = ev.clientX - gesto.x;
        if (!gesto.movio && Math.abs(dx) < 4) return;
        gesto.movio = true;
        cv.style.cursor = 'grabbing';
        aplicar(mover(gesto.i0, gesto.i1, st.n, -dx / area().width * span));
      } else if (cantidad() === 2) {
        var ps = Object.keys(punteros).map(function (k) { return punteros[k]; });
        var d = Math.abs(ps[0].x - ps[1].x) || 1;
        aplicar(zoom(gesto.i0, gesto.i1, st.n, gesto.d / d, gesto.frac, st.minimo));
      }
    });
    function soltar(ev) {
      if (!punteros[ev.pointerId]) return;
      delete punteros[ev.pointerId];
      cv.style.cursor = st.i1 - st.i0 + 1 < st.n ? 'grab' : '';
      empezar();
    }
    cv.addEventListener('pointerup', soltar);
    cv.addEventListener('pointercancel', soltar);
    cv.addEventListener('dblclick', function (ev) { ev.preventDefault(); alPeriodo(); });

    wrap.addEventListener('keydown', function (ev) {
      var span = st.i1 - st.i0 + 1, paso = Math.max(1, Math.round(span * 0.15));
      var hecho = true;
      if (ev.key === '+' || ev.key === '=') zoomEn(0.6, 0.5);
      else if (ev.key === '-' || ev.key === '_') zoomEn(1 / 0.6, 0.5);
      else if (ev.key === 'ArrowLeft') moverPuntos(-paso);
      else if (ev.key === 'ArrowRight') moverPuntos(paso);
      else if (ev.key === '0' || ev.key === 'Home') alPeriodo();
      else hecho = false;
      if (hecho) ev.preventDefault();
    });

    /* Navegador: arrastrar la ventana, estirar sus bordes o tocar afuera. */
    if (nav) {
      var nGesto = null;
      nav.addEventListener('pointerdown', function (ev) {
        if (!st.n) return;
        var r = nav.getBoundingClientRect();
        var pos = (ev.clientX - r.left) / r.width * st.n;
        var h = ev.target.closest('.axz-h');
        if (h) nGesto = { tipo: h.classList.contains('is-izq') ? 'izq' : 'der' };
        else if (ev.target.closest('.axz-sel')) nGesto = { tipo: 'mover', pos: pos, i0: st.i0, i1: st.i1 };
        else {
          var span = st.i1 - st.i0 + 1;
          var a = Math.round(pos - span / 2);
          aplicar([a, a + span - 1], true);
          nGesto = { tipo: 'mover', pos: pos, i0: st.i0, i1: st.i1 };
        }
        try { nav.setPointerCapture(ev.pointerId); } catch (e) { /* sin captura */ }
        ev.preventDefault();
      });
      nav.addEventListener('pointermove', function (ev) {
        if (!nGesto) return;
        var r = nav.getBoundingClientRect();
        var pos = Math.max(0, Math.min(st.n, (ev.clientX - r.left) / r.width * st.n));
        if (nGesto.tipo === 'mover') aplicar(mover(nGesto.i0, nGesto.i1, st.n, pos - nGesto.pos));
        else if (nGesto.tipo === 'izq') aplicar([Math.min(Math.round(pos), st.i1 - st.minimo + 1), st.i1]);
        else aplicar([st.i0, Math.max(Math.round(pos) - 1, st.i0 + st.minimo - 1)]);
      });
      var fin = function () { nGesto = null; };
      nav.addEventListener('pointerup', fin);
      nav.addEventListener('pointercancel', fin);
    }

    var ro = null;
    if (nav && typeof global.ResizeObserver === 'function') { ro = new global.ResizeObserver(pintarNav); ro.observe(nav); }

    return {
      /* n puntos, ventana inicial y la serie del navegador */
      datos: function (n, ventana, serie, minimo) {
        st.n = Math.max(0, n | 0);
        if (minimo) st.minimo = minimo;
        st.serie = lista(serie);
        var w = st.n ? acotar(ventana[0], ventana[1], st.n, st.minimo) : [0, -1];
        st.i0 = w[0]; st.i1 = w[1];
        pintarBarra();
        pintarNav();
      },
      ventana: function () { return [st.i0, st.i1]; },
      fijar: function (i0, i1) { return aplicar([i0, i1], true); },
      refrescar: function () { pintarBarra(); pintarNav(); }
    };
  }

  global.AuxZoom = {
    RANGOS: RANGOS,
    cubos: cubos,
    sumar: sumar,
    cuboDe: cuboDe,
    ventanaRango: ventanaRango,
    textoVentana: textoVentana,
    acotar: acotar,
    zoom: zoom,
    mover: mover,
    rangoHistoria: rangoHistoria,
    normalizarHistoria: normalizarHistoria,
    historia: historia,
    historiaDePeriodo: historiaDePeriodo,
    sumarDias: sumarDias,
    diasEntre: diasEntre,
    hoy: hoyIso,
    crear: crear
  };
})(window);

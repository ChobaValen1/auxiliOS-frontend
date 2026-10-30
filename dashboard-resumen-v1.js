/* Panel · pestaña RESUMEN.
   Reemplaza a la vieja Facturación + mapa de zonas. Se registra en el shell
   (AuxDash) con el id 'facturacion' —el contenedor y el overlay de carga son
   los de siempre— y pide dos RPC en paralelo:

   · dashboard_facturacion_v1: totales, período anterior, km reales y la tabla
     de prestadoras con sus bases.
   · dashboard_resumen_v1: facturado por día (actual y anterior), reparto por
     tipo de vehículo y los servicios ubicados con su base más cercana.

   El frontend no suma filas de la base: sólo arma cocientes entre totales que
   ya vienen hechos (ticket, km reales sobre facturados, tarifa media) y la cobertura del mapa,
   que depende del radio que elige quien mira. */
(function (global) {
  'use strict';

  var RPC_FACT = 'dashboard_facturacion_v1';
  var RPC_RES  = 'dashboard_resumen_v1';
  var COBERTURA_MIN = 0.9;   // remitos del período cargados como servicio para comparar con el odómetro

  var ID_KPIS  = 'dashx-fact-kpis';
  var ID_FILT  = 'dashx-fact-filtros';
  var ID_RANGO = 'dashx-fact-sub';
  var ID_MAPA  = 'dashx-fact-mapa';
  var ID_TABLA = 'dashx-fact-empresas';

  var LIB_JS  = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4/dist/maplibre-gl.js';
  var LIB_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4/dist/maplibre-gl.css';
  var ESTILO  = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
  var VISTA_INICIAL = { center: [-58.4, -34.7], zoom: 8 };

  var GUION = '—';
  var MAX_PRESTADORAS = 7;
  var COLOR_OTROS = '#5a6278';
  var COLOR_BASE = '#e8eaf2';

  /* Tipos de vehículo: un solo tono (verde agua) en escalones de luz. Es una
     composición de un todo, no categorías que haya que distinguir de lejos,
     y así no compite con los colores de las prestadoras del mapa. */
  var CLASES = {
    light:      { nombre: 'Liviano',    color: '#5eead4' },
    semi_heavy: { nombre: 'Semipesado', color: '#14b8a6' },
    heavy:      { nombre: 'Pesado',     color: '#0f766e' },
    uml:        { nombre: 'UML',        color: '#2dd4bf' },
    otros:      { nombre: 'Otros',      color: '#475569' }
  };

  var estado = {
    radio: 20,
    circulos: true,
    lineas: false,
    fact: null,
    res: null,
    filtros: null
  };

  var mapa = null;
  var observador = null;
  var cargandoLib = null;
  var chartEvol = null;
  var zoomEvol = null;
  /* Zoom de la evolución (dashboard-zoom-v1.js): serie diaria larga, días
     del período dentro de ella y la ventana que se está mirando. */
  var evol = { hist: null, per: null, linea: null };
  var firmaCatalogo = { empresas: null, bases: null };

  /* ── utilidades ───────────────────────────────────────────────────────── */

  function el(id) { return document.getElementById(id); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function lista(v) { return Array.isArray(v) ? v : []; }
  function ch() { return global.AuxDashCharts; }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fecha(iso) {
    var p = String(iso || '').slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '';
  }

  function miles(v, dec) {
    return num(v).toLocaleString('es-AR', {
      minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0
    });
  }

  function pesos(v) { return '$ ' + miles(Math.round(num(v))); }

  /* $14,7M / $850K: para los números que van al lado de una etiqueta corta. */
  function pesosCorto(v) {
    var n = num(v), a = Math.abs(n);
    if (a >= 1e6) return '$' + miles(n / 1e6, 1) + 'M';
    if (a >= 1e3) return '$' + miles(Math.round(n / 1e3)) + 'K';
    return '$' + miles(Math.round(n));
  }

  function pct(v, dec) { return miles(v, dec == null ? 0 : dec) + '%'; }

  function div(a, b) { return num(b) > 0 ? num(a) / num(b) : null; }

  /* ── normalización ────────────────────────────────────────────────────── */

  function normalizar(fact, res) {
    var f = fact && typeof fact === 'object' ? fact : {};
    var r = res && typeof res === 'object' ? res : {};
    var t = f.totales || {}, a = f.anterior || {}, x = f.reales || {};
    var c = f.comparativo || {};

    var empresas = lista(f.por_empresa).map(function (e) {
      return {
        id: e.id || null,
        nombre: String(e.nombre || 'Sin prestadora'),
        monto: num(e.monto), servicios: num(e.servicios), km: num(e.km),
        kmReal: num(e.km_real), kmComp: num(e.km_comp),
        bases: lista(e.bases).map(function (b) {
          return {
            nombre: String(b.nombre || 'Sin base'),
            monto: num(b.monto), servicios: num(b.servicios), km: num(b.km),
            kmReal: num(b.km_real), kmComp: num(b.km_comp)
          };
        })
      };
    });

    empresas.sort(function(a,b){return b.monto-a.monto||a.nombre.localeCompare(b.nombre);});

    return {
      hayDatos: num(t.servicios) > 0 && f.hay_datos !== false,
      desde: f.desde || r.desde || null,
      hasta: f.hasta || r.hasta || null,
      rangoAnterior: c.desde && c.hasta ? fecha(c.desde) + ' al ' + fecha(c.hasta) : '',
      tot: {
        facturado: num(t.facturado), peajes: num(t.peajes),
        km: num(t.km), servicios: num(t.servicios), kmReal: num(x.km_reales),
        conDato: num(x.servicios_con_dato),
        kmComp: empresas.reduce(function (s, e) { return s + e.kmComp; }, 0)
      },
      ant: {
        facturado: num(a.facturado), peajes: num(a.peajes),
        km: num(a.km), servicios: num(a.servicios), kmReal: num(a.km_reales)
      },
      empresas: empresas,
      catalogo: {
        empresas: lista(f.catalogo && f.catalogo.empresas),
        bases: lista(f.catalogo && f.catalogo.bases)
      },
      porDia: {
        actual: lista(r.por_dia && r.por_dia.actual).map(num),
        anterior: lista(r.por_dia && r.por_dia.anterior).map(num)
      },
      porClase: lista(r.por_clase).map(function (k) {
        var def = CLASES[k.clase] || CLASES.otros;
        return { clase: k.clase, nombre: def.nombre, color: def.color,
                 servicios: num(k.servicios), km: num(k.km), monto: num(k.monto) };
      }),
      puntos: lista(r.puntos),
      bases: lista(r.bases),
      servicios: num(r.servicios)
    };
  }

  /* Un color por prestadora, en el orden de lo facturado: el mismo en el mapa,
     en su leyenda y en la tabla. Más allá de siete, gris de "Otros": la paleta
     validada no se cicla. */
  function coloresPrestadoras(d) {
    var pal = (ch() && ch().PALETA) || ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'];
    var m = Object.create(null);
    d.empresas.forEach(function (e, i) {
      m[String(e.id)] = i < MAX_PRESTADORAS ? pal[i % pal.length] : COLOR_OTROS;
    });
    return m;
  }

  /* ── filtros de la barra ──────────────────────────────────────────────── */

  var ICONO_CAMION = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v9H3zM14 9h4l3 3v3h-7z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="7" cy="17" r="1.8" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="17" cy="17" r="1.8" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
  var ICONO_PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6-5.6-6-11a6 6 0 1 1 12 0c0 5.4-6 11-6 11z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="10" r="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';

  function montarFiltros() {
    var cont = el(ID_FILT);
    if (!cont || cont.dataset.listo === '1') return;
    cont.dataset.listo = '1';
    cont.innerHTML =
      '<label class="rsm-select">' + ICONO_CAMION +
        '<select id="dashx-fact-f-empresa" aria-label="Filtrar por prestadora"></select></label>' +
      '<label class="rsm-select">' + ICONO_PIN +
        '<select id="dashx-fact-f-base" aria-label="Filtrar por base"></select></label>' +
      '<span class="rsm-rango" id="' + ID_RANGO + '"></span>';
    [['dashx-fact-f-empresa', 'empresas'], ['dashx-fact-f-base', 'bases']].forEach(function (par) {
      var sel = el(par[0]);
      if (!sel) return;
      sel.addEventListener('change', function () {
        global.AuxDash.setFiltro(par[1], sel.value ? [sel.value] : []);
      });
    });
  }

  function pintarCombo(id, opciones, todos, seleccionado, clave) {
    var sel = el(id);
    if (!sel) return;
    var firma = opciones.map(function (o) { return o.id; }).join('|');
    if (firmaCatalogo[clave] !== firma) {
      firmaCatalogo[clave] = firma;
      sel.innerHTML = '';
      var op0 = document.createElement('option');
      op0.value = ''; op0.textContent = todos;
      sel.appendChild(op0);
      opciones.forEach(function (o) {
        var op = document.createElement('option');
        op.value = String(o.id);
        op.textContent = String(o.nombre == null ? '' : o.nombre);
        sel.appendChild(op);
      });
    }
    var v = seleccionado == null ? '' : String(seleccionado);
    if (sel.value !== v) sel.value = v;
  }

  function pintarFiltros(d, f) {
    pintarCombo('dashx-fact-f-empresa', d.catalogo.empresas, 'Todas las prestadoras',
      lista(f.empresas).length === 1 ? f.empresas[0] : '', 'empresas');
    pintarCombo('dashx-fact-f-base', d.catalogo.bases, 'Todas las bases',
      lista(f.bases).length === 1 ? f.bases[0] : '', 'bases');
  }

  function pintarRango(f) {
    var n = el(ID_RANGO);
    if (n) n.textContent = f && f.desde && f.hasta ? 'del ' + fecha(f.desde) + ' al ' + fecha(f.hasta) : '';
  }

  /* ── KPIs ─────────────────────────────────────────────────────────────── */

  var FLECHA_SUBE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 11l4-4 3 3 5-5M10 5h4v4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var FLECHA_BAJA = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5l4 4 3-3 5 5M10 11h4V7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* Variación contra el período anterior de igual duración. Sin anterior no
     hay porcentaje: un "+100%" contra cero no dice nada. El signo y la flecha
     van siempre, además del color. */
  function delta(actual, anterior, rango, puntos) {
    var titulo = rango ? ' title="Contra ' + esc(rango) + '"' : '';
    if (actual == null || anterior == null || (!puntos && num(anterior) <= 0)) {
      return '<span class="rsm-delta is-flat"' + titulo + '>sin comparación</span>';
    }
    var v = puntos ? num(actual) - num(anterior) : (num(actual) - num(anterior)) * 100 / num(anterior);
    if (Math.abs(v) < 0.05) return '<span class="rsm-delta is-flat"' + titulo + '>= anterior</span>';
    var sube = v > 0;
    return '<span class="rsm-delta ' + (sube ? 'is-up' : 'is-down') + '"' + titulo + '>' +
      (sube ? FLECHA_SUBE : FLECHA_BAJA) + (sube ? '+' : '−') + miles(Math.abs(v), 1) +
      (puntos ? ' pts' : '%') + '</span>';
  }

  function tile(label, valor, deltaHtml, pie, destacado) {
    return '<div class="rsm-kpi' + (destacado ? ' is-main' : '') + '">' +
      '<div class="rsm-kpi-label">' + esc(label) + '</div>' +
      '<div class="rsm-kpi-value">' + valor + '</div>' +
      (deltaHtml ? '<div class="rsm-kpi-delta">' + deltaHtml + '</div>' : '') +
      '<div class="rsm-kpi-foot">' + pie + '</div>' +
      '</div>';
  }

  /* Km reales sobre km facturados, sólo en los servicios que tienen km real
     (kmComp = facturados de esos mismos servicios). Mide qué parte de lo que
     se cobra se anduvo con el vehículo arriba; no es el rendimiento de la flota. */
  function realesSobreFacturados(t) {
    var comp = t.kmComp > 0 ? t.kmComp : (t.servicios > 0 && t.conDato >= t.servicios ? t.km : 0);
    return comp > 0 && t.kmReal > 0 ? t.kmReal * 100 / comp : null;
  }

  function neutralDelta(actual, anterior, rango) {
    return delta(actual, anterior, rango).replace(/is-up|is-down/g, 'is-neutral');
  }

  function pintarKpis(d) {
    var n = el(ID_KPIS); if (!n) return;
    var t=d.tot,a=d.ant,r=d.rangoAnterior,has=d.hayDatos;
    n.innerHTML =
      tile('Total facturado',has?pesos(t.facturado):GUION,has?neutralDelta(t.facturado,a.facturado,r):'','Servicios finalizados del período',true)+
      tile('Servicios',has?miles(t.servicios):GUION,has?neutralDelta(t.servicios,a.servicios,r):'','Finalizados en el período')+
      tile('Km reales de servicios',has&&t.conDato>0?miles(t.kmReal)+' km':GUION,has&&t.conDato>0?neutralDelta(t.kmReal,a.kmReal,r):'',has?miles(t.conDato)+' de '+miles(t.servicios)+' servicios con dato':'Sin servicios en el período');
    var secondary=el('rsm-secondary');
    if(secondary) secondary.innerHTML='<dl><div><dt>Ticket promedio</dt><dd>'+ (has?pesos(t.facturado/t.servicios):GUION)+'</dd></div><div><dt>Peajes</dt><dd>'+(has?pesos(t.peajes):GUION)+'</dd></div><div><dt>Km facturados</dt><dd>'+(has?miles(t.km)+' km':GUION)+'</dd></div></dl>';
    var context=el('rsm-period-context');if(context)context.textContent=(d.desde&&d.hasta?'Período: '+fecha(d.desde)+' al '+fecha(d.hasta):'Resumen del período')+(r?' · Comparación: '+r:' · Sin período anterior informado');
    var quality=el('rsm-data-context');if(quality)quality.textContent=has?(t.conDato<t.servicios?'Kilómetros parciales: '+miles(t.servicios-t.conDato)+' servicios sin km reales registrados. ':'')+'Los km de servicios no representan el odómetro total de la flota.':'No hay servicios finalizados para los filtros seleccionados.';
  }

  function rankingRows(d){
    var all=d.empresas.slice().sort(function(a,b){return b.monto-a.monto||a.nombre.localeCompare(b.nombre);});
    var rows=all.slice(0,5).map(function(e){return {nombre:e.nombre,monto:e.monto,servicios:e.servicios};});
    if(all.length>5)rows.push({nombre:'Otras '+(all.length-5)+' prestadoras',monto:all.slice(5).reduce(function(n,e){return n+e.monto;},0),servicios:all.slice(5).reduce(function(n,e){return n+e.servicios;},0)});
    var total=all.reduce(function(n,e){return n+e.monto;},0);
    return rows.map(function(e){return Object.assign(e,{share:total>0?e.monto*100/total:null});});
  }
  function pintarRanking(d){
    var n=el('rsm-ranking');if(!n)return;
    var rows=rankingRows(d);
    n.innerHTML=d.hayDatos&&rows.length?'<ol class="rsm-ranking-list">'+rows.map(function(e){return '<li><div><b>'+esc(e.nombre)+'</b><strong>'+pesos(e.monto)+'</strong></div><div class="rsm-ranking-track" aria-hidden="true"><i style="width:'+Math.max(0,Math.min(100,e.share||0))+'%"></i></div><small>'+miles(e.servicios)+' servicios · '+(e.share===null?'Sin participación calculable':pct(e.share,1)+' del total')+'</small></li>';}).join('')+'</ol>':'<p class="rsm-vacio">Sin facturación para comparar prestadoras.</p>';
  }

  function chartColors(){var light=document.documentElement?.dataset.theme==='light';return {accent:light?'#a86600':'#f5a623',previous:light?'#66758b':'#8590ab',grid:light?'rgba(70,85,110,.15)':'rgba(100,115,140,.2)'};}
  function applyChartTheme(){if(!chartEvol)return;var c=chartColors();chartEvol.data.datasets[0].borderColor=c.accent;if(chartEvol.data.datasets[1])chartEvol.data.datasets[1].borderColor=c.previous;chartEvol.options.scales.y.grid.color=c.grid;chartEvol.update('none');}

  function pintarDatosEvol(labels,act,ant){
    var available=act.filter(function(v){return v!=null&&Number.isFinite(Number(v));}),total=available.reduce(function(n,v){return n+Number(v);},0);
    var reading=el('rsm-evol-reading');if(reading)reading.textContent=available.length?'Total visible: '+pesos(total)+' · '+available.length+' días con datos':'Sin datos diarios para esta ventana.';
    var legend=el('rsm-previous-key');if(legend)legend.hidden=!ant.some(function(v){return v!=null&&v>0;});
    var n=el('rsm-evol-data');if(n)n.innerHTML='<div class="rsm-tabla-wrap"><table class="rsm-daily-table"><caption>Valores de la ventana visible · pesos</caption><thead><tr><th>Día actual</th><th>Actual</th><th>Anterior equivalente</th></tr></thead><tbody>'+labels.map(function(label,i){return '<tr><th scope="row">'+esc(label)+'</th><td>'+ (act[i]==null?GUION:pesos(act[i]))+'</td><td>'+(ant[i]==null?GUION:pesos(ant[i]))+'</td></tr>';}).join('')+'</tbody></table></div>';
    var card=el('rsm-evol-card');if(card)card.classList.toggle('rsm-fallback-active',typeof global.Chart==='undefined');
    var cv=el('rsm-evol-canvas');if(cv)cv.setAttribute('aria-label','Facturación diaria de la ventana visible. '+(available.length?'Total actual: '+pesos(total):'Sin datos')+'. Valores diarios disponibles debajo.');
    var fallback=el('rsm-evol-fallback');if(fallback){fallback.hidden=typeof global.Chart!=='undefined';fallback.textContent='Gráfico no disponible. Consultá los valores diarios debajo.';}
  }

  /* ── mapa ─────────────────────────────────────────────────────────────── */

  function cargarLibreria() {
    if (global.maplibregl) return Promise.resolve();
    if (cargandoLib) return cargandoLib;
    cargandoLib = new Promise(function (resolve, reject) {
      if (!document.getElementById('maplibre-css')) {
        var css = document.createElement('link');
        css.id = 'maplibre-css'; css.rel = 'stylesheet'; css.href = LIB_CSS;
        document.head.appendChild(css);
      }
      var s = document.createElement('script');
      s.src = LIB_JS; s.async = true;
      s.addEventListener('load', function () {
        global.maplibregl ? resolve() : reject(new Error('maplibre no quedó disponible'));
      }, { once: true });
      s.addEventListener('error', function () { reject(new Error('No se pudo cargar el mapa')); }, { once: true });
      document.body.appendChild(s);
    }).catch(function (e) { cargandoLib = null; throw e; });
    return cargandoLib;
  }

  /* Círculo geodésico aproximado: alcanza para un radio de decenas de km. */
  function circulo(lng, lat, km) {
    var pts = [], n = 64;
    var dLat = km / 110.574;
    var dLng = km / (111.32 * Math.cos(lat * Math.PI / 180));
    for (var i = 0; i <= n; i++) {
      var ang = (i / n) * 2 * Math.PI;
      pts.push([lng + dLng * Math.cos(ang), lat + dLat * Math.sin(ang)]);
    }
    return pts;
  }

  function fc(features) { return { type: 'FeatureCollection', features: features }; }

  function datosMapa(d) {
    var colores = coloresPrestadoras(d);
    var basePorId = Object.create(null);
    d.bases.forEach(function (b) { basePorId[String(b.id)] = b; });
    var puntos = [], lineas = [];
    d.puntos.forEach(function (p) {
      var lng = num(p[0]), lat = num(p[1]);
      var color = colores[String(p[2])] || COLOR_OTROS;
      var km = p[4] == null ? null : num(p[4]);
      puntos.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: { color: color, km: km, dentro: km != null && km <= estado.radio ? 1 : 0 } });
      var b = basePorId[String(p[3])];
      if (b) lineas.push({ type: 'Feature', properties: { color: color },
        geometry: { type: 'LineString', coordinates: [[num(b.lng), num(b.lat)], [lng, lat]] } });
    });
    var radios = d.bases.map(function (b) {
      return { type: 'Feature', properties: {},
        geometry: { type: 'Polygon', coordinates: [circulo(num(b.lng), num(b.lat), estado.radio)] } };
    });
    var sedes = d.bases.map(function (b) {
      return { type: 'Feature', properties: { nombre: String(b.nombre || 'Base') },
        geometry: { type: 'Point', coordinates: [num(b.lng), num(b.lat)] } };
    });
    return { puntos: fc(puntos), lineas: fc(lineas), radios: fc(radios), sedes: fc(sedes) };
  }

  function cobertura(d) {
    var ev = 0, dentro = 0, suma = 0;
    d.puntos.forEach(function (p) {
      if (p[4] == null) return;
      var km = num(p[4]);
      ev++; suma += km;
      if (km <= estado.radio) dentro++;
    });
    return { evaluados: ev, dentro: dentro, fuera: ev - dentro,
             pct: ev ? dentro * 100 / ev : null, media: ev ? suma / ev : null };
  }

  function pintarLecturaMapa(d) {
    var c = cobertura(d);
    var sub = el('rsm-mapa-sub');
    if (sub) {
      var sinUbicar = Math.max(0, d.servicios - d.puntos.length);
      sub.textContent = d.puntos.length
        ? miles(d.puntos.length) + ' servicios ubicados en su base más cercana · ' +
          pct(c.pct || 0) + ' dentro de ' + estado.radio + ' km' +
          (sinUbicar ? ' · ' + sinUbicar + ' sin ubicación' : '')
        : (d.servicios ? 'Los servicios del período no tienen ubicación cargada.' : 'Sin servicios en el período.');
    }
    var st = el('rsm-mapa-stats');
    if (st) {
      st.innerHTML =
        '<div><span>Cobertura</span><b>' + (c.pct == null ? GUION : pct(c.pct)) + '</b></div>' +
        '<div><span>Dist. media</span><b>' + (c.media == null ? GUION : miles(c.media, 1) + ' km') + '</b></div>' +
        '<div class="' + (c.fuera ? 'is-alert' : '') + '"><span>Fuera de radio</span><b>' + miles(c.fuera) + '</b></div>';
    }
    var lg = el('rsm-mapa-leyenda');
    if (lg) {
      var colores = coloresPrestadoras(d);
      var total = d.empresas.reduce(function (s, e) { return s + e.monto; }, 0);
      lg.innerHTML = '<div class="rsm-lg-title">Prestadora</div>' +
        d.empresas.slice(0, MAX_PRESTADORAS).map(function (e) {
          return '<div class="rsm-lg-row"><i style="background:' + colores[String(e.id)] + '"></i>' +
            '<span>' + esc(e.nombre) + '</span><em>' + (total ? pct(e.monto * 100 / total) : GUION) + '</em></div>';
        }).join('') +
        (d.empresas.length > MAX_PRESTADORAS
          ? '<div class="rsm-lg-row"><i style="background:' + COLOR_OTROS + '"></i><span>Otras</span><em></em></div>' : '') +
        '<div class="rsm-lg-row is-base"><i></i><span>Base operativa</span></div>';
      lg.hidden = !d.empresas.length && !d.bases.length;
    }
    var rv = el('rsm-radio-valor');
    if (rv) rv.textContent = estado.radio + ' km';
  }

  function aplicarVisibilidadCapas() {
    if (!mapa || !mapa.getLayer('rsm-radios-fill')) return;
    var vc = estado.circulos ? 'visible' : 'none';
    mapa.setLayoutProperty('rsm-radios-fill', 'visibility', vc);
    mapa.setLayoutProperty('rsm-radios-line', 'visibility', vc);
    mapa.setLayoutProperty('rsm-lineas', 'visibility', estado.lineas ? 'visible' : 'none');
  }

  function actualizarFuentes(d) {
    if (!mapa) return;
    var g = datosMapa(d);
    ['puntos', 'lineas', 'radios', 'sedes'].forEach(function (k) {
      var s = mapa.getSource('rsm-' + k);
      if (s) s.setData(g[k]);
    });
  }

  function encuadrar(d) {
    if (!mapa) return;
    var coords = d.puntos.map(function (p) { return [num(p[0]), num(p[1])]; })
      .concat(d.bases.map(function (b) { return [num(b.lng), num(b.lat)]; }));
    if (!coords.length) return;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    coords.forEach(function (c) {
      minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]);
      minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]);
    });
    if (minX === maxX && minY === maxY) { mapa.jumpTo({ center: [minX, minY], zoom: 10 }); return; }
    mapa.fitBounds([[minX, minY], [maxX, maxY]], { padding: 40, duration: 0, maxZoom: 11 });
  }

  function mensajeMapa(texto, esError) {
    var c = el(ID_MAPA);
    if (!c) return;
    destruirMapa();
    c.innerHTML = '<div class="auxch-overlay ' + (esError ? 'auxch-error' : 'auxch-vacio') + '">' + esc(texto) + '</div>';
  }

  function destruirMapa() {
    if (observador) { observador.disconnect(); observador = null; }
    if (mapa) { mapa.remove(); mapa = null; }
  }

  function pintarMapa(d) {
    pintarLecturaMapa(d);
    var c = el(ID_MAPA);
    if (!c) return;
    if (!d.puntos.length && !d.bases.length) {
      mensajeMapa(d.servicios
        ? 'Los servicios del período no tienen ubicación cargada todavía.'
        : 'Todavía no hay servicios en este período. Acá va a verse dónde trabaja cada prestadora.');
      return;
    }
    return cargarLibreria().then(function () {
      if (!el(ID_MAPA)||estado.res!==d) return;
      if (mapa && mapa.getSource('rsm-puntos')) {
        actualizarFuentes(d);
        encuadrar(d);
        return;
      }
      destruirMapa();
      c.innerHTML = '';
      var g = datosMapa(d);
      mapa = new global.maplibregl.Map({
        container: c, style: ESTILO,
        center: VISTA_INICIAL.center, zoom: VISTA_INICIAL.zoom,
        attributionControl: { compact: true },
        dragRotate: false, pitchWithRotate: false
      });
      mapa.addControl(new global.maplibregl.NavigationControl({ showCompass: false }), 'top-left');
      if (typeof global.ResizeObserver === 'function') {
        observador = new global.ResizeObserver(function () { if (mapa) mapa.resize(); });
        observador.observe(c);
      }
      var ownMap=mapa;
      mapa.on('load', function () {
        if(mapa!==ownMap||!estado.res)return;
        d=estado.res;g=datosMapa(d);
        mapa.addSource('rsm-radios', { type: 'geojson', data: g.radios });
        mapa.addSource('rsm-lineas', { type: 'geojson', data: g.lineas });
        mapa.addSource('rsm-puntos', { type: 'geojson', data: g.puntos });
        mapa.addSource('rsm-sedes', { type: 'geojson', data: g.sedes });
        mapa.addLayer({ id: 'rsm-radios-fill', type: 'fill', source: 'rsm-radios',
          paint: { 'fill-color': '#e8eaf2', 'fill-opacity': 0.06 } });
        mapa.addLayer({ id: 'rsm-radios-line', type: 'line', source: 'rsm-radios',
          paint: { 'line-color': '#e8eaf2', 'line-opacity': 0.45, 'line-width': 1.2, 'line-dasharray': [3, 3] } });
        mapa.addLayer({ id: 'rsm-lineas', type: 'line', source: 'rsm-lineas',
          paint: { 'line-color': ['get', 'color'], 'line-opacity': 0.55, 'line-width': 1.2 } });
        mapa.addLayer({ id: 'rsm-puntos', type: 'circle', source: 'rsm-puntos',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 4, 12, 7],
            'circle-color': ['get', 'color'],
            'circle-stroke-color': '#0c0e12', 'circle-stroke-width': 1.5,
            'circle-opacity': ['case', ['==', ['get', 'dentro'], 1], 0.95, 0.7]
          } });
        mapa.addLayer({ id: 'rsm-sedes', type: 'circle', source: 'rsm-sedes',
          paint: { 'circle-radius': 7, 'circle-color': COLOR_BASE,
                   'circle-stroke-color': '#0c0e12', 'circle-stroke-width': 3 } });
        mapa.addLayer({ id: 'rsm-sedes-nombre', type: 'symbol', source: 'rsm-sedes', minzoom: 7,
          layout: { 'text-field': ['get', 'nombre'], 'text-size': 11, 'text-offset': [0, 1.3],
                    'text-anchor': 'top', 'text-optional': true },
          paint: { 'text-color': '#e8eaf2', 'text-halo-color': '#0c0e12', 'text-halo-width': 2 } });
        aplicarVisibilidadCapas();
        tooltipMapa();
        encuadrar(d);
      });
    }).catch(function (e) { mensajeMapa(e.message || 'No se pudo cargar el mapa', true); });
  }

  function tooltipMapa() {
    var popup = new global.maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'dashx-mapa-popup' });
    mapa.on('mouseenter', 'rsm-puntos', function (e) {
      var f = e.features && e.features[0];
      if (!f) return;
      mapa.getCanvas().style.cursor = 'pointer';
      var km = f.properties.km;
      popup.setLngLat(f.geometry.coordinates)
        .setText(km == null || km === 'null' ? 'Servicio' : miles(km, 1) + ' km a la base más cercana').addTo(mapa);
    });
    mapa.on('mouseleave', 'rsm-puntos', function () { mapa.getCanvas().style.cursor = ''; popup.remove(); });
    mapa.on('mouseenter', 'rsm-sedes', function (e) {
      var f = e.features && e.features[0];
      if (!f) return;
      mapa.getCanvas().style.cursor = 'pointer';
      popup.setLngLat(f.geometry.coordinates).setText(f.properties.nombre).addTo(mapa);
    });
    mapa.on('mouseleave', 'rsm-sedes', function () { mapa.getCanvas().style.cursor = ''; popup.remove(); });
  }

  function montarControlesMapa() {
    var r = el('rsm-radio');
    if (r && r.dataset.listo !== '1') {
      r.dataset.listo = '1';
      r.value = String(estado.radio);
      r.addEventListener('input', function () {
        estado.radio = Math.max(1, Number(r.value) || 20);
        pintarSlider(r);
        if (estado.res) { pintarLecturaMapa(estado.res); actualizarFuentes(estado.res); }
      });
      pintarSlider(r);
    }
    [['rsm-circulos', 'circulos'], ['rsm-lineas', 'lineas']].forEach(function (par) {
      var b = el(par[0]);
      if (!b || b.dataset.listo === '1') return;
      b.dataset.listo = '1';
      b.setAttribute('aria-checked', estado[par[1]] ? 'true' : 'false');
      b.addEventListener('click', function () {
        estado[par[1]] = !estado[par[1]];
        b.setAttribute('aria-checked', estado[par[1]] ? 'true' : 'false');
        aplicarVisibilidadCapas();
      });
    });
  }

  function pintarSlider(r) {
    var min = Number(r.min) || 0, max = Number(r.max) || 100;
    r.style.setProperty('--rsm-fill', ((Number(r.value) - min) * 100 / (max - min)) + '%');
  }

  /* ── composición por tipo ─────────────────────────────────────────────── */

  function pintarTipos(d) {
    var ls=el('rsm-tipos-lista');if(!ls)return;
    var filas=d.porClase.filter(function(k){return k.servicios>0;}).sort(function(a,b){return b.monto-a.monto;});
    var total=filas.reduce(function(sum,k){return sum+k.monto;},0);
    ls.innerHTML=filas.length?filas.map(function(k){var share=total>0?k.monto*100/total:null;return '<div class="rsm-type-row"><div><b>'+esc(k.nombre)+'</b><strong>'+pesos(k.monto)+'</strong></div><div class="rsm-ranking-track" aria-hidden="true"><i style="width:'+Math.max(0,Math.min(100,share||0))+'%"></i></div><small>'+miles(k.servicios)+' servicios · '+miles(k.km)+' km facturados · '+(share===null?'Sin participación calculable':pct(share,1)+' del total')+'</small></div>';}).join(''):'<div class="rsm-vacio">Sin servicios en el período.</div>';
  }

  /* ── evolución de facturado ───────────────────────────────────────────── */

  function etiquetasDias(d, n) {
    var out = [];
    var base = d.desde ? new Date(String(d.desde).slice(0, 10) + 'T12:00:00') : null;
    for (var i = 0; i < n; i++) {
      if (!base) { out.push(String(i + 1)); continue; }
      var x = new Date(base.getTime() + i * 86400000);
      out.push(x.getDate() + '/' + (x.getMonth() + 1));
    }
    return out;
  }

  function ventanaEvol(L, i0, i1) {
    var span = i1 - i0 + 1;
    var cs = L.cs.slice(i0, i1 + 1);
    var conAnio = cs.length && cs[0].ini.getFullYear() !== cs[cs.length - 1].fin.getFullYear();
    var ant = [];
    for (var k = 0; k < span; k++) { var j = i0 + k - span; ant.push(j >= 0 ? L.vals[j] : null); }
    return {
      span: span,
      labels: cs.map(function (c) { return conAnio ? c.et + '/' + String(c.ini.getFullYear()).slice(2) : c.et; }),
      act: L.vals.slice(i0, i1 + 1).map(function (v, k) { return cs[k].a > L.hoy ? null : v; }), ant: ant,
      hayAnt: ant.some(function (v) { return v > 0; })
    };
  }

  function subEvol(w) {
    var sub = el('rsm-evol-sub');
    if (sub) sub.textContent = w.hayAnt ? 'Línea punteada: los ' + w.span + ' días anteriores' : 'Sin facturación en los ' + w.span + ' días anteriores para comparar';
  }

  function alCambiarEvol(i0, i1) {
    var L = evol.linea;
    if (!L) return;
    L.i0 = i0;
    var w = ventanaEvol(L, i0, i1);
    subEvol(w);
    pintarDatosEvol(w.labels,w.act,w.ant);
    if (!chartEvol) return;
    chartEvol.data.labels = w.labels;
    chartEvol.data.datasets[0].data = w.act;
    chartEvol.data.datasets[0].pointRadius = w.span <= 16 ? 3 : 0;
    chartEvol.data.datasets[1].data = w.ant;
    chartEvol.data.datasets[1].hidden = !w.hayAnt;
    chartEvol.update('none');
  }

  function controlEvol() {
    var Z = global.AuxZoom, cv = el('rsm-evol-canvas');
    if (zoomEvol || !Z || !cv) return zoomEvol;
    zoomEvol = Z.crear(cv.closest('.rsm-card') || cv.parentNode.parentNode, {
      canvas: cv,
      grafico: function () { return chartEvol; },
      alCambiar: alCambiarEvol,
      rangos: ['periodo', 'd90', 'd180', 'd365', 'todo'],
      ventanaDeRango: function (id) { return evol.linea ? Z.ventanaRango(id, evol.linea.cs, evol.per, evol.hist) : null; },
      texto: function (i0, i1) { return evol.linea ? Z.textoVentana(evol.linea.cs, i0, i1) : ''; }
    });
    return zoomEvol;
  }

  function pintarEvolucion(d) {
    var Z = global.AuxZoom, h = evol.hist;
    if (!Z || !h || !evol.per) { pintarEvolucionPeriodo(d); return; }
    var cv = el('rsm-evol-canvas');
    if (chartEvol) { chartEvol.destroy(); chartEvol = null; }
    var hoy = Z.diasEntre(h.desde, Z.hoy());
    var cs = Z.cubos(h.desde, h.n, 'dia', hoy);
    var L = { cs: cs, vals: Z.sumar(cs, h.facturado), i0: 0, hoy: hoy };
    evol.linea = L;
    var v = Z.ventanaRango('periodo', cs, evol.per, h);
    v = Z.acotar(v[0], v[1], cs.length, 3);
    L.i0 = v[0];
    var w = ventanaEvol(L, v[0], v[1]);
    subEvol(w);
    pintarDatosEvol(w.labels,w.act,w.ant);
    var ctl = controlEvol();
    if (!cv || typeof global.Chart === 'undefined') { if (ctl) ctl.datos(cs.length, v, L.vals, 3); return; }
    var grad = cv.getContext('2d').createLinearGradient(0, 0, 0, cv.clientHeight || 200);
    grad.addColorStop(0, 'rgba(245,166,35,0.28)');
    grad.addColorStop(1, 'rgba(245,166,35,0)');
    chartEvol = new global.Chart(cv, {
      type: 'line',
      data: {
        labels: w.labels,
        datasets: [{
          label: 'Actual', data: w.act, borderColor: chartColors().accent, backgroundColor: grad,
          fill: true, borderWidth: 2, tension: 0, pointRadius: w.span <= 16 ? 3 : 0, pointHoverRadius: 4
        }, {
          label: 'Anterior', data: w.ant, hidden: !w.hayAnt, borderColor: chartColors().previous,
          borderDash: [4, 4], fill: false, borderWidth: 1.5, tension: 0, pointRadius: 0, pointHoverRadius: 3
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: global.matchMedia?.('(prefers-reduced-motion: reduce)').matches?false:{duration:180},
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            title: function (it) { var c = it.length ? L.cs[L.i0 + it[0].dataIndex] : null; return c ? c.tit : ''; },
            label: function (c) {
              if (c.datasetIndex === 0) return ' Actual: ' + pesos(c.parsed.y);
              var prev = L.cs[L.i0 + c.dataIndex - c.chart.data.labels.length];
              return ' Anterior' + (prev ? ' (' + prev.et + ')' : '') + ': ' + pesos(c.parsed.y);
            } } }
        },
        scales: {
          x: { grid: { display: false }, border: { display: false },
               ticks: { color: '#8590ab', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
          y: { beginAtZero: true, border: { display: false },
               grid: { color: chartColors().grid, borderDash: [3, 3] },
               ticks: { color: '#8590ab', font: { size: 10 }, maxTicksLimit: 5,
                        callback: function (v) { return pesosCorto(v).replace('$', '$ '); } } }
        }
      }
    });
    if (ctl) ctl.datos(cs.length, v, L.vals, 3);
  }

  /* Sin el control de zoom: sólo el período y su anterior, como antes. */
  function pintarEvolucionPeriodo(d) {
    var cv = el('rsm-evol-canvas');
    if (chartEvol) { chartEvol.destroy(); chartEvol = null; }
    var act = d.porDia.actual, ant = d.porDia.anterior;
    pintarDatosEvol(etiquetasDias(d,Math.max(act.length,ant.length)),act,ant);
    if (!cv || typeof global.Chart === 'undefined') return;
    var n = Math.max(act.length, ant.length);
    var hayAnt = ant.some(function (v) { return v > 0; });
    var ctx = cv.getContext('2d');
    var grad = ctx.createLinearGradient(0, 0, 0, cv.clientHeight || 200);
    grad.addColorStop(0, 'rgba(245,166,35,0.28)');
    grad.addColorStop(1, 'rgba(245,166,35,0)');
    var series = [{
      label: 'Período actual', data: act, borderColor: chartColors().accent, backgroundColor: grad,
      fill: true, borderWidth: 2, tension: 0, pointRadius: 0, pointHoverRadius: 4
    }];
    if (hayAnt) series.push({
      label: 'Período anterior', data: ant, borderColor: chartColors().previous,
      borderDash: [4, 4], fill: false, borderWidth: 1.5, tension: 0, pointRadius: 0, pointHoverRadius: 3
    });
    chartEvol = new global.Chart(cv, {
      type: 'line',
      data: { labels: etiquetasDias(d, n), datasets: series },
      options: {
        responsive: true, maintainAspectRatio: false, animation: global.matchMedia?.('(prefers-reduced-motion: reduce)').matches?false:{duration:180},
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + pesos(c.parsed.y); } } }
        },
        scales: {
          x: { grid: { display: false }, border: { display: false },
               ticks: { color: '#8590ab', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 16 } },
          y: { beginAtZero: true, border: { display: false },
               grid: { color: chartColors().grid, borderDash: [3, 3] },
               ticks: { color: '#8590ab', font: { size: 10 }, maxTicksLimit: 5,
                        callback: function (v) { return pesosCorto(v).replace('$', '$ '); } } }
        }
      }
    });
    var sub = el('rsm-evol-sub');
    if (sub) sub.textContent = hayAnt ? 'Línea punteada: período anterior' : 'Sin facturación en el período anterior para comparar';
  }

  /* ── eficiencia operativa ─────────────────────────────────────────────── */

  /* Km de la flota según el odómetro (km final − inicial de las jornadas
     cerradas). Es de toda la flota: no se puede separar por prestadora. */
  function normalizarFlota(x, filtrado) {
    if (!x || typeof x !== 'object') return null;
    var a = x.actual || {}, r = x.remitos || {};
    var firmados = num(r.firmados), conServicio = num(r.con_servicio);
    return { km: num(a.km), jornadas: num(a.jornadas), sinDato: num(a.sin_dato), moviles: num(a.moviles),
             firmados: firmados, conServicio: conServicio, filtrado: filtrado,
             /* El odómetro cuenta todo el trabajo; los servicios, sólo lo cargado en Servicios.
                Se comparan recién cuando casi todos los remitos del período son servicios. */
             completo: firmados === 0 || conServicio >= firmados * COBERTURA_MIN };
  }

  /* Comparaciones contra el odómetro: null si hoy no serían reales. */
  function flotaComparable(fl) { return !!(fl && !fl.filtrado && fl.completo && fl.km > 0); }

  function motivoSinFlota(fl) {
    if (!fl) return 'sin datos de las jornadas';
    if (fl.filtrado) return 'quitá los filtros: el odómetro es de toda la flota';
    if (!fl.completo) return 'falta cargar trabajo: ' + miles(fl.conServicio) + ' de ' + miles(fl.firmados) + ' remitos son servicios';
    return 'sin km en el odómetro';
  }

  /* Eficiencia de km: diferencia sobre los km facturados. 100 facturados y
     80 recorridos = 20%. No es rentabilidad monetaria. */
  function rendimientoFlota(t, fl) { return flotaComparable(fl) && t.km > 0 ? (t.km - fl.km) * 100 / t.km : null; }

  function pintarEficiencia(d) {
    var n = el('rsm-eficiencia');
    if (!n) return;
    if (global.AuxEfficiencyLoader) global.AuxEfficiencyLoader.render(n, d.eficiencia || null,
      d.eficiencia ? undefined : 'No se pudieron consultar los kilometrajes. Actualizá el Resumen para reintentar.');
  }

  /* ── prestadoras y sus bases ──────────────────────────────────────────── */

  /* Km facturados sobre km reales del mismo subconjunto (los servicios que
     tienen km real). Por encima de 100% se cobra más de lo que se recorre. */
  function ratio(f) { return f.kmReal > 0 ? f.kmComp * 100 / f.kmReal : null; }

  function claseRatio(v) {
    if (v == null) return '';
    if (v >= 115) return 'is-good';
    if (v >= 100) return 'is-warn';
    return 'is-bad';
  }

  function celdasFila(f) {
    var rt = ratio(f);
    return '<td class="rsm-num">' + pesos(f.monto) + '</td>' +
      '<td class="rsm-num">' + miles(f.servicios) + '</td>' +
      '<td class="rsm-num">' + (f.kmReal > 0 ? miles(f.kmReal) + ' km' : GUION) + '</td>' +
      '<td class="rsm-num">' + (f.servicios ? pesos(f.monto / f.servicios) : GUION) + '</td>' +
      '<td class="rsm-num rsm-muted">' + (f.servicios && f.kmReal > 0 ? miles(f.kmReal / f.servicios) : GUION) + '</td>' +
      '<td class="rsm-num rsm-ratio ' + claseRatio(rt) + '">' + (rt == null ? GUION : pct(rt, 1)) + '</td>';
  }

  function pintarTabla(d) {
    var n = el(ID_TABLA);
    if (!n) return;
    if (!d.hayDatos || !d.empresas.length) {
      n.innerHTML = '<div class="rsm-vacio">Todavía no hay servicios en este período. Acá va a verse cada prestadora con sus bases.</div>';
      return;
    }
    var colores = coloresPrestadoras(d);
    var total = d.empresas.reduce(function (s, e) { return s + e.monto; }, 0);
    var tot = d.empresas.reduce(function (s, e) {
      s.monto += e.monto; s.servicios += e.servicios; s.kmReal += e.kmReal; s.kmComp += e.kmComp;
      return s;
    }, { monto: 0, servicios: 0, kmReal: 0, kmComp: 0 });

    var filas = d.empresas.map(function (e, i) {
      var color = colores[String(e.id)];
      var part = total ? e.monto * 100 / total : 0;
      var abre = e.bases.length > 0;
      var ref = 'rsm-emp-' + i;
      var html = '<tr class="rsm-emp' + (abre ? ' is-abre' : '') + '"' + (abre ? ' data-ref="' + ref + '" tabindex="0" aria-expanded="false"' : '') + '>' +
        '<td><span class="rsm-emp-nombre"><i style="background:' + color + '"></i><b>' + esc(e.nombre) + '</b>' +
          (abre ? '<span class="rsm-caret" aria-hidden="true">▸</span>' : '') + '</span></td>' +
        '<td><span class="rsm-part"><span class="rsm-part-track"><i style="width:' + part.toFixed(1) + '%;background:' + color + '"></i></span>' +
          '<em>' + pct(part, 1) + '</em></span></td>' +
        celdasFila(e) + '</tr>';
      html += e.bases.map(function (b) {
        var pb = total ? b.monto * 100 / total : 0;
        return '<tr class="rsm-base" data-padre="' + ref + '" hidden>' +
          '<td class="rsm-sangria">' + esc(b.nombre) + '</td>' +
          '<td><span class="rsm-part"><em>' + pct(pb, 1) + '</em></span></td>' + celdasFila(b) + '</tr>';
      }).join('');
      return html;
    }).join('');

    var rtTot = ratio(tot);
    n.innerHTML = '<div class="rsm-tabla-wrap"><table class="rsm-tabla">' +
      '<thead><tr><th>Prestadora</th><th>Participación</th><th class="rsm-num">Facturado</th>' +
      '<th class="rsm-num">Servicios</th><th class="rsm-num">Km reales</th><th class="rsm-num">$/servicio</th>' +
      '<th class="rsm-num">Km/serv.</th><th class="rsm-num">Ratio f/r</th></tr></thead>' +
      '<tbody>' + filas + '</tbody>' +
      '<tfoot><tr><td><b>Total</b></td><td class="rsm-muted">' + d.empresas.length +
        (d.empresas.length === 1 ? ' prestadora activa' : ' prestadoras activas') + '</td>' +
        '<td class="rsm-num"><b>' + pesos(tot.monto) + '</b></td>' +
        '<td class="rsm-num"><b>' + miles(tot.servicios) + '</b></td>' +
        '<td class="rsm-num"><b>' + (tot.kmReal > 0 ? miles(tot.kmReal) + ' km' : GUION) + '</b></td>' +
        '<td class="rsm-num"><b>' + (tot.servicios ? pesos(tot.monto / tot.servicios) : GUION) + '</b></td>' +
        '<td class="rsm-num rsm-muted">' + (tot.servicios && tot.kmReal > 0 ? miles(tot.kmReal / tot.servicios) : GUION) + '</td>' +
        '<td class="rsm-num rsm-ratio ' + claseRatio(rtTot) + '"><b>' + (rtTot == null ? GUION : pct(rtTot, 1)) + '</b></td>' +
      '</tr></tfoot></table></div>' +
      '<p class="rsm-nota">Ratio f/r = km facturados sobre km reales recorridos, en los servicios que tienen km real. ' +
      'Por encima de 100% se cobra más de lo que se recorre; cuanto más bajo, más ajustado. Tocá una prestadora para ver sus bases.</p>';
  }

  function engancharTabla() {
    var n = el(ID_TABLA);
    if (!n || n.dataset.enganchado === '1') return;
    n.dataset.enganchado = '1';
    function alternar(tr) {
      var ref = tr.getAttribute('data-ref');
      var abierto = tr.getAttribute('aria-expanded') === 'true';
      tr.setAttribute('aria-expanded', abierto ? 'false' : 'true');
      n.querySelectorAll('tr[data-padre="' + ref + '"]').forEach(function (h) { h.hidden = abierto; });
    }
    n.addEventListener('click', function (ev) {
      var tr = ev.target.closest('tr.rsm-emp.is-abre');
      if (tr) alternar(tr);
    });
    n.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var tr = ev.target.closest('tr.rsm-emp.is-abre');
      if (tr) { ev.preventDefault(); alternar(tr); }
    });
  }

  /* ── carga ────────────────────────────────────────────────────────────── */

  function paramArray(v) { var a = lista(v).filter(Boolean); return a.length ? a : null; }

  async function rpc(nombre, args) {
    var db = (typeof _db !== 'undefined') ? _db : null;
    if (!db || typeof db.rpc !== 'function') throw new Error('Sin conexión con la base de datos');
    var res = await db.rpc(nombre, args);
    if (res && res.error) throw res.error;
    return res ? res.data : null;
  }

  function mensajeError(e) {
    var codigo = e && e.code ? String(e.code) : '';
    var texto = e && e.message ? String(e.message) : '';
    if (codigo === 'PGRST202' || /Could not find the function/i.test(texto)) {
      return 'Las métricas del resumen todavía no están disponibles en la base.';
    }
    if (/Sin permiso/i.test(texto)) return 'No tenés permiso para ver el resumen.';
    if (/Período inválido/i.test(texto)) return 'El período seleccionado es inválido.';
    return 'No se pudo cargar el resumen.';
  }

  function pintar(d) {
    pintarKpis(d);
    pintarRanking(d);
    if(el('rsm-geography')?.open) pintarMapa(d);
    pintarTipos(d);
    pintarEvolucion(d);
    pintarEficiencia(d);
    pintarTabla(d);
  }

  var eficienciaRequest = 0;
  async function cargar(filtros) {
    var request = ++eficienciaRequest;
    var f = filtros || {};
    estado.filtros = f;
    if (global.AuxEfficiencyLoader) global.AuxEfficiencyLoader.render(el('rsm-eficiencia'), null);
    pintarRango(f);
    var base = {
      p_desde: f.desde || null, p_hasta: f.hasta || null,
      p_empresas: paramArray(f.empresas), p_bases: paramArray(f.bases)
    };
    var Z = global.AuxZoom;
    var r = await Promise.all([
      rpc(RPC_FACT, Object.assign({ p_conceptos: paramArray(f.conceptos) }, base)),
      rpc(RPC_RES, base),
      Z ? Z.historia(f) : null,
      rpc('dashboard_efficiency_v1', Object.assign({ p_conceptos: paramArray(f.conceptos) }, base)).catch(function () { return null; })
    ]);
    if (request !== eficienciaRequest) return;
    var d = normalizar(r[0], r[1]);
    d.eficiencia = r[3];
    evol.hist = Z && d.desde ? (r[2] || Z.historiaDePeriodo(d.desde, { facturado: d.porDia.anterior }, { facturado: d.porDia.actual })) : null;
    evol.per = evol.hist ? [Z.diasEntre(evol.hist.desde, d.desde), Z.diasEntre(evol.hist.desde, d.hasta || d.desde)] : null;
    estado.res = d;
    pintarFiltros(d, f);
    pintar(d);
  }

  function alError(_c, e) {
    estado.res=null;destruirMapa();
    if(el('rsm-mapa-stats'))el('rsm-mapa-stats').innerHTML='';
    if(el('rsm-mapa-leyenda'))el('rsm-mapa-leyenda').hidden=true;
    var msg = mensajeError(e);
    pintarRanking(normalizar(null,null));pintarTipos(normalizar(null,null));
    if(chartEvol){chartEvol.destroy();chartEvol=null;}
    if(zoomEvol)zoomEvol.datos(0,[0,-1],[],3);
    evol.hist=null;evol.linea=null;evol.per=null;
    pintarDatosEvol([],[],[]);
    if(el('rsm-evol-sub'))el('rsm-evol-sub').textContent=msg;
    if (global.AuxEfficiencyLoader) global.AuxEfficiencyLoader.render(el('rsm-eficiencia'), null, msg);
    var k = el(ID_KPIS);
    if (k) {
      pintarKpis(normalizar(null, null));
      if(el('rsm-data-context'))el('rsm-data-context').textContent='Datos no disponibles. Actualizá el Resumen para reintentar.';
      k.insertAdjacentHTML('beforeend', '<div class="rsm-error" role="alert">' + esc(msg) + '</div>');
    }
    mensajeMapa(msg, true);
    var t = el(ID_TABLA);
    if (t) t.innerHTML = '<div class="rsm-vacio is-error">' + esc(msg) + '</div>';
  }

  function montar() {
    montarFiltros();
    montarControlesMapa();
    var geo=el('rsm-geography');if(geo&&!geo.dataset.bound){geo.dataset.bound='1';geo.addEventListener('toggle',function(){if(geo.open&&estado.res){pintarMapa(estado.res);if(mapa)mapa.resize();}});}
    var providers=el('rsm-open-providers');if(providers&&!providers.dataset.bound){providers.dataset.bound='1';providers.addEventListener('click',function(){var detail=el('rsm-provider-detail');if(detail){detail.open=true;detail.querySelector('summary')?.focus();detail.scrollIntoView({block:'start',behavior:global.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}});}

    engancharTabla();
    pintarKpis(normalizar(null, null));
  }

  function registrar() {
    if (!global.AuxDash) return false;
    global.AuxDash.registrarSeccion({
      id: 'facturacion',
      filtros: ID_FILT,
      montar: montar,
      cargar: cargar,
      alError: alError
    });
    return true;
  }

  if(global.MutationObserver&&document.documentElement)new global.MutationObserver(applyChartTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});

  if (!registrar()) document.addEventListener('DOMContentLoaded', registrar, { once: true });

  global.AuxDashResumen = {
    normalizar: normalizar,
    rankingRows: rankingRows,
    cobertura: function (d, radio) {
      var prev = estado.radio;
      if (radio != null) estado.radio = radio;
      var c = cobertura(d);
      estado.radio = prev;
      return c;
    },
    ratio: ratio,
    realesSobreFacturados: realesSobreFacturados,
    rendimientoFlota: rendimientoFlota,
    normalizarFlota: normalizarFlota
  };
})(window);

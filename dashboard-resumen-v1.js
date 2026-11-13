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

  /* Mapa de Google Maps (mismo SDK y clave de navegador que el mapa de Operaciones). */
  var VISTA_INICIAL = { center: { lat: -34.7, lng: -58.4 }, zoom: 8 };

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
    filtros: null,
    rankSel: null,
    evolVista: 'diario'
  };

  var mapa = null;
  var observador = null;
  var cargandoLib = null;
  var sedesMarcas = [];
  var infoMapa = null;
  var chartEvol = null;
  var chartRank = null;
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
    var pal = ['#7c8cff', '#ff8a5b', '#3ddc97', '#ffc85c', '#f472b6', '#38bdf8', '#a3e635'];
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

  /* KPI compacto: etiqueta arriba, valor y variación en la misma línea; la aclaración queda como tooltip. */
  function tile(label, valor, deltaHtml, pie, destacado) {
    return '<div class="rsm-kpi' + (destacado ? ' is-main' : '') + '" title="' + esc(String(pie || '').replace(/<[^>]+>/g, '')) + '">' +
      '<div class="rsm-kpi-label">' + esc(label) + '</div>' +
      '<div class="rsm-kpi-row"><div class="rsm-kpi-value">' + valor + '</div>' +
      (deltaHtml ? '<div class="rsm-kpi-delta">' + deltaHtml + '</div>' : '') + '</div>' +
      '<div class="rsm-kpi-foot">' + pie + '</div>' +
      '</div>';
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
      tile('Ticket promedio',has&&t.servicios>0?pesos(t.facturado/t.servicios):GUION,has&&t.servicios>0&&a.servicios>0?neutralDelta(t.facturado/t.servicios,a.facturado/a.servicios,r):'','Facturado por servicio')+
      tile('Peajes',has?pesos(t.peajes):GUION,has?neutralDelta(t.peajes,a.peajes,r):'','Peajes de los servicios del período');
    var secondary=el('rsm-secondary');
    if(secondary) secondary.innerHTML='';
    var context=el('rsm-period-context');if(context)n.title=context.textContent=(d.desde&&d.hasta?'Período: '+fecha(d.desde)+' al '+fecha(d.hasta):'Resumen del período')+(r?' · Comparación: '+r:' · Sin período anterior informado');
    var quality=el('rsm-data-context');if(quality)quality.textContent=has?'':'No hay servicios finalizados para los filtros seleccionados.';
  }

  function rankingRows(d){
    var all=d.empresas.slice().sort(function(a,b){return b.monto-a.monto||a.nombre.localeCompare(b.nombre);});
    var corte=all.length===6?6:5,rows=all.slice(0,corte).map(function(e){return {id:e.id,nombre:e.nombre,monto:e.monto,servicios:e.servicios};});
    if(all.length>corte)rows.push({id:null,nombre:'Otras '+(all.length-corte)+' prestadoras',monto:all.slice(corte).reduce(function(n,e){return n+e.monto;},0),servicios:all.slice(corte).reduce(function(n,e){return n+e.servicios;},0)});
    var total=all.reduce(function(n,e){return n+e.monto;},0);
    return rows.map(function(e){return Object.assign(e,{share:total>0?e.monto*100/total:null});});
  }
  /* Torta de participación (donut con etiquetas y guías, dibujado con d3-shape). Tocar una prestadora —en la
     torta o en la lista— la ilumina y el centro muestra su importe; tocarla de nuevo vuelve al total.
     Con lugar (≥ 430 px) van las etiquetas afuera; desde 720 px la lista va al costado; si no, gráfico arriba y lista abajo. */
  var D3_SHAPE = '/vendor/d3-shape-3.2.1.min.js';
  var cargandoD3 = null, rankObs = null, rankAncho = 0, rankDatos = null;
  function cargarD3() {
    if (global.d3 && global.d3.arc && global.d3.pie) return Promise.resolve(global.d3);
    if (!cargandoD3) cargandoD3 = (typeof global.loadAuxiliosModule === 'function'
        ? global.loadAuxiliosModule('d3-shape-js', D3_SHAPE) : Promise.reject(new Error('sin cargador')))
      .then(function () { return global.d3; }).catch(function (e) { cargandoD3 = null; throw e; });
    return cargandoD3;
  }
  function svgTorta(rows, colores, total, servicios, sel, ancho) {
    var d3 = global.d3, conEtiquetas = ancho >= 430, W = conEtiquetas ? 430 : Math.max(220, Math.min(ancho, 340)), H = conEtiquetas ? 290 : 250;
    var R = Math.min(W, H) / 2 - (conEtiquetas ? 40 : 14), uid = 'rsmp';
    var pie = d3.pie().sort(null).value(function (e) { return e.monto; }).padAngle(.022)(rows);
    var arc = d3.arc().innerRadius(R * .64).outerRadius(R).cornerRadius(7), arcA = d3.arc().innerRadius(R * .62).outerRadius(R + 9).cornerRadius(8);
    var defs = '<defs>' + rows.map(function (e, i) {
      var base = colores[i];
      return '<linearGradient id="' + uid + 'g' + i + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + base + '" stop-opacity="1"/><stop offset="1" stop-color="' + base + '" stop-opacity=".72"/></linearGradient>';
    }).join('') + '<filter id="' + uid + 'glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
    var hay = sel != null;
    var porciones = pie.map(function (p, i) {
      var on = sel === i;
      return '<path class="rsm-pie-slice" data-i="' + i + '" d="' + (on ? arcA(p) : arc(p)) + '" fill="url(#' + uid + 'g' + i + ')"' + (on ? ' filter="url(#' + uid + 'glow)"' : '') +
        ' style="opacity:' + (hay && !on ? .28 : 1) + '"><title>' + esc(rows[i].nombre) + ': ' + esc(pesos(rows[i].monto)) + '</title></path>';
    }).join('');
    var etiquetas = '';
    if (conEtiquetas) {
      var o = d3.arc().innerRadius(R + 6).outerRadius(R + 6);
      etiquetas = pie.filter(function (p) { return p.endAngle - p.startAngle > .22; }).map(function (p) {
        var i = p.index, a = o.centroid(p), m = (p.startAngle + p.endAngle) / 2, s = m < Math.PI ? 1 : -1, bx = a[0] * 1.18, by = a[1] * 1.18;
        var share = rows[i].share == null ? '' : ' · ' + Math.round(rows[i].share) + '%';
        return '<g style="opacity:' + (hay && sel !== i ? .25 : 1) + '"><polyline fill="none" stroke="' + colores[i] + '" stroke-width="1.2" opacity=".8" points="' + a.join(',') + ' ' + bx + ',' + by + ' ' + (bx + s * 14) + ',' + by + '"/>' +
          '<text x="' + (bx + s * 18) + '" y="' + (by + 4) + '" text-anchor="' + (s > 0 ? 'start' : 'end') + '" class="rsm-pie-lbl">' + esc(String(rows[i].nombre).split(' ')[0] + share) + '</text></g>';
      }).join('');
    }
    var e = hay ? rows[sel] : null;
    var centro = '<g text-anchor="middle">' +
      '<text y="-12" class="rsm-pie-c1"' + (e ? ' style="fill:' + colores[sel] + ';font-weight:600"' : '') + '>' + esc(e ? e.nombre : 'Total facturado') + '</text>' +
      '<text y="12" class="rsm-pie-c2" style="font-size:' + (R > 100 ? 19 : 17) + 'px">' + esc(pesos(e ? e.monto : total)) + '</text>' +
      '<text y="31" class="rsm-pie-c3">' + esc(e ? (e.share == null ? '' : pct(e.share, 1) + ' del total') : miles(servicios) + ' servicios') + '</text></g>';
    return '<svg class="rsm-pie-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Participación de cada prestadora en la facturación del período">' + defs +
      '<g transform="translate(' + W / 2 + ',' + H / 2 + ')"><circle r="' + (R + 15) + '" fill="none" class="rsm-pie-track"/>' + porciones + etiquetas + centro + '</g></svg>';
  }
  function pintarRanking(d){
    var n=el('rsm-ranking');if(!n)return;rankDatos=d;
    if(chartRank){chartRank.destroy();chartRank=null;}
    var rows=rankingRows(d);
    if(!d.hayDatos||!rows.length){n.innerHTML='<p class="rsm-vacio">Sin facturación para comparar prestadoras.</p>';return;}
    var mapa=coloresPrestadoras(d),colores=rows.map(function(e){return e.id==null?COLOR_OTROS:(mapa[String(e.id)]||COLOR_OTROS);});
    var total=rows.reduce(function(s,e){return s+e.monto;},0),servicios=rows.reduce(function(s,e){return s+e.servicios;},0);
    var sel=estado.rankSel==null?-1:rows.findIndex(function(e){return e.nombre===estado.rankSel;});if(sel<0)sel=null;
    var leyenda='<ol class="rsm-pie-legend">'+rows.map(function(e,i){var on=sel===i,dim=sel!=null&&!on;return '<li role="button" tabindex="0" data-i="'+i+'" aria-pressed="'+on+'" class="'+(on?'is-on':'')+(dim?' is-dim':'')+'" style="--c:'+colores[i]+'"><i aria-hidden="true"></i><span><b>'+esc(e.nombre)+'</b><small>'+miles(e.servicios)+' servicios</small></span><strong>'+pesos(e.monto)+'<em>'+(e.share===null?GUION:pct(e.share,1))+'</em></strong></li>';}).join('')+'</ol>';
    var ancho=n.clientWidth||0;rankAncho=ancho;
    var dibujar=function(){n.innerHTML='<div class="rsm-pie'+(ancho>=720?' is-wide':'')+'"><div class="rsm-pie-chart">'+(global.d3&&global.d3.arc?svgTorta(rows,colores,total,servicios,sel,ancho>=720?430:(ancho||340)):'')+'</div>'+leyenda+'</div>';};
    dibujar();
    if(!(global.d3&&global.d3.arc))cargarD3().then(function(){if(estado.res===d)pintarRanking(d);}).catch(function(){});
    if(!n.dataset.pieBound){n.dataset.pieBound='1';
      var elegir=function(i,teclado){if(!rankDatos)return;var rs=rankingRows(rankDatos),nom=rs[i]&&rs[i].nombre;estado.rankSel=estado.rankSel===nom?null:nom;pintarRanking(rankDatos);if(teclado){var b=n.querySelector('li[data-i="'+i+'"]');if(b)b.focus({preventScroll:true});}};
      n.addEventListener('click',function(ev){var t=ev.target.closest&&ev.target.closest('[data-i]');if(t)elegir(Number(t.getAttribute('data-i')));});
      n.addEventListener('keydown',function(ev){if(ev.key!=='Enter'&&ev.key!==' ')return;var t=ev.target.closest&&ev.target.closest('li[data-i]');if(t){ev.preventDefault();elegir(Number(t.getAttribute('data-i')),true);}});
      if(typeof global.ResizeObserver==='function'){rankObs=new global.ResizeObserver(function(){var w=n.clientWidth||0;if(Math.abs(w-rankAncho)>24&&rankDatos)pintarRanking(rankDatos);});rankObs.observe(n);}
    }
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
    if (global.google && global.google.maps && global.google.maps.Map && global.ServiceRouteMap) return Promise.resolve(global.google.maps);
    if (cargandoLib) return cargandoLib;
    var modulo = global.ServiceRouteMap ? Promise.resolve()
      : (typeof global.loadAuxiliosModule === 'function'
          ? global.loadAuxiliosModule('service-route-map-js', '/service-route-map.js')
          : Promise.reject(new Error('No se pudo cargar el mapa')));
    cargandoLib = modulo.then(function () { return global.ServiceRouteMap.loadSdk(); })
      .catch(function (e) { cargandoLib = null; throw e; });
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
        properties: { kind: 'punto', color: color, km: km, dentro: km != null && km <= estado.radio ? 1 : 0 } });
      var b = basePorId[String(p[3])];
      if (b) lineas.push({ type: 'Feature', properties: { kind: 'linea', color: color },
        geometry: { type: 'LineString', coordinates: [[num(b.lng), num(b.lat)], [lng, lat]] } });
    });
    var radios = d.bases.map(function (b) {
      return { type: 'Feature', properties: { kind: 'radio' },
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

  /* Capas de datos de Google: puntos, líneas y radios salen del mismo GeoJSON; el estilo decide qué se ve. */
  function estiloCapa(f) {
    var maps = global.google.maps, k = f.getProperty('kind');
    if (k === 'radio') {
      return { visible: !!estado.circulos, clickable: false, fillColor: '#e8eaf2', fillOpacity: 0.07,
               strokeColor: '#e8eaf2', strokeOpacity: 0.55, strokeWeight: 1.2, zIndex: 1 };
    }
    if (k === 'linea') {
      return { visible: !!estado.lineas, clickable: false, strokeColor: f.getProperty('color'), strokeOpacity: 0.6, strokeWeight: 1.4, zIndex: 2 };
    }
    var dentro = f.getProperty('dentro') === 1;
    return { clickable: true, zIndex: 3,
      icon: { path: maps.SymbolPath.CIRCLE, scale: 5.5, fillColor: f.getProperty('color'), fillOpacity: dentro ? 0.95 : 0.65,
              strokeColor: '#0c0e12', strokeWeight: 1.5 } };
  }

  function aplicarVisibilidadCapas() {
    if (!mapa) return;
    mapa.data.setStyle(estiloCapa);
  }

  function pintarSedes(d) {
    var maps = global.google.maps;
    sedesMarcas.forEach(function (m) { m.setMap(null); });
    sedesMarcas = d.bases.map(function (b) {
      return new maps.Marker({
        map: mapa, position: { lat: num(b.lat), lng: num(b.lng) }, zIndex: 10, title: String(b.nombre || 'Base'),
        icon: { path: maps.SymbolPath.CIRCLE, scale: 8, fillColor: COLOR_BASE, fillOpacity: 1, strokeColor: '#0c0e12', strokeWeight: 3 },
        label: { text: String(b.nombre || 'Base'), color: '#e8eaf2', fontSize: '11px', fontWeight: '600', className: 'rsm-sede-label' }
      });
    });
  }

  function actualizarFuentes(d) {
    if (!mapa) return;
    var g = datosMapa(d);
    mapa.data.forEach(function (f) { mapa.data.remove(f); });
    ['radios', 'lineas', 'puntos'].forEach(function (k) { mapa.data.addGeoJson(g[k]); });
    pintarSedes(d);
    aplicarVisibilidadCapas();
  }

  function encuadrar(d) {
    if (!mapa) return;
    var maps = global.google.maps, c = el(ID_MAPA);
    if (c && (!c.clientWidth || !c.clientHeight)) return;      /* pestaña oculta: se reencuadra al mostrarse */
    var pts = d.puntos.map(function (p) { return { lat: num(p[1]), lng: num(p[0]) }; })
      .concat(d.bases.map(function (b) { return { lat: num(b.lat), lng: num(b.lng) }; }));
    if (!pts.length) return;
    var bounds = new maps.LatLngBounds();
    pts.forEach(function (p) { bounds.extend(p); });
    if (bounds.getNorthEast().equals(bounds.getSouthWest())) { mapa.setCenter(pts[0]); mapa.setZoom(11); return; }
    mapa.fitBounds(bounds, 48);
    maps.event.addListenerOnce(mapa, 'idle', function () { if (mapa && mapa.getZoom() > 12) mapa.setZoom(12); });
  }

  function mensajeMapa(texto, esError) {
    var c = el(ID_MAPA);
    if (!c) return;
    destruirMapa();
    c.innerHTML = '<div class="auxch-overlay ' + (esError ? 'auxch-error' : 'auxch-vacio') + '">' + esc(texto) + '</div>';
  }

  function destruirMapa() {
    if (observador) { observador.disconnect(); observador = null; }
    sedesMarcas.forEach(function (m) { m.setMap(null); });
    sedesMarcas = [];
    if (infoMapa) { infoMapa.close(); infoMapa = null; }
    mapa = null;                                                /* Google no tiene remove(): se descarta el contenedor */
    var c = el(ID_MAPA);
    if (c) c.innerHTML = '';
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
    return cargarLibreria().then(function (maps) {
      if (!el(ID_MAPA) || estado.res !== d) return;
      if (mapa) { actualizarFuentes(d); encuadrar(d); return; }
      destruirMapa();
      mapa = new maps.Map(c, {
        center: VISTA_INICIAL.center, zoom: VISTA_INICIAL.zoom, mapTypeId: 'roadmap',
        styles: global.ServiceRouteMap.mapStyle(), gestureHandling: 'cooperative',
        mapTypeControl: false, streetViewControl: false, fullscreenControl: true, clickableIcons: false,
        zoomControlOptions: { position: maps.ControlPosition.RIGHT_TOP }
      });
      var propio = mapa;
      actualizarFuentes(d);
      tooltipMapa();
      /* En la pestaña oculta el contenedor mide 0: al mostrarse se redibuja y se reencuadra. */
      if (typeof global.ResizeObserver === 'function') {
        observador = new global.ResizeObserver(function () {
          if (mapa !== propio || !c.clientWidth) return;
          maps.event.trigger(propio, 'resize');
          if (estado.res) encuadrar(estado.res);
        });
        observador.observe(c);
      }
      encuadrar(d);
    }).catch(function (e) { mensajeMapa(e.message || 'No se pudo cargar el mapa', true); });
  }

  function tooltipMapa() {
    var maps = global.google.maps;
    infoMapa = new maps.InfoWindow({ disableAutoPan: true });
    mapa.data.addListener('mouseover', function (e) {
      var km = e.feature.getProperty('km');
      if (e.feature.getProperty('kind') !== 'punto') return;
      infoMapa.setContent('<div class="rsm-mapa-popup">' + (km == null ? 'Servicio' : miles(km, 1) + ' km a la base más cercana') + '</div>');
      infoMapa.setPosition(e.latLng);
      infoMapa.open(mapa);
    });
    mapa.data.addListener('mouseout', function () { if (infoMapa) infoMapa.close(); });
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

  var PLURAL_CLASE = { light: 'livianos', semi_heavy: 'semipesados', heavy: 'pesados', uml: 'UML', otros: 'otros' };

  /* Cuánto del dinero y cuánto del trabajo se lleva cada tipo: dos barras en
     la misma escala, el % facturado arriba (color del tipo) y el % de
     servicios abajo (gris). Al lado, lo que deja cada servicio. */
  function filasTipos(d) {
    var filas = d.porClase.filter(function (k) { return k.servicios > 0; })
      .sort(function (a, b) { return b.monto - a.monto; });
    var tm = filas.reduce(function (s, k) { return s + k.monto; }, 0);
    var ts = filas.reduce(function (s, k) { return s + k.servicios; }, 0);
    filas = filas.map(function (k) {
      return { clase: k.clase, nombre: k.nombre, color: k.color, monto: k.monto, servicios: k.servicios,
               pm: tm > 0 ? k.monto * 100 / tm : 0, ps: ts > 0 ? k.servicios * 100 / ts : 0,
               porServ: k.servicios > 0 ? k.monto / k.servicios : 0 };
    });
    return { filas: filas, tm: tm, ts: ts };
  }

  /* Una frase sólo si un tipo rinde claramente más que su peso en servicios. */
  function lecturaTipos(t) {
    if (t.filas.length < 2 || t.tm <= 0) return '';
    var mejor = null;
    t.filas.forEach(function (k) {
      if (k.servicios < 3 || k.pm - k.ps < 3) return;
      if (!mejor || k.pm / k.ps > mejor.pm / mejor.ps) mejor = k;
    });
    if (!mejor) return '';
    var n = PLURAL_CLASE[mejor.clase] || String(mejor.nombre).toLowerCase();
    return 'Los <b>' + esc(n) + '</b> son el ' + pct(mejor.ps) + ' de los servicios pero dejan el <b>' + pct(mejor.pm) + '</b> de lo facturado.';
  }

  function pintarTipos(d) {
    var ls = el('rsm-tipos-lista'); if (!ls) return;
    var t = filasTipos(d);
    if (!t.filas.length) { ls.innerHTML = '<div class="rsm-vacio">Sin servicios en el período.</div>'; return; }
    var mx = Math.max.apply(null, t.filas.map(function (k) { return Math.max(k.pm, k.ps); })) || 1;
    var ancho = function (v) { return Math.max(v > 0 ? 1.5 : 0, Math.min(100, v * 100 / mx)).toFixed(1) + '%'; };
    var lect = lecturaTipos(t);
    ls.innerHTML =
      '<div class="rsm-tv-leg" aria-hidden="true"><span><i class="is-fact"></i>% de la facturación</span><span><i class="is-serv"></i>% de los servicios</span></div>' +
      t.filas.map(function (k) {
        return '<div class="rsm-tv-row" title="' + esc(k.nombre + ': ' + pesos(k.monto) + ' en ' + miles(k.servicios) + (k.servicios === 1 ? ' servicio' : ' servicios')) + '">' +
          '<div class="rsm-tv-name"><b>' + esc(k.nombre) + '</b><small>' + pesosCorto(k.porServ) + ' / serv.</small></div>' +
          '<div class="rsm-tv-bars" aria-hidden="true"><i style="width:' + ancho(k.pm) + ';background:' + k.color + '"></i><i class="is-serv" style="width:' + ancho(k.ps) + '"></i></div>' +
          '<div class="rsm-tv-val"><b>' + pct(k.pm) + '</b><span>' + pct(k.ps) + '</span></div>' +
          '<span class="rsm-sr-only">' + esc(k.nombre) + ': ' + pct(k.pm) + ' de la facturación, ' + pct(k.ps) + ' de los servicios, ' + pesos(k.porServ) + ' por servicio.</span>' +
        '</div>';
      }).join('') +
      (lect ? '<p class="rsm-tv-lectura">' + lect + '</p>' : '');
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

  /* Diario: sólo lo necesario para leer el gráfico (este período, el anterior y el tooltip con la diferencia).
     El zoom, el minimapa y los rangos largos viven en la pestaña Tendencia («Ver tendencia →»). */
  var EVOL_SIMPLE = true;
  function pintarEvolucion(d) {
    var Z = global.AuxZoom, h = evol.hist;
    if (EVOL_SIMPLE || !Z || !h || !evol.per) { pintarEvolucionPeriodo(d); return; }
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
          fill: true, borderWidth: 2.2, tension: .35, cubicInterpolationMode: 'monotone', pointRadius: 0, pointHoverRadius: 5
        }, {
          label: 'Anterior', data: w.ant, hidden: !w.hayAnt, borderColor: chartColors().previous,
          borderDash: [4, 4], fill: false, borderWidth: 1.5, tension: .35, cubicInterpolationMode: 'monotone', pointRadius: 0, pointHoverRadius: 3
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
            },
            footer: function (it) {
              var a = it.find(function (x) { return x.datasetIndex === 0; }), b = it.find(function (x) { return x.datasetIndex === 1; });
              if (!a || !b || !(b.parsed.y > 0) || a.parsed.y == null) return '';
              var v = (a.parsed.y - b.parsed.y) * 100 / b.parsed.y;
              return 'Diferencia: ' + (v >= 0 ? '+' : '') + v.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' %';
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
    var act = d.porDia.actual.slice(), ant = d.porDia.anterior;
    var n = Math.max(act.length, ant.length), hechos = diasTranscurridos(d, act.length || n);
    for (var i = hechos; i < act.length; i++) act[i] = null;          /* los días que todavía no pasaron no son «cero» */
    var etiquetas = etiquetasDias(d, n);
    pintarDatosEvol(etiquetas, act, ant);
    var hayAnt = ant.some(function (v) { return v > 0; });
    var key = el('rsm-previous-key'); if (key) key.hidden = !hayAnt;
    var sub = el('rsm-evol-sub');
    if (sub) sub.textContent = 'Facturado por día';
    if (!cv || typeof global.Chart === 'undefined') return;
    var c = chartColors(), grad = cv.getContext('2d').createLinearGradient(0, 0, 0, cv.clientHeight || 220);
    grad.addColorStop(0, 'rgba(255,179,71,0.30)'); grad.addColorStop(1, 'rgba(255,179,71,0)');
    var series = [{ label: 'Este período', data: act, borderColor: c.accent, backgroundColor: grad, fill: true, borderWidth: 2.2,
      tension: .35, cubicInterpolationMode: 'monotone', pointRadius: 0, pointHoverRadius: 5, pointHoverBorderWidth: 2, spanGaps: false }];
    if (hayAnt) series.push({ label: 'Período anterior', data: ant, borderColor: c.previous, borderDash: [4, 4], fill: false, borderWidth: 1.4,
      tension: .35, cubicInterpolationMode: 'monotone', pointRadius: 0, pointHoverRadius: 3 });
    chartEvol = new global.Chart(cv, {
      type: 'line',
      data: { labels: etiquetas, datasets: series },
      options: {
        responsive: true, maintainAspectRatio: false, animation: global.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? false : { duration: 180 },
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 6 } },
        plugins: {
          legend: { display: false },
          tooltip: { displayColors: false, padding: 10, callbacks: {
            title: function (it) { return it.length ? it[0].label : ''; },
            label: function (x) { return x.parsed.y == null ? null : (x.datasetIndex === 0 ? 'Este período: ' : 'Anterior: ') + pesos(x.parsed.y); },
            footer: function (it) {
              var a = it.find(function (x) { return x.datasetIndex === 0; }), b = it.find(function (x) { return x.datasetIndex === 1; });
              if (!a || !b || a.parsed.y == null || !(b.parsed.y > 0)) return '';
              var v = (a.parsed.y - b.parsed.y) * 100 / b.parsed.y;
              return (v >= 0 ? '▲ +' : '▼ ') + v.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' % vs. anterior';
            } } }
        },
        scales: {
          x: { grid: { display: false }, border: { display: false },
               ticks: { color: '#8590ab', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
          y: { beginAtZero: true, border: { display: false }, grid: { color: c.grid },
               ticks: { color: '#8590ab', font: { size: 10 }, maxTicksLimit: 4, callback: function (v) { return v ? pesosCorto(v).replace('$', '$ ') : '0'; } } }
        }
      }
    });
  }

  /* ── evolución: Acumulado (ritmo y proyección) y Por prestadora (minigráficos) ── */
  var evolProv = { clave: null, datos: null, cargando: null };
  function escalaLineal(d0, d1, r0, r1) { return function (v) { return d1 === d0 ? r0 : r0 + (v - d0) * (r1 - r0) / (d1 - d0); }; }
  function pasoLindo(max, n) {
    var bruto = (max || 1) / (n || 4), p = Math.pow(10, Math.floor(Math.log10(bruto))), f = bruto / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function acumular(a) { var s = 0; return a.map(function (v) { return s += num(v); }); }
  /* Días ya transcurridos del período (con datos). Si el período terminó, son todos. */
  function diasTranscurridos(d, largo) {
    if (!d.desde || !largo) return largo;
    var ini = new Date(String(d.desde).slice(0, 10) + 'T12:00:00'), hoy = new Date();
    var n = Math.floor((Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) - Date.UTC(ini.getFullYear(), ini.getMonth(), ini.getDate())) / 86400000) + 1;
    return Math.max(1, Math.min(largo, n));
  }
  function svgEjes(W, H, m, max, ticksX, sx) {
    var paso = pasoLindo(max, 4), tope = Math.ceil(max / paso) * paso || paso, sy = escalaLineal(0, tope, H - m.b, m.t), out = '';
    for (var v = 0; v <= tope + 1e-6; v += paso) {
      out += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + sy(v) + '" y2="' + sy(v) + '" class="rsm-ev-grid"/>' +
        '<text x="' + (m.l - 8) + '" y="' + (sy(v) + 4) + '" text-anchor="end" class="rsm-ev-tick">' + esc(v ? pesosCorto(v).replace('$', '$ ') : '0') + '</text>';
    }
    ticksX.forEach(function (t) { out += '<text x="' + sx(t.i) + '" y="' + (H - m.b + 17) + '" text-anchor="middle" class="rsm-ev-tick">' + esc(t.et) + '</text>'; });
    return { html: out, sy: sy };
  }
  function ticksDias(d, n, cuantos) {
    var et = etiquetasDias(d, n), out = [], k = Math.max(1, Math.ceil((n - 1) / Math.max(1, cuantos - 1)));
    for (var i = 0; i < n; i += k) out.push({ i: i, et: et[i] });
    if (out[out.length - 1].i !== n - 1) out.push({ i: n - 1, et: et[n - 1] });
    return out;
  }
  function pintarAcumulado(d) {
    var box = el('rsm-evol-alt'); if (!box) return;
    var d3 = global.d3;
    if (!(d3 && d3.line)) { box.innerHTML = '<div class="rsm-vacio">Cargando gráfico…</div>'; cargarD3().then(function () { if (estado.evolVista === 'acum' && estado.res === d) pintarAcumulado(d); }).catch(function () { box.innerHTML = '<div class="rsm-vacio">No se pudo cargar el gráfico.</div>'; }); return; }
    var act = d.porDia.actual, ant = d.porDia.anterior, n = Math.max(act.length, ant.length);
    if (!d.hayDatos || !n) { box.innerHTML = '<div class="rsm-vacio">Sin facturación en el período.</div>'; return; }
    var hechos = diasTranscurridos(d, act.length || n), ca = acumular(act.slice(0, hechos)), cp = acumular(ant.slice(0, n));
    var hoyV = ca[hechos - 1] || 0, antV = cp[Math.min(hechos, cp.length) - 1] || 0, finAnt = cp[cp.length - 1] || 0;
    var proyecta = hechos < n && hechos >= 3, proy = proyecta ? hoyV / hechos * n : null;
    var dif = antV > 0 ? (hoyV - antV) * 100 / antV : null;
    var W = Math.max(280, box.clientWidth || 600), angosto = W < 520, H = angosto ? 230 : 280;
    var m = { t: 18, r: angosto ? 12 : 96, b: 26, l: angosto ? 44 : 56 };
    var sx = escalaLineal(0, Math.max(1, n - 1), m.l, W - m.r);
    var ejes = svgEjes(W, H, m, Math.max(proy || 0, finAnt, hoyV) * 1.06, ticksDias(d, n, angosto ? 3 : 7), sx), sy = ejes.sy;
    var curva = d3.curveMonotoneX, linea = d3.line().x(function (v, i) { return sx(i); }).y(sy).curve(curva);
    var area = d3.area().x(function (v, i) { return sx(i); }).y0(H - m.b).y1(sy).curve(curva);
    var xi = sx(hechos - 1), yi = sy(hoyV);
    var svg = '<svg class="rsm-ev-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Facturación acumulada del período contra el período anterior">' +
      '<defs><linearGradient id="rsm-ev-ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb347" stop-opacity=".32"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></linearGradient></defs>' +
      (hechos < n ? '<rect x="' + xi + '" y="' + m.t + '" width="' + (W - m.r - xi) + '" height="' + (H - m.b - m.t) + '" class="rsm-ev-futuro"/>' : '') + ejes.html +
      (cp.length ? '<path d="' + linea(cp) + '" class="rsm-ev-ant" stroke-dasharray="4 4"/>' : '') +
      '<path d="' + area(ca) + '" fill="url(#rsm-ev-ga)"/><path d="' + linea(ca) + '" class="rsm-ev-act"/>' +
      (proyecta ? '<line x1="' + xi + '" y1="' + yi + '" x2="' + sx(n - 1) + '" y2="' + sy(proy) + '" class="rsm-ev-proy"/>' : '') +
      (antV > 0 ? '<line x1="' + xi + '" x2="' + xi + '" y1="' + yi + '" y2="' + sy(antV) + '" class="rsm-ev-dif ' + (hoyV >= antV ? 'is-up' : 'is-down') + '"/>' : '') +
      '<circle cx="' + xi + '" cy="' + yi + '" r="5.5" class="rsm-ev-hoy"/>' +
      '<text x="' + Math.min(xi, W - m.r - 40) + '" y="' + (yi - 12) + '" text-anchor="middle" class="rsm-ev-lbl is-acc">' + esc((hechos < n ? 'Hoy · ' : '') + pesosCorto(hoyV).replace('$', '$ ')) + '</text>' +
      (!angosto && proyecta ? '<text x="' + (W - m.r + 8) + '" y="' + (sy(proy) + 4) + '" class="rsm-ev-lbl is-acc">≈ ' + esc(pesosCorto(proy).replace('$', '$ ')) + '</text>' : '') +
      (!angosto && finAnt > 0 ? '<text x="' + (W - m.r + 8) + '" y="' + (sy(finAnt) + 4) + '" class="rsm-ev-lbl">Ant. ' + esc(pesosCorto(finAnt).replace('$', '$ ')) + '</text>' : '') +
      '</svg>';
    var lectura = '<p class="rsm-ev-lectura"><b>' + esc(pesos(hoyV)) + '</b> ' + (hechos < n ? 'facturado al día ' + hechos : 'facturado en el período') +
      (dif == null ? '' : ' · <span class="' + (dif >= 0 ? 'is-up' : 'is-down') + '">' + (dif >= 0 ? '▲ +' : '▼ ') + esc(dif.toLocaleString('es-AR', { maximumFractionDigits: 1 })) + ' %</span> vs. el período anterior al mismo día') +
      (proyecta ? '<br>Al ritmo actual cerraría en <b class="is-acc">' + esc(pesosCorto(proy).replace('$', '$ ')) + '</b>' + (finAnt > 0 ? ' · el anterior cerró en ' + esc(pesosCorto(finAnt).replace('$', '$ ')) : '') : '') + '</p>';
    box.innerHTML = lectura + svg + '<div class="rsm-chart-key"><span><i></i>Actual</span>' + (proyecta ? '<span><i class="is-proy"></i>Proyección</span>' : '') + '<span><i class="is-previous"></i>Anterior · igual duración</span></div>';
  }

  /* Por prestadora: la misma consulta del Resumen, una vez por cada una de las 5 principales; «Otras» es el resto. */
  function pintarPrestadorasEvol(d) {
    var box = el('rsm-evol-alt'); if (!box) return;
    var d3 = global.d3;
    if (!(d3 && d3.line)) { box.innerHTML = '<div class="rsm-vacio">Cargando gráfico…</div>'; cargarD3().then(function () { if (estado.evolVista === 'prest' && estado.res === d) pintarPrestadorasEvol(d); }).catch(function () {}); return; }
    var rows = rankingRows(d).filter(function (r) { return r.monto > 0; });
    if (!d.hayDatos || !rows.length) { box.innerHTML = '<div class="rsm-vacio">Sin facturación para comparar prestadoras.</div>'; return; }
    var f = estado.filtros || {}, ids = rows.filter(function (r) { return r.id != null; }).map(function (r) { return String(r.id); });
    var clave = JSON.stringify([f.desde, f.hasta, f.bases, ids]);
    if (evolProv.clave !== clave) {
      evolProv.clave = clave; evolProv.datos = null;
      var base = { p_desde: f.desde || null, p_hasta: f.hasta || null, p_bases: paramArray(f.bases) };
      evolProv.cargando = Promise.all(ids.map(function (id) {
        return rpc(RPC_RES, Object.assign({ p_empresas: [id] }, base)).then(function (r) {
          return { id: id, actual: lista(r && r.por_dia && r.por_dia.actual).map(num), anterior: lista(r && r.por_dia && r.por_dia.anterior).map(num) };
        });
      })).then(function (res) { if (evolProv.clave === clave) { evolProv.datos = res; if (estado.evolVista === 'prest' && estado.res) pintarPrestadorasEvol(estado.res); } })
        .catch(function (e) { if (global.console) console.warn('[resumen] evolución por prestadora', e); if (evolProv.clave === clave) { evolProv.clave = null; box.innerHTML = '<div class="rsm-vacio">No se pudo cargar la evolución por prestadora. Volvé a abrir esta vista para reintentar.</div>'; } });
    }
    if (!evolProv.datos) { box.innerHTML = '<div class="rsm-vacio">Cargando la evolución de cada prestadora…</div>'; return; }
    var porId = {}; evolProv.datos.forEach(function (s) { porId[s.id] = s; });
    var n = Math.max(d.porDia.actual.length, d.porDia.anterior.length), hechos = diasTranscurridos(d, d.porDia.actual.length || n);
    var series = rows.map(function (r) {
      if (r.id != null) { var s = porId[String(r.id)] || { actual: [], anterior: [] }; return { r: r, actual: s.actual, anterior: s.anterior }; }
      var resta = function (tot, k) { return tot.map(function (v, i) { return Math.max(0, num(v) - evolProv.datos.reduce(function (a, s) { return a + num(s[k][i]); }, 0)); }); };
      return { r: r, actual: resta(d.porDia.actual, 'actual'), anterior: resta(d.porDia.anterior, 'anterior') };
    });
    var colores = coloresPrestadoras(d), color = function (r) { return r.id == null ? COLOR_OTROS : (colores[String(r.id)] || COLOR_OTROS); };
    var Wm = 240, Hm = 58;
    box.innerHTML = '<div class="rsm-ev-grid-prov">' + series.map(function (s, k) {
      var a = s.actual.slice(0, hechos).reduce(function (x, v) { return x + num(v); }, 0), b = s.anterior.slice(0, hechos).reduce(function (x, v) { return x + num(v); }, 0);
      var dv = b > 0 ? (a - b) * 100 / b : null, c = color(s.r), max = Math.max.apply(null, [1].concat(s.actual, s.anterior).map(num));
      var sx = escalaLineal(0, Math.max(1, n - 1), 2, Wm - 2), sy = escalaLineal(0, max * 1.1, Hm - 2, 4);
      var ln = d3.line().x(function (v, i) { return sx(i); }).y(sy).curve(d3.curveMonotoneX), ar = d3.area().x(function (v, i) { return sx(i); }).y0(Hm).y1(sy).curve(d3.curveMonotoneX);
      var cur = s.actual.slice(0, hechos), gid = 'rsm-evp-g' + k;
      var on = estado.filtros && lista(estado.filtros.empresas).map(String).indexOf(String(s.r.id)) >= 0;
      return '<' + (s.r.id != null ? 'button type="button" data-evol-prov="' + esc(s.r.id) + '"' : 'div') + ' class="rsm-evp' + (on ? ' is-on' : '') + '" style="--c:' + c + '">' +
        '<span class="rsm-evp-n"><i></i>' + esc(s.r.nombre) + '</span>' +
        '<span class="rsm-evp-v">' + esc(pesosCorto(a).replace('$', '$ ')) + (dv == null ? '' : '<em class="' + (dv >= 0 ? 'is-up' : 'is-down') + '">' + (dv >= 0 ? '▲ +' : '▼ ') + esc(dv.toLocaleString('es-AR', { maximumFractionDigits: 1 })) + ' %</em>') + '</span>' +
        '<span class="rsm-evp-s">vs. ' + esc(pesosCorto(b).replace('$', '$ ')) + ' en el período anterior</span>' +
        '<svg viewBox="0 0 ' + Wm + ' ' + Hm + '" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c + '" stop-opacity=".35"/><stop offset="1" stop-color="' + c + '" stop-opacity="0"/></linearGradient></defs>' +
          (s.anterior.length ? '<path d="' + ln(s.anterior.slice(0, n)) + '" class="rsm-evp-ant"/>' : '') +
          (cur.length > 1 ? '<path d="' + ar(cur) + '" fill="url(#' + gid + ')"/><path d="' + ln(cur) + '" fill="none" stroke="' + c + '" stroke-width="2" vector-effect="non-scaling-stroke"/>' : '') + '</svg>' +
        '</' + (s.r.id != null ? 'button' : 'div') + '>';
    }).join('') + '</div><p class="rsm-ev-nota">Tocá una prestadora para filtrar el Resumen por ella. Línea punteada: período anterior.</p>';
  }
  function aplicarVistaEvol() {
    var card = el('rsm-evol-card'), alt = el('rsm-evol-alt'), v = estado.evolVista || 'diario';
    if (!card || !alt) return;
    card.dataset.vista = v;
    card.querySelectorAll('[data-evol-vista]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-evol-vista') === v)); });
    alt.hidden = v === 'diario';
    if (v === 'diario') { if (chartEvol) chartEvol.resize(); return; }
    if (!estado.res) return;
    if (v === 'acum') pintarAcumulado(estado.res); else pintarPrestadorasEvol(estado.res);
  }
  function montarVistasEvol() {
    var card = el('rsm-evol-card');
    if (!card || card.dataset.vistasListas === '1') return;
    card.dataset.vistasListas = '1';
    card.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-evol-vista]');
      if (b) { estado.evolVista = b.getAttribute('data-evol-vista'); aplicarVistaEvol(); return; }
      var p = ev.target.closest && ev.target.closest('[data-evol-prov]');
      if (p && global.AuxDash && typeof global.AuxDash.setFiltro === 'function') {
        var id = p.getAttribute('data-evol-prov'), ya = estado.filtros && lista(estado.filtros.empresas).map(String).indexOf(id) >= 0;
        global.AuxDash.setFiltro('empresas', ya ? [] : [id]);
      }
    });
    if (typeof global.ResizeObserver === 'function') {
      var ancho = 0, alt = el('rsm-evol-alt');
      if (alt) new global.ResizeObserver(function () { var w = alt.clientWidth; if (Math.abs(w - ancho) > 30 && estado.evolVista === 'acum' && estado.res) { ancho = w; pintarAcumulado(estado.res); } else ancho = w; }).observe(alt);
    }
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

  function celdasFila(f) {
    return '<td class="rsm-num">' + pesos(f.monto) + '</td>' +
      '<td class="rsm-num">' + miles(f.servicios) + '</td>' +
      '<td class="rsm-num">' + (f.servicios ? pesos(f.monto / f.servicios) : GUION) + '</td>' +
      '<td class="rsm-num">' + (f.km > 0 ? miles(f.km) + ' km' : GUION) + '</td>';
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
      s.monto += e.monto; s.servicios += e.servicios; s.km += e.km;
      return s;
    }, { monto: 0, servicios: 0, km: 0 });

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

    n.innerHTML = '<div class="rsm-tabla-wrap"><table class="rsm-tabla">' +
      '<thead><tr><th>Prestadora</th><th>Participación</th><th class="rsm-num">Facturado</th>' +
      '<th class="rsm-num">Servicios</th><th class="rsm-num">$/servicio</th><th class="rsm-num">Km facturados</th></tr></thead>' +
      '<tbody>' + filas + '</tbody>' +
      '<tfoot><tr><td><b>Total</b></td><td class="rsm-muted">' + d.empresas.length +
        (d.empresas.length === 1 ? ' prestadora activa' : ' prestadoras activas') + '</td>' +
        '<td class="rsm-num"><b>' + pesos(tot.monto) + '</b></td>' +
        '<td class="rsm-num"><b>' + miles(tot.servicios) + '</b></td>' +
        '<td class="rsm-num"><b>' + (tot.servicios ? pesos(tot.monto / tot.servicios) : GUION) + '</b></td>' +
        '<td class="rsm-num"><b>' + (tot.km > 0 ? miles(tot.km) + ' km' : GUION) + '</b></td>' +
      '</tr></tfoot></table></div>' +
      '<p class="rsm-nota">Tocá una prestadora para ver sus bases.</p>';
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
    pintarMapa(d);
    pintarTipos(d);
    pintarEvolucion(d);
    aplicarVistaEvol();
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
    montarVistasEvol();
    var providers=el('rsm-open-providers');if(providers&&!providers.dataset.bound){providers.dataset.bound='1';providers.addEventListener('click',function(){var detail=el('rsm-provider-detail');if(detail)detail.scrollIntoView({block:'start',behavior:global.matchMedia&&global.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});}

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
    pintarRanking: pintarRanking,
    filasTipos: filasTipos,
    pintarTipos: pintarTipos,
    lecturaTipos: lecturaTipos,
    cobertura: function (d, radio) {
      var prev = estado.radio;
      if (radio != null) estado.radio = radio;
      var c = cobertura(d);
      estado.radio = prev;
      return c;
    },
    rendimientoFlota: rendimientoFlota,
    normalizarFlota: normalizarFlota
  };
})(window);

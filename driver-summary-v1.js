/* Resumen del chofer (Panel › Mi rendimiento), pensado primero para el celular.
   Todo el mes sale de una sola consulta (get_driver_month_summary_v1), con la
   misma cuenta de efectivo que Sueldos. Reemplaza las tarjetas viejas, que
   leían el cobro de remitos.pago_1_metodo y no veían los remitos nuevos.
   Sin conexión muestra lo último guardado (obLecturaConCache). */
(function () {
  'use strict';

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = n => `<svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#${n}"/></svg>`;
  const n0 = v => Number(v) || 0;
  const money = v => '$' + Math.round(n0(v)).toLocaleString('es-AR');
  const entero = v => Math.round(n0(v)).toLocaleString('es-AR');
  const decimal = v => n0(v).toLocaleString('es-AR', { maximumFractionDigits: 1 });

  const S = { modo: 'servicios', dia: null, ultimo: null };

  function mesAnterior(mes) {
    const [y, m] = mes.split('-').map(Number);
    return MESES[(m + 10) % 12];
  }
  function diasDelMes(mes) {
    const [y, m] = mes.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }
  function hoyLocal() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }

  /* "+12% vs septiembre", o nada si no hay con qué comparar. */
  function delta(actual, anterior, etiqueta, opts = {}) {
    const a = n0(actual), b = n0(anterior);
    if (!a && !b) return '';
    if (!b) return `<small class="drs-delta">sin datos en ${esc(etiqueta)}</small>`;
    const p = Math.round((a - b) / b * 100);
    const tono = p === 0 ? 'eq' : (p > 0) !== !!opts.invert ? 'up' : 'down';
    const texto = p === 0 ? `igual que ${etiqueta}` : `${p > 0 ? '+' : ''}${p}% vs ${etiqueta}`;
    return `<small class="drs-delta ${tono}">${esc(texto)}</small>`;
  }

  function avisosHTML(alertas) {
    if (!alertas || !alertas.length) return '';
    return `<section class="drs-card drs-avisos" aria-label="Avisos"><h3>${ico('triangle-alert')}Avisos</h3>${alertas.map(a => {
      const params = esc(JSON.stringify({ target: a.target, tab: a.tab || null, filtro: a.filtro || null }));
      return `<button type="button" class="drs-aviso ${a.sev === 'critico' ? 'is-danger' : ''}" onclick="_dashAlertaGo(${params})"><span><b>${esc(a.title)}</b><small>${esc(a.detail)}</small></span><em>${esc(a.cta || 'Ver')}${ico('chevron-right')}</em></button>`;
    }).join('')}</section>`;
  }

  function plataHTML(d) {
    const c = d.mes?.cobros || {}, e = d.efectivo || {};
    const medios = [['Efectivo', c.cash], ['Transferencia', c.transfer], ['Tarjeta', c.card], ['Otro', c.other]]
      .filter(([nombre, v], i) => i < 3 || n0(v) > 0);
    const aRendir = n0(e.a_rendir), rendido = n0(e.rendido), pendiente = n0(e.pendiente);
    const avance = aRendir > 0 ? Math.min(100, Math.round(rendido / aRendir * 100)) : (rendido > 0 ? 100 : 0);
    return `<section class="drs-card drs-plata" aria-labelledby="drs-plata-t">
      <header><h3 id="drs-plata-t">${ico('wallet')}Mi plata del mes</h3></header>
      <div class="drs-total"><small>Cobrado a clientes</small><b>${money(c.total)}</b>${delta(c.total, d.anterior?.cobros?.total, S.etiquetaAnterior)}</div>
      <div class="drs-medios">${medios.map(([nombre, v]) => `<div><small>${esc(nombre)}</small><b>${money(v)}</b></div>`).join('')}</div>
      <div class="drs-rendir ${pendiente > 0 ? 'is-pending' : 'is-ok'}">
        <div class="drs-rendir-head"><b>${pendiente > 0 ? 'Por rendir' : 'Efectivo al día'}</b><strong>${money(pendiente)}</strong></div>
        <div class="drs-bar" role="progressbar" aria-label="Efectivo rendido" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${avance}"><i style="width:${avance}%"></i></div>
        <dl>
          <div><dt>Efectivo cobrado</dt><dd>${money(e.cobrado)}</dd></div>
          <div><dt>Gastos pagados en efectivo</dt><dd>− ${money(e.gastos)}</dd></div>
          <div><dt>Tenés que rendir</dt><dd>${money(aRendir)}</dd></div>
          <div><dt>Ya rendido</dt><dd>${money(rendido)}</dd></div>
        </dl>
      </div>
    </section>`;
  }

  function mesHTML(d) {
    const m = d.mes || {}, a = d.anterior || {}, et = S.etiquetaAnterior;
    const tiles = [
      ['package', 'Servicios', entero(m.servicios), delta(m.servicios, a.servicios, et)],
      ['route', 'Km recorridos', entero(m.km) + ' km', delta(m.km, a.km, et)],
      ['calendar', 'Jornadas', entero(m.jornadas), delta(m.jornadas, a.jornadas, et)],
    ];
    if (n0(m.horas_motor) > 0 || n0(a.horas_motor) > 0) tiles.push(['clock', 'Horas de motor', decimal(m.horas_motor) + ' h', delta(m.horas_motor, a.horas_motor, et)]);
    return `<section class="drs-mes" aria-label="Mi mes" data-n="${tiles.length}">${tiles.map(([i, t, v, dl]) =>
      `<div class="drs-tile"><small>${ico(i)}${esc(t)}</small><b>${esc(v)}</b>${dl}</div>`).join('')}</section>`;
  }

  function actividadHTML(d, mes) {
    const porDia = new Map((d.mes?.por_dia || []).map(x => [String(x.fecha).slice(0, 10), x]));
    const total = diasDelMes(mes), hoy = hoyLocal();
    const dias = Array.from({ length: total }, (_, i) => {
      const f = `${mes}-${String(i + 1).padStart(2, '0')}`, x = porDia.get(f) || {};
      return { f, n: i + 1, servicios: n0(x.servicios), km: n0(x.km), trabajo: porDia.has(f) };
    });
    const clave = S.modo === 'km' ? 'km' : 'servicios';
    const max = Math.max(1, ...dias.map(x => x[clave]));
    const sel = dias.find(x => x.f === S.dia) || null;
    const detalle = sel
      ? `${Number(sel.f.slice(8))} de ${MESES[Number(sel.f.slice(5, 7)) - 1]}: ${sel.trabajo ? `${entero(sel.servicios)} servicio${sel.servicios === 1 ? '' : 's'} · ${entero(sel.km)} km` : 'sin jornada'}`
      : 'Tocá un día para ver el detalle';
    return `<section class="drs-card drs-actividad" aria-labelledby="drs-act-t">
      <header><h3 id="drs-act-t">${ico('chart-column')}Actividad por día</h3>
        <div class="drs-seg" role="group" aria-label="Qué mostrar">
          <button type="button" data-drs-modo="servicios" aria-pressed="${clave === 'servicios'}">Servicios</button>
          <button type="button" data-drs-modo="km" aria-pressed="${clave === 'km'}">Km</button>
        </div></header>
      <div class="drs-barras" style="--drs-dias:${total}">${dias.map(x => {
        const alto = x[clave] ? Math.max(6, Math.round(x[clave] / max * 100)) : 0;
        return `<button type="button" class="drs-dia${x.f === hoy ? ' is-hoy' : ''}${x.f === S.dia ? ' is-sel' : ''}${x.trabajo ? '' : ' is-libre'}" data-drs-dia="${x.f}" aria-label="Día ${x.n}: ${x.trabajo ? `${x.servicios} servicios, ${x.km} km` : 'sin jornada'}"><i style="height:${alto}%"></i><span>${x.n % 5 === 0 || x.n === 1 ? x.n : ''}</span></button>`;
      }).join('')}</div>
      <p class="drs-dia-detalle" aria-live="polite">${esc(detalle)}</p>
    </section>`;
  }

  function camionHTML(d) {
    const m = d.mes || {}, f = m.combustible || {};
    const kml = n0(f.litros) > 0 && n0(m.km) > 0 ? n0(m.km) / n0(f.litros) : null;
    return `<details class="drs-card drs-camion"><summary>${ico('truck')}<span>Mi camión</span><small>${kml ? decimal(kml) + ' km/l' : 'Consumo y combustible'}</small>${ico('chevron-down')}</summary>
      <dl>
        <div><dt>Rendimiento</dt><dd>${kml ? decimal(kml) + ' km/l' : 'Sin cargas este mes'}</dd></div>
        <div><dt>Litros cargados</dt><dd>${decimal(f.litros)} l</dd></div>
        <div><dt>Gasto en combustible</dt><dd>${money(f.costo)}</dd></div>
        <div><dt>Km con jornada cerrada</dt><dd>${entero(m.km)} km</dd></div>
      </dl></details>`;
  }

  function pintar() {
    const root = document.getElementById('drs-root');
    if (!root || !S.ultimo) return;
    const { data, mes, alertas } = S.ultimo;
    S.etiquetaAnterior = mesAnterior(mes);
    root.innerHTML = avisosHTML(alertas) + plataHTML(data) + mesHTML(data) + actividadHTML(data, mes) + camionHTML(data);
  }

  function raiz() {
    const view = document.getElementById('dash-view-rendimiento');
    let root = document.getElementById('drs-root');
    if (!root && view) {
      root = document.createElement('div');
      root.id = 'drs-root';
      root.addEventListener('click', ev => {
        const modo = ev.target.closest('[data-drs-modo]');
        if (modo) { S.modo = modo.dataset.drsModo; return pintar(); }
        const dia = ev.target.closest('[data-drs-dia]');
        if (dia) { S.dia = S.dia === dia.dataset.drsDia ? null : dia.dataset.drsDia; pintar(); }
      });
      (document.getElementById('dash-rend-comparado') || view.lastElementChild).insertAdjacentElement('afterend', root);
    }
    view?.classList.add('drs-on');
    return root;
  }

  function sos(esChofer) {
    const nav = document.querySelector('#dash-view-rendimiento .dash-month-navigation');
    if (!nav || !esChofer || nav.querySelector('.drs-sos')) return;
    nav.insertAdjacentHTML('beforeend', `<button type="button" class="drs-sos" onclick="abrirEmergenciasDirecto()" aria-label="Emergencias: teléfonos, talleres y protocolo de siniestro">SOS</button>`);
  }

  async function leer(driverId, period, esChofer) {
    const online = async () => {
      const { data, error } = await _db.rpc('get_driver_month_summary_v1', { p_period: period, p_driver: driverId });
      if (error) throw error;
      return data;
    };
    if (esChofer && typeof obLecturaConCache === 'function') return obLecturaConCache(`drs_${driverId}_${period}_v1`, online);
    try { return { data: await online(), deCache: false }; } catch (e) { console.error('[Resumen chofer]', e); return { data: null, deCache: false, error: e }; }
  }

  /* o = { driverId, mes:'YYYY-MM', esChofer, isCurrent() } */
  async function render(o) {
    const root = raiz();
    if (!root) return;
    sos(o.esChofer);
    if (!S.ultimo || S.ultimo.mes !== o.mes || S.ultimo.driverId !== o.driverId) {
      S.dia = null;
      root.innerHTML = '<div class="drs-skel" aria-hidden="true"></div><div class="drs-skel short" aria-hidden="true"></div><div class="drs-skel" aria-hidden="true"></div>';
    }
    const period = Number(o.mes.replace('-', ''));
    const [res, alertas] = await Promise.all([
      leer(o.driverId, period, o.esChofer),
      o.esChofer && typeof cargarAlertasPersonales === 'function' ? cargarAlertasPersonales().catch(() => []) : Promise.resolve([]),
    ]);
    if (o.isCurrent && !o.isCurrent()) return;
    if (!res || !res.data) {
      root.innerHTML = typeof _htmlOfflineSinDatos === 'function' && res?.deCache
        ? _htmlOfflineSinDatos()
        : '<div class="drs-card drs-error">No se pudo cargar el resumen. Probá de nuevo en un momento.</div>';
      return;
    }
    if (res.deCache && typeof mostrarBannerOffline === 'function') mostrarBannerOffline('dash-view-rendimiento', res.guardadoAt);
    else if (typeof quitarBannerOffline === 'function') quitarBannerOffline('dash-view-rendimiento');
    S.ultimo = { data: res.data, mes: o.mes, driverId: o.driverId, alertas };
    pintar();
  }

  window.AuxiliosDriverSummary = { render, _test: { delta, plataHTML, mesHTML, actividadHTML, camionHTML, S } };
})();

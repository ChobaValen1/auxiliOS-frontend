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

  /* Tenés pendiente: los avisos de siempre más el efectivo por rendir. Cada
     renglón lleva a donde se resuelve. */
  function pendienteHTML(alertas, d) {
    const items = [];
    const pend = n0(d?.efectivo?.pendiente);
    if (pend > 0) {
      const dias = (d.efectivo.dias || []).filter(x => n0(x.pendiente) > 0).length;
      items.push(`<button type="button" class="drs-aviso" data-drs-accion="rendir"><span><b>Efectivo por rendir · ${money(pend)}</b><small>${dias ? `${dias} jornada${dias === 1 ? '' : 's'} con efectivo sin rendir` : 'Revisá tus rendiciones'}</small></span><em>Ver días${ico('chevron-right')}</em></button>`);
    }
    (Array.isArray(alertas) ? alertas : []).forEach(a => {
      const params = esc(JSON.stringify({ target: a.target, tab: a.tab || null, filtro: a.filtro || null }));
      items.push(`<button type="button" class="drs-aviso ${a.sev === 'critico' ? 'is-danger' : ''}" onclick="_dashAlertaGo(${params})"><span><b>${esc(a.title)}</b><small>${esc(a.detail)}</small></span><em>${esc(a.cta || 'Ver')}${ico('chevron-right')}</em></button>`);
    });
    if (!items.length) return '';
    return `<section class="drs-card drs-avisos" aria-label="Tenés pendiente"><h3>${ico('triangle-alert')}Tenés pendiente</h3>${items.join('')}</section>`;
  }

  /* Hoy: la jornada abierta (o el botón para iniciarla) y los servicios
     asignados. Sólo para el chofer y en el mes actual. */
  function hoyHTML(d, mes) {
    if (!S.esChofer || mes !== hoyLocal().slice(0, 7)) return '';
    const j = typeof _jornadaActivaLocal !== 'undefined' ? _jornadaActivaLocal : null;
    const P3 = window.AuxiliosPhase3 || {};
    const asignados = (P3.queue || []).filter(x => ['assigned', 'at_origin'].includes(x.status));
    const borradores = (P3.adHocDrafts || []).length;
    let jornada;
    if (j && j.log_id) {
      const dia = (d.mes?.por_dia || []).find(x => String(x.fecha).slice(0, 10) === String(j.log_date || '').slice(0, 10));
      const hora = String(j.hora_inicio || '').slice(0, 5);
      const datos = [hora && `desde las ${hora}`, j.patente && `móvil ${j.patente}`, j.km_inicio != null && `${entero(j.km_inicio)} km al iniciar`].filter(Boolean).join(' · ');
      jornada = `<div class="drs-hoy-jornada is-open"><span class="drs-dot" aria-hidden="true"></span><div><b>Jornada abierta</b><small>${esc(datos)}</small>${dia ? `<small>${entero(dia.servicios)} servicio${n0(dia.servicios) === 1 ? '' : 's'} en esta jornada</small>` : ''}</div>
        <button type="button" class="btn btn-ghost" onclick="mostrarDialogoTaller()">${ico('square')}Finalizar</button></div>`;
    } else {
      jornada = `<div class="drs-hoy-jornada"><span class="drs-dot" aria-hidden="true"></span><div><b>Sin jornada abierta</b><small>Iniciala para cargar servicios y km</small></div>
        <button type="button" class="btn btn-primary" onclick="abrirModalNuevaJornada()">${ico('play')}Iniciar jornada</button></div>`;
    }
    let servicios = '';
    if (asignados.length || borradores) {
      const s0 = asignados[0];
      const ruta = s0 ? [s0.origin, s0.destination].filter(Boolean).join(' → ') : '';
      const titulo = asignados.length
        ? `${asignados.length} servicio${asignados.length === 1 ? '' : 's'} asignado${asignados.length === 1 ? '' : 's'}`
        : `${borradores} remito${borradores === 1 ? '' : 's'} sin terminar`;
      servicios = `<button type="button" class="drs-hoy-servicio" onclick="goTo('remitos')"><span>${ico('navigation')}</span><div><b>${esc(titulo)}</b>${s0 ? `<small>${esc([s0.service_order_number, s0.company_name].filter(Boolean).join(' · '))}</small>${ruta ? `<small>${esc(ruta)}</small>` : ''}` : '<small>Tocá para completarlos</small>'}</div>${ico('chevron-right')}</button>`;
    }
    return `<section class="drs-card drs-hoy" aria-labelledby="drs-hoy-t"><header><h3 id="drs-hoy-t">${ico('calendar-clock')}Hoy</h3></header>${jornada}${servicios}</section>`;
  }

  function ultimosHTML(d) {
    const rows = d.ultimos || [];
    const fecha = v => v ? new Date(v).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    return `<section class="drs-card drs-ultimos" aria-labelledby="drs-ult-t"><header><h3 id="drs-ult-t">${ico('file-text')}Últimos servicios</h3></header>
      ${rows.length ? `<ul>${rows.map(r => `<li><div><b>${esc(r.patente || r.nro_servicio || r.nro_remito || 'Servicio')}</b><small>${esc([r.origen, r.destino].filter(Boolean).join(' → ') || 'Sin recorrido')}</small></div>
        <div class="drs-ult-meta"><span class="drs-pill ${r.status === 'firmado' ? 'ok' : 'warn'}">${r.status === 'firmado' ? 'Firmado' : 'Sin firmar'}</span><small>${esc(fecha(r.creado))}${r.km != null ? ` · ${entero(r.km)} km` : ''}</small></div></li>`).join('')}</ul>`
        : '<p class="drs-vacio">Todavía no hay servicios este mes.</p>'}
      <button type="button" class="drs-link" onclick="goTo('remitos')">Ver todos los remitos${ico('chevron-right')}</button></section>`;
  }

  /* Detalle del efectivo por jornada (lo que falta rendir día por día). */
  function abrirDiasRendir() {
    const d = S.ultimo?.data;
    const body = document.getElementById('modal-desglose-body');
    const titulo = document.getElementById('modal-desglose-titulo');
    if (!d || !body) return;
    const dias = (d.efectivo?.dias || []).slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    if (titulo) titulo.textContent = `Efectivo por rendir · ${money(d.efectivo?.pendiente)}`;
    const dia = f => { const [y, m, dd] = String(f).slice(0, 10).split('-'); return `${Number(dd)}/${Number(m)}`; };
    body.innerHTML = `<div class="drs-dias">${dias.length ? `<div class="drs-dias-head" aria-hidden="true"><span>Jornada</span><span>Cobrado</span><span>Gastos</span><span>Rendido</span><span>Falta</span></div>${dias.map(x =>
      `<div class="drs-dias-row${n0(x.pendiente) > 0 ? ' is-pending' : ''}"><b>${esc(dia(x.fecha))}</b><span data-label="Cobrado">${money(x.cobrado)}</span><span data-label="Gastos">${money(x.gastos)}</span><span data-label="Rendido">${money(x.rendido)}</span><strong data-label="Falta">${money(x.pendiente)}</strong></div>`).join('')}`
      : '<p>No hay efectivo en este mes.</p>'}<p class="drs-dias-nota">El efectivo se rinde al cerrar cada jornada. Si falta algo, hablalo con Administración.</p></div>`;
    if (typeof openModal === 'function') openModal('modal-desglose-pago');
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
        ${pendiente > 0 ? `<button type="button" class="drs-link" data-drs-accion="rendir">Ver de qué jornadas${ico('chevron-right')}</button>` : ''}
      </div>
    </section>`;
  }

  /* Lo que llevo ganado: la misma cuenta que Sueldos al generar la liquidación
     (supabase.js › generarLiquidacionesMes), con los datos del chofer. */
  function estimar(e) {
    if (!e) return null;
    if (e.liquidacion) return { liquidada: true, estado: e.liquidacion.estado, total: n0(e.liquidacion.total) };
    if (!e.settings) return { sinEsquema: true };
    const PM = window.PayrollMatrix;
    if (!PM) return { error: true };
    try {
      const s = e.settings;
      const matrix = PM.normalize({ ...(s.compensation_matrix || {}), commissions: e.commissions || [] });
      const jornadas = e.jornadas || [];
      const r = PM.calculate(matrix, e.sources || { invoices: [], extras: [] }, jornadas.reduce((a, j) => a + (PM.journeyKm(j) || 0), 0));
      const snap = r.snapshot, lineas = [];
      const basico = n0(s.sueldo_basico), vkm = n0(s.valor_km), vserv = n0(s.valor_servicio), bp = n0(s.bono_presentismo);
      const servicios = n0(e.servicios), incidentes = n0(e.incidentes);
      if (basico > 0) lineas.push(['Sueldo fijo', '', basico]);
      if (snap.pay_services) lineas.push(['Por servicios', `${entero(servicios)} × ${money(vserv)}`, servicios * vserv]);
      if (snap.pay_km) lineas.push([matrix.km_basis === 'billed' ? 'Por km facturados' : 'Por km', `${decimal(r.km)} km × ${money(vkm)}`, r.km * vkm]);
      if (snap.pay_presentismo && bp > 0) {
        const paga = incidentes === 0 && jornadas.length > 0;
        lineas.push(['Presentismo', paga ? '' : (incidentes ? 'no corresponde: hubo incidentes' : 'sin jornadas cerradas'), paga ? bp : 0]);
      }
      (matrix.bonuses || []).forEach(b => lineas.push([b.name, 'bono mensual', n0(b.amount)]));
      (snap.commission_details || []).forEach(c => { if (n0(c.total) > 0) lineas.push([c.name || 'Comisión', c.mode === 'percent' ? `${c.value}% de ${money(c.base)}` : `${entero(c.base)} × ${money(c.value)}`, n0(c.total)]); });
      const bruto = lineas.reduce((a, l) => a + l[2], 0);
      const descuento = n0(e.descuento_rendicion);
      return { total: Math.max(0, bruto - descuento), bruto, descuento, lineas };
    } catch (err) {
      console.warn('[Resumen chofer] estimado', err);
      return { error: true };
    }
  }

  function ganadoHTML(e, d) {
    const x = estimar(e);
    if (!x) return '';
    const head = `<header><h3 id="drs-gan-t">${ico('banknote')}Lo que llevo ganado</h3></header>`;
    if (x.liquidada) return `<section class="drs-card drs-ganado" aria-labelledby="drs-gan-t">${head}<div class="drs-total"><small>Liquidación ${x.estado === 'pagada' ? 'pagada' : 'aprobada'}</small><b>${money(x.total)}</b></div><p class="drs-nota">Este mes ya está liquidado: el número es el de Sueldos.</p></section>`;
    if (x.sinEsquema) return `<section class="drs-card drs-ganado" aria-labelledby="drs-gan-t">${head}<p class="drs-nota">Tu esquema de pago todavía no está cargado. Consultá con Administración.</p></section>`;
    if (x.error) return `<section class="drs-card drs-ganado" aria-labelledby="drs-gan-t">${head}<p class="drs-nota">No se pudo calcular el estimado. Consultá con Administración.</p></section>`;
    const pend = n0(d?.efectivo?.pendiente);
    return `<section class="drs-card drs-ganado" aria-labelledby="drs-gan-t">${head}
      <div class="drs-total"><small>Estimado a hoy</small><b>${money(x.total)}</b></div>
      <p class="drs-nota">Es un estimado con lo cargado hasta ahora. El monto final lo confirma Administración al liquidar.${pend > 0 ? ` Si queda efectivo sin rendir (${money(pend)}), se descuenta.` : ''}</p>
      <details class="drs-ganado-det"><summary>Ver cómo se calcula${ico('chevron-down')}</summary>
        <dl>${x.lineas.map(([t, sub, v]) => `<div><dt>${esc(t)}${sub ? `<small>${esc(sub)}</small>` : ''}</dt><dd>${money(v)}</dd></div>`).join('')}
        ${x.descuento > 0 ? `<div class="is-neg"><dt>Descuento por rendición</dt><dd>− ${money(x.descuento)}</dd></div>` : ''}
        <div class="is-total"><dt>Total estimado</dt><dd>${money(x.total)}</dd></div></dl>
      </details></section>`;
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
    root.innerHTML = hoyHTML(data, mes) + pendienteHTML(alertas, data) + plataHTML(data) + ganadoHTML(S.ultimo.estimado, data) + mesHTML(data) + actividadHTML(data, mes) + ultimosHTML(data) + camionHTML(data);
  }

  function raiz() {
    const view = document.getElementById('dash-view-rendimiento');
    let root = document.getElementById('drs-root');
    if (!root && view) {
      root = document.createElement('div');
      root.id = 'drs-root';
      root.addEventListener('click', ev => {
        if (ev.target.closest('[data-drs-accion="rendir"]')) return abrirDiasRendir();
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

  /* El estimado es aparte: si falla, el resto del resumen se ve igual. */
  async function leerEstimado(driverId, period, esChofer) {
    const online = async () => {
      const { data, error } = await _db.rpc('get_driver_payroll_estimate_v3', { p_period: period, p_driver: driverId });
      if (error) throw error;
      return data;
    };
    try {
      if (esChofer && typeof obLecturaConCache === 'function') return (await obLecturaConCache(`drs_est_${driverId}_${period}_v2`, online)).data || null;
      return await online();
    } catch (e) { console.warn('[Resumen chofer] estimado', e); return null; }
  }

  /* o = { driverId, mes:'YYYY-MM', esChofer, isCurrent() } */
  async function render(o) {
    S.esChofer = !!o.esChofer;
    const root = raiz();
    if (!root) return;
    sos(o.esChofer);
    if (!S.ultimo || S.ultimo.mes !== o.mes || S.ultimo.driverId !== o.driverId) {
      S.dia = null;
      root.innerHTML = '<div class="drs-skel" aria-hidden="true"></div><div class="drs-skel short" aria-hidden="true"></div><div class="drs-skel" aria-hidden="true"></div>';
    }
    const period = Number(o.mes.replace('-', ''));
    const [res, est, alertas] = await Promise.all([
      leer(o.driverId, period, o.esChofer),
      leerEstimado(o.driverId, period, o.esChofer),
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
    S.ultimo = { data: res.data, mes: o.mes, driverId: o.driverId, alertas, estimado: est };
    pintar();
  }

  // La cola de servicios del chofer carga aparte: al cambiar, se vuelve a pintar "Hoy".
  window.addEventListener?.('auxilios:driver-queue-updated', () => { if (S.ultimo && document.getElementById('drs-root')) pintar(); });

  window.AuxiliosDriverSummary = { render, _test: { delta, estimar, ganadoHTML, plataHTML, mesHTML, actividadHTML, camionHTML, hoyHTML, pendienteHTML, ultimosHTML, S } };
})();

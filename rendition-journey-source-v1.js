(function () {
  'use strict';

  const originalResumenRendicion = window.obtenerResumenRendicion;
  const originalRendicionMensualDetalle = window.cargarRendicionMensualDetalle;

  function queryError(label, result) {
    if (result?.error) throw new Error(`${label}: ${result.error.message || result.error}`);
  }

  // El modal de cierre ya conoce el log_id activo. El preview debe usar exactamente
  // esa jornada, no todos los remitos del chofer creados en la misma fecha.
  window.obtenerResumenRendicion = async function obtenerResumenRendicionPorJornada(driverId, fecha, truckId) {
    let logId = null;
    try {
      logId = typeof _rendicionLogId !== 'undefined' ? _rendicionLogId : null;
    } catch (_) {
      logId = null;
    }

    if (!logId) {
      if (typeof originalResumenRendicion === 'function') {
        return originalResumenRendicion(driverId, fecha, truckId);
      }
      return { remitos: [], efectivoEsperado: 0, gastosSistema: 0 };
    }

    const [remitosRes, efectivoRes, gastosRes] = await Promise.all([
      _db.from('remitos')
        .select('nro_remito, tipo_servicio, pago_1_metodo, pago_1_monto, pago_2_metodo, pago_2_monto, status')
        .eq('log_id', logId)
        .neq('status', 'anulado'),
      _db.rpc('calcular_efectivo_jornada', { p_log_id: logId }),
      _db.rpc('calcular_gastos_jornada', { p_log_id: logId }),
    ]);

    queryError('remitos de jornada', remitosRes);
    queryError('efectivo de jornada', efectivoRes);
    queryError('gastos de jornada', gastosRes);

    return {
      remitos: remitosRes.data || [],
      efectivoEsperado: Number(efectivoRes.data) || 0,
      gastosSistema: Number(gastosRes.data) || 0,
    };
  };

  // La rendición mensual también se arma por las jornadas del mes. Esto evita que
  // un remito creado después de medianoche se impute al día/mes equivocado.
  window.cargarRendicionMensualDetalle = async function cargarRendicionMensualDetallePorJornada(driverId, yyyymm) {
    if (!driverId || !yyyymm) return null;
    if (typeof _payrollRangoMes !== 'function') {
      if (typeof originalRendicionMensualDetalle === 'function') {
        return originalRendicionMensualDetalle(driverId, yyyymm);
      }
      throw new Error('No está disponible el rango mensual de rendiciones');
    }

    const { desde, hastaExclusive } = _payrollRangoMes(yyyymm);

    const [choferRes, jornadasRes, rendRes, fuelRes] = await Promise.all([
      _db.from('users')
        .select('user_id, full_name, legajo')
        .eq('user_id', driverId)
        .single(),
      _db.from('daily_logs')
        .select('log_id, log_date, truck_id')
        .eq('driver_id', driverId)
        .gte('log_date', desde)
        .lt('log_date', hastaExclusive),
      _db.from('rendicion_cierre')
        .select('log_id, fecha, efectivo_declarado, efectivo_esperado, gastos_sistema, gastos_extra, motivo_gastos_extra, admin_status')
        .eq('driver_id', driverId)
        .neq('estado', 'rechazado')
        .gte('fecha', desde)
        .lt('fecha', hastaExclusive),
      _db.from('fuel_records')
        .select('fuel_date, total_cost, payment_method, truck_id, log_id, gas_station, liters, status')
        .gte('fuel_date', desde)
        .lt('fuel_date', hastaExclusive),
    ]);

    queryError('chofer', choferRes);
    queryError('jornadas del mes', jornadasRes);
    queryError('rendiciones del mes', rendRes);
    queryError('combustible del mes', fuelRes);

    const chofer = choferRes.data || { full_name: '—', legajo: null };
    const jornadas = jornadasRes.data || [];
    const rendiciones = rendRes.data || [];
    const logIds = jornadas.map(j => j.log_id).filter(Boolean);
    const logIdSet = new Set(logIds);

    let remitos = [];
    if (logIds.length) {
      const remitosRes = await _db.from('remitos')
        .select('created_at_device, pago_1_metodo, pago_1_monto, pago_2_metodo, pago_2_monto, nro_servicio, nro_remito, patente, imp_peaje, imp_excedente, imp_otros, log_id, status')
        .in('log_id', logIds)
        .neq('status', 'anulado');
      queryError('remitos de las jornadas del mes', remitosRes);
      remitos = remitosRes.data || [];
    }

    const logToTruck = {};
    const logToFecha = {};
    const fechaToTruck = {};
    const misTrucks = new Set();
    jornadas.forEach(j => {
      logToTruck[j.log_id] = j.truck_id;
      logToFecha[j.log_id] = j.log_date;
      fechaToTruck[j.log_date] = j.truck_id;
      if (j.truck_id) misTrucks.add(j.truck_id);
    });

    let trucksMap = {};
    if (misTrucks.size) {
      const tRes = await _db.from('trucks')
        .select('truck_id, numero_interno, plate')
        .in('truck_id', [...misTrucks]);
      queryError('móviles del mes', tRes);
      (tRes.data || []).forEach(t => {
        trucksMap[t.truck_id] = t.numero_interno || t.plate || String(t.truck_id);
      });
    }
    const movilDe = truckId => trucksMap[truckId] || '—';

    const porDia = {};
    const bucket = d => {
      if (!porDia[d]) {
        porDia[d] = {
          fecha: d,
          fact_total: 0,
          efectivo: 0,
          combustible: 0,
          gastos_extra: 0,
          rendicion_estado: null,
        };
      }
      return porDia[d];
    };
    const fechaAR = ts => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
    const esEfectivo = metodo => metodo === 'efectivo';

    remitos.forEach(r => {
      const fecha = logToFecha[r.log_id] || fechaAR(r.created_at_device);
      const b = bucket(fecha);
      const m1 = Number(r.pago_1_monto) || 0;
      const m2 = Number(r.pago_2_monto) || 0;
      b.fact_total += m1 + m2;
      if (esEfectivo(r.pago_1_metodo)) b.efectivo += m1;
      if (esEfectivo(r.pago_2_metodo)) b.efectivo += m2;
    });

    // Para el total diario usamos el snapshot sincronizado de la rendición.
    // Es la misma cifra que utiliza la base para calcular `diferencia`.
    rendiciones.forEach(r => {
      const b = bucket(r.fecha);
      b.combustible += Number(r.gastos_sistema) || 0;
      b.gastos_extra += Number(r.gastos_extra) || 0;
      b.rendicion_estado = r.admin_status || 'pendiente';
    });

    const dias = Object.values(porDia)
      .map(b => ({ ...b, a_rendir: b.efectivo - b.combustible - b.gastos_extra }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    const totales = dias.reduce((t, d) => ({
      fact_total: t.fact_total + d.fact_total,
      efectivo: t.efectivo + d.efectivo,
      combustible: t.combustible + d.combustible,
      gastos_extra: t.gastos_extra + d.gastos_extra,
      a_rendir: t.a_rendir + d.a_rendir,
    }), { fact_total: 0, efectivo: 0, combustible: 0, gastos_extra: 0, a_rendir: 0 });

    const servicios = [];
    remitos.forEach(r => {
      const m1 = Number(r.pago_1_monto) || 0;
      const m2 = Number(r.pago_2_monto) || 0;
      const ef = (esEfectivo(r.pago_1_metodo) ? m1 : 0) + (esEfectivo(r.pago_2_metodo) ? m2 : 0);
      if (ef <= 0) return;

      const fecha = logToFecha[r.log_id] || fechaAR(r.created_at_device);
      const base = {
        fecha,
        movil: movilDe(logToTruck[r.log_id] ?? fechaToTruck[fecha]),
        nro_servicio: r.nro_servicio || r.nro_remito || '—',
        patente: r.patente || '—',
      };
      const total = m1 + m2;
      const peaje = Number(r.imp_peaje) || 0;
      const exc = Number(r.imp_excedente) || 0;
      const otros = Number(r.imp_otros) || 0;
      const serv = total - peaje - exc - otros;

      if (ef >= total - 0.01 && serv >= 0) {
        if (serv > 0) servicios.push({ ...base, concepto: 'Servicio', importe: serv });
        if (peaje > 0) servicios.push({ ...base, concepto: 'Peaje', importe: peaje });
        if (exc > 0) servicios.push({ ...base, concepto: 'Excedente', importe: exc });
        if (otros > 0) servicios.push({ ...base, concepto: 'Otro', importe: otros });
      } else {
        servicios.push({ ...base, concepto: 'Servicio', importe: ef });
      }
    });
    servicios.sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.nro_servicio).localeCompare(String(b.nro_servicio)));

    // Detalle de combustible: solo cargas vinculadas explícitamente a una jornada
    // del chofer. El total de arqueo no depende de este detalle visual.
    const fuelDelChofer = (fuelRes.data || []).filter(f =>
      f.log_id && logIdSet.has(f.log_id) && f.payment_method === 'efectivo' && (f.status || 'active') === 'active'
    );
    const gastos = [];
    fuelDelChofer.forEach(f => {
      gastos.push({
        fecha: logToFecha[f.log_id] || f.fuel_date,
        movil: movilDe(logToTruck[f.log_id] || f.truck_id),
        tipo: 'Combustible',
        obs: [
          f.gas_station,
          f.liters ? Number(f.liters).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' L' : null,
        ].filter(Boolean).join(' — ') || '—',
        importe: Number(f.total_cost) || 0,
      });
    });
    rendiciones.forEach(r => {
      const g = Number(r.gastos_extra) || 0;
      if (g <= 0) return;
      gastos.push({
        fecha: r.fecha,
        movil: movilDe(fechaToTruck[r.fecha]),
        tipo: 'Gasto extra',
        obs: r.motivo_gastos_extra || '—',
        importe: g,
      });
    });
    gastos.sort((a, b) => a.fecha.localeCompare(b.fecha));

    const arqueo = rendiciones.reduce((a, r) => {
      const declarado = Number(r.efectivo_declarado) || 0;
      const esperado = Number(r.efectivo_esperado) || 0;
      const gastosSistema = Number(r.gastos_sistema) || 0;
      const gastosExtra = Number(r.gastos_extra) || 0;
      a.declarado += declarado;
      a.esperado += esperado;
      a.diff += declarado + gastosSistema + gastosExtra - esperado;
      return a;
    }, { declarado: 0, esperado: 0, diff: 0 });

    return { chofer, dias, totales, servicios, gastos, arqueo, periodo_yyyymm: yyyymm };
  };

  console.info('[Rendiciones] Fuente por jornada activa');
})();

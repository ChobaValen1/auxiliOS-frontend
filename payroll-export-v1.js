/* AuxiliOS Flota · Sueldos · exportaciones (etapa 4)
   · Excel del mes con formato y fórmulas (ExcelJS, se carga recién al exportar):
     Resumen (SUMIFS sobre Líneas), Líneas, Novedades, Transferencias y Jornadas.
   · Recibo PDF por chofer (jsPDF, texto real): haberes y descuentos por línea,
     neto en letras, firmas y anexo con las jornadas del mes.
   · Planilla PDF del mes: todos los choferes, totales y espacio para la firma.
   Datos de la empresa: Configuración → Empresa y documentos. */
(() => {
  'use strict';
  const num = v => Number(v) || 0;
  const money = v => '$ ' + Math.round(num(v)).toLocaleString('es-AR');
  const fmt = v => num(v).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const periodLabel = p => { const s = String(p); return MESES[Number(s.slice(4)) - 1].replace(/^./, c => c.toUpperCase()) + ' ' + s.slice(0, 4); };
  const monthRange = p => { const y = Math.floor(p / 100), m = p % 100; return { from: `${y}-${String(m).padStart(2, '0')}-01`, until: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10) }; };
  const ddmmyyyy = v => { if (!v) return ''; const [y, m, d] = String(v).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
  const stamp = v => v ? new Date(v).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '';
  const ESTADOS = { pendiente: 'Pendiente', aprobada: 'Aprobado', pagada: 'Pagado', sin_liquidacion: 'Sin calcular' };
  const METODOS = { transferencia: 'Transferencia', efectivo: 'Efectivo', mixto: 'Mixto', otro: 'Otro' };
  const safeFile = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');

  // Importe en letras (pesos), para el «Son pesos…» del recibo.
  function letras(value) {
    const n = Math.floor(Math.abs(num(value))), cents = Math.round((Math.abs(num(value)) - n) * 100);
    const u = ['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte','veintiuno','veintidós','veintitrés','veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve'];
    const d = ['','','','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
    const c = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];
    const n99 = x => x < 30 ? u[x] : d[Math.floor(x / 10)] + (x % 10 ? ' y ' + u[x % 10] : '');
    const n999 = x => x === 100 ? 'cien' : x < 100 ? n99(x) : (c[Math.floor(x / 100)] + (x % 100 ? ' ' + n99(x % 100) : ''));
    const apocope = s => s.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');
    const n1e6 = x => x < 1000 ? n999(x) : (Math.floor(x / 1000) === 1 ? 'mil' : apocope(n999(Math.floor(x / 1000))) + ' mil') + (x % 1000 ? ' ' + n999(x % 1000) : '');
    let text;
    if (n < 1e6) text = n1e6(n);
    else { const mm = Math.floor(n / 1e6); text = (mm === 1 ? 'un millón' : apocope(n1e6(mm)) + ' millones') + (n % 1e6 ? ' ' + n1e6(n % 1e6) : ''); }
    return text + (cents ? ` con ${String(cents).padStart(2, '0')}/100` : '');
  }

  // ── Datos ──
  async function company() { try { return (await window.CompanyDocuments?.load?.()) || {}; } catch (_) { return {}; } }
  async function linesFor(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 100) {
      const r = await _db.from('payroll_lineas').select('liquidacion_id,orden,categoria,origen,concepto,detalle,cantidad,valor,importe').in('liquidacion_id', ids.slice(i, i + 100)).order('orden');
      if (r.error) throw r.error; out.push(...(r.data || []));
    }
    return out;
  }
  async function desglose(liq) { const r = await _db.rpc('payroll_desglose_v1', { p_liquidacion: liq }); if (r.error) throw r.error; return r.data || { dias: [], ventas: [] }; }
  async function desgloseMes(period) { const r = await _db.rpc('payroll_desglose_mes_v1', { p_period: period }); if (r.error) throw r.error; return r.data || []; }
  // Cada comisión dice de dónde sale: una venta (batería, cubierta…), una marca del servicio (p. ej. Pinacars),
  // la captación de un particular o un servicio facturado. Solo las ventas suman en «Ventas».
  const TIPOS = { venta: 'Venta', marca: 'Marca', captacion: 'Captación', facturado: 'Facturado' };
  const tipo = v => TIPOS[v.tipo] || 'Venta';
  const base = v => v.tipo === 'marca' ? '1 servicio' : v.venta == null || !num(v.venta) ? '—' : money(v.venta) + (v.tipo === 'captacion' || v.tipo === 'facturado' ? ' (servicio)' : '');
  const regla = v => v.modo === 'percent' ? fmt(v.valor) + ' %' : money(v.valor) + (v.tipo === 'marca' ? ' por servicio' : ' fijo') + (num(v.cantidad) > 1 ? ' × ' + fmt(v.cantidad) : '');
  const soloVentas = list => list.filter(v => (v.tipo || 'venta') === 'venta');
  const diaFecha = d => d.fecha ? ddmmyyyy(d.fecha) : 'Sin fecha';
  async function novedades(period) {
    const r = await _db.from('payroll_novedades').select('driver_id,tipo,concepto,importe,fecha,nota').eq('periodo_yyyymm', period).order('created_at');
    if (r.error) throw r.error; return r.data || [];
  }
  async function review(period) { const r = await _db.rpc('payroll_revision_mes_v1', { p_period: period }); if (r.error) throw r.error; return r.data; }
  function sourceLabel(origen) { return { basico: 'Esquema', km: 'Jornadas', servicios: 'Servicios', presentismo: 'Esquema', bono_mensual: 'Esquema', comision: 'Ventas', objetivos: 'Histórico', rendicion: 'Rendición', novedad: 'Novedad' }[origen] || origen || ''; }
  const NOV = { bono: 'Bono', horas_extra: 'Horas extra', viatico: 'Viático', adelanto: 'Adelanto', vale: 'Vale', descuento: 'Descuento' };
  const NOV_RESTA = new Set(['adelanto', 'vale', 'descuento']);

  // ── Excel del mes ──
  let excelLoading = null;
  function loadExcel() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    excelLoading ||= new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = '/vendor/exceljs-4.4.0.min.js'; s.onload = () => window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('No se pudo cargar el exportador de Excel.')); s.onerror = () => { excelLoading = null; reject(new Error('No se pudo cargar el exportador de Excel. Revisá la conexión.')); }; document.head.appendChild(s); });
    return excelLoading;
  }
  const AMBER = 'FFF5A623', INK = 'FF1A1203', DARK = 'FF14171D', GRAY = 'FF6B7180', LIGHT = 'FFF4F5F7', RED = 'FFB02A2A', MONEY = '"$" #,##0;[Red]-"$" #,##0';
  function buildWorkbook(ExcelJS, data) {
    const { period, rev, lines, novs, emp } = data, filas = rev.filas.filter(f => f.liquidacion_id), byLiq = new Map(filas.map(f => [f.liquidacion_id, f])), byDriver = new Map(rev.filas.map(f => [f.driver_id, f]));
    const wb = new ExcelJS.Workbook(); wb.creator = 'AuxiliOS'; wb.created = new Date(); wb.calcProperties.fullCalcOnLoad = true;
    const head = (ws, title, cols) => {
      ws.mergeCells(1, 1, 1, cols); const t = ws.getCell(1, 1); t.value = title; t.font = { bold: true, size: 16, color: { argb: DARK } };
      ws.mergeCells(2, 1, 2, cols); const s = ws.getCell(2, 1);
      const pasos = { sin_calcular: 'sin calcular', en_revision: 'en revisión', aprobado: 'aprobado', pagado: 'pagado' };
      s.value = [emp.legal_name, emp.tax_id && 'CUIT ' + emp.tax_id, 'Período ' + periodLabel(period), 'Estado del mes: ' + (pasos[rev.paso] || rev.paso), rev.corrida?.calculada_at && 'Calculado ' + stamp(rev.corrida.calculada_at) + (rev.corrida.calculada_por ? ' por ' + rev.corrida.calculada_por : '')].filter(Boolean).join(' · ');
      s.font = { size: 10, color: { argb: GRAY } }; ws.getRow(1).height = 24;
    };
    const th = row => { row.eachCell(c => { c.font = { bold: true, color: { argb: INK } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER } }; c.alignment = { vertical: 'middle', wrapText: true }; }); row.height = 28; };
    const zebra = (ws, from, to, cols) => { for (let r = from; r <= to; r++) if ((r - from) % 2) for (let c = 1; c <= cols; c++) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }; };
    // 1 · Resumen (haberes y descuentos salen de la hoja Líneas con SUMIFS)
    const R = wb.addWorksheet('Resumen', { views: [{ state: 'frozen', ySplit: 4 }], properties: { tabColor: { argb: AMBER } }, pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    const rc = [['Chofer', 24], ['Legajo', 9], ['Días', 7], ['Km', 9], ['Servicios', 10], ['Haberes', 15], ['Descuentos', 14], ['Neto a pagar', 16], ['Estado', 12], ['Pago', 22], ['Firma', 18]];
    head(R, 'Planilla de sueldos · ' + periodLabel(period), rc.length); R.columns = rc.map(([, w]) => ({ width: w })); const hr = R.getRow(4); hr.values = rc.map(c => c[0]); th(hr);
    filas.forEach((f, i) => {
      const r = 5 + i;
      R.getRow(r).values = [f.full_name, f.legajo || '', num(f.jornadas), num(f.km_total), num(f.servicios),
        { formula: `SUMIFS('Líneas'!$G:$G,'Líneas'!$I:$I,"${f.liquidacion_id}",'Líneas'!$C:$C,"Haber")`, result: num(f.haberes) },
        { formula: `SUMIFS('Líneas'!$G:$G,'Líneas'!$I:$I,"${f.liquidacion_id}",'Líneas'!$C:$C,"Descuento")`, result: num(f.descuentos) },
        { formula: `MAX(0,F${r}-G${r})`, result: num(f.neto) }, ESTADOS[f.estado] || f.estado,
        f.pagada_at ? (METODOS[f.pagada_metodo] || f.pagada_metodo || '') + ' · ' + stamp(f.pagada_at) + (f.pago_referencia ? ' · ' + f.pago_referencia : '') : '', ''];
    });
    const last = 4 + filas.length, tr = last + 1; zebra(R, 5, last, rc.length);
    R.getRow(tr).values = ['TOTAL · ' + filas.length + ' choferes', '', { formula: `SUM(C5:C${last})` }, { formula: `SUM(D5:D${last})` }, { formula: `SUM(E5:E${last})` }, { formula: `SUM(F5:F${last})` }, { formula: `SUM(G5:G${last})` }, { formula: `SUM(H5:H${last})` }];
    R.getRow(tr).eachCell(c => { c.font = { bold: true }; c.border = { top: { style: 'medium' } }; });
    for (let r = 5; r <= tr; r++) { R.getCell('D' + r).numFmt = '#,##0'; ['F', 'G', 'H'].forEach(k => R.getCell(k + r).numFmt = MONEY); R.getCell('H' + r).font = { bold: true }; }
    if (filas.length) R.autoFilter = { from: 'A4', to: 'J' + last };
    const note = R.getCell('A' + (tr + 2)); note.value = 'Importes calculados por AuxiliOS a partir de jornadas, servicios, rendiciones y novedades. Detalle por concepto en la hoja «Líneas».' + (rev.sin_esquema?.length ? ' Sin esquema salarial (no liquidados): ' + rev.sin_esquema.join(', ') + '.' : ''); note.font = { italic: true, size: 9, color: { argb: GRAY } };
    // 2 · Líneas (formato largo: sirve para tablas dinámicas)
    const L = wb.addWorksheet('Líneas', { views: [{ state: 'frozen', ySplit: 1 }] });
    L.columns = [{ header: 'Chofer', width: 24 }, { header: 'Legajo', width: 9 }, { header: 'Tipo', width: 11 }, { header: 'Concepto', width: 34 }, { header: 'Cantidad', width: 10 }, { header: 'Valor unitario', width: 14 }, { header: 'Importe', width: 15 }, { header: 'Origen', width: 12 }, { header: 'ID recibo', width: 12, hidden: true }];
    th(L.getRow(1));
    for (const l of lines) {
      const f = byLiq.get(l.liquidacion_id); if (!f) continue;
      const row = L.addRow([f.full_name, f.legajo || '', l.categoria === 'haber' ? 'Haber' : 'Descuento', l.concepto + (l.detalle && l.cantidad == null ? ' · ' + l.detalle : ''), l.cantidad == null ? null : num(l.cantidad), l.valor == null ? null : num(l.valor), num(l.importe), sourceLabel(l.origen), l.liquidacion_id]);
      row.getCell(5).numFmt = '#,##0.##'; row.getCell(6).numFmt = MONEY; row.getCell(7).numFmt = MONEY; if (l.categoria === 'descuento') row.getCell(7).font = { color: { argb: RED } };
    }
    L.autoFilter = { from: 'A1', to: 'H' + Math.max(1, L.rowCount) };
    // 3 · Novedades
    const N = wb.addWorksheet('Novedades', { views: [{ state: 'frozen', ySplit: 1 }] });
    N.columns = [{ header: 'Chofer', width: 24 }, { header: 'Fecha', width: 12 }, { header: 'Tipo', width: 13 }, { header: 'Concepto', width: 30 }, { header: 'Suma / resta', width: 12 }, { header: 'Importe', width: 15 }, { header: 'Nota', width: 34 }];
    th(N.getRow(1));
    for (const n of novs) { const row = N.addRow([byDriver.get(n.driver_id)?.full_name || '—', n.fecha ? new Date(n.fecha + 'T12:00:00') : null, NOV[n.tipo] || n.tipo, n.concepto, NOV_RESTA.has(n.tipo) ? 'Resta' : 'Suma', num(n.importe), n.nota || '']); row.getCell(2).numFmt = 'dd/mm/yyyy'; row.getCell(6).numFmt = MONEY; if (NOV_RESTA.has(n.tipo)) row.getCell(6).font = { color: { argb: RED } }; }
    if (!novs.length) N.addRow(['Sin novedades cargadas en el mes.']).font = { italic: true, color: { argb: GRAY } };
    // 4 · Transferencias
    const T = wb.addWorksheet('Transferencias', { views: [{ state: 'frozen', ySplit: 1 }] });
    T.columns = [{ header: 'Chofer', width: 24 }, { header: 'Legajo', width: 9 }, { header: 'DNI', width: 12 }, { header: 'CBU / CVU', width: 26 }, { header: 'Alias', width: 16 }, { header: 'Neto a transferir', width: 18 }, { header: 'Referencia', width: 22 }, { header: 'Estado', width: 12 }];
    th(T.getRow(1));
    for (const f of filas) { if (num(f.neto) <= 0) continue; const falta = !f.cbu && !f.alias_cbu; const row = T.addRow([f.full_name, f.legajo || '', f.dni || '', f.cbu || (falta ? '— falta cargar —' : ''), f.alias_cbu || '', num(f.neto), 'Sueldo ' + periodLabel(period), ESTADOS[f.estado] || f.estado]); row.getCell(6).numFmt = MONEY; row.getCell(4).numFmt = '@'; if (falta) row.getCell(4).font = { italic: true, color: { argb: RED } }; }
    const tt = T.addRow(['TOTAL', '', '', '', '', { formula: `SUM(F2:F${T.rowCount})` }]); tt.font = { bold: true }; tt.getCell(6).numFmt = MONEY;
    // 5 · Jornadas: desglose por día (km, servicios, ventas, comisión y efectivo esperado)
    const J = wb.addWorksheet('Jornadas', { views: [{ state: 'frozen', ySplit: 1 }] });
    J.columns = [{ header: 'Chofer', width: 24 }, { header: 'Fecha', width: 12 }, { header: 'Móvil', width: 13 }, { header: 'Km', width: 9 }, { header: 'Servicios', width: 10 }, { header: 'Ventas', width: 14 }, { header: 'Comisión', width: 13 }, { header: 'Efectivo esperado', width: 17 }, { header: 'Estado', width: 12 }];
    th(J.getRow(1));
    const V = [];
    for (const d of data.desg) {
      const f = byLiq.get(d.liquidacion_id); if (!f) continue;
      for (const x of d.dias || []) {
        const row = J.addRow([f.full_name, x.fecha ? new Date(x.fecha + 'T12:00:00') : 'Sin fecha', x.moviles || '', num(x.km), num(x.servicios), num(x.ventas), num(x.comision), num(x.efectivo), x.jornadas ? (x.abierta ? 'Sin cerrar' : 'Cerrada') : 'Sin jornada']);
        row.getCell(2).numFmt = 'dd/mm/yyyy'; row.getCell(4).numFmt = '#,##0'; [6, 7, 8].forEach(c => row.getCell(c).numFmt = MONEY); if (x.abierta) row.getCell(9).font = { color: { argb: RED } };
      }
      for (const v of d.ventas || []) V.push([f.full_name, v]);
    }
    J.autoFilter = { from: 'A1', to: 'I' + Math.max(1, J.rowCount) };
    // 6 · Comisiones: una fila por comisión, con su tipo (venta, marca, captación, facturado)
    const VS = wb.addWorksheet('Comisiones', { views: [{ state: 'frozen', ySplit: 1 }] });
    VS.columns = [{ header: 'Chofer', width: 24 }, { header: 'Fecha', width: 12 }, { header: 'Servicio', width: 20 }, { header: 'Tipo', width: 11 }, { header: 'Concepto', width: 28 }, { header: 'Venta', width: 14 }, { header: 'Base', width: 16 }, { header: 'Regla', width: 20 }, { header: 'Comisión', width: 13 }];
    th(VS.getRow(1));
    for (const [name, v] of V) { const row = VS.addRow([name, v.fecha ? new Date(v.fecha + 'T12:00:00') : 'Sin fecha', v.servicio || '', tipo(v), v.concepto || v.regla || '', (v.tipo || 'venta') === 'venta' && num(v.venta) ? num(v.venta) : null, base(v), regla(v), num(v.comision)]); row.getCell(2).numFmt = 'dd/mm/yyyy'; row.getCell(6).numFmt = MONEY; row.getCell(9).numFmt = MONEY; }
    if (!V.length) VS.addRow(['Sin comisiones en el mes.']).font = { italic: true, color: { argb: GRAY } };
    else { const tv = VS.addRow(['TOTAL', '', '', '', V.length + ' comisiones', { formula: `SUM(F2:F${VS.rowCount})` }, '', '', { formula: `SUM(I2:I${VS.rowCount})` }]); tv.font = { bold: true }; tv.getCell(6).numFmt = MONEY; tv.getCell(9).numFmt = MONEY; VS.autoFilter = { from: 'A1', to: 'I' + (VS.rowCount - 1) }; }
    return wb;
  }
  async function gather(period) {
    const rev = await review(period), filas = rev.filas.filter(f => f.liquidacion_id);
    const drivers = rev.filas.map(f => f.driver_id);
    const [lines, novs, desg, emp, dnis] = await Promise.all([linesFor(filas.map(f => f.liquidacion_id)), novedades(period), desgloseMes(period), company(),
      drivers.length ? _db.from('users').select('user_id,dni').in('user_id', drivers) : Promise.resolve({ data: [] })]);
    const bank = drivers.length ? await _db.from('payroll_settings').select('user_id,cbu,alias_cbu').in('user_id', drivers) : { data: [] };
    const dni = new Map((dnis.data || []).map(u => [u.user_id, u.dni])), pay = new Map((bank.data || []).map(s => [s.user_id, s]));
    rev.filas.forEach(f => { f.dni = dni.get(f.driver_id) || ''; f.cbu = pay.get(f.driver_id)?.cbu || ''; f.alias_cbu = pay.get(f.driver_id)?.alias_cbu || ''; });
    return { period, rev, lines, novs, desg, emp };
  }
  function saveBlob(blob, filename) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); if (typeof window.confirmarDescarga === 'function') window.confirmarDescarga(filename, 'Sueldos'); }
  async function excelMes(period) {
    const [ExcelJS, data] = await Promise.all([loadExcel(), gather(period)]);
    if (!data.rev.filas.some(f => f.liquidacion_id)) throw new Error('Todavía no hay liquidaciones en este mes. Calculá el mes primero.');
    const wb = buildWorkbook(ExcelJS, data), buf = await wb.xlsx.writeBuffer();
    saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Sueldos_${safeFile(periodLabel(period))}.xlsx`);
  }

  // ── PDF (jsPDF) ──
  function ctor() { const C = window.jspdf?.jsPDF || window.jsPDF; if (!C) throw new Error('No se cargó la librería de PDF. Recargá la página e intentá de nuevo.'); return C; }
  const C_AMBER = [245, 166, 35], C_AMBER_INK = [194, 124, 0], C_TEXT = [22, 24, 29], C_MUTED = [110, 114, 124], C_LINE = [225, 227, 231], C_SOFT = [245, 246, 248], C_RED = [176, 42, 42], C_NET = [255, 248, 234];
  function header(doc, emp, kicker, title, sub, W, M) {
    doc.setTextColor(...C_TEXT); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(emp.legal_name || 'Empresa', M, M + 4);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...C_MUTED);
    const datos = [emp.tax_id && 'CUIT ' + emp.tax_id, emp.address].filter(Boolean).join(' · '); if (datos) doc.text(datos, M, M + 9);
    if (emp.contact) doc.text(String(emp.contact), M, M + 13);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...C_AMBER_INK); doc.text(kicker.toUpperCase(), W - M, M + 1, { align: 'right' });
    doc.setTextColor(...C_TEXT); doc.setFontSize(15); doc.text(title, W - M, M + 8, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...C_MUTED); if (sub) doc.text(sub, W - M, M + 13, { align: 'right' });
    doc.setDrawColor(...C_AMBER); doc.setLineWidth(0.9); doc.line(M, M + 17, W - M, M + 17);
    return M + 24;
  }
  function footer(doc, W, H, M, left) {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...C_MUTED); doc.text(left, M, H - 8); doc.text(`Generado con AuxiliOS · página ${i} de ${pages}`, W - M, H - 8, { align: 'right' }); }
  }
  // Tabla simple con salto de página: cols = [{label, w, align}], rows = [[...]], opts.rowStyle(row,i) → {bold,color,fill}
  function table(doc, y, cols, rows, { M, W, H, top, onPage, rowStyle } = {}) {
    const lh = 6.2, x0 = M;
    const drawHead = () => { doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...C_MUTED); let x = x0; cols.forEach(c => { doc.text(c.label.toUpperCase(), c.align === 'right' ? x + c.w - 1.5 : x + 1.5, y + 4, { align: c.align === 'right' ? 'right' : 'left' }); x += c.w; }); y += 6; doc.setDrawColor(200, 203, 208); doc.setLineWidth(0.3); doc.line(x0, y, W - M, y); y += 1; };
    drawHead();
    rows.forEach((row, i) => {
      const st = rowStyle ? rowStyle(row, i) || {} : {};
      const wrapped = cols.map((c, k) => doc.setFontSize(st.size || 8.8) && doc.splitTextToSize(String(row[k] ?? ''), c.w - 3));
      const h = Math.max(lh, ...wrapped.map(t => t.length * 4 + 2.4));
      if (y + h > H - 18) { doc.addPage(); y = onPage ? onPage() : top || M; drawHead(); }
      if (st.fill) { doc.setFillColor(...st.fill); doc.rect(x0, y, W - 2 * M, h, 'F'); }
      if (st.topRule) { doc.setDrawColor(...C_TEXT); doc.setLineWidth(0.5); doc.line(x0, y, W - M, y); }
      let x = x0;
      cols.forEach((c, k) => { doc.setFont('helvetica', st.bold || (c.bold && !st.light) ? 'bold' : 'normal'); doc.setFontSize(st.size || 8.8); doc.setTextColor(...(st.colors?.[k] || st.color || C_TEXT)); doc.text(wrapped[k], c.align === 'right' ? x + c.w - 1.5 : x + 1.5, y + 4.3, { align: c.align === 'right' ? 'right' : 'left' }); x += c.w; });
      y += h; doc.setDrawColor(...C_LINE); doc.setLineWidth(0.2); doc.line(x0, y, W - M, y);
    });
    return y + 2;
  }
  function section(doc, y, label, M) { doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...C_AMBER_INK); doc.text(label.toUpperCase(), M, y + 4, { charSpace: 0.6 }); return y + 7; }

  async function reciboPdf(l) {
    if (!l?.liquidacion_id) throw new Error('Este chofer todavía no tiene liquidación.');
    const [lines, desg, emp] = await Promise.all([linesFor([l.liquidacion_id]), desglose(l.liquidacion_id), company()]);
    const doc = new (ctor())({ unit: 'mm', format: 'a4' }), W = 210, H = 297, M = 14;
    const estado = ESTADOS[l.estado] || l.estado, sub = 'Estado: ' + estado + (l.aprobada_at ? ' · aprobado ' + stamp(l.aprobada_at) + (l.aprobador_nombre ? ' por ' + l.aprobador_nombre : '') : '');
    let y = header(doc, emp, 'Recibo de haberes', periodLabel(l.periodo_yyyymm), sub, W, M);
    // Ficha del chofer
    const ficha = [['Chofer', l.chofer_nombre || '—'], ['Legajo', l.chofer_legajo || '—'], ['DNI', l.chofer_dni || '—'], ['Recibo N.º', String(l.liquidacion_id).slice(-8).toUpperCase()], ['Días trabajados', fmt(l.jornadas)], ['Km de jornadas', fmt(l.km_total)], ['Servicios', fmt(l.servicios)], ['Pago', l.pagada_at ? (METODOS[l.pagada_metodo] || l.pagada_metodo || '—') + ' · ' + stamp(l.pagada_at) : 'Pendiente']];
    doc.setFillColor(...C_SOFT); doc.roundedRect(M, y, W - 2 * M, 22, 2, 2, 'F');
    ficha.forEach(([k, v], i) => { const cx = M + 4 + (i % 4) * ((W - 2 * M - 8) / 4), cy = y + 6 + Math.floor(i / 4) * 10; doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(...C_MUTED); doc.text(k.toUpperCase(), cx, cy); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...C_TEXT); doc.text(doc.splitTextToSize(String(v), (W - 2 * M - 8) / 4 - 3)[0], cx, cy + 4.5); });
    y += 28;
    const haberes = lines.filter(x => x.categoria === 'haber'), descuentos = lines.filter(x => x.categoria === 'descuento');
    const tot = list => list.reduce((n, x) => n + num(x.importe), 0);
    const calc = x => x.cantidad != null && x.valor != null ? fmt(x.cantidad) + ' × ' + money(x.valor) : (x.detalle || '');
    const cols = [{ label: 'Concepto', w: 92 }, { label: 'Cálculo', w: 58, align: 'right' }, { label: 'Importe', w: W - 2 * M - 150, align: 'right' }];
    const opt = { M, W, H, top: M };
    y = section(doc, y, 'Haberes', M);
    y = table(doc, y, cols, [...haberes.map(x => [x.concepto + (x.origen === 'novedad' ? '  (novedad)' : ''), calc(x), money(x.importe)]), ['Total haberes', '', money(tot(haberes))]], { ...opt, rowStyle: (r, i) => i === haberes.length ? { bold: true, topRule: true } : null });
    if (descuentos.length) {
      y = section(doc, y + 3, 'Descuentos', M);
      y = table(doc, y, cols, [...descuentos.map(x => [x.concepto + (x.origen === 'novedad' ? '  (novedad)' : ''), calc(x), '- ' + money(x.importe)]), ['Total descuentos', '', '- ' + money(tot(descuentos))]], { ...opt, rowStyle: (r, i) => i === descuentos.length ? { bold: true, topRule: true, colors: [C_TEXT, C_TEXT, C_RED] } : { colors: [C_TEXT, C_MUTED, C_RED] } });
    }
    if (!lines.length) { doc.setFontSize(9); doc.setTextColor(...C_MUTED); doc.text('Recibo sin líneas: recalculá el mes para armar el detalle.', M, y + 5); y += 10; }
    // Neto
    if (y + 26 > H - 50) { doc.addPage(); y = M; }
    y += 4; doc.setFillColor(...C_NET); doc.setDrawColor(...C_AMBER); doc.setLineWidth(0.7); doc.roundedRect(M, y, W - 2 * M, 20, 2.5, 2.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...C_TEXT); doc.text('Neto a pagar', M + 5, y + 8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.2); doc.setTextColor(85, 85, 85); doc.text(doc.splitTextToSize('Son pesos ' + letras(l.total) + '.', 120), M + 5, y + 13.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...C_TEXT); doc.text(money(l.total), W - M - 5, y + 12.5, { align: 'right' });
    y += 26;
    if (l.pago_referencia) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C_MUTED); doc.text('Comprobante de pago: ' + l.pago_referencia, M, y); y += 5; }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); doc.setTextColor(...C_MUTED);
    doc.text(doc.splitTextToSize('Detalle de lo liquidado por AuxiliOS a partir de jornadas, servicios, rendiciones y novedades del mes. Las jornadas van en el anexo.', W - 2 * M), M, y); y += 9;
    // Firmas
    if (y + 26 > H - 16) { doc.addPage(); y = M + 10; }
    y += 16; doc.setDrawColor(...C_TEXT); doc.setLineWidth(0.3); doc.line(M, y, M + 80, y); doc.line(W - M - 80, y, W - M, y);
    doc.setFontSize(8.5); doc.setTextColor(68, 68, 68); doc.text('Firma del chofer · recibí conforme', M, y + 5); doc.text('Aclaración y DNI', W - M - 80, y + 5);
    // Anexo: desglose por día (solo la cuenta de km) y ventas con su comisión
    const top = () => header(doc, emp, 'Anexo · desglose por día', periodLabel(l.periodo_yyyymm), (l.chofer_nombre || '') + (l.chofer_legajo ? ' · legajo ' + l.chofer_legajo : ''), W, M);
    doc.addPage(); y = top();
    const dias = desg.dias || [], ventas = desg.ventas || [], sumD = k => dias.reduce((n, d) => n + num(d[k]), 0);
    y = section(doc, y, 'Jornadas', M);
    const jc = [{ label: 'Fecha', w: 24 }, { label: 'Móvil', w: 30 }, { label: 'Km', w: 18, align: 'right' }, { label: 'Servicios', w: 20, align: 'right' }, { label: 'Ventas', w: 30, align: 'right' }, { label: 'Comisión', w: 26, align: 'right' }, { label: 'Efectivo esperado', w: W - 2 * M - 148, align: 'right' }];
    const jr = dias.map(d => [diaFecha(d) + (d.abierta ? '\nSin cerrar' : ''), d.moviles || '—', num(d.km) ? fmt(d.km) : '—', fmt(d.servicios), num(d.ventas) ? money(d.ventas) + (d.n_ventas ? '\n' + d.n_ventas + (d.n_ventas === 1 ? ' venta' : ' ventas') : '') : (d.n_ventas ? d.n_ventas + (d.n_ventas === 1 ? ' venta' : ' ventas') : '—'), num(d.comision) ? money(d.comision) : '—', money(d.efectivo)]);
    y = table(doc, y, jc, jr.length ? [...jr, ['Total', dias.filter(d => d.jornadas).length + ' jornadas', fmt(sumD('km')), fmt(sumD('servicios')), money(sumD('ventas')), money(sumD('comision')), money(sumD('efectivo'))]] : [['Sin movimientos en el mes', '', '', '', '', '', '']],
      { M, W, H, onPage: top, rowStyle: (r, i) => i === jr.length && jr.length ? { bold: true, topRule: true } : dias[i]?.abierta ? { colors: [C_RED, C_TEXT, C_TEXT, C_TEXT, C_TEXT, C_TEXT, C_TEXT] } : null });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); doc.setTextColor(...C_MUTED);
    doc.text(doc.splitTextToSize('Km = odómetro final menos inicial de cada jornada cerrada. Efectivo esperado = lo que el chofer cobró en efectivo ese día, antes de gastos (rendición del mes).', W - 2 * M), M, y + 2); y += 9;
    if (ventas.length) {
      if (y + 30 > H - 18) { doc.addPage(); y = top(); }
      y = section(doc, y + 2, 'Comisiones', M);
      const vc = [{ label: 'Fecha', w: 20 }, { label: 'Servicio', w: 35 }, { label: 'Tipo', w: 18 }, { label: 'Concepto', w: 35 }, { label: 'Base', w: 26, align: 'right' }, { label: 'Regla', w: 25 }, { label: 'Comisión', w: W - 2 * M - 159, align: 'right' }];
      const vr = ventas.map(v => [diaFecha(v), v.servicio || '—', tipo(v), v.concepto || v.regla || '', base(v), regla(v), money(v.comision)]);
      const sv = soloVentas(ventas);
      y = table(doc, y, vc, [...vr, ['Total · ' + ventas.length + (ventas.length === 1 ? ' comisión' : ' comisiones'), '', '', sv.length ? 'Ventas: ' + money(sv.reduce((n, v) => n + num(v.venta), 0)) : '', '', '', money(ventas.reduce((n, v) => n + num(v.comision), 0))]], { M, W, H, onPage: top, rowStyle: (r, i) => i === vr.length ? { bold: true, topRule: true } : null });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); doc.setTextColor(...C_MUTED); doc.text(doc.splitTextToSize('Venta: comisión sobre lo vendido. Marca: importe fijo por servicio marcado (p. ej. un cliente). Captación: comisión sobre el servicio de un particular que consiguió el chofer. El total coincide con la línea de comisiones del recibo.', W - 2 * M), M, y + 2);
    }
    footer(doc, W, H, M, (emp.legal_name || '') + ' · Recibo ' + String(l.liquidacion_id).slice(-8).toUpperCase());
    doc.save(`Recibo_${safeFile(l.chofer_nombre)}_${safeFile(periodLabel(l.periodo_yyyymm))}.pdf`);
    if (typeof window.confirmarDescarga === 'function') window.confirmarDescarga('Recibo PDF', l.chofer_nombre || '');
  }

  async function planillaPdf(period) {
    const [rev, emp] = await Promise.all([review(period), company()]), filas = rev.filas.filter(f => f.liquidacion_id);
    if (!filas.length) throw new Error('Todavía no hay liquidaciones en este mes. Calculá el mes primero.');
    const doc = new (ctor())({ unit: 'mm', format: 'a4', orientation: 'landscape' }), W = 297, H = 210, M = 12;
    const pasos = { en_revision: 'en revisión', aprobado: 'aprobado', pagado: 'pagado', sin_calcular: 'sin calcular' };
    const sub = 'Estado del mes: ' + (pasos[rev.paso] || rev.paso) + (rev.corrida?.calculada_at ? ' · calculado ' + stamp(rev.corrida.calculada_at) : '');
    const top = () => header(doc, emp, 'Planilla de sueldos', periodLabel(period), sub, W, M);
    let y = top();
    const cols = [{ label: 'Chofer', w: 52, bold: true }, { label: 'Legajo', w: 18 }, { label: 'Días', w: 14, align: 'right' }, { label: 'Km', w: 20, align: 'right' }, { label: 'Serv.', w: 16, align: 'right' }, { label: 'Haberes', w: 28, align: 'right' }, { label: 'Descuentos', w: 28, align: 'right' }, { label: 'Neto', w: 30, align: 'right', bold: true }, { label: 'Estado / pago', w: 44 }, { label: 'Firma', w: W - 2 * M - 250 }];
    const sum = k => filas.reduce((n, f) => n + num(f[k]), 0);
    const rows = filas.map(f => [f.full_name, f.legajo || '—', fmt(f.jornadas), fmt(f.km_total), fmt(f.servicios), money(f.haberes), num(f.descuentos) ? '- ' + money(f.descuentos) : '—', money(f.neto), f.estado === 'pagada' ? (METODOS[f.pagada_metodo] || 'Pagado') + ' · ' + stamp(f.pagada_at) : ESTADOS[f.estado] || f.estado, '']);
    rows.push(['Total · ' + filas.length + ' choferes', '', fmt(sum('jornadas')), fmt(sum('km_total')), fmt(sum('servicios')), money(sum('haberes')), '- ' + money(sum('descuentos')), money(sum('neto')), '', '']);
    y = table(doc, y, cols, rows, { M, W, H, onPage: top, rowStyle: (r, i) => i === rows.length - 1 ? { bold: true, topRule: true, colors: [C_TEXT, C_TEXT, C_TEXT, C_TEXT, C_TEXT, C_TEXT, C_RED, C_TEXT] } : { colors: [C_TEXT, C_MUTED, C_TEXT, C_TEXT, C_TEXT, C_TEXT, C_RED, C_TEXT, C_MUTED] } });
    const pagado = filas.filter(f => f.estado === 'pagada').reduce((n, f) => n + num(f.neto), 0);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...C_MUTED);
    doc.text(`Pagado: ${money(pagado)} · Pendiente de pago: ${money(sum('neto') - pagado)}` + (rev.sin_esquema?.length ? ` · Sin esquema salarial (no liquidados): ${rev.sin_esquema.join(', ')}` : ''), M, Math.min(y + 6, H - 14));
    footer(doc, W, H, M, (emp.legal_name || '') + ' · Planilla ' + periodLabel(period));
    doc.save(`Planilla_Sueldos_${safeFile(periodLabel(period))}.pdf`);
    if (typeof window.confirmarDescarga === 'function') window.confirmarDescarga('Planilla PDF', periodLabel(period));
  }

  async function run(button, fn) {
    const label = button?.textContent; if (button) { button.disabled = true; button.textContent = 'Armando…'; }
    try { await fn(); } catch (e) { (typeof toast === 'function' ? toast : alert)(e.message || String(e), 'error', 7000); }
    finally { if (button) { button.disabled = false; button.textContent = label; } }
  }
  window.PayrollExport = { excelMes, reciboPdf, planillaPdf, run, letras, periodLabel, buildWorkbook };
})();

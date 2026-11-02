const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c={window:{},console};vm.runInNewContext(fs.readFileSync('payroll-matrix.js','utf8'),c);c.PayrollMatrix=c.window.PayrollMatrix;vm.runInNewContext(fs.readFileSync('payroll-view.js','utf8'),c);const view=c.window.PayrollView;
test('cash collection excludes transfers and does not duplicate legacy payment fields',()=>{const s=view.serviceData({remito_id:1,pago_1_metodo:'cash',pago_1_monto:500}, {tolls:[{customer_payment_method:'cash',total_amount:100},{customer_payment_method:'transfer',total_amount:999}],excesses:[{customer_payment_method:'cash',total_amount:200}]},{});assert.equal(s.cash,300);assert.equal(s.tollCash,100);});
test('sale without commission is still visible and commission is scoped to its service',()=>{const s=view.serviceData({remito_id:1},{excesses:[{concept_id:'battery',concept_name:'Batería',total_amount:500}]},{compensation_snapshot:{commission_details:[{record_details:[{remito_id:1,total:50},{remito_id:2,total:1000}]}]}},new Set(['battery']));assert.equal(s.sales.length,1);assert.equal(s.commission,50);});
test('sale without a configured rule explains the missing commission',()=>{const s=view.serviceData({remito_id:1},{excesses:[{concept_id:'battery',concept_name:'Batería',total_amount:500}]},{compensation_snapshot:{commission_details:[]}},new Set(['battery']));assert.match(view.serviceRow(s),/Venta sin comisión configurada/);});
test('journey payable km ignore all service distances',()=>{const html=view.journey({status:'closed',km_inicio:1000,km_final:1180,log_date:'2026-09-12'},[{r:{remito_id:1,km_reales:9999},sales:[],cash:0,commission:0,time:'08:00'}]);assert.match(html,/180 km/);assert.match(html,/9999|9.999/);assert.match(html,/informativos/);});
test('rendered service data is escaped',()=>{const s=view.serviceData({remito_id:1,origen:'<script>',nro_servicio:'<b>'},{},{});assert.match(view.serviceRow(s),/&lt;script&gt;/);});
test('driver totals sum only closed journey odometers and retain monthly commission total',()=>{const t=view.totals([{status:'closed',km_inicio:1000,km_final:1180},{status:'closed',km_inicio:2000,km_final:2070},{status:'open',km_inicio:99}], [{cash:5000},{cash:7000}],{commission_total:15000});assert.equal(t.journeys,3);assert.equal(t.services,2);assert.equal(t.km,250);assert.equal(t.cash,12000);assert.equal(t.commissions,15000);assert.equal(t.pending,1);});
test('CSV preserves accented text, quotes, decimal amounts and neutralizes formulas',()=>{const text=view.csv([{key:'name',header:'Chofer'},{key:'amount',header:'Importe',type:'number'}],[{name:'Pérez; "Juan"',amount:123.45},{name:'=HYPERLINK("bad")',amount:0}]);assert.ok(text.startsWith('\uFEFF'));assert.match(text,/123,45/);assert.match(text,/Pérez; ""Juan""/);assert.match(text,/'=HYPERLINK/);});
test('salary formulas use frozen rates including zero',()=>{assert.match(view.formula({servicios:30,valor_servicio_snapshot:3200},'Servicios'),/30 servicios × \$3.200/);assert.match(view.formula({km_total:1845,valor_km_snapshot:86},'Kilómetros de jornadas'),/1.845 km × \$86/);assert.match(view.formula({servicios:30,valor_servicio_snapshot:0,adic_serv:500},'Servicios'),/\$0/);});
test('cash review distinguishes unrendered cash and recognized expenses',()=>{const result=view.compareCash({logs:[{log_id:1,log_date:'2026-09-12'},{log_id:2,log_date:'2026-09-13'}],services:[{r:{log_id:1},cash:30000},{r:{log_id:2},cash:1000}]},[{fecha:'2026-09-12',efectivo_declarado:25000,gastos_extra:2000}]);assert.equal(result[0].delta,-3000);assert.equal(result[1].declarado,null);assert.equal(result[1].delta,null);});

test('monthly amount preserves pending, zero and Argentine currency input',()=>{assert.equal(view.monthlyAmount(''),null);assert.equal(view.monthlyAmount('  '),null);assert.equal(view.monthlyAmount('0'),0);assert.equal(view.monthlyAmount('50.000,50'),50000.5);assert.equal(view.monthlyAmount('42000'),42000);for(const v of ['-1','50.00','NaN','1,234','1e3'])assert.throws(()=>view.monthlyAmount(v));});
test('cash collected on a private service adds to the expected cash',()=>{const s=view.serviceData({remito_id:1},{tolls:[],excesses:[{customer_payment_method:'cash',total_amount:200}]},{},new Set(),{lines:[{method:'cash',amount:40000},{method:'transfer',amount:25000}]});assert.equal(s.privateCash,40000);assert.equal(s.cash,40200);});
test('recibo por líneas: haberes, descuentos, novedades marcadas y total',()=>{
  const html=view.linesHtml([{categoria:'haber',origen:'basico',concepto:'Sueldo básico',importe:300000},{categoria:'haber',origen:'km',concepto:'Kilómetros de jornadas',cantidad:534,valor:95,importe:50730},{categoria:'haber',origen:'novedad',concepto:'Bono <b>',importe:10000},{categoria:'descuento',origen:'novedad',concepto:'Adelanto',importe:5000}],355730);
  assert.match(html,/Haberes/);assert.match(html,/Descuentos/);assert.match(html,/534 × \$95/);assert.match(html,/novedad/);assert.match(html,/Bono &lt;b&gt;/);assert.match(html,/−\$5\.000/);assert.match(html,/Total a pagar/);assert.match(html,/\$355\.730/);
  assert.doesNotMatch(view.linesHtml([{categoria:'haber',origen:'basico',concepto:'Sueldo básico',importe:1}],1),/Descuentos/);
});
test('novedades: solo editables con recibo pendiente; signo por tipo',()=>{
  const list=[{novedad_id:'a',tipo:'adelanto',concepto:'Adelanto',importe:5000,fecha:'2026-11-02'},{novedad_id:'b',tipo:'horas_extra',concepto:'Sábado',importe:8000}];
  const ed=view.novedadesHtml(list,true,'pendiente');assert.match(ed,/−\$5\.000/);assert.match(ed,/\+\$8\.000/);assert.match(ed,/02\/11\/26/);assert.match(ed,/Agregar novedad/);assert.match(ed,/data-nov="a"/);
  const ro=view.novedadesHtml(list,false,'aprobada');assert.doesNotMatch(ro,/Agregar novedad|data-nov/);assert.match(ro,/volvelo a pendiente/);
  assert.match(view.novedadesHtml([],false,'pendiente'),/Sin adelantos/);
  assert.equal(Object.values(view.NOV_TIPOS).filter(([,c])=>c==='descuento').length,3);
});
test('migración etapa 2: novedades suman al total guardado, líneas solo de lectura y recibo aprobado congelado',()=>{
  const m=fs.readFileSync('migrations/20261102160000_payroll_lineas_novedades_v1.sql','utf8');
  assert.match(m,/grant select on public\.payroll_lineas to authenticated;/);assert.doesNotMatch(m,/grant (insert|update|delete)[^;]*payroll_lineas/);
  assert.match(m,/payroll_novedades_admin on public\.payroll_novedades for all to authenticated\s+using \(app_private\.current_auxilios_role\(\)='administracion'\)/);
  assert.match(m,/\+app_private\.payroll_novedades_neto_v1\(new\.driver_id,new\.periodo_yyyymm\)/);
  assert.match(m,/volvelo a pendiente para cambiar novedades/);assert.match(m,/'total',greatest\(0,v_bruto-v_ajuste\+v_nov\)/);
});
test('etapa 3: pasos del mes, estado por fila y filtros',()=>{
  assert.match(view.stepsHtml('en_revision'),/class="done"><i>✓<\/i>Calculado/);assert.match(view.stepsHtml('en_revision'),/class="cur" aria-current="step"><i>2<\/i>En revisión/);
  assert.doesNotMatch(view.stepsHtml('sin_calcular'),/done|cur/);assert.equal((view.stepsHtml('pagado').match(/class="done"/g)||[]).length,4);
  assert.deepEqual([...view.rowState({estado:'pendiente',listo:true})],['ok','Listo']);assert.deepEqual([...view.rowState({estado:'pendiente',listo:false})],['wa','Revisar']);
  assert.deepEqual([...view.rowState({estado:'sin_liquidacion'})],['bad','Sin calcular']);assert.deepEqual([...view.rowState({estado:'pagada'})],['ok','Pagado']);
});
test('etapa 3: revisión con alertas, aprobar listos y sin acciones para Supervisión',()=>{
  const r={paso:'en_revision',prev_neto:1000,sin_esquema:['Chofer <x>'],corrida:null,filas:[
    {liquidacion_id:'a',full_name:'Ana <b>',estado:'pendiente',listo:true,jornadas:20,km_total:3000,servicios:50,haberes:900,descuentos:100,neto:800,alertas:[]},
    {liquidacion_id:'b',full_name:'Beto',estado:'pendiente',listo:false,jornadas:2,km_total:0,servicios:1,haberes:400,descuentos:0,neto:400,alertas:[{tipo:'jornadas',nivel:'warn',texto:'2 jornadas sin cerrar'},{tipo:'cambio',nivel:'bad',texto:'x'}]},
    {liquidacion_id:'c',full_name:'Caro',estado:'aprobada',listo:false,haberes:0,descuentos:0,neto:0,alertas:[]}]};
  c.PERFIL_USUARIO={roles:{name:'administracion'}};
  const html=view.reviewHtml(r);assert.match(html,/Aprobar 1 listo</);assert.match(html,/Pagar 1 aprobado</);assert.match(html,/\$1\.200/);assert.match(html,/\+20 %/);assert.match(html,/Chofer &lt;x&gt;/);assert.match(html,/Para revisar <span>1/);
  view._setReview(r);view._setChip('');const rows=view._rowsHtml();assert.match(rows,/Ana &lt;b&gt;/);assert.match(rows,/2 jornadas sin cerrar/);assert.match(rows,/recalculá el mes/);assert.match(rows,/pv-alert bad/);
  view._setChip('listo');assert.doesNotMatch(view._rowsHtml(),/Beto/);view._setChip('revisar');assert.doesNotMatch(view._rowsHtml(),/Ana/);view._setChip('');
  c.PERFIL_USUARIO={roles:{name:'supervision'}};assert.doesNotMatch(view.reviewHtml(r),/Aprobar|Pagar|Recalcular/);
});
test('migración etapa 3: aprobar/pagar/reabrir solo Administración, motivo obligatorio y eventos de solo lectura',()=>{
  const m=fs.readFileSync('migrations/20261102180000_payroll_mes_corridas_v1.sql','utf8');
  for(const f of ['payroll_aprobar_v1','payroll_pagar_v1','payroll_reabrir_v1','payroll_calcular_mes_v1'])assert.match(m,new RegExp('function public\\.'+f+'[\\s\\S]*?current_auxilios_role\\(\\),\'\'\\)<>\'administracion\''),f);
  assert.match(m,/grant select on public\.payroll_corridas, public\.payroll_eventos to authenticated;/);assert.doesNotMatch(m,/grant (insert|update|delete)[^;]*payroll_eventos/);
  assert.match(m,/length\(v_m\)<5/);assert.match(m,/if r\.review_required then/);assert.match(m,/La fecha de pago no puede ser futura/);
});
test('etapa 4: exportaciones de sueldos (letras, Excel con fórmulas, recibo y planilla PDF)',()=>{
  const ctx={window:{},console};vm.runInNewContext(fs.readFileSync('payroll-export-v1.js','utf8'),ctx);const X=ctx.window.PayrollExport;
  assert.equal(X.letras(1085400),'un millón ochenta y cinco mil cuatrocientos');assert.equal(X.letras(21000),'veintiún mil');assert.equal(X.letras(100),'cien');assert.equal(X.letras(1500.5),'mil quinientos con 50/100');assert.equal(X.letras(0),'cero');
  assert.equal(X.periodLabel(202611),'Noviembre 2026');
  const src=fs.readFileSync('payroll-export-v1.js','utf8');assert.match(src,/SUMIFS\('Líneas'!\$G:\$G/);assert.match(src,/fullCalcOnLoad = true/);assert.match(src,/\/vendor\/exceljs-4\.4\.0\.min\.js/);assert.doesNotMatch(src,/[\u0300-\u036f]/,'sin marcas combinantes literales');
  const v=fs.readFileSync('payroll-view.js','utf8');assert.match(v,/PayrollExport\.reciboPdf\(l\)/);assert.match(v,/PayrollExport\.excelMes\(review\.periodo\)/);assert.match(v,/PayrollExport\.planillaPdf\(review\.periodo\)/);
  assert.match(fs.readFileSync('Index.html','utf8'),/<script src="\/payroll-export-v1\.js\?v=/);assert.ok(fs.existsSync('vendor/exceljs-4.4.0.min.js'));
});
test('desglose por día: sin odómetro, con efectivo esperado, ventas y comisiones (PDF y Excel)',()=>{
  const src=fs.readFileSync('payroll-export-v1.js','utf8');
  assert.doesNotMatch(src,/Km inicio|Km fin/);assert.match(src,/payroll_desglose_v1/);assert.match(src,/payroll_desglose_mes_v1/);
  for(const h of ["'Efectivo esperado'","'Comisión'","'Ventas'","addWorksheet('Ventas'","'Ventas y comisiones'"])assert.ok(src.includes(h),h);
  const m=fs.readFileSync('migrations/20261102200000_payroll_desglose_dias_v1.sql','utf8');
  assert.match(m,/completed_driver_services_v2/);assert.match(m,/coalesce\(l\.cash_snapshot,app_private\.monthly_cash_source_v2/);assert.match(m,/not in \('administracion','supervision'\)/);
});
test('servicios sin viaje: se pegan a la jornada del día y se avisa al aprobar la excepción',()=>{
  const m=fs.readFileSync('migrations/20261102210000_servicios_sin_viaje_jornada_por_fecha_v1.sql','utf8');
  assert.match(m,/coalesce\(t\.log_id,f\.log_id\) log_id/);assert.match(m,/having count\(\*\)=1/);assert.match(m,/d\.voided_at is null/);assert.match(m,/'journey_match'/);
  const os=fs.readFileSync('operator-services.js','utf8');assert.match(os,/if\(exception\)await warnJourneyMatch\(id\)/);assert.match(os,/service_journey_match_v1/);
  assert.match(fs.readFileSync('payroll-view.js','utf8'),/en un día sin jornada del chofer/);
});
test('CBU/CVU y alias del chofer: validación igual en la app y en la base, y van al Excel de transferencias',()=>{
  const src=fs.readFileSync('sigma.js','utf8').match(/function _cbuValido\(cbu\) \{[\s\S]*?\n\}/)[0];const ctx={};vm.runInNewContext(src,ctx);
  assert.equal(ctx._cbuValido('0170099220000012345678'),true);assert.equal(ctx._cbuValido('0170099220000012345679'),false);assert.equal(ctx._cbuValido('017009922000001234567'),false);
  const m=fs.readFileSync('migrations/20261102220000_payroll_cbu_alias_v1.sql','utf8');assert.match(m,/w1 int\[\]:=array\[7,1,3,9,7,1,3\]/);assert.match(m,/alias_cbu ~ '\^\[a-z0-9\.-\]\{6,20\}\$'/);
  assert.match(fs.readFileSync('Index.html','utf8'),/id="esq-cbu"/);assert.match(fs.readFileSync('payroll-export-v1.js','utf8'),/f\.cbu \|\| \(falta \? '— falta cargar —'/);
  assert.match(fs.readFileSync('supabase.js','utf8'),/if \(cbu !== undefined\) payload\.cbu = cbu \|\| null;/);
});

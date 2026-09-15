/* Payroll review: monthly cards and expandable daily source records. */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = v => Number(v) || 0;
  const fmt = v => num(v).toLocaleString('es-AR', {maximumFractionDigits:2});
  const cash = v => (num(v)<0?'−$':'$') + fmt(Math.abs(num(v)));
  const date = v => v ? String(v).slice(0,10).split('-').reverse().join('/') : '—';
  let rows = [], active = null, request = 0, filter = '', search = '', detailData = null;
  const cell = (label,value) => `<div><small>${label}</small><strong>${value}</strong></div>`;
  function monthLabel() {
    const input = document.getElementById('pl-mes-periodo');
    const label = document.getElementById('pv-month');
    if(label && input?.value) label.textContent = new Date(input.value+'-15T12:00:00').toLocaleDateString('es-AR',{month:'long',year:'numeric'});
  }
  function render(data) {
    closeDetail(); rows = data; request++; active = null; monthLabel();
    const sum = list => list.reduce((n,l)=>n+num(l.total),0);
    document.getElementById('pl-mes-stats').innerHTML = cell('Total del mes',cash(sum(rows)))+cell('Pendiente de pago',cash(sum(rows.filter(l=>l.estado!=='pagada'))))+cell('Pagado',cash(sum(rows.filter(l=>l.estado==='pagada'))));
    document.getElementById('pl-mes-body').innerHTML = `<div class="pv-tools"><button class="btn btn-ghost" onclick="PayrollView.exportMonth('xlsx')">Exportar Excel</button><input class="form-input" placeholder="Buscar chofer…" aria-label="Buscar chofer" id="pv-search"><select class="form-input" id="pv-filter" aria-label="Estado"><option value="">Todos los estados</option><option value="pendiente">Pendientes</option><option value="aprobada">Aprobadas</option><option value="pagada">Pagadas</option></select><button class="btn btn-primary pv-generate" onclick="_generarLiquidacionesMes()">Generar liquidaciones</button></div><div id="pv-cards"></div>`;
    const input=document.getElementById('pv-search'), select=document.getElementById('pv-filter');
    input.value=search;select.value=filter;
    input.oninput=()=>{search=input.value;cards();};select.onchange=()=>{filter=select.value;cards();};cards();
  }
  function cards(){
    document.getElementById('pv-cards').innerHTML=rows.filter(l=>(!filter||l.estado===filter)&&String(l.chofer_nombre).toLowerCase().includes(search.toLowerCase())).map(l=>`<button class="pv-driver ${active?.liquidacion_id===l.liquidacion_id?'selected':''}" data-id="${esc(l.liquidacion_id)}"><span class="pv-avatar">${esc(String(l.chofer_nombre).split(' ').map(n=>n[0]).slice(0,2).join(''))}</span><span><b>${esc(l.chofer_nombre)}</b><small>${esc(l.chofer_legajo||'')} · ${num(l.jornadas)} jornadas</small></span><span><strong>${cash(l.total)}</strong><small>${esc(l.estado)}</small></span><span>Ver detalle ›</span></button>`).join('')||'<p class="pv-empty">No hay liquidaciones para estos filtros. Podés generar el mes desde arriba.</p>';
    document.querySelectorAll('.pv-driver').forEach(b=>b.onclick=()=>open(b.dataset.id));
  }
  function summary(l){
    const values=[['Sueldo básico',l.sueldo_basico],[l.compensation_snapshot?.km_basis==='billed'?'Km facturados (histórico)':'Kilómetros de jornadas',l.adic_km],['Servicios',l.adic_serv],['Comisiones',l.commission_total],['Bonos mensuales',l.bonus_monthly],['Presentismo',l.bono_presentismo],['Objetivos',l.bonos_objetivos],['Descuento por rendición',-num(l.ajuste_rendiciones)]];
    document.getElementById('pv-summary').innerHTML=`<h3>${esc(l.chofer_nombre)}</h3><small>Importes guardados en la liquidación</small><div id="pv-commission-check"></div>${values.map(([label,v])=>`<div class="pv-payline"><span>${label}${formula(l,label)}</span><b>${cash(v)}</b></div>`).join('')}<div class="pv-payline pv-total"><b>Total a pagar</b><strong>${cash(l.total)}</strong></div><div class="pv-actions"><button class="btn btn-ghost" id="pv-audit-button" disabled>Rendiciones y datos</button>${l.estado==='pendiente'?'<button class="btn btn-primary" id="pv-approve">Aprobar</button>':l.estado==='aprobada'?'<button class="btn btn-primary" id="pv-pay">Registrar pago</button>':''}</div>`;
    document.getElementById('pv-audit-button').onclick=()=>audit(l);
    const approve=document.getElementById('pv-approve'),pay=document.getElementById('pv-pay');
    if(approve)approve.onclick=()=>{closeDetail();_cambiarEstadoLiq(l.liquidacion_id,'aprobada');};
    if(pay){pay.onclick=()=>{closeDetail();_marcarPagada(l.liquidacion_id);};const back=document.createElement('button');back.className='btn btn-ghost';back.textContent='Volver a pendiente';back.onclick=()=>{closeDetail();_cambiarEstadoLiq(l.liquidacion_id,'pendiente');};pay.parentElement.appendChild(back);}
  }
  function formula(l,label){
    let text='';
    if(label==='Servicios')text=fmt(l.servicios)+' servicios × '+cash(l.valor_servicio_snapshot??(num(l.servicios)?num(l.adic_serv)/num(l.servicios):0));
    if(label==='Kilómetros de jornadas'||label==='Km facturados (histórico)')text=fmt(l.km_total)+' km × '+cash(l.valor_km_snapshot??(num(l.km_total)?num(l.adic_km)/num(l.km_total):0));
    return text?'<small class="pv-formula">'+text+'</small>':'';
  }
  function compareCash(data,rendiciones){
    const dates=new Set([...(data?.logs||[]).map(j=>j.log_date),...rendiciones.map(r=>r.fecha)]);
    return [...dates].sort().map(fecha=>{const ids=new Set((data?.logs||[]).filter(j=>j.log_date===fecha).map(j=>j.log_id));const calculado=(data?.services||[]).filter(s=>ids.has(s.r.log_id)).reduce((n,s)=>n+s.cash,0);const reports=rendiciones.filter(r=>r.fecha===fecha);const declarado=reports.length?reports.reduce((n,r)=>n+num(r.efectivo_declarado),0):null;const gastos=reports.reduce((n,r)=>n+num(r.gastos_extra),0);return {fecha,calculado,declarado,gastos,delta:declarado===null?null:declarado+gastos-calculado};});
  }
  async function audit(l){
    const root=document.getElementById('pv-audit'),detail=document.getElementById('pv-detail'),token=request;
    detail.hidden=true;root.hidden=false;root.innerHTML='<button class="btn btn-ghost" id="pv-back">‹ Volver a jornadas</button><div id="pv-audit-content" role="status">Cargando rendiciones…</div>';
    document.getElementById('pv-back').onclick=()=>{root.hidden=true;detail.hidden=false;};
    const body=document.getElementById('pv-audit-content');
    const stamp=v=>v?new Date(v).toLocaleString('es-AR'):'—';
    const meta='<h3>Datos del recibo</h3><dl class="pv-metadata">'+[['N.º',String(l.liquidacion_id).slice(-8).toUpperCase()],['Emisión',stamp(l.generada_at)],['Generado por',l.generador_nombre],['Aprobación',stamp(l.aprobada_at)],['Aprobado por',l.aprobador_nombre],['Pago',stamp(l.pagada_at)],['Método de pago',l.pagada_metodo],['Notas',l.notas]].map(([k,v])=>'<dt>'+k+'</dt><dd>'+esc(v||'—')+'</dd>').join('')+'</dl>';
    try{
      const [{rendiciones},cumplimientos]=await Promise.all([cargarRendicionesPeriodo(l.periodo_yyyymm,l.driver_id,{strict:true}),cargarCumplimientos(l.driver_id,l.periodo_yyyymm)]);
      const efectivos=compareCash(detailData,rendiciones);
      if(token!==request)return;
      const diff=rendiciones.reduce((n,r)=>n+num(r._diff),0),missing=Math.max(0,-diff),discount=missing>=PAYROLL_TOLERANCIA_RENDICION?missing:0;
      body.innerHTML='<h3>Rendición de efectivo</h3><p>El efectivo cobrado se rinde. Solo el faltante neto, considerando gastos reconocidos y la tolerancia, puede descontarse del sueldo.</p><div class="pv-payline"><span>Descuento aplicado</span><b>'+cash(l.ajuste_rendiciones)+'</b></div><div class="pv-payline"><span>Descuento según rendiciones actuales</span><b>'+cash(discount)+'</b></div>'+(Math.abs(discount-num(l.ajuste_rendiciones))>.01?'<p class="pv-review-warning">Hay diferencias con el importe guardado. Revisá las rendiciones antes de regenerar una liquidación pendiente.</p>':'')+'<table class="pv-services"><thead><tr><th>Fecha</th><th>Esperado</th><th>Entregado</th><th>Gastos</th><th>Diferencia</th></tr></thead><tbody>'+rendiciones.map(r=>'<tr><td>'+date(r.fecha)+'</td><td>'+cash(r.efectivo_esperado)+'</td><td>'+cash(r.efectivo_declarado)+'</td><td>'+cash(r.gastos_extra)+'</td><td>'+cash(r._diff)+'</td></tr>').join('')+'</tbody></table>'+(!rendiciones.length?'<p>Sin rendiciones cargadas. Esto no confirma que todo el efectivo haya sido entregado.</p>':'')+'<h3>Efectivo esperado frente a entregado</h3><table class="pv-services"><thead><tr><th>Fecha</th><th>Esperado</th><th>Entregado</th><th>Diferencia</th></tr></thead><tbody>'+efectivos.map(e=>'<tr><td>'+date(e.fecha)+'</td><td>'+cash(e.calculado)+'</td><td>'+(e.declarado===null?'Sin rendir':cash(e.declarado))+'</td><td>'+(e.delta===null?'Sin rendir':cash(e.delta))+'</td></tr>').join('')+'</tbody></table><h3>Objetivos históricos</h3>'+cumplimientos.map(c=>'<p>'+date(c.fecha)+' · '+esc(c.payroll_objetivos?.nombre||'Objetivo')+' · '+fmt(c.cantidad)+' · '+cash(c.bonus_calculado)+'</p>').join('')+'<h3>Bonos y comisiones</h3>'+PayrollMatrix.receiptHtml(l)+'<p>Los objetivos históricos se conservan: '+cash(l.bonos_objetivos)+'. Las comisiones nuevas se calculan desde ventas según el esquema del chofer.</p>'+meta;
    }catch(e){if(token===request)body.innerHTML='<p role="alert">No se pudieron cargar las rendiciones: '+esc(e.message)+'</p>'+meta;}
  }
  async function checkCommissions(l,token){
    const matrix=l.compensation_snapshot;
    if(!matrix?.commissions?.length)return;
    const box=document.getElementById('pv-commission-check');
    try{
      const period=String(l.periodo_yyyymm),year=Number(period.slice(0,4)),month=Number(period.slice(4));
      const r=await _db.rpc('get_payroll_matrix_sources',{p_driver:l.driver_id,p_from:year+'-'+String(month).padStart(2,'0')+'-01',p_until:new Date(Date.UTC(year,month,1)).toISOString().slice(0,10)});if(r.error)throw r.error;
      const result=PayrollMatrix.calculate(matrix,r.data,num(l.km_total));
      const ids=details=>details.flatMap(d=>(d.records||[]).map(id=>d.source+':'+id)).sort().join('|');
      if(token!==request)return;
      if(Math.abs(result.commission-num(l.commission_total))>.01||ids(result.snapshot.commission_details)!==ids(matrix.commission_details||[]))box.innerHTML='<p class="pv-review-warning">Ventas modificadas: revisar comisiones. Guardado '+cash(l.commission_total)+' · cálculo actual '+cash(result.commission)+'.</p>';
    }catch(e){if(token===request)box.innerHTML='<p class="pv-review-warning">No se pudo verificar si cambiaron las ventas. '+esc(e.message)+'</p>';}
  }
  async function paged(build){let out=[];for(let offset=0;;offset+=500){const r=await build().range(offset,offset+499);if(r.error)throw r.error;out.push(...(r.data||[]));if((r.data||[]).length<500)return out;}}
  async function load(l){
    const year=Math.floor(l.periodo_yyyymm/100),month=l.periodo_yyyymm%100;
    const from=`${year}-${String(month).padStart(2,'0')}-01`,until=new Date(Date.UTC(year,month,1)).toISOString().slice(0,10);
    const logs=await paged(()=>_db.from('daily_logs').select('log_id,log_date,km_inicio,km_final,status,truck:trucks!truck_id(plate)').eq('driver_id',l.driver_id).gte('log_date',from).lt('log_date',until).order('log_date',{ascending:false}).order('log_id'));
    let services=[];
    // Query by journey IDs, so an overnight service remains with its actual journey.
    for(let i=0;i<logs.length;i+=100){const ids=logs.slice(i,i+100).map(j=>j.log_id);services.push(...await paged(()=>_db.from('remitos').select('remito_id,operator_service_id,log_id,nro_servicio,nro_remito,patente,origen,destino,km_reales,status,created_at_device,pago_1_metodo,pago_1_monto,pago_2_metodo,pago_2_monto').in('log_id',ids).neq('status','anulado').order('remito_id')));}
    const catalogResponse=await _db.rpc('list_service_types_config',{p_include_inactive:true});if(catalogResponse.error)throw catalogResponse.error;const saleIds=new Set((catalogResponse.data||[]).filter(c=>c.billing_family==='sale').map(c=>c.concept_id));
    const addons=new Map();
    for(let i=0;i<services.length;i+=4){await Promise.all(services.slice(i,i+4).map(async r=>{const response=await _db.rpc('get_driver_remito_addons_v2',{p_remito_id:r.remito_id});if(response.error)throw response.error;addons.set(r.remito_id,response.data);}));}
    return {logs,services,addons,saleIds};
  }
  function serviceData(r,addons,l,saleIds=new Set()){
    const a=addons||{},extras=a.excesses||[],tolls=a.tolls||[];
    const isCash=x=>x.customer_payment_method==='cash';
    const tollCash=tolls.filter(isCash).reduce((n,x)=>n+num(x.total_amount),0);
    const extraCash=extras.filter(isCash).reduce((n,x)=>n+num(x.total_amount),0);
    const legacyCash=[1,2].reduce((n,i)=>n+(['cash','efectivo'].includes(r['pago_'+i+'_metodo'])?num(r['pago_'+i+'_monto']):0),0);
    const structured=tolls.length+extras.length>0;
    const details=l.compensation_snapshot?.commission_details||[];
    const sales=extras.filter(x=>saleIds.has(x.concept_id)||details.some(d=>d.concept_id===x.concept_id));
    for(const d of details.filter(d=>d.source==='invoices')){for(const x of d.record_details||[]){if(x.service_id&&x.service_id===r.operator_service_id)sales.push({concept_name:d.name,total_amount:x.amount,evidence:[]});}}
    const records=details.flatMap(d=>(d.record_details||[]).filter(x=>String(x.remito_id)===String(r.remito_id)||(x.service_id&&x.service_id===r.operator_service_id)).map(x=>num(x.total)));
    const time=r.created_at_device?new Date(r.created_at_device).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Argentina/Buenos_Aires'}):'—';
    return {r,time,sales,commission:records.reduce((n,v)=>n+v,0),cash:structured?tollCash+extraCash:legacyCash,tollCash,extraCash,structured,extras};
  }
  function serviceRow(s){
    const {r}=s;
    return `<tr><td data-label="Hora">${esc(s.time)}</td><td data-label="N° Servicio"><button class="pv-link" data-remito="${r.remito_id}">${esc(r.nro_servicio||r.nro_remito||r.remito_id)}</button><small>${esc(r.status)}</small></td><td data-label="Patente">${esc(r.patente||'—')}</td><td data-label="Origen">${esc(r.origen||'—')}</td><td data-label="Destino">${esc(r.destino||'—')}</td><td data-label="Km informativos">${r.km_reales==null?'—':fmt(r.km_reales)}<small>Reales · informativos</small></td><td data-label="Venta / concepto">${s.sales.map(x=>`${esc(x.concept_name)} · ${cash(x.total_amount)}<br><button class="pv-link" data-remito="${r.remito_id}">${x.evidence?.length?'Ver comprobantes':'Ver remito'}</button>`).join('<br>')||'—'}</td><td data-label="Comisión">${s.commission?cash(s.commission):'—'}</td><td data-label="Efectivo cobrado"><b>${cash(s.cash)}</b><small>${s.structured?`Peajes ${cash(s.tollCash)}<br>Excedentes ${cash(s.extraCash)}`:'Cobro histórico sin desglose'}</small><small>Cobrado para rendir</small></td></tr>`;
  }
  function journey(j,services){
    let km=null;try{km=PayrollMatrix.journeyKm(j);}catch{}
    const money=services.reduce((n,s)=>n+s.cash,0),commission=services.reduce((n,s)=>n+s.commission,0);
    return `<details class="pv-journey"><summary><span>${date(j.log_date)}</span><b>${esc(j.truck?.plate||'—')}</b><span>${km==null?'—':fmt(km)} km<small>${j.status==='closed'?'A liquidar':'Jornada abierta'}</small></span><span>${services.length} servicios</span><span>${services.reduce((n,s)=>n+s.sales.length,0)} ventas<small>${cash(commission)} comisión</small></span><b>${cash(money)}</b></summary><div class="pv-odometer">Odómetro inicial: <b>${j.km_inicio==null?'—':fmt(j.km_inicio)}</b> → Final: <b>${j.km_final==null?'—':fmt(j.km_final)}</b> = <b>${km==null?'Pendiente de cierre o revisión':fmt(km)+' km a liquidar'}</b></div><div class="pv-scroll"><table class="pv-services"><thead><tr>${['Hora','N° Servicio','Patente','Origen','Destino','Km informativos','Venta / concepto','Comisión','Efectivo cobrado'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${services.map(serviceRow).join('')||'<tr><td colspan="9">Sin servicios vinculados a esta jornada.</td></tr>'}</tbody><tfoot><tr><td colspan="7">Total jornada · ${km==null?'—':fmt(km)} km por odómetro</td><td>${cash(commission)}</td><td>${cash(money)}</td></tr></tfoot></table></div></details>`;
  }
  function closeDetail(){
    request++;
    const modal=document.getElementById('pv-driver-modal');
    if(modal?.open)modal.close();
  }
  function createDetail(l){
    let modal=document.getElementById('pv-driver-modal');
    if(!modal){modal=document.createElement('dialog');modal.id='pv-driver-modal';modal.setAttribute('aria-labelledby','pv-modal-title');document.body.appendChild(modal);modal.addEventListener('cancel',()=>{request++;});modal.addEventListener('click',e=>{if(e.target===modal)closeDetail();});}
    const period=String(l.periodo_yyyymm),month=new Date(period.slice(0,4)+'-'+period.slice(4)+'-15T12:00:00').toLocaleDateString('es-AR',{month:'long',year:'numeric'});
    modal.innerHTML=`<header class="pv-modal-header"><div><h2 id="pv-modal-title">${esc(l.chofer_nombre)}</h2><p>${esc(l.chofer_legajo||'')} · ${esc(month)}</p></div><button class="btn btn-ghost" id="pv-modal-close" aria-label="Cerrar detalle">×</button></header><div class="pv-modal-body"><div class="pv-modal-columns"><section id="pv-detail"></section><section id="pv-audit" hidden></section><aside class="pv-salary"><h3>Liquidación y recibo</h3><div id="pv-summary"></div><div class="pv-export-footer"><button class="btn btn-ghost" id="pv-export-xlsx" disabled>Exportar Excel</button><button class="btn btn-ghost" id="pv-pdf">Imprimir PDF</button></div></aside></div></div>`;
    document.getElementById('pv-modal-close').onclick=closeDetail;
    if(!modal.open)modal.showModal();
    detailData=null;
    document.getElementById('pv-export-xlsx').onclick=()=>exportDetail('xlsx');
    document.getElementById('pv-pdf').onclick=()=>_exportarReciboPDF(l);
    summary(l);
    return document.getElementById('pv-detail');
  }
  function totals(logs,services,l){
    let km=0,pending=0;
    for(const j of logs){try{const value=PayrollMatrix.journeyKm(j);if(value===null)pending++;else km+=value;}catch{pending++;}}
    return {journeys:logs.length,services:services.length,km,pending,cash:services.reduce((n,s)=>n+s.cash,0),commissions:num(l.commission_total)};
  }
  function renderTotals(logs,services,l){
    const t=totals(logs,services,l),sales=services.reduce((n,s)=>n+s.sales.length,0),commissions=services.reduce((n,s)=>n+s.commission,0);
    return '<footer class="pv-journey-totals"><b>Total</b><span>'+t.journeys+' jornadas</span><b>'+fmt(t.km)+' km</b><b>'+t.services+' servicios</b><span>'+sales+' ventas<small>'+cash(commissions)+' comisión</small></span><b>'+cash(t.cash)+'</b></footer>'+(t.pending?'<p class="pv-note">'+t.pending+' jornada(s) sin cierre u odómetros válidos no suman KM.</p>':'');
  }
  async function open(id){
    const l=rows.find(x=>x.liquidacion_id===id);if(!l)return;active=l;cards();
    const root=createDetail(l),token=++request;checkCommissions(l,token);root.innerHTML='<p role="status">Cargando jornadas, servicios y cobros…</p>';
    try{const data=await load(l);if(token!==request)return;const services=data.services.map(r=>serviceData(r,data.addons.get(r.remito_id),l,data.saleIds));
      detailData={...data,services,l};
      document.getElementById('pv-export-xlsx').disabled=false;document.getElementById('pv-audit-button').disabled=false;
      root.innerHTML=`<div class="pv-detail-title"><div><h3>Jornadas de ${esc(l.chofer_nombre)}</h3><p>KM a liquidar = odómetro final − inicial. Los KM de los servicios son informativos.</p></div></div><div class="pv-journey-head"><span>Fecha</span><span>Móvil</span><span>Km jornada</span><span>Servicios</span><span>Ventas / comisiones</span><span>Efectivo cobrado</span></div><div class="pv-journey-list">${data.logs.map(j=>journey(j,services.filter(s=>s.r.log_id===j.log_id))).join('')||'<p>No hay jornadas en este mes.</p>'}</div>${renderTotals(data.logs,services,l)}<p class="pv-note">Datos operativos actuales. Los importes aprobados se conservan en el recibo. Efectivo cobrado para rendir: ${cash(services.reduce((n,s)=>n+s.cash,0))}; consultá Rendiciones para conocer lo ya presentado.</p>${num(l.commission_total)&&!l.compensation_snapshot?.commission_details?.some(d=>d.record_details)?'<p class="pv-note">Esta liquidación anterior no tiene distribución de comisiones por servicio. El total guardado se consulta en el recibo.</p>':''}`;
      root.querySelectorAll('[data-remito]').forEach(b=>b.onclick=()=>{closeDetail();abrirDetalleRemitoAdmin(Number(b.dataset.remito));});
    }catch(error){if(token!==request)return;root.innerHTML=`<p role="alert">No se pudo cargar el detalle: ${esc(error.message)}</p><button class="btn btn-ghost" id="pv-retry">Reintentar</button>`;document.getElementById('pv-retry').onclick=()=>open(id);}
  }
  const exportColumns=[['chofer_nombre','Chofer'],['chofer_legajo','Legajo'],['periodo_yyyymm','Período'],['jornadas','Jornadas','number'],['km_total','Km liquidados','number'],['servicios','Servicios','number'],['sueldo_basico','Básico','number'],['adic_km','Pago por km','number'],['adic_serv','Pago por servicios','number'],['bonus_monthly','Bonos mensuales','number'],['commission_total','Comisiones','number'],['bono_presentismo','Presentismo','number'],['bonos_objetivos','Objetivos','number'],['ajuste_rendiciones','Descuento rendición','number'],['total','Total sueldo','number'],['estado','Estado']].map(([key,header,type])=>({key,header,type}));
  function csv(columns,data){
    const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    const safe=v=>/^[\s]*[=+@-]/.test(String(v))?"'"+v:v;
    return '\uFEFF'+[columns.map(c=>quote(c.header)).join(';'),...data.map(r=>columns.map(c=>{const v=r[c.key];return quote(c.type==='number'?(v==null?'':String(v).replace('.',',')):safe(v??''));}).join(';'))].join('\r\n');
  }
  function download(format,filename,columns,data,sheets){
    if(!data.length)throw Error('No hay datos para exportar.');
    if(format==='xlsx'){AuxiliosExcelExport.download({filename,sheets:sheets||[{name:'Sueldos',columns,rows:data}]});return;}
    const url=URL.createObjectURL(new Blob([csv(columns,data)],{type:'text/csv;charset=utf-8;'}));const link=document.createElement('a');link.href=url;link.download=filename+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function exportMonth(format){try{const data=rows.filter(l=>(!filter||l.estado===filter)&&String(l.chofer_nombre).toLowerCase().includes(search.toLowerCase()));download(format,'Sueldos_'+document.getElementById('pl-mes-periodo').value,exportColumns,data);}catch(e){toast(e.message,'error');}}
  function exportDetail(format){
    if(!detailData)return;
    try{const {logs,services,l}=detailData;
      const columns=[['fecha','Fecha'],['movil','Móvil'],['hora','Hora'],['numero','N° Servicio'],['patente','Patente'],['origen','Origen'],['destino','Destino'],['km','Km servicio (informativos)','number'],['venta','Venta / concepto'],['comision','Comisión','number'],['efectivo','Efectivo cobrado','number']].map(([key,header,type])=>({key,header,type}));
      const data=services.map(s=>{const j=logs.find(j=>j.log_id===s.r.log_id);return {fecha:j?.log_date,movil:j?.truck?.plate,hora:s.time,numero:s.r.nro_servicio||s.r.nro_remito,patente:s.r.patente,origen:s.r.origen,destino:s.r.destino,km:s.r.km_reales,venta:s.sales.map(x=>(x.concept_name||'')+' '+cash(x.total_amount)).join(' / '),comision:s.commission,efectivo:s.cash};});
      const journeys=logs.map(j=>{let km=null;try{km=PayrollMatrix.journeyKm(j);}catch{}return {fecha:j.log_date,movil:j.truck?.plate,inicio:j.km_inicio,fin:j.km_final,km,estado:j.status};});
      const jc=[['fecha','Fecha'],['movil','Móvil'],['inicio','Odómetro inicial','number'],['fin','Odómetro final','number'],['km','Km a liquidar','number'],['estado','Estado']].map(([key,header,type])=>({key,header,type}));
      download(format,'Sueldo_'+l.periodo_yyyymm+'_'+String(l.chofer_legajo||l.driver_id).replace(/[^a-z0-9_-]/gi,'_'),columns,format==='xlsx'?[l]:data,[{name:'Liquidación',columns:exportColumns,rows:[l]},{name:'Jornadas',columns:jc,rows:journeys},{name:'Servicios',columns,rows:data}]);
    }catch(e){toast(e.message,'error');}
  }
  function moveMonth(delta){const input=document.getElementById('pl-mes-periodo');if(!input.value)return;const [y,m]=input.value.split('-').map(Number),d=new Date(Date.UTC(y,m-1+delta,1));input.value=d.toISOString().slice(0,7);_cargarLiquidacionesMes();}
  window.PayrollView={compareCash,formula,csv,exportMonth,exportDetail,totals,render,open,moveMonth,serviceData,journey,serviceRow};
})();

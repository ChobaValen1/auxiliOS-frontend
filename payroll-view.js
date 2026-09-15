/* Payroll review: monthly cards and expandable daily source records. */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = v => Number(v) || 0;
  const fmt = v => num(v).toLocaleString('es-AR', {maximumFractionDigits:2});
  const cash = v => '$' + fmt(v);
  const date = v => v ? String(v).slice(0,10).split('-').reverse().join('/') : '—';
  let rows = [], active = null, request = 0, filter = '', search = '';
  const cell = (label,value) => `<div><small>${label}</small><strong>${value}</strong></div>`;
  function monthLabel() {
    const input = document.getElementById('pl-mes-periodo');
    const label = document.getElementById('pv-month');
    if(label && input?.value) label.textContent = new Date(input.value+'-15T12:00:00').toLocaleDateString('es-AR',{month:'long',year:'numeric'});
  }
  function render(data) {
    rows = data; request++; active = null; monthLabel();
    const sum = list => list.reduce((n,l)=>n+num(l.total),0);
    document.getElementById('pl-mes-stats').innerHTML = cell('Total del mes',cash(sum(rows)))+cell('Pendiente de pago',cash(sum(rows.filter(l=>l.estado!=='pagada'))))+cell('Pagado',cash(sum(rows.filter(l=>l.estado==='pagada'))));
    document.getElementById('pl-mes-body').innerHTML = `<div class="pv-tools"><input class="form-input" placeholder="Buscar chofer…" aria-label="Buscar chofer" id="pv-search"><select class="form-input" id="pv-filter" aria-label="Estado"><option value="">Todos los estados</option><option value="pendiente">Pendientes</option><option value="aprobada">Aprobadas</option><option value="pagada">Pagadas</option></select></div><div class="pv-layout"><div id="pv-cards"></div><aside id="pv-summary"><p>Seleccioná un chofer para revisar su liquidación.</p></aside></div><section id="pv-detail" hidden></section>`;
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
    document.getElementById('pv-summary').innerHTML=`<h3>${esc(l.chofer_nombre)}</h3><small>Importes guardados en la liquidación</small>${values.map(([label,v])=>`<div class="pv-payline"><span>${label}</span><b>${cash(v)}</b></div>`).join('')}<div class="pv-payline pv-total"><b>Total a pagar</b><strong>${cash(l.total)}</strong></div><div class="pv-actions"><button class="btn btn-ghost" id="pv-receipt">Ver recibo</button>${l.estado==='pendiente'?'<button class="btn btn-primary" id="pv-approve">Aprobar</button>':l.estado==='aprobada'?'<button class="btn btn-primary" id="pv-pay">Registrar pago</button>':''}</div>`;
    document.getElementById('pv-receipt').onclick=()=>_abrirReciboPayroll(l.liquidacion_id);
    const approve=document.getElementById('pv-approve'),pay=document.getElementById('pv-pay');
    if(approve)approve.onclick=()=>_cambiarEstadoLiq(l.liquidacion_id,'aprobada');
    if(pay)pay.onclick=()=>_marcarPagada(l.liquidacion_id);
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
  async function open(id){
    const l=rows.find(x=>x.liquidacion_id===id);if(!l)return;active=l;cards();summary(l);
    const token=++request,root=document.getElementById('pv-detail');root.hidden=false;root.innerHTML='<p role="status">Cargando jornadas, servicios y cobros…</p>';
    try{const data=await load(l);if(token!==request)return;const services=data.services.map(r=>serviceData(r,data.addons.get(r.remito_id),l,data.saleIds));
      root.innerHTML=`<div class="pv-detail-title"><div><h3>Jornadas de ${esc(l.chofer_nombre)}</h3><p>KM a liquidar = odómetro final − inicial. Los KM de los servicios son informativos.</p></div></div><div class="pv-journey-head"><span>Fecha</span><span>Móvil</span><span>Km jornada</span><span>Servicios</span><span>Ventas / comisiones</span><span>Efectivo cobrado</span></div>${data.logs.map(j=>journey(j,services.filter(s=>s.r.log_id===j.log_id))).join('')||'<p>No hay jornadas en este mes.</p>'}<p class="pv-note">Datos operativos actuales. Los importes aprobados se conservan en el recibo. Efectivo cobrado para rendir: ${cash(services.reduce((n,s)=>n+s.cash,0))}; consultá Rendiciones para conocer lo ya presentado.</p>${num(l.commission_total)&&!l.compensation_snapshot?.commission_details?.some(d=>d.record_details)?'<p class="pv-note">Esta liquidación anterior no tiene distribución de comisiones por servicio. El total guardado se consulta en el recibo.</p>':''}`;
      root.querySelectorAll('[data-remito]').forEach(b=>b.onclick=()=>abrirDetalleRemitoAdmin(Number(b.dataset.remito)));
    }catch(error){if(token!==request)return;root.innerHTML=`<p role="alert">No se pudo cargar el detalle: ${esc(error.message)}</p><button class="btn btn-ghost" id="pv-retry">Reintentar</button>`;document.getElementById('pv-retry').onclick=()=>open(id);}
  }
  function moveMonth(delta){const input=document.getElementById('pl-mes-periodo');if(!input.value)return;const [y,m]=input.value.split('-').map(Number),d=new Date(Date.UTC(y,m-1+delta,1));input.value=d.toISOString().slice(0,7);_cargarLiquidacionesMes();}
  window.PayrollView={render,open,moveMonth,serviceData,journey,serviceRow};
})();

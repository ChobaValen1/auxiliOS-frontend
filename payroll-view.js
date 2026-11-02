/* Payroll review: monthly cards and expandable daily source records. */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = v => Number(v) || 0;
  const fmt = v => num(v).toLocaleString('es-AR', {maximumFractionDigits:2});
  const cash = v => (num(v)<0?'−$':'$') + fmt(Math.abs(num(v)));
  const date = v => { if (!v) return '—'; const [y, m, d] = String(v).slice(0,10).split('-'); return y && m && d ? `${d}/${m}/${y.slice(2)}` : String(v); };
  let rows = [], active = null, request = 0, filter = '', search = '', detailData = null;
  const cell = (label,value) => `<div><small>${label}</small><strong>${value}</strong></div>`;
  function monthLabel() {
    const input = document.getElementById('pl-mes-periodo');
    const label = document.getElementById('pv-month');
    if(label && input?.value) label.textContent = new Date(input.value+'-15T12:00:00').toLocaleDateString('es-AR',{month:'long',year:'numeric'});
  }
  // Novedades del mes (las carga Administración) y recibo por líneas (lo arma la base).
  const NOV_TIPOS={bono:['Bono','haber'],horas_extra:['Horas extra','haber'],viatico:['Viático','haber'],adelanto:['Adelanto','descuento'],vale:['Vale','descuento'],descuento:['Descuento','descuento']};
  function linesHtml(lines,total){
    const part=(cat,title)=>{const list=lines.filter(x=>x.categoria===cat);if(!list.length)return'';return '<div class="pv-lines-group"><small class="pv-lines-title">'+title+'</small>'+list.map(x=>{const q=x.cantidad!=null&&x.valor!=null?fmt(x.cantidad)+' × '+cash(x.valor):x.detalle||'';return '<div class="pv-payline"><span>'+esc(x.concepto)+(x.origen==='novedad'?' <em class="pv-tag">novedad</em>':'')+(q?'<small class="pv-formula">'+esc(q)+'</small>':'')+'</span><b>'+(cat==='descuento'?'−':'')+cash(x.importe)+'</b></div>';}).join('')+'<div class="pv-payline pv-subtotal"><span>Total '+title.toLowerCase()+'</span><b>'+(cat==='descuento'?'−':'')+cash(list.reduce((n,x)=>n+num(x.importe),0))+'</b></div></div>';};
    return part('haber','Haberes')+part('descuento','Descuentos')+'<div class="pv-payline pv-total"><b>Total a pagar</b><strong>'+cash(total)+'</strong></div>';
  }
  function novedadesHtml(list,editable,estado){
    const rowsHtml=list.map(n=>{const [label,cat]=NOV_TIPOS[n.tipo]||[n.tipo,'haber'];return '<li><span><b>'+esc(n.concepto)+'</b><small>'+esc(label)+(n.fecha?' · '+date(n.fecha):'')+(n.nota?' · '+esc(n.nota):'')+'</small></span><b class="'+(cat==='descuento'?'pv-neg':'')+'">'+(cat==='descuento'?'−':'+')+cash(n.importe)+'</b>'+(editable?'<button class="pv-nov-del" type="button" data-nov="'+esc(n.novedad_id)+'" aria-label="Borrar '+esc(n.concepto)+'">×</button>':'')+'</li>';}).join('');
    const form=editable?'<form class="pv-nov-form" id="pv-nov-form" hidden><select class="form-input" id="pv-nov-tipo" aria-label="Tipo">'+Object.entries(NOV_TIPOS).map(([k,[label,cat]])=>'<option value="'+k+'">'+label+(cat==='descuento'?' (resta)':' (suma)')+'</option>').join('')+'</select><input class="form-input" id="pv-nov-concepto" maxlength="80" placeholder="Concepto" aria-label="Concepto" required><input class="form-input" id="pv-nov-importe" inputmode="decimal" placeholder="Importe" aria-label="Importe" required><input class="form-input" id="pv-nov-fecha" type="date" aria-label="Fecha (opcional)"><div class="pv-nov-actions"><button class="btn btn-ghost" type="button" id="pv-nov-cancel">Cancelar</button><button class="btn btn-primary" type="submit" id="pv-nov-save">Guardar</button></div><p id="pv-nov-error" role="alert"></p></form><button class="btn btn-ghost pv-nov-add" type="button" id="pv-nov-add">+ Agregar novedad</button>':(estado!=='pendiente'?'<small class="pv-note">Recibo '+esc(estado)+': para cambiar novedades, volvelo a pendiente.</small>':'');
    return '<div class="pv-novedades"><h4>Novedades del mes</h4>'+(list.length?'<ul class="pv-nov-list">'+rowsHtml+'</ul>':'<small class="pv-note">Sin adelantos, bonos ni descuentos cargados.</small>')+form+'</div>';
  }
  let extrasSeq=0;
  function canEditNovedades(l){return l.estado==='pendiente'&&(typeof PERFIL_USUARIO!=='undefined'&&PERFIL_USUARIO?.roles?.name==='administracion');}
  async function extras(l){
    const seq=++extrasSeq,box=document.getElementById('pv-novedades');
    try{
      const [lr,nr]=await Promise.all([_db.from('payroll_lineas').select('orden,categoria,origen,concepto,detalle,cantidad,valor,importe').eq('liquidacion_id',l.liquidacion_id).order('orden'),
        _db.from('payroll_novedades').select('novedad_id,tipo,concepto,importe,fecha,nota').eq('driver_id',l.driver_id).eq('periodo_yyyymm',l.periodo_yyyymm).order('created_at')]);
      if(lr.error)throw lr.error;if(nr.error)throw nr.error;
      if(seq!==extrasSeq||!document.getElementById('pv-lines'))return;
      if((lr.data||[]).length)document.getElementById('pv-lines').innerHTML=linesHtml(lr.data,l.total);
      l.novedades=nr.data||[];
      const editable=canEditNovedades(l);
      document.getElementById('pv-novedades').innerHTML=novedadesHtml(nr.data||[],editable,l.estado);
      if(editable)bindNovedades(l);
    }catch(e){if(seq===extrasSeq&&box?.isConnected)box.innerHTML='<p class="pv-review-warning">No se pudieron cargar las novedades. '+esc(e.message)+'</p>';}
  }
  async function refreshLiq(l){
    const fresh=await _db.from('payroll_liquidaciones').select('total,ajuste_rendiciones,cash_snapshot').eq('liquidacion_id',l.liquidacion_id).single();
    if(fresh.error)throw fresh.error;Object.assign(l,fresh.data);summary(l);if(review)loadReview(review.periodo).catch(()=>{});
  }
  function bindNovedades(l){
    const form=document.getElementById('pv-nov-form'),add=document.getElementById('pv-nov-add'),err=document.getElementById('pv-nov-error');
    add.onclick=()=>{form.hidden=false;add.hidden=true;document.getElementById('pv-nov-concepto').focus();};
    document.getElementById('pv-nov-tipo').onchange=e=>{const c=document.getElementById('pv-nov-concepto');if(!c.value)c.placeholder=NOV_TIPOS[e.target.value][0];};
    document.getElementById('pv-nov-cancel').onclick=()=>{form.hidden=true;add.hidden=false;err.textContent='';};
    form.onsubmit=async e=>{e.preventDefault();const save=document.getElementById('pv-nov-save');
      try{const tipo=document.getElementById('pv-nov-tipo').value,concepto=document.getElementById('pv-nov-concepto').value.trim()||NOV_TIPOS[tipo][0],importe=monthlyAmount(document.getElementById('pv-nov-importe').value),fecha=document.getElementById('pv-nov-fecha').value||null;
        if(!importe)throw new Error('Ingresá un importe mayor a cero.');
        save.disabled=true;save.textContent='Guardando…';
        const r=await _db.from('payroll_novedades').insert({driver_id:l.driver_id,periodo_yyyymm:l.periodo_yyyymm,tipo,concepto,importe,fecha});if(r.error)throw r.error;
        await refreshLiq(l);if(typeof toast==='function')toast('Novedad cargada · total '+cash(l.total),'success');
      }catch(x){err.textContent=x.message;save.disabled=false;save.textContent='Guardar';}};
    document.querySelectorAll('.pv-nov-del').forEach(b=>b.onclick=async()=>{
      if(!confirm('¿Borrar esta novedad?'))return;b.disabled=true;
      try{const r=await _db.from('payroll_novedades').delete().eq('novedad_id',b.dataset.nov);if(r.error)throw r.error;await refreshLiq(l);}
      catch(x){b.disabled=false;if(typeof toast==='function')toast(x.message,'error');}});
  }
  // Etapa 3 · el mes como unidad: pasos, totales, alertas y acciones en lote (todo por funciones de la base).
  let review=null,chip='';
  const PASOS=[['calculado','Calculado'],['en_revision','En revisión'],['aprobado','Aprobado'],['pagado','Pagado']];
  const isAdmin=()=>typeof PERFIL_USUARIO!=='undefined'&&PERFIL_USUARIO?.roles?.name==='administracion';
  function stepsHtml(paso){
    const idx={sin_calcular:-1,en_revision:1,aprobado:2,pagado:3}[paso]??-1;
    return '<ol class="pv-steps" aria-label="Pasos del mes">'+PASOS.map(([k,label],i)=>{const st=paso==='pagado'||i<idx?'done':i===idx?'cur':'';return '<li class="'+st+'"'+(st==='cur'?' aria-current="step"':'')+'><i>'+(st==='done'?'✓':i+1)+'</i>'+label+'</li>';}).join('')+'</ol>';
  }
  function rowState(f){
    if(f.estado==='sin_liquidacion')return['bad','Sin calcular'];
    if(f.estado==='pagada')return['ok','Pagado'];
    if(f.estado==='aprobada')return['mu','Aprobado'];
    return f.listo?['ok','Listo']:['wa','Revisar'];
  }
  function chipMatch(f){
    if(!chip)return true;
    if(chip==='revisar')return f.estado==='sin_liquidacion'||(f.estado==='pendiente'&&!f.listo);
    if(chip==='listo')return f.listo;
    return f.estado===chip;
  }
  function alertText(a){return a.tipo==='cambio'?'Cambió la información: recalculá el mes':a.texto;}
  function visible(){return (review?.filas||[]).filter(f=>chipMatch(f)&&String(f.full_name||'').toLowerCase().includes(search.toLowerCase()));}
  function reviewHtml(r){
    const f=r.filas||[],sum=(list,k)=>list.reduce((n,x)=>n+num(x[k]),0),neto=sum(f,'neto');
    const listos=f.filter(x=>x.listo),aprob=f.filter(x=>x.estado==='aprobada'),count=fn=>f.filter(fn).length;
    const prev=num(r.prev_neto),vs=prev>0?(neto-prev)*100/prev:null;
    const kpi=(label,val,cls='')=>'<div class="pv-kpi '+cls+'"><small>'+label+'</small><b>'+val+'</b></div>';
    const chips=[['','Todos',f.length],['revisar','Para revisar',count(x=>x.estado==='sin_liquidacion'||(x.estado==='pendiente'&&!x.listo))],['listo','Listos',listos.length],['aprobada','Aprobados',aprob.length],['pagada','Pagados',count(x=>x.estado==='pagada')]];
    const admin=isAdmin();
    const actions=admin?'<button class="btn btn-ghost" id="pv-calc">'+(r.paso==='sin_calcular'?'Calcular el mes':'Recalcular')+'</button><button class="btn btn-ghost" id="pv-xlsx-mes">Excel del mes</button><button class="btn btn-ghost" id="pv-pdf-mes">Planilla PDF</button>'+(aprob.length?'<button class="btn btn-ghost" id="pv-pay-all">Pagar '+aprob.length+' aprobado'+(aprob.length===1?'':'s')+'</button>':'')+'<button class="btn btn-primary" id="pv-approve-all"'+(listos.length?'':' disabled')+'>Aprobar '+listos.length+' listo'+(listos.length===1?'':'s')+'</button>':'<button class="btn btn-ghost" id="pv-xlsx-mes">Excel del mes</button><button class="btn btn-ghost" id="pv-pdf-mes">Planilla PDF</button>';
    const calc=r.corrida?.calculada_at?'Calculado el '+new Date(r.corrida.calculada_at).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+(r.corrida.calculada_por?' por '+esc(r.corrida.calculada_por):''):'Todavía no se calculó este mes.';
    return '<div class="pv-kpis">'+kpi('Neto a pagar',cash(neto),'pv-kpi--main')+kpi('Haberes',cash(sum(f,'haberes')))+kpi('Descuentos',(sum(f,'descuentos')?'−':'')+cash(sum(f,'descuentos')),'pv-kpi--neg')+kpi('Choferes',f.length+' <span>· '+listos.length+' listos</span>')+kpi('Vs. mes anterior',vs===null?'—':(vs>=0?'+':'−')+fmt(Math.abs(Math.round(vs*10)/10))+' %',vs===null?'':vs>=0?'pv-kpi--up':'pv-kpi--down')+'</div>'
      +'<div class="pv-bar"><div class="pv-chips" role="group" aria-label="Filtrar">'+chips.map(([k,label,n])=>'<button class="pv-chip'+(chip===k?' on':'')+'" data-chip="'+k+'" aria-pressed="'+(chip===k)+'">'+label+' <span>'+n+'</span></button>').join('')+'</div><input class="form-input" placeholder="Buscar chofer…" aria-label="Buscar chofer" id="pv-search"><div class="pv-actions">'+actions+'</div></div>'
      +'<div class="pv-table-wrap"><table class="pv-table"><thead><tr><th>Chofer</th><th class="n">Días</th><th class="n pv-hide-sm">Km</th><th class="n pv-hide-sm">Serv.</th><th class="n pv-hide-sm">Haberes</th><th class="n pv-hide-sm">Desc.</th><th class="n">Neto</th><th>Estado</th></tr></thead><tbody id="pv-rows"></tbody></table></div>'
      +'<p class="pv-note pv-run">'+calc+(r.sin_esquema?.length?' · Sin esquema salarial: '+r.sin_esquema.map(esc).join(', ')+'.':'')+'</p>';
  }
  function rowsHtml(){
    const list=visible();
    if(!list.length)return '<tr><td colspan="8" class="pv-empty">'+(review?.filas?.length?'No hay choferes con este filtro.':'Sin choferes para este mes.')+'</td></tr>';
    return list.map(f=>{const [cls,label]=rowState(f),al=f.alertas||[];
      return '<tr'+(f.liquidacion_id?' data-id="'+esc(f.liquidacion_id)+'" tabindex="0"':'')+' class="'+(active?.liquidacion_id&&active.liquidacion_id===f.liquidacion_id?'sel':'')+'"><td><b>'+esc(f.full_name)+'</b>'+al.map(a=>'<small class="pv-alert '+(a.nivel==='bad'?'bad':'')+'">⚠ '+esc(alertText(a))+'</small>').join('')+'</td><td class="n">'+fmt(f.jornadas)+'</td><td class="n pv-hide-sm">'+fmt(f.km_total)+'</td><td class="n pv-hide-sm">'+fmt(f.servicios)+'</td><td class="n pv-hide-sm">'+fmt(f.haberes)+'</td><td class="n pv-hide-sm">'+(num(f.descuentos)?'−'+fmt(f.descuentos):'0')+'</td><td class="n"><b>'+fmt(f.neto)+'</b></td><td><span class="pv-pill '+cls+'">'+label+'</span></td></tr>';}).join('');
  }
  function cards(){
    const body=document.getElementById('pv-rows');if(!body)return;
    body.innerHTML=rowsHtml();
    body.querySelectorAll('tr[data-id]').forEach(tr=>{tr.onclick=()=>open(tr.dataset.id);tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(tr.dataset.id);}};});
  }
  function bindReview(){
    const input=document.getElementById('pv-search');input.value=search;input.oninput=()=>{search=input.value;cards();};
    document.querySelectorAll('.pv-chip').forEach(b=>b.onclick=()=>{chip=b.dataset.chip;document.querySelectorAll('.pv-chip').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',String(x===b));});cards();});
    const calc=document.getElementById('pv-calc');if(calc)calc.onclick=()=>_generarLiquidacionesMes();
    const xl=document.getElementById('pv-xlsx-mes');if(xl)xl.onclick=()=>PayrollExport.run(xl,()=>PayrollExport.excelMes(review.periodo));
    const pm=document.getElementById('pv-pdf-mes');if(pm)pm.onclick=()=>PayrollExport.run(pm,()=>PayrollExport.planillaPdf(review.periodo));
    const ap=document.getElementById('pv-approve-all');if(ap)ap.onclick=()=>{const ids=(review.filas||[]).filter(f=>f.listo).map(f=>f.liquidacion_id);if(ids.length&&confirm('¿Aprobar '+ids.length+' recibo'+(ids.length===1?'':'s')+' sin alertas? Los importes quedan congelados.'))approveIds(ids);};
    const pay=document.getElementById('pv-pay-all');if(pay)pay.onclick=()=>payDialog((review.filas||[]).filter(f=>f.estado==='aprobada').map(f=>({id:f.liquidacion_id,name:f.full_name,total:f.neto})));
  }
  async function loadReview(period){
    const token=++reviewSeq;
    const r=await _db.rpc('payroll_revision_mes_v1',{p_period:period});
    if(token!==reviewSeq)return;
    if(r.error)throw r.error;
    review=r.data;
    const steps=document.getElementById('pl-mes-stats');if(steps)steps.innerHTML=stepsHtml(review.paso);
    document.getElementById('pl-mes-body').innerHTML=reviewHtml(review);bindReview();cards();
  }
  let reviewSeq=0;
  function render(data) {
    closeDetail(); rows = data; request++; active = null; monthLabel();
    const input=document.getElementById('pl-mes-periodo'),period=input?.value?Number(input.value.replace('-','')):null;
    if(!period)return;
    document.getElementById('pl-mes-body').innerHTML='<p role="status" class="pv-note">Cargando revisión del mes…</p>';
    loadReview(period).catch(e=>{document.getElementById('pl-mes-body').innerHTML='<p role="alert">No se pudo cargar la revisión del mes: '+esc(e.message)+'</p>';});
  }
  const reload=()=>typeof _cargarLiquidacionesMes==='function'&&_cargarLiquidacionesMes();
  async function approveIds(ids){
    try{const r=await _db.rpc('payroll_aprobar_v1',{p_ids:ids});if(r.error)throw r.error;
      const salt=r.data.saltadas||[];toast('Aprobados: '+r.data.aprobadas+(salt.length?' · no aprobados: '+salt.length+' ('+salt[0].motivo+')':''),salt.length?'warning':'success',6000);
    }catch(e){toast(e.message,'error');}
    closeDetail();reload();
  }
  function ensureDialog(id){let d=document.getElementById(id);if(!d){d=document.createElement('dialog');d.id=id;d.className='pv-dialog';document.body.appendChild(d);}return d;}
  function todayAR(){return new Date(Date.now()-3*3600e3).toISOString().slice(0,10);}
  function payDialog(items){
    if(!items.length)return;
    const d=ensureDialog('pv-pay-dialog'),total=items.reduce((n,x)=>n+num(x.total),0);
    d.innerHTML='<form method="dialog" id="pv-pay-form"><h3>Registrar pago</h3><p class="pv-note">'+items.length+' recibo'+(items.length===1?'':'s')+' · <b>'+cash(total)+'</b>'+(items.length<=4?' · '+items.map(x=>esc(x.name)).join(', '):'')+'</p>'
      +'<label class="form-label" for="pv-pay-metodo">Método</label><select class="form-input" id="pv-pay-metodo"><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="mixto">Mixto</option><option value="otro">Otro</option></select>'
      +'<label class="form-label" for="pv-pay-fecha">Fecha de pago</label><input class="form-input" type="date" id="pv-pay-fecha" value="'+todayAR()+'" max="'+todayAR()+'" required>'
      +'<label class="form-label" for="pv-pay-ref">Comprobante (opcional)</label><input class="form-input" id="pv-pay-ref" maxlength="120" placeholder="N.º de operación o nota">'
      +'<p id="pv-pay-error" role="alert"></p><div class="pv-dialog-actions"><button class="btn btn-ghost" type="button" id="pv-pay-cancel">Cancelar</button><button class="btn btn-primary" type="submit" id="pv-pay-ok">Confirmar pago</button></div></form>';
    d.querySelector('#pv-pay-cancel').onclick=()=>d.close();
    d.querySelector('#pv-pay-form').onsubmit=async e=>{e.preventDefault();const ok=d.querySelector('#pv-pay-ok'),err=d.querySelector('#pv-pay-error');ok.disabled=true;ok.textContent='Guardando…';
      try{const r=await _db.rpc('payroll_pagar_v1',{p_ids:items.map(x=>x.id),p_metodo:d.querySelector('#pv-pay-metodo').value,p_fecha:d.querySelector('#pv-pay-fecha').value,p_referencia:d.querySelector('#pv-pay-ref').value.trim()||null});if(r.error)throw r.error;
        const salt=r.data.saltadas||[];d.close();toast('Pagados: '+r.data.pagadas+(salt.length?' · sin pagar: '+salt.length:''),salt.length?'warning':'success',6000);closeDetail();reload();
      }catch(x){err.textContent=x.message;ok.disabled=false;ok.textContent='Confirmar pago';}};
    d.showModal();
  }
  function reopenDialog(l){
    const d=ensureDialog('pv-reopen-dialog');
    d.innerHTML='<form method="dialog" id="pv-reopen-form"><h3>Reabrir recibo</h3><p class="pv-note">'+esc(l.chofer_nombre||'')+' · '+cash(l.total)+'. Vuelve a pendiente'+(l.estado==='pagada'?' y se borra el pago registrado':'')+'. El motivo queda registrado.</p><label class="form-label" for="pv-reopen-motivo">Motivo</label><textarea class="form-input" id="pv-reopen-motivo" rows="3" minlength="5" maxlength="300" required placeholder="Ej.: faltó cargar un adelanto"></textarea><p id="pv-reopen-error" role="alert"></p><div class="pv-dialog-actions"><button class="btn btn-ghost" type="button" id="pv-reopen-cancel">Cancelar</button><button class="btn btn-primary" type="submit" id="pv-reopen-ok">Reabrir</button></div></form>';
    d.querySelector('#pv-reopen-cancel').onclick=()=>d.close();
    d.querySelector('#pv-reopen-form').onsubmit=async e=>{e.preventDefault();const ok=d.querySelector('#pv-reopen-ok'),err=d.querySelector('#pv-reopen-error');ok.disabled=true;
      try{const r=await _db.rpc('payroll_reabrir_v1',{p_id:l.liquidacion_id,p_motivo:d.querySelector('#pv-reopen-motivo').value});if(r.error)throw r.error;d.close();toast('Recibo reabierto','success');closeDetail();reload();}
      catch(x){err.textContent=x.message;ok.disabled=false;}};
    d.showModal();d.querySelector('#pv-reopen-motivo').focus();
  }
  function summary(l){
    const values=[['Sueldo básico',l.sueldo_basico],[l.compensation_snapshot?.km_basis==='billed'?'Km facturados (histórico)':'Kilómetros de jornadas',l.adic_km],['Servicios',l.adic_serv],['Comisiones',l.commission_total],['Bonos mensuales',l.bonus_monthly],['Presentismo',l.bono_presentismo],...(num(l.bonos_objetivos)?[['Objetivos (histórico)',l.bonos_objetivos]]:[]),['Descuento por rendición',-num(l.ajuste_rendiciones)]];
    document.getElementById('pv-summary').innerHTML=`<h3>${esc(l.chofer_nombre)}</h3><small>Importes guardados en la liquidación</small><div id="pv-commission-check"></div><div id="pv-lines">${values.map(([label,v])=>`<div class="pv-payline"><span>${label}${formula(l,label)}</span><b>${cash(v)}</b></div>`).join('')}<div class="pv-payline pv-total"><b>Total a pagar</b><strong>${cash(l.total)}</strong></div></div><div id="pv-novedades"></div>`;
    if(l.liquidacion_id)extras(l);
    document.getElementById('pv-audit-button').onclick=()=>audit(l);
    const approve=document.getElementById('pv-approve'),pay=document.getElementById('pv-pay');
    if(approve)approve.onclick=()=>approveIds([l.liquidacion_id]);
    if(pay)pay.onclick=()=>payDialog([{id:l.liquidacion_id,name:l.chofer_nombre,total:l.total}]);
    const pending=document.getElementById('pv-pending');
    if(pending)pending.onclick=()=>reopenDialog(l);
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
  function monthlyAmount(value){
    const raw=String(value).trim();if(!raw)return null;
    if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(raw))throw new Error('Ingresá un importe válido, por ejemplo 50.000 o 50.000,50');
    const amount=Number(raw.replace(/\./g,'').replace(',','.'));if(!Number.isFinite(amount)||amount>999999999999.99)throw new Error('Importe fuera de rango');return amount;
  }
  async function audit(l){
    const root=document.getElementById('pv-audit'),detail=document.getElementById('pv-detail'),token=request;
    detail.hidden=true;root.hidden=false;root.innerHTML='<button class="btn btn-ghost" id="pv-back">‹ Volver a jornadas</button><div id="pv-audit-content" role="status">Cargando rendiciones…</div>';
    document.getElementById('pv-back').onclick=()=>{root.hidden=true;detail.hidden=false;};
    const body=document.getElementById('pv-audit-content');
    const stamp=v=>v?new Date(v).toLocaleString('es-AR'):'—';
    const meta='<h3>Datos del recibo</h3><dl class="pv-metadata">'+[['N.º',String(l.liquidacion_id).slice(-8).toUpperCase()],['Emisión',stamp(l.generada_at)],['Generado por',l.generador_nombre],['Aprobación',stamp(l.aprobada_at)],['Aprobado por',l.aprobador_nombre],['Pago',stamp(l.pagada_at)],['Método de pago',l.pagada_metodo],['Notas',l.notas]].map(([k,v])=>'<dt>'+k+'</dt><dd>'+esc(v||'—')+'</dd>').join('')+'</dl>';
    try{
      const response=await _db.rpc('get_payroll_monthly_cash_v2',{p_driver:l.driver_id,p_period:l.periodo_yyyymm});
      if(response.error)throw response.error;
      if(token!==request)return;
      const m=response.data;
      body.innerHTML='<div class="pv-audit-hero"><div><span class="pv-audit-kicker">Control mensual</span><h3>Rendición de efectivo</h3><p>Administración registra una única entrega por chofer y mes.</p></div><div class="pv-audit-hero-total"><small>A presentar</small><b>'+cash(m.due)+'</b></div></div><section class="pv-audit-card"><h4>Detalle por jornada</h4><table class="pv-services"><thead><tr><th>Fecha</th><th>Esperado</th><th>Gastos en efectivo</th></tr></thead><tbody>'+m.days.map(d=>'<tr><td>'+date(d.fecha)+'</td><td>'+cash(d.expected)+'</td><td>'+cash(d.expenses)+'</td></tr>').join('')+'</tbody><tfoot><tr><th>Total</th><th>'+cash(m.expected)+'</th><th>'+cash(m.expenses)+'</th></tr></tfoot></table></section><section class="pv-audit-card pv-audit-entry"><div class="pv-payline"><span>Efectivo a presentar</span><b>'+cash(m.due)+'</b></div><label class="form-label" for="pv-presented">Total presentado del mes</label><div class="pv-audit-input-row"><input class="form-input" id="pv-presented" inputmode="decimal" placeholder="Pendiente de rendición" value="'+(m.presented===null?'':fmt(m.presented))+'"><button class="btn btn-primary" id="pv-save-cash">Guardar total</button></div><p id="pv-cash-result" role="status"></p><p id="pv-cash-error" role="alert"></p><small>Los gastos incluyen combustible, peajes pagados en efectivo y gastos extra registrados una sola vez.</small><div class="pv-payline"><span>Descuento guardado en el recibo</span><b>'+cash(l.ajuste_rendiciones)+'</b></div>'+(l.liquidacion_id&&l.estado!=='pendiente'?'<p class="pv-review-warning">El recibo aprobado o pagado conserva sus importes. Una modificación requiere revisión.</p>':'')+'</section><section class="pv-audit-card"><h4>Bonos y comisiones</h4>'+(l.liquidacion_id?PayrollMatrix.receiptHtml(l)+meta:'<p>El importe queda registrado para la liquidación de este chofer y mes.</p>')+'</section>';
      const input=document.getElementById('pv-presented'),result=document.getElementById('pv-cash-result'),save=document.getElementById('pv-save-cash'),error=document.getElementById('pv-cash-error');
      const preview=()=>{try{const value=monthlyAmount(input.value);result.textContent=value===null?'Pendiente de rendición · sin descuento':value<m.due?'Faltante: '+cash(m.due-value):value>m.due?'Sobrante: '+cash(value-m.due):'Rendición saldada';error.textContent='';return value;}catch(e){error.textContent=e.message;result.textContent='';throw e;}};
      input.oninput=()=>{try{preview();}catch{}};preview();
      if(m.can_edit===false){input.disabled=true;save.hidden=true;error.textContent="Solo Administración puede registrar el total presentado.";}
      save.onclick=async()=>{try{const value=preview();save.disabled=true;save.textContent='Guardando…';const r=await _db.rpc('save_payroll_monthly_cash_v2',{p_driver:l.driver_id,p_period:l.periodo_yyyymm,p_presented:value,p_updated_at:m.updated_at});if(r.error)throw r.error;if(token!==request)return;m.updated_at=r.data.updated_at;m.presented=r.data.presented;if(l.liquidacion_id&&l.estado==='pendiente'){const fresh=await _db.from('payroll_liquidaciones').select('total,ajuste_rendiciones,cash_snapshot').eq('liquidacion_id',l.liquidacion_id).single();if(fresh.error)throw fresh.error;Object.assign(l,fresh.data);summary(l);document.getElementById('pv-audit-button').disabled=false;cards();}const backHidden=document.getElementById('pv-back')?.hidden;await audit(l);if(backHidden)document.getElementById('pv-back').hidden=true;document.getElementById('pv-cash-error').textContent='Guardado correctamente';}catch(e){if(token===request)error.textContent=e.message;}finally{if(token===request){save.disabled=false;save.textContent='Guardar total presentado';}}};
    }catch(e){if(token===request)body.innerHTML='<p role="alert">No se pudieron cargar las rendiciones: '+esc(e.message)+'</p>'+meta;}
  }
  async function checkCommissions(l,token){
    const matrix=l.compensation_snapshot;
    if(!matrix?.commissions?.length)return;
    const box=document.getElementById('pv-commission-check');
    try{
      const period=String(l.periodo_yyyymm),year=Number(period.slice(0,4)),month=Number(period.slice(4));
      const r=await _db.rpc('get_payroll_matrix_sources_v3',{p_driver:l.driver_id,p_from:year+'-'+String(month).padStart(2,'0')+'-01',p_until:new Date(Date.UTC(year,month,1)).toISOString().slice(0,10)});if(r.error)throw r.error;
      const result=PayrollMatrix.calculate(matrix,r.data,num(l.km_total));
      const ids=details=>details.flatMap(d=>(d.records||[]).map(id=>d.source+':'+id)).sort().join('|');
      if(token!==request)return;
      if(Math.abs(result.commission-num(l.commission_total))>.01||(matrix.operator_sales_v3&&ids(result.snapshot.commission_details)!==ids(matrix.commission_details||[])))box.innerHTML='<p class="pv-review-warning">Ventas modificadas: revisar comisiones. Guardado '+cash(l.commission_total)+' · cálculo actual '+cash(result.commission)+'.</p>';
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
    // Cobros de servicios particulares (saldo pagado al chofer en el lugar).
    const collections=new Map();
    for(let i=0;i<services.length;i+=500){const response=await _db.rpc('get_private_collections_by_remitos_v1',{p_remito_ids:services.slice(i,i+500).map(r=>r.remito_id)});if(response.error)throw response.error;for(const c of response.data||[])if(c.status!=='rejected')collections.set(c.remito_id,c);}
    const completed=await window.CompletedJourneyServices.list(_db,logs,{driver:l.driver_id,period:l.periodo_yyyymm});
    services=window.CompletedJourneyServices.merge(services,completed);
    return {logs,services,addons,saleIds,collections};
  }
  const isPrivateCash=x=>x.method==='cash';
  function serviceData(r,addons,l,saleIds=new Set(),collection=null){
    const a=addons||{},extras=a.excesses||[],tolls=a.tolls||[];
    const isCash=x=>x.customer_payment_method==='cash';
    /* Cobro al cliente con dos medios: el efectivo es la parte en efectivo del total (principal o segundo medio). */
    const cp=a.customer_payment&&a.customer_payment.primary?a.customer_payment:null;
    const splitCash=total=>{const second=num(cp.secondary_amount);return(cp.primary==='cash'?Math.max(0,total-(cp.secondary?second:0)):0)+(cp.secondary==='cash'?second:0);};
    const chargedTolls=tolls.filter(x=>x.customer_payment_method).reduce((n,x)=>n+num(x.total_amount),0),chargedExtras=extras.filter(x=>x.customer_payment_method).reduce((n,x)=>n+num(x.total_amount),0);
    const tollCash=cp?splitCash(chargedTolls+chargedExtras):tolls.filter(isCash).reduce((n,x)=>n+num(x.total_amount),0);
    const extraCash=cp?0:extras.filter(isCash).reduce((n,x)=>n+num(x.total_amount),0);
    const legacyCash=[1,2].reduce((n,i)=>n+(['cash','efectivo'].includes(r['pago_'+i+'_metodo'])?num(r['pago_'+i+'_monto']):0),0);
    const structured=tolls.length+extras.length>0;
    const privateCash=(collection?.lines||[]).filter(isPrivateCash).reduce((n,x)=>n+num(x.amount),0);
    const details=l.compensation_snapshot?.commission_details||[];
    const sales=extras.filter(x=>saleIds.has(x.concept_id)||details.some(d=>d.concept_id===x.concept_id));
    for(const d of details.filter(d=>d.source==='invoices'||d.source==='captacion')){for(const x of d.record_details||[]){if(x.service_id&&x.service_id===r.operator_service_id)sales.push({concept_name:d.name,total_amount:x.amount,evidence:[]});}}
    const records=details.flatMap(d=>(d.record_details||[]).filter(x=>(r.remito_id!=null&&String(x.remito_id)===String(r.remito_id))||(x.service_id&&x.service_id===r.operator_service_id)).map(x=>num(x.total)));
    const time=r.created_at_device?new Date(r.created_at_device).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Argentina/Buenos_Aires'}):'—';
    return {r,time,sales,commission:records.reduce((n,v)=>n+v,0),cash:r.no_remito?num(r.cash_expected):(structured?tollCash+extraCash:legacyCash)+privateCash,tollCash,extraCash,privateCash,structured,extras};
  }
  function serviceRow(s){
    const {r}=s;
    const commission=s.commission?cash(s.commission):s.sales.length?'<span class="pv-no-commission">—<small>Venta sin comisión configurada</small></span>':'—';
    const target=r.no_remito?`data-service="${esc(r.operator_service_id)}"`:`data-remito="${Number(r.remito_id)}"`;
    const state=r.no_remito?(r.document_status==='exception_approved'?'Finalizado · excepción aprobada':'Finalizado · sin remito'):r.status;
    return `<tr><td data-label="Hora">${esc(s.time)}</td><td data-label="N° Servicio"><button class="pv-link" ${target}>${esc(r.nro_servicio||r.nro_remito||r.remito_id)}</button><small>${esc(state)}</small></td><td data-label="Patente">${esc(r.patente||'—')}</td><td data-label="Origen">${esc(r.origen||'—')}</td><td data-label="Destino">${esc(r.destino||'—')}</td><td data-label="Km informativos">${r.km_reales==null?'—':fmt(r.km_reales)}<small>${r.no_remito?'Recorrido':'Reales'} · informativos</small></td><td data-label="Venta / concepto">${s.sales.map(x=>`${esc(x.concept_name)} · ${cash(x.total_amount)}<br><button class="pv-link" ${target}>${r.no_remito?'Ver servicio':x.evidence?.length?'Ver comprobantes':'Ver remito'}</button>`).join('<br>')||'—'}</td><td data-label="Comisión">${commission}</td><td data-label="Efectivo esperado"><b>${cash(s.cash)}</b><small>${r.no_remito?'Cobros operativos confirmados':s.structured?`Peajes ${cash(s.tollCash)}<br>Excedentes ${cash(s.extraCash)}`:'Cobro histórico sin desglose'}</small><small>Cobrado para rendir</small></td></tr>`;
  }
  function unlinkedServices(logs,services){
    const ids=new Set(logs.map(j=>j.log_id)),unlinked=services.filter(s=>!ids.has(s.r.log_id));
    if(!unlinked.length)return'';
    return '<section class="pv-journey"><h4>Servicios sin jornada en este período ('+unlinked.length+')</h4><p class="pv-note">Cuentan por su finalización. No se asignó una jornada por fecha.</p><div class="pv-scroll"><table class="pv-services"><tbody>'+unlinked.map(serviceRow).join('')+'</tbody></table></div></section>';
  }
  function journey(j,services){
    let km=null;try{km=PayrollMatrix.journeyKm(j);}catch{}
    const money=services.reduce((n,s)=>n+s.cash,0),commission=services.reduce((n,s)=>n+s.commission,0);
    return `<details class="pv-journey"><summary><span>${date(j.log_date)}</span><b>${esc(j.truck?.plate||'—')}</b><span>${km==null?'—':fmt(km)} km<small>${j.status==='closed'?'A liquidar':'Jornada abierta'}</small></span><span>${services.length} servicios</span><span>${services.reduce((n,s)=>n+s.sales.length,0)} ventas<small>${cash(commission)} comisión</small></span><b>${cash(money)}</b></summary><div class="pv-odometer">Odómetro inicial: <b>${j.km_inicio==null?'—':fmt(j.km_inicio)}</b> → Final: <b>${j.km_final==null?'—':fmt(j.km_final)}</b> = <b>${km==null?'Pendiente de cierre o revisión':fmt(km)+' km a liquidar'}</b></div><div class="pv-scroll"><table class="pv-services"><thead><tr>${['Hora','N° Servicio','Patente','Origen','Destino','Km informativos','Venta / concepto','Comisión','Efectivo esperado'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${services.map(serviceRow).join('')||'<tr><td colspan="9">Sin servicios vinculados a esta jornada.</td></tr>'}</tbody><tfoot><tr><td colspan="7">Total jornada · ${km==null?'—':fmt(km)} km por odómetro</td><td>${cash(commission)}</td><td>${cash(money)}</td></tr></tfoot></table></div></details>`;
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
    const stateAction=!isAdmin()?'':l.estado==='pendiente'?'<button class="btn btn-primary" id="pv-approve">Aprobar</button>':l.estado==='aprobada'?'<button class="btn btn-primary" id="pv-pay">Registrar pago</button><button class="btn btn-ghost" id="pv-pending">Reabrir</button>':l.estado==='pagada'?'<button class="btn btn-ghost" id="pv-pending">Reabrir</button>':'';
    modal.innerHTML=`<header class="pv-modal-header"><div><h2 id="pv-modal-title">${esc(l.chofer_nombre)}</h2><p>${esc(l.chofer_legajo||'')} · ${esc(month)}</p></div><button class="btn btn-ghost" id="pv-modal-close" aria-label="Cerrar detalle">×</button></header><div class="pv-modal-body"><div class="pv-modal-columns"><section id="pv-detail"></section><section id="pv-audit" hidden></section><aside class="pv-salary"><h3>Liquidación y recibo</h3><div id="pv-summary"></div><div class="pv-export-footer"><div class="pv-action-row"><button class="btn btn-ghost" id="pv-audit-button" disabled>Rendiciones y datos</button>${stateAction}</div><div class="pv-action-row pv-action-row--exports"><button class="btn btn-ghost" id="pv-export-xlsx" disabled>Exportar Excel</button><button class="btn btn-ghost" id="pv-pdf">Recibo PDF</button></div></div></aside></div></div>`;
    document.getElementById('pv-modal-close').onclick=closeDetail;
    if(!modal.open)modal.showModal();
    detailData=null;
    document.getElementById('pv-export-xlsx').onclick=()=>exportDetail('xlsx');
    const pdfBtn=document.getElementById('pv-pdf');pdfBtn.onclick=()=>PayrollExport.run(pdfBtn,()=>PayrollExport.reciboPdf(l));
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
  async function openCash(driver,period,name){
    const list=await cargarLiquidacionesMes(period);
    const l=list.find(x=>x.driver_id===driver)||{driver_id:driver,periodo_yyyymm:period,chofer_nombre:name,estado:'sin_liquidacion'};
    createDetail(l);++request;
    if(!l.liquidacion_id){document.querySelector('#pv-driver-modal .pv-salary').hidden=true;document.querySelector('#pv-driver-modal .pv-modal-columns').style.gridTemplateColumns='1fr';}
    document.getElementById('pv-audit-button').disabled=false;
    await audit(l);
    const back=document.getElementById('pv-back');if(back)back.hidden=true;
  }
  async function open(id){
    const l=rows.find(x=>x.liquidacion_id===id);if(!l)return;active=l;cards();
    const root=createDetail(l),token=++request;checkCommissions(l,token);root.innerHTML='<p role="status">Cargando jornadas, servicios y cobros…</p>';
    try{const data=await load(l);if(token!==request)return;const services=data.services.map(r=>serviceData(r,data.addons.get(r.remito_id),l,data.saleIds,data.collections.get(r.remito_id)));
      detailData={...data,services,l};
      document.getElementById('pv-export-xlsx').disabled=false;document.getElementById('pv-audit-button').disabled=false;
      root.innerHTML=`<div class="pv-detail-title"><div><h3>Jornadas de ${esc(l.chofer_nombre)}</h3><p>KM a liquidar = odómetro final − inicial. Los KM de los servicios son informativos.</p></div></div><div class="pv-journey-head"><span>Fecha</span><span>Móvil</span><span>Km jornada</span><span>Servicios</span><span>Ventas / comisiones</span><span>Efectivo esperado</span></div><div class="pv-journey-list">${data.logs.map(j=>journey(j,services.filter(s=>s.r.log_id===j.log_id))).join('')||'<p>No hay jornadas en este mes.</p>'}${unlinkedServices(data.logs,services)}</div>${renderTotals(data.logs,services,l)}<p class="pv-note">Datos operativos actuales. Los importes aprobados se conservan en el recibo. Efectivo esperado para rendir: ${cash(services.reduce((n,s)=>n+s.cash,0))}; consultá Rendiciones para conocer lo ya presentado.</p>${num(l.commission_total)&&!l.compensation_snapshot?.commission_details?.some(d=>d.record_details)?'<p class="pv-note">Esta liquidación anterior no tiene distribución de comisiones por servicio. El total guardado se consulta en el recibo.</p>':''}`;
      root.querySelectorAll('[data-remito]').forEach(b=>b.onclick=()=>{closeDetail();abrirDetalleRemitoAdmin(Number(b.dataset.remito));});
      root.querySelectorAll('[data-service]').forEach(b=>b.onclick=()=>{closeDetail();window.verServicioOperador(b.dataset.service);});
    }catch(error){if(token!==request)return;root.innerHTML=`<p role="alert">No se pudo cargar el detalle: ${esc(error.message)}</p><button class="btn btn-ghost" id="pv-retry">Reintentar</button>`;document.getElementById('pv-retry').onclick=()=>open(id);}
  }
  const exportColumns=[['chofer_nombre','Chofer'],['chofer_legajo','Legajo'],['periodo_yyyymm','Período'],['jornadas','Jornadas','number'],['km_total','Km liquidados','number'],['servicios','Servicios','number'],['sueldo_basico','Básico','number'],['adic_km','Pago por km','number'],['adic_serv','Pago por servicios','number'],['bonus_monthly','Bonos mensuales','number'],['commission_total','Comisiones','number'],['bono_presentismo','Presentismo','number'],['ajuste_rendiciones','Descuento rendición','number'],['total','Total sueldo','number'],['estado','Estado']].map(([key,header,type])=>({key,header,type}));
  function csv(columns,data){
    const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    const safe=v=>/^[\s]*[=+@-]/.test(String(v))?"'"+v:v;
    return '\uFEFF'+[columns.map(c=>quote(c.header)).join(';'),...data.map(r=>columns.map(c=>{const v=r[c.key];return quote(c.type==='number'?(v==null?'':String(v).replace('.',',')):safe(v??''));}).join(';'))].join('\r\n');
  }
  function download(format,filename,columns,data,sheets){
    if(!data.length)throw Error('No hay datos para exportar.');
    const detalle=`${data.length} registro${data.length===1?'':'s'} exportado${data.length===1?'':'s'}`;
    if(format==='xlsx'){AuxiliosExcelExport.download({filename,sheets:sheets||[{name:'Sueldos',columns,rows:data}],detalle});return;}
    const url=URL.createObjectURL(new Blob([csv(columns,data)],{type:'text/csv;charset=utf-8;'}));const link=document.createElement('a');link.href=url;link.download=filename+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    if(typeof window.confirmarDescarga==='function')window.confirmarDescarga(filename+'.csv',detalle);
  }
  function exportMonth(format){try{const ids=review?new Set(visible().map(f=>f.liquidacion_id)):null;const data=rows.filter(l=>(ids?ids.has(l.liquidacion_id):true)&&String(l.chofer_nombre).toLowerCase().includes(search.toLowerCase()));download(format,'Sueldos_'+document.getElementById('pl-mes-periodo').value,exportColumns,data);}catch(e){toast(e.message,'error');}}
  function exportDetail(format){
    if(!detailData)return;
    try{const {logs,services,l}=detailData;
      const columns=[['fecha','Fecha'],['movil','Móvil'],['hora','Hora'],['numero','N° Servicio'],['patente','Patente'],['origen','Origen'],['destino','Destino'],['km','Km servicio (informativos)','number'],['venta','Venta / concepto'],['comision','Comisión','number'],['efectivo','Efectivo esperado','number']].map(([key,header,type])=>({key,header,type}));
      const data=services.map(s=>{const j=logs.find(j=>j.log_id===s.r.log_id);return {fecha:j?.log_date,movil:j?.truck?.plate,hora:s.time,numero:s.r.nro_servicio||s.r.nro_remito,patente:s.r.patente,origen:s.r.origen,destino:s.r.destino,km:s.r.km_reales,venta:s.sales.map(x=>(x.concept_name||'')+' '+cash(x.total_amount)).join(' / '),comision:s.commission,efectivo:s.cash};});
      const journeys=logs.map(j=>{let km=null;try{km=PayrollMatrix.journeyKm(j);}catch{}return {fecha:j.log_date,movil:j.truck?.plate,servicios:services.filter(s=>s.r.log_id===j.log_id).length,inicio:j.km_inicio,fin:j.km_final,km,estado:j.status};});
      const jc=[['fecha','Fecha'],['movil','Móvil'],['servicios','Servicios del día','number'],['inicio','Odómetro inicial','number'],['fin','Odómetro final','number'],['km','Km a liquidar','number'],['estado','Estado']].map(([key,header,type])=>({key,header,type}));
      download(format,'Sueldo_'+l.periodo_yyyymm+'_'+String(l.chofer_legajo||l.driver_id).replace(/[^a-z0-9_-]/gi,'_'),columns,format==='xlsx'?[l]:data,[{name:'Liquidación',columns:exportColumns,rows:[l]},{name:'Jornadas',columns:jc,rows:journeys},{name:'Servicios',columns,rows:data}]);
    }catch(e){toast(e.message,'error');}
  }
  function moveMonth(delta){const input=document.getElementById('pl-mes-periodo');if(!input.value)return;const [y,m]=input.value.split('-').map(Number),d=new Date(Date.UTC(y,m-1+delta,1));input.value=d.toISOString().slice(0,7);_cargarLiquidacionesMes();}
  window.PayrollView={stepsHtml,reviewHtml,rowState,chipMatch,payDialog,reopenDialog,_setReview:r=>{review=r;},_rowsHtml:()=>rowsHtml(),_setChip:c=>{chip=c;},linesHtml,novedadesHtml,NOV_TIPOS,openCash,monthlyAmount,compareCash,formula,csv,exportMonth,exportDetail,totals,render,open,moveMonth,serviceData,journey,serviceRow,unlinkedServices};
})();

(function(){
  'use strict';

  const R={detail:null,serviceId:null,action:null,resolving:false};
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const num=value=>Number(String(value??'').replace(',','.'))||0;
  const money=value=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(num(value));
  const TOLL_COVERAGE_LABELS={mixed_manual:'Uno y Uno',provider_roundtrip:'A cargo de la prestadora',customer_roundtrip:'A cargo del cliente'};
  const PAYMENT_LABELS={cash:'Efectivo',transfer:'Transferencia',card:'Tarjeta',mercado_pago:'Mercado Pago',other:'Otro',not_collected:'No cobrado',electronic:'Electrónico',telepass:'TelePASE',manual:'Manual'};
  const EMPTY_LABELS={toll:{planned:'Sin peajes planificados',reported:'Sin peajes informados'},excess:{planned:'Sin excedentes planificados',reported:'Sin excedentes informados'}};
  const tollCoverageLabel=(mode,assigned=true)=>TOLL_COVERAGE_LABELS[String(mode||'')]||(assigned?'Sin formato configurado':'A definir por Operaciones');
  const paymentLabel=value=>PAYMENT_LABELS[String(value||'')]||String(value||'Sin medio informado');
  const role=()=>String(typeof PERFIL_USUARIO==='undefined'?'':(PERFIL_USUARIO?.roles?.name||PERFIL_USUARIO?.role||'')).toLowerCase();
  const canResolve=()=>['administracion','operador'].includes(role());
  const rowKey=()=>globalThis.crypto?.randomUUID?.()||'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,char=>(Number(char)^Math.random()*16>>Number(char)/4).toString(16));

  function inject(){
    const screen=$('#screen-operaciones');
    if(!screen)return false;
    if(!$('#os-remito-review-modal'))document.body.insertAdjacentHTML('beforeend','<div id="os-remito-review-modal" class="os-review-modal" hidden><div class="os-review-shell"><header><div><b id="os-review-title">Revisión y cierre</b><small id="os-review-subtitle">Control operativo del remito</small></div><div class="os-review-header-actions"><button class="os-review-close" type="button" onclick="AuxiliosRemitoReviewV2.close()" aria-label="Cerrar revisión">×</button></div></header><div id="os-review-body" class="os-review-body"></div><footer id="os-review-footer" class="os-review-footer"></footer></div></div>');
    bindBodyEvents();
    return true;
  }

  function paymentOptions(value){
    const options=[['cash','Efectivo'],['transfer','Transferencia'],['card','Tarjeta'],['mercado_pago','Mercado Pago'],['other','Otro'],['not_collected','No cobrado']];
    const fallback=value&&!options.some(([option])=>option===value)?`<option value="${esc(value)}" selected>${esc(paymentLabel(value))}</option>`:'';
    return fallback+options.map(([option,label])=>`<option value="${option}" ${value===option?'selected':''}>${label}</option>`).join('');
  }

  function reportedExcessPayment(row){if(row.customer_payment_method)return row.customer_payment_method;try{return JSON.parse(row.notes||'{}').payment_method||''}catch{return''}}
  const amountOf=row=>num(row.total_amount)||num(row.quantity||1)*num(row.unit_amount);
  const compareText=value=>String(value??'').trim().toLocaleLowerCase('es-AR');

  function comparisonKey(kind,row){
    const identity=kind==='toll'?(row.toll_id||compareText(row.toll_name)):(row.concept_id||compareText(row.concept_name));
    const method=kind==='toll'?(row.customer_payment_method||''):(reportedExcessPayment(row)||'');
    return [identity,num(row.quantity||1).toFixed(2),amountOf(row).toFixed(2),String(method)].join('|');
  }

  function hasDifference(kind,plannedRows,reportedRows){
    const planned=(plannedRows||[]).map(row=>comparisonKey(kind,row)).sort();
    const reported=(reportedRows||[]).map(row=>comparisonKey(kind,row)).sort();
    return planned.length!==reported.length||planned.some((value,index)=>value!==reported[index]);
  }

  function rowsFor(kind,data,side){const source=side==='planned'?data.planned:data.reported;return source?.[kind==='toll'?'tolls':'excesses']||[]}
  function countLabel(kind,count,quantity=count){
    if(kind==='toll')return `${quantity} ${quantity===1?'cruce':'cruces'}`;
    return `${count} ${count===1?'concepto':'conceptos'}`;
  }

  function compactStatic(kind,row,includePayment=false){
    const name=kind==='toll'?row.toll_name:row.concept_name,quantity=num(row.quantity||1),unit=num(row.unit_amount)||(quantity?amountOf(row)/quantity:0),method=kind==='toll'?row.customer_payment_method:reportedExcessPayment(row);
    return `<div class="os-review-line-main"><b>${esc(name||'Sin identificar')}</b><small>${esc(quantity)} × ${money(unit)}${includePayment?` · ${esc(paymentLabel(method))}`:''}</small></div><strong class="os-review-line-amount">${money(amountOf(row))}</strong>`;
  }

  function tollSelector(row,data){
    const refs=data.references?.tolls||[],current=String(row.toll_id||''),inCatalog=refs.some(item=>String(item.toll_id)===current);
    const first=current?(inCatalog?'':`<option value="${esc(current)}" selected>${esc(row.toll_name||'Peaje informado')}</option>`):`<option value="" selected>${esc(row.toll_name||'Seleccionar peaje')}</option>`;
    return `<select data-field="toll_id" disabled>${first}${refs.map(item=>`<option value="${esc(item.toll_id)}" ${current===String(item.toll_id)?'selected':''}>${esc(item.name)}${item.road?' · '+esc(item.road):''}</option>`).join('')}</select>`;
  }

  function excessSelector(row,data){
    const refs=data.references?.excess_concepts||[],current=String(row.concept_id||''),inCatalog=refs.some(item=>String(item.concept_id)===current);
    const fallback=current&&!inCatalog?`<option value="${esc(current)}" selected>${esc(row.concept_name||'Concepto informado')}</option>`:'<option value="">Seleccionar concepto</option>';
    return `<select data-field="concept_id" disabled>${fallback}${refs.map(item=>`<option value="${esc(item.concept_id)}" ${current===String(item.concept_id)?'selected':''}>${esc(item.name)}</option>`).join('')}</select>`;
  }

  function reportedLine(kind,row,data,isNew=false){
    const quantity=num(row.quantity||1)||1,unit=num(row.unit_amount)||(quantity?amountOf(row)/quantity:0),method=kind==='toll'?(row.customer_payment_method||''):reportedExcessPayment(row),reportId=kind==='toll'?row.toll_report_id:row.excess_report_id,selector=kind==='toll'?tollSelector(row,data):excessSelector(row,data),selectorLabel=kind==='toll'?'Peaje':'Concepto';
    return `<div class="os-review-report-line os-review-compact-line${isNew?' is-new':''}" data-kind="${kind}" data-original-key="${esc(isNew?'':comparisonKey(kind,row))}" data-report-id="${esc(reportId||row.review_line_client_id||'')}" data-new-id="${esc(row.review_line_client_id||(isNew?rowKey():''))}" data-cancelled="${row.administratively_excluded?'true':'false'}"><div class="os-review-line-static" ${isNew?'hidden':''}>${row.administratively_excluded?'<small>Excluido administrativamente</small>':''}${compactStatic(kind,row,true)}</div><div class="os-review-line-fields" ${isNew?'':'hidden'}><label class="os-review-field-main"><span>${selectorLabel}</span>${selector}</label><label><span>Cant.</span><input data-field="quantity" type="number" min="${kind==='toll'?'1':'0.01'}" step="${kind==='toll'?'1':'0.01'}" inputmode="decimal" value="${esc(quantity)}" disabled></label><label><span>Monto</span><input data-field="unit_amount" inputmode="decimal" value="${unit?esc(unit):''}" disabled></label><label><span>Método</span><select data-field="customer_payment_method" disabled><option value="">Sin medio informado</option>${paymentOptions(method)}</select></label></div><button class="os-review-line-cancel" type="button" onclick="AuxiliosRemitoReviewV2.toggleLineCancel(this)" hidden>Cancelar línea</button></div>`;
  }

  function summarySection(kind,data,side){
    const rows=rowsFor(kind,data,side),title=kind==='toll'?'Peajes':'Excedentes',total=rows.reduce((sum,row)=>sum+(row.administratively_excluded?0:amountOf(row)),0),quantity=rows.reduce((sum,row)=>sum+num(row.quantity||1),0);
    const lines=rows.length?rows.map(row=>side==='planned'?`<div class="os-review-compact-line">${compactStatic(kind,row)}</div>`:reportedLine(kind,row,data)).join(''):`<div class="os-review-empty">${EMPTY_LABELS[kind][side]}</div>`;
    const add=side==='reported'?`<div class="os-review-add-wrap"><button type="button" onclick="AuxiliosRemitoReviewV2.addLine('${kind}')" hidden data-review-add>Agregar ${kind==='toll'?'peaje':'excedente'}</button></div>`:'';
    return `<section class="os-review-summary-block" data-summary-kind="${kind}" data-summary-side="${side}"><header class="os-review-summary-heading"><div><b>${title}</b><small class="os-review-summary-count" data-summary-count>${countLabel(kind,rows.length,quantity)}</small></div><strong class="os-review-summary-total" data-summary-total>${money(total)}</strong></header><div class="os-review-summary-lines">${lines}</div>${add}</section>`;
  }

  function renderFooter(data){
    const footer=$('#os-review-footer');if(!footer)return;
    const resolvable=data.can_resolve&&canResolve();footer.classList.toggle('is-readonly',!resolvable);
    if(!resolvable){footer.innerHTML='<small class="os-review-footer-note">Consulta del remito firmado.</small><button class="btn btn-ghost" type="button" onclick="AuxiliosRemitoReviewV2.close()">Cerrar</button>';return}
    footer.innerHTML=`<small class="os-review-footer-note">La decisión aplica a Peajes y Excedentes.</small><div class="os-review-global-actions" role="group" aria-label="Resolver peajes y excedentes"><button type="button" data-review-global-action="rejected" aria-pressed="false" onclick="AuxiliosRemitoReviewV2.chooseGlobalAction('rejected')">Rechazar</button><button type="button" data-review-global-action="adjusted" aria-pressed="false" onclick="AuxiliosRemitoReviewV2.chooseGlobalAction('adjusted')">Modificar</button><button type="button" data-review-global-action="accepted" aria-pressed="false" onclick="AuxiliosRemitoReviewV2.chooseGlobalAction('accepted')">Aprobar</button></div><div class="os-review-global-resolution" hidden><label data-review-reason-field hidden><span data-review-reason-label>Motivo del rechazo</span><textarea data-review-global-reason placeholder="Indicá brevemente el motivo del rechazo"></textarea></label><div class="os-review-resolution-actions"><button type="button" class="btn btn-ghost" data-review-cancel-action onclick="AuxiliosRemitoReviewV2.cancelGlobalAction()">Cancelar cambios</button><button type="button" class="btn btn-primary" data-review-commit onclick="AuxiliosRemitoReviewV2.commitGlobalAction()">Guardar y finalizar</button></div></div>`;
  }

  function render(data){
    const service=data.service,s=service,remito=data.remito,plannedTolls=data.planned?.tolls||[],plannedExcesses=data.planned?.excesses||[],reportedTolls=data.reported?.tolls||[],reportedExcesses=data.reported?.excesses||[];
    const differences=hasDifference('toll',plannedTolls,reportedTolls)||hasDifference('excess',plannedExcesses,reportedExcesses);
    R.action=null;
    $('#os-review-title').textContent=R.readOnly?'Remito firmado':'Revisión y cierre';
    $('#os-review-subtitle').textContent=`Remito ${remito.remito_number||remito.remito_id} · Servicio ${service.service_order_number||service.service_number} · ${service.company_name||'Prestadora'}`;
    $('#os-review-body').innerHTML=`<section class="os-review-summary-panel" data-review-mode="idle" data-has-differences="${differences}"><div class="os-review-format"><span>Formato de cobro de peajes</span><b>${esc(tollCoverageLabel(s.toll_coverage_mode,!!s.service_id))}</b></div><div class="os-review-reconciliation"><b>Resultado al aprobar</b><span>Lo informado reemplaza la línea planificada coincidente. Todo lo demás planificado se conserva para Facturación.</span></div><div class="os-review-summary-grid"><section class="os-review-summary-column" data-review-side="planned"><h3>Planificado por Operaciones</h3>${summarySection('toll',data,'planned')}${summarySection('excess',data,'planned')}</section><section class="os-review-summary-column" data-review-side="reported"><h3>${data.administrative_corrections?'Informado · Corregido':'Informado por el chofer'}</h3>${summarySection('toll',data,'reported')}${summarySection('excess',data,'reported')}</section></div><div id="os-review-errors" class="os-review-errors"></div></section>`;
    renderFooter(data);
  }

  async function open(serviceId,{readOnly=false}={}){
    inject();R.serviceId=serviceId;R.readOnly=readOnly;
    const modal=$('#os-remito-review-modal');modal.hidden=false;
    $('#os-review-title').textContent='Revisión y cierre';$('#os-review-subtitle').textContent='Control operativo del remito';
    $('#os-review-body').innerHTML='<div class="os-review-section os-review-loading">Cargando revisión…</div>';$('#os-review-footer').innerHTML='';
    try{const {data,error}=await _db.rpc('get_operator_service_remito_review_v3',{p_service_id:serviceId});if(error)throw error;if(!data?.service||!data?.remito)throw new Error('La respuesta no contiene el remito firmado');if(readOnly){data.can_resolve=false;data.reported=data.original_reported||data.reported;}R.detail=data;render(data)}
    catch(error){$('#os-review-body').innerHTML=`<div class="os-review-errors visible">${esc(error.message||'No se pudo abrir la revisión')}</div>`;$('#os-review-footer').innerHTML='<button class="btn btn-ghost" type="button" onclick="AuxiliosRemitoReviewV2.close()">Cerrar</button><button class="btn btn-primary" type="button" onclick="AuxiliosRemitoReviewV2.retry()">Reintentar</button>'}
  }

  function retry(){if(R.serviceId)return open(R.serviceId,{readOnly:R.readOnly})}
  function close(){const modal=$('#os-remito-review-modal');if(modal)modal.hidden=true;R.detail=null;R.serviceId=null;R.action=null;R.resolving=false}
  async function openEvidence(bucket,path){const {data,error}=await _db.storage.from(bucket).createSignedUrl(path,120);if(error)return window.toast?.(error.message,'error');window.open(data.signedUrl,'_blank','noopener')}
  function get(line,field){return $(`[data-field="${field}"]`,line)?.value?.trim()||''}
  function reviewPanel(){return $('.os-review-summary-panel')}
  function globalReason(){return $('[data-review-global-reason]')?.value?.trim()||''}
  function clearErrors(){const box=$('#os-review-errors');if(box){box.textContent='';box.classList.remove('visible')}}

  function setLineCancelled(line,cancelled){
    line.dataset.cancelled=String(cancelled);line.classList.toggle('is-cancelled',cancelled);
    const editable=R.action==='adjusted';$$('input,select',line).forEach(input=>{input.disabled=!editable||cancelled});
    const button=$('.os-review-line-cancel',line);if(button){button.hidden=!editable;button.textContent=cancelled?'Restaurar línea':'Cancelar línea'}
    refreshReportedSummary(line.dataset.kind);
  }

  function setReportedEditing(editable){
    $$('.os-review-summary-column[data-review-side="reported"] .os-review-report-line').forEach(line=>{
      const cancelled=line.dataset.cancelled==='true',staticView=$('.os-review-line-static',line),fields=$('.os-review-line-fields',line);
      if(staticView)staticView.hidden=editable;if(fields)fields.hidden=!editable;
      $$('input,select',line).forEach(input=>{input.disabled=!editable||cancelled});
      const cancel=$('.os-review-line-cancel',line);if(cancel)cancel.hidden=!editable;
    });
    $$('[data-review-add]').forEach(button=>{button.hidden=!editable});
  }

  function showResolution(action){
    const actions=$('.os-review-global-actions'),resolution=$('.os-review-global-resolution'),reasonField=$('[data-review-reason-field]'),commit=$('[data-review-commit]'),cancel=$('[data-review-cancel-action]'),note=$('.os-review-footer-note');
    if(actions)actions.hidden=true;if(resolution)resolution.hidden=false;
    if(reasonField)reasonField.hidden=action!=='rejected';
    if(commit)commit.textContent=action==='rejected'?'Rechazar y finalizar':'Guardar modificaciones y finalizar';
    if(cancel)cancel.textContent=action==='rejected'?'Cancelar rechazo':'Cancelar cambios';
    if(note)note.textContent=action==='rejected'?'El rechazo excluirá todos los peajes y excedentes informados.':'Editá directamente todos los valores de la columna Informado.';
    if(action==='rejected')$('[data-review-global-reason]')?.focus();
  }

  function chooseGlobalAction(action){
    if(!['rejected','adjusted','accepted'].includes(action)||R.resolving||!R.detail?.can_resolve||!canResolve())return;
    clearErrors();R.action=action;const panel=reviewPanel();if(panel)panel.dataset.reviewMode=action;
    $$('[data-review-global-action]').forEach(button=>{const selected=button.dataset.reviewGlobalAction===action;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected))});
    if(action==='accepted'){setReportedEditing(false);$$('.os-review-report-line').forEach(line=>setLineCancelled(line,false));void resolve();return}
    if(action==='rejected'){setReportedEditing(false);$$('.os-review-report-line').forEach(line=>setLineCancelled(line,true))}
    else{$$('.os-review-report-line').forEach(line=>setLineCancelled(line,false));setReportedEditing(true)}
    showResolution(action);
  }

  function cancelGlobalAction(){if(!R.resolving&&R.detail)render(R.detail)}
  function commitGlobalAction(){if(['rejected','adjusted'].includes(R.action)&&!R.resolving)void resolve()}
  function toggleLineCancel(button){if(R.action!=='adjusted')return;const line=button?.closest?.('.os-review-report-line');if(line)setLineCancelled(line,line.dataset.cancelled!=='true')}
  function newLine(kind,data){return reportedLine(kind,{quantity:1,unit_amount:0,customer_payment_method:''},data,true).replace(/ disabled/g,'')}

  function addLine(kind){
    if(!['toll','excess'].includes(kind)||R.action!=='adjusted')return;
    const column=$('.os-review-summary-column[data-review-side="reported"]'),block=$(`[data-summary-kind="${kind}"]`,column),lines=$('.os-review-summary-lines',block);if(!lines)return;
    $('.os-review-empty',lines)?.remove();lines.insertAdjacentHTML('beforeend',newLine(kind,R.detail||{}));refreshReportedSummary(kind);
  }

  function lineAmount(line){return num(get(line,'quantity'))*num(get(line,'unit_amount'))}
  function syncLineStatic(line){
    const kind=line.dataset.kind,selector=$(kind==='toll'?'[data-field="toll_id"]':'[data-field="concept_id"]',line),name=selector?.selectedOptions?.[0]?.textContent?.trim()||'Sin identificar',quantity=num(get(line,'quantity')),unit=num(get(line,'unit_amount')),method=paymentLabel(get(line,'customer_payment_method')),main=$('.os-review-line-main',line),amount=$('.os-review-line-amount',line);
    if(main)main.innerHTML=`<b>${esc(name)}</b><small>${esc(quantity)} × ${money(unit)} · ${esc(method)}</small>`;if(amount)amount.textContent=money(quantity*unit);
  }

  function refreshReportedSummary(kind){
    if(!kind)return;const column=$('.os-review-summary-column[data-review-side="reported"]'),block=column&&$(`[data-summary-kind="${kind}"]`,column);if(!block)return;
    const rows=$$('.os-review-report-line',block).filter(line=>line.dataset.cancelled!=='true'),total=rows.reduce((sum,line)=>sum+lineAmount(line),0),quantity=rows.reduce((sum,line)=>sum+num(get(line,'quantity')),0),totalNode=$('[data-summary-total]',block),countNode=$('[data-summary-count]',block);
    if(totalNode)totalNode.textContent=money(total);if(countNode)countNode.textContent=countLabel(kind,rows.length,quantity);
  }

  function bindBodyEvents(){
    const body=$('#os-review-body');if(!body||body.dataset.reviewBound==='1')return;body.dataset.reviewBound='1';
    const update=event=>{const line=event.target?.closest?.('.os-review-report-line');if(line){syncLineStatic(line);refreshReportedSummary(line.dataset.kind)}};
    body.addEventListener('input',update);body.addEventListener('change',update);
  }

  function buildPayload(){
    const detail=R.detail||{},reported=detail.reported||{},errors=[],action=R.action,reason=globalReason();
    if(!action)errors.push('Elegí Rechazar, Modificar o Aprobar.');
    if(action==='rejected'&&!reason)errors.push('Indicá el motivo del rechazo.');
    const tollLines=$$('.os-review-report-line[data-kind="toll"]'),excessLines=$$('.os-review-report-line[data-kind="excess"]'),reportedTolls=reported.tolls||[],reportedExcesses=reported.excesses||[];
    const tollById=new Map(reportedTolls.map(row=>[String(row.toll_report_id||row.review_line_client_id),row])),excessById=new Map(reportedExcesses.map(row=>[String(row.excess_report_id||row.review_line_client_id),row]));let tollChanged=false,excessChanged=false;
    const tolls=tollLines.map(line=>{
      const original=tollById.get(String(line.dataset.reportId))||{},added=!original.toll_report_id,cancelled=action==='rejected'||line.dataset.cancelled==='true';if(action==='adjusted'&&added&&cancelled)return null;
      let tollId=original.toll_id||null,quantity=num(original.quantity||1),unit=num(original.unit_amount),customerMethod=original.customer_payment_method||null;
      if(action==='adjusted'||added){tollId=get(line,'toll_id')||null;quantity=num(get(line,'quantity'));unit=num(get(line,'unit_amount'));customerMethod=get(line,'customer_payment_method')||null}
      const changed=added||(!added&&cancelled)||String(tollId||'')!==String(original.toll_id||'')||Math.abs(quantity-num(original.quantity||1))>.001||Math.abs(unit-num(original.unit_amount))>.001||String(customerMethod||'')!==String(original.customer_payment_method||'');tollChanged=tollChanged||changed;
      const decision=cancelled?'rejected':added||(action==='adjusted'&&changed)||detail.administrative_corrections?'adjusted':'accepted';if(decision!=='rejected'&&(quantity<1||unit<=0))errors.push('Cantidad e importe de cada peaje deben ser mayores a cero.');
      const mode=detail.service?.toll_coverage_mode,payer=original.payer_agent|| (mode==='provider_roundtrip'?'provider':mode==='customer_roundtrip'?'customer':customerMethod?'customer':'provider');if(detail.administrative_corrections&&!customerMethod)customerMethod='not_collected';if(decision!=='rejected'&&payer==='customer'&&!customerMethod)errors.push('Indicá el método de pago de los peajes a cargo del cliente.');
      const ref=(detail.references?.tolls||[]).find(item=>String(item.toll_id)===String(tollId));
      return {toll_report_id:original.toll_report_id||null,review_line_client_id:line.dataset.newId||null,decision,reason:decision==='rejected'?(reason||'Excluido durante la modificación'):null,toll_id:tollId,toll_name:ref?.name||original.toll_name,quantity,unit_amount:unit,payment_method:original.payment_method||'manual',payer_agent:payer,customer_payment_method:customerMethod};
    }).filter(Boolean);
    reportedTolls.forEach(row=>{if(!tolls.some(item=>String(item.toll_report_id||item.review_line_client_id)===String(row.toll_report_id||row.review_line_client_id)))errors.push('Revisá todos los peajes antes de aprobar.')});
    const excesses=excessLines.map(line=>{
      const original=excessById.get(String(line.dataset.reportId))||{},added=!original.excess_report_id,cancelled=action==='rejected'||line.dataset.cancelled==='true';if(action==='adjusted'&&added&&cancelled)return null;
      const originalMethod=reportedExcessPayment(original);let conceptId=original.concept_id||null,quantity=num(original.quantity||1),unit=num(original.unit_amount),method=originalMethod||null;
      if(action==='adjusted'||added){conceptId=get(line,'concept_id')||null;quantity=num(get(line,'quantity'));unit=num(get(line,'unit_amount'));method=get(line,'customer_payment_method')||null}
      const changed=added||(!added&&cancelled)||String(conceptId||'')!==String(original.concept_id||'')||Math.abs(quantity-num(original.quantity||1))>.001||Math.abs(unit-num(original.unit_amount))>.001||String(method||'')!==String(originalMethod||'');excessChanged=excessChanged||changed;
      const decision=cancelled?'rejected':added||(action==='adjusted'&&changed)||detail.administrative_corrections?'adjusted':'accepted';if(decision!=='rejected'&&!conceptId)errors.push('Seleccioná el concepto de cada excedente.');if(decision!=='rejected'&&(quantity<=0||unit<=0))errors.push('Cantidad e importe de cada excedente deben ser mayores a cero.');
      if(detail.administrative_corrections&&!method)method='not_collected';const collector=original.payer_agent==='provider'?'provider':original.collector_agent||'company';if(decision!=='rejected'&&collector==='company'&&!method)errors.push('Indicá el método de pago de cada excedente.');
      return {excess_report_id:original.excess_report_id||null,review_line_client_id:line.dataset.newId||null,decision,review_reason:decision==='rejected'?(reason||'Excluido durante la modificación'):null,concept_id:conceptId,quantity,unit_amount:unit,payer_agent:original.payer_agent||'customer',collector_agent:collector,customer_payment_method:method};
    }).filter(Boolean);
    reportedExcesses.forEach(row=>{if(!excesses.some(item=>String(item.excess_report_id||item.review_line_client_id)===String(row.excess_report_id||row.review_line_client_id)))errors.push('Revisá todos los excedentes antes de aprobar.')});
    if(action==='adjusted'&&!tollChanged&&!excessChanged)errors.push('Modificá, agregá o cancelá al menos un peaje o excedente.');
    return {payload:{tolls,excesses,administrative_revision:detail.administrative_revision||0},errors};
  }

  async function resolve(){
    if(!R.detail?.can_resolve||!canResolve()||R.resolving)return;const {payload,errors}=buildPayload(),box=$('#os-review-errors');
    if(errors.length){box.textContent=[...new Set(errors)].join(' ');box.classList.add('visible');return}box.classList.remove('visible');R.resolving=true;
    $$('[data-review-global-action],[data-review-commit],[data-review-cancel-action],[data-review-add],.os-review-line-cancel').forEach(button=>{button.disabled=true});const note=$('.os-review-footer-note');if(note)note.textContent='Aplicando revisión y cierre…';
    try{const {data,error}=await _db.rpc('resolve_operator_service_document_v6',{p_service_id:R.detail.service.service_id,p_action:'approve_and_finalize',p_payload:payload});if(error)throw error;if(data?.document_status!=='approved'||data?.status!=='completed')throw new Error('El cierre no confirmó todos los estados');window.operationFeedback?.('Servicio finalizado','Remito aprobado y enviado a Facturación.','success',2400);close();await window.OperatorServices?.loadServices?.()}
    catch(error){R.resolving=false;box.textContent=error.message||'No se pudo aprobar y finalizar';box.classList.add('visible');$$('[data-review-global-action],[data-review-commit],[data-review-cancel-action],[data-review-add],.os-review-line-cancel').forEach(button=>{button.disabled=false});if(note)note.textContent=R.action==='accepted'?'Elegí Rechazar, Modificar o Aprobar para Peajes y Excedentes.':'Revisá el error y volvé a confirmar la decisión.'}
  }

  const E={detail:null,serviceId:null,hostId:null,decisions:new Map(),busy:false,note:'',rejections:new Map(),loadSeq:0};
  function embeddedRows(detail){
    const output=[];
    for(const kind of ['toll','excess']){
      const planned=rowsFor(kind,detail,'planned'),reported=rowsFor(kind,detail,'reported');
      const plannedKeys=new Map();for(const row of planned){const key=comparisonKey(kind,row);plannedKeys.set(key,(plannedKeys.get(key)||0)+1)}
      reported.forEach((row,index)=>{
        if(row.administratively_excluded||!(kind==='toll'?row.toll_report_id:row.excess_report_id))return;
        const w=window.OperatorServices?.S?.wizard,reportKey=kind==='toll'?'toll_report_id':'excess_report_id',current=w?.dirty?w.data?.commercial_addons?.[kind==='toll'?'tolls':'excess_charges']?.find(r=>r[reportKey]===row[reportKey]):null;const key=comparisonKey(kind,current&&!E.decisions.has(kind+':'+row[reportKey])?current:row),matches=plannedKeys.get(key)||0;
        if(matches){plannedKeys.set(key,matches-1);return}
        {
          const id=String((kind==='toll'?row.toll_report_id:row.excess_report_id)||row.review_line_client_id||`${kind}-${index}`);
          const identity=kind==='toll'?(row.toll_id||compareText(row.toll_name)):(row.concept_id||compareText(row.concept_name));
          const counterpart=planned.find(item=>(kind==='toll'?(item.toll_id||compareText(item.toll_name)):(item.concept_id||compareText(item.concept_name)))===identity);
          output.push({kind,row,id,plannedAmount:counterpart?amountOf(counterpart):0});
        }
      });
    }
    return output;
  }

  function isResolved(kind,id){const d=E.decisions.get(kind+':'+id);return d?.value==='accepted'||d?.value==='adjusted'||d?.value==='rejected'&&!!d.reason?.trim();}
  function pendingEmbeddedRows(){return embeddedRows(E.detail).filter(({kind,id})=>!isResolved(kind,id));}
  function embeddedLine({kind,row,id,plannedAmount}){
    const key=kind+':'+id,rejecting=E.rejections.has(key),reason=E.rejections.get(key)||'',title=kind==='toll'?'Peaje':'Excedente',name=kind==='toll'?(row.toll_name||'Peaje informado'):(row.concept_name||'Concepto informado'),method=kind==='toll'?row.customer_payment_method:reportedExcessPayment(row);
    return `<article class="os-embedded-difference is-compact" data-embedded-key="${esc(key)}"><div class="os-embedded-row"><span class="os-embedded-kind">${title}</span><b title="${esc(name)}">${esc(name)}</b><span class="os-embedded-amount">${money(amountOf(row))}</span><small>Servicio: ${money(plannedAmount)} · ${esc(paymentLabel(method))}</small></div><div class="os-embedded-actions"><button type="button" class="reject" onclick="AuxiliosRemitoReviewV2.decideEmbedded('${kind}','${esc(id)}','rejected')">Rechazar</button><button type="button" class="approve" onclick="AuxiliosRemitoReviewV2.decideEmbedded('${kind}','${esc(id)}','accepted')">Aprobar</button></div>${rejecting?`<label class="os-embedded-reason"><span>Motivo del rechazo *</span><input value="${esc(reason)}" oninput="AuxiliosRemitoReviewV2.reasonEmbedded('${kind}','${esc(id)}',this.value)" placeholder="Explicá por qué se excluye el cargo"></label><button type="button" class="os-review-confirm-reject" onclick="AuxiliosRemitoReviewV2.confirmRejection('${kind}','${esc(id)}')">Confirmar rechazo</button>`:''}</article>`;
  }
  function reviewReport(){
    if(!E.detail||E.serviceId!==window.OperatorServices?.S?.wizard?.serviceId)return '';
    const differences=new Set(embeddedRows(E.detail).map(r=>r.kind+':'+r.id));
    const groups=[['toll','Peajes','tolls','toll_report_id','toll_name'],['excess','Excedentes','excesses','excess_report_id','concept_name']];
    return '<div class="os-charge-report is-compact"><p>Importes originales del chofer y resultado de la revisión. El remito firmado se conserva.</p>'+groups.map(([kind,label,group,idKey,nameKey])=>{
      const rows=E.detail.original_reported?.[group]||E.detail.reported?.[group]||[];
      return '<section><h4>'+label+'</h4>'+rows.filter(row=>row[idKey]).map(row=>{
        const key=kind+':'+row[idKey],decision=E.decisions.get(key),resolved=isResolved(kind,row[idKey]),status=resolved?(decision.value==='rejected'?'Rechazado':decision.value==='adjusted'?'Aprobado con cambios':'Aprobado'):differences.has(key)?'Pendiente de revisión':row.administratively_excluded?'Excluido del servicio':'Sin diferencias';
        const tone=resolved?(decision.value==='rejected'?'rejected':'accepted'):'neutral';
        const saved=resolved?(decision.saved?'<i class="os-charge-saved is-saved" title="Decisión guardada">●</i>':'<i class="os-charge-saved" title="Sin guardar · Se conserva al guardar o finalizar">○</i>'):'';
        return '<article class="os-charge-row '+tone+'"><b title="'+esc(row[nameKey]||label)+'">'+esc(row[nameKey]||label)+'</b><span class="os-charge-amount">'+money(amountOf(row))+'</span>'+(saved||'<i></i>')+'<span class="os-charge-meta"><span class="os-charge-badge '+tone+'">'+status+'</span><span>'+esc(paymentLabel(kind==='toll'?row.customer_payment_method:reportedExcessPayment(row)))+'</span>'+(decision?.reason?'<em>Motivo: '+esc(decision.reason)+'</em>':'')+'</span></article>';
      }).join('')+(rows.length?'':'<small class="os-charge-empty">Sin cargos informados.</small>')+'</section>';
    }).join('')+(unsavedCount()?'<small class="os-charge-legend">○ Sin guardar · se conserva al guardar o finalizar</small>':'')+'</div>';
  }
  function unsavedCount(){return[...E.decisions.values()].filter(d=>d&&!d.saved).length;}
  function syncReviewReport(){window.OperatorServiceCommercialAddonsV1?.render?.();}

  function embeddedReadOnly(){const w=window.OperatorServices?.S?.wizard;return w?.mode==='view'||['completed','cancelled'].includes(w?.serviceSnapshot?.status);}

  function renderEmbedded(){
    const host=document.getElementById(E.hostId);if(!host||!E.detail)return;
    if(embeddedReadOnly()||!canResolve()){host.innerHTML='';return;}
    const rows=pendingEmbeddedRows();
    host.innerHTML=`<section class="os-embedded-review"><header><b>${rows.length?'Diferencias pendientes':'Revisión del remito'}</b><small>${rows.length?'Resolvé cada diferencia para poder finalizar.':'No quedan diferencias pendientes.'}</small></header><div class="os-embedded-list">${rows.map(embeddedLine).join('')}</div><div class="os-embedded-note">${rows.length?'Aprobar incorpora el cargo al servicio. Rechazar lo excluye y requiere un motivo.':'Consultá las decisiones en «Ver cargos del remito firmado».'}</div><footer><span>${rows.length} pendientes</span><label class="os-embedded-pending-note"><span>Nota para dejar pendiente</span><textarea id="os-embedded-pending-note" oninput="AuxiliosRemitoReviewV2.noteEmbedded(this.value)" placeholder="Indicá qué falta revisar">${esc(E.note)}</textarea></label><div><button type="button" class="pending" ${E.busy?'disabled':''} onclick="AuxiliosRemitoReviewV2.leavePending()">Dejar pendiente</button><button type="button" class="finish" ${E.busy?'disabled':''} onclick="AuxiliosRemitoReviewV2.finalizeEmbedded()">${E.busy?'Cerrando…':'Finalizar y cerrar'}</button></div></footer></section>`;
  }
  async function embed(serviceId,hostId='osv4-review-slot'){
    const seq=++E.loadSeq,changed=E.serviceId!==serviceId;
    E.serviceId=serviceId;E.hostId=hostId;E.detail=null;
    if(changed){E.decisions=new Map();E.rejections=new Map();E.note='';}
    const host=document.getElementById(hostId);if(!host)return;
    host.innerHTML='<div class="os-review-loading">Cargando revisión de cargos…</div>';
    const [{data,error},report]=await Promise.all([
      _db.rpc('get_operator_service_remito_review_v3',{p_service_id:serviceId}),
      _db.rpc('get_operator_service_charge_review_report_v1',{p_service_id:serviceId})
    ]);
    if(seq!==E.loadSeq||E.serviceId!==serviceId)return;
    if(error||report.error){host.innerHTML='<div class="os-review-errors visible">'+esc(error?.message||report.error.message)+'</div>';return;}
    E.detail=data;
    if(changed){E.decisions=new Map(Object.entries(report.data?.decisions||{}));E.note=String(report.data?.note||'');}
    else for(const [key,value] of Object.entries(report.data?.decisions||{}))E.decisions.set(key,value);
    const keys=new Set([...(data.original_reported?.tolls||data.reported?.tolls||[]).map(r=>'toll:'+r.toll_report_id),...(data.original_reported?.excesses||data.reported?.excesses||[]).map(r=>'excess:'+r.excess_report_id)]);
    for(const key of E.decisions.keys())if(!keys.has(key))E.decisions.delete(key);
    if(!embeddedReadOnly())preservePlannedRows();
    renderEmbedded();syncReviewReport();
  }

  function decideEmbedded(kind,id,value,confirmed=false){if(E.busy||embeddedReadOnly()||!canResolve())return;const w=window.OperatorServices?.S?.wizard;if(w?.mode==='view')return;const key=kind+':'+id;if(value==='rejected'&&!confirmed){E.rejections.set(key,E.rejections.get(key)||'');renderEmbedded();return;}const reason=value==='rejected'?(E.rejections.get(key)||'').trim():'';if(value==='rejected'&&!reason)return window.toast?.('Indicá el motivo del rechazo','error');E.decisions.set(key,{value,reason,saved:false});E.rejections.delete(key);const field=kind==='toll'?'tolls':'excess_charges',reportKey=kind==='toll'?'toll_report_id':'excess_report_id',rows=w?.data?.commercial_addons?.[field],source=(E.detail?.original_reported?.[kind==='toll'?'tolls':'excesses']||E.detail?.reported?.[kind==='toll'?'tolls':'excesses']||[]).find(r=>String(r[reportKey])===String(id));if(rows&&source){let index=rows.findIndex(r=>String(r[reportKey])===String(id));if(index<0&&value==='accepted'){const identity=kind==='toll'?'toll_id':'concept_id';index=rows.findIndex(r=>!r[reportKey]&&source[identity]&&r[identity]===source[identity]);}if(value==='accepted'){const quantity=num(source.quantity)||1,approved={...(index>=0?rows[index]:{}),...source,payer_agent:'customer',collector_agent:source.collector_agent||'company',quantity,unit_amount:amountOf(source)/quantity,customer_payment_method:(kind==='toll'?source.customer_payment_method:reportedExcessPayment(source))||'not_collected',[reportKey]:id};if(index>=0)rows[index]=approved;else rows.push(approved);if(kind==='toll'){const c=w.data.commercial_addons;c.toll_coverage_mode=c.tolls.every(r=>r.payer_agent==='customer')?'customer_roundtrip':'mixed_manual';}}else if(index>=0)rows.splice(index,1);preservePlannedRows();w.dirty=true;w.quote=null;window.OperatorServiceCommercialAddonsV1?.show?.(kind);window.OperatorServiceWorkspaceV2?.sync?.();}renderEmbedded();syncReviewReport();}
  function preservePlannedRows(){const w=window.OperatorServices?.S?.wizard,c=w?.data?.commercial_addons;if(!c||!w.administrativeEdit||w.serviceId!==E.serviceId||w.reviewPlannedInitialized||E.detail?.administrative_corrections)return;w.reviewPlannedInitialized=true;for(const kind of ['toll','excess']){const field=kind==='toll'?'tolls':'excess_charges',group=kind==='toll'?'tolls':'excesses',identity=r=>String(kind==='toll'?(r.toll_id||compareText(r.toll_name)):(r.concept_id||compareText(r.concept_name)));const reports=E.detail?.original_reported?.[group]||E.detail?.reported?.[group]||[];for(const planned of E.detail?.planned?.[group]||[]){if(reports.some(r=>identity(r)===identity(planned))||c[field].some(r=>identity(r)===identity(planned)))continue;w.dirty=true;c[field].push({...planned,review_line_client_id:rowKey(),payer_agent:planned.payer_agent||(kind==='toll'?'provider':'customer'),quantity:num(planned.quantity)||1,unit_amount:num(planned.unit_amount)||amountOf(planned)/(num(planned.quantity)||1)});}}}
  function getSaveState(serviceId){if(serviceId!==E.serviceId||!E.detail)return null;return{decisions:Object.fromEntries([...E.decisions].map(([key,d])=>[key,{value:d.value,reason:d.reason||''}])),note:E.note};}
  function unresolvedEmbedded(){return pendingEmbeddedRows().length>0||E.rejections.size>0||[...E.decisions.values()].some(d=>d.value==='rejected'&&!d.reason?.trim());}
  function refreshEmbedded(){renderEmbedded();}

  function reasonEmbedded(kind,id,reason){if(E.busy||embeddedReadOnly())return;E.rejections.set(kind+':'+id,reason);}
  function confirmRejection(kind,id){decideEmbedded(kind,id,'rejected',true);}

  function noteEmbedded(value){E.note=value}
  function embeddedPayload(){
    const diffKeys=E.decisions;
    const tolls=(E.detail.reported?.tolls||[]).map((row,index)=>{const id=String(row.toll_report_id||row.review_line_client_id||`toll-${index}`),decision=diffKeys.get(`toll:${id}`),rejected=!!row.administratively_excluded||decision?.value==='rejected';return{toll_report_id:row.toll_report_id||null,review_line_client_id:row.review_line_client_id||null,decision:rejected?'rejected':row.toll_report_id?'accepted':'adjusted',reason:rejected?(decision?.reason||'Excluido en la corrección administrativa'):null,toll_id:row.toll_id||null,toll_name:row.toll_name,quantity:num(row.quantity||1),unit_amount:num(row.unit_amount)||amountOf(row),payment_method:row.payment_method||'manual',payer_agent:row.payer_agent||(row.customer_payment_method?'customer':'provider'),customer_payment_method:row.customer_payment_method||null}});
    const excesses=(E.detail.reported?.excesses||[]).map((row,index)=>{const id=String(row.excess_report_id||row.review_line_client_id||`excess-${index}`),decision=diffKeys.get(`excess:${id}`),rejected=!!row.administratively_excluded||decision?.value==='rejected';return{excess_report_id:row.excess_report_id||null,review_line_client_id:row.review_line_client_id||null,decision:rejected?'rejected':row.excess_report_id?'accepted':'adjusted',review_reason:rejected?(decision?.reason||'Excluido en la corrección administrativa'):null,concept_id:row.concept_id||null,quantity:num(row.quantity||1),unit_amount:num(row.unit_amount)||amountOf(row),payer_agent:row.payer_agent||'customer',collector_agent:row.collector_agent||'company',customer_payment_method:reportedExcessPayment(row)||null}});
    return{tolls,excesses,administrative_revision:E.detail.administrative_revision||0};
  }
  async function finalizeEmbedded(){if(E.busy||embeddedReadOnly()||!E.detail)return;if(unresolvedEmbedded()){window.alert('No se puede cerrar el servicio. Debés aprobar o rechazar todas las diferencias antes de finalizar.');return;}E.busy=true;renderEmbedded();try{const wizard=window.OperatorServices?.S?.wizard;if(wizard?.dirty){const saved=await window.guardarServicioWorkspace?.({keepOpen:true,silent:true});if(!saved)return;E.busy=true;if(unresolvedEmbedded()){window.alert('No se puede cerrar el servicio. Debés aprobar o rechazar todas las diferencias antes de finalizar.');return;}}const {data,error}=await _db.rpc('resolve_operator_service_document_v6',{p_service_id:E.serviceId,p_action:'approve_and_finalize',p_payload:embeddedPayload()});if(error)throw error;if(data?.status!=='completed')throw Error('No se confirmó el cierre del servicio');window.cerrarNuevoServicio?.(true);window.operationFeedback?.('Servicio finalizado','Remito aprobado y enviado a Facturación.','success',2400);await window.OperatorServices?.loadServices?.();}catch(error){window.toast?.(error.message||'No se pudo finalizar','error');}finally{E.busy=false;renderEmbedded();}}
  function editEmbedded(){const id=E.serviceId;window.cerrarNuevoServicio?.(true);window.editarServicioOperador?.(id)}
  async function leavePending(){if(E.busy||embeddedReadOnly()||!E.detail)return;if(E.rejections.size)return window.toast?.('Confirmá el rechazo con su motivo antes de guardar','error');const note=E.note.trim();if(note.length<3)return window.toast?.('Escribí una nota para dejar la revisión pendiente','error');if([...E.decisions.values()].some(d=>d.value==='rejected'&&!d.reason?.trim()))return window.toast?.('Indicá el motivo de cada rechazo','error');E.busy=true;try{const wizard=window.OperatorServices?.S?.wizard;if(wizard?.dirty){if(!await window.guardarServicioWorkspace?.({keepOpen:true,silent:true}))return;}else{const {error}=await _db.rpc('save_operator_service_review_draft_v1',{p_service_id:E.serviceId,p_note:note,p_decisions:Object.fromEntries(E.decisions)});if(error)throw error;}window.cerrarNuevoServicio?.(true);window.operationFeedback?.('Revisión pendiente','La nota y los cambios quedaron guardados.','success',2400);}catch(error){window.toast?.(error.message,'error');}finally{E.busy=false;renderEmbedded();}}
  function resetEmbedded(){E.detail=null;E.serviceId=null;E.hostId=null;E.decisions=new Map();E.rejections=new Map();E.note='';E.busy=false;E.loadSeq++}

  function tab(){}
  window.AuxiliosRemitoReviewV2={open,retry,close,openEvidence,resolve,chooseGlobalAction,cancelGlobalAction,commitGlobalAction,addLine,toggleLineCancel,embed,decideEmbedded,reasonEmbedded,confirmRejection,reviewReport,noteEmbedded,finalizeEmbedded,editEmbedded,leavePending,resetEmbedded,refreshEmbedded,getSaveState,preservePlannedRows,tab};
  const boot=setInterval(()=>{if(inject())clearInterval(boot)},100);setTimeout(()=>clearInterval(boot),15000);
})();

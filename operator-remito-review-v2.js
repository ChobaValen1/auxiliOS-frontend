(function(){
  'use strict';

  const R={detail:null,services:[],serviceId:null,action:null,resolving:false};
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
  const dateTime=value=>value?new Date(value).toLocaleString('es-AR'):'—';
  const role=()=>String(typeof PERFIL_USUARIO==='undefined'?'':(PERFIL_USUARIO?.roles?.name||PERFIL_USUARIO?.role||'')).toLowerCase();
  const canResolve=()=>['administracion','operador'].includes(role());
  const rowKey=()=>globalThis.crypto?.randomUUID?.()||'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,char=>(Number(char)^Math.random()*16>>Number(char)/4).toString(16));

  function inject(){
    const screen=$('#screen-operaciones');
    if(!screen)return false;
    if(!$('#os-remito-inbox'))$('#os-driver-intakes',screen)?.insertAdjacentHTML('afterend','<section id="os-remito-inbox" class="os-remito-inbox" hidden><header><div><b>Remitos recibidos</b><small>Revisión y cierre de remitos firmados.</small></div><span id="os-remito-inbox-count" class="os-remito-inbox-count">0</span></header><div id="os-remito-inbox-list" class="os-remito-inbox-list"></div></section>');
    if(!$('#os-remito-review-modal'))document.body.insertAdjacentHTML('beforeend','<div id="os-remito-review-modal" class="os-review-modal" hidden><div class="os-review-shell"><header><div><b id="os-review-title">Revisión y cierre</b><small id="os-review-subtitle">Control operativo del remito</small></div><div class="os-review-header-actions"><button class="os-review-close" type="button" onclick="AuxiliosRemitoReviewV2.close()" aria-label="Cerrar revisión">×</button></div></header><div id="os-review-body" class="os-review-body"></div><footer id="os-review-footer" class="os-review-footer"></footer></div></div>');
    bindBodyEvents();
    return true;
  }

  function needsReview(service){return !!service.remito_id&&(service.document_status==='submitted'||(service.document_status==='approved'&&['pending','legacy'].includes(service.remito_addons_review_status)))&&service.billing_status!=='invoiced'}

  function renderInbox(services){
    if(!inject())return;
    R.services=services||[];
    const rows=R.services.filter(needsReview),panel=$('#os-remito-inbox'),list=$('#os-remito-inbox-list'),count=$('#os-remito-inbox-count');
    if(!panel||!list)return;
    panel.hidden=!rows.length;
    if(count)count.textContent=String(rows.length);
    list.innerHTML=rows.map(service=>{
      const extras=[`Peajes: ${num(service.remito_toll_count)} · ${money(service.remito_toll_total)}`,`Excedentes: ${num(service.remito_excess_count)} · ${money(service.remito_excess_total)}`,`Evidencias: ${num(service.remito_evidence_count)}`].join(' · ');
      const driverData=[service.remito_customer_name,service.remito_customer_document&&`DNI/CUIT ${service.remito_customer_document}`,service.remito_customer_phone&&`Tel. ${service.remito_customer_phone}`].filter(Boolean).join(' · ');
      const action=canResolve()&&['at_origin','completed'].includes(service.status)?'Revisar y cerrar':'Ver remito';
      return `<article class="os-remito-inbox-item"><div><b>${esc(service.service_order_number||service.service_number)} · ${esc(service.remito_number||'Remito')}</b><small>${esc(service.company_name||'Prestadora')} · ${esc(service.remito_vehicle_plate||service.vehicle_plate||'Sin patente')} · Firmado ${esc(dateTime(service.remito_signed_at))}</small><small class="os-toll-coverage">Formato de cobro de peajes: ${esc(tollCoverageLabel(service.toll_coverage_mode))}</small>${driverData?`<small>${esc(driverData)}</small>`:''}<small>${esc(extras)}</small></div><button type="button" class="btn btn-primary" onclick="AuxiliosRemitoReviewV2.open('${service.service_id}')">${action}</button></article>`;
    }).join('');
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
    return `<div class="os-review-report-line os-review-compact-line${isNew?' is-new':''}" data-kind="${kind}" data-original-key="${esc(isNew?'':comparisonKey(kind,row))}" data-report-id="${esc(reportId||'')}" ${isNew?`data-new-id="${esc(rowKey())}"`:''} data-cancelled="false"><div class="os-review-line-static" ${isNew?'hidden':''}>${compactStatic(kind,row,true)}</div><div class="os-review-line-fields" ${isNew?'':'hidden'}><label class="os-review-field-main"><span>${selectorLabel}</span>${selector}</label><label><span>Cant.</span><input data-field="quantity" type="number" min="${kind==='toll'?'1':'0.01'}" step="${kind==='toll'?'1':'0.01'}" inputmode="decimal" value="${esc(quantity)}" disabled></label><label><span>Monto</span><input data-field="unit_amount" inputmode="decimal" value="${unit?esc(unit):''}" disabled></label><label><span>Método</span><select data-field="customer_payment_method" disabled><option value="">Sin medio informado</option>${paymentOptions(method)}</select></label></div><button class="os-review-line-cancel" type="button" onclick="AuxiliosRemitoReviewV2.toggleLineCancel(this)" hidden>Cancelar línea</button></div>`;
  }

  function summarySection(kind,data,side){
    const rows=rowsFor(kind,data,side),title=kind==='toll'?'Peajes':'Excedentes',total=rows.reduce((sum,row)=>sum+amountOf(row),0),quantity=rows.reduce((sum,row)=>sum+num(row.quantity||1),0);
    const lines=rows.length?rows.map(row=>side==='planned'?`<div class="os-review-compact-line">${compactStatic(kind,row)}</div>`:reportedLine(kind,row,data)).join(''):`<div class="os-review-empty">${EMPTY_LABELS[kind][side]}</div>`;
    const add=side==='reported'?`<div class="os-review-add-wrap"><button type="button" onclick="AuxiliosRemitoReviewV2.addLine('${kind}')" hidden data-review-add>Agregar ${kind==='toll'?'peaje':'excedente'}</button></div>`:'';
    return `<section class="os-review-summary-block" data-summary-kind="${kind}" data-summary-side="${side}"><header class="os-review-summary-heading"><div><b>${title}</b><small class="os-review-summary-count" data-summary-count>${countLabel(kind,rows.length,quantity)}</small></div><strong class="os-review-summary-total" data-summary-total>${money(total)}</strong></header><div class="os-review-summary-lines">${lines}</div>${add}</section>`;
  }

  function renderFooter(data){
    const footer=$('#os-review-footer');if(!footer)return;
    const resolvable=data.can_resolve&&canResolve();footer.classList.toggle('is-readonly',!resolvable);
    if(!resolvable){footer.innerHTML='<small class="os-review-footer-note">Documento aprobado o servicio inmutable.</small><button class="btn btn-ghost" type="button" onclick="AuxiliosRemitoReviewV2.close()">Cerrar</button>';return}
    footer.innerHTML=`<small class="os-review-footer-note">La decisión aplica a Peajes y Excedentes.</small><div class="os-review-global-actions" role="group" aria-label="Resolver peajes y excedentes"><button type="button" data-review-global-action="rejected" aria-pressed="false" onclick="AuxiliosRemitoReviewV2.chooseGlobalAction('rejected')">Rechazar</button><button type="button" data-review-global-action="adjusted" aria-pressed="false" onclick="AuxiliosRemitoReviewV2.chooseGlobalAction('adjusted')">Modificar</button><button type="button" data-review-global-action="accepted" aria-pressed="false" onclick="AuxiliosRemitoReviewV2.chooseGlobalAction('accepted')">Aprobar</button></div><div class="os-review-global-resolution" hidden><label><span data-review-reason-label>Motivo</span><textarea data-review-global-reason placeholder="Indicá brevemente el motivo"></textarea></label><div class="os-review-resolution-actions"><button type="button" class="btn btn-ghost" data-review-cancel-action onclick="AuxiliosRemitoReviewV2.cancelGlobalAction()">Cancelar cambios</button><button type="button" class="btn btn-primary" data-review-commit onclick="AuxiliosRemitoReviewV2.commitGlobalAction()">Guardar y finalizar</button></div></div>`;
  }

  function render(data){
    const service=data.service,s=service,remito=data.remito,plannedTolls=data.planned?.tolls||[],plannedExcesses=data.planned?.excesses||[],reportedTolls=data.reported?.tolls||[],reportedExcesses=data.reported?.excesses||[];
    const differences=hasDifference('toll',plannedTolls,reportedTolls)||hasDifference('excess',plannedExcesses,reportedExcesses);
    R.action=null;
    $('#os-review-title').textContent='Revisión y cierre';
    $('#os-review-subtitle').textContent=`Remito ${remito.remito_number||remito.remito_id} · Servicio ${service.service_order_number||service.service_number} · ${service.company_name||'Prestadora'}`;
    $('#os-review-body').innerHTML=`<section class="os-review-summary-panel" data-review-mode="idle" data-has-differences="${differences}"><div class="os-review-format"><span>Formato de cobro de peajes</span><b>${esc(tollCoverageLabel(s.toll_coverage_mode,!!s.service_id))}</b></div><div class="os-review-summary-grid"><section class="os-review-summary-column" data-review-side="planned"><h3>Planificado</h3>${summarySection('toll',data,'planned')}${summarySection('excess',data,'planned')}</section><section class="os-review-summary-column" data-review-side="reported"><h3>Informado</h3>${summarySection('toll',data,'reported')}${summarySection('excess',data,'reported')}</section></div><div id="os-review-errors" class="os-review-errors"></div></section>`;
    renderFooter(data);
  }

  async function open(serviceId){
    inject();R.serviceId=serviceId;
    const modal=$('#os-remito-review-modal');modal.hidden=false;
    $('#os-review-title').textContent='Revisión y cierre';$('#os-review-subtitle').textContent='Control operativo del remito';
    $('#os-review-body').innerHTML='<div class="os-review-section os-review-loading">Cargando revisión…</div>';$('#os-review-footer').innerHTML='';
    try{const {data,error}=await _db.rpc('get_operator_service_remito_review_v2',{p_service_id:serviceId});if(error)throw error;if(!data?.service||!data?.remito)throw new Error('La respuesta no contiene el remito firmado');R.detail=data;render(data)}
    catch(error){$('#os-review-body').innerHTML=`<div class="os-review-errors visible">${esc(error.message||'No se pudo abrir la revisión')}</div>`;$('#os-review-footer').innerHTML='<button class="btn btn-ghost" type="button" onclick="AuxiliosRemitoReviewV2.close()">Cerrar</button><button class="btn btn-primary" type="button" onclick="AuxiliosRemitoReviewV2.retry()">Reintentar</button>'}
  }

  function retry(){if(R.serviceId)return open(R.serviceId)}
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
    const actions=$('.os-review-global-actions'),resolution=$('.os-review-global-resolution'),label=$('[data-review-reason-label]'),commit=$('[data-review-commit]'),cancel=$('[data-review-cancel-action]'),note=$('.os-review-footer-note');
    if(actions)actions.hidden=true;if(resolution)resolution.hidden=false;
    if(label)label.textContent=action==='rejected'?'Motivo del rechazo':'Motivo de la modificación';
    if(commit)commit.textContent=action==='rejected'?'Rechazar y finalizar':'Guardar modificaciones y finalizar';
    if(cancel)cancel.textContent=action==='rejected'?'Cancelar rechazo':'Cancelar cambios';
    if(note)note.textContent=action==='rejected'?'El rechazo excluirá todos los peajes y excedentes informados.':'Editá directamente todos los valores de la columna Informado.';
    $('[data-review-global-reason]')?.focus();
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
    if(['rejected','adjusted'].includes(action)&&!reason)errors.push(action==='rejected'?'Indicá el motivo del rechazo.':'Indicá el motivo de la modificación.');
    const tollLines=$$('.os-review-report-line[data-kind="toll"]'),excessLines=$$('.os-review-report-line[data-kind="excess"]'),reportedTolls=reported.tolls||[],reportedExcesses=reported.excesses||[];
    const tollById=new Map(reportedTolls.map(row=>[String(row.toll_report_id),row])),excessById=new Map(reportedExcesses.map(row=>[String(row.excess_report_id),row]));let tollChanged=false,excessChanged=false;
    const tolls=tollLines.map(line=>{
      const original=tollById.get(String(line.dataset.reportId))||{},added=!original.toll_report_id,cancelled=action==='rejected'||line.dataset.cancelled==='true';if(action==='adjusted'&&added&&cancelled)return null;
      let tollId=original.toll_id||null,quantity=num(original.quantity||1),unit=num(original.unit_amount),customerMethod=original.customer_payment_method||null;
      if(action==='adjusted'||added){tollId=get(line,'toll_id')||null;quantity=num(get(line,'quantity'));unit=num(get(line,'unit_amount'));customerMethod=get(line,'customer_payment_method')||null}
      const changed=added||(!added&&cancelled)||String(tollId||'')!==String(original.toll_id||'')||Math.abs(quantity-num(original.quantity||1))>.001||Math.abs(unit-num(original.unit_amount))>.001||String(customerMethod||'')!==String(original.customer_payment_method||'');tollChanged=tollChanged||changed;
      const decision=cancelled?'rejected':action==='adjusted'&&changed?'adjusted':'accepted';if(decision!=='rejected'&&(quantity<1||unit<=0))errors.push('Cantidad e importe de cada peaje deben ser mayores a cero.');
      const mode=detail.service?.toll_coverage_mode,payer=mode==='provider_roundtrip'?'provider':mode==='customer_roundtrip'?'customer':customerMethod?'customer':'provider';if(decision!=='rejected'&&payer==='customer'&&!customerMethod)errors.push('Indicá el método de pago de los peajes a cargo del cliente.');
      const ref=(detail.references?.tolls||[]).find(item=>String(item.toll_id)===String(tollId));
      return {toll_report_id:original.toll_report_id||null,review_line_client_id:line.dataset.newId||null,decision,reason:decision==='accepted'?null:reason,toll_id:tollId,toll_name:ref?.name||original.toll_name,quantity,unit_amount:unit,payment_method:original.payment_method||'manual',payer_agent:payer,customer_payment_method:customerMethod};
    }).filter(Boolean);
    reportedTolls.forEach(row=>{if(!tolls.some(item=>String(item.toll_report_id)===String(row.toll_report_id)))errors.push('Revisá todos los peajes antes de aprobar.')});
    const excesses=excessLines.map(line=>{
      const original=excessById.get(String(line.dataset.reportId))||{},added=!original.excess_report_id,cancelled=action==='rejected'||line.dataset.cancelled==='true';if(action==='adjusted'&&added&&cancelled)return null;
      const originalMethod=reportedExcessPayment(original);let conceptId=original.concept_id||null,quantity=num(original.quantity||1),unit=num(original.unit_amount),method=originalMethod||null;
      if(action==='adjusted'||added){conceptId=get(line,'concept_id')||null;quantity=num(get(line,'quantity'));unit=num(get(line,'unit_amount'));method=get(line,'customer_payment_method')||null}
      const changed=added||(!added&&cancelled)||String(conceptId||'')!==String(original.concept_id||'')||Math.abs(quantity-num(original.quantity||1))>.001||Math.abs(unit-num(original.unit_amount))>.001||String(method||'')!==String(originalMethod||'');excessChanged=excessChanged||changed;
      const decision=cancelled?'rejected':action==='adjusted'&&changed?'adjusted':'accepted';if(decision!=='rejected'&&!conceptId)errors.push('Seleccioná el concepto de cada excedente.');if(decision!=='rejected'&&(quantity<=0||unit<=0))errors.push('Cantidad e importe de cada excedente deben ser mayores a cero.');
      const collector=original.collector_agent||'company';if(decision!=='rejected'&&collector==='company'&&!method)errors.push('Indicá el método de pago de cada excedente.');
      return {excess_report_id:original.excess_report_id||null,review_line_client_id:line.dataset.newId||null,decision,review_reason:decision==='accepted'?null:reason,concept_id:conceptId,quantity,unit_amount:unit,collector_agent:collector,customer_payment_method:method};
    }).filter(Boolean);
    reportedExcesses.forEach(row=>{if(!excesses.some(item=>String(item.excess_report_id)===String(row.excess_report_id)))errors.push('Revisá todos los excedentes antes de aprobar.')});
    if(action==='adjusted'&&!tollChanged&&!excessChanged)errors.push('Modificá, agregá o cancelá al menos un peaje o excedente.');
    return {payload:{tolls,excesses},errors};
  }

  async function resolve(){
    if(!R.detail?.can_resolve||!canResolve()||R.resolving)return;const {payload,errors}=buildPayload(),box=$('#os-review-errors');
    if(errors.length){box.textContent=[...new Set(errors)].join(' ');box.classList.add('visible');return}box.classList.remove('visible');R.resolving=true;
    $$('[data-review-global-action],[data-review-commit],[data-review-cancel-action],[data-review-add],.os-review-line-cancel').forEach(button=>{button.disabled=true});const note=$('.os-review-footer-note');if(note)note.textContent='Aplicando revisión y cierre…';
    try{const {data,error}=await _db.rpc('resolve_operator_service_document_v4',{p_service_id:R.detail.service.service_id,p_action:'approve_and_finalize',p_payload:payload});if(error)throw error;if(data?.document_status!=='approved'||data?.status!=='completed')throw new Error('El cierre no confirmó todos los estados');window.toast?.('Remito aprobado y servicio finalizado','success');close();await window.OperatorServices?.loadServices?.()}
    catch(error){R.resolving=false;box.textContent=error.message||'No se pudo aprobar y finalizar';box.classList.add('visible');$$('[data-review-global-action],[data-review-commit],[data-review-cancel-action],[data-review-add],.os-review-line-cancel').forEach(button=>{button.disabled=false});if(note)note.textContent=R.action==='accepted'?'Elegí Rechazar, Modificar o Aprobar para Peajes y Excedentes.':'Revisá el error y volvé a confirmar la decisión.'}
  }

  function tab(){}
  window.AuxiliosRemitoReviewV2={renderInbox,open,retry,close,openEvidence,resolve,chooseGlobalAction,cancelGlobalAction,commitGlobalAction,addLine,toggleLineCancel,tab};
  const boot=setInterval(()=>{if(inject()){clearInterval(boot);renderInbox(window.OperatorServices?.S?.services||[])}},100);setTimeout(()=>clearInterval(boot),15000);
})();

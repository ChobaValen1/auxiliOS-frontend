(function(){
  'use strict';
  const R={detail:null,services:[],serviceId:null,actions:{toll:null,excess:null},resolving:false};
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const num=v=>Number(String(v??'').replace(',','.'))||0;
  const money=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(num(v));
  const TOLL_COVERAGE_LABELS={mixed_manual:'Uno y Uno',provider_roundtrip:'A cargo de la prestadora',customer_roundtrip:'A cargo del cliente'};
  const PAYMENT_LABELS={cash:'Efectivo',transfer:'Transferencia',card:'Tarjeta',mercado_pago:'Mercado Pago',other:'Otro',not_collected:'No cobrado',electronic:'Electrónico',telepass:'TelePASE',manual:'Manual'};
  const tollCoverageLabel=(mode,assigned=true)=>TOLL_COVERAGE_LABELS[String(mode||'')]||(assigned?'Sin formato configurado':'A definir por Operaciones');
  const paymentLabel=value=>PAYMENT_LABELS[String(value||'')]||String(value||'Sin medio informado');
  const dateTime=value=>value?new Date(value).toLocaleString('es-AR'):'—';
  const role=()=>String(typeof PERFIL_USUARIO==='undefined'?'':(PERFIL_USUARIO?.roles?.name||PERFIL_USUARIO?.role||'')).toLowerCase();
  const canResolve=()=>['administracion','operador'].includes(role());
  function inject(){
    const screen=$('#screen-operaciones');if(!screen)return false;
    if(!$('#os-remito-inbox')){$('#os-driver-intakes',screen)?.insertAdjacentHTML('afterend','<section id="os-remito-inbox" class="os-remito-inbox" hidden><header><div><b>Remitos recibidos</b><small>Revisión de peajes, excedentes, evidencia y documento firmado.</small></div><span id="os-remito-inbox-count" class="os-remito-inbox-count">0</span></header><div id="os-remito-inbox-list" class="os-remito-inbox-list"></div></section>')}
    if(!$('#os-remito-review-modal'))document.body.insertAdjacentHTML('beforeend','<div id="os-remito-review-modal" class="os-review-modal" hidden><div class="os-review-shell"><header><div><b id="os-review-title">Revisión y cierre</b><small id="os-review-subtitle">Control operativo del remito</small></div><div class="os-review-header-actions"><button class="os-review-close" type="button" onclick="AuxiliosRemitoReviewV2.close()" aria-label="Cerrar revisión">×</button></div></header><div id="os-review-body" class="os-review-body"></div><footer id="os-review-footer" class="os-review-footer"></footer></div></div>');
    return true;
  }
  function needsReview(s){return !!s.remito_id&&(
    s.document_status==='submitted'||
    (s.document_status==='approved'&&['pending','legacy'].includes(s.remito_addons_review_status))
  )&&s.billing_status!=='invoiced'}
  function renderInbox(services){
    if(!inject())return;R.services=services||[];const rows=R.services.filter(needsReview);const panel=$('#os-remito-inbox'),list=$('#os-remito-inbox-list'),count=$('#os-remito-inbox-count');
    if(!panel||!list)return;panel.hidden=!rows.length;if(count)count.textContent=String(rows.length);
    list.innerHTML=rows.map(s=>{const extras=[`Peajes: ${num(s.remito_toll_count)} · ${money(s.remito_toll_total)}`,`Excedentes: ${num(s.remito_excess_count)} · ${money(s.remito_excess_total)}`,`Evidencias: ${num(s.remito_evidence_count)}`].join(' · '),driverData=[s.remito_customer_name,s.remito_customer_document&&`DNI/CUIT ${s.remito_customer_document}`,s.remito_customer_phone&&`Tel. ${s.remito_customer_phone}`].filter(Boolean).join(' · '),action=canResolve()&&['at_origin','completed'].includes(s.status)?'Revisar y cerrar':'Ver remito';return`<article class="os-remito-inbox-item"><div><b>${esc(s.service_order_number||s.service_number)} · ${esc(s.remito_number||'Remito')}</b><small>${esc(s.company_name||'Prestadora')} · ${esc(s.remito_vehicle_plate||s.vehicle_plate||'Sin patente')} · Firmado ${esc(dateTime(s.remito_signed_at))}</small><small class="os-toll-coverage">Formato de cobro de peajes: ${esc(tollCoverageLabel(s.toll_coverage_mode))}</small>${driverData?`<small>${esc(driverData)}</small>`:''}<small>${esc(extras)}</small></div><button type="button" class="btn btn-primary" onclick="AuxiliosRemitoReviewV2.open('${s.service_id}')">${action}</button></article>`}).join('');
  }
  const paymentOptions=value=>[['cash','Efectivo'],['transfer','Transferencia'],['card','Tarjeta'],['mercado_pago','Mercado Pago'],['other','Otro'],['not_collected','No cobrado']].map(([v,l])=>`<option value="${v}" ${value===v?'selected':''}>${l}</option>`).join('');
  const rowKey=()=>globalThis.crypto?.randomUUID?.()||'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(Number(c)^Math.random()*16>>Number(c)/4).toString(16));
  function reportedExcessPayment(x){if(x.customer_payment_method)return x.customer_payment_method;try{return JSON.parse(x.notes||'{}').payment_method||''}catch{return''}}
  const amountOf=x=>num(x.total_amount)||num(x.quantity||1)*num(x.unit_amount);
  const compareText=value=>String(value??'').trim().toLocaleLowerCase('es-AR');
  function comparisonKey(kind,x){
    const identity=kind==='toll'?(x.toll_id||compareText(x.toll_name)):(x.concept_id||compareText(x.concept_name));
    const method=kind==='toll'?(x.customer_payment_method||''):(reportedExcessPayment(x)||'');
    return[identity,num(x.quantity||1).toFixed(2),amountOf(x).toFixed(2),String(method)].join('|');
  }
  function hasDifference(kind,plannedRows,reportedRows){
    const planned=(plannedRows||[]).map(x=>comparisonKey(kind,x)).sort();
    const reported=(reportedRows||[]).map(x=>comparisonKey(kind,x)).sort();
    return planned.length!==reported.length||planned.some((value,index)=>value!==reported[index]);
  }
  const EMPTY_LABELS={toll:{planned:'Sin peajes planificados',reported:'Sin peajes informados'},excess:{planned:'Sin excedentes planificados',reported:'Sin excedentes informados'}};
  function comparisonTable(kind,rows,side){
    const toll=kind==='toll';
    if(!rows.length)return`<div class="os-review-empty">${EMPTY_LABELS[kind][side]}</div>`;
    const head=toll?'Peaje':'Concepto';
    const method=side==='reported'?'<th>Método de pago</th>':'';
    return`<div class="os-review-table-wrap"><table class="os-review-table"><thead><tr><th>${head}</th><th>Cant.</th><th>Monto</th>${method}</tr></thead><tbody>${rows.map(x=>{const name=toll?x.toll_name:x.concept_name,payment=toll?x.customer_payment_method:reportedExcessPayment(x);return`<tr><td>${esc(name||'Sin identificar')}</td><td>${esc(num(x.quantity||1))}</td><td>${money(amountOf(x))}</td>${side==='reported'?`<td>${esc(paymentLabel(payment))}</td>`:''}</tr>`}).join('')}</tbody></table></div>`;
  }
  function tollLine(x,i,data){
    const refs=data.references?.tolls||[],current=x.toll_id||'';
    return`<tr class="os-review-report-line" data-kind="toll" data-original-key="${esc(comparisonKey('toll',x))}" data-report-id="${esc(x.toll_report_id||'')}" data-cancelled="false"><td><select data-field="toll_id" disabled><option value="" ${current?'':'selected'}>${esc(x.toll_name||'Sin clasificar')}</option>${refs.map(t=>`<option value="${t.toll_id}" ${String(current)===String(t.toll_id)?'selected':''}>${esc(t.name)}${t.road?' · '+esc(t.road):''}</option>`).join('')}</select></td><td><input data-field="quantity" type="number" min="1" step="1" value="${esc(x.quantity||1)}" disabled></td><td><input data-field="unit_amount" inputmode="decimal" value="${esc(x.unit_amount)}" disabled></td><td><select data-field="customer_payment_method" disabled><option value="">Sin medio informado</option>${paymentOptions(x.customer_payment_method||'')}</select><button class="os-review-line-cancel" type="button" onclick="AuxiliosRemitoReviewV2.toggleLineCancel(this)" hidden>Cancelar línea</button></td></tr>`;
  }
  function excessLine(x,i,data){
    const refs=data.references?.excess_concepts||[],current=x.concept_id||'',method=reportedExcessPayment(x);
    return`<tr class="os-review-report-line" data-kind="excess" data-original-key="${esc(comparisonKey('excess',x))}" data-report-id="${esc(x.excess_report_id||'')}" data-cancelled="false"><td><select data-field="concept_id" disabled><option value="">Seleccionar concepto</option>${refs.map(c=>`<option value="${c.concept_id}" ${String(current)===String(c.concept_id)?'selected':''}>${esc(c.name)}</option>`).join('')}</select></td><td><input data-field="quantity" inputmode="decimal" value="${esc(x.quantity||1)}" disabled></td><td><input data-field="unit_amount" inputmode="decimal" value="${esc(x.unit_amount)}" disabled></td><td><select data-field="customer_payment_method" disabled><option value="">Sin medio informado</option>${paymentOptions(method)}</select><button class="os-review-line-cancel" type="button" onclick="AuxiliosRemitoReviewV2.toggleLineCancel(this)" hidden>Cancelar línea</button></td></tr>`;
  }
  function reportedTable(kind,rows,data){
    const toll=kind==='toll',head=toll?'Peaje':'Concepto';
    if(!rows.length)return`<div class="os-review-empty">${EMPTY_LABELS[kind].reported}</div><div class="os-review-add-wrap"><button type="button" onclick="AuxiliosRemitoReviewV2.addLine('${kind}')" hidden data-review-add>Agregar ${toll?'peaje':'excedente'}</button></div>`;
    return`<div class="os-review-table-wrap"><table class="os-review-table os-review-editable-table"><thead><tr><th>${head}</th><th>Cant.</th><th>Monto</th><th>Método</th></tr></thead><tbody>${rows.map((x,i)=>toll?tollLine(x,i,data):excessLine(x,i,data)).join('')}</tbody></table></div><div class="os-review-add-wrap"><button type="button" onclick="AuxiliosRemitoReviewV2.addLine('${kind}')" hidden data-review-add>Agregar ${toll?'peaje':'excedente'}</button></div>`;
  }
  function reviewActions(kind,difference,canEdit){
    const status=difference?'<span class="os-review-difference">Con diferencias</span>':'<span class="os-review-match">Coincide</span>';
    if(!canEdit)return status;
    return`<div class="os-review-diff-actions" role="group" aria-label="Resolver ${kind==='toll'?'peajes':'excedentes'}">${status}<div><button type="button" data-review-action="rejected" aria-pressed="false" onclick="AuxiliosRemitoReviewV2.chooseAction('${kind}','rejected')">Rechazar</button><button type="button" data-review-action="adjusted" aria-pressed="false" onclick="AuxiliosRemitoReviewV2.chooseAction('${kind}','adjusted')">Modificar</button><button type="button" data-review-action="accepted" aria-pressed="false" onclick="AuxiliosRemitoReviewV2.chooseAction('${kind}','accepted')">Aprobar</button></div></div>`;
  }
  function comparisonSection(kind,data){
    const toll=kind==='toll',plannedRows=data.planned?.[toll?'tolls':'excesses']||[],reportedRows=data.reported?.[toll?'tolls':'excesses']||[],difference=hasDifference(kind,plannedRows,reportedRows),title=toll?'Peajes':'Excedentes';
    const format=toll?`<div class="os-review-format"><span>Formato de Pago de Peajes</span><b>${esc(tollCoverageLabel(data.service?.toll_coverage_mode,!!data.service?.service_id))}</b></div>`:'';
    return`<section class="os-review-comparison-group os-review-matrix-row" data-review-kind="${kind}" data-difference="${difference}" data-mode="idle"><header class="os-review-group-header"><h3>${title}</h3>${reviewActions(kind,difference,data.can_resolve&&canResolve())}</header>${format}<div class="os-review-matrix-grid"><section class="os-review-column">${comparisonTable(kind,plannedRows,'planned')}</section><section class="os-review-column">${reportedTable(kind,reportedRows,data)}</section></div><div class="os-review-resolution" hidden><label>Motivo<textarea data-review-reason placeholder="Indicá brevemente el motivo"></textarea></label><button type="button" class="btn btn-primary" data-review-commit onclick="AuxiliosRemitoReviewV2.applySection('${kind}')">Aplicar decisión</button></div></section>`;
  }
  function render(data){
    const s=data.service,r=data.remito,reported=data.reported||{};$('#os-review-title').textContent='Revisión y cierre';$('#os-review-subtitle').textContent=`Remito ${r.remito_number||r.remito_id} · ${s.service_order_number||s.service_number} · ${s.company_name||'Prestadora'}`;
    R.actions={
      toll:hasDifference('toll',data.planned?.tolls||[],reported.tolls||[])?null:'accepted',
      excess:hasDifference('excess',data.planned?.excesses||[],reported.excesses||[])?null:'accepted'
    };
    $('#os-review-body').innerHTML=`<section class="os-review-comparison-card"><header class="os-review-comparison-header"><div><span>Control operativo</span><h3>Planificado vs. informado</h3></div><div class="os-review-matrix-head" aria-hidden="true"><b>Planificado</b><b>Informado</b></div></header>${comparisonSection('toll',data)}${comparisonSection('excess',data)}<div id="os-review-errors" class="os-review-errors"></div></section>`;
    const footer=$('#os-review-footer');footer.innerHTML=`<small>${data.can_resolve?'Resolvé Peajes y Excedentes desde sus acciones.':'Documento aprobado o servicio inmutable.'}</small><button class="btn btn-ghost" type="button" onclick="AuxiliosRemitoReviewV2.close()">Cerrar</button>`;updateApplyState();
  }
  async function open(serviceId){inject();R.serviceId=serviceId;const modal=$('#os-remito-review-modal');modal.hidden=false;$('#os-review-title').textContent='Revisión y cierre';$('#os-review-subtitle').textContent='Control operativo del remito';$('#os-review-body').innerHTML='<div class="os-review-section os-review-loading">Cargando revisión…</div>';$('#os-review-footer').innerHTML='';try{const {data,error}=await _db.rpc('get_operator_service_remito_review_v2',{p_service_id:serviceId});if(error)throw error;if(!data?.service||!data?.remito)throw new Error('La respuesta no contiene el remito firmado');R.detail=data;render(data)}catch(e){$('#os-review-body').innerHTML=`<div class="os-review-errors visible">${esc(e.message||'No se pudo abrir la revisión')}</div>`;$('#os-review-footer').innerHTML='<button class="btn btn-ghost" type="button" onclick="AuxiliosRemitoReviewV2.close()">Cerrar</button><button class="btn btn-primary" type="button" onclick="AuxiliosRemitoReviewV2.retry()">Reintentar</button>'}}
  function retry(){if(R.serviceId)return open(R.serviceId)}
  function close(){const modal=$('#os-remito-review-modal');if(modal)modal.hidden=true;R.detail=null;R.serviceId=null;R.actions={toll:null,excess:null};R.resolving=false}
  async function openEvidence(bucket,path){const {data,error}=await _db.storage.from(bucket).createSignedUrl(path,120);if(error)return window.toast?.(error.message,'error');window.open(data.signedUrl,'_blank','noopener')}
  function get(line,field){return $(`[data-field="${field}"]`,line)?.value?.trim()||''}
  function sectionFor(kind){return $(`[data-review-kind="${kind}"]`)}
  function sectionReason(kind){return $('[data-review-reason]',sectionFor(kind))?.value?.trim()||''}
  function chooseAction(kind,action){
    if(!['toll','excess'].includes(kind)||!['rejected','adjusted','accepted'].includes(action))return;
    const section=sectionFor(kind);if(!section)return;
    R.actions[kind]=action==='accepted'?'accepted':null;section.dataset.mode=action;
    $$('[data-review-action]',section).forEach(button=>{const selected=button.dataset.reviewAction===action;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected))});
    const resolution=$('.os-review-resolution',section),commit=$('[data-review-commit]',section),editable=action==='adjusted';
    if(resolution){resolution.hidden=action==='accepted';const label=$('label',resolution);if(label)label.firstChild.textContent=action==='rejected'?'Motivo del rechazo':'Motivo de la modificación';if(commit)commit.textContent=action==='rejected'?'Aplicar rechazo':'Aplicar modificación'}
    $$('input,select',section).forEach(input=>input.disabled=!editable);
    $$('[data-review-add],[data-field]+.os-review-line-cancel,.os-review-line-cancel',section).forEach(button=>button.hidden=!editable);
    if(action==='accepted')$$('.os-review-report-line',section).forEach(line=>setLineCancelled(line,false));
    if(action==='rejected')$$('.os-review-report-line',section).forEach(line=>setLineCancelled(line,true));
    updateApplyState();
    if(action==='accepted')maybeResolve();
  }
  function setLineCancelled(line,cancelled){line.dataset.cancelled=String(cancelled);line.classList.toggle('is-cancelled',cancelled);$$('input,select',line).forEach(input=>input.disabled=cancelled||sectionFor(line.dataset.kind)?.dataset.mode!=='adjusted');const button=$('.os-review-line-cancel',line);if(button)button.textContent=cancelled?'Restaurar línea':'Cancelar línea'}
  function toggleLineCancel(button){const line=button?.closest?.('.os-review-report-line');if(!line)return;setLineCancelled(line,line.dataset.cancelled!=='true')}
  function newLine(kind,data){
    if(kind==='toll'){const refs=data.references?.tolls||[];return`<tr class="os-review-report-line is-new" data-kind="toll" data-new-id="${esc(rowKey())}" data-original-key="" data-report-id="" data-cancelled="false"><td><select data-field="toll_id"><option value="">Seleccionar peaje</option>${refs.map(t=>`<option value="${t.toll_id}">${esc(t.name)}${t.road?' · '+esc(t.road):''}</option>`).join('')}</select></td><td><input data-field="quantity" type="number" min="1" step="1" value="1"></td><td><input data-field="unit_amount" inputmode="decimal" value=""></td><td><select data-field="customer_payment_method"><option value="">Sin medio informado</option>${paymentOptions('')}</select><button class="os-review-line-cancel" type="button" onclick="AuxiliosRemitoReviewV2.toggleLineCancel(this)">Cancelar línea</button></td></tr>`}
    const refs=data.references?.excess_concepts||[];return`<tr class="os-review-report-line is-new" data-kind="excess" data-new-id="${esc(rowKey())}" data-original-key="" data-report-id="" data-cancelled="false"><td><select data-field="concept_id"><option value="">Seleccionar concepto</option>${refs.map(c=>`<option value="${c.concept_id}">${esc(c.name)}</option>`).join('')}</select></td><td><input data-field="quantity" inputmode="decimal" value="1"></td><td><input data-field="unit_amount" inputmode="decimal" value=""></td><td><select data-field="customer_payment_method"><option value="">Sin medio informado</option>${paymentOptions('')}</select><button class="os-review-line-cancel" type="button" onclick="AuxiliosRemitoReviewV2.toggleLineCancel(this)">Cancelar línea</button></td></tr>`;
  }
  function addLine(kind){
    const section=sectionFor(kind);if(!section||section.dataset.mode!=='adjusted')return;
    let tbody=$('.os-review-column:last-child tbody',section);
    if(!tbody){$('.os-review-column:last-child',section).innerHTML=`<div class="os-review-table-wrap"><table class="os-review-table os-review-editable-table"><thead><tr><th>${kind==='toll'?'Peaje':'Concepto'}</th><th>Cant.</th><th>Monto</th><th>Método</th></tr></thead><tbody></tbody></table></div><div class="os-review-add-wrap"><button type="button" onclick="AuxiliosRemitoReviewV2.addLine('${kind}')" data-review-add>Agregar ${kind==='toll'?'peaje':'excedente'}</button></div>`;tbody=$('.os-review-column:last-child tbody',section)}
    tbody.insertAdjacentHTML('beforeend',newLine(kind,R.detail||{}));
  }
  function applySection(kind){const section=sectionFor(kind);if(!section)return;const mode=section.dataset.mode;if(!['rejected','adjusted'].includes(mode))return;R.actions[kind]=mode;updateApplyState();maybeResolve()}
  function updateApplyState(){
    const footer=$('#os-review-footer');if(!footer)return;
    const pending=['toll','excess'].some(kind=>!R.actions[kind]);
    const note=$('small',footer);if(note)note.textContent=pending?'Resolvé Peajes y Excedentes desde sus acciones.':'Aplicando revisión y cierre en una sola operación.';
  }
  function maybeResolve(){if(['toll','excess'].every(kind=>R.actions[kind])&&!R.resolving)void resolve()}
  function buildPayload(){
    const detail=R.detail||{},reported=detail.reported||{},errors=[];
    const tollAction=R.actions.toll,excessAction=R.actions.excess,tollReason=sectionReason('toll'),excessReason=sectionReason('excess');
    if(!tollAction)errors.push('Elegí Rechazar, Modificar o Aprobar para Peajes.');
    if(!excessAction)errors.push('Elegí Rechazar, Modificar o Aprobar para Excedentes.');
    if(['rejected','adjusted'].includes(tollAction)&&!tollReason)errors.push('Indicá el motivo de la decisión sobre Peajes.');
    if(['rejected','adjusted'].includes(excessAction)&&!excessReason)errors.push('Indicá el motivo de la decisión sobre Excedentes.');
    const tollLines=$$('.os-review-report-line[data-kind="toll"]'),excessLines=$$('.os-review-report-line[data-kind="excess"]');
    const reportedTolls=reported.tolls||[],reportedExcesses=reported.excesses||[];
    const tollById=new Map(reportedTolls.map(x=>[String(x.toll_report_id),x])),excessById=new Map(reportedExcesses.map(x=>[String(x.excess_report_id),x]));
    let tollChanged=false,excessChanged=false;
    const tolls=tollLines.map(line=>{
      const x=tollById.get(String(line.dataset.reportId))||{},cancelled=line.dataset.cancelled==='true',added=!x.toll_report_id;
      let tollId=x.toll_id||null,quantity=num(x.quantity||1),unit=num(x.unit_amount),customer=x.customer_payment_method||null;
      if(tollAction==='adjusted'||added){tollId=get(line,'toll_id')||null;quantity=num(get(line,'quantity'));unit=num(get(line,'unit_amount'));customer=get(line,'customer_payment_method')||null}
      const ref=(detail.references?.tolls||[]).find(item=>String(item.toll_id)===String(tollId));
      const changed=added||cancelled||String(tollId||'')!==String(x.toll_id||'')||Math.abs(quantity-num(x.quantity||1))>.001||Math.abs(unit-num(x.unit_amount))>.001||String(customer||'')!==String(x.customer_payment_method||'');
      tollChanged=tollChanged||changed;
      const decision=tollAction==='rejected'||cancelled?'rejected':tollAction==='adjusted'&&changed?'adjusted':'accepted';
      if(decision!=='rejected'&&(quantity<1||unit<=0))errors.push('Cantidad e importe de cada peaje deben ser mayores a cero.');
      const mode=detail.service?.toll_coverage_mode,payer=mode==='provider_roundtrip'?'provider':mode==='customer_roundtrip'?'customer':customer?'customer':'provider';
      if(decision!=='rejected'&&payer==='customer'&&!customer)errors.push('Indicá el método de pago de los peajes a cargo del cliente.');
      return{toll_report_id:x.toll_report_id||null,review_line_client_id:line.dataset.newId||null,decision,reason:decision==='accepted'?null:tollReason,toll_id:tollId,toll_name:ref?.name||x.toll_name,quantity,unit_amount:unit,payment_method:x.payment_method||'manual',payer_agent:payer,customer_payment_method:customer};
    });
    reportedTolls.forEach(x=>{if(!tolls.some(row=>String(row.toll_report_id)===String(x.toll_report_id)))errors.push('Revisá todos los peajes antes de aprobar.')});
    const excesses=excessLines.map(line=>{
      const x=excessById.get(String(line.dataset.reportId))||{},cancelled=line.dataset.cancelled==='true',added=!x.excess_report_id,originalMethod=reportedExcessPayment(x);
      let conceptId=x.concept_id||null,quantity=num(x.quantity||1),unit=num(x.unit_amount),method=originalMethod||null;
      if(excessAction==='adjusted'||added){conceptId=get(line,'concept_id')||null;quantity=num(get(line,'quantity'));unit=num(get(line,'unit_amount'));method=get(line,'customer_payment_method')||null}
      const changed=added||cancelled||String(conceptId||'')!==String(x.concept_id||'')||Math.abs(quantity-num(x.quantity||1))>.001||Math.abs(unit-num(x.unit_amount))>.001||String(method||'')!==String(originalMethod||'');
      excessChanged=excessChanged||changed;
      const decision=excessAction==='rejected'||cancelled?'rejected':excessAction==='adjusted'&&changed?'adjusted':'accepted';
      if(decision!=='rejected'&&!conceptId)errors.push('Seleccioná el concepto de cada excedente.');
      if(decision!=='rejected'&&(quantity<=0||unit<=0))errors.push('Cantidad e importe de cada excedente deben ser mayores a cero.');
      const collector=x.collector_agent||'company';
      if(decision!=='rejected'&&collector==='company'&&!method)errors.push('Indicá el método de pago de cada excedente.');
      return{excess_report_id:x.excess_report_id||null,review_line_client_id:line.dataset.newId||null,decision,review_reason:decision==='accepted'?null:excessReason,concept_id:conceptId,quantity,unit_amount:unit,collector_agent:collector,customer_payment_method:method};
    });
    reportedExcesses.forEach(x=>{if(!excesses.some(row=>String(row.excess_report_id)===String(x.excess_report_id)))errors.push('Revisá todos los excedentes antes de aprobar.')});
    if(tollAction==='adjusted'&&!tollChanged)errors.push('Modificá, agregá o cancelá al menos un dato de Peajes.');
    if(excessAction==='adjusted'&&!excessChanged)errors.push('Modificá, agregá o cancelá al menos un dato de Excedentes.');
    return{payload:{tolls,excesses},errors};
  }
  async function resolve(){if(!R.detail?.can_resolve||!canResolve()||R.resolving)return;const {payload,errors}=buildPayload(),box=$('#os-review-errors');if(errors.length){box.textContent=[...new Set(errors)].join(' ');box.classList.add('visible');return}box.classList.remove('visible');R.resolving=true;$$('[data-review-action],[data-review-commit],[data-review-add]').forEach(button=>button.disabled=true);const note=$('#os-review-footer small');if(note)note.textContent='Aplicando revisión y cierre…';try{const {data,error}=await _db.rpc('resolve_operator_service_document_v4',{p_service_id:R.detail.service.service_id,p_action:'approve_and_finalize',p_payload:payload});if(error)throw error;if(data?.document_status!=='approved'||data?.status!=='completed')throw new Error('El cierre no confirmó todos los estados');window.toast?.('Remito aprobado y servicio finalizado','success');close();await window.OperatorServices?.loadServices?.()}catch(e){R.resolving=false;box.textContent=e.message||'No se pudo aprobar y finalizar';box.classList.add('visible');$$('[data-review-action],[data-review-commit],[data-review-add]').forEach(button=>button.disabled=false);if(note)note.textContent='Revisá el error y volvé a aplicar la decisión.'}}
  function tab(){updateApplyState()}
  window.AuxiliosRemitoReviewV2={renderInbox,open,retry,close,openEvidence,resolve,chooseAction,applySection,addLine,toggleLineCancel,tab};
  const boot=setInterval(()=>{if(inject()){clearInterval(boot);renderInbox(window.OperatorServices?.S?.services||[])}},100);setTimeout(()=>clearInterval(boot),15000);
})();

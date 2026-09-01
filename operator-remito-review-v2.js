(function(){
  'use strict';
  const R={detail:null,services:[],serviceId:null,actions:{toll:null,excess:null}};
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const num=v=>Number(String(v??'').replace(',','.'))||0;
  const money=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(num(v));
  const TOLL_COVERAGE_LABELS={mixed_manual:'Uno y Uno',provider_roundtrip:'A cargo de la prestadora',customer_roundtrip:'A cargo del cliente'};
  const PAYMENT_LABELS={cash:'Efectivo',transfer:'Transferencia',card:'Tarjeta',mercado_pago:'Mercado Pago',other:'Otro',not_collected:'No cobrado',electronic:'Electrónico',telepass:'TelePASE',manual:'Manual'};
  const EVIDENCE_LABELS={vehicle_front:'Frente del vehículo',vehicle_side:'Lateral del vehículo',odometer:'Odómetro',extra:'Evidencia general',toll_ticket:'Comprobante histórico de peaje',excess_support:'Respaldo de excedente'};
  const tollCoverageLabel=(mode,assigned=true)=>TOLL_COVERAGE_LABELS[String(mode||'')]||(assigned?'Sin formato configurado':'A definir por Operaciones');
  const paymentLabel=value=>PAYMENT_LABELS[String(value||'')]||String(value||'Sin medio informado');
  const dateTime=value=>value?new Date(value).toLocaleString('es-AR'):'—';
  const role=()=>String(typeof PERFIL_USUARIO==='undefined'?'':(PERFIL_USUARIO?.roles?.name||PERFIL_USUARIO?.role||'')).toLowerCase();
  const canResolve=()=>['administracion','operador'].includes(role());
  function inject(){
    const screen=$('#screen-operaciones');if(!screen)return false;
    if(!$('#os-remito-inbox')){$('#os-driver-intakes',screen)?.insertAdjacentHTML('afterend','<section id="os-remito-inbox" class="os-remito-inbox" hidden><header><div><b>Remitos recibidos</b><small>Revisión de peajes, excedentes, evidencia y documento firmado.</small></div><span id="os-remito-inbox-count" class="os-remito-inbox-count">0</span></header><div id="os-remito-inbox-list" class="os-remito-inbox-list"></div></section>')}
    if(!$('#os-remito-review-modal'))document.body.insertAdjacentHTML('beforeend','<div id="os-remito-review-modal" class="os-review-modal" hidden><div class="os-review-shell"><header><div><b id="os-review-title">Remito firmado</b><small id="os-review-subtitle">Documento recibido</small></div><div class="os-review-header-actions"><button type="button" onclick="AuxiliosRemitoReviewV2.download()">Descargar PDF</button><button type="button" onclick="AuxiliosRemitoReviewV2.toggleFullscreen()">Ampliar</button><button class="os-review-close" type="button" onclick="AuxiliosRemitoReviewV2.close()">×</button></div></header><nav class="os-review-tabs" aria-label="Vistas del remito"><button type="button" class="active" data-review-tab="document" onclick="AuxiliosRemitoReviewV2.tab(\'document\')">Remito firmado</button><button type="button" data-review-tab="review" onclick="AuxiliosRemitoReviewV2.tab(\'review\')">Revisión y cierre</button></nav><div id="os-review-body" class="os-review-body"></div><footer id="os-review-footer" class="os-review-footer"></footer></div></div>');
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
  function reportedExcessPayment(x){if(x.customer_payment_method)return x.customer_payment_method;try{return JSON.parse(x.notes||'{}').payment_method||''}catch{return''}}
  function evidenceCards(items){return(items||[]).map(e=>`<a class="os-review-evidence-card" data-remito-evidence data-bucket="${esc(e.bucket||'')}" data-path="${esc(e.path||'')}" data-mime="${esc(e.mime_type||'')}" data-url="${esc(e.url||'')}" target="_blank" rel="noopener" aria-disabled="true"><span>Cargando evidencia…</span><small>${esc(e.context||EVIDENCE_LABELS[e.kind]||'Evidencia')} · ${esc(e.original_name||'archivo')}</small></a>`).join('')||'<span class="os-review-original">Sin archivo adjunto</span>'}
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
    const head=toll?'Peajes adjuntados':'Concepto';
    return`<div class="os-review-table-wrap"><table class="os-review-table"><thead><tr><th>${head}</th><th>Cantidad</th><th>Monto</th><th>Método de pago</th></tr></thead><tbody>${rows.map(x=>{const name=toll?x.toll_name:x.concept_name,method=toll?x.customer_payment_method:reportedExcessPayment(x);return`<tr><td>${esc(name||'Sin identificar')}</td><td>${esc(num(x.quantity||1))}</td><td>${money(amountOf(x))}</td><td>${esc(paymentLabel(method))}</td></tr>`}).join('')}</tbody></table></div>`;
  }
  function tollEditor(x,i,data){
    const refs=data.references?.tolls||[],current=x.toll_id||'';
    return`<div class="os-review-edit-row os-review-line" data-kind="toll" data-report-id="${esc(x.toll_report_id)}"><label>Peaje<select data-field="toll_id"><option value="" ${current?'':'selected'}>${esc(x.toll_name||'Sin clasificar')}</option>${refs.map(t=>`<option value="${t.toll_id}" ${String(current)===String(t.toll_id)?'selected':''}>${esc(t.name)}${t.road?' · '+esc(t.road):''}</option>`).join('')}</select></label><label>Cantidad<input data-field="quantity" type="number" min="1" step="1" value="${esc(x.quantity||1)}"></label><label>Monto unitario<input data-field="unit_amount" inputmode="decimal" value="${esc(x.unit_amount)}"></label><label>Método de pago<select data-field="customer_payment_method"><option value="">Sin medio informado</option>${paymentOptions(x.customer_payment_method||'')}</select></label></div>`;
  }
  function excessEditor(x,i,data){
    const refs=data.references?.excess_concepts||[],current=x.concept_id||'',method=reportedExcessPayment(x);
    return`<div class="os-review-edit-row os-review-line" data-kind="excess" data-report-id="${esc(x.excess_report_id)}"><label>Concepto<select data-field="concept_id"><option value="">Seleccionar concepto</option>${refs.map(c=>`<option value="${c.concept_id}" ${String(current)===String(c.concept_id)?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label>Cantidad<input data-field="quantity" inputmode="decimal" value="${esc(x.quantity||1)}"></label><label>Monto unitario<input data-field="unit_amount" inputmode="decimal" value="${esc(x.unit_amount)}"></label><label>Método de pago<select data-field="customer_payment_method"><option value="">Sin medio informado</option>${paymentOptions(method)}</select></label></div>`;
  }
  function reviewActions(kind,difference,canEdit){
    if(!difference)return'<span class="os-review-match">Coincide</span>';
    if(!canEdit)return'<span class="os-review-difference">Con diferencias</span>';
    return`<div class="os-review-diff-actions" role="group" aria-label="Resolver diferencias"><span>Se encontraron diferencias</span><div><button type="button" data-review-action="rejected" aria-pressed="false" onclick="AuxiliosRemitoReviewV2.chooseAction('${kind}','rejected')">Rechazar</button><button type="button" data-review-action="adjusted" aria-pressed="false" onclick="AuxiliosRemitoReviewV2.chooseAction('${kind}','adjusted')">Modificar</button><button type="button" data-review-action="accepted" aria-pressed="false" onclick="AuxiliosRemitoReviewV2.chooseAction('${kind}','accepted')">Aprobar</button></div></div>`;
  }
  function comparisonSection(kind,data){
    const toll=kind==='toll',plannedRows=data.planned?.[toll?'tolls':'excesses']||[],reportedRows=data.reported?.[toll?'tolls':'excesses']||[],difference=hasDifference(kind,plannedRows,reportedRows),title=toll?'1. Peajes':'2. Excedentes';
    const format=toll?`<div class="os-review-format"><span>Formato de cobro de peajes</span><b>${esc(tollCoverageLabel(data.service?.toll_coverage_mode,!!data.service?.service_id))}</b></div>`:'';
    const editors=reportedRows.map((x,i)=>toll?tollEditor(x,i,data):excessEditor(x,i,data)).join('')||`<div class="os-review-empty">Sin ${toll?'peajes':'excedentes'} informados para modificar</div>`;
    return`<section class="os-review-comparison-group" data-review-kind="${kind}" data-difference="${difference}"><header class="os-review-group-header"><h3>${title}</h3>${reviewActions(kind,difference,data.can_resolve&&canResolve())}</header>${format}<div class="os-review-columns"><section class="os-review-column"><header class="os-review-column-header"><h4>Planificado</h4></header>${comparisonTable(kind,plannedRows,'planned')}</section><section class="os-review-column"><header class="os-review-column-header"><h4>Informado</h4></header>${comparisonTable(kind,reportedRows,'reported')}</section></div><div class="os-review-resolution" hidden><label>Motivo<textarea data-review-reason placeholder="Indicá brevemente el motivo"></textarea></label></div><div class="os-review-editor" hidden><h4>Modificar lo informado</h4><div class="os-review-edit-table">${editors}</div></div></section>`;
  }
  function allEvidence(reported,remito){const general=(reported.evidence||[]).map(e=>({...e,context:EVIDENCE_LABELS[e.kind]||'Evidencia general'})),tolls=(reported.tolls||[]).flatMap((x,i)=>(x.evidence||[]).map(e=>({...e,context:`Peaje ${i+1} · ${x.toll_name||'Peaje'}`}))),excesses=(reported.excesses||[]).flatMap((x,i)=>(x.evidence||[]).map(e=>({...e,context:`Excedente ${i+1} · ${x.concept_name||'Excedente'}`}))),legacy=(remito.legacy_photos||[]).filter(Boolean).map((url,i)=>({url,mime_type:'image/jpeg',kind:'extra',context:`Foto histórica ${i+1}`,original_name:`Foto ${i+1}`}));return[...general,...tolls,...excesses,...legacy]}
  const yesNo=v=>v===true?'Sí':v===false?'No':'Sin confirmar';
  function signedDocument(data){
    const s=data.service,r=data.remito,reported=data.reported||{},edited=data.last_correction,evidence=allEvidence(reported,r),tolls=reported.tolls||[],excesses=reported.excesses||[];
    const lines=tolls.map(x=>`<div><span>Peaje · ${esc(x.toll_name)} · ${esc(paymentLabel(x.customer_payment_method))}</span><b>${money(x.total_amount)}</b></div>`).join('')+excesses.map(x=>`<div><span>Excedente · ${esc(x.concept_name)} · ${esc(paymentLabel(reportedExcessPayment(x)))}</span><b>${money(x.total_amount)}</b></div>`).join('');
    return`<article id="os-signed-document" class="os-signed-document"><header><div><small>AuxiliOS · Remito digital firmado</small><h2>Remito ${esc(r.remito_number||r.remito_id)}</h2></div><div><b>${esc(s.service_order_number||s.service_number)}</b><small>Firmado ${esc(dateTime(r.signed_at))}</small><small>Recibido ${esc(dateTime(r.received_at))}</small></div></header>${edited?`<div class="os-signed-edited">Editado después de firmar · ${esc(dateTime(edited.edited_at))} · ${esc(edited.edited_by_name||'Chofer')}</div>`:''}<section><h3>Servicio</h3><div class="os-review-facts"><div class="os-review-fact"><span>Prestadora</span><b>${esc(s.company_name||'—')}</b></div><div class="os-review-fact"><span>Chofer</span><b>${esc(r.driver_name||'—')}</b></div><div class="os-review-fact"><span>Vehículo</span><b>${esc(r.vehicle_plate||'—')}</b><small>${esc(r.vehicle_make_model||'')}</small></div><div class="os-review-fact"><span>Recorrido informado</span><b>${esc(r.origin||'—')} → ${esc(r.destination||'—')}</b><small>${num(r.km_reales)>0?`${num(r.km_reales).toLocaleString('es-AR')} km`:'KM no informados'}</small></div></div></section><section><h3>Socio</h3><div class="os-review-facts"><div class="os-review-fact"><span>Nombre</span><b>${esc(r.customer_name||'—')}</b></div><div class="os-review-fact"><span>DNI / CUIT</span><b>${esc(r.customer_document||'—')}</b></div><div class="os-review-fact"><span>Teléfono</span><b>${esc(r.customer_phone||'—')}</b></div><div class="os-review-fact"><span>Observaciones del chofer</span><b>${esc(r.observations||'Sin observaciones')}</b></div></div></section><section><h3>Peajes y excedentes informados</h3><p class="os-review-toll-format"><b>Formato de cobro de peajes:</b> ${esc(tollCoverageLabel(s.toll_coverage_mode))}</p><div class="os-signed-lines">${lines||'<small>El chofer no informó peajes ni excedentes.</small>'}</div></section><section><h3>Conformidades</h3><div class="os-signed-conformities"><span>Servicio: <b>${yesNo(r.conformity_service)}</b></span><span>Cargos: <b>${yesNo(r.conformity_charges)}</b></span><span>Sin daños: <b>${yesNo(r.conformity_no_damage)}</b></span><span>Arrastre: <b>${yesNo(r.conformity_tow)}</b></span></div></section><section><h3>Evidencias cargadas por el chofer</h3><div class="os-review-evidence os-review-evidence-gallery">${evidenceCards(evidence)}</div></section><section class="os-signed-signature"><h3>Firma del socio</h3>${r.signature_url?`<img src="${esc(r.signature_url)}" alt="Firma digital del socio">`:'<p>Firma no disponible</p>'}</section></article>`
  }
  async function hydrateEvidence(){const cards=$$('[data-remito-evidence]');await Promise.all(cards.map(async card=>{try{let url=card.dataset.url||'';if(!url){const bucket=card.dataset.bucket,path=card.dataset.path;if(!bucket||!path)throw new Error('Referencia incompleta');const {data,error}=await _db.storage.from(bucket).createSignedUrl(path,300);if(error)throw error;url=data?.signedUrl||'';}if(!url)throw new Error('Enlace no disponible');card.href=url;card.removeAttribute('aria-disabled');const mime=card.dataset.mime||'',label=card.querySelector('span');if(/^image\/(jpeg|png|webp)$/i.test(mime)){const img=document.createElement('img');img.src=url;img.alt=card.querySelector('small')?.textContent||'Evidencia del remito';card.insertBefore(img,card.firstChild);if(label)label.textContent='Abrir imagen';}else if(label)label.textContent=mime==='application/pdf'?'Abrir PDF':'Abrir archivo';}catch(error){card.classList.add('is-error');const label=card.querySelector('span');if(label)label.textContent='Evidencia no disponible';card.title=error?.message||'No se pudo abrir la evidencia';}}))}
  function render(data){
    const s=data.service,r=data.remito,reported=data.reported||{};$('#os-review-title').textContent=`Remito ${r.remito_number||r.remito_id}`;$('#os-review-subtitle').textContent=`${s.service_order_number||s.service_number} · ${s.company_name||'Prestadora'}`;
    R.actions={
      toll:hasDifference('toll',data.planned?.tolls||[],reported.tolls||[])?null:'accepted',
      excess:hasDifference('excess',data.planned?.excesses||[],reported.excesses||[])?null:'accepted'
    };
    $('#os-review-body').innerHTML=`<div data-review-panel="document">${signedDocument(data)}</div><div data-review-panel="review" hidden><section class="os-review-comparison-card"><header class="os-review-comparison-header"><div><span>Control administrativo</span><h3>Planificado vs. informado</h3></div><p>Compará solamente peajes y excedentes. Si hay diferencias, elegí cómo resolverlas.</p></header>${comparisonSection('toll',data)}${comparisonSection('excess',data)}<div id="os-review-errors" class="os-review-errors"></div></section></div>`;
    const historic=s.status==='completed';const label=historic?'Confirmar revisión y habilitar Facturación':'Confirmar revisión y finalizar servicio';const footer=$('#os-review-footer');footer.innerHTML=`<small>${data.can_resolve?'Resolvé las diferencias para continuar.':'Documento aprobado o servicio inmutable.'}</small><button class="btn btn-ghost" type="button" onclick="AuxiliosRemitoReviewV2.close()">Cerrar</button>${data.can_resolve&&canResolve()?`<button id="os-review-apply" class="btn btn-primary" type="button" onclick="AuxiliosRemitoReviewV2.resolve()">${label}</button>`:''}`;tab('document');updateApplyState();void hydrateEvidence();
  }
  async function open(serviceId){inject();R.serviceId=serviceId;const modal=$('#os-remito-review-modal');modal.hidden=false;$('#os-review-body').innerHTML='<div class="os-review-section os-review-loading">Cargando remito firmado…</div>';$('#os-review-footer').innerHTML='';try{const {data,error}=await _db.rpc('get_operator_service_remito_review_v2',{p_service_id:serviceId});if(error)throw error;if(!data?.service||!data?.remito)throw new Error('La respuesta no contiene el remito firmado');R.detail=data;render(data)}catch(e){$('#os-review-body').innerHTML=`<div class="os-review-errors visible">${esc(e.message||'No se pudo abrir la revisión')}</div>`;$('#os-review-footer').innerHTML='<button class="btn btn-ghost" type="button" onclick="AuxiliosRemitoReviewV2.close()">Cerrar</button><button class="btn btn-primary" type="button" onclick="AuxiliosRemitoReviewV2.retry()">Reintentar</button>'}}
  function retry(){if(R.serviceId)return open(R.serviceId)}
  function close(){const modal=$('#os-remito-review-modal');if(modal)modal.hidden=true;R.detail=null;R.serviceId=null;R.actions={toll:null,excess:null}}
  async function openEvidence(bucket,path){const {data,error}=await _db.storage.from(bucket).createSignedUrl(path,120);if(error)return window.toast?.(error.message,'error');window.open(data.signedUrl,'_blank','noopener')}
  function get(line,field){return $(`[data-field="${field}"]`,line)?.value?.trim()||''}
  function sectionFor(kind){return $(`[data-review-kind="${kind}"]`)}
  function sectionReason(kind){return $('[data-review-reason]',sectionFor(kind))?.value?.trim()||''}
  function chooseAction(kind,action){
    if(!['toll','excess'].includes(kind)||!['rejected','adjusted','accepted'].includes(action))return;
    const section=sectionFor(kind);if(!section||section.dataset.difference!=='true')return;
    R.actions[kind]=action;
    $$('[data-review-action]',section).forEach(button=>{const selected=button.dataset.reviewAction===action;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected))});
    const resolution=$('.os-review-resolution',section),editor=$('.os-review-editor',section);
    if(resolution){resolution.hidden=action==='accepted';const label=$('label',resolution);if(label)label.firstChild.textContent=action==='rejected'?'Motivo del rechazo':'Motivo de la modificación'}
    if(editor)editor.hidden=action!=='adjusted';
    updateApplyState();
  }
  function updateApplyState(){
    const button=$('#os-review-apply'),footer=$('#os-review-footer');if(!button||!footer)return;
    const pending=['toll','excess'].some(kind=>sectionFor(kind)?.dataset.difference==='true'&&!R.actions[kind]);
    button.disabled=pending;const note=$('small',footer);if(note)note.textContent=pending?'Resolvé las diferencias para continuar.':'La revisión y el cierre se aplicarán en una sola operación.';
  }
  function buildPayload(){
    const detail=R.detail||{},reported=detail.reported||{},errors=[];
    const tollDifference=hasDifference('toll',detail.planned?.tolls||[],reported.tolls||[]),tollAction=tollDifference?R.actions.toll:'accepted',tollReason=sectionReason('toll');
    const excessDifference=hasDifference('excess',detail.planned?.excesses||[],reported.excesses||[]),excessAction=excessDifference?R.actions.excess:'accepted',excessReason=sectionReason('excess');
    if(tollDifference&&!tollAction)errors.push('Elegí Rechazar, Modificar o Aprobar para Peajes.');
    if(excessDifference&&!excessAction)errors.push('Elegí Rechazar, Modificar o Aprobar para Excedentes.');
    if(['rejected','adjusted'].includes(tollAction)&&!tollReason)errors.push('Indicá el motivo de la decisión sobre Peajes.');
    if(['rejected','adjusted'].includes(excessAction)&&!excessReason)errors.push('Indicá el motivo de la decisión sobre Excedentes.');
    if(tollAction==='adjusted'&&!(reported.tolls||[]).length)errors.push('No hay peajes informados para modificar.');
    if(excessAction==='adjusted'&&!(reported.excesses||[]).length)errors.push('No hay excedentes informados para modificar.');
    let tollChanged=false,excessChanged=false;
    const tolls=(reported.tolls||[]).map(x=>{
      const line=$$('.os-review-line[data-kind="toll"]').find(item=>item.dataset.reportId===String(x.toll_report_id));
      let tollId=x.toll_id||null,quantity=num(x.quantity||1),unit=num(x.unit_amount),customer=x.customer_payment_method||null;
      if(tollAction==='adjusted'&&line){tollId=get(line,'toll_id')||null;quantity=num(get(line,'quantity'));unit=num(get(line,'unit_amount'));customer=get(line,'customer_payment_method')||null}
      const ref=(detail.references?.tolls||[]).find(item=>String(item.toll_id)===String(tollId));
      const changed=String(tollId||'')!==String(x.toll_id||'')||Math.abs(quantity-num(x.quantity||1))>.001||Math.abs(unit-num(x.unit_amount))>.001||String(customer||'')!==String(x.customer_payment_method||'');
      tollChanged=tollChanged||changed;
      const decision=tollAction==='rejected'?'rejected':tollAction==='adjusted'&&changed?'adjusted':'accepted';
      if(decision!=='rejected'&&(quantity<1||unit<=0))errors.push('Cantidad e importe de cada peaje deben ser mayores a cero.');
      const mode=detail.service?.toll_coverage_mode,payer=mode==='provider_roundtrip'?'provider':mode==='customer_roundtrip'?'customer':customer?'customer':'provider';
      if(decision!=='rejected'&&payer==='customer'&&!customer)errors.push('Indicá el método de pago de los peajes a cargo del cliente.');
      return{toll_report_id:x.toll_report_id,decision,reason:decision==='accepted'?null:tollReason,toll_id:tollId,toll_name:ref?.name||x.toll_name,quantity,unit_amount:unit,payment_method:x.payment_method||'manual',payer_agent:payer,customer_payment_method:customer};
    });
    const excesses=(reported.excesses||[]).map(x=>{
      const line=$$('.os-review-line[data-kind="excess"]').find(item=>item.dataset.reportId===String(x.excess_report_id));
      const originalMethod=reportedExcessPayment(x);let conceptId=x.concept_id||null,quantity=num(x.quantity||1),unit=num(x.unit_amount),method=originalMethod||null;
      if(excessAction==='adjusted'&&line){conceptId=get(line,'concept_id')||null;quantity=num(get(line,'quantity'));unit=num(get(line,'unit_amount'));method=get(line,'customer_payment_method')||null}
      const changed=String(conceptId||'')!==String(x.concept_id||'')||Math.abs(quantity-num(x.quantity||1))>.001||Math.abs(unit-num(x.unit_amount))>.001||String(method||'')!==String(originalMethod||'');
      excessChanged=excessChanged||changed;
      const decision=excessAction==='rejected'?'rejected':excessAction==='adjusted'&&changed?'adjusted':'accepted';
      if(decision!=='rejected'&&!conceptId)errors.push('Seleccioná el concepto de cada excedente.');
      if(decision!=='rejected'&&(quantity<=0||unit<=0))errors.push('Cantidad e importe de cada excedente deben ser mayores a cero.');
      const collector=x.collector_agent||'company';
      if(decision!=='rejected'&&collector==='company'&&!method)errors.push('Indicá el método de pago de cada excedente.');
      return{excess_report_id:x.excess_report_id,decision,review_reason:decision==='accepted'?null:excessReason,concept_id:conceptId,quantity,unit_amount:unit,collector_agent:collector,customer_payment_method:method};
    });
    if(tollAction==='adjusted'&&!tollChanged&&(reported.tolls||[]).length)errors.push('Modificá al menos un dato de Peajes.');
    if(excessAction==='adjusted'&&!excessChanged&&(reported.excesses||[]).length)errors.push('Modificá al menos un dato de Excedentes.');
    return{payload:{tolls,excesses},errors};
  }
  async function resolve(){if(!R.detail?.can_resolve||!canResolve())return;const {payload,errors}=buildPayload(),box=$('#os-review-errors');if(errors.length){box.textContent=[...new Set(errors)].join(' ');box.classList.add('visible');tab('review');return}box.classList.remove('visible');const btn=$('#os-review-apply'),original=btn.textContent;btn.disabled=true;btn.textContent='Aplicando…';try{const {data,error}=await _db.rpc('resolve_operator_service_document_v3',{p_service_id:R.detail.service.service_id,p_action:'approve_and_finalize',p_payload:payload});if(error)throw error;if(data?.document_status!=='approved'||data?.status!=='completed')throw new Error('El cierre no confirmó todos los estados');window.toast?.('Remito aprobado y servicio finalizado','success');close();await window.OperatorServices?.loadServices?.()}catch(e){box.textContent=e.message||'No se pudo aprobar y finalizar';box.classList.add('visible');btn.disabled=false;btn.textContent=original}}
  function tab(name){const target=name==='review'?'review':'document';$$('[data-review-tab]').forEach(b=>b.classList.toggle('active',b.dataset.reviewTab===target));$$('[data-review-panel]').forEach(p=>p.hidden=p.dataset.reviewPanel!==target);$('#os-review-footer').classList.toggle('is-document',target==='document');if(target==='review')updateApplyState()}
  function toggleFullscreen(){$('#os-remito-review-modal')?.classList.toggle('is-fullscreen')}
  async function download(){const node=$('#os-signed-document');if(!node)return;if(typeof window.html2pdf!=='function')return window.print();const filename=`Remito-${R.detail?.remito?.remito_number||R.detail?.remito?.remito_id||'firmado'}.pdf`;await window.html2pdf().set({margin:8,filename,image:{type:'jpeg',quality:.96},html2canvas:{scale:2,useCORS:true},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}}).from(node).save()}
  window.AuxiliosRemitoReviewV2={renderInbox,open,retry,close,openEvidence,resolve,chooseAction,tab,toggleFullscreen,download};
  const boot=setInterval(()=>{if(inject()){clearInterval(boot);renderInbox(window.OperatorServices?.S?.services||[])}},100);setTimeout(()=>clearInterval(boot),15000);
})();

(function(){
  'use strict';

  /** @typedef {{client_line_id:string,toll_id:string,toll_name:string,unit_amount:number,currency:string,customer_payment_method:string}} DriverTollReport */
  /** @typedef {{client_line_id:string,concept_id:string,concept_name:string,quantity:number,unit_amount:number,currency:string,customer_payment_method:string,reason:string}} DriverExcessReport */
  /** @typedef {{client_evidence_id:string,client_line_id:string|null,evidence_kind:string,storage_path?:string,mime_type:string,original_name:string,size_bytes:number,blob_field?:string}} RemitoEvidence */

  const EMPTY_REFERENCE={version:2,tolls:[],excess_concepts:[],payment_methods:[],evidence:{}};
  const PAYMENTS=[['cash','Efectivo'],['transfer','Transferencia'],['card','Tarjeta'],['mercado_pago','Mercado Pago'],['other','Otro'],['not_collected','No cobrado']];
  const state={reference:{...EMPTY_REFERENCE},referenceLoaded:false,serviceId:null,initialized:false,lines:{toll:[],excess:[]},draft:null};
  const MAX_BYTES=10*1024*1024;
  const MIME=new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']);
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const uid=()=>globalThis.crypto?.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const v=Math.random()*16|0;return(c==='x'?v:(v&3|8)).toString(16)});
  const clone=value=>JSON.parse(JSON.stringify(value));
  const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const number=value=>{let s=String(value??'').trim().replace(/[^0-9,.-]/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');else if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');const n=Number(s);return Number.isFinite(n)?n:0};
  const money=value=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(number(value));
  const currentServiceId=()=>sessionStorage.getItem('auxilios_phase3_service_id')||null;
  const lineKey=kind=>kind==='toll'?'toll_id':'concept_id';
  const referenceRows=kind=>kind==='toll'?(state.reference.tolls||[]):(state.reference.excess_concepts||[]);
  const lineName=(kind,row)=>kind==='toll'?row.toll_name:row.concept_name;
  const paymentLabel=value=>PAYMENTS.find(([key])=>key===value)?.[1]||'Sin definir';

  async function loadReference(force=false){
    if(!window._db)return state.reference;
    const serviceId=currentServiceId();
    if(!force&&state.referenceLoaded&&state.serviceId===serviceId)return state.reference;
    const {data,error}=await _db.rpc('get_driver_remito_reference_v2',{p_service_id:serviceId});
    if(error)throw new Error(error.message||'No se pudieron cargar peajes y excedentes');
    state.reference={...EMPTY_REFERENCE,...(data||{})};state.referenceLoaded=true;state.serviceId=serviceId;return state.reference;
  }

  function blankLine(kind,ref){
    return kind==='toll'
      ?{client_line_id:uid(),toll_id:ref.toll_id,toll_name:ref.name||'Peaje',unit_amount:'',currency:'ARS',customer_payment_method:''}
      :{client_line_id:uid(),concept_id:ref.concept_id,concept_name:ref.name||'Excedente',quantity:1,unit_amount:'',currency:'ARS',customer_payment_method:'',reason:ref.name||'Excedente'};
  }

  function pickerError(message=''){
    const box=$('#rem-picker-error');if(!box)return;box.textContent=message;box.classList.toggle('visible',!!message);
  }

  function selectionMarkup(){
    const {kind,lines}=state.draft;const key=lineKey(kind),selected=new Set(lines.map(line=>String(line[key])));const rows=referenceRows(kind);
    if(!rows.length)return'<div class="rem-addon-empty">No hay conceptos habilitados para seleccionar.</div>';
    return rows.map(row=>{const value=String(row[key]);const detail=kind==='toll'?[row.road,row.direction].filter(Boolean).join(' · '):'';return`<label class="rem-picker-option"><input type="checkbox" value="${esc(value)}" ${selected.has(value)?'checked':''}><span><b>${esc(row.name)}</b>${detail?`<small>${esc(detail)}</small>`:''}</span></label>`}).join('');
  }

  function paymentOptions(value){return`<option value="">Seleccionar…</option>`+PAYMENTS.map(([key,label])=>`<option value="${key}" ${key===value?'selected':''}>${label}</option>`).join('')}
  function detailsMarkup(){
    const {kind,lines}=state.draft;
    if(!lines.length)return'<div class="rem-addon-empty">La selección quedará vacía.</div>';
    return lines.map((line,index)=>`<article class="rem-picker-detail" data-draft-index="${index}"><div class="rem-picker-detail-head"><b>${esc(lineName(kind,line))}</b><small>${index+1} de ${lines.length}</small></div><div class="rem-picker-fields"><label><span>Importe</span><input data-draft-field="unit_amount" inputmode="decimal" placeholder="0" value="${esc(line.unit_amount||'')}"></label><label><span>Medio de pago</span><select data-draft-field="customer_payment_method">${paymentOptions(line.customer_payment_method||'')}</select></label></div></article>`).join('');
  }

  function renderPicker(){
    const modal=$('#rem-addon-picker');if(!modal||!state.draft)return;
    const {kind,phase}=state.draft;const noun=kind==='toll'?'peajes':'excedentes';
    $('#rem-addon-picker-title').textContent=phase==='select'?`Seleccionar ${noun}`:`Completar ${noun}`;
    $('#rem-addon-picker-list').innerHTML=phase==='select'?selectionMarkup():detailsMarkup();
    $('#rem-picker-back').hidden=phase==='select';
    $('#rem-picker-next').hidden=phase!=='select';
    $('#rem-picker-save').hidden=phase!=='details';
    updateSelectionCount();pickerError();
  }

  function updateSelectionCount(){
    const button=$('#rem-picker-next');if(!button||state.draft?.phase!=='select')return;
    const count=$$('#rem-addon-picker-list input:checked').length;button.textContent=count?`Continuar (${count})`:'Continuar';
  }

  async function openPicker(kind){
    try{await loadReference()}catch(error){const box=$('#rem-addons-errors');if(box){box.textContent=error.message||'No se pudo cargar el catálogo';box.classList.add('visible')}return}
    state.draft={kind,phase:'select',lines:clone(state.lines[kind])};
    renderPicker();const modal=$('#rem-addon-picker');modal.hidden=false;document.body.classList.add('rem-picker-open');
  }

  function cancelPicker(){state.draft=null;const modal=$('#rem-addon-picker');if(modal)modal.hidden=true;document.body.classList.remove('rem-picker-open')}
  function captureDetails(){
    if(state.draft?.phase!=='details')return;
    $$('.rem-picker-detail').forEach(card=>{const line=state.draft.lines[Number(card.dataset.draftIndex)];if(!line)return;line.unit_amount=$('[data-draft-field="unit_amount"]',card)?.value||'';line.customer_payment_method=$('[data-draft-field="customer_payment_method"]',card)?.value||''});
  }
  function continuePicker(){
    if(state.draft?.phase!=='select')return;
    const key=lineKey(state.draft.kind),wanted=$$('#rem-addon-picker-list input:checked').map(input=>input.value),existing=new Map(state.draft.lines.map(line=>[String(line[key]),line]));
    state.draft.lines=wanted.map(value=>existing.get(value)||blankLine(state.draft.kind,referenceRows(state.draft.kind).find(row=>String(row[key])===value)));
    state.draft.phase='details';renderPicker();
  }
  function backPicker(){captureDetails();if(!state.draft)return;state.draft.phase='select';renderPicker()}
  function savePicker(){
    captureDetails();if(!state.draft)return;
    const invalid=state.draft.lines.find(line=>number(line.unit_amount)<=0||!PAYMENTS.some(([key])=>key===line.customer_payment_method));
    if(invalid){pickerError(`Completá importe y medio de pago para ${lineName(state.draft.kind,invalid)}.`);return}
    state.lines[state.draft.kind]=clone(state.draft.lines);cancelPicker();recalculate();
  }

  function totals(){
    const toll=state.lines.toll.reduce((sum,line)=>sum+number(line.unit_amount),0);
    const excess=state.lines.excess.reduce((sum,line)=>sum+number(line.unit_amount)*number(line.quantity||1),0);
    return{toll,excess,total:toll+excess};
  }
  function compactSummary(kind){
    const lines=state.lines[kind],host=$(`#rem-${kind}-summary`);if(!host)return;
    if(!lines.length){host.innerHTML='<div class="rem-addon-empty compact">Sin conceptos informados</div>';return}
    const first=lines[0];const rows=[`<div class="rem-addon-summary-line"><span>${esc(lineName(kind,first))} · ${esc(paymentLabel(first.customer_payment_method))}</span><strong>${money(number(first.unit_amount)*number(first.quantity||1))}</strong></div>`];
    if(lines.length===2){const second=lines[1];rows.push(`<div class="rem-addon-summary-line"><span>${esc(lineName(kind,second))} · ${esc(paymentLabel(second.customer_payment_method))}</span><strong>${money(number(second.unit_amount)*number(second.quantity||1))}</strong></div>`)}
    else if(lines.length>2)rows.push(`<div class="rem-addon-summary-line more"><span>+${lines.length-1} más</span><strong>${money(lines.slice(1).reduce((sum,line)=>sum+number(line.unit_amount)*number(line.quantity||1),0))}</strong></div>`);
    host.innerHTML=rows.join('');
  }
  function recalculate(){
    const total=totals();const toll=$('#imp-peaje'),excess=$('#imp-excedente');if(toll)toll.value=String(total.toll);if(excess)excess.value=String(total.excess);
    const tollTotal=$('#rem-tolls-total'),excessTotal=$('#rem-excesses-total');if(tollTotal)tollTotal.textContent=money(total.toll);if(excessTotal)excessTotal.textContent=money(total.excess);
    compactSummary('toll');compactSummary('excess');if(typeof window.calcularTotal==='function')window.calcularTotal();renderSignatureSummary();
  }

  function collectLines(){
    return{
      tolls:state.lines.toll.map(line=>({client_line_id:line.client_line_id,toll_id:line.toll_id,toll_name:line.toll_name,quantity:1,unit_amount:number(line.unit_amount),currency:'ARS',customer_payment_method:line.customer_payment_method,crossed_at:null,missing_evidence_reason:null,notes:null})),
      excesses:state.lines.excess.map(line=>({client_line_id:line.client_line_id,concept_id:line.concept_id,concept_name:line.concept_name,quantity:1,unit_amount:number(line.unit_amount),currency:'ARS',customer_payment_method:line.customer_payment_method,reason:line.concept_name,notes:null}))
    };
  }
  function descriptor(input,kind){const file=input?.files?.[0];if(!file)return null;input.dataset.evidenceId=input.dataset.evidenceId||uid();return{client_evidence_id:input.dataset.evidenceId,client_line_id:null,evidence_kind:kind,mime_type:file.type,original_name:file.name,size_bytes:file.size,blob_field:`addon_${input.dataset.evidenceId}`,file}}
  function collectEvidence(){const kinds=['vehicle_front','odometer','extra','extra'];return $$('#foto-grid input[type="file"]').map((input,index)=>descriptor(input,kinds[index]||'extra')).filter(Boolean)}
  function validate(){
    const errors=[];const {tolls,excesses}=collectLines(),evidence=collectEvidence();
    tolls.forEach((line,index)=>{if(!line.toll_id)errors.push(`Seleccioná el peaje ${index+1}.`);if(line.unit_amount<=0)errors.push(`Ingresá el importe del peaje ${index+1}.`);if(!line.customer_payment_method)errors.push(`Seleccioná cómo pagó el cliente el peaje ${index+1}.`)});
    excesses.forEach((line,index)=>{if(!line.concept_id)errors.push(`Seleccioná el excedente ${index+1}.`);if(line.unit_amount<=0)errors.push(`Ingresá el importe del excedente ${index+1}.`);if(!line.customer_payment_method)errors.push(`Seleccioná cómo pagó el cliente el excedente ${index+1}.`)});
    evidence.forEach(item=>{if(item.size_bytes>MAX_BYTES)errors.push(`${item.original_name} supera 10 MiB.`);if(!MIME.has(item.mime_type))errors.push(`${item.original_name} tiene un formato no admitido.`)});
    const box=$('#rem-addons-errors');if(box){box.innerHTML=errors.map(esc).join('<br>');box.classList.toggle('visible',!!errors.length)}return{ok:!errors.length,errors};
  }
  function collect(){const lines=collectLines();return{payload:{addons_version:2,tolls:lines.tolls,excesses:lines.excesses,evidence:[]},files:collectEvidence()}}
  async function uploadEvidence(bundle,operationToken){
    if(!bundle?.files?.length)return bundle?.payload||{addons_version:2,tolls:[],excesses:[],evidence:[]};
    const {data:{user}}=await _db.auth.getUser();if(!user)throw new Error('La sesión del Chofer venció');const evidence=[];
    for(const item of bundle.files){const ext=(item.original_name.split('.').pop()||item.mime_type.split('/').pop()||'bin').replace(/[^a-zA-Z0-9]/g,'').toLowerCase(),path=`${user.id}/${String(operationToken).replace(/[^a-zA-Z0-9-]/g,'')}/${item.client_evidence_id}.${ext}`;const {error}=await _db.storage.from('remito-evidence-v2').upload(path,item.file,{contentType:item.mime_type,upsert:true});if(error)throw new Error(`No se pudo subir ${item.original_name}: ${error.message}`);evidence.push({...item,storage_path:path,file:undefined,blob_field:undefined})}
    return{...bundle.payload,evidence};
  }

  function renderSignatureSummary(){
    const host=$('#rem-addon-signature-summary');if(!host)return;const total=totals(),lines=[...state.lines.toll.map(line=>({name:line.toll_name,amount:line.unit_amount})),...state.lines.excess.map(line=>({name:line.concept_name,amount:line.unit_amount}))];
    const visible=lines.length<=2?lines:lines.slice(0,1);const remainder=lines.length>2?lines.slice(1):[];
    host.innerHTML=`<div class="rem-addons-kicker">Detalle que acepta el cliente</div><div class="rem-addon-summary-grid"><div class="rem-addon-summary-stat"><span>Peajes</span><strong>${money(total.toll)}</strong></div><div class="rem-addon-summary-stat"><span>Excedentes</span><strong>${money(total.excess)}</strong></div></div><div class="rem-addon-summary-lines">${visible.map(line=>`<div class="rem-addon-summary-line"><span>${esc(line.name)}</span><strong>${money(line.amount)}</strong></div>`).join('')}${remainder.length?`<div class="rem-addon-summary-line more"><span>+${remainder.length} más</span><strong>${money(remainder.reduce((sum,line)=>sum+number(line.amount),0))}</strong></div>`:''}${!lines.length?'<div class="rem-addon-empty compact">Sin peajes ni excedentes informados</div>':''}</div>`;
  }
  function reviewMeta(status){if(status==='approved')return{label:'Aprobado',css:'approved'};if(status==='adjusted')return{label:'Ajustado por Administración',css:'adjusted'};return{label:'En revisión',css:'pending'}}
  async function renderHistory(remitoId,host){
    if(!host||!remitoId)return;host.innerHTML='<div class="rem-addon-empty">Cargando detalle informado…</div>';const {data,error}=await _db.rpc('get_driver_remito_addons_v2',{p_remito_id:Number(remitoId)});if(error){host.innerHTML=`<div class="rem-addon-empty">${esc(error.message||'No se pudo cargar el detalle')}</div>`;return}
    const meta=reviewMeta(data.review_status),tolls=(data.tolls||[]).map(line=>{const accepted=line.review?.accepted||null,rejected=line.review?.decision==='rejected',method=line.customer_payment_method||line.payment_method;return`<div class="rem-addon-summary-line"><span>${esc(line.toll_name)} · ${esc(paymentLabel(method))}</span><strong>${rejected?'Rechazado':money(accepted?.total_amount??line.total_amount)}</strong></div>`}),excesses=(data.excesses||[]).map(line=>{const accepted=line.review?.accepted||null,rejected=line.review?.decision==='rejected';return`<div class="rem-addon-summary-line"><span>${esc(line.concept_name)} · ${esc(paymentLabel(line.customer_payment_method))}</span><strong>${rejected?'Rechazado':money(accepted?.total_amount??line.total_amount)}</strong></div>`});
    host.innerHTML=`<div class="rem-addons-head"><div><div class="rem-addons-kicker">Peajes y excedentes informados</div><div class="rem-addons-help">El original firmado se conserva sin cambios.</div></div><span class="rem-addon-status ${meta.css}">${meta.label}</span></div><div class="rem-addon-summary-lines">${[...tolls,...excesses].join('')||'<div class="rem-addon-empty">El chofer confirmó que no hubo peajes ni excedentes.</div>'}</div>`;
  }
  function reset(){state.lines={toll:[],excess:[]};cancelPicker();recalculate()}
  function hasCustomerCollection(){return[...state.lines.toll,...state.lines.excess].some(line=>line.customer_payment_method&&line.customer_payment_method!=='not_collected')}

  async function init(){
    const step=$('#rem-step-2');if(!step||step.dataset.addonsV2==='1')return;step.dataset.addonsV2='1';
    step.innerHTML=`<div class="rem-addons-v2"><input id="imp-peaje" type="hidden" value="0"><input id="imp-excedente" type="hidden" value="0"><span id="imp-total" hidden>$0</span><section class="rem-addons-card"><div class="rem-addons-head"><div><div class="rem-addons-kicker">Paso 2</div><div class="rem-addons-title">Peajes</div><div class="rem-addons-help">Seleccioná los peajes utilizados y registrá el cobro dentro del modal.</div></div></div><button class="rem-addon-select" id="rem-add-toll" type="button">Seleccionar peajes</button><div id="rem-toll-summary" class="rem-addon-summary-lines"></div><div class="rem-addon-total"><span>Total peajes</span><strong id="rem-tolls-total">$0</strong></div></section><section class="rem-addons-card"><div class="rem-addons-head"><div><div class="rem-addons-title">Excedentes</div><div class="rem-addons-help">Usá únicamente conceptos habilitados y completá el cobro dentro del modal.</div></div></div><button class="rem-addon-select" id="rem-add-excess" type="button">Seleccionar excedentes</button><div id="rem-excess-summary" class="rem-addon-summary-lines"></div><div class="rem-addon-total"><span>Total excedentes</span><strong id="rem-excesses-total">$0</strong></div></section><div id="rem-addons-errors" class="rem-addon-errors"></div></div>`;
    if(!$('#rem-addon-picker'))document.body.insertAdjacentHTML('beforeend','<div id="rem-addon-picker" class="rem-addon-picker" hidden><div class="rem-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="rem-addon-picker-title"><div class="rem-picker-head"><b id="rem-addon-picker-title">Seleccionar</b><button id="rem-addon-picker-close" type="button" aria-label="Cancelar">×</button></div><div id="rem-addon-picker-list" class="rem-picker-list"></div><div id="rem-picker-error" class="rem-addon-errors"></div><div class="rem-picker-actions"><button id="rem-picker-cancel" class="rem-picker-secondary" type="button">Cancelar</button><button id="rem-picker-back" class="rem-picker-secondary" type="button" hidden>← Volver</button><button id="rem-picker-next" class="rem-picker-confirm" type="button">Continuar</button><button id="rem-picker-save" class="rem-picker-confirm" type="button" hidden>Confirmar</button></div></div></div>');
    $('#rem-add-toll').addEventListener('click',()=>openPicker('toll'));$('#rem-add-excess').addEventListener('click',()=>openPicker('excess'));$('#rem-addon-picker-close').addEventListener('click',cancelPicker);$('#rem-picker-cancel').addEventListener('click',cancelPicker);$('#rem-picker-back').addEventListener('click',backPicker);$('#rem-picker-next').addEventListener('click',continuePicker);$('#rem-picker-save').addEventListener('click',savePicker);$('#rem-addon-picker-list').addEventListener('change',updateSelectionCount);$('#rem-addon-picker').addEventListener('click',event=>{if(event.target.id==='rem-addon-picker')cancelPicker()});
    try{await loadReference()}catch(error){console.warn('[remito-addons-v2]',error);const box=$('#rem-addons-errors');if(box){box.textContent=error.message;box.classList.add('visible')}}state.initialized=true;recalculate();
  }

  window.AuxiliosRemitoAddonsV2={init,reset,validate,collect,uploadEvidence,renderSignatureSummary,renderHistory,recalculate,hasCustomerCollection,loadReference};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void init(),{once:true});else void init();
})();

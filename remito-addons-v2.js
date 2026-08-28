(function(){
  'use strict';

  /** @typedef {{client_line_id:string,toll_id:string|null,toll_name:string,quantity:number,unit_amount:number,currency:string,payment_method:string,crossed_at:string|null,missing_evidence_reason:string|null,notes:string|null}} DriverTollReport */
  /** @typedef {{client_line_id:string,concept_id:string|null,concept_name:string,quantity:number,unit_amount:number,currency:string,payment_method:string,reason:string,notes:string|null}} DriverExcessReport */
  /** @typedef {{client_evidence_id:string,client_line_id:string|null,evidence_kind:string,storage_path?:string,mime_type:string,original_name:string,size_bytes:number,blob_field?:string}} RemitoEvidence */

  const state={reference:{tolls:[],excess_concepts:[],evidence:{}},serviceId:null,initialized:false};
  const MAX_BYTES=10*1024*1024;
  const MIME=new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']);
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const id=()=>globalThis.crypto?.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const v=Math.random()*16|0;return(c==='x'?v:(v&3|8)).toString(16)});
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const number=v=>{let s=String(v??'').trim().replace(/[^0-9,.-]/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');else if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');const n=Number(s);return Number.isFinite(n)?n:0};
  const money=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(number(v));

  function currentServiceId(){return sessionStorage.getItem('auxilios_phase3_service_id')||null}
  async function loadReference(){
    if(!window._db) return state.reference;
    const serviceId=currentServiceId();
    if(state.serviceId===serviceId&&state.reference.tolls.length) return state.reference;
    const {data,error}=await _db.rpc('get_driver_remito_reference_v1',{p_service_id:serviceId});
    if(error) throw new Error(error.message||'No se pudieron cargar peajes y conceptos');
    state.reference=data||state.reference;state.serviceId=serviceId;return state.reference;
  }
  function options(rows,valueKey,label){return rows.map(r=>`<option value="${esc(r[valueKey])}">${esc(label(r))}</option>`).join('')}
  function tollRow(){
    const lineId=id();
    return `<div class="rem-addon-line rem-toll-line" data-line-id="${lineId}"><div class="rem-addon-line-head"><span class="rem-addon-line-number">Cruce de peaje</span><button type="button" class="rem-addon-remove" data-remove>Eliminar</button></div><div class="rem-addon-grid">
      <div class="wide"><label>Peaje</label><select data-field="toll_id"><option value="">Seleccionar...</option>${options(state.reference.tolls||[],'toll_id',r=>[r.name,r.road,r.direction].filter(Boolean).join(' · '))}<option value="other">Otro peaje</option></select></div>
      <div class="wide" data-other-wrap hidden><label>Nombre del peaje</label><input data-field="toll_name" maxlength="120" placeholder="Nombre o ubicación"></div>
      <div><label>Importe</label><input data-field="unit_amount" inputmode="decimal" placeholder="0"></div>
      <div><label>Medio utilizado</label><select data-field="payment_method"><option value="cash">Efectivo</option><option value="electronic">Pago electrónico</option><option value="telepass">TelePASE</option><option value="other">Otro</option></select></div>
      <div class="wide"><label>Ticket <small>(opcional)</small></label><input class="rem-addon-file" data-field="ticket" type="file" accept="image/*,application/pdf"></div>
    </div></div>`;
  }
  function excessRow(){
    const lineId=id();
    return `<div class="rem-addon-line rem-excess-line" data-line-id="${lineId}"><div class="rem-addon-line-head"><span class="rem-addon-line-number">Excedente informado</span><button type="button" class="rem-addon-remove" data-remove>Eliminar</button></div><div class="rem-addon-grid">
      <div class="wide"><label>Concepto</label><select data-field="concept_id"><option value="">Seleccionar...</option>${options(state.reference.excess_concepts||[],'concept_id',r=>r.name)}<option value="other">Otro concepto</option></select></div>
      <div class="wide" data-other-wrap hidden><label>Nombre del concepto</label><input data-field="concept_name" maxlength="120" placeholder="Detallá el excedente"></div>
      <input data-field="quantity" type="hidden" value="1">
      <div><label>Importe</label><input data-field="unit_amount" inputmode="decimal" placeholder="0"></div>
      <div><label>Medio de pago</label><select data-field="payment_method"><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="card">Tarjeta</option><option value="mercado_pago">Mercado Pago</option><option value="not_collected">No cobrado</option><option value="other">Otro</option></select></div>
    </div></div>`;
  }
  function addLine(kind,preset=''){
    const box=$(`#rem-${kind}-lines`);if(!box)return;
    box.insertAdjacentHTML('beforeend',kind==='toll'?tollRow():excessRow());
    const line=box.lastElementChild;bindLine(line);
    const select=$('[data-field="toll_id"],[data-field="concept_id"]',line);
    if(select&&preset){select.value=preset;select.dispatchEvent(new Event('change'))}
    renumber();recalculate();
  }
  function bindLine(line){
    $('[data-remove]',line)?.addEventListener('click',()=>{line.remove();renumber();recalculate()});
    $$('input,select,textarea',line).forEach(el=>el.addEventListener('input',recalculate));
    const select=$('[data-field="toll_id"],[data-field="concept_id"]',line);
    select?.addEventListener('change',()=>{
      const other=select.value==='other';$('[data-other-wrap]',line).hidden=!other;
      if(line.classList.contains('rem-toll-line')&&!other){const ref=(state.reference.tolls||[]).find(x=>x.toll_id===select.value);if(ref){$('[data-field="unit_amount"]',line).value=ref.amount??'';$('[data-field="toll_name"]',line).value=ref.name||''}}
      if(line.classList.contains('rem-excess-line')&&!other){const ref=(state.reference.excess_concepts||[]).find(x=>x.concept_id===select.value);if(ref)$('[data-field="concept_name"]',line).value=ref.name||''}
      recalculate();
    });
  }
  function renumber(){$$('.rem-toll-line').forEach((x,i)=>$('.rem-addon-line-number',x).textContent=`Cruce de peaje ${i+1}`);$$('.rem-excess-line').forEach((x,i)=>$('.rem-addon-line-number',x).textContent=`Excedente ${i+1}`)}
  function pickerRows(kind){return kind==='toll'?(state.reference.tolls||[]).map(x=>({id:x.toll_id,label:x.name,detail:[x.road,x.direction].filter(Boolean).join(' · ')})):(state.reference.excess_concepts||[]).map(x=>({id:x.concept_id,label:x.name,detail:''}))}
  async function openPicker(kind){
    if(!pickerRows(kind).length){
      try{await loadReference()}catch(error){const box=$('#rem-addons-errors');if(box){box.textContent=error.message||'No se pudo cargar el catálogo';box.classList.add('visible')}return}
    }
    const modal=$('#rem-addon-picker');if(!modal)return;
    const field=kind==='toll'?'toll_id':'concept_id';const selected=new Set($$(`.rem-${kind}-line`).map(x=>$(`[data-field="${field}"]`,x)?.value).filter(Boolean));
    modal.dataset.kind=kind;$('#rem-addon-picker-title').textContent=kind==='toll'?'Seleccionar peajes':'Seleccionar excedentes';
    $('#rem-addon-picker-list').innerHTML=[...pickerRows(kind),{id:'other',label:kind==='toll'?'Otro peaje':'Otro excedente',detail:'Carga manual'}].map(x=>`<label class="rem-picker-option"><input type="checkbox" value="${esc(x.id)}" ${selected.has(String(x.id))?'checked':''}><span><b>${esc(x.label)}</b>${x.detail?`<small>${esc(x.detail)}</small>`:''}</span></label>`).join('');
    modal.hidden=false;document.body.classList.add('rem-picker-open');
  }
  function closePicker(){const modal=$('#rem-addon-picker');if(modal)modal.hidden=true;document.body.classList.remove('rem-picker-open')}
  function confirmPicker(){
    const modal=$('#rem-addon-picker'),kind=modal?.dataset.kind;if(!kind)return;
    const field=kind==='toll'?'toll_id':'concept_id';const wanted=$$('#rem-addon-picker-list input:checked').map(x=>x.value);const box=$(`#rem-${kind}-lines`);
    $$(`.rem-${kind}-line`,box).forEach(line=>{if(!wanted.includes($(`[data-field="${field}"]`,line)?.value||''))line.remove()});
    const existing=new Set($$(`.rem-${kind}-line`,box).map(line=>$(`[data-field="${field}"]`,line)?.value));wanted.forEach(value=>{if(!existing.has(value))addLine(kind,value)});
    renumber();recalculate();closePicker();
  }
  function active(kind){return kind==='tolls'?$$('.rem-toll-line').length>0:kind==='excesses'?$$('.rem-excess-line').length>0:false}
  function totals(){
    const toll=active('tolls')?$$('.rem-toll-line').reduce((n,x)=>n+number($('[data-field="unit_amount"]',x)?.value),0):0;
    const excess=active('excesses')?$$('.rem-excess-line').reduce((n,x)=>n+number($('[data-field="quantity"]',x)?.value)*number($('[data-field="unit_amount"]',x)?.value),0):0;
    return{toll,excess,total:toll+excess};
  }
  function recalculate(){
    const t=totals();const p=$('#imp-peaje');const e=$('#imp-excedente');if(p)p.value=String(t.toll);if(e)e.value=String(t.excess);
    const tollTotal=$('#rem-tolls-total');if(tollTotal)tollTotal.textContent=money(t.toll);const excessTotal=$('#rem-excesses-total');if(excessTotal)excessTotal.textContent=money(t.excess);
    if(typeof window.calcularTotal==='function')window.calcularTotal();
    renderSignatureSummary();
  }
  function collectionEnabled(){return $('#rem-had-collections')?.checked===true}
  function collectLines(){
    const tolls=active('tolls')?$$('.rem-toll-line').map(line=>{const selected=$('[data-field="toll_id"]',line)?.value;const ref=(state.reference.tolls||[]).find(x=>x.toll_id===selected);return{client_line_id:line.dataset.lineId,toll_id:selected&&selected!=='other'?selected:null,toll_name:selected==='other'?$('[data-field="toll_name"]',line)?.value.trim():(ref?.name||$('[data-field="toll_name"]',line)?.value.trim()),quantity:1,unit_amount:number($('[data-field="unit_amount"]',line)?.value),currency:'ARS',payment_method:$('[data-field="payment_method"]',line)?.value||'other',crossed_at:null,missing_evidence_reason:null,notes:null}}):[];
    const excesses=active('excesses')?$$('.rem-excess-line').map(line=>{const selected=$('[data-field="concept_id"]',line)?.value;const ref=(state.reference.excess_concepts||[]).find(x=>x.concept_id===selected);const name=selected==='other'?$('[data-field="concept_name"]',line)?.value.trim():(ref?.name||$('[data-field="concept_name"]',line)?.value.trim());const method=$('[data-field="payment_method"]',line)?.value||'other';return{client_line_id:line.dataset.lineId,concept_id:selected&&selected!=='other'?selected:null,concept_name:name,quantity:1,unit_amount:number($('[data-field="unit_amount"]',line)?.value),currency:'ARS',payment_method:method,reason:name||'Excedente informado',notes:JSON.stringify({payment_method:method})}}):[];
    return{tolls,excesses};
  }
  function descriptor(input,kind,lineId=null){
    const file=input?.files?.[0];if(!file)return null;
    input.dataset.evidenceId=input.dataset.evidenceId||id();
    return{client_evidence_id:input.dataset.evidenceId,client_line_id:lineId,evidence_kind:kind,mime_type:file.type,original_name:file.name,size_bytes:file.size,blob_field:`addon_${input.dataset.evidenceId}`,file};
  }
  function collectEvidence(){
    const list=[];
    if(active('tolls'))$$('.rem-toll-line').forEach(line=>{const d=descriptor($('[data-field="ticket"]',line),'toll_ticket',line.dataset.lineId);if(d)list.push(d)});
    const kinds=['vehicle_front','odometer','extra','extra'];
    $$('#foto-grid input[type="file"]').forEach((input,i)=>{const d=descriptor(input,kinds[i]||'extra');if(d)list.push(d)});
    return list;
  }
  function validate(){
    const errors=[];const {tolls,excesses}=collectLines();const evidence=collectEvidence();
    tolls.forEach((x,i)=>{if(!x.toll_name)errors.push(`Indicá el peaje ${i+1}.`);if(x.unit_amount<=0)errors.push(`Ingresá el importe del peaje ${i+1}.`);if(!x.payment_method)errors.push(`Seleccioná el medio utilizado en el peaje ${i+1}.`)});
    excesses.forEach((x,i)=>{if(!x.concept_name)errors.push(`Indicá el tipo de excedente ${i+1}.`);if(x.unit_amount<=0)errors.push(`Ingresá el importe del excedente ${i+1}.`);if(!x.payment_method)errors.push(`Seleccioná el medio de pago del excedente ${i+1}.`)});
    evidence.forEach(x=>{if(x.size_bytes>MAX_BYTES)errors.push(`${x.original_name} supera 10 MiB.`);if(!MIME.has(x.mime_type))errors.push(`${x.original_name} tiene un formato no admitido.`)});
    if(collectionEnabled()){if(!$('#rem-pago-selected')?.value)errors.push('Seleccioná cómo cobraste al cliente.');if(number($('#pago1-monto')?.value)+number($('#pago2-monto')?.value)<=0)errors.push('Ingresá el importe cobrado al cliente.')}
    const box=$('#rem-addons-errors');if(box){box.innerHTML=errors.map(esc).join('<br>');box.classList.toggle('visible',!!errors.length)}
    return{ok:!errors.length,errors};
  }
  function collect(){const lines=collectLines();const evidence=collectEvidence();return{payload:{addons_version:2,tolls:lines.tolls,excesses:lines.excesses,evidence:[],customer_collections:collectionEnabled()?{method:$('#rem-pago-selected')?.value||null,amount:number($('#pago1-monto')?.value)+number($('#pago2-monto')?.value)}:null},files:evidence}}
  async function uploadEvidence(bundle,operationToken){
    if(!bundle?.files?.length)return bundle?.payload||{addons_version:2,tolls:[],excesses:[],evidence:[]};
    const {data:{user}}=await _db.auth.getUser();if(!user)throw new Error('La sesión del Chofer venció');
    const evidence=[];
    for(const item of bundle.files){
      const ext=(item.original_name.split('.').pop()||item.mime_type.split('/').pop()||'bin').replace(/[^a-zA-Z0-9]/g,'').toLowerCase();
      const path=`${user.id}/${String(operationToken).replace(/[^a-zA-Z0-9-]/g,'')}/${item.client_evidence_id}.${ext}`;
      const {error}=await _db.storage.from('remito-evidence-v2').upload(path,item.file,{contentType:item.mime_type,upsert:true});
      if(error)throw new Error(`No se pudo subir ${item.original_name}: ${error.message}`);
      evidence.push({...item,storage_path:path,file:undefined,blob_field:undefined});
    }
    return{...bundle.payload,evidence};
  }
  function renderSignatureSummary(){
    const host=$('#rem-addon-signature-summary');if(!host)return;const {tolls,excesses}=collectLines();const t=totals();
    const lines=[...tolls.map(x=>({name:x.toll_name||'Peaje',amount:x.unit_amount})),...excesses.map(x=>({name:`${x.concept_name||'Excedente'} × ${x.quantity}`,amount:x.quantity*x.unit_amount}))];
    host.innerHTML=`<div class="rem-addons-kicker">Detalle que acepta el cliente</div><div class="rem-addon-summary-grid"><div class="rem-addon-summary-stat"><span>Peajes</span><strong>${money(t.toll)}</strong></div><div class="rem-addon-summary-stat"><span>Excedentes</span><strong>${money(t.excess)}</strong></div><div class="rem-addon-summary-stat"><span>Cobrado</span><strong>${collectionEnabled()?money(number($('#pago1-monto')?.value)+number($('#pago2-monto')?.value)):money(0)}</strong></div></div><div class="rem-addon-summary-lines">${lines.length?lines.map(x=>`<div class="rem-addon-summary-line"><span>${esc(x.name)}</span><strong>${money(x.amount)}</strong></div>`).join(''):'<div class="rem-addon-empty">Sin peajes ni excedentes informados</div>'}</div>`;
  }
  function reviewMeta(status){
    if(status==='approved')return{label:'Aprobado',css:'approved'};
    if(status==='adjusted')return{label:'Ajustado por Administración',css:'adjusted'};
    return{label:'En revisión',css:'pending'};
  }
  async function renderHistory(remitoId,host){
    if(!host||!remitoId)return;
    host.innerHTML='<div class="rem-addon-empty">Cargando detalle informado…</div>';
    const {data,error}=await _db.rpc('get_driver_remito_addons_v2',{p_remito_id:Number(remitoId)});
    if(error){host.innerHTML=`<div class="rem-addon-empty">${esc(error.message||'No se pudo cargar el detalle')}</div>`;return}
    const meta=reviewMeta(data.review_status);
    const tolls=(data.tolls||[]).map(x=>{const accepted=x.review?.accepted||null;const rejected=x.review?.decision==='rejected';return`<div class="rem-addon-summary-line"><span>${esc(x.toll_name)} · ${esc(x.payment_method)}${x.evidence?.length?' · ticket adjunto':x.missing_evidence_reason?' · sin ticket justificado':''}</span><strong>${rejected?'Rechazado':money(accepted?.total_amount??x.total_amount)}</strong></div>${x.review?.decision==='adjusted'?`<div class="rem-addons-help">Original ${money(x.total_amount)} · ${esc(x.review.reason||'Ajuste administrativo')}</div>`:''}`});
    const excesses=(data.excesses||[]).map(x=>{const accepted=x.review?.accepted||null;const rejected=x.review?.decision==='rejected';return`<div class="rem-addon-summary-line"><span>${esc(x.concept_name)} × ${esc(x.quantity)}</span><strong>${rejected?'Rechazado':money(accepted?.total_amount??x.total_amount)}</strong></div>${x.review?.decision==='adjusted'?`<div class="rem-addons-help">Original ${money(x.total_amount)} · ${esc(x.review.reason||'Ajuste administrativo')}</div>`:''}`});
    host.innerHTML=`<div class="rem-addons-head"><div><div class="rem-addons-kicker">Peajes y excedentes informados</div><div class="rem-addons-help">El original firmado se conserva sin cambios.</div></div><span class="rem-addon-status ${meta.css}">${meta.label}</span></div><div class="rem-addon-summary-lines">${[...tolls,...excesses].join('')||'<div class="rem-addon-empty">El chofer confirmó que no hubo peajes ni excedentes.</div>'}</div><div class="rem-addon-summary-grid"><div class="rem-addon-summary-stat"><span>Informado</span><strong>${money(number(data.reported_toll_total)+number(data.reported_excess_total))}</strong></div><div class="rem-addon-summary-stat"><span>Aceptado</span><strong>${data.accepted_total_extras==null?'Pendiente':money(data.accepted_total_extras)}</strong></div><div class="rem-addon-summary-stat"><span>Evidencia general</span><strong>${(data.evidence||[]).length}</strong></div></div>`;
  }
  function reset(){
    $$('#rem-had-collections').forEach(x=>{x.checked=false;x.dispatchEvent(new Event('change'))});
    $('#rem-toll-lines')?.replaceChildren();$('#rem-excess-lines')?.replaceChildren();recalculate();
  }
  async function init(){
    const step=$('#rem-step-2');if(!step||step.dataset.addonsV2==='1')return;
    const payment=$('#rem-pago-selected')?.closest('.form-group');
    step.dataset.addonsV2='1';
    step.innerHTML=`<div class="rem-addons-v2"><input id="imp-peaje" type="hidden" value="0"><input id="imp-excedente" type="hidden" value="0"><span id="imp-total" hidden>$0</span>
      <section class="rem-addons-card"><div class="rem-addons-head"><div><div class="rem-addons-kicker">Paso 2</div><div class="rem-addons-title">Peajes</div><div class="rem-addons-help">Seleccioná sólo los peajes utilizados.</div></div></div><button class="rem-addon-select" id="rem-add-toll" type="button">Seleccionar peajes</button><div id="rem-toll-lines" class="rem-addon-lines"></div><div class="rem-addon-total"><span>Total peajes</span><strong id="rem-tolls-total">$0</strong></div></section>
      <section class="rem-addons-card"><div class="rem-addons-head"><div><div class="rem-addons-title">Excedentes</div><div class="rem-addons-help">Agregá sólo si corresponde.</div></div></div><button class="rem-addon-select" id="rem-add-excess" type="button">Seleccionar excedentes</button><div id="rem-excess-lines" class="rem-addon-lines"></div><div class="rem-addon-total"><span>Total excedentes</span><strong id="rem-excesses-total">$0</strong></div></section>
      <section class="rem-addons-card"><div class="rem-addons-head"><div><div class="rem-addons-kicker">Separado de los peajes</div><div class="rem-addons-title">Cobros realizados al cliente</div><div class="rem-addons-help">Activá sólo si efectivamente recibiste un pago del cliente.</div></div><label class="rem-addons-switch"><input id="rem-had-collections" type="checkbox"> Hubo cobro</label></div><div id="rem-collections-slot" hidden></div></section><div id="rem-addons-errors" class="rem-addon-errors"></div></div>`;
    document.body.insertAdjacentHTML('beforeend','<div id="rem-addon-picker" class="rem-addon-picker" hidden><div class="rem-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="rem-addon-picker-title"><div class="rem-picker-head"><b id="rem-addon-picker-title">Seleccionar</b><button id="rem-addon-picker-close" type="button" aria-label="Cerrar">×</button></div><div id="rem-addon-picker-list" class="rem-picker-list"></div><button id="rem-addon-picker-confirm" class="rem-picker-confirm" type="button">Confirmar selección</button></div></div>');
    if(payment){$('#rem-collections-slot').appendChild(payment);const label=$('label.form-label',payment);if(label)label.textContent='Medio e importe cobrado'}
    try{await loadReference()}catch(e){console.warn('[remito-addons-v2]',e);const box=$('#rem-addons-errors');if(box){box.textContent=e.message;box.classList.add('visible')}}
    $('#rem-had-collections').addEventListener('change',e=>{$('#rem-collections-slot').hidden=!e.target.checked;if(!e.target.checked&&typeof window.resetPagoForm==='function')window.resetPagoForm();renderSignatureSummary()});
    $('#rem-add-toll').addEventListener('click',()=>openPicker('toll'));$('#rem-add-excess').addEventListener('click',()=>openPicker('excess'));
    $('#rem-addon-picker-close').addEventListener('click',closePicker);$('#rem-addon-picker-confirm').addEventListener('click',confirmPicker);$('#rem-addon-picker').addEventListener('click',e=>{if(e.target.id==='rem-addon-picker')closePicker()});
    state.initialized=true;recalculate();
  }

  window.AuxiliosRemitoAddonsV2={init,reset,validate,collect,uploadEvidence,renderSignatureSummary,renderHistory,recalculate,hasCustomerCollection:collectionEnabled,loadReference};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void init(),{once:true});else void init();
})();

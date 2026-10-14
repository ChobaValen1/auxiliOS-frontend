(function(){
  'use strict';

  /** @typedef {{client_line_id:string,extra_line_ids?:string[],toll_id:string,toll_name:string,quantity:number,unit_amount:number,currency:string,customer_payment_method:string,amount_pending?:boolean}} DriverTollReport */
  /** @typedef {{client_line_id:string,concept_id:string,concept_name:string,quantity:number,unit_amount:number,currency:string,customer_payment_method:string,reason:string,amount_pending?:boolean}} DriverExcessReport */
  /** @typedef {{client_evidence_id:string,client_line_id:string|null,evidence_kind:string,storage_path?:string,mime_type:string,original_name:string,size_bytes:number,blob_field?:string}} RemitoEvidence */

  const EMPTY_REFERENCE={version:2,toll_coverage_mode:null,tolls:[],excess_concepts:[],payment_methods:[],evidence:{}};
  const PAYMENTS=[['cash','Efectivo'],['transfer','Transferencia'],['card','Tarjeta'],['mercado_pago','Mercado Pago'],['other','Otro'],['not_collected','No cobrado']];
  const TOLL_COVERAGE_LABELS={mixed_manual:'Uno y Uno',provider_roundtrip:'A cargo de la prestadora',customer_roundtrip:'A cargo del cliente'};
  const state={reference:{...EMPTY_REFERENCE},referenceLoaded:false,serviceId:null,initialized:false,lines:{toll:[],excess:[]},persistedEvidence:[],draft:null,toggles:{concepts:[],selected:new Set()}};
  const MAX_BYTES=10*1024*1024;
  /* Pasadas por el mismo peaje (ida y vuelta, varias vueltas): se eligen con − / +. */
  const MAX_PASSES=10;
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
  const tollCoverageLabel=(mode,assigned=!!currentServiceId())=>TOLL_COVERAGE_LABELS[String(mode||'')]||(assigned?'Sin formato configurado':'A definir por Operaciones');
  const providerTolls=()=>state.reference.toll_coverage_mode==='provider_roundtrip';
  const tollPayer=line=>line?.payer_agent||(providerTolls()?'provider':'customer');
  const tollPaymentLabel=line=>tollPayer(line)==='provider'?'A cargo de la prestadora':paymentLabel(line.customer_payment_method);
  const amountText=line=>line.amount_pending||number(line.unit_amount)<=0?'A definir por Administración':money(line.unit_amount);
  const passes=line=>Math.min(MAX_PASSES,Math.max(1,Math.round(number(line?.quantity)||1)));
  const lineTotal=line=>number(line.unit_amount)*passes(line);

  async function loadReference(force=false){
    if(typeof _db==='undefined')return state.reference;
    const serviceId=currentServiceId();
    if(!force&&state.referenceLoaded&&state.serviceId===serviceId)return state.reference;
    const {data,error}=await _db.rpc('get_driver_remito_reference_v2',{p_service_id:serviceId});
    if(error)throw new Error(error.message||'No se pudieron cargar peajes y excedentes');
    state.reference={...EMPTY_REFERENCE,...(data||{})};state.referenceLoaded=true;state.serviceId=serviceId;renderTollCoverage();await loadToggles(serviceId);return state.reference;
  }
  /* Conceptos sí/no sin precio (p. ej. Pinacars): no son excedentes ni se cobran al cliente. */
  async function loadToggles(serviceId){
    try{const {data,error}=await _db.rpc('get_service_toggle_concepts_v1',{p_company_id:null,p_service_id:serviceId});if(error)throw error;
      state.toggles={concepts:Array.isArray(data?.concepts)?data.concepts:[],selected:new Set((data?.selected||[]).map(String))};}
    catch(error){console.warn('[remito-addons-v2] interruptores',error);state.toggles={concepts:[],selected:new Set()};}
    renderToggles();
  }
  function renderToggles(){
    const card=$('#rem-toggles-card'),list=$('#rem-toggles-list');if(!card||!list)return;
    card.hidden=!state.toggles.concepts.length;
    list.innerHTML=state.toggles.concepts.map(c=>`<label class="ax-switch rem-toggle-row"><span>${esc(c.description||c.name)}</span><input type="checkbox" data-toggle-concept="${esc(c.concept_id)}" ${state.toggles.selected.has(String(c.concept_id))?'checked':''}></label>`).join('');
    list.querySelectorAll('[data-toggle-concept]').forEach(input=>input.addEventListener('change',()=>{const id=input.dataset.toggleConcept;if(input.checked)state.toggles.selected.add(id);else state.toggles.selected.delete(id);}));
  }

  /* Formato de cobro: una etiqueta corta junto al título y una sola línea de ayuda. */
  function renderTollCoverage(){
    const host=$('#rem-toll-coverage'),help=$('#rem-toll-help');if(!host)return;
    const label=tollCoverageLabel(state.reference.toll_coverage_mode);
    host.innerHTML=`<span class="rem-sr-only">Formato de cobro de peajes:</span><strong>${esc(label)}</strong>`;host.title=`Formato de cobro de peajes: ${label}`;
    if(help)help.textContent=`Cargá sólo los peajes de origen a destino.${state.reference.toll_coverage_mode==='mixed_manual'?' Los del socio van acá; Operaciones carga los de la prestadora.':providerTolls()?' Se imputan a la prestadora, sin cobro al socio.':''}`;
  }

  function blankLine(kind,ref){
    const suggested=number(ref.reference_amount),amountMode=ref.amount_mode||(kind==='toll'?'suggested':'fixed');
    const amount=kind==='toll'||amountMode==='fixed'?suggested:0;
    return kind==='toll'
      ?{client_line_id:uid(),extra_line_ids:[],toll_id:ref.toll_id,toll_name:ref.name||'Peaje',quantity:1,unit_amount:amount,suggested_amount:suggested,amount_mode:amountMode,currency:ref.currency||'ARS',customer_payment_method:'',amount_pending:false}
      :{client_line_id:uid(),concept_id:ref.concept_id,concept_name:ref.name||'Excedente',quantity:1,unit_amount:amount,suggested_amount:suggested,amount_mode:amountMode,currency:ref.currency||'ARS',customer_payment_method:'',reason:ref.name||'Excedente',amount_pending:false};
  }

  function pickerError(message=''){
    const box=$('#rem-picker-error');if(!box)return;box.textContent=message;box.classList.toggle('visible',!!message);
  }

  /* Selección compacta: casilla, nombre y precio debajo; en peajes, las pasadas con − / +. */
  function qtyMarkup(value,qty,checked){
    return`<div class="rem-qty" data-qty-for="${esc(value)}" ${checked?'':'hidden'}><button type="button" data-qty-step="-1" aria-label="Una pasada menos" ${qty<=1?'disabled':''}>−</button><output aria-live="polite">${qty}</output><button type="button" data-qty-step="1" aria-label="Una pasada más" ${qty>=MAX_PASSES?'disabled':''}>+</button></div>`;
  }
  function selectionMarkup(){
    const {kind,lines}=state.draft;const key=lineKey(kind),byId=new Map(lines.map(line=>[String(line[key]),line]));const rows=referenceRows(kind);
    if(!rows.length)return'<div class="rem-addon-empty">No hay conceptos habilitados para seleccionar.</div>';
    return rows.map(row=>{const value=String(row[key]),amount=number(row.reference_amount),manual=row.amount_mode==='manual',missing=amount<=0,disabled=kind==='excess'&&!manual&&missing,current=byId.get(value),checked=!!current;const price=kind==='toll'?(missing?'Sin precio sugerido':`Precio sugerido ${money(amount)}`):manual?'Importe variable':missing?'Sin precio configurado':`Precio ${money(amount)}`;const qty=kind==='toll'?passes({quantity:state.draft.qty?.[value]??current?.quantity}):1;return`<div class="rem-picker-option ${checked?'is-checked':''} ${disabled?'is-disabled':''}" data-option="${esc(value)}"><label class="rem-picker-pick"><input type="checkbox" value="${esc(value)}" ${checked?'checked':''} ${disabled?'disabled':''}><span><b>${esc(row.name)}</b><small>${price}</small></span></label>${kind==='toll'?qtyMarkup(value,qty,checked):''}</div>`}).join('');
  }
  function onSelectionChange(event){
    const input=event.target.closest?.('input[type="checkbox"]');if(!input||state.draft?.phase!=='select')return;
    const option=input.closest('.rem-picker-option');option?.classList.toggle('is-checked',input.checked);
    const stepper=option?.querySelector('.rem-qty');if(stepper)stepper.hidden=!input.checked;
    updateSelectionCount();
  }
  function onQtyClick(event){
    const button=event.target.closest?.('[data-qty-step]');if(!button||state.draft?.phase!=='select')return;
    event.preventDefault();const stepper=button.closest('.rem-qty'),value=stepper?.dataset.qtyFor;if(!value)return;
    state.draft.qty=state.draft.qty||{};const next=passes({quantity:passes({quantity:state.draft.qty[value]??stepper.querySelector('output')?.textContent})+Number(button.dataset.qtyStep)});
    state.draft.qty[value]=next;stepper.outerHTML=qtyMarkup(value,next,true);
  }

  function paymentOptions(value){return`<option value="">Seleccionar…</option>`+PAYMENTS.map(([key,label])=>`<option value="${key}" ${key===value?'selected':''}>${label}</option>`).join('')}
  function detailsMarkup(){
    const {kind,lines}=state.draft;
    if(!lines.length)return'<div class="rem-addon-empty">La selección quedará vacía.</div>';
    return(providerTolls()&&kind==='toll'?'<p class="rem-addons-help">Estos peajes quedan a cargo de la prestadora. No se cobra al socio.</p>':`<label class="rem-picker-common-payment"><span>Medio de pago para toda la selección</span><select id="rem-picker-common-payment">${paymentOptions(state.draft.paymentMethod||'')}</select><small>Podés elegir “No cobrado”.</small></label>`)+`<div class="rem-picker-priced-list">${lines.map((line,index)=>{const editable=kind==='toll'||line.amount_mode==='manual',suggested=number(line.suggested_amount),q=kind==='toll'?passes(line):1;const meta=kind==='toll'?[suggested>0?`Sugerido ${money(suggested)}`:'Sin precio sugerido',q>1?`${q} pasadas`:''].filter(Boolean).join(' · '):line.amount_mode==='manual'?'Importe variable':'Precio definido';return`<article class="rem-picker-detail ${editable?'is-editable':''}" data-draft-index="${index}"><div class="rem-picker-detail-head"><b>${esc(lineName(kind,line))}${q>1?` <span class="rem-qty-badge">×${q}</span>`:''}</b><small>${esc(meta)}</small></div>${editable?`<label class="rem-picker-amount"><span>${kind==='toll'?(q>1?'Importe real por pasada':'Importe real'):'Importe'}</span><input data-draft-field="unit_amount" inputmode="decimal" placeholder="0" value="${esc(line.unit_amount||'')}"></label>`:`<strong class="rem-picker-price">${amountText(line)}</strong>`}</article>`}).join('')}</div>`;
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
    if(kind==='toll'&&currentServiceId()&&!['provider_roundtrip','customer_roundtrip','mixed_manual'].includes(state.reference.toll_coverage_mode)){const box=$('#rem-addons-errors');if(box){box.textContent='Operaciones debe definir el formato de cobro de peajes.';box.classList.add('visible')}return;}
    const lines=clone(state.lines[kind]),methods=[...new Set(lines.map(line=>line.customer_payment_method).filter(Boolean))];
    state.draft={kind,phase:'select',lines,paymentMethod:methods.length===1?methods[0]:'',qty:Object.fromEntries(kind==='toll'?lines.map(line=>[String(line.toll_id),passes(line)]):[])};
    renderPicker();const modal=$('#rem-addon-picker');modal.hidden=false;document.body.classList.add('rem-picker-open');
  }

  function cancelPicker(){state.draft=null;const modal=$('#rem-addon-picker');if(modal)modal.hidden=true;document.body.classList.remove('rem-picker-open')}
  function captureDetails(){
    if(state.draft?.phase!=='details')return;
    state.draft.paymentMethod=$('#rem-picker-common-payment')?.value||'';
    $$('.rem-picker-detail').forEach(card=>{const line=state.draft.lines[Number(card.dataset.draftIndex)];if(!line)return;const input=$('[data-draft-field="unit_amount"]',card);if(input)line.unit_amount=input.value;line.customer_payment_method=state.draft.kind==='toll'&&providerTolls()?null:state.draft.paymentMethod});
  }
  function continuePicker(){
    if(state.draft?.phase!=='select')return;
    const key=lineKey(state.draft.kind),wanted=$$('#rem-addon-picker-list input:checked').map(input=>input.value),existing=new Map(state.draft.lines.map(line=>[String(line[key]),line]));
    state.draft.lines=wanted.map(value=>{const ref=referenceRows(state.draft.kind).find(row=>String(row[key])===value),current=existing.get(value),fresh=blankLine(state.draft.kind,ref);const line=current?{...fresh,...current,client_line_id:current.client_line_id,customer_payment_method:current.customer_payment_method||state.draft.paymentMethod||''}:fresh;if(state.draft.kind==='toll')line.quantity=passes({quantity:state.draft.qty?.[value]??line.quantity});return line});
    state.draft.phase='details';renderPicker();
  }
  function backPicker(){captureDetails();if(!state.draft)return;state.draft.phase='select';renderPicker()}
  function savePicker(){
    captureDetails();if(!state.draft)return;
    const invalidMethod=!(state.draft.kind==='toll'&&providerTolls())&&state.draft.lines.find(line=>!PAYMENTS.some(([key])=>key===line.customer_payment_method));
    if(invalidMethod){pickerError('Elegí un medio de pago para la selección.');return}
    const invalidAmount=state.draft.lines.find(line=>number(line.unit_amount)<=0);
    if(invalidAmount){pickerError(`Ingresá un importe válido para ${lineName(state.draft.kind,invalidAmount)}.`);return}
    state.lines[state.draft.kind]=clone(state.draft.lines);cancelPicker();recalculate();
  }

  function totals(){
    const toll=state.lines.toll.reduce((sum,line)=>sum+lineTotal(line),0);
    const excess=state.lines.excess.reduce((sum,line)=>sum+number(line.unit_amount)*number(line.quantity||1),0);
    return{toll,excess,total:toll+excess};
  }
  function compactSummary(kind){
    const lines=state.lines[kind],host=$(`#rem-${kind}-summary`);if(!host)return;
    const button=$(kind==='toll'?'#rem-add-toll':'#rem-add-excess'),totalRow=$(kind==='toll'?'#rem-toll-total-row':'#rem-excess-total-row');
    if(button){button.textContent=lines.length?(kind==='toll'?'Editar peajes':'Editar excedentes'):(kind==='toll'?'Seleccionar peajes':'Seleccionar excedentes');button.classList.toggle('is-edit',!!lines.length)}
    if(totalRow)totalRow.hidden=!lines.length;
    if(!lines.length){host.innerHTML='';return}
    /* Nombre (y las pasadas) arriba, el medio de pago abajo: en el celular no se corta. */
    const label=line=>`<b class="rem-addon-line-name">${esc(lineName(kind,line))}${kind==='toll'&&passes(line)>1?` <i class="rem-qty-badge">×${passes(line)}</i>`:''}</b><small>${esc(kind==='toll'?tollPaymentLabel(line):paymentLabel(line.customer_payment_method))}</small>`;
    const amount=line=>kind==='toll'?lineTotal(line):number(line.unit_amount)*number(line.quantity||1);
    const first=lines[0];const rows=[`<div class="rem-addon-summary-line"><span>${label(first)}</span><strong>${first.amount_pending?'A definir':money(amount(first))}</strong></div>`];
    if(lines.length===2){const second=lines[1];rows.push(`<div class="rem-addon-summary-line"><span>${label(second)}</span><strong>${second.amount_pending?'A definir':money(amount(second))}</strong></div>`)}
    else if(lines.length>2){const rest=lines.slice(1);rows.push(`<div class="rem-addon-summary-line more"><span>+${lines.length-1} más</span><strong>${rest.some(line=>line.amount_pending)?'Incluye importes a definir':money(rest.reduce((sum,line)=>sum+amount(line),0))}</strong></div>`)}
    host.innerHTML=rows.join('');
  }
  function recalculate(){
    const total=totals();const customerToll=providerTolls()?0:total.toll;const toll=$('#imp-peaje'),excess=$('#imp-excedente');if(toll)toll.value=String(customerToll);if(excess)excess.value=String(total.excess);
    const tollTotal=$('#rem-tolls-total'),excessTotal=$('#rem-excesses-total');if(tollTotal)tollTotal.textContent=state.lines.toll.some(line=>line.amount_pending)?'A definir':money(total.toll);if(excessTotal)excessTotal.textContent=state.lines.excess.some(line=>line.amount_pending)?'A definir':money(total.excess);
    compactSummary('toll');compactSummary('excess');if(typeof window.calcularTotal==='function')window.calcularTotal();renderSignatureSummary();
  }

  function collectLines(){
    return{
      /* La base guarda una fila por pasada: un peaje ×2 viaja como dos líneas, cada una con su id estable. */
      tolls:state.lines.toll.flatMap(line=>{const q=passes(line);if(!line.client_line_id)line.client_line_id=uid();line.extra_line_ids=Array.isArray(line.extra_line_ids)?line.extra_line_ids:[];while(line.extra_line_ids.length<q-1)line.extra_line_ids.push(uid());const ids=[line.client_line_id,...line.extra_line_ids].slice(0,q);return ids.map(id=>({client_line_id:id,toll_id:line.toll_id,toll_name:line.toll_name,quantity:1,unit_amount:number(line.unit_amount),currency:'ARS',payer_agent:providerTolls()?'provider':'customer',customer_payment_method:providerTolls()?null:line.customer_payment_method,crossed_at:null,missing_evidence_reason:null,notes:null}))}),
      excesses:state.lines.excess.map(line=>({client_line_id:line.client_line_id,concept_id:line.concept_id,concept_name:line.concept_name,quantity:1,unit_amount:number(line.unit_amount),currency:'ARS',customer_payment_method:line.customer_payment_method,reason:line.concept_name,notes:null}))
    };
  }
  function descriptor(input,kind){const file=input?.files?.[0];if(!file)return null;input.dataset.evidenceId=input.dataset.evidenceId||uid();return{client_evidence_id:input.dataset.evidenceId,client_line_id:null,evidence_kind:kind,mime_type:file.type,original_name:file.name,size_bytes:file.size,blob_field:`addon_${input.dataset.evidenceId}`,file}}
  function collectEvidence(){const kinds=['vehicle_front','odometer','extra','extra'];return $$('#foto-grid input[type="file"]').map((input,index)=>descriptor(input,kinds[index]||'extra')).filter(Boolean)}
  function validate(){
    const errors=[];const {tolls,excesses}=collectLines(),evidence=collectEvidence();
    tolls.forEach((line,index)=>{if(!line.toll_id)errors.push(`Seleccioná el peaje ${index+1}.`);if(line.unit_amount<=0)errors.push(`Ingresá el importe del peaje ${index+1}.`);if(line.payer_agent!=='provider'&&!line.customer_payment_method)errors.push(`Seleccioná cómo pagó el cliente el peaje ${index+1}.`)});
    excesses.forEach((line,index)=>{if(!line.concept_id)errors.push(`Seleccioná el excedente ${index+1}.`);if(line.unit_amount<=0)errors.push(`Ingresá el importe del excedente ${index+1}.`);if(!line.customer_payment_method)errors.push(`Seleccioná cómo pagó el cliente el excedente ${index+1}.`)});
    evidence.forEach(item=>{if(item.size_bytes>MAX_BYTES)errors.push(`${item.original_name} supera 10 MiB.`);if(!MIME.has(item.mime_type))errors.push(`${item.original_name} tiene un formato no admitido.`)});
    const box=$('#rem-addons-errors');if(box){box.innerHTML=errors.map(esc).join('<br>');box.classList.toggle('visible',!!errors.length)}return{ok:!errors.length,errors};
  }
  function collect(){const lines=collectLines();return{payload:{addons_version:2,tolls:lines.tolls,excesses:lines.excesses,evidence:clone(state.persistedEvidence),toggle_concept_ids:[...state.toggles.selected]},files:collectEvidence()}}
  async function uploadEvidence(bundle,operationToken){
    if(!bundle?.files?.length)return bundle?.payload||{addons_version:2,tolls:[],excesses:[],evidence:[]};
    const {data:{user}}=await _db.auth.getUser();if(!user)throw new Error('La sesión del Chofer venció');const evidence=clone(bundle.payload?.evidence||[]);
    for(const item of bundle.files){const ext=(item.original_name.split('.').pop()||item.mime_type.split('/').pop()||'bin').replace(/[^a-zA-Z0-9]/g,'').toLowerCase(),path=`${user.id}/${String(operationToken).replace(/[^a-zA-Z0-9-]/g,'')}/${item.client_evidence_id}.${ext}`;const {error}=await _db.storage.from('remito-evidence-v2').upload(path,item.file,{contentType:item.mime_type,upsert:true});if(error)throw new Error(`No se pudo subir ${item.original_name}: ${error.message}`);evidence.push({...item,storage_path:path,file:undefined,blob_field:undefined})}
    return{...bundle.payload,evidence};
  }

  function renderSignatureSummary(){
    const host=$('#rem-addon-signature-summary');if(!host)return;
    host.innerHTML='';host.hidden=true;
  }
  function reviewMeta(status){if(status==='approved')return{label:'Aprobado',css:'approved'};if(status==='adjusted')return{label:'Ajustado por Administración',css:'adjusted'};return{label:'En revisión',css:'pending'}}
  async function renderHistory(remitoId,host){
    if(!host||!remitoId)return;host.innerHTML='<div class="rem-addon-empty">Cargando detalle informado…</div>';const {data,error}=await _db.rpc('get_driver_remito_addons_v2',{p_remito_id:Number(remitoId)});if(error){host.innerHTML=`<div class="rem-addon-empty">${esc(error.message||'No se pudo cargar el detalle')}</div>`;return}
    const meta=reviewMeta(data.review_status),tolls=(data.tolls||[]).map(line=>{const accepted=line.review?.accepted||null,rejected=line.review?.decision==='rejected',method=line.customer_payment_method||line.payment_method;return`<div class="rem-addon-summary-line"><span>${esc(line.toll_name)} · ${esc(tollPaymentLabel(line))}</span><strong>${rejected?'Rechazado':money(accepted?.total_amount??line.total_amount)}</strong></div>`}),excesses=(data.excesses||[]).map(line=>{const accepted=line.review?.accepted||null,rejected=line.review?.decision==='rejected';return`<div class="rem-addon-summary-line"><span>${esc(line.concept_name)} · ${esc(paymentLabel(line.customer_payment_method))}</span><strong>${rejected?'Rechazado':money(accepted?.total_amount??line.total_amount)}</strong></div>`});
    host.innerHTML=`<div class="rem-addons-head"><div><div class="rem-addons-kicker">Peajes y excedentes informados</div><div class="rem-addons-help">Última información registrada para este remito.</div></div><span class="rem-addon-status ${meta.css}">${meta.label}</span></div><div class="rem-toll-coverage-line"><span>Formato de cobro de peajes</span><strong>${esc(tollCoverageLabel(data.toll_coverage_mode,!!data.service_id))}</strong></div><div class="rem-addon-summary-lines">${[...tolls,...excesses].join('')||'<div class="rem-addon-empty">El chofer confirmó que no hubo peajes ni excedentes.</div>'}</div>`;
  }
  async function restore(report){
    if(!report){reset();return}
    await loadReference();
    const restored=(kind,rows)=>rows.map(row=>{const key=lineKey(kind),ref=referenceRows(kind).find(item=>String(item[key])===String(row[key])),base=ref?blankLine(kind,ref):kind==='toll'?{client_line_id:uid(),toll_id:row.toll_id,toll_name:row.toll_name||'Peaje',amount_mode:'suggested',suggested_amount:number(row.unit_amount),currency:row.currency||'ARS'}:{client_line_id:uid(),concept_id:row.concept_id,concept_name:row.concept_name||'Excedente',amount_mode:'manual',suggested_amount:number(row.unit_amount),currency:row.currency||'ARS',quantity:1,reason:row.concept_name||'Excedente'};return{...base,payer_agent:row.payer_agent,client_line_id:row.client_line_id||base.client_line_id,unit_amount:number(row.unit_amount),quantity:number(row.quantity)||1,customer_payment_method:row.customer_payment_method||row.payment_method||'',amount_pending:false}});
    state.lines={toll:groupPasses(restored('toll',report.tolls||[])),excess:restored('excess',report.excesses||[])};
    const evidence=[];const addEvidence=(item,owner=null)=>{if(!item?.evidence_id||!item?.path)return;evidence.push({client_evidence_id:item.evidence_id,client_line_id:owner,evidence_kind:item.kind,storage_path:item.path,mime_type:item.mime_type,original_name:item.original_name,size_bytes:item.size_bytes})};
    (report.evidence||[]).forEach(item=>addEvidence(item));(report.tolls||[]).forEach(line=>(line.evidence||[]).forEach(item=>addEvidence(item,line.client_line_id)));(report.excesses||[]).forEach(line=>(line.evidence||[]).forEach(item=>addEvidence(item,line.client_line_id)));
    state.persistedEvidence=evidence;cancelPicker();recalculate();window.AuxiliosRemitoMobileV3?.syncEvidence?.();
  }
  /* Vuelve a juntar las pasadas guardadas del mismo peaje (mismo importe y medio de pago) en una sola fila con cantidad. */
  function groupPasses(lines){
    const groups=new Map();
    lines.forEach(line=>{const key=[line.toll_id,number(line.unit_amount),line.customer_payment_method||'',line.payer_agent||''].join('|'),group=groups.get(key);
      if(group){group.quantity+=1;group.extra_line_ids.push(line.client_line_id)}else groups.set(key,{...line,quantity:1,extra_line_ids:[]})});
    return[...groups.values()].map(line=>({...line,quantity:Math.min(MAX_PASSES,line.quantity)}));
  }
  function reset(){state.lines={toll:[],excess:[]};state.persistedEvidence=[];state.toggles.selected=new Set();renderToggles();cancelPicker();recalculate()}
  function getPersistedEvidence(){return clone(state.persistedEvidence)}
  function removePersistedEvidence(id){state.persistedEvidence=state.persistedEvidence.filter(item=>String(item.client_evidence_id)!==String(id));window.AuxiliosRemitoMobileV3?.syncEvidence?.();return getPersistedEvidence()}
  function hasCustomerCollection(){return[...(providerTolls()?[]:state.lines.toll),...state.lines.excess].some(line=>line.customer_payment_method&&line.customer_payment_method!=='not_collected')}

  async function init(){
    const step=$('#rem-step-2');if(!step||step.dataset.addonsV2==='1')return;step.dataset.addonsV2='1';
    step.innerHTML=`<div class="rem-addons-v2"><input id="imp-peaje" type="hidden" value="0"><input id="imp-excedente" type="hidden" value="0"><span id="imp-total" hidden>$0</span><header id="rem-addons-step-head" class="rmv-step-head rem-addons-step-head"><span>Paso 2</span><h2>Peajes y excedentes</h2></header><section class="rem-addons-card rem-addons-card--toll"><div class="rem-addons-head"><div class="rem-addons-title">Peajes</div><div id="rem-toll-coverage" class="rem-toll-coverage-pill" title="Formato de cobro de peajes"><span class="rem-sr-only">Formato de cobro de peajes:</span><strong>A definir por Operaciones</strong></div></div><p id="rem-toll-help" class="rem-addons-help">Cargá sólo los peajes de origen a destino.</p><div id="rem-toll-summary" class="rem-addon-summary-lines"></div><div class="rem-addon-total" id="rem-toll-total-row" hidden><span>Total peajes</span><strong id="rem-tolls-total">$0</strong></div><button class="rem-addon-select" id="rem-add-toll" type="button">Seleccionar peajes</button></section><section class="rem-addons-card rem-addons-card--excess"><div class="rem-addons-head"><div class="rem-addons-title">Excedentes</div></div><div id="rem-excess-summary" class="rem-addon-summary-lines"></div><div class="rem-addon-total" id="rem-excess-total-row" hidden><span>Total excedentes</span><strong id="rem-excesses-total">$0</strong></div><button class="rem-addon-select" id="rem-add-excess" type="button">Seleccionar excedentes</button></section><section class="rem-addons-card rem-toggles-card" id="rem-toggles-card" hidden><div id="rem-toggles-list" class="rem-toggle-list"></div></section><div id="rem-addons-errors" class="rem-addon-errors"></div></div>`;
    if(!$('#rem-addon-picker'))document.body.insertAdjacentHTML('beforeend','<div id="rem-addon-picker" class="rem-addon-picker" hidden><div class="rem-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="rem-addon-picker-title"><div class="rem-picker-head"><b id="rem-addon-picker-title">Seleccionar</b><button id="rem-addon-picker-close" type="button" aria-label="Cancelar">×</button></div><div id="rem-addon-picker-list" class="rem-picker-list"></div><div id="rem-picker-error" class="rem-addon-errors"></div><div class="rem-picker-actions"><button id="rem-picker-cancel" class="rem-picker-secondary" type="button">Cancelar</button><button id="rem-picker-back" class="rem-picker-secondary" type="button" hidden>← Volver</button><button id="rem-picker-next" class="rem-picker-confirm" type="button">Continuar</button><button id="rem-picker-save" class="rem-picker-confirm" type="button" hidden>Confirmar</button></div></div></div>');
    $('#rem-add-toll').addEventListener('click',()=>openPicker('toll'));$('#rem-add-excess').addEventListener('click',()=>openPicker('excess'));$('#rem-addon-picker-close').addEventListener('click',cancelPicker);$('#rem-picker-cancel').addEventListener('click',cancelPicker);$('#rem-picker-back').addEventListener('click',backPicker);$('#rem-picker-next').addEventListener('click',continuePicker);$('#rem-picker-save').addEventListener('click',savePicker);$('#rem-addon-picker-list').addEventListener('change',onSelectionChange);$('#rem-addon-picker-list').addEventListener('click',onQtyClick);$('#rem-addon-picker').addEventListener('click',event=>{if(event.target.id==='rem-addon-picker')cancelPicker()});
    if(typeof PERFIL_USUARIO!=='undefined'&&PERFIL_USUARIO?.roles?.name){try{await loadReference()}catch(error){console.warn('[remito-addons-v2]',error);const box=$('#rem-addons-errors');if(box){box.textContent=error.message;box.classList.add('visible')}}}state.initialized=true;recalculate();
  }

  window.AuxiliosRemitoAddonsV2={init,reset,restore,validate,collect,uploadEvidence,renderSignatureSummary,renderHistory,recalculate,hasCustomerCollection,loadReference,getPersistedEvidence,removePersistedEvidence};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void init(),{once:true});else void init();
})();

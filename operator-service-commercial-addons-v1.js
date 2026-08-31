/* AuxiliOS · Servicios · matriz comercial de peajes y excedentes */
(()=>{'use strict';
const O=()=>window.OperatorServices;
const W=()=>O()?.S?.wizard||null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const money=(v,c='ARS')=>`${num(v).toLocaleString('es-AR',{minimumFractionDigits:0,maximumFractionDigits:2})} ${c||'ARS'}`;
const PAYMENTS=[['cash','Efectivo'],['transfer','Transferencia'],['card','Tarjeta'],['mercado_pago','Mercado Pago'],['other','Otro']];
const COVERAGE=[['customer_roundtrip','A cargo del cliente'],['provider_roundtrip','A cargo de la Prestadora'],['mixed_manual','Uno y Uno']];
const PAYERS=[['customer','Cliente'],['provider','Prestadora']];
const COLLECTORS=[['company','Empresa (Nosotros)'],['provider','Prestadora']];
const DOCUMENT_LABELS={draft:'Borrador del chofer',submitted:'Remito recibido',approved:'Remito aprobado',observed:'Remito observado'};
const state={open:null,coverageEditing:false,bound:false};

function rateFor(tollId){const location=(W()?.tollCatalog||[]).find(x=>String(x.toll_id)===String(tollId));if(!location)return{location:null,rate:null};const rates=(location.rates||[]).filter(x=>x.is_current&&x.is_active);const rate=rates.find(x=>x.vehicle_category==='light_2_axles'&&x.payment_method==='any')||rates[0]||null;return{location,rate};}
function optionRows(rows,value,placeholder='Seleccionar…'){return`<option value="">${esc(placeholder)}</option>`+rows.map(([v,l])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(l)}</option>`).join('');}
function tollOptions(value){return`<option value="">Seleccionar peaje…</option>`+(W()?.tollCatalog||[]).map(location=>{const {rate}=rateFor(location.toll_id);const label=rate?`${location.name} · ${money(rate.amount,rate.currency)}`:`${location.name} · Sin tarifa vigente`;return`<option value="${esc(location.toll_id)}" ${String(location.toll_id)===String(value)?'selected':''} ${rate?'':'disabled'}>${esc(label)}</option>`;}).join('');}
function conceptOptions(value){return`<option value="">Seleccionar concepto…</option>`+(W()?.items||[]).filter(x=>x.can_be_secondary).map(x=>`<option value="${esc(x.concept_id)}" ${String(x.concept_id)===String(value)?'selected':''}>${esc(x.name||x.service_name||'Concepto')}</option>`).join('');}
function commercial(){return O()?.commercialState?.()||{toll_coverage_mode:'',tolls:[],excess_charges:[]};}
function readOnly(){return W()?.mode==='view';}
function fixedPayer(mode){return mode==='customer_roundtrip'?'customer':mode==='provider_roundtrip'?'provider':'';}
function coverageLabel(mode){return COVERAGE.find(([value])=>value===mode)?.[1]||'Sin definir';}
function remitoCard(){const w=W(),s=O()?.service?.(w?.serviceId);if(!w?.serviceId||!s?.remito_id)return'';const signed=O()?.hasSignedRemito?.(s),label=DOCUMENT_LABELS[s.document_status]||'Remito vinculado',tolls=Math.max(0,num(s.remito_toll_count)),excesses=Math.max(0,num(s.remito_excess_count)),evidence=Math.max(0,num(s.remito_evidence_count)),total=num(s.remito_toll_total)+num(s.remito_excess_total);return`<section class="osca-remito-card ${signed?'signed':'draft'}"><div class="osca-remito-card-head"><div><span>Documento del chofer</span><b>${esc(label)}${s.remito_number?` · ${esc(s.remito_number)}`:''}</b></div><em>${signed?'Firmado':'Pendiente'}</em></div><div class="osca-remito-facts"><span><b>${tolls}</b> peaje${tolls===1?'':'s'}</span><span><b>${excesses}</b> excedente${excesses===1?'':'s'}</span><span><b>${evidence}</b> evidencia${evidence===1?'':'s'}</span><span><b>${money(total)}</b> informado</span></div>${signed?'<button type="button" data-ca="open-remito">Ver remito firmado</button>':'<small>El chofer todavía no firmó el documento.</small>'}</section>`;}
function payerControl(row,index,mode,disabled){const fixed=fixedPayer(mode);if(fixed)return`<select data-ca-field="payer_agent" data-index="${index}" disabled><option selected>${fixed==='customer'?'Cliente':'Prestadora'}</option></select>`;return`<select data-ca-field="payer_agent" data-index="${index}" ${disabled?'disabled':''}>${optionRows(PAYERS,row.payer_agent)}</select>`;}
function paymentControl(row,index,disabled){if(row.payer_agent==='provider')return'<input value="N/A" disabled>';return`<select data-ca-field="customer_payment_method" data-index="${index}" ${disabled?'disabled':''}>${optionRows(PAYMENTS,row.customer_payment_method)}</select>`;}
function excessPaymentControl(row,index,disabled){if(row.collector_agent==='provider')return'<input value="N/A" disabled>';return`<select data-ca-excess-field="customer_payment_method" data-index="${index}" ${disabled?'disabled':''}>${optionRows(PAYMENTS,row.customer_payment_method)}</select>`;}
function renderTollRow(row,index,mode){const {rate}=rateFor(row.toll_id),qty=Math.max(1,Math.round(num(row.quantity)||1)),total=num(rate?.amount)*qty,disabled=readOnly();return`<div class="osca-matrix-row toll" data-index="${index}">
 <div data-label="Quién paga">${payerControl(row,index,mode,disabled)}</div>
 <div data-label="Peaje"><select data-ca-field="toll_id" data-index="${index}" ${disabled?'disabled':''}>${tollOptions(row.toll_id)}</select></div>
 <div data-label="Método de pago">${paymentControl(row,index,disabled)}</div>
 <div data-label="Cantidad"><input type="number" min="1" step="1" value="${qty}" data-ca-field="quantity" data-index="${index}" ${disabled?'disabled':''}></div>
 <div class="osca-total" data-label="Total"><b>${rate?money(total,rate.currency):'—'}</b></div>
 ${disabled?'':`<button type="button" class="osca-remove" data-ca="remove-toll" data-index="${index}" aria-label="Quitar peaje">×</button>`}
 </div>`;}
function renderExcessRow(row,index){const qty=Math.max(.01,num(row.quantity)||1),unit=Math.max(0,num(row.unit_amount)),disabled=readOnly();return`<div class="osca-matrix-row excess" data-index="${index}">
 <div data-label="Concepto"><select data-ca-excess-field="concept_id" data-index="${index}" ${disabled?'disabled':''}>${conceptOptions(row.concept_id)}</select></div>
 <div data-label="Cant."><input type="number" min="0.01" step="0.01" value="${qty}" data-ca-excess-field="quantity" data-index="${index}" ${disabled?'disabled':''}></div>
 <div data-label="Importe"><input type="number" min="0" step="0.01" value="${unit||''}" data-ca-excess-field="unit_amount" data-index="${index}" ${disabled?'disabled':''}></div>
 <div data-label="Cobrador"><select data-ca-excess-field="collector_agent" data-index="${index}" ${disabled?'disabled':''}>${optionRows(COLLECTORS,row.collector_agent)}</select></div>
 <div data-label="Medio Pago">${excessPaymentControl(row,index,disabled)}</div>
 ${disabled?'':`<button type="button" class="osca-remove" data-ca="remove-excess" data-index="${index}" aria-label="Quitar excedente">×</button>`}
 </div>`;}
function actualTolls(){const rows=W()?.data?.actual_tolls||[];if(!rows.length)return'';return`<div class="osca-actual"><b>Peajes reales informados</b>${rows.map(row=>`<span>${esc(row.toll_name||'Peaje')} · ${Math.max(1,num(row.quantity)||1)} × ${money(row.unit_amount,row.currency||'ARS')}</span>`).join('')}</div>`;}
function coverageList(c,disabled){return`<div class="osca-format-list" role="radiogroup" aria-label="Formato de cobro">${COVERAGE.map(([value,label])=>`<button type="button" role="radio" aria-checked="${String(c.toll_coverage_mode)===value}" data-ca="coverage" data-value="${value}" class="${String(c.toll_coverage_mode)===value?'active':''}" ${disabled?'disabled':''}><span class="osca-radio"></span><b>${esc(label)}</b></button>`).join('')}</div>`;}
function coverageControl(c,disabled){if(!c.toll_coverage_mode||state.coverageEditing)return coverageList(c,disabled);return`<div class="osca-format-selected"><div><span>Formato de cobro</span><b>${esc(coverageLabel(c.toll_coverage_mode))}</b></div>${disabled?'':`<button type="button" data-ca="change-coverage">Cambiar</button>`}</div>`;}
function tollMatrix(c){const mode=c.toll_coverage_mode,disabled=readOnly();if(!mode)return`<div class="osca-gate"><b>Elegí el formato de cobro</b><span>La matriz de peajes se habilita después de seleccionar una opción.</span></div>`;return`<div class="osca-matrix tolls">
 <div class="osca-matrix-head"><span>Quién paga</span><span>Peaje</span><span>Método de Pago</span><span>Cantidad</span><span>Total</span><span></span></div>
 <div class="osca-matrix-body">${c.tolls.length?c.tolls.map((row,index)=>renderTollRow(row,index,mode)).join(''):'<div class="osca-empty-row">Sin peajes cargados.</div>'}</div>
 ${disabled?'':`<button type="button" class="osca-add-row" data-ca="new-toll">＋ Agregar fila</button>`}
 </div>`;}
function excessMatrix(c){const disabled=readOnly();return`<div class="osca-matrix excess">
 <div class="osca-matrix-head"><span>Concepto</span><span>Cant.</span><span>Importe</span><span>Cobrador</span><span>Medio Pago</span><span></span></div>
 <div class="osca-matrix-body">${c.excess_charges.length?c.excess_charges.map(renderExcessRow).join(''):'<div class="osca-empty-row">Sin excedentes cargados.</div>'}</div>
 ${disabled?'':`<button type="button" class="osca-add-row" data-ca="new-excess">＋ Agregar fila</button>`}
 </div>`;}
function render(){const w=W(),column=document.querySelector('.osv4-reactive .actions-column');if(!w||!column)return;const c=commercial(),disabled=readOnly(),provider=O()?.commercialProviderTollTotal?.()||0,customer=O()?.commercialCustomerTollTotal?.()||0,excess=O()?.commercialCustomerExcessTotal?.()||0;column.innerHTML=`${remitoCard()}<div class="osca-actions"><button type="button" data-ca="toggle-tolls" class="${state.open==='tolls'?'active':''}">Peajes${c.tolls.length?` <em>${c.tolls.length}</em>`:''}</button><button type="button" data-ca="toggle-excess" class="${state.open==='excess'?'active':''}">Excedentes${c.excess_charges.length?` <em>${c.excess_charges.length}</em>`:''}</button></div>
 ${state.open==='tolls'?`<section class="osca-panel tolls"><div class="osca-title"><div><b>Formato de cobro</b><small>Definí primero quién puede quedar a cargo de los peajes.</small></div></div>${coverageControl(c,disabled)}${tollMatrix(c)}${actualTolls()}${c.tolls.length?`<div class="osca-summary"><span>A cargo de la Prestadora</span><b>${money(provider)}</b><span>A cargo del cliente</span><b>${money(customer)}</b></div>`:''}</section>`:''}
 ${state.open==='excess'?`<section class="osca-panel excess"><div class="osca-title"><div><b>Excedentes</b><small>Registrá concepto, cantidad, importe, quién lo cobró y cómo se cobró.</small></div></div>${excessMatrix(c)}${c.excess_charges.length?`<div class="osca-summary single"><span>Total excedentes</span><b>${money(excess)}</b></div>`:''}</section>`:''}`;}
function onClick(event){const button=event.target.closest?.('[data-ca]');if(!button)return;const action=button.dataset.ca;if(action==='open-remito')return window.AuxiliosRemitoReviewV2?.open?.(W()?.serviceId);if(action==='toggle-tolls'){state.open=state.open==='tolls'?null:'tolls';state.coverageEditing=false;return render();}if(action==='toggle-excess'){state.open=state.open==='excess'?null:'excess';return render();}if(action==='change-coverage'&&!readOnly()){state.coverageEditing=true;return render();}if(readOnly())return;if(action==='coverage'){state.coverageEditing=false;return O()?.setCommercialCoverage?.(button.dataset.value||'');}if(action==='new-toll')return O()?.addCommercialToll?.();if(action==='new-excess')return O()?.addCommercialExcess?.();if(action==='remove-toll')return O()?.removeCommercialToll?.(Number(button.dataset.index));if(action==='remove-excess')return O()?.removeCommercialExcess?.(Number(button.dataset.index));}
function onInput(event){if(readOnly())return;const target=event.target;if(target.dataset.caField==='quantity')O()?.updateCommercialToll?.(Number(target.dataset.index),target.dataset.caField,target.value,false);if(['quantity','unit_amount'].includes(target.dataset.caExcessField))O()?.updateCommercialExcess?.(Number(target.dataset.index),target.dataset.caExcessField,target.value,false);}
function onChange(event){if(readOnly())return;const target=event.target;if(target.dataset.caField!==undefined)return O()?.updateCommercialToll?.(Number(target.dataset.index),target.dataset.caField,target.value,true);if(target.dataset.caExcessField!==undefined)return O()?.updateCommercialExcess?.(Number(target.dataset.index),target.dataset.caExcessField,target.value,true);}
function bind(){if(state.bound)return;state.bound=true;document.addEventListener('click',onClick);document.addEventListener('input',onInput);document.addEventListener('change',onChange);}
function reset(){state.open=null;state.coverageEditing=false;}
bind();window.addEventListener('auxilios:service-workspace-opened',()=>{reset();render();});window.OperatorServiceCommercialAddonsV1={render,reset};setTimeout(render,0);
})();

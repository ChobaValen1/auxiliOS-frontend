/* AuxiliOS · Remito móvil canónico v3 */
(()=>{'use strict';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];

function moveToHidden(root,id){
  const node=document.getElementById(id);
  if(node)root.appendChild(node);
}

function customerStep(step){
  const customer=document.getElementById('rem-cliente');
  const documentId=document.getElementById('rem-cuit');
  const phone=document.getElementById('rem-telefono');
  step.innerHTML=`<section class="rmv-card"><header class="rmv-step-head"><span>Paso 1</span><h2>Datos del cliente</h2><p>Completá la información necesaria para la conformidad.</p></header><div class="rmv-fields"><label data-remito-field="customer_name"><span>Nombre y apellido *</span><div data-slot="customer"></div><small id="err-cliente" class="rem-error-msg">El nombre del cliente es obligatorio</small></label><label data-remito-field="customer_document"><span>DNI / CUIT <em data-mode-label></em></span><div data-slot="document"></div><small class="rmv-hint">De 7 a 11 números.</small><small id="err-documento" class="rem-error-msg">El DNI / CUIT es obligatorio</small></label><label data-remito-field="customer_phone"><span>Teléfono <em data-mode-label></em></span><div data-slot="phone"></div><small id="err-telefono" class="rem-error-msg">El teléfono es obligatorio</small></label></div></section>`;
  const attach=(node,slot)=>{if(!node)return;node.classList.add('rmv-input');$(slot,step)?.appendChild(node)};
  attach(customer,'[data-slot="customer"]');
  attach(documentId,'[data-slot="document"]');
  attach(phone,'[data-slot="phone"]');
  void applyCompanyFieldModes(step);
}

function normalizedMode(config,key){const mode=config?.field_modes?.[key];return ['required','optional','hidden'].includes(mode)?mode:'optional'}
function renderFieldModes(step,config){
  ['customer_document','customer_phone'].forEach(key=>{const mode=normalizedMode(config,key),row=$(`[data-remito-field="${key}"]`,step),input=key==='customer_document'?$('#rem-cuit'):$('#rem-telefono');if(!row)return;row.hidden=mode==='hidden';row.dataset.mode=mode;if(input){input.required=mode==='required';input.disabled=mode==='hidden';input.setAttribute('aria-required',mode==='required'?'true':'false')}const label=$('[data-mode-label]',row);if(label)label.textContent=mode==='required'?'obligatorio':'opcional'});
}
async function applyCompanyFieldModes(step=document.getElementById('rem-step-1')){if(!step)return;const module=window.AuxiliosServiceModuleConfiguration;renderFieldModes(step,module?.get?.()||null);try{if(window._db){const {data,error}=await _db.rpc('get_driver_remito_capabilities_v2');if(error)throw error;renderFieldModes(step,{field_modes:data?.field_modes||{}})}else if(module?.load)renderFieldModes(step,await module.load())}catch(error){console.warn('[Remito móvil] No se pudo cargar la configuración de campos:',error?.message||error)}}
function validateCustomerFields(){let ok=true;for(const [key,id,errorId] of [['customer_document','rem-cuit','err-documento'],['customer_phone','rem-telefono','err-telefono']]){const row=document.querySelector(`[data-remito-field="${key}"]`),input=document.getElementById(id),error=document.getElementById(errorId),missing=row?.dataset.mode==='required'&&!String(input?.value||'').trim();input?.classList.toggle('rem-field-error',missing);error?.classList.toggle('visible',missing);if(missing)ok=false}return ok}

function evidenceStep(step){
  step.innerHTML=`<section class="rmv-card"><header class="rmv-step-head"><span>Paso 3</span><h2>Evidencia</h2><p>Adjuntá fotografías sólo si corresponde.</p></header><div id="rem-evidence-list" class="rmv-evidence-list"><div class="rmv-evidence-empty">Todavía no agregaste evidencia.</div></div><button id="rem-add-evidence" class="rmv-add" type="button">＋ Agregar evidencia</button><small class="rmv-hint">La evidencia es opcional.</small><div id="foto-grid" class="rmv-hidden-files" aria-hidden="true">
    <label class="foto-slot" data-label="Vehículo"><input type="file" accept="image/*" capture="environment" onchange="procesarArchivoReal(this,'rem-foto1-status','rem-foto1-icon');AuxiliosRemitoMobileV3.syncEvidence()"><span id="rem-foto1-icon">📷</span><span id="rem-foto1-status">Vehículo</span></label>
    <label class="foto-slot" data-label="Odómetro"><input type="file" accept="image/*" capture="environment" onchange="procesarArchivoReal(this,'rem-foto2-status','rem-foto2-icon');AuxiliosRemitoMobileV3.syncEvidence()"><span id="rem-foto2-icon">🔢</span><span id="rem-foto2-status">Odómetro</span></label>
    <label class="foto-slot" data-label="Daño o incidente"><input type="file" accept="image/*" capture="environment" onchange="procesarArchivoReal(this,'rem-foto3-status','rem-foto3-icon');AuxiliosRemitoMobileV3.syncEvidence()"><span id="rem-foto3-icon">⚠</span><span id="rem-foto3-status">Daño o incidente</span></label>
    <label class="foto-slot" data-label="Otra evidencia"><input type="file" accept="image/*" capture="environment" onchange="procesarArchivoReal(this,'rem-foto4-status','rem-foto4-icon');AuxiliosRemitoMobileV3.syncEvidence()"><span id="rem-foto4-icon">＋</span><span id="rem-foto4-status">Otra evidencia</span></label>
  </div></section><div id="rem-evidence-sheet" class="rmv-sheet" hidden><button class="rmv-sheet-backdrop" type="button" aria-label="Cerrar"></button><section role="dialog" aria-modal="true" aria-labelledby="rem-evidence-title"><header><h3 id="rem-evidence-title">Tipo de evidencia</h3><button type="button" data-close aria-label="Cerrar">×</button></header><button type="button" data-evidence="0">📷 Vehículo</button><button type="button" data-evidence="1">🔢 Odómetro</button><button type="button" data-evidence="2">⚠ Daño o incidente</button><button type="button" data-evidence="3">＋ Otra evidencia</button></section></div>`;
  const sheet=$('#rem-evidence-sheet',step);
  const close=()=>{sheet.hidden=true;document.body.classList.remove('rmv-sheet-open')};
  $('#rem-add-evidence',step)?.addEventListener('click',()=>{sheet.hidden=false;document.body.classList.add('rmv-sheet-open')});
  $('[data-close]',sheet)?.addEventListener('click',close);
  $('.rmv-sheet-backdrop',sheet)?.addEventListener('click',close);
  $$('[data-evidence]',sheet).forEach(button=>button.addEventListener('click',()=>{const inputs=$$('#foto-grid input[type="file"]',step);inputs[Number(button.dataset.evidence)]?.click();close()}));
}

function signatureStep(step,source){
  while(source.firstChild)step.appendChild(source.firstChild);
  step.querySelector('.card-label')?.insertAdjacentHTML('beforebegin','<header class="rmv-step-head"><span>Paso 4</span><h2>Conformidad y firma</h2></header>');
  const conformityLabel=step.querySelector('.card-label');if(conformityLabel)conformityLabel.textContent='Conformidades';
  const cards=$$(':scope > .card',step),absent=$(':scope > .toggle-row',step),confirmZone=document.createElement('div'),signZone=document.createElement('div'),summary=document.createElement('div');
  confirmZone.className='rmv-confirm-zone';signZone.className='rmv-sign-zone';
  summary.id='rem-addon-signature-summary';summary.className='rem-addon-signature-summary';
  if(cards[0])confirmZone.appendChild(cards[0]);confirmZone.appendChild(summary);if(absent)confirmZone.appendChild(absent);if(cards[1])signZone.appendChild(cards[1]);
  step.append(confirmZone,signZone);
  step.classList.add('rmv-signature-step');
  window.AuxiliosRemitoAddonsV2?.renderSignatureSummary?.();
}

function transform(){
  const root=document.getElementById('remitos-nuevo');
  const step1=document.getElementById('rem-step-1'),step2=document.getElementById('rem-step-2'),step3=document.getElementById('rem-step-3'),step4=document.getElementById('rem-step-4'),step5=document.getElementById('rem-step-5');
  if(!root||!step1||!step2||!step3||!step4||!step5||root.dataset.mobileV3==='1')return false;
  root.dataset.mobileV3='1';
  const hidden=document.createElement('div');hidden.id='rem-service-fields-hidden';hidden.hidden=true;root.appendChild(hidden);
  ['rem-nro','rem-fecha','rem-tipo-servicio','rem-nro-prestadora','rem-patente','rem-marca-modelo','rem-origen','rem-destino','rem-km','rem-observaciones'].forEach(id=>moveToHidden(hidden,id));
  customerStep(step1);
  evidenceStep(step3);
  step4.innerHTML='';
  signatureStep(step4,step5);
  step5.remove();
  const dots=$$('.rem-step-dot',root);dots.slice(4).forEach(x=>x.remove());
  const counter=$('.rem-wizard-counter',root);if(counter)counter.innerHTML='<span id="rem-step-num">1</span> de 4';
  const title=$('.rem-wizard-title',root);if(title)title.textContent='/ COMPLETAR REMITO';
  root.classList.add('rmv-flow');
  return true;
}

function syncEvidence(){
  setTimeout(()=>{
    const host=document.getElementById('rem-evidence-list');if(!host)return;
    const rows=$$('#foto-grid .foto-slot').map((slot,index)=>{const input=$('input[type="file"]',slot),file=input?.files?.[0];if(!file)return'';const label=slot.dataset.label||`Evidencia ${index+1}`;return`<article><span>${index===1?'🔢':'📷'}</span><div><b>${label}</b><small>${file.name}</small></div><button type="button" data-remove-evidence="${index}" aria-label="Eliminar ${label}">×</button></article>`}).filter(Boolean);
    host.innerHTML=rows.join('')||'<div class="rmv-evidence-empty">Todavía no agregaste evidencia.</div>';
    $$('[data-remove-evidence]',host).forEach(button=>button.addEventListener('click',()=>{const input=$$('#foto-grid input[type="file"]')[Number(button.dataset.removeEvidence)];if(input){input.value='';const slot=input.closest('.foto-slot');slot?.classList.remove('loaded');slot?.querySelector('.img-preview')?.remove();syncEvidence()}}));
  },0);
}

function setAdHocMode(enabled){
  const step=document.getElementById('rem-step-1'),hidden=document.getElementById('rem-service-fields-hidden');if(!step||!hidden)return;
  const adHoc=document.getElementById('rmv-ad-hoc-service');
  if(!enabled){['rem-tipo-servicio','rem-nro-prestadora','rem-patente','rem-marca-modelo','rem-origen','rem-destino'].forEach(id=>moveToHidden(hidden,id));adHoc?.remove();return}
  adHoc?.remove();
  const section=document.createElement('section');section.id='rmv-ad-hoc-service';section.className='rmv-card rmv-ad-hoc-card';section.innerHTML=`<header class="rmv-step-head"><span>Sin asignación</span><h2>Datos del servicio</h2><p>Este ingreso quedará pendiente de vinculación por Operaciones.</p></header><div class="rmv-fields"><label><span>N.º prestación</span><div data-ad-hoc="order"></div></label><label><span>Tipo de servicio</span><div data-ad-hoc="type"></div></label><label><span>Patente *</span><div data-ad-hoc="plate"></div></label><label><span>Marca y modelo</span><div data-ad-hoc="vehicle"></div></label><label><span>Origen *</span><div data-ad-hoc="origin"></div></label><label><span>Destino *</span><div data-ad-hoc="destination"></div></label></div></section>`;
  step.prepend(section);
  const attach=(id,slot)=>{const node=document.getElementById(id);if(node){node.classList.add('rmv-input');$(`[data-ad-hoc="${slot}"]`,section)?.appendChild(node)}};
  attach('rem-nro-prestadora','order');attach('rem-tipo-servicio','type');attach('rem-patente','plate');attach('rem-marca-modelo','vehicle');attach('rem-origen','origin');attach('rem-destino','destination');
}

window.AuxiliosRemitoMobileV3={transform,syncEvidence,setAdHocMode,applyCompanyFieldModes,validateCustomerFields};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',transform,{once:true});else transform();
})();

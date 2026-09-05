/* AuxiliOS · Remito móvil canónico v3 */
(()=>{'use strict';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
let signedEditMode=false,adHocMode=false;

function moveToHidden(root,id){
  const node=document.getElementById(id);
  if(node)root.appendChild(node);
}

function customerStep(step){
  const customer=document.getElementById('rem-cliente');
  const documentId=document.getElementById('rem-cuit');
  const phone=document.getElementById('rem-telefono');
  step.dataset.remitoCustomerStep='1';
  step.innerHTML=`<section class="rmv-card"><header class="rmv-step-head"><span>Paso 1</span><h2>Datos del socio</h2><p>Completá la información necesaria para la conformidad.</p></header><div class="rmv-fields"><label data-remito-field="customer_name"><span>Nombre y apellido *</span><div data-slot="customer"></div><small id="err-cliente" class="rem-error-msg">El nombre del socio es obligatorio</small></label><label data-remito-field="customer_document"><span>DNI / CUIT <em data-mode-label></em></span><div data-slot="document"></div><small class="rmv-hint">De 7 a 11 números.</small><small id="err-documento" class="rem-error-msg">El DNI / CUIT es obligatorio</small></label><label data-remito-field="customer_phone"><span>Teléfono <em data-mode-label></em></span><div data-slot="phone"></div><small id="err-telefono" class="rem-error-msg">El teléfono es obligatorio</small></label></div></section>`;
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
async function applyCompanyFieldModes(step=document.querySelector('[data-remito-customer-step="1"]')){if(!step)return;const module=window.AuxiliosServiceModuleConfiguration;renderFieldModes(step,module?.get?.()||null);try{if(window._db){const {data,error}=await _db.rpc('get_driver_remito_capabilities_v2');if(error)throw error;renderFieldModes(step,{field_modes:data?.field_modes||{}})}else if(module?.load)renderFieldModes(step,await module.load())}catch(error){console.warn('[Remito móvil] No se pudo cargar la configuración de campos:',error?.message||error)}}
function validateCustomerFields(){let ok=true;for(const [key,id,errorId] of [['customer_document','rem-cuit','err-documento'],['customer_phone','rem-telefono','err-telefono']]){const row=document.querySelector(`[data-remito-field="${key}"]`),input=document.getElementById(id),error=document.getElementById(errorId),missing=row?.dataset.mode==='required'&&!String(input?.value||'').trim();input?.classList.toggle('rem-field-error',missing);error?.classList.toggle('visible',missing);if(missing)ok=false}return ok}

function evidenceStep(step){
  step.dataset.remitoEvidenceStep='1';
  step.innerHTML=`<section class="rmv-card"><header class="rmv-step-head"><span>Paso 3</span><h2>Evidencia y observaciones</h2><p>Adjuntá fotografías sólo si corresponde.</p></header><div id="rem-evidence-list" class="rmv-evidence-list"><div class="rmv-evidence-empty">Todavía no agregaste evidencia.</div></div><button id="rem-add-evidence" class="rmv-add" type="button">＋ Agregar evidencia</button><small class="rmv-hint">La evidencia es opcional.</small><div id="foto-grid" class="rmv-hidden-files" aria-hidden="true">
    <label class="foto-slot" data-label="Vehículo"><input type="file" accept="image/*" capture="environment" onchange="procesarArchivoReal(this,'rem-foto1-status','rem-foto1-icon');AuxiliosRemitoMobileV3.syncEvidence()"><span id="rem-foto1-icon">📷</span><span id="rem-foto1-status">Vehículo</span></label>
    <label class="foto-slot" data-label="Odómetro"><input type="file" accept="image/*" capture="environment" onchange="procesarArchivoReal(this,'rem-foto2-status','rem-foto2-icon');AuxiliosRemitoMobileV3.syncEvidence()"><span id="rem-foto2-icon">🔢</span><span id="rem-foto2-status">Odómetro</span></label>
    <label class="foto-slot" data-label="Daño o incidente"><input type="file" accept="image/*" capture="environment" onchange="procesarArchivoReal(this,'rem-foto3-status','rem-foto3-icon');AuxiliosRemitoMobileV3.syncEvidence()"><span id="rem-foto3-icon">⚠</span><span id="rem-foto3-status">Daño o incidente</span></label>
    <label class="foto-slot" data-label="Otra evidencia"><input type="file" accept="image/*" capture="environment" onchange="procesarArchivoReal(this,'rem-foto4-status','rem-foto4-icon');AuxiliosRemitoMobileV3.syncEvidence()"><span id="rem-foto4-icon">＋</span><span id="rem-foto4-status">Otra evidencia</span></label>
  </div></section><section id="rmv-remito-notes" class="rmv-card rmv-notes-card"><label class="rmv-notes-label"><span>Observaciones</span><div data-observations-slot></div></label></section><div id="rem-evidence-sheet" class="rmv-sheet" hidden><button class="rmv-sheet-backdrop" type="button" aria-label="Cerrar"></button><section role="dialog" aria-modal="true" aria-labelledby="rem-evidence-title"><header><h3 id="rem-evidence-title">Tipo de evidencia</h3><button type="button" data-close aria-label="Cerrar">×</button></header><button type="button" data-evidence="0">📷 Vehículo</button><button type="button" data-evidence="1">🔢 Odómetro</button><button type="button" data-evidence="2">⚠ Daño o incidente</button><button type="button" data-evidence="3">＋ Otra evidencia</button></section></div>`;
  const observations=document.getElementById('rem-observaciones');
  if(observations){observations.classList.add('rmv-input');$('[data-observations-slot]',step)?.appendChild(observations)}
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
  const cards=$$(':scope > .card',step),absent=$(':scope > .toggle-row',step),confirmZone=document.createElement('div'),signZone=document.createElement('div');
  confirmZone.className='rmv-confirm-zone';signZone.className='rmv-sign-zone';
  if(cards[0])confirmZone.appendChild(cards[0]);if(absent)confirmZone.appendChild(absent);if(cards[1])signZone.appendChild(cards[1]);
  step.append(confirmZone,signZone);
  step.classList.add('rmv-signature-step');
  step.dataset.remitoSignatureStep='1';
}

function reindexPanels(panels,start){
  panels.forEach((panel,index)=>{panel.id=`rem-step-staging-${index}`});
  panels.forEach((panel,index)=>{panel.id=`rem-step-${start+index}`});
}

function serviceStepMarkup(){
  return`<section class="rmv-card rmv-ad-hoc-card"><header class="rmv-step-head"><span>Paso 1</span><h2>Datos del servicio</h2><p>Este ingreso quedará pendiente de vinculación por Operaciones.</p></header><div class="rmv-fields"><label><span>N.º prestación</span><div data-ad-hoc="order"></div></label><label><span>Tipo de servicio *</span><div data-ad-hoc="type"></div><small id="err-tipo" class="rem-error-msg">Seleccioná el tipo de servicio</small></label><label><span>Patente *</span><div data-ad-hoc="plate"></div><small id="err-patente" class="rem-error-msg">Ingresá la patente</small></label><label><span>Marca y modelo</span><div data-ad-hoc="vehicle"></div></label><label><span>Origen *</span><div data-ad-hoc="origin"></div><small id="err-origen" class="rem-error-msg">Ingresá el origen</small></label><label><span>Destino *</span><div data-ad-hoc="destination"></div><small id="err-destino" class="rem-error-msg">Ingresá el destino</small></label><label><span>Kilómetros recorridos</span><div data-ad-hoc="km"></div></label></div></section>`;
}

function updateStepCopy(){
  const customer=document.querySelector('[data-remito-customer-step="1"]'),evidence=document.querySelector('[data-remito-evidence-step="1"]'),signature=document.querySelector('[data-remito-signature-step="1"]');
  const setHeader=(panel,number,title)=>{const head=panel?.querySelector('.rmv-step-head');if(!head)return;const numberNode=head.querySelector('span'),titleNode=head.querySelector('h2');if(numberNode)numberNode.textContent=`Paso ${number}`;if(titleNode)titleNode.textContent=title};
  setHeader(customer,adHocMode?2:1,'Datos del socio');
  setHeader(evidence,adHocMode?4:3,'Evidencia y observaciones');
  setHeader(signature,adHocMode?5:4,adHocMode?'Confirmaciones y firma':'Conformidad y firma');
  const addonsHead=document.querySelector('#rem-addons-step-head > span');if(addonsHead)addonsHead.textContent=`Paso ${adHocMode?3:2}`;
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
  const dots=$$('.rem-step-dot',root);dots.forEach((dot,index)=>{dot.style.display=index<4?'':'none'});
  const counter=$('.rem-wizard-counter',root);if(counter)counter.innerHTML='<span id="rem-step-num">1</span> de 4';
  const title=$('.rem-wizard-title',root);if(title)title.textContent='/ COMPLETAR REMITO';
  root.classList.add('rmv-flow');
  updateStepCopy();
  return true;
}

function syncEvidence(){
  setTimeout(()=>{
    const host=document.getElementById('rem-evidence-list');if(!host)return;
    const saved=window.AuxiliosRemitoAddonsV2?.getPersistedEvidence?.()||[];
    const savedRows=saved.map(item=>`<article class="rmv-evidence-saved"><span>📎</span><div><b>${item.evidence_kind==='odometer'?'Odómetro':item.evidence_kind==='vehicle_front'?'Vehículo':'Evidencia'}</b><small>${item.original_name||'Archivo guardado'}</small></div><button type="button" data-remove-saved-evidence="${item.client_evidence_id}" aria-label="Eliminar evidencia guardada">×</button></article>`);
    const rows=[...savedRows,...$$('#foto-grid .foto-slot').map((slot,index)=>{const input=$('input[type="file"]',slot),file=input?.files?.[0];if(!file)return'';const label=slot.dataset.label||`Evidencia ${index+1}`;return`<article><span>${index===1?'🔢':'📷'}</span><div><b>${label}</b><small>${file.name}</small></div><button type="button" data-remove-evidence="${index}" aria-label="Eliminar ${label}">×</button></article>`}).filter(Boolean)];
    host.innerHTML=rows.join('')||'<div class="rmv-evidence-empty">Todavía no agregaste evidencia.</div>';
    $$('[data-remove-evidence]',host).forEach(button=>button.addEventListener('click',()=>{const input=$$('#foto-grid input[type="file"]')[Number(button.dataset.removeEvidence)];if(input){input.value='';const slot=input.closest('.foto-slot');slot?.classList.remove('loaded');slot?.querySelector('.img-preview')?.remove();syncEvidence()}}));
    $$('[data-remove-saved-evidence]',host).forEach(button=>button.addEventListener('click',()=>window.AuxiliosRemitoAddonsV2?.removePersistedEvidence?.(button.dataset.removeSavedEvidence)));
  },0);
}

function setSignedEditMode(enabled,data=null){
  signedEditMode=!!enabled;const root=document.getElementById('remitos-nuevo'),observations=document.getElementById('rem-observaciones');
  root?.classList.toggle('rmv-signed-edit',signedEditMode);document.getElementById('rmv-signed-edit-banner')?.remove();document.getElementById('rmv-signed-edit-notes')?.remove();
  if(!signedEditMode)return;
  const banner=document.createElement('section');banner.id='rmv-signed-edit-banner';banner.className='rmv-card rmv-edit-banner';banner.innerHTML='<b>Editar remito firmado</b><small>Podés corregir peajes, excedentes, observaciones y evidencia. La firma y los datos del socio permanecen bloqueados.</small>';
  document.getElementById('rem-step-2')?.prepend(banner);
  if(observations)observations.value=data?.remito?.observations||'';
  syncEvidence();
}
function isSignedEditMode(){return signedEditMode}

function setAdHocMode(enabled){
  const root=document.getElementById('remitos-nuevo'),hidden=document.getElementById('rem-service-fields-hidden');if(!root||!hidden)return;
  const next=!!enabled;
  if(next&&!adHocMode){
    const panels=[1,2,3,4].map(index=>document.getElementById(`rem-step-${index}`));if(panels.some(panel=>!panel))return;
    reindexPanels(panels,2);
    const service=document.createElement('div');service.id='rem-step-1';service.className='rem-step-panel';service.dataset.remitoServiceStep='1';service.innerHTML=serviceStepMarkup();panels[0].before(service);
    const attach=(id,slot)=>{const node=document.getElementById(id);if(node){node.classList.add('rmv-input');$(`[data-ad-hoc="${slot}"]`,service)?.appendChild(node)}};
    attach('rem-nro-prestadora','order');attach('rem-tipo-servicio','type');attach('rem-patente','plate');attach('rem-marca-modelo','vehicle');attach('rem-origen','origin');attach('rem-destino','destination');attach('rem-km','km');
  }else if(!next&&adHocMode){
    ['rem-tipo-servicio','rem-nro-prestadora','rem-patente','rem-marca-modelo','rem-origen','rem-destino','rem-km'].forEach(id=>moveToHidden(hidden,id));
    document.querySelector('[data-remito-service-step="1"]')?.remove();
    const panels=[2,3,4,5].map(index=>document.getElementById(`rem-step-${index}`)).filter(Boolean);if(panels.length===4)reindexPanels(panels,1);
  }
  adHocMode=next;
  root.classList.toggle('rmv-ad-hoc-flow',adHocMode);
  updateStepCopy();
  window.remWizardActualizarFlujo?.();
}

function isAdHocMode(){return adHocMode}

window.AuxiliosRemitoMobileV3={transform,syncEvidence,setAdHocMode,isAdHocMode,setSignedEditMode,isSignedEditMode,applyCompanyFieldModes,validateCustomerFields};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',transform,{once:true});else transform();
})();

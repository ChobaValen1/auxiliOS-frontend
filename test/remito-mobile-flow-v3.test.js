const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=file=>fs.readFileSync(file,'utf8');

test('el remito asignado conserva cuatro pasos y no repite datos del servicio',()=>{
  const flow=read('remito-mobile-flow-v3.js'),sigma=read('sigma.js');
  assert.match(sigma,/const REM_TOTAL_PASOS = 4/);
  assert.match(sigma,/const REM_TOTAL_PASOS_SIN_ASIGNACION = 5/);
  assert.match(flow,/Datos del socio/);
  assert.match(flow,/Adjuntá fotografías sólo si corresponde/);
  assert.match(flow,/Conformidad y firma/);
  assert.match(flow,/step5\.remove\(\)/);
  assert.match(flow,/rem-service-fields-hidden/);
});

test('la evidencia es opcional y usa un panel móvil por categoría',()=>{
  const flow=read('remito-mobile-flow-v3.js'),css=read('remito-mobile-flow-v3.css');
  for(const label of ['Vehículo','Odómetro','Daño o incidente','Otra evidencia'])assert.match(flow,new RegExp(label));
  assert.match(flow,/La evidencia es opcional/);
  assert.match(flow,/role="dialog" aria-modal="true"/);
  assert.match(css,/\.rmv-sheet/);
});

test('evidencia y observaciones permanecen juntas y persisten en ambos flujos',()=>{
  const flow=read('remito-mobile-flow-v3.js'),sigma=read('sigma.js');
  assert.match(flow,/Evidencia y observaciones/);
  assert.match(flow,/data-observations-slot/);
  assert.match(flow,/appendChild\(observations\)/);
  assert.doesNotMatch(flow,/if\(!signedEditMode\)\{if\(observations&&hidden\)hidden\.appendChild\(observations\)/);
  assert.match(sigma,/observaciones:\s+observaciones/);
});

test('peajes es el paso 2 asignado y se desplaza al paso 3 sin asignación',()=>{
  const flow=read('remito-mobile-flow-v3.js'),addons=read('remito-addons-v2.js'),sigma=read('sigma.js');
  assert.match(addons,/const step=\$\('#rem-step-2'\)/);
  assert.match(addons,/id="rem-addons-step-head"[^>]*><span>Paso 2<\/span><h2>Peajes y excedentes<\/h2>/);
  assert.match(flow,/addonsHead\.textContent=`Paso \$\{adHocMode\?3:2\}`/);
  assert.match(flow,/<span>Paso 3<\/span><h2>Evidencia/);
  assert.match(flow,/evidenceStep\(step3\)/);
  assert.match(sigma,/const _remWizardPasoCargos = \(\) => _remWizardEsAdHoc\(\) \? 3 : 2/);
  assert.match(sigma,/if \(paso === _remWizardPasoCargos\(\)\)/);
});

test('el ingreso sin asignación usa cinco pasos independientes y validaciones propias',()=>{
  const flow=read('remito-mobile-flow-v3.js'),bridge=read('operator-service-bridge.js'),sigma=read('sigma.js');
  assert.match(flow,/function setAdHocMode/);
  assert.match(flow,/function reindexPanels/);
  assert.match(flow,/reindexPanels\(panels,2\)/);
  assert.match(flow,/reindexPanels\(panels,1\)/);
  assert.match(flow,/Este ingreso quedará pendiente de vinculación y clasificación por Operaciones/);
  for(const slot of ['order','plate','vehicle','origin','destination','km'])assert.match(flow,new RegExp(`data-ad-hoc="${slot}"`));
  assert.doesNotMatch(flow,/data-ad-hoc="type"/);
  assert.match(flow,/setHeader\(customer,adHocMode\?2:1,'Datos del socio'\)/);
  assert.match(flow,/setHeader\(evidence,adHocMode\?4:3,'Evidencia y observaciones'\)/);
  assert.match(flow,/adHocMode\?'Confirmaciones y firma':'Conformidad y firma'/);
  assert.match(flow,/function isAdHocMode\(\)\{return adHocMode\}/);
  assert.match(sigma,/const _remWizardPasoCliente = \(\) => _remWizardEsAdHoc\(\) \? 2 : 1/);
  assert.match(sigma,/marcar\('rem-patente', 'err-patente'\)/);
  assert.match(sigma,/marcar\('rem-origen', 'err-origen'\)/);
  assert.match(sigma,/marcar\('rem-destino', 'err-destino'\)/);
  assert.match(bridge,/setAdHocMode\?\.\(true\)/);
  assert.match(bridge,/setAdHocMode\?\.\(false\)/);
  assert.match(bridge,/setAdHocMode\?\.\(true\);window\.remWizardReset\?\.\(\)/);
  assert.match(bridge,/setAdHocMode\?\.\(false\);window\.remWizardReset\?\.\(\);prefillRemito/);
});

test('origen y destino sin asignación se validan con Google Maps y persisten su referencia',()=>{
  const flow=read('remito-mobile-flow-v3.js'),sigma=read('sigma.js'),supabase=read('supabase.js');
  assert.match(flow,/const db=\(\)=>typeof _db!==['"]undefined['"]\?_db:/);
  assert.doesNotMatch(flow,/if\(!window\._db\)throw new Error\('Maps no está disponible'\)/);
  assert.match(flow,/client\.functions\.invoke\('maps-proxy'/);
  assert.match(flow,/functions\.invoke\('maps-proxy'/);
  assert.match(flow,/action:'autocomplete'/);
  assert.match(flow,/action:'place'/);
  assert.match(flow,/action:'route'/);
  assert.match(flow,/routeMode:'origin_destination'/);
  assert.match(flow,/\.slice\(0,3\)/);
  assert.match(flow,/Math\.round\(meters\/1000\)/);
  assert.match(flow,/Kilómetros origen → destino/);
  assert.match(flow,/km\.readOnly=true/);
  assert.match(sigma,/kmRemito\.readOnly = true/);
  assert.match(flow,/sessionToken/);
  assert.match(flow,/Seleccioná una sugerencia de Google Maps/);
  assert.match(flow,/function validateMapLocations/);
  assert.match(flow,/origin_place_id/);
  assert.match(flow,/destination_place_id/);
  assert.match(flow,/if\(state\.timer\)clearTimeout\(state\.timer\);state\.timer=null;state\.seq\+=1/);
  assert.match(sigma,/getMapLocations/);
  assert.match(sigma,/restoreMapLocations/);
  assert.match(supabase,/save_driver_ad_hoc_remito_v3/);
});

test('ACTIVADO tiene RPC propia con ownership, auditoría y descarte seguro de borrador',()=>{
  const sql=read('migrations/20260829150000_driver_remito_actions_reliability_v1.sql');
  assert.match(sql,/v_role <> 'chofer'/);
  assert.match(sql,/assigned_driver_id is distinct from v_uid/);
  assert.match(sql,/s\.status <> 'assigned'/);
  assert.match(sql,/r\.status <> 'pendiente' or r\.firma_imagen_url is not null or r\.firmado_at is not null/);
  assert.match(sql,/set status = 'anulado'/);
  assert.match(sql,/'draft_remito_voided',v_draft_voided/);
  assert.match(sql,/billing_status = 'not_ready'/);
  assert.match(sql,/revoke all on function public\.mark_driver_operator_service_activated_v1\(uuid\) from public,anon,authenticated/);
});

test('FINALIZAR, ACTIVADO y guardar pendiente bloquean dobles envíos',()=>{
  const sigma=read('sigma.js'),bridge=read('operator-service-bridge.js');
  assert.match(sigma,/_finalizacionRemitoEnCurso/);
  assert.match(sigma,/_guardandoRemitoPendiente/);
  assert.match(sigma,/btnPendiente\.disabled = true/);
  assert.match(sigma,/telefono:\s+telefono \|\| null/);
  assert.match(bridge,/activationInFlight/);
  assert.match(bridge,/mark_driver_operator_service_activated_v2/);
});

test('ACTIVADO exige uno de cuatro motivos cerrados y lo persiste mediante RPC v2',()=>{
  const bridge=read('operator-service-bridge.js'),lifecycle=read('operator-service-lifecycle.js');
  const sql=read('migrations/20260829220500_driver_activation_reasons_v4.sql');
  for(const code of ['absent_or_not_towable','provider','us','other'])assert.match(bridge,new RegExp(`'${code}'`));
  for(const oldCode of ['created_without_assignment','client_or_provider','cancelled_by_us'])assert.doesNotMatch(bridge,new RegExp(`'${oldCode}'`));
  assert.match(bridge,/Cancelado por socio ausente \/ vehículo no apto/);
  assert.match(bridge,/Cancelado por Prestadora/);
  assert.doesNotMatch(lifecycle,/within_authorized_window/);
  assert.match(bridge,/Seleccioná el motivo de cancelación/);
  assert.match(bridge,/data-reason-code/);
  assert.match(bridge,/dataset\?\.reasonCode/);
  assert.doesNotMatch(bridge,/p3-activation-detail|Especificá el motivo|reasonCode==='other'&&!reasonDetail/);
  assert.match(sql,/'absent_or_not_towable'/);
  assert.match(sql,/'provider'/);
  assert.doesNotMatch(sql,/'created_without_assignment'|'client'/);
  assert.match(sql,/cancellation_reason_code = v_reason_code/);
  assert.match(sql,/cancellation_reason_detail = null/);
  assert.match(sql,/revoke all on function public\.mark_driver_operator_service_activated_v2\(uuid,text,text\) from public,anon,authenticated/);
  const constraint=read('supabase/migrations/20260904203000_driver_activation_reason_constraint_v1.sql');
  for(const code of ['absent_or_not_towable','provider','us','other'])assert.match(constraint,new RegExp(`'${code}'`));
  assert.match(constraint,/validate constraint operator_services_cancellation_reason_code_check/);
});

test('Operaciones actualiza automáticamente los borradores visibles',()=>{
  const services=read('operator-services.js');
  assert.match(services,/list_operator_service_document_connections_v2/);
  assert.match(services,/document\.visibilityState==='visible'.*loadServices\(\)/s);
  assert.match(services,/},30000\)/);
});

test('guardar y seguir después restaura todos los datos del socio',()=>{
  const sigma=read('sigma.js'),bridge=read('operator-service-bridge.js');
  assert.match(sigma,/razon_social:\s*cliente \|\| null/);
  assert.match(sigma,/cuit:\s+cuit\s+\|\| null,\s*\n\s*telefono:\s+telefono \|\| null,/);
  assert.match(sigma,/set\('rem-cliente',\s*r\.cliente\)/);
  assert.match(sigma,/set\('rem-cuit',\s*r\.cuit\)/);
  assert.match(sigma,/set\('rem-telefono',\s*r\.telefono\)/);
  assert.match(sigma,/dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
  const save=sigma.slice(sigma.indexOf('async function guardarRemitoPendiente()'),sigma.indexOf('function completarRemitoPendiente'));
  assert.doesNotMatch(save,/await window\.actualizarServiciosAsignados\?\.\(\)/);
  assert.match(save,/_mostrarBorradorEnServiciosActivos\(\)/);
  assert.match(bridge,/if\(!s\?\.service_id\)return false/);
  assert.doesNotMatch(bridge,/if\(!s\?\.remito_id\|\|s\.remito_status!==['"]pendiente['"]\)return false/);
});

test('la firma usa eventos de puntero con captura y fallback táctil no pasivo',()=>{
  const sigma=read('sigma.js');
  assert.match(sigma,/if \(window\.PointerEvent\)/);
  assert.match(sigma,/setPointerCapture/);
  assert.match(sigma,/pointerdown/);
  assert.match(sigma,/pointermove/);
  assert.match(sigma,/pointercancel/);
  assert.match(sigma,/\{ passive: false \}/);
  assert.match(sigma,/startDraw\(e, canvas, ctx\)/);
});

test('el canvas principal firma con su propio contexto aunque se inicialice el canvas secundario',()=>{
  const sigma=read('sigma.js');
  const start=sigma.indexOf('function initCanvas(canvasId)');
  const end=sigma.indexOf('function limpiarFirma()');
  assert.ok(start>=0&&end>start);

  const makeContext=()=>({
    beginPathCalls:0,moveToCalls:0,lineToCalls:0,strokeCalls:0,
    beginPath(){this.beginPathCalls++},moveTo(){this.moveToCalls++},
    lineTo(){this.lineToCalls++},stroke(){this.strokeCalls++}
  });
  const mainCtx=makeContext(),secondaryCtx=makeContext();
  const makeCanvas=(id,ctx)=>({
    id,style:{},width:0,height:0,parentElement:{offsetWidth:300},listeners:new Map(),
    getBoundingClientRect(){return {left:0,top:0,width:300,height:160}},
    getContext(){return ctx},addEventListener(type,handler){this.listeners.set(type,handler)},
    removeEventListener(type){this.listeners.delete(type)},setPointerCapture(){},
    hasPointerCapture(){return false}
  });
  const main=makeCanvas('sig-canvas',mainCtx),secondary=makeCanvas('sig-canvas-firma',secondaryCtx);
  const elements={
    'sig-canvas':main,'sig-canvas-firma':secondary,'sig-placeholder':{style:{}},
    'sig-status-dot':{style:{}},'sig-status-txt':{style:{},textContent:''},
    'sig-status-firma':{style:{},textContent:''}
  };
  const context={
    window:{PointerEvent:function PointerEvent(){}},
    document:{getElementById:id=>elements[id]||null}
  };
  vm.runInNewContext(
    `let activeCanvas=null,activeCtx=null,hasSig=false,drawing=false;${sigma.slice(start,end)};this.signatureApi={initCanvas};`,
    context
  );
  context.signatureApi.initCanvas('sig-canvas');
  context.signatureApi.initCanvas('sig-canvas-firma');

  const event={clientX:20,clientY:30,pointerId:1,cancelable:true,preventDefault(){}};
  main.listeners.get('pointerdown')(event);
  main.listeners.get('pointermove')({...event,clientX:60,clientY:70});
  main.listeners.get('pointerup')(event);

  assert.equal(mainCtx.strokeCalls,1);
  assert.equal(secondaryCtx.strokeCalls,0);
  assert.equal(elements['sig-status-txt'].textContent,'✓ Firma registrada');
  assert.equal(elements['sig-placeholder'].style.display,'none');
});

test('FINALIZAR limpia el formulario sólo después de confirmar el guardado',()=>{
  const sigma=read('sigma.js');
  const supabase=read('supabase.js');
  const bridge=read('operator-service-bridge.js');
  const start=sigma.indexOf('async function _finalizarRemitoInner()');
  const end=sigma.indexOf('// ── CÁLCULO DE TOTAL',start);
  const body=sigma.slice(start,end);
  assert.ok(body.indexOf('const ok = await guardarRemitoCompleto')<body.indexOf('resetPagoForm()'));
  assert.match(body,/if \(!ok\) return false;\s*resetPagoForm\(\);\s*return true;/);
  assert.doesNotMatch(body,/tbodyRemitos\.insertBefore|tbodyViajes\.appendChild|tbodyHistorial\.insertBefore/);
  assert.match(bridge,/window\.confirm\(message\)/);
  assert.match(supabase,/Error inesperado al guardar: '\s*\+\s*\(err\?\.message \|\| err\)/);
});

test('FINALIZAR usa los datos del servicio asignado si el campo operativo oculto no está hidratado',()=>{
  const sigma=read('sigma.js');
  const bridge=read('operator-service-bridge.js');
  const start=sigma.indexOf('async function _finalizarRemitoInner()');
  const end=sigma.indexOf('// ── CÁLCULO DE TOTAL',start);
  const body=sigma.slice(start,end);
  assert.match(bridge,/obtenerServicioAsignadoRemito:\(\)=>findService\(sessionStorage\.getItem\('auxilios_phase3_service_id'\)\)/);
  assert.match(body,/servicioAsignado\?\.vehicle_plate/);
  assert.match(body,/servicioAsignado\?\.origin/);
  assert.match(body,/servicioAsignado\?\.destination/);
  assert.match(body,/\['rem-patente',patente\]/);
});

test('el borrador vinculado restaura DNI/CUIT y peajes o excedentes por RPC privada',()=>{
  const bridge=read('operator-service-bridge.js'),addons=read('remito-addons-v2.js');
  const sql=read('migrations/20260829200000_driver_remito_draft_restore_v1.sql');
  assert.match(bridge,/get_driver_operator_service_remito_draft_v1/);
  assert.match(bridge,/setValue\('rem-cuit',data\.customer_document\)/);
  assert.match(bridge,/AuxiliosRemitoAddonsV2\?\.restore\?\.\(data\.addons\|\|null\)/);
  assert.match(addons,/async function restore\(report\)/);
  assert.match(sql,/assigned_driver_id is distinct from v_uid/);
  assert.match(sql,/'customer_document',r\.cuit/);
  assert.match(sql,/get_driver_remito_addons_v2\(r\.remito_id\)/);
  assert.match(sql,/revoke all on function public\.get_driver_operator_service_remito_draft_v1\(uuid\) from public,anon,authenticated/);
});

test('guardar pendiente conserva el detalle v2 y FINALIZAR valida sólo conformidades obligatorias',()=>{
  const sigma=read('sigma.js'),addons=read('remito-addons-v2.js');
  assert.match(sigma,/const addonBundle = window\.AuxiliosRemitoAddonsV2\?\.collect\?\.\(\) \|\| null/);
  assert.match(sigma,/AuxiliosRemitoAddonsV2\.uploadEvidence\(addonBundle, clientOperationId\)/);
  assert.match(sigma,/Object\.assign\(remitoDB, uploaded\)/);
  assert.match(sigma,/obRegistrarHandler\('remito_pendiente', async \(payload, blobs\)/);
  assert.match(sigma,/row\.id!==['"]row-arrastre['"]/);
  assert.match(sigma,/if\(!hasSig\)/);
  assert.match(addons,/state\.persistedEvidence=evidence/);
  assert.match(addons,/\{\.\.\.fresh,\.\.\.current,/);
});

test('el paso 4 conserva el diseño compacto anterior y prioriza una firma amplia en móvil',()=>{
  const flow=read('remito-mobile-flow-v3.js'),css=read('remito-mobile-flow-v3.css');
  assert.match(flow,/rmv-confirm-zone/);
  assert.match(flow,/rmv-sign-zone/);
  assert.doesNotMatch(flow,/rem-addon-signature-summary/);
  assert.doesNotMatch(flow,/renderSignatureSummary/);
  assert.match(flow,/insertAdjacentHTML\('beforebegin','<header class="rmv-step-head"/);
  assert.match(css,/grid-template-rows:auto minmax\(280px,1fr\)/);
  assert.match(css,/overflow:visible!important/);
  assert.match(css,/\.rmv-sign-zone\{display:flex;min-height:280px/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.rmv-confirm-zone \.toggle-title\{font-size:9px!important/);
  assert.match(css,/\.rmv-sign-zone #sig-canvas\{position:absolute;inset:0;width:100%!important;height:100%!important/);
  assert.match(css,/\.rmv-confirm-zone/);
});

test('el wizard muestra exclusivamente el paso activo',()=>{
  const css=read('remito-mobile-flow-v3.css');
  assert.match(css,/\.rmv-flow \.rem-step-panel:not\(\.active\)\{display:none!important\}/);
  assert.match(css,/\.rmv-flow \.rem-step-panel\.active\{display:block!important\}/);
  assert.match(css,/\.rmv-flow \.rmv-signature-step\.active\{display:grid!important/);
  assert.doesNotMatch(css,/@media\(max-width:480px\)\{\.rmv-signature-step\{display:grid!important/);
});

test('el Chofer no clasifica el tipo de servicio y Operaciones queda como fuente',()=>{
  const html=read('Index.html'),flow=read('remito-mobile-flow-v3.js'),sigma=read('sigma.js'),bridge=read('operator-service-bridge.js');
  assert.match(html,/<input type="hidden" id="rem-tipo-servicio" value="">/);
  assert.doesNotMatch(flow,/data-ad-hoc="type"|err-tipo|attach\('rem-tipo-servicio','type'\)/);
  assert.doesNotMatch(sigma,/marcar\('rem-tipo-servicio', 'err-tipo'\)/);
  assert.match(sigma,/servicioAsignado\?\.concept_name[\s\S]*A definir por Operaciones/);
  assert.doesNotMatch(bridge,/const type=document\.getElementById\('rem-tipo-servicio'\)/);
});

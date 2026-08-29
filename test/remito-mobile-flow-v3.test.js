const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=file=>fs.readFileSync(file,'utf8');

test('el remito móvil usa cuatro pasos y no repite datos del servicio asignado',()=>{
  const flow=read('remito-mobile-flow-v3.js'),sigma=read('sigma.js');
  assert.match(sigma,/const REM_TOTAL_PASOS = 4/);
  assert.match(flow,/Datos del cliente/);
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

test('peajes es el paso 2 y evidencia queda inmediatamente después en el paso 3',()=>{
  const flow=read('remito-mobile-flow-v3.js'),addons=read('remito-addons-v2.js'),sigma=read('sigma.js');
  assert.match(addons,/const step=\$\('#rem-step-2'\)/);
  assert.match(addons,/rem-addons-kicker">Paso 2/);
  assert.match(flow,/<span>Paso 3<\/span><h2>Evidencia/);
  assert.match(flow,/evidenceStep\(step3\)/);
  assert.match(sigma,/if \(paso === 2\) \{\s+if \(window\.AuxiliosRemitoAddonsV2\)/);
});

test('el ingreso sin asignación expande los datos operativos para vinculación posterior',()=>{
  const flow=read('remito-mobile-flow-v3.js'),bridge=read('operator-service-bridge.js');
  assert.match(flow,/function setAdHocMode/);
  assert.match(flow,/Este ingreso quedará pendiente de vinculación por Operaciones/);
  assert.match(bridge,/setAdHocMode\?\.\(true\)/);
  assert.match(bridge,/setAdHocMode\?\.\(false\)/);
  const toggle=flow.slice(flow.indexOf('function setAdHocMode'),flow.indexOf('window.AuxiliosRemitoMobileV3'));
  assert.ok(toggle.indexOf("moveToHidden(hidden,id)")<toggle.indexOf('adHoc?.remove()'),'al volver a un servicio asignado debe conservar la patente antes de quitar la tarjeta ad hoc');
  assert.match(bridge,/remWizardReset\?\.\(\);window\.AuxiliosRemitoMobileV3\?\.setAdHocMode\?\.\(false\);prefillRemito/);
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

test('ACTIVADO exige uno de cuatro motivos y lo persiste mediante RPC v2',()=>{
  const bridge=read('operator-service-bridge.js'),lifecycle=read('operator-service-lifecycle.js');
  const sql=read('migrations/20260829170000_driver_activation_reason_v2.sql');
  for(const code of ['delay','client_or_provider','cancelled_by_us','other'])assert.match(bridge,new RegExp(`'${code}'`));
  assert.doesNotMatch(lifecycle,/within_authorized_window/);
  assert.match(bridge,/Seleccioná el motivo de cancelación/);
  assert.match(bridge,/reasonCode==='other'&&!reasonDetail/);
  assert.match(sql,/v_reason_code not in \('delay','client_or_provider','cancelled_by_us','other'\)/);
  assert.match(sql,/cancellation_reason_code = v_reason_code/);
  assert.match(sql,/revoke all on function public\.mark_driver_operator_service_activated_v2\(uuid,text,text\) from public,anon,authenticated/);
});

test('Operaciones actualiza automáticamente los borradores visibles',()=>{
  const services=read('operator-services.js');
  assert.match(services,/list_operator_service_document_connections_v1/);
  assert.match(services,/document\.visibilityState==='visible'.*loadServices\(\)/s);
  assert.match(services,/},30000\)/);
});

test('guardar y seguir después restaura todos los datos del socio',()=>{
  const sigma=read('sigma.js');
  assert.match(sigma,/razon_social:\s*cliente \|\| null/);
  assert.match(sigma,/cuit:\s+cuit\s+\|\| null,\s*\n\s*telefono:\s+telefono \|\| null,/);
  assert.match(sigma,/set\('rem-cliente',\s*r\.cliente\)/);
  assert.match(sigma,/set\('rem-cuit',\s*r\.cuit\)/);
  assert.match(sigma,/set\('rem-telefono',\s*r\.telefono\)/);
  assert.match(sigma,/dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
});

test('FINALIZAR limpia el formulario sólo después de confirmar el guardado',()=>{
  const sigma=read('sigma.js');
  const start=sigma.indexOf('async function _finalizarRemitoInner()');
  const end=sigma.indexOf('// ── CÁLCULO DE TOTAL',start);
  const body=sigma.slice(start,end);
  assert.ok(body.indexOf('const ok = await guardarRemitoCompleto')<body.indexOf('resetPagoForm()'));
  assert.match(body,/if \(!ok\) return false;\s*resetPagoForm\(\);\s*return true;/);
  assert.doesNotMatch(body,/tbodyRemitos\.insertBefore|tbodyViajes\.appendChild|tbodyHistorial\.insertBefore/);
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
  assert.match(flow,/insertAdjacentHTML\('beforebegin','<header class="rmv-step-head"/);
  assert.match(css,/grid-template-rows:minmax\(0,30fr\) minmax\(0,70fr\)/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.rmv-confirm-zone \.toggle-title\{font-size:9px!important/);
  assert.match(css,/\.rmv-sign-zone #sig-canvas\{position:absolute;inset:0;width:100%!important;height:100%!important/);
});

test('el wizard muestra exclusivamente el paso activo',()=>{
  const css=read('remito-mobile-flow-v3.css');
  assert.match(css,/\.rmv-flow \.rem-step-panel:not\(\.active\)\{display:none!important\}/);
  assert.match(css,/\.rmv-flow \.rem-step-panel\.active\{display:block!important\}/);
  assert.match(css,/\.rmv-flow \.rmv-signature-step\.active\{display:grid!important/);
  assert.doesNotMatch(css,/@media\(max-width:480px\)\{\.rmv-signature-step\{display:grid!important/);
});

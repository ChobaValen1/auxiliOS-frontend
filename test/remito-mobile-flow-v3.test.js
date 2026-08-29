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
});

test('ACTIVADO tiene RPC propia con ownership, auditoría y sin facturación',()=>{
  const sql=read('migrations/20260828160000_driver_mark_activated_v1.sql');
  assert.match(sql,/v_role <> 'chofer'/);
  assert.match(sql,/assigned_driver_id is distinct from v_uid/);
  assert.match(sql,/s\.status <> 'assigned'/);
  assert.match(sql,/s\.remito_id is not null/);
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
  assert.match(bridge,/mark_driver_operator_service_activated_v1/);
});

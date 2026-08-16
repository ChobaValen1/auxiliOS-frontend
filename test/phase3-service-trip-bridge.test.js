const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('el puente del chofer usa sólo cola v2, remito y firma para ARRIBADO',()=>{
  const js=read('operator-service-bridge.js');
  assert.match(js,/get_driver_operator_queue_v2/);
  assert.match(js,/ensure_operator_service_trip_v2/);
  assert.match(js,/validate_operator_service_required_fields_v2/);
  assert.match(js,/complete_driver_operator_service_fields_v2/);
  assert.match(js,/link_operator_service_remito/);
  assert.match(js,/guardarRemitoCompleto/);
  assert.match(js,/firmaDataURL/);
  assert.match(js,/¿Confirmar firma y marcar el servicio/);
  assert.doesNotMatch(js,/advance_operator_service|avanzarServicioAsignado|NEXT\s*=|en_route|loaded|at_destination/);
});

test('los obligatorios sin campo nativo aparecen en una card antes de la firma',()=>{
  const js=read('operator-service-bridge.js');
  assert.match(js,/Completá antes de firmar/);
  assert.match(js,/Configuración → Servicios → Formulario/);
  assert.match(js,/Email del cliente/);
  assert.match(js,/Observaciones del servicio/);
  assert.match(js,/Indicaciones para el chofer/);
  assert.match(js,/Orden de compra/);
  assert.match(js,/Antes de firmar completá:/);
});

test('el chofer tiene historial propio y no finaliza el servicio',()=>{
  const js=read('operator-service-bridge.js');
  assert.match(js,/get_driver_operator_history_v2/);
  assert.match(js,/Historial de servicios/);
  assert.match(js,/No tenés servicios activos asignados/);
  assert.doesNotMatch(js,/Finalizar servicio|No se pudo completar|abrirModalIncidente/);
});

test('runtime conserva puente canónico sin journey guard muerto',()=>{
  const config=read('config.js'),pkg=read('package.json'),sw=read('sw.js');
  assert.match(config,/auxilios-phase3-service-bridge/);
  assert.match(config,/operator-service-bridge\.js/);
  assert.doesNotMatch(config,/phase3-journey-start-guard/);
  assert.doesNotMatch(pkg,/phase3-journey-start-guard/);
  assert.doesNotMatch(sw,/phase3-journey-start-guard/);
  assert.match(pkg,/node --check operator-service-bridge\.js/);
  assert.match(sw,/operator-service-bridge\.css/);
});

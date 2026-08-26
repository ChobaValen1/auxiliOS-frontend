const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('el puente del chofer usa la cola v2 y el guardado transaccional para ARRIBADO',()=>{
  const js=read('operator-service-bridge.js');
  const data=read('supabase.js');
  assert.match(js,/get_driver_operator_queue_v2/);
  assert.match(js,/ensure_operator_service_trip_v2/);
  assert.match(js,/validate_operator_service_required_fields_v2/);
  assert.match(js,/complete_driver_operator_service_fields_v2/);
  assert.match(data,/save_driver_operator_service_remito_v3/);
  assert.doesNotMatch(js,/link_operator_service_remito/);
  assert.match(js,/guardarRemitoCompleto/);
  assert.match(js,/firmaDataURL/);
  assert.match(js,/Confirmar firma y ARRIBADO/);
  assert.match(js,/OperatorServiceLifecycleV2\?\.confirmAction/);
  assert.doesNotMatch(js,/window\.confirm/);
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

test('los servicios asignados del Chofer viven dentro de Remitos y no en el Panel',()=>{
  const js=read('operator-service-bridge.js'),css=read('operator-service-bridge.css');
  assert.match(js,/document\.getElementById\('screen-remitos'\)/);
  assert.match(js,/data-location="remitos"/);
  assert.match(js,/＋ Sin asignación/);
  assert.doesNotMatch(js,/document\.getElementById\('screen-dashboard'\)/);
  assert.match(js,/hideArchive=P3\.view==='active'&&P3\.queue\.length>0/);
  assert.match(js,/classList\.toggle\('p3-hide-remitos-archive',hideArchive\)/);
  assert.match(js,/render\(\);loadQueue\(\)/);
  assert.match(css,/#btn-nuevo-remito-desktop,.p3-driver-remitos #btn-nuevo-remito-fab/);
  assert.match(css,/p3-hide-remitos-archive #filtros-remitos/);
  assert.match(css,/p3-hide-remitos-archive #remitos-lista/);
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

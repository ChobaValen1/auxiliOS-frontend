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
  assert.match(js,/AuxiliosRemitoAddonsV2\?\.loadReference/);
  assert.match(js,/validate_operator_service_required_fields_v2/);
  assert.match(js,/complete_driver_operator_service_fields_v2/);
  assert.match(data,/save_driver_operator_service_remito_v3/);
  assert.doesNotMatch(js,/link_operator_service_remito/);
  assert.match(js,/guardarRemitoCompleto/);
  assert.match(js,/firmaDataURL/);
  assert.match(js,/Confirmar firma y ARRIBADO/);
  assert.match(js,/OperatorServiceLifecycleV2\?\.confirmAction/);
  assert.match(js,/window\.confirm/);
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

test('Historial reutiliza la lista canónica de remitos y no duplica otra pantalla',()=>{
  const js=read('operator-service-bridge.js');
  assert.doesNotMatch(js,/get_driver_operator_history_v2|Historial de servicios/);
  assert.match(js,/window\.cargarRemitos/);
  assert.match(js,/panel\.classList\.toggle\('p3-history-only',history\)/);
  assert.match(js,/if\(history\)\{list\.innerHTML='';return\}/);
  assert.match(js,/No tenés servicios activos asignados/);
  assert.doesNotMatch(js,/Finalizar servicio|No se pudo completar|abrirModalIncidente/);
});

test('los servicios asignados del Chofer viven dentro de Remitos y no en el Panel',()=>{
  const js=read('operator-service-bridge.js'),css=read('operator-service-bridge.css');
  assert.match(js,/document\.getElementById\('screen-remitos'\)/);
  assert.match(js,/data-location="remitos"/);
  assert.match(js,/＋ Sin asignación/);
  assert.doesNotMatch(js,/document\.getElementById\('screen-dashboard'\)/);
  assert.match(js,/screen\.classList\.toggle\('p3-hide-remitos-archive',!history\)/);
  assert.match(css,/#btn-nuevo-remito-desktop,.p3-driver-remitos #btn-nuevo-remito-fab/);
  assert.match(css,/p3-driver-remitos #filtros-remitos/);
  assert.match(css,/p3-driver-remitos #filtro-info/);
  assert.match(css,/p3-hide-remitos-archive #remitos-lista/);
  assert.match(css,/p3-hide-remitos-archive\{display:flex/);
  assert.match(css,/p3-remitos-assigned\{display:flex;flex:1/);
});

test('el módulo del Chofer se presenta como Servicios con una sola cabecera minimalista',()=>{
  const js=read('operator-service-bridge.js'),css=read('operator-service-bridge.css');
  assert.match(js,/label\.textContent='Servicios'/);
  assert.match(js,/title\.textContent='SERVICIOS'/);
  assert.match(js,/sub\.textContent='Asignados e historial'/);
  assert.doesNotMatch(js,/p3-panel-title|p3-eyebrow/);
  assert.match(css,/p3-driver-remitos>\.sec-header/);
  assert.match(css,/p3-history-only/);
});

test('la tarjeta activa muestra vehículo ruta KM excedentes peajes y abre el preview móvil',()=>{
  const js=read('operator-service-bridge.js'),css=read('operator-service-bridge.css');
  const card=js.split('function activeCard(s)')[1].split('function findService')[0];
  for(const expected of ['Fecha','N° Prestación','Estado','serviceFacts'])assert.match(card,new RegExp(expected));
  for(const expected of ['Vehículo','Origen','Destino','KM','Excedentes','Peajes'])assert.match(js,new RegExp(expected));
  for(const expected of ['service_order_number','company_name','origin','destination','vehicle_make_model','vehicle_plate','origin_destination_distance_meters'])assert.match(js,new RegExp(expected));
  assert.match(card,/Sin N° prestación/);
  for(const fallback of ['Vehículo sin informar','Sin patente'])assert.match(js,new RegExp(fallback));
  for(const forbidden of ['service_number','concept_name','truck_label','driver_instructions','customer_name','priority-'])assert.doesNotMatch(card,new RegExp(forbidden));
  assert.match(js,/\+\$\{remaining\} más/);
  assert.match(js,/customer_excess_summary/);
  assert.match(js,/toll_charge_summary/);
  assert.match(js,/A cargo del socio/);
  assert.match(js,/A cargo de la prestadora/);
  assert.match(js,/mixed:'Mixto'/);
  assert.match(card,/role="button" tabindex="0"/);
  assert.match(card,/event\.key==='Enter'\|\|event\.key===' '/);
  assert.match(card,/abrirPreviewServicio\(this\.dataset\.serviceId\)/);
  assert.match(card,/p3-bar-divider[^>]*aria-hidden="true">\|/);
  assert.match(js,/Completar remito/);
  assert.match(js,/Marcar como activado/);
  assert.match(js,/mark_driver_operator_service_activated_v2/);
  assert.match(css,/\.p3-preview/);
  assert.match(css,/\.p3-summary-block/);
  assert.match(css,/\.p3-service-card\.is-actionable:focus-visible/);
  assert.match(css,/\.p3-service-card\.is-actionable:active/);
  assert.doesNotMatch(css,/\.p3-service-card\.priority-/);
});

test('la cola del Chofer expone tramo Maps, excedentes del socio y peajes por responsable',()=>{
  const sql=read('supabase/migrations/20260829221000_driver_service_toll_charge_summary_v1.sql');
  assert.match(sql,/create or replace function public\.get_driver_operator_queue_v2\(\)/);
  assert.match(sql,/security definer\s+set search_path = ''/);
  assert.match(sql,/v_role<>'chofer' or v_uid is null/);
  assert.match(sql,/s\.assigned_driver_id=v_uid/);
  assert.match(sql,/origin_destination_distance_meters/);
  assert.match(sql,/billing_snapshot->>'route_mode'='origin_destination'/);
  assert.match(sql,/billing_snapshot->>'route_mode'='base_origin_destination_base'/);
  assert.match(sql,/route_legs->1->>'distanceMeters'/);
  assert.match(sql,/s\.route_provider='google_routes'/);
  assert.match(sql,/toll_payment_summary/);
  assert.match(sql,/toll_charge_summary/);
  assert.match(sql,/A cargo del socio/);
  assert.match(sql,/A cargo de la prestadora/);
  assert.match(sql,/Mixto/);
  assert.match(sql,/provider_unit_amount/);
  assert.match(sql,/customer_unit_amount/);
  assert.match(sql,/has_excesses/);
  assert.match(sql,/customer_excess_summary/);
  assert.match(sql,/customer_amount_due/);
  assert.match(sql,/operator_service_excess_charges/);
  assert.match(sql,/coalesce\(e\.payer_agent,'customer'\)='customer'/);
  assert.match(sql,/e\.collector_agent='company'/);
  assert.match(sql,/choice\.has_actual and toll\.source='actual'/);
  assert.match(sql,/not choice\.has_actual and toll\.source in \('planned','manual'\)/);
  assert.doesNotMatch(sql,/estimated_total/);
  assert.match(sql,/revoke all on function public\.get_driver_operator_queue_v2\(\) from public,anon,authenticated/);
  assert.match(sql,/grant execute on function public\.get_driver_operator_queue_v2\(\) to authenticated/);
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

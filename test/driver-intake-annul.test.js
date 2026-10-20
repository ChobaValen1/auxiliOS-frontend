const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const migration=fs.readFileSync('migrations/20261020120000_driver_intake_annul_and_link_pending.sql','utf8');
const bridge=fs.readFileSync('operator-service-bridge.js','utf8');
const services=fs.readFileSync('operator-services.js','utf8');
const driverCss=fs.readFileSync('chofer-servicios-ax-v1.css','utf8');
const opsCss=fs.readFileSync('operaciones-ax-v1.css','utf8');

test('Base: anular ingreso con motivo, sólo el chofer dueño o Administración/Operador, y sin borrar nada',()=>{
  assert.match(migration,/create or replace function public\.annul_driver_service_intake_v1\(/);
  assert.match(migration,/not in \('chofer','administracion','operador'\)/);
  assert.match(migration,/'duplicate' then 'Cargado repetido'/);
  assert.match(migration,/if v_reason = 'other' and v_detail is null then raise exception/);
  assert.match(migration,/v_role = 'chofer' and i\.driver_id is distinct from v_uid/);
  assert.match(migration,/i\.status <> 'pending_admin' or i\.linked_service_id is not null/);
  assert.match(migration,/set status='anulado'/);
  assert.match(migration,/set status='rejected'/);
  assert.match(migration,/'annulled'/);
  assert.doesNotMatch(migration,/\bdelete\s+from\b/i);
  assert.match(migration,/revoke all on function public\.annul_driver_service_intake_v1\(uuid,integer,text,text\) from public, anon/);
});

test('Base: vincular acepta un servicio Pendiente sin chofer asignándoselo primero',()=>{
  assert.match(migration,/link_driver_service_intake_v1\(uuid,uuid\)/);
  assert.match(migration,/s\.status='pending' and s\.assigned_driver_id is null and s\.remito_id is null/);
  assert.match(migration,/perform public\.set_operator_service_assignment_v2\(s\.service_id,i\.driver_id,i\.truck_id\)/);
  assert.match(migration,/raise exception 'link_driver_service_intake_v1: texto no encontrado'/);
});

test('Chofer: anular su ingreso desde la ficha con motivo, paso deslizable y botón bloqueado hasta elegir',()=>{
  assert.match(bridge,/onclick="confirmarAnularIngresoChofer\(this\.dataset\.id\)">Anular este ingreso</);
  assert.match(bridge,/rpc\('annul_driver_service_intake_v1',\{p_remito_id:Number\(id\)/);
  assert.match(bridge,/confirmarAnularIngresoChofer:confirmAdHocAnnul,anularIngresoChofer:annulAdHoc/);
  assert.match(bridge,/id="p3-annul-confirm-btn"[^>]*disabled/);
  assert.match(bridge,/slidePreview\('next'\)\}\nasync function annulAdHoc/);
  assert.match(driverCss,/\.p3-annul-detail\[data-open="true"\] \{ grid-template-rows: 1fr;/);
  assert.match(driverCss,/#p3-service-preview \.p3-annul-detail \{ transition: none; \}/);
});

test('Operador: Anular en la lista de ingresos y Pendientes sin chofer al vincular',()=>{
  assert.match(services,/abrirAnularIngreso\('\$\{esc\(i\.intake_id\)\}'\)">Anular</);
  assert.match(services,/rpc\('annul_driver_service_intake_v1',\{p_intake_id:id/);
  assert.match(services,/id="os-intake-annul" hidden role="dialog" aria-modal="true"/);
  assert.match(services,/const pending=S\.services\.filter\(s=>s\.status==='pending'&&!s\.remito_id&&!s\.assigned_driver_id\)/);
  assert.match(services,/<optgroup label="Sin asignar">/);
  assert.match(services,/e\.key==='Escape'/);
  // Nombres globales propios: no pisar las funciones del chofer (window.confirmarAnularIngresoChofer).
  assert.doesNotMatch(services,/AnularIngresoChofer/);
  assert.match(services,/confirmarAnularIngreso:confirmIntakeAnnul/);
  assert.match(opsCss,/#screen-operaciones \.osi-row\.is-leaving/);
  assert.match(opsCss,/prefers-reduced-motion: reduce\) \{\n  :is\(#os-intake-link, #os-intake-annul\)/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=file=>fs.readFileSync(file,'utf8');
const migration=read('supabase/migrations/20260831153619_operator_remito_visibility_v2.sql');
const services=read('operator-services.js');
const commercial=read('operator-service-commercial-addons-v1.js');
const review=read('operator-remito-review-v2.js');

test('la bandeja documental v2 exige identidad y rol y no transporta firmas en la grilla',()=>{
  assert.match(migration,/list_operator_service_document_connections_v2/);
  assert.match(migration,/v_uid is null[\s\S]*v_role not in/);
  assert.match(migration,/remito_has_signature/);
  assert.match(migration,/remito_evidence_count/);
  assert.doesNotMatch(migration,/'remito_signature_url'/);
  assert.match(migration,/revoke all on function public\.list_operator_service_document_connections_v1\(\)[\s\S]*authenticated/);
  assert.match(migration,/grant execute on function public\.list_operator_service_document_connections_v2\(\)[\s\S]*authenticated/);
});

test('Servicios usa la bandeja segura y permite abrir el remito sin depender del menu de tres puntos',()=>{
  assert.match(services,/list_operator_service_document_connections_v2/);
  assert.match(services,/hasSignedRemito/);
  assert.match(services,/openSignedRemito/);
  assert.match(services,/loadAuxiliosModule\('auxilios-operator-remito-review-v2'/);
  assert.match(services,/abrirRemitoFirmadoOperador/);
  assert.match(services,/Abrir el remito firmado/);
  assert.match(services,/Remito recibido[\s\S]*Ver/);
  assert.match(commercial,/Documento del chofer/);
  assert.match(commercial,/data-ca="open-remito"/);
  assert.match(commercial,/abrirRemitoFirmadoOperador/);
});

test('el bootstrap no espera un segundo load de scripts defer ya ejecutados',()=>{
  const config=read('config.js');
  assert.match(config,/existing\.defer && document\.readyState !== 'loading'/);
  assert.match(config,/existing\.dataset\.loaded = '1'/);
});

test('el modal administrativo abre directo en una revisión global de dos columnas',()=>{
  assert.match(review,/Revisión y cierre/);
  assert.match(review,/data-review-side="planned"/);
  assert.match(review,/data-review-side="reported"/);
  assert.match(review,/Formato de cobro de peajes/);
  assert.match(review,/paymentLabel/);
  assert.match(review,/chooseGlobalAction/);
  for(const action of ['rejected','adjusted','accepted'])assert.match(review,new RegExp(`data-review-global-action="${action}"`));
  assert.match(review,/resolve_operator_service_document_v4/);
  assert.doesNotMatch(review,/reviewActions|comparisonSection|applySection|data-review-action=/);
  assert.doesNotMatch(review,/<table|os-review-table|os-review-comparison-group|os-review-group-header/);
  assert.doesNotMatch(review,/Evidencias cargadas por el chofer|Firma del socio|data-remito-evidence|os-signed-document/);
  assert.doesNotMatch(review,/download\(\)|toggleFullscreen\(\)|html2pdf/);
  assert.match(review,/Reintentar/);
});

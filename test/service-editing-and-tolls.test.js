const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const legacy=read('migrations/20260804161000_service_editing_and_tolls.sql');
const canonical=read('migrations/20260812222500_canonical_service_edit_workspace_v1.sql');
const schema=read('migrations/20260813195500_service_commercial_matrix_v2.sql');
const normalizer=read('migrations/20260813195510_service_commercial_matrix_normalizer_v2.sql');
const persistence=read('migrations/20260813195520_service_commercial_matrix_persistence_v2.sql');
const wizard=read('operator-service-wizard.js');
const workspace=read('operator-service-workspace-reactive-v1.js');
const workspaceCss=read('operator-service-workspace-reactive-v1.css');
const commercial=read('operator-service-commercial-addons-v1.js');
const commercialCss=read('operator-service-commercial-addons-v1.css');
const config=read('config.js'),sw=read('sw.js'),pkg=read('package.json');

test('edición sigue auditada y usa un solo workspace',()=>{
 assert.match(legacy,/operator_service_changes/i);
 assert.match(canonical,/create or replace function public\.update_operator_service/i);
 assert.match(wizard,/get_operator_service_edit_context/);
 assert.match(wizard,/update_operator_service/);
 assert.match(workspace,/data-mode="\$\{w\.mode\}"/);
 assert.doesNotMatch(config,/operator-service-edit\.js|operator-service-edit\.css/);
});

test('la tercera columna tiene un único renderer comercial',()=>{
 assert.match(workspace,/data-workspace="three-columns"/);
 assert.match(workspaceCss,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
 assert.match(workspace,/class="osv2-column actions-column"><\/section>/);
 assert.match(workspace,/OperatorServiceCommercialAddonsV1\?\.render/);
 assert.doesNotMatch(workspace,/tollCard|extrasCard|renderTolls|renderRows|data-toll-field|data-row-concept/);
 assert.doesNotMatch(workspace,/osv2-summary-card|Validar servicio|Facturación/);
});

test('formato de cobro habilita la matriz y gobierna Quién paga',()=>{
 for(const label of ['A cargo del cliente','A cargo de la Prestadora','Uno y Uno'])assert.match(commercial,new RegExp(label));
 assert.match(commercial,/Elegí el formato de cobro/);
 assert.match(commercial,/Quién paga/);
 assert.match(commercial,/Método de Pago/);
 assert.match(wizard,/PAYERS=new Set\(\['provider','customer'\]\)/);
 assert.match(wizard,/fixedPayer=mode=>mode==='provider_roundtrip'\?'provider':mode==='customer_roundtrip'\?'customer':''/);
 assert.match(wizard,/Seleccioná primero el formato de cobro de peajes/);
 assert.doesNotMatch(wizard,/PAYERS=new Set\(\[[^\]]*both/);
});

test('peaje toma tarifa vigente, cantidad y total sin importe manual',()=>{
 assert.match(commercial,/Seleccionar peaje…/);
 assert.match(commercial,/total=num\(rate\?\.amount\)\*qty/);
 assert.match(commercial,/value="N\/A" disabled/);
 assert.doesNotMatch(commercial,/data-ca-field="unit_amount"/);
 assert.match(wizard,/toll_rate_id:r\.toll_rate_id\|\|tollRate\(r\.toll_id\)\?\.toll_rate_id\|\|null/);
 assert.match(wizard,/commercial_addons:commercialPayload\(d\)/);
});

test('excedentes usan Concepto Cant Importe Cobrador Medio Pago y Prestadora implica N/A',()=>{
 for(const label of ['Concepto','Cant.','Importe','Cobrador','Medio Pago'])assert.match(commercial,new RegExp(label.replace('.','\\.')));
 assert.match(commercial,/Empresa \(Nosotros\)/);
 assert.match(commercial,/function excessPaymentControl/);
 assert.match(commercial,/row\.collector_agent==='provider'/);
 assert.match(wizard,/COLLECTORS=new Set\(\['company','provider'\]\)/);
 assert.match(wizard,/customer_payment_method:r\.collector_agent==='provider'\?null/);
 assert.match(wizard,/if\(key==='collector_agent'\)/);
 assert.match(wizard,/if\(value==='provider'\)r\.customer_payment_method=''/);
 assert.match(schema,/coalesce\(customer_payment_method,'n\/a'\)/i);
 assert.match(persistence,/collector_agent/i);
});

test('backend replica las restricciones de la matriz',()=>{
 assert.match(normalizer,/v_mode='provider_roundtrip' and v_payer<>'provider'/i);
 assert.match(normalizer,/v_mode='customer_roundtrip' and v_payer<>'customer'/i);
 assert.match(normalizer,/v_payer not in \('provider','customer'\)/i);
 assert.match(normalizer,/v_payer='customer' and v_customer_method not in/i);
 assert.match(normalizer,/v_payer='provider' then v_customer_method:=null/i);
 assert.match(normalizer,/v_collector not in \('company','provider'\)/i);
 assert.match(normalizer,/v_collector='provider' then[\s\S]*v_customer_method:=null/i);
 assert.match(normalizer,/Cuando cobra la Empresa, el medio de pago del excedente es obligatorio/i);
 assert.match(normalizer,/coalesce\(v_customer_method,'n\/a'\)/i);
 assert.match(normalizer,/v_rate\.amount/);
});

test('matrices crecen sin scroll interno propio',()=>{
 assert.match(workspaceCss,/\.osv4-reactive \.osv2-grid\{[^}]*overflow-y:auto!important/);
 assert.match(workspaceCss,/\.osv4-reactive \.osv2-column\{[^}]*overflow:visible!important/);
 assert.match(commercialCss,/\.osca-matrix\{display:grid;gap:4px\}/);
 assert.doesNotMatch(commercialCss,/\.osca-matrix(?:-body)?\{[^}]*overflow/);
});

test('runtime contiene sólo la implementación definitiva',()=>{
 for(const name of ['operator-service-edit.js','operator-service-edit.css','operator-reference-loader.js','operator-service-workspace-behavior-v1.js','operator-service-commercial-addons-input-fix-v1.js']){
  assert.equal(config.includes(name),false);assert.equal(sw.includes(name),false);
 }
 assert.match(config,/operator-service-commercial-addons-v1\.js/);
 assert.match(sw,/operator-service-commercial-addons-v1\.js/);
 assert.match(pkg,/node --check operator-service-commercial-addons-v1\.js/);
});

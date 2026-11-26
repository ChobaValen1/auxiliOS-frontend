const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function load(){
  const context={window:{addEventListener(){}},document:{readyState:'loading',addEventListener(){}},setTimeout(){},clearTimeout(){},console};
  vm.runInNewContext(fs.readFileSync('operator-services.js','utf8').replace(/\}\)\(\);\s*$/, 'window.testApi={statusCell,DOCUMENT_LABELS};})();'),context);
  return context.window.testApi;
}
test('labels distinguish remito lifecycle without changing service state or inventing exceptions',()=>{
  const {statusCell,DOCUMENT_LABELS:labels}=load();
  const expected={not_started:'Remito pendiente',draft:'Remito en borrador',submitted:'Remito en revisión',approved:'Remito aprobado',observed:'Remito requiere correcciones'};
  // En la tabla el aviso dice un estado concreto: pendiente, en borrador o creado (observado si hay que corregirlo).
  const chip={not_started:'Remito pendiente',draft:'Remito en borrador',submitted:'Remito creado',approved:'Remito creado',observed:'Remito observado'};
  for(const [document_status,label] of Object.entries(expected)){
    const service={service_id:'qa',status:'assigned',document_status};
    assert.equal(labels[document_status],label);assert.match(statusCell(service),new RegExp('class="os-remito-text">'+chip[document_status]+'<'));assert.equal(service.status,'assigned');
  }
  for(const key of ['exception_requested','exception_approved','exception_rejected'])assert.match(labels[key],/Excepción/);
});
test('draft displays the en borrador badge without restoring the removed notice or changing the record',()=>{
  const {statusCell}=load(),s={service_id:'qa',status:'assigned',document_status:'draft',remito_status:'borrador'};
  const before=JSON.stringify(s),html=statusCell(s);
  assert.doesNotMatch(html,/Remito incompleto|Carga iniciada|ax-remito-preparing/);
  assert.match(html,/class="os-document-state os-remito-ico is-draft" role="img" data-remito-state="draft" data-ax-explica title="Remito en borrador · [^"]+" aria-label="Remito en borrador · [^"]+"><span class="os-remito-emoji" aria-hidden="true">📝<\/span><span class="os-remito-text">Remito en borrador<\/span><\/span>/);
  assert.match(statusCell({service_id:'qa',status:'assigned',remito_id:1,remito_status:'borrador'}),/>Remito en borrador</);
  assert.equal(JSON.stringify(s),before);
});
test('signed remito keeps its document button with the requested label, not a duplicated Ver/Revisar suffix',()=>{
  const {statusCell}=load();
  for(const [document_status,label,tone] of [['submitted','Remito creado','review'],['approved','Remito creado','ok'],['observed','Remito observado','review']]){
    const html=statusCell({service_id:'qa',status:'assigned',remito_id:1,remito_status:'firmado',document_status});
    assert.match(html,/abrirRemitoFirmadoOperador/);assert.match(html,new RegExp('>'+label+'</span></button>'));assert.match(html,new RegExp('is-'+tone));
    assert.equal(html.includes('awaiting-review'),document_status!=='approved');
    assert.doesNotMatch(html,/Remito recibido|Remito firmado · Revisar| · Ver|Creando remito/);
  }
});
test('operator can see pendiente only after the complete document inbox has loaded successfully',()=>{
  const {statusCell}=load(),s={service_id:'qa',status:'assigned'};
  assert.doesNotMatch(statusCell(s),/Remito pendiente/,'unknown data is not no-remito');
  assert.match(statusCell({...s,_documentConnectionLoaded:true}),/Remito pendiente/);
  assert.doesNotMatch(statusCell({...s,_documentConnectionLoaded:true,remito_id:1}),/Remito pendiente/);
  assert.doesNotMatch(statusCell({...s,_documentConnectionLoaded:true,document_status:'unknown'}),/Remito pendiente/);
});
test('state selector styling is tied to actual menu semantics, not all badges',()=>{
  const css=fs.readFileSync('operaciones-ax-v1.css','utf8');
  assert.match(css,/\.os-status\[role="button"\][\s\S]*border-radius: 9px/);
  assert.match(css,/\.os-status\[role="button"\]::after/);
  assert.match(css,/\.os-status:not\(\[role="button"\]\)::after \{ content: none/);
  assert.match(css,/aria-expanded="true"/);assert.match(css,/prefers-reduced-motion: reduce/);
  assert.doesNotMatch(fs.readFileSync('operator-service-lifecycle.css','utf8'),/\.os-status:after/);
});
test('remito is an emoji with its name in the tooltip, without changing state',()=>{
  const {statusCell}=load();
  const html=statusCell({service_id:'qa',status:'assigned',document_status:'not_started'});
  assert.match(html,/class="os-document-state os-remito-ico is-pending"[^>]*title="Remito pendiente · Todavía no hay remito"[^>]*><span class="os-remito-emoji" aria-hidden="true">⏳<\/span><span class="os-remito-text">Remito pendiente</);
  const css=fs.readFileSync('operaciones-ax-v1.css','utf8');
  // En escritorio sólo el emoji (el texto queda para el globo y lectores); en el celular se ve escrito.
  assert.match(css,/\.os-remito-ico \.os-remito-text \{ position: absolute;/);
  assert.match(css,/@media \(max-width: 720px\) \{[\s\S]*\.os-remito-ico \.os-remito-text \{ position: static;/);
  for(const tone of ['pending','draft','ok','review'])assert.match(css,new RegExp('\\.os-remito-ico\\.is-'+tone+' \\{'));
});
test('Tipo y Estado se resaltan al pasar el mouse',()=>{
  const css=fs.readFileSync('operaciones-ax-v1.css','utf8');
  assert.match(css,/\.os-type-pill:hover/);
  assert.match(css,/\.col-status \.os-status\[role="button"\]:is\(:hover, :focus-visible, \[aria-expanded="true"\]\) \{ border-color: var\(--ax-accent\)/);
  assert.match(fs.readFileSync('operator-services.js','utf8'),/class=\"os-type-pill\"/);
});

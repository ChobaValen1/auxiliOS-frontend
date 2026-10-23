const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function load(){
  const context={window:{addEventListener(){}},document:{readyState:'loading',addEventListener(){}},setTimeout(){},clearTimeout(){},console};
  vm.runInNewContext(fs.readFileSync('operator-services.js','utf8').replace(/\}\)\(\);\s*$/, 'window.testApi={statusCell,DOCUMENT_LABELS};})();'),context);
  return context.window.testApi;
}
test('labels distinguish remito lifecycle without changing service state or inventing exceptions',()=>{
  const {statusCell,DOCUMENT_LABELS:labels}=load();
  const expected={not_started:'Remito pendiente',draft:'Remito incompleto',submitted:'Remito en revisión',approved:'Remito aprobado',observed:'Remito requiere correcciones'};
  for(const [document_status,label] of Object.entries(expected)){
    const service={service_id:'qa',status:'assigned',document_status};
    assert.equal(labels[document_status],label);assert.match(statusCell(service),new RegExp(label));assert.equal(service.status,'assigned');
  }
  for(const key of ['exception_requested','exception_approved','exception_rejected'])assert.match(labels[key],/Excepción/);
});
test('signed remito keeps its document button with the requested label, not a duplicated Ver/Revisar suffix',()=>{
  const {statusCell}=load();
  for(const [document_status,label] of [['submitted','Remito en revisión'],['approved','Remito aprobado'],['observed','Remito requiere correcciones']]){
    const html=statusCell({service_id:'qa',status:'assigned',remito_id:1,remito_status:'firmado',document_status});
    assert.match(html,/abrirRemitoFirmadoOperador/);assert.match(html,new RegExp('>'+label+'</button>'));
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

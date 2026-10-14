const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=f=>fs.readFileSync(f,'utf8');

function dateInputs(){
  const window={},HTMLInputElement=function(){};HTMLInputElement.prototype={};
  Object.defineProperty(HTMLInputElement.prototype,'value',{get(){return this._v||''},set(v){this._v=v},configurable:true});
  vm.runInNewContext(read('auxilios-date-inputs-v1.js'),{window,HTMLInputElement,document:{readyState:'complete',body:null,addEventListener(){}},MutationObserver:function(){this.observe=()=>{}},Event:function(){}});
  return window.AuxDateInputs;
}

test('los campos de fecha se muestran y se escriben como DD/MM/AA',()=>{
  const D=dateInputs();
  assert.equal(D.toText('2026-09-25','date'),'25/09/26');
  assert.equal(D.toText('2026-09-25T14:30:00','datetime-local'),'25/09/26 14:30');
  assert.equal(D.toText('2026-09','month'),'09/26');
  assert.equal(D.toIso('25/09/26','date'),'2026-09-25');
  assert.equal(D.toIso('25/09/2026','date'),'2026-09-25');
  assert.equal(D.toIso('31/02/26','date'),null);
  assert.equal(D.toIso('25/09/26 14:30','datetime-local'),'2026-09-25T14:30');
  assert.equal(D.toIso('','date'),'');
  assert.equal(D.mask('250926','date'),'25/09/26');
  assert.equal(D.mask('2509261430','datetime-local'),'25/09/26 14:30');
});

test('el módulo de fechas carga antes que el resto y queda en el cache offline',()=>{
  const html=read('Index.html');
  assert.ok(html.indexOf('auxilios-date-inputs-v1.js')>html.indexOf('config.js?v='));
  assert.match(html,/auxilios-date-inputs-v1\.css/);
  assert.match(read('sw.js'),/'\/auxilios-date-inputs-v1\.js'/);
});

test('tipo de servicio de una sola dirección: toggle, destino = origen y remito sin Destino',()=>{
  const catalog=read('service-types-catalog-v2.js');
  assert.match(catalog,/id="st2-single-address"/);
  assert.match(catalog,/single_address:checked\('st2-single-address'\)/);
  const workspace=read('operator-service-workspace-reactive-v1.js');
  assert.match(workspace,/function singleAddress\(\)/);
  assert.match(workspace,/for\(const suffix of \['','_place_id','_lat','_lng','_formatted_address'\]\)/);
  assert.match(workspace,/section\.hidden=single/);
  assert.match(workspace,/base_origin_destination_base:'Base → Origen → Base'/);
  assert.match(read('operator-service-wizard.js'),/single_address:!!s\.single_address/);
  const bridge=read('operator-service-bridge.js');
  assert.match(bridge,/setSingleAddressRemito\(!!s\.single_address\)/);
  const sql=read('migrations/20260925190000_service_single_address_v1.sql');
  assert.match(sql,/add column if not exists single_address boolean not null default false/);
  for(const fn of ['save_service_type_config','list_service_types_config','get_operator_service_context_v1','get_driver_operator_queue_v4'])assert.match(sql,new RegExp(fn));
});

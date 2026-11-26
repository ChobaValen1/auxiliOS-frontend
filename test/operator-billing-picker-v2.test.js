const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const address=require('../address-parts-v1.js');
const kmRounding=require('../km-rounding-v1.js');

/* Carga el exportador en un navegador mínimo con localStorage de verdad (un objeto). */
function load(initial={}){
  const store={...initial};
  const localStorage={getItem:k=>k in store?store[k]:null,setItem(k,v){store[k]=String(v)},removeItem(k){delete store[k]}};
  const el=()=>({id:'',textContent:'',appendChild(){},remove(){}});
  const window={AuxiliosAddress:address,AuxiliosKmRounding:kmRounding,localStorage};
  const document={readyState:'complete',getElementById:()=>null,createElement:el,head:{appendChild(){}},body:{appendChild(){}},querySelector:()=>null,addEventListener(){}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'operator-billing-export.js'),'utf8'),{window,document,console,Intl,Date,Math,Number,String,Set,Map,JSON,Object,encodeURIComponent});
  return{E:window.OperatorBillingExcel,store};
}
const plain=v=>JSON.parse(JSON.stringify(v));
const PREFS='auxilios.billing.excel.columns.v1',PRESETS='auxilios.billing.excel.presets.v1';

test('orden libre: mover entre las columnas elegidas sin respetar grupos',()=>{
  const{E}=load();
  const order=['order','date','plate','total_price','notes'],sel=new Set(['order','plate','total_price','notes']);
  // «date» no está elegida: se queda donde está; el resto se reubica entre sus lugares.
  assert.equal(E.moveSelected(order,sel,'total_price',0),true);
  assert.deepEqual(order,['total_price','date','order','plate','notes']);
  assert.equal(E.moveSelected(order,sel,'total_price',0),false,'ya está ahí');
  assert.equal(E.moveSelected(order,sel,'notes',99),false,'tope al final: ya es la última');
  assert.equal(E.moveSelected(order,sel,'order',99),true,'se limita al último lugar');
  assert.deepEqual(order,['total_price','date','plate','notes','order']);
  assert.equal(E.moveSelected(order,sel,'date',0),false,'una columna no elegida no se mueve');
});

test('al marcar una columna entra junto a las de su grupo, o al final si no hay ninguna',()=>{
  const{E}=load();
  const order=['order','plate','total_price','date','asphalt_km'],sel=new Set(['order','plate','total_price']);
  sel.add('date');E.relocateColumn('service',order,sel,'date');
  assert.deepEqual(order.filter(id=>sel.has(id)),['order','date','plate','total_price'],'va después de «order», su grupo');
  sel.add('asphalt_km');E.relocateColumn('service',order,sel,'asphalt_km');
  assert.deepEqual(order.filter(id=>sel.has(id)),['order','date','plate','total_price','asphalt_km'],'grupo nuevo: al final');
});

test('selección rápida: Completo, Resumen, Solo importes, Ninguna y Restablecer',()=>{
  const{E}=load();
  const all=plain(E.serviceColumns.map(c=>c.id)),def=plain(E.serviceColumns.filter(c=>!c.optional).map(c=>c.id));
  assert.deepEqual(plain(E.quickSelectionIds('service','all')),all);
  assert.deepEqual(plain(E.quickSelectionIds('service','none')),[]);
  assert.deepEqual(plain(E.quickSelectionIds('service','reset')),def);
  const summary=E.quickSelectionIds('service','summary'),amounts=E.quickSelectionIds('service','amounts');
  for(const id of [...summary,...amounts])assert.ok(all.includes(id),id);
  assert.ok(summary.includes('order')&&summary.includes('total_price'));
  assert.ok(amounts.includes('total_with_tolls')&&!amounts.includes('driver'));
  assert.deepEqual(plain(E.quickSelectionIds('toll','all')),plain(E.tollColumns.map(c=>c.id)));
  assert.equal(E.quickSelectionIds('toll','summary'),null,'Peajes no tiene esa selección');
});

test('selecciones propias: guardar, reemplazar por nombre, aplicar y borrar',()=>{
  const{E,store}=load();
  assert.deepEqual(plain(E.readPresets()),[]);
  const a=E.savePreset({name:'  Para contabilidad ',service:['order','total_price'],toll:null,extrasMode:'inline',includeExcess:false});
  assert.equal(a.name,'Para contabilidad');
  assert.ok(a.id);
  const saved=JSON.parse(store[PRESETS]);
  assert.equal(saved.length,1);
  assert.deepEqual(saved[0].service,['order','total_price']);
  // Mismo nombre (sin importar mayúsculas): se reemplaza, no se duplica.
  E.savePreset({name:'para CONTABILIDAD',service:['date'],toll:null,extrasMode:'sheet',includeExcess:true});
  assert.equal(E.readPresets().length,1);
  assert.deepEqual(plain(E.readPresets()[0].service),['date']);
  assert.equal(E.savePreset({name:'   ',service:['order']}),null,'sin nombre no se guarda');
  const b=E.savePreset({name:'Peajes',service:null,toll:['date','plate']});
  assert.equal(E.readPresets().length,2);
  E.deletePreset(b.id);
  assert.deepEqual(plain(E.readPresets()).map(p=>p.name),['para CONTABILIDAD']);
  // Datos rotos no rompen nada.
  store[PRESETS]='{no es json';assert.deepEqual(plain(E.readPresets()),[]);
  store[PRESETS]=JSON.stringify([{name:5},{id:'x',name:'ok',service:['order','no_existe']}]);
  assert.deepEqual(plain(E.readPresets()).map(p=>p.name),['ok']);
});

test('aplicar una selección propia marca y ordena sólo lo que guardó y descarta columnas que ya no existen',()=>{
  const{E}=load();
  const p={id:'p1',name:'x',service:['total_price','order','ya_no_existe'],toll:null,extrasMode:'both',includeExcess:false};
  const state={serviceRows:[1],tollRows:[1],serviceOrder:E.serviceColumns.map(c=>c.id),tollOrder:E.tollColumns.map(c=>c.id),serviceSelected:new Set(['driver']),tollSelected:new Set(['date']),extrasMode:'sheet',includeExcess:true};
  E.applyPreset(state,p);
  assert.deepEqual(plain([...state.serviceSelected]),['total_price','order']);
  assert.deepEqual(plain(state.serviceOrder.slice(0,2)),['total_price','order'],'lo elegido va primero y en el orden guardado');
  assert.equal(state.serviceOrder.length,E.serviceColumns.length,'no se pierde ninguna columna del orden');
  assert.deepEqual([...state.tollSelected],['date'],'Peajes no se toca si la selección no lo guardó');
  assert.equal(state.extrasMode,'both');assert.equal(state.includeExcess,false);
  assert.equal(E.presetMatches(p,state),true);
  state.serviceSelected.add('driver');assert.equal(E.presetMatches(p,state),false);
});

test('el orden libre se guarda y se restaura tal cual; los guardados antes se agrupan una vez',()=>{
  const free=['total_price','order','plate'];
  const{E}=load({[PREFS]:JSON.stringify({current:{service:free,serviceOrder:free.concat(['date']),orderFree:true}})});
  assert.deepEqual(plain(E.restoreColumnOrder('current','service')).slice(0,4),['total_price','order','plate','date']);
  // Sin la marca de orden libre (guardado con la versión anterior) se agrupa por tipo, como se veía.
  const old=['total_price','order','plate','date'];
  const{E:E2}=load({[PREFS]:JSON.stringify({current:{service:old,serviceOrder:old}})});
  const got=plain(E2.restoreColumnOrder('current','service'));
  assert.deepEqual(got.filter(id=>old.includes(id)),['order','date','plate','total_price']);
});

test('el selector nuevo tiene dos paneles, buscador, grupos plegables y teclado',()=>{
  const src=fs.readFileSync(path.join(root,'operator-billing-export.js'),'utf8');
  for(const s of ['obx2-pick','obx2-order','data-obx-search','data-obx-quick','data-obx-preset','data-obx-save-preset','data-obx-fold','data-obx-group-all','aria-live="polite"'])assert.ok(src.includes(s),s);
  assert.doesNotMatch(src,/Seleccionar Todos|data-obx-sub-on/);
});

test('una selección guardada se edita: agregar y quitar columnas, cambiar el orden y renombrar',()=>{
  const{E}=load();
  const a=E.savePreset({name:'Contabilidad',service:['order','total_price'],toll:null,extrasMode:'sheet',includeExcess:true});
  const b=E.savePreset({name:'Peajes',service:null,toll:['date']});
  // Agrega «plate», quita «total_price», suma «date» primero y cambia adicionales/Excedentes.
  const up=E.updatePreset(a.id,{name:'Contabilidad',service:['date','order','plate'],toll:null,extrasMode:'inline',includeExcess:false});
  assert.equal(up.id,a.id,'misma selección, no una nueva');
  assert.deepEqual(plain(up.service),['date','order','plate']);
  assert.equal(up.extrasMode,'inline');assert.equal(up.includeExcess,false);
  assert.equal(E.readPresets().length,2);
  // Renombrar: sí a un nombre libre, no al de otra selección.
  assert.equal(E.updatePreset(a.id,{name:'Para el contador',service:['order']}).name,'Para el contador');
  assert.equal(E.updatePreset(a.id,{name:'peajes',service:['order']}),null,'el nombre ya lo usa otra');
  assert.equal(E.readPresets().find(p=>p.id===a.id).name,'Para el contador');
  // Sin nombre conserva el que tenía; un id inexistente no crea nada.
  assert.equal(E.updatePreset(a.id,{name:'  ',service:['plate']}).name,'Para el contador');
  assert.equal(E.updatePreset('nope',{name:'x',service:['order']}),null);
  assert.equal(E.readPresets().length,2);
  assert.deepEqual(plain(E.readPresets().find(p=>p.id===b.id).toll),['date'],'la otra no se toca');
});

test('el modal ofrece editar cada selección y guardar los cambios encima',()=>{
  const src=fs.readFileSync(path.join(root,'operator-billing-export.js'),'utf8');
  for(const s of ['data-obx-preset-edit','data-obx-edit-form','data-obx-edit-cancel','data-obx-preset-update','Guardar cambios'])assert.ok(src.includes(s),s);
});

test('solapas por Base: agrupa, ordena, deja «Sin base» al final y arma nombres válidos',()=>{
  const{E}=load();
  const rows=[{service_id:1,billing_base_name:'Rosario'},{service_id:2,billing_base_name:''},{service_id:3,billing_base_name:'Córdoba'},{service_id:4,billing_base_name:'Rosario'}];
  const g=E.baseGroups(rows);
  assert.deepEqual(plain(g.map(x=>[x.name,x.rows.length])),[['Córdoba',1],['Rosario',2],['Sin base',1]]);
  const taken=new Set(['servicios']);
  assert.equal(E.baseSheetName('Servicios',taken),'Servicios (2)','no pisa la hoja Servicios');
  assert.equal(E.baseSheetName('Base: Norte/Sur [1]',taken),'Base Norte Sur 1');
  const long='Una base con un nombre larguísimo de verdad';
  const a=E.baseSheetName(long,taken),b=E.baseSheetName(long,taken);
  assert.ok(a.length<=31&&b.length<=31);assert.notEqual(a,b);
  const sheets=E.baseSheets([{id:'order',header:'N° Orden'}],rows,false,new Set(['servicios']));
  assert.deepEqual(plain(sheets.map(s=>[s.name,s.kind,s.rows.length])),[['Córdoba','Servicios',1],['Rosario','Servicios',2],['Sin base','Servicios',1]]);
  const styled=E.styledSheets(sheets,'hoy');
  assert.match(styled[1].subtitle,/^Base Rosario · 2 servicios/);
  assert.equal(styled[1].kind,undefined);assert.equal(typeof styled[1].group,'function','lleva la franja de grupos como Servicios');
});

test('solapas por Base se guarda en las selecciones como los Excedentes',()=>{
  const{E}=load();
  const a=E.savePreset({name:'Por base',service:['order'],toll:null,extrasMode:'sheet',includeExcess:true,splitBases:true});
  assert.equal(a.splitBases,true);
  const b=E.savePreset({name:'Sin solapas',service:['order'],toll:null,extrasMode:'sheet',includeExcess:true});
  assert.equal(b.splitBases,false,'por defecto apagado');
  const state={serviceRows:[1],tollRows:[],serviceOrder:E.serviceColumns.map(c=>c.id),tollOrder:[],serviceSelected:new Set(),tollSelected:new Set(),extrasMode:'sheet',includeExcess:true,splitBases:false};
  E.applyPreset(state,a);assert.equal(state.splitBases,true);assert.equal(E.presetMatches(a,state),true);
  state.splitBases=false;assert.equal(E.presetMatches(a,state),false);
  const up=E.updatePreset(b.id,{name:'Sin solapas',service:['order'],toll:null,extrasMode:'sheet',includeExcess:true,splitBases:true});
  assert.equal(up.splitBases,true);
});

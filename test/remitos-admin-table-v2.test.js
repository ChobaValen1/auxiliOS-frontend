const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=f=>fs.readFileSync(f,'utf8');

/* Extrae del archivo el bloque que va desde `start` hasta `end` (sin incluirlo). */
const slice=(src,start,end)=>{const a=src.indexOf(start),b=src.indexOf(end,a);assert.ok(a>=0&&b>a,`no se encontró ${start}`);return src.slice(a,b);};

function remitosData(tables){
  const calls=[];
  const from=table=>{const q={_t:table,_f:[],select(){return q},order(){return q},limit(){return q},eq(k,v){q._f.push(['eq',k,v]);return q},in(k,v){q._f.push(['in',k,v]);return q},
    then(res){calls.push(table);res({data:(tables[table]||[]).filter(r=>q._f.every(([op,k,v])=>op==='eq'?r[k]===v:v.includes(r[k]))),error:null})}};return q;};
  const ctx={_db:{from},console};
  vm.runInNewContext(slice(read('supabase.js'),'let _rmxConceptos = null;','async function cargarRemitos(')+';this.api={_rmxEnriquecerServicios,_rmxResolverFiltros};',ctx);
  return {...ctx.api,calls};
}

const tables={
  service_concepts:[{concept_id:'c-liv',name:'Liviano',is_active:true},{concept_id:'c-uml',name:'UML',is_active:true}],
  operator_services:[{service_id:'s1',service_order_number:'302243',service_number:'SRV-1',primary_concept_id:'c-liv'},{service_id:'s2',service_order_number:'445',service_number:'SRV-2',primary_concept_id:'c-uml'}],
};

test('el tipo de servicio real sale del Servicio y los remitos sin servicio quedan "Sin clasificar"',async()=>{
  const {_rmxEnriquecerServicios}=remitosData(tables);
  const rows=await _rmxEnriquecerServicios([
    {operatorServiceId:'s1',tipo:'A definir por Operaciones',nroSrv:'302243'},
    {operatorServiceId:null,tipo:'Servicio de grúa',nroSrv:'99887'},
  ]);
  assert.equal(rows[0].tipoReal,'Liviano');
  assert.equal(rows[0].srvOrden,'302243');
  assert.equal(rows[0].srvNumero,'SRV-1');
  assert.equal(rows[1].tipoReal,'');
  assert.equal(rows[1].srvOrden,'99887');
});

test('sin acceso a Servicios no rompe la lista: usa lo guardado en el remito salvo textos genéricos',async()=>{
  const ctx={_db:{from:()=>{const q={select:()=>q,order:()=>q,in:()=>q,eq:()=>q,limit:()=>q,then:res=>res({data:null,error:{message:'permission denied'}})};return q;}},console};
  vm.runInNewContext(slice(read('supabase.js'),'let _rmxConceptos = null;','async function cargarRemitos(')+';this.fn=_rmxEnriquecerServicios;',ctx);
  const rows=await ctx.fn([{operatorServiceId:'s1',tipo:'Semipesado',nroSrv:'1'},{operatorServiceId:'s2',tipo:'A definir por Operaciones',nroSrv:'2'}]);
  assert.equal(rows[0].tipoReal,'Semipesado');
  assert.equal(rows[1].tipoReal,'');
});

test('el filtro de tipo se resuelve a los servicios de ese tipo',async()=>{
  const {_rmxResolverFiltros}=remitosData(tables);
  const f=await _rmxResolverFiltros({tipoServicio:'c-uml',estado:'todos'});
  assert.deepEqual([...f._serviceIds],['s2']);
  assert.equal(f._tipoNombre,'UML');
  const sin=await _rmxResolverFiltros({tipoServicio:'__sin__'});
  assert.equal(sin._serviceIds,undefined);
  const q=read('supabase.js');
  assert.match(q,/filtros\.tipoServicio === '__sin__'[\s\S]*?\.is\('operator_service_id', null\)/);
  assert.match(q,/filtros\.estado === 'revisar'[\s\S]*?addons_version', 2\)[\s\S]*?\(approved,adjusted\)/);
});

test('la tabla de Remitos muestra las columnas acordadas, con selección múltiple y sin KPIs',()=>{
  const html=read('Index.html');
  const head=slice(html,'id="tabla-remitos"','</thead>');
  const cols=[...head.matchAll(/<th[^>]*>([^<]*)</g)].map(m=>m[1].trim()).filter(Boolean);
  assert.deepEqual(cols,['N° Servicio','Fecha y hora','Cliente','Vehículo','Tipo de servicio','Cobrado en el lugar','Medio de pago','Estado','Acciones']);
  assert.match(head,/id="rmx-sel-all"/);
  assert.match(html,/id="rmx-bulk"[^>]*hidden/);
  assert.match(html,/exportarRemitosSeleccionados\(\)/);
  assert.doesNotMatch(html,/btn-export-remitos/,'Exportar vive solo en la barra de selección');
  assert.match(html,/_rmxSeleccionarTodoElFiltro\(\)/);
  assert.match(html,/id="rmx-chips"/);
  assert.doesNotMatch(html,/remitos-kpis|rkpi-/);
  assert.doesNotMatch(html,/modal-remito-nuevo-admin|btn-remito-nuevo-admin|btn-nuevo-remito-desktop/);
  const js=read('sigma.js');
  assert.match(js,/Sin clasificar/);
  assert.match(js,/btn-editar-remito/);
  assert.match(js,/function _rmxChip\(estado\)/);
  assert.match(js,/\['revisar','Por revisar'\]/);
  assert.match(read('supabase.js'),/\.btn-editar-remito'\)\)\s*\{ editarRemitoAdmin\(card\)/);
});

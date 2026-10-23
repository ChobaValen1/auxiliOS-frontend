const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function load(){const ctx={window:{},console:{warn(){}}};vm.runInNewContext(fs.readFileSync('ui/history-tolls-list-v1.js','utf8'),ctx);return ctx.window.AuxiliosHistoryTolls;}
const tolls=[{toll_name:'Alberti',total_amount:11200,quantity:1,payer_agent:'provider',display_status:'approved'},{toll_name:'Dellepiane Norte',total_amount:11000,quantity:1,payer_agent:'provider',display_status:'approved'}];
test('nombres e importes visibles en la lista sin abrir un detalle',()=>{const html=load().render({history_tolls:tolls});assert.match(html,/22.200/);assert.match(html,/Alberti/);assert.match(html,/Dellepiane Norte/);assert.match(html,/Prestadora · Aprobado/);assert.doesNotMatch(html,/<details|hidden|onclick/);});
test('previstos y rechazos se identifican; no presenta un error de carga como ausencia de peajes',()=>{
  const T=load(),html=T.render({history_tolls:[...tolls,{toll_name:'Previsto',total_amount:1000,display_status:'planned'},{toll_name:'Rechazado',total_amount:9999,display_status:'rejected'}]});
  assert.match(html,/23.200/);assert.match(html,/Incluye previstos/);assert.match(T.render({load_error:true}),/no disponibles/);assert.doesNotMatch(T.render({load_error:true}),/Sin peajes/);assert.match(T.render({history_tolls:[]}),/Sin peajes registrados/);
});
test('carga por lotes y mantiene intacto el efectivo del remito',async()=>{
  const T=load(),rows=Array.from({length:105},(_,i)=>({id:i+1,peaje:'0'})),calls=[];
  const db={rpc:async(name,args)=>{calls.push({name,args});return{data:{remitos:args.p_remito_ids.map(id=>({remito_id:id,history_tolls:tolls}))}};}};
  await T.enrichRemitos(rows,db);assert.equal(calls.length,2);assert.equal(calls[0].args.p_remito_ids.length,100);assert.equal(rows[104].historyTolls.history_tolls.length,2);assert.equal(rows[0].peaje,'0');
});
test('historial operativo carga finalizados/anulados sin consultar datos de activos',async()=>{
  const rows=[{service_id:'closed',status:'completed'},{service_id:'active',status:'assigned'}];let ids;
  await load().enrichServices(rows,{rpc:async(name,args)=>{ids=args.p_service_ids;return{data:{services:[{service_id:'closed',history_tolls:tolls}]}};}});
  assert.equal(ids.join(','),'closed');assert.equal(rows[0].historyTolls.history_tolls.length,2);assert.equal(rows[1].historyTolls,undefined);
});
test('la tabla y tarjetas reales consumen el dato enriquecido, no el campo imp_peaje',()=>{
  const s=fs.readFileSync('sigma.js','utf8'),ops=fs.readFileSync('operator-services.js','utf8'),html=fs.readFileSync('Index.html','utf8'),sb=fs.readFileSync('supabase.js','utf8');
  assert.match(s,/AuxiliosHistoryTolls\?\.render\(r\.historyTolls\)/);assert.match(s,/AuxiliosHistoryTolls\?\.render\(r\.historyTolls,\{heading:true\}\)/);assert.match(ops,/if\(S\.view==='history'\).*history_tolls/);assert.match(sb,/enrichRemitos\?\.\(remitos,_db\)/);assert.match(html,/<th class="rmx-col-tolls">Peajes<\/th>/);
});

/* Completed services without a remito are real services, never fabricated documents. */
(()=>{'use strict';
async function list(db,logs,{driver,period}={}){
 const ids=[...new Set(logs.map(j=>typeof j==='object'?j.log_id:j).filter(Boolean))],rows=new Map();
 if(!ids.length&&!driver)return[];
 for(let at=0;at<Math.max(ids.length,1);at+=500){
  const args={p_log_ids:ids.slice(at,at+500)};
  if(driver){args.p_driver=driver;args.p_period=period;}
  const {data,error}=await db.rpc('get_completed_journey_services_v1',args);if(error)throw error;
  for(const row of data||[])rows.set(String(row.operator_service_id),row);
 }
 return [...rows.values()];
}
function merge(remitos,completed){
 const seen=new Set(),result=[];
 for(const row of [...remitos,...completed]){
  const id=row.operator_service_id&&String(row.operator_service_id);
  if(id&&seen.has(id))continue;if(id)seen.add(id);result.push(row);
 }
 return result;
}
function trip(r){return{...r,trip_id:null,service_id:r.operator_service_id,origin:r.origen,destination:r.destino,
 km_traveled:r.km_reales,fecha_hora_inicio:r.created_at_device,fecha_hora_fin:r.completed_at,
 importe_total:r.cash_expected,imp_peaje:0,imp_excedente:0,no_remito:true};}
window.CompletedJourneyServices={list,merge,trip};
})();

/* AuxiliOS · Nuevo Servicio reactivo · compatibilidad operativa */
(()=>{'use strict';
const O=()=>window.OperatorServices;
const W=()=>O()?.S?.wizard||null;
const db=()=>typeof _db!=='undefined'?_db:null;
let availability=null,loading=null;

function syncVehicle(){
 const w=W();if(!w)return;
 const make=String(w.data.vehicle_make||'').trim();
 const model=String(w.data.vehicle_model||'').trim();
 window.osSetServicio?.('vehicle_make_model',[make,model].filter(Boolean).join(' '));
 window.OperatorServiceWorkspaceReactiveV1?.sync?.();
}
async function resources(){
 if(availability)return availability;
 if(loading)return loading;
 loading=(async()=>{
  try{const {data,error}=await db()?.rpc('get_operator_resource_availability')||{};if(error)throw error;availability=data||{drivers:[],trucks:[]};}
  catch(error){console.warn('[Nuevo Servicio · pairing]',error);availability={drivers:[],trucks:[]};}
  finally{loading=null;}
  return availability;
 })();
 return loading;
}
function setPair(driverId,truckId){
 window.osSetServicio?.('assigned_driver_id',driverId||'');
 window.osSetServicio?.('assigned_truck_id',truckId||'');
 const driver=document.getElementById('osv4-driver');if(driver)driver.value=driverId||'';
 const truck=document.getElementById('osv4-truck');if(truck)truck.value=truckId||'';
 window.OperatorServiceWorkspaceReactiveV1?.sync?.();
}
async function pair(kind,value){
 if(!value||!W())return;
 const data=await resources();
 if(kind==='driver'){
  const driver=(data?.drivers||[]).find(x=>String(x.user_id)===String(value));
  const paired=driver?.active_truck_id;if(!paired)return;
  const current=W().data.assigned_truck_id;
  if(current&&String(current)!==String(paired)&&!confirm(`${driver.full_name||'El chofer'} tiene jornada abierta en el móvil ${driver.truck_label||paired}. ¿Reemplazar el móvil seleccionado?`))return;
  setPair(value,paired);
 }else{
  const truck=(data?.trucks||[]).find(x=>String(x.truck_id)===String(value));
  const paired=truck?.active_driver_id;if(!paired)return;
  const current=W().data.assigned_driver_id;
  if(current&&String(current)!==String(paired)&&!confirm(`El móvil ${truck.numero_interno||truck.plate||value} tiene jornada abierta con ${truck.driver_name||'otro chofer'}. ¿Reemplazar el chofer seleccionado?`))return;
  setPair(paired,value);
 }
}
function onInput(event){const id=event.target?.id;if(id==='osv4-make'||id==='osv4-model')queueMicrotask(syncVehicle);}
function onChange(event){const kind=event.target?.dataset?.assignment;if(kind)queueMicrotask(()=>pair(kind,event.target.value));}
document.addEventListener('input',onInput);
document.addEventListener('change',onChange);
window.addEventListener('auxilios:new-service-opened',()=>{availability=null;});
window.OperatorServiceWorkspaceBehaviorV1={resources,refreshResources:()=>{availability=null;return resources();}};
})();

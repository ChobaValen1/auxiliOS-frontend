/* Driver-owned service history, including closures without a remito. */
(()=>{'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={finalizado:'Finalizado',activado:'Activado',anulado:'Anulado',firmado:'Firmado',pendiente:'Pendiente'};
const reasons={absent_or_not_towable:'Socio ausente / vehículo no apto',provider:'La prestadora lo dio de baja',us:'Lo dimos de baja nosotros',other:'Otro',duplicate:'Cargado repetido',entry_error:'Error de carga',customer_cancelled:'El cliente canceló'};
function mapEntry(item,mapRemito,formatDate){
  const s=item.service,r=item.remito;
  const row=r?mapRemito(r):{id:null,nro:'',estado:'cerrado_admin',peaje:0,excedente:0,otros:0,pago:'—'};
  return {...row,historyEntry:true,historyKey:item.key,historyState:item.history_state,historyService:s,
    historyIntake:item.intake,historyTolls:item.tolls,historyRemito:r?{...row}:null,
    fecha:formatDate(item.occurred_at),historyAt:item.occurred_at,
    operatorServiceId:s?.service_id||row.operatorServiceId,
    srvOrden:s?.service_order_number||row.nroSrv||'',srvNumero:s?.service_number||'',
    cliente:s?.customer_name||row.cliente||'',patente:s?.vehicle_plate||row.patente||'',
    marca:s?.vehicle_make_model||row.marca||'',tipoReal:s?.concept_name||row.tipo||'',
    origen:s?.origin||row.origen||'',destino:s?.destination||row.destino||''};
}
async function load(db,{page,pageSize,filtros},mapRemito,formatDate){
  const {data,error}=await db.rpc('list_driver_service_history_v1',{p_page:page,p_page_size:pageSize,p_filters:filtros});
  if(error)throw new Error(error.message||'No se pudo cargar el historial');
  if(!data||!Array.isArray(data.items))throw new Error('El historial no devolvió datos válidos');
  return {remitos:data.items.map(item=>mapEntry(item,mapRemito,formatDate)),
    drafts:(data.drafts||[]).map(mapRemito),total:Number(data.total)||0,page:Number(data.page)||1};
}
function stateHTML(row){
  const state=row.historyState;
  const label=state==='activado'&&row.historyService?.activation_kind==='movement'?'Activado · Movida'
    :state==='activado'&&row.historyService?.activation_kind==='origin'?'Activado · Origen':labels[state]||'Registrado';
  return `<span class="rmx-state ${state==='anulado'?'is-void':state==='activado'?'is-activated':'is-ok'}">${esc(label)}</span>`;
}
let dialog,opener;
function close(){dialog?.close();if(opener?.isConnected)opener.focus({preventScroll:true});}
function open(row){
  if(!dialog){
    dialog=document.createElement('dialog');dialog.className='dsh-dialog';dialog.setAttribute('aria-labelledby','dsh-title');
    document.body.append(dialog);dialog.addEventListener('click',e=>{if(e.target===dialog||e.target.closest('[data-dsh-close]'))close();});
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  }
  opener=document.activeElement;
  const s=row.historyService||row.historyIntake||{},at=v=>v?new Date(v).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',dateStyle:'short',timeStyle:'short'}):'—';
  const reason=row.historyState==='anulado'?s.cancellation_reason_detail||reasons[s.cancellation_reason_code]
    :s.activation_reason_detail||reasons[s.activation_reason_code];
  const field=(label,value)=>value?`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`:'';
  dialog.innerHTML=`<header><div><small>Historial de servicios</small><h2 id="dsh-title">${esc(row.srvOrden||row.srvNumero||row.nro||'Servicio')}</h2>${stateHTML(row)}</div><button type="button" data-dsh-close aria-label="Cerrar">×</button></header>
    <div class="dsh-body"><dl>${field('Fecha de cierre / registro',at(row.historyAt))}${field('Móvil',s.truck_label)}${field('Cliente',row.cliente)}${field('Vehículo',[row.patente,row.marca].filter(Boolean).join(' · '))}${field('Servicio',row.tipoReal)}${field('Origen',row.origen)}${field('Destino',row.destino)}${field('Motivo',reason)}</dl>
    ${window.AuxiliosHistoryTolls?.render(row.historyTolls,{heading:true})||''}
    <p class="dsh-document">${row.historyRemito?'Remito '+esc(row.nro||'registrado'):'Servicio registrado sin remito.'}</p></div>
    <footer>${row.historyRemito?'<button type="button" data-dsh-remito>Ver remito</button>':''}<button type="button" data-dsh-close>Cerrar</button></footer>`;
  dialog.querySelector('[data-dsh-remito]')?.addEventListener('click',()=>{
    close();window.verRemitoModal({...row.historyRemito,historyEntry:false});
  });
  if(!dialog.open)dialog.showModal();dialog.querySelector('[data-dsh-close]').focus();
}
window.DriverServiceHistory={load,mapEntry,stateHTML,open};
})();

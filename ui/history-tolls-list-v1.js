/* Historial list data and presentation. Separate from customer collections. */
(()=>{'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=v=>Number(v)||0;
const money=v=>'$ '+amount(v).toLocaleString('es-AR',{maximumFractionDigits:2});
const statuses={approved:'Aprobado',reported:'Informado',planned:'Previsto',rejected:'Rechazado'};
async function enrich(rows,db,kind){
  const selected=kind==='services'?rows.filter(r=>['completed','cancelled'].includes(r.status)):rows;
  const key=kind==='services'?'service_id':'id',ids=[...new Set(selected.map(r=>r[key]).filter(Boolean))],found=new Map();
  for(let offset=0;offset<ids.length;offset+=100){
    const chunk=ids.slice(offset,offset+100),args=kind==='services'?{p_service_ids:chunk}:{p_remito_ids:chunk.map(Number)};
    try{
      const {data,error}=await db.rpc('get_history_list_tolls_v1',args);if(error)throw error;
      for(const item of data?.[kind]||[])found.set(String(item[kind==='services'?'service_id':'remito_id']),item);
    }catch(error){console.warn('[Historial peajes]',error.message||'No se pudo cargar');}
  }
  for(const row of selected)row.historyTolls=found.get(String(row[key]))||{load_error:true};
  return rows;
}
function render(data,{heading=false}={}){
  if(!data||data.load_error)return'<div class="hlt hlt-error">Peajes no disponibles</div>';
  const rows=Array.isArray(data.history_tolls)?data.history_tolls:[];
  if(!rows.length&&amount(data.accepted_toll_total)>0)return`<div class="hlt">${heading?'<span class="hlt-heading">Peajes</span>':''}<strong>${money(data.accepted_toll_total)}</strong><small>Aprobados · sin desglose</small></div>`;
  if(!rows.length)return'<div class="hlt hlt-empty">Sin peajes registrados</div>';
  const total=rows.filter(t=>t.display_status!=='rejected').reduce((n,t)=>n+amount(t.total_amount),0);
  const planned=rows.some(t=>t.display_status==='planned');
  return`<div class="hlt">${heading?'<span class="hlt-heading">Peajes</span>':''}<strong class="hlt-total">${money(total)}</strong>${planned?'<small class="hlt-note">Incluye previstos</small>':''}<ul class="hlt-list">${rows.map(t=>{
    const payer=t.payer_agent==='provider'?'Prestadora':t.payer_agent==='customer'?'Cliente':'Responsable sin informar';
    const qty=amount(t.quantity)>1?' ×'+amount(t.quantity):'';
    return`<li><span class="hlt-name">${esc(t.toll_name||'Peaje')}${qty}</span><span class="hlt-amount">${money(t.total_amount)}</span><small>${esc(payer)} · ${statuses[t.display_status]||'Informado'}</small></li>`;
  }).join('')}</ul></div>`;
}
window.AuxiliosHistoryTolls={enrichRemitos:(rows,db)=>enrich(rows,db,'remitos'),enrichServices:(rows,db)=>enrich(rows,db,'services'),render};
})();

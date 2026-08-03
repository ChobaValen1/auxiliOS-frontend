/* AuxiliOS · Fase 2B · Mesa operativa */
(()=>{'use strict';
const O=window.OperatorServices=window.OperatorServices||{};
const S=O.S={services:[],companies:[],branches:[],drivers:[],trucks:[],concepts:[],selected:null,items:[],events:[],loading:false,timer:null,wizard:null};
const role=()=>typeof PERFIL_USUARIO==='undefined'?'':(PERFIL_USUARIO?.roles?.name||PERFIL_USUARIO?.role||'');
const canRead=()=>['administracion','supervision'].includes(role());
const canManage=()=>['administracion','supervision'].includes(role());
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number(String(v??'').replace(',','.'))||0;
const money=(v,c='ARS')=>new Intl.NumberFormat('es-AR',{style:'currency',currency:c,maximumFractionDigits:2}).format(num(v));
const fmtDate=v=>v?new Date(v).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const notify=(m,t='info')=>typeof toast==='function'?toast(m,t):console.log(m);
const open=id=>typeof openModal==='function'?openModal(id):document.getElementById(id)?.classList.add('open');
const close=id=>typeof closeModal==='function'?closeModal(id):document.getElementById(id)?.classList.remove('open');
const statusMeta={
 pending:{label:'Pendiente',tone:'amber',icon:'○'},assigned:{label:'Asignado',tone:'blue',icon:'●'},en_route:{label:'En camino',tone:'blue',icon:'➜'},at_origin:{label:'En origen',tone:'violet',icon:'⌖'},loaded:{label:'Vehículo cargado',tone:'violet',icon:'↑'},at_destination:{label:'En destino',tone:'green',icon:'◆'},completed:{label:'Finalizado',tone:'green',icon:'✓'},cancelled:{label:'Cancelado',tone:'red',icon:'×'}
};
const priorityMeta={normal:{label:'Normal',tone:'muted'},urgent:{label:'Urgente',tone:'amber'},critical:{label:'Crítica',tone:'red'}};
const company=id=>S.companies.find(x=>x.company_id===id);
const branch=id=>S.branches.find(x=>x.branch_id===id);
const driver=id=>S.drivers.find(x=>x.user_id===id);
const truck=id=>S.trucks.find(x=>String(x.truck_id)===String(id));
const concept=id=>S.concepts.find(x=>x.concept_id===id);
const service=id=>S.services.find(x=>x.service_id===id);

function inject(){
 if(document.getElementById('screen-operaciones'))return;
 const css=document.createElement('link');css.id='operator-services-css';css.rel='stylesheet';css.href='/operator-services.css';document.head.appendChild(css);
 const bottom=document.querySelector('.sidenav .nav-bottom');
 bottom?.insertAdjacentHTML('beforebegin',`<div class="nav-item" id="nav-operaciones" onclick="goTo('operaciones')" style="display:none"><span class="nav-icon">📡</span><span class="nav-label">Servicios</span></div>`);
 document.querySelector('.content')?.insertAdjacentHTML('beforeend',`<div class="screen" id="screen-operaciones">
  <div class="os-head"><div><div class="os-eyebrow">Centro de despacho</div><h2 id="os-title">Mesa operativa</h2><div class="os-sub" id="os-subtitle">Pedidos, asignaciones y seguimiento en tiempo real</div></div><div class="os-head-actions"><button class="btn btn-ghost" onclick="cargarServiciosOperador()">↻ Actualizar</button><button class="btn btn-primary os-manage" onclick="abrirNuevoServicio()">＋ Nuevo servicio</button></div></div>
  <div class="os-kpis" id="os-kpis"></div>
  <div class="os-toolbar"><input class="form-input" id="os-q" placeholder="Buscar servicio, patente, cliente u origen" oninput="renderServiciosOperador()"><select class="form-input" id="os-status" onchange="renderServiciosOperador()"><option value="all">Todos los estados</option>${Object.entries(statusMeta).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select><select class="form-input os-manage" id="os-company" onchange="renderServiciosOperador()"><option value="all">Todas las empresas</option></select></div>
  <div class="os-board" id="os-board"><div class="os-empty">Cargando servicios…</div></div>
 </div>`);
 document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop os-modal" id="modal-operador-servicio"><div class="os-detail-shell" id="os-detail-shell"></div></div>
 <div class="modal-backdrop os-modal" id="modal-operador-wizard"><div class="os-wizard-shell" id="os-wizard-shell"></div></div>`);
}

function applyRole(){
 const allowed=canRead();
 const nav=document.getElementById('nav-operaciones');if(nav)nav.style.display=allowed?'':'none';
 const screen=document.getElementById('screen-operaciones');if(screen&&!allowed)screen.classList.remove('active');
 document.querySelectorAll('.os-manage').forEach(x=>x.style.display=canManage()?'':'none');
}

async function loadBase(){
 if(!canRead())return;
 const queries=[_db.from('trucks').select('truck_id,plate,brand,model,numero_interno,status').eq('status','active').order('numero_interno'),_db.from('service_concepts').select('concept_id,code,name,icon').eq('is_active',true).order('sort_order')];
 if(canManage())queries.push(_db.from('companies').select('company_id,legal_name,trade_name,status').eq('status','active').order('legal_name'),_db.from('company_branches').select('branch_id,company_id,name,branch_code,is_primary,is_active').eq('is_active',true).order('is_primary',{ascending:false}).order('name'),_db.from('users').select('user_id,full_name,phone,is_active,roles(name)').eq('is_active',true).order('full_name'));
 const rows=await Promise.all(queries);if(rows.some(x=>x.error))throw new Error('No se pudieron cargar los datos operativos.');
 S.trucks=rows[0].data||[];S.concepts=rows[1].data||[];
 if(canManage()){S.companies=rows[2].data||[];S.branches=rows[3].data||[];S.drivers=(rows[4].data||[]).filter(x=>x.roles?.name==='chofer');}
 const sel=document.getElementById('os-company');if(sel&&canManage())sel.innerHTML='<option value="all">Todas las empresas</option>'+S.companies.map(x=>`<option value="${x.company_id}">${esc(x.trade_name||x.legal_name)}</option>`).join('');
}

async function loadServices(){
 if(!canRead()||S.loading)return;S.loading=true;
 try{
  if(!S.concepts.length)await loadBase();
  const {data,error}=await _db.rpc('list_operator_services',{p_limit:300});
  if(error)throw error;S.services=Array.isArray(data)?data:[];renderBoard();applyRole();
 }catch(e){notify(e.message||'No se pudieron cargar los servicios','error');const b=document.getElementById('os-board');if(b)b.innerHTML='<div class="os-empty">No se pudieron cargar los servicios.</div>';}
 finally{S.loading=false;}
}

function filtered(){
 const q=(document.getElementById('os-q')?.value||'').toLowerCase().trim(),st=document.getElementById('os-status')?.value||'all',co=document.getElementById('os-company')?.value||'all';
 return S.services.filter(s=>(st==='all'||s.status===st)&&(co==='all'||s.company_id===co)&&(!q||`${s.service_number} ${s.vehicle_plate||''} ${s.customer_name||''} ${s.origin} ${s.destination} ${company(s.company_id)?.legal_name||s.company_name||''}`.toLowerCase().includes(q)));
}
function groupFor(s){if(s.status==='pending')return'pending';if(s.status==='assigned')return'assigned';if(['en_route','at_origin','loaded','at_destination'].includes(s.status))return'active';return'closed';}
function renderKpis(rows){
 const today=new Date().toISOString().slice(0,10),active=rows.filter(x=>['en_route','at_origin','loaded','at_destination'].includes(x.status)).length;
 const vals=[['Pendientes',rows.filter(x=>x.status==='pending').length,'amber'],['Asignados',rows.filter(x=>x.status==='assigned').length,'blue'],['En curso',active,'violet'],['Finalizados hoy',rows.filter(x=>x.status==='completed'&&String(x.completed_at||'').slice(0,10)===today).length,'green']];
 const el=document.getElementById('os-kpis');if(el)el.innerHTML=vals.map(([l,v,t])=>`<div class="os-kpi ${t}"><small>${l}</small><b>${v}</b></div>`).join('');
}
function card(s){
 const sm=statusMeta[s.status]||statusMeta.pending,pm=priorityMeta[s.priority]||priorityMeta.normal,c=company(s.company_id),d=driver(s.assigned_driver_id),t=truck(s.assigned_truck_id),p=concept(s.primary_concept_id);
 const companyName=c?.trade_name||c?.legal_name||s.company_name||'Servicio asignado',conceptName=p?.name||s.concept_name||s.pricing_snapshot?.components?.[0]?.service_name||'Servicio',conceptIcon=p?.icon||s.concept_icon||'◆',driverName=d?.full_name||s.driver_name,truckName=t?.numero_interno||t?.plate||s.truck_label;
 return `<article class="os-card priority-${s.priority}" onclick="abrirDetalleServicio('${s.service_id}')"><div class="os-card-top"><span class="os-number">${esc(s.service_number)}</span><span class="os-priority ${pm.tone}">${pm.label}</span></div><div class="os-company">${esc(companyName)}</div><div class="os-concept">${esc(conceptIcon)} ${esc(conceptName)}</div><div class="os-route"><span>${esc(s.origin)}</span><i>→</i><span>${esc(s.destination)}</span></div><div class="os-card-meta"><span>🕒 ${fmtDate(s.scheduled_for)}</span>${s.vehicle_plate?`<span>🚗 ${esc(s.vehicle_plate)}</span>`:''}</div><div class="os-assignment">${driverName||truckName?`<span>👤 ${esc(driverName||'Sin chofer')}</span><span>🚛 ${esc(truckName||'Sin móvil')}</span>`:'<span class="os-unassigned">Sin asignar</span>'}</div><div class="os-card-foot"><span class="os-status ${sm.tone}">${sm.icon} ${sm.label}</span>${canManage()?`<b>${money(s.company_estimated_total,s.currency)}</b>`:''}</div></article>`;
}
function renderBoard(){
 if(!canRead())return;
 const rows=filtered();renderKpis(S.services);const el=document.getElementById('os-board');if(!el)return;
 if(!rows.length){el.innerHTML='<div class="os-empty">No hay servicios para mostrar.</div>';return;}
 const defs=[['pending','Pendientes'],['assigned','Asignados'],['active','En curso'],['closed','Finalizados']];
 el.innerHTML=defs.map(([k,l])=>{const list=rows.filter(x=>groupFor(x)===k);return`<section class="os-column"><div class="os-column-head"><span>${l}</span><b>${list.length}</b></div><div class="os-column-list">${list.length?list.map(card).join(''):'<div class="os-column-empty">Sin servicios</div>'}</div></section>`}).join('');
}

async function openDetail(id){
 if(!canRead())return notify('Sin permiso para consultar servicios','error');
 const existing=service(id);if(!existing)return;S.selected=id;
 const {data,error}=await _db.rpc('get_operator_service_detail',{p_service_id:id});
 if(error)return notify(error.message||'No se pudo cargar el servicio','error');
 const current=data?.service||existing;S.services=S.services.map(x=>x.service_id===id?{...x,...current}:x);S.items=Array.isArray(data?.items)?data.items:[];S.events=Array.isArray(data?.events)?data.events:[];renderDetail(current);open('modal-operador-servicio');
}
function renderDetail(s){
 if(!canRead())return;
 const c=company(s.company_id),b=branch(s.branch_id),d=driver(s.assigned_driver_id),t=truck(s.assigned_truck_id),sm=statusMeta[s.status]||statusMeta.pending;
 const components=S.items.length?S.items:(s.pricing_snapshot?.components||[]),companyName=c?.trade_name||c?.legal_name||s.company_name||'Servicio asignado',branchName=b?.name||s.branch_name||'General',driverName=d?.full_name||s.driver_name||'—',truckName=t?.numero_interno||t?.plate||s.truck_label||'—';
 const conceptRows=`${components.map(x=>`<div><span>${esc(x.service_name)}${num(x.quantity)!==1?` × ${num(x.quantity)}`:''}</span><b>${money(x.subtotal,s.currency)}</b></div>`).join('')}${(s.pricing_snapshot?.surcharges||[]).map(x=>`<div><span>Recargo ${esc(String(x.rule_type).replaceAll('_',' '))}</span><b>${money(x.amount,s.currency)}</b></div>`).join('')}${num(s.toll_total)?`<div><span>Peajes</span><b>${money(s.toll_total,s.currency)}</b></div>`:''}<div class="total"><span>Total empresa</span><b>${money(s.company_estimated_total,s.currency)}</b></div>${num(s.copay_total)?`<div><span>Copago cliente</span><b>${money(s.copay_total,s.currency)}</b></div>`:''}`;
 document.getElementById('os-detail-shell').innerHTML=`<div class="os-detail-head"><div><div class="os-eyebrow">${esc(s.service_number)}</div><h3>${esc(companyName)}</h3><div class="os-detail-meta"><span class="os-status ${sm.tone}">${sm.icon} ${sm.label}</span><span>${fmtDate(s.scheduled_for)}</span></div></div><button class="os-close" onclick="cerrarDetalleServicio()">×</button></div>
 <div class="os-detail-body"><div class="os-detail-grid"><section class="os-panel"><h4>Servicio</h4><div class="os-info-grid"><div><small>Prioridad</small><b>${priorityMeta[s.priority]?.label||s.priority}</b></div><div><small>Sucursal</small><b>${esc(branchName)}</b></div><div><small>N° prestación</small><b>${esc(s.service_order_number||'—')}</b></div><div><small>Orden de compra</small><b>${esc(s.purchase_order_number||'—')}</b></div></div><div class="os-route large"><span>${esc(s.origin)}</span><i>→</i><span>${esc(s.destination)}</span></div></section>
 <section class="os-panel"><h4>Cliente y vehículo</h4><div class="os-info-grid"><div><small>Cliente</small><b>${esc(s.customer_name||'—')}</b></div><div><small>Teléfono</small><b>${esc(s.customer_phone||'—')}</b></div><div><small>Patente</small><b>${esc(s.vehicle_plate||'—')}</b></div><div><small>Vehículo</small><b>${esc(s.vehicle_make_model||'—')}</b></div></div></section></div>
 <section class="os-panel"><div class="os-panel-head"><h4>Asignación</h4>${s.assigned_at?`<small>Asignado ${fmtDate(s.assigned_at)}</small>`:''}</div>${assignmentEditor(s)}</section>
 <div class="os-detail-grid"><section class="os-panel"><h4>Conceptos</h4><div class="os-breakdown">${conceptRows}</div></section>
 <section class="os-panel"><h4>Indicaciones</h4><p>${esc(s.driver_instructions||'Sin instrucciones especiales.')}</p>${s.operator_notes?`<small>Nota interna</small><p>${esc(s.operator_notes)}</p>`:''}${s.driver_notes?`<small>Última nota del chofer</small><p>${esc(s.driver_notes)}</p>`:''}</section></div>
 <section class="os-panel"><h4>Historial</h4><div class="os-timeline">${S.events.length?S.events.map(e=>`<div><i></i><span><b>${esc(e.event_type==='created'?'Servicio creado':e.event_type==='assignment'?'Asignación actualizada':statusMeta[e.to_status]?.label||'Actualización')}</b><small>${fmtDate(e.created_at)}${e.notes?' · '+esc(e.notes):''}</small></span></div>`).join(''):'<div class="os-muted">Sin eventos.</div>'}</div></section></div>
 <div class="os-detail-footer">${s.status!=='completed'&&s.status!=='cancelled'?`<button class="btn btn-ghost danger" onclick="cancelarServicioOperador('${s.service_id}')">Cancelar servicio</button>`:'<span></span>'}<div class="os-actions"><button class="btn btn-ghost" onclick="cerrarDetalleServicio()">Cerrar</button></div></div>`;
}
function assignmentEditor(s){return`<div class="os-assign-grid"><div class="os-field"><label>Chofer</label><select class="form-input" id="os-detail-driver"><option value="">Sin asignar</option>${S.drivers.map(x=>`<option value="${x.user_id}" ${s.assigned_driver_id===x.user_id?'selected':''}>${esc(x.full_name)}</option>`).join('')}</select></div><div class="os-field"><label>Móvil</label><select class="form-input" id="os-detail-truck"><option value="">Sin asignar</option>${S.trucks.map(x=>`<option value="${x.truck_id}" ${String(s.assigned_truck_id)===String(x.truck_id)?'selected':''}>${esc(x.numero_interno||x.plate)} · ${esc(x.plate)}</option>`).join('')}</select></div><button class="btn btn-primary" onclick="guardarAsignacionServicio('${s.service_id}')">Guardar asignación</button></div>`}
async function saveAssignment(id){
 if(!canManage())return notify('Sin permiso para modificar servicios','error');
 const s=service(id),d=document.getElementById('os-detail-driver')?.value||null,t=document.getElementById('os-detail-truck')?.value||null;if((d&&!t)||(!d&&t))return notify('Seleccioná chofer y móvil juntos','warning');if(['en_route','at_origin','loaded','at_destination','completed'].includes(s.status)&&(!d||!t))return notify('No se puede desasignar un servicio en curso','warning');
 const patch={assigned_driver_id:d,assigned_truck_id:t?Number(t):null,status:d?(s.status==='pending'?'assigned':s.status):'pending'};const {error}=await _db.from('operator_services').update(patch).eq('service_id',id);if(error)return notify(error.message,'error');notify('Asignación actualizada','success');await loadServices();await openDetail(id);
}
async function driverAdvance(){return notify('El seguimiento operativo para choferes no está habilitado','error');}
async function cancelService(id){
 if(!canManage())return notify('Sin permiso para cancelar servicios','error');
 const reason=prompt('Motivo de cancelación:');if(!reason?.trim())return;const {error}=await _db.from('operator_services').update({status:'cancelled',cancellation_reason:reason.trim()}).eq('service_id',id);if(error)return notify(error.message,'error');notify('Servicio cancelado','success');closeDetail();await loadServices();
}
function closeDetail(){close('modal-operador-servicio');S.selected=null;}

function hookNavigation(){
 if(window.__osNavHook||typeof window.goTo!=='function')return false;
 const base=window.goTo;
 window.goTo=(name,...args)=>{
  if(name==='operaciones'&&!canRead())return notify('Sin permiso para acceder a Servicios','error');
  const r=base(name,...args);if(name==='operaciones')loadServices();return r;
 };
 window.__osNavHook=true;return true;
}
function init(){inject();let n=0;const timer=setInterval(()=>{applyRole();hookNavigation();if(canRead()&&typeof _db!=='undefined'){loadBase().then(loadServices).catch(e=>console.warn('[Operaciones]',e.message));clearInterval(timer);}else if(++n>80)clearInterval(timer);},250);S.timer=setInterval(()=>{if(canRead()&&document.getElementById('screen-operaciones')?.classList.contains('active'))loadServices()},60000);}
Object.assign(O,{role,canRead,canManage,esc,num,money,fmtDate,statusMeta,priorityMeta,company,branch,driver,truck,concept,service,loadBase,loadServices,renderBoard,openDetail,closeDetail});
Object.assign(window,{cargarServiciosOperador:loadServices,renderServiciosOperador:renderBoard,abrirDetalleServicio:openDetail,cerrarDetalleServicio:closeDetail,guardarAsignacionServicio:saveAssignment,avanzarServicioChofer:driverAdvance,cancelarServicioOperador:cancelService});
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();
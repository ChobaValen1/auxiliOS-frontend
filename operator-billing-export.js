/* AuxiliOS · Facturación · exportación XLSX configurable */
(()=>{'use strict';
const E=window.OperatorBillingExcel=window.OperatorBillingExcel||{};
const billing=()=>window.OperatorBilling||null;
const state=()=>billing()?.S||null;
const excel=()=>window.AuxiliosExcelExport||null;
const db=()=>typeof _db!=='undefined'?_db:null;
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const round2=v=>Math.round((num(v)+Number.EPSILON)*100)/100;
const text=v=>v==null?'':String(v).trim();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const notify=(m,t='info')=>typeof window.toast==='function'?window.toast(m,t):console[t==='error'?'error':'log'](m);
const localDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function parts(v){if(!v)return{date:'',time:''};const p=new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(v)),get=t=>p.find(x=>x.type===t)?.value||'';return{date:`${get('day')}/${get('month')}/${get('year')}`,time:`${get('hour')}:${get('minute')}`};}
const dateTime=v=>{const p=parts(v);return[p.date,p.time].filter(Boolean).join(' ')};
const statusLabel=v=>v==='reviewed'?'REVISADO':v==='pending'?'PENDIENTE':String(v||'').toUpperCase();
const tabLabel=v=>v==='reviewed'?'Revisados':v==='tolls'?'Peajes':'Pendientes';
function companyLabel(S){if(!S?.company)return'Todas';const found=S.filters?.companies?.find(x=>String(x.company_id)===String(S.company));return found?.company_name||'Prestadora';}
function normalizeProvince(v){return text(v).replace(/^Provincia\s+de\s+/i,'').replace(/^Provincia\s+/i,'').replace(/^Ciudad Autónoma de Buenos Aires$/i,'CABA').trim();}
function parseAddress(value){const raw=text(value);if(!raw)return{street:'',locality:'',province:''};let p=raw.split(',').map(x=>x.trim()).filter(Boolean),province='',locality='',street='';if(p.length>1&&/(provincia|caba|ciudad autónoma|buenos aires|catamarca|chaco|chubut|córdoba|corrientes|entre ríos|formosa|jujuy|la pampa|la rioja|mendoza|misiones|neuquén|río negro|salta|san juan|san luis|santa cruz|santa fe|santiago del estero|tierra del fuego|tucumán)$/i.test(p[p.length-1]))province=normalizeProvince(p.pop());if(p.length>=2){locality=p.pop().replace(/^[A-Z]?\d{4}\s+/i,'').trim();street=p.join(', ');}else if(p.length===1){if(province)locality=p[0].replace(/^[A-Z]?\d{4}\s+/i,'').trim();else street=p[0];}if(!street&&!locality)street=raw;return{street,locality,province};}
function vehicleParts(v){const raw=text(v).replace(/\s+/g,' ');if(!raw)return{make:'',model:''};const [make,...rest]=raw.split(' ');return{make,model:rest.join(' ')};}
const quote=r=>r?.quote&&typeof r.quote==='object'?r.quote:{};
const comps=r=>Array.isArray(quote(r).components)?quote(r).components:[];
const surcharges=r=>Array.isArray(quote(r).surcharges)?quote(r).surcharges:[];
const movementComponents=r=>comps(r).filter(x=>x?.role==='movement'||x?.role==='primary'||x?.component_type==='movement');
const distanceComponents=r=>comps(r).filter(x=>x?.role==='distance'||x?.component_type==='distance');
const secondaryComponents=r=>comps(r).filter(x=>x?.role==='secondary');
const sum=(rows,key)=>round2((rows||[]).reduce((a,x)=>a+num(x?.[key]),0));
function distanceAmounts(r){const rows=distanceComponents(r),total=sum(rows,'subtotal'),specific=rows.some(x=>x?.terrain==='asphalt'||x?.terrain==='gravel');if(specific)return{asphalt:sum(rows.filter(x=>x.terrain==='asphalt'),'subtotal'),gravel:sum(rows.filter(x=>x.terrain==='gravel'),'subtotal'),total};const asphalt=num(r.asphalt_km),gravel=num(r.gravel_km),km=asphalt+gravel;if(total<=0||km<=0)return{asphalt:0,gravel:0,total};const a=round2(total*asphalt/km);return{asphalt:a,gravel:round2(total-a),total};}
function surchargePercent(r){const s=surcharges(r).find(x=>x?.calculation_mode==='percentage');return s?num(s.configured_value):'';}
function observations(r){return [...new Set([r.operator_notes,r.driver_notes,r.remito_observations].map(text).filter(Boolean))].join(' | ');}
function specialText(r,field){return secondaryComponents(r).map(x=>`${text(x.service_name||x.service_code||'Servicio especial')}: ${field==='quantity'?num(x.quantity):field==='unit_price'?num(x.unit_price):num(x.subtotal)}`).join(' | ');}
function serviceColumn(id,header,width,value,type){return{id,header,width,value,type};}
const serviceColumns=[
  serviceColumn('order','N° Orden',18,r=>r.service_order_number||r.service_number||''),
  serviceColumn('date','Fecha',12,r=>parts(r.scheduled_for).date),
  serviceColumn('time','Hora',8,r=>parts(r.scheduled_for).time),
  serviceColumn('company','Prestadora',24,r=>r.company_name||''),
  serviceColumn('driver','Chofer',22,r=>r.driver_name||''),
  serviceColumn('mobile','Móvil',28,r=>r.mobile_name||''),
  serviceColumn('service','Tipo de Servicio',22,r=>r.service_name||''),
  serviceColumn('origin_street','Calle Origen',38,r=>parseAddress(r.origin_formatted_address||r.origin).street),
  serviceColumn('origin_locality','Localidad Origen',22,r=>parseAddress(r.origin_formatted_address||r.origin).locality),
  serviceColumn('origin_province','Provincia Origen',20,r=>parseAddress(r.origin_formatted_address||r.origin).province),
  serviceColumn('destination_street','Calle Destino',38,r=>parseAddress(r.destination_formatted_address||r.destination).street),
  serviceColumn('destination_locality','Localidad Destino',22,r=>parseAddress(r.destination_formatted_address||r.destination).locality),
  serviceColumn('destination_province','Provincia Destino',20,r=>parseAddress(r.destination_formatted_address||r.destination).province),
  serviceColumn('make','Marca',16,r=>vehicleParts(r.vehicle_make_model).make),
  serviceColumn('model','Modelo',24,r=>vehicleParts(r.vehicle_make_model).model),
  serviceColumn('plate','Patente',14,r=>r.vehicle_plate||''),
  serviceColumn('asphalt_km','KM Asfalto',12,r=>num(r.asphalt_km),'number'),
  serviceColumn('gravel_km','KM Ripio',12,r=>num(r.gravel_km),'number'),
  serviceColumn('total_km','KM Total',12,r=>num(r.total_km),'number'),
  serviceColumn('base_price','Precio Base',16,r=>num(r.primary_price),'number'),
  serviceColumn('asphalt_rate','Tarifa KM Asfalto',18,r=>num(r.km_unit_price),'number'),
  serviceColumn('gravel_rate','Tarifa KM Ripio',18,r=>num(r.km_unit_price),'number'),
  serviceColumn('copay','COPAGO',14,r=>num(quote(r).copay_total),'number'),
  serviceColumn('extra_pct','Extra %',11,r=>surchargePercent(r),'number'),
  serviceColumn('total_price','Precio Total',16,r=>num(quote(r).current_company_amount??quote(r).company_estimated_total),'number'),
  serviceColumn('status','Estado',14,r=>statusLabel(r.billing_status)),
  serviceColumn('base','Base',20,r=>r.billing_base_name||''),
  serviceColumn('movement_amount','Importe Movida',17,r=>sum(movementComponents(r),'subtotal'),'number'),
  serviceColumn('asphalt_amount','Importe KM Asfalto',19,r=>distanceAmounts(r).asphalt,'number'),
  serviceColumn('gravel_amount','Importe KM Ripio',19,r=>distanceAmounts(r).gravel,'number'),
  serviceColumn('km_amount','Importe KM Total',18,r=>distanceAmounts(r).total,'number'),
  serviceColumn('notes','Observaciones',42,r=>observations(r)),
  serviceColumn('tolls','Peajes',14,r=>num(quote(r).toll_total),'number'),
  serviceColumn('special_qty','S. Esp. Cantidad',34,r=>specialText(r,'quantity')),
  serviceColumn('special_unit','S. Esp. Unitario',34,r=>specialText(r,'unit_price')),
  serviceColumn('special_subtotal','S. Esp. Subtotal',34,r=>specialText(r,'subtotal'))
];
const tollColumns=[
  {id:'date',header:'Fecha',width:12,value:r=>parts(r.scheduled_for).date},
  {id:'time',header:'Hora',width:8,value:r=>parts(r.scheduled_for).time},
  {id:'company',header:'Prestadora',width:24,key:'company_name'},
  {id:'order',header:'N° Orden',width:18,value:r=>r.service_order_number||r.service_number||''},
  {id:'status',header:'Estado',width:14,value:r=>statusLabel(r.service_billing_status)},
  {id:'base',header:'Base',width:20,key:'billing_base_name'},
  {id:'plate',header:'Patente',width:14,key:'vehicle_plate'},
  {id:'origin',header:'Origen',width:38,key:'origin'},
  {id:'destination',header:'Destino',width:38,key:'destination'},
  {id:'toll',header:'Peaje',width:24,key:'toll_name'},
  {id:'road',header:'Ruta',width:22,key:'road'},
  {id:'direction',header:'Sentido',width:18,key:'direction'},
  {id:'quantity',header:'Cantidad',width:10,key:'quantity',type:'number'},
  {id:'amount',header:'Importe',width:16,key:'amount',type:'number'},
  {id:'source',header:'Origen del dato',width:18,key:'source'},
  {id:'payment',header:'Medio de pago',width:18,key:'payment_method'},
  {id:'crossed',header:'Fecha cruce',width:20,value:r=>dateTime(r.crossed_at)},
  {id:'payer',header:'Pagador',width:16,key:'payer_agent'}
];
const defaultServiceIds=new Set(serviceColumns.map(c=>c.id));
const defaultTollIds=new Set(tollColumns.map(c=>c.id));
let picker=null;
function ensureExportable(){const S=state();if(!S)throw new Error('Facturación todavía no está disponible.');if(S.loading)throw new Error('Facturación se está actualizando. Intentá nuevamente cuando termine la carga.');if(!excel())throw new Error('El exportador Excel todavía no está disponible.');excel().ensureReady();if(!db())throw new Error('La conexión de Facturación todavía no está disponible.');return S;}
function fileBase(S,scope){const company=excel().cleanFilePart(companyLabel(S)),period=excel().cleanFilePart(S.period||localDay()),label=excel().cleanFilePart(scope);return`AuxiliOS_Facturacion_${label}_${company}_${period}`;}
function scopeData(kind){const S=ensureExportable();if(kind==='current'){if(S.tab==='tolls')return{S,kind,label:'Peajes',serviceRows:[],tollRows:[...(S.tollRows||[])]};return{S,kind,label:tabLabel(S.tab),serviceRows:[...(S.rows||[])].filter(r=>r.billing_status===S.tab),tollRows:[]};}if(kind==='selected'){if(S.tab==='tolls')throw new Error('La selección aplica a servicios, no al circuito de Peajes.');const ids=S.selected||new Set();return{S,kind,label:'Selección',serviceRows:(S.rows||[]).filter(r=>ids.has(String(r.service_id))),tollRows:[]};}if(kind==='all')return{S,kind,label:'Todo filtrado',serviceRows:[...(S.rows||[])],tollRows:[...(S.tollRows||[])]};throw new Error('Exportación inválida.');}
function openPicker(kind){try{const data=scopeData(kind);if(!data.serviceRows.length&&!data.tollRows.length)return notify('No hay registros para exportar con estos filtros','warning');picker={...data,serviceSelected:new Set(defaultServiceIds),tollSelected:new Set(defaultTollIds),busy:false};renderPicker();}catch(e){notify(e.message||'No se pudo preparar la exportación','error');}}
function closePicker(){picker=null;document.getElementById('obx-picker-backdrop')?.remove();}
function selectedColumns(type){if(!picker)return[];const catalog=type==='toll'?tollColumns:serviceColumns,ids=type==='toll'?picker.tollSelected:picker.serviceSelected;return catalog.filter(c=>ids.has(c.id));}
function pickerGroup(type,title,columns,selected){return`<section class="obx-col-group"><div class="obx-col-head"><div><b>${esc(title)}</b><small>${selected.size} de ${columns.length} columnas</small></div><div><button type="button" data-obx-select-all="${type}">Seleccionar Todos</button><button type="button" data-obx-deselect-all="${type}">Deseleccionar Todos</button></div></div><div class="obx-col-grid">${columns.map(c=>`<label><input type="checkbox" data-obx-col-type="${type}" data-obx-col="${esc(c.id)}" ${selected.has(c.id)?'checked':''}><span>${esc(c.header)}</span></label>`).join('')}</div></section>`;}
function renderPicker(){if(!picker)return;ensureStyle();let back=document.getElementById('obx-picker-backdrop');if(!back){back=document.createElement('div');back.id='obx-picker-backdrop';back.className='obx-picker-backdrop';document.body.appendChild(back);back.addEventListener('click',onPickerClick);back.addEventListener('change',onPickerChange);}const svc=picker.serviceRows.length?pickerGroup('service','Columnas de servicios',serviceColumns,picker.serviceSelected):'',tolls=picker.tollRows.length?pickerGroup('toll','Columnas de peajes',tollColumns,picker.tollSelected):'';back.innerHTML=`<div class="obx-picker" role="dialog" aria-modal="true" aria-label="Elegir columnas para Excel"><header><div><h3>Exportar a Excel</h3><p>${esc(picker.label)} · Elegí qué columnas querés incluir.</p></div><button class="obx-close" type="button" data-obx-picker-close>×</button></header><div class="obx-picker-body">${svc}${tolls}</div><footer><div class="obx-picker-count">${picker.serviceRows.length?`${picker.serviceRows.length} servicios`:''}${picker.serviceRows.length&&picker.tollRows.length?' · ':''}${picker.tollRows.length?`${picker.tollRows.length} peajes`:''}</div><div><button class="obx-secondary" type="button" data-obx-picker-close>Cancelar</button><button class="obx-primary" type="button" data-obx-picker-export ${picker.busy?'disabled':''}>${picker.busy?'Preparando…':'Exportar Excel'}</button></div></footer></div>`;}
function onPickerChange(e){const el=e.target.closest('[data-obx-col]');if(!el||!picker)return;const set=el.dataset.obxColType==='toll'?picker.tollSelected:picker.serviceSelected;el.checked?set.add(el.dataset.obxCol):set.delete(el.dataset.obxCol);renderPicker();}
function onPickerClick(e){if(e.target===e.currentTarget||e.target.closest('[data-obx-picker-close]'))return closePicker();const all=e.target.closest('[data-obx-select-all]');if(all&&picker){const type=all.dataset.obxSelectAll,set=type==='toll'?picker.tollSelected:picker.serviceSelected,cols=type==='toll'?tollColumns:serviceColumns;cols.forEach(c=>set.add(c.id));return renderPicker();}const none=e.target.closest('[data-obx-deselect-all]');if(none&&picker){const set=none.dataset.obxDeselectAll==='toll'?picker.tollSelected:picker.serviceSelected;set.clear();return renderPicker();}if(e.target.closest('[data-obx-picker-export]'))return confirmExport();}
async function fetchServiceRows(baseRows){if(!baseRows.length)return[];const ids=baseRows.map(r=>r.service_id).filter(Boolean);const {data,error}=await db().rpc('get_operator_billing_export_rows_v1',{p_service_ids:ids});if(error)throw error;const rows=Array.isArray(data?.rows)?data.rows:[],byId=new Map(rows.map(r=>[String(r.service_id),r]));return ids.map(id=>byId.get(String(id))).filter(Boolean);}
async function confirmExport(){if(!picker||picker.busy)return;const serviceCols=selectedColumns('service'),tollCols=selectedColumns('toll');if(picker.serviceRows.length&&!serviceCols.length&&picker.tollRows.length&&!tollCols.length)return notify('Seleccioná al menos una columna para exportar','warning');if(picker.serviceRows.length&&!picker.tollRows.length&&!serviceCols.length)return notify('Seleccioná al menos una columna de servicios','warning');if(picker.tollRows.length&&!picker.serviceRows.length&&!tollCols.length)return notify('Seleccioná al menos una columna de peajes','warning');picker.busy=true;renderPicker();try{const enriched=serviceCols.length?await fetchServiceRows(picker.serviceRows):[],sheets=[];if(enriched.length){if(picker.kind==='all'){const pending=enriched.filter(r=>r.billing_status==='pending'),reviewed=enriched.filter(r=>r.billing_status==='reviewed');if(pending.length)sheets.push({name:'Pendientes',columns:serviceCols,rows:pending});if(reviewed.length)sheets.push({name:'Revisados',columns:serviceCols,rows:reviewed});}else sheets.push({name:picker.label,columns:serviceCols,rows:enriched});}if(tollCols.length&&picker.tollRows.length)sheets.push({name:'Peajes',columns:tollCols,rows:picker.tollRows});if(!sheets.length)throw new Error('No hay columnas con datos para exportar.');excel().download({filename:fileBase(picker.S,picker.label),sheets});const count=enriched.length+picker.tollRows.length;closePicker();notify(`${count} registros exportados a Excel`,'success');}catch(e){if(picker){picker.busy=false;renderPicker();}notify(e.message||'No se pudo exportar a Excel','error');}}
const exportCurrent=()=>openPicker('current');
const exportSelected=()=>openPicker('selected');
const exportAllFiltered=()=>openPicker('all');
function menuMarkup(){const S=state(),count=S?.tab==='tolls'?(S?.tollRows?.length||0):(S?.rows||[]).filter(r=>r.billing_status===S?.tab).length,selected=S?.selected?.size||0;return`<div class="obx-menu" role="menu"><button type="button" data-obx="current"><b>Vista actual</b><small>${tabLabel(S?.tab)} · ${count} registros</small></button><button type="button" data-obx="selected" ${S?.tab==='tolls'||!selected?'disabled':''}><b>Selección</b><small>${selected?`${selected} servicios seleccionados`:'Seleccioná servicios primero'}</small></button><button type="button" data-obx="all"><b>Todo lo filtrado</b><small>Pendientes + Revisados + Peajes</small></button></div>`;}
function ensureStyle(){if(document.getElementById('auxilios-billing-excel-style'))return;const s=document.createElement('style');s.id='auxilios-billing-excel-style';s.textContent=`.obx-wrap{position:relative}.obx-trigger{height:34px;padding:0 12px;border-radius:8px;border:1px solid var(--border2);background:var(--card);color:var(--text);font:600 11px 'DM Sans',sans-serif;cursor:pointer;display:flex;align-items:center;gap:6px}.obx-trigger:hover{border-color:var(--amber);color:var(--amber)}.obx-menu{position:absolute;right:0;top:40px;width:250px;padding:6px;background:var(--card);border:1px solid var(--border2);border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.45);z-index:500}.obx-menu button{width:100%;display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:10px;border:0;border-radius:7px;background:transparent;color:var(--text);font-family:'DM Sans',sans-serif;cursor:pointer;text-align:left}.obx-menu button:hover:not(:disabled){background:var(--bg)}.obx-menu button:disabled{opacity:.38;cursor:not-allowed}.obx-menu b{font-size:12px}.obx-menu small{font-size:10px;color:var(--muted2)}.obx-picker-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:24px;z-index:12000}.obx-picker{width:min(980px,96vw);max-height:88vh;background:var(--card);border:1px solid var(--border2);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.55);display:flex;flex-direction:column;overflow:hidden}.obx-picker>header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding:18px 20px;border-bottom:1px solid var(--border)}.obx-picker h3{margin:0;font:24px 'Bebas Neue',sans-serif;letter-spacing:1px}.obx-picker p{margin:4px 0 0;color:var(--muted);font-size:12px}.obx-close{border:0;background:transparent;color:var(--muted);font-size:26px;cursor:pointer}.obx-picker-body{padding:18px 20px;overflow:auto;display:flex;flex-direction:column;gap:18px}.obx-col-group{border:1px solid var(--border);border-radius:10px;overflow:hidden}.obx-col-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;background:var(--bg)}.obx-col-head>div:first-child{display:flex;flex-direction:column;gap:2px}.obx-col-head b{font-size:12px}.obx-col-head small{font-size:10px;color:var(--muted)}.obx-col-head>div:last-child{display:flex;gap:6px;flex-wrap:wrap}.obx-col-head button,.obx-secondary,.obx-primary{border:1px solid var(--border2);border-radius:7px;padding:7px 10px;background:var(--card);color:var(--text);font:600 10px 'DM Sans',sans-serif;cursor:pointer}.obx-col-head button:hover,.obx-secondary:hover{border-color:var(--amber);color:var(--amber)}.obx-col-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;padding:8px}.obx-col-grid label{display:flex;gap:8px;align-items:flex-start;padding:8px;border-radius:6px;font-size:11px;cursor:pointer}.obx-col-grid label:hover{background:var(--bg)}.obx-col-grid input{margin-top:1px;accent-color:var(--amber)}.obx-picker>footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;border-top:1px solid var(--border);background:var(--bg)}.obx-picker>footer>div:last-child{display:flex;gap:8px}.obx-picker-count{font-size:11px;color:var(--muted)}.obx-primary{background:var(--amber);border-color:var(--amber);color:#111;padding:9px 14px}.obx-primary:disabled{opacity:.5;cursor:not-allowed}@media(max-width:780px){.obx-col-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.obx-col-head{align-items:flex-start;flex-direction:column}.obx-picker-backdrop{padding:10px}.obx-picker{max-height:94vh}}`;document.head.appendChild(s);}
function ensureControl(){ensureStyle();const right=document.querySelector('.topbar-right');if(!right)return null;let wrap=document.getElementById('obx-wrap');if(!wrap){wrap=document.createElement('div');wrap.id='obx-wrap';wrap.className='obx-wrap';wrap.hidden=true;wrap.innerHTML='<button type="button" class="obx-trigger" id="obx-trigger" aria-haspopup="menu" aria-expanded="false">⇩ Excel</button>';right.insertBefore(wrap,right.firstChild);wrap.addEventListener('click',onControlClick);}return wrap;}
function closeMenu(){const wrap=document.getElementById('obx-wrap'),menu=wrap?.querySelector('.obx-menu'),trigger=document.getElementById('obx-trigger');menu?.remove();if(trigger)trigger.setAttribute('aria-expanded','false');}
function toggleMenu(){const wrap=ensureControl(),trigger=document.getElementById('obx-trigger');if(!wrap)return;const existing=wrap.querySelector('.obx-menu');if(existing)return closeMenu();wrap.insertAdjacentHTML('beforeend',menuMarkup());trigger?.setAttribute('aria-expanded','true');}
function onControlClick(e){const action=e.target.closest('[data-obx]')?.dataset.obx;if(action){e.stopPropagation();closeMenu();if(action==='current')return exportCurrent();if(action==='selected')return exportSelected();if(action==='all')return exportAllFiltered();return;}if(e.target.closest('#obx-trigger')){e.stopPropagation();toggleMenu();}}
function syncVisibility(){const wrap=ensureControl();if(!wrap)return;const active=!!document.getElementById('screen-facturacion')?.classList.contains('active')&&!!billing()?.canRead?.();wrap.hidden=!active;if(!active){closeMenu();closePicker();}}
function init(){ensureControl();syncVisibility();window.addEventListener('auxilios:navigation-changed',()=>queueMicrotask(syncVisibility));document.addEventListener('click',e=>{if(!e.target.closest('#obx-wrap'))closeMenu();queueMicrotask(syncVisibility);});document.addEventListener('change',e=>{if(e.target.closest('#screen-facturacion'))queueMicrotask(syncVisibility);});}
Object.assign(E,{exportCurrent,exportSelected,exportAllFiltered,serviceColumns,tollColumns,parseAddress,vehicleParts,distanceAmounts,syncVisibility});
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();
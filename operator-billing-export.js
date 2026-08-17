/* AuxiliOS · Facturación · exportación XLSX */
(()=>{'use strict';
const E=window.OperatorBillingExcel=window.OperatorBillingExcel||{};
const billing=()=>window.OperatorBilling||null;
const state=()=>billing()?.S||null;
const excel=()=>window.AuxiliosExcelExport||null;
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const notify=(m,t='info')=>typeof window.toast==='function'?window.toast(m,t):console[t==='error'?'error':'log'](m);
const localNow=()=>new Date().toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
const localDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function parts(v){if(!v)return{date:'',time:''};const p=new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(v)),get=t=>p.find(x=>x.type===t)?.value||'';return{date:`${get('day')}/${get('month')}/${get('year')}`,time:`${get('hour')}:${get('minute')}`};}
const dateTime=v=>{const p=parts(v);return[p.date,p.time].filter(Boolean).join(' ')};
const statusLabel=v=>v==='reviewed'?'REVISADO':v==='pending'?'PENDIENTE':String(v||'').toUpperCase();
const tabLabel=v=>v==='reviewed'?'Revisados':v==='tolls'?'Peajes':'Pendientes';
function companyLabel(S){if(!S?.company)return'Todas';const found=S.filters?.companies?.find(x=>String(x.company_id)===String(S.company));return found?.company_name||'Prestadora';}
function periodLabel(S){if(!S?.period)return'Todos';const [y,m]=String(S.period).split('-').map(Number);if(!y||!m)return S.period;return new Intl.DateTimeFormat('es-AR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,1))).replace(/^./,x=>x.toUpperCase());}
function totalsByCurrency(rows,valueKey){const map=new Map();for(const row of rows){const currency=String(row?.currency||'ARS').toUpperCase(),value=num(row?.[valueKey]);map.set(currency,(map.get(currency)||0)+value);}return[...map.entries()].sort(([a],[b])=>a.localeCompare(b));}
function baseSummary(S,scope,rows,valueKey){const out=[
  {label:'Módulo',value:'Facturación'},
  {label:'Exportación',value:scope},
  {label:'Prestadora',value:companyLabel(S)},
  {label:'Período',value:periodLabel(S)},
  {label:'Búsqueda',value:S?.search||'Sin búsqueda'},
  {label:'Registros',value:rows.length},
  {label:'Exportado',value:localNow()}
];for(const [currency,total] of totalsByCurrency(rows,valueKey))out.push({label:`Total ${currency}`,value:total});return out;}
const serviceColumns=[
  {header:'Fecha',width:12,value:r=>parts(r.scheduled_for).date},
  {header:'Hora',width:8,value:r=>parts(r.scheduled_for).time},
  {header:'Prestadora',width:24,key:'company_name'},
  {header:'N° servicio',width:20,key:'service_number'},
  {header:'Orden prestadora',width:20,key:'service_order_number'},
  {header:'Estado facturación',width:18,value:r=>statusLabel(r.billing_status)},
  {header:'Base',width:20,key:'billing_base_name'},
  {header:'Tipo de servicio',width:24,key:'service_name'},
  {header:'Cliente',width:24,key:'customer_name'},
  {header:'Patente',width:14,key:'vehicle_plate'},
  {header:'Vehículo',width:24,key:'vehicle_make_model'},
  {header:'Origen',width:38,key:'origin'},
  {header:'Destino',width:38,key:'destination'},
  {header:'KM',width:12,key:'km',type:'number'},
  {header:'Importe al cierre',width:18,key:'stored_company_amount',type:'number'},
  {header:'Importe actual',width:18,key:'current_company_amount',type:'number'},
  {header:'Diferencia',width:16,key:'billing_delta',type:'number'},
  {header:'Moneda',width:10,value:r=>r.currency||'ARS'},
  {header:'Última revisión',width:20,value:r=>dateTime(r.last_reviewed_at)},
  {header:'Revisado por',width:22,key:'last_reviewed_by'},
  {header:'Error tarifario',width:34,key:'pricing_error'}
];
const tollColumns=[
  {header:'Fecha',width:12,value:r=>parts(r.scheduled_for).date},
  {header:'Hora',width:8,value:r=>parts(r.scheduled_for).time},
  {header:'Prestadora',width:24,key:'company_name'},
  {header:'N° servicio',width:20,key:'service_number'},
  {header:'Orden prestadora',width:20,key:'service_order_number'},
  {header:'Estado facturación',width:18,value:r=>statusLabel(r.service_billing_status)},
  {header:'Base',width:20,key:'billing_base_name'},
  {header:'Cliente',width:24,key:'customer_name'},
  {header:'Patente',width:14,key:'vehicle_plate'},
  {header:'Origen',width:38,key:'origin'},
  {header:'Destino',width:38,key:'destination'},
  {header:'Peaje',width:24,key:'toll_name'},
  {header:'Ruta',width:24,key:'road'},
  {header:'Sentido',width:20,key:'direction'},
  {header:'Cantidad',width:10,key:'quantity',type:'number'},
  {header:'Importe',width:16,key:'amount',type:'number'},
  {header:'Moneda',width:10,value:r=>r.currency||'ARS'},
  {header:'Origen del dato',width:18,key:'source'},
  {header:'Medio de pago',width:18,key:'payment_method'},
  {header:'Fecha cruce',width:20,value:r=>dateTime(r.crossed_at)},
  {header:'Pagador',width:16,key:'payer_agent'}
];
function ensureExportable(){const S=state();if(!S)throw new Error('Facturación todavía no está disponible.');if(S.loading)throw new Error('Facturación se está actualizando. Intentá nuevamente cuando termine la carga.');if(!excel())throw new Error('El exportador Excel todavía no está disponible.');excel().ensureReady();return S;}
function fileBase(S,scope){const company=excel().cleanFilePart(companyLabel(S)),period=excel().cleanFilePart(S.period||localDay()),label=excel().cleanFilePart(scope);return`AuxiliOS_Facturacion_${label}_${company}_${period}`;}
function exportCurrent(){try{const S=ensureExportable(),isTolls=S.tab==='tolls',rows=isTolls?[...(S.tollRows||[])]:[...(S.rows||[])].filter(r=>r.billing_status===S.tab);if(!rows.length)return notify('No hay registros en la vista actual para exportar','warning');const label=tabLabel(S.tab),valueKey=isTolls?'amount':'current_company_amount';excel().download({filename:fileBase(S,label),summaryRows:baseSummary(S,`Vista actual · ${label}`,rows,valueKey),sheets:[{name:label,columns:isTolls?tollColumns:serviceColumns,rows}]});notify(`${rows.length} registros exportados a Excel`,'success');}catch(e){notify(e.message||'No se pudo exportar a Excel','error');}}
function exportSelected(){try{const S=ensureExportable();if(S.tab==='tolls')return notify('La selección aplica a servicios, no al circuito de Peajes','warning');const ids=S.selected||new Set(),rows=(S.rows||[]).filter(r=>ids.has(String(r.service_id)));if(!rows.length)return notify('Seleccioná al menos un servicio para exportar','warning');const company=rows[0]?.company_name||companyLabel(S);const summary=baseSummary(S,`Selección · ${company}`,rows,'current_company_amount');summary.splice(3,0,{label:'Prestadora de la selección',value:company});excel().download({filename:fileBase(S,'Seleccion'),summaryRows:summary,sheets:[{name:'Seleccion',columns:serviceColumns,rows}]});notify(`${rows.length} servicios seleccionados exportados`,'success');}catch(e){notify(e.message||'No se pudo exportar la selección','error');}}
function exportAllFiltered(){try{const S=ensureExportable(),pending=(S.rows||[]).filter(r=>r.billing_status==='pending'),reviewed=(S.rows||[]).filter(r=>r.billing_status==='reviewed'),tolls=[...(S.tollRows||[])],all=[...pending,...reviewed];if(!all.length&&!tolls.length)return notify('No hay registros con los filtros actuales para exportar','warning');const summary=[
  {label:'Módulo',value:'Facturación'},
  {label:'Exportación',value:'Todo lo filtrado'},
  {label:'Prestadora',value:companyLabel(S)},
  {label:'Período',value:periodLabel(S)},
  {label:'Búsqueda',value:S.search||'Sin búsqueda'},
  {label:'Pendientes',value:pending.length},
  {label:'Revisados',value:reviewed.length},
  {label:'Peajes separados',value:tolls.length},
  {label:'Exportado',value:localNow()}
];for(const [currency,total] of totalsByCurrency(all,'current_company_amount'))summary.push({label:`Servicios ${currency}`,value:total});for(const [currency,total] of totalsByCurrency(tolls,'amount'))summary.push({label:`Peajes ${currency}`,value:total});const sheets=[];if(pending.length)sheets.push({name:'Pendientes',columns:serviceColumns,rows:pending});if(reviewed.length)sheets.push({name:'Revisados',columns:serviceColumns,rows:reviewed});if(tolls.length)sheets.push({name:'Peajes',columns:tollColumns,rows:tolls});excel().download({filename:fileBase(S,'Todo_filtrado'),summaryRows:summary,sheets});notify('Facturación filtrada exportada a Excel','success');}catch(e){notify(e.message||'No se pudo exportar Facturación','error');}}
function menuMarkup(){const S=state(),count=S?.tab==='tolls'?(S?.tollRows?.length||0):(S?.rows||[]).filter(r=>r.billing_status===S?.tab).length,selected=S?.selected?.size||0;return`<div class="obx-menu" role="menu"><button type="button" data-obx="current"><b>Vista actual</b><small>${tabLabel(S?.tab)} · ${count} registros</small></button><button type="button" data-obx="selected" ${S?.tab==='tolls'||!selected?'disabled':''}><b>Selección</b><small>${selected?`${selected} servicios seleccionados`:'Seleccioná servicios primero'}</small></button><button type="button" data-obx="all"><b>Todo lo filtrado</b><small>Pendientes + Revisados + Peajes</small></button></div>`;}
function ensureStyle(){if(document.getElementById('auxilios-billing-excel-style'))return;const s=document.createElement('style');s.id='auxilios-billing-excel-style';s.textContent=`.obx-wrap{position:relative}.obx-trigger{height:34px;padding:0 12px;border-radius:8px;border:1px solid var(--border2);background:var(--card);color:var(--text);font:600 11px 'DM Sans',sans-serif;cursor:pointer;display:flex;align-items:center;gap:6px}.obx-trigger:hover{border-color:var(--amber);color:var(--amber)}.obx-menu{position:absolute;right:0;top:40px;width:250px;padding:6px;background:var(--card);border:1px solid var(--border2);border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.45);z-index:500}.obx-menu button{width:100%;display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:10px;border:0;border-radius:7px;background:transparent;color:var(--text);font-family:'DM Sans',sans-serif;cursor:pointer;text-align:left}.obx-menu button:hover:not(:disabled){background:var(--bg)}.obx-menu button:disabled{opacity:.38;cursor:not-allowed}.obx-menu b{font-size:12px}.obx-menu small{font-size:10px;color:var(--muted2)}`;document.head.appendChild(s);}
function ensureControl(){ensureStyle();const right=document.querySelector('.topbar-right');if(!right)return null;let wrap=document.getElementById('obx-wrap');if(!wrap){wrap=document.createElement('div');wrap.id='obx-wrap';wrap.className='obx-wrap';wrap.hidden=true;wrap.innerHTML='<button type="button" class="obx-trigger" id="obx-trigger" aria-haspopup="menu" aria-expanded="false">⇩ Excel</button>';right.insertBefore(wrap,right.firstChild);wrap.addEventListener('click',onControlClick);}return wrap;}
function closeMenu(){const wrap=document.getElementById('obx-wrap'),menu=wrap?.querySelector('.obx-menu'),trigger=document.getElementById('obx-trigger');menu?.remove();if(trigger)trigger.setAttribute('aria-expanded','false');}
function toggleMenu(){const wrap=ensureControl(),trigger=document.getElementById('obx-trigger');if(!wrap)return;const existing=wrap.querySelector('.obx-menu');if(existing)return closeMenu();wrap.insertAdjacentHTML('beforeend',menuMarkup());trigger?.setAttribute('aria-expanded','true');}
function onControlClick(e){const action=e.target.closest('[data-obx]')?.dataset.obx;if(action){e.stopPropagation();closeMenu();if(action==='current')return exportCurrent();if(action==='selected')return exportSelected();if(action==='all')return exportAllFiltered();return;}if(e.target.closest('#obx-trigger')){e.stopPropagation();toggleMenu();}}
function syncVisibility(){const wrap=ensureControl();if(!wrap)return;const active=!!document.getElementById('screen-facturacion')?.classList.contains('active')&&!!billing()?.canRead?.();wrap.hidden=!active;if(!active)closeMenu();}
function init(){ensureControl();syncVisibility();window.addEventListener('auxilios:navigation-changed',()=>queueMicrotask(syncVisibility));document.addEventListener('click',e=>{if(!e.target.closest('#obx-wrap'))closeMenu();queueMicrotask(syncVisibility);});document.addEventListener('change',e=>{if(e.target.closest('#screen-facturacion'))queueMicrotask(syncVisibility);});}
Object.assign(E,{exportCurrent,exportSelected,exportAllFiltered,serviceColumns,tollColumns,syncVisibility});
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();
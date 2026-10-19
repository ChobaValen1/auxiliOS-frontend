/* AuxiliOS · Servicio · Tercerizado (paso 3): con Logística "Tercerizada" se elige la grúa de afuera
   y se calcula lo que se le paga con su tarifa vigente en la fecha del servicio.
   El cálculo lo hace la base (quote_outsourced_service_cost_v1); se guarda después del servicio
   con set_outsourced_service_cost_v1. Si el servicio pasa a Propia, ese guardado lo limpia. */
(()=>{'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const db=()=>typeof _db!=='undefined'?_db:null;
const ico=(name,cls='')=>`<svg class="ax-icon${cls?' '+cls:''}" aria-hidden="true"><use href="/ui/icons.svg#${name}"/></svg>`;
const UNITS={hour:'hora',km:'km',day:'día',unit:'unidad',service:'servicio'};
const money=n=>'$ '+Number(n||0).toLocaleString('es-AR',{minimumFractionDigits:0,maximumFractionDigits:2});
const qty=n=>Number(n||0).toLocaleString('es-AR',{maximumFractionDigits:2});
/* Números como los escribe la gente: "1.500,5" o "1500.5" → 1500.5 */
function num(v){const s=String(v??'').trim().replace(/\s|\$/g,'');if(!s)return 0;const t=s.includes(',')?s.replace(/\./g,'').replace(',','.'):(/^\d{1,3}(\.\d{3})+$/.test(s)?s.replace(/\./g,''):s);const n=Number(t);return Number.isFinite(n)?n:NaN;}
/* Fecha del servicio en Argentina (scheduled_for viene local "YYYY-MM-DDTHH:mm" o ISO). */
function serviceDate(w){const v=String(w?.data?.scheduled_for||'');if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)||/^\d{4}-\d{2}-\d{2}$/.test(v))return v.slice(0,10);const d=new Date(v);if(Number.isNaN(d.getTime()))return new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});return d.toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});}
const dmy=iso=>{const [y,m,d]=String(iso||'').split('-');return d?`${d}/${m}/${y}`:'';};
const isThird=w=>w?.data?.logistics_type==='third_party';
/* El operador no ve tarifas ni importes: sólo Administración. La base tampoco se los manda. */
const isAdmin=()=>{try{return String(PERFIL_USUARIO?.roles?.name||'').toLowerCase()==='administracion';}catch(e){return false;}};

function blank(){return{provider_id:'',km_asphalt:'',km_gravel:'',tolls_amount:'',extras:{},adjustment_amount:'',adjustment_reason:'',locality:'',kmTouched:false,showAdj:false};}
function state(w){const key=String(w.serviceId||'new');if(w.terc?.key!==key)w.terc={key,form:blank(),providers:null,providersDate:'',row:null,rowLoaded:!w.serviceId,quote:null,quoteKey:'',seq:0,dirty:false,sig:''};return w.terc;}
/* Ya está en una liquidación (al operador la base sólo le dice locked). */
const isLocked=t=>!!(t?.row?.settlement_id||t?.row?.locked);
/* Cómo calcula la tarifa del tercerizado el tipo de servicio del formulario (movida_km | fixed | locality). */
const modeOf=(w,t)=>provider(t)?.modes?.[String(w?.data?.primary_concept_id||'')]||null;
const provider=t=>(t.providers||[]).find(p=>String(p.provider_id)===String(t.form.provider_id))||null;

async function loadProviders(w,t,date){if(t.providersDate===date||t.loadingProviders===date)return;t.loadingProviders=date;
 try{const {data,error}=await db().rpc('list_outsourced_providers_for_service_v1',{p_date:date});if(error)throw error;if(w.terc!==t)return;t.providers=Array.isArray(data)?data:[];t.providersDate=date;t.providersError='';}
 catch(e){if(w.terc!==t)return;t.providers=t.providers||[];t.providersDate=date;t.providersError=e?.message||'No se pudieron cargar los tercerizados';}
 t.loadingProviders='';render(w);requestQuote(w);}
async function loadRow(w,t){if(t.rowLoaded||t.loadingRow)return;t.loadingRow=true;
 try{const {data,error}=await db().rpc('get_outsourced_service_cost_v1',{p_service_id:w.serviceId});if(error)throw error;if(w.terc!==t)return;t.row=data||null;
  if(data?.provider_id){const ex={};(data.extras||[]).forEach(x=>{ex[x.concept_id]=String(x.quantity??'');});
   t.form={...blank(),provider_id:data.provider_id,km_asphalt:String(Number(data.km_asphalt)||''),km_gravel:String(Number(data.km_gravel)||''),tolls_amount:String(Number(data.tolls_amount)||''),extras:ex,adjustment_amount:Number(data.adjustment_amount)?String(Number(data.adjustment_amount)):'',adjustment_reason:data.adjustment_reason||'',locality:data.locality||'',kmTouched:true,showAdj:!!Number(data.adjustment_amount)};}}
 catch(e){console.warn('[terc] costo guardado',e);}
 t.rowLoaded=true;t.loadingRow=false;render(w);requestQuote(w);}

/* Km del recorrido mientras no los toquen a mano. */
function syncKm(w,t){if(t.form.kmTouched||w.mode==='view')return;const a=Number(w.data.estimated_asphalt_km)||0,g=Number(w.data.estimated_gravel_km)||0;t.form.km_asphalt=a?String(a):'';t.form.km_gravel=g?String(g):'';}

function problems(t){const f=t.form,out={};
 for(const k of ['km_asphalt','km_gravel','tolls_amount']){const n=num(f[k]);if(Number.isNaN(n))out[k]='Escribí un número';else if(n<0)out[k]='No puede ser negativo';}
 Object.entries(f.extras).forEach(([id,v])=>{const n=num(v);if(Number.isNaN(n))out['x:'+id]='Escribí un número';else if(n<0)out['x:'+id]='No puede ser negativo';});
 const adj=num(f.adjustment_amount);if(Number.isNaN(adj))out.adjustment_amount='Escribí un número (puede ser negativo)';
 else if(adj&&String(f.adjustment_reason||'').trim().length<5)out.adjustment_reason='Contá el motivo (al menos 5 letras)';
 return out;}
function payload(t){const f=t.form,p=provider(t),separate=(p?.tolls_mode||'separate')==='separate';
 return{provider_id:f.provider_id||null,...(f.locality?{locality:f.locality}:{}),km_asphalt:num(f.km_asphalt)||0,km_gravel:num(f.km_gravel)||0,tolls_amount:separate?(num(f.tolls_amount)||0):0,
  extras:Object.entries(f.extras).map(([concept_id,v])=>({concept_id,quantity:num(v)||0})).filter(x=>x.quantity>0),
  ...(isAdmin()?{adjustment_amount:num(f.adjustment_amount)||0,adjustment_reason:String(f.adjustment_reason||'').trim()||null}:{})};}

let timer=null;
function requestQuote(w,delay=250){const t=w?.terc;if(!t)return;clearTimeout(timer);timer=setTimeout(()=>quote(w,t),delay);}
async function quote(w,t){if(w.terc!==t)return;const p=payload(t),concept=w.data.primary_concept_id,date=serviceDate(w);
 if(!isThird(w)||!p.provider_id||!concept){t.quote=null;t.quoteKey='';return renderQuote(w);}
 if(Object.keys(problems(t)).some(k=>k!=='adjustment_reason')){return renderQuote(w);}
 const body={...p,concept_id:concept,date};delete body.adjustment_reason;const key=JSON.stringify(body);if(key===t.quoteKey&&t.quote)return renderQuote(w);
 const seq=++t.seq;t.quoting=true;renderQuote(w);
 const {data,error}=await db().rpc('quote_outsourced_service_cost_v1',{p_payload:body});if(w.terc!==t||seq!==t.seq)return;t.quoting=false;
 t.quote=error?{error:error.message||'No se pudo calcular'}:data;t.quoteKey=key;renderQuote(w);}

function signature(w,t){const p=provider(t);return JSON.stringify([w.mode,isThird(w),t.providersDate,!!t.providers,t.providersError||'',t.rowLoaded,t.form.provider_id,p?.tolls_mode,(p?.extras||[]).map(x=>x.concept_id),t.form.showAdj,isLocked(t),w.data.primary_concept_id,JSON.stringify(modeOf(w,t))]);}

function field(id,label,value,{suffix='',prefix='',hint='',disabled=false,inputmode='decimal',placeholder='0'}={}){
 return `<label class="osc-field" data-osc-wrap="${esc(id)}"><span>${esc(label)}</span><span class="osc-input">${prefix?`<i>${esc(prefix)}</i>`:''}<input class="ax-input" data-osc="${esc(id)}" inputmode="${inputmode}" autocomplete="off" value="${esc(value)}" placeholder="${esc(placeholder)}" ${disabled?'disabled':''}>${suffix?`<i>${esc(suffix)}</i>`:''}</span><small class="osc-err" data-osc-err="${esc(id)}"></small>${hint?`<small class="osc-hint">${esc(hint)}</small>`:''}</label>`;}

/* Con Tercerizada, «¿Quién hace el servicio?» ocupa el lugar de Asignar Chofer / Móvil;
   lo que se le paga va en la 3ª columna y aparece recién cuando el tercerizado tiene tarifa. */
function placement(w){const third=isThird(w),grid=document.querySelector('.osv4-reactive .assignment-grid'),pick=document.getElementById('osv4-terc-pick'),card=document.getElementById('osv4-terc');
 grid?.classList.toggle('osc-replaced',third);if(pick)pick.hidden=!third;if(card&&!third)card.hidden=true;return{pick,card,third};}
/* Precio fijo por localidad: se elige de la lista del tercerizado; es todo lo que se paga. */
function localityHtml(w,t,ro){const m=modeOf(w,t),locs=m?.localities||[],cur=t.form.locality;const known=locs.some(x=>x.name===cur);
 return `<label class="osc-field" data-osc-wrap="locality"><span>Localidad *</span><select class="ax-select" data-osc="locality" ${ro?'disabled':''}><option value="">Elegí la localidad</option>${cur&&!known?`<option value="${esc(cur)}">${esc(cur)} (ya no está en la tarifa)</option>`:''}${locs.map(x=>`<option value="${esc(x.name)}" ${x.name===cur?'selected':''}>${esc(x.name)}${isAdmin()&&x.amount!=null?' · '+esc(money(x.amount)):''}</option>`).join('')}</select><small class="osc-err" data-osc-err="locality"></small><small class="osc-hint">Precio fijo por localidad: no se suman km, adicionales ni peajes.</small></label>`;}
function render(w){if(!w)return;const {pick,card,third}=placement(w);if(!pick||!card||!third)return;
 const t=state(w);const sig=signature(w,t);if(sig===t.sig&&pick.childElementCount){paintValues(w,t);return renderQuote(w);}t.sig=sig;
 const view=w.mode==='view',locked=isLocked(t),ro=view||locked,f=t.form,p=provider(t),date=t.providersDate||serviceDate(w);
 const loading=!t.providers||!t.rowLoaded;
 const opts=(t.providers||[]).map(x=>`<option value="${esc(x.provider_id)}">${esc(x.display_name)}${x.has_rate?'':' · sin tarifa'}</option>`).join('');
 const keep=f.provider_id&&!p&&t.row?.provider_id===f.provider_id?`<option value="${esc(f.provider_id)}">Tercerizado guardado (inactivo)</option>`:'';
 let warn='';
 if(t.providersError)warn=`<p class="osc-note is-warn">${ico('triangle-alert','ax-icon-sm')}<span>${esc(t.providersError)}</span></p>`;
 else if(t.providers&&!t.providers.length)warn=`<p class="osc-note">${ico('info','ax-icon-sm')}<span>No hay tercerizados cargados. Se cargan en Configuración › Tercerizados.</span></p>`;
 else if(p&&!p.has_rate)warn=`<p class="osc-note is-warn">${ico('triangle-alert','ax-icon-sm')}<span>${esc(p.display_name)} no tiene tarifa para el ${esc(dmy(date))}. Cargala en Configuración › Tercerizados › Tarifas.</span></p>`;
 else if(p&&w.data.primary_concept_id&&!(p.concepts||[]).map(String).includes(String(w.data.primary_concept_id)))warn=`<p class="osc-note is-warn">${ico('triangle-alert','ax-icon-sm')}<span>La tarifa de ${esc(p.display_name)} no incluye este tipo de servicio.</span></p>`;
 else if(!w.data.primary_concept_id&&p)warn=`<p class="osc-note">${ico('info','ax-icon-sm')}<span>Elegí el tipo de servicio para calcular lo que se le paga.</span></p>`;
 pick.innerHTML=`<label class="osc-field"><span>¿Quién hace el servicio? *</span><select class="ax-select" data-osc="provider_id" ${ro||loading?'disabled':''}><option value="">${loading?'Cargando…':'Elegí el tercerizado'}</option>${keep}${opts}</select>${view?'':'<small class="osc-hint">Con el tercerizado elegido, al guardar el servicio queda Asignado.</small>'}</label>${warn}`;
 pick.querySelector('[data-osc="provider_id"]').value=f.provider_id||'';
 const tollsIncluded=p&&p.tolls_mode==='included';const byLoc=modeOf(w,t)?.calc_mode==='locality';
 const extras=(p?.extras||[]);
 const noRate=p&&(!p.has_rate||(w.data.primary_concept_id&&!(p.concepts||[]).map(String).includes(String(w.data.primary_concept_id))));
 const show=!!(f.provider_id&&p&&!noRate);card.hidden=!show;
 if(!show){card.innerHTML='';return;}
 card.innerHTML=`<div class="osc-head">${ico('truck','ax-icon-sm')}<b>${isAdmin()?'Lo que se le paga':'Datos para el tercerizado'}</b><small>${esc(p.display_name)}</small></div>
  ${locked?`<p class="osc-note">${ico('lock','ax-icon-sm')}<span>Ya está en una liquidación: no se puede cambiar.</span></p>`:''}
  ${byLoc?localityHtml(w,t,ro):''}${byLoc?'':`<div class="osc-grid">${field('km_asphalt','Km asfalto',f.km_asphalt,{suffix:'km',disabled:ro,hint:f.kmTouched?'':'Del recorrido'})}${field('km_gravel','Km ripio',f.km_gravel,{suffix:'km',disabled:ro})}</div>
  ${tollsIncluded?`<p class="osc-note">${ico('info','ax-icon-sm')}<span>Peajes incluidos en su tarifa: no se pagan aparte.</span></p>`:field('tolls_amount','Peajes que pagó',f.tolls_amount,{prefix:'$',disabled:ro,hint:'Se le devuelven aparte'})}
  ${extras.length?`<div class="osc-extras"><span class="osc-label">Adicionales</span>${extras.map(x=>`<div class="osc-extra"><span><b>${esc(x.name)}</b>${isAdmin()&&x.unit_amount!=null?`<small>${esc(money(x.unit_amount))} por ${esc(UNITS[x.unit]||x.unit||'unidad')}</small>`:''}</span>${field('x:'+x.concept_id,'',f.extras[x.concept_id]||'',{suffix:UNITS[x.unit]||'',disabled:ro})}</div>`).join('')}</div>`:''}`}
  ${!isAdmin()?'':f.showAdj?`<div class="osc-adj"><div class="osc-grid">${field('adjustment_amount','Ajuste',f.adjustment_amount,{prefix:'$',disabled:ro,hint:'Negativo para descontar',inputmode:'text'})}${field('adjustment_reason','Motivo del ajuste',f.adjustment_reason,{disabled:ro,inputmode:'text',placeholder:'Ej.: espera extra acordada'})}</div>${ro?'':'<button type="button" class="osc-link" data-osc-act="no-adj">Quitar ajuste</button>'}</div>`:(ro?'':'<button type="button" class="osc-link" data-osc-act="adj">+ Agregar ajuste</button>')}
  <div class="osc-quote" data-osc-quote aria-live="polite"></div>`;
 paintValues(w,t);renderQuote(w);}

function paintValues(w,t){const card=document.getElementById('osv4-terc');if(!card)return;const errs=problems(t);if(modeOf(w,t)?.calc_mode==='locality'&&!t.form.locality)errs.locality='Elegí la localidad';
 card.querySelectorAll('input[data-osc]').forEach(el=>{const k=el.dataset.osc,v=k.startsWith('x:')?(t.form.extras[k.slice(2)]||''):t.form[k];if(document.activeElement!==el&&el.value!==String(v??''))el.value=v??'';});
 card.querySelectorAll('[data-osc-err]').forEach(el=>{const k=el.dataset.oscErr,m=t.touched?.[k]?errs[k]||'':'';el.textContent=m;el.closest('.osc-field')?.classList.toggle('is-invalid',!!m);});}

function renderQuote(w){const t=w?.terc,box=document.querySelector('#osv4-terc [data-osc-quote]');if(!t||!box)return;
 if(!t.form.provider_id){box.innerHTML='';return;}
 const q=t.quote;
 if(!q){box.innerHTML=t.quoting?'<p class="osc-quote-wait">Calculando…</p>':'';return;}
 if(q.error){box.innerHTML=`<p class="osc-note is-warn">${ico('triangle-alert','ax-icon-sm')}<span>${esc(q.error)}</span></p>`;return;}
 if(!isAdmin()||q.amounts_hidden){box.innerHTML=`<p class="osc-note is-ok">${ico('check','ax-icon-sm')}<span>Tiene tarifa para esta fecha. Lo que se le paga lo calcula y lo ve Administración.</span></p>`;return;}
 const rows=(q.breakdown||[]).map(r=>`<li><span>${esc(r.label)}${r.quantity!=null?` <small>${esc(qty(r.quantity))} ${esc(UNITS[r.unit]||r.unit||'')} × ${esc(money(r.unit_amount))}</small>`:''}</span><b class="${Number(r.amount)<0?'is-neg':''}">${esc(money(r.amount))}</b></li>`).join('');
 box.innerHTML=`<ul class="osc-breakdown">${rows}</ul><div class="osc-total${t.quoting?' is-stale':''}"><span>A pagar al tercerizado</span><b>${esc(money(q.total_amount))}</b></div><small class="osc-rate">Tarifa vigente desde el ${esc(dmy(q.valid_from))} · ${q.calc_mode==='locality'?'precio por localidad':`peajes ${q.tolls_mode==='included'?'incluidos':'aparte'}`}</small>`;}

function onInput(e){const el=e.target.closest?.('[data-osc]');if(!el)return;const w=window.OperatorServices?.S?.wizard;if(!w?.terc||w.mode==='view')return;const t=w.terc,k=el.dataset.osc;
 if(k==='provider_id'){t.form.provider_id=el.value;t.form.extras={};t.form.locality='';t.quote=null;t.quoteKey='';}
 else if(k.startsWith('x:'))t.form.extras[k.slice(2)]=el.value;
 else{t.form[k]=el.value;if(k==='km_asphalt'||k==='km_gravel')t.form.kmTouched=true;}
 t.touched={...(t.touched||{}),[k]:true};t.dirty=true;w.dirty=true;
 if(k==='provider_id')render(w);else paintValues(w,t);
 requestQuote(w,k==='provider_id'?0:350);}
function onClick(e){const b=e.target.closest?.('[data-osc-act]');if(!b)return;const w=window.OperatorServices?.S?.wizard;if(!w?.terc)return;const t=w.terc;
 if(b.dataset.oscAct==='adj'){t.form.showAdj=true;render(w);document.querySelector('#osv4-terc [data-osc="adjustment_amount"]')?.focus();}
 else{t.form.showAdj=false;t.form.adjustment_amount='';t.form.adjustment_reason='';t.dirty=true;w.dirty=true;render(w);requestQuote(w,0);}}
let bound=false;
const inside=el=>el?.closest?.('#osv4-terc,#osv4-terc-pick');
function bind(){if(bound)return;bound=true;document.addEventListener('input',e=>{if(inside(e.target))onInput(e);});document.addEventListener('change',e=>{if(inside(e.target)&&e.target.tagName==='SELECT')onInput(e);});document.addEventListener('click',e=>{if(e.target.closest?.('#osv4-terc'))onClick(e);});}

function sync(w){if(!w||!db())return;bind();if(!document.getElementById('osv4-terc'))return;
 const t=state(w);
 /* El costo guardado se lee aunque sea Propia: si lo pasan a Propia, al guardar se limpia. */
 if(w.serviceId&&!t.rowLoaded)void loadRow(w,t);
 if(!placement(w).third)return;
 syncKm(w,t);const date=serviceDate(w);
 if(t.providersDate!==date)void loadProviders(w,t,date);
 render(w);requestQuote(w,400);}

/* Antes de guardar: con Tercerizada hay que elegir quién lo hace y que los números estén bien. */
function validate(w){if(!w||w.mode==='view'||!isThird(w)||!w.terc)return[];const t=w.terc;if(isLocked(t))return[];
 const errs=problems(t);if(!t.form.provider_id)return['Elegí qué tercerizado hace el servicio.'];
 const p=provider(t);if(p&&!p.has_rate)return[`${p.display_name} no tiene tarifa para la fecha del servicio.`];
 if(p&&w.data.primary_concept_id&&!(p.concepts||[]).map(String).includes(String(w.data.primary_concept_id)))return[`La tarifa de ${p.display_name} no incluye este tipo de servicio.`];
 if(modeOf(w,t)?.calc_mode==='locality'&&!t.form.locality){t.touched={...(t.touched||{}),locality:true};paintValues(w,t);return['Elegí la localidad del servicio.'];}
 if(Object.keys(errs).length){t.touched=Object.fromEntries(Object.keys(errs).map(k=>[k,true]));paintValues(w,t);return['Revisá los datos del tercerizado.'];}
 return[];}

/* Después de guardar el servicio. No frena el guardado: si falla, avisa. */
async function persist(w,serviceId){if(!w||!serviceId||w.mode==='view'||!db())return true;const t=w.terc;
 /* Con Tercerizada se recalcula siempre: el tipo de servicio o la fecha pueden haber cambiado. */
 if(!isThird(w)&&!t?.row?.provider_id)return true;
 if(isThird(w)&&!t?.form?.provider_id)return true;
 if(isLocked(t))return true;
 const body=isThird(w)&&t?payload(t):null;
 const {data,error}=await db().rpc('set_outsourced_service_cost_v1',{p_service_id:serviceId,p_payload:body});
 if(error){const msg='El servicio se guardó, pero no lo que se le paga al tercerizado: '+(error.message||'');if(typeof window.toast==='function')window.toast(msg,'warning');else console.warn(msg);return false;}
 if(t){t.row=data||null;t.dirty=false;t.key=String(serviceId);t.rowLoaded=true;}
 return true;}

window.AuxTercerizadoServicio={sync,render,persist,validate,_num:num,_payload:payload,_problems:problems,_serviceDate:serviceDate,_blank:blank};
})();

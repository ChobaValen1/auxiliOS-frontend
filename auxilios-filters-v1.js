/* AuxiliOS · Filtros compartidos v1
   Un solo aspecto para todos los filtros de las mesas: el selector de período
   del Panel (botón que dice qué está puesto y despliega las opciones). Lo usan
   Servicios (Activos e Historial), Facturación y Facturas.

   El markup se arma como texto para que cada mesa lo pinte dentro de su propio
   innerHTML; los eventos se resuelven con un listener delegado por raíz, así
   que re-pintar no duplica handlers.

   Período: {mode:'all'|'mes'|'rango', mes:'AAAA-MM', desde:'AAAA-MM-DD', hasta}.
   Selección: un valor string; '' significa "todos". */
(()=>{'use strict';
if(window.AuxFilters)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MESES=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MESES_LARGOS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const pad=n=>String(n).padStart(2,'0');
function hoyISO(){const d=new Date();return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
function mesActual(){const d=new Date();return`${d.getFullYear()}-${pad(d.getMonth()+1)}`;}
function mesesRecientes(n=12){const out=[],d=new Date();d.setDate(1);for(let i=0;i<n;i++){out.push(`${d.getFullYear()}-${pad(d.getMonth()+1)}`);d.setMonth(d.getMonth()-1);}return out;}
function rangoDeMes(ym){const [y,m]=String(ym||'').split('-').map(Number);if(!y||!m)return null;const last=new Date(y,m,0).getDate();return{desde:`${y}-${pad(m)}-01`,hasta:`${y}-${pad(m)}-${pad(last)}`};}
function fechaCorta(iso){const [y,m,d]=String(iso||'').split('-').map(Number);return y&&m&&d?`${d} ${MESES[m-1].toLowerCase()} ${y}`:'';}
function etiquetaMes(ym){const [y,m]=ym.split('-').map(Number);return`${MESES[m-1]} ${String(y).slice(2)}`;}

/* ── Período ─────────────────────────────────────────────────────────── */
function periodBounds(p){if(!p||p.mode==='all')return{start:null,end:null};if(p.mode==='mes'){const r=rangoDeMes(p.mes);return r?{start:r.desde,end:r.hasta}:{start:null,end:null};}return{start:p.desde||null,end:p.hasta||null};}
function periodFromMonth(ym){return ym?{mode:'mes',mes:ym}:{mode:'all'};}
function periodMonth(p){return p?.mode==='mes'?p.mes:'';}
function describePeriod(p,allLabel){
  if(!p||p.mode==='all')return{titulo:allLabel||'Todas las fechas',rango:''};
  if(p.mode==='mes'){const r=rangoDeMes(p.mes),[y,m]=p.mes.split('-').map(Number);return{titulo:`${MESES_LARGOS[m-1]} ${y}`,rango:r?`${fechaCorta(r.desde)} – ${fechaCorta(r.hasta)}`:''};}
  return{titulo:'Período personalizado',rango:`${fechaCorta(p.desde)} – ${fechaCorta(p.hasta)}`};
}
function inPeriod(p,value){
  const b=periodBounds(p);if(!b.start&&!b.end)return true;if(!value)return false;
  const d=new Date(value);if(Number.isNaN(d.getTime()))return false;
  const iso=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  return(!b.start||iso>=b.start)&&(!b.end||iso<=b.end);
}
function period({id,value,allLabel='Todas las fechas',allowAll=true,months}={}){
  const p=value||{mode:allowAll?'all':'mes',mes:mesActual()},d=describePeriod(p,allLabel),b=periodBounds(p),active=p.mode!=='all';
  const lista=(Array.isArray(months)&&months.length?[...new Set(months)].sort().reverse().slice(0,12):mesesRecientes(12));
  const meses=lista.map(ym=>{const on=p.mode==='mes'&&p.mes===ym;return`<button type="button" class="auxf-mes${on?' on':''}" data-auxf-mes="${esc(ym)}"${on?' aria-current="true"':''}>${esc(etiquetaMes(ym))}</button>`;}).join('');
  const hoy=hoyISO();
  return`<div class="auxf" data-auxf="${esc(id)}" data-auxf-kind="period"><button type="button" class="auxf-btn${active?' is-active':''}" data-auxf-open aria-haspopup="dialog" aria-expanded="false"><span class="auxf-ico" aria-hidden="true">🗓</span><span class="auxf-txt"><b>${esc(d.titulo)}</b>${d.rango?`<small>${esc(d.rango)}</small>`:''}</span><span class="auxf-caret" aria-hidden="true">▾</span></button>`
   +`<div class="auxf-pop auxf-pop-period" role="dialog" aria-label="Elegir período" hidden>${allowAll?`<button type="button" class="auxf-all${p.mode==='all'?' on':''}" data-auxf-all>${esc(allLabel)}</button>`:''}<h4>Mes</h4><div class="auxf-meses">${meses}</div><h4>Período personalizado</h4><div class="auxf-libre"><label>Desde<input type="date" data-auxf-desde max="${hoy}" value="${esc(b.start||'')}"></label><label>Hasta<input type="date" data-auxf-hasta max="${hoy}" value="${esc(b.end||'')}"></label><button type="button" class="auxf-aplicar" data-auxf-rango>Aplicar</button></div><p class="auxf-error" role="alert" hidden></p></div></div>`;
}

/* ── Selección ───────────────────────────────────────────────────────── */
/* options: [{value,label,hint}]. Con más de 8 opciones suma un buscador. */
function select({id,label,icon='',value='',options=[],allLabel='Todos'}={}){
  const current=options.find(o=>String(o.value)===String(value)),active=!!value&&!!current;
  const rows=[{value:'',label:allLabel},...options].map(o=>{const on=String(o.value)===String(value||'')&&(o.value!==''||!active);return`<button type="button" class="auxf-opt${on?' on':''}" role="option" aria-selected="${on}" data-auxf-value="${esc(o.value)}" data-auxf-text="${esc(String(o.label||'').toLowerCase())}"><span>${esc(o.label)}</span>${o.hint?`<small>${esc(o.hint)}</small>`:''}${on?'<i aria-hidden="true">✓</i>':''}</button>`;}).join('');
  return`<div class="auxf" data-auxf="${esc(id)}" data-auxf-kind="select"><button type="button" class="auxf-btn${active?' is-active':''}" data-auxf-open aria-haspopup="listbox" aria-expanded="false">${icon?`<span class="auxf-ico" aria-hidden="true">${icon}</span>`:''}<span class="auxf-txt"><small class="auxf-label">${esc(label)}</small><b>${esc(active?current.label:allLabel)}</b></span><span class="auxf-caret" aria-hidden="true">▾</span></button>`
   +`<div class="auxf-pop auxf-pop-select" hidden><h4>${esc(label)}</h4>${options.length>8?`<input type="search" class="auxf-find" data-auxf-find placeholder="Buscar ${esc(label.toLowerCase())}…" autocomplete="off">`:''}<div class="auxf-opts" role="listbox" aria-label="${esc(label)}">${rows}</div><p class="auxf-none" hidden>Sin coincidencias</p></div></div>`;
}

/* ── Buscador ────────────────────────────────────────────────────────── */
function search({id,value='',placeholder='Buscar…'}={}){return`<label class="auxf-search"><span aria-hidden="true">⌕</span><input id="${esc(id)}" type="search" autocomplete="off" placeholder="${esc(placeholder)}" value="${esc(value)}"></label>`;}
function clear({count=0}={}){return count?`<button type="button" class="auxf-clear" data-auxf-clear>Limpiar filtros <b>${count}</b></button>`:'';}

/* ── Comportamiento ──────────────────────────────────────────────────── */
function closeAll(except){document.querySelectorAll('.auxf-pop:not([hidden])').forEach(pop=>{if(pop===except)return;pop.hidden=true;pop.closest('.auxf')?.querySelector('[data-auxf-open]')?.setAttribute('aria-expanded','false');});}
function open(box){const pop=box.querySelector('.auxf-pop'),btn=box.querySelector('[data-auxf-open]');if(!pop)return;const on=pop.hidden;closeAll(pop);pop.hidden=!on;btn?.setAttribute('aria-expanded',on?'true':'false');if(on){pop.classList.toggle('align-right',box.getBoundingClientRect().left+pop.offsetWidth>window.innerWidth-12);pop.querySelector('[data-auxf-find]')?.focus();}}
const handlers=new WeakMap();
/* onChange(id, value) · value es el período o el string elegido. onClear() opcional. */
function bind(root,onChange,onClear){
  if(!root)return;handlers.set(root,{onChange,onClear});
  if(root.dataset.auxfBound==='1')return;root.dataset.auxfBound='1';
  root.addEventListener('click',ev=>{
    const h=handlers.get(root);if(!h)return;
    if(ev.target.closest('[data-auxf-clear]')){ev.preventDefault();closeAll();h.onClear?.();return;}
    const box=ev.target.closest('.auxf');if(!box||!root.contains(box))return;
    const id=box.dataset.auxf;
    if(ev.target.closest('[data-auxf-open]')){ev.preventDefault();open(box);return;}
    const opt=ev.target.closest('[data-auxf-value]');
    if(opt){ev.preventDefault();closeAll();h.onChange?.(id,opt.dataset.auxfValue);return;}
    if(ev.target.closest('[data-auxf-all]')){ev.preventDefault();closeAll();h.onChange?.(id,{mode:'all'});return;}
    const mes=ev.target.closest('[data-auxf-mes]');
    if(mes){ev.preventDefault();closeAll();h.onChange?.(id,{mode:'mes',mes:mes.dataset.auxfMes});return;}
    if(ev.target.closest('[data-auxf-rango]')){
      ev.preventDefault();const desde=box.querySelector('[data-auxf-desde]')?.value,hasta=box.querySelector('[data-auxf-hasta]')?.value,err=box.querySelector('.auxf-error');
      if(!desde||!hasta||desde>hasta){if(err){err.textContent=desde&&hasta?'La fecha "desde" tiene que ser anterior a la de "hasta".':'Completá las dos fechas.';err.hidden=false;}return;}
      closeAll();h.onChange?.(id,{mode:'rango',desde,hasta});
    }
  });
  root.addEventListener('input',ev=>{
    const find=ev.target.closest?.('[data-auxf-find]');if(!find)return;
    const q=find.value.toLowerCase().trim(),pop=find.closest('.auxf-pop');let shown=0;
    pop.querySelectorAll('[data-auxf-value]').forEach(o=>{const show=!q||o.dataset.auxfText.includes(q);o.hidden=!show;if(show)shown++;});
    const none=pop.querySelector('.auxf-none');if(none)none.hidden=shown>0;
  });
  root.addEventListener('keydown',ev=>{
    const find=ev.target.closest?.('[data-auxf-find]');if(!find||ev.key!=='Enter')return;
    ev.preventDefault();find.closest('.auxf-pop')?.querySelector('[data-auxf-value]:not([hidden])')?.click();
  });
}
document.addEventListener('click',ev=>{if(!ev.target.closest?.('.auxf'))closeAll();});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape')closeAll();});

window.AuxFilters={period,select,search,clear,bind,closeAll,periodBounds,periodFromMonth,periodMonth,describePeriod,inPeriod,rangoDeMes};
})();

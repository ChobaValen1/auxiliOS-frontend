/* AuxiliOS · Remitos · filtros agrupados (celular) v1
   En pantallas chicas la barra de filtros se reduce a buscador + botón
   "Filtros". El botón abre una hoja con todos los filtros agrupados; cada fila
   muestra el valor elegido y abre su lista de opciones. Los cambios se juntan
   en un borrador y se aplican con "Ver N remitos" (el número se calcula con
   los mismos filtros que la lista).

   Permisos: Estado y Período para todos. Chofer, Tipo de servicio y Medio de
   pago solo para Administración/Supervisión (el chofer ya ve solo lo suyo).
   "Por revisar" solo para Administración/Supervisión.

   Escribe sobre la misma fuente que la barra de escritorio (filtroEstado,
   filtroPeriodo y los controles ocultos de .rmx-sources) y aplica con
   aplicarFiltrosRemitos(), así las dos vistas quedan siempre iguales. */
(()=>{'use strict';
if(window.RemitosFiltros)return;

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const role=()=>{try{return PERFIL_USUARIO?.roles?.name||''}catch(_){return''}};
const gestion=()=>['administracion','supervision'].includes(role());
const pad=n=>String(n).padStart(2,'0');
const S={draft:null,view:'main',countTurn:0};

const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
function mesBounds(offset){const h=new Date(),a=new Date(h.getFullYear(),h.getMonth()+offset,1),b=new Date(h.getFullYear(),h.getMonth()+offset+1,0);return{desde:ymd(a),hasta:ymd(b)}}
const corta=iso=>{const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1].slice(2)}`:''};
const MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const nombreMes=offset=>{const h=new Date(),d=new Date(h.getFullYear(),h.getMonth()+offset,1);return`${MESES[d.getMonth()].replace(/^./,c=>c.toUpperCase())} ${d.getFullYear()}`};

function estados(){
  const base=[['','Todos'],['firmado','Firmados'],['pendiente','Pendientes']];
  if(gestion())base.push(['revisar','Por revisar']);
  base.push(['anulado','Anulados']);
  return base;
}
const opcionesSelect=id=>[...($(id)?.options||[])].map(o=>[o.value,o.value?o.textContent.trim():'Todos']);

/* Estado actual (fuente única) → borrador */
function leer(){
  let estado='',periodo='todos';
  try{estado=filtroEstado==='todos'?'':filtroEstado;periodo=filtroPeriodo}catch(_){}
  const desde=$('filtro-desde')?.value||'',hasta=$('filtro-hasta')?.value||'',dia=$('filtro-dia-especifico')?.value||'';
  let per={mode:'all'};
  const cmp=(o)=>{const b=mesBounds(o);return desde===b.desde&&hasta===b.hasta};
  if(periodo==='mes')per={mode:'mes'};
  else if(periodo==='dia'&&dia)per={mode:'rango',desde:dia,hasta:dia};
  else if(periodo==='rango'&&desde&&hasta)per=cmp(0)?{mode:'mes'}:cmp(-1)?{mode:'mesAnt'}:{mode:'rango',desde,hasta};
  return{estado,periodo:per,chofer:$('filtro-chofer-input')?.value||'',tipo:$('filtro-tipo-servicio')?.value||'',pago:$('filtro-pago')?.value||''};
}
function limites(p){if(p.mode==='mes')return mesBounds(0);if(p.mode==='mesAnt')return mesBounds(-1);if(p.mode==='rango'&&p.desde&&p.hasta)return{desde:p.desde,hasta:p.hasta};return null}
/* Borrador → objeto de filtros (mismo formato que _leerFiltrosRemitosUI) */
function aFiltros(d){
  const base=typeof _leerFiltrosRemitosUI==='function'?_leerFiltrosRemitosUI():{};
  const b=limites(d.periodo);
  return{...base,estado:d.estado||'todos',periodo:b?'rango':'todos',desde:b?.desde||'',hasta:b?.hasta||'',diaEspecifico:'',
    driverId:gestion()?d.chofer:base.driverId,tipoServicio:gestion()?d.tipo:'',pagoMetodo:gestion()?d.pago:''};
}
const activos=d=>[d.estado,d.periodo.mode!=='all',gestion()&&d.chofer,gestion()&&d.tipo,gestion()&&d.pago].filter(Boolean).length;

function valorPeriodo(p){
  if(p.mode==='mes')return`Este mes · ${nombreMes(0)}`;
  if(p.mode==='mesAnt')return nombreMes(-1);
  if(p.mode==='rango'&&p.desde&&p.hasta)return p.desde===p.hasta?corta(p.desde):`${corta(p.desde)} – ${corta(p.hasta)}`;
  return'Todas las fechas';
}
const etiqueta=(opts,v)=>(opts.find(([k])=>k===v)||[, 'Todos'])[1];

function filas(){
  const d=S.draft,rows=[[{id:'estado',label:'Estado',value:etiqueta(estados(),d.estado)},{id:'periodo',label:'Período',value:valorPeriodo(d.periodo)}]];
  if(gestion())rows.push([
    {id:'chofer',label:'Chofer',value:etiqueta(opcionesSelect('filtro-chofer-input'),d.chofer)},
    {id:'tipo',label:'Tipo de servicio',value:etiqueta(opcionesSelect('filtro-tipo-servicio'),d.tipo)},
    {id:'pago',label:'Medio de pago',value:etiqueta(opcionesSelect('filtro-pago'),d.pago)},
  ]);
  return rows;
}
const OPCIONES={estado:()=>estados(),chofer:()=>opcionesSelect('filtro-chofer-input'),tipo:()=>opcionesSelect('filtro-tipo-servicio'),pago:()=>opcionesSelect('filtro-pago')};
const TITULOS={estado:'Estado',periodo:'Período',chofer:'Chofer',tipo:'Tipo de servicio',pago:'Medio de pago'};

function ensure(){
  if($('rfs-sheet'))return;
  const root=document.createElement('div');
  root.innerHTML=`<div class="rfs-backdrop" id="rfs-backdrop" hidden></div>
  <section class="rfs-sheet" id="rfs-sheet" role="dialog" aria-modal="true" aria-labelledby="rfs-title" hidden>
    <header class="rfs-head"><button class="rfs-back" id="rfs-back" type="button" aria-label="Volver" hidden>‹</button><h2 id="rfs-title">Filtros</h2><button class="rfs-close" type="button" aria-label="Cerrar" onclick="RemitosFiltros.close()">×</button></header>
    <div class="rfs-body" id="rfs-body"></div>
    <footer class="rfs-foot"><button class="rfs-clear" id="rfs-clear" type="button">Limpiar</button><button class="rfs-apply" id="rfs-apply" type="button">Ver remitos</button></footer>
  </section>`;
  document.body.append(...root.children);
  $('rfs-backdrop').addEventListener('click',close);
  $('rfs-back').addEventListener('click',()=>{S.view='main';render()});
  $('rfs-clear').addEventListener('click',()=>{S.draft={estado:'',periodo:{mode:'all'},chofer:'',tipo:'',pago:''};S.view='main';render()});
  $('rfs-apply').addEventListener('click',aplicar);
  $('rfs-body').addEventListener('click',e=>{
    const row=e.target.closest('[data-rfs-open]');if(row){S.view=row.dataset.rfsOpen;render();return}
    const opt=e.target.closest('[data-rfs-value]');if(!opt)return;
    const campo=S.view,v=opt.dataset.rfsValue;
    if(campo==='periodo'){if(v==='rango'){S.draft.periodo={mode:'rango',desde:S.draft.periodo.desde||'',hasta:S.draft.periodo.hasta||''};render();return}S.draft.periodo={mode:v}}
    else S.draft[campo]=v;
    S.view='main';render();
  });
  $('rfs-body').addEventListener('change',e=>{
    if(!e.target.matches('#rfs-desde,#rfs-hasta'))return;
    S.draft.periodo={mode:'rango',desde:$('rfs-desde').value,hasta:$('rfs-hasta').value};
    contar();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('rfs-sheet').hidden)close()});
}

function render(){
  const body=$('rfs-body'),d=S.draft;if(!body||!d)return;
  const main=S.view==='main';
  $('rfs-back').hidden=main;$('rfs-title').textContent=main?'Filtros':TITULOS[S.view];
  if(main){
    body.innerHTML=filas().map(g=>`<div class="rfs-group">${g.map(f=>`<button class="rfs-row" type="button" data-rfs-open="${f.id}"><span class="rfs-label">${f.label}</span><span class="rfs-value${f.value==='Todos'||f.value==='Todas las fechas'?'':' is-set'}">${esc(f.value)}</span><span class="rfs-chev" aria-hidden="true">›</span></button>`).join('')}</div>`).join('');
  }else if(S.view==='periodo'){
    const p=d.periodo,opts=[['all','Todas las fechas'],['mes',`Este mes · ${nombreMes(0)}`],['mesAnt',nombreMes(-1)],['rango','Elegir fechas']];
    body.innerHTML=`<div class="rfs-group">${opts.map(([k,l])=>opcion(k,l,p.mode===k)).join('')}</div>${p.mode==='rango'?`<div class="rfs-group rfs-range"><label><span>Desde</span><input type="date" id="rfs-desde" value="${esc(p.desde||'')}"></label><span class="rfs-dash">–</span><label><span>Hasta</span><input type="date" id="rfs-hasta" value="${esc(p.hasta||'')}"></label></div>`:''}`;
  }else{
    const actual=d[S.view]||'';
    body.innerHTML=`<div class="rfs-group rfs-list">${OPCIONES[S.view]().map(([k,l])=>opcion(k,l,actual===k)).join('')}</div>`;
  }
  const n=activos(d);$('rfs-clear').textContent=n?`Limpiar (${n})`:'Limpiar';$('rfs-clear').disabled=!n;
  contar();
}
const opcion=(v,l,on)=>`<button class="rfs-opt${on?' is-on':''}" type="button" data-rfs-value="${esc(v)}" aria-pressed="${on}"><span>${esc(l)}</span>${on?'<span class="rfs-check" aria-hidden="true">✓</span>':''}</button>`;

async function contar(){
  const btn=$('rfs-apply');if(!btn||!S.draft)return;
  const p=S.draft.periodo;
  if(p.mode==='rango'&&(!p.desde||!p.hasta)){btn.textContent='Elegí las dos fechas';btn.disabled=true;return}
  btn.disabled=false;
  const turn=++S.countTurn;btn.textContent='Ver remitos';
  if(typeof contarRemitosFiltrados!=='function')return;
  const n=await contarRemitosFiltrados(aFiltros(S.draft));
  if(turn!==S.countTurn||n==null)return;
  btn.textContent=n===1?'Ver 1 remito':`Ver ${n.toLocaleString('es-AR')} remitos`;
}

function aplicar(){
  const d=S.draft;if(!d)return;
  const b=limites(d.periodo);
  try{filtroEstado=d.estado||'todos';filtroPeriodo=b?'rango':'todos'}catch(_){}
  const set=(id,v)=>{const el=$(id);if(el)el.value=v};
  set('filtro-desde',b?.desde||'');set('filtro-hasta',b?.hasta||'');set('filtro-dia-especifico','');
  if(gestion()){set('filtro-chofer-input',d.chofer);set('filtro-tipo-servicio',d.tipo);set('filtro-pago',d.pago)}
  close();
  if(typeof aplicarFiltrosRemitos==='function')aplicarFiltrosRemitos();
}

function open(){ensure();S.draft=leer();S.view='main';$('rfs-backdrop').hidden=false;$('rfs-sheet').hidden=false;requestAnimationFrame(()=>$('rfs-sheet').classList.add('is-open'));render()}
function close(){const s=$('rfs-sheet');if(!s||s.hidden)return;s.classList.remove('is-open');$('rfs-backdrop').hidden=true;setTimeout(()=>{s.hidden=true},180)}

/* Número de filtros activos en el botón de la barra (lo llama _rmxRenderFilters). */
function sync(){const b=$('rmx-sheet-count');if(!b)return;const n=activos(leer());b.textContent=n?String(n):'';b.hidden=!n}

window.RemitosFiltros={open,close,sync,_state:S,_aFiltros:aFiltros,_leer:leer};
})();

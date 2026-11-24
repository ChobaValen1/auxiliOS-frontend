/* Panel de detalle de solo lectura del Historial de servicios.
   Se abre al tocar una fila: panel lateral en escritorio, hoja desde abajo en celular.
   El módulo sólo dibuja; los datos y las acciones los entrega operator-services.js (host). */
(()=>{'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let host=null,el=null,backdrop=null,cur=null,opener=null;
const row=(l,v)=>v===undefined||v===null||v===''?'':`<dt>${esc(l)}</dt><dd>${v}</dd>`;
const section=(title,body,cls='')=>body?`<section class="hd-sec ${cls}"><h3>${esc(title)}</h3>${body}</section>`:'';
function render(m){
  const chips=[`<span class="hd-chip hd-${esc(m.statusTone)}">${esc(m.statusLabel)}</span>`,m.billing?`<span class="hd-chip hd-bill">${esc(m.billing)}</span>`:'',m.docChip?`<span class="hd-chip hd-doc">${esc(m.docChip)}</span>`:''].join('');
  const tl=m.timeline.length?`<ol class="hd-tl">${m.timeline.map(e=>`<li><time>${esc(e.time)}</time><span>${esc(e.label)}${e.note?` <em>${esc(e.note)}</em>`:''}</span></li>`).join('')}</ol>`:'';
  const route=`<dl class="hd-kv">${row('Origen',esc(m.route.origin))}${row('Destino',esc(m.route.destination))}${row('Distancia',m.route.km?esc(m.route.km):'')}</dl>${m.route.mapsUrl?`<a class="hd-link" href="${esc(m.route.mapsUrl)}" target="_blank" rel="noopener">Ver recorrido en Maps</a>`:''}`;
  const crew=`<dl class="hd-kv">${row('Chofer',esc(m.crew.driver))}${row('Móvil',esc(m.crew.truck))}${row('Patente',esc(m.crew.plate))}${row('Vehículo',esc(m.crew.vehicle))}</dl>`;
  const docs=m.docs.length?`<dl class="hd-kv">${m.docs.map(([l,v])=>row(l,esc(v))).join('')}</dl>`:'<p class="hd-muted">Sin remito cargado.</p>';
  const body=section('Línea de tiempo',tl)+section('Recorrido',route)+section('Equipo',crew)+section('Peajes',`<div class="hd-tolls">${m.tollsHtml}</div>`)+section('Remito y documentos',docs)+(m.billingRows?section('Facturación',`<dl class="hd-kv">${m.billingRows.map(([l,v])=>row(l,esc(v))).join('')}</dl>`,'hd-adm'):'')+(m.cancelReason?section('Motivo de anulación',`<p>${esc(m.cancelReason)}</p>`):'');
  const pos=m.position?`<span class="hd-pos">${m.position.index} de ${m.position.total}</span>`:'';
  return `<header class="hd-head"><div class="hd-grab" aria-hidden="true"></div><div class="hd-top"><div><small>${esc(m.provider)}${m.type?` · ${esc(m.type)}`:''}</small><strong class="hd-num">${esc(m.number)}</strong><div class="hd-chips">${chips}<span class="hd-when">${esc(m.when)}</span></div></div><div class="hd-tools">${pos}<button type="button" class="hd-btn" data-hd="prev" aria-label="Servicio anterior"${m.position&&m.position.index>1?'':' disabled'}>‹</button><button type="button" class="hd-btn" data-hd="next" aria-label="Servicio siguiente"${m.position&&m.position.index<m.position.total?'':' disabled'}>›</button><button type="button" class="hd-btn" data-hd="close" aria-label="Cerrar detalle">✕</button></div></div></header><div class="hd-body">${body}</div><footer class="hd-foot"><button type="button" class="hd-act" data-hd="copy">Copiar resumen</button>${m.canEdit?'<button type="button" class="hd-act" data-hd="edit">Editar servicio</button>':''}<button type="button" class="hd-act hd-primary" data-hd="full">Abrir completo</button></footer>`;
}
function ensure(){
  if(el)return;
  backdrop=document.createElement('div');backdrop.className='hd-backdrop';backdrop.hidden=true;backdrop.addEventListener('click',close);
  el=document.createElement('aside');el.id='os-history-detail';el.className='hd';el.hidden=true;el.setAttribute('role','dialog');el.setAttribute('aria-label','Detalle del servicio');el.tabIndex=-1;
  el.addEventListener('click',e=>{const b=e.target.closest('[data-hd]');if(!b||b.disabled)return;const a=b.dataset.hd;if(a==='close')close();else if(a==='prev')nav(-1);else if(a==='next')nav(1);else if(a==='full'){const id=cur;close();host.openFull(id);}else if(a==='edit'){const id=cur;close();host.edit(id);}else if(a==='copy')copy();});
  document.addEventListener('keydown',e=>{if(el.hidden)return;if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='ArrowDown'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')){e.preventDefault();nav(1);}else if(e.key==='ArrowUp'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')){e.preventDefault();nav(-1);}});
  document.body.append(backdrop,el);
}
function mark(){document.querySelectorAll('#os-table-body tr.os-row-selected').forEach(r=>r.classList.remove('os-row-selected'));if(cur==null)return;const r=[...document.querySelectorAll('#os-table-body tr[data-service-id]')].find(x=>x.dataset.serviceId===String(cur));if(r){r.classList.add('os-row-selected');if(!el.hidden&&!r.closest('.os-table-wrap')?.matches(':hover'))r.scrollIntoView({block:'nearest'});}}
function paint(){
  const m=host.model(cur);
  if(!m){close();return;}
  const top=el.querySelector('.hd-body')?.scrollTop||0,same=el.dataset.id===String(cur);
  el.innerHTML=render(m);el.dataset.id=String(cur);
  if(same){const b=el.querySelector('.hd-body');if(b)b.scrollTop=top;}
  mark();
}
function open(id){ensure();opener=document.activeElement;cur=id;paint();if(!cur)return;el.hidden=false;backdrop.hidden=false;document.body.classList.add('hd-open');el.focus({preventScroll:true});}
function close(){if(!el)return;el.hidden=true;backdrop.hidden=true;document.body.classList.remove('hd-open');cur=null;mark();if(opener&&document.contains(opener))opener.focus?.({preventScroll:true});opener=null;}
function nav(d){const ids=host.ids(),i=ids.indexOf(String(cur)),n=ids[i+d];if(n===undefined)return;cur=n;host.onNav?.(n);paint();el.querySelector('.hd-body')?.scrollTo?.(0,0);}
function copy(){const t=host.summary(cur);if(!t)return;const done=()=>host.notify('Resumen copiado','success');(navigator.clipboard?.writeText(t)||Promise.reject()).then(done,()=>{const a=document.createElement('textarea');a.value=t;document.body.append(a);a.select();try{document.execCommand('copy');done();}catch{host.notify('No se pudo copiar','error');}a.remove();});}
/* Si la lista se vuelve a dibujar (otra página, filtro o refresco) el panel se actualiza o se cierra. */
function refresh(){if(!el||el.hidden)return;paint();}
window.AuxiliosHistoryDetail={init(h){host=h;},open,close,refresh,isOpen:()=>!!el&&!el.hidden,render};
})();

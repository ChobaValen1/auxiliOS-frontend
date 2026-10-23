/* Driver-only organization; destinations keep their existing permission checks. */
(()=>{'use strict';
const driver=()=>{try{return PERFIL_USUARIO?.roles?.name==='chofer';}catch{return false;}};
const icon=n=>`<svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#${n}"/></svg>`;
function sync(){
 const on=driver();document.body.classList.toggle('driver-navigation',on);
 const yo=document.getElementById('nav-yo');if(!yo)return;yo.hidden=!on;
 const active=document.querySelector('.screen.active')?.id,selected=on&&['screen-yo','screen-grilla','screen-documentos'].includes(active);
 if(yo.classList.contains('active')!==selected)yo.classList.toggle('active',selected);
 if(selected)for(const id of ['nav-grilla','nav-documentos']){const item=document.getElementById(id);if(item?.classList.contains('active'))item.classList.remove('active');}
 let name='Mi espacio';try{name=PERFIL_USUARIO?.full_name||name;}catch{}
 const heading=document.getElementById('driver-yo-name');if(heading.textContent!==name)heading.textContent=name;
}
function init(){
 const nav=document.querySelector('.sidenav'),content=document.querySelector('.content');if(!nav||!content)return;
 const yo=document.createElement('div');yo.id='nav-yo';yo.className='nav-item';yo.hidden=true;yo.tabIndex=0;yo.setAttribute('role','link');yo.title='Yo';yo.innerHTML=`<span class="nav-icon">${icon('user')}</span><span class="nav-label">Yo</span>`;yo.addEventListener('click',()=>{if(driver())window.goTo('yo');});nav.querySelector('.nav-bottom')?.before(yo);
 const screen=document.createElement('section');screen.id='screen-yo';screen.className='screen';screen.innerHTML=`<div class="driver-yo"><p class="driver-yo-eyebrow">MI ESPACIO</p><h2 id="driver-yo-name">Mi espacio</h2><p>Tu grilla y documentación, en un solo lugar.</p><div class="driver-yo-links"><button type="button" data-driver-go="grilla">${icon('calendar')}<span><b>Grilla</b><small>Consultá tus turnos y asignaciones</small></span>${icon('chevron-right')}</button><button type="button" data-driver-go="documentos">${icon('file-text')}<span><b>Docs</b><small>Consultá tu documentación y vencimientos</small></span>${icon('chevron-right')}</button></div></div>`;screen.addEventListener('click',e=>{const b=e.target.closest('[data-driver-go]');if(b&&driver())window.goTo(b.dataset.driverGo);});content.appendChild(screen);
 if(typeof SCREENS!=='undefined')SCREENS.yo={title:'Yo',sub:'Grilla y documentación'};
 new MutationObserver(sync).observe(nav,{subtree:true,attributes:true,attributeFilter:['class','style'],childList:true});
 new MutationObserver(sync).observe(content,{subtree:true,attributes:true,attributeFilter:['class']});sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

// Celular del chofer: «Ver más» cuando la pantalla sigue hacia abajo, marca deslizante en
// Activos / Historial y entrada escalonada de las tarjetas al cambiar de vista.
(function(){
  'use strict';
  if(window.AxDriverMobile)return;
  var mq=window.matchMedia('(max-width: 767px)');
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  var driver=function(){return document.body.classList.contains('driver-navigation');};
  var visible=function(el){return !!el&&el.getClientRects().length>0;};
  var btn,fade,current=null,frame=0;

  function build(){
    btn=document.createElement('button');btn.type='button';btn.className='dm-more';btn.setAttribute('aria-label','Ver más: bajar en la pantalla');
    btn.innerHTML='<span>Ver más</span><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    btn.addEventListener('click',function(){if(!current)return;current.scrollBy({top:Math.round(current.clientHeight*0.7),behavior:reduce.matches?'auto':'smooth'});});
    fade=document.createElement('div');fade.className='dm-fade';fade.setAttribute('aria-hidden','true');
    document.body.append(fade,btn);
  }
  // Lo que se está mirando: una hoja o ventana abierta manda sobre la pantalla de atrás.
  function scroller(){
    var sheet=document.querySelector('#p3-service-preview:not([hidden]) > section');if(visible(sheet))return {el:sheet,sheet:true};
    var dlg=document.querySelector('dialog.dsh-dialog[open] .dsh-body');if(visible(dlg))return {el:dlg,sheet:true};
    var modals=[].slice.call(document.querySelectorAll('.modal-backdrop.open .modal-body')).filter(visible);if(modals.length)return {el:modals[modals.length-1],sheet:true};
    if([].slice.call(document.querySelectorAll('.modal-backdrop.open, dialog[open], .dtr-dialog[open]')).some(visible))return null;
    var wizard=document.getElementById('remitos-nuevo');
    if(visible(wizard)&&document.getElementById('screen-remitos')?.classList.contains('active')){
      // Remito: se desplaza el paso abierto; el indicador queda arriba de la botonera.
      var panel=wizard.querySelector('.rem-step-panel.active');for(var el=panel;el&&el!==wizard;el=el.parentElement){if(/(auto|scroll)/.test(getComputedStyle(el).overflowY))return {el:el,sheet:true,foot:wizard.querySelector('.rem-wizard-footer')};}
      return null;
    }
    var content=document.querySelector('.main .content');return visible(content)?{el:content,sheet:false}:null;
  }
  function update(){
    frame=0;if(!btn)return;
    var on=mq.matches&&driver(),s=on?scroller():null,el=s&&s.el;
    var left=el?el.scrollHeight-el.clientHeight-el.scrollTop:0,show=!!el&&el.scrollHeight>el.clientHeight+24&&left>48;
    current=show?el:null;
    if(show){
      var r=el.getBoundingClientRect(),nav=document.querySelector('.sidenav'),limit=r.bottom;
      if(!s.sheet&&visible(nav))limit=Math.min(limit,nav.getBoundingClientRect().top);
      if(s.foot&&visible(s.foot))limit=Math.min(limit,s.foot.getBoundingClientRect().top);
      btn.style.bottom=Math.max(12,Math.round(innerHeight-limit+12))+'px';
      fade.style.bottom=Math.round(innerHeight-limit)+'px';
    }
    btn.classList.toggle('is-visible',show);fade.classList.toggle('is-visible',show&&!s.sheet);
    btn.tabIndex=show?0:-1;btn.setAttribute('aria-hidden',show?'false':'true');
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(update);}

  // Activos / Historial: una marca que se desliza a la opción elegida.
  function ink(){
    var sw=document.querySelector('#phase3-driver-services .p3-view-switch');if(!sw)return;
    var mark=sw.querySelector('.dm-ink');if(!mark){mark=document.createElement('span');mark.className='dm-ink';mark.setAttribute('aria-hidden','true');sw.prepend(mark);sw.classList.add('has-ink');}
    var a=sw.querySelector('.p3-refresh.active');if(!a||!a.offsetWidth)return;
    var x=a.offsetLeft-3,w=a.offsetWidth+'px';
    if(mark.style.width!==w)mark.style.width=w;var t='translateX('+x+'px)';if(mark.style.transform!==t)mark.style.transform=t;
  }
  // Al tocar Activos o Historial, las tarjetas que llegan entran escalonadas (como en Servicios).
  var animateNext=false;
  function animateList(list){
    if(!list||reduce.matches)return;list.classList.remove('dhc-animate');void list.offsetWidth;list.classList.add('dhc-animate');
    clearTimeout(list._dhcT);list._dhcT=setTimeout(function(){list.classList.remove('dhc-animate');},1100);
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('#p3-view-history,#p3-view-active');if(!b)return;
    animateNext=b.id==='p3-view-history';if(!animateNext)requestAnimationFrame(function(){animateList(document.getElementById('phase3-driver-services-list'));});
  },true);

  function init(){
    build();
    addEventListener('scroll',schedule,{capture:true,passive:true});
    addEventListener('resize',function(){schedule();ink();});
    mq.addEventListener?.('change',schedule);
    new MutationObserver(function(records){
      records=records.filter(function(r){return r.target!==btn&&r.target!==fade&&!(r.target.classList&&r.target.classList.contains('dm-ink'));});if(!records.length)return;
      schedule();
      if(records.some(function(r){return r.target.closest&&r.target.closest('#phase3-driver-services');}))requestAnimationFrame(ink);
      if(animateNext&&records.some(function(r){return r.target.id==='mobile-remitos-list'&&r.addedNodes.length;})){animateNext=false;animateList(document.getElementById('mobile-remitos-list'));}
    }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','open','style']});
    schedule();ink();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  window.AxDriverMobile={update:schedule};
})();

// U8 · Botón flotante que se achica al bajar y se agranda al subir (solo celular).
// Remitos: el «+» existente pasa a «+ Nuevo remito». Servicios: se suma «+ Nuevo servicio» dentro de su pantalla.
(function(){
  if(window.AxScrollFab)return;
  var mq=window.matchMedia('(max-width: 767px)'),last=new WeakMap(),collapsed=false;
  function label(btn,text){
    if(btn.classList.contains('ax-scroll-fab'))return;
    btn.classList.add('ax-scroll-fab');btn.setAttribute('aria-label',text);
    btn.innerHTML='<span class="ax-scroll-fab-icon" aria-hidden="true">+</span><span class="ax-scroll-fab-text">'+text+'</span>';
  }
  function ensure(){
    var r=document.getElementById('btn-nuevo-remito-fab');if(r)label(r,'Nuevo remito');
    var ops=document.getElementById('screen-operaciones');
    if(ops&&!document.getElementById('os-new-service-fab')&&ops.querySelector('.os-manage')){
      var b=document.createElement('button');b.type='button';b.id='os-new-service-fab';b.className='fab-new-remito mobile-only';
      b.addEventListener('click',function(){window.abrirNuevoServicio&&window.abrirNuevoServicio();});
      ops.appendChild(b);label(b,'Nuevo servicio');
    }
  }
  function set(v){
    if(v===collapsed)return;collapsed=v;
    document.querySelectorAll('.ax-scroll-fab').forEach(function(b){b.classList.toggle('is-collapsed',v);});
  }
  addEventListener('scroll',function(e){
    if(!mq.matches)return;
    var t=e.target===document?document.scrollingElement:e.target;if(!t||t.nodeType!==1)return;
    var y=t.scrollTop,prev=last.has(t)?last.get(t):y;last.set(t,y);
    if(y<40)set(false);else if(y-prev>6)set(true);else if(prev-y>6)set(false);
  },{capture:true,passive:true});
  new MutationObserver(ensure).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState!=='loading')ensure();else document.addEventListener('DOMContentLoaded',ensure);
  window.AxScrollFab={set:set};
})();

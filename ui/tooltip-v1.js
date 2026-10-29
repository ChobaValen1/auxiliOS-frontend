// U13 · Tooltip con borde: reemplaza el globo nativo de «title» por uno con el estilo del sistema.
// Se muestra al pasar el mouse (con demora corta) o al enfocar con teclado; se oculta con Escape.
// En pantallas táctiles no hace nada: ahí el title nativo tampoco se ve.
(function(){
  if(window.AxTooltip||!window.matchMedia||!matchMedia('(hover:hover)').matches)return;
  var tip=null,target=null,timer=0,DELAY=350;
  function el(){
    if(tip)return tip;
    tip=document.createElement('div');tip.className='ax-tip';tip.id='ax-tip';tip.setAttribute('role','tooltip');
    document.body.appendChild(tip);return tip;
  }
  function owner(node){
    while(node&&node.nodeType===1){
      if(node.hasAttribute('data-ax-tip')||node.hasAttribute('title'))return node;
      node=node.parentElement;
    }
    return null;
  }
  function take(node){
    var t=node.getAttribute('title');
    if(t!=null){node.setAttribute('data-ax-tip',t);node.removeAttribute('title');}
    return (node.getAttribute('data-ax-tip')||'').trim();
  }
  function place(){
    if(!tip||!target)return;
    var r=target.getBoundingClientRect(),w=tip.offsetWidth,h=tip.offsetHeight,gap=8;
    var top=r.top-h-gap,below=top<6;if(below)top=r.bottom+gap;
    var left=Math.max(6,Math.min(innerWidth-w-6,r.left+r.width/2-w/2));
    tip.style.transform='translate('+Math.round(left)+'px,'+Math.round(top)+'px)';
    tip.dataset.side=below?'bottom':'top';
  }
  function show(node){
    var text=take(node);if(!text)return;
    target=node;var t=el();t.textContent=text;
    node.setAttribute('aria-describedby','ax-tip');
    place();t.classList.add('is-on');
  }
  function hide(){
    clearTimeout(timer);
    if(target)target.removeAttribute('aria-describedby');
    target=null;if(tip)tip.classList.remove('is-on');
  }
  document.addEventListener('pointerover',function(e){
    var n=owner(e.target);if(n===target)return;hide();if(!n)return;
    take(n);timer=setTimeout(function(){show(n);},DELAY);
  },true);
  document.addEventListener('pointerout',function(e){var n=owner(e.target);if(n&&!n.contains(e.relatedTarget))hide();},true);
  document.addEventListener('focusin',function(e){var n=owner(e.target);if(n&&e.target.matches(':focus-visible'))show(n);},true);
  document.addEventListener('focusout',hide,true);
  document.addEventListener('pointerdown',hide,true);
  document.addEventListener('keydown',function(e){if(e.key==='Escape')hide();},true);
  addEventListener('scroll',hide,true);addEventListener('resize',hide);
  window.AxTooltip={hide:hide};
})();

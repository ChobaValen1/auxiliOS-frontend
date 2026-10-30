// U11 · Números que cuentan: los valores de las tarjetas del Panel suben desde 0 al aparecer.
// Respeta el formato que ya trae el texto ($, puntos de miles, coma decimal, unidades).
// Con movimiento reducido no anima. Solo vuelve a contar si el valor cambió.
(function(){
  if(window.AxCount)return;
  var SEL='.kpi-dash-val,.rsm-kpi-value,[data-ax-count]',DUR=700;
  var NUM=/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/;
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  function textNode(el){
    var w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),n;
    while((n=w.nextNode()))if(NUM.test(n.nodeValue))return n;
    return null;
  }
  function run(el){
    var final=el.textContent;
    if(el.dataset.axCountDone===final)return;
    el.dataset.axCountDone=final;
    var node=textNode(el);if(!node||reduce)return;
    var src=node.nodeValue,m=src.match(NUM),tok=m[0];
    var dec=(tok.split(',')[1]||'').length,grouped=tok.indexOf('.')>=0;
    var target=parseFloat(tok.replace(/\./g,'').replace(',','.'));if(!(target>0))return;
    var fmt=new Intl.NumberFormat('es-AR',{minimumFractionDigits:dec,maximumFractionDigits:dec,useGrouping:grouped});
    var before=src.slice(0,m.index),after=src.slice(m.index+tok.length),t0=0;
    el.classList.add('ax-counting');el.style.fontVariantNumeric='tabular-nums';
    function frame(t){
      if(!node.isConnected)return;
      if(!t0)t0=t;var p=Math.min(1,(t-t0)/DUR),e=1-Math.pow(1-p,3);
      node.nodeValue=p<1?before+fmt.format(target*e)+after:src;
      if(p<1)requestAnimationFrame(frame);else el.classList.remove('ax-counting');
    }
    requestAnimationFrame(frame);
  }
  function scan(root){
    if(root.nodeType!==1)return;
    if(root.matches(SEL))run(root);
    root.querySelectorAll(SEL).forEach(run);
  }
  var obs=new MutationObserver(function(list){
    list.forEach(function(m){
      if(m.target.nodeType===1&&m.target.closest&&m.target.closest('.ax-counting'))return;
      var host=m.target.nodeType===1&&m.target.closest&&m.target.closest(SEL);
      if(host)run(host);else m.addedNodes.forEach(scan);
    });
  });
  function start(){scan(document.body);obs.observe(document.body,{childList:true,subtree:true});}
  if(document.body)start();else document.addEventListener('DOMContentLoaded',start);
  window.AxCount={run:run};
})();

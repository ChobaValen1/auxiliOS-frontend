// U4 · Al ordenar una tabla (clic en un título con aria-sort), las filas se deslizan a su nuevo lugar.
// Técnica FLIP: se mide dónde estaba cada fila, la tabla se vuelve a dibujar y cada fila viaja desde su lugar viejo.
// Las filas se reconocen por data-*-id o, si no tienen, por el texto de su primera celda. Sin movimiento si está reducido.
(function(){
  if(window.AxSortFlip||!Element.prototype.animate)return;
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)');
  function key(tr){
    for(var i=0;i<tr.attributes.length;i++){var a=tr.attributes[i];if(/^data-.*id$/.test(a.name))return a.name+'='+a.value;}
    var c=tr.cells&&tr.cells[0];return c?'t='+c.textContent.trim():null;
  }
  function snapshot(root){
    var map=new Map();
    root.querySelectorAll('tbody tr').forEach(function(tr){var k=key(tr);if(k&&!map.has(k))map.set(k,tr.getBoundingClientRect().top);});
    return map;
  }
  function play(root,before){
    root.querySelectorAll('tbody tr').forEach(function(tr,i){
      var k=key(tr);if(!k||!before.has(k))return;
      var dy=before.get(k)-tr.getBoundingClientRect().top;if(Math.abs(dy)<1)return;
      tr.animate([{transform:'translateY('+dy+'px)'},{transform:'none'}],{duration:420,delay:Math.min(i,12)*12,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'});
    });
  }
  document.addEventListener('click',function(e){
    if(reduce&&reduce.matches)return;
    var th=e.target.closest&&e.target.closest('th[aria-sort]');if(!th)return;
    var table=th.closest('table');if(!table)return;
    // La tabla suele redibujarse entera: se guarda el contenedor que sobrevive al redibujo.
    var root=table.parentElement&&table.parentElement.parentElement||table.parentElement;
    var before=snapshot(table);
    requestAnimationFrame(function(){if(root.isConnected)play(root,before);});
  },true);
  window.AxSortFlip={snapshot:snapshot,play:play};
})();

(function(global){
  'use strict';
  var loading=null,version=0;
  function load(){
    if(global.AuxEfficiency)return Promise.resolve(global.AuxEfficiency);
    if(loading)return loading;
    loading=new Promise(function(resolve,reject){
      var s=document.createElement('script');
      s.src='/ui/motion/efficiency-v1.js?v='+encodeURIComponent(global.AUXILIOS_BUILD_ID||'v569');
      s.onload=function(){if(global.AuxEfficiency)resolve(global.AuxEfficiency);else reject(new Error('Gráfico no disponible'));};
      s.onerror=function(){s.remove();loading=null;reject(new Error('Gráfico no disponible'));};
      document.head.appendChild(s);
    });return loading;
  }
  global.AuxEfficiencyLoader={render:function(node,data,error){
    var current=++version;
    if(!node)return;
    // Keep the last graph while loading; explicitly mark it as stale.
    node.setAttribute('aria-busy',data||error?'false':'true');
    node.dataset.loading=data||error?'false':'true';
    if (!data && !error && global.AuxEfficiency && node.querySelector('.ax-eff')) return Promise.resolve();
    if(!node.hasChildNodes())node.textContent='Cargando eficiencia operativa…';
    return load().then(function(api){if(current===version&&node.isConnected)api.render(node,data,error);}).catch(function(){
      if(current!==version)return;
      node.textContent=error||'No se pudo cargar el gráfico. Volvé a abrir Resumen para reintentar.';
    });
  }};
})(window);

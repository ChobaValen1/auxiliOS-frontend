(function(global){
 'use strict';
 var pending=null,version=0;
 function load(){
   if(global.AuxTrends)return Promise.resolve(global.AuxTrends);
   if(pending)return pending;
   pending=new Promise(function(resolve,reject){
     var script=document.createElement('script');
     script.src='/ui/motion/trends-v1.js?v='+encodeURIComponent(global.AUXILIOS_BUILD_ID||'v571');
     script.onload=function(){if(global.AuxTrends)resolve(global.AuxTrends);else{pending=null;reject(new Error('Gráficos no disponibles'));}};
     script.onerror=function(){script.remove();pending=null;reject(new Error('Gráficos no disponibles'));};
     document.head.appendChild(script);
   });return pending;
 }
 global.AuxTrendsLoader={render:function(node,data,error){
   var request=++version;if(!node)return;
   node.setAttribute('aria-busy',data||error?'false':'true');
   // New filters must not retain numbers from the previous period.
   if(!data&&!error&&global.AuxTrends)global.AuxTrends.unmount(node);
   if(!node.hasChildNodes())node.textContent='Cargando gráficos del período…';
   return load().then(function(api){if(request===version&&node.isConnected)api.render(node,data,error)}).catch(function(){
     if(request===version)node.textContent='No se pudieron cargar los gráficos. Actualizá Tendencia para reintentar.';
   });
 }};
})(window);

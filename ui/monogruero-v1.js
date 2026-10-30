// Edición monogruero: una sola persona es dueño y chofer.
// · Selector «Modo oficina / Modo chofer» en el menú del perfil (recarga la app en el otro modo).
// · Oculta lo que no aplica: sueldos, jornadas de administración y grilla (lo demás lo filtra Configuración).
// · Un servicio nuevo queda asignado a él y a su único camión.
(function(){
  if(window.AUXILIOS_EDITION!=='monogruero'||window.AxMonogruero)return;
  var root=document.documentElement;
  function modo(){try{return localStorage.getItem('auxilios_modo')==='chofer'?'chofer':'oficina';}catch(e){return 'oficina';}}
  function cambiar(next){try{localStorage.setItem('auxilios_modo',next);}catch(e){}location.reload();}
  root.classList.add('ax-mono','ax-mono-'+modo());

  function selector(perfil){
    if(!perfil||!perfil.mono_owner||document.getElementById('ax-mono-switch'))return;
    var pop=document.getElementById('nav-avatar-popup');if(!pop)return;
    var actual=modo();
    var box=document.createElement('div');box.id='ax-mono-switch';box.className='ax-mono-switch';box.setAttribute('role','group');box.setAttribute('aria-label','Modo de trabajo');
    box.innerHTML=['oficina','chofer'].map(function(m){
      return '<button type="button" data-mono-mode="'+m+'" aria-pressed="'+(m===actual)+'">'+(m==='oficina'?'Modo oficina':'Modo chofer')+'</button>';
    }).join('')+'<small>'+(actual==='chofer'?'Hacés el servicio y firmás el remito.':'Cargás servicios, ves tarifas y facturás.')+'</small>';
    box.addEventListener('click',function(e){var b=e.target.closest('[data-mono-mode]');if(b&&b.dataset.monoMode!==actual)cambiar(b.dataset.monoMode);});
    var hr=pop.querySelector('hr');pop.insertBefore(box,hr||pop.lastElementChild);
  }

  var propio={driver:null,truck:null};
  async function cargarPropio(perfil){
    if(!perfil||typeof _db==='undefined')return;
    propio.driver=perfil.user_id;
    var r=await _db.from('trucks').select('truck_id').eq('assigned_to',perfil.user_id).limit(1);
    propio.truck=r.data&&r.data[0]?r.data[0].truck_id:null;
  }
  window.addEventListener('auxilios:service-workspace-opened',function(e){
    if(modo()!=='oficina'||!e.detail||e.detail.mode!=='create'||typeof window.asignarRecursoServicio!=='function')return;
    if(propio.driver)window.asignarRecursoServicio('driver',propio.driver);
    if(propio.truck)window.asignarRecursoServicio('truck',propio.truck);
  });

  document.addEventListener('auxilios:perfil',function(e){selector(e.detail);cargarPropio(e.detail);});
  if(typeof PERFIL_USUARIO!=='undefined'&&PERFIL_USUARIO){selector(PERFIL_USUARIO);cargarPropio(PERFIL_USUARIO);}
  window.AxMonogruero={modo:modo,cambiar:cambiar};
})();

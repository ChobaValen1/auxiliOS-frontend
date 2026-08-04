/* AuxiliOS · Datos auxiliares de mesa mediante RPC protegida */
(()=>{'use strict';
if(window.AuxiliosOperatorReferenceLoader)return;
const STATE={loading:false,ready:false};
const db=()=>typeof _db!=='undefined'?_db:null;
const profile=()=>typeof PERFIL_USUARIO!=='undefined'?PERFIL_USUARIO:null;
const role=()=>String(profile()?.roles?.name||profile()?.role||profile()?.role_name||'').toLowerCase();
const allowed=()=>['administracion','operador','supervision'].includes(role());
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function fillCompanyFilter(services){
 const select=document.getElementById('os-company');
 if(!select)return;
 select.innerHTML='<option value="all">Todas las empresas</option>'+(services.S.companies||[]).map(company=>`<option value="${company.company_id}">${esc(company.trade_name||company.legal_name)}</option>`).join('');
}

async function load({refreshServices=true}={}){
 const client=db(),services=window.OperatorServices;
 if(!client||!services?.S||!allowed()||STATE.loading)return false;
 STATE.loading=true;
 try{
  const {data,error}=await client.rpc('get_operator_service_reference_data');
  if(error)throw error;
  services.S.companies=Array.isArray(data?.companies)?data.companies:[];
  services.S.branches=Array.isArray(data?.branches)?data.branches:[];
  services.S.drivers=Array.isArray(data?.drivers)?data.drivers:[];
  services.S.trucks=Array.isArray(data?.trucks)?data.trucks:[];
  services.S.concepts=Array.isArray(data?.concepts)?data.concepts:[];
  fillCompanyFilter(services);
  STATE.ready=true;
  if(refreshServices)await services.loadServices?.();
  return true;
 }catch(error){
  console.warn('[Operator references]',error.message||error);
  return false;
 }finally{STATE.loading=false;}
}

function init(){
 let attempts=0;
 const timer=setInterval(async()=>{
  if(db()&&window.OperatorServices?.S&&allowed()){
   clearInterval(timer);
   await load({refreshServices:true});
  }else if(++attempts>120)clearInterval(timer);
 },50);
}

window.AuxiliosOperatorReferenceLoader={state:STATE,load};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();

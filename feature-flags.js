/* AuxiliOS · Feature flags individuales */
(()=>{'use strict';
const STATE=window.AuxiliosFeatures=window.AuxiliosFeatures||{flags:{},userId:null,ready:false};
let loading=false,loadedUser=null,subscription=null;

const db=()=>typeof _db!=='undefined'?_db:null;

function loadStyle(id,href){
 if(document.getElementById(id))return;
 const link=document.createElement('link');
 link.id=id;link.rel='stylesheet';link.href=href;
 document.head.appendChild(link);
}

function loadScript(id,src){
 return new Promise((resolve,reject)=>{
  const existing=document.getElementById(id);
  if(existing){
   if(existing.dataset.loaded==='1')return resolve();
   existing.addEventListener('load',resolve,{once:true});
   existing.addEventListener('error',reject,{once:true});
   return;
  }
  const script=document.createElement('script');
  script.id=id;script.src=src;script.async=false;
  script.addEventListener('load',()=>{script.dataset.loaded='1';resolve()},{once:true});
  script.addEventListener('error',reject,{once:true});
  document.body.appendChild(script);
 });
}

async function activate(flags){
 if(flags.operator_console_v2){
  loadStyle('auxilios-operator-console-v2-css','/operator-console-v2.css');
  await loadScript('auxilios-operator-console-v2','/operator-console-v2.js');
  loadStyle('auxilios-operator-active-desk-clean-v1-css','/operator-active-desk-clean-v1.css');
  loadStyle('auxilios-operator-active-desk-auxilios-theme-v2-css','/operator-active-desk-auxilios-theme-v2.css');
  await loadScript('auxilios-operator-active-desk-clean-v1','/operator-active-desk-clean-v1.js');
 }

 if(flags.service_editing_tolls_v1){
  await loadScript('auxilios-operator-reference-loader','/operator-reference-loader.js');
  loadStyle('auxilios-operator-service-edit-css','/operator-service-edit.css');
  await loadScript('auxilios-operator-service-edit','/operator-service-edit.js');
  loadStyle('auxilios-toll-management-css','/toll-management.css');
  await loadScript('auxilios-toll-management','/toll-management.js');
 }

 if(flags.service_workspace_v2){
  loadStyle('auxilios-operator-service-workspace-v2-css','/operator-service-workspace-v2.css');
  await loadScript('auxilios-operator-service-workspace-v2','/operator-service-workspace-v2.js');
  loadStyle('auxilios-operator-service-workspace-review-v3-css','/operator-service-workspace-review-v3.css');
  await loadScript('auxilios-operator-service-workspace-review-v3','/operator-service-workspace-review-v3.js');
 }

 // Bloque A: una única identidad y comportamiento de workspace para Servicios.
 // Se carga al final para absorber visualmente las capas legacy sin alterar sus RPC.
 if(flags.operator_console_v2||flags.service_editing_tolls_v1||flags.service_workspace_v2){
  loadStyle('auxilios-operator-services-brand-system-v1-css','/operator-services-brand-system-v1.css');
  await loadScript('auxilios-operator-services-block-a-v1','/operator-services-block-a-v1.js');
 }

 // Flota es un módulo estable por rol, no una beta individual. Los propios
 // módulos limitan su ejecución a Administración y Supervisión.
 await loadScript('auxilios-fleet-admin-detail-v2','/fleet-admin-detail-v2.js');
 loadStyle('auxilios-fleet-fuel-crud-v1-css','/fleet-fuel-crud-v1.css');
 loadStyle('auxilios-fleet-fuel-crud-contrast-fix-css','/fleet-fuel-crud-contrast-fix.css');
 await loadScript('auxilios-fleet-fuel-crud-v1','/fleet-fuel-crud-v1.js');
 loadStyle('auxilios-fleet-fuel-closed-edit-fix-css','/fleet-fuel-closed-edit-fix.css');
 await loadScript('auxilios-fleet-fuel-closed-edit-fix','/fleet-fuel-closed-edit-fix.js');
 await loadScript('auxilios-fleet-fuel-modal-state-fix','/fleet-fuel-modal-state-fix.js');
}

async function refresh(){
 const client=db();
 if(!client||loading)return;
 loading=true;
 try{
  const {data:{session},error:sessionError}=await client.auth.getSession();
  if(sessionError)throw sessionError;
  const userId=session?.user?.id||null;
  if(!userId){
   STATE.flags={};STATE.userId=null;STATE.ready=true;loadedUser=null;
   window.dispatchEvent(new CustomEvent('auxilios:features-ready',{detail:STATE}));
   return;
  }
  if(loadedUser===userId&&STATE.ready)return;
  const {data,error}=await client
   .from('user_feature_flags')
   .select('feature_key,enabled')
   .eq('enabled',true);
  if(error)throw error;
  const flags=Object.fromEntries((data||[]).map(row=>[row.feature_key,Boolean(row.enabled)]));
  STATE.flags=flags;STATE.userId=userId;STATE.ready=true;loadedUser=userId;
  await activate(flags);
  window.dispatchEvent(new CustomEvent('auxilios:features-ready',{detail:STATE}));
 }catch(error){
  console.warn('[Feature flags]',error.message||error);
  STATE.ready=true;
 }finally{loading=false;}
}

function init(){
 let attempts=0;
 const timer=setInterval(()=>{
  if(db()){
   clearInterval(timer);
   refresh();
   const auth=db().auth.onAuthStateChange(()=>{loadedUser=null;setTimeout(refresh,0)});
   subscription=auth?.data?.subscription||null;
  }else if(++attempts>120)clearInterval(timer);
 },250);
 window.addEventListener('beforeunload',()=>subscription?.unsubscribe?.(),{once:true});
}

document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();
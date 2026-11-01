/* AuxiliOS · km como los factura la prestadora.
   En Parámetros de facturación cada prestadora elige «Conservar decimales» o «Kilómetros enteros · redondeo normal».
   Con km enteros, asfalto y ripio se redondean por separado (90,4 → 90; 90,5 → 91) y el total es la suma,
   igual que el motor de precios (app_private.round_billable_km_v1). Servicios, Facturación y el Excel
   muestran los km con esta misma regla. La distancia real queda guardada sin tocar. */
(function(root){'use strict';
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const has=v=>v!=null&&v!==''&&Number.isFinite(Number(v));
let rules=null,loading=null;
const day=v=>{const d=v?new Date(v):new Date();if(Number.isNaN(d.getTime()))return'';return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);};
/* Las reglas llegan ordenadas como las elige el motor (general primero, la más reciente): vale la primera vigente. */
function modeFor(companyId,scheduledFor){
  if(!rules||!companyId)return'decimal';
  const d=day(scheduledFor),id=String(companyId);
  const hit=rules.find(r=>String(r.company_id)===id&&(!d||((!r.valid_from||String(r.valid_from)<=d)&&(!r.valid_until||String(r.valid_until)>=d))));
  return hit?.km_rounding_mode==='nearest_integer'?'nearest_integer':'decimal';
}
/* Math.round redondea 0,5 hacia arriba, como round() de Postgres para km (siempre positivos). */
function apply(mode,asphalt,gravel,total){
  const rounded=mode==='nearest_integer';
  if(has(asphalt)||has(gravel)){
    const a=num(asphalt),g=num(gravel);
    if(a||g){const ra=rounded?Math.round(a):a,rg=rounded?Math.round(g):g;return{asphalt:ra,gravel:rg,total:rounded?ra+rg:Math.round((a+g)*100)/100,rounded};}
  }
  const t=num(total);return{asphalt:num(asphalt),gravel:num(gravel),total:rounded?Math.round(t):t,rounded};
}
/* row: un servicio con company_id, scheduled_for y km de asfalto/ripio/total. */
function forService(row,{asphalt,gravel,total}={}){
  return apply(modeFor(row?.company_id,row?.scheduled_for),asphalt,gravel,total);
}
function load(){
  if(rules)return Promise.resolve(rules);
  if(loading)return loading;
  const db=typeof _db!=='undefined'?_db:null;
  if(!db?.rpc)return Promise.resolve(null);
  loading=Promise.resolve(db.rpc('list_company_km_rounding_v1')).then(({data,error})=>{
    if(error)throw error;
    rules=Array.isArray(data)?data:[];
    root.dispatchEvent?.(new CustomEvent('auxilios:km-rounding-ready'));
    return rules;
  }).catch(err=>{console.warn('Redondeo de km: no se pudo leer la regla de las prestadoras',err?.message||err);return null;}).finally(()=>{loading=null;});
  return loading;
}
/* Después de guardar Parámetros se vuelve a leer la regla. */
function reset(){rules=null;}
const api={load,reset,modeFor,apply,forService,get ready(){return Array.isArray(rules)},_setRules(list){rules=Array.isArray(list)?list:null;}};
root.AuxiliosKmRounding=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

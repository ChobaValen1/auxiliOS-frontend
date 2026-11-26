/* AuxiliOS · qué tan parecido es un remito del chofer a un servicio ya cargado.
   El chofer a veces anota los datos incompletos (4332221 en vez de 4332221-1, «Olivos» en vez de la dirección entera),
   así que cada criterio tiene dos niveles: exacta («exact») y parcial («partial»). Las dos cuentan para recomendar:
   con 2 o más criterios que coinciden se recomienda asociar; con 0 o 1 se sugiere crear el servicio nuevo. */
(function(root){'use strict';
const RECOMMEND_AT=2;
const LABELS={number:'N.º de servicio',plate:'patente',document:'DNI del cliente',route:'recorrido'};
const txt=v=>String(v==null?'':v).trim();
const noAccents=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'');
/* Distancia de edición, cortada en 2: sólo importa si es 0, 1 o más. */
function distance(a,b){
  if(a===b)return 0;
  if(Math.abs(a.length-b.length)>1)return 2;
  let prev=Array.from({length:b.length+1},(_,j)=>j);
  for(let i=1;i<=a.length;i++){
    const cur=[i];
    for(let j=1;j<=b.length;j++)cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    prev=cur;
  }
  return prev[b.length];
}
/* N.º de servicio: sin espacios, en mayúsculas, sólo letras, números y guiones. */
const code=v=>noAccents(txt(v)).toUpperCase().replace(/[^A-Z0-9-]/g,'').replace(/-+/g,'-').replace(/^-|-$/g,'');
function matchNumber(a,b){
  a=code(a);b=code(b);
  if(!a||!b)return null;
  if(a===b)return'exact';
  const [short,long]=a.length<=b.length?[a,b]:[b,a];
  /* 4332221 ≈ 4332221-1: lo escrito es el comienzo y el resto empieza en un guion (no corta un número a la mitad). */
  if(short.length>=5&&long.startsWith(short)&&long[short.length]==='-')return'partial';
  return null;
}
const plate=v=>noAccents(txt(v)).toUpperCase().replace(/[^A-Z0-9]/g,'');
function matchPlate(a,b){
  a=plate(a);b=plate(b);
  if(!a||!b)return null;
  if(a===b)return'exact';
  if(a.length>=6&&b.length>=6&&distance(a,b)<=1)return'partial';
  return null;
}
const digits=v=>txt(v).replace(/\D/g,'');
function matchDocument(a,b){
  a=digits(a);b=digits(b);
  if(a.length<7||b.length<7)return null;
  if(a===b)return'exact';
  if(distance(a,b)<=1)return'partial';
  /* Un CUIT (11 dígitos) lleva el DNI en el medio. */
  const [short,long]=a.length<=b.length?[a,b]:[b,a];
  if(long.length===11&&short.length<=8&&long.slice(2,-1).endsWith(short))return'partial';
  return null;
}
/* Lugares: sin tildes, sin «Provincia de…», sin código postal argentino (B1636DQK). */
function place(v){
  return noAccents(txt(v)).toLowerCase()
    .replace(/,?\s*provincia de [^,]+/g,'').replace(/,?\s*(argentina|caba|ciudad autonoma de buenos aires)\s*$/g,'')
    .replace(/\b[a-z]\d{4}[a-z]{3}\b/g,'')
    .replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}
const words=s=>s.split(' ').filter(w=>w.length>1);
function matchPlace(a,b){
  a=place(a);b=place(b);
  if(!a||!b)return null;
  if(a===b)return'exact';
  const [short,long]=a.length<=b.length?[a,b]:[b,a];
  if(short.length<4)return null;
  /* «Olivos» ≈ «Coronel Francisco Uzal 3661 Olivos»: todas las palabras de lo corto están en lo largo. */
  const longWords=words(long);
  const sw=words(short);
  if(sw.length&&sw.every(w=>longWords.includes(w)))return'partial';
  return null;
}
function matchRoute(aOrigin,aDestination,bOrigin,bDestination){
  const o=matchPlace(aOrigin,bOrigin),d=matchPlace(aDestination,bDestination);
  if(!o||!d)return null;
  return o==='exact'&&d==='exact'?'exact':'partial';
}
const first=(...values)=>values.map(txt).find(Boolean)||'';
const placeOf=(row,kind)=>first(row?.[`${kind}_formatted_address`],row?.[kind]);
const better=(a,b)=>a==='exact'||b==='exact'?'exact':(a||b||null);
/* intake: el remito del chofer. service: un servicio de la lista. Devuelve cuántos criterios coinciden y cuáles. */
function score(intake,service){
  const intakeNumber=first(intake?.service_code,intake?.service_reference);
  const matches=[];
  const add=(key,level)=>{if(level)matches.push({key,level,label:LABELS[key]});};
  add('number',better(matchNumber(intakeNumber,service?.service_order_number),matchNumber(intakeNumber,service?.service_number)));
  add('plate',matchPlate(intake?.vehicle_plate,service?.vehicle_plate));
  add('document',matchDocument(intake?.customer_document,service?.customer_document));
  add('route',matchRoute(placeOf(intake,'origin'),placeOf(intake,'destination'),placeOf(service,'origin'),placeOf(service,'destination')));
  return{score:matches.length,matches,recommended:matches.length>=RECOMMEND_AT};
}
/* «N.º de servicio y patente» */
function describe(matches){
  const names=matches.map(m=>m.label);
  return names.length<2?names.join(''):names.slice(0,-1).join(', ')+' y '+names[names.length-1];
}
/* Ordena los candidatos: primero los que más coinciden. Los empates conservan el orden recibido. */
function rank(intake,services){
  return services.map((service,index)=>({service,index,...score(intake,service)}))
    .sort((a,b)=>b.score-a.score||a.index-b.index);
}
const api={RECOMMEND_AT,LABELS,matchNumber,matchPlate,matchDocument,matchPlace,matchRoute,score,describe,rank};
root.AuxiliosIntakeMatch=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

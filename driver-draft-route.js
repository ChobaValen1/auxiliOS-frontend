/* Read-only route estimates, only for already-created driver drafts. */
(()=>{'use strict';
const cache=new Map();
const point=(r,prefix)=>{const lat=r[`${prefix}_lat`],lng=r[`${prefix}_lng`];return lat!==null&&lat!==undefined&&lng!==null&&lng!==undefined&&lat!==''&&lng!==''&&Number.isFinite(Number(lat))&&Number.isFinite(Number(lng))?{latitude:Number(lat),longitude:Number(lng)}:null;};
const key=r=>JSON.stringify([String(r.id),r.origin_lat,r.origin_lng,r.destination_lat,r.destination_lng]);
function get(r){return cache.get(key(r))||{state:navigator.onLine===false?'offline':'pending'};}
async function ensure(r){
 if(!r?.id||navigator.onLine===false)return;
 const k=key(r),previous=cache.get(k);if(previous&&(previous.state==='loading'||Date.now()<previous.expires))return;
 const origin=point(r,'origin'),destination=point(r,'destination'),client=typeof _db!=='undefined'?_db:window._db;
 if(!origin||!destination||!client?.functions?.invoke){cache.set(k,{state:'unavailable',expires:Date.now()+60000});return;}
 if(cache.size>=128)for(const [old,value]of cache){if(value.state!=='loading'){cache.delete(old);break;}}
 cache.set(k,{state:'loading'});let timer;
 try{
  const result=await Promise.race([client.functions.invoke('maps-proxy',{body:{action:'route',routeMode:'origin_destination',origin,destination,departureTime:new Date().toISOString()}}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Route timeout')),20000);})]);
  if(result.error)throw result.error;
  const meters=Number(result.data?.distanceMeters),seconds=Number(result.data?.durationSeconds);
  if(!Number.isFinite(meters)||meters<=0)throw new Error('Missing route distance');
  cache.set(k,{state:'ready',meters,seconds:Number.isFinite(seconds)&&seconds>0?seconds:null,expires:Date.now()+600000});
 }catch{cache.set(k,{state:'unavailable',expires:Date.now()+60000});}
 finally{clearTimeout(timer);window.dispatchEvent(new CustomEvent('auxilios:draft-route',{detail:{id:String(r.id),key:k}}));}
}
window.AuxiliosDraftRoute={get,ensure,key};
})();

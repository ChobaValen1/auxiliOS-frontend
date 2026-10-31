// AuxiliOS Solo · modo sin señal.
// Toda consulta a la base pasa por acá (fetch propio de supabase-js):
//  · con señal: va a la base y la respuesta se guarda en una copia local (IndexedDB), tabla por tabla;
//  · sin señal: las lecturas salen de esa copia y lo que se carga (altas, cambios, borrados, fotos y firma)
//    se aplica en la copia y queda en una cola que se sube sola, en orden, cuando vuelve la señal.
(function(){
'use strict';
const TABLES=['solo_profiles','solo_trucks','solo_clients','solo_service_types','solo_rates','solo_services','solo_expenses'];
const DEFAULTS={solo_services:{status:'open',photos:[],extras:[],tolls:[],other_amount:0,base_amount:0,km_amount:0,extras_amount:0,total:0,remito_number:null,paid_at:null,invoiced_at:null},
  solo_clients:{active:true,kind:'prestadora',payment_days:30},solo_service_types:{active:true},solo_expenses:{ends_on:null,notes:null,receipt_path:null}};
let base='',db=null,owner=null,syncing=false;
const realFetch=window.fetch.bind(window);

/* ── IndexedDB mínima: copia de tablas, cola de cambios y archivos ── */
let idb=null;
function open(){if(idb)return idb;idb=new Promise((res,rej)=>{const r=indexedDB.open('auxilios-solo-offline',1);
  r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('rows');d.createObjectStore('outbox',{autoIncrement:true});d.createObjectStore('kv');};
  r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});return idb;}
async function tx(store,mode,fn){const d=await open();return new Promise((res,rej)=>{const t=d.transaction(store,mode),s=t.objectStore(store);let out;
  Promise.resolve(fn(s)).then(v=>{out=v;});t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error);});}
const req=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
const putRows=(table,rows)=>tx('rows','readwrite',s=>{rows.forEach(r=>{if(r&&r.id!=null)s.put(r,table+'|'+r.id);});});
const delRow=(table,id)=>tx('rows','readwrite',s=>{s.delete(table+'|'+id);});
const getRows=table=>tx('rows','readonly',s=>req(s.getAll(IDBKeyRange.bound(table+'|',table+'|￿'))));
const outboxAll=()=>tx('outbox','readonly',async s=>{const keys=await req(s.getAllKeys()),vals=await req(s.getAll());return keys.map((k,i)=>({k,...vals[i]}));});
const outboxAdd=item=>tx('outbox','readwrite',s=>{s.add(item);});
const outboxDel=k=>tx('outbox','readwrite',s=>{s.delete(k);});
const kvGet=k=>tx('kv','readonly',s=>req(s.get(k)));
const kvSet=(k,v)=>tx('kv','readwrite',s=>{s.put(v,k);});
async function clearAll(){for(const st of ['rows','outbox','kv'])await tx(st,'readwrite',s=>{s.clear();});}

/* ── Filtros de PostgREST sobre la copia local (los que usa la app) ── */
const isDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}/.test(v);
function cmp(a,b){if(a==null||b==null)return a==null&&b==null?0:a==null?-1:1;
  if(isDate(a)&&isDate(b))return new Date(a)-new Date(b);
  const na=Number(a),nb=Number(b);if(a!==''&&b!==''&&!isNaN(na)&&!isNaN(nb))return na-nb;return String(a)<String(b)?-1:String(a)>String(b)?1:0;}
function parse(url){const u=new URL(url),q=u.searchParams,f=[];let order=null,limit=null;
  q.forEach((v,k)=>{if(k==='select'||k==='columns')return;if(k==='order'){order=v.split(',').map(o=>{const [c,dir]=o.split('.');return [c,dir==='desc'];});return;}
    if(k==='limit'){limit=Number(v);return;}if(k==='offset')return;const i=v.indexOf('.');f.push([k,v.slice(0,i),v.slice(i+1)]);});
  return {table:u.pathname.split('/').pop(),f,order,limit};}
function match(row,f){return f.every(([k,op,val])=>{const v=row[k];
  if(op==='is')return val==='null'?v==null:String(v)===val;
  if(op==='in'){const list=val.replace(/^\(|\)$/g,'').split(',').map(x=>x.replace(/^"|"$/g,''));return list.includes(String(v));}
  const want=val==='true'?true:val==='false'?false:val;
  if(op==='eq')return typeof want==='boolean'?v===want:cmp(v,want)===0;
  if(op==='neq')return typeof want==='boolean'?v!==want:cmp(v,want)!==0;
  if(op==='gt')return cmp(v,want)>0;if(op==='gte')return cmp(v,want)>=0;if(op==='lt')return cmp(v,want)<0;if(op==='lte')return cmp(v,want)<=0;
  return true;});}
async function query(url){const {table,f,order,limit}=parse(url);let rows=(await getRows(table)).filter(r=>match(r,f));
  if(order)rows.sort((a,b)=>{for(const [c,desc] of order){const d=cmp(a[c],b[c]);if(d)return desc?-d:d;}return 0;});
  if(limit)rows=rows.slice(0,limit);return {table,rows};}

/* ── Inicio sin señal: el mismo cálculo que solo_month_summary_v1, con la copia local ── */
async function monthSummary(pMonth){const d=new Date((pMonth||new Date().toISOString().slice(0,10))+'T12:00:00'),a=new Date(d.getFullYear(),d.getMonth(),1),z=new Date(d.getFullYear(),d.getMonth()+1,1);
  const iso=x=>x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');
  const svc=(await getRows('solo_services')).filter(s=>s.status!=='cancelled'&&new Date(s.service_date)>=a&&new Date(s.service_date)<z);
  const ex=await getRows('solo_expenses');
  const v=ex.filter(x=>x.kind==='variable'&&x.spent_on>=iso(a)&&x.spent_on<iso(z)).reduce((t,x)=>t+Number(x.amount),0);
  const f=ex.filter(x=>{if(x.kind!=='fixed'||!(x.spent_on<iso(z))||(x.ends_on&&x.ends_on<iso(a)))return false;const s=new Date(a);s.setMonth(s.getMonth()-Number(x.period_months));return x.spent_on>iso(s);})
    .reduce((t,x)=>t+Math.round(Number(x.amount)/Number(x.period_months)*100)/100,0);
  const sum=k=>svc.filter(k).reduce((t,s)=>t+Number(s.total||0),0),billed=sum(()=>true);
  return {month:iso(a),services:svc.length,billed,collected:sum(s=>s.paid_at),pending:sum(s=>!s.paid_at),variable_expenses:v,fixed_expenses:f,spent:v+f,left:billed-v-f,offline:true};}

/* ── El fetch propio ── */
const json=(body,status=200,extra={})=>new Response(body==null?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...extra}});
const hdr=(init,k)=>{const h=init&&init.headers;if(!h)return '';if(typeof h.get==='function')return h.get(k)||'';const key=Object.keys(h).find(x=>x.toLowerCase()===k.toLowerCase());return key?h[key]:'';};
const isNet=e=>e&&(e.name==='TypeError'||e.name==='AbortError'||/fetch|network|load failed/i.test(String(e.message)));
const objectWanted=init=>/vnd\.pgrst\.object/.test(hdr(init,'Accept'));
function answerRows(rows,init){if(!objectWanted(init))return json(rows);
  if(rows.length===1)return json(rows[0]);
  return json({code:'PGRST116',details:'The result contains '+rows.length+' rows',hint:null,message:'JSON object requested, multiple (or no) rows returned'},406);}
async function record(url,init,res){// Con señal: lo que vuelve de la base actualiza la copia local.
  try{const {table}=parse(url);if(!TABLES.includes(table))return;const m=(init&&init.method||'GET').toUpperCase();
    if(m==='DELETE'){const {f}=parse(url);(await query(url)).rows.forEach(r=>delRow(table,r.id));return;}
    const body=await res.clone().json().catch(()=>null);
    if(body){await putRows(table,Array.isArray(body)?body:[body]);return;}
    // Cambios guardados sin devolver la fila: se aplican igual en la copia.
    if(m==='PATCH'){const patch=JSON.parse(init.body||'{}');const {rows}=await query(url);await putRows(table,rows.map(r=>({...r,...patch})));}
    if(m==='POST'){const all=[].concat(JSON.parse(init.body||'[]')),rows=all.filter(r=>r.id);if(rows.length)await putRows(table,rows.map(r=>({...(DEFAULTS[table]||{}),owner_id:owner,...r})));
      if(rows.length<all.length)refresh(table);}// alta o upsert sin id (p. ej. tarifas): se vuelve a copiar la tabla
  }catch(e){}}
const pendingRefresh={};
function refresh(table){clearTimeout(pendingRefresh[table]);pendingRefresh[table]=setTimeout(()=>{if(db&&navigator.onLine)db.from(table).select('*');},250);}
async function localWrite(url,init){// Sin señal: se aplica en la copia y se encola.
  const m=(init.method||'GET').toUpperCase(),{table,f}=parse(url);let out=[];
  if(m==='POST'){let rows=JSON.parse(init.body||'[]');const arr=Array.isArray(rows)?rows:[rows];
    arr.forEach(r=>{if(!r.id)r.id=crypto.randomUUID();});
    const now=new Date().toISOString();out=arr.map(r=>({...(DEFAULTS[table]||{}),owner_id:owner,created_at:now,updated_at:now,...r}));
    if(table==='solo_services')out.forEach(r=>{if(!r.service_date)r.service_date=now;});
    await putRows(table,out);await outboxAdd({url,method:m,body:JSON.stringify(Array.isArray(rows)?arr:arr[0]),prefer:hdr(init,'Prefer'),at:now});}
  else if(m==='PATCH'){const patch=JSON.parse(init.body||'{}');const {rows}=await query(url);out=rows.map(r=>({...r,...patch,updated_at:new Date().toISOString()}));
    await putRows(table,out);await outboxAdd({url,method:m,body:init.body,prefer:'return=minimal',at:new Date().toISOString()});}
  else if(m==='DELETE'){const {rows}=await query(url);for(const r of rows)await delRow(table,r.id);await outboxAdd({url,method:m,at:new Date().toISOString()});}
  paint();
  if(/return=representation/.test(hdr(init,'Prefer')))return answerRows(out,init);
  return new Response(null,{status:m==='POST'?201:204});}
async function offlineFetch(input,init={}){
  const url=typeof input==='string'?input:input.url,m=(init.method||'GET').toUpperCase();
  if(!base||!url.startsWith(base)||url.includes('/auth/v1/'))return realFetch(input,init);
  const rest=url.includes('/rest/v1/'),rpc=url.includes('/rest/v1/rpc/'),storage=url.includes('/storage/v1/');
  try{
    if(!navigator.onLine)throw new TypeError('offline');
    const res=await realFetch(input,init);
    if(res.ok&&rest&&!rpc)record(url,init,res);
    if(res.ok&&rpc)kvSet('rpc|'+url+'|'+(init.body||''),await res.clone().text()).catch(()=>{});
    return res;
  }catch(e){
    if(!isNet(e))throw e;
    if(rpc){if(url.includes('solo_month_summary_v1')){const p=JSON.parse(init.body||'{}');return json(await monthSummary(p.p_month));}
      const hit=await kvGet('rpc|'+url+'|'+(init.body||''));return hit?new Response(hit,{status:200,headers:{'Content-Type':'application/json'}}):json({message:'Sin señal'},503);}
    if(rest){if(m==='GET'||m==='HEAD'){const {rows}=await query(url);return answerRows(rows,init);}return localWrite(url,init);}
    if(storage&&m==='POST'&&/\/storage\/v1\/object\/(?!sign|list)/.test(url)){// Foto o firma: se guarda el archivo y se sube después.
      // supabase-js manda el archivo suelto o dentro de un FormData; se guarda el archivo y se arma igual al subir.
      let blob=init.body,form=false;if(typeof FormData!=='undefined'&&blob instanceof FormData){form=true;for(const [,v] of blob.entries())if(v instanceof Blob)blob=v;}
      if(!(blob instanceof Blob))blob=new Blob([blob]);
      await outboxAdd({url,method:'POST',blob,form,contentType:form?'':(hdr(init,'Content-Type')||blob.type),upsert:hdr(init,'x-upsert'),at:new Date().toISOString()});paint();
      return json({Key:url.split('/storage/v1/object/')[1]});}
    throw e;}
}

/* ── Subida de la cola cuando vuelve la señal ── */
async function sync(){if(syncing||!navigator.onLine||!db)return;syncing=true;paint();let done=0,failed=0;
  try{const {data}=await db.auth.getSession();const token=data?.session?.access_token;if(!token)return;
    for(const it of await outboxAll()){
      const headers={apikey:window.AUXILIOS_RUNTIME?.supabaseKey||'',Authorization:'Bearer '+token};
      let body=it.body;
      if(it.blob){if(it.upsert)headers['x-upsert']=it.upsert;
        if(it.form){body=new FormData();body.append('cacheControl','3600');body.append('',it.blob);}else{headers['Content-Type']=it.contentType||'application/octet-stream';body=it.blob;}}
      else{headers['Content-Type']='application/json';if(it.prefer)headers.Prefer=it.prefer;}
      let res;try{res=await realFetch(it.url,{method:it.method,headers,body});}catch(e){break;}// sin señal otra vez: se sigue después
      if(res.ok||res.status===409&&it.method==='POST'){await outboxDel(it.k);done++;}
      else{failed++;await kvSet('failed|'+it.k,{...it,status:res.status,error:await res.text().catch(()=>'')});await outboxDel(it.k);}
    }
  }finally{syncing=false;paint();}
  if(done||failed){window.SoloCore?.toast(failed?`Se subieron ${done} cambios; ${failed} no se pudieron guardar.`:`Listo: se subieron ${done} cambio${done===1?'':'s'} que cargaste sin señal.`);
    prime(true).then(()=>window.dispatchEvent(new Event('solo-synced')));}
}
// Copia inicial (con señal): todo lo necesario para trabajar sin señal.
async function prime(force){if(!db||!navigator.onLine)return;const last=await kvGet('primed').catch(()=>0);if(!force&&last&&Date.now()-last<5*60*1000)return;
  const since=new Date(Date.now()-400*864e5).toISOString();
  await Promise.all(TABLES.map(t=>t==='solo_services'?db.from(t).select('*').gte('service_date',since):db.from(t).select('*')));
  await kvSet('primed',Date.now());}

/* ── Aviso arriba: sin señal / cambios por subir ── */
async function paint(){let n=0;try{n=(await outboxAll()).length;}catch(e){}
  let b=document.getElementById('offline');if(!b){b=document.createElement('div');b.id='offline';b.className='offline';b.setAttribute('role','status');document.body.appendChild(b);}
  if(!navigator.onLine){b.hidden=false;b.className='offline';b.textContent='Sin señal · lo que cargues queda guardado en el teléfono'+(n?` (${n} por subir)`:'');}
  else if(n){b.hidden=false;b.className='offline sync';b.textContent=syncing?`Subiendo ${n} cambio${n===1?'':'s'}…`:`${n} cambio${n===1?'':'s'} por subir`;}
  else b.hidden=true;}

window.SoloOffline={
  fetch:offlineFetch,
  attach(client,url){db=client;base=url.replace(/\/$/,'');},
  async setUser(id){const prev=await kvGet('owner').catch(()=>null);if(prev&&id&&prev!==id)await clearAll();owner=id;if(id)await kvSet('owner',id);paint();if(id){await prime();sync();}},
  async pending(){return (await outboxAll()).length;},
  async clear(){await clearAll();paint();},
  sync,prime,monthSummary,_parse:parse,_match:match,_rows:getRows
};
addEventListener('online',()=>{paint();sync();});addEventListener('offline',paint);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync();});
})();

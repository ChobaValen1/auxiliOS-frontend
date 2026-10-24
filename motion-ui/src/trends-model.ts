export type Metric = "facturado" | "servicios";
export type Company = {id:string; nombre:string; facturado:number[]; servicios:number[]};
export type Trends = {desde:string; hasta:string; actual:{servicios:number[]}; empresas:Company[]};
export const amount = (v:unknown) => typeof v==="number" && Number.isFinite(v) && v>=0 ? v : 0;
export function dates(data:Trends) {
  const first=Date.parse(data.desde+"T00:00:00Z"), last=Date.parse(data.hasta+"T00:00:00Z");
  if(!Number.isFinite(first)||!Number.isFinite(last)||last<first)return [];
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const end=Math.min(last,Date.parse(today+"T00:00:00Z"));
  return Array.from({length:Math.min(3660,Math.max(0,Math.floor((end-first)/86400000)+1))},(_,i)=>new Date(first+i*86400000).toISOString().slice(0,10));
}
export function frames(data:Trends,metric:Metric,days=dates(data)) {
  const totals=new Map<string,number>();
  return days.map((date,index)=>({date,data:data.empresas.map((e,i)=>{
    const id=e.id||"unassigned-"+i;
    const value=(totals.get(id)||0)+amount(e[metric]?.[index]);totals.set(id,value);
    return {id,label:e.nombre,value,color:((i%5)+1) as 1|2|3|4|5};
  })}));
}
export function activity(data:Trends) {
  return dates(data).map((date,i)=>({date,count:amount(data.actual.servicios[i])}));
}

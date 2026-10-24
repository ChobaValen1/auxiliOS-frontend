export type Truck = {truck_id:string|number;numero_interno?:string|number;brand?:string;model?:string;plate?:string;current_km?:number|null};
export type Plan = {name?:string;plan_estado?:string;urgencia?:number;manda?:string;km_restantes?:number|null;horas_restantes?:number|null;interval_km?:number;interval_hours?:number};
export type Fuel = {fuel_date?:string;liters?:number;created_at?:string};
export type Report = {incident_id:string|number;type?:string;severity?:string;description?:string;location?:string;created_at_device?:string;created_at?:string;received_at?:string};
export type TruckModel = {identity:string;truck:Truck;logDate?:string;control?:{check_date?:string;tire_condition?:string;brake_condition?:string}|null;fuel:Fuel[];plans:Plan[];loadReports:()=>Promise<Report[]>};
export const finite = (n:unknown):number|null => n!==null&&n!==undefined&&n!==""&&Number.isFinite(Number(n))&&Number(n)>=0?Number(n):null;
export const number = (n:unknown) => finite(n)==null?"—":Number(n).toLocaleString("es-AR",{maximumFractionDigits:1});
export function maintenance(plans:Plan[]){
 const plan=[...plans].filter(p=>p.plan_estado&&p.plan_estado!=="_error").sort((a,b)=>(a.urgencia??Infinity)-(b.urgencia??Infinity))[0];
 if(!plan)return {title:plans.some(p=>p.plan_estado==="_error")?"No se pudo consultar el plan":"Sin planes asignados",detail:"Consultá el historial de mantenimiento",tone:"neutral",progress:null};
 const state=plan.plan_estado,remaining=plan.manda==="horas"?plan.horas_restantes:plan.km_restantes,unit=plan.manda==="horas"?"h":"km";
 const interval=finite(plan.manda==="horas"?plan.interval_hours:plan.interval_km);
 const value=remaining!=null&&Number.isFinite(Number(remaining))?Number(remaining):null;
 const labels:Record<string,string>={sin_registro:"Sin ejecución registrada",sin_odometro:"Falta odómetro",sin_horas:"Faltan horas de motor"};
 const detail=labels[state||""]||(value==null?"Sin cálculo disponible":value<0?"Vencido hace "+number(-value)+" "+unit:value===0?"Corresponde ahora":"En "+number(value)+" "+unit);
 const progress=interval&&value!=null?Math.max(0,Math.min(100,(interval-value)/interval*100)):null;
 return {title:plan.name||"Mantenimiento",detail,tone:state==="vencido"?"danger":state==="proximo"?"warning":"neutral",progress};
}
export function controlSummary(control:TruckModel["control"]){
 if(!control)return {label:"Control pendiente",detail:"Registrá el control de la jornada",tone:"warning"};
 const labels:Record<string,string>={bueno:"Bueno",regular:"Regular",malo:"Malo"};
 const bad=[control.tire_condition,control.brake_condition].includes("malo"),warn=[control.tire_condition,control.brake_condition].includes("regular");
 return {label:"Control registrado",detail:"Neumáticos: "+(labels[control.tire_condition||""]||"Sin dato")+" · Frenos: "+(labels[control.brake_condition||""]||"Sin dato"),tone:bad?"danger":warn?"warning":"neutral"};
}
export function latestFuel(fuel:Fuel[]){return [...fuel].sort((a,b)=>String(b.fuel_date||"").localeCompare(String(a.fuel_date||""))||String(b.created_at||"").localeCompare(String(a.created_at||"")))[0]||null}

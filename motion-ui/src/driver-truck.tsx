import * as React from "react";
import {createRoot,type Root} from "react-dom/client";
import {motion,MotionConfig,useReducedMotion,useDragControls} from "motion/react";
import {maintenance,controlSummary,latestFuel,number,type TruckModel,type Report} from "./driver-truck-model";
import "./driver-truck.css";
type App=Window&{AuxiliosTruckUI?:{render:(node:HTMLElement,data:TruckModel)=>void;clear:()=>void};_renderCamionCards?:()=>void;openFuelModal?:()=>void;openNeumaticosModal?:()=>void;openServiceModal?:()=>Promise<void>;abrirModalIncidente?:()=>void;_abrirSubCamion?:(id:string)=>void;cargarScreenCamion?:()=>Promise<void>};
const app=window as App;
function Icon({name}:{name:string}){return <svg className="ax-icon" aria-hidden="true"><use href={"/ui/icons.svg#"+name}/></svg>}
const date=(v?:string)=>{if(!v)return "Sin fecha";const d=new Date(v.length===10?v+"T12:00:00":v);return Number.isFinite(d.getTime())?d.toLocaleDateString("es-AR",{day:"numeric",month:"short"}):"Sin fecha"};
function Card({icon,title,detail,meta,tone="neutral",status,action,onAction,onOpen,progress}:{icon:string;title:string;detail:string;meta?:string;tone?:string;status:string;action:string;onAction:()=>void;onOpen:()=>void;progress?:number|null}){
 const reduce=useReducedMotion();
 return <motion.article className={"dtr-card dtr-"+tone} initial={{opacity:0,y:reduce?0:12}} animate={{opacity:1,y:0}} transition={{duration:reduce?0:.28}} whileTap={reduce?undefined:{scale:.99}}>
   <button type="button" className="dtr-card-open" onClick={onOpen} aria-label={"Ver historial de "+title}>
     <span className="dtr-icon"><Icon name={icon}/></span><span className="dtr-card-copy"><span className="dtr-card-heading"><strong>{title}</strong><span className={"dtr-status dtr-status-"+tone}><Icon name={tone==="success"?"circle-check":tone==="danger"?"circle-alert":tone==="warning"?"triangle-alert":"info"}/>{status}</span></span><span>{detail}</span>{meta&&<small>{meta}</small>}
       {progress!=null&&<span className="dtr-progress" role="progressbar" aria-label="Intervalo de mantenimiento transcurrido" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><motion.i initial={false} animate={{width:progress+"%"}} transition={{duration:reduce?0:.4}}/></span>}
     </span><Icon name="chevron-right"/>
   </button>
   <div className="dtr-card-actions"><button type="button" onClick={onAction}><Icon name="plus"/>{action}</button></div>
 </motion.article>
}
function QuickActions({onClose}:{onClose:()=>void}){
 const ref=React.useRef<HTMLDialogElement>(null),reduce=useReducedMotion();
 React.useEffect(()=>{const dialog=ref.current,opener=document.activeElement as HTMLElement|null;dialog?.showModal();return()=>{dialog?.close();if(opener?.isConnected)opener.focus({preventScroll:true})}},[]);
 function choose(action:()=>void){ref.current?.close();onClose();requestAnimationFrame(action)}
 return <dialog ref={ref} className="dtr-dialog dtr-quick-dialog" aria-labelledby="dtr-quick-title" onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
   <motion.div className="dtr-sheet" initial={{y:reduce?0:30,opacity:0}} animate={{y:0,opacity:1}} transition={{type:"spring",duration:reduce?0:.32,bounce:.08}}>
     <header><h3 id="dtr-quick-title">Acciones rápidas</h3><button type="button" aria-label="Cerrar acciones rápidas" onClick={onClose}><Icon name="x"/></button></header>
     <div className="dtr-quick-options">
       <button type="button" onClick={()=>choose(()=>app.openNeumaticosModal?.())}><span className="dtr-icon"><Icon name="clipboard-check"/></span><strong>Registrar chequeo</strong><Icon name="chevron-right"/></button>
       <button type="button" onClick={()=>choose(()=>app.openFuelModal?.())}><span className="dtr-icon"><Icon name="fuel"/></span><strong>Cargar combustible</strong><Icon name="chevron-right"/></button>
       <button type="button" onClick={()=>choose(()=>{void app.openServiceModal?.()})}><span className="dtr-icon"><Icon name="wrench"/></span><strong>Registrar mantenimiento</strong><Icon name="chevron-right"/></button>
     </div>
   </motion.div>
 </dialog>
}
function Reports({data,onClose}:{data:TruckModel;onClose:()=>void}){
 const ref=React.useRef<HTMLDialogElement>(null),[rows,setRows]=React.useState<Report[]>([]),[state,setState]=React.useState("loading"),[retry,setRetry]=React.useState(0),reduce=useReducedMotion(),drag=useDragControls();
 React.useEffect(()=>{const dialog=ref.current,opener=document.activeElement as HTMLElement|null;dialog?.showModal();return()=>{dialog?.close();if(opener?.isConnected)opener.focus({preventScroll:true})}},[]);
 React.useEffect(()=>{let active=true;setState("loading");data.loadReports().then(items=>{if(active){setRows(items);setState("ready")}}).catch(()=>{if(active)setState("error")});return()=>{active=false}},[data.identity,retry,data.loadReports]);
 return <dialog ref={ref} className="dtr-dialog" aria-labelledby="dtr-report-title" onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
   <motion.div className="dtr-sheet" drag="y" dragListener={false} dragControls={drag} dragConstraints={{top:0,bottom:0}} dragElastic={{top:0,bottom:.35}} onDragEnd={(_event,info)=>{if(info.offset.y>90||(info.offset.y>40&&info.velocity.y>500))onClose()}} initial={{y:reduce?0:50,opacity:0}} animate={{y:0,opacity:1}} transition={{type:"spring",duration:reduce?0:.4,bounce:.08}}>
     <div className="dtr-handle-zone" onPointerDown={e=>drag.start(e)} aria-hidden="true"><div className="dtr-handle"/></div><header><div><small>{data.truck.plate||"Camión activo"}</small><h3 id="dtr-report-title">Novedades de la jornada</h3></div><button type="button" aria-label="Cerrar novedades" onClick={onClose}><Icon name="x"/></button></header>
     <p className="dtr-note">Tus reportes registrados en esta jornada. El sistema todavía no informa revisión ni resolución.</p>
     {state==="loading"?<p role="status" className="dtr-empty">Consultando reportes…</p>:state==="error"?<div role="alert" className="dtr-empty"><p>No se pudieron consultar los reportes.</p><button type="button" onClick={()=>setRetry(n=>n+1)}>Reintentar</button></div>:rows.length?rows.map(r=><article className="dtr-report" key={r.incident_id}><div><span className="dtr-report-state"><Icon name="check"/>Reporte registrado</span><small>{date(r.created_at_device||r.created_at)}</small></div><h4>{{averia:"Avería",accidente:"Accidente",multa:"Multa",robo:"Robo",otro:"Otra novedad"}[r.type||""]||"Novedad"}</h4><p>{r.description||"Sin descripción"}</p>{r.location&&<small>{r.location}</small>}</article>):<p className="dtr-empty">Todavía no registraste novedades en esta jornada.</p>}
     <button type="button" className="dtr-primary" onClick={()=>{ref.current?.close();onClose();app.abrirModalIncidente?.()}}><Icon name="plus"/>Reportar novedad</button>
   </motion.div>
 </dialog>
}
function Truck({data}:{data:TruckModel}){
 const [reports,showReports]=React.useState(false),[quick,showQuick]=React.useState(false),[refreshing,refresh]=React.useState(false),[error,setError]=React.useState(false),[reportsVersion,bumpReports]=React.useState(0);
 const reduce=useReducedMotion(),truck=data.truck,mant=maintenance(data.plans),control=controlSummary(data.control),fuel=latestFuel(data.fuel);
 React.useEffect(()=>{showReports(false);showQuick(false)},[data.identity]);
 React.useEffect(()=>{const update=()=>bumpReports(n=>n+1);window.addEventListener("auxilios:truck-report-saved",update);return()=>window.removeEventListener("auxilios:truck-report-saved",update)},[]);
 const open=(id:string)=>app._abrirSubCamion?.("camion-sub-"+id);
 async function reload(){if(refreshing)return;refresh(true);setError(false);try{await app.cargarScreenCamion?.()}catch{setError(true)}finally{refresh(false)}}
 return <MotionConfig reducedMotion="user"><div className="dtr" data-truck={truck.truck_id}>
   <header className="dtr-heading"><div><h2>Camión</h2></div><div className="dtr-heading-actions"><button type="button" className="dtr-reload" aria-label={refreshing?"Actualizando camión…":"Actualizar camión"} aria-busy={refreshing} disabled={refreshing} onClick={reload}><motion.span animate={{rotate:refreshing&&!reduce?360:0}} transition={refreshing&&!reduce?{repeat:Infinity,duration:.9,ease:"linear"}:{duration:0}}><Icon name="refresh-cw"/></motion.span></button><motion.button type="button" className="dtr-add" aria-label="Acciones rápidas" aria-haspopup="dialog" aria-expanded={quick} onClick={()=>showQuick(true)} whileTap={reduce?undefined:{scale:.96}}><Icon name="plus"/>Registrar</motion.button></div></header>
   {error&&<p role="alert">No se pudo actualizar. Volvé a intentar.</p>}
   <motion.section className="dtr-hero" initial={false} layout={!reduce}>
     <div className="dtr-hero-top"><small>{truck.numero_interno?"MÓVIL "+truck.numero_interno:"TU UNIDAD"}</small><span className="dtr-active">Jornada activa</span></div><span className="dtr-truck-icon"><Icon name="truck"/></span><div className="dtr-identity"><h3>{[truck.brand,truck.model].filter(Boolean).join(" ")||"Camión activo"}</h3><span className="dtr-plate">{truck.plate||"Sin patente"}</span></div>
     <div className="dtr-odometer"><span>Último odómetro registrado</span><strong>{number(truck.current_km)}<small> km</small></strong></div>
   </motion.section>
   <div className="dtr-section-title"><h3>Estado de la unidad</h3><small>Jornada · {date(data.logDate)}</small></div>
   <div className="dtr-cards">
     <Card icon="disc" title="Neumáticos y frenos" detail={control.detail} status={control.status} tone={control.tone} action="Registrar chequeo" onAction={()=>app.openNeumaticosModal?.()} onOpen={()=>open("neumaticos")}/>
     <Card icon="wrench" title="Mantenimiento" detail={mant.title} meta={mant.detail} status={mant.status} tone={mant.tone} progress={mant.progress} action="Registrar mantenimiento" onAction={()=>{void app.openServiceModal?.()}} onOpen={()=>open("mantenimiento")}/>
     <Card icon="fuel" title="Combustible" detail={fuel?number(fuel.liters)+" L · "+date(fuel.fuel_date):"Sin cargas en esta jornada"} status={fuel?"Con registro":"Sin cargas"} action="Cargar combustible" onAction={()=>app.openFuelModal?.()} onOpen={()=>open("combustible")}/>
   </div>
   <button type="button" className="dtr-reports-link" onClick={()=>showReports(true)}><span className="dtr-icon"><Icon name="file-text"/></span><span><strong>Novedades de la jornada</strong><small>Ver tus reportes registrados</small></span><Icon name="chevron-right"/></button>
   <button type="button" className="dtr-report-action" onClick={()=>app.abrirModalIncidente?.()}><Icon name="triangle-alert"/>Reportar novedad</button>
   {quick&&<QuickActions onClose={()=>showQuick(false)}/>}
   {reports&&<Reports key={data.identity+":"+reportsVersion} data={data} onClose={()=>showReports(false)}/>}
 </div></MotionConfig>
}
export function enhanceDriverTruck(){
 let current:{node:HTMLElement;root:Root}|null=null;
 app.AuxiliosTruckUI={
   render(node,data){if(current&&current.node!==node){current.root.unmount();current=null}if(!current)current={node,root:createRoot(node)};document.getElementById("screen-camion")?.classList.add("dtr-driver");current.root.render(<Truck key={data.identity} data={data}/>)},
   clear(){current?.root.unmount();current=null;document.getElementById("screen-camion")?.classList.remove("dtr-driver")}
 };
 if(document.getElementById("screen-camion")?.classList.contains("active"))app._renderCamionCards?.();
}

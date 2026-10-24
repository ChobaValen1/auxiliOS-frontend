import * as React from "react";
import {createRoot, type Root} from "react-dom/client";
import {BarRaceChart} from "./bar-race-chart";
import ContributionSkyline from "./contribution-skyline";
import {activity,frames,type Metric,type Trends} from "./trends-model";
import "./trends.css";
const number=new Intl.NumberFormat("es-AR",{maximumFractionDigits:0});
const money=new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",notation:"compact",maximumFractionDigits:1});
const date=(v:string)=>new Intl.DateTimeFormat("es-AR",{day:"numeric",month:"short",timeZone:"UTC"}).format(new Date(v+"T12:00:00Z"));
const PALETTE=["#594323","#936415","#d79308","#ffb414"];
function Charts({data,error}:{data?:Trends;error?:string}){
 const [metric,setMetric]=React.useState<Metric>("facturado");
 const series=React.useMemo(()=>data?frames(data,metric):[],[data,metric]);
 const days=React.useMemo(()=>data?activity(data):[],[data]);
 const [frame,setFrame]=React.useState(-1),[playing,setPlaying]=React.useState(false),[reduced,setReduced]=React.useState(true);
 const section=React.useRef<HTMLDivElement>(null),[visible,setVisible]=React.useState(false);
 React.useEffect(()=>{const mq=matchMedia("(prefers-reduced-motion: reduce)");const sync=()=>{setReduced(mq.matches);if(mq.matches)setPlaying(false)};sync();mq.addEventListener("change",sync);return()=>mq.removeEventListener("change",sync)},[]);
 React.useEffect(()=>{setFrame(-1);setPlaying(false)},[data,metric]);
 React.useEffect(()=>{const node=section.current;if(!node)return;const io=new IntersectionObserver(es=>{const shown=es.some(e=>e.isIntersecting);setVisible(shown);if(!shown)setPlaying(false)});io.observe(node);const stop=()=>{if(document.hidden)setPlaying(false)};document.addEventListener("visibilitychange",stop);return()=>{io.disconnect();document.removeEventListener("visibilitychange",stop)}},[Boolean(data),error]);
 const index=frame<0?series.length-1:Math.min(frame,series.length-1);
 React.useEffect(()=>{if(!playing||reduced||!visible)return;if(index>=series.length-1){setPlaying(false);return}const timer=setTimeout(()=>setFrame(index+1),700);return()=>clearTimeout(timer)},[playing,index,series.length,reduced,visible]);
 if(error)return <p role="alert" className="ax-trends-error">{error}</p>;
 if(!data)return <p role="status">Cargando gráficos del período…</p>;
 if(!series.length)return <p role="status">Sin días disponibles en este período.</p>;
 if(data.actual.servicios.length<days.length||data.empresas.some(e=>e.facturado.length<days.length||e.servicios.length<days.length))return <p role="alert">La consulta devolvió datos incompletos. Actualizá Tendencia para reintentar.</p>;
 const current=series[index];
 const max=Math.max(1,...series[series.length-1].data.map(e=>e.value));
 const step=(i:number)=>{setPlaying(false);setFrame(i)};
 return <div ref={section} className="ax-trends">
   <section className="ax-ranking">
     <header><div><small>PRESTADORAS</small><h3>Ranking del período</h3><p>Acumulado hasta {date(current.date)} · primeras 6</p></div>
       <div className="ax-chart-seg" role="group" aria-label="Métrica del ranking">{(["facturado","servicios"] as const).map(m=><button key={m} type="button" aria-pressed={m===metric} onClick={()=>setMetric(m)}>{m==="facturado"?"Facturado":"Servicios"}</button>)}</div>
     </header>
     {max===1&&!current.data.some(e=>e.value>0)?<p className="ax-chart-empty">Sin datos para esta métrica.</p>:
       <BarRaceChart data={current.data} topN={Math.min(6,current.data.length)} max={max} duration={600} rowHeight={48} showRankChange={false} formatValue={v=>metric==="facturado"?money.format(v):number.format(v)}/>}
     <div className="ax-race-controls">
       <button type="button" aria-label="Primer día" disabled={index===0} onClick={()=>step(0)}>↤</button>
       <button type="button" aria-label={playing?"Pausar evolución":"Reproducir evolución"} aria-pressed={playing} disabled={reduced||series.length<2} onClick={()=>{if(index===series.length-1)setFrame(0);setPlaying(p=>!p)}}>{playing?"Ⅱ":"▶"}</button>
       <button type="button" aria-label="Último día" disabled={index===series.length-1} onClick={()=>step(series.length-1)}>↦</button>
       <input type="range" aria-label="Día del ranking" aria-valuetext={date(current.date)} min={0} max={series.length-1} value={index} onChange={e=>step(Number(e.target.value))}/>
       <span>{date(current.date)}</span>
     </div>
     <details><summary>Ver ranking completo</summary><div className="ax-chart-table"><table><caption>{metric==="facturado"?"Facturación":"Servicios"} acumulados hasta {date(current.date)}</caption><thead><tr><th>Prestadora</th><th>Valor</th></tr></thead><tbody>{[...current.data].sort((a,b)=>b.value-a.value||a.id.localeCompare(b.id)).map(e=><tr key={e.id}><td>{e.label}</td><td>{metric==="facturado"?new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS"}).format(e.value):number.format(e.value)}</td></tr>)}</tbody></table></div></details>
   </section>
   {days.length>0&&<ContributionSkyline data={days} startDate={days[0].date} endDate={days[days.length-1].date} weekStart={1} unit="servicio" unitPlural="servicios" palette={PALETTE}/>}
 </div>;
}
const roots=new WeakMap<HTMLElement,Root>();
export function render(node:HTMLElement,data?:Trends,error?:string){let root=roots.get(node);if(!root){root=createRoot(node);roots.set(node,root)}root.render(<Charts data={data} error={error}/>)}
export function unmount(node:HTMLElement){roots.get(node)?.unmount();roots.delete(node)}

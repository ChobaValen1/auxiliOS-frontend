import { useEffect, useId, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { motion, useReducedMotion } from 'motion/react';
import { type EfficiencyData, reason, ratio, series, path, scaleTop } from './efficiency-model';
import './efficiency.css';
export { reason, ratio, series, path, scaleTop } from './efficiency-model';

const number = (v: number | null) => v == null ? '—' : new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(v);
const date = (s: string) => new Date(s+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'short'});
const km = (v: number | null) => v == null ? 'Sin datos completos' : number(v)+' km';

function Efficiency({data,error}:{data:EfficiencyData|null;error?:string}) {
  const [cumulative,setCumulative]=useState(true), [active,setActive]=useState<number|null>(null);
  const host=useRef<HTMLDivElement>(null), dialog=useRef<HTMLDialogElement>(null), trigger=useRef<HTMLButtonElement>(null);
  const [width,setWidth]=useState(640); const reduced=useReducedMotion(); const id=useId().replace(/:/g,'');
  useEffect(()=>{const target=host.current;if(!target)return;const observer=new ResizeObserver(([e])=>setWidth(Math.max(220,Math.round(e.contentRect.width))));observer.observe(target);return()=>observer.disconnect();},[]);
  useEffect(()=>setActive(null),[data,cumulative]);
  const rows=series(data?.actual?.filas||[],cumulative), selected=rows[active??rows.length-1];
  const top=scaleTop(rows), left=52,right=16,height=244,bottom=height-32,plotW=Math.max(1,width-left-right);
  const x=(i:number)=>left+(rows.length<2?plotW/2:i*plotW/(rows.length-1));
  const y=(v:number)=>bottom-v/top*(bottom-18);
  const value=data?ratio(data,data.actual):null;
  // Both periods carry their own closure, billing and remito coverage checks.
  const previous=data?ratio(data,data.anterior):null;
  const warning=data?reason(data,data.actual):'';
  const ticks=width<480?3:5;
  const indices=Array.from(new Set(Array.from({length:Math.min(rows.length,ticks)},(_,i)=>Math.round(i*(rows.length-1)/Math.max(1,Math.min(rows.length,ticks)-1)))));
  function select(clientX:number,rect:DOMRect){setActive(Math.max(0,Math.min(rows.length-1,Math.round((clientX-rect.left-left)/plotW*(rows.length-1)))));}
  function close(){dialog.current?.close();trigger.current?.focus();}
  return <div className="ax-eff" ref={host}>
    <header className="ax-eff-head"><div><span className="ax-eff-eyebrow">Flota propia · Resumen</span><h3>Eficiencia operativa</h3><p>Km facturados frente a km recorridos por odómetro</p></div>
      <button ref={trigger} type="button" className="ax-eff-link" disabled={!rows.length} onClick={()=>dialog.current?.showModal()}>Ver desglose <span aria-hidden="true">↗</span></button></header>
    {error ? <p role="alert" className="ax-eff-notice">{error}</p> : !data ? <p role="status" className="ax-eff-notice">Cargando kilometrajes…</p> : <>
      <div className="ax-eff-summary"><div className="ax-eff-primary"><span>Relación facturados / recorridos</span><strong>{value==null?'—':number(value)+'%'}</strong>
        {value!=null&&previous!=null?<small>Anterior {number(previous)}% <b>{value-previous>=0?'+':''}{number(value-previous)} p.p.</b></small>:<small>{value==null?'Comparación no disponible':'Sin comparación anterior verificable'}</small>}</div>
        <div className="ax-eff-total is-billed"><span><i/>Km facturados</span><strong>{km(data.actual?.facturados??null)}</strong><small>Calculados para facturación</small></div>
        <div className="ax-eff-total is-odo"><span><i/>Km recorridos · odómetro</span><strong>{km(data.actual?.odometro??null)}</strong><small>{data.actual?.jornadas||0} jornadas registradas · toda la flota</small></div>
      </div>
      {warning&&<p className="ax-eff-notice" role="status">{warning}</p>}
      <div className="ax-eff-chart-head"><div><strong>Evolución de kilometrajes</strong><small>{date(data.desde)} — {date(data.hasta)}{data.hasta_solicitado>data.hasta?' · hasta hoy':''}</small></div>
        <div className="ax-eff-switch" aria-label="Modo del gráfico">{[false,true].map(c=><button type="button" key={String(c)} aria-pressed={cumulative===c} onClick={()=>setCumulative(c)}>{c?'Acumulado':'Diario'}{cumulative===c&&<motion.span layoutId={id+'mode'} transition={{duration:reduced?0:.22}}/>}</button>)}</div></div>
      {rows.length ? <>
        <svg className="ax-eff-plot" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Evolución de km facturados y recorridos. Usá las flechas para consultar cada día." tabIndex={0}
          onFocus={()=>setActive(rows.length-1)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End','Escape'].includes(e.key)){e.preventDefault();setActive(e.key==='Escape'?null:e.key==='Home'?0:e.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,(active??rows.length-1)+(e.key==='ArrowLeft'?-1:1))));}}}
          onPointerMove={e=>{if(e.pointerType==='mouse')select(e.clientX,e.currentTarget.getBoundingClientRect());}} onPointerDown={e=>select(e.clientX,e.currentTarget.getBoundingClientRect())} onPointerLeave={e=>{if(e.pointerType==='mouse'&&document.activeElement!==e.currentTarget)setActive(null);}}>
          <title>Km facturados y km recorridos, misma escala en kilómetros</title>
          {[0,1,2,3,4].map(i=><g key={i}><line x1={left} x2={width-right} y1={y(top*i/4)} y2={y(top*i/4)} className="ax-eff-grid"/><text x={left-9} y={y(top*i/4)+4} textAnchor="end">{new Intl.NumberFormat('es-AR',{notation:'compact',maximumFractionDigits:1}).format(top*i/4)}</text></g>)}
          <text x={left} y={11}>km</text>
          {indices.map(i=><text key={i} x={x(i)} y={height-9} textAnchor={i===0?'start':i===rows.length-1?'end':'middle'}>{date(rows[i].dia)}</text>)}
          <defs><clipPath id={id+'reveal'}><motion.rect key={cumulative+'-'+data.actualizado} x={left-5} y={0} height={height} initial={{width:reduced?plotW+10:0}} whileInView={{width:plotW+10}} viewport={{once:true}} transition={{duration:reduced?0:1,ease:'easeInOut'}}/></clipPath></defs>
          <g clipPath={`url(#${id}reveal)`}>{(['odometro','facturados'] as const).map(key=><g key={key}>
            <path d={path(rows,key,x,y)} className={key==='facturados'?'ax-eff-billed':'ax-eff-odo'} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
            {rows.map((r,i)=>r[key]!=null&&(rows.length===1||((i===0||rows[i-1][key]==null)&&(i===rows.length-1||rows[i+1][key]==null)))?<circle key={i} cx={x(i)} cy={y(r[key]!)} r="3" className={key==='facturados'?'ax-eff-billed':'ax-eff-odo'}/>:null)}
          </g>)}</g>
          {active!=null&&selected&&<g><line x1={x(active)} x2={x(active)} y1="18" y2={bottom} className="ax-eff-cursor"/>{(['facturados','odometro'] as const).map(key=>selected[key]!=null?<circle key={key} cx={x(active)} cy={y(selected[key]!)} r="4" className={key==='facturados'?'ax-eff-billed':'ax-eff-odo'}/>:null)}</g>}
        </svg>
        <div className="ax-eff-inspect" aria-live="polite" aria-atomic="true"><span>{selected?date(selected.dia):'Seleccioná un día'} · {cumulative?'acumulado':'diario'}</span><span className="is-billed">Facturados <b>{km(selected?.facturados??null)}</b></span><span className="is-odo">Odómetro <b>{km(selected?.odometro??null)}</b></span></div>
        <p className="ax-eff-hint">Pasá el cursor, tocá el gráfico o usá las flechas para consultar un día.</p>
      </>:<p className="ax-eff-notice">Sin datos en el período seleccionado.</p>}
      <footer className="ax-eff-foot"><span>{data.actual?.cierres_faltantes?`${data.actual.cierres_faltantes} jornadas pendientes de validar`:'Sin cierres incompletos entre las jornadas registradas'}</span><small>Servicios por fecha programada · jornadas por fecha de inicio. No mide rentabilidad. Actualizado {new Date(data.actualizado).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}.</small></footer>
      <dialog ref={dialog} className="ax-eff-dialog" aria-labelledby={id+'detail'} onCancel={close} onClick={e=>{if(e.target===e.currentTarget)close();}} onClose={()=>trigger.current?.focus()}><header><h3 id={id+'detail'}>Desglose diario · flota propia</h3><button type="button" onClick={close} aria-label="Cerrar desglose">✕</button></header><p>Valores diarios, no acumulados. — indica un dato incompleto.</p><div className="ax-eff-table"><table><caption>{date(data.desde)} — {date(data.hasta)}</caption><thead><tr><th scope="col">Fecha</th><th scope="col">Facturados (km)</th><th scope="col">Odómetro (km)</th><th scope="col">Jornadas</th></tr></thead><tbody>{data.actual?.filas.map(r=><tr key={r.dia}><th scope="row">{date(r.dia)}</th><td>{number(r.facturados)}</td><td>{number(r.odometro)}</td><td>{r.jornadas}{r.cierres_faltantes?` · ${r.cierres_faltantes} incompletas`:''}</td></tr>)}</tbody></table></div></dialog>
    </>}
  </div>;
}
const roots=new WeakMap<HTMLElement,Root>();
export function render(node:HTMLElement,data:EfficiencyData|null,error?:string){let root=roots.get(node);if(!root){root=createRoot(node);roots.set(node,root);}root.render(<Efficiency data={data} error={error}/>);}
export function unmount(node:HTMLElement){roots.get(node)?.unmount();roots.delete(node);}
